-- Immutable releases and durable, fenced workflow executions.
alter table public.workflows add column description text not null default '', add column created_by uuid default auth.uid() references auth.users(id), add column published_version integer, add column runner_id uuid references auth.users(id);
create index workflows_creator_idx on public.workflows(created_by);
create index workflows_runner_idx on public.workflows(runner_id);
revoke insert,update,delete on public.workflows from authenticated;
grant insert(workspace_id,name,definition,description),update(name,definition,description) on public.workflows to authenticated;
create policy workflow_owner_update on public.workflows as restrictive for update to authenticated using(created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin']) or created_by is null) with check(created_by=(select auth.uid()) or relay_private.has_role(workspace_id,array['owner','admin']) or created_by is null);
create table relay_private.workflow_releases(
 workspace_id uuid not null,workflow_id uuid not null,version integer not null,definition jsonb not null,
 created_at timestamptz not null default now(),primary key(workspace_id,workflow_id,version),
 foreign key(workspace_id,workflow_id) references public.workflows(workspace_id,id) on delete cascade
);
alter table relay_private.workflow_releases enable row level security;
revoke all on relay_private.workflow_releases from public,anon,authenticated;
create table public.workflow_executions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,workflow_id uuid not null,workflow_version integer not null,
 record_id uuid not null,record_name text not null,record_version integer not null,created_by uuid not null references auth.users(id),
 source text not null check(source in ('manual','record_created','record_updated','stage_changed')),
 dedupe_key text not null check(length(dedupe_key)<=300),
 status text not null default 'queued' check(status in ('queued','running','waiting','paused','completed','failed','cancelled','skipped')),
 cursor integer not null default 0,trace jsonb not null default '[]' check(jsonb_array_length(trace)<=80),
 next_at timestamptz,error_code text,job_id uuid references relay_private.jobs(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),completed_at timestamptz,
 foreign key(workspace_id,workflow_id,workflow_version) references relay_private.workflow_releases(workspace_id,workflow_id,version),
 foreign key(workspace_id,record_id) references public.records(workspace_id,id),
 unique(workspace_id,workflow_id,dedupe_key),unique(workspace_id,id)
);
create index workflow_execution_history_idx on public.workflow_executions(workspace_id,workflow_id,created_at desc,id);
create index workflow_execution_record_idx on public.workflow_executions(workspace_id,record_id);
create index workflow_execution_creator_idx on public.workflow_executions(created_by);
create index workflow_execution_job_idx on public.workflow_executions(job_id) where job_id is not null;
create index workflow_execution_pending_idx on public.workflow_executions(workspace_id,status) where status in ('queued','running','waiting','paused');
create table relay_private.workflow_once_enrollments(
 workspace_id uuid not null,workflow_id uuid not null,record_id uuid not null,created_at timestamptz not null default now(),
 primary key(workspace_id,workflow_id,record_id),
 foreign key(workspace_id,workflow_id) references public.workflows(workspace_id,id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
alter table relay_private.workflow_once_enrollments enable row level security;
revoke all on relay_private.workflow_once_enrollments from public,anon,authenticated;
create index workflow_execution_backlog_idx on public.workflow_executions(created_at) where status='queued' and job_id is null;
create index workflow_execution_retention_idx on public.workflow_executions(completed_at) where completed_at is not null;
alter table public.workflow_executions enable row level security;
revoke all on public.workflow_executions from public,anon,authenticated;
grant select on public.workflow_executions to authenticated;
create policy workflow_executions_read on public.workflow_executions for select to authenticated using(relay_private.has_role(workspace_id,array['owner','admin','member']));
create table relay_private.workflow_state(
 execution_id uuid primary key references public.workflow_executions(id) on delete cascade,steps jsonb not null,
 strict_version boolean not null default false
);
alter table relay_private.workflow_state enable row level security;
revoke all on relay_private.workflow_state from public,anon,authenticated;

create function relay_private.workflow_value(rec jsonb,field text) returns text language sql immutable set search_path='' as $$
 select case when field like 'attributes.%' then rec->'attributes'->>substr(field,12) else rec->>field end
$$;
create function relay_private.workflow_matches(rec jsonb,conditions jsonb,mode text default 'all') returns boolean language plpgsql immutable set search_path='' as $$
declare c jsonb;v text;wanted text;ok boolean;
begin
 if jsonb_array_length(conditions)=0 then return true;end if;
 for c in select value from jsonb_array_elements(conditions) loop
  v:=relay_private.workflow_value(rec,c->>'field');wanted:=c->>'value';
  ok:=case c->>'operator'
   when 'exists' then v is not null and v<>'' when 'not_exists' then v is null or v=''
   when 'equals' then coalesce(v,'')=coalesce(wanted,'') when 'not_equals' then coalesce(v,'')<>coalesce(wanted,'')
   when 'contains' then position(lower(coalesce(wanted,'')) in lower(coalesce(v,'')))>0
   when 'gt' then case when v~'^-?[0-9]+(\.[0-9]+)?$' and wanted~'^-?[0-9]+(\.[0-9]+)?$' then v::numeric>wanted::numeric else false end
   when 'lt' then case when v~'^-?[0-9]+(\.[0-9]+)?$' and wanted~'^-?[0-9]+(\.[0-9]+)?$' then v::numeric<wanted::numeric else false end
   when 'before' then v is not null and left(v,10)<wanted when 'after' then v is not null and left(v,10)>wanted else false end;
  if mode='any' and ok then return true;end if;
  if mode<>'any' and not ok then return false;end if;
 end loop;return mode<>'any';
end $$;
create function relay_private.workflow_validate_conditions(conditions jsonb) returns void language plpgsql immutable set search_path='' as $$
declare c jsonb;
begin
 if conditions is null or jsonb_typeof(conditions)<>'array' or jsonb_array_length(conditions)>20 then raise exception 'Invalid conditions' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(conditions) loop
  if jsonb_typeof(c)<>'object' or coalesce(c->>'field','')!~'^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50})$'
  or coalesce(c->>'operator','') not in ('equals','not_equals','contains','gt','lt','exists','not_exists','before','after')
  or exists(select 1 from jsonb_object_keys(c) k where k not in ('field','operator','value')) then raise exception 'Invalid condition' using errcode='22023';end if;
  if c->>'operator' not in ('exists','not_exists') and coalesce(c->>'value','')='' then raise exception 'Missing comparison value' using errcode='22023';end if;
  if c->>'operator' in ('gt','lt') and (c->>'value')!~'^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Invalid numeric comparison' using errcode='22023';end if;
  if c->>'operator' in ('before','after') then perform (c->>'value')::date;end if;
 end loop;
end $$;
create function relay_private.workflow_validate(d jsonb,w uuid,depth integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;field text;v text;n integer;
begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>65536 or coalesce(jsonb_typeof(d->'actions'),'')<>'array' or jsonb_array_length(d->'actions') not between 1 and 20
 or not exists(select 1 from public.objects where workspace_id=w and id=(d->>'object_id')::uuid)
 or coalesce(d->>'condition_mode','all') not in ('all','any') or coalesce(d->>'reenrollment','once') not in ('once','on_change')
 or coalesce(d->'trigger'->>'type','manual') not in ('manual','record_created','record_updated','stage_changed')
 then raise exception 'Invalid workflow' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in ('object_id','conditions','actions','trigger','condition_mode','reenrollment')) then raise exception 'Unknown workflow option' using errcode='22023';end if;
 perform relay_private.workflow_validate_conditions(d->'conditions');
 field:=d->'trigger'->>'field';
 if field is not null and field!~'^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50})$' then raise exception 'Invalid trigger field' using errcode='22023';end if;
 select count(*)+coalesce(sum(case when value->>'type'='branch' then jsonb_array_length(value->'then')+jsonb_array_length(value->'otherwise') else 0 end),0) into n from jsonb_array_elements(d->'actions');
 if n>40 then raise exception 'Workflow block limit' using errcode='22023';end if;
 for a in select value from jsonb_array_elements(d->'actions') loop
  if jsonb_typeof(a)<>'object' or coalesce(a->>'type','') not in ('task','set_field','email','note','commitment','add_to_list','delay','branch') then raise exception 'Invalid action' using errcode='22023';end if;
  if a->>'type'='branch' then
   if depth>0 or coalesce(jsonb_array_length(a->'conditions'),0)=0 or coalesce(jsonb_typeof(a->'then'),'')<>'array' or coalesce(jsonb_typeof(a->'otherwise'),'')<>'array' or jsonb_array_length(a->'then')>10 or jsonb_array_length(a->'otherwise')>10 or coalesce(a->>'condition_mode','all') not in ('all','any') then raise exception 'Invalid branch' using errcode='22023';end if;
   perform relay_private.workflow_validate_conditions(a->'conditions');
   if jsonb_array_length(a->'then')>0 then perform relay_private.workflow_validate(jsonb_build_object('object_id',d->'object_id','conditions','[]'::jsonb,'actions',a->'then'),w,1);end if;
   if jsonb_array_length(a->'otherwise')>0 then perform relay_private.workflow_validate(jsonb_build_object('object_id',d->'object_id','conditions','[]'::jsonb,'actions',a->'otherwise'),w,1);end if;
  else
   if a->>'type' in ('task','commitment','note') and coalesce(length(trim(a->>'title')),0) not between 1 and 300 then raise exception 'Action title required' using errcode='22023';end if;
   if coalesce(a->>'days','1')!~'^[0-9]+$' or coalesce((a->>'days')::integer,1) not between 0 and 365 then raise exception 'Invalid due date' using errcode='22023';end if;
   if a->>'type'='delay' and (coalesce(a->>'minutes','')!~'^[0-9]+$' or (a->>'minutes')::integer not between 1 and 43200) then raise exception 'Invalid delay' using errcode='22023';end if;
   if a->>'type'='note' and coalesce(length(trim(a->>'body')),0) not between 1 and 10000 then raise exception 'Note content required' using errcode='22023';end if;
   if a->>'owner' is not null and a->>'owner' not in ('record','runner','selected') then raise exception 'Invalid owner policy' using errcode='22023';end if;
   if a->>'owner'='selected' and not exists(select 1 from public.memberships where workspace_id=w and user_id=(a->>'owner_id')::uuid and role in ('owner','admin','member')) then raise exception 'Invalid owner' using errcode='22023';end if;
   if a->>'type'='add_to_list' and not exists(select 1 from public.lists where workspace_id=w and id=(a->>'list_id')::uuid and object_id=(d->>'object_id')::uuid) then raise exception 'Invalid list' using errcode='22023';end if;
   if a->>'type'='set_field' then
    field:=a->>'field';v:=a->>'value';
    if field is null or field not in ('stage','owner_id','close_date','probability') or v is null then raise exception 'Forbidden field' using errcode='22023';end if;
    if field='stage' and length(trim(v)) not between 1 and 80 then raise exception 'Invalid stage' using errcode='22023';end if;
    if field='stage' and v='Perdu' and coalesce(length(trim(a->>'lost_reason')),0)=0 then raise exception 'Lost reason required' using errcode='22023';end if;
    if field='owner_id' and v<>'' and not exists(select 1 from public.memberships where workspace_id=w and user_id=v::uuid and role in ('owner','admin','member')) then raise exception 'Invalid owner' using errcode='22023';end if;
    if field='close_date' and v<>'' then perform v::date;end if;
    if field='probability' and (v!~'^[0-9]+(\.[0-9]+)?$' or v::numeric not between 0 and 100) then raise exception 'Invalid probability' using errcode='22023';end if;
   end if;
  end if;
 end loop;
end $$;
-- Pausing never makes an unchanged draft look unpublished.
create function relay_private.workflow_draft_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  perform relay_private.workflow_validate(new.definition,new.workspace_id);new.created_by:=auth.uid();
 else
  if new.definition is distinct from old.definition then perform relay_private.workflow_validate(new.definition,new.workspace_id);end if;
  if new.workspace_id<>old.workspace_id or new.created_by is distinct from old.created_by then raise exception 'Immutable workflow identity' using errcode='42501';end if;
  new.version:=old.version+case when new.definition is distinct from old.definition or new.name is distinct from old.name or new.description is distinct from old.description then 1 else 0 end;
 end if;
 new.updated_at:=now();return new;
end $$;
drop trigger touch_version on public.workflows;
create trigger workflow_draft_version before insert or update on public.workflows for each row execute function relay_private.workflow_draft_version();
create function relay_private.workflow_start(w uuid,wf uuid,v integer,rec uuid,runner uuid,source text,key text,strict_initial boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.records;definition jsonb;x uuid;capacity boolean;
begin
 select * into r from public.records where workspace_id=w and id=rec;
 select d.definition into definition from relay_private.workflow_releases d where workspace_id=w and workflow_id=wf and version=v;
 if r.id is null or r.archived or definition is null or not exists(select 1 from public.memberships where workspace_id=w and user_id=runner and role in ('owner','admin','member')) then return null;end if;
 if not relay_private.workflow_matches(to_jsonb(r),definition->'conditions',coalesce(definition->>'condition_mode','all')) then return null;end if;
 if key like 'once:%' and exists(select 1 from relay_private.workflow_once_enrollments where workspace_id=w and workflow_id=wf and record_id=rec) then return null;end if;
 capacity:=pg_try_advisory_xact_lock(hashtextextended('workflow-admission:'||w::text,0));
 capacity:=capacity and (select count(*) from public.workflow_executions where workspace_id=w and status in ('queued','running','waiting','paused'))<200;
 insert into public.workflow_executions(workspace_id,workflow_id,workflow_version,record_id,record_name,record_version,created_by,source,dedupe_key,status,error_code,completed_at)
 values(w,wf,v,r.id,r.display_name,r.version,runner,source,key,case when capacity then 'queued' else 'failed' end,case when not capacity then 'capacity' end,case when not capacity then now() end)
 on conflict(workspace_id,workflow_id,dedupe_key) do nothing returning id into x;
 if x is null then select id into x from public.workflow_executions where workspace_id=w and workflow_id=wf and dedupe_key=key;return x;end if;
 if capacity then
  if key like 'once:%' then insert into relay_private.workflow_once_enrollments(workspace_id,workflow_id,record_id) values(w,wf,rec) on conflict do nothing; end if;
  insert into relay_private.workflow_state(execution_id,steps,strict_version) values(x,definition->'actions',strict_initial);
 end if;
 return x;
end $$;
create function relay_private.workflow_record_event() returns trigger language plpgsql security definer set search_path='' as $$
declare wf public.workflows;d jsonb;event text;field text;key text;
begin
 if current_setting('relay.workflow_effect',true)='on' or new.archived then return new;end if;
 for wf in select * from public.workflows where workspace_id=new.workspace_id and enabled and published_version is not null loop
  select definition into d from relay_private.workflow_releases where workspace_id=wf.workspace_id and workflow_id=wf.id and version=wf.published_version;
  if d->>'object_id'<>new.object_id::text then continue;end if;
  event:=d->'trigger'->>'type';field:=d->'trigger'->>'field';
  if event='record_created' and tg_op<>'INSERT' or event in ('record_updated','stage_changed') and tg_op<>'UPDATE' or event='manual' or event is null then continue;end if;
  if tg_op='UPDATE' then
   if (to_jsonb(new)-array['version','updated_at','search','search_index'])=(to_jsonb(old)-array['version','updated_at','search','search_index']) then continue;end if;
   if event='stage_changed' and new.stage is not distinct from old.stage then continue;end if;
   if event='record_updated' and field is not null and relay_private.workflow_value(to_jsonb(new),field) is not distinct from relay_private.workflow_value(to_jsonb(old),field) then continue;end if;
  end if;
  key:=case when coalesce(d->>'reenrollment','once')='once' then 'once:'||new.id::text else 'event:'||new.id::text||':'||new.version end;
  perform relay_private.workflow_start(new.workspace_id,wf.id,wf.published_version,new.id,wf.runner_id,event,key);
 end loop;return new;
end $$;
create trigger workflow_record_event after insert or update on public.records for each row execute function relay_private.workflow_record_event();
create function relay_private.workflow_control(w uuid,wf uuid,operation text,expected_version integer,execution uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare flow public.workflows;x public.workflow_executions;result jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into flow from public.workflows where workspace_id=w and id=wf for update;
 if flow.id is null or (flow.created_by is not null and flow.created_by<>auth.uid() and not relay_private.has_role(w,array['owner','admin'])) then raise exception 'Forbidden' using errcode='42501';end if;
 if expected_version is null or flow.version<>expected_version then raise exception 'Workflow changed' using errcode='40001';end if;
 if operation='publish' then
  perform relay_private.workflow_validate(flow.definition,w);
  if exists(select 1 from jsonb_path_query(flow.definition,'$.**.type') t where t='"email"'::jsonb) then raise exception 'Replace legacy email actions' using errcode='22023';end if;
  if (select count(*) from public.workflows where workspace_id=w and enabled and id<>wf)>=30 then raise exception '30 active workflows maximum' using errcode='53300';end if;
  insert into relay_private.workflow_releases(workspace_id,workflow_id,version,definition) values(w,wf,flow.version,flow.definition) on conflict do nothing;
  update public.workflows set published_version=flow.version,enabled=true,runner_id=auth.uid() where id=wf;
 elsif operation='pause' then
  update public.workflows set enabled=false where id=wf;
  update public.workflow_executions set status='paused',updated_at=now() where workspace_id=w and workflow_id=wf and status in ('queued','waiting');
  update relay_private.jobs j set status='paused' from public.workflow_executions e where e.workspace_id=w and e.workflow_id=wf and e.job_id=j.id and e.status='paused' and j.status='queued';
 elsif operation='resume' then
  if flow.published_version is null or not exists(select 1 from public.memberships where workspace_id=w and user_id=flow.runner_id and role in ('owner','admin','member')) then raise exception 'Republish workflow' using errcode='22023';end if;
  update public.workflows set enabled=true where id=wf;
  update relay_private.jobs j set status='queued',run_at=greatest(now(),j.run_at) from public.workflow_executions e where e.workspace_id=w and e.workflow_id=wf and e.job_id=j.id and e.status='paused' and j.status='paused';
  update public.workflow_executions set status=case when next_at>now() then 'waiting' else 'queued' end,updated_at=now() where workspace_id=w and workflow_id=wf and status='paused';
 elsif operation in ('cancel','retry') then
  select * into x from public.workflow_executions where workspace_id=w and workflow_id=wf and id=execution for update;
  if x.id is null then raise exception 'Execution missing' using errcode='22023';end if;
  if operation='cancel' then
   if x.status not in ('queued','waiting','paused','failed') then raise exception 'Execution already finished' using errcode='22023';end if;
   update public.workflow_executions set status='cancelled',completed_at=now(),updated_at=now() where id=x.id;
   delete from relay_private.workflow_state where execution_id=x.id;
   update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now(),payload='{}',last_error='cancelled' where id=x.job_id and status<>'completed';
  else
   if x.status<>'failed' or not exists(select 1 from relay_private.workflow_state where execution_id=x.id) or not flow.enabled or not exists(select 1 from public.memberships where workspace_id=w and user_id=x.created_by and role in ('owner','admin','member')) then raise exception 'Execution cannot retry; simulate again' using errcode='22023';end if;
   update public.workflow_executions set status='queued',error_code=null,completed_at=null,updated_at=now() where id=x.id;
   update relay_private.jobs set status='queued',attempts=0,run_at=now(),lease=null,leased_until=null,completed_at=null,last_error=null where id=x.job_id and status='dead';
  end if;
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'workflows',wf,operation,jsonb_build_object('version',flow.version,'execution_id',execution));
 select to_jsonb(f) into result from public.workflows f where id=wf;return result;
end $$;
create function public.workflow_control(w uuid,wf uuid,operation text,expected_version integer,execution uuid default null) returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_control(w,wf,operation,expected_version,execution)$$;
create function relay_private.workflow_launch(w uuid,preview uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare p public.workflow_runs;flow public.workflows;item jsonb;r public.records;ids uuid[]:='{}';x uuid;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into p from public.workflow_runs where workspace_id=w and id=preview for update;
 if p.id is null or p.created_by<>auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 if p.executed_at is not null then return jsonb_build_object('already_executed',true);end if;
 if p.created_at<now()-interval '15 minutes' or p.mode<>'simulation' or jsonb_array_length(p.snapshot->'records')>100 then raise exception 'Preview expired' using errcode='40001';end if;
 select * into flow from public.workflows where workspace_id=w and id=p.workflow_id for update;
 if flow.version<>p.workflow_version then raise exception 'Workflow changed' using errcode='40001';end if;
 perform relay_private.workflow_validate(flow.definition,w);
 if exists(select 1 from jsonb_path_query(flow.definition,'$.**.type') t where t='"email"'::jsonb) then raise exception 'Replace legacy email actions' using errcode='22023';end if;
 insert into relay_private.workflow_releases(workspace_id,workflow_id,version,definition) values(w,flow.id,flow.version,flow.definition) on conflict do nothing;
 for item in select value from jsonb_array_elements(p.snapshot->'records') order by value->>'id' loop
  select * into r from public.records where workspace_id=w and id=(item->>'id')::uuid for update;
  if r.id is null or r.archived or r.version<>(item->>'version')::integer then raise exception 'Record changed' using errcode='40001';end if;
  if not relay_private.workflow_matches(to_jsonb(r),flow.definition->'conditions',coalesce(flow.definition->>'condition_mode','all')) then raise exception 'Record changed' using errcode='40001';end if;
 end loop;
 for item in select value from jsonb_array_elements(p.snapshot->'records') loop
  x:=relay_private.workflow_start(w,flow.id,flow.version,(item->>'id')::uuid,auth.uid(),'manual','preview:'||p.id||':'||(item->>'id'),true);ids:=array_append(ids,x);
 end loop;
 update public.workflow_runs set executed_at=now(),status='queued' where id=p.id;
 return jsonb_build_object('executions',ids,'count',cardinality(ids));
end $$;
create function public.workflow_launch(w uuid,preview uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_launch(w,preview)$$;
-- One existing workflow_run job per execution, rescheduled for delays.
create function relay_private.workflow_schedule() returns void language plpgsql security definer set search_path='' as $$
declare e public.workflow_executions;j uuid;
begin
 for e in select x.* from public.workflow_executions x join (select id,row_number() over(partition by workspace_id order by created_at,id) n from public.workflow_executions where status='queued' and job_id is null) ranked on ranked.id=x.id where ranked.n<=3 order by x.created_at,x.id for update of x skip locked limit 30 loop
  if not exists(select 1 from public.memberships m join public.workflows f on f.workspace_id=m.workspace_id where m.workspace_id=e.workspace_id and m.user_id=e.created_by and m.role in ('owner','admin','member') and f.id=e.workflow_id and f.enabled and exists(select 1 from public.memberships runner where runner.workspace_id=f.workspace_id and runner.user_id=f.runner_id and runner.role in ('owner','admin','member'))) then
   update public.workflow_executions set status='failed',error_code='access_revoked',completed_at=now(),updated_at=now() where id=e.id;
   update relay_private.jobs set status='dead',payload='{}',lease=null,leased_until=null,completed_at=now(),last_error='workflow_access_revoked' where id=e.job_id and status not in ('completed','dead');
   continue;
  end if;
  j:=relay_private.put_job(e.workspace_id,e.created_by,'workflow_run','execution:'||e.id,jsonb_build_object('execution_id',e.id));
  if j is not null then update public.workflow_executions set job_id=j where id=e.id;end if;
 end loop;
 if pg_try_advisory_xact_lock(hashtextextended('workflow-retention',0)) and not exists(select 1 from relay_private.scheduler_ticks where key='workflow-retention' and last_at>now()-interval '1 hour') then
  insert into relay_private.scheduler_ticks(key,last_at) values('workflow-retention',now()) on conflict(key) do update set last_at=excluded.last_at;
  delete from public.workflow_executions where id in(select id from public.workflow_executions where completed_at<now()-interval '90 days' order by completed_at limit 500);
  delete from relay_private.workflow_releases d where not exists(select 1 from public.workflow_executions e where e.workspace_id=d.workspace_id and e.workflow_id=d.workflow_id and e.workflow_version=d.version)
   and not exists(select 1 from public.workflows f where f.workspace_id=d.workspace_id and f.id=d.workflow_id and f.published_version=d.version) and d.created_at<now()-interval '90 days';
 end if;
end $$;
create function relay_private.workflow_job_execute(job uuid,token uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare j relay_private.jobs;e public.workflow_executions;f public.workflows;r public.records;d jsonb;steps jsonb;a jsonb;choice jsonb;remaining jsonb;logs jsonb;pos integer;target uuid;effect uuid;strict_initial boolean;code text;yes boolean;prior_sub text;prior_claims text;guard text;due timestamptz;
begin
 select * into j from relay_private.jobs where id=job;
 select * into f from public.workflows where workspace_id=j.workspace_id and id=(select workflow_id from public.workflow_executions where id=(j.payload->>'execution_id')::uuid) for update;
 select * into e from public.workflow_executions where workspace_id=j.workspace_id and id=(j.payload->>'execution_id')::uuid for update;
 select * into j from relay_private.jobs where id=job for update;
 if j.id is null or j.status<>'running' or j.lease is distinct from token or j.leased_until<=now() or e.id is null or e.job_id<>j.id then raise exception 'Invalid workflow lease' using errcode='40001';end if;
 if e.status in ('completed','cancelled','skipped') then update relay_private.jobs set status='completed',completed_at=now(),payload='{}',lease=null,leased_until=null where id=j.id;return jsonb_build_object('already_executed',true);end if;
 if not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.created_by and role in ('owner','admin','member')) or not exists(select 1 from public.memberships where workspace_id=f.workspace_id and user_id=f.runner_id and role in ('owner','admin','member')) then
  update public.workflow_executions set status='failed',error_code='access_revoked',completed_at=now(),updated_at=now() where id=e.id;
  update relay_private.jobs set status='dead',payload='{}',completed_at=now(),lease=null,leased_until=null,last_error='workflow_access_revoked' where id=j.id;
  return jsonb_build_object('status','failed','error_code','access_revoked');
 end if;
 if e.status='paused' or (f.published_version is not null and not f.enabled) then
  update public.workflow_executions set status='paused',updated_at=now() where id=e.id;
  update relay_private.jobs set status='paused',lease=null,leased_until=null,attempts=greatest(attempts-1,0) where id=j.id;
  return jsonb_build_object('status','paused');
 end if;
 prior_sub:=current_setting('request.jwt.claim.sub',true);prior_claims:=current_setting('request.jwt.claims',true);guard:=current_setting('relay.workflow_effect',true);
 perform set_config('request.jwt.claim.sub',e.created_by::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',e.created_by,'role','authenticated')::text,true);perform set_config('relay.workflow_effect','on',true);
 begin
  if not relay_private.has_role(e.workspace_id,array['owner','admin','member']) then raise exception 'Access revoked' using errcode='42501';end if;
  select definition into d from relay_private.workflow_releases where workspace_id=e.workspace_id and workflow_id=e.workflow_id and version=e.workflow_version;
  select s.steps,s.strict_version into steps,strict_initial from relay_private.workflow_state s where execution_id=e.id for update;
  if steps is null or d is null then raise exception 'Missing workflow state' using errcode='22023';end if;
  select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id for update;
  if r.id is null or r.archived or not relay_private.workflow_matches(to_jsonb(r),d->'conditions',coalesce(d->>'condition_mode','all')) then
   update public.workflow_executions set status='skipped',error_code='criteria_changed',completed_at=now(),updated_at=now() where id=e.id;
   update relay_private.jobs set status='completed',completed_at=now(),payload='{}',lease=null,leased_until=null,result='{"status":"skipped"}' where id=j.id;
   delete from relay_private.workflow_state where execution_id=e.id;
  else
   if strict_initial and e.cursor=0 and r.version<>e.record_version then raise exception 'Record changed' using errcode='22023';end if;
   pos:=e.cursor;logs:=e.trace;
   while pos<jsonb_array_length(steps) loop
    if jsonb_array_length(logs)>=78 then raise exception 'Execution block limit' using errcode='22023';end if;
    a:=steps->pos;effect:=null;
    if a->>'type'='branch' then
     yes:=relay_private.workflow_matches(to_jsonb(r),a->'conditions',coalesce(a->>'condition_mode','all'));
     choice:=case when yes then a->'then' else a->'otherwise' end;
     logs:=logs||jsonb_build_array(jsonb_build_object('type','branch','title','Vérifier les conditions','status','completed','result',case when yes then 'yes' else 'no' end,'at',now()));
     select coalesce(jsonb_agg(value order by ord),'[]') into remaining from jsonb_array_elements(steps) with ordinality t(value,ord) where ord>pos+1;
     steps:=choice||remaining;pos:=0;continue;
    elsif a->>'type'='delay' then
     due:=now()+make_interval(mins=>(a->>'minutes')::integer);
     logs:=logs||jsonb_build_array(jsonb_build_object('type','delay','title','Attendre','status','completed','minutes',a->'minutes','resume_at',due,'at',now()));pos:=pos+1;
     update relay_private.workflow_state set steps=steps,strict_version=false where execution_id=e.id;
     update public.workflow_executions set cursor=pos,trace=logs,status='waiting',next_at=due,updated_at=now() where id=e.id;
     update relay_private.jobs set status='queued',run_at=due,attempts=greatest(attempts-1,0),lease=null,leased_until=null where id=j.id;
     exit;
    end if;
    target:=case coalesce(a->>'owner','record') when 'runner' then e.created_by when 'selected' then (a->>'owner_id')::uuid else coalesce(r.owner_id,e.created_by) end;
    if a->>'type' in ('task','commitment') and not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=target and role in ('owner','admin','member')) then raise exception 'Owner access revoked' using errcode='42501';end if;
    if a->>'type'='task' then
     insert into public.tasks(workspace_id,record_id,title,owner_id,due_date) values(e.workspace_id,r.id,a->>'title',target,now()+make_interval(days=>coalesce((a->>'days')::integer,1))) returning id into effect;
    elsif a->>'type'='commitment' then
     insert into public.commitments(workspace_id,record_id,title,owner_id,due_date,source_type,source_id,source_quote) values(e.workspace_id,r.id,a->>'title',target,now()+make_interval(days=>coalesce((a->>'days')::integer,1)),'workflow',e.id,'Proposé par une automatisation ; à confirmer par un membre.') returning id into effect;
    elsif a->>'type'='note' then
     insert into public.notes(workspace_id,record_id,title,content,author_id,private) values(e.workspace_id,r.id,a->>'title',a->>'body',e.created_by,false) returning id into effect;
    elsif a->>'type'='add_to_list' then
     if not exists(select 1 from public.lists where workspace_id=e.workspace_id and id=(a->>'list_id')::uuid and object_id=r.object_id) then raise exception 'List changed' using errcode='22023';end if;
     insert into public.list_entries(workspace_id,list_id,record_id) values(e.workspace_id,(a->>'list_id')::uuid,r.id) on conflict do nothing;
    elsif a->>'type'='set_field' then
     if a->>'field'='owner_id' then
      if coalesce(a->>'value','')<>'' and not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=(a->>'value')::uuid and role in ('owner','admin','member')) then raise exception 'Owner access revoked' using errcode='42501';end if;
      update public.records set owner_id=nullif(a->>'value','')::uuid where workspace_id=e.workspace_id and id=r.id;
     elsif a->>'field'='stage' then update public.records set stage=a->>'value',lost_reason=case when a->>'value'='Perdu' then a->>'lost_reason' else lost_reason end where workspace_id=e.workspace_id and id=r.id;
     elsif a->>'field'='close_date' then update public.records set close_date=nullif(a->>'value','')::date where workspace_id=e.workspace_id and id=r.id;
     elsif a->>'field'='probability' then update public.records set probability=(a->>'value')::numeric where workspace_id=e.workspace_id and id=r.id;
     else raise exception 'Forbidden field' using errcode='22023';end if;
     select * into r from public.records where workspace_id=e.workspace_id and id=r.id;
    else raise exception 'Unsupported action' using errcode='22023';end if;
    logs:=logs||jsonb_build_array(jsonb_build_object('type',a->>'type','title',coalesce(a->>'title','Modifier une information'),'status','completed','entity_id',effect,'at',now()));pos:=pos+1;
   end loop;
   if pos>=jsonb_array_length(steps) then
    update public.workflow_executions set cursor=pos,trace=logs,status='completed',next_at=null,completed_at=now(),updated_at=now() where id=e.id;
    update relay_private.jobs set status='completed',completed_at=now(),payload='{}',lease=null,leased_until=null,result=jsonb_build_object('execution_id',e.id,'status','completed') where id=j.id;
    delete from relay_private.workflow_state where execution_id=e.id;
   end if;
  end if;
 exception when sqlstate '42501' or sqlstate '22023' or check_violation or foreign_key_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  get stacked diagnostics code=returned_sqlstate;
  update public.workflow_executions set status='failed',error_code=case when code='42501' then 'access_revoked' else 'invalid_action' end,updated_at=now(),completed_at=now() where id=e.id;
  update relay_private.jobs set status='dead',completed_at=now(),lease=null,leased_until=null,last_error='workflow_'||code where id=j.id;
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);perform set_config('request.jwt.claims',coalesce(prior_claims,'{}'),true);perform set_config('relay.workflow_effect',coalesce(guard,''),true);
 insert into relay_private.job_events(job_id,event,attempt,worker_id) select j.id,done.status,j.attempts,j.worker_id from public.workflow_executions done where done.id=(j.payload->>'execution_id')::uuid;
 return (select jsonb_build_object('execution_id',id,'status',status,'cursor',cursor) from public.workflow_executions where id=e.id);
end $$;
alter function public.relay_job_worker(text,jsonb) set schema relay_private;
alter function relay_private.relay_job_worker(text,jsonb) rename to job_worker_without_workflows;
revoke all on function relay_private.job_worker_without_workflows(text,jsonb) from public,anon,authenticated,service_role;
create function relay_private.workflow_job_dispatch(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare result jsonb;j relay_private.jobs;
begin
 if operation='schedule' and payload->'types' ? 'workflow_run' then perform relay_private.workflow_schedule();end if;
 if operation='execute' then
  select * into j from relay_private.jobs where id=(payload->>'id')::uuid;
  if j.type='workflow_run' and j.payload ? 'execution_id' then return relay_private.workflow_job_execute(j.id,(payload->>'lease')::uuid);end if;
 end if;
 result:=relay_private.job_worker_without_workflows(operation,payload);
 if operation='fail' then
  select * into j from relay_private.jobs where id=(payload->>'id')::uuid;
  if j.type='workflow_run' and j.payload ? 'execution_id' and j.status='dead' then update public.workflow_executions set status='failed',error_code='worker_failed',updated_at=now(),completed_at=now() where id=(j.payload->>'execution_id')::uuid and workspace_id=j.workspace_id and status not in ('cancelled','completed');end if;
 end if;return result;
end $$;
create function public.relay_job_worker(operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_job_dispatch(operation,payload)$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='relay_private' and p.proname like 'workflow_%' loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on function public.workflow_control(uuid,uuid,text,integer,uuid),public.workflow_launch(uuid,uuid),public.relay_job_worker(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function relay_private.workflow_control(uuid,uuid,text,integer,uuid),relay_private.workflow_launch(uuid,uuid),public.workflow_control(uuid,uuid,text,integer,uuid),public.workflow_launch(uuid,uuid) to authenticated;
grant execute on function relay_private.workflow_job_dispatch(text,jsonb),public.relay_job_worker(text,jsonb) to service_role;
