set local lock_timeout='5s';
create function relay_private.mcp_flow_destination(flow_hash text) returns text
language sql stable security definer set search_path='' as $$
 select f.redirect_uri from relay_private.mcp_flows f
 where f.flow_hash=mcp_flow_destination.flow_hash and f.used_at is null and f.expires_at>now()
$$;
create function public.mcp_flow_destination(flow_hash text) returns text
language sql stable security invoker set search_path='' as $$select relay_private.mcp_flow_destination(flow_hash)$$;
revoke all on function relay_private.mcp_flow_destination(text),public.mcp_flow_destination(text) from public,anon,authenticated;
grant execute on function relay_private.mcp_flow_destination(text),public.mcp_flow_destination(text) to service_role;
create table relay_private.form_source_buckets (
 name text primary key check(length(name)<=200),
 window_at timestamptz not null default now(),
 requests integer not null default 0
);
create index form_source_buckets_window_idx on relay_private.form_source_buckets(window_at);
alter table relay_private.form_source_buckets enable row level security;
revoke all on relay_private.form_source_buckets from public,anon,authenticated;
grant all on relay_private.form_source_buckets to service_role;
create function relay_private.record_form_admit(source_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare minute_count integer; day_count integer;
begin
 if coalesce(source_key,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid source' using errcode='22023'; end if;
 delete from relay_private.form_source_buckets where name in (
  select name from relay_private.form_source_buckets where window_at<now()-interval '2 days' limit 100);
 insert into relay_private.form_source_buckets(name,requests) values('minute:'||source_key,1)
 on conflict(name) do update set
  requests=case when form_source_buckets.window_at+interval '1 minute'<=now() then 1 else form_source_buckets.requests+1 end,
  window_at=case when form_source_buckets.window_at+interval '1 minute'<=now() then now() else form_source_buckets.window_at end
 returning requests into minute_count;
 insert into relay_private.form_source_buckets(name,requests) values('day:'||source_key,1)
 on conflict(name) do update set
  requests=case when form_source_buckets.window_at+interval '1 day'<=now() then 1 else form_source_buckets.requests+1 end,
  window_at=case when form_source_buckets.window_at+interval '1 day'<=now() then now() else form_source_buckets.window_at end
 returning requests into day_count;
 return minute_count<=5 and day_count<=50;
end $$;
create function public.record_form_admit(source_key text) returns boolean
language sql security invoker set search_path='' as $$select relay_private.record_form_admit(source_key)$$;
revoke all on function relay_private.record_form_admit(text),public.record_form_admit(text) from public,anon,authenticated;
grant execute on function relay_private.record_form_admit(text),public.record_form_admit(text) to service_role;
