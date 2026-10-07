-- Real block progress, durable external outbox and scoped event sources.
-- Existing published definitions and queued jobs keep their release snapshots.
alter table public.workflow_executions drop constraint workflow_executions_source_check,
 drop constraint workflow_executions_status_check,
 add constraint workflow_executions_source_check check(source in ('manual','record_created','record_updated','stage_changed','email_received','email_replied','task_completed','commitment_overdue','date_reached','meeting_completed','form_received','webhook','schedule')),
 add constraint workflow_executions_status_check check(status in ('queued','running','waiting','paused','completed','failed','cancelled','skipped','unknown')),
 add column context_user_id uuid references auth.users(id);
create index workflow_execution_context_user_idx on public.workflow_executions(context_user_id) where context_user_id is not null;
create policy workflow_private_source on public.workflow_executions as restrictive for select to authenticated using(context_user_id is null or context_user_id=(select auth.uid()));
alter table relay_private.workflow_state add column variables jsonb not null default '{"event":{},"steps":{}}';
create table public.workflow_step_runs(
 execution_id uuid not null references public.workflow_executions(id) on delete cascade,
 step_key text not null,action_id text,position integer not null,type text not null,title text not null,
 status text not null check(status in ('queued','running','waiting','completed','failed','skipped','unknown')),
 started_at timestamptz,completed_at timestamptz,next_at timestamptz,error_code text,output jsonb not null default '{}',
 primary key(execution_id,step_key),check(octet_length(output::text)<=10000)
);
alter table public.workflow_step_runs enable row level security;
revoke all on public.workflow_step_runs from public,anon,authenticated;
grant select on public.workflow_step_runs to authenticated;
create policy workflow_steps_read on public.workflow_step_runs for select to authenticated using(exists(select 1 from public.workflow_executions e where e.id=execution_id));
create table relay_private.workflow_destinations(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(name) between 1 and 100),kind text not null check(kind in ('slack','webhook')),
 encrypted text not null check(length(encrypted) between 1 and 12000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),enabled boolean not null default true,
 unique(workspace_id,id)
);
create index workflow_destination_workspace_idx on relay_private.workflow_destinations(workspace_id,enabled);
create index workflow_destination_creator_idx on relay_private.workflow_destinations(created_by);
create table relay_private.workflow_outbox(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 execution_id uuid not null references public.workflow_executions(id) on delete cascade,step_key text not null,
 status text not null default 'pending' check(status in ('pending','sending','completed','failed','unknown')),
 action jsonb not null,variables jsonb not null,created_at timestamptz not null default now(),attempted_at timestamptz,completed_at timestamptz,result jsonb,error_code text,
 unique(execution_id,step_key),foreign key(execution_id,step_key) references public.workflow_step_runs(execution_id,step_key) on delete cascade
);
create index workflow_outbox_quota_idx on relay_private.workflow_outbox(workspace_id,attempted_at) where attempted_at is not null;
create table relay_private.workflow_hooks(
 workflow_id uuid primary key references public.workflows(id) on delete cascade,encrypted_secret text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index workflow_hook_creator_idx on relay_private.workflow_hooks(created_by);
create table relay_private.workflow_schedule_cursors(
 workflow_id uuid primary key references public.workflows(id) on delete cascade,period text not null,last_id uuid,next_at timestamptz not null default now()
);
alter table relay_private.workflow_destinations enable row level security;
alter table relay_private.workflow_outbox enable row level security;
alter table relay_private.workflow_hooks enable row level security;
alter table relay_private.workflow_schedule_cursors enable row level security;
revoke all on relay_private.workflow_destinations,relay_private.workflow_outbox,relay_private.workflow_hooks,relay_private.workflow_schedule_cursors from public,anon,authenticated;

create table relay_private.workflow_io_usage(workspace_id uuid references public.workspaces(id) on delete cascade,day date,kind text,attempts integer not null,primary key(workspace_id,day,kind));
create table relay_private.workflow_hook_receipts(workflow_id uuid references public.workflows(id) on delete cascade,event_id uuid,created_at timestamptz not null default now(),primary key(workflow_id,event_id));
create index workflow_hook_receipt_time on relay_private.workflow_hook_receipts(workflow_id,created_at);
alter table relay_private.workflow_io_usage enable row level security;
alter table relay_private.workflow_hook_receipts enable row level security;
revoke all on relay_private.workflow_io_usage,relay_private.workflow_hook_receipts from public,anon,authenticated;
create function relay_private.workflow_prepare_steps(actions jsonb,path text default 'root') returns jsonb language plpgsql immutable set search_path='' as $$
declare a jsonb;n integer:=0;result jsonb:='[]';begin
 for a in select value from jsonb_array_elements(actions) loop
  a:=a||jsonb_build_object('_key',coalesce(a->>'_key',path||'.'||n));
  if a->>'type'='branch' then a:=a||jsonb_build_object('then',relay_private.workflow_prepare_steps(a->'then',a->>'_key'||'.yes'),'otherwise',relay_private.workflow_prepare_steps(a->'otherwise',a->>'_key'||'.no'));end if;
  result:=result||jsonb_build_array(a);n:=n+1;
 end loop;return result;
end $$;
create function relay_private.workflow_state_seed() returns trigger language plpgsql set search_path='' as $$begin new.steps:=relay_private.workflow_prepare_steps(new.steps);return new;end $$;
create trigger workflow_state_seed before insert on relay_private.workflow_state for each row execute function relay_private.workflow_state_seed();
update relay_private.workflow_state set steps=relay_private.workflow_prepare_steps(steps);

create function relay_private.workflow_values(rec jsonb,variables jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('record',rec||jsonb_build_object('name',rec->>'display_name','first_name',coalesce(rec->'attributes'->>'first_name',split_part(rec->>'display_name',' ',1))),
 'company',rec||jsonb_build_object('name',rec->>'display_name'),'contact',rec||jsonb_build_object('name',rec->>'display_name','first_name',coalesce(rec->'attributes'->>'first_name',split_part(rec->>'display_name',' ',1))),
 'deal',rec||jsonb_build_object('name',rec->>'display_name'))||variables
$$;
create function relay_private.workflow_render(value text,vars jsonb,maximum integer default 10000) returns text language plpgsql immutable set search_path='' as $$
declare m text[];path text;v jsonb;result text:=value;begin
 for m in select regexp_matches(value,'(\{\{\s*([a-zA-Z0-9_.-]{1,160})\s*\}\})','g') loop
  path:=m[2];if path~'(^|\.)(__proto__|prototype|constructor)(\.|$)' then raise exception 'Invalid variable' using errcode='22023';end if;
  v:=vars#>string_to_array(path,'.');if v is null or v='null' or jsonb_typeof(v) in ('object','array') then raise exception 'Missing variable: %',path using errcode='22023';end if;
  result:=replace(result,m[1],v#>>'{}');
 end loop;
 if length(result)>maximum then raise exception 'Rendered value too large' using errcode='22023';end if;return result;
end $$;
create or replace function relay_private.workflow_value(rec jsonb,field text) returns text language sql immutable set search_path='' as $$
 select case when field like 'attributes.%' then rec->'attributes'->>substr(field,12) when field like 'steps.%' or field like 'event.%' then rec#>>string_to_array(field,'.') else rec->>field end
$$;
alter function relay_private.workflow_validate(jsonb,uuid,integer) rename to workflow_validate_v1;
create or replace function relay_private.workflow_validate_conditions(conditions jsonb) returns void language plpgsql immutable set search_path='' as $$
declare c jsonb;begin
 if conditions is null or jsonb_typeof(conditions)<>'array' or jsonb_array_length(conditions)>20 then raise exception 'Invalid conditions' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(conditions) loop
  if jsonb_typeof(c)<>'object' or coalesce(c->>'field','')!~'^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50}|steps\.[a-z][a-z0-9_]{0,39}\.(intent|summary|next_action|confidence|provider_id|status|entity_id)|event\.(subject|body|kind))$' or coalesce(c->>'operator','') not in ('equals','not_equals','contains','gt','lt','exists','not_exists','before','after') then raise exception 'Invalid condition' using errcode='22023';end if;
  if c->>'operator' not in ('exists','not_exists') and coalesce(c->>'value','')='' then raise exception 'Missing value' using errcode='22023';end if;
  if c->>'operator' in ('gt','lt') and (c->>'value')!~'^-?[0-9]+(\.[0-9]+)?$' then raise exception 'Invalid numeric value' using errcode='22023';end if;
  if c->>'operator' in ('before','after') then perform (c->>'value')::date;end if;
 end loop;
end $$;
create function relay_private.workflow_validate(d jsonb,w uuid,depth integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;legacy jsonb;actions jsonb:='[]';t jsonb:=d->'trigger';kind text;aliases text[]:='{}';begin
 if coalesce(t->>'type','manual') not in ('manual','record_created','record_updated','stage_changed','email_received','email_replied','task_completed','commitment_overdue','date_reached','meeting_completed','form_received','webhook','schedule') then raise exception 'Invalid trigger' using errcode='22023';end if;
 if t->>'type'='schedule' and (coalesce(t->>'frequency','') not in ('daily','weekly') or coalesce(t->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or not exists(select 1 from pg_timezone_names where name=t->>'timezone') or (t->>'frequency'='weekly' and (coalesce(jsonb_array_length(t->'weekdays'),0)=0 or exists(select 1 from jsonb_array_elements_text(t->'weekdays') x where x!~'^[0-6]$')))) then raise exception 'Invalid schedule' using errcode='22023';end if;
 if t->>'type'='record_updated' and t?'field' and coalesce(t->>'field','')!~'^(stage|amount|probability|email|domain|display_name|close_date|owner_id|pipeline_id|attributes\.[a-zA-Z0-9_-]{1,50})$' then raise exception 'Invalid watched field' using errcode='22023';end if;
 if t->>'type'='date_reached' and coalesce(t->>'field','')!~'^(close_date|attributes\.[a-zA-Z0-9_-]{1,50})$' then raise exception 'Invalid date field' using errcode='22023';end if;
 perform relay_private.workflow_validate_conditions(d->'conditions');
 if exists(select 1 from jsonb_array_elements(d->'conditions') c where c->>'field' like 'steps.%') then raise exception 'Block outputs unavailable in entry conditions' using errcode='22023';end if;
 for a in select value from jsonb_array_elements(d->'actions') loop
  kind:=a->>'type';
  if exists(select 1 from jsonb_object_keys(a) k where k not in ('id','type','title','field','value','body','days','owner_id','owner','minutes','list_id','conditions','condition_mode','then','otherwise','lost_reason','alias','provider','to','subject','destination_id','starts_at','duration_minutes','instruction','input','wait_mode','until','timeout_minutes','timeout_behavior')) then raise exception 'Unknown action property' using errcode='22023';end if;
  if a ? 'alias' then if a->>'alias'!~'^[a-z][a-z0-9_]{0,39}$' or a->>'alias'=any(aliases) then raise exception 'Invalid output alias' using errcode='22023';end if;aliases:=array_append(aliases,a->>'alias');end if;
  if kind='branch' then
   if depth>0 then raise exception 'Nested branch limit' using errcode='22023';end if;
   if jsonb_array_length(a->'then')>0 then perform relay_private.workflow_validate(jsonb_build_object('object_id',d->'object_id','conditions','[]'::jsonb,'actions',a->'then'),w,1);end if;
   if jsonb_array_length(a->'otherwise')>0 then perform relay_private.workflow_validate(jsonb_build_object('object_id',d->'object_id','conditions','[]'::jsonb,'actions',a->'otherwise'),w,1);end if;
   a:=jsonb_set(jsonb_set(a,'{then}','[]'),'{otherwise}','[]');
  elsif kind in ('email','calendar','slack','webhook','ai','wait_until','notify') then
   if kind='email' and (coalesce(a->>'provider','') not in ('gmail','outlook') or coalesce(length(a->>'to'),0) not between 1 and 300 or coalesce(length(a->>'subject'),0) not between 1 and 300 or coalesce(length(a->>'body'),0) not between 1 and 10000) then raise exception 'Configure email' using errcode='22023';end if;
   if kind='calendar' and (coalesce(a->>'provider','') not in ('google-calendar','outlook-calendar') or coalesce(length(a->>'starts_at'),0)=0 or coalesce(length(a->>'title'),0) not between 1 and 300 or coalesce((a->>'duration_minutes')::integer,30) not between 5 and 1440) then raise exception 'Configure calendar' using errcode='22023';end if;
   if kind in ('slack','webhook') and (not exists(select 1 from relay_private.workflow_destinations dest where workspace_id=w and id=(a->>'destination_id')::uuid and enabled and dest.kind=a->>'type') or coalesce(length(a->>'body'),0) not between 1 and 10000) then raise exception 'Configure destination' using errcode='22023';end if;
   if kind='webhook' and jsonb_typeof((a->>'body')::jsonb)<>'object' then raise exception 'Webhook JSON object required' using errcode='22023';end if;
   if kind='ai' and (coalesce(length(a->>'input'),0) not between 1 and 6000 or coalesce(length(a->>'instruction'),0) not between 1 and 2000 or not a?'alias') then raise exception 'Configure AI' using errcode='22023';end if;
   if kind='wait_until' then
    if coalesce(a->>'wait_mode','') not in ('date','condition','email_reply') or coalesce((a->>'timeout_minutes')::integer,0) not between 1 and 43200 or coalesce(a->>'timeout_behavior','stop') not in ('stop','continue') then raise exception 'Configure wait' using errcode='22023';end if;
    if a->>'wait_mode'='date' then perform (a->>'until')::timestamptz;end if;
    if a->>'wait_mode'='condition' then perform relay_private.workflow_validate_conditions(a->'conditions');if jsonb_array_length(a->'conditions')=0 then raise exception 'Wait condition required' using errcode='22023';end if;end if;
   end if;
   if kind='notify' and coalesce(length(a->>'title'),0) not between 1 and 300 then raise exception 'Notification title required' using errcode='22023';end if;
   a:=jsonb_build_object('type','note','title','Validated external or utility action','body','Validated');
  elsif kind='set_field' and a->>'value' like '%{{%' then
   a:=jsonb_set(a,'{value}',to_jsonb(case a->>'field' when 'probability' then '50' when 'close_date' then '' when 'owner_id' then '' else 'Qualification' end));
  end if;
  actions:=actions||jsonb_build_array(a);
 end loop;
 legacy:=jsonb_set(d,'{actions}',actions);legacy:=jsonb_set(legacy,'{trigger}','{"type":"manual"}');
 perform relay_private.workflow_validate_v1(legacy,w,depth);
 if octet_length(d::text)>65536 or (select coalesce(sum(1+case when node->>'type'='branch' then jsonb_array_length(node->'then')+jsonb_array_length(node->'otherwise') else 0 end),0) from jsonb_array_elements(d->'actions') node)>40 then raise exception 'Workflow size exceeded' using errcode='22023';end if;
end $$;

create or replace function relay_private.workflow_start(w uuid,wf uuid,v integer,rec uuid,runner uuid,source text,key text,strict_initial boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.records;definition jsonb;x uuid;capacity boolean;vars jsonb:=coalesce(nullif(current_setting('relay.workflow_event_ctx',true),''),'{}')::jsonb;
begin
 select * into r from public.records where workspace_id=w and id=rec;
 select d.definition into definition from relay_private.workflow_releases d where workspace_id=w and workflow_id=wf and version=v;
 if r.id is null or r.archived or definition is null or not exists(select 1 from public.memberships where workspace_id=w and user_id=runner and role in ('owner','admin','member')) then return null;end if;
 if not relay_private.workflow_matches(to_jsonb(r)||vars,definition->'conditions',coalesce(definition->>'condition_mode','all')) then return null;end if;
 if key like 'once:%' and exists(select 1 from relay_private.workflow_once_enrollments where workspace_id=w and workflow_id=wf and record_id=rec) then return null;end if;
 capacity:=pg_try_advisory_xact_lock(hashtextextended('workflow-admission:'||w::text,0));
 capacity:=capacity and (select count(*) from public.workflow_executions where workspace_id=w and status in ('queued','running','waiting','paused','unknown'))<200;
 insert into public.workflow_executions(workspace_id,workflow_id,workflow_version,record_id,record_name,record_version,created_by,source,dedupe_key,status,error_code,completed_at,context_user_id)
 values(w,wf,v,r.id,r.display_name,r.version,runner,source,key,case when capacity then 'queued' else 'failed' end,case when not capacity then 'capacity' end,case when not capacity then now() end,nullif(vars->>'private_user','')::uuid)
 on conflict(workspace_id,workflow_id,dedupe_key) do nothing returning id into x;
 if x is null then select id into x from public.workflow_executions where workspace_id=w and workflow_id=wf and dedupe_key=key;return x;end if;
 if capacity then
  if key like 'once:%' then insert into relay_private.workflow_once_enrollments(workspace_id,workflow_id,record_id) values(w,wf,rec) on conflict do nothing; end if;
  insert into relay_private.workflow_state(execution_id,steps,strict_version) values(x,definition->'actions',strict_initial);
  update relay_private.workflow_state set variables=jsonb_build_object('event',coalesce(vars->'event','{}'),'steps','{}'::jsonb) where execution_id=x;
 end if;
 return x;
end $$;
alter table public.communications add column is_reply boolean not null default false,add column thread_id text,add column sender_email text,add column ends_at timestamptz,add column direction text not null default 'inbound' check(direction in ('inbound','outbound'));
create index workflow_reply_idx on public.communications(workspace_id,user_id,sender_email,received_at) where kind='email' and is_reply;
alter table relay_private.workflow_state add column recheck boolean not null default true;
alter table public.notifications drop constraint notifications_entity_check,add constraint notifications_entity_check check(entity in ('tasks','commitments','workflows'));
create function relay_private.workflow_seed_rows(ex uuid,steps jsonb,base integer default 0) returns void language plpgsql security definer set search_path='' as $$
declare a jsonb;n integer:=0;begin
 for a in select value from jsonb_array_elements(steps) loop
  insert into public.workflow_step_runs(execution_id,step_key,action_id,position,type,title,status)
  values(ex,a->>'_key',a->>'id',base+n*100,a->>'type',coalesce(a->>'title',a->>'subject',a->>'type'),'queued') on conflict do nothing;
  if a->>'type'='branch' then
   perform relay_private.workflow_seed_rows(ex,a->'then',base+n*100+1);
   perform relay_private.workflow_seed_rows(ex,a->'otherwise',base+n*100+50);
  end if;n:=n+1;
 end loop;
end $$;
create function relay_private.workflow_steps_seed() returns trigger language plpgsql security definer set search_path='' as $$begin perform relay_private.workflow_seed_rows(new.execution_id,new.steps);return new;end $$;
create trigger workflow_steps_seed after insert on relay_private.workflow_state for each row execute function relay_private.workflow_steps_seed();
do $$declare s record;begin for s in select * from relay_private.workflow_state loop perform relay_private.workflow_seed_rows(s.execution_id,s.steps);end loop;end $$;

create function relay_private.workflow_record_values(w uuid,rec jsonb,vars jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;linked record;begin
 result:=relay_private.workflow_values(rec,vars);
 for linked in select distinct on(o.slug) o.slug,to_jsonb(r)||jsonb_build_object('name',r.display_name,'first_name',coalesce(r.attributes->>'first_name',split_part(r.display_name,' ',1))) value
 from public.record_relations link join public.records r on r.workspace_id=w and r.id=case when link.source_id=(rec->>'id')::uuid then link.target_id else link.source_id end
 join public.objects o on o.workspace_id=w and o.id=r.object_id
 where link.workspace_id=w and ((link.source_id=(rec->>'id')::uuid) or (link.target_id=(rec->>'id')::uuid)) and not r.archived and o.slug in ('companies','people','deals') and o.id<>(rec->>'object_id')::uuid
 order by o.slug,r.id loop
 result:=jsonb_set(result,array[case linked.slug when 'companies' then 'company' when 'people' then 'contact' else 'deal' end],linked.value);
 end loop;return result;
end $$;

create function relay_private.workflow_block_finish(ex uuid,job uuid,a jsonb,output jsonb,next_cursor integer,next_steps jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare e public.workflow_executions;vars jsonb;done boolean;flow public.workflows;begin
 select * into e from public.workflow_executions where id=ex;
 select * into flow from public.workflows where id=e.workflow_id;
 select variables into vars from relay_private.workflow_state where execution_id=ex;
 if a?'alias' then vars:=jsonb_set(vars,array['steps',a->>'alias'],output,true);end if;
 update public.workflow_step_runs set status='completed',completed_at=now(),next_at=null,error_code=null,output=output where execution_id=ex and step_key=a->>'_key';
 done:=next_cursor>=jsonb_array_length(next_steps);
 update public.workflow_executions set cursor=next_cursor,trace=trace||jsonb_build_array(jsonb_build_object('type',a->>'type','title',coalesce(a->>'title',a->>'subject',a->>'type'),'at',now(),'step_key',a->>'_key','result',output->>'branch')),
  status=case when done then 'completed' when flow.published_version is not null and not flow.enabled then 'paused' else 'running' end,
  next_at=null,error_code=null,updated_at=now(),completed_at=case when done then now() end where id=ex;
 if done then
  delete from relay_private.workflow_state where execution_id=ex;
  update relay_private.jobs set status='completed',payload='{}',lease=null,leased_until=null,completed_at=now(),result=jsonb_build_object('execution_id',ex,'status','completed') where id=job;
 else
  update relay_private.workflow_state set steps=next_steps,variables=vars,strict_version=false where execution_id=ex;
  update relay_private.jobs set status=case when flow.published_version is not null and not flow.enabled then 'paused' else 'queued' end,payload=jsonb_build_object('execution_id',ex),attempts=greatest(attempts-1,0),lease=null,leased_until=null,run_at=now(),completed_at=null where id=job;
 end if;
 return jsonb_build_object('execution_id',ex,'status',case when done then 'completed' else 'running' end,'cursor',next_cursor);
end $$;

create function relay_private.workflow_tick(job uuid,token uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare j relay_private.jobs;e public.workflow_executions;f public.workflows;s relay_private.workflow_state;r public.records;d jsonb;a jsonb;vars jsonb;steps jsonb;pos integer;effect uuid;target uuid;outcome jsonb;io relay_private.workflow_outbox;dest text;yes boolean;due timestamptz;started timestamptz;code text;prior_sub text;prior_claims text;guard text;k text;v text;
begin
 select * into j from relay_private.jobs where id=job;
 if not j.payload?'execution_id' then return relay_private.job_worker_without_workflows('execute',jsonb_build_object('id',job,'lease',token));end if;
 select * into f from public.workflows where workspace_id=j.workspace_id and id=(select workflow_id from public.workflow_executions where id=(j.payload->>'execution_id')::uuid) for update;
 select * into e from public.workflow_executions where workspace_id=j.workspace_id and id=(j.payload->>'execution_id')::uuid for update;
 select * into j from relay_private.jobs where id=job for update;
 if j.id is null or j.status<>'running' or j.lease is distinct from token or j.leased_until<=now() or e.id is null or e.job_id<>j.id then raise exception 'Invalid lease' using errcode='40001';end if;
 if e.status in ('completed','cancelled','skipped') then update relay_private.jobs set status='completed',payload='{}',lease=null,leased_until=null,completed_at=now() where id=j.id;return jsonb_build_object('already_executed',true);end if;
 if not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.created_by and role in ('owner','admin','member')) or (f.published_version is not null and not exists(select 1 from public.memberships where workspace_id=f.workspace_id and user_id=f.runner_id and role in ('owner','admin','member'))) then
  update public.workflow_executions set status='failed',error_code='access_revoked',completed_at=now(),updated_at=now() where id=e.id;
  update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now() where id=j.id;return jsonb_build_object('status','failed');
 end if;
 if e.status='unknown' then update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now() where id=j.id;return jsonb_build_object('status','unknown');end if;
 if e.status='paused' or (f.published_version is not null and not f.enabled) then
  update public.workflow_executions set status='paused',updated_at=now() where id=e.id;
  update relay_private.jobs set status='paused',lease=null,leased_until=null,attempts=greatest(attempts-1,0) where id=j.id;return jsonb_build_object('status','paused');
 end if;
 select * into s from relay_private.workflow_state where execution_id=e.id for update;
 select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id for update;
 select definition into d from relay_private.workflow_releases where workspace_id=e.workspace_id and workflow_id=e.workflow_id and version=e.workflow_version;
 pos:=e.cursor;steps:=s.steps;a:=steps->pos;
 if a is null or r.id is null or d is null then raise exception 'Invalid state' using errcode='22023';end if;
 prior_sub:=current_setting('request.jwt.claim.sub',true);prior_claims:=current_setting('request.jwt.claims',true);guard:=current_setting('relay.workflow_effect',true);
 perform set_config('request.jwt.claim.sub',e.created_by::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',e.created_by,'role','authenticated')::text,true);perform set_config('relay.workflow_effect','on',true);
 begin
  vars:=relay_private.workflow_record_values(e.workspace_id,to_jsonb(r),s.variables);
  if s.strict_version and r.version<>e.record_version then raise exception 'Record changed' using errcode='22023';end if;
  if r.archived or (s.recheck and not relay_private.workflow_matches(to_jsonb(r)||s.variables,d->'conditions',coalesce(d->>'condition_mode','all'))) then
   update public.workflow_executions set status='skipped',error_code='criteria_changed',completed_at=now(),updated_at=now() where id=e.id;
   update public.workflow_step_runs set status='skipped',completed_at=now() where execution_id=e.id and status in ('queued','waiting');
   update relay_private.jobs set status='completed',payload='{}',lease=null,leased_until=null,completed_at=now() where id=j.id;
   delete from relay_private.workflow_state where execution_id=e.id;outcome:=jsonb_build_object('status','skipped');
  else
   update relay_private.workflow_state set recheck=false,strict_version=false where execution_id=e.id;
   update public.workflow_step_runs set status='running',started_at=coalesce(started_at,now()),error_code=null where execution_id=e.id and step_key=a->>'_key' returning started_at into started;
   update public.workflow_executions set status='running',updated_at=now() where id=e.id;
   if a->>'type' in ('email','calendar','slack','webhook','ai') then
    insert into relay_private.workflow_outbox(workspace_id,execution_id,step_key,action,variables) values(e.workspace_id,e.id,a->>'_key',a,vars) on conflict do nothing;
    select * into io from relay_private.workflow_outbox where execution_id=e.id and step_key=a->>'_key' for update;
    if io.status='completed' then outcome:=relay_private.workflow_block_finish(e.id,j.id,a,io.result,pos+1,steps);
    else
     if a?'destination_id' then select encrypted into dest from relay_private.workflow_destinations where workspace_id=e.workspace_id and id=(a->>'destination_id')::uuid and enabled;end if;
     outcome:=jsonb_build_object('external',jsonb_build_object('id',io.id,'status',io.status,'action',a-'_key','values',io.variables,'workspace_id',e.workspace_id,'user_id',e.created_by,'encrypted_destination',dest));
    end if;
   elsif a->>'type'='branch' then
    yes:=relay_private.workflow_matches(to_jsonb(r)||s.variables,a->'conditions',coalesce(a->>'condition_mode','all'));
    update public.workflow_step_runs set status='skipped',completed_at=now() where execution_id=e.id and step_key like (a->>'_key'||case when yes then '.no.%' else '.yes.%' end) and status='queued';
    select coalesce(jsonb_agg(value order by ord),'[]') into outcome from jsonb_array_elements(steps) with ordinality t(value,ord) where ord>pos+1;
    steps:=(case when yes then a->'then' else a->'otherwise' end)||outcome;
    outcome:=relay_private.workflow_block_finish(e.id,j.id,a,jsonb_build_object('branch',case when yes then 'yes' else 'no' end),0,steps);
   elsif a->>'type' in ('delay','wait_until') then
    if a->>'type'='delay' then due:=started+make_interval(mins=>(a->>'minutes')::integer);yes:=now()>=due;
    else
     due:=started+make_interval(mins=>(a->>'timeout_minutes')::integer);
     if a->>'wait_mode'='date' then yes:=now()>=(a->>'until')::timestamptz;
     elsif a->>'wait_mode'='condition' then yes:=relay_private.workflow_matches(to_jsonb(r)||s.variables,a->'conditions',coalesce(a->>'condition_mode','all'));
     else yes:=exists(select 1 from public.communications c where c.workspace_id=e.workspace_id and c.user_id=e.created_by and c.kind='email' and c.received_at>=started and c.is_reply and lower(c.sender_email)=lower(coalesce(nullif(vars->'contact'->>'email',''),r.email)));end if;
     if not yes and now()>=due and coalesce(a->>'timeout_behavior','stop')='stop' then raise exception 'Wait timed out' using errcode='P0002';end if;
     yes:=yes or now()>=due;
     due:=least(due,now()+interval '1 minute',case when a->>'wait_mode'='date' then (a->>'until')::timestamptz else due end);
    end if;
    if yes then outcome:=relay_private.workflow_block_finish(e.id,j.id,a,jsonb_build_object('status','resumed'),pos+1,steps);
    else
     update public.workflow_step_runs set status='waiting',next_at=due where execution_id=e.id and step_key=a->>'_key';
     update public.workflow_executions set status='waiting',next_at=due,updated_at=now() where id=e.id;
     update relay_private.workflow_state set recheck=true where execution_id=e.id;
     update relay_private.jobs set status='queued',run_at=due,attempts=greatest(attempts-1,0),lease=null,leased_until=null where id=j.id;outcome:=jsonb_build_object('status','waiting');
    end if;
   else
    foreach k in array array['title','body','value'] loop if a?k then a:=jsonb_set(a,array[k],to_jsonb(relay_private.workflow_render(a->>k,vars,case when k='title' then 300 else 10000 end)));end if;end loop;
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
    elsif a->>'type'='notify' then
     if not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=target and role in ('owner','admin','member')) then raise exception 'Notification access revoked' using errcode='42501';end if;
     insert into public.notifications(workspace_id,user_id,entity,entity_id,kind,title,dedup_key) values(e.workspace_id,target,'workflows',e.id,'assigned',a->>'title','workflow:'||e.id||':'||(a->>'_key')) on conflict do nothing;
    else raise exception 'Unsupported action' using errcode='22023';end if;
    outcome:=relay_private.workflow_block_finish(e.id,j.id,a,jsonb_build_object('entity_id',effect,'status','completed'),pos+1,steps);
   end if;
  end if;
 exception when sqlstate '42501' or sqlstate '22023' or sqlstate 'P0002' or check_violation or foreign_key_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  get stacked diagnostics code=returned_sqlstate;
  code:=case when code='42501' then 'access_revoked' when code='P0002' then 'wait_timeout' else 'invalid_action' end;
  update public.workflow_step_runs set status='failed',error_code=code,completed_at=now() where execution_id=e.id and step_key=a->>'_key';
  update public.workflow_executions set status='failed',error_code=code,completed_at=now(),updated_at=now() where id=e.id;
  update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now(),last_error=code where id=j.id;
  outcome:=jsonb_build_object('status','failed','error_code',code);
 end;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);perform set_config('request.jwt.claims',coalesce(prior_claims,'{}'),true);perform set_config('relay.workflow_effect',coalesce(guard,''),true);
 return outcome;
end $$;

create function relay_private.workflow_effect(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare j relay_private.jobs;e public.workflow_executions;io relay_private.workflow_outbox;f public.workflows;s relay_private.workflow_state;a jsonb;result jsonb;quota integer;done jsonb;rec public.records;integration uuid;next_state text;code text;
begin
 select * into io from relay_private.workflow_outbox where id=(payload->>'effect')::uuid;
 select * into f from public.workflows where id=(select workflow_id from public.workflow_executions where id=io.execution_id) for update;
 select * into e from public.workflow_executions where id=io.execution_id for update;
 select * into j from relay_private.jobs where id=(payload->>'id')::uuid for update;
 select * into io from relay_private.workflow_outbox where id=(payload->>'effect')::uuid for update;
 if io.id is null or j.status<>'running' or j.lease is distinct from (payload->>'lease')::uuid or j.leased_until<=now() or e.job_id<>j.id or j.workspace_id<>io.workspace_id or e.status<>'running' then raise exception 'Invalid effect lease' using errcode='40001';end if;
 select * into s from relay_private.workflow_state where execution_id=e.id for update;a:=s.steps->e.cursor;
 if a->>'_key' is distinct from io.step_key then raise exception 'Invalid block position' using errcode='40001';end if;
 if operation='prepare' then
  if io.status<>'pending' or (f.published_version is not null and not f.enabled) or not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.created_by and role in ('owner','admin','member')) then raise exception 'Effect unavailable' using errcode='42501';end if;
  if a->>'type' in ('email','calendar') and not exists(select 1 from public.integrations where workspace_id=e.workspace_id and user_id=e.created_by and provider=a->>'provider' and status='connected') then raise exception 'Connect account' using errcode='22023';end if;
  if a->>'type'='email' and exists(select 1 from public.suppressions where workspace_id=e.workspace_id and lower(email)=lower(relay_private.workflow_render(a->>'to',io.variables,300))) then raise exception 'Recipient suppressed' using errcode='22023';end if;
  if a->>'type' in ('slack','webhook') and not exists(select 1 from relay_private.workflow_destinations where workspace_id=e.workspace_id and id=(a->>'destination_id')::uuid and enabled) then raise exception 'Destination disabled' using errcode='22023';end if;
  if not pg_try_advisory_xact_lock(hashtextextended('workflow-io:'||e.workspace_id,0)) then raise exception 'IO admission busy' using errcode='55P03';end if;
  quota:=case a->>'type' when 'ai' then 100 when 'email' then 200 when 'calendar' then 100 else 500 end;
  if coalesce((select attempts from relay_private.workflow_io_usage where workspace_id=e.workspace_id and day=(now() at time zone 'UTC')::date and kind=a->>'type'),0)>=quota then raise exception 'External daily quota exceeded' using errcode='53300';end if;
  insert into relay_private.workflow_io_usage(workspace_id,day,kind,attempts) values(e.workspace_id,(now() at time zone 'UTC')::date,a->>'type',1) on conflict(workspace_id,day,kind) do update set attempts=workflow_io_usage.attempts+1;
  update relay_private.workflow_outbox set status='sending',attempted_at=now(),error_code=null where id=io.id;
  return jsonb_build_object('ok',true);
 elsif operation='finish' then
  next_state:=payload->>'state';code:=left(payload->>'code',100);result:=coalesce(payload->'result','{}');
  if next_state not in ('completed','failed','unknown') or octet_length(result::text)>10000 or io.status not in ('pending','sending','unknown') then raise exception 'Invalid IO outcome' using errcode='22023';end if;
  if next_state='completed' and io.status<>'sending' then raise exception 'Unsent action' using errcode='22023';end if;
  update relay_private.workflow_outbox set status=next_state,result=result,error_code=code,completed_at=now() where id=io.id;
  if next_state='completed' then
   if a->>'type' in ('email','calendar') then
    select id into integration from public.integrations where workspace_id=e.workspace_id and user_id=e.created_by and provider=a->>'provider' and status='connected';
    select * into rec from public.records where workspace_id=e.workspace_id and id=e.record_id;
    if integration is not null then
     insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,recipients,body,starts_at,received_at,direction)
     values(e.workspace_id,e.created_by,integration,coalesce(nullif(result->>'provider_id',''),io.id::text),case when a->>'type'='email' then 'email' else 'calendar' end,
      relay_private.workflow_render(coalesce(a->>'subject',a->>'title'),io.variables,300),
      (select email from public.integrations where id=integration),
      case when a->>'type'='email' then array[relay_private.workflow_render(a->>'to',io.variables,300)] else '{}' end,
      relay_private.workflow_render(coalesce(a->>'body',''),io.variables),
      case when a->>'type'='calendar' then relay_private.workflow_render(a->>'starts_at',io.variables,200)::timestamptz end,now(),'outbound') on conflict(integration_id,kind,provider_id) do nothing;
    end if;
   end if;
   done:=relay_private.workflow_block_finish(e.id,j.id,a,result,e.cursor+1,s.steps);return done;
  end if;
  update public.workflow_step_runs set status=next_state,error_code=code,completed_at=now() where execution_id=e.id and step_key=io.step_key;
  update public.workflow_executions set status=next_state,error_code=code,completed_at=now(),updated_at=now() where id=e.id;
  update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now(),last_error=code where id=j.id;
  return jsonb_build_object('status',next_state);
 end if;raise exception 'Unknown IO operation' using errcode='22023';
end $$;
create function relay_private.workflow_emit(w uuid,rec uuid,event text,event_key text,event_data jsonb default '{}',private_user uuid default null,target_flow uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare f public.workflows;d jsonb;r public.records;target_record public.records;original text;key text;x uuid;n integer:=0;begin
 if current_setting('relay.workflow_effect',true)='on' then return 0;end if;
 select * into r from public.records where workspace_id=w and id=rec and not archived;if r.id is null then return 0;end if;
 original:=current_setting('relay.workflow_event_ctx',true);
 perform set_config('relay.workflow_event_ctx',jsonb_build_object('event',event_data||jsonb_build_object('kind',event),'private_user',private_user)::text,true);
 for f in select * from public.workflows where workspace_id=w and enabled and published_version is not null and (target_flow is null or id=target_flow) and (private_user is null or runner_id=private_user) loop
  select definition into d from relay_private.workflow_releases where workspace_id=w and workflow_id=f.id and version=f.published_version;
  if d->'trigger'->>'type'<>event then continue;end if;
  for target_record in select rr.* from public.records rr where rr.workspace_id=w and not rr.archived and rr.object_id=(d->>'object_id')::uuid and (rr.id=rec or (event in ('email_received','email_replied','task_completed','meeting_completed','commitment_overdue') and exists(select 1 from public.record_relations link where link.workspace_id=w and ((link.source_id=rec and link.target_id=rr.id) or (link.target_id=rec and link.source_id=rr.id))))) order by rr.id limit 20 loop
  key:=case when coalesce(d->>'reenrollment','once')='once' and event not in ('schedule','date_reached','commitment_overdue') then 'once:'||target_record.id else left('event:'||event||':'||event_key||':'||target_record.id,300) end;
  x:=relay_private.workflow_start(w,f.id,f.published_version,target_record.id,f.runner_id,event,key);if x is not null then n:=n+1;end if;
 end loop;end loop;
 perform set_config('relay.workflow_event_ctx',coalesce(original,''),true);return n;
end $$;
create function relay_private.workflow_source_event() returns trigger language plpgsql security definer set search_path='' as $$
declare row jsonb:=to_jsonb(new);rec uuid;event text;payload jsonb;recrow record;mail text;event_key text;begin
 if current_setting('relay.workflow_effect',true)='on' then return new;end if;
 if tg_table_name='tasks' then
  if new.status<>'done' or (tg_op='UPDATE' and old.status='done') then return new;end if;event:='task_completed';rec:=new.record_id;payload:=jsonb_build_object('subject',new.title,'entity_id',new.id);
 elsif tg_table_name='meetings' then
  if new.status<>'completed' or (tg_op='UPDATE' and old.status='completed') then return new;end if;event:='meeting_completed';rec:=new.record_id;payload:=jsonb_build_object('subject',new.title,'body',left(coalesce(nullif(new.summary,''),new.transcript),6000),'entity_id',new.id);
 else
  if new.kind<>'email' or new.direction<>'inbound' or new.received_at<now()-interval '24 hours' then return new;end if;
  mail:=coalesce(new.sender_email,substring(new.sender from '<([^>]+)>'),new.sender);
  if lower(mail)=(select lower(email) from public.integrations where id=new.integration_id) then return new;end if;
  payload:=jsonb_build_object('subject',new.subject,'body',left(new.body,6000),'entity_id',new.id);
  for recrow in select distinct r.id from public.records r join public.workflows f on f.workspace_id=r.workspace_id and f.enabled and f.runner_id=new.user_id join relay_private.workflow_releases release on release.workspace_id=f.workspace_id and release.workflow_id=f.id and release.version=f.published_version
   where r.workspace_id=new.workspace_id and lower(r.email)=lower(mail) and not r.archived and new.received_at>=release.created_at and release.definition->'trigger'->>'type' in ('email_received','email_replied') limit 30 loop
    perform relay_private.workflow_emit(new.workspace_id,recrow.id,'email_received',new.id::text,payload,new.user_id);
    if new.is_reply then perform relay_private.workflow_emit(new.workspace_id,recrow.id,'email_replied',new.id::text,payload,new.user_id);end if;
  end loop;return new;
 end if;
 if rec is not null then
  event_key:=row->>'id'||':'||coalesce(row->>'updated_at',row->>'created_at');
  perform relay_private.workflow_emit(new.workspace_id,rec,event,event_key,payload);
 end if;return new;
end $$;
create trigger workflow_task_completed after insert or update of status on public.tasks for each row execute function relay_private.workflow_source_event();
create trigger workflow_meeting_completed after insert or update of status on public.meetings for each row execute function relay_private.workflow_source_event();
create trigger workflow_email_received after insert on public.communications for each row execute function relay_private.workflow_source_event();
-- Reuse records_email_idx from the original schema.

create function relay_private.workflow_time_events() returns void language plpgsql security definer set search_path='' as $$
declare f public.workflows;d jsonb;t jsonb;local_time timestamp;period text;state relay_private.workflow_schedule_cursors;rec record;last_record uuid;scanned integer;budget integer;completed boolean;field text;value text;item record;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('workflow-time-events',0)) then return;end if;
 for f in select flow.* from public.workflows flow join relay_private.workflow_releases release on release.workflow_id=flow.id and release.version=flow.published_version and release.workspace_id=flow.workspace_id left join relay_private.workflow_schedule_cursors c on c.workflow_id=flow.id where flow.enabled and release.definition->'trigger'->>'type' in ('schedule','date_reached','commitment_overdue') and (c.next_at is null or c.next_at<=now()) order by coalesce(c.next_at,'-infinity') limit 30 loop
  select definition into d from relay_private.workflow_releases where workspace_id=f.workspace_id and workflow_id=f.id and version=f.published_version;t:=d->'trigger';
  if t->>'type' not in ('schedule','date_reached','commitment_overdue') then continue;end if;
  local_time:=now() at time zone coalesce(t->>'timezone','UTC');period:=f.published_version||':'||local_time::date;
  insert into relay_private.workflow_schedule_cursors(workflow_id,period) values(f.id,period) on conflict do nothing;
  select * into state from relay_private.workflow_schedule_cursors where workflow_id=f.id for update;
  if state.period<>period then update relay_private.workflow_schedule_cursors set period=period,last_id=null where workflow_id=f.id;state.last_id:=null;end if;
  if t->>'type'='schedule' then
   if local_time::time<(t->>'time')::time or (t->>'frequency'='weekly' and not (t->'weekdays' @> to_jsonb(extract(dow from local_time)::integer))) then
    update relay_private.workflow_schedule_cursors set next_at=now()+interval '1 minute' where workflow_id=f.id;continue;
   end if;
  end if;
  if (select count(*) from public.workflow_executions where workspace_id=f.workspace_id and status in ('queued','running','waiting','paused','unknown'))>=190 then update relay_private.workflow_schedule_cursors set next_at=now()+interval '1 minute' where workflow_id=f.id;continue;end if;
  budget:=greatest(0,least(50,200-(select count(*) from public.workflow_executions where workspace_id=f.workspace_id and status in ('queued','running','waiting','paused','unknown'))));
  scanned:=0;last_record:=state.last_id;
  if t->>'type'='commitment_overdue' then
   for item in select * from public.commitments where workspace_id=f.workspace_id and record_id is not null and status in ('confirmed','in_progress') and due_date<now() and (state.last_id is null or id>state.last_id) order by id limit budget loop
    perform relay_private.workflow_emit(f.workspace_id,item.record_id,'commitment_overdue',item.id||':'||item.due_date,jsonb_build_object('subject',item.title,'entity_id',item.id),null,f.id);last_record:=item.id;scanned:=scanned+1;
   end loop;
  else
   for rec in select * from public.records where workspace_id=f.workspace_id and object_id=(d->>'object_id')::uuid and not archived and (state.last_id is null or id>state.last_id) order by id limit budget loop
    last_record:=rec.id;scanned:=scanned+1;
    if t->>'type'='date_reached' then
     value:=relay_private.workflow_value(to_jsonb(rec),t->>'field');
     if coalesce(value,'')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}' or left(value,10)>local_time::date::text then continue;end if;
     perform relay_private.workflow_emit(f.workspace_id,rec.id,'date_reached',rec.id||':'||value,jsonb_build_object('subject',value),null,f.id);
    else perform relay_private.workflow_emit(f.workspace_id,rec.id,'schedule',period,jsonb_build_object('subject',period),null,f.id);end if;
   end loop;
  end if;
  update relay_private.workflow_schedule_cursors set last_id=last_record,next_at=case when scanned=budget then now()+interval '1 minute' when t->>'type'='schedule' then ((local_time::date+1)::timestamp at time zone coalesce(t->>'timezone','UTC')) else now()+interval '5 minutes' end where workflow_id=f.id;
  if scanned<budget and t->>'type'<>'schedule' then update relay_private.workflow_schedule_cursors set last_id=null where workflow_id=f.id;end if;
 end loop;
end $$;

create function relay_private.workflow_config(w uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare row relay_private.workflow_destinations;f public.workflows;id uuid;result jsonb;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if operation='list' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'kind',d.kind,'enabled',d.enabled) order by d.created_at),'[]') from relay_private.workflow_destinations d where d.workspace_id=w);
 end if;
 if not pg_try_advisory_xact_lock(hashtextextended('workflow-config:'||w,0)) then raise exception 'Configuration busy' using errcode='55P03';end if;
 if (select count(*) from public.audit_events where workspace_id=w and entity='workflow_connections' and created_at>now()-interval '1 minute')>=30 then raise exception 'Connection rate limit' using errcode='53300';end if;
 if operation='hook' then
  select * into f from public.workflows where workspace_id=w and workflows.id=(payload->>'workflow_id')::uuid for update;
  if f.id is null or (f.created_by is not null and f.created_by<>auth.uid() and not relay_private.has_role(w,array['owner','admin'])) then raise exception 'Forbidden' using errcode='42501';end if;
  if f.definition->'trigger'->>'type' not in ('webhook','form_received') or length(payload->>'encrypted') not between 1 and 12000 then raise exception 'Configure webhook trigger first' using errcode='22023';end if;
  insert into relay_private.workflow_hooks(workflow_id,encrypted_secret,created_by) values(f.id,payload->>'encrypted',auth.uid()) on conflict(workflow_id) do update set encrypted_secret=excluded.encrypted_secret,created_by=excluded.created_by,created_at=now();id:=f.id;
 else
  if not relay_private.has_role(w,array['owner','admin']) then raise exception 'Admin required' using errcode='42501';end if;
  if operation='destination' then
   if (select count(*) from relay_private.workflow_destinations where workspace_id=w)>=20 then raise exception '20 destinations maximum' using errcode='53300';end if;
   insert into relay_private.workflow_destinations(workspace_id,name,kind,encrypted,created_by) values(w,payload->>'name',payload->>'kind',payload->>'encrypted',auth.uid()) returning workflow_destinations.id into id;
  elsif operation='toggle' then
   update relay_private.workflow_destinations set enabled=(payload->>'enabled')::boolean where workspace_id=w and workflow_destinations.id=(payload->>'id')::uuid returning workflow_destinations.id into id;
  else raise exception 'Unknown config action' using errcode='22023';end if;
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'workflow_connections',id,operation,'{}');
 return jsonb_build_object('id',id);
end $$;
create function public.workflow_config(w uuid,operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_config(w,operation,payload)$$;
create function relay_private.workflow_hook_get(wf uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('encrypted_secret',h.encrypted_secret,'workspace_id',f.workspace_id,'kind',d.definition->'trigger'->>'type')
 from relay_private.workflow_hooks h join public.workflows f on f.id=h.workflow_id join relay_private.workflow_releases d on d.workspace_id=f.workspace_id and d.workflow_id=f.id and d.version=f.published_version
 where f.id=wf and f.enabled and exists(select 1 from public.memberships where workspace_id=f.workspace_id and user_id=f.runner_id and role in ('owner','admin','member'))
$$;
create function public.workflow_hook_get(wf uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_hook_get(wf)$$;
create function relay_private.workflow_ingest(wf uuid,rec uuid,kind text,event_key uuid,event_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.workflows;result integer;begin
 select * into f from public.workflows where id=wf and enabled and published_version is not null for update;
 if f.id is null or kind not in ('webhook','form_received') or jsonb_typeof(event_data)<>'object' or octet_length(event_data::text)>16000 then raise exception 'Invalid event' using errcode='22023';end if;
 if exists(select 1 from relay_private.workflow_hook_receipts where workflow_id=wf and event_id=event_key) then return jsonb_build_object('duplicate',true);end if;
 if (select count(*) from relay_private.workflow_hook_receipts where workflow_id=wf and created_at>now()-interval '1 minute')>=60 then raise exception 'Webhook rate limit' using errcode='53300';end if;
 insert into relay_private.workflow_hook_receipts(workflow_id,event_id) values(wf,event_key);
 result:=relay_private.workflow_emit(f.workspace_id,rec,kind,event_key::text,jsonb_build_object('payload',event_data,'subject',left(coalesce(event_data->>'subject',''),300),'body',left(coalesce(event_data->>'body',''),6000)),null,wf);
 return jsonb_build_object('accepted',result>0);
end $$;
create function public.workflow_ingest(wf uuid,rec uuid,kind text,event_key uuid,event_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_ingest(wf,rec,kind,event_key,event_data)$$;

create or replace function relay_private.workflow_record_event() returns trigger language plpgsql security definer set search_path='' as $$
declare wf public.workflows;d jsonb;event text;field text;key text;
begin
 if current_setting('relay.workflow_effect',true)='on' or new.archived then return new;end if;
 for wf in select * from public.workflows where workspace_id=new.workspace_id and enabled and published_version is not null loop
  select definition into d from relay_private.workflow_releases where workspace_id=wf.workspace_id and workflow_id=wf.id and version=wf.published_version;
  if d->>'object_id'<>new.object_id::text then continue;end if;
  event:=d->'trigger'->>'type';if event not in ('record_created','record_updated','stage_changed') then continue;end if;field:=d->'trigger'->>'field';
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
create or replace function relay_private.workflow_control(w uuid,wf uuid,operation text,expected_version integer,execution uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare flow public.workflows;x public.workflow_executions;result jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into flow from public.workflows where workspace_id=w and id=wf for update;
 if flow.id is null or (flow.created_by is not null and flow.created_by<>auth.uid() and not relay_private.has_role(w,array['owner','admin'])) then raise exception 'Forbidden' using errcode='42501';end if;
 if expected_version is null or flow.version<>expected_version then raise exception 'Workflow changed' using errcode='40001';end if;
 if operation='publish' then
  if not pg_try_advisory_xact_lock(hashtextextended('workflow-publish:'||w,0)) then raise exception 'Publish busy' using errcode='55P03';end if;
  perform relay_private.workflow_validate(flow.definition,w);
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
 elsif operation in ('cancel','retry','resolve_done','resolve_not_sent') then
  select * into x from public.workflow_executions where workspace_id=w and workflow_id=wf and id=execution for update;
  if x.context_user_id is not null and x.context_user_id<>auth.uid() then raise exception 'Private execution' using errcode='42501';end if;
  if x.id is null then raise exception 'Execution missing' using errcode='22023';end if;
  if operation in ('resolve_done','resolve_not_sent') then
   if x.status<>'unknown' then raise exception 'No uncertain action' using errcode='22023';end if;
   if operation='resolve_done' then
    update relay_private.workflow_outbox set status='completed',error_code=null,result=jsonb_build_object('status','confirmed_by_user'),completed_at=now() where execution_id=x.id and status='unknown';
   else
    update relay_private.workflow_outbox set status='pending',error_code=null,completed_at=null where execution_id=x.id and status='unknown';
   end if;
   update relay_private.workflow_outbox set status='pending',error_code=null,completed_at=null where execution_id=x.id and status='failed';
   update public.workflow_step_runs set status='queued',started_at=null,completed_at=null,error_code=null where execution_id=x.id and status in ('failed','unknown');
   update public.workflow_executions set status='queued',error_code=null,completed_at=null,updated_at=now() where id=x.id;
   update relay_private.jobs set status='queued',attempts=0,run_at=now(),lease=null,leased_until=null,completed_at=null,last_error=null where id=x.job_id and status='dead';
  elsif operation='cancel' then
   if x.status not in ('queued','waiting','paused','failed','unknown') then raise exception 'Execution already finished' using errcode='22023';end if;
   update public.workflow_executions set status='cancelled',completed_at=now(),updated_at=now() where id=x.id;
   update public.workflow_step_runs set status='skipped',completed_at=now() where execution_id=x.id and status in ('queued','waiting');
   delete from relay_private.workflow_state where execution_id=x.id;
   update relay_private.jobs set status='dead',lease=null,leased_until=null,completed_at=now(),payload='{}',last_error='cancelled' where id=x.job_id and status<>'completed';
  else
   if x.status<>'failed' or not exists(select 1 from relay_private.workflow_state where execution_id=x.id) or (flow.published_version is not null and not flow.enabled) or not exists(select 1 from public.memberships where workspace_id=w and user_id=x.created_by and role in ('owner','admin','member')) then raise exception 'Execution cannot retry; simulate again' using errcode='22023';end if;
   update relay_private.workflow_outbox set status='pending',error_code=null,completed_at=null where execution_id=x.id and status='failed';
   update public.workflow_step_runs set status='queued',started_at=null,completed_at=null,error_code=null where execution_id=x.id and status in ('failed','unknown');
   update public.workflow_executions set status='queued',error_code=null,completed_at=null,updated_at=now() where id=x.id;
   update relay_private.jobs set status='queued',attempts=0,run_at=now(),lease=null,leased_until=null,completed_at=null,last_error=null where id=x.job_id and status='dead';
  end if;
 else raise exception 'Unknown operation' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'workflows',wf,operation,jsonb_build_object('version',flow.version,'execution_id',execution));
 select to_jsonb(f) into result from public.workflows f where id=wf;return result;
end $$;
create or replace function relay_private.workflow_launch(w uuid,preview uuid) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
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
create or replace function relay_private.workflow_schedule() returns void language plpgsql security definer set search_path='' as $$
declare e public.workflow_executions;j uuid;
begin
 for e in select x.* from public.workflow_executions x join (select id,row_number() over(partition by workspace_id order by created_at,id) n from public.workflow_executions where status='queued' and job_id is null) ranked on ranked.id=x.id where ranked.n<=3 order by x.created_at,x.id for update of x skip locked limit 30 loop
  if not exists(select 1 from public.memberships m join public.workflows f on f.workspace_id=m.workspace_id where m.workspace_id=e.workspace_id and m.user_id=e.created_by and m.role in ('owner','admin','member') and f.id=e.workflow_id and (f.published_version is null or (f.enabled and exists(select 1 from public.memberships runner where runner.workspace_id=f.workspace_id and runner.user_id=f.runner_id and runner.role in ('owner','admin','member'))))) then
   update public.workflow_executions set status='failed',error_code='access_revoked',completed_at=now(),updated_at=now() where id=e.id;
   update relay_private.jobs set status='dead',payload='{}',lease=null,leased_until=null,completed_at=now(),last_error='workflow_access_revoked' where id=e.job_id and status not in ('completed','dead');
   continue;
  end if;
  j:=relay_private.put_job(e.workspace_id,e.created_by,'workflow_run','execution:'||e.id,jsonb_build_object('execution_id',e.id));
  if j is not null then update public.workflow_executions set job_id=j where id=e.id;end if;
 end loop;
 if pg_try_advisory_xact_lock(hashtextextended('workflow-retention',0)) and not exists(select 1 from relay_private.scheduler_ticks where key='workflow-retention' and last_at>now()-interval '1 hour') then
  insert into relay_private.scheduler_ticks(key,last_at) values('workflow-retention',now()) on conflict(key) do update set last_at=excluded.last_at;
  delete from relay_private.workflow_io_usage where day<current_date-7;
  delete from relay_private.workflow_hook_receipts where (workflow_id,event_id) in (select workflow_id,event_id from relay_private.workflow_hook_receipts where created_at<now()-interval '90 days' limit 500);
  delete from public.workflow_executions where id in(select id from public.workflow_executions where completed_at<now()-interval '90 days' order by completed_at limit 500);
  delete from relay_private.workflow_releases d where not exists(select 1 from public.workflow_executions history where history.workspace_id=d.workspace_id and history.workflow_id=d.workflow_id and history.workflow_version=d.version)
   and not exists(select 1 from public.workflows f where f.workspace_id=d.workspace_id and f.id=d.workflow_id and f.published_version=d.version) and d.created_at<now()-interval '90 days';
 end if;
end $$;
create or replace function relay_private.connector_sync(w uuid,p text,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.integrations;s relay_private.connector_sync_state;l uuid;n integer;
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p for update;
 if not found then raise exception 'Unknown integration' using errcode='22023';end if;
 select * into s from relay_private.connector_sync_state where integration_id=i.id;
 if operation='status' then return jsonb_build_object('auto_sync',coalesce(s.auto_sync,false),'pending',coalesce(s.cursor?'page',false),'imported',coalesce(s.imported,0),'last_error',s.last_error,'completed_at',s.completed_at,'running',coalesce(s.leased_until>now(),false));end if;
 if not relay_private.has_role(w,array['owner','admin','member']) or i.status<>'connected' then raise exception 'Forbidden' using errcode='42501';end if;
 insert into relay_private.connector_sync_state(integration_id) values(i.id) on conflict do nothing;
 select * into s from relay_private.connector_sync_state where integration_id=i.id for update;
 if operation='configure' then
  update relay_private.connector_sync_state set auto_sync=(payload->>'enabled')::boolean,next_at=now() where integration_id=i.id;
  return jsonb_build_object('ok',true);
 elsif operation='claim' then
  if s.leased_until>now() then raise exception 'Synchronization already running' using errcode='40001';end if;
  l:=gen_random_uuid();
  update relay_private.connector_sync_state set lease=l,leased_until=now()+interval '2 minutes' where integration_id=i.id;
  return jsonb_build_object('lease',l,'cursor',s.cursor,'generation',s.generation);
 elsif operation in ('finish','fail','renew') then
  if s.lease is null or s.leased_until is null or s.lease is distinct from (payload->>'lease')::uuid or s.leased_until<=now() then raise exception 'Synchronization lease expired' using errcode='40001';end if;
  if operation='renew' then
   update relay_private.connector_sync_state set leased_until=now()+interval '2 minutes' where integration_id=i.id;
   return jsonb_build_object('ok',true);
  end if;
  if operation='fail' then
   update relay_private.connector_sync_state set lease=null,leased_until=null,last_error=left(payload->>'error',500),next_at=now()+interval '5 minutes' where integration_id=i.id;
   return jsonb_build_object('ok',true);
  end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')>100 or octet_length(payload::text)>4000000 then raise exception 'Invalid sync batch' using errcode='22023';end if;
  insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,recipients,body,starts_at,received_at,sync_generation,is_reply,thread_id,sender_email,ends_at,direction)
  select w,auth.uid(),i.id,x.provider_id,x.kind,x.subject,x.sender,x.recipients,x.body,x.starts_at,x.received_at,s.generation,coalesce(x.is_reply,false),x.thread_id,x.sender_email,x.ends_at,coalesce(x.direction,'inbound')
  from jsonb_to_recordset(payload->'items') as x(provider_id text,kind text,subject text,sender text,recipients text[],body text,starts_at timestamptz,received_at timestamptz,is_reply boolean,thread_id text,sender_email text,ends_at timestamptz,direction text)
  on conflict(integration_id,kind,provider_id) do update set subject=excluded.subject,sender=excluded.sender,recipients=excluded.recipients,body=excluded.body,starts_at=excluded.starts_at,received_at=excluded.received_at,sync_generation=excluded.sync_generation,is_reply=excluded.is_reply,thread_id=excluded.thread_id,sender_email=excluded.sender_email,ends_at=excluded.ends_at,direction=excluded.direction;
  get diagnostics n=row_count;
  if (payload->>'complete')::boolean and i.provider in ('google-calendar','outlook-calendar') then
   delete from public.communications where integration_id=i.id and kind='calendar' and starts_at>=(payload->>'window_start')::timestamptz and starts_at<(payload->>'window_end')::timestamptz and sync_generation is distinct from s.generation;
  end if;
  update relay_private.connector_sync_state set cursor=payload->'cursor',
   generation=case when (payload->>'complete')::boolean then gen_random_uuid() else s.generation end,
   lease=null,leased_until=null,last_error=null,imported=s.imported+n,
   completed_at=case when (payload->>'complete')::boolean then now() else s.completed_at end,
   next_at=now()+case when (payload->>'complete')::boolean then interval '5 minutes' else interval '1 minute' end
  where integration_id=i.id;
  if (payload->>'complete')::boolean then update public.integrations set last_sync=now() where id=i.id;end if;
  return jsonb_build_object('synced',n,'complete',(payload->>'complete')::boolean);
 else raise exception 'Unknown operation' using errcode='22023';end if;
end $$;
create function relay_private.workflow_inspect(w uuid,execution uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.workflow_executions;d jsonb;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into e from public.workflow_executions where workspace_id=w and id=execution;
 if e.id is null or (e.context_user_id is not null and e.context_user_id<>auth.uid()) then raise exception 'Forbidden' using errcode='42501';end if;
 select definition into d from relay_private.workflow_releases where workspace_id=w and workflow_id=e.workflow_id and version=e.workflow_version;
 return jsonb_build_object('definition',d,'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.step_key),'[]') from public.workflow_step_runs s where s.execution_id=e.id));
end $$;
create function public.workflow_inspect(w uuid,execution uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.workflow_inspect(w,execution)$$;
create or replace function relay_private.workflow_job_dispatch(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare result jsonb;j relay_private.jobs;id uuid;uncertain boolean;begin
 if operation='schedule' and payload->'types' ? 'workflow_run' then perform relay_private.workflow_time_events();perform relay_private.workflow_schedule();end if;
 if operation in ('workflow_effect_prepare','workflow_effect_finish') then return relay_private.workflow_effect(case when operation='workflow_effect_prepare' then 'prepare' else 'finish' end,payload);end if;
 if operation='execute' then
  select * into j from relay_private.jobs where jobs.id=(payload->>'id')::uuid;
  if j.type='workflow_run' and j.payload ? 'execution_id' then return relay_private.workflow_tick(j.id,(payload->>'lease')::uuid);end if;
 end if;
 result:=relay_private.job_worker_without_workflows(operation,payload);
 if operation='fail' then
  select * into j from relay_private.jobs where jobs.id=(payload->>'id')::uuid;
  if j.type='workflow_run' and j.payload ? 'execution_id' and j.status='dead' then
   id:=(j.payload->>'execution_id')::uuid;
   uncertain:=exists(select 1 from relay_private.workflow_outbox where execution_id=id and status='sending');
   update relay_private.workflow_outbox set status='unknown',error_code='delivery_uncertain' where execution_id=id and status='sending';
   update public.workflow_step_runs set status=case when uncertain then 'unknown' else 'failed' end,error_code=case when uncertain then 'delivery_uncertain' else 'worker_failed' end,completed_at=now() where execution_id=id and status='running';
   update public.workflow_executions set status=case when uncertain then 'unknown' else 'failed' end,error_code=case when uncertain then 'delivery_uncertain' else 'worker_failed' end,updated_at=now(),completed_at=now() where workflow_executions.id=id and workspace_id=j.workspace_id and status not in ('cancelled','completed');
  end if;
 end if;return result;
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='relay_private' and p.proname like 'workflow_%' loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
revoke all on function public.workflow_config(uuid,text,jsonb),public.workflow_inspect(uuid,uuid),public.workflow_hook_get(uuid),public.workflow_ingest(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function relay_private.workflow_control(uuid,uuid,text,integer,uuid),relay_private.workflow_launch(uuid,uuid),relay_private.workflow_config(uuid,text,jsonb),relay_private.workflow_inspect(uuid,uuid),public.workflow_config(uuid,text,jsonb),public.workflow_inspect(uuid,uuid) to authenticated;
grant execute on function relay_private.workflow_job_dispatch(text,jsonb),relay_private.workflow_hook_get(uuid),relay_private.workflow_ingest(uuid,uuid,text,uuid,jsonb),public.workflow_hook_get(uuid),public.workflow_ingest(uuid,uuid,text,uuid,jsonb) to service_role;
