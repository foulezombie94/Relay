-- Real RPC/RLS checks. All fixtures and changes are rolled back; no email is sent.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
do $$
declare
 owner_user uuid:=gen_random_uuid(); admin_user uuid:=gen_random_uuid(); member_user uuid:=gen_random_uuid();
 guest uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); viewer_user uuid:=gen_random_uuid();
 w uuid; other_w uuid; obj uuid; rec uuid; task uuid; invitation uuid; integration uuid; output jsonb; n integer; portal uuid; secret text; old_secret text;
begin
 insert into auth.users(id,email,aud,role,email_confirmed_at)
 select u,'team-test-'||u||'@example.invalid','authenticated','authenticated',case when u=guest then null else now() end
 from unnest(array[owner_user,admin_user,member_user,guest,outsider,viewer_user]) u;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 w:=public.create_workspace('Team security rollback');other_w:=public.create_workspace('Other team rollback');
 insert into public.memberships(workspace_id,user_id,role) values(w,admin_user,'admin'),(w,member_user,'member'),(w,viewer_user,'viewer'),(other_w,outsider,'member');
 select id into obj from public.objects where workspace_id=w and slug='people';
 insert into public.records(workspace_id,object_id,display_name,owner_id) values(w,obj,'Team fixture',member_user) returning id into rec;
 insert into public.tasks(workspace_id,record_id,title,owner_id) values(w,rec,'Team fixture',member_user) returning id into task;
 insert into public.commitments(workspace_id,record_id,title,owner_id) values(w,rec,'Team fixture',member_user);
 insert into public.handovers(workspace_id,record_id,title,owner_id) values(w,rec,'Team fixture',member_user);
 insert into public.portals(workspace_id,record_id,name,enabled) values(w,rec,'Team portal fixture',true) returning id into portal;
 insert into public.portal_members(workspace_id,portal_id,email,user_id) values(w,portal,'team-test-'||member_user||'@example.invalid',member_user);
 insert into public.notes(workspace_id,record_id,content,author_id) values(w,rec,'Preserved history',member_user);
 insert into public.integrations(workspace_id,user_id,provider,status) values(w,member_user,'gmail','connected') returning id into integration;
 insert into relay_private.integration_secrets(integration_id,encrypted_tokens) values(integration,'fixture-not-a-real-token');
 insert into relay_private.jobs(workspace_id,user_id,type,dedupe_key,payload) values(w,member_user,'email_sync',gen_random_uuid()::text,'{"fixture":true}');
 execute 'set local role authenticated';
 begin
  insert into public.invitations(workspace_id,email,role) values(w,'forged@example.invalid','admin');
  raise exception 'Direct invitation write allowed';
 exception when insufficient_privilege then null;end;
 begin
  update public.memberships set role='owner' where workspace_id=w and user_id=member_user;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Direct membership write allowed';end if;
 exception when insufficient_privilege then null;end;
 begin
  perform public.team_member_change(w,owner_user,'viewer',1);
  raise exception 'Owner role changed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.change_member(w,member_user,'admin');
  raise exception 'Legacy RPC bypassed version protection';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',member_user::text,true);
 begin
  perform public.team_invitation_manage(w,'create','member-forged@example.invalid','member');
  raise exception 'Member invited a user';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',admin_user::text,true);
 begin
  perform public.team_member_change(w,member_user,'admin',1);
  if not exists(select 1 from public.memberships where workspace_id=w and user_id=member_user and role='admin') then raise exception 'Admin promotion failed';end if;
  raise exception 'Rollback permitted promotion fixture' using errcode='PZ001';
 exception when sqlstate 'PZ001' then null;end;
 begin
  perform public.team_member_change(w,admin_user,'remove',1,owner_user);
  raise exception 'Self removal allowed';
 exception when insufficient_privilege then null;end;
 begin
  output:=public.team_invitation_manage(w,'create','new-admin@example.invalid','admin');
  if output->>'role'<>'admin' or output->>'token' is null then raise exception 'Admin invitation failed';end if;
  raise exception 'Rollback permitted invitation fixture' using errcode='PZ001';
 exception when sqlstate 'PZ001' then null;end;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 begin
  perform public.team_member_change(w,member_user,'viewer',99);
  raise exception 'Stale version accepted';
 exception when serialization_failure then null;end;
 begin
  perform public.team_member_change(w,member_user,'remove',1,outsider);
  raise exception 'Foreign workspace replacement accepted';
 exception when invalid_parameter_value then null;end;
 if not exists(select 1 from public.memberships where workspace_id=w and user_id=member_user and version=1) then raise exception 'Failed changes were not atomic';end if;
 output:=public.team_invitation_manage(w,'create','team-test-'||guest||'@example.invalid','member');invitation:=(output->>'id')::uuid;secret:=output->>'token';
 if secret is null or length(secret)<>64 then raise exception 'Secure link not issued';end if;
 perform set_config('request.jwt.claim.sub',guest::text,true);
 perform public.claim_invitations();
 if relay_private.has_role(w) then raise exception 'Unverified email claimed invitation';end if;
 begin
  perform public.team_invitation_accept(secret);raise exception 'Unverified email accepted secure link';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 update auth.users set email_confirmed_at=now() where id=guest;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',viewer_user::text,true);
 begin
  perform public.team_invitation_info(secret);raise exception 'Wrong account read invitation';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 perform public.team_invitation_manage(w,'cancel',null,null,invitation);
 perform set_config('request.jwt.claim.sub',guest::text,true);
 begin
  perform public.team_invitation_accept(secret);raise exception 'Revoked link accepted';
 exception when invalid_parameter_value then null;end;
 execute 'reset role';
 update public.invitations set revoked_at=null,expires_at=now()-interval '1 day' where id=invitation;
 insert into relay_private.invitation_links(invitation_id,token_hash) values(invitation,encode(extensions.digest(secret,'sha256'),'hex'));
 execute 'set local role authenticated';
 begin
  perform public.team_invitation_accept(secret);raise exception 'Expired link accepted';
 exception when invalid_parameter_value then null;end;
 execute 'reset role';
 update public.invitations set expires_at=now()+interval '1 day',last_issued_at=now()-interval '2 minutes' where id=invitation;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 old_secret:=secret;
 output:=public.team_invitation_manage(w,'renew',null,null,invitation);secret:=output->>'token';
 if secret=old_secret then raise exception 'Renewal did not rotate token';end if;
 perform set_config('request.jwt.claim.sub',guest::text,true);
 begin
  perform public.team_invitation_accept(old_secret);raise exception 'Rotated link remained valid';
 exception when invalid_parameter_value then null;end;
 perform public.claim_invitations();
 if relay_private.has_role(w) then raise exception 'Invitation auto-accepted without link confirmation';end if;
 perform public.team_invitation_accept(secret);
 if not relay_private.has_role(w,array['member']) then raise exception 'Verified valid invitation failed';end if;
 begin
  perform public.team_invitation_accept(secret);raise exception 'Invitation replay allowed';
 exception when invalid_parameter_value then null;end;
 begin
  perform token_hash from relay_private.invitation_links limit 1;raise exception 'Token table exposed';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',viewer_user::text,true);
 if exists(select 1 from public.audit_events where workspace_id=w and entity='team_invitations') then raise exception 'Team audit leaked to viewer';end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 if exists(select 1 from public.memberships where workspace_id=w) then raise exception 'Foreign team roster leaked';end if;
 begin
  perform public.team_member_change(w,member_user,'viewer',1);
  raise exception 'Foreign workspace modification accepted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_user::text,true);
 perform public.team_member_change(w,member_user,'viewer',1);
 if not exists(select 1 from public.memberships where workspace_id=w and user_id=member_user and role='viewer' and version=2) then raise exception 'Version did not increment';end if;
 execute 'reset role';
 if exists(select 1 from relay_private.integration_secrets where integration_id=integration) then raise exception 'Credentials survived downgrade';end if;
 if exists(select 1 from relay_private.jobs where workspace_id=w and user_id=member_user and (status<>'dead' or payload<>'{}'::jsonb)) then raise exception 'Jobs survived downgrade';end if;
 execute 'set local role authenticated';
 output:=public.team_member_change(w,member_user,'remove',2,owner_user);
 if (output->>'transferred')::int<>4 then raise exception 'Ownership transfer incomplete';end if;
 if not exists(select 1 from public.records where id=rec and owner_id=owner_user) or not exists(select 1 from public.tasks where id=task and owner_id=owner_user) then raise exception 'Ownership not reassigned';end if;
 if not exists(select 1 from public.notes where workspace_id=w and author_id=member_user) then raise exception 'History deleted';end if;
 if not exists(select 1 from public.audit_events where workspace_id=w and entity='team_members' and action='remove_access') then raise exception 'Removal audit missing';end if;
 perform set_config('request.jwt.claim.sub',member_user::text,true);
 if relay_private.portal_access(portal) then raise exception 'Removed member retained portal access';end if;
 if relay_private.has_role(w) or exists(select 1 from public.records where id=rec) then raise exception 'Removed member still has access with old JWT';end if;
 execute 'reset role';
end $$;
rollback;
select 'Team RPC, RLS, invitations, concurrency, reassignment and revocation checks passed; all fixtures rolled back' as result;
