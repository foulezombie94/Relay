begin;
set local lock_timeout='5s';
create index records_active_updated_idx on public.records(workspace_id,object_id,updated_at desc,id) where not archived;
create index records_pulse_idle_idx on public.records(workspace_id,object_id,updated_at,id) where not archived and stage not in ('Gagné','Perdu');
create index tasks_record_open_due_idx on public.tasks(workspace_id,record_id,due_date,id) where status in ('open','in_progress');
create index commitments_record_due_idx on public.commitments(workspace_id,record_id,due_date,id) where status in ('confirmed','in_progress','proposed','postponed');
create index meetings_record_interaction_idx on public.meetings(workspace_id,record_id,(coalesce(starts_at,created_at)) desc);
create index communications_reply_lookup_idx on public.communications(workspace_id,user_id,integration_id,thread_id,direction,received_at desc) where kind='email';
create index audit_record_history_idx on public.audit_events(workspace_id,entity_id,created_at desc,id desc) where entity='records';
create index crm_cache_expiry_idx on relay_private.crm_aggregate_cache(expires_at);

-- The private-proposal migration replaced the earlier no-op audit guard.
-- Restore it while keeping private_to for every private source category.
create or replace function relay_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb;a jsonb;w uuid;who uuid;private_to uuid;begin
 b:=case when tg_op='INSERT' then null else to_jsonb(old)-array['agent_search','search','search_index'] end;
 a:=case when tg_op='DELETE' then null else to_jsonb(new)-array['agent_search','search','search_index'] end;
 w:=coalesce((a->>'workspace_id')::uuid,(b->>'workspace_id')::uuid);who:=(select auth.uid());
 if not exists(select 1 from public.workspaces where id=w) then return coalesce(new,old);end if;
 if who is not null and not relay_private.has_role(w) then raise exception 'Forbidden';end if;
 if tg_op='UPDATE' and (b-array['updated_at','version'])=(a-array['updated_at','version']) then return new;end if;
 if tg_table_name in ('notes','meetings','commitments','conflicts') and (coalesce((a->>'private')::boolean,false) or coalesce((b->>'private')::boolean,false)) then private_to:=coalesce((a->>'author_id')::uuid,(b->>'author_id')::uuid);end if;
 insert into public.audit_events(workspace_id,actor_id,entity,entity_id,action,before_data,after_data,private_to) values(w,who,tg_table_name,coalesce((a->>'id')::uuid,(b->>'id')::uuid),lower(tg_op),b,a,private_to);
 return coalesce(new,old);
end $$;

-- Only nine known policies have bare uid calls. Wrapping this uncorrelated
-- expression evaluates auth once per statement without changing policy logic.
do $$ declare p record;q text;c text;begin
 for p in select * from pg_policies where schemaname='public' and
 ((tablename='report_dashboards' and policyname in ('dashboards_read','dashboards_insert','dashboards_update','dashboards_delete'))
 or (tablename='dashboard_preferences' and policyname in ('dashboard_prefs_read','dashboard_prefs_write'))
 or (tablename='meetings' and policyname='meeting_private')
 or (tablename='commitments' and policyname='commitment_private')
 or (tablename='conflicts' and policyname='conflict_private')) loop
  q:=replace(p.qual,'auth.uid()','(select auth.uid())');c:=replace(p.with_check,'auth.uid()','(select auth.uid())');
  execute format('alter policy %I on %I.%I%s%s',p.policyname,p.schemaname,p.tablename,
   case when q is null then '' else ' using ('||q||')' end,case when c is null then '' else ' with check ('||c||')' end);
 end loop;
end $$;
-- Combine precisely the original SELECT OR expressions. ALL policies retain
-- identical INSERT/UPDATE/DELETE checks; restrictive policies are untouched.
do $$ declare t text;p record;q text;begin
 foreach t in array array['dashboard_preferences','documents','list_entries','lists','notes','portal_items','portal_members','portals'] loop
  q:='';
  for p in select * from pg_policies where schemaname='public' and tablename=t and permissive='PERMISSIVE' and cmd in ('SELECT','ALL') order by policyname loop
   if p.roles<>array['authenticated']::name[] then raise exception 'Unexpected policy role';end if;
   q:=q||case when q='' then '' else ' OR ' end||'('||p.qual||')';
   execute format('drop policy %I on public.%I',p.policyname,t);
   if p.cmd='ALL' then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',p.policyname||'_insert',t,coalesce(p.with_check,p.qual));
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',p.policyname||'_update',t,p.qual,coalesce(p.with_check,p.qual));
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',p.policyname||'_delete',t,p.qual);
   end if;
  end loop;
  if q='' then raise exception 'Missing source policies';end if;
  execute format('create policy consolidated_read on public.%I for select to authenticated using (%s)',t,q);
 end loop;
end $$;

-- Preserve the version guard while making its reason actionable. Fail the
-- migration if the installed runtime does not match the reviewed definition.
do $$ declare original text;patched text;begin
 original:=pg_get_functiondef('relay_private.workflow_tick(uuid,uuid)'::regprocedure);
 if strpos(original,'''Record changed'' using errcode=''22023''')=0 then raise exception 'Unexpected workflow runtime';end if;
 patched:=replace(original,'''Record changed'' using errcode=''22023''','''Record changed'' using errcode=''P0003''');
 patched:=replace(patched,'exception when sqlstate ''42501'' or sqlstate ''22023''','exception when sqlstate ''P0003'' or sqlstate ''42501'' or sqlstate ''22023''');
 patched:=replace(patched,'code:=case when code=''42501''','code:=case when code=''P0003'' then ''record_changed'' when code=''42501''');
 if patched=original or strpos(patched,'when code=''P0003'' then ''record_changed''')=0 then raise exception 'Workflow diagnostic patch incomplete';end if;
 execute patched;
end $$;

-- Expiry recovery and cache retention continue after process death, without
-- waiting for the user to return. Unknown provider calls remain charged.
create function relay_private.crm_runtime_maintenance() returns void language plpgsql security definer set search_path='' set statement_timeout='15s' as $$
declare r record;begin
 for r in select id,workspace_id from relay_private.agent_runs where status='running' and ledger_version=1 and expires_at<=now() order by workspace_id,id limit 100 loop
  if pg_try_advisory_xact_lock(hashtextextended('agent:'||r.workspace_id::text,0)) then perform relay_private.settle_agent_run(r.id,'error');end if;
 end loop;
 delete from relay_private.crm_aggregate_cache where (workspace_id,user_id,cache_key) in(select workspace_id,user_id,cache_key from relay_private.crm_aggregate_cache where expires_at<now() order by expires_at limit 10000);
end $$;
revoke all on function relay_private.crm_runtime_maintenance() from public,anon,authenticated,service_role;
select cron.schedule('relay-crm-runtime-maintenance','* * * * *','select relay_private.crm_runtime_maintenance()');
commit;
