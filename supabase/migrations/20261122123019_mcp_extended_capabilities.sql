begin;
-- MCP 1.2: new confirmed proposals (lists, commitments, workflow drafts), administrative
-- proposals behind a separate crm:admin scope (merge duplicates, create a field, edit
-- pipeline stages), duplicate candidates read, and Client ID Metadata Documents.
-- Every write stays a proposal confirmed by the human in Zyliad and executed under RLS.
-- Existing functions are replaced with their previous body plus additive branches.

alter table relay_private.mcp_connections drop constraint mcp_connections_scopes_check,
 add constraint mcp_connections_scopes_check check(scopes <@ array['records:read','tasks:read','notes:read','meetings:read','communications:read','documents:read','commitments:read','configuration:read','crm:write','crm:admin']::text[]);
alter table relay_private.mcp_commands drop constraint mcp_commands_action_check,
 add constraint mcp_commands_action_check check(action in ('create_record','update_record','create_task','update_task','create_note','update_note',
  'update_commitment','create_workflow_draft','update_workflow_draft','add_to_list','remove_from_list',
  'merge_records','create_attribute','save_pipeline_stages'));

-- Client ID Metadata Documents: an HTTPS client_id URL maps to one stored client whose
-- name and redirect URIs come from the document fetched and validated by the backend.
alter table relay_private.mcp_clients add column metadata_url text unique
 check(length(metadata_url)<=2000 and metadata_url ~ '^https://[^[:space:]]+$');

