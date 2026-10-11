begin;
-- A non-login role preserves the existing authenticated RLS policies, even
-- though the entry point is called by the trusted backend service role.
do $$begin
 if not exists(select 1 from pg_roles where rolname='zyliad_mcp') then create role zyliad_mcp nologin nosuperuser nocreatedb nocreaterole nobypassrls inherit;
 elsif exists(select 1 from pg_roles where rolname='zyliad_mcp' and (rolcanlogin or rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) then raise exception 'Unsafe existing MCP role';end if;
end $$;
grant authenticated to zyliad_mcp;
grant zyliad_mcp to service_role;
grant usage on schema relay_private to zyliad_mcp;

create table relay_private.mcp_clients (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 redirect_uris text[] not null check(cardinality(redirect_uris) between 1 and 5), created_at timestamptz not null default now()
);
create table relay_private.mcp_connections (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references relay_private.mcp_clients(id),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 scopes text[] not null check(scopes <@ array['records:read','tasks:read','notes:read','meetings:read','communications:read','documents:read','commitments:read','configuration:read','crm:write']::text[]),
 resource text not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days',
 revoked_at timestamptz, last_used_at timestamptz, window_at timestamptz not null default now(), requests integer not null default 0
);
create index mcp_connections_actor on relay_private.mcp_connections(workspace_id,user_id,created_at desc);
create index mcp_connections_client on relay_private.mcp_connections(client_id);
create table relay_private.mcp_flows (
 flow_hash text primary key check(flow_hash ~ '^[a-f0-9]{64}$'), client_id uuid not null references relay_private.mcp_clients(id),
 redirect_uri text not null, state text not null check(length(state) between 1 and 512),
 challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'), resource text not null, scopes text[] not null,
 expires_at timestamptz not null default now()+interval '10 minutes', used_at timestamptz,
 code_hash text unique, code_expires_at timestamptz, code_used_at timestamptz,
 connection_id uuid references relay_private.mcp_connections(id) on delete cascade
);
create index mcp_flows_expiry on relay_private.mcp_flows(expires_at);
create index mcp_flows_client on relay_private.mcp_flows(client_id);
create index mcp_flows_connection on relay_private.mcp_flows(connection_id);
create table relay_private.mcp_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'), connection_id uuid not null references relay_private.mcp_connections(id) on delete cascade,
 kind text not null check(kind in ('access','refresh')), expires_at timestamptz not null, used_at timestamptz
);
create index mcp_tokens_connection on relay_private.mcp_tokens(connection_id);
create index mcp_tokens_expiry on relay_private.mcp_tokens(expires_at);
create table relay_private.mcp_buckets (name text primary key, window_at timestamptz not null default now(), requests integer not null default 0);
create table relay_private.mcp_commands (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references relay_private.mcp_connections(id) on delete cascade,
 request_id uuid not null, action text not null check(action in ('create_record','update_record','create_task','update_task','create_note','update_note')),
 payload jsonb not null, payload_hash text not null, status text not null default 'pending' check(status in ('pending','executed','rejected','expired')),
 result jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes',
 unique(connection_id,request_id)
);
create index mcp_commands_connection on relay_private.mcp_commands(connection_id,created_at desc);
create index mcp_commands_expiry on relay_private.mcp_commands(expires_at) where status='pending';
create table relay_private.mcp_audit (
 id bigint generated always as identity primary key, connection_id uuid not null references relay_private.mcp_connections(id) on delete cascade,
 action text not null, result text not null, created_at timestamptz not null default now()
);
create index mcp_audit_connection on relay_private.mcp_audit(connection_id,created_at desc);
do $$ declare t text;begin
 foreach t in array array['mcp_clients','mcp_connections','mcp_flows','mcp_tokens','mcp_buckets','mcp_commands','mcp_audit'] loop
 execute format('alter table relay_private.%I enable row level security',t);
 execute format('revoke all on relay_private.%I from public,anon,authenticated,service_role,zyliad_mcp',t);
 end loop;
end $$;

