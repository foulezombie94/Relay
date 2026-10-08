-- Reuse agent_actions, RLS, the existing outbox and worker. No parallel queue.
alter table relay_private.agent_actions drop constraint agent_actions_kind_check, add constraint agent_actions_kind_check check(kind in ('create_record','update_record','create_task','update_task','create_note','update_note','draft_email','create_calendar_event','update_calendar_event','cancel_calendar_event','propose_commitment','propose_conflict','update_commitment','create_workflow_draft','update_workflow_draft','add_to_list','remove_from_list'));

alter table relay_private.agent_runs add column original_request text;
alter table relay_private.agent_actions
 add column confirmation_digest text,
 add column confirmation_expires_at timestamptz not null default now()+interval '30 minutes',
 add column confirmed_digest text,
 add column origin_run_id uuid,
 add column origin_conversation_id uuid,
 add column account_id uuid,
 add column account_email text,
 add column security jsonb not null default '{"risk":"medium","origin":"source_suggestion","automatic":false,"reasons":["Vérifiez l’action exacte avant toute exécution."]}',
 add column review_bound boolean not null default false;

create function relay_private.agent_action_digest(a relay_private.agent_actions) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('id',a.id,'workspace',a.workspace_id,'user',a.user_id,'kind',a.kind,'input',a.input,'sources',a.source_refs,'run',a.origin_run_id,'conversation',a.origin_conversation_id,'private_context',a.private_context,'access',a.access_fingerprint,'account',a.account_id,'account_email',a.account_email,'security',a.security,'expires',extract(epoch from a.confirmation_expires_at))::text,'sha256'),'hex')
$$;
revoke all on function relay_private.agent_action_digest(relay_private.agent_actions) from public,anon,authenticated;

create function relay_private.agent_action_immutable() returns trigger language plpgsql security definer set search_path='' as $$
declare i public.integrations;dep jsonb;begin
 if tg_op='INSERT' then
  new.origin_run_id:=new.run_id;new.origin_conversation_id:=new.conversation_id;
  if new.kind='propose_commitment' then new.source_refs:=new.source_refs||jsonb_build_array(jsonb_build_object('id',new.input->>'source_id','type',new.input->>'source_type'));
  elsif new.kind='propose_conflict' then new.source_refs:=new.source_refs||jsonb_build_array(jsonb_build_object('id',new.input->>'source_a_id','type',new.input->>'source_a_type'),jsonb_build_object('id',new.input->>'source_b_id','type',new.input->>'source_b_type'));end if;
  select coalesce(jsonb_agg(distinct value order by value),'[]') into new.source_refs from jsonb_array_elements(new.source_refs);
  if jsonb_array_length(new.source_refs)>400 then raise exception 'Too many dependencies' using errcode='22023';end if;
  for dep in select value from jsonb_array_elements(new.source_refs) loop
   if not relay_private.agent_source_allowed(new.workspace_id,new.user_id,dep->>'type',(dep->>'id')::uuid) then raise exception 'Source inaccessible' using errcode='42501';end if;
  end loop;
  new.private_context:=public.agent_sources_private(new.workspace_id,new.source_refs);

  if new.kind in ('draft_email','create_calendar_event','update_calendar_event','cancel_calendar_event') then
   if new.input ? 'reply_to_id' or new.kind in ('update_calendar_event','cancel_calendar_event') then
    select integrations.* into i from public.integrations join public.communications c on c.integration_id=integrations.id
      where c.workspace_id=new.workspace_id and c.user_id=new.user_id and c.id=coalesce((new.input->>'reply_to_id')::uuid,(new.input->>'id')::uuid)
      and integrations.workspace_id=new.workspace_id and integrations.user_id=new.user_id and integrations.status='connected';
   else
    select * into i from public.integrations where workspace_id=new.workspace_id and user_id=new.user_id and provider=new.input->>'provider' and status='connected';
   end if;
   if i.id is null or (new.input ? 'provider' and i.provider is distinct from new.input->>'provider') then raise exception 'Account unavailable' using errcode='42501';end if;
   new.account_id:=i.id;new.account_email:=i.email;
  end if;
  new.confirmation_digest:=relay_private.agent_action_digest(new);
 else
  if row(new.id,new.workspace_id,new.user_id,new.kind,new.source_refs,new.origin_run_id,new.origin_conversation_id,new.private_context,new.access_fingerprint,new.account_id,new.account_email,new.confirmation_expires_at)
     is distinct from row(old.id,old.workspace_id,old.user_id,old.kind,old.source_refs,old.origin_run_id,old.origin_conversation_id,old.private_context,old.access_fingerprint,old.account_id,old.account_email,old.confirmation_expires_at)
     or (new.run_id is distinct from old.run_id and new.run_id is not null) or (new.conversation_id is distinct from old.conversation_id and new.conversation_id is not null)
     or (new.input is distinct from old.input and not (new.status='cancelled' and new.input='{}'::jsonb and old.status in ('draft','pending','queued')))
     then raise exception 'Immutable action scope' using errcode='40001';end if;
  if new.security is distinct from old.security or new.review_bound is distinct from old.review_bound then
   if old.review_bound or new.review_bound is not true or old.status not in ('draft','pending') then raise exception 'Immutable action review' using errcode='40001';end if;
   new.confirmation_digest:=relay_private.agent_action_digest(new);
  elsif new.confirmation_digest is distinct from old.confirmation_digest then raise exception 'Immutable confirmation digest' using errcode='40001';end if;
  if old.confirmed_digest is not null and new.confirmed_digest is distinct from old.confirmed_digest then raise exception 'Immutable approval' using errcode='40001';end if;
 end if;
 return new;