create function relay_private.mcp_client_document(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare i uuid;u text:=payload->>'url';begin
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>12000 or u is null or length(u)>2000 or u !~ '^https://[^[:space:]]+$' then return '{"error":"invalid_client"}';end if;
 if operation='resolve' then
  select id into i from relay_private.mcp_clients where metadata_url=u;
  if i is null then return '{"error":"invalid_client"}';end if;
  return jsonb_build_object('client_id',i);
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
create function public.mcp_client_document(operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select relay_private.mcp_client_document(operation,payload)$$;
revoke all on function public.mcp_client_document(text,jsonb),relay_private.mcp_client_document(text,jsonb) from public,anon,authenticated;
grant execute on function public.mcp_client_document(text,jsonb),relay_private.mcp_client_document(text,jsonb) to service_role;

-- Consent: crm:admin is reserved to owners and admins, like the matching CRM settings.
create or replace function relay_private.mcp_consent(flow_hash text,w uuid,approved_scopes text[],code_hash text,allow boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare f relay_private.mcp_flows;i uuid;r text;begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501';end if;
 select * into f from relay_private.mcp_flows where mcp_flows.flow_hash=flow_hash for update;
 if f.flow_hash is null or f.used_at is not null or f.expires_at<=now() then raise exception 'Expired authorization' using errcode='22023';end if;
 select role into r from public.memberships where workspace_id=w and user_id=auth.uid() for share;
 if r is null or (allow and (cardinality(approved_scopes)=0 or not approved_scopes<@f.scopes or ('crm:write'=any(approved_scopes) and r='viewer')
  or ('crm:admin'=any(approved_scopes) and (r not in ('owner','admin') or not 'crm:write'=any(approved_scopes))))) then raise exception 'Forbidden' using errcode='42501';end if;
 if allow then
  if (select count(*) from relay_private.mcp_connections where user_id=auth.uid() and workspace_id=w and revoked_at is null and expires_at>now())>=20 then raise exception 'Connection limit' using errcode='22023';end if;
  insert into relay_private.mcp_connections(client_id,workspace_id,user_id,scopes,resource) values(f.client_id,w,auth.uid(),approved_scopes,f.resource) returning id into i;
  insert into relay_private.mcp_audit(connection_id,action,result) values(i,'connect','consented');
 end if;
 update relay_private.mcp_flows set used_at=now(),code_hash=case when allow then code_hash end,code_expires_at=now()+interval '60 seconds',connection_id=i where mcp_flows.flow_hash=flow_hash;
 return jsonb_build_object('redirect_uri',f.redirect_uri,'state',f.state);
end $$;

-- Proposals: administrative actions need crm:admin and an owner/admin role now and at approval.
create or replace function relay_private.mcp_prepare(gid uuid,action text,proposal_values jsonb,rid uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare g relay_private.mcp_connections;c relay_private.mcp_commands;h text;begin
 select * into g from relay_private.mcp_connections where id=gid for update;
 if g.id is null or g.user_id<>auth.uid() or g.revoked_at is not null or g.expires_at<=now() or not 'crm:write'=any(g.scopes) or not relay_private.has_role(g.workspace_id,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if action in ('merge_records','create_attribute','save_pipeline_stages') and (not 'crm:admin'=any(g.scopes) or not relay_private.has_role(g.workspace_id,array['owner','admin'])) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(proposal_values)<>'object' or octet_length(proposal_values::text)>50000 or rid is null then raise exception 'Invalid proposal' using errcode='22023';end if;
 h:=encode(extensions.digest(action||proposal_values::text,'sha256'),'hex');
 select * into c from relay_private.mcp_commands where connection_id=gid and request_id=rid;
 if c.id is not null then
  if c.payload_hash<>h then raise exception 'Idempotency conflict' using errcode='40001';end if;
 else
  if (select count(*) from relay_private.mcp_commands where connection_id=gid and status='pending' and expires_at>now())>=30 then raise exception 'Pending limit' using errcode='22023';end if;
  insert into relay_private.mcp_commands(connection_id,request_id,action,payload,payload_hash) values(gid,rid,action,proposal_values,h) returning * into c;
  insert into relay_private.mcp_audit(connection_id,action,result) values(gid,action,'pending_confirmation');
 end if;
 return jsonb_build_object('id',c.id,'status',case when c.status='pending' and c.expires_at<=now() then 'expired' else c.status end,'action',c.action,'expires_at',c.expires_at,'result',c.result,'confirmation_required',true);
end $$;

-- Human approval: previous actions unchanged; new branches reuse the exact SQL of the
-- in-app agent (lists, commitments, workflow drafts) or the existing CRM functions.
create or replace function public.mcp_manage(w uuid,operation text,cid uuid default null) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare c jsonb;v jsonb;row_id uuid;tab text;keys text[];allowed text[];sql text;rec public.records;com public.commitments;flow public.workflows;begin
 if operation<>'approve' then
  if operation not in ('list','revoke','reject') then raise exception 'Forbidden' using errcode='42501';end if;
  return relay_private.mcp_manage(w,operation,cid);
 end if;
 c:=relay_private.mcp_manage(w,'take',cid);
 if c->>'status'<>'pending' then return c;end if;
 v:=c->'values';
 if c->>'action' in ('merge_records','create_attribute','save_pipeline_stages') and not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 case c->>'action'
 when 'create_record' then
  insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,pipeline_id,probability,lost_reason,attributes)
  values(w,(v->>'object_id')::uuid,v->>'display_name',nullif(v->>'email',''),nullif(v->>'domain',''),coalesce(v->>'stage','Nouveau'),coalesce((v->>'amount')::numeric,0),coalesce(v->>'currency','EUR'),coalesce((v->>'owner_id')::uuid,auth.uid()),(v->>'close_date')::date,(v->>'pipeline_id')::uuid,(v->>'probability')::numeric,coalesce(v->>'lost_reason',''),coalesce(v->'attributes','{}')) returning id into row_id;
 when 'create_task' then
  insert into public.tasks(workspace_id,title,description,record_id,owner_id,due_date,status,priority) values(w,v->>'title',coalesce(v->>'description',''),(v->>'record_id')::uuid,coalesce((v->>'owner_id')::uuid,auth.uid()),(v->>'due_date')::timestamptz,coalesce(v->>'status','open'),coalesce(v->>'priority','normal')) returning id into row_id;
 when 'create_note' then
  -- Notes created by an external agent default to private. Sharing is a
  -- separately confirmed update, never inferred from an external source.
  insert into public.notes(workspace_id,title,content,record_id,private,author_id) values(w,coalesce(v->>'title',''),v->>'content',(v->>'record_id')::uuid,true,auth.uid()) returning id into row_id;
 when 'update_record','update_task','update_note' then
  tab:=case c->>'action' when 'update_record' then 'records' when 'update_task' then 'tasks' else 'notes' end;
  allowed:=case tab when 'records' then array['display_name','email','domain','stage','amount','currency','owner_id','close_date','pipeline_id','probability','lost_reason','attributes'] when 'tasks' then array['title','description','owner_id','due_date','status','priority'] else array['title','content','private'] end;
  if jsonb_typeof(v->'values')<>'object' or (v->>'version')::integer<1 then raise exception 'Invalid proposal' using errcode='22023';end if;
  select array_agg(k) into keys from jsonb_object_keys(v->'values') k;
  if cardinality(keys) is null or not keys<@allowed then raise exception 'Invalid fields' using errcode='22023';end if;
  -- Column names come from a fixed allowlist. jsonb_populate_record casts
  -- values to the existing table types; RLS, FKs and validation triggers apply.
  select string_agg(format('%I=source.%I',k,k),',') into sql from unnest(keys) k;
  execute format('update public.%I target set %s from jsonb_populate_record(null::public.%I,$1) source where target.workspace_id=$2 and target.id=$3 and target.version=$4 returning target.id',tab,sql,tab) into row_id using v->'values',w,(v->>'id')::uuid,(v->>'version')::integer;
  if row_id is null then raise exception 'Version conflict or inaccessible row' using errcode='40001';end if;
 when 'update_commitment' then
  if jsonb_typeof(v->'values')<>'object' or exists(select 1 from jsonb_object_keys(v->'values') k where k not in ('status','due_date','owner_id','evidence')) then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into com from public.commitments where workspace_id=w and id=(v->>'id')::uuid for update;
  if com.id is null or com.version<>(v->>'version')::integer then raise exception 'Commitment changed' using errcode='40001';end if;
  com:=jsonb_populate_record(com,v->'values');
  if com.status='done' and coalesce(trim(com.evidence),'')='' then raise exception 'Evidence required' using errcode='22023';end if;
  update public.commitments set status=com.status,due_date=com.due_date,owner_id=com.owner_id,evidence=com.evidence where workspace_id=w and id=(v->>'id')::uuid returning id into row_id;
 when 'create_workflow_draft' then
  insert into public.workflows(workspace_id,name,definition,description) values(w,v->>'name',v->'definition',coalesce(v->>'description','')) returning id into row_id;
 when 'update_workflow_draft' then
  if jsonb_typeof(v->'values')<>'object' or exists(select 1 from jsonb_object_keys(v->'values') k where k not in ('name','definition','description')) then raise exception 'Invalid fields' using errcode='22023';end if;
  select * into flow from public.workflows where workspace_id=w and id=(v->>'id')::uuid for update;
  if flow.id is null or flow.version<>(v->>'version')::integer then raise exception 'Workflow changed' using errcode='40001';end if;
  flow:=jsonb_populate_record(flow,v->'values');
  update public.workflows set name=flow.name,definition=flow.definition,description=flow.description where workspace_id=w and id=(v->>'id')::uuid returning id into row_id;
 when 'add_to_list' then
  insert into public.list_entries(workspace_id,list_id,record_id) values(w,(v->>'list_id')::uuid,(v->>'record_id')::uuid) on conflict do nothing;
  select id into row_id from public.list_entries where workspace_id=w and list_id=(v->>'list_id')::uuid and record_id=(v->>'record_id')::uuid;
 when 'remove_from_list' then
  delete from public.list_entries where workspace_id=w and list_id=(v->>'list_id')::uuid and record_id=(v->>'record_id')::uuid returning id into row_id;
  if row_id is null then row_id:=(v->>'list_id')::uuid;end if;
 when 'merge_records' then
  perform public.merge_records(w,(v->>'source_id')::uuid,(v->>'target_id')::uuid,(v->>'source_version')::integer,(v->>'target_version')::integer,coalesce(v->'choices','{}'));
  row_id:=(v->>'target_id')::uuid;
 when 'create_attribute' then
  insert into public.attributes(workspace_id,object_id,key,name,type,required,options) values(w,(v->>'object_id')::uuid,v->>'key',v->>'name',v->>'type',coalesce((v->>'required')::boolean,false),coalesce(v->'options','[]')) returning id into row_id;
 when 'save_pipeline_stages' then
  perform public.save_pipeline_stages(w,(v->>'pipeline_id')::uuid,(v->>'version')::integer,v->>'name',v->'stages',coalesce(v->'labels','{}'),v->'probabilities',coalesce(v->'moves','{}'));
  row_id:=(v->>'pipeline_id')::uuid;
 else raise exception 'Unsupported action' using errcode='22023';end case;
 if row_id is null then raise exception 'Action forbidden' using errcode='42501';end if;
 perform relay_private.mcp_manage(w,'finish',cid,row_id);
 return jsonb_build_object('id',cid,'status','executed','record_id',row_id);
end $$;

create or replace function relay_private.mcp_log(gid uuid,operation text,outcome text) returns void language plpgsql security definer set search_path='' as $$begin
 if operation not in ('session','search','source','aggregate','workspace','prepare','status','connection','record','records','record_context','relations','list_records','members','thread','duplicates') then raise exception 'Invalid operation' using errcode='22023';end if;
 if outcome not in ('success','forbidden','conflict','validation_error','not_found') then raise exception 'Invalid outcome' using errcode='22023';end if;
 insert into relay_private.mcp_audit(connection_id,action,result) values(gid,operation,outcome);
end $$;

-- Reads: previous operations unchanged; duplicates reuses the existing candidate read.
create or replace function public.mcp_request(token_hash text,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare a jsonb;result jsonb;needed text[];k text;old_role text:=current_user;
begin
 if operation in ('session','search','source','aggregate','workspace','prepare','status') then
  return relay_private.mcp_request_base(token_hash,operation,payload);
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
