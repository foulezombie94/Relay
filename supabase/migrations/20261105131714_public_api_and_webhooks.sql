-- Public REST API (v1) and outbound webhooks.
-- API keys: only a SHA-256 digest is stored. Requests run through
-- public.api_request, callable by the server only, which verifies the key,
-- rate-limits it, then switches to the RLS-bound role zyliad_api with the
-- identity of the key creator: tenant, role and reader policies all apply.
-- Webhooks: row changes enqueue signed deliveries in a private outbox claimed
-- by the worker with leases (at-least-once; receivers dedupe on the event id).
begin;
set local lock_timeout='5s';

do $$begin
 if not exists(select 1 from pg_roles where rolname='zyliad_api') then create role zyliad_api nologin nosuperuser nocreatedb nocreaterole nobypassrls inherit;
 elsif exists(select 1 from pg_roles where rolname='zyliad_api' and (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) then raise exception 'Unsafe existing API role';end if;
end $$;
grant authenticated to zyliad_api;
grant zyliad_api to service_role;

-- ---------------------------------------------------------------- API keys
create table public.api_keys(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 100),
 prefix text not null check(prefix ~ '^zk_[A-Za-z0-9]{8}$'),
 scopes text[] not null check(cardinality(scopes)>0 and scopes <@ array['records:read','records:write','tasks:read','tasks:write','notes:read','notes:write','webhooks:manage']::text[]),
 created_at timestamptz not null default now(),
 expires_at timestamptz check(expires_at is null or expires_at>created_at),
 revoked_at timestamptz, last_used_at timestamptz,
 unique(workspace_id,id)
);
create index api_keys_workspace_idx on public.api_keys(workspace_id,created_at desc);
alter table public.api_keys enable row level security;
create policy api_keys_admin_read on public.api_keys for select to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
revoke all on public.api_keys from public,anon,authenticated;
grant select on public.api_keys to authenticated;

create table relay_private.api_credentials(
 key_id uuid primary key references public.api_keys(id) on delete cascade,
 key_hash text not null unique check(key_hash ~ '^[a-f0-9]{64}$'),
 window_started_at timestamptz not null default now(), request_count integer not null default 0
);
create table relay_private.api_idempotency(
 key_id uuid not null references public.api_keys(id) on delete cascade,
 request_id text not null check(length(request_id) between 8 and 100),
 request_digest text not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(key_id,request_id)
);
create index api_idempotency_created_idx on relay_private.api_idempotency(created_at);
alter table relay_private.api_credentials enable row level security;
alter table relay_private.api_idempotency enable row level security;
revoke all on relay_private.api_credentials,relay_private.api_idempotency from public,anon,authenticated;

create function relay_private.api_key_create(w uuid,label text,key_prefix text,key_hash text,permissions text[],expires timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if key_hash !~ '^[a-f0-9]{64}$' then raise exception 'Relay: Clé invalide.' using errcode='22023';end if;
 if expires is not null and expires<=now() then raise exception 'Relay: Date d’expiration passée.' using errcode='22023';end if;
 if (select count(*) from public.api_keys where workspace_id=w and revoked_at is null and (expires_at is null or expires_at>now()))>=25 then
  raise exception 'Relay: 25 clés actives au maximum. Révoquez une clé inutilisée.' using errcode='22023';end if;
 insert into public.api_keys(workspace_id,created_by,name,prefix,scopes,expires_at) values(w,auth.uid(),btrim(label),key_prefix,permissions,expires) returning id into i;
 insert into relay_private.api_credentials(key_id,key_hash) values(i,key_hash);
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'api_keys',i,'create',jsonb_build_object('name',btrim(label),'scopes',permissions,'expires_at',expires));
 return i;
end $$;
create function relay_private.api_key_revoke(w uuid,key_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 update public.api_keys set revoked_at=coalesce(revoked_at,now()) where workspace_id=w and id=key_id;
 if not found then raise exception 'Relay: Clé inconnue.' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action) values(w,auth.uid(),'api_keys',key_id,'revoke');
end $$;
create function public.api_key_create(w uuid,label text,key_prefix text,key_hash text,permissions text[],expires timestamptz default null) returns uuid
language sql security invoker set search_path='' as $$ select relay_private.api_key_create(w,label,key_prefix,key_hash,permissions,expires) $$;
create function public.api_key_revoke(w uuid,key_id uuid) returns void
language sql security invoker set search_path='' as $$ select relay_private.api_key_revoke(w,key_id) $$;
revoke all on function relay_private.api_key_create(uuid,text,text,text,text[],timestamptz),relay_private.api_key_revoke(uuid,uuid),
 public.api_key_create(uuid,text,text,text,text[],timestamptz),public.api_key_revoke(uuid,uuid) from public,anon,authenticated;
