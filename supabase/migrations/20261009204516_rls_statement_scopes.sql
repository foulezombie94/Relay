begin;
set local lock_timeout='5s';
create index reader_access_user_scope_idx on relay_private.reader_record_access(user_id,workspace_id,record_id);
-- The same membership/grant predicates as has_role, reader_limited and
-- reader_record_allowed, expressed as uncorrelated statement subplans. No
-- request cache or JWT claim substitutes for current database permissions.
create function relay_private.member_workspaces() returns setof uuid
language sql stable security definer set search_path='' as $$
 select m.workspace_id from public.memberships m where m.user_id=(select auth.uid()) and m.role in ('owner','admin','member','viewer')
$$;
create function relay_private.limited_reader_workspaces() returns setof uuid
language sql stable security definer set search_path='' as $$
 select m.workspace_id from public.memberships m where m.user_id=(select auth.uid()) and m.role='viewer' and m.reader_scope='selected'
$$;
create function relay_private.reader_granted_records() returns table(workspace_id uuid,record_id uuid)
language sql stable security definer set search_path='' as $$
 select a.workspace_id,a.record_id from relay_private.reader_record_access a join public.memberships m on m.workspace_id=a.workspace_id and m.user_id=a.user_id
 where a.user_id=(select auth.uid()) and m.role='viewer' and m.reader_scope='selected'
$$;
revoke all on function relay_private.member_workspaces(),relay_private.limited_reader_workspaces(),relay_private.reader_granted_records() from public,anon;
grant execute on function relay_private.member_workspaces(),relay_private.limited_reader_workspaces(),relay_private.reader_granted_records() to authenticated;
do $$ declare p record;q text;c text;col text;begin
 for p in select * from pg_policies where schemaname='public' and cmd='SELECT' and roles=array['authenticated']::name[] and qual like '%relay_private.has_role(workspace_id)%' loop
  q:=replace(p.qual,'relay_private.has_role(workspace_id)','(workspace_id in (select relay_private.member_workspaces()))');
  execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,q);
 end loop;
 for p in select * from pg_policies where schemaname='public' and policyname='reader_visibility' and permissive='RESTRICTIVE' loop
  q:=replace(p.qual,'relay_private.reader_limited(workspace_id)','(workspace_id in (select relay_private.limited_reader_workspaces()))');
  c:=replace(p.with_check,'relay_private.reader_limited(workspace_id)','(workspace_id in (select relay_private.limited_reader_workspaces()))');
  foreach col in array array['id','record_id','source_id','target_id'] loop
   q:=replace(q,'relay_private.reader_record_allowed(workspace_id, '||col||')','((workspace_id,'||col||') in (select g.workspace_id,g.record_id from relay_private.reader_granted_records() g))');
   c:=replace(c,'relay_private.reader_record_allowed(workspace_id, '||col||')','((workspace_id,'||col||') in (select g.workspace_id,g.record_id from relay_private.reader_granted_records() g))');
  end loop;
  execute format('alter policy %I on public.%I using (%s) with check (%s)',p.policyname,p.tablename,q,c);
 end loop;
end $$;
commit;
