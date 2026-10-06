begin;
alter table public.enrollments add column user_id uuid references auth.users(id),add column last_error text;
create index enrollments_user_idx on public.enrollments(user_id,workspace_id);
revoke insert,update,delete on public.enrollments from authenticated;
create table relay_private.enrollment_state(
 enrollment_id uuid primary key references public.enrollments(id) on delete cascade,
 integration_id uuid not null references public.integrations(id),
 target_email text not null,steps jsonb not null,timezone text not null,
 unsubscribe_hash text not null,unsubscribe_cipher text not null,first_sent_at timestamptz
);
alter table relay_private.enrollment_state enable row level security;
revoke all on relay_private.enrollment_state from public,anon,authenticated;
create table public.sequence_deliveries(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,step integer not null,
 status text not null check(status in ('preparing','sending','sent','uncertain','stopped')),
 provider_id text,created_at timestamptz not null default now(),sent_at timestamptz,
 unique(enrollment_id,step)
);
create index sequence_deliveries_workspace_idx on public.sequence_deliveries(workspace_id,created_at desc);
alter table public.sequence_deliveries enable row level security;
revoke all on public.sequence_deliveries from public,anon,authenticated;
grant select on public.sequence_deliveries to authenticated;
create policy sequence_deliveries_read on public.sequence_deliveries for select to authenticated using(relay_private.has_role(workspace_id));
create table relay_private.delivery_leases(
 delivery_id uuid primary key references public.sequence_deliveries(id) on delete cascade,
 lease uuid not null,leased_until timestamptz not null
);
alter table relay_private.delivery_leases enable row level security;
revoke all on relay_private.delivery_leases from public,anon,authenticated;
create function public.sequence_enroll(w uuid,seq uuid,rec uuid,seq_version integer,record_version integer,p text,unsubscribe_hash text,unsubscribe_cipher text,next_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.sequences;r public.records;i public.integrations;e uuid;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) or p not in ('gmail','outlook') or unsubscribe_hash!~'^[a-f0-9]{64}$' or length(unsubscribe_cipher)>1000 then raise exception 'Forbidden' using errcode='42501';end if;
 select * into s from public.sequences where workspace_id=w and id=seq for share;
 select * into r from public.records where workspace_id=w and id=rec for share;
 if s.id is null or r.id is null or r.archived or not s.enabled or s.version<>seq_version or r.version<>record_version then raise exception 'Data changed' using errcode='40001';end if;
 if r.email is null or r.email='' or exists(select 1 from public.suppressions where workspace_id=w and lower(email)=lower(r.email)) then raise exception 'Recipient excluded' using errcode='22023';end if;
 select * into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p and status='connected' for share;
 if i.id is null then raise exception 'Sender disconnected' using errcode='22023';end if;
 insert into public.enrollments(workspace_id,sequence_id,record_id,user_id,status,next_at) values(w,seq,rec,auth.uid(),'active',next_at) returning id into e;
 insert into relay_private.enrollment_state(enrollment_id,integration_id,target_email,steps,timezone,unsubscribe_hash,unsubscribe_cipher) values(e,i.id,lower(r.email),s.steps,s.timezone,unsubscribe_hash,unsubscribe_cipher);
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data) values(w,auth.uid(),'enrollments',e,'enroll',jsonb_build_object('sequence_id',seq,'record_id',rec,'provider',p));
 return e;