create function relay_private.mcp_budget(bucket text,maximum integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;begin
 insert into relay_private.mcp_buckets(name,requests) values(bucket,1)
 on conflict(name) do update set
 requests=case when mcp_buckets.window_at+interval '1 minute'<=now() then 1 else mcp_buckets.requests+1 end,
 window_at=case when mcp_buckets.window_at+interval '1 minute'<=now() then now() else mcp_buckets.window_at end returning requests into n;
 return n<=maximum;
end $$;
revoke all on function relay_private.mcp_budget(text,integer) from public,anon,authenticated;

create function relay_private.mcp_oauth(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare c relay_private.mcp_clients;f relay_private.mcp_flows;g relay_private.mcp_connections;t relay_private.mcp_tokens;i uuid;begin
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>12000 then return '{"error":"invalid_request"}';end if;
 if operation in ('register','begin','exchange','refresh') and not relay_private.mcp_budget('oauth:'||operation,120) then return '{"error":"rate_limited"}';end if;
 -- Bounded cleanup, with expiry indexes. No raw credentials are stored anywhere.
 delete from relay_private.mcp_flows where flow_hash in (select flow_hash from relay_private.mcp_flows where expires_at<now()-interval '5 minutes' limit 100);
 delete from relay_private.mcp_tokens where token_hash in (select token_hash from relay_private.mcp_tokens where expires_at<now()-interval '1 day' limit 100);
 delete from relay_private.mcp_clients where id in (select id from relay_private.mcp_clients c_row where c_row.created_at<now()-interval '1 day' and not exists(select 1 from relay_private.mcp_connections g_row where g_row.client_id=c_row.id) and not exists(select 1 from relay_private.mcp_flows f_row where f_row.client_id=c_row.id) limit 100);
 delete from relay_private.mcp_audit where id in (select id from relay_private.mcp_audit where created_at<now()-interval '90 days' limit 500);
 update relay_private.mcp_commands set status='expired',payload='{}' where id in (select id from relay_private.mcp_commands where status='pending' and expires_at<=now() limit 100);
 if operation='register' then
  if (select count(*) from relay_private.mcp_clients)>=10000 then return '{"error":"rate_limited"}';end if;
  insert into relay_private.mcp_clients(name,redirect_uris) values(payload->>'client_name',array(select jsonb_array_elements_text(payload->'redirect_uris'))) returning id into i;
  return jsonb_build_object('client_id',i);
 end if;
 if operation='begin' then
  select * into c from relay_private.mcp_clients where id=(payload->>'client_id')::uuid;
  if c.id is null or not (payload->>'redirect_uri')=any(c.redirect_uris) then return '{"error":"invalid_client"}';end if;
  insert into relay_private.mcp_flows(flow_hash,client_id,redirect_uri,state,challenge,resource,scopes)
  values(payload->>'flow_hash',c.id,payload->>'redirect_uri',payload->>'state',payload->>'code_challenge',payload->>'resource',array(select jsonb_array_elements_text(payload->'scope')));
  return '{}'::jsonb;
 end if;
 if operation='flow' then
  select * into f from relay_private.mcp_flows where flow_hash=payload->>'flow_hash' and used_at is null and expires_at>now();
  if f.flow_hash is null then return '{"error":"invalid_request"}';end if;
  select * into c from relay_private.mcp_clients where id=f.client_id;
  return jsonb_build_object('client_name',c.name,'scopes',f.scopes);
 end if;
 if operation='exchange' then
  select * into f from relay_private.mcp_flows where code_hash=payload->>'code_hash' for update;
  if f.code_hash is null or f.code_used_at is not null or f.code_expires_at<=now() or f.client_id<>(payload->>'client_id')::uuid or f.redirect_uri<>payload->>'redirect_uri' or f.resource<>payload->>'resource' or f.challenge<>payload->>'challenge' then return '{"error":"invalid_grant"}';end if;
  select * into g from relay_private.mcp_connections where id=f.connection_id for update;
  if g.revoked_at is not null or g.expires_at<=now() or not exists(select 1 from public.memberships where workspace_id=g.workspace_id and user_id=g.user_id) then return '{"error":"invalid_grant"}';end if;
  update relay_private.mcp_flows set code_used_at=now() where flow_hash=f.flow_hash;
 elsif operation='refresh' then
  select * into t from relay_private.mcp_tokens where token_hash=payload->>'refresh_hash' and kind='refresh';
  if t.token_hash is null then return '{"error":"invalid_grant"}';end if;
  -- Lock the family before its tokens to serialize refresh, revoke and requests.
  select * into g from relay_private.mcp_connections where id=t.connection_id for update;
  select * into t from relay_private.mcp_tokens where token_hash=payload->>'refresh_hash' for update;
  if g.client_id<>(payload->>'client_id')::uuid or g.resource<>payload->>'resource' then return '{"error":"invalid_grant"}';end if;
  if t.used_at is not null then
   update relay_private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=g.id;
   update relay_private.mcp_commands set status='rejected',payload='{}' where connection_id=g.id and status='pending';
   insert into relay_private.mcp_audit(connection_id,action,result) values(g.id,'refresh','reuse_rejected');
   return '{"error":"invalid_grant"}';
  end if;
  if t.expires_at<=now() or g.revoked_at is not null or g.expires_at<=now() or not exists(select 1 from public.memberships where workspace_id=g.workspace_id and user_id=g.user_id) or (payload ? 'scope' and not (array(select jsonb_array_elements_text(payload->'scope')) @> g.scopes and array(select jsonb_array_elements_text(payload->'scope')) <@ g.scopes)) then return '{"error":"invalid_grant"}';end if;
  update relay_private.mcp_tokens set used_at=now() where token_hash=t.token_hash;
 elsif operation='revoke' then
  select x.* into g from relay_private.mcp_connections x join relay_private.mcp_tokens y on y.connection_id=x.id where y.token_hash=payload->>'token_hash' and x.client_id=(payload->>'client_id')::uuid for update of x;
  if g.id is not null then
   update relay_private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=g.id;
   update relay_private.mcp_commands set status='rejected',payload='{}' where connection_id=g.id and status='pending';
   insert into relay_private.mcp_audit(connection_id,action,result) values(g.id,'disconnect','revoked');
  end if;return '{}';
 elsif operation='verify' then
  select x.* into g from relay_private.mcp_connections x join relay_private.mcp_tokens y on y.connection_id=x.id where y.token_hash=payload->>'token_hash' and y.kind='access' and y.expires_at>now() for update of x;
  if g.id is null or g.revoked_at is not null or g.expires_at<=now() or g.resource<>payload->>'resource' or not exists(select 1 from public.memberships where workspace_id=g.workspace_id and user_id=g.user_id) then return '{"error":"unauthorized"}';end if;
  if not relay_private.mcp_budget('workspace:'||g.workspace_id::text,600) then return '{"error":"rate_limited"}';end if;
  if g.window_at+interval '1 minute'<=now() then g.requests:=0;g.window_at:=now();end if;
  if g.requests>=120 then return '{"error":"rate_limited"}';end if;
  update relay_private.mcp_connections set requests=g.requests+1,window_at=g.window_at,last_used_at=now() where id=g.id;
  return jsonb_build_object('connection_id',g.id,'workspace_id',g.workspace_id,'user_id',g.user_id,'scopes',g.scopes,'expires_at',g.expires_at);
 else return '{"error":"invalid_request"}';end if;
 -- Exchange/rotation: hashes only; access tokens cannot be used as refresh tokens.
 insert into relay_private.mcp_tokens(token_hash,connection_id,kind,expires_at) values
 (payload->>'access_hash',g.id,'access',least(now()+interval '1 hour',g.expires_at)),
 (payload->>'new_refresh_hash',g.id,'refresh',g.expires_at);
 insert into relay_private.mcp_audit(connection_id,action,result) values(g.id,operation,'success');
 return jsonb_build_object('scope',array_to_string(g.scopes,' '),'expires_in',greatest(0,extract(epoch from least(now()+interval '1 hour',g.expires_at)-now())::integer));
end $$;
create function public.mcp_oauth(operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select relay_private.mcp_oauth(operation,payload)$$;
revoke all on function public.mcp_oauth(text,jsonb),relay_private.mcp_oauth(text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_oauth(text,jsonb),relay_private.mcp_oauth(text,jsonb) to service_role;

create function relay_private.mcp_consent(flow_hash text,w uuid,approved_scopes text[],code_hash text,allow boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare f relay_private.mcp_flows;i uuid;r text;begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from relay_private.mcp_flows where mcp_flows.flow_hash=flow_hash for update;
 if f.flow_hash is null or f.used_at is not null or f.expires_at<=now() then raise exception 'Expired authorization' using errcode='22023';end if;
 select role into r from public.memberships where workspace_id=w and user_id=auth.uid() for share;
 if r is null or (allow and (cardinality(approved_scopes)=0 or not approved_scopes<@f.scopes or ('crm:write'=any(approved_scopes) and r='viewer'))) then raise exception 'Forbidden' using errcode='42501';end if;
 if allow then
  if (select count(*) from relay_private.mcp_connections where user_id=auth.uid() and workspace_id=w and revoked_at is null and expires_at>now())>=20 then raise exception 'Connection limit' using errcode='22023';end if;
  insert into relay_private.mcp_connections(client_id,workspace_id,user_id,scopes,resource) values(f.client_id,w,auth.uid(),approved_scopes,f.resource) returning id into i;
  insert into relay_private.mcp_audit(connection_id,action,result) values(i,'connect','consented');
 end if;
 update relay_private.mcp_flows set used_at=now(),code_hash=case when allow then code_hash end,code_expires_at=now()+interval '60 seconds',connection_id=i where mcp_flows.flow_hash=flow_hash;
 return jsonb_build_object('redirect_uri',f.redirect_uri,'state',f.state);
end $$;
create function public.mcp_consent(flow_hash text,w uuid,approved_scopes text[],code_hash text,allow boolean) returns jsonb language sql security invoker set search_path='' as $$select relay_private.mcp_consent(flow_hash,w,approved_scopes,code_hash,allow)$$;
revoke all on function public.mcp_consent(text,uuid,text[],text,boolean),relay_private.mcp_consent(text,uuid,text[],text,boolean) from public,anon;
grant execute on function public.mcp_consent(text,uuid,text[],text,boolean),relay_private.mcp_consent(text,uuid,text[],text,boolean) to authenticated;

-- Privileged functions handle only credential verification or the private outbox.
-- All CRM reads and confirmed writes below are SECURITY INVOKER under RLS.
create function relay_private.mcp_prepare(gid uuid,action text,proposal_values jsonb,rid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare g relay_private.mcp_connections;c relay_private.mcp_commands;h text;begin
 select * into g from relay_private.mcp_connections where id=gid for update;
 if g.id is null or g.user_id<>auth.uid() or g.revoked_at is not null or g.expires_at<=now() or not 'crm:write'=any(g.scopes) or not relay_private.has_role(g.workspace_id,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(proposal_values)<>'object' or octet_length(proposal_values::text)>50000 or rid is null then raise exception 'Invalid proposal' using errcode='22023';end if;
 h:=encode(extensions.digest(action||proposal_values::text,'sha256'),'hex');
 select * into c from relay_private.mcp_commands where connection_id=gid and request_id=rid;
 if c.id is not null then
  if c.payload_hash<>h then raise exception 'Idempotency conflict' using errcode='40001';end if;
 else
  if (select count(*) from relay_private.mcp_commands where connection_id=gid and status='pending' and expires_at>now())>=30 then raise exception 'Pending limit' using errcode='22023';end if;
  insert into relay_private.mcp_commands(connection_id,request_id,action,payload,payload_hash) values(gid,rid,action,proposal_values,h) returning * into c;
  insert into relay_private.mcp_audit(connection_id,action,result) values(gid,action,'pending_confirmation');
 end if;
 return jsonb_build_object('id',c.id,'status',case when c.status='pending' and c.expires_at<=now() then 'expired' else c.status end,'action',c.action,'expires_at',c.expires_at,'result',c.result,'confirmation_required',true);
end $$;
revoke all on function relay_private.mcp_prepare(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function relay_private.mcp_prepare(uuid,text,jsonb,uuid) to zyliad_mcp;

create function relay_private.mcp_status(gid uuid,cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c relay_private.mcp_commands;begin
 select x.* into c from relay_private.mcp_commands x join relay_private.mcp_connections g on g.id=x.connection_id where x.id=cid and g.id=gid and g.user_id=auth.uid() and g.revoked_at is null;
 if c.id is null then raise exception 'Unknown proposal' using errcode='42501';end if;
 return jsonb_build_object('id',c.id,'action',c.action,'status',case when c.status='pending' and c.expires_at<=now() then 'expired' else c.status end,'result',c.result);
end $$;
revoke all on function relay_private.mcp_status(uuid,uuid) from public,anon,authenticated;
grant execute on function relay_private.mcp_status(uuid,uuid) to zyliad_mcp;

create function relay_private.mcp_log(gid uuid,operation text,outcome text) returns void language plpgsql security definer set search_path='' as $$begin
 if operation not in ('session','search','source','aggregate','workspace','prepare','status') then raise exception 'Invalid operation' using errcode='22023';end if;
 if outcome not in ('success','forbidden','conflict','validation_error') then raise exception 'Invalid outcome' using errcode='22023';end if;
 insert into relay_private.mcp_audit(connection_id,action,result) values(gid,operation,outcome);
end $$;
revoke all on function relay_private.mcp_log(uuid,text,text) from public,anon,authenticated;
grant execute on function relay_private.mcp_log(uuid,text,text) to service_role;

create function public.mcp_request(token_hash text,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare a jsonb;w uuid;gid uuid;result jsonb;k text;needed text;old_role text:=current_user;begin
 a:=relay_private.mcp_oauth('verify',jsonb_build_object('token_hash',token_hash,'resource',payload->>'resource'));
 if a ? 'error' then return a;end if;
 w:=(a->>'workspace_id')::uuid;gid:=(a->>'connection_id')::uuid;
 if operation='session' then return a-'user_id';end if;
 -- The original caller is the trusted service; unprivileged clients have no
 -- EXECUTE grant on this wrapper and cannot supply an arbitrary identity.
 perform set_config('request.jwt.claim.sub',a->>'user_id',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a->>'user_id','role','authenticated')::text,true);
 perform set_config('role','zyliad_mcp',true);
 begin
  k:=payload->>'kind';
  needed:=case k when 'record' then 'records:read' when 'task' then 'tasks:read' when 'note' then 'notes:read' when 'meeting' then 'meetings:read' when 'email' then 'communications:read' when 'calendar' then 'communications:read' when 'thread' then 'communications:read' when 'document' then 'documents:read' when 'commitment' then 'commitments:read' when 'conflict' then 'commitments:read' when 'list' then 'configuration:read' when 'pipeline' then 'configuration:read' when 'workflow' then 'configuration:read' end;
  if operation in ('search','source','aggregate') then
   if needed is null or not (a->'scopes') ? needed then raise exception 'Scope denied' using errcode='42501';end if;
   if operation='aggregate' then result:=public.agent_aggregate(w,k,coalesce(payload->'filters','{}'),coalesce(payload->>'group_by','none'));
   else result:=public.agent_search(w,k,coalesce(payload->'filters','{}'),case when operation='source' then (payload->>'id')::uuid end,coalesce((payload->>'content_offset')::integer,0));end if;
  elsif operation='workspace' then
   if not (a->'scopes') ? 'configuration:read' then raise exception 'Scope denied' using errcode='42501';end if;
   select jsonb_build_object('workspace',(select jsonb_build_object('id',id,'name',name) from public.workspaces where id=w),'objects',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug)) from public.objects where workspace_id=w),'[]'),'attributes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'object_id',object_id,'key',key,'name',name,'type',type,'required',required,'options',options)) from public.attributes where workspace_id=w and not archived),'[]')) into result;
  elsif operation='prepare' then result:=relay_private.mcp_prepare(gid,payload->>'action',payload->'values',(payload->>'request_id')::uuid);
  elsif operation='status' then result:=relay_private.mcp_status(gid,(payload->>'id')::uuid);
  else raise exception 'Unsupported operation' using errcode='22023';end if;
 exception when insufficient_privilege then result:='{"error":"forbidden"}';when serialization_failure then result:='{"error":"conflict"}';when invalid_parameter_value or invalid_text_representation or check_violation or foreign_key_violation then result:='{"error":"validation_error"}';
 end;
 perform set_config('role',old_role,true);
 perform relay_private.mcp_log(gid,operation,coalesce(result->>'error','success'));
 return result;
end $$;
revoke all on function public.mcp_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_request(text,text,jsonb) to service_role;

create function relay_private.mcp_manage(w uuid,operation text,cid uuid default null,executed_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare c relay_private.mcp_commands;g relay_private.mcp_connections;begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 update relay_private.mcp_commands p set status='expired',payload='{}' where p.status='pending' and p.expires_at<=now() and p.connection_id in (select id from relay_private.mcp_connections where workspace_id=w and user_id=auth.uid());
 if operation='list' then
  return jsonb_build_object('connections',coalesce((select jsonb_agg(x) from (select g_row.id,c_row.name,g_row.scopes,g_row.created_at,g_row.expires_at,g_row.revoked_at,g_row.last_used_at from relay_private.mcp_connections g_row join relay_private.mcp_clients c_row on c_row.id=g_row.client_id where g_row.workspace_id=w and g_row.user_id=auth.uid() order by g_row.created_at desc limit 50)x),'[]'),
  'commands',coalesce((select jsonb_agg(x) from (select p.id,p.connection_id,p.action,p.payload as values,case when p.status='pending' and p.expires_at<=now() then 'expired' else p.status end as status,p.expires_at,p.created_at,p.result from relay_private.mcp_commands p join relay_private.mcp_connections g_row on g_row.id=p.connection_id where g_row.workspace_id=w and g_row.user_id=auth.uid() order by p.created_at desc limit 30)x),'[]'),
  'audit',coalesce((select jsonb_agg(x) from (select l.action,l.result,l.created_at from relay_private.mcp_audit l join relay_private.mcp_connections g_row on g_row.id=l.connection_id where g_row.workspace_id=w and g_row.user_id=auth.uid() order by l.created_at desc limit 50)x),'[]'));
 elsif operation='revoke' then
  select * into g from relay_private.mcp_connections where id=cid and workspace_id=w and user_id=auth.uid() for update;
  if g.id is null then raise exception 'Forbidden' using errcode='42501';end if;
  update relay_private.mcp_connections set revoked_at=coalesce(revoked_at,now()) where id=cid;
  update relay_private.mcp_commands set status='rejected',payload='{}' where connection_id=cid and status='pending';
  insert into relay_private.mcp_audit(connection_id,action,result) values(cid,'disconnect','revoked');return '{"ok":true}';
 else
  select x.* into g from relay_private.mcp_connections x join relay_private.mcp_commands p on p.connection_id=x.id where p.id=cid and x.workspace_id=w and x.user_id=auth.uid() for update of x;
  select * into c from relay_private.mcp_commands where id=cid for update;
  if g.id is null or c.id is null or g.revoked_at is not null or g.expires_at<=now() or not 'crm:write'=any(g.scopes) or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
  if c.status<>'pending' then return jsonb_build_object('id',c.id,'status',c.status,'result',c.result);end if;
  if c.expires_at<=now() then update relay_private.mcp_commands set status='expired',payload='{}' where id=cid;return jsonb_build_object('id',cid,'status','expired');end if;
  if operation='reject' then update relay_private.mcp_commands set status='rejected',payload='{}' where id=cid;insert into relay_private.mcp_audit(connection_id,action,result) values(g.id,c.action,'rejected');return jsonb_build_object('id',cid,'status','rejected');end if;
  if operation='take' then return jsonb_build_object('id',cid,'action',c.action,'values',c.payload,'connection_id',g.id,'status','pending');end if;
  if operation='finish' then
   update relay_private.mcp_commands set status='executed',payload='{}',result=jsonb_build_object('entity_id',executed_id,'executed',true) where id=cid;
   insert into relay_private.mcp_audit(connection_id,action,result) values(g.id,c.action,'executed');return jsonb_build_object('id',cid,'status','executed');
  end if;raise exception 'Unsupported operation' using errcode='22023';
 end if;
end $$;
revoke all on function relay_private.mcp_manage(uuid,text,uuid,uuid) from public,anon;
grant execute on function relay_private.mcp_manage(uuid,text,uuid,uuid) to authenticated;

create function public.mcp_manage(w uuid,operation text,cid uuid default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare c jsonb;v jsonb;row_id uuid;tab text;keys text[];allowed text[];sql text;rec public.records;begin
 if operation<>'approve' then
  if operation not in ('list','revoke','reject') then raise exception 'Forbidden' using errcode='42501';end if;
  return relay_private.mcp_manage(w,operation,cid);
 end if;
 c:=relay_private.mcp_manage(w,'take',cid);
 if c->>'status'<>'pending' then return c;end if;
 v:=c->'values';
 case c->>'action'
 when 'create_record' then
  insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,pipeline_id,probability,lost_reason,attributes)
  values(w,(v->>'object_id')::uuid,v->>'display_name',nullif(v->>'email',''),nullif(v->>'domain',''),coalesce(v->>'stage','Nouveau'),coalesce((v->>'amount')::numeric,0),coalesce(v->>'currency','EUR'),coalesce((v->>'owner_id')::uuid,auth.uid()),(v->>'close_date')::date,(v->>'pipeline_id')::uuid,(v->>'probability')::numeric,coalesce(v->>'lost_reason',''),coalesce(v->'attributes','{}')) returning id into row_id;
 when 'create_task' then
  insert into public.tasks(workspace_id,title,description,record_id,owner_id,due_date,status,priority) values(w,v->>'title',coalesce(v->>'description',''),(v->>'record_id')::uuid,coalesce((v->>'owner_id')::uuid,auth.uid()),(v->>'due_date')::timestamptz,coalesce(v->>'status','open'),coalesce(v->>'priority','normal')) returning id into row_id;
 when 'create_note' then
  -- Notes created by an external agent default to private. Sharing is a
  -- separately confirmed update, never inferred from an external source.
  insert into public.notes(workspace_id,title,content,record_id,private,author_id) values(w,coalesce(v->>'title',''),v->>'content',(v->>'record_id')::uuid,true,auth.uid()) returning id into row_id;
 when 'update_record','update_task','update_note' then
  tab:=case c->>'action' when 'update_record' then 'records' when 'update_task' then 'tasks' else 'notes' end;
  allowed:=case tab when 'records' then array['display_name','email','domain','stage','amount','currency','owner_id','close_date','pipeline_id','probability','lost_reason','attributes'] when 'tasks' then array['title','description','owner_id','due_date','status','priority'] else array['title','content','private'] end;
  if jsonb_typeof(v->'values')<>'object' or (v->>'version')::integer<1 then raise exception 'Invalid proposal' using errcode='22023';end if;
  select array_agg(k) into keys from jsonb_object_keys(v->'values') k;
  if cardinality(keys) is null or not keys<@allowed then raise exception 'Invalid fields' using errcode='22023';end if;
  -- Column names come from a fixed allowlist. jsonb_populate_record casts
  -- values to the existing table types; RLS, FKs and validation triggers apply.
  select string_agg(format('%I=source.%I',k,k),',') into sql from unnest(keys) k;
  execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) source where target.workspace_id=$2 and target.id=$3 and target.version=$4 returning target.id',tab,sql,tab) into row_id using v->'values',w,(v->>'id')::uuid,(v->>'version')::integer;
  if row_id is null then raise exception 'Version conflict or inaccessible row' using errcode='40001';end if;
 else raise exception 'Unsupported action' using errcode='22023';end case;
 perform relay_private.mcp_manage(w,'finish',cid,row_id);
 return jsonb_build_object('id',cid,'status','executed','record_id',row_id);
end $$;
revoke all on function public.mcp_manage(uuid,text,uuid) from public,anon;
grant execute on function public.mcp_manage(uuid,text,uuid) to authenticated;
commit;