grant execute on function relay_private.api_key_create(uuid,text,text,text,text[],timestamptz),relay_private.api_key_revoke(uuid,uuid),
 public.api_key_create(uuid,text,text,text,text[],timestamptz),public.api_key_revoke(uuid,uuid) to authenticated;

-- Verification, rate limit (120 requests/minute/key) and last use, in one locked step.
create function relay_private.api_key_verify(key_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c relay_private.api_credentials;k public.api_keys;
begin
 select * into c from relay_private.api_credentials where api_credentials.key_hash=api_key_verify.key_hash for update;
 if c.key_id is null then return '{"error":"invalid_key"}';end if;
 select * into k from public.api_keys where id=c.key_id;
 if k.revoked_at is not null or (k.expires_at is not null and k.expires_at<=now()) then return '{"error":"invalid_key"}';end if;
 -- A key never outlives its creator's write access to the workspace.
 if not exists(select 1 from public.memberships where workspace_id=k.workspace_id and user_id=k.created_by and role in ('owner','admin','member')) then return '{"error":"invalid_key"}';end if;
 if c.window_started_at+interval '1 minute'<=now() then
  update relay_private.api_credentials set window_started_at=now(),request_count=1 where key_id=k.id;
 elsif c.request_count>=120 then return jsonb_build_object('error','rate_limited','retry_after',greatest(1,ceil(extract(epoch from c.window_started_at+interval '1 minute'-now()))));
 else update relay_private.api_credentials set request_count=request_count+1 where key_id=k.id;end if;
 update public.api_keys set last_used_at=now() where id=k.id and (last_used_at is null or last_used_at<now()-interval '1 minute');
 return jsonb_build_object('key_id',k.id,'workspace_id',k.workspace_id,'user_id',k.created_by,'scopes',to_jsonb(k.scopes),'name',k.name,'expires_at',k.expires_at);
end $$;
create function relay_private.api_idempotent_read(kid uuid,rid text,dig text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r relay_private.api_idempotency;
begin
 select * into r from relay_private.api_idempotency where key_id=kid and request_id=rid;
 if r.key_id is null then return null;end if;
 if r.request_digest<>dig then return '{"error":"idempotency_conflict"}';end if;
 return r.result;
end $$;
create function relay_private.api_idempotent_write(kid uuid,rid text,dig text,res jsonb) returns void
language sql security definer set search_path='' as $$
 insert into relay_private.api_idempotency(key_id,request_id,request_digest,result) values(kid,rid,dig,res) on conflict do nothing;
$$;
revoke all on function relay_private.api_key_verify(text),relay_private.api_idempotent_read(uuid,text,text),relay_private.api_idempotent_write(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.api_key_verify(text),relay_private.api_idempotent_read(uuid,text,text),relay_private.api_idempotent_write(uuid,text,text,jsonb) to service_role;

-- ---------------------------------------------------------------- Webhooks
create table public.webhook_endpoints(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 url text not null check(url ~ '^https://[^\s/@:]+(:443)?(/[^\s#]*)?$' and length(url)<=2000),
 description text not null default '' check(length(description)<=300),
 events text[] not null check(cardinality(events)>0 and events <@ array['record.created','record.updated','record.deleted','record.restored','record.purged','task.created','task.updated','task.deleted','note.created','note.updated']::text[]),
 object_ids uuid[],
 enabled boolean not null default true,
 consecutive_failures integer not null default 0,
 disabled_reason text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_delivery_at timestamptz,
 unique(workspace_id,id)
);
create index webhook_endpoints_workspace_idx on public.webhook_endpoints(workspace_id) where enabled;
alter table public.webhook_endpoints enable row level security;
create policy webhook_endpoints_admin_read on public.webhook_endpoints for select to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
create policy webhook_endpoints_admin_update on public.webhook_endpoints for update to authenticated using(relay_private.has_role(workspace_id,array['owner','admin'])) with check(relay_private.has_role(workspace_id,array['owner','admin']));
create policy webhook_endpoints_admin_delete on public.webhook_endpoints for delete to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));
revoke all on public.webhook_endpoints from public,anon,authenticated;
grant select,delete on public.webhook_endpoints to authenticated;
grant update(url,description,events,object_ids,enabled) on public.webhook_endpoints to authenticated;

create function relay_private.webhook_endpoint_touch() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.updated_at:=now();
 if new.enabled and not old.enabled then new.consecutive_failures:=0;new.disabled_reason:=null;end if;
 return new;
end $$;
revoke all on function relay_private.webhook_endpoint_touch() from public,anon,authenticated;
create trigger webhook_endpoint_touch before update on public.webhook_endpoints for each row execute function relay_private.webhook_endpoint_touch();
create trigger audit after insert or update or delete on public.webhook_endpoints for each row execute function relay_private.audit_change();

-- AES-GCM sealed by the server (INTEGRATION_ENCRYPTION_KEY); never readable by clients.
create table relay_private.webhook_secrets(
 endpoint_id uuid primary key references public.webhook_endpoints(id) on delete cascade,
 sealed text not null check(length(sealed) between 40 and 400)
);
create table relay_private.webhook_deliveries(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
 event_id uuid not null, event_type text not null, payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','delivering','retry','delivered','dead')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_owner text, lease_expires_at timestamptz,
 response_status integer, last_error text check(last_error is null or length(last_error)<=300),
 created_at timestamptz not null default now(), delivered_at timestamptz,
 unique(endpoint_id,event_id)
);
create index webhook_deliveries_due_idx on relay_private.webhook_deliveries(next_attempt_at) where status in ('queued','retry');
create index webhook_deliveries_lease_idx on relay_private.webhook_deliveries(lease_expires_at) where status='delivering';
create index webhook_deliveries_endpoint_idx on relay_private.webhook_deliveries(endpoint_id,created_at desc);
alter table relay_private.webhook_secrets enable row level security;
alter table relay_private.webhook_deliveries enable row level security;
revoke all on relay_private.webhook_secrets,relay_private.webhook_deliveries from public,anon,authenticated;

create function relay_private.webhook_endpoint_create(w uuid,target text,label text,event_types text[],objects uuid[],sealed_secret text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i uuid;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if (select count(*) from public.webhook_endpoints where workspace_id=w)>=20 then raise exception 'Relay: 20 webhooks au maximum par espace.' using errcode='22023';end if;
 if objects is not null and exists(select 1 from unnest(objects) o where not exists(select 1 from public.objects where workspace_id=w and id=o)) then
  raise exception 'Relay: Objet inconnu.' using errcode='22023';end if;
 insert into public.webhook_endpoints(workspace_id,url,description,events,object_ids,created_by) values(w,target,coalesce(label,''),event_types,nullif(objects,'{}'),auth.uid()) returning id into i;
 insert into relay_private.webhook_secrets(endpoint_id,sealed) values(i,sealed_secret);
 return i;
end $$;
create function relay_private.webhook_endpoint_rotate(w uuid,endpoint uuid,sealed_secret text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.webhook_endpoints where workspace_id=w and id=endpoint) then raise exception 'Relay: Webhook inconnu.' using errcode='22023';end if;
 update relay_private.webhook_secrets set sealed=sealed_secret where endpoint_id=endpoint;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action) values(w,auth.uid(),'webhook_endpoints',endpoint,'rotate_secret');
end $$;
-- Recent delivery attempts for administrators (payloads stay private).
create function relay_private.webhook_deliveries_list(w uuid,endpoint uuid,page_size integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
  select id,endpoint_id,event_id,event_type,status,attempts,response_status,last_error,created_at,delivered_at,next_attempt_at
  from relay_private.webhook_deliveries where workspace_id=w and (endpoint is null or endpoint_id=endpoint)
  order by created_at desc limit least(greatest(page_size,1),200)) x),'[]'::jsonb);
