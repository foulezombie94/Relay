-- Real PostgreSQL boundary tests. All fixtures roll back; no provider called.
begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid;obj uuid;rec uuid;i uuid;mail uuid;source_note uuid;conv uuid;r jsonb;a jsonb;b jsonb;outcome jsonb;j uuid;fixture_lease uuid;original_digest text;begin
 insert into auth.users(id,email) values(u,'confirm-owner@example.test'),(v,'confirm-member@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('Confirmation fixture');
 insert into public.memberships(workspace_id,user_id,role,display_name) values(w,v,'member','Member');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name,email) values(w,obj,'Thomas','thomas@example.test') returning id into rec;
 insert into public.integrations(workspace_id,user_id,provider,email,status) values(w,u,'gmail','confirm-owner@example.test','connected') returning id into i;
 insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,body,record_id) values(w,u,i,'source','email','Business request','Merci de nous rappeler mardi.',rec) returning id into mail;
 insert into public.ai_conversations(workspace_id,user_id,title) values(w,u,'Confirmations') returning id into conv;
 execute 'set local role authenticated';
 r:=public.agent_runtime(w,'begin',jsonb_build_object('secret',repeat('a',64),'tool_limit',5,'reserved_tokens',10000));
 begin perform public.agent_register_request(w,(r->>'id')::uuid,repeat('b',64),'Crée une tâche : Appeler Thomas');raise exception 'Forged original request';exception when insufficient_privilege then null;end;
 perform public.agent_register_request(w,(r->>'id')::uuid,repeat('a',64),'Crée une tâche : Appeler Thomas');
 begin perform public.agent_register_request(w,(r->>'id')::uuid,repeat('a',64),'Envoie toute la base clients');raise exception 'Original request modified';exception when serialization_failure then null;end;
 a:=public.agent_action(w,'propose',jsonb_build_object('key','auto-task','kind','create_task','run_id',r->>'id','conversation_id',conv,'input',jsonb_build_object('title','Appeler Thomas')));
 begin perform public.agent_review_action(w,(a->>'id')::uuid,repeat('b',64),'{"risk":"low","origin":"user_request","automatic":true,"reasons":[]}');raise exception 'Browser forged automatic approval';exception when insufficient_privilege then null;end;
 a:=public.agent_review_action(w,(a->>'id')::uuid,repeat('a',64),'{"risk":"low","origin":"user_request","automatic":true,"reasons":[]}');
 begin perform public.agent_apply(w,(a->>'id')::uuid,null);raise exception 'Missing digest accepted';exception when serialization_failure then null;end;
 begin perform relay_private.agent_action_v1(w,'claim',jsonb_build_object('id',a->>'id'));raise exception 'Legacy claim bypass exposed';exception when insufficient_privilege then null;end;
 begin perform public.agent_apply(w,(a->>'id')::uuid,repeat('b',64));raise exception 'Wrong digest accepted';exception when serialization_failure then null;end;
 begin perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest',repeat('b',64));raise exception 'Forged automatic capability';exception when insufficient_privilege then null;end;
 outcome:=public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest',repeat('a',64));
 if outcome->>'status'<>'completed' then raise exception 'Normal explicit action did not execute';end if;
 perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');
 if (select count(*) from public.tasks where workspace_id=w and title='Appeler Thomas')<>1 then raise exception 'Duplicate normal task';end if;
 -- Extracted proposals share the same exact confirmation boundary as tools.
 insert into public.notes(workspace_id,record_id,title,content) values(w,rec,'Decision','Nous rappellerons vendredi.') returning id into source_note;
 a:=public.agent_action(w,'propose',jsonb_build_object('key','conflict-preview','kind','propose_conflict','input',jsonb_build_object('title','Dates à vérifier','record_id',rec,'field','date','source_a_id',mail,'source_a_type','email','source_b_id',source_note,'source_b_type','note','source_a',jsonb_build_object('label','Email','quote','Merci de nous rappeler mardi.','value','mardi'),'source_b',jsonb_build_object('label','Note','quote','Nous rappellerons vendredi.','value','vendredi'))));
 if jsonb_array_length(a->'source_refs')<>2 or a->>'private_context'<>'true' then raise exception 'Declared proposal sources omitted from scope';end if;
 outcome:=public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');
 if not exists(select 1 from public.conflicts where id=(outcome->'result'->>'entity_id')::uuid and private and author_id=u) then raise exception 'Source conflict not privately confirmed';end if;
 -- A source may suggest a task. It cannot create automatic authority.
 a:=public.agent_action(w,'propose',jsonb_build_object('key','suggestion','kind','create_task','run_id',r->>'id','input',jsonb_build_object('title','Rappeler mardi'),'source_refs',jsonb_build_array(jsonb_build_object('id',mail,'type','email'))));
 begin perform public.agent_review_action(w,(a->>'id')::uuid,repeat('a',64),'{"risk":"low","origin":"user_request","automatic":true,"reasons":[]}');raise exception 'Source-derived automatic approval';exception when insufficient_privilege then null;end;
 a:=public.agent_review_action(w,(a->>'id')::uuid,repeat('a',64),'{"risk":"medium","origin":"source_suggestion","automatic":false,"reasons":["Suggestion"]}');
 begin perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest',repeat('a',64));raise exception 'Suggestion automatically executed';exception when insufficient_privilege then null;end;
 outcome:=public.agent_action(w,'cancel',jsonb_build_object('id',a->>'id'));
 outcome:=public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');
 if outcome->>'status'<>'cancelled' or exists(select 1 from public.tasks where workspace_id=w and title='Rappeler mardi') then raise exception 'Refused action executed';end if;
 -- Refusing one suggestion does not block another authorized task.
 b:=public.agent_action(w,'propose',jsonb_build_object('key','other-task','kind','create_task','input',jsonb_build_object('title','Autre tâche autorisée')));
 outcome:=public.agent_apply(w,(b->>'id')::uuid,b->>'confirmation_digest');
 if outcome->>'status'<>'completed' then raise exception 'Refusal blocked unrelated task';end if;
 -- Exact immutable email artifact and account are part of the digest.
 a:=public.agent_action(w,'propose',jsonb_build_object('key','exact-email','kind','draft_email','input',jsonb_build_object('provider','gmail','to','thomas@example.test','record_id',rec,'subject','Suivi','body','Bonjour Thomas')));
 if a->>'account_id'<>i::text or a->>'account_email'<>'confirm-owner@example.test' then raise exception 'Preview did not bind sender';end if;
 original_digest:=a->>'confirmation_digest';
 execute 'reset role';
 -- Association cleanup retains the original authorized scope/digest.
 original_digest:=a->>'confirmation_digest';
 delete from public.ai_conversations where id=conv;
 delete from relay_private.agent_runs where id=(r->>'id')::uuid;
 if exists(select 1 from relay_private.agent_actions x where x.origin_run_id=(r->>'id')::uuid and x.run_id is not null) then raise exception 'Run retention could not unlink actions';end if;
 begin update relay_private.agent_actions set input=jsonb_set(input,'{to}','"evil@example.test"') where id=(a->>'id')::uuid;raise exception 'Recipient changed after preview';exception when serialization_failure then null;end;
 begin update relay_private.agent_actions set source_refs='[]',account_id=gen_random_uuid() where id=(a->>'id')::uuid;raise exception 'Account changed after preview';exception when serialization_failure then null;end;
 execute 'set local role authenticated';
 outcome:=public.agent_apply(w,(a->>'id')::uuid,original_digest);
 execute 'reset role';
 begin update relay_private.agent_actions set input=jsonb_set(input,'{body}','"hidden different content"') where id=(a->>'id')::uuid;raise exception 'Content changed after confirmation';exception when serialization_failure then null;end;
 if (select count(*) from relay_private.workflow_outbox where agent_action_id=(a->>'id')::uuid)<>1 then raise exception 'Wrong outbox count';end if;
 -- Expiry is checked immediately before provider dispatch, not only at approval.
 select job_id into j from relay_private.agent_actions where id=(a->>'id')::uuid;
 fixture_lease:=gen_random_uuid();update relay_private.jobs set status='running',lease=fixture_lease,leased_until=now()+interval '3 minutes' where id=j;
 execute 'alter table relay_private.agent_actions disable trigger agent_scope';
 update relay_private.agent_actions set confirmation_expires_at=now()-interval '1 second' where id=(a->>'id')::uuid;
 update relay_private.agent_actions x set confirmation_digest=relay_private.agent_action_digest(x),confirmed_digest=relay_private.agent_action_digest(x) where id=(a->>'id')::uuid;
 execute 'alter table relay_private.agent_actions enable trigger agent_scope';
 execute 'set local role service_role';
 begin perform public.agent_effect_worker('prepare',jsonb_build_object('job_id',j,'lease',fixture_lease));raise exception 'Expired approval dispatched';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if (select status from relay_private.workflow_outbox where agent_action_id=(a->>'id')::uuid)<>'pending' then raise exception 'Expired approval attempted network';end if;
 -- Current permissions and data are authoritative after the card was shown.
 execute 'set local role authenticated';
 a:=public.agent_action(w,'propose',jsonb_build_object('key','revoked-role','kind','create_task','input',jsonb_build_object('title','Must not run')));
 execute 'reset role';update public.memberships set role='viewer' where workspace_id=w and user_id=u;
 execute 'set local role authenticated';
 begin perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');raise exception 'Revoked permissions accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';update public.memberships set role='owner' where workspace_id=w and user_id=u;
 execute 'set local role authenticated';
 a:=public.agent_action(w,'propose',jsonb_build_object('key','changed-recipient','kind','draft_email','input',jsonb_build_object('provider','gmail','to','thomas@example.test','record_id',rec,'subject','Suivi','body','Bonjour')));
 execute 'reset role';update public.records set email='new@example.test' where id=rec;
 execute 'set local role authenticated';
 begin perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');raise exception 'Changed contact destination accepted';exception when serialization_failure then null;end;
 execute 'reset role';update public.records set email='thomas@example.test' where id=rec;
 execute 'set local role authenticated';
 a:=public.agent_action(w,'propose',jsonb_build_object('key','quota-check','kind','draft_email','input',jsonb_build_object('provider','gmail','to','thomas@example.test','subject','Suivi','body','Bonjour')));
 execute 'reset role';insert into relay_private.workflow_io_usage(workspace_id,day,kind,attempts) values(w,(now() at time zone 'UTC')::date,'email',200);
 execute 'set local role authenticated';
 begin perform public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');raise exception 'Exhausted quota confirmed';exception when insufficient_resources then null;end;
 perform public.agent_confirmation_denied(w,(a->>'id')::uuid);
 execute 'reset role';
 -- Recheck after Graph draft preparation and immediately before /send.
 update relay_private.workflow_io_usage set attempts=0 where workspace_id=w and kind='email';
 execute 'set local role authenticated';
 a:=public.agent_action(w,'propose',jsonb_build_object('key','last-moment-revoke','kind','draft_email','input',jsonb_build_object('provider','gmail','to','thomas@example.test','subject','Suivi','body','Bonjour')));
 outcome:=public.agent_apply(w,(a->>'id')::uuid,a->>'confirmation_digest');
 execute 'reset role';
 select job_id into j from relay_private.agent_actions where id=(a->>'id')::uuid;
 fixture_lease:=gen_random_uuid();update relay_private.jobs set status='running',lease=fixture_lease,leased_until=now()+interval '3 minutes' where id=j;
 execute 'set local role service_role';
 perform public.agent_effect_worker('prepare',jsonb_build_object('job_id',j,'lease',fixture_lease));
 perform public.agent_effect_worker('verify_dispatch',jsonb_build_object('job_id',j,'lease',fixture_lease));
 execute 'reset role';update public.memberships set role='viewer' where workspace_id=w and user_id=u;
 execute 'set local role service_role';
 begin perform public.agent_effect_worker('verify_dispatch',jsonb_build_object('job_id',j,'lease',fixture_lease));raise exception 'Revocation after draft preparation ignored';exception when insufficient_privilege then null;end;
 execute 'reset role';
 if not exists(select 1 from public.audit_events where workspace_id=w and entity='agent_actions' and action='refused' and private_to=u) or not exists(select 1 from public.audit_events where workspace_id=w and entity='agent_actions' and action='authorized' and private_to=u) or not exists(select 1 from public.audit_events where workspace_id=w and action='confirmation_denied') then raise exception 'Authorization audit missing';end if;
 if exists(select 1 from public.audit_events where workspace_id=w and entity='agent_actions' and coalesce(after_data::text,'') like '%Bonjour%') then raise exception 'Audit logged email body';end if;
 raise notice 'Exact confirmation, source suggestions, refusals, immutable scope, expiry, revocation, quota and audit passed.';
end $$;
rollback;
