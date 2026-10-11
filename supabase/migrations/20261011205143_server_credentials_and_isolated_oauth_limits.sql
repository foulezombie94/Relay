begin;

-- Legacy envelopes remain readable only by the server. Never grant a browser
-- access to the ciphertext or the ability to manufacture an OAuth completion.
create or replace function public.integration_server(w uuid,p text,subject uuid,operation text,payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if subject is null or not exists(select 1 from public.memberships where workspace_id=w and user_id=subject and role in ('owner','admin','member')) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 perform set_config('request.jwt.claim.sub',subject::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
 case operation
 when 'integration_get' then return relay_private.integration_get(w,p);
 when 'integration_oauth_begin' then perform relay_private.integration_oauth_begin(w,p,payload->>'state_hash');return 'null'::jsonb;
 when 'integration_oauth_consume' then return to_jsonb(relay_private.integration_oauth_consume(w,p,payload->>'state_hash'));
 when 'integration_save' then return to_jsonb(relay_private.integration_save(w,p,payload->>'mail',payload->>'encrypted',array(select jsonb_array_elements_text(payload->'permissions')),payload->>'oauth_hash'));
 when 'integration_refresh_claim' then return to_jsonb(relay_private.integration_refresh_claim(w,p,(payload->>'expected_revision')::bigint));
 when 'integration_refresh_finish' then return to_jsonb(relay_private.integration_refresh_finish(w,p,(payload->>'expected_revision')::bigint,payload->>'encrypted',array(select jsonb_array_elements_text(payload->'permissions'))));
 else raise exception 'Unknown credential operation' using errcode='22023';
 end case;
end $$;
revoke all on function public.integration_server(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_server(uuid,text,uuid,text,jsonb) to service_role;
do $$declare schema_name text;signature text;begin
 foreach schema_name in array array['public','relay_private'] loop
  foreach signature in array array[
   'integration_get(uuid,text)',
   'integration_oauth_begin(uuid,text,text)',
   'integration_oauth_consume(uuid,text,text)',
   'integration_save(uuid,text,text,text,text[],text)',
   'integration_refresh_claim(uuid,text,bigint)',
   'integration_refresh_finish(uuid,text,bigint,text,text[])'
  ] loop
   execute 'revoke all on function '||schema_name||'.'||signature||' from public,anon,authenticated';
   execute 'grant execute on function '||schema_name||'.'||signature||' to service_role';
  end loop;
 end loop;
end $$;

-- Preserve the existing OAuth implementation and every grant/replay check.
-- Public requests spend only their server-derived network budget. Valid token
-- operations additionally spend their own connection budget, never a global one.
do $$declare definition text;updated text;old_guard text;new_guard text;begin
 definition:=pg_get_functiondef('relay_private.mcp_oauth(text,jsonb)'::regprocedure);
 old_guard:=$old$ if operation in ('register','begin','exchange','refresh') and not relay_private.mcp_budget('oauth:'||operation,120) then return '{"error":"rate_limited"}';end if;$old$;
 new_guard:=$new$ if operation in ('register','begin','exchange','refresh') then
  if coalesce(payload->>'rate_limit_key','') !~ '^[a-f0-9]{64}$' then return '{"error":"invalid_request"}';end if;
  if not relay_private.mcp_budget('oauth:source:'||operation||':'||(payload->>'rate_limit_key'),case when operation='register' then 20 else 240 end) then return '{"error":"rate_limited"}';end if;
 end if;
 delete from relay_private.mcp_buckets where name in (select name from relay_private.mcp_buckets where window_at<now()-interval '1 day' limit 100);$new$;
 if position(old_guard in definition)=0 then raise exception 'OAuth rate guard changed; review migration';end if;
 updated:=replace(definition,old_guard,new_guard);
 old_guard:=$old$  update relay_private.mcp_flows set code_used_at=now() where flow_hash=f.flow_hash;$old$;
 new_guard:=$new$  if not relay_private.mcp_budget('oauth:connection:exchange:'||g.id::text,60) then return '{"error":"rate_limited"}';end if;
  update relay_private.mcp_flows set code_used_at=now() where flow_hash=f.flow_hash;$new$;
 if position(old_guard in updated)=0 then raise exception 'OAuth exchange changed; review migration';end if;
 updated:=replace(updated,old_guard,new_guard);
 old_guard:=$old$  update relay_private.mcp_tokens set used_at=now() where token_hash=t.token_hash;$old$;
 new_guard:=$new$  if not relay_private.mcp_budget('oauth:connection:refresh:'||g.id::text,60) then return '{"error":"rate_limited"}';end if;
  update relay_private.mcp_tokens set used_at=now() where token_hash=t.token_hash;$new$;
 if position(old_guard in updated)=0 then raise exception 'OAuth refresh changed; review migration';end if;
 updated:=replace(updated,old_guard,new_guard);
 execute updated;
end $$;
-- Retire the vulnerable shared counters; keep workspace/connection API quotas.
delete from relay_private.mcp_buckets where name in ('oauth:register','oauth:begin','oauth:exchange','oauth:refresh');
commit;
