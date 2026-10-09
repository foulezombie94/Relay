begin;
set local lock_timeout='5s';

alter table relay_private.agent_runs add column ledger_version smallint not null default 0,
 add column token_limit integer not null default 1000000,
 add column charged_tokens bigint not null default 0;
alter table relay_private.agent_usage add column uncertain_tokens bigint not null default 0;
create table relay_private.agent_provider_events(
 run_id uuid not null references relay_private.agent_runs(id) on delete cascade,
 sequence integer not null check(sequence between 0 and 15),
 status text not null default 'reserved' check(status in ('reserved','complete','rejected')),
 reserved_tokens integer not null check(reserved_tokens between 1 and 1000000),
 input_tokens integer not null default 0 check(input_tokens>=0),output_tokens integer not null default 0 check(output_tokens>=0),
 cost_microusd bigint not null default 0 check(cost_microusd>=0),
 provider text not null check(provider in ('openai','groq')),model text not null check(length(model) between 1 and 120),
 http_status integer,duration_ms integer,created_at timestamptz not null default now(),completed_at timestamptz,
 primary key(run_id,sequence)
);
alter table relay_private.agent_provider_events enable row level security;
revoke all on relay_private.agent_provider_events from public,anon,authenticated,service_role;

-- Called only after authorization/capability verification or deterministic expiry
-- under the same workspace advisory lock used for quota admission.
create function relay_private.settle_agent_run(run uuid,outcome text) returns void
language plpgsql security invoker set search_path='' as $$
declare r relay_private.agent_runs;known bigint;unknown bigint;inputs bigint;outputs bigint;cost bigint;
begin
 select * into r from relay_private.agent_runs where id=run for update;
 if r.status<>'running' or r.ledger_version<>1 then return;end if;
 select coalesce(sum(input_tokens+output_tokens) filter(where status='complete'),0),
 coalesce(sum(reserved_tokens) filter(where status='reserved'),0),coalesce(sum(input_tokens),0),coalesce(sum(output_tokens),0),coalesce(sum(cost_microusd),0)
 into known,unknown,inputs,outputs,cost from relay_private.agent_provider_events where run_id=run;
 update relay_private.agent_usage set tokens_reserved=greatest(0,tokens_reserved-r.reserved_tokens)+known+unknown,
 tokens_actual=tokens_actual+known,uncertain_tokens=uncertain_tokens+unknown
 where workspace_id=r.workspace_id and month=date_trunc('month',r.started_at at time zone 'UTC')::date;
 update relay_private.agent_runs set status=case when outcome='complete' then 'complete' else 'error' end,
 completed_at=now(),actual_tokens=known,input_tokens=inputs,output_tokens=outputs,cost_microusd=cost,charged_tokens=known+unknown where id=run;
end $$;
revoke all on function relay_private.settle_agent_run(uuid,text) from public,anon,authenticated,service_role;

