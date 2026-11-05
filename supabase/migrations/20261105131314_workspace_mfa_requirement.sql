-- Two-factor authentication. Supabase Auth issues aal2 sessions after a TOTP
-- challenge. A workspace can require aal2 for every member: enforced inside
-- relay_private.has_role, so every RLS policy and RPC built on it applies it.
begin;
set local lock_timeout='5s';

alter table public.workspaces add column require_mfa boolean not null default false;

-- Server-set contexts (MCP gateway, SQL tests) carry no aal claim; Supabase
-- user tokens always do. A missing claim therefore never comes from a browser.
create function relay_private.session_aal2() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(nullif((select auth.jwt())->>'aal',''),'aal2')='aal2';
$$;
revoke all on function relay_private.session_aal2() from public,anon;
grant execute on function relay_private.session_aal2() to authenticated,service_role;

create or replace function relay_private.has_role(w uuid, roles text[] default array['owner','admin','member','viewer']) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.memberships m join public.workspaces ws on ws.id=m.workspace_id
  where m.workspace_id=w and m.user_id=(select auth.uid()) and m.role=any(roles)
  and (not ws.require_mfa or relay_private.session_aal2()));
$$;

-- Statement-scoped read policies use this set instead of has_role(workspace_id).
create or replace function relay_private.member_workspaces() returns setof uuid
language sql stable security definer set search_path='' as $$
 select m.workspace_id from public.memberships m join public.workspaces ws on ws.id=m.workspace_id
 where m.user_id=(select auth.uid()) and m.role in ('owner','admin','member','viewer')
 and (not ws.require_mfa or relay_private.session_aal2())
$$;

-- Enabling the requirement from an aal1 session would lock the administrator out.
create function relay_private.guard_workspace_mfa() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.require_mfa and not old.require_mfa and (select auth.uid()) is not null and not relay_private.session_aal2() then
  raise exception 'Relay: Activez d’abord la double authentification sur votre compte.' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function relay_private.guard_workspace_mfa() from public,anon,authenticated;
create trigger guard_workspace_mfa before update of require_mfa on public.workspaces
 for each row execute function relay_private.guard_workspace_mfa();

-- Lets the app explain why a workspace is hidden instead of sending the user to onboarding.
create function public.mfa_blocked_workspaces() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',ws.id,'name',ws.name) order by ws.name),'[]'::jsonb)
 from public.memberships m join public.workspaces ws on ws.id=m.workspace_id
 where m.user_id=(select auth.uid()) and ws.require_mfa and not relay_private.session_aal2();
$$;
revoke all on function public.mfa_blocked_workspaces() from public,anon;
grant execute on function public.mfa_blocked_workspaces() to authenticated;

commit;
