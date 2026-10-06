begin;
drop policy if exists portal_members_self_read on public.portal_members;
create policy portal_members_self_read on public.portal_members for select to authenticated using(user_id=(select auth.uid()) and not revoked and (expires_at is null or expires_at>now()));
create or replace function relay_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;a jsonb;w uuid;who uuid;begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 w:=coalesce((a->>'workspace_id')::uuid,(b->>'workspace_id')::uuid);who:=(select auth.uid());
 if who is not null and not relay_private.has_role(w) then raise exception 'Forbidden';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data,private_to)
 values(w,who,tg_table_name,coalesce((a->>'id')::uuid,(b->>'id')::uuid),lower(tg_op),b,a,
 case when tg_table_name='notes' and (coalesce((a->>'private')::boolean,false) or coalesce((b->>'private')::boolean,false)) then coalesce((a->>'author_id')::uuid,(b->>'author_id')::uuid) else null end);
 return coalesce(new,old);
end $$;
revoke all on function relay_private.audit_change() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['objects','attributes'] loop
 execute format('drop policy %I on public.%I',t||'_insert',t);
 execute format('drop policy %I on public.%I',t||'_update',t);
 execute format('drop policy %I on public.%I',t||'_delete',t);
 execute format('create policy %I on public.%I for insert to authenticated with check(relay_private.has_role(workspace_id,array[''owner'',''admin'']))',t||'_insert',t);
 execute format('create policy %I on public.%I for update to authenticated using(relay_private.has_role(workspace_id,array[''owner'',''admin''])) with check(relay_private.has_role(workspace_id,array[''owner'',''admin'']))',t||'_update',t);
 execute format('create policy %I on public.%I for delete to authenticated using(relay_private.has_role(workspace_id,array[''owner'',''admin'']))',t||'_delete',t);
 end loop;
end $$;
create function relay_private.lock_workspace_identity() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.id<>old.id or new.owner_id<>old.owner_id then raise exception 'Workspace identity is immutable';end if;return new;end $$;
revoke all on function relay_private.lock_workspace_identity() from public,anon,authenticated;
create trigger workspace_identity before update on public.workspaces for each row execute function relay_private.lock_workspace_identity();
commit;
