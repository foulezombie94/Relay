begin;

-- No credentials or provider payloads are exposed through PostgREST schemas.
create table relay_private.integration_connections (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connected_by_user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('zyliad','google','microsoft','slack','stripe','calendly','typeform','notion','dropbox','pandadoc','apollo','zoom')),
 external_account_id text not null default '' check(length(external_account_id)<=500),
 external_account_name text not null default '' check(length(external_account_name)<=500),
 email text check(length(email)<=320),
 auth_type text not null check(auth_type in ('oauth2','api_key','internal')),
 encrypted_credentials text check(octet_length(encrypted_credentials)<=100000),
 credential_revision integer not null default 1,
 connection_generation integer not null default 1,
 granted_scopes text[] not null default '{}',enabled_integrations text[] not null default '{}',
 status text not null default 'connecting' check(status in ('disconnected','connecting','connected','syncing','degraded','needs_reauth','revoked','error')),
 expires_at timestamptz,refresh_lease uuid,refresh_until timestamptz,
 last_health_check_at timestamptz,last_sync_at timestamptz,error_code text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,connected_by_user_id,provider),
 unique(id,workspace_id),
 check(cardinality(granted_scopes)<=100 and cardinality(enabled_integrations)<=19),
 check(error_code is null or error_code ~ '^[a-z_]{1,80}$')
);
create index integration_connections_status_idx on relay_private.integration_connections(status,expires_at);
create table relay_private.integration_oauth_states (
 hashed_state text primary key check(hashed_state ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id uuid not null,
 provider text not null,
 encrypted_verifier text not null,
 requested_scopes text[] not null,requested_integrations text[] not null,
 connection_revision integer not null,
 expires_at timestamptz not null default now()+interval '10 minutes',used_at timestamptz,
 foreign key(connection_id,workspace_id) references relay_private.integration_connections(id,workspace_id) on delete cascade
);
create index integration_oauth_expiry_idx on relay_private.integration_oauth_states(expires_at);
create table relay_private.integration_sync_state (
 connection_id uuid not null references relay_private.integration_connections(id) on delete cascade,
 resource_type text not null check(length(resource_type) between 1 and 200 and resource_type ~ '^[a-z]+:[^[:cntrl:]]+$'),
 encrypted_cursor text,cursor_revision integer not null default 0,
 enabled boolean not null default false,config jsonb not null default '{}',
 last_sync_at timestamptz,next_sync_at timestamptz not null default now(),
 status text not null default 'idle' check(status in ('idle','queued','syncing','error')),
 primary key(connection_id,resource_type),check(octet_length(config::text)<=10000)
);
create table relay_private.integration_webhook_subscriptions (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references relay_private.integration_connections(id) on delete cascade,
 resource_type text not null,encrypted_subscription text not null,expires_at timestamptz,
 created_at timestamptz not null default now(),unique(connection_id,resource_type)
);
create table relay_private.integration_webhook_events (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null,
 workspace_id uuid not null,provider text not null,provider_event_id text not null check(length(provider_event_id) between 1 and 500),
 event_type text not null check(length(event_type)<=200),occurred_at timestamptz,received_at timestamptz not null default now(),
 verified boolean not null check(verified),encrypted_payload text,
 processing_status text not null default 'pending' check(processing_status in ('pending','processing','processed','failed','dead')),
 attempts integer not null default 0,job_id uuid references relay_private.jobs(id) on delete set null,
 unique(connection_id,provider_event_id),
 foreign key(connection_id,workspace_id) references relay_private.integration_connections(id,workspace_id) on delete cascade,
 check(octet_length(encrypted_payload)<=1500000)
);
create index integration_webhook_retention_idx on relay_private.integration_webhook_events(received_at);
create table relay_private.integration_external_objects (
 connection_id uuid not null,workspace_id uuid not null,provider text not null,resource_type text not null,
 external_id text not null check(length(external_id) between 1 and 500),
 zyliad_object_type text check(zyliad_object_type in ('records','tasks','notes','meetings','documents')),
 zyliad_object_id uuid,remote_updated_at timestamptz,deleted_at timestamptz,
 encrypted_metadata text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(connection_id,resource_type,external_id),
 foreign key(connection_id,workspace_id) references relay_private.integration_connections(id,workspace_id) on delete cascade,
 check((zyliad_object_type is null)=(zyliad_object_id is null))
);
create index integration_objects_workspace_idx on relay_private.integration_external_objects(workspace_id,zyliad_object_type,zyliad_object_id);
create table relay_private.integration_agent_policies (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 integration text not null,
 can_read boolean not null default false,can_create boolean not null default false,can_update boolean not null default false,
 can_send boolean not null default false,can_delete boolean not null default false,
 always_ask_before_sending boolean not null default true,always_ask_before_deleting boolean not null default true,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 primary key(workspace_id,integration),
 check(integration in ('api-webhooks','google-calendar','gmail','outlook','outlook-calendar','slack','stripe','google-drive','google-sheets','calendly','typeform','notion','zapier','dropbox','onedrive','pandadoc','apollo','google-meet','zoom')),
 -- Risk 2/3 confirmations cannot be weakened by a generic toggle.
 check(always_ask_before_sending and always_ask_before_deleting)
);
create table relay_private.integration_commands (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null,workspace_id uuid not null,
 user_id uuid not null references auth.users(id),source text not null check(source in ('user','agent','automation')),connection_generation integer not null,
 action text not null check(action ~ '^[a-z0-9_.]{1,100}$'),integration text not null,verb text not null check(verb in ('read','create','update','send','delete')),
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 encrypted_input text not null,risk integer not null check(risk between 0 and 3),
 status text not null check(status in ('proposed','approved','dispatching','succeeded','failed','unknown','cancelled')),
 correlation_id uuid not null,dispatch_lease uuid,encrypted_result text,error_code text,
 expires_at timestamptz not null default now()+interval '10 minutes',created_at timestamptz not null default now(),completed_at timestamptz,
 foreign key(connection_id,workspace_id) references relay_private.integration_connections(id,workspace_id) on delete cascade,
 unique(workspace_id,user_id,correlation_id),check(octet_length(encrypted_input)<=1500000)
);
create index integration_commands_expiry_idx on relay_private.integration_commands(status,expires_at);
create table relay_private.integration_audit_logs (
 id bigint generated always as identity primary key,workspace_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id uuid,actor_id uuid,source text not null,provider text not null,action text not null,
 result text not null check(result in ('proposed','approved','success','failure','unknown')),
 error_code text,latency_ms integer,provider_status integer,correlation_id uuid,created_at timestamptz not null default now(),
 check(error_code is null or error_code ~ '^[a-z_]{1,80}$'),check(latency_ms is null or latency_ms>=0)
);
create index integration_audit_workspace_idx on relay_private.integration_audit_logs(workspace_id,actor_id,created_at desc);
create table relay_private.integration_rate_buckets (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 bucket text not null,window_started_at timestamptz not null default now(),count integer not null default 0,
 blocked_until timestamptz,primary key(workspace_id,bucket)
);

do $$declare t text;begin
 foreach t in array array['integration_connections','integration_oauth_states','integration_sync_state','integration_webhook_subscriptions','integration_webhook_events','integration_external_objects','integration_agent_policies','integration_commands','integration_audit_logs','integration_rate_buckets'] loop
  execute format('alter table relay_private.%I enable row level security',t);
  execute format('revoke all on table relay_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function relay_private.integration_safe(c relay_private.integration_connections) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',c.id,'workspace_id',c.workspace_id,'connected_by_user_id',c.connected_by_user_id,
 'provider',c.provider,'external_account_id',c.external_account_id,'external_account_name',c.external_account_name,'email',c.email,
 'auth_type',c.auth_type,'granted_scopes',c.granted_scopes,'enabled_integrations',c.enabled_integrations,'status',c.status,
 'last_health_check_at',c.last_health_check_at,'last_sync_at',c.last_sync_at,'error_code',c.error_code,'created_at',c.created_at,'updated_at',c.updated_at)
$$;
revoke all on function relay_private.integration_safe(relay_private.integration_connections) from public,anon,authenticated,service_role;

create function public.integration_management(w uuid,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare subject uuid:=auth.uid();role text;cmd relay_private.integration_commands;result jsonb;
begin
 select m.role into role from public.memberships m where m.workspace_id=w and m.user_id=subject;
 if role is null then raise exception 'Forbidden' using errcode='42501';end if;
 if operation='list' then
  return coalesce((select jsonb_agg(relay_private.integration_safe(c) order by c.provider) from relay_private.integration_connections c where c.workspace_id=w and c.connected_by_user_id=subject),'[]');
 elsif operation='policies' then
  return coalesce((select jsonb_agg(to_jsonb(p)-'updated_by') from relay_private.integration_agent_policies p where p.workspace_id=w),'[]');
 elsif operation='policy_save' then
  if role not in ('owner','admin') then raise exception 'Forbidden' using errcode='42501';end if;
  insert into relay_private.integration_agent_policies(workspace_id,integration,can_read,can_create,can_update,can_send,can_delete,updated_by)
  values(w,payload->>'integration',(payload->>'read')::boolean,(payload->>'create')::boolean,(payload->>'update')::boolean,(payload->>'send')::boolean,(payload->>'delete')::boolean,subject)
  on conflict(workspace_id,integration) do update set can_read=excluded.can_read,can_create=excluded.can_create,can_update=excluded.can_update,can_send=excluded.can_send,can_delete=excluded.can_delete,updated_by=subject,updated_at=now();
  insert into relay_private.integration_audit_logs(workspace_id,actor_id,source,provider,action,result) values(w,subject,'user',payload->>'integration','permissions.updated','success');
  return jsonb_build_object('ok',true);
 elsif operation in ('approve','reject') then
  if role='viewer' then raise exception 'Forbidden' using errcode='42501';end if;
  select * into cmd from relay_private.integration_commands where id=(payload->>'command_id')::uuid and workspace_id=w and user_id=subject for update;
  if cmd.id is null or cmd.status<>'proposed' or cmd.expires_at<=now() or not exists(select 1 from relay_private.integration_connections where id=cmd.connection_id and status='connected') then raise exception 'Invalid confirmation' using errcode='42501';end if;
  update relay_private.integration_commands set status=case when operation='approve' then 'approved' else 'cancelled' end where id=cmd.id;
  insert into relay_private.integration_audit_logs(workspace_id,connection_id,actor_id,source,provider,action,result,correlation_id)
  select w,c.id,subject,'user',c.provider,cmd.action,case when operation='approve' then 'approved' else 'failure' end,cmd.correlation_id from relay_private.integration_connections c where c.id=cmd.connection_id;
  return jsonb_build_object('id',cmd.id,'status',case when operation='approve' then 'approved' else 'cancelled' end);
 elsif operation='audit' then
  return coalesce((select jsonb_agg(to_jsonb(a)) from (select * from relay_private.integration_audit_logs where workspace_id=w and (actor_id=subject or role in ('owner','admin')) order by created_at desc limit 100) a),'[]');
 elsif operation='commands' then
  return coalesce((select jsonb_agg(to_jsonb(a)) from (select id,connection_id,action,risk,status,created_at,expires_at,error_code from relay_private.integration_commands where workspace_id=w and user_id=subject order by created_at desc limit 50) a),'[]');
 end if;
 raise exception 'Unsupported operation' using errcode='22023';
end $$;
revoke all on function public.integration_management(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.integration_management(uuid,text,jsonb) to authenticated;

-- This privileged gateway is server-only. Every actor-bearing operation rechecks
-- live membership and personal connection ownership; workspace IDs are not authority.
create function public.integration_runtime(w uuid,subject uuid,operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
 declare c relay_private.integration_connections;s relay_private.integration_oauth_states;cmd relay_private.integration_commands;
 role text;event_id uuid;job uuid;token uuid;bucket relay_private.integration_rate_buckets;item jsonb;
begin
 if octet_length(payload::text)>2000000 or jsonb_typeof(payload)<>'object' then raise exception 'Invalid payload' using errcode='22023';end if;
 select m.role into role from public.memberships m where m.workspace_id=w and m.user_id=subject;
 if (role is null or role='viewer') and operation not in ('revoke_load','disconnect_finish') then raise exception 'Forbidden' using errcode='42501';end if;
 if operation='oauth_begin' then
  perform pg_advisory_xact_lock(hashtextextended('integration-oauth:'||w::text||':'||subject::text,0));
  delete from relay_private.integration_oauth_states where expires_at<now();
  if (select count(*) from relay_private.integration_oauth_states where user_id=subject and workspace_id=w and expires_at>now())>=10 then raise exception 'Too many authorizations' using errcode='53300';end if;
  insert into relay_private.integration_connections(id,workspace_id,connected_by_user_id,provider,auth_type)
  values((payload->>'connection_id')::uuid,w,subject,payload->>'provider','oauth2')
  on conflict(workspace_id,connected_by_user_id,provider) do update set updated_at=now() returning * into c;
  if c.status='revoked' and c.encrypted_credentials is not null then raise exception 'Revocation pending' using errcode='42501';end if;
  insert into relay_private.integration_oauth_states(hashed_state,user_id,workspace_id,connection_id,provider,encrypted_verifier,requested_scopes,requested_integrations,connection_revision)
  values(payload->>'hashed_state',subject,w,c.id,c.provider,payload->>'encrypted_verifier',array(select jsonb_array_elements_text(payload->'scopes')),array(select jsonb_array_elements_text(payload->'integrations')),c.credential_revision);
  return jsonb_build_object('connection',relay_private.integration_safe(c),'revision',c.credential_revision);
 elsif operation='oauth_consume' then
  update relay_private.integration_oauth_states set used_at=now() where hashed_state=payload->>'hashed_state' and user_id=subject and workspace_id=w and provider=payload->>'provider' and used_at is null and expires_at>now() returning * into s;
  if s.hashed_state is null then raise exception 'Invalid OAuth state' using errcode='42501';end if;
  return to_jsonb(s);
 end if;
 select * into c from relay_private.integration_connections where id=(payload->>'connection_id')::uuid and workspace_id=w and connected_by_user_id=subject for update;
 if c.id is null then raise exception 'Forbidden' using errcode='42501';end if;
 if operation='save_grant' then
  select * into s from relay_private.integration_oauth_states where hashed_state=payload->>'hashed_state' and connection_id=c.id and user_id=subject and workspace_id=w and used_at is not null and expires_at>now() for update;
  if s.hashed_state is null or s.connection_revision<>c.credential_revision then raise exception 'Cancelled authorization' using errcode='42501';end if;
  if c.external_account_id<>'' and c.external_account_id<>payload->>'external_account_id' then
   delete from relay_private.integration_sync_state where connection_id=c.id;
   delete from relay_private.integration_external_objects where connection_id=c.id;
   delete from relay_private.integration_webhook_subscriptions where connection_id=c.id;
   update relay_private.jobs j set status='dead',completed_at=now(),lease=null,leased_until=null,last_error='integration_account_changed' where j.payload->>'connection_id'=c.id::text and j.status in ('queued','running');
   update relay_private.integration_commands set status='cancelled' where connection_id=c.id and status in ('approved','proposed');
  end if;
  update relay_private.integration_connections set external_account_id=payload->>'external_account_id',external_account_name=payload->>'external_account_name',email=payload->>'email',
   encrypted_credentials=payload->>'encrypted_credentials',credential_revision=credential_revision+1,granted_scopes=array(select jsonb_array_elements_text(payload->'scopes')),
   enabled_integrations=case when c.external_account_id<>'' and c.external_account_id<>payload->>'external_account_id' then s.requested_integrations else array(select distinct unnest(c.enabled_integrations||s.requested_integrations)) end,expires_at=(payload->>'expires_at')::timestamptz,
   connection_generation=case when c.external_account_id<>'' and c.external_account_id<>payload->>'external_account_id' then c.connection_generation+1 else c.connection_generation end,
   status='connected',refresh_lease=null,refresh_until=null,error_code=null,updated_at=now(),last_health_check_at=now() where id=c.id returning * into c;
  delete from relay_private.integration_oauth_states where hashed_state=s.hashed_state;
  insert into relay_private.integration_audit_logs(workspace_id,connection_id,actor_id,source,provider,action,result) values(w,c.id,subject,'user',c.provider,'integration.connected','success');
  return relay_private.integration_safe(c);
 elsif operation='load' then
  if c.status not in ('connected','syncing','degraded') then raise exception 'Connection unavailable' using errcode='42501';end if;
  return jsonb_build_object('connection',relay_private.integration_safe(c),'encrypted_credentials',c.encrypted_credentials,'revision',c.credential_revision,'generation',c.connection_generation);
 elsif operation='refresh_claim' then
  if c.status not in ('connected','syncing','degraded') or c.credential_revision<>(payload->>'revision')::integer or c.refresh_until>now() then return null;end if;
  token:=gen_random_uuid();update relay_private.integration_connections set refresh_lease=token,refresh_until=now()+interval '1 minute' where id=c.id;
  return to_jsonb(token);
 elsif operation='refresh_finish' then
  if c.refresh_lease is distinct from (payload->>'lease')::uuid or c.refresh_until<=now() or c.credential_revision<>(payload->>'revision')::integer or c.status not in ('connected','syncing','degraded') then raise exception 'Stale refresh' using errcode='40001';end if;
  update relay_private.integration_connections set encrypted_credentials=payload->>'encrypted_credentials',expires_at=(payload->>'expires_at')::timestamptz,
   granted_scopes=array(select jsonb_array_elements_text(payload->'scopes')),credential_revision=credential_revision+1,refresh_lease=null,refresh_until=null,status='connected',error_code=null,updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true);
 elsif operation='refresh_release' then
  update relay_private.integration_connections set refresh_lease=null,refresh_until=null where id=c.id and refresh_lease=(payload->>'lease')::uuid;
  return jsonb_build_object('ok',true);
 elsif operation='status' then
  if payload->>'status' not in ('connected','degraded','needs_reauth','error') or c.status in ('disconnected','revoked') or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Invalid status' using errcode='22023';end if;
  update relay_private.integration_connections set status=payload->>'status',error_code=payload->>'error_code',last_health_check_at=now(),updated_at=now() where id=c.id;
  return jsonb_build_object('ok',true);
 elsif operation='policy' then
  return coalesce((select to_jsonb(p) from relay_private.integration_agent_policies p where p.workspace_id=w and integration=payload->>'integration'),'{}');
 elsif operation='admit' then
  perform pg_advisory_xact_lock(hashtextextended('integration-rate:'||w::text,0));
  foreach token in array array[subject] loop
   insert into relay_private.integration_rate_buckets(workspace_id,bucket) values(w,c.provider||':'||token::text) on conflict do nothing;
   select b.* into bucket from relay_private.integration_rate_buckets b where b.workspace_id=w and b.bucket=c.provider||':'||token::text for update;
   if bucket.blocked_until>now() or (bucket.window_started_at>now()-interval '1 minute' and bucket.count>=60) then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from greatest(coalesce(bucket.blocked_until,now()),bucket.window_started_at+interval '1 minute')-now()))));end if;
   update relay_private.integration_rate_buckets b set count=case when b.window_started_at<=now()-interval '1 minute' then 1 else b.count+1 end,window_started_at=case when b.window_started_at<=now()-interval '1 minute' then now() else b.window_started_at end where b.workspace_id=w and b.bucket=c.provider||':'||token::text;
  end loop;
  insert into relay_private.integration_rate_buckets(workspace_id,bucket) values(w,c.provider) on conflict do nothing;
  select b.* into bucket from relay_private.integration_rate_buckets b where b.workspace_id=w and b.bucket=c.provider for update;
  if bucket.blocked_until>now() or (bucket.window_started_at>now()-interval '1 minute' and bucket.count>=300) then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from greatest(coalesce(bucket.blocked_until,now()),bucket.window_started_at+interval '1 minute')-now()))));end if;
  update relay_private.integration_rate_buckets b set count=case when b.window_started_at<=now()-interval '1 minute' then 1 else b.count+1 end,window_started_at=case when b.window_started_at<=now()-interval '1 minute' then now() else b.window_started_at end where b.workspace_id=w and b.bucket=c.provider;
  return jsonb_build_object('allowed',true);
 elsif operation='rate_block' then
  insert into relay_private.integration_rate_buckets(workspace_id,bucket,blocked_until) values(w,c.provider,now()+make_interval(secs=>least(3600,greatest(1,(payload->>'seconds')::integer))))
  on conflict on constraint integration_rate_buckets_pkey do update set blocked_until=excluded.blocked_until;
  return jsonb_build_object('ok',true);
 elsif operation='command_create' then
  if c.status<>'connected' or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Connection unavailable' using errcode='42501';end if;
  insert into relay_private.integration_commands(connection_id,workspace_id,user_id,source,connection_generation,action,integration,verb,request_hash,encrypted_input,risk,status,correlation_id)
  values(c.id,w,subject,payload->>'source',c.connection_generation,payload->>'action',payload->>'integration',payload->>'verb',payload->>'request_hash',payload->>'encrypted_input',(payload->>'risk')::integer,
   case when (payload->>'confirmation')::boolean then 'proposed' else 'approved' end,(payload->>'correlation_id')::uuid)
  on conflict(workspace_id,user_id,correlation_id) do nothing;
  select * into cmd from relay_private.integration_commands where workspace_id=w and user_id=subject and correlation_id=(payload->>'correlation_id')::uuid;
  if cmd.request_hash<>payload->>'request_hash' or cmd.connection_id<>c.id or cmd.action<>payload->>'action' or cmd.connection_generation<>c.connection_generation then raise exception 'Idempotency conflict' using errcode='40001';end if;
  return jsonb_build_object('id',cmd.id,'status',cmd.status,'encrypted_result',cmd.encrypted_result);
 elsif operation='command_claim' then
  select * into cmd from relay_private.integration_commands where id=(payload->>'command_id')::uuid and workspace_id=w and user_id=subject and connection_id=c.id for update;
  if c.status<>'connected' or cmd.status<>'approved' or cmd.expires_at<=now() or cmd.request_hash<>payload->>'request_hash' or cmd.connection_generation<>c.connection_generation or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Invalid dispatch' using errcode='42501';end if;
  if cmd.source<>'user' and not exists(select 1 from relay_private.integration_agent_policies p where p.workspace_id=w and p.integration=cmd.integration and (to_jsonb(p)->>('can_'||cmd.verb))::boolean) then raise exception 'Permission revoked' using errcode='42501';end if;
  token:=gen_random_uuid();update relay_private.integration_commands set status='dispatching',dispatch_lease=token where id=cmd.id;
  return jsonb_build_object('lease',token);
 elsif operation='command_load' then
  select * into cmd from relay_private.integration_commands where id=(payload->>'command_id')::uuid and workspace_id=w and user_id=subject and connection_id=c.id;
  if cmd.id is null then raise exception 'Forbidden' using errcode='42501';end if;
  return to_jsonb(cmd);
 elsif operation='command_finish' then
  update relay_private.integration_commands set status=payload->>'status',encrypted_result=payload->>'encrypted_result',error_code=payload->>'error_code',completed_at=now()
  where id=(payload->>'command_id')::uuid and workspace_id=w and user_id=subject and connection_id=c.id and status='dispatching' and dispatch_lease=(payload->>'lease')::uuid and payload->>'status' in ('succeeded','failed','unknown');
  if not found then raise exception 'Stale dispatch' using errcode='40001';end if;
  return jsonb_build_object('ok',true);
 elsif operation='audit' then
  insert into relay_private.integration_audit_logs(workspace_id,connection_id,actor_id,source,provider,action,result,error_code,latency_ms,provider_status,correlation_id)
  values(w,c.id,subject,payload->>'source',c.provider,payload->>'action',payload->>'result',payload->>'error_code',(payload->>'latency_ms')::integer,(payload->>'provider_status')::integer,(payload->>'correlation_id')::uuid);
  return jsonb_build_object('ok',true);
 elsif operation='disconnect_start' then
  if c.status='disconnected' then return jsonb_build_object('disconnected',true);end if;
  if c.status='revoked' then return jsonb_build_object('revocation_pending',true);end if;
  update relay_private.integration_connections set status='revoked',credential_revision=credential_revision+1,connection_generation=connection_generation+1,refresh_lease=null,refresh_until=null,updated_at=now() where id=c.id;
  delete from relay_private.integration_oauth_states where connection_id=c.id;
  update relay_private.integration_sync_state set enabled=false,status='idle' where connection_id=c.id;
  update relay_private.integration_commands set status='cancelled' where connection_id=c.id and status in ('approved','proposed');
  update relay_private.jobs j set status='dead',completed_at=now(),lease=null,leased_until=null,last_error='integration_disconnected' where j.payload->>'connection_id'=c.id::text and j.status in ('queued','running');
  job:=relay_private.put_job(w,subject,'integration_revoke',c.id::text||':'||(c.credential_revision+1)::text,jsonb_build_object('connection_id',c.id));
  return jsonb_build_object('job_id',job);
 elsif operation='revoke_load' then
  if c.status<>'revoked' then raise exception 'Invalid revocation' using errcode='42501';end if;
  return jsonb_build_object('connection',relay_private.integration_safe(c),'encrypted_credentials',c.encrypted_credentials,'subscriptions',coalesce((select jsonb_agg(encrypted_subscription) from relay_private.integration_webhook_subscriptions where connection_id=c.id),'[]'));
 elsif operation='disconnect_finish' then
  if c.status<>'revoked' then raise exception 'Invalid revocation' using errcode='42501';end if;
  delete from relay_private.integration_webhook_subscriptions where connection_id=c.id;
  delete from relay_private.integration_sync_state where connection_id=c.id;
  update relay_private.integration_webhook_events set encrypted_payload=null where connection_id=c.id;
  update relay_private.integration_external_objects set encrypted_metadata=null where connection_id=c.id;
  update relay_private.integration_connections set status='disconnected',encrypted_credentials=null,expires_at=null,granted_scopes='{}',enabled_integrations='{}',updated_at=now() where id=c.id;
  insert into relay_private.integration_audit_logs(workspace_id,connection_id,actor_id,source,provider,action,result) values(w,c.id,subject,'user',c.provider,'integration.disconnected','success');
  return jsonb_build_object('ok',true);
 elsif operation='webhook_enqueue' then
  if c.status not in ('connected','syncing','degraded') or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Disconnected webhook' using errcode='42501';end if;
  insert into relay_private.integration_webhook_events(connection_id,workspace_id,provider,provider_event_id,event_type,occurred_at,verified,encrypted_payload)
  values(c.id,w,c.provider,payload->>'event_id',payload->>'event_type',(payload->>'occurred_at')::timestamptz,true,payload->>'encrypted_payload')
  on conflict(connection_id,provider_event_id) do nothing returning id into event_id;
  if event_id is null then return jsonb_build_object('duplicate',true);end if;
  perform pg_advisory_xact_lock(hashtextextended('jobs:'||w::text,0));
  if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running'))>=200 then raise exception 'Queue capacity reached' using errcode='53300';end if;
  job:=relay_private.put_job(w,subject,'integration_webhook',event_id::text,jsonb_build_object('connection_id',c.id,'event_id',event_id,'generation',c.connection_generation));
  update relay_private.integration_webhook_events set job_id=job where id=event_id;
  return jsonb_build_object('job_id',job);
 elsif operation='webhook_load' then
  return (select to_jsonb(e) from relay_private.integration_webhook_events e where e.id=(payload->>'event_id')::uuid and e.connection_id=c.id and e.workspace_id=w and e.verified and e.processing_status not in ('processed','dead'));
 elsif operation='webhook_finish' then
  update relay_private.integration_webhook_events set processing_status='processed',encrypted_payload=null,attempts=attempts+1 where id=(payload->>'event_id')::uuid and connection_id=c.id and workspace_id=w;
  return jsonb_build_object('ok',true);
 elsif operation='subscription_save' then
  if c.status<>'connected' or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Changed account' using errcode='40001';end if;
  insert into relay_private.integration_webhook_subscriptions(id,connection_id,resource_type,encrypted_subscription,expires_at)
  values((payload->>'subscription_id')::uuid,c.id,payload->>'resource',payload->>'encrypted_subscription',(payload->>'expires_at')::timestamptz)
  on conflict(connection_id,resource_type) do update set id=excluded.id,encrypted_subscription=excluded.encrypted_subscription,expires_at=excluded.expires_at;
  return jsonb_build_object('ok',true);
 elsif operation='subscriptions' then
  return coalesce((select jsonb_agg(to_jsonb(ss)) from relay_private.integration_webhook_subscriptions ss where ss.connection_id=c.id),'[]');
 elsif operation='sync_get' then
  return coalesce((select to_jsonb(ss) from relay_private.integration_sync_state ss where ss.connection_id=c.id and ss.resource_type=payload->>'resource'),'{}');
 elsif operation='sync_configure' then
  if c.status<>'connected' or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Disconnected connection' using errcode='42501';end if;
  insert into relay_private.integration_sync_state(connection_id,resource_type,enabled,config) values(c.id,payload->>'resource',(payload->>'enabled')::boolean,coalesce(payload->'config','{}'))
  on conflict(connection_id,resource_type) do update set enabled=excluded.enabled,config=excluded.config;
  return jsonb_build_object('ok',true);
 elsif operation='sync_enqueue' then
  if c.status<>'connected' or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Disconnected connection' using errcode='42501';end if;
  if not exists(select 1 from relay_private.integration_sync_state where connection_id=c.id and resource_type=payload->>'resource' and enabled) then raise exception 'Resource not selected' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('jobs:'||w::text,0));
  select j.id into job from relay_private.jobs j where j.workspace_id=w and j.user_id=subject and j.type='integration_sync' and j.status='queued' and j.payload->>'connection_id'=c.id::text and j.payload->>'resource'=payload->>'resource' and j.payload->>'generation'=c.connection_generation::text limit 1;
  if job is not null then return jsonb_build_object('job_id',job);end if;
  if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running'))>=200 then raise exception 'Queue capacity reached' using errcode='53300';end if;
  job:=relay_private.put_job(w,subject,'integration_sync',gen_random_uuid()::text,jsonb_build_object('connection_id',c.id,'resource',payload->>'resource','generation',c.connection_generation));
  return jsonb_build_object('job_id',job);
 elsif operation='sync_commit' then
  if c.status not in ('connected','syncing','degraded') or c.connection_generation is distinct from (payload->>'generation')::integer then raise exception 'Changed account' using errcode='40001';end if;
  perform 1 from relay_private.jobs j where j.id=(payload->>'job_id')::uuid and j.workspace_id=w and j.user_id=subject and j.type='integration_sync' and j.status='running' and j.lease=(payload->>'job_lease')::uuid and j.leased_until>now() and j.payload->>'connection_id'=c.id::text for update;
  if not found then raise exception 'Stale worker lease' using errcode='40001';end if;
  if jsonb_typeof(payload->'objects') is distinct from 'array' or jsonb_array_length(payload->'objects')>1000 then raise exception 'Invalid page' using errcode='22023';end if;
  update relay_private.integration_sync_state set encrypted_cursor=payload->>'encrypted_cursor',cursor_revision=cursor_revision+1,last_sync_at=now(),next_sync_at=now()+interval '15 minutes',status='idle'
  where connection_id=c.id and resource_type=payload->>'resource' and enabled and cursor_revision=(payload->>'revision')::integer;
  if not found then raise exception 'Stale cursor' using errcode='40001';end if;
  for item in select jsonb_array_elements(payload->'objects') loop
   insert into relay_private.integration_external_objects(connection_id,workspace_id,provider,resource_type,external_id,encrypted_metadata,deleted_at,remote_updated_at)
   values(c.id,w,c.provider,payload->>'resource',item->>'external_id',item->>'encrypted_metadata',case when (item->>'deleted')::boolean then now() end,(item->>'remote_updated_at')::timestamptz)
   on conflict(connection_id,resource_type,external_id) do update set encrypted_metadata=excluded.encrypted_metadata,deleted_at=excluded.deleted_at,remote_updated_at=excluded.remote_updated_at,updated_at=now()
   where integration_external_objects.remote_updated_at is null or excluded.remote_updated_at is null or excluded.remote_updated_at>=integration_external_objects.remote_updated_at;
  end loop;
  update relay_private.integration_connections set last_sync_at=now() where id=c.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unsupported operation' using errcode='22023';
