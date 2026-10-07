-- Team changes are tenant-bound, serialized, audited and unavailable as direct table writes.
alter table public.memberships add column version bigint not null default 1 check(version>0);
create function relay_private.team_member_version() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.workspace_id<>old.workspace_id or new.user_id<>old.user_id then raise exception 'Membership identity is immutable' using errcode='22023';end if;
 new.version:=old.version+1;return new;
end $$;
revoke all on function relay_private.team_member_version() from public,anon,authenticated;
create trigger membership_version before update on public.memberships for each row execute function relay_private.team_member_version();
alter table public.invitations add column revoked_at timestamptz;
alter table public.invitations add column last_issued_at timestamptz not null default now();
create unique index invitations_normalized_email_idx on public.invitations(workspace_id,lower(email));
create index memberships_team_listing_idx on public.memberships(workspace_id,created_at desc,id);
create index invitations_team_listing_idx on public.invitations(workspace_id,created_at desc,id);
create index invitations_claim_pending_idx on public.invitations(lower(email),expires_at) where accepted_at is null and revoked_at is null;
revoke insert,update,delete on public.invitations from public,anon,authenticated;
drop policy invitations_admin on public.invitations;
create policy invitations_admin_read on public.invitations for select to authenticated using(relay_private.has_role(workspace_id,array['owner','admin']));

create function relay_private.team_guard(w uuid) returns text language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('team-access:'||w::text,0));
 select role into actor_role from public.memberships where workspace_id=w and user_id=auth.uid();
 if actor_role is null or actor_role not in ('owner','admin') then raise exception 'Administrateur requis.' using errcode='42501'; end if;
 if (select count(*) from public.audit_events where workspace_id=w and entity in ('team_members','team_invitations') and created_at>now()-interval '1 minute')>=30 then raise exception 'Trop de changements. Réessayez dans une minute.' using errcode='53300'; end if;
 return actor_role;
end $$;
revoke all on function relay_private.team_guard(uuid) from public,anon,authenticated;

create function relay_private.team_invitation_manage(w uuid,operation text,mail text default null,r text default null,invite uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor_role text;i public.invitations;b jsonb;
begin
 actor_role:=relay_private.team_guard(w);
 if operation='create' then
  mail:=lower(trim(mail));
  if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or r is null or r not in ('admin','member','viewer') then raise exception 'Invitation invalide.' using errcode='22023'; end if;
  if r='admin' and actor_role<>'owner' then raise exception 'Seul le propriétaire peut nommer un administrateur.' using errcode='42501'; end if;
  if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id where m.workspace_id=w and lower(u.email)=mail) then raise exception 'Cette personne est déjà membre.' using errcode='23505'; end if;
  select * into i from public.invitations where workspace_id=w and lower(email)=mail for update;
 else
  if operation not in ('renew','cancel') then raise exception 'Action invalide.' using errcode='22023';end if;
  select * into i from public.invitations where workspace_id=w and id=invite for update;
  if i.id is null then raise exception 'Invitation introuvable.' using errcode='22023';end if;
  mail:=lower(i.email);r:=i.role;
  if i.accepted_at is not null then raise exception 'Invitation déjà acceptée. Gérez la personne dans Membres.' using errcode='22023';end if;
 end if;
 if i.role='admin' and actor_role<>'owner' then raise exception 'Seul le propriétaire peut gérer cette invitation.' using errcode='42501'; end if;
 b:=case when i.id is null then null else jsonb_build_object('email',i.email,'role',i.role,'expires_at',i.expires_at,'revoked_at',i.revoked_at) end;
 if operation='cancel' then
  if i.revoked_at is not null then return to_jsonb(i);end if;
  update public.invitations set revoked_at=now() where id=i.id returning * into i;
 else
  if i.id is not null and i.last_issued_at>now()-interval '1 minute' then raise exception 'Attendez une minute avant de renouveler cette invitation.' using errcode='53300';end if;
  if (i.id is null or i.revoked_at is not null or i.expires_at<=now() or i.accepted_at is not null) and (select count(*) from public.invitations where workspace_id=w and accepted_at is null and revoked_at is null and expires_at>now())>=100 then raise exception 'Limite de 100 invitations en attente atteinte.' using errcode='53300';end if;
  insert into public.invitations(workspace_id,email,role,inviter_id,expires_at,last_issued_at) values(w,mail,r,auth.uid(),now()+interval '7 days',now())
  on conflict(workspace_id,lower(email)) do update set role=excluded.role,inviter_id=excluded.inviter_id,expires_at=excluded.expires_at,last_issued_at=excluded.last_issued_at,accepted_at=null,revoked_at=null returning * into i;
 end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data) values(w,auth.uid(),'team_invitations',i.id,operation,b,jsonb_build_object('email',i.email,'role',i.role,'expires_at',i.expires_at,'revoked_at',i.revoked_at));
 return to_jsonb(i);
