begin;
do $$
declare u uuid;v uuid;w uuid;o uuid;r uuid;t uuid;s uuid;i uuid;
begin
 select id into u from auth.users order by created_at limit 1;
 select id into v from auth.users where id<>u order by created_at limit 1;
 if u is null or v is null then raise exception 'Two existing identities required';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into public.workspaces(name,owner_id) values('ROLLBACK CRM operations test',u) returning id into w;
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'owner');
 insert into public.objects(workspace_id,name,slug) values(w,'Contacts test','people') returning id into o;
 insert into public.records(workspace_id,object_id,display_name,email) values(w,o,'Contact test','test@example.invalid') returning id into r;
 insert into public.tasks(workspace_id,record_id,owner_id,title,due_date) values(w,r,u,'Test task',now()+interval '1 hour') returning id into t;
 insert into public.integrations(workspace_id,user_id,provider,status,email,scopes) values(w,u,'gmail','connected','sender@example.invalid',array[]::text[]) returning id into i;
 insert into public.sequences(workspace_id,name,enabled,steps) values(w,'Test sequence',true,'[{"subject":"Test","body":"Bonjour {{display_name}}","delay_days":0}]') returning id into s;
 perform set_config('relay.test.w',w::text,true);perform set_config('relay.test.r',r::text,true);perform set_config('relay.test.t',t::text,true);perform set_config('relay.test.s',s::text,true);perform set_config('relay.test.u',u::text,true);perform set_config('relay.test.v',v::text,true);
 perform relay_private.generate_reminders();perform relay_private.generate_reminders();
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('relay.test.w')::uuid;c jsonb;f jsonb;e uuid;n integer;rejected boolean:=false;
begin
 if (select count(*) from public.notifications where workspace_id=w)<>2 then raise exception 'Notifications must deduplicate';end if;
 update public.notifications set read_at=now() where workspace_id=w;
 if (select count(*) from public.notifications where workspace_id=w and read_at is null)<>0 then raise exception 'Mark read failed';end if;
 update public.tasks set status='done' where id=current_setting('relay.test.t')::uuid;
 if (select version from public.tasks where id=current_setting('relay.test.t')::uuid)<>2 or (select completed_at from public.tasks where id=current_setting('relay.test.t')::uuid) is null then raise exception 'Version or completion timestamp missing';end if;
 begin perform public.connector_sync(w,'gmail','finish',jsonb_build_object('lease',null,'items','[]'::jsonb,'cursor','{}'::jsonb,'complete',true));exception when sqlstate '40001' then rejected:=true;end;
 if not rejected then raise exception 'Unclaimed sync write accepted';end if;
 c:=public.connector_sync(w,'gmail','claim');
 rejected:=false;begin perform public.connector_sync(w,'gmail','claim');exception when sqlstate '40001' then rejected:=true;end;
 if not rejected then raise exception 'Concurrent sync accepted';end if;
 f:=public.connector_sync(w,'gmail','finish',jsonb_build_object('lease',c->>'lease','items',jsonb_build_array(jsonb_build_object('provider_id','test-message','kind','email','subject','Test','sender','sender@example.invalid','recipients','[]'::jsonb,'body','Preview')),'cursor',jsonb_build_object('page','resume','start','2026-10-01T00:00:00Z','end','2026-10-06T00:00:00Z'),'complete',false));
 if f->>'synced'<>'1' then raise exception 'Sync batch not committed';end if;
 c:=public.connector_sync(w,'gmail','claim');
 if c->'cursor'->>'page'<>'resume' then raise exception 'Sync cursor not durable';end if;
 perform public.connector_sync(w,'gmail','fail',jsonb_build_object('lease',c->>'lease','error','Test interruption'));
 e:=public.sequence_enroll(w,current_setting('relay.test.s')::uuid,current_setting('relay.test.r')::uuid,1,1,'gmail',repeat('a',64),'fixture-cipher',now()-interval '1 minute');
 perform set_config('relay.test.e',e::text,true);
 perform public.sequence_control(w,e,'pause');perform public.sequence_control(w,e,'resume');
 perform set_config('request.jwt.claim.sub',current_setting('relay.test.v'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('relay.test.v'),'role','authenticated')::text,true);
 if exists(select 1 from public.notifications where workspace_id=w) or exists(select 1 from public.communications where workspace_id=w) then raise exception 'Cross-user data leak';end if;
end $$;
reset role;
do $$
declare j jsonb;result jsonb;e uuid:=current_setting('relay.test.e')::uuid;
begin
 j:=public.sequence_job('claim');
 if j->>'id'<>e::text then raise exception 'Expected isolated test delivery';end if;
 result:=public.sequence_job('prepare',jsonb_build_object('delivery_id',j->>'delivery_id','lease',j->>'lease'));
 if result->>'ok'<>'true' then raise exception 'Delivery not prepared';end if;
 update relay_private.delivery_leases set leased_until=now()-interval '1 second' where delivery_id=(j->>'delivery_id')::uuid;
 perform public.sequence_job('claim');
 if (select status from public.enrollments where id=e)<>'failed' or (select status from public.sequence_deliveries where id=(j->>'delivery_id')::uuid)<>'uncertain' then raise exception 'Ambiguous delivery retried';end if;
 if public.sequence_unsubscribe(e,repeat('b',64)) then raise exception 'Invalid unsubscribe accepted';end if;
 if not public.sequence_unsubscribe(e,repeat('a',64)) then raise exception 'Valid unsubscribe failed';end if;
 if not exists(select 1 from public.suppressions where workspace_id=current_setting('relay.test.w')::uuid and email='test@example.invalid') then raise exception 'Suppression missing';end if;
 if has_function_privilege('authenticated','public.integration_worker(uuid,text,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.sequence_job(text,jsonb)','EXECUTE') or has_table_privilege('authenticated','relay_private.enrollment_state','SELECT') then raise exception 'Worker secrets exposed';end if;
end $$;
select 'notifications, RLS, versions, sync lease/resume, sequence pause/resume, uncertain-send stop, unsubscribe: OK' result;
rollback;