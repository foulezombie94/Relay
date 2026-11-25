begin;
-- Performance audit P-03. A dashboard tile over 100 000 deals took 0.3 to 1.2 s: the
-- source rows went through a PL/pgSQL set-returning function (copied into a tuplestore,
-- then into a materialized CTE), and each record ran an audit-history lookup even when
-- the measure does not use history. The source query is now built once as SQL text,
-- inlined into the aggregate so PostgreSQL plans a single pass, and the history is read
-- only for measures that need it, aggregated once per workspace instead of one lookup
-- per record. Results are unchanged (checked on 100 000 deals and 53 000 audit events:
-- 14 measures identical, dashboard_source rows identical): same rows, same filters, same
-- permission checks; dashboard_source keeps its signature for its other callers.

-- Source query text. Parameter placeholders are chosen by the caller (p: w, filters,
-- need_history) so it can be embedded in queries that number their parameters
-- differently.
create function relay_private.dashboard_source_sql(w uuid, kind text, filters jsonb, date_field text, need_history boolean, p text[])
returns text language plpgsql stable set search_path to '' as $function$
#variable_conflict use_variable
declare base text;pred text:='true';date_expr text;allowed text[]:=array['since','until','empty'];k text;history text;
 pw text:=p[1];pf text:=p[2];ph text:=p[3];
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if kind not in ('record','task','commitment','email','meeting') or date_field not in ('created','occurred','due','closed') then raise exception 'Invalid source' using errcode='22023';end if;
 if (date_field='closed' and kind<>'record') or (date_field='due' and kind not in ('task','commitment')) then raise exception 'Invalid date field' using errcode='22023';end if;
 if cardinality(p)<>3 or exists(select 1 from unnest(p) x where x !~ '^\$[1-9]$') then raise exception 'Invalid placeholders' using errcode='22023';end if;
 case kind
 when 'record' then
  allowed:=allowed||array['object_id','pipeline_id','owner_id','stage','lifecycle','currency'];
  -- Stage history comes from the audit log only when the measure reads it; otherwise
  -- its columns were always empty but still cost one lookup per record.
  -- The workspace's record history is aggregated once and hash-joined, instead of one
  -- audit index probe per record (100 000 probes, 0.44 s of 0.48 s in EXPLAIN ANALYZE).
  -- Per record and pipeline: the stages visited (sorted, as array_agg(distinct) did) and,
  -- per stage, the last time a change led to it. The pipeline match stays null-safe
  -- (':null' cannot be a uuid text).
  history:=case when need_history then format($h$
   left join (
    select g.entity_id,g.pid,
     array_agg(g.stage order by g.stage) filter(where g.stage is not null) as visited,
     jsonb_object_agg(g.stage,g.changed_at) filter(where g.stage is not null and g.changed_at is not null) as changes
    from (
     select a.entity_id,a.after_data->>'pipeline_id' as pid,a.after_data->>'stage' as stage,
      max(a.created_at) filter(where a.before_data->>'stage' is distinct from a.after_data->>'stage' or a.before_data->>'pipeline_id' is distinct from a.after_data->>'pipeline_id') as changed_at
     from public.audit_events a where a.workspace_id=%1$s and a.entity='records'
     group by 1,2,3
    ) g group by g.entity_id,g.pid
   ) hh on hh.entity_id=r.id and coalesce(hh.pid,':null')=coalesce(r.pipeline_id::text,':null')
   left join lateral(select (hh.changes->>r.stage)::timestamptz as stage_at,hh.visited as visited) h on true$h$,pw) else '
   left join lateral(select null::timestamptz as stage_at,null::text[] as visited) h on true' end;
  base:=format($source$
   select r.id,r.id as record_id,r.display_name as title,r.owner_id,r.pipeline_id,r.object_id,r.stage,null::text as status,null::text as provider,null::text as direction,
    r.currency,r.amount,coalesce(r.probability,(p.probabilities->>r.stage)::numeric,case r.stage when 'Nouveau' then 10 when 'Qualification' then 25 when 'Proposition' then 50 when 'Négociation' then 75 when 'Gagné' then 100 else 0 end) as probability,
    r.created_at,r.created_at as event_at,null::timestamptz as due_date,
    h.stage_at,case when r.stage in ('Gagné','Perdu') then h.stage_at end as closed_at,coalesce(h.visited,'{}'::text[]) as visited
   from public.records r left join public.pipelines p on p.workspace_id=r.workspace_id and p.id=r.pipeline_id
   %2$s
   where r.workspace_id=%1$s and not r.archived
  $source$,pw,history);
 when 'task' then
  allowed:=allowed||array['owner_id','status','overdue'];
  base:=format('select id,record_id,title,owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,null::text provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,created_at event_at,due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.tasks where workspace_id=%s',pw);
 when 'commitment' then
  allowed:=allowed||array['owner_id','status','overdue'];
  base:=format('select id,record_id,title,owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,null::text provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,created_at event_at,due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.commitments where workspace_id=%s',pw);
 when 'email' then
  base:=format('select c.id,c.record_id,c.subject title,null::uuid owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,null::text status,i.provider,c.direction,null::text currency,0::numeric amount,0::numeric probability,c.created_at,c.received_at event_at,null::timestamptz due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.communications c join public.integrations i on i.workspace_id=c.workspace_id and i.id=c.integration_id where c.workspace_id=%s and c.kind=''email''',pw);
 when 'meeting' then
  base:=format('select id,record_id,title,null::uuid owner_id,null::uuid pipeline_id,null::uuid object_id,null::text stage,status,provider,null::text direction,null::text currency,0::numeric amount,0::numeric probability,created_at,coalesce(starts_at,created_at) event_at,null::timestamptz due_date,null::timestamptz stage_at,null::timestamptz closed_at,''{}''::text[] visited from public.meetings where workspace_id=%s',pw);
 end case;
 if jsonb_typeof(filters)<>'object' or octet_length(filters::text)>8000 or exists(select 1 from jsonb_object_keys(filters) a where not a=any(allowed)) then raise exception 'Unsupported dashboard filter' using errcode='22023';end if;
 date_expr:=case date_field when 'created' then 'x.created_at' when 'occurred' then 'x.event_at' when 'due' then 'x.due_date' when 'closed' then 'x.closed_at' end;
 if (filters->>'empty')::boolean is true then pred:='false';end if;
 foreach k in array array['object_id','owner_id','pipeline_id'] loop
  if filters ? k then pred:=pred||format(' and x.%I=(%s->>%L)::uuid',k,pf,k);end if;
 end loop;
 foreach k in array array['stage','status','currency'] loop
  if filters ? k then pred:=pred||format(' and x.%I=%s->>%L',k,pf,k);end if;
 end loop;
 if filters ? 'lifecycle' then
  case filters->>'lifecycle' when 'all' then null;when 'open' then pred:=pred||' and x.stage not in (''Gagné'',''Perdu'')';when 'won' then pred:=pred||' and x.stage=''Gagné''';when 'lost' then pred:=pred||' and x.stage=''Perdu''';else raise exception 'Invalid lifecycle' using errcode='22023';end case;
 end if;
 if (filters->>'overdue')::boolean is true then pred:=pred||' and x.due_date<now() and x.status not in (''done'',''cancelled'')';end if;
 -- Keep undated closed records only to report the missing evidence. Public
 -- aggregate/detail RPCs exclude them from every value and list.
 if filters ? 'since' then pred:=pred||format(' and (%s>=(%s->>''since'')::timestamptz%s)',date_expr,pf,case when date_field='closed' then ' or (x.closed_at is null and x.stage in (''Gagné'',''Perdu''))' else '' end);end if;
 if filters ? 'until' then pred:=pred||format(' and (%s<(%s->>''until'')::timestamptz%s)',date_expr,pf,case when date_field='closed' then ' or (x.closed_at is null and x.stage in (''Gagné'',''Perdu''))' else '' end);end if;
 return format('select x.id,x.record_id,x.title,x.owner_id,x.pipeline_id,x.object_id,x.stage,x.status,x.provider,x.direction,x.currency,x.amount,x.probability,%s as occurred_at,x.created_at,x.stage_at,x.closed_at,x.visited,(%s and (case when %L=''closed'' then x.stage in (''Gagné'',''Perdu'') and x.closed_at is null else cardinality(x.visited)=0 or x.stage_at is null end)) as history_missing from (%s) x where %s',date_expr,ph,date_field,base,pred);
