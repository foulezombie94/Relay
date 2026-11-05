-- Free pipeline stages. Open stages become an ordered, per-pipeline list;
-- "Gagné" and "Perdu" stay the two reserved terminal keys (labels remain editable)
-- so every forecast, workflow and aggregate keeps its terminal semantics.
begin;
set local lock_timeout='5s';

alter table public.pipelines add column stages jsonb;
update public.pipelines set stages=
 (select coalesce(jsonb_agg(s order by o),'[]'::jsonb) from unnest(array['Nouveau','Qualification','Proposition','Négociation']) with ordinality u(s,o))
where stages is null;
alter table public.pipelines alter column stages set default '["Nouveau","Qualification","Proposition","Négociation"]'::jsonb;
alter table public.pipelines alter column stages set not null;
alter table public.pipelines add constraint pipelines_stages_array check(jsonb_typeof(stages)='array');

create or replace function relay_private.validate_pipeline() returns trigger language plpgsql security invoker set search_path='' as $$
declare key text;val jsonb;n integer;allowed text[];used integer;
begin
 n:=jsonb_array_length(new.stages);
 if n<1 or n>20 then raise exception 'Relay: Un pipeline compte entre 1 et 20 étapes ouvertes.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(new.stages) e where jsonb_typeof(e)<>'string') then raise exception 'Relay: Étape invalide.' using errcode='22023';end if;
 select array_agg(e) into allowed from jsonb_array_elements_text(new.stages) e;
 if (select count(distinct lower(btrim(x))) from unnest(allowed) x)<>n then raise exception 'Relay: Deux étapes portent le même nom.' using errcode='22023';end if;
 if exists(select 1 from unnest(allowed) x where length(btrim(x)) not between 1 and 80 or x<>btrim(x) or x in ('Gagné','Perdu')) then
  raise exception 'Relay: Nom d’étape invalide ou réservé.' using errcode='22023';end if;
 allowed:=allowed||array['Gagné','Perdu'];
 foreach key in array allowed loop
  val:=new.probabilities->key;
  if val is null or jsonb_typeof(val)<>'number' or val::numeric not between 0 and 100 then raise exception 'Relay: Probabilité invalide pour « % ».',key using errcode='22023';end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(new.probabilities) k where not k=any(allowed)) then raise exception 'Relay: Probabilité sans étape.' using errcode='22023';end if;
 if (new.probabilities->>'Gagné')::numeric<>100 or (new.probabilities->>'Perdu')::numeric<>0 then raise exception 'Relay: Gagné reste à 100 %% et Perdu à 0 %%.' using errcode='22023';end if;
 for key,val in select * from jsonb_each(new.labels) loop
  if not key=any(allowed) or jsonb_typeof(val)<>'string' or length(btrim(val#>>'{}')) not between 1 and 80 then raise exception 'Relay: Libellé invalide.' using errcode='22023';end if;
 end loop;
 if tg_op='UPDATE' and new.stages is distinct from old.stages then
  select count(*) into used from public.records r where r.workspace_id=new.workspace_id and r.pipeline_id=new.id
   and not (r.stage=any(allowed));
  if used>0 then raise exception 'Relay: % opportunité(s) utilisent une étape supprimée. Choisissez une étape de destination.',used using errcode='22023';end if;
 end if;
 return new;
end $$;
revoke all on function relay_private.validate_pipeline() from public,anon,authenticated;

-- A deal stage must exist in its pipeline. A new deal created with the column
-- default lands in the first open stage of its pipeline.
create function relay_private.validate_deal_stage() returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb;
begin
 if new.pipeline_id is null then return new;end if;
 if tg_op='UPDATE' and new.stage is not distinct from old.stage and new.pipeline_id is not distinct from old.pipeline_id then return new;end if;
 select stages into s from public.pipelines where workspace_id=new.workspace_id and id=new.pipeline_id;
 if s is null or new.stage in ('Gagné','Perdu') or s ? new.stage then return new;end if;
 if tg_op='INSERT' and new.stage='Nouveau' then new.stage:=s->>0;return new;end if;
 if tg_op='UPDATE' and new.stage is not distinct from old.stage then new.stage:=s->>0;return new;end if;
 raise exception 'Relay: L’étape « % » n’existe pas dans ce pipeline.',new.stage using errcode='22023';
end $$;
revoke all on function relay_private.validate_deal_stage() from public,anon,authenticated;
create trigger validate_deal_stage before insert or update of stage,pipeline_id on public.records
 for each row execute function relay_private.validate_deal_stage();

-- Atomic stage edit: moves deals out of removed stages, then saves the pipeline.
create function public.save_pipeline_stages(w uuid,pipeline uuid,expected_version integer,label text,
 open_stages jsonb,stage_labels jsonb,stage_probabilities jsonb,moves jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare p public.pipelines;removed text;target text;moved integer:=0;n integer;result public.pipelines;
begin
 if not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(open_stages)<>'array' or jsonb_typeof(coalesce(moves,'{}'::jsonb))<>'object' then raise exception 'Relay: Étapes invalides.' using errcode='22023';end if;
 select * into p from public.pipelines where workspace_id=w and id=pipeline for update;
 if p.id is null then raise exception 'Relay: Pipeline introuvable.' using errcode='22023';end if;
 if p.version<>expected_version then raise exception 'Relay: Le pipeline a changé. Rechargez avant de réessayer.' using errcode='22023';end if;
 for removed in select e from jsonb_array_elements_text(p.stages) e where not open_stages ? e loop
  if exists(select 1 from public.records where workspace_id=w and pipeline_id=pipeline and stage=removed) then
   target:=moves->>removed;
   if target is null or not open_stages ? target then raise exception 'Relay: Choisissez où déplacer les opportunités de « % ».',removed using errcode='22023';end if;
   update public.records set stage=target where workspace_id=w and pipeline_id=pipeline and stage=removed;
   get diagnostics n=row_count;moved:=moved+n;
  end if;
 end loop;
 update public.pipelines set name=label,stages=open_stages,labels=coalesce(stage_labels,'{}'::jsonb),probabilities=stage_probabilities
  where workspace_id=w and id=pipeline returning * into result;
 return jsonb_build_object('pipeline',to_jsonb(result),'moved',moved);
end $$;
revoke all on function public.save_pipeline_stages(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_pipeline_stages(uuid,uuid,integer,text,jsonb,jsonb,jsonb,jsonb) to authenticated;

-- Stage calibration follows each pipeline's own open stages.
create or replace function public.crm_sales_report(w uuid,pipeline_filter uuid default null,owner_filter uuid default null,report_month text default to_char(now() at time zone 'UTC','YYYY-MM')) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare obj uuid;result jsonb;
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if report_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid month' using errcode='22023';end if;
 select id into obj from public.objects where workspace_id=w and slug='deals';
 if obj is null then raise exception 'Deals inaccessible' using errcode='42501';end if;
 with deals as materialized(
  select r.id,r.stage,r.amount,r.currency,r.pipeline_id,r.close_date,r.lost_reason,
   round(r.amount*coalesce(r.probability,(p.probabilities->>r.stage)::numeric,case r.stage when 'Nouveau' then 10 when 'Qualification' then 25 when 'Proposition' then 50 when 'Négociation' then 75 else 0 end))/100 as weighted
  from public.records r left join public.pipelines p on p.workspace_id=w and p.id=r.pipeline_id
  where r.workspace_id=w and r.object_id=obj and not r.archived and (pipeline_filter is null or r.pipeline_id=pipeline_filter) and (owner_filter is null or r.owner_id=owner_filter)
 ), stage_counts as(select stage,count(*) total from deals group by stage),
 stage_amounts as(select currency,stage,sum(amount) total from deals group by currency,stage),
 totals as(select currency,jsonb_object_agg(stage,total) value from stage_amounts group by currency),
 months as(select currency,coalesce(to_char(close_date,'YYYY-MM'),'Sans date') bucket,sum(amount) amount,sum(weighted) weighted,count(*) count from deals where stage not in ('Gagné','Perdu') group by currency,bucket),
 month_objects as(select currency,jsonb_object_agg(bucket,jsonb_build_object('open',amount,'weighted',weighted,'count',count)) value from months group by currency),
 reasons as(select currency,coalesce(nullif(btrim(lost_reason),''),'Raison non renseignée') reason,count(*) count from deals where stage='Perdu' group by currency,reason),
 reason_objects as(select currency,jsonb_object_agg(reason,count) value from reasons group by currency),
 forecast as(select d.currency,jsonb_build_object('open',coalesce(sum(d.amount) filter(where d.stage not in ('Gagné','Perdu')),0),'weighted',coalesce(sum(d.weighted) filter(where d.stage not in ('Gagné','Perdu')),0),'won',coalesce(sum(d.amount) filter(where d.stage='Gagné'),0),'lost',coalesce(sum(d.amount) filter(where d.stage='Perdu'),0),'months',coalesce(m.value,'{}'),'reasons',coalesce(r.value,'{}')) value from deals d left join month_objects m using(currency) left join reason_objects r using(currency) group by d.currency,m.value,r.value),
 terminal as materialized(select * from deals where stage in ('Gagné','Perdu')),
 events as materialized(select a.id,a.entity_id,a.created_at,a.before_data->>'stage' before_stage,a.after_data->>'stage' after_stage,a.before_data->>'pipeline_id' before_pipeline,a.after_data->>'pipeline_id' after_pipeline,coalesce((a.after_data->>'version')::integer,0) version
  from public.audit_events a join terminal t on t.id=a.entity_id where a.workspace_id=w and a.entity='records' and a.after_data->>'object_id'=obj::text),
 decisive as(select distinct on(entity_id) entity_id,after_stage,case when after_stage in ('Gagné','Perdu') then created_at end closed_at from events where after_stage is not null and (after_stage not in ('Gagné','Perdu') or before_stage is distinct from after_stage) order by entity_id,created_at desc,version desc,id desc),
 resolved as materialized(select t.*,case when d.after_stage=t.stage then d.closed_at end closed_at from terminal t left join decisive d on d.entity_id=t.id),
 outcomes as(select currency,jsonb_build_object('won',coalesce(sum(amount) filter(where stage='Gagné' and to_char(closed_at at time zone 'UTC','YYYY-MM')=report_month),0),'lost',coalesce(sum(amount) filter(where stage='Perdu' and to_char(closed_at at time zone 'UTC','YYYY-MM')=report_month),0),'wonCount',count(*) filter(where stage='Gagné' and to_char(closed_at at time zone 'UTC','YYYY-MM')=report_month),'lostCount',count(*) filter(where stage='Perdu' and to_char(closed_at at time zone 'UTC','YYYY-MM')=report_month),'undated',count(*) filter(where closed_at is null)) value from resolved group by currency),
 visited as(select distinct t.id,t.pipeline_id,t.stage outcome,v.stage from resolved t join events e on e.entity_id=t.id cross join lateral(values(e.before_stage,e.before_pipeline),(e.after_stage,e.after_pipeline)) v(stage,pipeline) where t.closed_at is not null and v.pipeline=t.pipeline_id::text and v.stage is not null and v.stage not in ('Gagné','Perdu')),
 observed as(select pipeline_id,stage,count(*) filter(where outcome='Gagné') won,count(*) filter(where outcome='Perdu') lost,count(*) resolved from visited group by pipeline_id,stage),
 calibration as(select p.id as "pipelineId",p.name pipeline,s.stage,coalesce(p.labels->>s.stage,s.stage) label,coalesce((p.probabilities->>s.stage)::numeric,0) configured,coalesce(o.won,0) won,coalesce(o.lost,0) lost,coalesce(o.resolved,0) resolved,round(100.0*o.won/nullif(o.resolved,0),1) rate
 from public.pipelines p cross join lateral jsonb_array_elements_text(p.stages) with ordinality s(stage,position) left join observed o on o.pipeline_id=p.id and o.stage=s.stage where p.workspace_id=w and (pipeline_filter is null or p.id=pipeline_filter) order by p.created_at,p.id,s.position)
 select jsonb_build_object('total',(select count(*) from deals),'counts',coalesce((select jsonb_object_agg(stage,total) from stage_counts),'{}'),'totals',coalesce((select jsonb_object_agg(currency,value) from totals),'{}'),'tasks',(select count(*) from public.tasks where workspace_id=w and status not in ('done','cancelled') and (owner_filter is null or owner_id=owner_filter)),
 'forecast',coalesce((select jsonb_object_agg(currency,value) from forecast),'{}'),'history',jsonb_build_object('month',report_month,'outcomes',coalesce((select jsonb_object_agg(currency,value) from outcomes),'{}'),'calibration',coalesce((select jsonb_agg(to_jsonb(calibration)) from calibration),'[]')),'historyLimited',false) into result;
 return result;
end $$;
revoke all on function public.crm_sales_report(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.crm_sales_report(uuid,uuid,uuid,text) to authenticated;

-- Dashboard stage history accepts every pipeline stage.
create or replace function relay_private.dashboard_source(w uuid,kind text,filters jsonb,date_field text,need_history boolean default false)
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
     array_agg(distinct a.after_data->>'stage') filter(where a.after_data->>'stage' is not null) as visited
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

commit;
