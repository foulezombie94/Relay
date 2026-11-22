-- MCP 1.2: crm:admin consent, Client ID Metadata Documents, new confirmed proposals
-- (lists, commitments, workflow drafts, field, merge, pipeline stages) and duplicates.
-- Fixtures roll back.
begin;
do $$
declare u uuid:=gen_random_uuid();m uuid:=gen_random_uuid();w uuid;obj uuid;rec uuid;dup_a uuid;dup_b uuid;lst uuid;com uuid;pipe public.pipelines;
 client_id uuid;doc_client uuid;flow text:=repeat('c',64);code text:=repeat('d',64);access_hash text:=repeat('e',64);refresh_hash text:=repeat('f',64);
 member_flow text:=repeat('1',64);member_code text:=repeat('2',64);
 resource text:='https://zyliad.example.test/api/mcp';redirect_uri text:='http://127.0.0.1:45679/callback';challenge text:=repeat('a',43);
 doc_url text:='https://client.example.test/oauth/client.json';r jsonb;a jsonb;v_a integer;v_b integer;
begin
 insert into auth.users(id,email) values(u,'mcp-ext-owner@example.test'),(m,'mcp-ext-member@example.test');
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('MCP extended');
 insert into public.memberships(workspace_id,user_id,role,display_name) values(w,m,'member','Member');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Fiche liste') returning id into rec;
 insert into public.records(workspace_id,object_id,display_name,email) values(w,obj,'Jeanne Martin','jeanne.martin@example.test') returning id into dup_a;
 insert into public.records(workspace_id,object_id,display_name,email) values(w,obj,'Jeanne Martin','jeanne.martin@example.test') returning id into dup_b;
 insert into public.lists(workspace_id,object_id,name) values(w,obj,'Liste MCP') returning id into lst;
 insert into public.commitments(workspace_id,record_id,title,status) values(w,rec,'Envoyer le devis','confirmed') returning id into com;

 execute 'set local role service_role';
 -- Client ID Metadata Documents: HTTPS URL only, upsert keeps one client, resolve maps it.
 r:=public.mcp_client_document('upsert',jsonb_build_object('url','http://client.example.test/c.json','client_name','X','redirect_uris',jsonb_build_array(redirect_uri)));
 if r->>'error'<>'invalid_client' then raise exception 'Non-HTTPS metadata URL accepted';end if;
 r:=public.mcp_client_document('upsert',jsonb_build_object('url',doc_url,'rate_limit_key',repeat('9',64),'client_name','Client document','redirect_uris',jsonb_build_array(redirect_uri)));
 doc_client:=(r->>'client_id')::uuid;
 if doc_client is null then raise exception 'Metadata client not stored: %',r;end if;
 r:=public.mcp_client_document('upsert',jsonb_build_object('url',doc_url,'rate_limit_key',repeat('9',64),'client_name','Client renommé','redirect_uris',jsonb_build_array(redirect_uri,'https://client.example.test/cb')));
 if (r->>'client_id')::uuid<>doc_client then raise exception 'Metadata client duplicated';end if;
 execute 'reset role';
 if (select name from relay_private.mcp_clients where id=doc_client)<>'Client renommé' then raise exception 'Metadata document not refreshed';end if;
 execute 'set local role service_role';
 r:=public.mcp_client_document('resolve',jsonb_build_object('url',doc_url));
 if (r->>'client_id')::uuid<>doc_client then raise exception 'Metadata client not resolved';end if;
 r:=public.mcp_client_document('resolve',jsonb_build_object('url','https://unknown.example.test/c.json'));
 if r->>'error'<>'invalid_client' then raise exception 'Unknown metadata client resolved';end if;
 execute 'reset role';
 execute 'set local role authenticated';
 begin perform public.mcp_client_document('resolve',jsonb_build_object('url',doc_url));raise exception 'Browser can call metadata RPC';exception when insufficient_privilege then null;end;
 execute 'reset role';

 -- crm:admin: only owners/admins, and only together with crm:write.
 execute 'set local role service_role';
 r:=public.mcp_oauth('register',jsonb_build_object('rate_limit_key',repeat('8',64),'client_name','Extended fixture','redirect_uris',jsonb_build_array(redirect_uri)));client_id:=(r->>'client_id')::uuid;
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',repeat('8',64),'flow_hash',member_flow,'client_id',client_id,'redirect_uri',redirect_uri,'state','s','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read','crm:write','crm:admin')));
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',repeat('8',64),'flow_hash',flow,'client_id',client_id,'redirect_uri',redirect_uri,'state','s','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read','commitments:read','configuration:read','crm:write','crm:admin')));
 if r ? 'error' then raise exception 'Begin failed: %',r;end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',m::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.mcp_consent(member_flow,w,array['records:read','crm:write','crm:admin'],member_code,true);raise exception 'Member granted crm:admin';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.mcp_consent(flow,w,array['records:read','crm:admin'],code,true);raise exception 'crm:admin without crm:write';exception when insufficient_privilege then null;end;
 r:=public.mcp_consent(flow,w,array['records:read','commitments:read','configuration:read','crm:write','crm:admin'],code,true);
 execute 'set local role service_role';
 r:=public.mcp_oauth('exchange',jsonb_build_object('rate_limit_key',repeat('8',64),'code_hash',code,'client_id',client_id,'redirect_uri',redirect_uri,'resource',resource,'challenge',challenge,'access_hash',access_hash,'new_refresh_hash',refresh_hash));
 if r ? 'error' then raise exception 'Exchange failed: %',r;end if;

 -- Duplicates read: existing candidate pairs under RLS.
 r:=public.mcp_request(access_hash,'duplicates',jsonb_build_object('resource',resource,'object_id',obj));
 if r ? 'error' or r::text not like '%'||dup_a::text||'%' then raise exception 'Duplicate candidates missing: %',r;end if;
 r:=public.mcp_request(access_hash,'duplicates',jsonb_build_object('resource',resource,'workspace_id',gen_random_uuid()));
 if r->>'error'<>'validation_error' then raise exception 'Unexpected duplicates parameter accepted';end if;

 -- Proposals stay pending until the human approves them in Zyliad.
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','add_to_list','request_id',gen_random_uuid(),'values',jsonb_build_object('list_id',lst,'record_id',rec)));
 execute 'reset role';
 if exists(select 1 from public.list_entries where list_id=lst) then raise exception 'List write executed before confirmation';end if;
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if r->>'status'<>'executed' or not exists(select 1 from public.list_entries where list_id=lst and record_id=rec) then raise exception 'add_to_list failed: %',r;end if;
 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','remove_from_list','request_id',gen_random_uuid(),'values',jsonb_build_object('list_id',lst,'record_id',rec)));
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if exists(select 1 from public.list_entries where list_id=lst and record_id=rec) then raise exception 'remove_from_list failed';end if;

 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','update_commitment','request_id',gen_random_uuid(),'values',jsonb_build_object('id',com,'version',99,'values',jsonb_build_object('status','in_progress'))));
 execute 'set local role authenticated';
 begin perform public.mcp_manage(w,'approve',(a->>'id')::uuid);raise exception 'Stale commitment version accepted';exception when serialization_failure then null;end;
 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','update_commitment','request_id',gen_random_uuid(),'values',jsonb_build_object('id',com,'version',(select version from public.commitments where id=com),'values',jsonb_build_object('status','in_progress'))));
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if (select status from public.commitments where id=com)<>'in_progress' then raise exception 'update_commitment failed: %',r;end if;

 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_workflow_draft','request_id',gen_random_uuid(),'values',jsonb_build_object('name','Relance MCP','description','Brouillon','definition',jsonb_build_object('object_id',obj,'trigger',jsonb_build_object('type','manual'),'conditions','[]'::jsonb,'actions',jsonb_build_array(jsonb_build_object('type','task','title','Relancer'))))));
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if not exists(select 1 from public.workflows where id=(r->>'record_id')::uuid and not enabled and name='Relance MCP') then raise exception 'Workflow draft not created disabled: %',r;end if;

 -- Administrative proposals: crm:admin and owner/admin role required, executed by approval.
 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_attribute','request_id',gen_random_uuid(),'values',jsonb_build_object('object_id',obj,'key','score_mcp','name','Score MCP','type','number')));
 if a->>'status'<>'pending' then raise exception 'Admin proposal refused: %',a;end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',m::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.mcp_manage(w,'approve',(a->>'id')::uuid);raise exception 'Member approved another user proposal';exception when insufficient_privilege then null;end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if not exists(select 1 from public.attributes where workspace_id=w and object_id=obj and key='score_mcp' and type='number') then raise exception 'create_attribute failed: %',r;end if;

 execute 'reset role';
 select version into v_a from public.records where id=dup_a;select version into v_b from public.records where id=dup_b;
 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','merge_records','request_id',gen_random_uuid(),'values',jsonb_build_object('source_id',dup_a,'target_id',dup_b,'source_version',v_a,'target_version',v_b,'choices','{}'::jsonb)));
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if r->>'status'<>'executed' or not (select archived from public.records where id=dup_a) or (select archived from public.records where id=dup_b) then raise exception 'merge_records failed: %',r;end if;

 execute 'reset role';
 select * into pipe from public.pipelines where workspace_id=w order by created_at limit 1;
 if pipe.id is null then insert into public.pipelines(workspace_id,name,stages) values(w,'Ventes','["Nouveau","Gagné"]') returning * into pipe;end if;
 execute 'set local role service_role';
 a:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','save_pipeline_stages','request_id',gen_random_uuid(),'values',jsonb_build_object('pipeline_id',pipe.id,'version',pipe.version,'name','Ventes MCP','stages',pipe.stages,'labels',pipe.labels,'probabilities',pipe.probabilities,'moves','{}'::jsonb)));
 execute 'set local role authenticated';
 r:=public.mcp_manage(w,'approve',(a->>'id')::uuid);
 if (select name from public.pipelines where id=pipe.id)<>'Ventes MCP' then raise exception 'save_pipeline_stages failed: %',r;end if;

 -- Without crm:admin, administrative actions are refused even for an owner.
 execute 'reset role';
 update relay_private.mcp_connections set scopes=array['records:read','crm:write'] where id=(select connection_id from relay_private.mcp_tokens where token_hash=access_hash);
 execute 'set local role service_role';
 r:=public.mcp_request(access_hash,'prepare',jsonb_build_object('resource',resource,'action','create_attribute','request_id',gen_random_uuid(),'values',jsonb_build_object('object_id',obj,'key','other_field','name','Autre','type','text')));
 if r->>'error'<>'forbidden' then raise exception 'Admin action without crm:admin: %',r;end if;
 r:=public.mcp_request(access_hash,'duplicates',jsonb_build_object('resource',resource));
 if r ? 'error' then raise exception 'Duplicates read refused with records:read: %',r;end if;
 execute 'reset role';
 raise notice 'MCP extended: crm:admin consent, metadata documents, list/commitment/workflow proposals, field, merge, pipeline stages and duplicates passed.';
end $$;
rollback;
