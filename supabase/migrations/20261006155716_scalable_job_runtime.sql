begin;

-- Payloads and leases never enter the client-facing Data API.
create table relay_private.jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 type text not null check(type in ('email_sync','calendar_sync','sequence_send','workflow_run','notifications','imports')),
 dedupe_key text not null check(length(dedupe_key) between 1 and 300),
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=4000000),
 status text not null default 'queued' check(status in ('queued','running','completed','dead')),
 attempts integer not null default 0 check(attempts>=0),
 max_attempts integer not null default 5 check(max_attempts between 1 and 10),
 run_at timestamptz not null default now(), lease uuid, leased_until timestamptz, worker_id text,
 result jsonb,last_error text,created_at timestamptz not null default now(),completed_at timestamptz,
 unique(workspace_id,type,dedupe_key),
 check((status='running')=(lease is not null and leased_until is not null))
);
create index jobs_due_idx on relay_private.jobs(type,run_at,created_at) where status='queued';
create index jobs_expired_idx on relay_private.jobs(leased_until) where status='running';
create index jobs_workspace_idx on relay_private.jobs(workspace_id,user_id,created_at desc);
create index jobs_active_connector_idx on relay_private.jobs((payload->>'integration_id')) where status in ('queued','running') and type in ('email_sync','calendar_sync');
create index jobs_retention_idx on relay_private.jobs(completed_at) where status in ('completed','dead');
create table relay_private.job_events (
 id bigint generated always as identity primary key,
 job_id uuid not null references relay_private.jobs(id) on delete cascade,
 event text not null, attempt integer not null,worker_id text,created_at timestamptz not null default now()
);
create index job_events_job_idx on relay_private.job_events(job_id,created_at);
create table relay_private.worker_heartbeats (
 worker_id text primary key check(length(worker_id) between 1 and 150),
 types text[] not null,heartbeat_at timestamptz not null default now(),stopping boolean not null default false
);
create index worker_heartbeats_time_idx on relay_private.worker_heartbeats(heartbeat_at);
alter table relay_private.jobs enable row level security;
alter table relay_private.job_events enable row level security;
alter table relay_private.worker_heartbeats enable row level security;
revoke all on relay_private.jobs,relay_private.job_events,relay_private.worker_heartbeats from public,anon,authenticated;

create function relay_private.put_job(w uuid,subject uuid,kind text,key text,body jsonb,due timestamptz default now())
returns uuid language plpgsql security invoker set search_path='' as $$
declare j uuid;
begin
 insert into relay_private.jobs(workspace_id,user_id,type,dedupe_key,payload,run_at)
 values(w,subject,kind,key,body,due) on conflict(workspace_id,type,dedupe_key) do nothing returning id into j;
 if j is null then select id into j from relay_private.jobs where workspace_id=w and type=kind and dedupe_key=key;end if;
 return j;
