begin;
set local lock_timeout='5s';

-- A shared, short-lived aggregate cache. It contains no source text or OAuth
-- credentials. Every lookup binds current user, current ACL and data revision.
create table relay_private.crm_read_revisions(workspace_id uuid primary key references public.workspaces(id) on delete cascade, revision bigint not null default 1);
create table relay_private.crm_aggregate_cache(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, cache_key text not null,
 fingerprint text not null, revision bigint not null, expires_at timestamptz not null, value jsonb not null,
 primary key(workspace_id,user_id,cache_key)
);
alter table relay_private.crm_read_revisions enable row level security;
alter table relay_private.crm_aggregate_cache enable row level security;
revoke all on relay_private.crm_read_revisions,relay_private.crm_aggregate_cache from public,anon,authenticated,service_role;
create function relay_private.crm_read_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into relay_private.crm_read_revisions(workspace_id) select distinct workspace_id from new_rows order by workspace_id on conflict(workspace_id) do update set revision=relay_private.crm_read_revisions.revision+1;
 elsif tg_op='DELETE' then
  insert into relay_private.crm_read_revisions(workspace_id) select distinct o.workspace_id from old_rows o join public.workspaces w on w.id=o.workspace_id order by o.workspace_id on conflict(workspace_id) do update set revision=relay_private.crm_read_revisions.revision+1;
 else
  insert into relay_private.crm_read_revisions(workspace_id) select workspace_id from (select workspace_id from new_rows union select workspace_id from old_rows) s order by workspace_id on conflict(workspace_id) do update set revision=relay_private.crm_read_revisions.revision+1;
 end if;
 return null;
end $$;
revoke all on function relay_private.crm_read_changed() from public,anon,authenticated,service_role;
do $$ declare t text;begin
 foreach t in array array['records','tasks','commitments','conflicts','activities','meetings','communications','pipelines','memberships','audit_events','integrations','objects'] loop
  execute format('create trigger crm_read_insert after insert on public.%I referencing new table as new_rows for each statement execute function relay_private.crm_read_changed()',t);
  execute format('create trigger crm_read_update after update on public.%I referencing new table as new_rows old table as old_rows for each statement execute function relay_private.crm_read_changed()',t);
  execute format('create trigger crm_read_delete after delete on public.%I referencing old table as old_rows for each statement execute function relay_private.crm_read_changed()',t);
 end loop;
