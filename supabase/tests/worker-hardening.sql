begin;
set local statement_timeout='30s';
create temporary table hardening_checks(label text);
grant select,insert on hardening_checks to authenticated,service_role;
do $$
declare u uuid;v uuid:=gen_random_uuid();w uuid;other uuid;obj uuid;rec uuid;p uuid;e uuid;s uuid;
 j uuid;claimed jsonb;output jsonb;n integer;i uuid;good_i uuid;
begin
 select id into u from auth.users order by created_at limit 1;
 if u is null then raise exception 'Auth account required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('Worker hardening rollback');other:=public.create_workspace('Other rollback');
 insert into auth.users(id,email,aud,role) values(v,'worker-test-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.memberships(workspace_id,user_id,role) values(w,v,'viewer');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Fixture') returning id into rec;
 insert into public.portals(workspace_id,record_id,name) values(w,rec,'Fixture portal') returning id into p;
 insert into public.portal_members(workspace_id,portal_id,email) values(w,p,'private-invite@example.invalid');
 insert into public.notes(workspace_id,title,content,private,author_id) values(w,'Private audit fixture','Private',true,u);
 execute 'set local role authenticated';
 begin
  insert into public.documents(workspace_id,record_id,name,path,mime,size,uploader_id) values(w,rec,'Alias',other::text||'/victim.pdf','application/pdf',1,u);
  raise exception 'Foreign storage alias accepted';
 exception when check_violation then null;end;
 begin
  insert into public.import_jobs(workspace_id,object_id,filename,digest,inserted,skipped) values(w,obj,'fake.csv',repeat('a',64),999,0);
  raise exception 'Import execution history forgery accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform public.import_crm_records(w,obj,'[{"display_name":"Oversized"}]',repeat('b',64),'big.csv',jsonb_build_object('column',repeat('x',65537)),'skip','[]');
  raise exception 'Oversized mapping accepted';
 exception when invalid_parameter_value then null;end;
 output:=public.import_crm_records(w,obj,'[{"display_name":"Trusted import"}]',repeat('c',64),'valid.csv','{}','skip','[]');
 if (output->>'inserted')::int<>1 or output ? 'mapping' then raise exception 'Bounded direct fallback import failed';end if;
 insert into hardening_checks values('document ownership, forged history denied, import limits and synchronous fallback');
 perform set_config('request.jwt.claim.sub',v::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if exists(select 1 from public.audit_events where workspace_id=w and entity='portal_members') then raise exception 'Portal ACL leaked via audit';end if;
 if exists(select 1 from public.audit_events where workspace_id=w and entity='notes') then raise exception 'Private note audit leaked';end if;
 begin
  perform public.import_crm_records(w,obj,'[{"display_name":"Viewer import"}]',repeat('d',64),'viewer.csv','{}','skip','[]');
  raise exception 'Viewer executed import';
 exception when insufficient_privilege then null;end;
 insert into hardening_checks values('viewer cannot import or read admin/private audit snapshots');
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 select count(*) into n from public.audit_events where workspace_id=w and entity_id=rec;
 update public.records set display_name=display_name where id=rec;
 if (select count(*) from public.audit_events where workspace_id=w and entity_id=rec)<>n then raise exception 'No-op audit bloat';end if;
 update public.records set display_name='Changed' where id=rec;
 if (select count(*) from public.audit_events where workspace_id=w and entity_id=rec)<>n+1 then raise exception 'Meaningful change not audited';end if;
 if exists(select 1 from public.audit_events where workspace_id=w and entity_id=rec and created_at=now() and (after_data ? 'search' or after_data ? 'search_index')) then raise exception 'Derived search data retained';end if;
 insert into hardening_checks values('business audit retained; no-op and search-vector bloat removed');
 insert into public.sequences(workspace_id,name,enabled) values(w,'No actual email',true) returning id into s;
 insert into public.enrollments(workspace_id,sequence_id,record_id,user_id,status,next_at) values(w,s,rec,u,'paused',now()) returning id into e;
 j:=relay_private.put_job(w,u,'sequence_send',e::text||':0',jsonb_build_object('enrollment_id',e),'2000-01-01');
 execute 'set local role service_role';
 claimed:=public.relay_job_worker('claim','{"worker_id":"hardening-fixture","types":["sequence_send"]}');
 if claimed->>'id' is distinct from j::text then raise exception 'Fixture was not claimed';end if;
 perform public.relay_job_worker('defer',jsonb_build_object('id',j,'lease',claimed->>'lease','run_at',now()+interval '60 seconds'));
 execute 'reset role';
 if (select status from relay_private.jobs where id=j)<>'paused' then raise exception 'Paused sequence keeps polling';end if;
 perform relay_private.schedule_jobs(array['sequence_send']);
 if (select status from relay_private.jobs where id=j)<>'paused' then raise exception 'Paused source resumed';end if;
 update public.enrollments set status='active' where id=e;
 delete from relay_private.scheduler_ticks where key='schedule:sequence_send';
 perform relay_private.schedule_jobs(array['sequence_send']);
 if (select status from relay_private.jobs where id=j)<>'queued' then raise exception 'Eligible enrollment not resumed';end if;
 insert into hardening_checks values('paused jobs stop polling and resume without creating duplicate jobs');
 insert into public.tasks(workspace_id,title,owner_id,due_date) values(w,'Reminder fixture',u,now());
 perform relay_private.schedule_jobs(array['notifications']);
 select id into j from relay_private.jobs where workspace_id=w and type='notifications';
 if j is null then raise exception 'Missing due reminder not scheduled';end if;
 update relay_private.jobs set run_at='2000-01-01' where id=j;
 execute 'set local role service_role';
 claimed:=public.relay_job_worker('claim','{"worker_id":"reminder-fixture","types":["notifications"]}');
 if claimed->>'id' is distinct from j::text then raise exception 'Reminder fixture not claimed';end if;
 perform public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',claimed->>'lease'));
 execute 'reset role';
 delete from relay_private.scheduler_ticks where key='schedule:notifications';
 -- Advance the completed key to simulate a later scheduling bucket in the same transaction.
 update relay_private.jobs set dedupe_key='earlier-fixture-bucket' where id=j;
 perform relay_private.schedule_jobs(array['notifications']);
 if (select count(*) from relay_private.jobs where workspace_id=w and type='notifications')<>1 then raise exception 'Already notified task creates empty jobs';end if;
 output:=relay_private.schedule_jobs(array['notifications']);
 if (output->>'skipped')::boolean is not true then raise exception 'Scheduler throttle missing';end if;
 if exists(select 1 from cron.job where jobname='relay-due-reminders' and active) then raise exception 'Duplicate reminder cron still active';end if;
 insert into hardening_checks values('missing reminder only, scheduler throttle, legacy duplicate cron disabled');
 -- One tenant's admitted burst must not abort the next tenant's connector schedule.
 for n in 1..30 loop perform relay_private.put_job(other,u,'workflow_run','quota-fixture-'||n,'{}');end loop;
 select id into obj from public.objects where workspace_id=other and slug='people';
 execute 'set local role authenticated';
 begin
  perform public.enqueue_relay_job(other,'imports',jsonb_build_object('object_id',obj,'rows_data','[{"display_name":"Quota fixture"}]'::jsonb,'digest',repeat('e',64),'duplicate_policy','skip','error_rows','[]'::jsonb));
  raise exception 'Interactive admission quota bypassed';
 exception when sqlstate '53300' then null;end;
 execute 'reset role';
 insert into public.integrations(workspace_id,user_id,provider,status,email) values(other,u,'gmail','connected','quota@example.invalid') returning id into i;
 insert into public.integrations(workspace_id,user_id,provider,status,email) values(w,u,'gmail','connected','eligible@example.invalid') returning id into good_i;
 insert into relay_private.connector_sync_state(integration_id,auto_sync,next_at) values(i,true,'2000-01-01'),(good_i,true,'2001-01-01')
 on conflict(integration_id) do update set auto_sync=true,next_at=excluded.next_at;
 delete from relay_private.scheduler_ticks where key='schedule:email_sync';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','service_role')::text,true);
 execute 'set local role service_role';
 perform public.relay_job_worker('schedule','{"types":["email_sync"]}');
 execute 'reset role';
 if exists(select 1 from relay_private.jobs where payload->>'integration_id'=i::text)
 or not exists(select 1 from relay_private.jobs where payload->>'integration_id'=good_i::text) then raise exception 'One saturated tenant blocked another';end if;
 insert into hardening_checks values('interactive rate cap enforced; saturated scheduler tenant isolated');
 -- The shared capacity guard includes paused work and scheduled jobs.
 while (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running','paused'))<200 loop
  perform relay_private.put_job(w,null,'notifications','capacity-fixture-'||gen_random_uuid(),'{}');
 end loop;
 if relay_private.put_job(w,null,'notifications','over-capacity-fixture','{}') is not null then raise exception 'Shared queue capacity exceeded';end if;
 insert into hardening_checks values('shared scheduler and interactive capacity capped at 200 jobs');
end $$;
select * from hardening_checks;
rollback;
