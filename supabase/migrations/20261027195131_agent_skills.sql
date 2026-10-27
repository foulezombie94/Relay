begin;
set local lock_timeout='5s';

create function relay_private.skill_keys_valid(v jsonb,depth integer default 0) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item record;part jsonb;
begin
 if depth>20 then return false;end if;
 if jsonb_typeof(v)='object' then
  for item in select key,value from jsonb_each(v) loop
   if item.key in ('__proto__','constructor','prototype') or not relay_private.skill_keys_valid(item.value,depth+1) then return false;end if;
  end loop;
 elsif jsonb_typeof(v)='array' then for part in select value from jsonb_array_elements(v) loop if not relay_private.skill_keys_valid(part,depth+1) then return false;end if;end loop;
 end if;return true;
end $$;

create function relay_private.skill_ref_allowed(w uuid,kind text,ref uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w) then return false;end if;
 if kind='record' then return exists(select 1 from public.records r where r.workspace_id=w and r.id=ref and not r.archived and relay_private.reader_record_allowed(w,r.id));
 elsif kind='note' then return exists(select 1 from public.notes n where n.workspace_id=w and n.id=ref and (not n.private or n.author_id=auth.uid()) and (case when n.record_id is null then not relay_private.reader_limited(w) else relay_private.reader_record_allowed(w,n.record_id) end));
 elsif kind='document' then return exists(select 1 from public.documents d where d.workspace_id=w and d.id=ref and (case when d.record_id is null then not relay_private.reader_limited(w) else relay_private.reader_record_allowed(w,d.record_id) end));
 end if;return false;
end $$;

