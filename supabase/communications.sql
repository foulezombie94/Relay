begin;
create table public.communications(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id),integration_id uuid not null,provider_id text not null,kind text not null check(kind in ('email','calendar')),
 subject text not null default '',sender text,recipients text[] not null default '{}',body text not null default '',starts_at timestamptz,received_at timestamptz,created_at timestamptz not null default now(),
 foreign key(workspace_id,integration_id) references public.integrations(workspace_id,id) on delete cascade,unique(integration_id,kind,provider_id)
);
create index communications_owner_idx on public.communications(workspace_id,user_id,received_at desc);
create index communications_integration_idx on public.communications(integration_id);
alter table public.communications enable row level security;
create policy communications_read on public.communications for select to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id));
create policy communications_insert on public.communications for insert to authenticated with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']) and exists(select 1 from public.integrations i where i.id=integration_id and i.user_id=(select auth.uid()) and i.workspace_id=communications.workspace_id));
create policy communications_update on public.communications for update to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member'])) with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id,array['owner','admin','member']));
grant select,insert,update on public.communications to authenticated;
create trigger immutable_workspace before update on public.communications for each row execute function relay_private.immutable_workspace();
create function public.integration_touch(w uuid,p text) returns void language sql security definer set search_path='' as $$
 update public.integrations set last_sync=now() where workspace_id=w and provider=p and user_id=(select auth.uid()) and relay_private.has_role(w,array['owner','admin','member'])
$$;
revoke all on function public.integration_touch(uuid,text) from public,anon;
grant execute on function public.integration_touch(uuid,text) to authenticated;
commit;