alter function relay_private.agent_runtime(uuid,text,jsonb) rename to agent_runtime_v1;
revoke all on function relay_private.agent_runtime_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function relay_private.agent_runtime(w uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare r relay_private.agent_runs;e relay_private.agent_provider_events;output jsonb;required bigint;delta bigint;cap bigint;charge bigint;candidate record;budget integer;month_start date;
begin
 if auth.uid() is null then raise exception 'Forbidden' using errcode='42501';end if;
 if operation not in ('finish','provider_finish') and not relay_private.has_role(w) then raise exception 'Forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('agent:'||w::text,0));
 if operation in ('begin','usage') then
  for candidate in select id from relay_private.agent_runs where workspace_id=w and status='running' and ledger_version=1 and expires_at<=now() limit 100 loop
   perform relay_private.settle_agent_run(candidate.id,'error');
  end loop;
 end if;
 if operation='begin' then
  if payload ? 'token_limit' then
   budget:=(payload->>'token_limit')::integer;
   if budget not between 1000 and 1000000 or budget<coalesce((payload->>'reserved_tokens')::integer,60000) then raise exception 'Invalid budget' using errcode='22023';end if;
  end if;
  output:=relay_private.agent_runtime_v1(w,operation,payload);
  -- Legacy deployments have no per-call ledger and keep conservative accounting.
  if payload ? 'token_limit' then update relay_private.agent_runs set ledger_version=1,token_limit=budget where id=(output->>'id')::uuid;end if;
  return output;
 elsif operation='usage' then
  output:=relay_private.agent_runtime_v1(w,operation,payload);
  return output||jsonb_build_object('provider_calls',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
   select p.sequence,p.status,p.provider,p.model,p.input_tokens,p.output_tokens,p.duration_ms,p.http_status,p.created_at
   from relay_private.agent_provider_events p join relay_private.agent_runs ar on ar.id=p.run_id
   where ar.workspace_id=w and ar.user_id=auth.uid() order by p.created_at desc limit 50) x));
 end if;
 select * into r from relay_private.agent_runs where id=(payload->>'id')::uuid and workspace_id=w and user_id=auth.uid() for update;
 if r.id is null or r.capability_hash is distinct from encode(sha256(convert_to(payload->>'secret','UTF8')),'hex') then raise exception 'Run unavailable' using errcode='42501';end if;
 if operation='finish' and r.ledger_version=1 then
  perform relay_private.settle_agent_run(r.id,payload->>'status');return '{}';
 elsif operation in ('provider_begin','provider_finish') then
  if r.ledger_version<>1 or r.status<>'running' then raise exception 'Run unavailable' using errcode='42501';end if;
  if operation='provider_begin' then
   if r.expires_at<=now() then raise exception 'Expired run' using errcode='42501';end if;
   budget:=(payload->>'reserved_tokens')::integer;
   if budget is null or budget not between 1 and 1000000 or (payload->>'sequence')::integer not between 0 and 15 then raise exception 'Invalid provider budget' using errcode='22023';end if;
   if exists(select 1 from relay_private.agent_provider_events where run_id=r.id and sequence=(payload->>'sequence')::integer) then raise exception 'Provider call already admitted' using errcode='40001';end if;
   select coalesce(sum(case when status='complete' then input_tokens+output_tokens when status='rejected' then 0 else reserved_tokens end),0)+budget into required from relay_private.agent_provider_events where run_id=r.id;
   if required>r.token_limit then raise exception 'Tool budget exceeded' using errcode='53300';end if;
   delta:=greatest(0,required-r.reserved_tokens);month_start:=date_trunc('month',r.started_at at time zone 'UTC')::date;
   select monthly_token_limit into cap from relay_private.agent_settings where workspace_id=w;
   if (select tokens_reserved from relay_private.agent_usage where workspace_id=w and month=month_start)+delta>cap then raise exception 'Monthly agent quota exceeded' using errcode='53300';end if;
   update relay_private.agent_usage set tokens_reserved=tokens_reserved+delta where workspace_id=w and month=month_start;
   update relay_private.agent_runs set reserved_tokens=reserved_tokens+delta where id=r.id;
   insert into relay_private.agent_provider_events(run_id,sequence,reserved_tokens,provider,model) values(r.id,(payload->>'sequence')::integer,budget,payload->>'provider',payload->>'model');
  else
   select * into e from relay_private.agent_provider_events where run_id=r.id and sequence=(payload->>'sequence')::integer for update;
   if e.run_id is null then raise exception 'Provider call missing' using errcode='22023';end if;
   if e.status<>'reserved' then return '{}';end if;
   if payload->>'status'='complete' then
    if coalesce((payload->>'input_tokens')::bigint,-1)<0 or coalesce((payload->>'output_tokens')::bigint,-1)<0
    or (payload->>'input_tokens')::bigint+(payload->>'output_tokens')::bigint>e.reserved_tokens then raise exception 'Invalid provider usage' using errcode='22023';end if;
    update relay_private.agent_provider_events set status='complete',input_tokens=(payload->>'input_tokens')::integer,output_tokens=(payload->>'output_tokens')::integer,
    cost_microusd=greatest(0,coalesce((payload->>'cost_microusd')::bigint,0)),http_status=(payload->>'http_status')::integer,duration_ms=greatest(0,(payload->>'duration_ms')::integer),completed_at=now() where run_id=e.run_id and sequence=e.sequence;
   elsif payload->>'status'='rejected' and (payload->>'http_status')::integer between 400 and 499 and (payload->>'http_status')::integer<>408 then
    update relay_private.agent_provider_events set status='rejected',http_status=(payload->>'http_status')::integer,duration_ms=greatest(0,(payload->>'duration_ms')::integer),completed_at=now() where run_id=e.run_id and sequence=e.sequence;
   else raise exception 'Invalid provider outcome' using errcode='22023';end if;
  end if;
  return '{}';
 end if;
 return relay_private.agent_runtime_v1(w,operation,payload);
end $$;
revoke all on function relay_private.agent_runtime(uuid,text,jsonb) from public,anon;
grant execute on function relay_private.agent_runtime(uuid,text,jsonb) to authenticated;
create or replace function public.agent_runtime(w uuid,operation text,payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select relay_private.agent_runtime(w,operation,payload) $$;
revoke all on function public.agent_runtime(uuid,text,jsonb) from public,anon;
grant execute on function public.agent_runtime(uuid,text,jsonb) to authenticated;
create index agent_expired_ledger_idx on relay_private.agent_runs(workspace_id,expires_at) where status='running' and ledger_version=1;
commit;
