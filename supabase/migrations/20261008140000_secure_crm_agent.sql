-- Ask Relay: invoker searches, atomic admission and a shared, fenced private outbox.
begin;
alter table public.documents add column text_content text not null default '' check(length(text_content)<=200000), add column extraction_status text not null default 'unavailable' check(extraction_status in ('unavailable','complete','partial'));
alter table public.communications add column record_id uuid, add column content_complete boolean not null default false, add column internet_message_id text, add column attachments jsonb not null default '[]', add foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete set null (record_id);
create index communications_record_idx on public.communications(workspace_id,user_id,record_id);
create index communications_thread_idx on public.communications(workspace_id,user_id,integration_id,thread_id,id);
-- Partial text remains distinguishable from a full document/email.
do $$ declare t text;c text;begin
 for t,c in select * from (values ('notes','title || '' '' || content'),('meetings','title || '' '' || transcript || '' '' || summary'),('communications','subject || '' '' || coalesce(sender,'''') || '' '' || body'),('tasks','title || '' '' || description'),('commitments','title || '' '' || source_quote || '' '' || evidence'),('documents','name || '' '' || text_content'),('conflicts','title || '' '' || field || '' '' || resolution'),('lists','name'),('pipelines','name'),('workflows','name || '' '' || description')) v loop
  execute format('alter table public.%I add column agent_search tsvector generated always as (to_tsvector(''simple'', %s)) stored',t,c);
  execute format('create index %I on public.%I using gin(agent_search)',t||'_agent_fts',t);
  execute format('create index %I on public.%I(workspace_id,id)',t||'_agent_cursor',t);
 end loop;
end $$;

-- Only a fixed resource/column registry is used. No caller-supplied SQL is executed.
create function public.agent_search(w uuid,kind text,filters jsonb default '{}',source uuid default null,content_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare tab text;label text;content text;rec text;extra text:='''{}''::jsonb';date_col text;where_sql text;result jsonb;lim integer;total bigint;thread public.communications;allowed text[];
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>4000 or content_offset not between 0 and 200000 then raise exception 'Invalid filters' using errcode='22023';end if;
 allowed:=array['query','record_id','since','until','cursor','limit'];
 case kind
 when 'record' then tab:='records';label:='display_name';content:='jsonb_build_object(''display_name'',display_name,''email'',email,''domain'',domain,''stage'',stage,''amount'',amount,''currency'',currency,''close_date'',close_date,''owner_id'',owner_id,''pipeline_id'',pipeline_id,''probability'',probability,''attributes'',attributes,''version'',version)::text';rec:='id';date_col:='created_at';extra:='jsonb_build_object(''object_id'',object_id,''version'',version)';allowed:=allowed||array['object_id','owner_id','pipeline_id','stage'];
 when 'note' then tab:='notes';label:='title';content:='content';rec:='record_id';date_col:='created_at';extra:='jsonb_build_object(''private'',private,''version'',version)';
 when 'meeting' then tab:='meetings';label:='title';content:='coalesce(nullif(transcript,''''),summary)';rec:='record_id';date_col:='coalesce(starts_at,created_at)';extra:='jsonb_build_object(''private'',private,''content_complete'',transcript_complete,''provider'',provider)';
 when 'email','calendar','thread' then tab:='communications';label:='subject';content:='body';rec:='record_id';date_col:=case when kind='calendar' then 'starts_at' else 'received_at' end;extra:='jsonb_build_object(''sender'',sender,''recipients'',recipients,''integration_id'',integration_id,''thread_id'',thread_id,''starts_at'',starts_at,''ends_at'',ends_at,''content_complete'',content_complete)';
 when 'task' then tab:='tasks';label:='title';content:='description';rec:='record_id';date_col:='created_at';extra:='jsonb_build_object(''status'',status,''due_date'',due_date,''owner_id'',owner_id,''version'',version)';allowed:=allowed||array['status','owner_id','overdue'];
 when 'commitment' then tab:='commitments';label:='title';content:='source_quote || '' '' || evidence';rec:='record_id';date_col:='created_at';extra:='jsonb_build_object(''status'',status,''due_date'',due_date,''private'',private,''version'',version)';allowed:=allowed||array['status','owner_id','overdue'];
 when 'document' then tab:='documents';label:='name';content:='text_content';rec:='record_id';date_col:='created_at';extra:='jsonb_build_object(''extraction_status'',extraction_status,''mime'',mime)';
 when 'conflict' then tab:='conflicts';label:='title';content:='jsonb_build_object(''source_a'',source_a,''source_b'',source_b,''field'',field,''resolution'',resolution)::text';rec:='record_id';date_col:='created_at';extra:='jsonb_build_object(''private'',private)';allowed:=allowed||array['status'];
 when 'list' then tab:='lists';label:='name';content:='name';rec:='null::uuid';date_col:='created_at';extra:='jsonb_build_object(''object_id'',object_id,''private'',visibility=''private'')';allowed:=array['query','cursor','limit','object_id'];
 when 'pipeline' then tab:='pipelines';label:='name';content:='(to_jsonb(pipelines)-''agent_search'')::text';rec:='null::uuid';date_col:='created_at';allowed:=array['query','cursor','limit'];
 when 'workflow' then tab:='workflows';label:='name';content:='description';rec:='null::uuid';date_col:='created_at';extra:='jsonb_build_object(''version'',version,''published_version'',published_version,''enabled'',enabled)';allowed:=array['query','cursor','limit'];
 else raise exception 'Unknown source' using errcode='22023';end case;
 if exists(select 1 from jsonb_object_keys(filters) k where not k=any(allowed)) then raise exception 'Unsupported filter' using errcode='22023';end if;
 lim:=coalesce((filters->>'limit')::integer,20);if lim not between 1 and 20 or length(coalesce(filters->>'query',''))>200 then raise exception 'Invalid page' using errcode='22023';end if;
 where_sql:='workspace_id=$1';
 if kind='record' then where_sql:=where_sql||' and not archived';end if;
 if source is not null and kind<>'thread' then where_sql:=where_sql||' and id=$3';end if;
 if coalesce(filters->>'query','')<>'' then where_sql:=where_sql||case when kind='record' then ' and search @@ websearch_to_tsquery(''simple'',$2->>''query'')' else ' and agent_search @@ websearch_to_tsquery(''simple'',$2->>''query'')' end;end if;
 if kind in ('email','calendar','thread') then
  where_sql:=where_sql||case when kind='calendar' then ' and kind=''calendar''' else ' and kind=''email''' end;
  if kind='thread' then
   select * into thread from public.communications where workspace_id=w and id=source and communications.kind='email';
   if thread.id is null then raise exception 'Source inaccessible' using errcode='42501';end if;
   where_sql:=where_sql||' and integration_id=$5 and (id=$3 or (thread_id=$6 and thread_id<>''''))';
  end if;
 end if;
 if filters ? 'record_id' then
  if kind in ('email','calendar','thread') then
   where_sql:=where_sql||' and (record_id=($2->>''record_id'')::uuid or exists(select 1 from public.records r where r.workspace_id=$1 and r.id=($2->>''record_id'')::uuid and nullif(r.email,'''') is not null and (lower(r.email)=lower(communications.sender_email) or lower(r.email)=any(array(select lower(x) from unnest(communications.recipients) x)))))';
  else where_sql:=where_sql||format(' and %s=($2->>''record_id'')::uuid',rec);end if;
 end if;
 if filters ? 'since' then where_sql:=where_sql||format(' and %s>=($2->>''since'')::timestamptz',date_col);end if;
 if filters ? 'until' then where_sql:=where_sql||format(' and %s<($2->>''until'')::timestamptz',date_col);end if;
 if filters ? 'object_id' then where_sql:=where_sql||' and object_id=($2->>''object_id'')::uuid';end if;
 if filters ? 'owner_id' then where_sql:=where_sql||' and owner_id=($2->>''owner_id'')::uuid';end if;
 if filters ? 'pipeline_id' then where_sql:=where_sql||' and pipeline_id=($2->>''pipeline_id'')::uuid';end if;
 if filters ? 'stage' then where_sql:=where_sql||' and stage=$2->>''stage''';end if;
 if filters ? 'status' then where_sql:=where_sql||' and status=$2->>''status''';end if;
 if (filters->>'overdue')::boolean is true then where_sql:=where_sql||' and due_date<now() and status not in (''done'',''cancelled'')';end if;
 execute format('select count(*) from public.%I where %s',tab,where_sql) into total using w,filters,source,content_offset,thread.integration_id,thread.thread_id;
 if filters ? 'cursor' then where_sql:=where_sql||' and id>($2->>''cursor'')::uuid';end if;
 execute format('select coalesce(jsonb_agg(x),''[]'') from (select id,%L as type,%s as record_id,left(%s,300) as label,substring(%s from $4+1 for %s) as content,length(%s) as content_length,%s as metadata,%s as occurred_at from public.%I where %s order by id limit %s) x',case when kind='thread' then 'email' else kind end,rec,label,content,case when source is null or kind='thread' then 1200 else 6000 end,content,extra,date_col,tab,where_sql,lim) into result using w,filters,source,content_offset,thread.integration_id,thread.thread_id;
 return jsonb_build_object('data',result,'total',total,'next_cursor',case when jsonb_array_length(result)=lim then result->(lim-1)->'id' else null end,'partial',jsonb_array_length(result)<total or filters ? 'cursor' or exists(select 1 from jsonb_array_elements(result) x where (x->>'content_length')::integer>length(x->>'content') or x->'metadata'->>'content_complete'='false' or x->'metadata'->>'extraction_status' in ('unavailable','partial')),'coverage',case when kind in ('email','thread','calendar') then 'Imported items only; synchronization is not a complete mailbox mirror.' when kind='meeting' then 'Imported available transcripts only; not a complete provider archive.' when kind='document' then 'Indexed extracted text only; extraction status is reported.' else 'All currently authorized matching rows; page and content limits reported.' end);
end $$;
revoke all on function public.agent_search(uuid,text,jsonb,uuid,integer) from public,anon;
grant execute on function public.agent_search(uuid,text,jsonb,uuid,integer) to authenticated;

create function public.agent_aggregate(w uuid,kind text,filters jsonb default '{}',group_by text default 'none') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare tab text;group_expr text;pred text:='workspace_id=$1';sql text;result jsonb;allowed text[]:=array['query','record_id','since','until'];date_col text:='created_at';begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 case kind when 'record' then tab:='records';pred:=pred||' and not archived';allowed:=allowed||array['object_id','owner_id','pipeline_id','stage'];when 'task' then tab:='tasks';allowed:=allowed||array['owner_id','status','overdue'];when 'commitment' then tab:='commitments';allowed:=allowed||array['owner_id','status','overdue'];when 'email' then tab:='communications';pred:=pred||' and kind=''email''';date_col:='received_at';when 'meeting' then tab:='meetings';date_col:='coalesce(starts_at,created_at)';else raise exception 'Invalid aggregate' using errcode='22023';end case;
 if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>4000 or exists(select 1 from jsonb_object_keys(filters) k where not k=any(allowed)) then raise exception 'Unsupported filter' using errcode='22023';end if;
 group_expr:=case group_by when 'none' then '''all''::text' when 'month' then format('to_char(%s at time zone ''UTC'',''YYYY-MM'')',date_col) when 'stage' then case when kind='record' then 'stage' end when 'pipeline' then case when kind='record' then 'pipeline_id::text' end when 'owner' then case when kind in ('record','task','commitment') then 'owner_id::text' end when 'status' then case when kind in ('task','commitment') then 'status' end end;
 if group_expr is null then raise exception 'Unsupported dimension' using errcode='22023';end if;
 if coalesce(filters->>'query','')<>'' then pred:=pred||case when kind='record' then ' and search @@ websearch_to_tsquery(''simple'',$2->>''query'')' else ' and agent_search @@ websearch_to_tsquery(''simple'',$2->>''query'')' end;end if;
 if filters ? 'record_id' then
  if kind='email' then pred:=pred||' and (record_id=($2->>''record_id'')::uuid or exists(select 1 from public.records r where r.workspace_id=$1 and r.id=($2->>''record_id'')::uuid and nullif(r.email,'''') is not null and (lower(r.email)=lower(communications.sender_email) or lower(r.email)=any(array(select lower(x) from unnest(communications.recipients) x)))))';
  else pred:=pred||case when kind='record' then ' and id=($2->>''record_id'')::uuid' else ' and record_id=($2->>''record_id'')::uuid' end;end if;
 end if;
 if filters ? 'since' then pred:=pred||format(' and %s>=($2->>''since'')::timestamptz',date_col);end if;
 if filters ? 'until' then pred:=pred||format(' and %s<($2->>''until'')::timestamptz',date_col);end if;
 if filters ? 'object_id' then pred:=pred||' and object_id=($2->>''object_id'')::uuid';end if;
 if filters ? 'owner_id' then pred:=pred||' and owner_id=($2->>''owner_id'')::uuid';end if;
 if filters ? 'pipeline_id' then pred:=pred||' and pipeline_id=($2->>''pipeline_id'')::uuid';end if;
 if filters ? 'stage' then pred:=pred||' and stage=$2->>''stage''';end if;
 if filters ? 'status' then pred:=pred||' and status=$2->>''status''';end if;
 if (filters->>'overdue')::boolean is true then pred:=pred||' and due_date<now() and status not in (''done'',''cancelled'')';end if;
 sql:=format('select %s as dimension,count(*) as count%s from public.%I where %s group by %s%s',group_expr,case when kind='record' then ',currency,sum(amount)::text as amount,avg(amount)::text as average_amount' else '' end,tab,pred,group_expr,case when kind='record' then ',currency' else '' end);
 execute 'select jsonb_build_object(''data'',coalesce(jsonb_agg(x),''[]''),''groups'',count(*)) from ('||sql||' order by dimension nulls first limit 201) x' into result using w,filters;
 if (result->>'groups')::integer>200 then return jsonb_build_object('data',(select jsonb_agg(value) from jsonb_array_elements(result->'data') with ordinality x(value,n) where n<=200),'partial',true,'reason','More than 200 groups; narrow filters.');end if;
 return result||jsonb_build_object('partial',false,'coverage',case when kind in ('email','meeting') then 'Imported authorized items only; not a complete provider archive.' else 'Exact aggregation of authorized matching rows.' end);
end $$;
revoke all on function public.agent_aggregate(uuid,text,jsonb,text) from public,anon;
grant execute on function public.agent_aggregate(uuid,text,jsonb,text) to authenticated;

-- Runtime budgets are reserved BEFORE provider calls, atomically across processes.
create table relay_private.agent_settings(workspace_id uuid primary key references public.workspaces(id) on delete cascade,daily_runs integer not null default 100 check(daily_runs between 1 and 10000),monthly_token_limit bigint not null default 3000000 check(monthly_token_limit between 1000 and 1000000000));
create table relay_private.agent_usage(workspace_id uuid references public.workspaces(id) on delete cascade,month date,tokens_reserved bigint not null default 0,tokens_actual bigint not null default 0,primary key(workspace_id,month));
create table relay_private.agent_runs(id uuid primary key default gen_random_uuid(),capability_hash text not null,workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,status text not null default 'running',started_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '90 seconds',completed_at timestamptz,tool_calls integer not null default 0,tool_limit integer not null check(tool_limit between 1 and 15),reserved_tokens integer not null,actual_tokens integer not null default 0,input_tokens integer not null default 0,output_tokens integer not null default 0,cost_microusd bigint not null default 0);
create index agent_active_user on relay_private.agent_runs(workspace_id,user_id,expires_at) where status='running';
create index agent_daily_runs on relay_private.agent_runs(workspace_id,started_at);
create table relay_private.agent_tool_events(run_id uuid references relay_private.agent_runs(id) on delete cascade,sequence integer,tool text not null check(length(tool)<=80),status text not null default 'running',resource_ids uuid[] not null default '{}',duration_ms integer,created_at timestamptz not null default now(),primary key(run_id,sequence));
do $$declare t text;begin foreach t in array array['agent_settings','agent_usage','agent_runs','agent_tool_events'] loop execute format('alter table relay_private.%I enable row level security',t);execute format('revoke all on relay_private.%I from public,anon,authenticated',t);end loop;end $$;
create function relay_private.agent_runtime(w uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r relay_private.agent_runs;s relay_private.agent_settings;day_start timestamptz;month_start date;budget integer;begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||w::text,0));month_start:=date_trunc('month',now() at time zone 'UTC')::date;day_start:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 insert into relay_private.agent_settings(workspace_id) values(w) on conflict do nothing;select * into s from relay_private.agent_settings where workspace_id=w;
 if operation='begin' then
  if payload->>'secret' is null or payload->>'secret' !~ '^[a-f0-9]{64}$' then raise exception 'Server capability required' using errcode='42501';end if;
  if exists(select 1 from relay_private.agent_runs where workspace_id=w and user_id=auth.uid() and status='running' and expires_at>now()) then raise exception 'Agent already running' using errcode='53300';end if;
  if (select count(*) from relay_private.agent_runs where workspace_id=w and started_at>=day_start)>=s.daily_runs then raise exception 'Daily agent quota exceeded' using errcode='53300';end if;
  budget:=coalesce((payload->>'reserved_tokens')::integer,60000);if budget not between 1000 and 1000000 or coalesce((payload->>'tool_limit')::integer,5) not between 1 and 15 then raise exception 'Invalid budget' using errcode='22023';end if;
  insert into relay_private.agent_usage(workspace_id,month) values(w,month_start) on conflict do nothing;
  if (select tokens_reserved from relay_private.agent_usage where workspace_id=w and month=month_start)+budget>s.monthly_token_limit then raise exception 'Monthly agent quota exceeded' using errcode='53300';end if;
  update relay_private.agent_usage set tokens_reserved=tokens_reserved+budget where workspace_id=w and month=month_start;
  insert into relay_private.agent_runs(workspace_id,user_id,capability_hash,tool_limit,reserved_tokens) values(w,auth.uid(),encode(sha256(convert_to(payload->>'secret','UTF8')),'hex'),coalesce((payload->>'tool_limit')::integer,5),budget) returning * into r;
  return jsonb_build_object('id',r.id,'reserved_tokens',r.reserved_tokens);
 elsif operation='usage' then
  return jsonb_build_object('settings',to_jsonb(s),'month',(select to_jsonb(u) from relay_private.agent_usage u where workspace_id=w and month=month_start),'runs',(select coalesce(jsonb_agg(x),'[]') from (select id,status,started_at,tool_calls,input_tokens,output_tokens,cost_microusd from relay_private.agent_runs where workspace_id=w and user_id=auth.uid() order by started_at desc limit 30) x));
 end if;
 select * into r from relay_private.agent_runs where id=(payload->>'id')::uuid and workspace_id=w and user_id=auth.uid() for update;
 if r.id is null or r.status<>'running' or r.capability_hash is distinct from encode(sha256(convert_to(payload->>'secret','UTF8')),'hex') then raise exception 'Run unavailable' using errcode='42501';end if;
 if operation='tool' then
  if r.expires_at<=now() or r.tool_calls>=r.tool_limit then raise exception 'Tool budget exceeded' using errcode='53300';end if;
  update relay_private.agent_runs set tool_calls=tool_calls+1 where id=r.id;
  insert into relay_private.agent_tool_events(run_id,sequence,tool) values(r.id,r.tool_calls+1,left(payload->>'tool',80));return jsonb_build_object('sequence',r.tool_calls+1);
 elsif operation='tool_finish' then
  update relay_private.agent_tool_events set status=case when payload->>'status'='done' then 'done' else 'error' end,resource_ids=array(select value::uuid from jsonb_array_elements_text(coalesce(payload->'resource_ids','[]')) limit 20),duration_ms=greatest(0,(payload->>'duration_ms')::integer) where run_id=r.id and sequence=(payload->>'sequence')::integer;return '{}';
 elsif operation='finish' then
  update relay_private.agent_runs set status=case when payload->>'status'='complete' then 'complete' else 'error' end,completed_at=now(),actual_tokens=greatest(0,coalesce((payload->>'input_tokens')::integer,0)+coalesce((payload->>'output_tokens')::integer,0)),input_tokens=greatest(0,coalesce((payload->>'input_tokens')::integer,0)),output_tokens=greatest(0,coalesce((payload->>'output_tokens')::integer,0)),cost_microusd=greatest(0,coalesce((payload->>'cost_microusd')::bigint,0)) where id=r.id returning * into r;
  -- Conservative reservations are retained after failure/crash; never refund unknown costs.
  if r.status='complete' then update relay_private.agent_usage set tokens_reserved=greatest(0,tokens_reserved-r.reserved_tokens)+r.actual_tokens,tokens_actual=tokens_actual+r.actual_tokens where workspace_id=w and month=date_trunc('month',r.started_at at time zone 'UTC')::date;end if;return '{}';
 else raise exception 'Unknown operation' using errcode='22023';end if;
end $$;
create function public.agent_runtime(w uuid,operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select relay_private.agent_runtime(w,operation,payload)$$;
revoke all on function relay_private.agent_runtime(uuid,text,jsonb),public.agent_runtime(uuid,text,jsonb) from public,anon;
grant execute on function relay_private.agent_runtime(uuid,text,jsonb),public.agent_runtime(uuid,text,jsonb) to authenticated;

create table relay_private.agent_actions(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,conversation_id uuid references public.ai_conversations(id) on delete cascade,run_id uuid references relay_private.agent_runs(id) on delete set null,
 private_context boolean not null default false,access_fingerprint text,source_refs jsonb not null default '[]',action_key text not null check(length(action_key) between 1 and 200),kind text not null check(kind in ('create_record','update_record','create_task','update_task','create_note','update_note','draft_email','create_calendar_event','update_calendar_event','cancel_calendar_event','propose_commitment','update_commitment','create_workflow_draft','update_workflow_draft','add_to_list','remove_from_list')),
 input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=65536),status text not null default 'pending' check(status in ('draft','pending','executing','queued','sending','sent','completed','failed','uncertain','cancelled')),
 result jsonb,requested_at timestamptz not null default now(),approved_at timestamptz,completed_at timestamptz,error_code text,job_id uuid references relay_private.jobs(id) on delete set null,unique(workspace_id,user_id,action_key)
);
create index agent_actions_owner on relay_private.agent_actions(workspace_id,user_id,conversation_id,requested_at desc);
alter table relay_private.agent_actions enable row level security;
revoke all on relay_private.agent_actions from public,anon,authenticated;
-- Reuse the existing durable outbox; workflow rows keep their constraints intact.
alter table relay_private.workflow_outbox alter column execution_id drop not null,alter column step_key drop not null,add column agent_action_id uuid unique references relay_private.agent_actions(id) on delete cascade,add constraint outbox_origin check((execution_id is not null and step_key is not null and agent_action_id is null) or (execution_id is null and step_key is null and agent_action_id is not null));

create function relay_private.agent_action(w uuid,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare a relay_private.agent_actions;external boolean;result jsonb;begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if operation='propose' then
  if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Read only' using errcode='42501';end if;
  if payload ? 'conversation_id' and not exists(select 1 from public.ai_conversations where workspace_id=w and id=(payload->>'conversation_id')::uuid and user_id=auth.uid()) then raise exception 'Forbidden conversation' using errcode='42501';end if;
  if payload ? 'run_id' and not exists(select 1 from relay_private.agent_runs where workspace_id=w and id=(payload->>'run_id')::uuid and user_id=auth.uid() and status='running' and expires_at>now()) then raise exception 'Expired run' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('agent-actions:'||w::text,0));
  select * into a from relay_private.agent_actions where workspace_id=w and user_id=auth.uid() and action_key=payload->>'key';
  if a.id is not null then
   if a.access_fingerprint is distinct from relay_private.agent_access_fingerprint(w) or exists(select 1 from jsonb_array_elements(a.source_refs) dep where not relay_private.agent_source_allowed(w,auth.uid(),dep->>'type',(dep->>'id')::uuid)) then raise exception 'Source access revoked' using errcode='42501';end if;
   if a.input is distinct from payload->'input' or a.kind is distinct from payload->>'kind' then raise exception 'Idempotency conflict' using errcode='40001';end if;
   return to_jsonb(a)-'action_key';
  end if;
  if (select count(*) from relay_private.agent_actions where workspace_id=w and status in ('pending','draft','queued','sending','executing'))>=200 then raise exception 'Action capacity exceeded' using errcode='53300';end if;
  if jsonb_typeof(coalesce(payload->'source_refs','[]'))<>'array' or jsonb_array_length(coalesce(payload->'source_refs','[]'))>400 or exists(select 1 from jsonb_array_elements(coalesce(payload->'source_refs','[]')) dep where not relay_private.agent_source_allowed(w,auth.uid(),dep->>'type',(dep->>'id')::uuid)) then raise exception 'Source inaccessible' using errcode='42501';end if;
  insert into relay_private.agent_actions(workspace_id,user_id,conversation_id,run_id,action_key,kind,input,status,private_context,access_fingerprint,source_refs) values(w,auth.uid(),(payload->>'conversation_id')::uuid,(payload->>'run_id')::uuid,payload->>'key',payload->>'kind',payload->'input',case when payload->>'kind'='draft_email' then 'draft' else 'pending' end,public.agent_sources_private(w,coalesce(payload->'source_refs','[]')),relay_private.agent_access_fingerprint(w),coalesce(payload->'source_refs','[]')) returning * into a;return to_jsonb(a)-'action_key';
 elsif operation='list' then
  return (select coalesce(jsonb_agg(x),'[]') from (select id,kind,input,status,result,requested_at as created_at,error_code,private_context from relay_private.agent_actions where workspace_id=w and user_id=auth.uid() and conversation_id=(payload->>'conversation_id')::uuid and access_fingerprint=relay_private.agent_access_fingerprint(w) and not exists(select 1 from jsonb_array_elements(source_refs) dep where not relay_private.agent_source_allowed(w,auth.uid(),dep->>'type',(dep->>'id')::uuid)) order by requested_at limit 100) x);
 end if;
 select * into a from relay_private.agent_actions where id=(payload->>'id')::uuid and workspace_id=w and user_id=auth.uid() for update;
 if a.id is null then raise exception 'Action unavailable' using errcode='42501';end if;
 if a.access_fingerprint is distinct from relay_private.agent_access_fingerprint(w) then raise exception 'Access changed; prepare a new action' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(a.source_refs) dep where not relay_private.agent_source_allowed(w,auth.uid(),dep->>'type',(dep->>'id')::uuid)) then raise exception 'Source access revoked' using errcode='42501';end if;
 if operation='get' then return to_jsonb(a)-'action_key';end if;
 if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Read only' using errcode='42501';end if;
 if operation='cancel' then
  if a.status not in ('draft','pending','queued') then raise exception 'Action already attempted' using errcode='40001';end if;
  update relay_private.agent_actions set status='cancelled',completed_at=now(),input='{}' where id=a.id returning * into a;
  update relay_private.jobs set status='dead',payload='{}',completed_at=now(),last_error='action_cancelled',lease=null,leased_until=null where id=a.job_id and status in ('queued','running');return to_jsonb(a)-'action_key';
 elsif operation='claim' then
  if a.status in ('completed','queued','sending','sent','uncertain','failed','cancelled') then return to_jsonb(a)-'action_key';end if;
  if a.status not in ('pending','draft') or a.requested_at<now()-interval '24 hours' then raise exception 'Action expired' using errcode='40001';end if;
  external:=a.kind in ('draft_email','create_calendar_event','update_calendar_event','cancel_calendar_event');
  if external then
   perform pg_advisory_xact_lock(hashtextextended('jobs:'||w::text,0));
   if (select count(*) from relay_private.jobs where workspace_id=w and status in ('queued','running'))>=200 then raise exception 'Queue capacity exceeded' using errcode='53300';end if;
   update relay_private.agent_actions set status='queued',approved_at=now() where id=a.id;
   insert into relay_private.workflow_outbox(workspace_id,agent_action_id,action,variables) values(w,a.id,jsonb_build_object('type',case when a.kind='draft_email' then 'email' else 'calendar' end),'{}') on conflict do nothing;
   update relay_private.agent_actions set job_id=relay_private.put_job(w,auth.uid(),'workflow_run','agent:'||a.id,jsonb_build_object('agent_action_id',a.id)) where id=a.id returning * into a;
  else update relay_private.agent_actions set status='executing',approved_at=now() where id=a.id returning * into a;end if;
  return to_jsonb(a)-'action_key';
 elsif operation='finish_crm' then
  if a.status<>'executing' or a.kind in ('draft_email','create_calendar_event','update_calendar_event','cancel_calendar_event') then raise exception 'Invalid completion' using errcode='42501';end if;
  update relay_private.agent_actions set status='completed',result=payload->'result',completed_at=now() where id=a.id returning * into a;return to_jsonb(a)-'action_key';
 else raise exception 'Unknown operation' using errcode='22023';end if;
