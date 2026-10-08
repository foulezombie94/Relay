begin;
alter table public.report_dashboards
 add column description text not null default '' check(length(description)<=1000),
 add column settings jsonb not null default '{"period":"all","compare":true,"refresh_seconds":0}' check(jsonb_typeof(settings)='object' and octet_length(settings::text)<=4000),
 add constraint report_dashboard_workspace_identity unique(workspace_id,id);
alter table public.report_dashboards drop constraint report_dashboards_config_check,
 add constraint report_dashboards_config_check check(jsonb_typeof(config)='array' and jsonb_array_length(config) between 1 and 24 and octet_length(config::text)<40000);

create function relay_private.dashboard_owner_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.creator_id is distinct from old.creator_id then raise exception 'Dashboard owner is immutable' using errcode='42501';end if;
 return new;
end $$;
revoke all on function relay_private.dashboard_owner_immutable() from public,anon,authenticated;
create trigger dashboard_owner_immutable before update on public.report_dashboards for each row execute function relay_private.dashboard_owner_immutable();

create table public.dashboard_preferences(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 dashboard_id uuid not null, favorite boolean not null default false, home boolean not null default false,
 primary key(workspace_id,user_id,dashboard_id),
 foreign key(workspace_id,dashboard_id) references public.report_dashboards(workspace_id,id) on delete cascade
);
create unique index dashboard_one_home on public.dashboard_preferences(workspace_id,user_id) where home;
alter table public.dashboard_preferences enable row level security;
grant select,insert,update,delete on public.dashboard_preferences to authenticated;
create policy dashboard_prefs_read on public.dashboard_preferences for select to authenticated
 using(user_id=auth.uid() and relay_private.has_role(workspace_id) and exists(select 1 from public.report_dashboards d where d.workspace_id=dashboard_preferences.workspace_id and d.id=dashboard_id));
create policy dashboard_prefs_write on public.dashboard_preferences for all to authenticated
 using(user_id=auth.uid() and relay_private.has_role(workspace_id) and exists(select 1 from public.report_dashboards d where d.workspace_id=dashboard_preferences.workspace_id and d.id=dashboard_id))
 with check(user_id=auth.uid() and relay_private.has_role(workspace_id) and exists(select 1 from public.report_dashboards d where d.workspace_id=dashboard_preferences.workspace_id and d.id=dashboard_id));

create function public.dashboard_preference(w uuid,d uuid,operation text,enabled boolean) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not relay_private.has_role(w) or not exists(select 1 from public.report_dashboards where workspace_id=w and id=d) then raise exception 'Forbidden' using errcode='42501';end if;
 if operation not in ('favorite','home') then raise exception 'Invalid preference' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||auth.uid()::text,2718));
 if operation='home' then
  if enabled then update public.dashboard_preferences set home=false where workspace_id=w and user_id=auth.uid() and home;end if;
  insert into public.dashboard_preferences(workspace_id,user_id,dashboard_id,home) values(w,auth.uid(),d,enabled)
  on conflict(workspace_id,user_id,dashboard_id) do update set home=excluded.home;
 else
  insert into public.dashboard_preferences(workspace_id,user_id,dashboard_id,favorite) values(w,auth.uid(),d,enabled)
  on conflict(workspace_id,user_id,dashboard_id) do update set favorite=excluded.favorite;
 end if;