end $$;
create function relay_private.webhook_endpoint_ping(w uuid,endpoint uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.webhook_endpoints where workspace_id=w and id=endpoint) then raise exception 'Relay: Webhook inconnu.' using errcode='22023';end if;
 insert into relay_private.webhook_deliveries(workspace_id,endpoint_id,event_id,event_type,payload)
 values(w,endpoint,e,'ping',jsonb_build_object('id',e,'type','ping','created_at',now(),'workspace_id',w,'data',jsonb_build_object('message','Webhook Zyliad opérationnel')));
 return e;
end $$;
create function public.webhook_endpoint_create(w uuid,target text,label text,event_types text[],objects uuid[],sealed_secret text) returns uuid
language sql security invoker set search_path='' as $$ select relay_private.webhook_endpoint_create(w,target,label,event_types,objects,sealed_secret) $$;
create function public.webhook_endpoint_rotate(w uuid,endpoint uuid,sealed_secret text) returns void
language sql security invoker set search_path='' as $$ select relay_private.webhook_endpoint_rotate(w,endpoint,sealed_secret) $$;
create function public.webhook_deliveries_list(w uuid,endpoint uuid default null,page_size integer default 50) returns jsonb
language sql stable security invoker set search_path='' as $$ select relay_private.webhook_deliveries_list(w,endpoint,page_size) $$;
create function public.webhook_endpoint_ping(w uuid,endpoint uuid) returns uuid
language sql security invoker set search_path='' as $$ select relay_private.webhook_endpoint_ping(w,endpoint) $$;
do $$declare f text;begin
 foreach f in array array['webhook_endpoint_create(uuid,text,text,text[],uuid[],text)','webhook_endpoint_rotate(uuid,uuid,text)','webhook_deliveries_list(uuid,uuid,integer)','webhook_endpoint_ping(uuid,uuid)'] loop
  execute 'revoke all on function relay_private.'||f||' from public,anon,authenticated';execute 'grant execute on function relay_private.'||f||' to authenticated';
  execute 'revoke all on function public.'||f||' from public,anon,authenticated';execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end $$;