end $$;
-- Legacy actions are review-only and get a bounded new preview window.
update relay_private.agent_actions set origin_run_id=run_id,origin_conversation_id=conversation_id;
update relay_private.agent_actions a set confirmation_digest=relay_private.agent_action_digest(a);
alter table relay_private.agent_actions alter column confirmation_digest set not null;
create trigger agent_scope before insert or update on relay_private.agent_actions for each row execute function relay_private.agent_action_immutable();

create function public.agent_register_request(w uuid,run_id uuid,run_secret text,original_request text) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r relay_private.agent_runs;begin
 select * into r from relay_private.agent_runs where id=run_id and workspace_id=w and user_id=auth.uid() for update;
 if r.id is null or r.status<>'running' or r.expires_at<=now() or r.capability_hash is distinct from encode(extensions.digest(coalesce(run_secret,''),'sha256'),'hex') or not relay_private.has_role(w) then raise exception 'Invalid request capability' using errcode='42501';end if;
 if length(original_request) not between 1 and 4000 or (r.original_request is not null and r.original_request is distinct from original_request) then raise exception 'Immutable original request' using errcode='40001';end if;
 update relay_private.agent_runs set original_request=agent_register_request.original_request where id=r.id;
end $$;
revoke all on function public.agent_register_request(uuid,uuid,text,text) from public,anon;
grant execute on function public.agent_register_request(uuid,uuid,text,text) to authenticated;

