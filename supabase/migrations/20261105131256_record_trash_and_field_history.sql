-- Trash: a deleted record is archived with who/when; it can be restored, or
-- purged by an administrator (automatically 30 days after deletion).
-- Field history: per-field changes derived from the existing record audit.
begin;
set local lock_timeout='5s';

alter table public.records add column deleted_at timestamptz, add column deleted_by uuid;
update public.records set deleted_at=updated_at where archived and merged_into is null and deleted_at is null;
create index records_trash_idx on public.records(workspace_id,deleted_at desc,id) where archived and merged_into is null;

create function relay_private.record_trash_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.archived and new.merged_into is null and (tg_op='INSERT' or not old.archived) then
  new.deleted_at:=now();new.deleted_by:=(select auth.uid());
 elsif not new.archived then
  new.deleted_at:=null;new.deleted_by:=null;
 elsif tg_op='UPDATE' then
  new.deleted_at:=old.deleted_at;new.deleted_by:=old.deleted_by;
 end if;
 return new;
end $$;
revoke all on function relay_private.record_trash_stamp() from public,anon,authenticated;
create trigger record_trash_stamp before insert or update of archived,deleted_at,deleted_by on public.records
 for each row execute function relay_private.record_trash_stamp();

-- Restores records the caller can write. Merged records go through merge undo.
create function public.restore_records(w uuid,ids uuid[]) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 if coalesce(cardinality(ids),0) not between 1 and 100 then raise exception 'Relay: Sélectionnez entre 1 et 100 fiches.' using errcode='22023';end if;
 update public.records set archived=false where workspace_id=w and id=any(ids) and archived and merged_into is null;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.restore_records(uuid,uuid[]) from public,anon;
grant execute on function public.restore_records(uuid,uuid[]) to authenticated;

-- Permanent deletion; each deleted row is recorded by the audit trigger. A record still referenced by protected evidence
-- (documents, commitments, meetings...) stays in the trash and is reported.
create function relay_private.purge_record(w uuid,rec uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 delete from public.records where workspace_id=w and id=rec and archived and merged_into is null
  and not exists(select 1 from public.records m where m.workspace_id=w and m.merged_into=rec);
 return found;
exception when foreign_key_violation then return false;
end $$;
revoke all on function relay_private.purge_record(uuid,uuid) from public,anon;
grant execute on function relay_private.purge_record(uuid,uuid) to authenticated,service_role;

create function public.purge_records(w uuid,ids uuid[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rec uuid;purged integer:=0;kept integer:=0;
begin
 if not relay_private.has_role(w,array['owner','admin']) then raise exception 'Forbidden' using errcode='42501';end if;
 if coalesce(cardinality(ids),0) not between 1 and 100 then raise exception 'Relay: Sélectionnez entre 1 et 100 fiches.' using errcode='22023';end if;
 foreach rec in array ids loop
  if relay_private.purge_record(w,rec) then purged:=purged+1;else kept:=kept+1;end if;
 end loop;
 return jsonb_build_object('purged',purged,'kept',kept);
end $$;
revoke all on function public.purge_records(uuid,uuid[]) from public,anon;
grant execute on function public.purge_records(uuid,uuid[]) to authenticated;

-- Worker retention: records deleted more than 30 days ago, in bounded batches.
create function relay_private.purge_expired_trash(batch integer default 200) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare r record;purged integer:=0;kept integer:=0;
begin
 for r in select workspace_id,id from public.records where archived and merged_into is null and deleted_at<now()-interval '30 days'
  order by deleted_at limit least(greatest(batch,1),1000) for update skip locked loop
  if relay_private.purge_record(r.workspace_id,r.id) then purged:=purged+1;else kept:=kept+1;end if;
 end loop;
 return jsonb_build_object('purged',purged,'kept',kept);
end $$;
revoke all on function relay_private.purge_expired_trash(integer) from public,anon,authenticated;
grant execute on function relay_private.purge_expired_trash(integer) to service_role;
create function public.purge_expired_trash(batch integer default 200) returns jsonb
language sql security invoker set search_path='' as $$ select relay_private.purge_expired_trash(batch); $$;
revoke all on function public.purge_expired_trash(integer) from public,anon,authenticated;
grant execute on function public.purge_expired_trash(integer) to service_role;

-- Field-level history. SECURITY INVOKER: audit RLS (tenant, reader scope) applies.
create function public.record_field_history(w uuid,rec uuid,field_filter text default null,
 before_at timestamptz default null,page_size integer default 50) returns jsonb
language plpgsql stable security invoker set search_path='' set statement_timeout='10s' as $$
declare result jsonb;
begin
 if not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 if field_filter is not null and field_filter !~ '^(display_name|email|domain|stage|amount|currency|owner_id|close_date|pipeline_id|probability|lost_reason|archived|attributes\.[a-z][a-z0-9_]{0,49})$' then
  raise exception 'Relay: Champ inconnu.' using errcode='22023';end if;
 with events as(
  select a.id,a.created_at,a.actor_id,a.action,a.before_data b,a.after_data n from public.audit_events a
  where a.workspace_id=w and a.entity='records' and a.entity_id=rec and (before_at is null or a.created_at<before_at)
  order by a.created_at desc,a.id desc limit 500
 ), changes as(
  select e.id,e.created_at,e.actor_id,e.action,(e.n->>'version')::integer as version,k.field,k.old_value,k.new_value from events e cross join lateral(
   select key as field,e.b->key as old_value,e.n->key as new_value from jsonb_object_keys(coalesce(e.n,'{}'::jsonb)||coalesce(e.b,'{}'::jsonb)) key
   where key in ('display_name','email','domain','stage','amount','currency','owner_id','close_date','pipeline_id','probability','lost_reason','archived')
    and (e.b->key) is distinct from (e.n->key) and not (e.action='insert' and (coalesce(e.n->key,'null'::jsonb)='null'::jsonb
     or key in ('archived','currency') or (key='amount' and e.n->key='0'::jsonb) or (key='stage' and coalesce(e.n->'pipeline_id','null'::jsonb)='null'::jsonb)))
   union all
   select 'attributes.'||key,e.b->'attributes'->key,e.n->'attributes'->key from jsonb_object_keys(coalesce(e.n->'attributes','{}'::jsonb)||coalesce(e.b->'attributes','{}'::jsonb)) key
   where (e.b->'attributes'->key) is distinct from (e.n->'attributes'->key) and not (e.action='insert' and coalesce(e.n->'attributes'->key,'null'::jsonb)='null'::jsonb)
  ) k where field_filter is null or k.field=field_filter
  order by e.created_at desc,(e.n->>'version')::integer desc nulls last,e.id desc,k.field limit least(greatest(page_size,1),200)
 )
 select coalesce(jsonb_agg(jsonb_build_object('event_id',c.id,'at',c.created_at,'actor_id',c.actor_id,
  'actor_name',(select m.display_name from public.memberships m where m.workspace_id=w and m.user_id=c.actor_id),
  'action',c.action,'field',c.field,'before',c.old_value,'after',c.new_value) order by c.created_at desc,c.version desc nulls last,c.id desc,c.field),'[]'::jsonb)
 into result from changes c;
 return result;
end $$;
revoke all on function public.record_field_history(uuid,uuid,text,timestamptz,integer) from public,anon;
grant execute on function public.record_field_history(uuid,uuid,text,timestamptz,integer) to authenticated;

commit;