-- Event capture. Payloads exclude private notes and are capped at 60 kB.
create function relay_private.webhook_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;entity text:=tg_table_name;kind text;row_data jsonb;old_data jsonb;obj uuid;changed text[];payload jsonb;e uuid:=gen_random_uuid();
begin
 w:=coalesce(new.workspace_id,old.workspace_id);
 if not exists(select 1 from public.webhook_endpoints where workspace_id=w and enabled) then return null;end if;
 row_data:=case when tg_op='DELETE' then null else to_jsonb(new)-array['search','search_index','agent_search'] end;
 old_data:=case when tg_op='INSERT' then null else to_jsonb(old)-array['search','search_index','agent_search'] end;
 if entity='notes' and (coalesce((row_data->>'private')::boolean,false) or coalesce((old_data->>'private')::boolean,false)) then return null;end if;
 if entity='records' then
  obj:=coalesce(row_data->>'object_id',old_data->>'object_id')::uuid;
  kind:=case
   when tg_op='INSERT' then 'record.created'
   when tg_op='DELETE' then 'record.purged'
   when (row_data->>'archived')::boolean and not (old_data->>'archived')::boolean then 'record.deleted'
   when not (row_data->>'archived')::boolean and (old_data->>'archived')::boolean then 'record.restored'
   else 'record.updated' end;
 else
  kind:=(case entity when 'tasks' then 'task' else 'note' end)||'.'||(case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end);
 end if;
 if tg_op='UPDATE' then
  select array_agg(k order by k) into changed from jsonb_object_keys(row_data||old_data) k
  where k not in ('updated_at','version','deleted_at','deleted_by') and (row_data->k) is distinct from (old_data->k);
  if changed is null then return null;end if;
 end if;
 payload:=jsonb_build_object('id',e,'type',kind,'created_at',now(),'workspace_id',w,
  'data',jsonb_build_object('object',coalesce(row_data,old_data),'changes',to_jsonb(coalesce(changed,'{}'::text[]))));
 if octet_length(payload::text)>60000 then
  payload:=jsonb_set(payload,'{data}',jsonb_build_object('object',jsonb_build_object('id',coalesce(row_data->>'id',old_data->>'id'),'object_id',obj),'truncated',true,'changes',to_jsonb(coalesce(changed,'{}'::text[]))));
 end if;
 insert into relay_private.webhook_deliveries(workspace_id,endpoint_id,event_id,event_type,payload)
 select w,ep.id,e,kind,payload from public.webhook_endpoints ep
 where ep.workspace_id=w and ep.enabled and kind=any(ep.events) and (obj is null or ep.object_ids is null or obj=any(ep.object_ids));
 return null;
end $$;
revoke all on function relay_private.webhook_capture() from public,anon,authenticated;
create trigger webhook_capture after insert or update or delete on public.records for each row execute function relay_private.webhook_capture();
create trigger webhook_capture after insert or update or delete on public.tasks for each row execute function relay_private.webhook_capture();
create trigger webhook_capture after insert or update or delete on public.notes for each row execute function relay_private.webhook_capture();

-- Worker side: claim due deliveries with a lease, then complete them.
create function relay_private.webhook_claim(worker text,batch integer default 20) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- An expired lease is an uncertain attempt: it is retried (at-least-once delivery).
 update relay_private.webhook_deliveries set status='retry',lease_owner=null,lease_expires_at=null,last_error='Tentative interrompue'
  where status='delivering' and lease_expires_at<now();
 with picked as(
  select d.id from relay_private.webhook_deliveries d join public.webhook_endpoints ep on ep.id=d.endpoint_id
  where d.status in ('queued','retry') and d.next_attempt_at<=now() and ep.enabled
  order by d.next_attempt_at limit least(greatest(batch,1),100) for update of d skip locked
 ), claimed as(
  update relay_private.webhook_deliveries d set status='delivering',lease_owner=worker,lease_expires_at=now()+interval '2 minutes',attempts=d.attempts+1
  from picked where d.id=picked.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'event_id',c.event_id,'event_type',c.event_type,'payload',c.payload,'attempts',c.attempts,
  'url',ep.url,'sealed',s.sealed)),'[]'::jsonb) into result
 from claimed c join public.webhook_endpoints ep on ep.id=c.endpoint_id join relay_private.webhook_secrets s on s.endpoint_id=c.endpoint_id;
 return result;