end $$;
revoke all on function relay_private.team_invitation_manage(uuid,text,text,text,uuid) from public,anon;
grant execute on function relay_private.team_invitation_manage(uuid,text,text,text,uuid) to authenticated;
create function public.team_invitation_manage(w uuid,operation text,mail text default null,r text default null,invite uuid default null) returns jsonb language sql security invoker set search_path='' as $$select relay_private.team_invitation_manage(w,operation,mail,r,invite)$$;
revoke all on function public.team_invitation_manage(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.team_invitation_manage(uuid,text,text,text,uuid) to authenticated;

create function relay_private.team_member_change(w uuid,u uuid,r text,expected_version bigint,replacement uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor_role text;m public.memberships;next_role text; transferred integer:=0;n integer;mail text;
begin
 actor_role:=relay_private.team_guard(w);
 select * into m from public.memberships where workspace_id=w and user_id=u for update;
 if m.id is null then raise exception 'Membre introuvable.' using errcode='22023';end if;
 if m.role='owner' or u=auth.uid() then raise exception 'Le propriétaire et votre propre accès sont protégés.' using errcode='42501';end if;
 if expected_version is null or m.version<>expected_version then raise exception 'Le rôle a changé. Actualisez la liste.' using errcode='40001';end if;
 if r is null or r not in ('admin','member','viewer','remove') then raise exception 'Rôle invalide.' using errcode='22023';end if;
 if actor_role<>'owner' and (m.role='admin' or r='admin') then raise exception 'Seul le propriétaire peut gérer les administrateurs.' using errcode='42501';end if;
 if r=m.role then return jsonb_build_object('ok',true,'transferred',0);end if;
 if r='remove' then
  if (select count(*) from (select 1 from public.records where workspace_id=w and owner_id=u union all select 1 from public.tasks where workspace_id=w and owner_id=u union all select 1 from public.commitments where workspace_id=w and owner_id=u union all select 1 from public.handovers where workspace_id=w and owner_id=u limit 10001) assigned)>10000 then raise exception 'Réattribuez les données par lots avant le retrait (10 000 éléments maximum).' using errcode='54000';end if;
  if replacement is null or replacement=u or not exists(select 1 from public.memberships where workspace_id=w and user_id=replacement and role in ('owner','admin','member')) then raise exception 'Choisissez un responsable actif de cet espace.' using errcode='22023';end if;
 end if;
 -- Future jobs lose their lease; running effects already sent to an external provider cannot be recalled.
 if r in ('remove','viewer') then
  update relay_private.jobs set status='dead',payload='{}',lease=null,leased_until=null,completed_at=now(),last_error='member_access_revoked' where workspace_id=w and user_id=u and status in ('queued','paused','running');
  delete from relay_private.integration_secrets s using public.integrations i where s.integration_id=i.id and i.workspace_id=w and i.user_id=u;
  update relay_private.connector_sync_state s set auto_sync=false,lease=null,leased_until=null,generation=gen_random_uuid(),cursor='{}' from public.integrations i where s.integration_id=i.id and i.workspace_id=w and i.user_id=u;
  update public.integrations set status='disconnected' where workspace_id=w and user_id=u;
  delete from relay_private.oauth_sessions where workspace_id=w and user_id=u;
  update public.enrollments set status='paused',next_at=null where workspace_id=w and user_id=u and status='active';
 end if;
 if r='remove' then
  update public.records set owner_id=replacement where workspace_id=w and owner_id=u;get diagnostics n=row_count;transferred:=transferred+n;
  update public.tasks set owner_id=replacement where workspace_id=w and owner_id=u;get diagnostics n=row_count;transferred:=transferred+n;
  update public.commitments set owner_id=replacement where workspace_id=w and owner_id=u;get diagnostics n=row_count;transferred:=transferred+n;
  update public.handovers set owner_id=replacement where workspace_id=w and owner_id=u;get diagnostics n=row_count;transferred:=transferred+n;
  select lower(email) into mail from auth.users where id=u;
  update public.invitations set revoked_at=now() where workspace_id=w and lower(email)=mail and accepted_at is null and revoked_at is null;
  delete from public.memberships where id=m.id;
 else update public.memberships set role=r where id=m.id;end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data) values(w,auth.uid(),'team_members',m.id,case when r='remove' then 'remove_access' else 'change_role' end,jsonb_build_object('user_id',u,'name',m.display_name,'role',m.role),jsonb_build_object('user_id',u,'role',r,'replacement',replacement,'transferred',transferred));
 return jsonb_build_object('ok',true,'transferred',transferred);
end $$;
revoke all on function relay_private.team_member_change(uuid,uuid,text,bigint,uuid) from public,anon;
grant execute on function relay_private.team_member_change(uuid,uuid,text,bigint,uuid) to authenticated;
create function public.team_member_change(w uuid,u uuid,r text,expected_version bigint,replacement uuid default null) returns jsonb language sql security invoker set search_path='' as $$select relay_private.team_member_change(w,u,r,expected_version,replacement)$$;
revoke all on function public.team_member_change(uuid,uuid,text,bigint,uuid) from public,anon;
grant execute on function public.team_member_change(uuid,uuid,text,bigint,uuid) to authenticated;
-- Close the old RPC so direct callers cannot bypass confirmation/version safeguards.
create or replace function relay_private.change_member(w uuid,u uuid,r text) returns void language plpgsql security definer set search_path='' as $$begin raise exception 'Utilisez la gestion d’équipe actualisée.' using errcode='42501';end $$;

create or replace function relay_private.claim_invitations() returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare who uuid;mail text;candidate record;i public.invitations;
begin
 who:=auth.uid();if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 select lower(email) into mail from auth.users where id=who and email_confirmed_at is not null;
 if mail is null then return;end if;
 for candidate in select id,workspace_id from public.invitations where lower(email)=mail and expires_at>now() and accepted_at is null and revoked_at is null order by workspace_id,id limit 100 loop
  perform pg_advisory_xact_lock(hashtextextended('team-access:'||candidate.workspace_id::text,0));
  select * into i from public.invitations where id=candidate.id and expires_at>now() and accepted_at is null and revoked_at is null for update;
  if i.id is not null then
   insert into public.memberships(workspace_id,user_id,role,display_name) values(i.workspace_id,who,i.role,mail) on conflict(workspace_id,user_id) do nothing;
   update public.invitations set accepted_at=now() where id=i.id;
   insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(i.workspace_id,who,'team_invitations',i.id,'accepted',jsonb_build_object('user_id',who,'role',i.role));
  end if;
 end loop;
 update public.portal_members set user_id=who where lower(email)=mail and user_id is null and not revoked and (expires_at is null or expires_at>now());
end $$;
-- Team audit is visible to administrators, while other existing ACLs are retained.
drop policy audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated using(relay_private.has_role(workspace_id) and (private_to is null or private_to=(select auth.uid())) and (entity not in ('portal_members','team_members','team_invitations') or relay_private.has_role(workspace_id,array['owner','admin'])));
