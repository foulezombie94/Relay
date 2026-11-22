-- MCP 1.4: a proposal is approved or rejected with the connection's own token, from the
-- MCP client, without opening Zyliad. Same checks as the in-app approval. Fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid();w uuid;obj uuid;client_id uuid;other_flow text:=repeat('3',64);other_code text:=repeat('4',64);
 flow text:=repeat('c',64);code text:=repeat('d',64);access_hash text:=repeat('e',64);refresh_hash text:=repeat('f',64);
 other_access text:=repeat('5',64);other_refresh text:=repeat('6',64);
 resource text:='https://zyliad.example.test/api/mcp';redirect_uri text:='http://127.0.0.1:45680/callback';challenge text:=repeat('a',43);
 r jsonb;a jsonb;b jsonb;
begin
 insert into auth.users(id,email) values(u,'mcp-confirm-owner@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('MCP confirmation');
 select id into obj from public.objects where workspace_id=w and slug='people';

 execute 'set local role service_role';
 r:=public.mcp_oauth('register',jsonb_build_object('rate_limit_key',repeat('7',64),'client_name','Confirmation fixture','redirect_uris',jsonb_build_array(redirect_uri)));client_id:=(r->>'client_id')::uuid;
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',repeat('7',64),'flow_hash',flow,'client_id',client_id,'redirect_uri',redirect_uri,'state','s','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read','tasks:read','crm:write')));
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',repeat('7',64),'flow_hash',other_flow,'client_id',client_id,'redirect_uri',redirect_uri,'state','s','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read','crm:write')));
 execute 'set local role authenticated';
 r:=public.mcp_consent(flow,w,array['records:read','tasks:read','crm:write'],code,true);
 r:=public.mcp_consent(other_flow,w,array['records:read','crm:write'],other_code,true);
 execute 'set local role service_role';
 r:=public.mcp_oauth('exchange',jsonb_build_object('rate_limit_key',repeat('7',64),'code_hash',code,'client_id',client_id,'redirect_uri',redirect_uri,'resource',resource,'challenge',challenge,'access_hash',access_hash,'new_refresh_hash',refresh_hash));
 if r ? 'error' then raise exception 'Exchange failed: %',r;end if;
 r:=public.mcp_oauth('exchange',jsonb_build_object('rate_limit_key',repeat('7',64),'code_hash',other_code,'client_id',client_id,'redirect_uri',redirect_uri,'resource',resource,'challenge',challenge,'access_hash',other_access,'new_refresh_hash',other_refresh));
 if r ? 'error' then raise exception 'Second exchange failed: %',r;end if;

 -- Approve from the MCP client: the task exists only after the approval.
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_task','request_id',gen_random_uuid(),'values',jsonb_build_object('title','Rappeler Jeanne')));
 if a->>'status'<>'pending' then raise exception 'Proposal not pending: %',a;end if;
 execute 'reset role';
 if exists(select 1 from public.tasks where workspace_id=w and title='Rappeler Jeanne') then raise exception 'Task written before approval';end if;
 execute 'set local role service_role';
 -- Another connection of the same user cannot decide this proposal.
 r:=public.mcp_request(other_access,'approve',jsonb_build_object('resource',resource,'command_id',a->>'id'));
 if r->>'error'<>'not_found' then raise exception 'Other connection decided the proposal: %',r;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id','not-a-uuid'));
 if r->>'error'<>'validation_error' then raise exception 'Invalid command id accepted: %',r;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',a->>'id','extra',true));
 if r->>'error'<>'validation_error' then raise exception 'Unexpected parameter accepted: %',r;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',a->>'id'));
 if r->>'status'<>'executed' then raise exception 'Approval from MCP failed: %',r;end if;
 execute 'reset role';
 if (select count(*) from public.tasks where workspace_id=w and title='Rappeler Jeanne')<>1 then raise exception 'Task not created by the approval';end if;
 execute 'set local role service_role';
 -- A second approval changes nothing.
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',a->>'id'));
 if r->>'status'<>'executed' then raise exception 'Repeated approval: %',r;end if;
 execute 'reset role';
 if (select count(*) from public.tasks where workspace_id=w and title='Rappeler Jeanne')<>1 then raise exception 'Repeated approval duplicated the task';end if;
 execute 'set local role service_role';

 -- Reject from the MCP client: nothing is written and the proposal cannot be approved later.
 b:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_task','request_id',gen_random_uuid(),'values',jsonb_build_object('title','Tâche refusée')));
 r:=public.mcp_request(access_hash,'reject',jsonb_build_object('resource',resource,'command_id',b->>'id'));
 if r->>'status'<>'rejected' then raise exception 'Rejection from MCP failed: %',r;end if;
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',b->>'id'));
 if r->>'status'<>'rejected' then raise exception 'Rejected proposal approved: %',r;end if;
 execute 'reset role';
 if exists(select 1 from public.tasks where workspace_id=w and title='Tâche refusée') then raise exception 'Rejected task written';end if;

 -- Without crm:write the token cannot decide anything.
 b:=null;
 execute 'set local role service_role';
 b:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_task','request_id',gen_random_uuid(),'values',jsonb_build_object('title','Sans droit')));
 execute 'reset role';
 update relay_private.mcp_connections set scopes=array['records:read'] where id=(select connection_id from relay_private.mcp_tokens where token_hash=access_hash);
 execute 'set local role service_role';
 r:=public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',b->>'id'));
 if r->>'error' is null then raise exception 'Approval without crm:write: %',r;end if;
 execute 'reset role';
 if exists(select 1 from public.tasks where workspace_id=w and title='Sans droit') then raise exception 'Task written without crm:write';end if;

 -- Browsers cannot call the token RPC.
 execute 'set local role authenticated';
 begin perform public.mcp_request(access_hash,'approve',jsonb_build_object('resource',resource,'command_id',b->>'id'));raise exception 'Browser can call mcp_request';exception when insufficient_privilege then null;end;
 execute 'reset role';
 raise notice 'MCP client confirmation: approve, reject, idempotence, connection isolation and scopes passed.';
end $$;
rollback;
