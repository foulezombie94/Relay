-- Invitation links: 256-bit random bearer secret plus verified invited identity.
-- Only a hash is persisted; the raw link is returned once on creation/renewal.
create table relay_private.invitation_links (
 invitation_id uuid primary key references public.invitations(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$')
);
alter table relay_private.invitation_links enable row level security;
revoke all on relay_private.invitation_links from public,anon,authenticated;

alter function relay_private.team_invitation_manage(uuid,text,text,text,uuid) rename to team_invitation_manage_without_link;
revoke all on function relay_private.team_invitation_manage_without_link(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
create function relay_private.team_invitation_manage(w uuid,operation text,mail text default null,r text default null,invite uuid default null) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare result jsonb;secret text;invitation uuid;
begin
 result:=relay_private.team_invitation_manage_without_link(w,operation,mail,r,invite);
 invitation:=(result->>'id')::uuid;
 if operation='cancel' then delete from relay_private.invitation_links where invitation_id=invitation;return result;end if;
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 insert into relay_private.invitation_links(invitation_id,token_hash) values(invitation,encode(extensions.digest(secret,'sha256'),'hex'))
 on conflict(invitation_id) do update set token_hash=excluded.token_hash;
 return result||jsonb_build_object('token',secret);
end $$;
revoke all on function relay_private.team_invitation_manage(uuid,text,text,text,uuid) from public,anon;
grant execute on function relay_private.team_invitation_manage(uuid,text,text,text,uuid) to authenticated;

create function relay_private.team_invitation_lookup(secret text) returns public.invitations language plpgsql security definer set search_path='' as $$
declare i public.invitations;mail text;
begin
 if auth.uid() is null then raise exception 'Connexion requise.' using errcode='42501';end if;
 if secret is null or secret !~ '^[a-f0-9]{64}$' then raise exception 'Lien invalide.' using errcode='22023';end if;
 select x.* into i from relay_private.invitation_links l join public.invitations x on x.id=l.invitation_id
 where l.token_hash=encode(extensions.digest(secret,'sha256'),'hex');
 if i.id is null or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then raise exception 'Lien expiré, annulé ou déjà utilisé.' using errcode='22023';end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if mail is null or mail<>lower(i.email) then raise exception 'Adresse invitée vérifiée requise.' using errcode='42501';end if;
 return i;
end $$;
revoke all on function relay_private.team_invitation_lookup(text) from public,anon,authenticated;

create function relay_private.team_invitation_info(secret text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations;label text;
begin
 i:=relay_private.team_invitation_lookup(secret);
 select name into label from public.workspaces where id=i.workspace_id;
 return jsonb_build_object('workspace',i.workspace_id,'name',label,'email',i.email,'role',i.role,'expires_at',i.expires_at);
end $$;
revoke all on function relay_private.team_invitation_info(text) from public,anon;
grant execute on function relay_private.team_invitation_info(text) to authenticated;
create function public.team_invitation_info(secret text) returns jsonb language sql security invoker set search_path='' as $$select relay_private.team_invitation_info(secret)$$;
revoke all on function public.team_invitation_info(text) from public,anon;
grant execute on function public.team_invitation_info(text) to authenticated;

create function relay_private.team_invitation_accept(secret text) returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare i public.invitations;current_role text;
begin
 i:=relay_private.team_invitation_lookup(secret);
 perform pg_advisory_xact_lock(hashtextextended('team-access:'||i.workspace_id::text,0));
 -- Recheck after the same lock used by revoke/renew/remove; a raced link cannot be redeemed.
 i:=relay_private.team_invitation_lookup(secret);
 perform 1 from public.invitations where id=i.id for update;
 insert into public.memberships(workspace_id,user_id,role,display_name) values(i.workspace_id,auth.uid(),i.role,i.email) on conflict(workspace_id,user_id) do nothing;
 select role into current_role from public.memberships where workspace_id=i.workspace_id and user_id=auth.uid();
 update public.invitations set accepted_at=now() where id=i.id;
 delete from relay_private.invitation_links where invitation_id=i.id;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(i.workspace_id,auth.uid(),'team_invitations',i.id,'accepted',jsonb_build_object('user_id',auth.uid(),'role',current_role));
 return i.workspace_id;
end $$;
revoke all on function relay_private.team_invitation_accept(text) from public,anon;
grant execute on function relay_private.team_invitation_accept(text) to authenticated;
create function public.team_invitation_accept(secret text) returns uuid language sql security invoker set search_path='' as $$select relay_private.team_invitation_accept(secret)$$;
revoke all on function public.team_invitation_accept(text) from public,anon;
grant execute on function public.team_invitation_accept(text) to authenticated;

-- Existing portal linking is retained, but visiting /app no longer auto-accepts team invitations.
create or replace function relay_private.claim_invitations() returns void language plpgsql security definer set search_path='' as $$
declare who uuid;mail text;
begin
 who:=auth.uid();if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 select lower(email) into mail from auth.users where id=who and email_confirmed_at is not null;
 if mail is null then return;end if;
 update public.portal_members set user_id=who where lower(email)=mail and user_id is null and not revoked and (expires_at is null or expires_at>now());
end $$;
