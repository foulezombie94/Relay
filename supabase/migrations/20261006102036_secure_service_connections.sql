begin;
-- OAuth sessions are single-use, bound to the user, workspace and service.
create table relay_private.oauth_sessions(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null,state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null default now()+interval '10 minutes',consumed_at timestamptz,
 primary key(workspace_id,user_id,provider)
);
alter table relay_private.oauth_sessions enable row level security;
revoke all on relay_private.oauth_sessions from public,anon,authenticated;
alter table relay_private.integration_secrets add column revision bigint not null default 1;
alter table relay_private.integration_secrets add column refresh_until timestamptz;
-- Old combined connectors require a fresh service-specific consent. Imported context is retained.
delete from relay_private.integration_secrets s using public.integrations i where s.integration_id=i.id and i.provider in ('google','microsoft');
update public.integrations set status='disconnected' where provider in ('google','microsoft');

create function relay_private.integration_oauth_begin(w uuid,p text,state_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) or p not in ('gmail','google-calendar','outlook','outlook-calendar') or state_hash !~ '^[a-f0-9]{64}$' then raise exception 'Forbidden' using errcode='42501';end if;
 insert into relay_private.oauth_sessions(workspace_id,user_id,provider,state_hash) values(w,auth.uid(),p,state_hash)
 on conflict(workspace_id,user_id,provider) do update set state_hash=excluded.state_hash,expires_at=now()+interval '10 minutes',consumed_at=null;