end $$;
create function public.agent_action(w uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$begin if operation not in ('propose','get','list','cancel') then raise exception 'Internal action operation' using errcode='42501';end if;return relay_private.agent_action(w,operation,payload);end $$;
revoke all on function relay_private.agent_action(uuid,text,jsonb),public.agent_action(uuid,text,jsonb) from public,anon;
grant execute on function relay_private.agent_action(uuid,text,jsonb),public.agent_action(uuid,text,jsonb) to authenticated;

-- CRM execution is SECURITY INVOKER: normal user RLS applies even after approval.
-- Claim, mutation and result commit share ONE transaction, so retries cannot duplicate.
create function public.agent_apply(w uuid,action_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;v jsonb;patch jsonb;rec public.records;task public.tasks;note public.notes;com public.commitments;flow public.workflows;entity uuid;result jsonb;begin
 a:=relay_private.agent_action(w,'claim',jsonb_build_object('id',action_id));
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
revoke all on function public.agent_apply(uuid,uuid) from public,anon;
grant execute on function public.agent_apply(uuid,uuid) to authenticated;

-- Service-only operations are fenced by the existing job lease. 'sending' is never
-- retried after process death. The same workflow_io_usage counter/lock is reused.
create function public.agent_effect_worker(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_variable
declare dep jsonb;dep_ok boolean;a relay_private.agent_actions;j relay_private.jobs;io relay_private.workflow_outbox;i public.integrations;comm public.communications;k text;quota integer;next_state text;result jsonb;begin
 select * into j from relay_private.jobs where id=(payload->>'job_id')::uuid for update;
 select * into a from relay_private.agent_actions where id=(j.payload->>'agent_action_id')::uuid for update;
 select * into io from relay_private.workflow_outbox where agent_action_id=a.id for update;
 if a.id is null or io.id is null or j.status<>'running' or j.lease is distinct from (payload->>'lease')::uuid or j.leased_until<=now() or a.job_id<>j.id or j.workspace_id<>a.workspace_id or j.user_id<>a.user_id then raise exception 'Invalid agent lease' using errcode='40001';end if;
 if operation='load' then
  if a.status in ('queued','sending') and io.status='sending' then
   update relay_private.workflow_outbox set status='unknown',error_code='delivery_uncertain',completed_at=now() where id=io.id;
   update relay_private.agent_actions set status='uncertain',error_code='delivery_uncertain',completed_at=now() where id=a.id returning * into a;
  end if;
  return to_jsonb(a);
 elsif operation='prepare' then
  if a.status<>'queued' or io.status<>'pending' then raise exception 'Action already attempted' using errcode='40001';end if;
  if not exists(select 1 from public.memberships where workspace_id=a.workspace_id and user_id=a.user_id and role in ('owner','admin','member')) then raise exception 'Access revoked' using errcode='42501';end if;
  if a.access_fingerprint is distinct from relay_private.agent_access_fingerprint_for(a.workspace_id,a.user_id) then raise exception 'Permissions changed' using errcode='42501';end if;
  for dep in select value from jsonb_array_elements(a.source_refs) loop
   dep_ok:=relay_private.agent_source_allowed(a.workspace_id,a.user_id,dep->>'type',(dep->>'id')::uuid);
   if not dep_ok then raise exception 'Source revoked' using errcode='42501';end if;
  end loop;
  if a.input ? 'record_id' and not exists(select 1 from public.records where workspace_id=a.workspace_id and id=(a.input->>'record_id')::uuid and not archived) then raise exception 'Record revoked' using errcode='42501';end if;
  if a.kind in ('update_calendar_event','cancel_calendar_event') or a.input ? 'reply_to_id' then
   select * into comm from public.communications where workspace_id=a.workspace_id and user_id=a.user_id and id=coalesce((a.input->>'reply_to_id')::uuid,(a.input->>'id')::uuid);
   if comm.id is null then raise exception 'Source revoked' using errcode='42501';end if;
   select * into i from public.integrations where id=comm.integration_id and workspace_id=a.workspace_id and user_id=a.user_id and status='connected';
  else select * into i from public.integrations where workspace_id=a.workspace_id and user_id=a.user_id and provider=a.input->>'provider' and status='connected';end if;
  if i.id is null then raise exception 'Account revoked' using errcode='42501';end if;
  if a.kind='draft_email' then
   if i.provider not in ('gmail','outlook') or length(a.input->>'to')>320 or a.input->>'to'~E'[\\r\\n]' or length(a.input->>'subject') not between 1 and 300 or a.input->>'subject'~E'[\\r\\n]' or length(a.input->>'body') not between 1 and 20000 then raise exception 'Invalid email' using errcode='22023';end if;
   if a.access_fingerprint is distinct from relay_private.agent_access_fingerprint_for(a.workspace_id,a.user_id) then raise exception 'Permissions changed' using errcode='42501';end if;
  for dep in select value from jsonb_array_elements(a.source_refs) loop
   dep_ok:=relay_private.agent_source_allowed(a.workspace_id,a.user_id,dep->>'type',(dep->>'id')::uuid);
   if not dep_ok then raise exception 'Source revoked' using errcode='42501';end if;
  end loop;
  if a.input ? 'record_id' and not exists(select 1 from public.records where workspace_id=a.workspace_id and id=(a.input->>'record_id')::uuid and lower(email)=lower(a.input->>'to')) then raise exception 'Recipient changed' using errcode='40001';end if;
   if exists(select 1 from public.suppressions where workspace_id=a.workspace_id and lower(email)=lower(a.input->>'to')) then raise exception 'Recipient suppressed' using errcode='42501';end if;
  elsif i.provider not in ('google-calendar','outlook-calendar') then raise exception 'Invalid calendar account' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('workflow-io:'||a.workspace_id,0));k:=case when a.kind='draft_email' then 'email' else 'calendar' end;quota:=case when k='email' then 200 else 100 end;
  if coalesce((select attempts from relay_private.workflow_io_usage where workspace_id=a.workspace_id and day=(now() at time zone 'UTC')::date and kind=k),0)>=quota then raise exception 'External daily quota exceeded' using errcode='53300';end if;
  insert into relay_private.workflow_io_usage(workspace_id,day,kind,attempts) values(a.workspace_id,(now() at time zone 'UTC')::date,k,1) on conflict(workspace_id,day,kind) do update set attempts=workflow_io_usage.attempts+1;
  update relay_private.workflow_outbox set status='sending',attempted_at=now() where id=io.id;
  update relay_private.agent_actions set status='sending' where id=a.id;
  return jsonb_build_object('integration_id',i.id,'provider',i.provider,'provider_id',comm.provider_id,'thread_id',comm.thread_id,'internet_message_id',comm.internet_message_id);
 elsif operation='finish' then
  next_state:=payload->>'state';result:=coalesce(payload->'result','{}');
  if next_state not in ('sent','completed','failed','uncertain') or octet_length(result::text)>2000 or a.status not in ('queued','sending') then raise exception 'Invalid outcome' using errcode='22023';end if;
  if next_state in ('sent','completed') and io.status<>'sending' then raise exception 'Unattempted action' using errcode='42501';end if;
  if next_state='sent' and (a.kind<>'draft_email' or nullif(result->>'provider_id','') is null) then raise exception 'Unconfirmed email' using errcode='22023';end if;
  update relay_private.workflow_outbox set status=case next_state when 'uncertain' then 'unknown' when 'failed' then 'failed' else 'completed' end,result=result,error_code=left(payload->>'code',100),completed_at=now() where id=io.id;
  update relay_private.agent_actions set status=next_state,result=result,error_code=left(payload->>'code',100),completed_at=now() where id=a.id;
  if next_state in ('sent','completed') then
   select * into i from public.integrations where workspace_id=a.workspace_id and user_id=a.user_id and provider=a.input->>'provider';
   if a.kind in ('update_calendar_event','cancel_calendar_event') then
    select * into comm from public.communications where workspace_id=a.workspace_id and user_id=a.user_id and id=(a.input->>'id')::uuid;
    if a.kind='cancel_calendar_event' then delete from public.communications where id=comm.id;
    else update public.communications set subject=a.input->>'title',body=coalesce(a.input->>'body',''),starts_at=(a.input->>'starts_at')::timestamptz,ends_at=(a.input->>'ends_at')::timestamptz where id=comm.id;end if;
   elsif i.id is not null then
    insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,recipients,body,record_id,starts_at,ends_at,received_at,direction,content_complete) values(a.workspace_id,a.user_id,i.id,result->>'provider_id',case when a.kind='draft_email' then 'email' else 'calendar' end,coalesce(a.input->>'subject',a.input->>'title'),i.email,case when a.kind='draft_email' then array[a.input->>'to'] else '{}' end,coalesce(a.input->>'body',''),(a.input->>'record_id')::uuid,(a.input->>'starts_at')::timestamptz,(a.input->>'ends_at')::timestamptz,now(),'outbound',true) on conflict(integration_id,kind,provider_id) do nothing;
   end if;
  end if;
  return jsonb_build_object('id',a.id,'status',next_state);
 else raise exception 'Unknown operation' using errcode='22023';end if;
end $$;
revoke all on function public.agent_effect_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_effect_worker(text,jsonb) to service_role;

-- Deleting a conversation deletes its unattempted actions; attempted outbox rows
-- are retained until the worker settles. Privacy retention is bounded explicitly.
create function relay_private.agent_conversation_delete() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.workspaces where id=old.workspace_id) then return old;end if;
 update relay_private.jobs set status='dead',payload='{}',lease=null,leased_until=null,completed_at=now(),last_error='conversation_deleted' where id in (select job_id from relay_private.agent_actions where conversation_id=old.id and status in ('draft','pending','queued')) and status in ('queued','running');
 if exists(select 1 from relay_private.agent_actions where conversation_id=old.id and status='sending') then raise exception 'An action is sending; wait for its status before deletion.' using errcode='40001';end if;
 return old;end $$;
