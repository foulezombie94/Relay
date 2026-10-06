begin;
set local lock_timeout='5s';

-- Version matches the applied Supabase migration history.
-- A document alias must never confer authority over another tenant's object.
alter table public.documents add constraint documents_owned_path
 check(split_part(path,'/',1)=workspace_id::text and path !~ '(^|/)\.\.(/|$)');
drop policy relay_storage_read on storage.objects;
create policy relay_storage_read on storage.objects for select to authenticated using(
 bucket_id='relay-documents' and exists(select 1 from public.documents d
 where d.path=name and split_part(name,'/',1)=d.workspace_id::text
 and (relay_private.has_role(d.workspace_id) or exists(select 1 from public.portal_items i
 where i.document_id=d.id and relay_private.portal_access(i.portal_id)))));

-- History is proof of execution, never caller-supplied input.
revoke insert,update,delete on public.import_jobs from public,anon,authenticated;
drop policy imports_insert on public.import_jobs;
alter table public.import_jobs add constraint import_metadata_budget
 check(jsonb_typeof(mapping)='object' and octet_length(mapping::text)<=65536
 and jsonb_typeof(errors)='array' and jsonb_array_length(errors)<=1000
 and octet_length(errors::text)<=1048576);
create index imports_admission_idx on public.import_jobs(workspace_id,created_by,created_at desc);
alter function public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) set schema relay_private;
alter function relay_private.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) rename to import_records_v1;
revoke all on function relay_private.import_records_v1(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
create function public.import_crm_records(w uuid,obj uuid,rows_data jsonb,file_digest text,file_name text,column_mapping jsonb,duplicate_policy text,error_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare output jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if rows_data is null or jsonb_typeof(rows_data)<>'array' or jsonb_array_length(rows_data) not between 1 and 1000
 or error_rows is null or jsonb_typeof(error_rows)<>'array' or jsonb_array_length(error_rows)>1000
 or column_mapping is null or jsonb_typeof(column_mapping)<>'object' or octet_length(column_mapping::text)>65536
 or octet_length(error_rows::text)>1048576 or octet_length(rows_data::text)+octet_length(column_mapping::text)+octet_length(error_rows::text)>4000000
 or coalesce(file_digest,'')!~'^[a-f0-9]{64}$' or coalesce(length(file_name),0) not between 1 and 255
 or coalesce(duplicate_policy,'') not in ('skip','create')
 or exists(select 1 from jsonb_array_elements(rows_data) r where jsonb_typeof(r)<>'object') then
  raise exception 'Invalid import' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('import-admission:'||w::text||auth.uid()::text,0));
 if not exists(select 1 from public.import_jobs where workspace_id=w and object_id=obj and digest=file_digest)
 and (select count(*) from public.import_jobs where workspace_id=w and created_by=auth.uid() and created_at>now()-interval '1 minute')>=30 then
  raise exception 'Import admission limit reached' using errcode='53300';
 end if;
 output:=relay_private.import_records_v1(w,obj,rows_data,file_digest,file_name,column_mapping,duplicate_policy,error_rows);
 return jsonb_build_object('id',output->'id','inserted',output->'inserted','skipped',output->'skipped','errors',output->'errors','replayed',output->'replayed');
end $$;
revoke all on function public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) from public,anon;
grant execute on function public.import_crm_records(uuid,uuid,jsonb,text,text,jsonb,text,jsonb) to authenticated,service_role;

-- Audit access follows the source ACL; retain sales fields needed by forecasts.
revoke insert,update,delete on public.audit_events from public,anon,authenticated;
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(
 relay_private.has_role(workspace_id) and (private_to is null or private_to=(select auth.uid()))
 and (entity<>'portal_members' or relay_private.has_role(workspace_id,array['owner','admin'])));
create or replace function relay_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;a jsonb;w uuid;who uuid;
begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old)-array['search','search_index'] end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new)-array['search','search_index'] end;
 if tg_op='UPDATE' and (b-array['updated_at','version'])=(a-array['updated_at','version']) then return new;end if;
 w:=coalesce((a->>'workspace_id')::uuid,(b->>'workspace_id')::uuid);who:=(select auth.uid());
 if who is not null and not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data,private_to)
 values(w,who,tg_table_name,coalesce((a->>'id')::uuid,(b->>'id')::uuid),lower(tg_op),b,a,
 case when tg_table_name='notes' and (coalesce((a->>'private')::boolean,false) or coalesce((b->>'private')::boolean,false)) then coalesce((a->>'author_id')::uuid,(b->>'author_id')::uuid) end);
 return coalesce(new,old);
end $$;