end $$;
revoke all on function public.sequence_enroll(uuid,uuid,uuid,integer,integer,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.sequence_enroll(uuid,uuid,uuid,integer,integer,text,text,text,timestamptz) to authenticated;
create function public.sequence_control(w uuid,enrollment uuid,command text) returns void language plpgsql security definer set search_path='' as $$
declare e public.enrollments;
begin
 if auth.uid() is null or not relay_private.has_role(w,array['owner','admin','member']) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into e from public.enrollments where workspace_id=w and id=enrollment for update;
 if not found or e.user_id is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501';end if;
 if command='pause' and e.status='active' then update public.enrollments set status='paused' where id=e.id;
 elsif command='resume' and e.status='paused' and exists(select 1 from public.sequences where id=e.sequence_id and enabled) then update public.enrollments set status='active',next_at=greatest(next_at,now()) where id=e.id;
 elsif command='stop' and e.status in ('active','paused') then update public.enrollments set status='completed',next_at=null where id=e.id;
 else raise exception 'Invalid transition' using errcode='22023';end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action) values(w,auth.uid(),'enrollments',e.id,command);
end $$;
revoke all on function public.sequence_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sequence_control(uuid,uuid,text) to authenticated;

-- Only the server can claim deliveries or advance a run.
create function public.sequence_job(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.enrollments;s relay_private.enrollment_state;d public.sequence_deliveries;l relay_private.delivery_leases;i public.integrations;r public.records;token uuid;
begin
 if operation='claim' then
  -- A send left in flight cannot be retried blindly.
  update public.enrollments x set status='failed',last_error='Envoi incertain : vérifiez la boîte d’envoi avant toute nouvelle action.',next_at=null
  from public.sequence_deliveries a join relay_private.delivery_leases z on z.delivery_id=a.id
  where a.enrollment_id=x.id and a.status='sending' and z.leased_until<now() and x.status in ('active','paused');
  update public.sequence_deliveries a set status='uncertain' from relay_private.delivery_leases z where z.delivery_id=a.id and a.status='sending' and z.leased_until<now();
  select x.* into e from public.enrollments x join public.sequences q on q.id=x.sequence_id
  where x.status='active' and x.next_at<=now() and q.enabled
  and not exists(select 1 from public.sequence_deliveries a join relay_private.delivery_leases z on z.delivery_id=a.id where a.enrollment_id=x.id and a.step=x.step and (a.status in ('sending','sent','uncertain','stopped') or z.leased_until>now()))
  order by x.next_at for update of x skip locked limit 1;
  if not found then return null;end if;
  select * into s from relay_private.enrollment_state where enrollment_id=e.id;
  select * into i from public.integrations where id=s.integration_id;
  select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id;
  if s.enrollment_id is null or i.status is distinct from 'connected' or i.user_id is distinct from e.user_id or not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.user_id and role in ('owner','admin','member')) or r.archived or lower(r.email) is distinct from s.target_email then
   update public.enrollments set status='failed',last_error='La fiche ou le compte d’envoi a changé. Réinscription nécessaire.',next_at=null where id=e.id;return null;
  end if;
  if exists(select 1 from public.suppressions where workspace_id=e.workspace_id and lower(email)=s.target_email) then update public.enrollments set status='unsubscribed',next_at=null where id=e.id;return null;end if;
  token:=gen_random_uuid();
  insert into public.sequence_deliveries(workspace_id,enrollment_id,step,status) values(e.workspace_id,e.id,e.step,'preparing') on conflict(enrollment_id,step) do update set status='preparing' returning * into d;
  insert into relay_private.delivery_leases(delivery_id,lease,leased_until) values(d.id,token,now()+interval '2 minutes') on conflict(delivery_id) do update set lease=excluded.lease,leased_until=excluded.leased_until;
  return jsonb_build_object('id',e.id,'workspace_id',e.workspace_id,'user_id',e.user_id,'provider',i.provider,'email',s.target_email,'sender',i.email,'record',to_jsonb(r),'step',e.step,'steps',s.steps,'timezone',s.timezone,'unsubscribe_cipher',s.unsubscribe_cipher,'since',coalesce(s.first_sent_at,e.created_at),'delivery_id',d.id,'lease',token);
 end if;
 select * into d from public.sequence_deliveries where id=(payload->>'delivery_id')::uuid for update;
 select * into l from relay_private.delivery_leases where delivery_id=d.id for update;
 if d.id is null or l.lease is null or l.lease is distinct from (payload->>'lease')::uuid or l.leased_until<now() then raise exception 'Invalid lease' using errcode='40001';end if;
 select * into e from public.enrollments where id=d.enrollment_id for update;
 select * into s from relay_private.enrollment_state where enrollment_id=e.id;
 if operation='defer' and d.status='preparing' then
  update public.enrollments set next_at=(payload->>'next_at')::timestamptz where id=e.id;
  update relay_private.delivery_leases set leased_until=now() where delivery_id=d.id;return jsonb_build_object('ok',true);
 elsif operation='reply' and d.status='preparing' then
  update public.enrollments set status='replied',next_at=null where id=e.id;
  update public.sequence_deliveries set status='stopped' where id=d.id;return jsonb_build_object('ok',true);
 elsif operation='prepare' and d.status='preparing' then
  select * into i from public.integrations where id=s.integration_id;
  select * into r from public.records where workspace_id=e.workspace_id and id=e.record_id;
  if e.status<>'active' or not exists(select 1 from public.sequences where id=e.sequence_id and enabled) or r.archived or lower(r.email) is distinct from s.target_email or i.status<>'connected' or not exists(select 1 from public.memberships where workspace_id=e.workspace_id and user_id=e.user_id and role in ('owner','admin','member')) or exists(select 1 from public.suppressions where workspace_id=e.workspace_id and lower(email)=s.target_email) then
   update public.sequence_deliveries set status='preparing' where id=d.id;update relay_private.delivery_leases set leased_until=now() where delivery_id=d.id;return jsonb_build_object('ok',false);
  end if;
  update public.sequence_deliveries set status='sending' where id=d.id;
  return jsonb_build_object('ok',true);
 elsif operation='complete' and d.status='sending' then
  update public.sequence_deliveries set status='sent',provider_id=left(payload->>'provider_id',1000),sent_at=now() where id=d.id;
  update relay_private.enrollment_state set first_sent_at=coalesce(first_sent_at,now()) where enrollment_id=e.id;
  update public.enrollments set step=e.step+1,status=case when e.step+1>=jsonb_array_length(s.steps) then 'completed' else e.status end,next_at=case when e.step+1>=jsonb_array_length(s.steps) then null else (payload->>'next_at')::timestamptz end,last_error=null where id=e.id;
  return jsonb_build_object('ok',true);
 elsif operation='fail' then
  update public.sequence_deliveries set status=case when d.status='sending' then 'uncertain' else 'stopped' end where id=d.id;
  update public.enrollments set status='failed',last_error=left(payload->>'error',500),next_at=null where id=e.id;
  return jsonb_build_object('ok',true);
 else raise exception 'Invalid operation' using errcode='22023';end if;
end $$;
revoke all on function public.sequence_job(text,jsonb) from public,anon,authenticated;
grant execute on function public.sequence_job(text,jsonb) to service_role;
create function public.sequence_unsubscribe(enrollment uuid,token_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.enrollments;mail text;
begin
 select target_email into mail from relay_private.enrollment_state where enrollment_id=enrollment and unsubscribe_hash=token_hash and token_hash~'^[a-f0-9]{64}$';
 if not found then return false;end if;
 select * into e from public.enrollments where id=enrollment for update;
 insert into public.suppressions(workspace_id,email,reason) values(e.workspace_id,mail,'unsubscribed') on conflict(workspace_id,email) do nothing;
 update public.enrollments x set status='unsubscribed',next_at=null from relay_private.enrollment_state s where s.enrollment_id=x.id and x.workspace_id=e.workspace_id and s.target_email=mail and x.status in ('active','paused');
 return true;
end $$;
revoke all on function public.sequence_unsubscribe(uuid,text) from public,anon,authenticated;
grant execute on function public.sequence_unsubscribe(uuid,text) to service_role;
commit;