end $$;
create function relay_private.webhook_complete(delivery uuid,worker text,succeeded boolean,http_status integer,error_text text) returns text
language plpgsql security definer set search_path='' as $$
declare d relay_private.webhook_deliveries;next_status text;
begin
 select * into d from relay_private.webhook_deliveries where id=delivery for update;
 if d.id is null or d.status<>'delivering' or d.lease_owner is distinct from worker then return 'lease_lost';end if;
 if succeeded then
  update relay_private.webhook_deliveries set status='delivered',delivered_at=now(),response_status=http_status,last_error=null,lease_owner=null,lease_expires_at=null where id=d.id;
  update public.webhook_endpoints set consecutive_failures=0,last_delivery_at=now() where id=d.endpoint_id;
  return 'delivered';
 end if;
 next_status:=case when d.attempts>=8 then 'dead' else 'retry' end;
 update relay_private.webhook_deliveries set status=next_status,response_status=http_status,last_error=left(error_text,300),lease_owner=null,lease_expires_at=null,
  next_attempt_at=now()+make_interval(secs=>least(21600,30*power(3,greatest(d.attempts-1,0)))::integer) where id=d.id;
 if next_status='dead' then
  update public.webhook_endpoints set consecutive_failures=consecutive_failures+1,
   enabled=case when consecutive_failures+1>=20 then false else enabled end,
   disabled_reason=case when consecutive_failures+1>=20 then 'Désactivé après 20 événements non livrés.' else disabled_reason end
  where id=d.endpoint_id;
 end if;
 return next_status;
end $$;
-- Delivered and dead deliveries are kept 30 days for the delivery log.
create function relay_private.webhook_retention() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 delete from relay_private.webhook_deliveries where status in ('delivered','dead') and created_at<now()-interval '30 days';
 get diagnostics n=row_count;
 delete from relay_private.api_idempotency where created_at<now()-interval '7 days';
 return n;
end $$;
create function public.webhook_claim(worker text,batch integer default 20) returns jsonb language sql security invoker set search_path='' as $$ select relay_private.webhook_claim(worker,batch) $$;
create function public.webhook_complete(delivery uuid,worker text,succeeded boolean,http_status integer,error_text text) returns text language sql security invoker set search_path='' as $$ select relay_private.webhook_complete(delivery,worker,succeeded,http_status,error_text) $$;
create function public.webhook_retention() returns integer language sql security invoker set search_path='' as $$ select relay_private.webhook_retention() $$;
revoke all on function relay_private.webhook_claim(text,integer),relay_private.webhook_complete(uuid,text,boolean,integer,text),relay_private.webhook_retention(),
 public.webhook_claim(text,integer),public.webhook_complete(uuid,text,boolean,integer,text),public.webhook_retention() from public,anon,authenticated;
grant execute on function relay_private.webhook_claim(text,integer),relay_private.webhook_complete(uuid,text,boolean,integer,text),relay_private.webhook_retention(),
 public.webhook_claim(text,integer),public.webhook_complete(uuid,text,boolean,integer,text),public.webhook_retention() to service_role;