alter table relay_private.jobs drop constraint jobs_status_check;
alter table relay_private.jobs add constraint jobs_status_check check(status in ('queued','running','paused','completed','dead'));
create index jobs_paused_sequence_idx on relay_private.jobs((payload->>'enrollment_id')) where status='paused' and type='sequence_send';
create index jobs_active_workspace_idx on relay_private.jobs(workspace_id) where status in ('queued','running','paused');
create index jobs_user_fk_idx on relay_private.jobs(user_id);
create index enrollments_sequence_fk_idx on public.enrollments(workspace_id,sequence_id);
create table relay_private.scheduler_ticks(key text primary key,last_at timestamptz not null);
alter table relay_private.scheduler_ticks enable row level security;
revoke all on relay_private.scheduler_ticks from public,anon,authenticated;

-- Apply one shared capacity budget to both scheduler and interactive jobs.
create or replace function relay_private.put_job(w uuid,subject uuid,kind text,key text,body jsonb,due timestamptz default now())
returns uuid language plpgsql security invoker set search_path='' as $$
declare j uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('jobs:'||w::text,0));
 select id into j from relay_private.jobs where workspace_id=w and type=kind and dedupe_key=key;
 if j is not null then return j;end if;
 if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running','paused'))>=200 then return null;end if;
 insert into relay_private.jobs(workspace_id,user_id,type,dedupe_key,payload,run_at) values(w,subject,kind,key,body,due)
 on conflict(workspace_id,type,dedupe_key) do nothing returning id into j;
 return j;
end $$;

create or replace function relay_private.enqueue_job(w uuid,kind text,payload jsonb) returns jsonb
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
  if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running','paused'))>=200 then
   raise exception 'Queue capacity reached' using errcode='53300';
  end if;
  j:=relay_private.put_job(w,auth.uid(),kind,key,payload);
 end if;
 return (select jsonb_build_object('id',id,'status',status) from relay_private.jobs where id=j);
end $$;

