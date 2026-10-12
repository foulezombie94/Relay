-- Exercise the same explicit id and insert columns as POST /workflows.
-- All identities and data are local fixtures, rolled back after the test.
begin;
set local statement_timeout = '30s';
do $$
declare
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  member_a uuid := gen_random_uuid(); viewer_a uuid := gen_random_uuid();
  workspace_a uuid; workspace_b uuid; object_a uuid; object_b uuid;
  workflow_id uuid := gen_random_uuid(); member_workflow uuid := gen_random_uuid();
  definition jsonb; saved public.workflows;
begin
  insert into auth.users(id, email, aud, role)
  select id, 'workflow-create-' || id || '@example.invalid', 'authenticated', 'authenticated'
  from unnest(array[owner_a, owner_b, member_a, viewer_a]) id;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  workspace_a := public.create_workspace('Workflow creation fixture A');
  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  workspace_b := public.create_workspace('Workflow creation fixture B');
  insert into public.memberships(workspace_id, user_id, role)
  values (workspace_a, member_a, 'member'), (workspace_a, viewer_a, 'viewer');
  select id into object_a from public.objects where workspace_id = workspace_a and slug = 'people';
  select id into object_b from public.objects where workspace_id = workspace_b and slug = 'people';
  definition := jsonb_build_object('object_id', object_a, 'trigger', jsonb_build_object('type', 'manual'),
    'conditions', '[]'::jsonb, 'actions', jsonb_build_array(jsonb_build_object('type', 'task', 'title', 'Local task', 'days', 1)));
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- This failed with 42501 before the corrective migration, even for owners.
  insert into public.workflows(id, workspace_id, name, definition, description)
  values (workflow_id, workspace_a, 'Idempotent fixture', definition, '') returning * into saved;
  if saved.id <> workflow_id or saved.created_by <> owner_a or saved.enabled
    or saved.published_version is not null or saved.runner_id is not null or saved.version <> 1 then
    raise exception 'Creation changed identity or publication defaults';
  end if;
  begin
    insert into public.workflows(id, workspace_id, name, definition, description)
    values (workflow_id, workspace_a, 'Idempotent fixture', definition, '');
    raise exception 'Repeated creation duplicated the workflow';
  exception when unique_violation then null; end;
  if (select count(*) from public.workflows where workspace_id = workspace_a and id = workflow_id) <> 1 then
    raise exception 'Idempotent replay cannot read exactly one saved row';
  end if;
  update public.workflows set name = 'Updated draft' where id = workflow_id returning * into saved;
  if saved.version <> 2 or saved.enabled or saved.published_version is not null then
    raise exception 'Draft update changed publication state';
  end if;
  begin
    insert into public.workflows(id, workspace_id, name, definition, enabled)
    values (gen_random_uuid(), workspace_a, 'Forbidden activation', definition, true);
    raise exception 'Creation bypassed explicit publication';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.workflows(id, workspace_id, name, definition, created_by)
    values (gen_random_uuid(), workspace_a, 'Forbidden impersonation', definition, owner_b);
    raise exception 'Creation impersonated another user';
  exception when insufficient_privilege then null; end;
  begin
    update public.workflows set id = gen_random_uuid() where id = workflow_id;
    raise exception 'Workflow identity became mutable';
  exception when insufficient_privilege then null; end;
  begin
    update public.workflows set published_version = 2, enabled = true, runner_id = owner_a where id = workflow_id;
    raise exception 'Draft update bypassed publication';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', member_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', member_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.workflows(id, workspace_id, name, definition, description)
  values (member_workflow, workspace_a, 'Member draft', definition, '') returning * into saved;
  if saved.created_by <> member_a then raise exception 'Member creation lost its owner'; end if;
  update public.workflows set name = 'Forbidden other owner edit' where id = workflow_id;
  if found then raise exception 'Member edited another owner draft'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if exists(select 1 from public.workflows where id = workflow_id) then raise exception 'Other tenant read the draft'; end if;
  begin
    insert into public.workflows(id, workspace_id, name, definition, description)
    values (gen_random_uuid(), workspace_a, 'Forbidden other tenant creation', definition, '');
    raise exception 'Other tenant created a workflow';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', viewer_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.workflows(id, workspace_id, name, definition, description)
    values (gen_random_uuid(), workspace_a, 'Forbidden viewer creation', definition, '');
    raise exception 'Viewer created a workflow';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if not (select relrowsecurity from pg_class where oid = 'public.workflows'::regclass) then
    raise exception 'Workflow RLS disabled';
  end if;
end $$;
rollback;
select 'Explicit workflow id, retries, draft update, publication controls, owner isolation and tenant RLS OK' as result;
