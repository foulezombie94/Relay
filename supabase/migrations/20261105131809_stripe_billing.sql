-- Stripe subscription billing. Stripe is the source of truth: the server
-- writes this state only from verified webhooks (service role), each event
-- applied once and never over a newer one. Administrators read it.
begin;
set local lock_timeout='5s';

create table public.workspace_subscriptions(
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 stripe_customer_id text unique check(stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 stripe_subscription_id text unique check(stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
 plan text not null default 'free' check(plan in ('free','pro','business')),
 status text not null default 'none' check(status in ('none','trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')),
 seats integer not null default 0 check(seats>=0),
 current_period_end timestamptz, cancel_at_period_end boolean not null default false, trial_end timestamptz,
 last_event_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.workspace_subscriptions enable row level security;
create policy workspace_subscriptions_admin_read on public.workspace_subscriptions for select to authenticated
 using(relay_private.has_role(workspace_id,array['owner','admin']));
revoke all on public.workspace_subscriptions from public,anon,authenticated;
grant select on public.workspace_subscriptions to authenticated;

create table relay_private.stripe_events(
 id text primary key check(id ~ '^evt_[A-Za-z0-9]+$'), type text not null, received_at timestamptz not null default now()
);
alter table relay_private.stripe_events enable row level security;
revoke all on relay_private.stripe_events from public,anon,authenticated;

-- Plan visible to every member (feature display), billing details stay admin-only.
create function public.workspace_plan(w uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when relay_private.has_role(w) then coalesce(
  (select jsonb_build_object('plan',case when s.status in ('active','trialing','past_due') then s.plan else 'free' end,'status',s.status)
   from public.workspace_subscriptions s where s.workspace_id=w),'{"plan":"free","status":"none"}'::jsonb) end;
$$;
revoke all on function public.workspace_plan(uuid) from public,anon;
grant execute on function public.workspace_plan(uuid) to authenticated;

-- Billable seats: everyone except read-only viewers.
create function relay_private.billable_seats(w uuid) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.memberships where workspace_id=w and role in ('owner','admin','member');
$$;
revoke all on function relay_private.billable_seats(uuid) from public,anon,authenticated;

-- Server only. Customer creation is recorded before checkout (idempotent per workspace).
create function public.billing_customer(w uuid,customer text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.workspace_subscriptions;
begin
 if customer is not null then
  insert into public.workspace_subscriptions(workspace_id,stripe_customer_id) values(w,customer)
  on conflict(workspace_id) do update set stripe_customer_id=coalesce(public.workspace_subscriptions.stripe_customer_id,excluded.stripe_customer_id),updated_at=now();
 end if;
 select * into s from public.workspace_subscriptions where workspace_id=w;
 return jsonb_build_object('customer',s.stripe_customer_id,'subscription',s.stripe_subscription_id,'plan',coalesce(s.plan,'free'),'status',coalesce(s.status,'none'),
  'seats',relay_private.billable_seats(w),'workspace_name',(select name from public.workspaces where id=w));
end $$;

create function public.billing_apply(event_id text,event_type text,event_at timestamptz,w uuid,customer text,subscription text,
 plan_name text,state text,seat_count integer,period_end timestamptz,cancel_at_end boolean,trial timestamptz) returns text
language plpgsql security definer set search_path='' as $$
declare s public.workspace_subscriptions;
begin
 insert into relay_private.stripe_events(id,type) values(event_id,event_type) on conflict do nothing;
 if not found then return 'duplicate';end if;
 if not exists(select 1 from public.workspaces where id=w) then return 'unknown_workspace';end if;
 select * into s from public.workspace_subscriptions where workspace_id=w for update;
 -- A customer already bound to another workspace is never moved.
 if customer is not null and exists(select 1 from public.workspace_subscriptions where stripe_customer_id=customer and workspace_id<>w) then return 'customer_conflict';end if;
 if s.workspace_id is not null and s.last_event_at is not null and event_at<s.last_event_at then return 'stale';end if;
 insert into public.workspace_subscriptions(workspace_id,stripe_customer_id,stripe_subscription_id,plan,status,seats,current_period_end,cancel_at_period_end,trial_end,last_event_at,updated_at)
 values(w,customer,subscription,coalesce(plan_name,'free'),state,coalesce(seat_count,0),period_end,coalesce(cancel_at_end,false),trial,event_at,now())
 on conflict(workspace_id) do update set
  stripe_customer_id=coalesce(excluded.stripe_customer_id,public.workspace_subscriptions.stripe_customer_id),
  stripe_subscription_id=case when excluded.status='canceled' and excluded.stripe_subscription_id=public.workspace_subscriptions.stripe_subscription_id then null else coalesce(excluded.stripe_subscription_id,public.workspace_subscriptions.stripe_subscription_id) end,
  plan=case when excluded.status in ('canceled','incomplete_expired') then 'free' else excluded.plan end,
  status=excluded.status,seats=excluded.seats,current_period_end=excluded.current_period_end,
  cancel_at_period_end=excluded.cancel_at_period_end,trial_end=excluded.trial_end,last_event_at=excluded.last_event_at,updated_at=now();
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,after_data)
 values(w,null,'billing',w,event_type,jsonb_build_object('plan',plan_name,'status',state,'seats',seat_count));
 return 'applied';
end $$;

-- Seat reconciliation by the worker: subscriptions whose quantity differs from members.
create function public.billing_seat_drift(batch integer default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('workspace_id',s.workspace_id,'subscription',s.stripe_subscription_id,'seats',s.seats,'billable',greatest(relay_private.billable_seats(s.workspace_id),1))),'[]'::jsonb)
 from (select * from public.workspace_subscriptions s where s.stripe_subscription_id is not null and s.status in ('active','trialing','past_due')
  and s.seats<>greatest(relay_private.billable_seats(s.workspace_id),1) limit least(greatest(batch,1),200)) s;
$$;
revoke all on function public.billing_customer(uuid,text),public.billing_apply(text,text,timestamptz,uuid,text,text,text,text,integer,timestamptz,boolean,timestamptz),public.billing_seat_drift(integer) from public,anon,authenticated;
grant execute on function public.billing_customer(uuid,text),public.billing_apply(text,text,timestamptz,uuid,text,text,text,text,integer,timestamptz,boolean,timestamptz),public.billing_seat_drift(integer) to service_role;

commit;
