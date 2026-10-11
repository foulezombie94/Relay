begin;

-- Legacy envelopes remain readable only by the server. Never grant a browser
-- access to the ciphertext or the ability to manufacture an OAuth completion.
create function public.integration_server(w uuid,p text,subject uuid,operation text,payload jsonb default '{}')
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
commit;