end $$;
create function relay_private.integration_oauth_consume(w uuid,p text,state_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 update relay_private.oauth_sessions s set consumed_at=now() where s.workspace_id=w and s.user_id=auth.uid() and s.provider=p and s.state_hash=integration_oauth_consume.state_hash and s.expires_at>now() and s.consumed_at is null;
 get diagnostics changed=row_count;return changed=1;
end $$;

drop function public.integration_save(uuid,text,text,text,text[]);
create function relay_private.integration_save(w uuid,p text,mail text,encrypted text,permissions text[],oauth_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid;session_found integer;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) or p not in ('gmail','google-calendar','outlook','outlook-calendar') or encrypted is null or length(encrypted)>65000 or mail is null or length(mail)>320 then raise exception 'Forbidden' using errcode='42501';end if;
 delete from relay_private.oauth_sessions s where s.workspace_id=w and s.user_id=auth.uid() and s.provider=p and s.state_hash=oauth_hash and s.consumed_at is not null and s.expires_at>now();
 get diagnostics session_found=row_count;if session_found<>1 then raise exception 'OAuth session expired or cancelled' using errcode='42501';end if;
 insert into public.integrations(workspace_id,user_id,provider,email,status,scopes) values(w,auth.uid(),p,mail,'connected',permissions)
 on conflict(workspace_id,user_id,provider) do update set email=excluded.email,status='connected',scopes=excluded.scopes returning id into i;
 insert into relay_private.integration_secrets(integration_id,encrypted_tokens) values(i,encrypted)
 on conflict(integration_id) do update set encrypted_tokens=excluded.encrypted_tokens,revision=relay_private.integration_secrets.revision+1,refresh_until=null,updated_at=now();
 return i;
end $$;
create function relay_private.integration_get(w uuid,p text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'encrypted_tokens',s.encrypted_tokens,'revision',s.revision) from public.integrations i join relay_private.integration_secrets s on s.integration_id=i.id
 where auth.uid() is not null and relay_private.has_role(w,array['owner','admin','member']) and i.workspace_id=w and i.user_id=auth.uid() and i.provider=p and i.status='connected'
$$;
create function relay_private.integration_disconnect(w uuid,p text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 -- Lock the metadata first, consistently with save/refresh.
 perform 1 from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p for update;
 delete from relay_private.oauth_sessions where workspace_id=w and user_id=auth.uid() and provider=p;
 delete from relay_private.integration_secrets s using public.integrations i where s.integration_id=i.id and i.workspace_id=w and i.user_id=auth.uid() and i.provider=p;
 update public.integrations set status='disconnected',scopes='{}' where workspace_id=w and user_id=auth.uid() and provider=p;
end $$;
create function relay_private.integration_touch(w uuid,p text) returns void language sql security definer set search_path='' as $$
 update public.integrations set last_sync=now() where workspace_id=w and provider=p and user_id=auth.uid() and status='connected' and relay_private.has_role(w,array['owner','admin','member'])
$$;
create function relay_private.integration_refresh_claim(w uuid,p text,expected_revision bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare i uuid;changed integer;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select id into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p and status='connected' for update;
 update relay_private.integration_secrets set refresh_until=now()+interval '60 seconds' where integration_id=i and revision=expected_revision and (refresh_until is null or refresh_until<now());
 get diagnostics changed=row_count;return changed=1;
end $$;
create function relay_private.integration_refresh_finish(w uuid,p text,expected_revision bigint,encrypted text,permissions text[]) returns boolean language plpgsql security definer set search_path='' as $$
declare i uuid;changed integer;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) or length(encrypted)>65000 then raise exception 'Forbidden' using errcode='42501';end if;
 select id into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p and status='connected' for update;
 if encrypted is null then
  update relay_private.integration_secrets set refresh_until=null where integration_id=i and revision=expected_revision;return false;
 end if;
 update relay_private.integration_secrets set encrypted_tokens=encrypted,revision=revision+1,refresh_until=null,updated_at=now() where integration_id=i and revision=expected_revision and refresh_until>now();
 get diagnostics changed=row_count;
 if changed=1 then update public.integrations set scopes=permissions where id=i;end if;return changed=1;
end $$;
create function public.integration_oauth_begin(w uuid,p text,state_hash text) returns void language sql security invoker set search_path='' as $$select relay_private.integration_oauth_begin(w,p,state_hash)$$;
create function public.integration_oauth_consume(w uuid,p text,state_hash text) returns boolean language sql security invoker set search_path='' as $$select relay_private.integration_oauth_consume(w,p,state_hash)$$;
create function public.integration_save(w uuid,p text,mail text,encrypted text,permissions text[],oauth_hash text) returns uuid language sql security invoker set search_path='' as $$select relay_private.integration_save(w,p,mail,encrypted,permissions,oauth_hash)$$;
create or replace function public.integration_get(w uuid,p text) returns jsonb language sql security invoker set search_path='' as $$select relay_private.integration_get(w,p)$$;
create or replace function public.integration_disconnect(w uuid,p text) returns void language sql security invoker set search_path='' as $$select relay_private.integration_disconnect(w,p)$$;
create or replace function public.integration_touch(w uuid,p text) returns void language sql security invoker set search_path='' as $$select relay_private.integration_touch(w,p)$$;
create function public.integration_refresh_claim(w uuid,p text,expected_revision bigint) returns boolean language sql security invoker set search_path='' as $$select relay_private.integration_refresh_claim(w,p,expected_revision)$$;
create function public.integration_refresh_finish(w uuid,p text,expected_revision bigint,encrypted text,permissions text[]) returns boolean language sql security invoker set search_path='' as $$select relay_private.integration_refresh_finish(w,p,expected_revision,encrypted,permissions)$$;
do $$declare s text;f text;begin
 foreach s in array array['relay_private','public'] loop foreach f in array array['integration_oauth_begin(uuid,text,text)','integration_oauth_consume(uuid,text,text)','integration_save(uuid,text,text,text,text[],text)','integration_get(uuid,text)','integration_disconnect(uuid,text)','integration_touch(uuid,text)','integration_refresh_claim(uuid,text,bigint)','integration_refresh_finish(uuid,text,bigint,text,text[])'] loop
 execute 'revoke all on function '||s||'.'||f||' from public,anon,authenticated';execute 'grant execute on function '||s||'.'||f||' to authenticated';end loop;end loop;
end $$;

-- Zapier keys: metadata is readable by admins, the SHA-256 digest is private.
create table public.zapier_keys(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id),name text not null check(length(name) between 1 and 100),suffix text not null,
 scopes text[] not null check(scopes <@ array['records:read','records:write','tasks:read','tasks:write']::text[]),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '90 days',revoked_at timestamptz,last_used_at timestamptz,
 unique(workspace_id,id)
);
create index zapier_keys_workspace_idx on public.zapier_keys(workspace_id,created_at desc);
alter table public.zapier_keys enable row level security;
create policy zapier_keys_admin_read on public.zapier_keys for select to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
revoke all on public.zapier_keys from public,anon,authenticated;grant select on public.zapier_keys to authenticated;
create table relay_private.zapier_credentials(
 key_id uuid primary key references public.zapier_keys(id) on delete cascade,key_hash text not null unique check(key_hash ~ '^[a-f0-9]{64}$'),
 window_started_at timestamptz not null default now(),request_count integer not null default 0
);
alter table relay_private.zapier_credentials enable row level security;
revoke all on relay_private.zapier_credentials from public,anon,authenticated;

create function relay_private.zapier_key_create(w uuid,label text,suffix text,key_hash text,permissions text[]) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) or label is null or length(label) not between 1 and 100 or suffix !~ '^[A-Za-z0-9_-]{4}$' or key_hash !~ '^[a-f0-9]{64}$' or permissions is null or cardinality(permissions)=0 or not permissions <@ array['records:read','records:write','tasks:read','tasks:write']::text[] then raise exception 'Forbidden' using errcode='42501';end if;
 if (select count(*) from public.zapier_keys where workspace_id=w and revoked_at is null and expires_at>now())>=10 then raise exception 'Too many active keys' using errcode='22023';end if;
 insert into public.zapier_keys(workspace_id,created_by,name,suffix,scopes) values(w,auth.uid(),label,suffix,permissions) returning id into i;
 insert into relay_private.zapier_credentials(key_id,key_hash) values(i,key_hash);
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'zapier_keys',i,'create',jsonb_build_object('name',label,'scopes',permissions));return i;
end $$;
create function relay_private.zapier_key_revoke(w uuid,key_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.zapier_keys set revoked_at=coalesce(revoked_at,now()) where workspace_id=w and id=key_id;
 if not found then raise exception 'Unknown key' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action) values(w,auth.uid(),'zapier_keys',key_id,'revoke');
