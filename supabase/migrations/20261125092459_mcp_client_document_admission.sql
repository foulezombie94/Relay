begin;
-- A metadata document URL is fetched before the client is stored, and the per-source
-- budget was only spent by that store: a URL that fails or stalls never consumed it, so
-- outgoing fetches were unbounded. The server now asks for admission ('admit') before
-- fetching, from separate buckets, so the existing 'upsert' limits stay unchanged.

create or replace function relay_private.mcp_client_document(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare i uuid;u text:=payload->>'url';begin
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>12000 or u is null or length(u)>2000 or u !~ '^https://[^[:space:]]+$' then return '{"error":"invalid_client"}';end if;
 if operation='resolve' then
  select id into i from relay_private.mcp_clients where metadata_url=u;
  if i is null then return '{"error":"invalid_client"}';end if;
  return jsonb_build_object('client_id',i);
 end if;
 if operation='admit' then
  if not relay_private.mcp_budget('oauth:document:fetch',120)
   or not relay_private.mcp_budget('oauth:source:document:fetch:'||coalesce(payload->>'rate_limit_key',''),20) then return '{"error":"rate_limited"}';end if;
  return '{"admitted":true}';
 end if;
 if operation<>'upsert' then return '{"error":"invalid_request"}';end if;
 if not relay_private.mcp_budget('oauth:document',120)
  or not relay_private.mcp_budget('oauth:source:document:'||coalesce(payload->>'rate_limit_key',''),20) then return '{"error":"rate_limited"}';end if;
 if jsonb_typeof(payload->'redirect_uris')<>'array' or jsonb_array_length(payload->'redirect_uris') not between 1 and 5 then return '{"error":"invalid_client"}';end if;
 update relay_private.mcp_clients set name=payload->>'client_name',redirect_uris=array(select jsonb_array_elements_text(payload->'redirect_uris')) where metadata_url=u returning id into i;
 if i is null then
  if (select count(*) from relay_private.mcp_clients)>=10000 then return '{"error":"rate_limited"}';end if;
  insert into relay_private.mcp_clients(name,redirect_uris,metadata_url) values(payload->>'client_name',array(select jsonb_array_elements_text(payload->'redirect_uris')),u)
  on conflict(metadata_url) do update set name=excluded.name,redirect_uris=excluded.redirect_uris returning id into i;
 end if;
 return jsonb_build_object('client_id',i);
end $$;
revoke all on function relay_private.mcp_client_document(text,jsonb) from public,anon,authenticated;
commit;
