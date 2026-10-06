begin;
alter table public.tasks add column version integer not null default 1, add column completed_at timestamptz;
alter table public.commitments add column version integer not null default 1;
alter table public.conflicts add column version integer not null default 1;
alter table public.sequences add column version integer not null default 1;
create trigger touch_version before update on public.tasks for each row execute function relay_private.touch_version();
create trigger touch_version before update on public.commitments for each row execute function relay_private.touch_version();
create trigger touch_version before update on public.conflicts for each row execute function relay_private.touch_version();
create trigger touch_version before update on public.sequences for each row execute function relay_private.touch_version();
create function relay_private.task_completion() returns trigger language plpgsql set search_path='' as $$
begin
 new.completed_at:=case when new.status='done' then case when tg_op='UPDATE' and old.status='done' then old.completed_at else now() end else null end;
 return new;
end $$;
revoke all on function relay_private.task_completion() from public,anon,authenticated;
create trigger task_completion before insert or update on public.tasks for each row execute function relay_private.task_completion();

create table public.notifications(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 entity text not null check(entity in ('tasks','commitments')),entity_id uuid not null,
 kind text not null check(kind in ('assigned','due')),title text not null,due_date timestamptz,
 dedup_key text not null,created_at timestamptz not null default now(),read_at timestamptz,
 unique(workspace_id,user_id,dedup_key)
);
create index notifications_inbox_idx on public.notifications(workspace_id,user_id,created_at desc,id);
create index notifications_unread_idx on public.notifications(workspace_id,user_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id));
create policy notifications_update on public.notifications for update to authenticated using(user_id=(select auth.uid()) and relay_private.has_role(workspace_id)) with check(user_id=(select auth.uid()) and relay_private.has_role(workspace_id));

create function relay_private.notify_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is not null and new.status not in ('done','cancelled') and (tg_op='INSERT' or new.owner_id is distinct from old.owner_id)
 and exists(select 1 from public.memberships where workspace_id=new.workspace_id and user_id=new.owner_id) then
 insert into public.notifications(workspace_id,user_id,entity,entity_id,kind,title,due_date,dedup_key)
 values(new.workspace_id,new.owner_id,tg_table_name,new.id,'assigned',new.title,new.due_date,tg_table_name||':'||new.id||':assigned:'||new.version)
 on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function relay_private.notify_assignment() from public,anon,authenticated;
create trigger notify_assignment after insert or update on public.tasks for each row execute function relay_private.notify_assignment();
create trigger notify_assignment after insert or update on public.commitments for each row execute function relay_private.notify_assignment();
create index tasks_due_reminders_idx on public.tasks(due_date,owner_id,workspace_id) where status not in ('done','cancelled') and owner_id is not null;
create index commitments_due_reminders_idx on public.commitments(due_date,owner_id,workspace_id) where status not in ('done','cancelled','postponed') and owner_id is not null;
create function relay_private.generate_reminders() returns void language sql security definer set search_path='' as $$
 insert into public.notifications(workspace_id,user_id,entity,entity_id,kind,title,due_date,dedup_key)
 select r.workspace_id,r.owner_id,r.entity,r.id,'due',r.title,r.due_date,r.entity||':'||r.id||':due:'||r.due_date::text
 from (
  select workspace_id,owner_id,id,title,due_date,'tasks'::text entity from public.tasks where status not in ('done','cancelled') and due_date<=now()+interval '24 hours' and owner_id is not null
  union all
  select workspace_id,owner_id,id,title,due_date,'commitments' from public.commitments where status not in ('done','cancelled','postponed') and due_date<=now()+interval '24 hours' and owner_id is not null
 )r join public.memberships m on m.workspace_id=r.workspace_id and m.user_id=r.owner_id
 on conflict do nothing;
$$;
revoke all on function relay_private.generate_reminders() from public,anon,authenticated;
grant execute on function relay_private.generate_reminders() to service_role;
create extension if not exists pg_cron;
select cron.schedule('relay-due-reminders','*/5 * * * *','select relay_private.generate_reminders()');
commit;