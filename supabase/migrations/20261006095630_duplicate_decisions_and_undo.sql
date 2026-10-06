begin;
alter table public.merge_history add column restorable boolean not null default false;
alter table public.merge_history add column undone_at timestamptz;
alter table public.merge_history add column undone_by uuid references auth.users(id);
create table relay_private.merge_restore_points (
 id uuid primary key references public.merge_history(id), workspace_id uuid not null references public.workspaces(id),
 before_state jsonb not null, after_state jsonb not null
);
alter table relay_private.merge_restore_points enable row level security;
revoke all on relay_private.merge_restore_points from public,anon,authenticated;
create table public.duplicate_decisions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 record_a uuid not null,record_b uuid not null,status text not null check(status in('separate','deferred')),
 defer_until timestamptz,actor_id uuid not null references auth.users(id),version_a integer not null,version_b integer not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,record_a,record_b),check(record_a<record_b),
 check((status='separate' and defer_until is null) or (status='deferred' and defer_until is not null)),
 foreign key(workspace_id,record_a) references public.records(workspace_id,id),
 foreign key(workspace_id,record_b) references public.records(workspace_id,id)
);
alter table public.duplicate_decisions enable row level security;
create policy duplicate_decisions_read on public.duplicate_decisions for select to authenticated using(relay_private.has_role(workspace_id));
grant select on public.duplicate_decisions to authenticated;
revoke insert,update,delete on public.duplicate_decisions from anon,authenticated;
create trigger audit after insert or update or delete on public.duplicate_decisions for each row execute function relay_private.audit_change();
create trigger audit after insert or update on public.merge_history for each row execute function relay_private.audit_change();

-- Lock both previous and next parent references, including deletes.
create or replace function relay_private.reject_merged_reference() returns trigger language plpgsql security invoker set search_path='' as $$
declare js jsonb; oldjs jsonb; ids uuid[]:='{}'; rid uuid; found_merge uuid; w uuid;
begin
 js:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 oldjs:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 w:=(js->>'workspace_id')::uuid;
 if tg_table_name='record_relations' then
  ids:=array[(js->>'source_id')::uuid,(js->>'target_id')::uuid,(oldjs->>'source_id')::uuid,(oldjs->>'target_id')::uuid];
 elsif tg_table_name in('portal_items','portal_members','portal_comments') then
  select array_agg(record_id) into ids from public.portals where workspace_id=w and id in((js->>'portal_id')::uuid,(oldjs->>'portal_id')::uuid);
 else ids:=array[(js->>'record_id')::uuid,(oldjs->>'record_id')::uuid];end if;
 for rid in select distinct x from unnest(ids) x where x is not null order by x loop
  select merged_into into found_merge from public.records where workspace_id=w and id=rid for key share;
  if tg_op<>'DELETE' and found_merge is not null then raise exception 'Cette fiche a été fusionnée. Ouvrez la fiche conservée.' using errcode='23514';end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$declare tbl text;begin
 foreach tbl in array array['tasks','notes','activities','documents','meetings','commitments','conflicts','portals','handovers','enrollments','list_entries','record_relations','portal_items','portal_members','portal_comments'] loop
 execute format('drop trigger if exists reject_merged_reference on public.%I',tbl);
 execute format('create trigger reject_merged_reference before insert or update or delete on public.%I for each row execute function relay_private.reject_merged_reference()',tbl);
 end loop;
end $$;
create or replace function relay_private.protect_merged_record() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon') then
  if (tg_op='INSERT' and new.merged_into is not null) or (tg_op='UPDATE' and new.merged_into is distinct from old.merged_into) then raise exception 'La fusion nécessite la procédure dédiée.' using errcode='42501';end if;
  if tg_op='UPDATE' and old.merged_into is not null and (not new.archived or new.object_id<>old.object_id) then raise exception 'Une fiche fusionnée reste archivée.' using errcode='23514';end if;
 end if;
 if tg_op='UPDATE' and old.merged_into is not null then perform id from public.records where workspace_id=old.workspace_id and id=old.merged_into for key share;end if;
 return new;
end $$;

-- Complete snapshots stay private: they may include notes and private list metadata.
create function relay_private.merge_state(w uuid,src uuid,dst uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; rows jsonb; tbl text;begin
 select coalesce(jsonb_agg(to_jsonb(r)-'search' order by r.id),'[]'::jsonb) into rows from public.records r where workspace_id=w and (id in(src,dst) or merged_into in(src,dst));
 result:=jsonb_build_object('records',rows);
 foreach tbl in array array['tasks','notes','activities','documents','meetings','commitments','conflicts','portals','handovers','enrollments','list_entries'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id),''[]''::jsonb) from public.%I r where r.workspace_id=$1 and r.record_id=any($2)',tbl) into rows using w,array[src,dst];
 result:=jsonb_set(result,array[tbl],rows);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into rows from public.record_relations r where workspace_id=w and (source_id in(src,dst) or target_id in(src,dst));
 result:=jsonb_set(result,'{record_relations}',rows);
 foreach tbl in array array['portal_items','portal_members','portal_comments'] loop
 execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id),''[]''::jsonb) from public.%I r join public.portals p on p.id=r.portal_id and p.workspace_id=r.workspace_id where p.workspace_id=$1 and p.record_id=any($2)',tbl) into rows using w,array[src,dst];
 result:=jsonb_set(result,array[tbl],rows);
 end loop;
 return result;