end $$;
create function public.zapier_key_create(w uuid,label text,suffix text,key_hash text,permissions text[]) returns uuid language sql security invoker set search_path='' as $$select relay_private.zapier_key_create(w,label,suffix,key_hash,permissions)$$;
create function public.zapier_key_revoke(w uuid,key_id uuid) returns void language sql security invoker set search_path='' as $$select relay_private.zapier_key_revoke(w,key_id)$$;
revoke all on function public.zapier_key_create(uuid,text,text,text,text[]),relay_private.zapier_key_create(uuid,text,text,text,text[]),public.zapier_key_revoke(uuid,uuid),relay_private.zapier_key_revoke(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zapier_key_create(uuid,text,text,text,text[]),relay_private.zapier_key_create(uuid,text,text,text,text[]),public.zapier_key_revoke(uuid,uuid),relay_private.zapier_key_revoke(uuid,uuid) to authenticated;

-- One transaction checks key, expiry, membership, scopes, rate limit, idempotency and write.
create table relay_private.zapier_requests(
 key_id uuid not null references public.zapier_keys(id) on delete cascade,request_id text not null check(length(request_id) between 1 and 100),
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(key_id,request_id)
);
alter table relay_private.zapier_requests enable row level security;
revoke all on relay_private.zapier_requests from public,anon,authenticated;
create function relay_private.zapier_request(key_hash text,operation text,resource text,body jsonb default '{}',page integer default 0,request_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.zapier_keys; cred relay_private.zapier_credentials;result jsonb;old_payload jsonb;obj uuid;rec uuid;required_scope text;row_id uuid;
begin
 select c.* into cred from relay_private.zapier_credentials c where c.key_hash=zapier_request.key_hash for update;
 if not found then raise exception 'Invalid API key' using errcode='28000';end if;
 select * into k from public.zapier_keys where id=cred.key_id for update;
 if k.revoked_at is not null or k.expires_at<=now() or not exists(select 1 from public.memberships where workspace_id=k.workspace_id and user_id=k.created_by and role in ('owner','admin')) then raise exception 'Invalid API key' using errcode='28000';end if;
 if cred.window_started_at+interval '1 minute'<now() then
  update relay_private.zapier_credentials set window_started_at=now(),request_count=1 where key_id=k.id;
 elsif cred.request_count>=60 then return jsonb_build_object('error','rate_limit');
 else update relay_private.zapier_credentials set request_count=request_count+1 where key_id=k.id;end if;
 update public.zapier_keys set last_used_at=now() where id=k.id;
 if operation='verify' then return jsonb_build_object('id',k.id,'workspace_id',k.workspace_id,'name',k.name,'scopes',k.scopes,'expires_at',k.expires_at);end if;
 if operation not in ('list','create') or resource not in ('people','companies','deals','tasks') or page<0 or page>100000 then raise exception 'Invalid request' using errcode='22023';end if;
 required_scope:=(case when resource='tasks' then 'tasks' else 'records' end)||':'||(case when operation='list' then 'read' else 'write' end);
 if not required_scope=any(k.scopes) then raise exception 'Scope denied' using errcode='42501';end if;
 if operation='list' then
  if resource='tasks' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select id,record_id,title,status,priority,due_date,updated_at from public.tasks where workspace_id=k.workspace_id order by created_at desc,id limit 100 offset page*100)t;
  else
   select id into obj from public.objects where workspace_id=k.workspace_id and slug=resource;
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (select id,object_id,display_name,email,domain,stage,amount,currency,version,created_at,updated_at from public.records where workspace_id=k.workspace_id and object_id=obj and not archived order by created_at desc,id limit 100 offset page*100)r;
  end if;return result;
 end if;
 if request_id is null or length(request_id) not between 1 and 100 or jsonb_typeof(body)<>'object' then raise exception 'Idempotency key required' using errcode='22023';end if;
 select r.result,r.payload into result,old_payload from relay_private.zapier_requests r where r.key_id=k.id and r.request_id=zapier_request.request_id;
 if found then if old_payload<>jsonb_build_object('resource',resource,'body',body) then raise exception 'Idempotency conflict' using errcode='40001';end if;return result;end if;
 -- Attribute constraints and merge-parent checks remain authoritative.
 perform set_config('request.jwt.claim.sub',k.created_by::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',k.created_by,'role','authenticated')::text,true);
 if resource='tasks' then
  if body->>'title' is null or length(body->>'title') not between 1 and 300 then raise exception 'Invalid title' using errcode='22023';end if;
  rec:=nullif(body->>'record_id','')::uuid;
  insert into public.tasks(workspace_id,record_id,title,description,owner_id,due_date,priority) values(k.workspace_id,rec,body->>'title',coalesce(body->>'description',''),k.created_by,nullif(body->>'due_date','')::timestamptz,coalesce(body->>'priority','normal')) returning id into row_id;
  result:=jsonb_build_object('id',row_id,'title',body->>'title','status','open');
 else
  select id into obj from public.objects where workspace_id=k.workspace_id and slug=resource;
  if obj is null or body->>'display_name' is null or length(body->>'display_name') not between 1 and 200 then raise exception 'Invalid record' using errcode='22023';end if;
  if exists(select 1 from public.attributes where workspace_id=k.workspace_id and object_id=obj and required and not archived and type<>'formula') then raise exception 'Required custom attributes: create this record inside Relay' using errcode='22023';end if;
  insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id) values(k.workspace_id,obj,body->>'display_name',nullif(body->>'email',''),nullif(body->>'domain',''),coalesce(body->>'stage','Nouveau'),coalesce((body->>'amount')::numeric,0),coalesce(body->>'currency','EUR'),k.created_by) returning id into row_id;
  result:=jsonb_build_object('id',row_id,'display_name',body->>'display_name','version',1);
 end if;
 insert into relay_private.zapier_requests(key_id,request_id,payload,result) values(k.id,request_id,jsonb_build_object('resource',resource,'body',body),result);
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(k.workspace_id,k.created_by,'zapier',row_id,'create',jsonb_build_object('key_id',k.id,'resource',resource));
 return result;
end $$;
create function public.zapier_request(key_hash text,operation text,resource text,body jsonb default '{}',page integer default 0,request_id text default null) returns jsonb language sql security invoker set search_path='' as $$select relay_private.zapier_request(key_hash,operation,resource,body,page,request_id)$$;
revoke all on function public.zapier_request(text,text,text,jsonb,integer,text),relay_private.zapier_request(text,text,text,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.zapier_request(text,text,text,jsonb,integer,text),relay_private.zapier_request(text,text,text,jsonb,integer,text) to service_role;
commit;
begin;
-- Match the save lock order (OAuth session, integration metadata, tokens).
create or replace function relay_private.integration_disconnect(w uuid,p text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 delete from relay_private.oauth_sessions where workspace_id=w and user_id=auth.uid() and provider=p;
 perform 1 from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p for update;
 delete from relay_private.integration_secrets s using public.integrations i where s.integration_id=i.id and i.workspace_id=w and i.user_id=auth.uid() and i.provider=p;
 update public.integrations set status='disconnected',scopes='{}' where workspace_id=w and user_id=auth.uid() and provider=p;
end $$;
grant usage on schema relay_private to service_role;
drop policy communications_insert on public.communications;
create policy communications_insert on public.communications for insert to authenticated with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.integrations i where i.id=integration_id and i.user_id=(select auth.uid()) and i.workspace_id=communications.workspace_id and i.status='connected'));
drop policy communications_update on public.communications;
create policy communications_update on public.communications for update to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member'])) with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.integrations i where i.id=integration_id and i.user_id=(select auth.uid()) and i.workspace_id=communications.workspace_id and i.status='connected'));
commit;