create function relay_private.skill_values(w uuid,m jsonb,vals jsonb,allow_missing boolean default false,check_refs boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare field jsonb;v jsonb;k text;item jsonb;result jsonb:='{}';
begin
 if jsonb_typeof(vals)<>'object' or octet_length(vals::text)>180000 or not relay_private.skill_keys_valid(vals) then raise exception 'Invalid skill values' using errcode='22023';end if;
 for k in select jsonb_object_keys(vals) loop if not exists(select 1 from jsonb_array_elements(m->'inputs') f where f->>'key'=k) then raise exception 'Unknown skill input' using errcode='22023';end if;end loop;
 for field in select value from jsonb_array_elements(m->'inputs') loop
  k:=field->>'key';v:=case when vals?k then vals->k else field->'default' end;
  if v is null or v='null'::jsonb or (jsonb_typeof(v)='string' and btrim(v#>>'{}',E' \n\r\t'||chr(160)||chr(8195)||chr(8203)||chr(65279))='') then
   if (field->>'required')::boolean and not allow_missing then raise exception 'Required skill input missing' using errcode='22023';end if;continue;
  end if;
  case field->>'kind'
   when 'number' then if jsonb_typeof(v)<>'number' then raise exception 'Invalid number' using errcode='22023';end if;
   when 'boolean' then if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid boolean' using errcode='22023';end if;
   when 'records' then
    if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<coalesce((field->>'min_items')::integer,1) or jsonb_array_length(v)>20 then raise exception 'Invalid record selection' using errcode='22023';end if;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(v)) then raise exception 'Duplicate records' using errcode='22023';end if;
    for item in select value from jsonb_array_elements(v) loop
     if jsonb_typeof(item)<>'string' or (item#>>'{}')!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' then raise exception 'Invalid record reference' using errcode='22023';end if;
     if check_refs and not relay_private.skill_ref_allowed(w,'record',(item#>>'{}')::uuid) then raise exception 'Record unavailable' using errcode='42501';end if;
    end loop;
   else
    if jsonb_typeof(v)<>'string' or length(v#>>'{}')>4000 then raise exception 'Invalid text input' using errcode='22023';end if;
    if field->>'kind'='record' then
     if (v#>>'{}')!~'^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' then raise exception 'Invalid record reference' using errcode='22023';end if;
     if check_refs and not relay_private.skill_ref_allowed(w,'record',(v#>>'{}')::uuid) then raise exception 'Record unavailable' using errcode='42501';end if;
    elsif field->>'kind'='date' then
     if (v#>>'{}')!~'^\d{4}-\d{2}-\d{2}$' or to_char((v#>>'{}')::date,'YYYY-MM-DD')<>v#>>'{}' then raise exception 'Invalid date' using errcode='22023';end if;
    elsif field->>'kind'='choice' and not (field->'options' @> jsonb_build_array(v)) then raise exception 'Invalid choice' using errcode='22023';end if;
  end case;
  result:=result||jsonb_build_object(k,v);
 end loop;return result;
end $$;

-- Generated from the shared Zod output contract. Never rewrite after application.
create function relay_private.skill_manifest_valid(m jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare f jsonb;t jsonb;
begin
 if m is null or octet_length(m::text)>180000 or not coalesce(extensions.jsonb_matches_schema($schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":100},"description":{"type":"string","minLength":10,"maxLength":500},"category":{"type":"string","enum":["commercial","suivi","analyse","redaction","organisation"]},"tags":{"maxItems":8,"type":"array","items":{"type":"string","minLength":1,"maxLength":30}},"instructions":{"type":"string","minLength":10,"maxLength":12000},"use_when":{"maxItems":8,"type":"array","items":{"type":"string","minLength":1,"maxLength":300}},"avoid_when":{"maxItems":8,"type":"array","items":{"type":"string","minLength":1,"maxLength":300}},"inputs":{"maxItems":12,"type":"array","items":{"type":"object","properties":{"key":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,39}$"},"label":{"type":"string","minLength":1,"maxLength":100},"kind":{"type":"string","enum":["text","long_text","record","records","date","number","choice","boolean"]},"required":{"type":"boolean"},"options":{"maxItems":30,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"min_items":{"type":"integer","minimum":1,"maximum":20},"default":{"anyOf":[{"anyOf":[{"type":"string","maxLength":4000},{"type":"number"},{"type":"boolean"},{"type":"null"}]},{"minItems":1,"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}]}},"required":["key","label","kind","required","options"],"additionalProperties":false}},"tools":{"maxItems":40,"type":"array","items":{"type":"string","enum":["search_records","search_emails","search_calendar","search_meetings","search_notes","search_tasks","search_commitments","search_documents","search_conflicts","search_lists","search_pipelines","search_workflows","get_record","get_source","get_email_thread","get_accounts","get_crm_schema","aggregate_crm_data","create_record","update_record","create_task","update_task","create_note","update_note","draft_email","create_calendar_event","update_calendar_event","cancel_calendar_event","propose_commitment","propose_conflict","update_commitment","create_workflow_draft","update_workflow_draft","add_to_list","remove_from_list","send_email","get_action_status"]}},"steps":{"minItems":1,"maxItems":12,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,39}$"},"title":{"type":"string","minLength":1,"maxLength":100},"instruction":{"type":"string","minLength":1,"maxLength":1500}},"required":["id","title","instruction"],"additionalProperties":false}},"resources":{"maxItems":12,"type":"array","items":{"type":"object","properties":{"type":{"type":"string","enum":["record","note","document"]},"id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"label":{"type":"string","maxLength":100}},"required":["type","id","label"],"additionalProperties":false}},"dependencies":{"maxItems":5,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"output":{"type":"object","properties":{"format":{"type":"string","enum":["brief","table","checklist","report","email","custom","skill_manifest"]},"requirements":{"maxItems":12,"type":"array","items":{"type":"string","minLength":1,"maxLength":300}}},"required":["format","requirements"],"additionalProperties":false},"budget":{"type":"object","properties":{"tool_calls":{"type":"integer","minimum":0,"maximum":15},"output_tokens":{"type":"integer","minimum":500,"maximum":3000},"duration_seconds":{"type":"integer","minimum":5,"maximum":60}},"required":["tool_calls","output_tokens","duration_seconds"],"additionalProperties":false},"examples":{"maxItems":8,"type":"array","items":{"type":"object","properties":{"request":{"type":"string","minLength":1,"maxLength":1000},"expected":{"type":"string","minLength":1,"maxLength":3000}},"required":["request","expected"],"additionalProperties":false}},"tests":{"maxItems":10,"type":"array","items":{"type":"object","properties":{"name":{"type":"string","minLength":1,"maxLength":100},"kind":{"default":"normal","type":"string","enum":["normal","missing_input","ambiguous","adversarial"]},"request":{"type":"string","minLength":1,"maxLength":1000},"expected":{"default":"answer","type":"string","enum":["answer","clarify","reject"]},"input":{"type":"object","propertyNames":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,39}$"},"additionalProperties":{"anyOf":[{"anyOf":[{"type":"string","maxLength":4000},{"type":"number"},{"type":"boolean"},{"type":"null"}]},{"minItems":1,"maxItems":20,"type":"array","items":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}}]}},"contains":{"maxItems":10,"type":"array","items":{"type":"string","minLength":1,"maxLength":200}},"excludes":{"maxItems":10,"type":"array","items":{"type":"string","minLength":1,"maxLength":200}},"min_sources":{"type":"integer","minimum":0,"maximum":20},"forbidden_tools":{"default":[],"maxItems":40,"type":"array","items":{"type":"string","enum":["search_records","search_emails","search_calendar","search_meetings","search_notes","search_tasks","search_commitments","search_documents","search_conflicts","search_lists","search_pipelines","search_workflows","get_record","get_source","get_email_thread","get_accounts","get_crm_schema","aggregate_crm_data","create_record","update_record","create_task","update_task","create_note","update_note","draft_email","create_calendar_event","update_calendar_event","cancel_calendar_event","propose_commitment","propose_conflict","update_commitment","create_workflow_draft","update_workflow_draft","add_to_list","remove_from_list","send_email","get_action_status"]}}},"required":["name","kind","request","expected","input","contains","excludes","min_sources","forbidden_tools"],"additionalProperties":false}}},"required":["name","description","category","tags","instructions","use_when","avoid_when","inputs","tools","steps","resources","dependencies","output","budget","examples","tests"],"additionalProperties":false}$schema$::json,m),false) then return false;end if;
 if not relay_private.skill_keys_valid(m) then return false;end if;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(m->'tools')) or (select count(*)<>count(distinct input_row->>'key') from jsonb_array_elements(m->'inputs') input_row) or (select count(*)<>count(distinct step_row->>'id') from jsonb_array_elements(m->'steps') step_row) then return false;end if;
 if jsonb_array_length(m->'tools')>0 and (m#>>'{budget,tool_calls}')::integer=0 then return false;end if;
 for f in select value from jsonb_array_elements(m->'inputs') loop
  if f->>'key' in ('constructor','prototype','__proto__') or ((f->>'kind'='choice')<>(jsonb_array_length(f->'options')>0)) or (f?'min_items' and f->>'kind'<>'records') or (select count(*)<>count(distinct value) from jsonb_array_elements(f->'options')) then return false;end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(m->'steps') s where s->>'id' in ('constructor','prototype','__proto__')) then return false;end if;
 perform relay_private.skill_values(null,m,'{}',true,false);
 for t in select value from jsonb_array_elements(m->'tests') loop
  if t->>'kind'='missing_input' and t->>'expected'='answer' then return false;end if;
  perform relay_private.skill_values(null,m,t->'input',t->>'kind'<>'normal',false);
 end loop;return true;
exception when others then return false;
end $$;

create table relay_private.agent_skills(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 owner_id uuid not null,visibility text not null default 'private' check(visibility in ('private','workspace')),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 revision integer not null default 1 check(revision>0),draft jsonb not null check(relay_private.skill_manifest_valid(draft)),
 published_version_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,id)
);
create index agent_skills_workspace_idx on relay_private.agent_skills(workspace_id,status,id);
create table relay_private.agent_skill_versions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,skill_id uuid not null,number integer not null check(number>0),
 manifest jsonb not null check(relay_private.skill_manifest_valid(manifest)),content_hash text not null,created_by uuid not null,created_at timestamptz not null default now(),
 foreign key(workspace_id,skill_id) references relay_private.agent_skills(workspace_id,id) on delete cascade,unique(workspace_id,skill_id,id),unique(skill_id,number)
);
create index agent_skill_versions_workspace_idx on relay_private.agent_skill_versions(workspace_id,skill_id,number desc);
alter table relay_private.agent_skills add foreign key(workspace_id,id,published_version_id) references relay_private.agent_skill_versions(workspace_id,skill_id,id) deferrable initially deferred;
create table relay_private.agent_skill_grants(
 workspace_id uuid not null,skill_id uuid not null,user_id uuid not null,permission text not null check(permission in ('use','edit','publish')),
 primary key(workspace_id,skill_id,user_id),foreign key(workspace_id,skill_id) references relay_private.agent_skills(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id) on delete cascade
);
create index agent_skill_grants_user_idx on relay_private.agent_skill_grants(user_id,workspace_id,skill_id);
create table relay_private.agent_skill_preferences(
 workspace_id uuid not null,skill_id uuid not null,user_id uuid not null,enabled boolean not null default false,auto_select boolean not null default false,favorite boolean not null default false,
 granted_version_id uuid,granted_tools text[] not null default '{}',primary key(workspace_id,skill_id,user_id),
 foreign key(workspace_id,skill_id) references relay_private.agent_skills(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id) on delete cascade,
 foreign key(workspace_id,skill_id,granted_version_id) references relay_private.agent_skill_versions(workspace_id,skill_id,id)
);
create index agent_skill_preferences_user_idx on relay_private.agent_skill_preferences(user_id,workspace_id,skill_id);
create table relay_private.agent_skill_runs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,skill_id uuid not null,version_id uuid not null,user_id uuid not null,
 request_id uuid not null,conversation_id uuid,engine_run_id uuid not null references relay_private.agent_runs(id),status text not null default 'running' check(status in ('queued','running','waiting_approval','completed','partial','cancelled','failed')),
 mode text not null check(mode in ('ask','review','auto')),inputs jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(workspace_id,skill_id,version_id) references relay_private.agent_skill_versions(workspace_id,skill_id,id),
 unique(workspace_id,user_id,request_id)
);
create index agent_skill_runs_skill_idx on relay_private.agent_skill_runs(workspace_id,skill_id,user_id,created_at desc);
-- Results remain in the private conversation, whose source revalidation is reused.
-- The run ledger deliberately contains no source bodies or generated answer.
do $$declare tab text;begin
 foreach tab in array array['agent_skills','agent_skill_versions','agent_skill_grants','agent_skill_preferences','agent_skill_runs'] loop
  execute format('alter table relay_private.%I enable row level security',tab);
  execute format('revoke all on relay_private.%I from public,anon,authenticated',tab);
 end loop;
end $$;

create function relay_private.skill_allowed(w uuid,s uuid,required_permission text default 'use') returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and relay_private.has_role(w) and exists(select 1 from relay_private.agent_skills a where a.workspace_id=w and a.id=s and (
  a.owner_id=auth.uid() or exists(select 1 from relay_private.agent_skill_grants g where g.workspace_id=w and g.skill_id=s and g.user_id=auth.uid() and (required_permission='use' or g.permission='publish' or (required_permission='edit' and g.permission='edit'))) or
  (a.visibility='workspace' and ((required_permission='use' and a.status='published') or (required_permission in ('edit','publish') and relay_private.has_role(w,array['owner','admin']))))
 ))
$$;
create function relay_private.skill_resources_allowed(w uuid,m jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(m->'resources') r where not relay_private.skill_ref_allowed(w,r->>'type',(r->>'id')::uuid))
$$;
create function relay_private.skill_summary(a relay_private.agent_skills) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'workspace_id',a.workspace_id,'owner_id',a.owner_id,'name',case when a.owner_id=auth.uid() or relay_private.skill_allowed(a.workspace_id,a.id,'edit') then a.draft->>'name' else v.manifest->>'name' end,
 'description',case when a.owner_id=auth.uid() or relay_private.skill_allowed(a.workspace_id,a.id,'edit') then a.draft->>'description' else v.manifest->>'description' end,
 'category',coalesce(v.manifest->>'category',a.draft->>'category'),'tags',coalesce(v.manifest->'tags',a.draft->'tags'),'visibility',a.visibility,'status',a.status,'revision',a.revision,'published_version_id',a.published_version_id,'updated_at',a.updated_at,
 'enabled',coalesce(p.enabled,false),'auto_select',coalesce(p.auto_select,false),'favorite',coalesce(p.favorite,false),'granted_version_id',p.granted_version_id,'granted_tools',coalesce(to_jsonb(p.granted_tools),'[]'),
 'usage_count',(select count(*) from relay_private.agent_skill_runs r where r.workspace_id=a.workspace_id and r.skill_id=a.id),'can_edit',relay_private.skill_allowed(a.workspace_id,a.id,'edit'),'can_publish',relay_private.skill_allowed(a.workspace_id,a.id,'publish'))
 from (select 1) base left join relay_private.agent_skill_preferences p on p.workspace_id=a.workspace_id and p.skill_id=a.id and p.user_id=auth.uid() left join relay_private.agent_skill_versions v on v.id=a.published_version_id