revoke all on function relay_private.agent_conversation_delete() from public,anon,authenticated;
create trigger agent_conversation_delete before delete on public.ai_conversations for each row execute function relay_private.agent_conversation_delete();

create function relay_private.agent_access_fingerprint(w uuid) returns text language sql stable security definer set search_path='' as $$
 select md5(coalesce((select m.user_id::text||':'||m.role||':'||m.version::text||':'||m.reader_scope from public.memberships m where m.workspace_id=w and m.user_id=auth.uid()),'revoked')||coalesce((select string_agg(a.record_id::text,',' order by a.record_id) from relay_private.reader_record_access a where a.workspace_id=w and a.user_id=auth.uid()),''))
$$;
revoke all on function relay_private.agent_access_fingerprint(uuid) from public,anon;
grant execute on function relay_private.agent_access_fingerprint(uuid) to authenticated;
create function public.agent_access_fingerprint(w uuid) returns text language sql stable security invoker set search_path='' as $$select relay_private.agent_access_fingerprint(w)$$;
revoke all on function public.agent_access_fingerprint(uuid) from public,anon;
grant execute on function public.agent_access_fingerprint(uuid) to authenticated;
create function public.agent_visible_sources(w uuid,refs jsonb) returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare kind text;tab text;label text;rec text;extra text;ids uuid[];rows jsonb;result jsonb:='[]';begin
 if not relay_private.has_role(w) or jsonb_typeof(refs)<>'array' or jsonb_array_length(refs)>600 then raise exception 'Forbidden' using errcode='42501';end if;
 for kind,tab,label,rec,extra in select * from (values ('record','records','display_name','id','object_id'),('note','notes','title','record_id','null::uuid'),('meeting','meetings','title','record_id','null::uuid'),('email','communications','subject','record_id','null::uuid'),('calendar','communications','subject','record_id','null::uuid'),('task','tasks','title','record_id','null::uuid'),('commitment','commitments','title','record_id','null::uuid'),('document','documents','name','record_id','null::uuid'),('conflict','conflicts','title','record_id','null::uuid'),('list','lists','name','null::uuid','object_id'),('pipeline','pipelines','name','null::uuid','null::uuid'),('workflow','workflows','name','null::uuid','null::uuid')) v loop
  ids:=array(select (x->>'id')::uuid from jsonb_array_elements(refs) x where x->>'type'=kind);
  if cardinality(ids)=0 then continue;end if;
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''type'',%L,''label'',%s,''record_id'',%s,''object_id'',%s)),''[]'') from public.%I where workspace_id=$1 and id=any($2)%s',kind,label,rec,extra,tab,case when kind in ('email','calendar') then format(' and kind=%L',kind) else '' end) into rows using w,ids;
  result:=result||rows;
 end loop;return result;