end $$;
revoke all on function public.integration_runtime(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_runtime(uuid,uuid,text,jsonb) to service_role;

-- Webhook routing derives tenancy from registered subscriptions. It never takes
-- a browser/provider-supplied workspace ID as authorization.
create function public.integration_webhook_context(subscription_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('connection',relay_private.integration_safe(c),'generation',c.connection_generation,'encrypted_credentials',c.encrypted_credentials,'encrypted_subscription',s.encrypted_subscription)
 from relay_private.integration_webhook_subscriptions s join relay_private.integration_connections c on c.id=s.connection_id
 join public.memberships m on m.workspace_id=c.workspace_id and m.user_id=c.connected_by_user_id
 where s.id=subscription_id and c.status in ('connected','syncing','degraded') and m.role in ('owner','admin','member') and (s.expires_at is null or s.expires_at>now())
$$;
revoke all on function public.integration_webhook_context(uuid) from public,anon,authenticated;
grant execute on function public.integration_webhook_context(uuid) to service_role;

create function public.integration_metrics() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('successful_actions',(select count(*) from relay_private.integration_audit_logs where result='success' and created_at>now()-interval '1 hour'),
 'failed_actions',(select count(*) from relay_private.integration_audit_logs where result='failure' and created_at>now()-interval '1 hour'),
 'needs_reauth',(select count(*) from relay_private.integration_connections where status='needs_reauth'),
 'webhook_failures',(select count(*) from relay_private.integration_webhook_events where processing_status in ('failed','dead') and received_at>now()-interval '1 hour'),
 'queue_depth',(select count(*) from relay_private.jobs where type like 'integration_%' and status='queued'),
 'dead_letter_depth',(select count(*) from relay_private.jobs where type like 'integration_%' and status='dead'),
 'p95_action_latency_ms',(select percentile_cont(0.95) within group(order by latency_ms) from relay_private.integration_audit_logs where created_at>now()-interval '1 hour'))
$$;
revoke all on function public.integration_metrics() from public,anon,authenticated;
grant execute on function public.integration_metrics() to service_role;

-- Extend the existing leased queue without changing workflow/agent dispatch.
alter table relay_private.jobs drop constraint jobs_type_check;
alter table relay_private.jobs add constraint jobs_type_check check(type in ('email_sync','calendar_sync','sequence_send','workflow_run','notifications','imports','integration_sync','integration_webhook','integration_delivery','integration_revoke'));
do $$declare original text;patched text;signature regprocedure;begin
 foreach signature in array array['relay_private.job_worker_without_workflows(text,jsonb)'::regprocedure,'relay_private.schedule_jobs(text[])'::regprocedure] loop
  original:=pg_get_functiondef(signature);
  if strpos(original,'''workflow_run'',''notifications'',''imports'']')=0 then raise exception 'Unexpected queue definition';end if;
  patched:=replace(original,'''workflow_run'',''notifications'',''imports'']','''workflow_run'',''notifications'',''imports'',''integration_sync'',''integration_webhook'',''integration_delivery'',''integration_revoke'']');
  execute patched;
 end loop;
end $$;

create function relay_private.integration_maintenance() returns void language plpgsql security definer set search_path='' as $$declare c relay_private.integration_connections;begin
 delete from relay_private.integration_oauth_states where expires_at<now();
 update relay_private.integration_commands set status='unknown',error_code='dispatch_uncertain',completed_at=now() where status='dispatching' and expires_at<now();
 update relay_private.integration_commands set status='cancelled' where status in ('proposed','approved') and expires_at<now();
 update relay_private.integration_webhook_events e set processing_status='dead',encrypted_payload=null from relay_private.jobs j where e.job_id=j.id and j.status='dead' and e.processing_status not in ('processed','dead');
 delete from relay_private.integration_webhook_events where received_at<now()-interval '30 days';
 delete from relay_private.integration_commands where completed_at<now()-interval '30 days' or (status='cancelled' and expires_at<now()-interval '30 days');
 delete from relay_private.integration_rate_buckets where window_started_at<now()-interval '1 day' and (blocked_until is null or blocked_until<now());
 -- A removed or downgraded member can no longer use the vault, including via jobs.
 -- Retain encrypted credentials only for the remote revocation worker.
 for c in select ic.* from relay_private.integration_connections ic where ic.status not in ('revoked','disconnected') and not exists(select 1 from public.memberships m where m.workspace_id=ic.workspace_id and m.user_id=ic.connected_by_user_id and m.role in ('owner','admin','member')) order by ic.id limit 100 for update skip locked loop
  update relay_private.integration_connections set status='revoked',credential_revision=credential_revision+1,connection_generation=connection_generation+1,refresh_lease=null,refresh_until=null,updated_at=now() where id=c.id;
  delete from relay_private.integration_oauth_states where connection_id=c.id;
  update relay_private.integration_sync_state set enabled=false,status='idle' where connection_id=c.id;
  update relay_private.integration_commands set status='cancelled' where connection_id=c.id and status in ('approved','proposed');
  update relay_private.jobs j set status='dead',completed_at=now(),lease=null,leased_until=null,last_error='integration_membership_removed' where j.payload->>'connection_id'=c.id::text and j.status in ('queued','running');
  perform relay_private.put_job(c.workspace_id,c.connected_by_user_id,'integration_revoke',c.id::text||':'||(c.credential_revision+1)::text,jsonb_build_object('connection_id',c.id));
 end loop;
end $$;
revoke all on function relay_private.integration_maintenance() from public,anon,authenticated,service_role;
create or replace function public.relay_job_worker(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation='schedule' then perform relay_private.agent_maintenance();perform relay_private.integration_maintenance();end if;
 return relay_private.workflow_job_dispatch(operation,payload);
end $$;
revoke all on function public.relay_job_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.relay_job_worker(text,jsonb) to service_role;
commit;
