begin;
-- A proposal can now be approved or rejected from the MCP client itself (card button,
-- client confirmation dialog, or the user's explicit answer in the conversation),
-- without opening Zyliad. The decision still runs as the token's user through
-- public.mcp_manage, so RLS, roles, versions and owner/admin checks are unchanged.
-- Only proposals created by the same connection can be decided with its token.

create or replace function relay_private.mcp_log(gid uuid,operation text,outcome text) returns void language plpgsql security definer set search_path='' as $$begin
 if operation not in ('session','search','source','aggregate','workspace','prepare','status','connection','record','records','record_context','relations','list_records','members','thread','duplicates','approve','reject') then raise exception 'Invalid operation' using errcode='22023';end if;
 if outcome not in ('success','forbidden','conflict','validation_error','not_found') then raise exception 'Invalid outcome' using errcode='22023';end if;
 insert into relay_private.mcp_audit(connection_id,action,result) values(gid,operation,outcome);
end $$;

-- Action of a proposal, only when it belongs to the given connection.
create function relay_private.mcp_command_action(gid uuid,cid uuid) returns text
language sql stable security definer set search_path='' as $$
 select action from relay_private.mcp_commands where id=cid and connection_id=gid
$$;
revoke all on function relay_private.mcp_command_action(uuid,uuid) from public,anon,authenticated;
grant execute on function relay_private.mcp_command_action(uuid,uuid) to service_role;

create or replace function public.mcp_request(token_hash text,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare a jsonb;result jsonb;needed text[];k text;old_role text:=current_user;
begin
 if operation in ('session','search','source','aggregate','workspace','prepare','status') then
  return relay_private.mcp_request_base(token_hash,operation,payload);
 end if;
 if operation in ('approve','reject') then
  a:=relay_private.mcp_oauth('verify',jsonb_build_object('token_hash',token_hash,'resource',payload->>'resource'));
  if a ? 'error' then return a;end if;
  if coalesce(payload->>'command_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or exists(select 1 from jsonb_object_keys(payload) key where key not in ('resource','command_id')) then
   result:='{"error":"validation_error"}';
  else
   k:=relay_private.mcp_command_action((a->>'connection_id')::uuid,(payload->>'command_id')::uuid);
   if k is null then result:='{"error":"not_found"}';
   elsif not (a->'scopes') ? 'crm:write'
    or (k in ('merge_records','create_attribute','save_pipeline_stages') and not (a->'scopes') ? 'crm:admin') then
    result:='{"error":"forbidden"}';
   else
    perform set_config('request.jwt.claim.sub',a->>'user_id',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',a->>'user_id','role','authenticated')::text,true);
    perform set_config('role','zyliad_mcp',true);
    begin
     result:=public.mcp_manage((a->>'workspace_id')::uuid,operation,(payload->>'command_id')::uuid);
    exception when insufficient_privilege then result:='{"error":"forbidden"}';when serialization_failure then result:='{"error":"conflict"}';
     when no_data_found then result:='{"error":"not_found"}';
     when invalid_parameter_value or invalid_text_representation or check_violation or foreign_key_violation or unique_violation or not_null_violation then result:='{"error":"validation_error"}';end;
    perform set_config('role',old_role,true);
   end if;
  end if;
  perform relay_private.mcp_log((a->>'connection_id')::uuid,operation,coalesce(result->>'error','success'));
  return result;
 end if;
 if operation not in ('connection','record','records','record_context','relations','list_records','members','thread','duplicates') then return '{"error":"validation_error"}';end if;
 a:=relay_private.mcp_oauth('verify',jsonb_build_object('token_hash',token_hash,'resource',payload->>'resource'));
 if a ? 'error' then return a;end if;
 perform set_config('request.jwt.claim.sub',a->>'user_id',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a->>'user_id','role','authenticated')::text,true);
 perform set_config('role','zyliad_mcp',true);
 begin
  needed:=case operation when 'connection' then array[]::text[] when 'members' then array['configuration:read']
    when 'list_records' then array['records:read','configuration:read'] when 'thread' then array['communications:read'] else array['records:read'] end;
  if operation='record_context' then
   if jsonb_typeof(payload->'sections') is distinct from 'array' or jsonb_array_length(payload->'sections')>8 then raise exception 'Invalid sections' using errcode='22023';end if;
   for k in select jsonb_array_elements_text(payload->'sections') loop
    needed:=needed||case k when 'task' then 'tasks:read' when 'note' then 'notes:read' when 'meeting' then 'meetings:read'
      when 'email' then 'communications:read' when 'calendar' then 'communications:read' when 'document' then 'documents:read'
      when 'commitment' then 'commitments:read' when 'conflict' then 'commitments:read' else 'invalid_scope' end;
   end loop;
  end if;
  if not (a->'scopes') ?& needed then raise exception 'Scope denied' using errcode='42501';end if;
  if operation='duplicates' then
   if exists(select 1 from jsonb_object_keys(payload) key where key not in ('resource','object_id')) then raise exception 'Invalid operation' using errcode='22023';end if;
   result:=jsonb_build_object('data',public.crm_duplicate_candidates((a->>'workspace_id')::uuid,(payload->>'object_id')::uuid),
    'coverage','Paires candidates calculées sur les fiches actuellement autorisées ; aucune fusion n’est effectuée.');
  else
   result:=relay_private.mcp_read((a->>'workspace_id')::uuid,operation,payload);
  end if;
  if operation='connection' then result:=result||jsonb_build_object('scopes',a->'scopes','connection_id',a->'connection_id','expires_at',a->'expires_at');end if;
 exception when insufficient_privilege then result:='{"error":"forbidden"}';when no_data_found then result:='{"error":"not_found"}';
 when invalid_parameter_value or invalid_text_representation or check_violation or foreign_key_violation then result:='{"error":"validation_error"}';end;
 perform set_config('role',old_role,true);
 perform relay_private.mcp_log((a->>'connection_id')::uuid,operation,coalesce(result->>'error','success'));
 return result;
end $$;
revoke all on function public.mcp_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_request(text,text,jsonb) to service_role;
commit;
