begin;
-- Keep the applied OAuth/RLS/write implementation intact. New reads share its
-- token verification, rate budget and role drop; no new tables or tenant grants.
alter function public.mcp_request(text,text,jsonb) set schema relay_private;
alter function relay_private.mcp_request(text,text,jsonb) rename to mcp_request_base;
revoke all on function relay_private.mcp_request_base(text,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.mcp_request_base(text,text,jsonb) to service_role;

create function relay_private.mcp_read_record(w uuid,rid uuid,attribute_keys jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if rid is null or jsonb_typeof(attribute_keys) is distinct from 'array' or jsonb_array_length(attribute_keys)>20
 or exists(select 1 from jsonb_array_elements_text(attribute_keys) k where k !~ '^[a-z][a-z0-9_]{0,49}$') then raise exception 'Invalid fields' using errcode='22023';end if;
 select jsonb_build_object('id',r.id,'object_id',r.object_id,'display_name',r.display_name,'email',r.email,'domain',r.domain,
 'stage',r.stage,'amount',r.amount,'currency',r.currency,'owner_id',r.owner_id,'close_date',r.close_date,
 'pipeline_id',r.pipeline_id,'probability',r.probability,'lost_reason',r.lost_reason,'version',r.version,
 'created_at',r.created_at,'updated_at',r.updated_at,
 'attribute_keys',attribute_keys,
 'attributes_partial',exists(select 1 from jsonb_each(r.attributes) k where not (attribute_keys ? k.key)
   or not exists(select 1 from public.attributes a where a.workspace_id=w and a.object_id=r.object_id and a.key=k.key and not a.archived)),
 'attributes',coalesce((select jsonb_object_agg(k.key,k.value) from jsonb_each(r.attributes) k
   where attribute_keys ? k.key and exists(select 1 from public.attributes a where a.workspace_id=w and a.object_id=r.object_id and a.key=k.key and not a.archived)), '{}'))
 into result from public.records r where r.workspace_id=w and r.id=rid and not r.archived;
 if result is null then raise no_data_found;end if;
 return result;
end $$;
revoke all on function relay_private.mcp_read_record(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function relay_private.mcp_read_record(uuid,uuid,jsonb) to zyliad_mcp;

create function relay_private.mcp_read(w uuid,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare result jsonb;root jsonb;sections jsonb:='{}';items jsonb;k text;lim integer;rid uuid;cursor_id uuid;allowed text[];missing jsonb:='[]';
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>4000 then raise exception 'Invalid input' using errcode='22023';end if;
 allowed:=case operation when 'connection' then array['resource']
 when 'record' then array['resource','record_id','attribute_keys']
 when 'records' then array['resource','record_ids','attribute_keys']
 when 'record_context' then array['resource','record_id','attribute_keys','sections','since','until','limit']
 when 'relations' then array['resource','record_id','cursor','limit']
 when 'list_records' then array['resource','list_id','cursor','limit']
 when 'members' then array['resource','query','cursor','limit']
 when 'thread' then array['resource','id','cursor','limit'] end;
 if allowed is null or exists(select 1 from jsonb_object_keys(payload) key where not key=any(allowed)) then raise exception 'Invalid operation' using errcode='22023';end if;
 lim:=coalesce((payload->>'limit')::integer,20);cursor_id:=(payload->>'cursor')::uuid;
 if lim not between 1 and 20 then raise exception 'Invalid page' using errcode='22023';end if;
 if operation='connection' then
  select jsonb_build_object('user',jsonb_build_object('id',m.user_id,'display_name',m.display_name,'role',m.role),
   'workspace',jsonb_build_object('id',x.id,'name',x.name,'timezone',x.timezone,'locale',x.locale,'currency',x.currency)) into result
  from public.memberships m join public.workspaces x on x.id=m.workspace_id where m.workspace_id=w and m.user_id=auth.uid();
  return result;
 elsif operation='records' then
  if jsonb_typeof(payload->'record_ids') is distinct from 'array' or jsonb_array_length(payload->'record_ids') not between 1 and 10 then raise exception 'Invalid batch' using errcode='22023';end if;
  items:='[]';
  for rid in select distinct value::uuid from jsonb_array_elements_text(payload->'record_ids') loop
   begin
    root:=relay_private.mcp_read_record(w,rid,coalesce(payload->'attribute_keys','[]'));
    items:=items||jsonb_build_array(root);
   exception when no_data_found then missing:=missing||jsonb_build_array(rid);end;
  end loop;
  return jsonb_build_object('records',items,'unavailable_ids',missing,'partial',jsonb_array_length(missing)>0,
   'coverage','Fiches demandées actuellement autorisées. Un ID introuvable est absent ou inaccessible ; aucune existence externe n’est révélée.');
 elsif operation in ('record','record_context') then
  rid:=(payload->>'record_id')::uuid;
  root:=relay_private.mcp_read_record(w,rid,coalesce(payload->'attribute_keys','[]'));
  if operation='record' then return jsonb_build_object('record',root);end if;
  if lim>5 or jsonb_typeof(payload->'sections') is distinct from 'array' or jsonb_array_length(payload->'sections')>8 then raise exception 'Invalid sections' using errcode='22023';end if;
  if payload ? 'since' and payload ? 'until' and (payload->>'since')::timestamptz >= (payload->>'until')::timestamptz then raise exception 'Invalid period' using errcode='22023';end if;
  for k in select distinct jsonb_array_elements_text(payload->'sections') loop
   if k not in ('task','note','meeting','email','calendar','document','commitment','conflict') then raise exception 'Invalid section' using errcode='22023';end if;
   items:=public.agent_search(w,k,jsonb_build_object('record_id',rid,'limit',lim)||
    case when payload ? 'since' then jsonb_build_object('since',payload->>'since') else '{}' end||
    case when payload ? 'until' then jsonb_build_object('until',payload->>'until') else '{}' end);
   sections:=sections||jsonb_build_object(k,items);
  end loop;
  return jsonb_build_object('record',root,'sections',sections,'partial',exists(select 1 from jsonb_each(sections) x where (x.value->>'partial')::boolean),
    'coverage','Extraits autorisés des seules sections demandées ; pages ordonnées par UUID. Utiliser leur next_cursor pour approfondir.');
 elsif operation='thread' then
  return public.agent_search(w,'thread',jsonb_build_object('limit',lim)||case when cursor_id is not null then jsonb_build_object('cursor',cursor_id) else '{}' end,(payload->>'id')::uuid);
 elsif operation='members' then
  if length(coalesce(payload->>'query',''))>100 then raise exception 'Invalid query' using errcode='22023';end if;
  select coalesce(jsonb_agg(x order by x.id),'[]') into items from (
   select m.user_id as id,left(m.display_name,200) as display_name,m.role from public.memberships m
   where m.workspace_id=w and (cursor_id is null or m.user_id>cursor_id)
   and (coalesce(payload->>'query','')='' or strpos(lower(m.display_name),lower(payload->>'query'))>0)
   order by m.user_id limit lim+1
  ) x;
 elsif operation='relations' then
  rid:=(payload->>'record_id')::uuid;
  perform relay_private.mcp_read_record(w,rid);
  select coalesce(jsonb_agg(x order by x.id),'[]') into items from (
   select e.id,e.label,case when e.source_id=rid then 'outgoing' else 'incoming' end as direction,
    jsonb_build_object('id',r.id,'object_id',r.object_id,'display_name',r.display_name,'stage',r.stage,'version',r.version) as record
   from public.record_relations e join public.records r on r.workspace_id=e.workspace_id and r.id=case when e.source_id=rid then e.target_id else e.source_id end
   where e.workspace_id=w and (e.source_id=rid or e.target_id=rid) and not r.archived and (cursor_id is null or e.id>cursor_id)
   order by e.id limit lim+1
  ) x;
 elsif operation='list_records' then
  if not exists(select 1 from public.lists where workspace_id=w and id=(payload->>'list_id')::uuid) then raise no_data_found;end if;
  select coalesce(jsonb_agg(x order by x.id),'[]') into items from (
   select e.id,e.list_id,jsonb_build_object('id',r.id,'object_id',r.object_id,'display_name',r.display_name,'email',r.email,'domain',r.domain,
     'stage',r.stage,'amount',r.amount,'currency',r.currency,'owner_id',r.owner_id,'version',r.version) as record
   from public.list_entries e join public.records r on r.workspace_id=e.workspace_id and r.id=e.record_id
   where e.workspace_id=w and e.list_id=(payload->>'list_id')::uuid and not r.archived and (cursor_id is null or e.id>cursor_id)
   order by e.id limit lim+1
  ) x;
 end if;
 select coalesce(jsonb_agg(x.value order by x.n),'[]') into result from jsonb_array_elements(items) with ordinality x(value,n) where x.n<=lim;
 return jsonb_build_object('data',result,'has_more',jsonb_array_length(items)>lim,'partial',cursor_id is not null or jsonb_array_length(items)>lim,
 'next_cursor',case when jsonb_array_length(items)>lim then result->(lim-1)->'id' else null end,
 'coverage','Page de données actuellement autorisées ; ordre UUID, pas chronologique. Aucun total déduit de la taille de page.');
end $$;
revoke all on function relay_private.mcp_read(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.mcp_read(uuid,text,jsonb) to zyliad_mcp;

create or replace function relay_private.mcp_log(gid uuid,operation text,outcome text) returns void language plpgsql security definer set search_path='' as $$begin
 if operation not in ('session','search','source','aggregate','workspace','prepare','status','connection','record','records','record_context','relations','list_records','members','thread') then raise exception 'Invalid operation' using errcode='22023';end if;
 if outcome not in ('success','forbidden','conflict','validation_error','not_found') then raise exception 'Invalid outcome' using errcode='22023';end if;
 insert into relay_private.mcp_audit(connection_id,action,result) values(gid,operation,outcome);
end $$;

create function public.mcp_request(token_hash text,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare a jsonb;result jsonb;needed text[];k text;old_role text:=current_user;
begin
 if operation in ('session','search','source','aggregate','workspace','prepare','status') then
  return relay_private.mcp_request_base(token_hash,operation,payload);
 end if;
 if operation not in ('connection','record','records','record_context','relations','list_records','members','thread') then return '{"error":"validation_error"}';end if;
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
  result:=relay_private.mcp_read((a->>'workspace_id')::uuid,operation,payload);
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
