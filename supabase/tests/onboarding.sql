-- Isolated fixtures, never run on a hosted Supabase project.
begin;
set local statement_timeout = '30s';
do $$
declare
  who uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  attempt uuid := gen_random_uuid(); second_attempt uuid := gen_random_uuid(); result uuid;
begin
  insert into auth.users(id, email) values(who, 'onboarding-'||who||'@example.test'), (other_user, 'onboarding-'||other_user||'@example.test');
  if has_function_privilege('anon', 'public.create_onboarding_workspace(text,text,text,uuid)', 'execute')
    or has_function_privilege('anon', 'relay_private.create_onboarding_workspace(text,text,text,uuid)', 'execute')
  then raise exception 'Anonymous signup workspace execution granted'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.create_onboarding_workspace('Studio', 'Camille Martin', 'Europe/Paris', attempt);
    raise exception 'Missing authentication accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', who::text, true);
  execute 'set local role authenticated';
  begin
    perform public.create_onboarding_workspace(' ', 'Camille Martin', 'Europe/Paris', attempt);
    raise exception 'Empty label accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_onboarding_workspace('Studio', 'Camille Martin', 'invalid/zone', attempt);
    raise exception 'Invalid timezone accepted';
  exception when invalid_parameter_value then null; end;
  result := public.create_onboarding_workspace(' Studio ', ' Camille Martin ', 'Europe/Paris', attempt);
  if result <> attempt then raise exception 'Workspace acknowledgement mismatch'; end if;
  if (select count(*) from public.objects where workspace_id=attempt and standard) <> 3
    or not exists(select 1 from public.memberships where workspace_id=attempt and user_id=who and role='owner' and display_name='Camille Martin')
    or not exists(select 1 from public.workspaces where id=attempt and owner_id=who and name='Studio' and timezone='Europe/Paris')
  then raise exception 'Incomplete workspace transaction'; end if;
  result := public.create_onboarding_workspace('Studio', 'Camille Martin', 'Europe/Paris', attempt);
  if result <> attempt then raise exception 'Retry changed workspace'; end if;
  result := public.create_onboarding_workspace('Studio', 'Camille Martin', 'Europe/Paris', second_attempt);
  if result <> attempt then raise exception 'New key duplicated first workspace'; end if;
  if (select count(*) from public.memberships where user_id=who) <> 1 then raise exception 'Duplicate membership'; end if;
  begin
    perform public.create_onboarding_workspace('Other space', 'Camille Martin', 'Europe/Paris', second_attempt);
    raise exception 'Second first-workspace accepted';
  exception when unique_violation then null; end;
  begin
    perform public.create_onboarding_workspace('Changed name', 'Camille Martin', 'Europe/Paris', attempt);
    raise exception 'Conflicting retry accepted';
  exception when unique_violation then null; end;
  perform set_config('request.jwt.claim.sub', other_user::text, true);
  if exists(select 1 from public.workspaces where id=attempt) then raise exception 'Workspace RLS leak'; end if;
  begin
    perform public.create_onboarding_workspace('Studio', 'Other Person', 'Europe/Paris', attempt);
    raise exception 'Foreign attempt accepted';
  exception when unique_violation then null; end;
  if exists(select 1 from public.memberships where workspace_id=attempt) then raise exception 'Cross-user membership leak'; end if;
  execute 'reset role';
end $$;
rollback;
select 'Onboarding: Auth, validation, atomic setup, retries and workspace isolation passed' as result;
