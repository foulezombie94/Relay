-- Readers keep a workspace role, with an independent record visibility scope.
alter table public.memberships add column reader_scope text not null default 'selected' check(reader_scope in ('all','selected'));
-- Preserve existing readers' current access; new readers and new downgrades start with no record grants.
update public.memberships set reader_scope='all' where role='viewer';
create table relay_private.reader_record_access (
 workspace_id uuid not null,user_id uuid not null,record_id uuid not null,
 primary key(workspace_id,user_id,record_id),
 foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id) on delete cascade,
 foreign key(workspace_id,record_id) references public.records(workspace_id,id) on delete cascade
);
create index reader_access_record_idx on relay_private.reader_record_access(workspace_id,record_id);
alter table relay_private.reader_record_access enable row level security;
revoke all on relay_private.reader_record_access from public,anon,authenticated;
create function relay_private.reader_limited(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships where workspace_id=w and user_id=(select auth.uid()) and role='viewer' and reader_scope='selected');
$$;
revoke all on function relay_private.reader_limited(uuid) from public,anon;
grant execute on function relay_private.reader_limited(uuid) to authenticated;
create function relay_private.reader_record_allowed(w uuid,rec uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.workspace_id=w and m.user_id=(select auth.uid())
 and (m.role<>'viewer' or m.reader_scope='all' or exists(select 1 from relay_private.reader_record_access a where a.workspace_id=w and a.user_id=m.user_id and a.record_id=rec)));