end $$;
create function relay_private.crm_cache_read(w uuid,k text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 return (select c.value from relay_private.crm_aggregate_cache c where c.workspace_id=w and c.user_id=auth.uid() and c.cache_key=k
 and c.fingerprint=relay_private.agent_access_fingerprint(w) and c.revision=coalesce((select revision from relay_private.crm_read_revisions where workspace_id=w),0) and c.expires_at>now());
end $$;
create function relay_private.crm_cache_write(w uuid,k text,v jsonb,expected_revision bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if length(k)<>32 or octet_length(v::text)>1000000 then return;end if;
 -- A concurrent mutation must never label an older calculation as current.
 if expected_revision<>coalesce((select revision from relay_private.crm_read_revisions where workspace_id=w),0) then return;end if;
 delete from relay_private.crm_aggregate_cache where workspace_id=w and user_id=auth.uid() and expires_at<now();
 if (select count(*) from relay_private.crm_aggregate_cache where workspace_id=w and user_id=auth.uid())>=100 then return;end if;
 insert into relay_private.crm_aggregate_cache(workspace_id,user_id,cache_key,fingerprint,revision,expires_at,value)
 values(w,auth.uid(),k,relay_private.agent_access_fingerprint(w),expected_revision,now()+interval '20 seconds',v)
 on conflict(workspace_id,user_id,cache_key) do update set fingerprint=excluded.fingerprint,revision=excluded.revision,expires_at=excluded.expires_at,value=excluded.value;
end $$;
create function relay_private.crm_read_revision(w uuid) returns bigint language plpgsql security definer set search_path='' as $$
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 return coalesce((select revision from relay_private.crm_read_revisions where workspace_id=w),0);
end $$;
revoke all on function relay_private.crm_cache_read(uuid,text),relay_private.crm_cache_write(uuid,text,jsonb,bigint),relay_private.crm_read_revision(uuid) from public,anon;
grant execute on function relay_private.crm_cache_read(uuid,text),relay_private.crm_cache_write(uuid,text,jsonb,bigint),relay_private.crm_read_revision(uuid) to authenticated;

-- SQL invoker is essential: compute using the caller's existing RLS, never the
-- cache helper's privileged context. Identical tiles reuse one calculation.
create function public.dashboard_batch(w uuid,requests jsonb) returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare q jsonb;k text;cached jsonb;value jsonb;output jsonb:='[]';memo jsonb:='{}';revision bigint;
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if jsonb_typeof(requests)<>'array' or jsonb_array_length(requests) not between 1 and 48 or octet_length(requests::text)>65536 then raise exception 'Invalid batch' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-cache:'||w::text||':'||auth.uid()::text,0));
 revision:=relay_private.crm_read_revision(w);
 for q in select * from jsonb_array_elements(requests) loop
  if jsonb_typeof(q)<>'object' or q-array['kind','filters','group_by','metric','date_field']<>'{}' then raise exception 'Invalid request' using errcode='22023';end if;
  k:=md5(q::text);value:=memo->k;
  if value is null then
   cached:=relay_private.crm_cache_read(w,k);
   if cached is not null then value:=cached;
   else
    begin
     value:=jsonb_build_object('result',public.dashboard_aggregate(w,q->>'kind',coalesce(q->'filters','{}'),coalesce(q->>'group_by','none'),coalesce(q->>'metric','count'),coalesce(q->>'date_field','created')));
     perform relay_private.crm_cache_write(w,k,value,revision);
    exception when invalid_parameter_value then value:=jsonb_build_object('error','Indicateur ou filtre invalide.');end;
   end if;
   memo:=memo||jsonb_build_object(k,value);
  end if;
  output:=output||jsonb_build_array(value);
 end loop;
 return output;
end $$;
revoke all on function public.dashboard_batch(uuid,jsonb) from public,anon;
grant execute on function public.dashboard_batch(uuid,jsonb) to authenticated;

create function public.crm_sales_report(w uuid,pipeline_filter uuid default null,owner_filter uuid default null,report_month text default to_char(now() at time zone 'UTC','YYYY-MM')) returns jsonb
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
 visited as(select distinct t.id,t.pipeline_id,t.stage outcome,v.stage from resolved t join events e on e.entity_id=t.id cross join lateral(values(e.before_stage,e.before_pipeline),(e.after_stage,e.after_pipeline)) v(stage,pipeline) where t.closed_at is not null and v.pipeline=t.pipeline_id::text and v.stage in ('Nouveau','Qualification','Proposition','Négociation')),
 observed as(select pipeline_id,stage,count(*) filter(where outcome='Gagné') won,count(*) filter(where outcome='Perdu') lost,count(*) resolved from visited group by pipeline_id,stage),
 calibration as(select p.id as "pipelineId",p.name pipeline,s.stage,coalesce(p.labels->>s.stage,s.stage) label,coalesce((p.probabilities->>s.stage)::numeric,s.probability) configured,coalesce(o.won,0) won,coalesce(o.lost,0) lost,coalesce(o.resolved,0) resolved,round(100.0*o.won/nullif(o.resolved,0),1) rate
 from public.pipelines p cross join(values('Nouveau',10),('Qualification',25),('Proposition',50),('Négociation',75)) s(stage,probability) left join observed o on o.pipeline_id=p.id and o.stage=s.stage where p.workspace_id=w and (pipeline_filter is null or p.id=pipeline_filter) order by p.created_at,p.id,s.probability)
 select jsonb_build_object('total',(select count(*) from deals),'counts',coalesce((select jsonb_object_agg(stage,total) from stage_counts),'{}'),'totals',coalesce((select jsonb_object_agg(currency,value) from totals),'{}'),'tasks',(select count(*) from public.tasks where workspace_id=w and status not in ('done','cancelled') and (owner_filter is null or owner_id=owner_filter)),
 'forecast',coalesce((select jsonb_object_agg(currency,value) from forecast),'{}'),'history',jsonb_build_object('month',report_month,'outcomes',coalesce((select jsonb_object_agg(currency,value) from outcomes),'{}'),'calibration',coalesce((select jsonb_agg(to_jsonb(calibration)) from calibration),'[]')),'historyLimited',false) into result;
 return result;
end $$;
revoke all on function public.crm_sales_report(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.crm_sales_report(uuid,uuid,uuid,text) to authenticated;

create function public.crm_priorities(w uuid,owner_filter uuid default null,page_offset integer default 0,page_size integer default 50) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='10s' as $$
declare result jsonb;begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if page_offset not between 0 and 1000000 or page_size not between 1 and 100 then raise exception 'Invalid page' using errcode='22023';end if;
 with records as materialized(select r.id,r.stage,r.created_at,r.owner_id from public.records r where r.workspace_id=w and not r.archived and (owner_filter is null or owner_id=owner_filter)),
 task_stats as(select t.record_id,count(*) filter(where t.due_date<now()) late_count,(array_agg(t.id order by t.due_date,t.id) filter(where t.due_date<now()))[1:20] late_ids,min(t.due_date) filter(where t.due_date>=now()) next_due from public.tasks t join records r on r.id=t.record_id where t.workspace_id=w and t.status in ('open','in_progress') group by t.record_id),
 promise_stats as(select c.record_id,count(*) count,(array_agg(c.id order by c.due_date,c.id))[1:20] ids from public.commitments c join records r on r.id=c.record_id where c.workspace_id=w and c.status in ('confirmed','in_progress') and c.due_date<now() group by c.record_id),
 conflict_stats as(select c.record_id,count(*) count,(array_agg(c.id order by c.id))[1:20] ids from public.conflicts c join records r on r.id=c.record_id where c.workspace_id=w and c.status='open' group by c.record_id),
 interactions as(select record_id,max(stamp) stamp from (select a.record_id,a.created_at stamp from public.activities a join records r on r.id=a.record_id where a.workspace_id=w and a.type in ('call','email','meeting') and a.created_at<=now() union all select m.record_id,coalesce(m.starts_at,m.created_at) from public.meetings m join records r on r.id=m.record_id where m.workspace_id=w and coalesce(m.starts_at,m.created_at)<=now()) i group by record_id),
 raw as(select r.*,t.late_count,t.late_ids,t.next_due,p.count promise_count,p.ids promise_ids,c.count conflict_count,c.ids conflict_ids,i.stamp last_interaction,floor(extract(epoch from now()-coalesce(i.stamp,r.created_at))/86400)::integer idle_days from records r left join task_stats t on t.record_id=r.id left join promise_stats p on p.record_id=r.id left join conflict_stats c on c.record_id=r.id left join interactions i on i.record_id=r.id),
 scored as materialized(select raw.*,
 least(100,(case when promise_count>0 then 35 else 0 end)+(case when conflict_count>0 then 30 else 0 end)+(case when late_count>0 then 25 else 0 end)+(case when stage not in ('Gagné','Perdu') and next_due is null then 15 else 0 end)+(case when stage not in ('Gagné','Perdu') and idle_days>=14 and not coalesce(next_due>now() and next_due<=now()+interval '7 days',false) then 20 else 0 end)) score,
 stage not in ('Gagné','Perdu') and next_due is null missing from raw),
 limited as(select * from scored where score>0 order by score desc,id limit page_size offset page_offset),
 page as(select raw.id,raw.score,jsonb_build_object('record',(select to_jsonb(r)-'search' from public.records r where r.workspace_id=w and r.id=raw.id),'last_interaction',last_interaction,'signals',s.signals,'score',raw.score) data,
 (select to_jsonb(t) from public.tasks t where t.workspace_id=w and t.record_id=raw.id and t.status in ('open','in_progress') and t.due_date>=now() order by t.due_date,t.id limit 1) next_task
 from limited raw cross join lateral(select coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label,'weight',weight,'resource',resource,'ids',coalesce(ids,'{}'::uuid[]),'ids_partial',n>20)),'[]') signals,least(100,coalesce(sum(weight),0)) score from(values
 ('promise_late',promise_count||' engagement(s) accepté(s) en retard',35,'commitments',promise_ids,promise_count,promise_count>0),
 ('conflict',conflict_count||' contradiction(s) à examiner',30,'conflicts',conflict_ids,conflict_count,conflict_count>0),
 ('task_late',late_count||' tâche(s) en retard',25,'tasks',late_ids,late_count,late_count>0),
 ('next_step','Aucune prochaine action datée',15,'tasks','{}'::uuid[],0,stage not in ('Gagné','Perdu') and next_due is null),
 ('idle','Aucun échange journalisé depuis '||idle_days||' jours',20,'activities','{}'::uuid[],0,stage not in ('Gagné','Perdu') and idle_days>=14 and not coalesce(next_due>now() and next_due<=now()+interval '7 days',false))) v(code,label,weight,resource,ids,n,include) where include) s)
 select jsonb_build_object('data',coalesce((select jsonb_agg(data||jsonb_build_object('next_task',next_task) order by score desc,id) from page),'[]'),'total',(select count(*) from records),'matching',(select count(*) from scored where score>0),'without_next_action',(select count(*) from scored where missing),'generated_at',now(),'next_offset',case when (select count(*) from scored where score>0)>page_offset+page_size then page_offset+page_size end) into result;
 return result;
