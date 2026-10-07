-- Removing a collaborator also revokes any separate portal access in this workspace.
-- This trigger covers checked RPCs and trusted maintenance paths; callers cannot execute it directly.
create function relay_private.team_portal_revoke() returns trigger language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare mail text;
begin
 if not exists(select 1 from public.workspaces where id=old.workspace_id) then return old;end if;
 select lower(email) into mail from auth.users where id=old.user_id;
 update public.portal_members set revoked=true
 where workspace_id=old.workspace_id and not revoked and (user_id=old.user_id or lower(email)=mail);
 return old;
end $$;
revoke all on function relay_private.team_portal_revoke() from public,anon,authenticated;
create trigger membership_portal_revocation before delete on public.memberships
 for each row execute function relay_private.team_portal_revoke();