end $$;
revoke all on function public.agent_visible_sources(uuid,jsonb) from public,anon;
grant execute on function public.agent_visible_sources(uuid,jsonb) to authenticated;

-- Import bounded message bodies, preserving already hydrated content.
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
  insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,recipients,body,starts_at,received_at,sync_generation,is_reply,thread_id,sender_email,ends_at,direction,content_complete,internet_message_id,attachments)
  select w,auth.uid(),i.id,x.provider_id,x.kind,x.subject,x.sender,x.recipients,x.body,x.starts_at,x.received_at,s.generation,coalesce(x.is_reply,false),x.thread_id,x.sender_email,x.ends_at,coalesce(x.direction,'inbound'),coalesce(x.content_complete,false),x.internet_message_id,coalesce(x.attachments,'[]')
  from jsonb_to_recordset(payload->'items') as x(provider_id text,kind text,subject text,sender text,recipients text[],body text,starts_at timestamptz,received_at timestamptz,is_reply boolean,thread_id text,sender_email text,ends_at timestamptz,direction text,content_complete boolean,internet_message_id text,attachments jsonb)
  on conflict(integration_id,kind,provider_id) do update set subject=excluded.subject,sender=excluded.sender,recipients=excluded.recipients,body=case when communications.content_complete and not excluded.content_complete then communications.body else excluded.body end,starts_at=excluded.starts_at,received_at=excluded.received_at,sync_generation=excluded.sync_generation,is_reply=excluded.is_reply,thread_id=excluded.thread_id,sender_email=excluded.sender_email,ends_at=excluded.ends_at,direction=excluded.direction,content_complete=communications.content_complete or excluded.content_complete,internet_message_id=coalesce(excluded.internet_message_id,communications.internet_message_id),attachments=case when excluded.attachments='[]' then communications.attachments else excluded.attachments end;
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

