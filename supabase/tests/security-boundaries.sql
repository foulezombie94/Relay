-- Browser/RPC and public OAuth regression checks. Local synthetic data; rollback.
begin;
set local statement_timeout='30s';
do $$
declare
 u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); w uuid; obj uuid; rec uuid; portal uuid;
 r jsonb; cid uuid; connection_id uuid; envelope text:='synthetic encrypted fixture';
 schema_name text; signature text;
 state_hash text:=repeat('a',64); flow text:=repeat('1',64); code text:=repeat('2',64);
 source_a text:=repeat('a',64); source_b text:=repeat('b',64);
 access_hash text:=repeat('3',64); refresh_hash text:=repeat('4',64);
 resource text:='https://zyliad.example.test/api/mcp'; redirect_uri text:='http://127.0.0.1:45678/callback';challenge text:=repeat('a',43);
begin
 insert into auth.users(id,email,email_confirmed_at) values(u,'security-owner@example.invalid',now()),(outsider,'security-guest@example.invalid',now());
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 w:=public.create_workspace('Security boundary fixture');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name) values(w,obj,'Synthetic client') returning id into rec;
 insert into public.portals(workspace_id,record_id,name) values(w,rec,'Private fixture') returning id into portal;
 insert into public.portal_members(workspace_id,portal_id,email) values(w,portal,'security-guest@example.invalid');
 insert into public.portal_items(workspace_id,portal_id,title,content) values(w,portal,'Private','Synthetic private content');

 -- The portal hypothesis is already blocked by the audit trigger. Do not weaken
 -- this guard while retaining signup without email confirmation.
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.claim_invitations();raise exception 'Outsider portal claim allowed';
 exception when raise_exception then if sqlerrm<>'Forbidden' then raise;end if;end;
 if exists(select 1 from public.portal_items where portal_id=portal) then raise exception 'Outsider reads portal';end if;
 execute 'reset role';
 if exists(select 1 from public.portal_members where portal_id=portal and user_id is not null) then raise exception 'Rejected claim mutated binding';end if;

 -- Check both the public API wrapper and the private implementation grants.
 foreach schema_name in array array['public','relay_private'] loop
  foreach signature in array array['integration_get(uuid,text)','integration_oauth_begin(uuid,text,text)','integration_oauth_consume(uuid,text,text)','integration_save(uuid,text,text,text,text[],text)','integration_refresh_claim(uuid,text,bigint)','integration_refresh_finish(uuid,text,bigint,text,text[])'] loop
   if has_function_privilege('authenticated',schema_name||'.'||signature,'EXECUTE') or has_function_privilege('anon',schema_name||'.'||signature,'EXECUTE') then raise exception 'Browser credential grant survived: %.%',schema_name,signature;end if;
  end loop;
 end loop;
 execute 'set local role service_role';
 begin perform public.integration_server(w,'gmail',outsider,'integration_get');raise exception 'Server ignored tenant membership';exception when insufficient_privilege then null;end;
 perform public.integration_server(w,'gmail',u,'integration_oauth_begin',jsonb_build_object('state_hash',state_hash));
 r:=public.integration_server(w,'gmail',u,'integration_oauth_consume',jsonb_build_object('state_hash',state_hash));
 if r<>'true'::jsonb then raise exception 'Server OAuth state not consumed';end if;
 perform public.integration_server(w,'gmail',u,'integration_save',jsonb_build_object('mail','fixture@example.invalid','encrypted',envelope,'permissions',jsonb_build_array('fixture'),'oauth_hash',state_hash));
 r:=public.integration_server(w,'gmail',u,'integration_get');
 if r->>'encrypted_tokens'<>envelope then raise exception 'Server credential retrieval broken';end if;
 r:=public.integration_worker(w,'gmail',u,'integration_get');
 if r->>'encrypted_tokens'<>envelope then raise exception 'Worker credential retrieval broken';end if;
 execute 'set local role authenticated';
 begin perform public.integration_get(w,'gmail');raise exception 'Browser read ciphertext';exception when insufficient_privilege then null;end;
 begin perform public.integration_oauth_begin(w,'gmail',state_hash);raise exception 'Browser manufactured OAuth state';exception when insufficient_privilege then null;end;
 begin perform public.integration_server(w,'gmail',u,'integration_get');raise exception 'Browser called privileged gateway';exception when insufficient_privilege then null;end;
 execute 'reset role';
 update public.memberships set role='viewer' where workspace_id=w and user_id=u;
 execute 'set local role service_role';
 begin perform public.integration_server(w,'gmail',u,'integration_get');raise exception 'Downgraded member read credentials';exception when insufficient_privilege then null;end;
 execute 'reset role';update public.memberships set role='owner' where workspace_id=w and user_id=u;

 -- Synthetic OAuth controls. No credentials or third-party APIs are involved.
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role service_role';
 r:=public.mcp_oauth('register',jsonb_build_object('rate_limit_key',source_b,'client_name','Security fixture','redirect_uris',jsonb_build_array(redirect_uri)));
 cid:=(r->>'client_id')::uuid;
 r:=public.mcp_oauth('begin',jsonb_build_object('rate_limit_key',source_b,'flow_hash',flow,'client_id',cid,'redirect_uri',redirect_uri,'state','fixture','code_challenge',challenge,'resource',resource,'scope',jsonb_build_array('records:read')));
 if r ? 'error' then raise exception 'OAuth begin failed: %',r;end if;
 execute 'set local role authenticated';
 r:=public.mcp_consent(flow,w,array['records:read'],code,true);
 execute 'set local role service_role';
 r:=public.mcp_oauth('exchange',jsonb_build_object('rate_limit_key',source_b,'code_hash',code,'client_id',cid,'redirect_uri',redirect_uri,'resource',resource,'challenge',challenge,'access_hash',access_hash,'new_refresh_hash',refresh_hash));
 if r ? 'error' then raise exception 'Valid exchange failed: %',r;end if;
 for i in 1..240 loop
  r:=public.mcp_oauth('refresh',jsonb_build_object('rate_limit_key',source_a,'refresh_hash',repeat('f',64),'client_id',cid,'resource',resource,'access_hash',repeat('5',64),'new_refresh_hash',repeat('6',64)));
  if r->>'error' is distinct from 'invalid_grant' then raise exception 'Invalid grant changed unexpectedly: %',r;end if;
 end loop;
 r:=public.mcp_oauth('refresh',jsonb_build_object('rate_limit_key',source_a,'refresh_hash',refresh_hash,'client_id',cid,'resource',resource,'access_hash',repeat('7',64),'new_refresh_hash',repeat('8',64)));
 if r->>'error' is distinct from 'rate_limited' then raise exception 'Abusive source was not throttled';end if;
 -- The 429 must not consume this valid refresh or affect another source.
 r:=public.mcp_oauth('refresh',jsonb_build_object('rate_limit_key',source_b,'refresh_hash',refresh_hash,'client_id',cid,'resource',resource,'access_hash',repeat('7',64),'new_refresh_hash',repeat('8',64)));
 if r ? 'error' then raise exception 'Invalid requests blocked another source valid refresh: %',r;end if;
 execute 'reset role';
 select t.connection_id into connection_id from relay_private.mcp_tokens t where t.token_hash=access_hash;
 if (select requests from relay_private.mcp_buckets where name='oauth:connection:refresh:'||connection_id::text)<>1 then raise exception 'Invalid grant spent connection budget';end if;
 -- Connection throttles must not suppress refresh reuse detection/revocation.
 update relay_private.mcp_buckets set requests=60 where name='oauth:connection:refresh:'||connection_id::text;
 execute 'set local role service_role';
 r:=public.mcp_oauth('refresh',jsonb_build_object('rate_limit_key',source_b,'refresh_hash',refresh_hash,'client_id',cid,'resource',resource,'access_hash',repeat('9',64),'new_refresh_hash',repeat('0',64)));
 if r->>'error' is distinct from 'invalid_grant' then raise exception 'Refresh reuse defense suppressed by throttle';end if;
 execute 'reset role';
 if not exists(select 1 from relay_private.mcp_connections where id=connection_id and revoked_at is not null) then raise exception 'Refresh reuse did not revoke family';end if;
 raise notice 'PASS security boundaries: outsider portal claim blocked; browser credential RPC denial; server/worker and live membership; isolated OAuth source/connection throttles; 429 preserves grant; refresh reuse revokes family.';
end $$;
rollback;