end $$;
revoke all on function public.crm_priorities(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.crm_priorities(uuid,uuid,integer,integer) to authenticated;
-- A single RLS-bound Pulse read replaces count/sample/reply N+1 requests.
create function public.crm_pulse(w uuid,at_time timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare obj uuid;result jsonb;begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if at_time is null or abs(extract(epoch from now()-at_time))>86400 then raise exception 'Invalid time' using errcode='22023';end if;
 select id into obj from public.objects where workspace_id=w and slug='deals';
 if obj is null then raise exception 'Deals inaccessible' using errcode='42501';end if;
 with counts as(select
  (select count(*) from public.records where workspace_id=w and object_id=obj and not archived) opportunities,
  (select count(*) from public.tasks where workspace_id=w and status in ('open','in_progress')) open_tasks,
  (select count(*) from public.tasks where workspace_id=w and status in ('open','in_progress') and due_date<at_time) overdue_tasks,
  (select count(*) from public.commitments where workspace_id=w and status in ('confirmed','in_progress') and due_date<=at_time+interval '7 days') due_commitments,
  (select count(*) from public.conflicts where workspace_id=w and status='open') open_conflicts),
 candidates as materialized(select c.id,c.record_id,c.integration_id,c.thread_id,c.received_at from public.communications c where c.workspace_id=w and c.user_id=(select auth.uid()) and c.kind='email' and c.direction='inbound' and c.record_id is not null and nullif(c.thread_id,'') is not null and c.received_at between at_time-interval '14 days' and at_time order by c.received_at desc,c.id limit 3),
 waiting as(select c.id,c.record_id from candidates c where not exists(select 1 from public.communications reply where reply.workspace_id=w and reply.user_id=(select auth.uid()) and reply.kind='email' and reply.direction='outbound' and reply.integration_id=c.integration_id and reply.thread_id=c.thread_id and reply.received_at>=c.received_at) order by c.received_at desc,c.id limit 1),
 stale as(select id,left(display_name,160) label from public.records where workspace_id=w and object_id=obj and not archived and stage not in ('Gagné','Perdu') and updated_at<at_time-interval '14 days' order by updated_at,id limit 1),
 promise as(select id,record_id,left(title,160) label from public.commitments where workspace_id=w and status in ('confirmed','in_progress') and due_date<=at_time+interval '7 days' order by due_date,id limit 1)
 select jsonb_build_object('counts',to_jsonb(counts)||jsonb_build_object('attention',overdue_tasks+due_commitments+open_conflicts),'signals',jsonb_build_array(
 jsonb_build_object('kind','email','detected',exists(select 1 from waiting))||coalesce((select jsonb_build_object('source_id',id,'record_id',record_id) from waiting),'{}'),
 jsonb_build_object('kind','deal','detected',exists(select 1 from stale))||coalesce((select jsonb_build_object('record_id',id,'label',label) from stale),'{}'),
 jsonb_build_object('kind','commitment','detected',exists(select 1 from promise))||coalesce((select jsonb_strip_nulls(jsonb_build_object('source_id',id,'record_id',record_id,'label',label)) from promise),'{}')),
 'generated_at',at_time,'email_candidates_scanned',(select count(*) from candidates)) into result from counts;
 return result;
end $$;
revoke all on function public.crm_pulse(uuid,timestamptz) from public,anon;
grant execute on function public.crm_pulse(uuid,timestamptz) to authenticated;

-- Related content is loaded only for the section being opened. Summary has
-- four recent interactions, three recent commitments and the next open action.
create function public.crm_record_context(w uuid,record uuid,view text default 'all') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare r jsonb;counts jsonb;relations jsonb;related jsonb;timeline jsonb:='[]';n bigint;
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if view not in ('summary','timeline','relations','all') then raise exception 'Invalid section' using errcode='22023';end if;
 select to_jsonb(x)-'search' into r from public.records x where x.workspace_id=w and x.id=record;
 if r is null then raise exception 'Record inaccessible' using errcode='42501';end if;
 select jsonb_build_object('notes',(select count(*) from public.notes where workspace_id=w and record_id=record),
 'tasks',(select count(*) from public.tasks where workspace_id=w and record_id=record),
 'commitments',(select count(*) from public.commitments where workspace_id=w and record_id=record),
 'activities',(select count(*) from public.activities where workspace_id=w and record_id=record),
 'meetings',(select count(*) from public.meetings where workspace_id=w and record_id=record),
 'documents',(select count(*) from public.documents where workspace_id=w and record_id=record),
 'conflicts',(select count(*) from public.conflicts where workspace_id=w and record_id=record)) into counts;
 select count(*) into n from public.record_relations where workspace_id=w and (source_id=record or target_id=record);
 with edges as(select * from public.record_relations where workspace_id=w and (source_id=record or target_id=record) order by id limit 100),
 nodes as(select x.* from public.records x where x.workspace_id=w and x.id in(select case when source_id=record then target_id else source_id end from edges))
 select coalesce((select jsonb_agg(to_jsonb(edges)) from edges),'[]'),coalesce((select jsonb_agg(to_jsonb(nodes)-'search') from nodes),'[]') into relations,related;
 if view in ('summary','timeline','all') then
  if view='summary' then
   with recent as(
    (select jsonb_build_object('id',id,'resource','activities','type',type,'content',left(content,1500),'created_at',created_at) data,created_at from public.activities where workspace_id=w and record_id=record order by created_at desc,id limit 4)
    union all (select jsonb_build_object('id',id,'resource','meetings','title',title,'summary',left(summary,1500),'starts_at',starts_at,'created_at',created_at),created_at from public.meetings where workspace_id=w and record_id=record order by created_at desc,id limit 4)
    union all (select to_jsonb(t)||jsonb_build_object('resource','tasks'),created_at from public.tasks t where workspace_id=w and record_id=record and status in ('open','in_progress') order by due_date nulls last,created_at desc,id limit 1)
    union all (select to_jsonb(c)||jsonb_build_object('resource','commitments'),created_at from public.commitments c where workspace_id=w and record_id=record order by created_at desc,id limit 3)
    union all (select to_jsonb(c)||jsonb_build_object('resource','commitments'),created_at from public.commitments c where workspace_id=w and record_id=record and status in ('confirmed','in_progress','proposed','postponed') order by due_date nulls last,created_at desc,id limit 1)
   ),deduplicated as(select distinct on(data->>'resource',data->>'id') * from recent)
   select coalesce(jsonb_agg(data order by created_at desc),'[]') into timeline from deduplicated;
  else
   with rows as(
    (select jsonb_build_object('id',id,'workspace_id',workspace_id,'resource','notes','title',title,'content',left(content,1500),'private',private,'author_id',author_id,'created_at',created_at) data,created_at from public.notes where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select to_jsonb(t)||jsonb_build_object('resource','tasks'),created_at from public.tasks t where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select to_jsonb(c)||jsonb_build_object('resource','commitments'),created_at from public.commitments c where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select to_jsonb(a)||jsonb_build_object('resource','activities'),created_at from public.activities a where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select jsonb_build_object('id',id,'workspace_id',workspace_id,'resource','meetings','title',title,'summary',left(summary,1500),'starts_at',starts_at,'created_at',created_at),created_at from public.meetings where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select jsonb_build_object('id',id,'workspace_id',workspace_id,'resource','documents','name',name,'mime',mime,'size',size,'created_at',created_at),created_at from public.documents where workspace_id=w and record_id=record order by created_at desc,id limit 100)
    union all (select to_jsonb(c)||jsonb_build_object('resource','conflicts'),created_at from public.conflicts c where workspace_id=w and record_id=record order by created_at desc,id limit 100)
   ) select coalesce(jsonb_agg(data order by created_at desc),'[]') into timeline from rows;
  end if;
 end if;
 return jsonb_build_object('record',r,'counts',counts,'relations',relations,'related',related,'timeline',timeline,'relation_count',n,'truncated',n>100 or exists(select 1 from jsonb_each_text(counts) x where x.value::integer>100));
end $$;
revoke all on function public.crm_record_context(uuid,uuid,text) from public,anon;
grant execute on function public.crm_record_context(uuid,uuid,text) to authenticated;
commit;