end $function$;
revoke all on function relay_private.dashboard_source_sql(uuid,text,jsonb,text,boolean,text[]) from public,anon;
grant execute on function relay_private.dashboard_source_sql(uuid,text,jsonb,text,boolean,text[]) to authenticated;

-- Same rows as before, for the detail lists that still select from it.
create or replace function relay_private.dashboard_source(w uuid, kind text, filters jsonb, date_field text, need_history boolean default false)
returns table(id uuid, record_id uuid, title text, owner_id uuid, pipeline_id uuid, object_id uuid, stage text, status text, provider text, direction text, currency text, amount numeric, probability numeric, occurred_at timestamp with time zone, created_at timestamp with time zone, stage_at timestamp with time zone, closed_at timestamp with time zone, visited text[], history_missing boolean)
language plpgsql set search_path to '' as $function$
begin
 return query execute relay_private.dashboard_source_sql(w,kind,filters,date_field,need_history,array['$1','$2','$3'])
  using w,filters,need_history;
end $function$;
revoke all on function relay_private.dashboard_source(uuid,text,jsonb,text,boolean) from public,anon;
grant execute on function relay_private.dashboard_source(uuid,text,jsonb,text,boolean) to authenticated;

create or replace function public.dashboard_aggregate(w uuid, kind text, filters jsonb default '{}'::jsonb, group_by text default 'none'::text, metric text default 'count'::text, date_field text default 'created'::text)
returns jsonb language plpgsql set search_path to '' set statement_timeout to '8s' as $function$
#variable_conflict use_variable
declare dim text;money boolean:=metric in ('amount','average_amount','weighted_amount');measure text;sample text;eligible text:='true';result jsonb;currency_expr text;labels text;
 need boolean:=metric in ('avg_stage_days','avg_cycle_days','stage_reached') or date_field='closed';src text;
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
 -- Parameters below: $1 w, $2 kind, $3 filters, $4 date_field, $5 need_history,
 -- $6 group_by, $7 metric. The source query is inlined, so it is planned with the rest.
 src:=relay_private.dashboard_source_sql(w,kind,filters,date_field,need,array['$1','$3','$5']);
 execute format($query$
  with source as %s(%s),
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
   'missing_history',case when $5 then (select count(*) from source where history_missing) else 0 end,
   'coverage',case when $2 in ('email','meeting') then 'Éléments importés et autorisés uniquement ; la synchronisation peut être incomplète.'
    when $7='stage_reached' then 'Passages enregistrés dans le pipeline actuel, par fiche distincte. Les étapes sautées et les historiques absents ne sont pas inventés.'
    when $7 in ('avg_stage_days','avg_cycle_days') or $4='closed' then 'Dates observées dans l’audit ; les historiques absents sont exclus des valeurs. Les montants sont les valeurs actuelles.'
    else 'Agrégation exacte des données actuellement autorisées.' end)
 $query$,
 -- Without history, history_missing is always false: the source is read once, inside
 -- valid. With history, it is kept so the audit lookups run a single time.
 case when need then 'materialized' else 'not materialized' end,src,eligible,
 case when metric='stage_reached' then 'select v.stage_name dimension,null::text currency,count(distinct id) as count,count(distinct id)::text value,count(distinct id) sample_size from valid cross join lateral unnest(visited) v(stage_name) group by v.stage_name'
 else format('select %s dimension,%s currency,count(*) as count,%s as value,%s as sample_size from valid group by %s%s',dim,currency_expr,measure,sample,dim,case when money then ',currency' else '' end) end,
 labels,currency_expr,measure,sample,case when money then 'group by currency' else '' end)
 into result using w,kind,filters,date_field,need,group_by,metric;
 return result;
end $function$;
revoke all on function public.dashboard_aggregate(uuid,text,jsonb,text,text,text) from public,anon;
grant execute on function public.dashboard_aggregate(uuid,text,jsonb,text,text,text) to authenticated;
commit;
