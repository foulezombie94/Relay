-- A first workspace is created atomically. The caller's user ID always comes
-- from verified Auth claims, never from profile metadata or request parameters.
create function relay_private.create_onboarding_workspace(label text, person_name text, zone text, attempt uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  who uuid := (select auth.uid());
  existing public.workspaces;
begin
  if who is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if attempt is null or label is null or length(trim(label)) not between 1 and 120
     or person_name is null or length(trim(person_name)) not between 2 and 80
     or zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name = zone)
  then raise exception 'Invalid onboarding details' using errcode = '22023'; end if;

  -- Serialize first-workspace creation across tabs and retried requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relay:onboarding:' || who::text, 0));
  select * into existing from public.workspaces where id = attempt;
  if found then
    if existing.owner_id = who and existing.name = trim(label) and existing.timezone = zone
       and exists(select 1 from public.memberships where workspace_id = existing.id and user_id = who and role = 'owner')
    then return existing.id; end if;
    raise exception 'Workspace creation conflict' using errcode = '23505';
  end if;
  if exists(select 1 from public.memberships where user_id = who) then
    -- A response may have been lost and the browser may have generated another
    -- key. Resume the same owned workspace without producing a second one.
    select w.* into existing from public.workspaces w
      join public.memberships m on m.workspace_id = w.id
      where m.user_id = who and m.role = 'owner' and w.owner_id = who
        and w.name = trim(label) and w.timezone = zone order by w.created_at limit 1;
    if found then return existing.id; end if;
    raise exception 'A workspace already exists. Reload to continue.' using errcode = '23505';
  end if;
  insert into public.workspaces(id, name, owner_id, timezone) values(attempt, trim(label), who, zone);
  insert into public.memberships(workspace_id, user_id, role, display_name) values(attempt, who, 'owner', trim(person_name));
  insert into public.objects(workspace_id, name, slug, icon, standard) values
    (attempt, 'Personnes', 'people', 'users', true),
    (attempt, 'Entreprises', 'companies', 'building', true),
    (attempt, 'Opportunités', 'deals', 'layers', true);
  return attempt;
end $$;
revoke all on function relay_private.create_onboarding_workspace(text, text, text, uuid) from public, anon;
grant execute on function relay_private.create_onboarding_workspace(text, text, text, uuid) to authenticated;
create function public.create_onboarding_workspace(label text, person_name text, zone text, attempt uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select relay_private.create_onboarding_workspace(label, person_name, zone, attempt);
$$;
revoke all on function public.create_onboarding_workspace(text, text, text, uuid) from public, anon;
grant execute on function public.create_onboarding_workspace(text, text, text, uuid) to authenticated;
