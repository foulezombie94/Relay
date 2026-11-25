-- Client ID Metadata Documents: the outgoing fetch is admitted from its own rate-limit
-- budget before it happens (20 per source per minute), separately from the store
-- budget. Fixtures roll back.
begin;
do $$
declare r jsonb;i integer;source text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');url text:='https://client.example.test/oauth/admission.json';
begin
 execute 'set local role service_role';
 for i in 1..20 loop
  r:=public.mcp_client_document('admit',jsonb_build_object('url',url,'rate_limit_key',source));
  if r->>'admitted' is distinct from 'true' then raise exception 'Admission % refused: %',i,r;end if;
 end loop;
 r:=public.mcp_client_document('admit',jsonb_build_object('url',url,'rate_limit_key',source));
 if r->>'error' is distinct from 'rate_limited' then raise exception '21st fetch admitted: %',r;end if;
 -- Another source keeps its own budget.
 r:=public.mcp_client_document('admit',jsonb_build_object('url',url,'rate_limit_key',source||'0'));
 if r->>'admitted' is distinct from 'true' then raise exception 'Other source refused: %',r;end if;
 -- The store budget is separate: an admitted document can still be stored.
 r:=public.mcp_client_document('upsert',jsonb_build_object('url',url,'rate_limit_key',source,'client_name','Admission','redirect_uris',jsonb_build_array('http://127.0.0.1:45682/callback')));
 if r->>'client_id' is null then raise exception 'Store refused after admission: %',r;end if;
 r:=public.mcp_client_document('admit',jsonb_build_object('url','http://client.example.test/x.json','rate_limit_key',source));
 if r->>'error' is distinct from 'invalid_client' then raise exception 'Non-HTTPS URL admitted: %',r;end if;
 r:=public.mcp_client_document('unknown',jsonb_build_object('url',url));
 if r->>'error' is distinct from 'invalid_request' then raise exception 'Unknown operation accepted: %',r;end if;
 execute 'set local role authenticated';
 begin perform public.mcp_client_document('admit',jsonb_build_object('url',url));raise exception 'Browser can call mcp_client_document';exception when insufficient_privilege then null;end;
 execute 'reset role';
 raise notice 'MCP client document admission: budget, per-source isolation, store and grants passed.';
end $$;
rollback;