end $$;
revoke all on function public.dashboard_preference(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.dashboard_preference(uuid,uuid,text,boolean) to authenticated;

create index dashboard_record_history on public.audit_events(workspace_id,entity_id,created_at desc) where entity='records';

-- All source reads are invoker reads: workspace predicates AND current RLS.
-- This normalized relation stays in Postgres; only bounded aggregates/details
-- are exposed by public RPCs. Never use a service client for dashboard reads.
create function relay_private.dashboard_source(w uuid,kind text,filters jsonb,date_field text,need_history boolean default false)
returns table(id uuid,record_id uuid,title text,owner_id uuid,pipeline_id uuid,object_id uuid,stage text,status text,provider text,direction text,
 currency text,amount numeric,probability numeric,occurred_at timestamptz,created_at timestamptz,stage_at timestamptz,closed_at timestamptz,visited text[],history_missing boolean)
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_variable
declare base text;pred text:='true';date_expr text;allowed text[]:=array['since','until','empty'];k text;
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if kind not in ('record','task','commitment','email','meeting') or date_field not in ('created','occurred','due','closed') then raise exception 'Invalid source' using errcode='22023';end if;
 if (date_field='closed' and kind<>'record') or (date_field='due' and kind not in ('task','commitment')) then raise exception 'Invalid date field' using errcode='22023';end if;
 case kind
 when 'record' then
  allowed:=allowed||array['object_id','pipeline_id','owner_id','stage','lifecycle','currency'];
  base:=$source$
   select r.id,r.id as record_id,r.display_name as title,r.owner_id,r.pipeline_id,r.object_id,r.stage,null::text as status,null::text as provider,null::text as direction,
    r.currency,r.amount,coalesce(r.probability,(p.probabilities->>r.stage)::numeric,case r.stage when 'Nouveau' then 10 when 'Qualification' then 25 when 'Proposition' then 50 when 'Négociation' then 75 when 'Gagné' then 100 else 0 end) as probability,
    r.created_at,r.created_at as event_at,null::timestamptz as due_date,
    h.stage_at,case when r.stage in ('Gagné','Perdu') then h.stage_at end as closed_at,coalesce(h.visited,'{}'::text[]) as visited
   from public.records r left join public.pipelines p on p.workspace_id=r.workspace_id and p.id=r.pipeline_id
   left join lateral(
    select max(a.created_at) filter(where a.after_data->>'stage'=r.stage and (a.before_data->>'stage' is distinct from a.after_data->>'stage' or a.before_data->>'pipeline_id' is distinct from a.after_data->>'pipeline_id')) as stage_at,
     array_agg(distinct a.after_data->>'stage') filter(where a.after_data->>'stage' in ('Nouveau','Qualification','Proposition','Négociation','Gagné','Perdu')) as visited
    from public.audit_events a where $3 and a.workspace_id=$1 and a.entity='records' and a.entity_id=r.id
     and a.after_data->>'pipeline_id' is not distinct from r.pipeline_id::text
   ) h on true
   where r.workspace_id=$1 and not r.archived
  $source$;
 when 'task' then
  allowed:=allowed||array['owner_id','status','overdue'];
  base:='select id,record_id,title,owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,null::text provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,created_at event_at,due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.tasks where workspace_id=$1';
 when 'commitment' then
  allowed:=allowed||array['owner_id','status','overdue'];
  base:='select id,record_id,title,owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,null::text provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,created_at event_at,due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.commitments where workspace_id=$1';
 when 'email' then
  base:='select c.id,c.record_id,c.subject title,null::uuid owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,null::text status,i.provider,c.direction,null::text currency,0::numeric amount,0::numeric probability,c.created_at,c.received_at event_at,null::timestamptz due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.communications c join public.integrations i on i.workspace_id=c.workspace_id and i.id=c.integration_id where c.workspace_id=$1 and c.kind=''email''';
 when 'meeting' then
  base:='select id,record_id,title,null::uuid owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,coalesce(starts_at,created_at) event_at,null::timestamptz due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.meetings where workspace_id=$1';
 end case;
 if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>8000 or exists(select 1 from jsonb_object_keys(filters) a where not a=any(allowed)) then raise exception 'Unsupported dashboard filter' using errcode='22023';end if;
 date_expr:=case date_field when 'created' then 'x.created_at' when 'occurred' then 'x.event_at' when 'due' then 'x.due_date' when 'closed' then 'x.closed_at' end;
 if (filters->>'empty')::boolean is true then pred:='false';end if;
 foreach k in array array['object_id','owner_id','pipeline_id'] loop
  if filters ? k then pred:=pred||format(' and x.%I=($2->>%L)::uuid',k,k);end if;
 end loop;
 foreach k in array array['stage','status','currency'] loop
  if filters ? k then pred:=pred||format(' and x.%I=$2->>%L',k,k);end if;
 end loop;
 if filters ? 'lifecycle' then
  case filters->>'lifecycle' when 'all' then null;when 'open' then pred:=pred||' and x.stage not in (''Gagné'',''Perdu'')';when 'won' then pred:=pred||' and x.stage=''Gagné''';when 'lost' then pred:=pred||' and x.stage=''Perdu''';else raise exception 'Invalid lifecycle' using errcode='22023';end case;
 end if;
 if (filters->>'overdue')::boolean is true then pred:=pred||' and x.due_date<now() and x.status not in (''done'',''cancelled'')';end if;
 -- Keep undated closed records only to report the missing evidence. Public
 -- aggregate/detail RPCs exclude them from every value and list.
 if filters ? 'since' then pred:=pred||format(' and (%s>=($2->>''since'')::timestamptz%s)',date_expr,case when date_field='closed' then ' or (x.closed_at is null and x.stage in (''Gagné'',''Perdu''))' else '' end);end if;
 if filters ? 'until' then pred:=pred||format(' and (%s<($2->>''until'')::timestamptz%s)',date_expr,case when date_field='closed' then ' or (x.closed_at is null and x.stage in (''Gagné'',''Perdu''))' else '' end);end if;
 return query execute format('select x.id,x.record_id,x.title,x.owner_id,x.pipeline_id,x.object_id,x.stage,x.status,x.provider,x.direction,x.currency,x.amount,x.probability,%s,x.created_at,x.stage_at,x.closed_at,x.visited,($3 and (case when %L=''closed'' then x.stage in (''Gagné'',''Perdu'') and x.closed_at is null else cardinality(x.visited)=0 or x.stage_at is null end)) from (%s) x where %s',date_expr,date_field,base,pred)
  using w,filters,need_history;
end $$;
revoke all on function relay_private.dashboard_source(uuid,text,jsonb,text,boolean) from public,anon;
grant execute on function relay_private.dashboard_source(uuid,text,jsonb,text,boolean) to authenticated;

create function public.dashboard_aggregate(w uuid,kind text,filters jsonb default '{}',group_by text default 'none',metric text default 'count',date_field text default 'created')
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare dim text;money boolean:=metric in ('amount','average_amount','weighted_amount');measure text;sample text;eligible text:='true';result jsonb;currency_expr text;labels text;
begin
 if metric not in ('count','amount','average_amount','weighted_amount','win_rate','completion_rate','avg_stage_days','avg_cycle_days','stage_reached') then raise exception 'Invalid measure' using errcode='22023';end if;
 if (metric in ('amount','average_amount','weighted_amount','win_rate','avg_stage_days','avg_cycle_days','stage_reached') and kind<>'record') or (metric='completion_rate' and kind not in ('task','commitment')) then raise exception 'Invalid source measure' using errcode='22023';end if;
 dim:=case group_by when 'none' then '''all''::text'
  when 'day' then 'to_char(occurred_at at time zone ''UTC'',''YYYY-MM-DD'')'
  when 'week' then 'to_char(date_trunc(''week'',occurred_at at time zone ''UTC''),''YYYY-MM-DD'')'
  when 'month' then 'to_char(occurred_at at time zone ''UTC'',''YYYY-MM'')'
  when 'stage' then case when kind='record' then 'stage' end
  when 'pipeline' then case when kind='record' then 'pipeline_id::text' end
  when 'owner' then case when kind in ('record','task','commitment') then 'owner_id::text' end
  when 'status' then case when kind in ('task','commitment') then 'status' end
  when 'provider' then case when kind in ('email','meeting') then 'provider' end
  when 'direction' then case when kind='email' then 'direction' end end;
 if dim is null or (metric='stage_reached' and group_by<>'stage') then raise exception 'Invalid dimension' using errcode='22023';end if;
 if date_field='closed' then eligible:=eligible||' and occurred_at is not null';end if;
 if metric='weighted_amount' then eligible:=eligible||' and stage not in (''Gagné'',''Perdu'')';end if;
 if metric='avg_cycle_days' then eligible:=eligible||' and stage=''Gagné''';end if;
 measure:=case metric when 'count' then 'count(*)::text'
  when 'amount' then 'coalesce(sum(amount),0)::text' when 'average_amount' then 'avg(amount)::text'
  when 'weighted_amount' then 'coalesce(sum(amount*probability/100),0)::text'
  when 'win_rate' then '(100.0*count(*) filter(where stage=''Gagné'')/nullif(count(*) filter(where stage in (''Gagné'',''Perdu'')),0))::text'
  when 'completion_rate' then '(100.0*count(*) filter(where status=''done'')/nullif(count(*) filter(where status<>''cancelled''),0))::text'
  when 'avg_stage_days' then 'avg(extract(epoch from now()-stage_at)/86400.0) filter(where stage_at<=now())::text'
  when 'avg_cycle_days' then 'avg(extract(epoch from closed_at-created_at)/86400.0) filter(where closed_at>=created_at)::text'
  when 'stage_reached' then 'count(*) filter(where cardinality(visited)>0)::text' end;
 sample:=case metric when 'win_rate' then 'count(*) filter(where stage in (''Gagné'',''Perdu''))'
  when 'completion_rate' then 'count(*) filter(where status<>''cancelled'')'
  when 'avg_stage_days' then 'count(*) filter(where stage_at<=now())'
  when 'avg_cycle_days' then 'count(*) filter(where closed_at>=created_at)'
  when 'stage_reached' then 'count(*) filter(where cardinality(visited)>0)' else 'count(*)' end;
 currency_expr:=case when money then 'currency' else 'null::text' end;
 labels:=case group_by when 'owner' then 'coalesce((select m.display_name from public.memberships m where m.workspace_id=$1 and m.user_id=g.dimension::uuid),''Non attribué'')'
  when 'pipeline' then 'coalesce((select p.name from public.pipelines p where p.workspace_id=$1 and p.id=g.dimension::uuid),''Sans pipeline'')'
  when 'none' then '''Total''::text'
  when 'status' then 'case g.dimension when ''open'' then ''À faire'' when ''in_progress'' then ''En cours'' when ''done'' then ''Terminé'' when ''cancelled'' then ''Annulé'' when ''proposed'' then ''Proposé'' when ''confirmed'' then ''Confirmé'' when ''postponed'' then ''Reporté'' else coalesce(g.dimension,''Non renseigné'') end'
  when 'direction' then 'case g.dimension when ''inbound'' then ''Reçus'' when ''outbound'' then ''Envoyés'' else ''Non renseigné'' end'
  else 'coalesce(g.dimension,''Non renseigné'')' end;
 execute format($query$
  with source as materialized(select * from relay_private.dashboard_source($1,$2,$3,$4,$5)),
  valid as materialized(select * from source where %s),
  grouped as (
   %s
  ),
  limited as(select * from grouped order by
    case when $6='stage' then array_position(array['Nouveau','Qualification','Proposition','Négociation','Gagné','Perdu'],dimension) end,
    dimension nulls last,currency nulls last limit 200),
  labeled as(select g.dimension,%s as label,g.currency,g.count,g.value,g.sample_size from limited g),
  totals as(select 'all'::text dimension,'Total'::text label,%s as currency,count(*) as count,%s as value,%s as sample_size from valid %s)
  select jsonb_build_object('data',coalesce((select jsonb_agg(labeled) from labeled),'[]'::jsonb),
   'totals',coalesce((select jsonb_agg(totals) from totals),'[]'::jsonb),
   'total',(select count(*) from valid),'partial',(select count(*)>200 from grouped),
   'missing_history',(select count(*) from source where history_missing),
   'coverage',case when $2 in ('email','meeting') then 'Éléments importés et autorisés uniquement ; la synchronisation peut être incomplète.'
    when $7='stage_reached' then 'Passages enregistrés dans le pipeline actuel, par fiche distincte. Les étapes sautées et les historiques absents ne sont pas inventés.'
    when $7 in ('avg_stage_days','avg_cycle_days') or $4='closed' then 'Dates observées dans l’audit ; les historiques absents sont exclus des valeurs. Les montants sont les valeurs actuelles.'
    else 'Agrégation exacte des données actuellement autorisées.' end)
 $query$,eligible,
 case when metric='stage_reached' then 'select v.stage_name dimension,null::text currency,count(distinct id) as count,count(distinct id)::text value,count(distinct id) sample_size from valid cross join lateral unnest(visited) v(stage_name) group by v.stage_name'
 else format('select %s dimension,%s currency,count(*) as count,%s as value,%s as sample_size from valid group by %s%s',dim,currency_expr,measure,sample,dim,case when money then ',currency' else '' end) end,
 labels,currency_expr,measure,sample,case when money then 'group by currency' else '' end)
 into result using w,kind,filters,date_field,metric in ('avg_stage_days','avg_cycle_days','stage_reached') or date_field='closed',group_by,metric;
 return result;
end $$;
revoke all on function public.dashboard_aggregate(uuid,text,jsonb,text,text,text) from public,anon;
grant execute on function public.dashboard_aggregate(uuid,text,jsonb,text,text,text) to authenticated;

create function public.dashboard_details(w uuid,kind text,filters jsonb default '{}',group_by text default 'none',metric text default 'count',date_field text default 'created',dimension text default null,currency_filter text default null,page_cursor uuid default null)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
#variable_conflict use_variable
declare dim text;pred text:='true';items jsonb;total bigint;sql text;
begin
 -- Reuse aggregate validation before constructing the bounded details query.
 if length(coalesce(dimension,''))>100 or (currency_filter is not null and currency_filter !~ '^[A-Z]{3}$') then raise exception 'Invalid detail scope' using errcode='22023';end if;
 if metric not in ('count','amount','average_amount','weighted_amount','win_rate','completion_rate','avg_stage_days','avg_cycle_days','stage_reached') or
 (kind<>'record' and metric not in ('count','completion_rate')) or (metric='completion_rate' and kind not in ('task','commitment')) then raise exception 'Invalid measure' using errcode='22023';end if;
 dim:=case group_by when 'none' then '''all''::text' when 'day' then 'to_char(occurred_at at time zone ''UTC'',''YYYY-MM-DD'')'
 when 'week' then 'to_char(date_trunc(''week'',occurred_at at time zone ''UTC''),''YYYY-MM-DD'')'
 when 'month' then 'to_char(occurred_at at time zone ''UTC'',''YYYY-MM'')'
 when 'stage' then case when kind='record' then 'stage' end
 when 'pipeline' then case when kind='record' then 'pipeline_id::text' end
 when 'owner' then case when kind in ('record','task','commitment') then 'owner_id::text' end
 when 'status' then case when kind in ('task','commitment') then 'status' end
 when 'provider' then case when kind in ('email','meeting') then 'provider' end
 when 'direction' then case when kind='email' then 'direction' end end;
 if dim is null or (metric='stage_reached' and group_by<>'stage') then raise exception 'Invalid dimension' using errcode='22023';end if;
 if metric='stage_reached' then pred:=pred||' and $6=any(visited)';
 elsif group_by<>'none' then pred:=pred||format(' and (%s is not distinct from $6)',dim);end if;
 if date_field='closed' then pred:=pred||' and occurred_at is not null';end if;
 if currency_filter is not null then pred:=pred||' and currency=$7';end if;
 if metric='weighted_amount' then pred:=pred||' and stage not in (''Gagné'',''Perdu'')';end if;
 if metric='win_rate' then pred:=pred||' and stage in (''Gagné'',''Perdu'')';end if;
 if metric='completion_rate' then pred:=pred||' and status<>''cancelled''';end if;
 if metric='avg_stage_days' then pred:=pred||' and stage_at<=now()';end if;
 if metric='avg_cycle_days' then pred:=pred||' and stage=''Gagné'' and closed_at>=created_at';end if;
 sql:='select * from relay_private.dashboard_source($1,$2,$3,$4,$5) where '||pred;
 execute 'select count(*) from ('||sql||') x' into total using w,kind,filters,date_field,metric in ('avg_stage_days','avg_cycle_days','stage_reached') or date_field='closed',dimension,currency_filter;
 if page_cursor is not null then sql:=sql||' and id>$8';end if;
 execute 'select coalesce(jsonb_agg(x),''[]''::jsonb) from (select id,record_id,left(title,300) title,stage,status,occurred_at,currency,amount::text as amount from ('||sql||') scoped order by id limit 50) x'
  into items using w,kind,filters,date_field,metric in ('avg_stage_days','avg_cycle_days','stage_reached') or date_field='closed',dimension,currency_filter,page_cursor;
 return jsonb_build_object('data',items,'total',total,'next_cursor',case when jsonb_array_length(items)=50 then items->49->>'id' end,'partial',total>jsonb_array_length(items) or page_cursor is not null);
end $$;
revoke all on function public.dashboard_details(uuid,text,jsonb,text,text,text,text,text,uuid) from public,anon;
grant execute on function public.dashboard_details(uuid,text,jsonb,text,text,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;