-- ---------------------------------------------------------------- API entry point
-- Called by the web server with the service role only. Business reads and
-- writes run as zyliad_api with the creator's identity: RLS, triggers and the
-- record validator are the same as in the application.
create function public.api_request(key_hash text,operation text,payload jsonb default '{}'::jsonb,request_id text default null,request_digest text default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='10s' as $$
#variable_conflict use_variable
declare a jsonb;w uuid;uid uuid;kid uuid;needed text;result jsonb;old_role text:=current_user;writing boolean;
 obj uuid;rid uuid;lim integer;rows_data jsonb;cursor_at timestamptz;cursor_id uuid;vals jsonb;cur public.records;msg text;state text;n integer;
 record_columns constant text[]:=array['display_name','email','domain','stage','amount','currency','owner_id','close_date','pipeline_id','probability','lost_reason','attributes'];
begin
 a:=relay_private.api_key_verify(key_hash);
 if a ? 'error' then return a;end if;
 w:=(a->>'workspace_id')::uuid;uid:=(a->>'user_id')::uuid;kid:=(a->>'key_id')::uuid;
 needed:=case operation
  when 'me' then ''
  when 'objects' then 'records:read' when 'records.list' then 'records:read' when 'records.get' then 'records:read'
  when 'records.create' then 'records:write' when 'records.update' then 'records:write' when 'records.delete' then 'records:write'
  when 'tasks.list' then 'tasks:read' when 'tasks.create' then 'tasks:write' when 'tasks.update' then 'tasks:write'
  when 'notes.list' then 'notes:read' when 'notes.create' then 'notes:write'
  when 'webhooks.list' then 'webhooks:manage' when 'webhooks.create' then 'webhooks:manage' when 'webhooks.delete' then 'webhooks:manage'
  end;
 if needed is null then return '{"error":"unsupported_operation"}';end if;
 if needed<>'' and not (a->'scopes') ? needed then return jsonb_build_object('error','insufficient_scope','scope',needed);end if;
 if jsonb_typeof(payload) is distinct from 'object' then return '{"error":"validation_error","message":"Corps JSON objet attendu."}';end if;
 writing:=operation in ('records.create','records.update','records.delete','tasks.create','tasks.update','notes.create','webhooks.create','webhooks.delete');
 if writing then
  if request_id is null or length(request_id) not between 8 and 100 or request_digest !~ '^[a-f0-9]{64}$' then return '{"error":"idempotency_key_required"}';end if;
  result:=relay_private.api_idempotent_read(kid,request_id,request_digest);
  if result is not null then return result||'{"replayed":true}'::jsonb;end if;
 end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 perform set_config('role','zyliad_api',true);
 begin
  if operation='me' then
   result:=jsonb_build_object('key',jsonb_build_object('id',kid,'name',a->>'name','scopes',a->'scopes','expires_at',a->'expires_at'),
    'workspace',(select jsonb_build_object('id',id,'name',name,'currency',currency,'timezone',timezone) from public.workspaces where id=w));
  elsif operation='objects' then
   result:=jsonb_build_object('data',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'slug',o.slug,'name',o.name,'standard',o.standard,
    'attributes',coalesce((select jsonb_agg(jsonb_build_object('key',t.key,'name',t.name,'type',t.type,'required',t.required,'options',t.options) order by t.created_at)
     from public.attributes t where t.workspace_id=w and t.object_id=o.id and not t.archived),'[]'::jsonb)) order by o.created_at) from public.objects o where o.workspace_id=w),'[]'::jsonb),
    'pipelines',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'stages',p.stages||'["Gagné","Perdu"]'::jsonb,'labels',p.labels) order by p.created_at) from public.pipelines p where p.workspace_id=w),'[]'::jsonb));
  elsif operation in ('records.list','records.get','records.create') then
   if operation<>'records.get' then
    select id into obj from public.objects where workspace_id=w and slug=payload->>'object';
    if obj is null then raise exception 'Relay: Objet inconnu.' using errcode='22023';end if;
   end if;
   if operation='records.list' then
    lim:=least(greatest(coalesce((payload->>'limit')::integer,50),1),100);
    cursor_at:=(payload->>'cursor_at')::timestamptz;cursor_id:=(payload->>'cursor_id')::uuid;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id desc),'[]'::jsonb) into rows_data from(
     select x.id,x.object_id,x.display_name,x.email,x.domain,x.stage,x.amount,x.currency,x.owner_id,x.close_date,x.pipeline_id,x.probability,x.lost_reason,x.attributes,x.archived,x.version,x.created_at,x.updated_at
     from public.records x where x.workspace_id=w and x.object_id=obj and x.merged_into is null and x.archived=coalesce((payload->>'archived')::boolean,false)
      and (payload->>'q' is null or x.search @@ websearch_to_tsquery('simple',payload->>'q'))
      and (payload->>'stage' is null or x.stage=payload->>'stage')
      and (payload->>'owner_id' is null or x.owner_id=(payload->>'owner_id')::uuid)
      and (payload->>'pipeline_id' is null or x.pipeline_id=(payload->>'pipeline_id')::uuid)
      and (payload->>'email' is null or lower(x.email)=lower(payload->>'email'))
      and (payload->>'domain' is null or lower(x.domain)=lower(payload->>'domain'))
      and (payload->>'updated_after' is null or x.updated_at>(payload->>'updated_after')::timestamptz)
      and (cursor_at is null or (x.updated_at,x.id)<(cursor_at,cursor_id))
     order by x.updated_at desc,x.id desc limit lim+1) r;
    n:=jsonb_array_length(rows_data);
    result:=jsonb_build_object('data',case when n>lim then rows_data-lim else rows_data end,'has_more',n>lim,
     'next_cursor',case when n>lim then jsonb_build_object('at',rows_data->(lim-1)->'updated_at','id',rows_data->(lim-1)->'id') end);
   elsif operation='records.get' then
    select to_jsonb(r) into result from(select x.id,x.object_id,x.display_name,x.email,x.domain,x.stage,x.amount,x.currency,x.owner_id,x.close_date,x.pipeline_id,x.probability,x.lost_reason,x.attributes,x.archived,x.merged_into,x.version,x.created_at,x.updated_at
     from public.records x where x.workspace_id=w and x.id=(payload->>'id')::uuid) r;
    if result is null then result:='{"error":"not_found"}';else result:=jsonb_build_object('data',result);end if;
   else
    vals:=coalesce(payload->'values','{}'::jsonb);
    if jsonb_typeof(vals)<>'object' or exists(select 1 from jsonb_object_keys(vals) k where not k=any(record_columns)) then raise exception 'Relay: Champ non modifiable.' using errcode='22023';end if;
    if vals->>'stage'='Perdu' and coalesce(btrim(vals->>'lost_reason'),'')='' then raise exception 'Relay: Précisez la raison de perte.' using errcode='22023';end if;
    perform relay_private.record_values_validate(w,obj,vals,true);
    insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,pipeline_id,probability,lost_reason,attributes)
    values(w,obj,vals->>'display_name',nullif(vals->>'email',''),nullif(vals->>'domain',''),coalesce(vals->>'stage','Nouveau'),coalesce((vals->>'amount')::numeric,0),coalesce(vals->>'currency',(select currency from public.workspaces where id=w)),
     coalesce((vals->>'owner_id')::uuid,uid),(vals->>'close_date')::date,(vals->>'pipeline_id')::uuid,(vals->>'probability')::numeric,nullif(vals->>'lost_reason',''),coalesce(vals->'attributes','{}'::jsonb))
    returning * into cur;
    result:=jsonb_build_object('data',to_jsonb(cur)-array['search','agent_search','deleted_at','deleted_by']);
   end if;
  elsif operation in ('records.update','records.delete') then
   rid:=(payload->>'id')::uuid;
   select * into cur from public.records where workspace_id=w and id=rid and merged_into is null for update;
   if cur.id is null then result:='{"error":"not_found"}';
   elsif payload ? 'version' and (payload->>'version')::integer<>cur.version then result:=jsonb_build_object('error','version_conflict','version',cur.version);
   elsif operation='records.delete' then
    update public.records set archived=true where id=rid and workspace_id=w;
    result:=jsonb_build_object('data',jsonb_build_object('id',rid,'deleted',true,'restorable_days',30));
   else
    vals:=coalesce(payload->'values','{}'::jsonb);
    if jsonb_typeof(vals)<>'object' or vals='{}'::jsonb or exists(select 1 from jsonb_object_keys(vals) k where not k=any(record_columns)) then raise exception 'Relay: Champ non modifiable.' using errcode='22023';end if;
    if coalesce(vals->>'stage',cur.stage)='Perdu' and coalesce(btrim(coalesce(vals->>'lost_reason',cur.lost_reason)),'')='' then raise exception 'Relay: Précisez la raison de perte.' using errcode='22023';end if;
    -- Attributes are merged; validation covers the submitted values only.
    perform relay_private.record_values_validate(w,cur.object_id,vals,false);
    update public.records set
     display_name=case when vals ? 'display_name' then vals->>'display_name' else display_name end,
     email=case when vals ? 'email' then nullif(vals->>'email','') else email end,
     domain=case when vals ? 'domain' then nullif(vals->>'domain','') else domain end,
     stage=case when vals ? 'stage' then vals->>'stage' else stage end,
     amount=case when vals ? 'amount' then coalesce((vals->>'amount')::numeric,0) else amount end,
     currency=case when vals ? 'currency' then vals->>'currency' else currency end,
     owner_id=case when vals ? 'owner_id' then (vals->>'owner_id')::uuid else owner_id end,
     close_date=case when vals ? 'close_date' then (vals->>'close_date')::date else close_date end,
     pipeline_id=case when vals ? 'pipeline_id' then (vals->>'pipeline_id')::uuid else pipeline_id end,
     probability=case when vals ? 'probability' then (vals->>'probability')::numeric else probability end,
     lost_reason=case when vals ? 'lost_reason' then nullif(vals->>'lost_reason','') else lost_reason end,
     attributes=case when vals ? 'attributes' then attributes||(vals->'attributes') else attributes end
    where id=rid and workspace_id=w returning * into cur;
    result:=jsonb_build_object('data',to_jsonb(cur)-array['search','agent_search','deleted_at','deleted_by']);
   end if;
  elsif operation='tasks.list' then
   lim:=least(greatest(coalesce((payload->>'limit')::integer,50),1),100);
   select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb) into rows_data from(
    select id,record_id,title,description,status,priority,owner_id,due_date,created_at,updated_at from public.tasks
    where workspace_id=w and (payload->>'record_id' is null or record_id=(payload->>'record_id')::uuid) and (payload->>'status' is null or status=payload->>'status')
     and (payload->>'cursor_at' is null or (created_at,id)<((payload->>'cursor_at')::timestamptz,(payload->>'cursor_id')::uuid))
    order by created_at desc,id desc limit lim+1) t;
   n:=jsonb_array_length(rows_data);
   result:=jsonb_build_object('data',case when n>lim then rows_data-lim else rows_data end,'has_more',n>lim,
    'next_cursor',case when n>lim then jsonb_build_object('at',rows_data->(lim-1)->'created_at','id',rows_data->(lim-1)->'id') end);
  elsif operation='tasks.create' then
   insert into public.tasks(workspace_id,record_id,title,description,owner_id,due_date,priority)
   values(w,(payload->>'record_id')::uuid,payload->>'title',coalesce(payload->>'description',''),coalesce((payload->>'owner_id')::uuid,uid),(payload->>'due_date')::timestamptz,coalesce(payload->>'priority','normal'))
   returning jsonb_build_object('id',id,'record_id',record_id,'title',title,'status',status,'priority',priority,'owner_id',owner_id,'due_date',due_date,'created_at',created_at) into result;
   result:=jsonb_build_object('data',result);
  elsif operation='tasks.update' then
   update public.tasks set status=coalesce(payload->>'status',status),title=coalesce(payload->>'title',title),due_date=case when payload ? 'due_date' then (payload->>'due_date')::timestamptz else due_date end
   where workspace_id=w and id=(payload->>'id')::uuid
   returning jsonb_build_object('id',id,'record_id',record_id,'title',title,'status',status,'priority',priority,'owner_id',owner_id,'due_date',due_date,'updated_at',updated_at) into result;
   result:=case when result is null then '{"error":"not_found"}'::jsonb else jsonb_build_object('data',result) end;
  elsif operation='notes.list' then
   lim:=least(greatest(coalesce((payload->>'limit')::integer,50),1),100);
   select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc),'[]'::jsonb) into rows_data from(
    select id,record_id,title,content,author_id,created_at,updated_at from public.notes
    where workspace_id=w and not private and (payload->>'record_id' is null or record_id=(payload->>'record_id')::uuid)
     and (payload->>'cursor_at' is null or (created_at,id)<((payload->>'cursor_at')::timestamptz,(payload->>'cursor_id')::uuid))
    order by created_at desc,id desc limit lim+1) t;
   n:=jsonb_array_length(rows_data);
   result:=jsonb_build_object('data',case when n>lim then rows_data-lim else rows_data end,'has_more',n>lim,
    'next_cursor',case when n>lim then jsonb_build_object('at',rows_data->(lim-1)->'created_at','id',rows_data->(lim-1)->'id') end);
  elsif operation='notes.create' then
   insert into public.notes(workspace_id,record_id,title,content,private,author_id)
   values(w,(payload->>'record_id')::uuid,coalesce(payload->>'title',''),payload->>'content',false,uid)
   returning jsonb_build_object('id',id,'record_id',record_id,'title',title,'content',content,'created_at',created_at) into result;
   result:=jsonb_build_object('data',result);
  elsif operation='webhooks.list' then
   result:=jsonb_build_object('data',coalesce((select jsonb_agg(jsonb_build_object('id',id,'url',url,'description',description,'events',events,'object_ids',object_ids,'enabled',enabled,'disabled_reason',disabled_reason,'created_at',created_at) order by created_at)
    from public.webhook_endpoints where workspace_id=w),'[]'::jsonb));
  elsif operation='webhooks.create' then
   rid:=public.webhook_endpoint_create(w,payload->>'url',coalesce(payload->>'description',''),
    array(select jsonb_array_elements_text(payload->'events')),
    case when jsonb_typeof(payload->'object_ids')='array' then array(select jsonb_array_elements_text(payload->'object_ids')::uuid) end,
    payload->>'sealed_secret');
   result:=jsonb_build_object('data',jsonb_build_object('id',rid));
  elsif operation='webhooks.delete' then
   delete from public.webhook_endpoints where workspace_id=w and id=(payload->>'id')::uuid returning jsonb_build_object('id',id,'deleted',true) into result;
   result:=case when result is null then '{"error":"not_found"}'::jsonb else jsonb_build_object('data',result) end;
  end if;
 exception
  when insufficient_privilege then result:='{"error":"forbidden"}';
  when serialization_failure or deadlock_detected or lock_not_available then result:='{"error":"conflict"}';
  when invalid_parameter_value or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range
   or check_violation or not_null_violation or foreign_key_violation or unique_violation or string_data_right_truncation or raise_exception then
   get stacked diagnostics msg=message_text,state=returned_sqlstate;
   result:=jsonb_build_object('error','validation_error','message',case when msg like 'Relay: %' then substr(msg,8,300)
    when state='23502' then 'Champ obligatoire manquant.' when state='23503' then 'Une relation est invalide ou inaccessible.'
    when state='23505' then 'Cet élément existe déjà.' when state='23514' then 'Une valeur ne respecte pas les règles du champ.'
    when state in ('22P02','22007','22008','22003') then 'Format de valeur invalide.'
    when msg in ('Valeurs de fiche invalides','Champs prédéfinis invalides','Responsable inaccessible','Attribut absent ou archivé','Type de propriété invalide','Fiche liée inaccessible','Utilisateur inaccessible') or msg like 'Une propriété obligatoire%' then msg
    else 'Requête invalide.' end);
 end;
 perform set_config('role',old_role,true);
 perform set_config('request.jwt.claims','',true);
 perform set_config('request.jwt.claim.sub','',true);
 if writing and not result ? 'error' then perform relay_private.api_idempotent_write(kid,request_id,request_digest,result);end if;
 return result;
end $$;
revoke all on function public.api_request(text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.api_request(text,text,jsonb,text,text) to service_role;

commit;