end $$;
revoke all on function relay_private.put_job(uuid,uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;

create function relay_private.enqueue_job(w uuid,kind text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare j uuid;key text;r public.workflow_runs;obj uuid;i public.integrations;s relay_private.connector_sync_state;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>4000000 then
  raise exception 'Invalid job payload' using errcode='22023';
 end if;
 -- Serialize admission per workspace so concurrent requests cannot bypass the cap.
 perform pg_advisory_xact_lock(hashtextextended('jobs:'||w::text,0));
 if kind in ('email_sync','calendar_sync') then
  select * into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=payload->>'provider' and status='connected';
  if i.id is null or (kind='email_sync') is distinct from (i.provider in ('gmail','outlook')) then raise exception 'Forbidden' using errcode='42501';end if;
  select queued_jobs.id into j from relay_private.jobs queued_jobs where queued_jobs.status in ('queued','running') and queued_jobs.type=kind and queued_jobs.payload->>'integration_id'=i.id::text;
  if j is not null then return (select jsonb_build_object('id',id,'status',status) from relay_private.jobs where id=j);end if;
  insert into relay_private.connector_sync_state(integration_id) values(i.id) on conflict do nothing;
  select * into s from relay_private.connector_sync_state where integration_id=i.id;
  key:=i.id::text||':'||s.next_at::text||':'||md5(s.cursor::text);
  payload:=jsonb_build_object('provider',i.provider,'integration_id',i.id);
 elsif kind='workflow_run' then
  select * into r from public.workflow_runs where workspace_id=w and id=(payload->>'preview_id')::uuid;
  if r.id is null or r.created_by<>auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
  key:=r.id::text;payload:=jsonb_build_object('preview_id',r.id);
 elsif kind='imports' then
  obj:=(payload->>'object_id')::uuid;
  if not exists(select 1 from public.objects where workspace_id=w and id=obj)
   or coalesce(payload->>'digest','')!~'^[a-f0-9]{64}$'
   or coalesce(jsonb_typeof(payload->'rows_data'),'')<>'array'
   or jsonb_array_length(payload->'rows_data') not between 1 and 1000
   or coalesce(jsonb_typeof(payload->'error_rows'),'')<>'array'
   or jsonb_array_length(payload->'error_rows')>1000
   or coalesce(payload->>'duplicate_policy','') not in ('skip','create') then
   raise exception 'Invalid import' using errcode='22023';
  end if;
  key:=auth.uid()::text||':'||obj::text||':'||(payload->>'digest');
 else raise exception 'Unsupported job type' using errcode='22023';end if;
 select id into j from relay_private.jobs where workspace_id=w and type=kind and dedupe_key=key;
 if j is null then
  if kind='workflow_run' and (r.mode<>'simulation' or r.executed_at is not null or r.created_at<now()-interval '15 minutes') then
   raise exception 'Preview expired' using errcode='40001';
  end if;
  if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running'))>=200 then
   raise exception 'Queue capacity reached' using errcode='53300';
  end if;
  j:=relay_private.put_job(w,auth.uid(),kind,key,payload);
 end if;
 return (select jsonb_build_object('id',id,'status',status) from relay_private.jobs where id=j);
end $$;
create function public.enqueue_relay_job(w uuid,kind text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select relay_private.enqueue_job(w,kind,payload)$$;
revoke all on function relay_private.enqueue_job(uuid,text,jsonb),public.enqueue_relay_job(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.enqueue_job(uuid,text,jsonb),public.enqueue_relay_job(uuid,text,jsonb) to authenticated;

create function relay_private.job_status(w uuid,job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j relay_private.jobs;
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into j from relay_private.jobs where id=job_id and workspace_id=w;
 if j.id is null or (j.user_id is distinct from auth.uid() and not relay_private.has_role(w,array['owner','admin'])) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('id',j.id,'type',j.type,'status',j.status,'attempts',j.attempts,
  'run_at',j.run_at,'result',j.result,'error',case when j.status='dead' then 'Le traitement a échoué. Vérifiez les données et les autorisations.' end);
end $$;
create function public.relay_job_status(w uuid,job_id uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.job_status(w,job_id)$$;
revoke all on function relay_private.job_status(uuid,uuid),public.relay_job_status(uuid,uuid) from public,anon,authenticated;
grant execute on function relay_private.job_status(uuid,uuid),public.relay_job_status(uuid,uuid) to authenticated;

-- These privileged operations are executable only by the server's service role.
create function public.relay_job_worker(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare j relay_private.jobs;candidate record;types text[];identity text;token uuid;output jsonb;key text;
begin
 if operation='heartbeat' then
  identity:=payload->>'worker_id';types:=array(select jsonb_array_elements_text(payload->'types'));
  if identity is null or not types<@array['email_sync','calendar_sync','sequence_send','workflow_run','notifications','imports'] then
   raise exception 'Invalid worker' using errcode='22023';
  end if;
  insert into relay_private.worker_heartbeats(worker_id,types,stopping) values(identity,types,coalesce((payload->>'stopping')::boolean,false))
  on conflict(worker_id) do update set types=excluded.types,heartbeat_at=now(),stopping=excluded.stopping;
  return jsonb_build_object('ok',true);
 elsif operation='ready' then
  return to_jsonb(exists(select 1 from relay_private.worker_heartbeats h where not h.stopping and h.heartbeat_at>now()-interval '90 seconds' and payload->>'type'=any(h.types)));
 elsif operation='metrics' then
  return jsonb_build_object('queued',(select count(*) from relay_private.jobs where status='queued'),
   'running',(select count(*) from relay_private.jobs where status='running'),
   'dead',(select count(*) from relay_private.jobs where status='dead'),
   'oldest_due_seconds',(select coalesce(greatest(0,extract(epoch from now()-min(run_at))),0) from relay_private.jobs where status='queued'),
   'workers',(select count(*) from relay_private.worker_heartbeats where not stopping and heartbeat_at>now()-interval '90 seconds'));
 elsif operation='schedule' then
  types:=array(select jsonb_array_elements_text(payload->'types'));
  -- Scheduler replicas can insert the same candidates safely: dedupe is enforced in Postgres.
  if types && array['email_sync','calendar_sync'] then
   for candidate in select i.id,i.workspace_id,i.user_id,i.provider,s.next_at,s.cursor
    from relay_private.connector_sync_state s join public.integrations i on i.id=s.integration_id
    join public.memberships m on m.workspace_id=i.workspace_id and m.user_id=i.user_id
    where s.auto_sync and s.next_at<=now() and (s.leased_until is null or s.leased_until<=now())
    and i.status='connected' and m.role in ('owner','admin','member')
    and not exists(select 1 from relay_private.jobs j where j.payload->>'integration_id'=i.id::text and j.type in ('email_sync','calendar_sync') and j.status in ('queued','running'))
    and not exists(select 1 from relay_private.jobs j where j.workspace_id=i.workspace_id and j.type=case when i.provider in ('gmail','outlook') then 'email_sync' else 'calendar_sync' end and j.dedupe_key=i.id::text||':'||s.next_at::text||':'||md5(s.cursor::text))
    order by s.next_at limit 100
   loop
    key:=case when candidate.provider in ('gmail','outlook') then 'email_sync' else 'calendar_sync' end;
    if key=any(types) then
     perform relay_private.put_job(candidate.workspace_id,candidate.user_id,key,
      candidate.id::text||':'||candidate.next_at::text||':'||md5(candidate.cursor::text),
      jsonb_build_object('provider',candidate.provider,'integration_id',candidate.id));
    end if;
   end loop;
  end if;
  if 'sequence_send'=any(types) then
   for candidate in select e.id,e.workspace_id,e.user_id,e.step,e.next_at from public.enrollments e join public.sequences s on s.id=e.sequence_id
    where e.status='active' and e.next_at<=now() and s.enabled
    and not exists(select 1 from relay_private.jobs j where j.workspace_id=e.workspace_id and j.type='sequence_send' and j.dedupe_key=e.id::text||':'||e.step)
    order by e.next_at limit 100
   loop
    perform relay_private.put_job(candidate.workspace_id,candidate.user_id,'sequence_send',candidate.id::text||':'||candidate.step,
     jsonb_build_object('enrollment_id',candidate.id),candidate.next_at);
   end loop;
  end if;
  if 'notifications'=any(types) then
   for candidate in select distinct workspace_id from (
    select workspace_id from public.tasks where due_date<=now()+interval '24 hours' and status not in ('done','cancelled') and owner_id is not null
    union select workspace_id from public.commitments where due_date<=now()+interval '24 hours' and status not in ('done','cancelled','postponed') and owner_id is not null
   )t where not exists(select 1 from relay_private.jobs j where j.workspace_id=t.workspace_id and j.type='notifications' and j.dedupe_key=floor(extract(epoch from now())/300)::text) limit 100 loop
    perform relay_private.put_job(candidate.workspace_id,null,'notifications',floor(extract(epoch from now())/300)::text,'{}');
   end loop;
  end if;
  -- Retain opaque audit metadata for 30 days, erase CRM payloads immediately on completion.
  update relay_private.jobs retained set payload='{}',result=null where status='dead' and completed_at<now()-interval '7 days' and retained.payload<>'{}';
  delete from relay_private.jobs where id in (select id from relay_private.jobs where completed_at<now()-interval '30 days' order by completed_at limit 500);
  delete from relay_private.worker_heartbeats where heartbeat_at<now()-interval '1 day';
  return jsonb_build_object('ok',true);
 elsif operation='claim' then
  identity:=payload->>'worker_id';types:=array(select jsonb_array_elements_text(payload->'types'));
  -- Reclaim a killed worker's job only after its lease expires. Old tokens are fenced out.
  with expired as (
   select id from relay_private.jobs where status='running' and leased_until<=now() order by leased_until for update skip locked limit 100
  ), recovered as (
   update relay_private.jobs x set status=case when attempts>=max_attempts then 'dead' else 'queued' end,
    run_at=now()+interval '30 seconds',lease=null,leased_until=null,worker_id=null,last_error='lease_expired',
    completed_at=case when attempts>=max_attempts then now() end from expired where x.id=expired.id returning x.id,x.attempts
  ) insert into relay_private.job_events(job_id,event,attempt) select id,'lease_expired',attempts from recovered;
  select * into j from relay_private.jobs where status='queued' and run_at<=now() and type=any(types)
   order by run_at,created_at for update skip locked limit 1;
  if not found then return null;end if;
  token:=gen_random_uuid();
  update relay_private.jobs set status='running',attempts=attempts+1,lease=token,leased_until=now()+interval '3 minutes',worker_id=identity where id=j.id returning * into j;
  insert into relay_private.job_events(job_id,event,attempt,worker_id) values(j.id,'claimed',j.attempts,identity);
  return jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'user_id',j.user_id,'type',j.type,'payload',j.payload,'lease',token,'attempts',j.attempts,'max_attempts',j.max_attempts);
 end if;
 select * into j from relay_private.jobs where id=(payload->>'id')::uuid for update;
 if j.id is null or j.status<>'running' or j.lease is distinct from (payload->>'lease')::uuid or j.leased_until<=now() then
  raise exception 'Invalid job lease' using errcode='40001';
 end if;
 if operation='renew' then
  update relay_private.jobs set leased_until=now()+interval '3 minutes' where id=j.id;
  return jsonb_build_object('ok',true);
 elsif operation='execute' then
  if j.type in ('imports','workflow_run') then
   if j.user_id is null or not exists(select 1 from public.memberships where workspace_id=j.workspace_id and user_id=j.user_id and role in ('owner','admin','member')) then
    raise exception 'Forbidden' using errcode='42501';
   end if;
   perform set_config('request.jwt.claim.sub',j.user_id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',j.user_id,'role','authenticated')::text,true);
   if j.type='imports' then
    output:=public.import_crm_records(j.workspace_id,(j.payload->>'object_id')::uuid,j.payload->'rows_data',j.payload->>'digest',j.payload->>'filename',j.payload->'mapping',j.payload->>'duplicate_policy',j.payload->'error_rows');
   else
    if not exists(select 1 from public.workflow_runs where id=(j.payload->>'preview_id')::uuid and workspace_id=j.workspace_id and created_by=j.user_id) then raise exception 'Forbidden' using errcode='42501';end if;
    output:=relay_private.execute_preview((j.payload->>'preview_id')::uuid);
   end if;
  elsif j.type='notifications' then
   insert into public.notifications(workspace_id,user_id,entity,entity_id,kind,title,due_date,dedup_key)
   select r.workspace_id,r.owner_id,r.entity,r.id,'due',r.title,r.due_date,r.entity||':'||r.id||':due:'||r.due_date::text
   from (
    select workspace_id,owner_id,id,title,due_date,'tasks'::text entity from public.tasks where workspace_id=j.workspace_id and status not in ('done','cancelled') and due_date<=now()+interval '24 hours' and owner_id is not null
    union all select workspace_id,owner_id,id,title,due_date,'commitments' from public.commitments where workspace_id=j.workspace_id and status not in ('done','cancelled','postponed') and due_date<=now()+interval '24 hours' and owner_id is not null
   )r join public.memberships m on m.workspace_id=r.workspace_id and m.user_id=r.owner_id on conflict do nothing;
   output:=jsonb_build_object('ok',true);
  else raise exception 'Unsupported database job' using errcode='22023';end if;
  -- Effects and completion commit together. A process crash cannot duplicate them.
  update relay_private.jobs set status='completed',completed_at=now(),result=output,payload='{}',lease=null,leased_until=null where id=j.id;
  insert into relay_private.job_events(job_id,event,attempt,worker_id) values(j.id,'completed',j.attempts,j.worker_id);
  return output;
 elsif operation='complete' then
  update relay_private.jobs set status='completed',completed_at=now(),result=coalesce(payload->'result','{}'),payload='{}',lease=null,leased_until=null where id=j.id;
 elsif operation='defer' then
  update relay_private.jobs set status='queued',run_at=greatest(now()+interval '1 second',(payload->>'run_at')::timestamptz),attempts=greatest(0,attempts-1),lease=null,leased_until=null where id=j.id;
 elsif operation='fail' then
  update relay_private.jobs set status=case when coalesce((payload->>'permanent')::boolean,false) or attempts>=max_attempts then 'dead' else 'queued' end,
   completed_at=case when coalesce((payload->>'permanent')::boolean,false) or attempts>=max_attempts then now() end,
   run_at=now()+make_interval(secs=>greatest(1,least(3600,coalesce((payload->>'retry_seconds')::integer,30)))),
   last_error=case when payload->>'code'~'^[a-zA-Z0-9_.-]{1,80}$' then payload->>'code' else 'job_failed' end,
   lease=null,leased_until=null where id=j.id;
 else raise exception 'Unknown job operation' using errcode='22023';end if;
 insert into relay_private.job_events(job_id,event,attempt,worker_id) values(j.id,operation,j.attempts,j.worker_id);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.relay_job_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.relay_job_worker(text,jsonb) to service_role;
create or replace function public.sequence_job(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.enrollments;s relay_private.enrollment_state;d public.sequence_deliveries;l relay_private.delivery_leases;i public.integrations;r public.records;token uuid;
begin
 if operation='claim' then
  -- A send left in flight cannot be retried blindly.
  update public.enrollments x set status='failed',last_error='Envoi incertain : vérifiez la boîte d’envoi avant toute nouvelle action.',next_at=null
  from public.sequence_deliveries a join relay_private.delivery_leases z on z.delivery_id=a.id
  where a.enrollment_id=x.id and a.status='sending' and z.leased_until<now() and x.status in ('active','paused');
  update public.sequence_deliveries a set status='uncertain' from relay_private.delivery_leases z where z.delivery_id=a.id and a.status='sending' and z.leased_until<now();
  select x.* into e from public.enrollments x join public.sequences q on q.id=x.sequence_id
  where x.status='active' and x.next_at<=now() and q.enabled and (payload->>'enrollment_id' is null or x.id=(payload->>'enrollment_id')::uuid)
  and not exists(select 1 from public.sequence_deliveries a join relay_private.delivery_leases z on z.delivery_id=a.id where a.enrollment_id=x.id and a.step=x.step and (a.status in ('sending','sent','uncertain','stopped') or z.leased_until>now()))
  order by x.next_at for update of x skip locked limit 1;
  if not found then return null;end if;
  select * into s from relay_private.enrollment_state where enrollment_id=e.id;
  select * into i from public.integrations where id=s.integration_id;
  select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id;
  if s.enrollment_id is null or i.status is distinct from 'connected' or i.user_id is distinct from e.user_id or not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.user_id and role in ('owner','admin','member')) or r.archived or lower(r.email) is distinct from s.target_email then
   update public.enrollments set status='failed',last_error='La fiche ou le compte d’envoi a changé. Réinscription nécessaire.',next_at=null where id=e.id;return null;
  end if;
  if exists(select 1 from public.suppressions where workspace_id=e.workspace_id and lower(email)=s.target_email) then update public.enrollments set status='unsubscribed',next_at=null where id=e.id;return null;end if;
  token:=gen_random_uuid();
  insert into public.sequence_deliveries(workspace_id,enrollment_id,step,status) values(e.workspace_id,e.id,e.step,'preparing') on conflict(enrollment_id,step) do update set status='preparing' returning * into d;
  insert into relay_private.delivery_leases(delivery_id,lease,leased_until) values(d.id,token,now()+interval '2 minutes') on conflict(delivery_id) do update set lease=excluded.lease,leased_until=excluded.leased_until;
  return jsonb_build_object('id',e.id,'workspace_id',e.workspace_id,'user_id',e.user_id,'provider',i.provider,'email',s.target_email,'sender',i.email,'record',to_jsonb(r),'step',e.step,'steps',s.steps,'timezone',s.timezone,'unsubscribe_cipher',s.unsubscribe_cipher,'since',coalesce(s.first_sent_at,e.created_at),'delivery_id',d.id,'lease',token);
 end if;
 select * into d from public.sequence_deliveries where id=(payload->>'delivery_id')::uuid for update;
 select * into l from relay_private.delivery_leases where delivery_id=d.id for update;
 if d.id is null or l.lease is null or l.lease is distinct from (payload->>'lease')::uuid or l.leased_until<now() then raise exception 'Invalid lease' using errcode='40001';end if;
 select * into e from public.enrollments where id=d.enrollment_id for update;
 select * into s from relay_private.enrollment_state where enrollment_id=e.id;
 if operation='defer' and d.status='preparing' then
  update public.enrollments set next_at=(payload->>'next_at')::timestamptz where id=e.id;
  update relay_private.delivery_leases set leased_until=now() where delivery_id=d.id;return jsonb_build_object('ok',true);
 elsif operation='reply' and d.status='preparing' then
  update public.enrollments set status='replied',next_at=null where id=e.id;
  update public.sequence_deliveries set status='stopped' where id=d.id;return jsonb_build_object('ok',true);
 elsif operation='prepare' and d.status='preparing' then
  select * into i from public.integrations where id=s.integration_id;
  select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id;
  if e.status<>'active' or not exists(select 1 from public.sequences where id=e.sequence_id and enabled) or r.archived or lower(r.email) is distinct from s.target_email or i.status<>'connected' or not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.user_id and role in ('owner','admin','member')) or exists(select 1 from public.suppressions where workspace_id=e.workspace_id and lower(email)=s.target_email) then
   update public.sequence_deliveries set status='preparing' where id=d.id;update relay_private.delivery_leases set leased_until=now() where delivery_id=d.id;return jsonb_build_object('ok',false);
  end if;
  update public.sequence_deliveries set status='sending' where id=d.id;
  return jsonb_build_object('ok',true);
 elsif operation='complete' and d.status='sending' then
  update public.sequence_deliveries set status='sent',provider_id=left(payload->>'provider_id',1000),sent_at=now() where id=d.id;
  update relay_private.enrollment_state set first_sent_at=coalesce(first_sent_at,now()) where enrollment_id=e.id;
  update public.enrollments set step=e.step+1,status=case when e.step+1>=jsonb_array_length(s.steps) then 'completed' else e.status end,next_at=case when e.step+1>=jsonb_array_length(s.steps) then null else (payload->>'next_at')::timestamptz end,last_error=null where id=e.id;
  return jsonb_build_object('ok',true);
 elsif operation='retry' and d.status='preparing' then
  update relay_private.delivery_leases set leased_until=now() where delivery_id=d.id;return jsonb_build_object('ok',true);
 elsif operation='fail' then
  update public.sequence_deliveries set status=case when d.status='sending' then 'uncertain' else 'stopped' end where id=d.id;
  update public.enrollments set status='failed',last_error=left(payload->>'error',500),next_at=null where id=e.id;
  return jsonb_build_object('ok',true);
 else raise exception 'Invalid operation' using errcode='22023';end if;
end $$;
commit;
