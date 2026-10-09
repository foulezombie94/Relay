begin;
set local lock_timeout='5s';
-- CRM records are workspace-visible to full-scope members/readers. Email,
-- meeting and private-proposal aggregates always keep the per-user cache.
create function relay_private.full_record_workspaces() returns setof uuid language sql stable security definer set search_path='' as $$
 select m.workspace_id from public.memberships m where m.user_id=(select auth.uid()) and (m.role in ('owner','admin','member') or (m.role='viewer' and m.reader_scope='all'))
$$;
revoke all on function relay_private.full_record_workspaces() from public,anon;
grant execute on function relay_private.full_record_workspaces() to authenticated;
create table relay_private.crm_record_aggregate_cache(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 cache_key text not null,request jsonb not null,revision bigint not null,expires_at timestamptz not null,value jsonb not null,
 primary key(workspace_id,cache_key),check(cache_key=md5(request::text))
);
alter table relay_private.crm_record_aggregate_cache enable row level security;
revoke all on relay_private.crm_record_aggregate_cache from public,anon,authenticated,service_role;
grant select,insert,update on relay_private.crm_record_aggregate_cache to authenticated;
create policy full_record_scope on relay_private.crm_record_aggregate_cache for all to authenticated
 using(workspace_id in(select relay_private.full_record_workspaces())) with check(workspace_id in(select relay_private.full_record_workspaces()));
create index crm_record_cache_expiry_idx on relay_private.crm_record_aggregate_cache(expires_at);

-- Clients cannot forge cached statistics: the invoker trigger discards any
-- supplied value/revision/TTL and computes under their actual record RLS.
create function relay_private.compute_record_cache() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not (new.workspace_id in(select relay_private.full_record_workspaces())) then raise exception 'Full record scope required' using errcode='42501';end if;
 if new.request->>'kind' is distinct from 'record' or jsonb_typeof(new.request)<>'object' or new.request-array['kind','filters','group_by','metric','date_field']<>'{}' or octet_length(new.request::text)>16384 then raise exception 'Invalid shared aggregate' using errcode='22023';end if;
 new.cache_key:=md5(new.request::text);new.revision:=relay_private.crm_read_revision(new.workspace_id);
 new.expires_at:=now()+interval '20 seconds';
 new.value:=jsonb_build_object('result',public.dashboard_aggregate(new.workspace_id,'record',coalesce(new.request->'filters','{}'),coalesce(new.request->>'group_by','none'),coalesce(new.request->>'metric','count'),coalesce(new.request->>'date_field','created')));
 return new;
end $$;
revoke all on function relay_private.compute_record_cache() from public,anon,authenticated,service_role;
create trigger compute_record_cache before insert or update on relay_private.crm_record_aggregate_cache for each row execute function relay_private.compute_record_cache();

create function relay_private.shared_record_aggregate(w uuid,q jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare k text:=md5(q::text);v jsonb;rev bigint;begin
 if not (w in(select relay_private.full_record_workspaces())) then raise exception 'Full record scope required' using errcode='42501';end if;
 -- One computation across replicas for matching queries. A single lock per
 -- workspace prevents opposite tile orders from deadlocking each other.
 perform pg_advisory_xact_lock(hashtextextended('crm-record-cache:'||w::text,0));
 rev:=relay_private.crm_read_revision(w);
 select value into v from relay_private.crm_record_aggregate_cache where workspace_id=w and cache_key=k and revision=rev and expires_at>now();
 if v is not null then return v;end if;
 update relay_private.crm_record_aggregate_cache set request=q where workspace_id=w and cache_key=k returning value into v;
 if not found then
  if (select count(*) from relay_private.crm_record_aggregate_cache where workspace_id=w)>=100 then
   return jsonb_build_object('result',public.dashboard_aggregate(w,'record',coalesce(q->'filters','{}'),coalesce(q->>'group_by','none'),coalesce(q->>'metric','count'),coalesce(q->>'date_field','created')));
  end if;
  insert into relay_private.crm_record_aggregate_cache(workspace_id,cache_key,request,revision,expires_at,value) values(w,k,q,0,now(),'{}') returning value into v;
 end if;
 return v;
end $$;
revoke all on function relay_private.shared_record_aggregate(uuid,jsonb) from public,anon;
grant execute on function relay_private.shared_record_aggregate(uuid,jsonb) to authenticated;

do $$ declare source text;before text;after text;begin
 source:=pg_get_functiondef('public.dashboard_batch(uuid,jsonb)'::regprocedure);
 before:='cached:=relay_private.crm_cache_read(w,k);';
 after:='if q->>''kind''=''record'' and w in(select relay_private.full_record_workspaces()) then
   begin value:=relay_private.shared_record_aggregate(w,q);
   exception when invalid_parameter_value then value:=jsonb_build_object(''error'',''Indicateur ou filtre invalide.'');end;
   memo:=memo||jsonb_build_object(k,value);output:=output||jsonb_build_array(value);continue;
  end if;
  cached:=relay_private.crm_cache_read(w,k);';
 if strpos(source,before)=0 then raise exception 'Unexpected dashboard batch';end if;
 execute replace(source,before,after);
 source:=pg_get_functiondef('relay_private.crm_runtime_maintenance()'::regprocedure);
 before:='delete from relay_private.crm_aggregate_cache';
 after:='delete from relay_private.crm_record_aggregate_cache where (workspace_id,cache_key) in(select workspace_id,cache_key from relay_private.crm_record_aggregate_cache where expires_at<now() order by expires_at limit 10000);
 delete from relay_private.crm_aggregate_cache';
 if strpos(source,before)=0 then raise exception 'Unexpected cache maintenance';end if;
 execute replace(source,before,after);
end $$;
commit;