create function relay_private.agent_access_fingerprint_for(w uuid,u uuid) returns text language sql stable security definer set search_path='' as $$
 select md5(coalesce((select m.user_id::text||':'||m.role||':'||m.version::text||':'||m.reader_scope from public.memberships m where m.workspace_id=w and m.user_id=u),'revoked')||coalesce((select string_agg(a.record_id::text,',' order by a.record_id) from relay_private.reader_record_access a where a.workspace_id=w and a.user_id=u),''))
$$;
revoke all on function relay_private.agent_access_fingerprint_for(uuid,uuid) from public,anon,authenticated;
create function relay_private.agent_source_allowed(w uuid,u uuid,kind text,source uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare tab text;predicate text:='workspace_id=$1 and id=$2';yes boolean;begin
 if not exists(select 1 from public.memberships where workspace_id=w and user_id=u and role in ('owner','admin','member')) then return false;end if;
 case kind when 'record' then tab:='records';predicate:=predicate||' and not archived';when 'note' then tab:='notes';predicate:=predicate||' and (not private or author_id=$3)';when 'email','calendar' then tab:='communications';predicate:=predicate||' and user_id=$3';when 'meeting' then tab:='meetings';predicate:=predicate||' and (not private or author_id=$3)';when 'task' then tab:='tasks';when 'commitment' then tab:='commitments';predicate:=predicate||' and (not private or author_id=$3)';when 'document' then tab:='documents';when 'conflict' then tab:='conflicts';predicate:=predicate||' and (not private or author_id=$3)';when 'list' then tab:='lists';predicate:=predicate||' and (visibility=''workspace'' or creator_id=$3)';when 'pipeline' then tab:='pipelines';when 'workflow' then tab:='workflows';else return false;end case;
 execute format('select exists(select 1 from public.%I where %s)',tab,predicate) into yes using w,source,u;return yes;
end $$;
revoke all on function relay_private.agent_source_allowed(uuid,uuid,text,uuid) from public,anon,authenticated;
commit;