$$;
revoke all on function relay_private.reader_record_allowed(uuid,uuid) from public,anon;
grant execute on function relay_private.reader_record_allowed(uuid,uuid) to authenticated;
create function relay_private.reader_list_allowed(w uuid,list uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and relay_private.has_role(w) and (not relay_private.reader_limited(w) or exists(
 select 1 from public.list_entries e join relay_private.reader_record_access a on a.workspace_id=e.workspace_id and a.record_id=e.record_id and a.user_id=(select auth.uid()) where e.workspace_id=w and e.list_id=list));
$$;
revoke all on function relay_private.reader_list_allowed(uuid,uuid) from public,anon;
grant execute on function relay_private.reader_list_allowed(uuid,uuid) to authenticated;
create function relay_private.reader_audit_allowed(w uuid,entity text,entity_id uuid,b jsonb,a jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and relay_private.has_role(w) and (not relay_private.reader_limited(w) or case
 when entity='records' then relay_private.reader_record_allowed(w,entity_id)
 when entity in ('tasks','notes','activities','documents','meetings','commitments','conflicts','handovers') then (coalesce(a->>'record_id',b->>'record_id') is not null and (a->>'record_id' is null or relay_private.reader_record_allowed(w,(a->>'record_id')::uuid)) and (b->>'record_id' is null or relay_private.reader_record_allowed(w,(b->>'record_id')::uuid)))
 else false end);
$$;
revoke all on function relay_private.reader_audit_allowed(uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function relay_private.reader_audit_allowed(uuid,text,uuid,jsonb,jsonb) to authenticated;

-- RESTRICTIVE policies compose with existing tenant/private ACLs, including permissive FOR ALL policies.
-- Workspace metadata needed to render the CRM remains visible; unrelated operational snapshots are closed.
do $$declare t record;predicate text;
begin
 for t in select c.relname,exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='record_id' and not a.attisdropped) as linked
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity
 and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='workspace_id' and not a.attisdropped)
 and c.relname not in ('memberships','objects','attributes','pipelines') loop
 predicate:=case
 when t.relname='records' then 'relay_private.reader_record_allowed(workspace_id,id)'
 when t.relname='record_relations' then '(relay_private.reader_record_allowed(workspace_id,source_id) and relay_private.reader_record_allowed(workspace_id,target_id))'
 when t.relname='lists' then 'relay_private.reader_list_allowed(workspace_id,id)'
 when t.relname='audit_events' then 'relay_private.reader_audit_allowed(workspace_id,entity,entity_id,before_data,after_data)'
 when t.linked then 'relay_private.reader_record_allowed(workspace_id,record_id)'
 else 'not relay_private.reader_limited(workspace_id)' end;
 if t.linked or t.relname in ('records','record_relations','lists','audit_events') then
  predicate:='(not relay_private.reader_limited(workspace_id) or ('||predicate||'))';
 end if;
 execute format('create policy reader_visibility on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.relname,predicate,predicate);
 end loop;
end $$;
-- An internal limited reader cannot use a separate portal permission to bypass the scope.
create or replace function relay_private.portal_access(p uuid,contribute boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.portal_members m join public.portals q on q.id=m.portal_id
 where m.portal_id=p and m.user_id=(select auth.uid()) and not m.revoked and q.enabled
 and not relay_private.reader_limited(q.workspace_id) and (m.expires_at is null or m.expires_at>now()) and (not contribute or m.can_comment));
$$;

create function relay_private.reader_scope_reset() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role is distinct from old.role then
  new.reader_scope:='selected';delete from relay_private.reader_record_access where workspace_id=old.workspace_id and user_id=old.user_id;
 end if;return new;
end $$;
revoke all on function relay_private.reader_scope_reset() from public,anon,authenticated;
create trigger membership_reader_scope before update on public.memberships for each row execute function relay_private.reader_scope_reset();

create function relay_private.team_reader_access_get(w uuid,u uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships;ids jsonb;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin']) then raise exception 'Administrateur requis.' using errcode='42501';end if;
 select * into m from public.memberships where workspace_id=w and user_id=u and role='viewer';
 if m.id is null then raise exception 'Lecteur introuvable.' using errcode='22023';end if;
 select coalesce(jsonb_agg(r order by r.display_name,r.id),'[]') into ids from (
 select x.id,x.display_name,x.object_id,x.archived from relay_private.reader_record_access a join public.records x on x.workspace_id=a.workspace_id and x.id=a.record_id
 where a.workspace_id=w and a.user_id=u order by x.display_name,x.id limit 1000) r;
 return jsonb_build_object('member',jsonb_build_object('user_id',u,'display_name',m.display_name,'version',m.version,'reader_scope',m.reader_scope),'records',ids);
end $$;
revoke all on function relay_private.team_reader_access_get(uuid,uuid) from public,anon;
grant execute on function relay_private.team_reader_access_get(uuid,uuid) to authenticated;
create function public.team_reader_access_get(w uuid,u uuid) returns jsonb language sql security invoker set search_path='' as $$select relay_private.team_reader_access_get(w,u)$$;
revoke all on function public.team_reader_access_get(uuid,uuid) from public,anon;
grant execute on function public.team_reader_access_get(uuid,uuid) to authenticated;

create function relay_private.team_reader_access_set(w uuid,u uuid,expected_version bigint,scope text,record_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare m public.memberships;ids uuid[];old_scope text;
begin
 perform relay_private.team_guard(w);
 select * into m from public.memberships where workspace_id=w and user_id=u for update;
 if m.id is null or m.role<>'viewer' then raise exception 'Lecteur introuvable.' using errcode='22023';end if;
 if expected_version is null or expected_version<>m.version then raise exception 'Les droits ont changé. Actualisez.' using errcode='40001';end if;
 if scope is null or scope not in ('all','selected') or record_ids is null or cardinality(record_ids)>1000 or array_position(record_ids,null) is not null then raise exception 'Sélection invalide (1000 fiches maximum).' using errcode='22023';end if;
 select coalesce(array_agg(distinct id),'{}'::uuid[]) into ids from unnest(record_ids) id;
 if scope='all' and cardinality(ids)>0 then raise exception 'Sélection incompatible avec tout l’espace.' using errcode='22023';end if;
 if exists(select 1 from unnest(ids) as chosen(record_id) where not exists(select 1 from public.records x where x.workspace_id=w and x.id=chosen.record_id)) then raise exception 'Fiche hors espace ou supprimée.' using errcode='22023';end if;
 old_scope:=m.reader_scope;
 delete from relay_private.reader_record_access where workspace_id=w and user_id=u;
 insert into relay_private.reader_record_access(workspace_id,user_id,record_id) select w,u,id from unnest(ids) id;
 update public.memberships set reader_scope=scope where id=m.id;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(w,auth.uid(),'team_members',m.id,'change_visibility',jsonb_build_object('user_id',u,'scope',old_scope),jsonb_build_object('user_id',u,'scope',scope,'record_ids',ids,'count',cardinality(ids)));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function relay_private.team_reader_access_set(uuid,uuid,bigint,text,uuid[]) from public,anon;
grant execute on function relay_private.team_reader_access_set(uuid,uuid,bigint,text,uuid[]) to authenticated;
create function public.team_reader_access_set(w uuid,u uuid,expected_version bigint,scope text,record_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$select relay_private.team_reader_access_set(w,u,expected_version,scope,record_ids)$$;
revoke all on function public.team_reader_access_set(uuid,uuid,bigint,text,uuid[]) from public,anon;
grant execute on function public.team_reader_access_set(uuid,uuid,bigint,text,uuid[]) to authenticated;

-- Admins may invite and promote other admins; owner/self safeguards remain.
create or replace function relay_private.team_invitation_manage_without_link(w uuid,operation text,mail text default null,r text default null,invite uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor_role text;i public.invitations;b jsonb;
begin
 actor_role:=relay_private.team_guard(w);
 if operation='create' then
  mail:=lower(trim(mail));
  if mail is null or length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or r is null or r not in ('admin','member','viewer') then raise exception 'Invitation invalide.' using errcode='22023'; end if;
  if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id where m.workspace_id=w and lower(u.email)=mail) then raise exception 'Cette personne est déjà membre.' using errcode='23505'; end if;
  select * into i from public.invitations where workspace_id=w and lower(email)=mail for update;
 else
  if operation not in ('renew','cancel') then raise exception 'Action invalide.' using errcode='22023';end if;
  select * into i from public.invitations where workspace_id=w and id=invite for update;
  if i.id is null then raise exception 'Invitation introuvable.' using errcode='22023';end if;
  mail:=lower(i.email);r:=i.role;
  if i.accepted_at is not null then raise exception 'Invitation déjà acceptée. Gérez la personne dans Membres.' using errcode='22023';end if;
 end if;
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

-- Admins may invite and promote other admins; owner/self safeguards remain.
create or replace function relay_private.team_member_change(w uuid,u uuid,r text,expected_version bigint,replacement uuid default null) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare actor_role text;m public.memberships;next_role text; transferred integer:=0;n integer;mail text;
begin
 actor_role:=relay_private.team_guard(w);
 select * into m from public.memberships where workspace_id=w and user_id=u for update;
 if m.id is null then raise exception 'Membre introuvable.' using errcode='22023';end if;
 if m.role='owner' or u=auth.uid() then raise exception 'Le propriétaire et votre propre accès sont protégés.' using errcode='42501';end if;
 if expected_version is null or m.version<>expected_version then raise exception 'Le rôle a changé. Actualisez la liste.' using errcode='40001';end if;
 if r is null or r not in ('admin','member','viewer','remove') then raise exception 'Rôle invalide.' using errcode='22023';end if;
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

-- Job results can contain snapshots outside a selected reader’s scope.
create or replace function relay_private.job_status(w uuid,job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j relay_private.jobs;
begin
 if auth.uid() is null or not relay_private.has_role(w) or relay_private.reader_limited(w) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into j from relay_private.jobs where id=job_id and workspace_id=w;
 if j.id is null or (j.user_id is distinct from auth.uid() and not relay_private.has_role(w,array['owner','admin'])) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('id',j.id,'type',j.type,'status',j.status,'attempts',j.attempts,
  'run_at',j.run_at,'result',j.result,'error',case when j.status='dead' then 'Le traitement a échoué. Vérifiez les données et les autorisations.' end);
end $$;

-- Qualify the outer storage name: documents also has a name column.
drop policy relay_storage_read on storage.objects;
create policy relay_storage_read on storage.objects for select to authenticated using(
 bucket_id='relay-documents' and exists(select 1 from public.documents d
 where d.path=storage.objects.name and split_part(storage.objects.name,'/',1)=d.workspace_id::text
 and (relay_private.has_role(d.workspace_id) or exists(select 1 from public.portal_items i
 where i.document_id=d.id and relay_private.portal_access(i.portal_id)))));