create function public.agent_review_action(w uuid,action_id uuid,run_secret text,review jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a relay_private.agent_actions;r relay_private.agent_runs;begin
 select * into a from relay_private.agent_actions where id=action_id and workspace_id=w and user_id=auth.uid() for update;
 select * into r from relay_private.agent_runs where id=a.run_id and workspace_id=w and user_id=auth.uid();
 if a.id is null or r.id is null or r.status<>'running' or r.expires_at<=now() or r.original_request is null or r.capability_hash is distinct from encode(extensions.digest(coalesce(run_secret,''),'sha256'),'hex') or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Invalid review capability' using errcode='42501';end if;
 if a.review_bound then return to_jsonb(a)-'action_key';end if;
 if a.status not in ('draft','pending') or jsonb_typeof(review)<>'object' or review->>'risk' not in ('low','medium','high') or review->>'origin' not in ('user_request','source_suggestion') or jsonb_typeof(review->'automatic')<>'boolean' or jsonb_typeof(review->'reasons')<>'array' or octet_length(review::text)>4000 or exists(select 1 from jsonb_object_keys(review) k where k not in ('risk','origin','automatic','reasons')) then raise exception 'Invalid security review' using errcode='22023';end if;
 if (review->>'automatic')::boolean and (review->>'risk'<>'low' or review->>'origin'<>'user_request' or jsonb_array_length(a.source_refs)>0 or a.kind not in ('draft_email','create_task','create_note')) then raise exception 'Unsafe automatic authorization' using errcode='42501';end if;
 update relay_private.agent_actions set security=review,review_bound=true where id=a.id returning * into a;
 return to_jsonb(a)-'action_key';
end $$;
revoke all on function public.agent_review_action(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.agent_review_action(uuid,uuid,text,jsonb) to authenticated;

create function relay_private.agent_confirmation(w uuid,action_id uuid,expected_digest text,run_secret text) returns void language plpgsql security definer set search_path='' as $$
declare a relay_private.agent_actions;r relay_private.agent_runs;i public.integrations;begin
 select * into a from relay_private.agent_actions where id=action_id and workspace_id=w and user_id=auth.uid() for update;
 if a.id is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Action forbidden' using errcode='42501';end if;
 if coalesce(expected_digest,'')!~'^[a-f0-9]{64}$' or a.confirmation_digest is distinct from expected_digest then raise exception 'Confirmation differs from preview' using errcode='40001';end if;
 -- Terminal refusals stay terminal; successful repeats only read the existing result.
 if a.status in ('cancelled','completed','queued','sending','sent','failed','uncertain') then return;end if;
 if a.confirmation_digest is distinct from relay_private.agent_action_digest(a) or a.confirmation_expires_at<=clock_timestamp() then raise exception 'Confirmation expired or modified' using errcode='40001';end if;
 if run_secret is not null then
  select * into r from relay_private.agent_runs where id=a.run_id and workspace_id=w and user_id=auth.uid();
  if r.id is null or r.status<>'running' or r.expires_at<=now() or r.capability_hash is distinct from encode(extensions.digest(run_secret,'sha256'),'hex') or not a.review_bound or a.security->>'automatic'<>'true' then raise exception 'Automatic action not authorized' using errcode='42501';end if;
 end if;
 if a.account_id is not null then
  select * into i from public.integrations where id=a.account_id and workspace_id=w and user_id=auth.uid() and status='connected';
  if i.id is null or i.email is distinct from a.account_email then raise exception 'Sender account changed' using errcode='42501';end if;
  if a.kind='draft_email' then
   if a.input ? 'record_id' and not exists(select 1 from public.records where id=(a.input->>'record_id')::uuid and workspace_id=w and not archived and lower(email)=lower(a.input->>'to')) then raise exception 'Recipient changed' using errcode='40001';end if;
   if exists(select 1 from public.suppressions where workspace_id=w and lower(email)=lower(a.input->>'to')) then raise exception 'Recipient suppressed' using errcode='42501';end if;
  end if;
  if coalesce((select attempts from relay_private.workflow_io_usage where workspace_id=w and day=(now() at time zone 'UTC')::date and kind=case when a.kind='draft_email' then 'email' else 'calendar' end),0)>=(case when a.kind='draft_email' then 200 else 100 end) then raise exception 'External daily quota exceeded' using errcode='53300';end if;
 end if;
 update relay_private.agent_actions set confirmed_digest=a.confirmation_digest where id=a.id;
end $$;
revoke all on function relay_private.agent_confirmation(uuid,uuid,text,text) from public,anon;
grant execute on function relay_private.agent_confirmation(uuid,uuid,text,text) to authenticated;

alter function relay_private.agent_action(uuid,text,jsonb) rename to agent_action_v1;
revoke all on function relay_private.agent_action_v1(uuid,text,jsonb) from public,anon,authenticated;
create function relay_private.agent_action(w uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;item jsonb;rows jsonb:='[]';begin
 if operation='claim' then perform relay_private.agent_confirmation(w,(payload->>'id')::uuid,payload->>'expected_digest',payload->>'run_secret');end if;
 result:=relay_private.agent_action_v1(w,operation,payload);
 if operation='list' then
  for item in select value from jsonb_array_elements(result) loop
   select item||jsonb_build_object('confirmation_digest',a.confirmation_digest,'confirmation_expires_at',a.confirmation_expires_at,'account_id',a.account_id,'account_email',a.account_email,'security',a.security,'source_refs',a.source_refs,'run_id',a.run_id) into item from relay_private.agent_actions a where id=(item->>'id')::uuid;
   rows:=rows||jsonb_build_array(item);
  end loop;return rows;
 end if;
 return result;
end $$;
revoke all on function relay_private.agent_action(uuid,text,jsonb) from public,anon;
grant execute on function relay_private.agent_action(uuid,text,jsonb) to authenticated;
create or replace function public.agent_action(w uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$begin if operation not in ('propose','get','list','cancel') then raise exception 'Internal action operation' using errcode='42501';end if;return relay_private.agent_action(w,operation,payload);end $$;

drop function public.agent_apply(uuid,uuid);
create function public.agent_apply(w uuid,action_id uuid,expected_digest text,run_secret text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;v jsonb;patch jsonb;rec public.records;task public.tasks;note public.notes;com public.commitments;flow public.workflows;entity uuid;result jsonb;begin
 a:=relay_private.agent_action(w,'claim',jsonb_build_object('id',action_id,'expected_digest',expected_digest,'run_secret',run_secret));
 if a->>'status'<>'executing' then return a;end if;
 v:=a->'input';entity:=gen_random_uuid();
 case a->>'kind'
 when 'create_record' then
  insert into public.records(workspace_id,object_id,display_name,email,domain,stage,amount,currency,owner_id,close_date,pipeline_id,probability,lost_reason,attributes) values(w,(v->>'object_id')::uuid,v->>'display_name',v->>'email',v->>'domain',coalesce(v->>'stage','Nouveau'),coalesce((v->>'amount')::numeric,0),coalesce(v->>'currency','EUR'),(v->>'owner_id')::uuid,(v->>'close_date')::date,(v->>'pipeline_id')::uuid,(v->>'probability')::numeric,v->>'lost_reason',coalesce(v->'attributes','{}')) returning id into entity;
 when 'update_record' then
  select * into rec from public.records where workspace_id=w and id=(v->>'id')::uuid for update;
  if rec.id is null or rec.version<>(v->>'version')::integer then raise exception 'Record changed' using errcode='40001';end if;
  patch:=v->'values';rec:=jsonb_populate_record(rec,patch);
  if rec.stage='Perdu' and coalesce(trim(rec.lost_reason),'')='' then raise exception 'Lost reason required' using errcode='22023';end if;
  update public.records set display_name=rec.display_name,email=rec.email,domain=rec.domain,stage=rec.stage,amount=rec.amount,currency=rec.currency,owner_id=rec.owner_id,close_date=rec.close_date,pipeline_id=rec.pipeline_id,probability=rec.probability,lost_reason=rec.lost_reason,attributes=rec.attributes where workspace_id=w and id=(v->>'id')::uuid returning id into entity;
 when 'create_task' then
  insert into public.tasks(workspace_id,record_id,title,description,owner_id,due_date,priority) values(w,(v->>'record_id')::uuid,v->>'title',coalesce(v->>'description',''),(v->>'owner_id')::uuid,(v->>'due_date')::timestamptz,coalesce(v->>'priority','normal')) returning id into entity;
 when 'update_task' then
  select * into task from public.tasks where workspace_id=w and id=(v->>'id')::uuid for update;
  if task.id is null or task.version<>(v->>'version')::integer then raise exception 'Task changed' using errcode='40001';end if;
  task:=jsonb_populate_record(task,v->'values');
  update public.tasks set title=task.title,description=task.description,owner_id=task.owner_id,due_date=task.due_date,status=task.status,priority=task.priority where workspace_id=w and id=(v->>'id')::uuid returning id into entity;
 when 'create_note' then
  insert into public.notes(workspace_id,record_id,title,content,private) values(w,(v->>'record_id')::uuid,coalesce(v->>'title',''),v->>'content',(coalesce((v->>'private')::boolean,false) or (a->>'private_context')::boolean)) returning id into entity;
 when 'update_note' then
  select * into note from public.notes where workspace_id=w and id=(v->>'id')::uuid for update;
  if note.id is null or note.version<>(v->>'version')::integer then raise exception 'Note changed' using errcode='40001';end if;
  note:=jsonb_populate_record(note,v->'values');
  update public.notes set title=note.title,content=note.content,private=note.private where workspace_id=w and id=(v->>'id')::uuid returning id into entity;
 when 'propose_commitment' then
  -- Email quotations never become shared commitments. A user can write a manual
  -- commitment separately after reviewing disclosure; this agent does not declassify.
  if v->>'source_type'='email' and not exists(select 1 from public.communications where workspace_id=w and id=(v->>'source_id')::uuid and user_id=auth.uid() and position(v->>'source_quote' in body)>0 and nullif(v->>'source_quote','') is not null) then raise exception 'Invalid private email citation' using errcode='42501';end if;
  if v->>'source_type'='note' then
   if not exists(select 1 from public.notes where workspace_id=w and id=(v->>'source_id')::uuid and position(v->>'source_quote' in content)>0 and nullif(v->>'source_quote','') is not null) then raise exception 'Invalid quote' using errcode='42501';end if;
  elsif v->>'source_type'='meeting' then
   if not exists(select 1 from public.meetings where workspace_id=w and id=(v->>'source_id')::uuid and position(v->>'source_quote' in coalesce(nullif(transcript,''),summary))>0 and nullif(v->>'source_quote','') is not null) then raise exception 'Invalid quote' using errcode='42501';end if;
  elsif v->>'source_type'<>'email' then raise exception 'Invalid source type' using errcode='22023';end if;
  insert into public.commitments(workspace_id,record_id,title,owner_id,due_date,status,source_type,source_id,source_quote,uncertainty,private) values(w,(v->>'record_id')::uuid,v->>'title',(v->>'owner_id')::uuid,(v->>'due_date')::timestamptz,'proposed',v->>'source_type',(v->>'source_id')::uuid,v->>'source_quote',coalesce(v->>'uncertainty',''),(a->>'private_context')::boolean) returning id into entity;
 when 'update_commitment' then
  select * into com from public.commitments where workspace_id=w and id=(v->>'id')::uuid for update;
  if com.id is null or com.version<>(v->>'version')::integer then raise exception 'Commitment changed' using errcode='40001';end if;
  com:=jsonb_populate_record(com,v->'values');
  if com.status='done' and coalesce(trim(com.evidence),'')='' then raise exception 'Evidence required' using errcode='22023';end if;
  update public.commitments set status=com.status,due_date=com.due_date,owner_id=com.owner_id,evidence=com.evidence where workspace_id=w and id=(v->>'id')::uuid returning id into entity;
 when 'propose_conflict' then
  if v->>'source_a_id'=v->>'source_b_id' or not public.agent_validate_quote(w,v->>'source_a_type',(v->>'source_a_id')::uuid,v->'source_a'->>'quote') or not public.agent_validate_quote(w,v->>'source_b_type',(v->>'source_b_id')::uuid,v->'source_b'->>'quote') then raise exception 'Invalid current conflict quotes' using errcode='42501';end if;
  insert into public.conflicts(workspace_id,record_id,title,field,status,source_a,source_b,private,author_id) values(w,(v->>'record_id')::uuid,v->>'title',v->>'field','open',v->'source_a',v->'source_b',(a->>'private_context')::boolean,auth.uid()) returning id into entity;
 when 'create_workflow_draft' then
  insert into public.workflows(workspace_id,name,definition,description) values(w,v->>'name',v->'definition',coalesce(v->>'description','')) returning id into entity;
 when 'update_workflow_draft' then
  select * into flow from public.workflows where workspace_id=w and id=(v->>'id')::uuid for update;
  if flow.id is null or flow.version<>(v->>'version')::integer then raise exception 'Workflow changed' using errcode='40001';end if;
  flow:=jsonb_populate_record(flow,v->'values');
  update public.workflows set name=flow.name,definition=flow.definition,description=flow.description where workspace_id=w and id=(v->>'id')::uuid returning id into entity;
 when 'add_to_list' then
  insert into public.list_entries(workspace_id,list_id,record_id) values(w,(v->>'list_id')::uuid,(v->>'record_id')::uuid) on conflict do nothing;
  select id into entity from public.list_entries where workspace_id=w and list_id=(v->>'list_id')::uuid and record_id=(v->>'record_id')::uuid;
 when 'remove_from_list' then
  delete from public.list_entries where workspace_id=w and list_id=(v->>'list_id')::uuid and record_id=(v->>'record_id')::uuid returning id into entity;
  if entity is null then entity:=(v->>'list_id')::uuid;end if;
 else raise exception 'Unknown action' using errcode='22023';end case;
 if entity is null then raise exception 'Action forbidden' using errcode='42501';end if;
 result:=jsonb_build_object('entity_id',entity);
 return relay_private.agent_action(w,'finish_crm',jsonb_build_object('id',action_id,'result',result));
end $$;
revoke all on function public.agent_apply(uuid,uuid,text,text) from public,anon;
grant execute on function public.agent_apply(uuid,uuid,text,text) to authenticated;



alter function public.agent_effect_worker(text,jsonb) rename to agent_effect_worker_v1;
revoke all on function public.agent_effect_worker_v1(text,jsonb) from public,anon,authenticated,service_role;
create function public.agent_effect_worker(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare a relay_private.agent_actions;j relay_private.jobs;i public.integrations;dep jsonb;begin
 if operation in ('prepare','verify_dispatch') then
  select * into j from relay_private.jobs where id=(payload->>'job_id')::uuid for update;
  select * into a from relay_private.agent_actions where id=(j.payload->>'agent_action_id')::uuid for update;
  if j.status<>'running' or j.lease is distinct from (payload->>'lease')::uuid or j.leased_until<=now() or a.job_id is distinct from j.id then raise exception 'Invalid agent lease' using errcode='40001';end if;
  if a.confirmed_digest is null or a.confirmed_digest is distinct from a.confirmation_digest or a.confirmation_digest is distinct from relay_private.agent_action_digest(a) or a.confirmation_expires_at<=clock_timestamp() then raise exception 'Approval expired or modified' using errcode='42501';end if;
  select * into i from public.integrations where id=a.account_id and workspace_id=a.workspace_id and user_id=a.user_id and status='connected';
  if i.id is null or i.email is distinct from a.account_email then raise exception 'Sender account revoked' using errcode='42501';end if;
  if operation='verify_dispatch' then
   if a.status<>'sending' or not exists(select 1 from relay_private.workflow_outbox where agent_action_id=a.id and status='sending') then raise exception 'No dispatch reservation' using errcode='40001';end if;
   if not exists(select 1 from public.memberships where workspace_id=a.workspace_id and user_id=a.user_id and role in ('owner','admin','member')) or a.access_fingerprint is distinct from relay_private.agent_access_fingerprint_for(a.workspace_id,a.user_id) then raise exception 'Access revoked' using errcode='42501';end if;
   for dep in select value from jsonb_array_elements(a.source_refs) loop
    if not relay_private.agent_source_allowed(a.workspace_id,a.user_id,dep->>'type',(dep->>'id')::uuid) then raise exception 'Source revoked' using errcode='42501';end if;
   end loop;
   if a.kind='draft_email' and ((a.input ? 'record_id' and not exists(select 1 from public.records where workspace_id=a.workspace_id and id=(a.input->>'record_id')::uuid and not archived and lower(email)=lower(a.input->>'to'))) or exists(select 1 from public.suppressions where workspace_id=a.workspace_id and lower(email)=lower(a.input->>'to'))) then raise exception 'Recipient changed' using errcode='42501';end if;
   if a.input ? 'reply_to_id' and not exists(select 1 from public.communications where workspace_id=a.workspace_id and user_id=a.user_id and id=(a.input->>'reply_to_id')::uuid and integration_id=a.account_id) then raise exception 'Reply source revoked' using errcode='42501';end if;
   return jsonb_build_object('status','sending');
  end if;
 end if;
 return public.agent_effect_worker_v1(operation,payload);
end $$;
revoke all on function public.agent_effect_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_effect_worker(text,jsonb) to service_role;

create function relay_private.agent_authorization_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or row(new.status,new.confirmed_digest,new.review_bound) is distinct from row(old.status,old.confirmed_digest,old.review_bound) then
  insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data,private_to)
   values(new.workspace_id,new.user_id,'agent_actions',new.id,case when tg_op='INSERT' then 'proposed' when new.status='cancelled' then 'refused' when new.confirmed_digest is distinct from old.confirmed_digest then 'authorized' else new.status end,
    jsonb_build_object('kind',new.kind,'status',new.status,'digest',new.confirmation_digest,'risk',new.security->>'risk','origin',new.security->>'origin','account_id',new.account_id),new.user_id);
 end if;return new;
end $$;
create trigger agent_authorization_audit after insert or update on relay_private.agent_actions for each row execute function relay_private.agent_authorization_audit();

create function public.agent_confirmation_denied(w uuid,action_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if relay_private.has_role(w) and exists(select 1 from relay_private.agent_actions where id=action_id and workspace_id=w and user_id=auth.uid())
    and (select count(*) from public.audit_events where workspace_id=w and actor_id=auth.uid() and action='confirmation_denied' and created_at>now()-interval '1 minute')<30 then
  insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,private_to) values(w,auth.uid(),'agent_actions',action_id,'confirmation_denied',auth.uid());
 end if;
end $$;
revoke all on function public.agent_confirmation_denied(uuid,uuid) from public,anon;
grant execute on function public.agent_confirmation_denied(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