end $$;
revoke all on function relay_private.merge_state(uuid,uuid,uuid) from public,anon,authenticated;
alter function relay_private.merge_records(uuid,uuid,uuid,integer,integer,jsonb) rename to merge_records_v1;
revoke all on function relay_private.merge_records_v1(uuid,uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
create function relay_private.merge_records(w uuid,src uuid,dst uuid,sv integer,tv integer,picks jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare before_state jsonb; result jsonb; mid uuid;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Fusion réservée aux administrateurs' using errcode='42501';end if;
 perform id from public.records where workspace_id=w and id in(src,dst) order by id for update;
 perform id from public.portals where workspace_id=w and record_id in(src,dst) order by id for update;
 if exists(select 1 from public.duplicate_decisions where workspace_id=w and record_a=least(src,dst) and record_b=greatest(src,dst) and (status='separate' or defer_until>now())) then raise exception 'Cette paire a été gardée séparée ou reportée. Rouvrez la décision avant de fusionner.' using errcode='22023';end if;
 before_state:=relay_private.merge_state(w,src,dst);
 result:=relay_private.merge_records_v1(w,src,dst,sv,tv,picks);
 select id into mid from public.merge_history where workspace_id=w and source_id=src and target_id=dst and not restorable and undone_at is null order by created_at desc,id limit 1;
 if mid is null then raise exception 'Journal de fusion manquant';end if;
 insert into relay_private.merge_restore_points(id,workspace_id,before_state,after_state) values(mid,w,before_state,relay_private.merge_state(w,src,dst));
 update public.merge_history set restorable=true where id=mid;
 return result||jsonb_build_object('merge_id',mid);
end $$;
revoke all on function relay_private.merge_records(uuid,uuid,uuid,integer,integer,jsonb) from public,anon;
grant execute on function relay_private.merge_records(uuid,uuid,uuid,integer,integer,jsonb) to authenticated;

create function relay_private.decide_duplicate(w uuid,a uuid,b uuid,av integer,bv integer,decision text) returns uuid language plpgsql security definer set search_path='' as $$
declare ra public.records; rb public.records; did uuid;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Accès en lecture seule ou interdit' using errcode='42501';end if;
 if a=b or decision not in('separate','deferred','reopen') or decision is null then raise exception 'Décision invalide' using errcode='22023';end if;
 perform id from public.records where workspace_id=w and id in(a,b) order by id for update;
 select * into ra from public.records where workspace_id=w and id=a;
 select * into rb from public.records where workspace_id=w and id=b;
 if ra.id is null or rb.id is null then raise exception 'Fiches inaccessibles' using errcode='22023';end if;
 if decision='reopen' then delete from public.duplicate_decisions where workspace_id=w and record_a=least(a,b) and record_b=greatest(a,b);return null;end if;
 if ra.archived or rb.archived or ra.object_id<>rb.object_id then raise exception 'Fiches incompatibles' using errcode='22023';end if;
 if av is null or bv is null or ra.version<>av or rb.version<>bv then raise exception 'Une fiche a changé. Recalculez la comparaison.' using errcode='40001';end if;
 insert into public.duplicate_decisions(workspace_id,record_a,record_b,status,defer_until,actor_id,version_a,version_b)
 values(w,least(a,b),greatest(a,b),decision,case when decision='deferred' then now()+interval '7 days' end,auth.uid(),case when a<b then av else bv end,case when a<b then bv else av end)
 on conflict(workspace_id,record_a,record_b) do update set status=excluded.status,defer_until=excluded.defer_until,actor_id=excluded.actor_id,version_a=excluded.version_a,version_b=excluded.version_b,updated_at=now()
 returning id into did;
 return did;
end $$;
create function public.decide_duplicate(w uuid,a uuid,b uuid,av integer,bv integer,decision text) returns uuid language sql security invoker set search_path='' as $$select relay_private.decide_duplicate(w,a,b,av,bv,decision);$$;
revoke all on function relay_private.decide_duplicate(uuid,uuid,uuid,integer,integer,text),public.decide_duplicate(uuid,uuid,uuid,integer,integer,text) from public,anon;
grant execute on function relay_private.decide_duplicate(uuid,uuid,uuid,integer,integer,text),public.decide_duplicate(uuid,uuid,uuid,integer,integer,text) to authenticated;

create function relay_private.preview_undo_merge(w uuid,mid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.merge_history; point relay_private.merge_restore_points; src public.records; dst public.records; valid boolean;reason text;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Annulation réservée aux administrateurs' using errcode='42501';end if;
 select * into h from public.merge_history where workspace_id=w and id=mid;
 if h.id is null then raise exception 'Fusion inaccessible' using errcode='22023';end if;
 select * into point from relay_private.merge_restore_points where workspace_id=w and id=mid;
 select * into src from public.records where workspace_id=w and id=h.source_id;
 select * into dst from public.records where workspace_id=w and id=h.target_id;
 valid:=point.id is not null and h.undone_at is null and point.after_state=relay_private.merge_state(w,h.source_id,h.target_id);
 reason:=case when h.undone_at is not null then 'Cette fusion est déjà annulée.' when point.id is null then 'Cette ancienne fusion ne possède pas de sauvegarde complète.' when not valid then 'Une fiche ou son contexte a changé depuis la fusion. Annulation bloquée pour conserver ces changements.' else null end;
 return jsonb_build_object('id',h.id,'available',valid,'reason',reason,'source_version',src.version,'target_version',dst.version,'source_name',h.snapshot->'source'->>'display_name','target_name',h.snapshot->'target'->>'display_name');
end $$;
create function public.preview_undo_merge(w uuid,mid uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.preview_undo_merge(w,mid);$$;
revoke all on function relay_private.preview_undo_merge(uuid,uuid),public.preview_undo_merge(uuid,uuid) from public,anon;
grant execute on function relay_private.preview_undo_merge(uuid,uuid),public.preview_undo_merge(uuid,uuid) to authenticated;

create function relay_private.undo_merge(w uuid,mid uuid,sv integer,tv integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.merge_history; point relay_private.merge_restore_points; r public.records; src public.records; dst public.records; tbl text;begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Annulation réservée aux administrateurs' using errcode='42501';end if;
 select * into h from public.merge_history where workspace_id=w and id=mid;
 if h.id is null then raise exception 'Fusion inaccessible' using errcode='22023';end if;
 perform id from public.records where workspace_id=w and id in(h.source_id,h.target_id) order by id for update;
 select * into h from public.merge_history where workspace_id=w and id=mid for update;
 if h.undone_at is not null then return jsonb_build_object('id',h.target_id,'source_id',h.source_id,'already_undone',true);end if;
 perform id from public.portals where workspace_id=w and record_id in(h.source_id,h.target_id) order by id for update;
 select * into point from relay_private.merge_restore_points where workspace_id=w and id=mid;
 if point.id is null then raise exception 'Cette ancienne fusion ne possède pas de sauvegarde complète.' using errcode='22023';end if;
 select * into src from public.records where workspace_id=w and id=h.source_id;
 select * into dst from public.records where workspace_id=w and id=h.target_id;
 if sv is null or tv is null or src.version<>sv or dst.version<>tv or relay_private.merge_state(w,h.source_id,h.target_id)<>point.after_state then raise exception 'Une fiche ou son contexte a changé depuis la fusion. Annulation bloquée pour conserver ces changements.' using errcode='40001';end if;
 -- Restore fields without rolling version counters back.
 for r in select * from jsonb_populate_recordset(null::public.records,point.before_state->'records') order by id loop
  if r.id in(h.source_id,h.target_id) then
   update public.records set display_name=r.display_name,email=r.email,domain=r.domain,stage=r.stage,amount=r.amount,currency=r.currency,owner_id=r.owner_id,close_date=r.close_date,attributes=r.attributes,archived=r.archived,merged_into=r.merged_into where workspace_id=w and id=r.id;
  else update public.records set merged_into=r.merged_into where workspace_id=w and id=r.id and merged_into is distinct from r.merged_into;end if;
 end loop;
 foreach tbl in array array['tasks','notes','activities','documents','meetings','commitments','conflicts','portals','handovers','enrollments'] loop
 execute format('update public.%I set record_id=$1 where workspace_id=$2 and id in(select (j->>''id'')::uuid from jsonb_array_elements($3) j where j->>''record_id''=$1::text)',tbl) using h.source_id,w,point.before_state->tbl;
 end loop;
 delete from public.list_entries where workspace_id=w and record_id in(h.source_id,h.target_id);
 insert into public.list_entries select * from jsonb_populate_recordset(null::public.list_entries,point.before_state->'list_entries');
 delete from public.record_relations where workspace_id=w and (source_id in(h.source_id,h.target_id) or target_id in(h.source_id,h.target_id));
 insert into public.record_relations select * from jsonb_populate_recordset(null::public.record_relations,point.before_state->'record_relations');
 update public.merge_history set undone_at=now(),undone_by=auth.uid() where workspace_id=w and id=mid;
 return jsonb_build_object('id',h.target_id,'source_id',h.source_id,'already_undone',false);
end $$;
create function public.undo_merge(w uuid,mid uuid,sv integer,tv integer) returns jsonb language sql security invoker set search_path='' as $$select relay_private.undo_merge(w,mid,sv,tv);$$;
revoke all on function relay_private.undo_merge(uuid,uuid,integer,integer),public.undo_merge(uuid,uuid,integer,integer) from public,anon;
grant execute on function relay_private.undo_merge(uuid,uuid,integer,integer),public.undo_merge(uuid,uuid,integer,integer) to authenticated;
commit;
