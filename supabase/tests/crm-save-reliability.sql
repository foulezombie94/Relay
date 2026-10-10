-- Run only through the local test runner. Every fixture is rolled back.
begin;
set local statement_timeout = '30s';
do $$
declare
  owner_user uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
  viewer_user uuid := gen_random_uuid();
  workspace uuid; other_workspace uuid; object_id uuid;
  saved public.records; affected integer; attempt uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) select u, 'save-'||u||'@example.test'
  from unnest(array[owner_user,other_user,viewer_user]) u;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  workspace := public.create_workspace('Save reliability local test');
  select id into object_id from public.objects where workspace_id=workspace and slug='people';
  insert into public.memberships(workspace_id,user_id,role,reader_scope)
  values(workspace,viewer_user,'viewer','all');
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  other_workspace := public.create_workspace('Other local test workspace');
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  execute 'set local role authenticated';
  insert into public.records(id,workspace_id,object_id,display_name,email)
  values(attempt,workspace,object_id,'Confirmed contact','save@example.test') returning * into saved;
  get diagnostics affected = row_count;
  if affected <> 1 or saved.id <> attempt then raise exception 'Creation was not confirmed'; end if;
  begin
    insert into public.records(id,workspace_id,object_id,display_name,email)
    values(attempt,workspace,object_id,'Confirmed contact','save@example.test');
    raise exception 'Retry duplicated the record';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.records where id=attempt) <> 1 then raise exception 'Idempotency violated'; end if;
  update public.records set display_name='Updated contact' where id=attempt and version=saved.version returning * into saved;
  get diagnostics affected = row_count;
  if affected <> 1 or saved.display_name <> 'Updated contact' then raise exception 'Update was not confirmed'; end if;
  update public.records set display_name='Stale edit' where id=attempt and version=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale update overwrote data'; end if;
  if exists(select 1 from public.records where workspace_id=other_workspace) then raise exception 'Workspace leak'; end if;
  perform set_config('request.jwt.claim.sub',viewer_user::text,true);
  update public.records set display_name='Forbidden edit' where id=attempt;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Viewer write succeeded'; end if;
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  if exists(select 1 from public.records where id=attempt) then raise exception 'Other workspace read succeeded'; end if;
  update public.records set display_name='Foreign edit' where id=attempt;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other workspace write succeeded'; end if;
  execute 'reset role';
end $$;
rollback;
select 'CRM save: confirmed creation/update, retry uniqueness, stale versions, viewer denial and workspace isolation passed' as result;
