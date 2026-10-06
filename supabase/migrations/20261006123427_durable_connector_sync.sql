begin;
alter table public.communications add column sync_generation uuid;
create table relay_private.connector_sync_state(
 integration_id uuid primary key references public.integrations(id) on delete cascade,
 auto_sync boolean not null default false,cursor jsonb not null default '{}',generation uuid not null default gen_random_uuid(),
 next_at timestamptz not null default now(),lease uuid,leased_until timestamptz,
 last_error text,completed_at timestamptz,imported integer not null default 0
);
alter table relay_private.connector_sync_state enable row level security;
revoke all on relay_private.connector_sync_state from public,anon,authenticated;
create index connector_sync_due_idx on relay_private.connector_sync_state(next_at) where auto_sync;
create function relay_private.connector_sync(w uuid,p text,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.integrations;s relay_private.connector_sync_state;l uuid;n integer;
begin
 if auth.uid() is null or not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into i from public.integrations where workspace_id=w and user_id=auth.uid() and provider=p for update;
 if not found then raise exception 'Unknown integration' using errcode='22023';end if;
 select * into s from relay_private.connector_sync_state where integration_id=i.id;
 if operation='status' then return jsonb_build_object('auto_sync',coalesce(s.auto_sync,false),'pending',coalesce(s.cursor?'page',false),'imported',coalesce(s.imported,0),'last_error',s.last_error,'completed_at',s.completed_at,'running',coalesce(s.leased_until>now(),false));end if;
 if not relay_private.has_role(w,array['owner','admin','member']) or i.status<>'connected' then raise exception 'Forbidden' using errcode='42501';end if;
 insert into relay_private.connector_sync_state(integration_id) values(i.id) on conflict do nothing;
 select * into s from relay_private.connector_sync_state where integration_id=i.id for update;
 if operation='configure' then
  update relay_private.connector_sync_state set auto_sync=(payload->>'enabled')::boolean,next_at=now() where integration_id=i.id;
  return jsonb_build_object('ok',true);
 elsif operation='claim' then
  if s.leased_until>now() then raise exception 'Synchronization already running' using errcode='40001';end if;
  l:=gen_random_uuid();
  update relay_private.connector_sync_state set lease=l,leased_until=now()+interval '2 minutes' where integration_id=i.id;
  return jsonb_build_object('lease',l,'cursor',s.cursor,'generation',s.generation);
 elsif operation in ('finish','fail') then
  if s.lease is distinct from (payload->>'lease')::uuid or s.leased_until<=now() then raise exception 'Synchronization lease expired' using errcode='40001';end if;
  if operation='fail' then
   update relay_private.connector_sync_state set lease=null,leased_until=null,last_error=left(payload->>'error',500),next_at=now()+interval '5 minutes' where integration_id=i.id;
   return jsonb_build_object('ok',true);
  end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items')>100 or octet_length(payload::text)>4000000 then raise exception 'Invalid sync batch' using errcode='22023';end if;
  insert into public.communications(workspace_id,user_id,integration_id,provider_id,kind,subject,sender,recipients,body,starts_at,received_at,sync_generation)
  select w,auth.uid(),i.id,x.provider_id,x.kind,x.subject,x.sender,x.recipients,x.body,x.starts_at,x.received_at,s.generation
  from jsonb_to_recordset(payload->'items') as x(provider_id text,kind text,subject text,sender text,recipients text[],body text,starts_at timestamptz,received_at timestamptz)
  on conflict(integration_id,kind,provider_id) do update set subject=excluded.subject,sender=excluded.sender,recipients=excluded.recipients,body=excluded.body,starts_at=excluded.starts_at,received_at=excluded.received_at,sync_generation=excluded.sync_generation;
  get diagnostics n=row_count;
  if (payload->>'complete')::boolean and i.provider in ('google-calendar','outlook-calendar') then
   delete from public.communications where integration_id=i.id and kind='calendar' and starts_at>=(payload->>'window_start')::timestamptz and starts_at<(payload->>'window_end')::timestamptz and sync_generation is distinct from s.generation;
  end if;
  update relay_private.connector_sync_state set cursor=payload->'cursor',
   generation=case when (payload->>'complete')::boolean then gen_random_uuid() else s.generation end,
   lease=null,leased_until=null,last_error=null,imported=s.imported+n,
   completed_at=case when (payload->>'complete')::boolean then now() else s.completed_at end,
   next_at=now()+case when (payload->>'complete')::boolean then interval '5 minutes' else interval '1 minute' end
  where integration_id=i.id;
  if (payload->>'complete')::boolean then update public.integrations set last_sync=now() where id=i.id;end if;
  return jsonb_build_object('synced',n,'complete',(payload->>'complete')::boolean);
 else raise exception 'Unknown operation' using errcode='22023';end if;
end $$;
create function public.connector_sync(w uuid,p text,operation text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select relay_private.connector_sync(w,p,operation,payload)$$;
revoke all on function public.connector_sync(uuid,text,text,jsonb),relay_private.connector_sync(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.connector_sync(uuid,text,text,jsonb),relay_private.connector_sync(uuid,text,text,jsonb) to authenticated;

-- A service-only worker adapter reuses the same user-bound credential and sync checks.
create function public.integration_worker(w uuid,p text,subject uuid,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.memberships where workspace_id=w and user_id=subject and role in ('owner','admin','member')) then raise exception 'Forbidden' using errcode='42501';end if;
 perform set_config('request.jwt.claim.sub',subject::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated')::text,true);
 case operation
 when 'integration_get' then return relay_private.integration_get(w,p);
 when 'integration_refresh_claim' then return to_jsonb(relay_private.integration_refresh_claim(w,p,(payload->>'expected_revision')::bigint));
 when 'integration_refresh_finish' then return to_jsonb(relay_private.integration_refresh_finish(w,p,(payload->>'expected_revision')::bigint,payload->>'encrypted',array(select jsonb_array_elements_text(payload->'permissions'))));
 when 'connector_sync' then return relay_private.connector_sync(w,p,payload->>'operation',coalesce(payload->'payload','{}'));
 else raise exception 'Unknown worker operation' using errcode='22023';end case;
end $$;
revoke all on function public.integration_worker(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_worker(uuid,text,uuid,text,jsonb) to service_role;
create function public.connector_jobs() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(t),'[]') from (select i.workspace_id,i.user_id,i.provider from relay_private.connector_sync_state s join public.integrations i on i.id=s.integration_id join public.memberships m on m.workspace_id=i.workspace_id and m.user_id=i.user_id where s.auto_sync and s.next_at<=now() and (s.leased_until is null or s.leased_until<=now()) and i.status='connected' and m.role in ('owner','admin','member') order by s.next_at limit 5)t;
$$;
revoke all on function public.connector_jobs() from public,anon,authenticated;
grant execute on function public.connector_jobs() to service_role;
commit;