$$;

create function relay_private.agent_skill_studio(w uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare a relay_private.agent_skills;v relay_private.agent_skill_versions;p relay_private.agent_skill_preferences;r relay_private.agent_skill_runs;
 actor uuid:=auth.uid();s uuid;target uuid;manifest jsonb;vals jsonb;result jsonb;next_id uuid;num integer;
begin
 if actor is null or not relay_private.has_role(w) then raise exception 'Workspace unavailable' using errcode='42501';end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>240000 or not relay_private.skill_keys_valid(payload) then raise exception 'Invalid payload' using errcode='22023';end if;
 if operation='list' then
  select coalesce(jsonb_agg(relay_private.skill_summary(x) order by x.id),'[]') into result from (select catalog.* from relay_private.agent_skills catalog left join relay_private.agent_skill_versions sv on sv.id=catalog.published_version_id where catalog.workspace_id=w and relay_private.skill_allowed(w,catalog.id) and (catalog.status<>'draft' or relay_private.skill_allowed(w,catalog.id,'edit')) and (payload->>'after' is null or catalog.id>(payload->>'after')::uuid) and (coalesce(payload->>'q','')='' or position(lower(payload->>'q') in lower(case when relay_private.skill_allowed(w,catalog.id,'edit') then catalog.draft->>'name'||' '||catalog.draft->>'description' else sv.manifest->>'name'||' '||sv.manifest->>'description' end))>0) order by catalog.id limit 200) x;
  return jsonb_build_object('data',result,'next',case when jsonb_array_length(result)=200 then result->199->>'id' end);
 elsif operation in ('create','install') then
  if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Write access required' using errcode='42501';end if;
  if payload->>'visibility'='workspace' and not relay_private.has_role(w,array['owner','admin']) then raise exception 'Team publication requires an administrator' using errcode='42501';end if;
  manifest:=payload->'manifest';if not relay_private.skill_manifest_valid(manifest) or not relay_private.skill_resources_allowed(w,manifest) then raise exception 'Invalid skill manifest' using errcode='22023';end if;
  s:=coalesce((payload->>'id')::uuid,gen_random_uuid());
  select * into a from relay_private.agent_skills where id=s for update;
  if found then
   if a.workspace_id<>w or a.owner_id<>actor or a.draft<>manifest then raise exception 'Skill already exists' using errcode='23505';end if;
  else
   insert into relay_private.agent_skills(id,workspace_id,owner_id,draft,visibility) values(s,w,actor,manifest,coalesce(payload->>'visibility','private')) returning * into a;
  end if;
  if operation='install' and a.published_version_id is null then perform relay_private.agent_skill_studio(w,'publish',jsonb_build_object('id',s,'revision',a.revision));end if;
  return relay_private.agent_skill_studio(w,'get',jsonb_build_object('id',s));
 end if;
 s:=(payload->>'id')::uuid;
 select * into a from relay_private.agent_skills where workspace_id=w and id=s for update;
 if not found or not relay_private.skill_allowed(w,s) then raise exception 'Skill unavailable' using errcode='42501';end if;
 if operation='get' then
  select coalesce(jsonb_agg(to_jsonb(snapshot) order by snapshot.number desc),'[]') into result from (select av.* from relay_private.agent_skill_versions av where av.workspace_id=w and av.skill_id=s and relay_private.skill_resources_allowed(w,av.manifest) order by av.number desc limit 50) snapshot;
  return jsonb_build_object('skill',relay_private.skill_summary(a),'draft',case when relay_private.skill_allowed(w,s,'edit') and relay_private.skill_resources_allowed(w,a.draft) then a.draft end,'versions',result,
   'grants',case when a.owner_id=actor or (a.visibility='workspace' and relay_private.has_role(w,array['owner','admin'])) then (select coalesce(jsonb_agg(jsonb_build_object('user_id',g.user_id,'permission',g.permission)),'[]') from relay_private.agent_skill_grants g where g.workspace_id=w and g.skill_id=s) else '[]'::jsonb end,
   'runs',(select coalesce(jsonb_agg(to_jsonb(recent_run) order by recent_run.created_at desc),'[]') from (select sr.* from relay_private.agent_skill_runs sr where sr.workspace_id=w and sr.skill_id=s and sr.user_id=actor order by sr.created_at desc limit 30) recent_run));
 elsif operation='version' then
  select av.* into v from relay_private.agent_skill_versions av where av.workspace_id=w and av.skill_id=s and av.id=(payload->>'version_id')::uuid and relay_private.skill_resources_allowed(w,av.manifest);
  if not found then raise exception 'Version unavailable' using errcode='42501';end if;return to_jsonb(v);
 elsif operation='preference' then
  select * into p from relay_private.agent_skill_preferences where workspace_id=w and skill_id=s and user_id=actor;
  if payload?'granted_tools' then
   select * into strict v from relay_private.agent_skill_versions where workspace_id=w and skill_id=s and id=(payload->>'version_id')::uuid;
   if v.id<>a.published_version_id or payload->'granted_tools'<>v.manifest->'tools' then raise exception 'Review current tools' using errcode='22023';end if;
  end if;
  insert into relay_private.agent_skill_preferences(workspace_id,skill_id,user_id,enabled,auto_select,favorite,granted_version_id,granted_tools)
   values(w,s,actor,coalesce((payload->>'enabled')::boolean,p.enabled,false),coalesce((payload->>'auto_select')::boolean,p.auto_select,false),coalesce((payload->>'favorite')::boolean,p.favorite,false),coalesce(v.id,p.granted_version_id),case when payload?'granted_tools' then array(select jsonb_array_elements_text(v.manifest->'tools')) else coalesce(p.granted_tools,'{}') end)
   on conflict(workspace_id,skill_id,user_id) do update set enabled=excluded.enabled,auto_select=excluded.auto_select,favorite=excluded.favorite,granted_version_id=excluded.granted_version_id,granted_tools=excluded.granted_tools;
  return relay_private.skill_summary(a);
 elsif operation in ('begin_run','finish_run') then raise exception 'Engine operation only' using errcode='42501';
 elsif operation='cancel_run' then
  update relay_private.agent_skill_runs set status='cancelled',updated_at=now() where workspace_id=w and skill_id=s and id=(payload->>'run_id')::uuid and user_id=actor and status in ('queued','running','waiting_approval') returning * into r;
  return to_jsonb(r);
 elsif operation='run_status' then
  select * into strict r from relay_private.agent_skill_runs where workspace_id=w and skill_id=s and id=(payload->>'run_id')::uuid and user_id=actor;
  select * into strict v from relay_private.agent_skill_versions where id=r.version_id and workspace_id=w and skill_id=s;
  select * into p from relay_private.agent_skill_preferences where workspace_id=w and skill_id=s and user_id=actor;
  if not coalesce(p.enabled,false) or not array(select jsonb_array_elements_text(v.manifest->'tools'))<@p.granted_tools or not relay_private.skill_resources_allowed(w,v.manifest) then raise exception 'Skill access revoked' using errcode='42501';end if;
  return jsonb_build_object('status',r.status);
 elsif operation='grant' then
  if a.owner_id<>actor and not (a.visibility='workspace' and relay_private.has_role(w,array['owner','admin'])) then raise exception 'Sharing unavailable' using errcode='42501';end if;
  target:=(payload->>'user_id')::uuid;
  if not exists(select 1 from public.memberships where workspace_id=w and user_id=target) then raise exception 'Member unavailable' using errcode='42501';end if;
  if payload->>'permission' is null then delete from relay_private.agent_skill_grants where workspace_id=w and skill_id=s and user_id=target;
  else insert into relay_private.agent_skill_grants(workspace_id,skill_id,user_id,permission) values(w,s,target,payload->>'permission') on conflict(workspace_id,skill_id,user_id) do update set permission=excluded.permission;end if;
  return relay_private.agent_skill_studio(w,'get',jsonb_build_object('id',s));
 end if;
 if not relay_private.has_role(w,array['owner','admin','member']) or not relay_private.skill_allowed(w,s,'edit') then raise exception 'Edit access required' using errcode='42501';end if;
 if (payload->>'revision')::integer is distinct from a.revision then raise exception 'Skill changed' using errcode='40001';end if;
 if operation='save' then
  manifest:=payload->'manifest';if not relay_private.skill_manifest_valid(manifest) or not relay_private.skill_resources_allowed(w,manifest) then raise exception 'Invalid skill manifest' using errcode='22023';end if;
  if payload->>'visibility'='workspace' and not relay_private.has_role(w,array['owner','admin']) then raise exception 'Team publication requires an administrator' using errcode='42501';end if;
  if payload?'visibility' and payload->>'visibility' is distinct from a.visibility and a.owner_id<>actor and not (a.visibility='workspace' and relay_private.has_role(w,array['owner','admin'])) then raise exception 'Sharing unavailable' using errcode='42501';end if;
  update relay_private.agent_skills set draft=manifest,visibility=coalesce(payload->>'visibility',visibility),revision=revision+1,updated_at=now() where id=s;
 elsif operation='publish' then
  if not relay_private.skill_allowed(w,s,'publish') then raise exception 'Publish access required' using errcode='42501';end if;
  if a.visibility='workspace' and not relay_private.has_role(w,array['owner','admin']) then raise exception 'Team publication requires an administrator' using errcode='42501';end if;
  if not relay_private.skill_resources_allowed(w,a.draft) then raise exception 'Resource unavailable' using errcode='42501';end if;
  if exists(select 1 from jsonb_array_elements_text(a.draft->'dependencies') d where not exists(select 1 from relay_private.agent_skill_versions dv where dv.id=d::uuid and dv.workspace_id=w and relay_private.skill_allowed(w,dv.skill_id) and relay_private.skill_resources_allowed(w,dv.manifest))) then raise exception 'Dependency unavailable' using errcode='42501';end if;
  select coalesce(max(number),0)+1 into num from relay_private.agent_skill_versions where skill_id=s;
  insert into relay_private.agent_skill_versions(workspace_id,skill_id,number,manifest,content_hash,created_by) values(w,s,num,a.draft,encode(sha256(convert_to(a.draft::text,'UTF8')),'hex'),actor) returning id into next_id;
  update relay_private.agent_skills set published_version_id=next_id,status='published',revision=revision+1,updated_at=now() where id=s;
  insert into relay_private.agent_skill_preferences(workspace_id,skill_id,user_id,enabled,granted_version_id,granted_tools) values(w,s,actor,true,next_id,array(select jsonb_array_elements_text(a.draft->'tools'))) on conflict(workspace_id,skill_id,user_id) do update set enabled=true,granted_version_id=excluded.granted_version_id,granted_tools=excluded.granted_tools;
 elsif operation='restore' then
  select * into strict v from relay_private.agent_skill_versions where workspace_id=w and skill_id=s and id=(payload->>'version_id')::uuid;
  if not relay_private.skill_resources_allowed(w,v.manifest) then raise exception 'Resource unavailable' using errcode='42501';end if;
  update relay_private.agent_skills set draft=v.manifest,revision=revision+1,updated_at=now() where id=s;
 elsif operation='archive' then
  if not relay_private.skill_allowed(w,s,'publish') then raise exception 'Publish access required' using errcode='42501';end if;
  update relay_private.agent_skills set status='archived',revision=revision+1,updated_at=now() where id=s;
 else raise exception 'Unknown skill operation' using errcode='22023';end if;
 return relay_private.agent_skill_studio(w,'get',jsonb_build_object('id',s));
end $$;

-- Only the backend can start or settle executions. Identity comes from its
-- authenticated context; the opaque capability belongs to the existing engine.
create function relay_private.agent_skill_engine(w uuid,u uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare engine relay_private.agent_runs;a relay_private.agent_skills;v relay_private.agent_skill_versions;p relay_private.agent_skill_preferences;r relay_private.agent_skill_runs;
 original_sub text:=current_setting('request.jwt.claim.sub',true);original_claims text:=current_setting('request.jwt.claims',true);
 msg jsonb;chosen_mode text;vals jsonb;result jsonb;
begin
 if u is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>240000 or not relay_private.skill_keys_valid(payload) then raise exception 'Invalid engine payload' using errcode='22023';end if;
 select * into engine from relay_private.agent_runs where id=(payload->>'engine_run_id')::uuid and workspace_id=w and user_id=u for update;
 if not found or engine.capability_hash is distinct from encode(sha256(convert_to(coalesce(payload->>'secret',''),'UTF8')),'hex') then raise exception 'Invalid engine capability' using errcode='42501';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 if operation='begin' then
  if payload?'mode' then raise exception 'Mode comes from the verified conversation' using errcode='22023';end if;
  if not relay_private.has_role(w) or engine.status<>'running' or engine.expires_at<=now() then raise exception 'Engine unavailable' using errcode='42501';end if;
  select * into a from relay_private.agent_skills where workspace_id=w and id=(payload->>'id')::uuid for update;
  if not found or a.status<>'published' or not relay_private.skill_allowed(w,a.id) then raise exception 'Skill unavailable' using errcode='42501';end if;
  select * into strict v from relay_private.agent_skill_versions where workspace_id=w and skill_id=a.id and id=(payload->>'version_id')::uuid;
  select * into p from relay_private.agent_skill_preferences where workspace_id=w and skill_id=a.id and user_id=u;
  if not coalesce(p.enabled,false) or p.granted_version_id is distinct from v.id or not (array(select jsonb_array_elements_text(v.manifest->'tools'))<@p.granted_tools) or not relay_private.skill_resources_allowed(w,v.manifest) or (payload->>'selection'='automatic' and not p.auto_select) then raise exception 'Skill permission review required' using errcode='42501';end if;
  select entry into msg from public.ai_conversations c cross join lateral jsonb_array_elements(c.messages) with ordinality as m(entry,ordinal)
   where c.workspace_id=w and c.id=(payload->>'conversation_id')::uuid and c.user_id=u and entry->>'role'='user' and entry->>'request_id'=payload->>'request_id' order by ordinal desc limit 1;
  chosen_mode:=msg->>'approval_mode';
  if chosen_mode is null or chosen_mode not in ('ask','review','auto') or msg->>'content' is distinct from engine.original_request then raise exception 'Conversation request unavailable' using errcode='42501';end if;
  vals:=relay_private.skill_values(w,v.manifest,coalesce(payload->'inputs','{}'));
  if (select count(*) from relay_private.agent_skill_runs x where x.workspace_id=w and x.user_id=u and x.created_at>now()-interval '1 day')>=1000 then raise exception 'Skill run quota exceeded' using errcode='53300';end if;
  insert into relay_private.agent_skill_runs(workspace_id,skill_id,version_id,user_id,request_id,conversation_id,engine_run_id,mode,inputs)
   values(w,a.id,v.id,u,(payload->>'request_id')::uuid,(payload->>'conversation_id')::uuid,engine.id,chosen_mode,vals) on conflict(workspace_id,user_id,request_id) do nothing returning * into r;
  if not found then raise exception 'Skill request already admitted' using errcode='40001';end if;
  result:=to_jsonb(r);
 elsif operation='finish' then
  if payload->>'status' not in ('completed','partial','cancelled','failed','waiting_approval') then raise exception 'Invalid engine outcome' using errcode='22023';end if;
  update relay_private.agent_skill_runs set status=payload->>'status',updated_at=now() where workspace_id=w and engine_run_id=engine.id and id=(payload->>'run_id')::uuid and user_id=u and status in ('queued','running','waiting_approval') returning * into r;
  result:=to_jsonb(r);
 else raise exception 'Unknown engine operation' using errcode='22023';end if;
 perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);perform set_config('request.jwt.claims',coalesce(original_claims,''),true);return result;
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(original_sub,''),true);perform set_config('request.jwt.claims',coalesce(original_claims,''),true);raise;
end $$;
create function public.agent_skill_engine(w uuid,u uuid,operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select relay_private.agent_skill_engine(w,u,operation,payload)$$;
revoke all on function relay_private.agent_skill_engine(uuid,uuid,text,jsonb),public.agent_skill_engine(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.agent_skill_engine(uuid,uuid,text,jsonb),public.agent_skill_engine(uuid,uuid,text,jsonb) to service_role;

create function public.agent_skill_studio(w uuid,operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select relay_private.agent_skill_studio(w,operation,payload)$$;
revoke all on function relay_private.skill_keys_valid(jsonb,integer),relay_private.skill_ref_allowed(uuid,text,uuid),relay_private.skill_values(uuid,jsonb,jsonb,boolean,boolean),relay_private.skill_manifest_valid(jsonb),relay_private.skill_allowed(uuid,uuid,text),relay_private.skill_resources_allowed(uuid,jsonb),relay_private.skill_summary(relay_private.agent_skills),relay_private.agent_skill_studio(uuid,text,jsonb),public.agent_skill_studio(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function relay_private.agent_skill_studio(uuid,text,jsonb),public.agent_skill_studio(uuid,text,jsonb) to authenticated;
commit;