create function relay_private.schedule_jobs(types text[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare candidate record;kind text;tick text;
begin
 if types is null or cardinality(types)=0 or not types<@array['email_sync','calendar_sync','sequence_send','workflow_run','notifications','imports'] then raise exception 'Invalid types' using errcode='22023';end if;
 tick:='schedule:'||array_to_string(array(select distinct t from unnest(types) t order by t),',');
 if not pg_try_advisory_xact_lock(hashtextextended('relay-scheduler',0)) then return jsonb_build_object('skipped',true);end if;
 if exists(select 1 from relay_private.scheduler_ticks where key=tick and last_at>now()-interval '60 seconds') then return jsonb_build_object('skipped',true);end if;
 insert into relay_private.scheduler_ticks values(tick,now()) on conflict(key) do update set last_at=excluded.last_at;
 if types && array['email_sync','calendar_sync'] then
  for candidate in select i.id,i.workspace_id,i.user_id,i.provider,s.next_at,s.cursor
   from relay_private.connector_sync_state s join public.integrations i on i.id=s.integration_id
   join public.memberships m on m.workspace_id=i.workspace_id and m.user_id=i.user_id
   where s.auto_sync and s.next_at<=now() and (s.leased_until is null or s.leased_until<=now())
   and i.status='connected' and m.role in ('owner','admin','member')
   and (case when i.provider in ('gmail','outlook') then 'email_sync' else 'calendar_sync' end)=any(types)
   and (select count(*) from relay_private.jobs j where j.workspace_id=i.workspace_id and j.status in ('queued','running','paused'))<200
   and not exists(select 1 from relay_private.jobs j where j.payload->>'integration_id'=i.id::text and j.type in ('email_sync','calendar_sync') and j.status in ('queued','running'))
   and not exists(select 1 from relay_private.jobs j where j.workspace_id=i.workspace_id and j.type=case when i.provider in ('gmail','outlook') then 'email_sync' else 'calendar_sync' end and j.dedupe_key=i.id::text||':'||s.next_at::text||':'||md5(s.cursor::text))
   order by s.next_at limit 100 loop
   kind:=case when candidate.provider in ('gmail','outlook') then 'email_sync' else 'calendar_sync' end;
   perform relay_private.put_job(candidate.workspace_id,candidate.user_id,kind,candidate.id::text||':'||candidate.next_at::text||':'||md5(candidate.cursor::text),jsonb_build_object('provider',candidate.provider,'integration_id',candidate.id));
  end loop;
 end if;
 if 'sequence_send'=any(types) then
  -- Dormant jobs resume only when their source becomes eligible again.
  for candidate in select j.id,e.status,e.next_at,s.enabled,(j.dedupe_key is distinct from e.id::text||':'||e.step) stale from relay_private.jobs j
   left join public.enrollments e on e.id=(j.payload->>'enrollment_id')::uuid and e.workspace_id=j.workspace_id
   left join public.sequences s on s.id=e.sequence_id where j.type='sequence_send' and j.status='paused'
   and (e.id is null or e.status not in ('active','paused') or (e.status='active' and s.enabled) or j.dedupe_key is distinct from e.id::text||':'||e.step) order by j.created_at limit 100 loop
   if candidate.status is null or candidate.status not in ('active','paused') or candidate.stale then
    update relay_private.jobs set status='completed',completed_at=now(),payload='{}',result='{}' where id=candidate.id;
   elsif candidate.status='active' and candidate.enabled then
    update relay_private.jobs set status='queued',run_at=coalesce(candidate.next_at,now()) where id=candidate.id;
   end if;
  end loop;
  for candidate in select e.id,e.workspace_id,e.user_id,e.step,e.next_at from public.enrollments e join public.sequences s on s.id=e.sequence_id
   where e.status='active' and e.next_at<=now() and s.enabled
   and (select count(*) from relay_private.jobs j where j.workspace_id=e.workspace_id and j.status in ('queued','running','paused'))<200
   and not exists(select 1 from relay_private.jobs j where j.workspace_id=e.workspace_id and j.type='sequence_send' and j.dedupe_key=e.id::text||':'||e.step)
   order by e.next_at limit 100 loop
   perform relay_private.put_job(candidate.workspace_id,candidate.user_id,'sequence_send',candidate.id::text||':'||candidate.step,jsonb_build_object('enrollment_id',candidate.id),candidate.next_at);
  end loop;
 end if;
 if 'notifications'=any(types) then
  for candidate in select distinct r.workspace_id from (
   select workspace_id,owner_id,id,due_date,'tasks'::text entity from public.tasks where due_date<=now()+interval '24 hours' and status not in ('done','cancelled') and owner_id is not null
   union all select workspace_id,owner_id,id,due_date,'commitments' from public.commitments where due_date<=now()+interval '24 hours' and status not in ('done','cancelled','postponed') and owner_id is not null
  ) r join public.memberships m on m.workspace_id=r.workspace_id and m.user_id=r.owner_id
  where not exists(select 1 from public.notifications n where n.workspace_id=r.workspace_id and n.user_id=r.owner_id and n.dedup_key=r.entity||':'||r.id||':due:'||r.due_date::text)
  and (select count(*) from relay_private.jobs j where j.workspace_id=r.workspace_id and j.status in ('queued','running','paused'))<200
  and not exists(select 1 from relay_private.jobs j where j.workspace_id=r.workspace_id and j.type='notifications' and j.status in ('queued','running'))
  order by r.workspace_id limit 100 loop
   perform relay_private.put_job(candidate.workspace_id,null,'notifications',floor(extract(epoch from now())/300)::text,'{}');
  end loop;
 end if;
 if not exists(select 1 from relay_private.scheduler_ticks where key='maintenance' and last_at>now()-interval '1 hour') then
  insert into relay_private.scheduler_ticks values('maintenance',now()) on conflict(key) do update set last_at=excluded.last_at;
  update relay_private.jobs set payload='{}',result=null where id in(select id from relay_private.jobs where status='dead' and completed_at<now()-interval '7 days' and (payload<>'{}' or result is not null) order by completed_at limit 500);
  delete from relay_private.jobs where id in(select id from relay_private.jobs where status in ('completed','dead') and completed_at<now()-interval '30 days' order by completed_at limit 500);
  delete from relay_private.worker_heartbeats where heartbeat_at<now()-interval '1 day';
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function relay_private.schedule_jobs(text[]) from public,anon,authenticated,service_role;

-- Preserve atomic handlers and lease fencing, with bounded scheduling and dormant deferrals.
create or replace function public.relay_job_worker(operation text,payload jsonb default '{}') returns jsonb
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
  return relay_private.schedule_jobs(array(select jsonb_array_elements_text(payload->'types')));
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
  update relay_private.jobs set status=case when j.type='sequence_send' and exists(select 1 from public.enrollments e join public.sequences s on s.id=e.sequence_id where e.id=(j.payload->>'enrollment_id')::uuid and e.workspace_id=j.workspace_id and (e.status='paused' or not s.enabled)) then 'paused' else 'queued' end,run_at=greatest(now()+interval '1 second',(payload->>'run_at')::timestamptz),attempts=greatest(0,attempts-1),lease=null,leased_until=null where id=j.id;
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

-- The Railway scheduler replaces this legacy cron. Keep its definition reversible.
do $$declare j bigint;begin
 if to_regclass('cron.job') is not null then
  for j in select jobid from cron.job where jobname='relay-due-reminders' loop perform cron.alter_job(j,active:=false);end loop;
 end if;
end $$;
commit;
