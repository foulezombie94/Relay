-- Security audit ZY-03: destructive and administrative proposals cannot be approved with
-- the MCP token, only by a signed-in member in Zyliad. The MCP client can still reject
-- them and still approve ordinary proposals. Fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid();w uuid;obj uuid;rec uuid;lst uuid;client_id uuid;
 flow text:=repeat('c',64);code text:=repeat('d',64);access_hash text:=repeat('e',64);refresh_hash text:=repeat('f',64);
 resource text:='https://zyliad.example.test/api/mcp';redirect_uri text:='http://127.0.0.1:45681/callback';challenge text:=repeat('a',43);
 r jsonb;a jsonb;b jsonb;t jsonb;act text;
begin
 -- The list matches every action allowed in mcp_commands, sensitive ones only.
 foreach act in array array['merge_records','remove_from_list','save_pipeline_stages','create_attribute'] loop
  if not relay_private.mcp_app_confirmation(act) then raise exception '% must be confirmed in Zyliad',act;end if;
 end loop;
 foreach act in array array['create_record','update_record','create_task','update_task','create_note','update_note','add_to_list','update_commitment','create_workflow_draft','update_workflow_draft'] loop
  if relay_private.mcp_app_confirmation(act) then raise exception '% should stay approvable from MCP',act;end if;
 end loop;

 insert into auth.users(id,email) values(u,'mcp-app-confirm-owner@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('MCP app confirmation');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Fiche liste') returning id into rec;
 insert into public.lists(workspace_id,object_id,name) values(w,obj,'Liste sensible') returning id into lst;
 insert into public.list_entries(workspace_id,list_id,record_id) values(w,lst,rec);

 execute 'set local role service_role';
 r:=public.mcp_oauth('register',jsonb_build_object('rate_limit_key',repeat('7',64),'client_name','App confirmation fixture','redirect_uris',jsonb_build_array(redirect_uri)));client_id:=(r->>'client_id')::uuid;
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',repeat('7',64),'flow_hash',flow,'client_id',client_id,'redirect_uri',redirect_uri,'state','s','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read','configuration:read','crm:write','crm:admin')));
 execute 'set local role authenticated';
 r:=public.mcp_consent(flow,w,array['records:read','configuration:read','crm:write','crm:admin'],code,true);
 execute 'set local role service_role';
 r:=public.mcp_oauth('exchange',jsonb_build_object('rate_limit_key',repeat('7',64),'code_hash',code,'client_id',client_id,'redirect_uri',redirect_uri,'resource',resource,'challenge',challenge,'access_hash',access_hash,'new_refresh_hash',refresh_hash));
 if r ? 'error' then raise exception 'Exchange failed: %',r;end if;

 -- Destructive: removing a record from a list cannot be approved by the token, even
 -- with crm:write and crm:admin. Nothing is written and the proposal stays pending.
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','remove_from_list','request_id',gen_random_uuid(),'values',jsonb_build_object('list_id',lst,'record_id',rec)));
 if a->>'status'<>'pending' then raise exception 'Proposal not pending: %',a;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',a->>'id'));
 if r->>'error' is distinct from 'confirm_in_app' then raise exception 'MCP approved remove_from_list: %',r;end if;
 execute 'reset role';
 if not exists(select 1 from public.list_entries where list_id=lst and record_id=rec) then raise exception 'List entry removed without Zyliad confirmation';end if;
 if (select status from relay_private.mcp_commands where id=(a->>'id')::uuid)<>'pending' then raise exception 'Blocked proposal changed status';end if;

 -- Administrative: a new field cannot be approved by the token either.
 execute 'set local role service_role';
 b:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_attribute','request_id',gen_random_uuid(),'values',jsonb_build_object('object_id',obj,'key','score_audit','name','Score audit','type','number')));
 if b->>'status'<>'pending' then raise exception 'Admin proposal not pending: %',b;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',b->>'id'));
 if r->>'error' is distinct from 'confirm_in_app' then raise exception 'MCP approved create_attribute: %',r;end if;
 execute 'reset role';
 if exists(select 1 from public.attributes where workspace_id=w and key='score_audit') then raise exception 'Field created without Zyliad confirmation';end if;

 -- The owner, signed in to Zyliad, confirms the same proposal: it runs.
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(b->>'id')::uuid);
 if r->>'status'<>'executed' then raise exception 'In-app approval failed: %',r;end if;
 execute 'reset role';
 if not exists(select 1 from public.attributes where workspace_id=w and key='score_audit') then raise exception 'In-app approval did not create the field';end if;

 -- The MCP client can still reject a sensitive proposal.
 execute 'set local role service_role';
 r:=public.mcp_request(access_hash,'reject',jsonb_build_object('resource',resource,'command_id',a->>'id'));
 if r->>'status'<>'rejected' then raise exception 'MCP rejection of a sensitive proposal failed: %',r;end if;
 execute 'reset role';
 if not exists(select 1 from public.list_entries where list_id=lst and record_id=rec) then raise exception 'Rejected removal was executed';end if;

 -- Ordinary proposals keep the client-side approval.
 execute 'set local role service_role';
 t:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_task','request_id',gen_random_uuid(),'values',jsonb_build_object('title','Tâche ordinaire')));
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',t->>'id'));
 if r->>'status'<>'executed' then raise exception 'Ordinary approval from MCP broken: %',r;end if;
 execute 'reset role';
 if not exists(select 1 from public.tasks where workspace_id=w and title='Tâche ordinaire') then raise exception 'Ordinary task not created';end if;

 -- Each refusal is audited.
 if (select count(*) from relay_private.mcp_audit where action='approve' and result='confirm_in_app'
     and connection_id=(select connection_id from relay_private.mcp_tokens where token_hash=access_hash))<>2 then
  raise exception 'Blocked approvals not audited';
 end if;

 -- The helper is not callable by browsers.
 execute 'set local role authenticated';
 begin perform relay_private.mcp_app_confirmation('merge_records');raise exception 'Browser can call mcp_app_confirmation';exception when insufficient_privilege then null;end;
 execute 'reset role';
 raise notice 'MCP app confirmation: sensitive approvals blocked, in-app approval, MCP rejection, ordinary approval and audit passed.';
end $$;
rollback;
