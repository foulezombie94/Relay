begin;
set local statement_timeout='30s';
do $$
declare u uuid;v uuid:=gen_random_uuid();w uuid;obj uuid;rec uuid;wf uuid;ex uuid;j uuid;token uuid;d jsonb;outcome jsonb;dest uuid;io uuid;version integer;n integer;private_ex uuid; integration uuid; event_id uuid:=gen_random_uuid();
begin
 select id into u from auth.users order by created_at limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('Workflow blocks rollback');
 insert into auth.users(id,email,aud,role) values(v,'workflow-test-'||v||'@example.invalid','authenticated','authenticated');
 insert into public.memberships(workspace_id,user_id,role) values(w,v,'member');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name,email,amount) values(w,obj,'Alice Test','alice@example.invalid',500) returning id into rec;
 d:=jsonb_build_object('object_id',obj,'conditions','[]'::jsonb,'trigger',jsonb_build_object('type','manual'),'actions',jsonb_build_array(
  jsonb_build_object('type','note','title','Hello {{contact.first_name}}','body','Context {{record.name}}','alias','context'),
  jsonb_build_object('type','branch','conditions',jsonb_build_array(jsonb_build_object('field','amount','operator','gt','value',100)),'then',jsonb_build_array(jsonb_build_object('type','task','title','Follow {{record.name}}','days',1,'owner','runner')),'otherwise',jsonb_build_array(jsonb_build_object('type','note','title','Other','body','Unused'))),
  jsonb_build_object('type','delay','minutes',1),jsonb_build_object('type','notify','title','Review {{record.name}}','owner','runner')));
 insert into public.workflows(workspace_id,name,definition) values(w,'Blocks fixture',d) returning id into wf;
 select workflows.version into version from public.workflows where id=wf;
 insert into relay_private.workflow_releases(workspace_id,workflow_id,version,definition) values(w,wf,version,d);
 ex:=relay_private.workflow_start(w,wf,version,rec,u,'manual','fixture:blocks');
 perform relay_private.workflow_schedule();
 select job_id into j from public.workflow_executions where id=ex;
 if j is null then raise exception 'Manual draft not scheduled';end if;
 for n in 1..3 loop
  token:=gen_random_uuid();update relay_private.jobs set status='running',lease=token,leased_until=now()+interval '3 minutes',attempts=attempts+1 where id=j;
  execute 'set local role service_role';outcome:=public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',token));execute 'reset role';
 end loop;
 if (select count(*) from public.notes where workspace_id=w and title='Hello Alice')<>1 or (select count(*) from public.tasks where workspace_id=w and title='Follow Alice Test')<>1 then raise exception 'Variables or branch failed';end if;
 if (select status from public.workflow_step_runs where execution_id=ex and step_key='root.1.no.0')<>'skipped' then raise exception 'Unchosen branch not skipped';end if;
 token:=gen_random_uuid();update relay_private.jobs set status='running',lease=token,leased_until=now()+interval '3 minutes' where id=j;
 execute 'set local role service_role';outcome:=public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',token));execute 'reset role';
 if outcome->>'status'<>'waiting' then raise exception 'Delay did not persist';end if;
 update public.workflow_step_runs set started_at=now()-interval '2 minutes' where execution_id=ex and type='delay';
 for n in 1..2 loop
  token:=gen_random_uuid();update relay_private.jobs set status='running',lease=token,leased_until=now()+interval '3 minutes' where id=j;
  execute 'set local role service_role';outcome:=public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',token));execute 'reset role';
 end loop;
 if (select status from public.workflow_executions where id=ex)<>'completed' or (select count(*) from public.notifications where workspace_id=w and entity='workflows' and entity_id=ex)<>1 then raise exception 'Final block/notification failed';end if;
 if relay_private.workflow_render('{{record.name}}',jsonb_build_object('record',jsonb_build_object('name',E'A\\B')))<>E'A\\B' then raise exception 'Template escaping changed';end if;
 insert into relay_private.workflow_destinations(workspace_id,name,kind,encrypted,created_by) values(w,'Fixture API','webhook','fixture-encrypted',u) returning id into dest;
 d:=jsonb_build_object('object_id',obj,'conditions','[]'::jsonb,'trigger',jsonb_build_object('type','webhook'),'reenrollment','on_change','actions',jsonb_build_array(jsonb_build_object('type','webhook','destination_id',dest,'body','{"name":"{{record.name}}"}','alias','api'),jsonb_build_object('type','task','title','After API','owner','runner')));
 insert into public.workflows(workspace_id,name,definition) values(w,'Outbox fixture',d) returning id into wf;
 select workflows.version into version from public.workflows where id=wf;
 execute 'set local role authenticated';perform public.workflow_control(w,wf,'publish',version);execute 'reset role';
 update public.records set display_name='Alice Updated' where id=rec;
 if exists(select 1 from public.workflow_executions where workflow_id=wf) then raise exception 'Record update incorrectly triggered webhook flow';end if;
 outcome:=relay_private.workflow_ingest(wf,rec,'webhook',gen_random_uuid(),'{}');
 select id into ex from public.workflow_executions where workflow_id=wf;perform relay_private.workflow_schedule();select job_id into j from public.workflow_executions where id=ex;
 token:=gen_random_uuid();update relay_private.jobs set status='running',lease=token,leased_until=now()+interval '3 minutes' where id=j;
 execute 'set local role service_role';outcome:=public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',token));io:=(outcome->'external'->>'id')::uuid;
 perform public.relay_job_worker('workflow_effect_prepare',jsonb_build_object('id',j,'lease',token,'effect',io));
 begin
  perform public.relay_job_worker('workflow_effect_prepare',jsonb_build_object('id',j,'lease',token,'effect',io));raise exception 'Duplicate prepare accepted';
 exception when insufficient_privilege then null;end;
 perform public.relay_job_worker('workflow_effect_finish',jsonb_build_object('id',j,'lease',token,'effect',io,'state','unknown','code','delivery_uncertain'));
 execute 'reset role';
 execute 'set local role authenticated';
 begin perform public.workflow_control(w,wf,'retry',version,ex);raise exception 'Uncertain action retried blindly';exception when invalid_parameter_value then null;end;
 perform public.workflow_control(w,wf,'resolve_done',version,ex);execute 'reset role';
 for n in 1..2 loop
  token:=gen_random_uuid();update relay_private.jobs set status='running',lease=token,leased_until=now()+interval '3 minutes' where id=j;
  execute 'set local role service_role';outcome:=public.relay_job_worker('execute',jsonb_build_object('id',j,'lease',token));execute 'reset role';
  if outcome?'external' then raise exception 'Confirmed external action dispatched again';end if;
 end loop;
 if (select status from public.workflow_executions where id=ex)<>'completed' then raise exception 'Resolved execution did not finish';end if;
 perform set_config('relay.workflow_event_ctx',jsonb_build_object('private_user',u,'event',jsonb_build_object('body','Private input'))::text,true);
 private_ex:=relay_private.workflow_start(w,wf,version,rec,u,'email_received','fixture:private');
 perform set_config('relay.workflow_event_ctx','',true);
 perform set_config('request.jwt.claim.sub',v::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.workflow_executions where id=private_ex) or exists(select 1 from public.workflow_step_runs where execution_id=private_ex) then raise exception 'Private email context leaked';end if;
 begin perform public.workflow_inspect(w,private_ex);raise exception 'Private inspection leaked';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 outcome:=relay_private.workflow_ingest(wf,rec,'webhook',event_id,'{}');
 outcome:=relay_private.workflow_ingest(wf,rec,'webhook',event_id,'{}');
 if outcome->>'duplicate'<>'true' then raise exception 'Webhook replay accepted';end if;
 for n in 1..5 loop
  d:=jsonb_build_object('object_id',obj,'conditions','[]'::jsonb,'trigger',case n
    when 1 then jsonb_build_object('type','schedule','frequency','daily','time','00:00','timezone','UTC')
    when 2 then jsonb_build_object('type','date_reached','field','close_date')
    when 3 then jsonb_build_object('type','task_completed')
    when 4 then jsonb_build_object('type','meeting_completed')
    else jsonb_build_object('type','email_replied') end,'reenrollment','on_change','actions',jsonb_build_array(jsonb_build_object('type','task','title','Event '||n,'owner','runner')));
  insert into public.workflows(workspace_id,name,definition) values(w,'Event fixture '||n,d) returning id into wf;
  select workflows.version into version from public.workflows where id=wf;
  execute 'set local role authenticated';perform public.workflow_control(w,wf,'publish',version);execute 'reset role';
  if n=1 then perform relay_private.workflow_time_events();perform relay_private.workflow_time_events();
  elsif n=2 then update public.records set close_date=current_date-1 where id=rec;perform relay_private.workflow_time_events();
  elsif n=3 then update public.tasks set status='done' where workspace_id=w and record_id=rec;
  elsif n=4 then insert into public.meetings(workspace_id,record_id,title,starts_at,author_id,status) values(w,rec,'Completed meeting',now(),u,'completed');
  else
   insert into public.integrations(workspace_id,user_id,provider,status,email) values(w,u,'gmail','connected','sender@example.invalid') returning id into integration;
   insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,sender_email,body,is_reply,received_at) values(w,u,integration,'reply-fixture','email','Reply','alice@example.invalid','alice@example.invalid','Private email body',true,now());
  end if;
  if not exists(select 1 from public.workflow_executions where workflow_id=wf) then raise exception 'Event % not dispatched',n;end if;
  if n=1 and (select count(*) from public.workflow_executions where workflow_id=wf)<>1 then raise exception 'Scheduled event duplicated';end if;
  if n=5 and exists(select 1 from public.workflow_executions where workflow_id=wf and context_user_id is distinct from u) then raise exception 'Email execution not private';end if;
 end loop;
end $$;
rollback;
select 'workflow block progress, variables, delay, outbox fencing, uncertain recovery and private RLS OK' as result;
