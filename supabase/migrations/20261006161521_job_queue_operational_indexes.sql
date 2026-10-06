begin;
create index enrollments_due_worker_idx on public.enrollments(next_at,id) where status='active';
create index jobs_admission_idx on relay_private.jobs(workspace_id,user_id,created_at desc) where user_id is not null;
create function relay_private.limit_job_admission() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type in ('imports','workflow_run','email_sync','calendar_sync') and new.user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('job-admission:'||new.workspace_id::text||new.user_id::text,0));
  if (select count(*) from relay_private.jobs where workspace_id=new.workspace_id and user_id=new.user_id and created_at>now()-interval '1 minute')>=30 then
   raise exception 'Job admission limit reached' using errcode='53300';
  end if;
 end if;
 return new;
end $$;
revoke all on function relay_private.limit_job_admission() from public,anon,authenticated;
create trigger limit_job_admission before insert on relay_private.jobs for each row execute function relay_private.limit_job_admission();
create function relay_private.stop_terminal_sequence_job() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type='sequence_send' and new.status='dead' and old.status<>'dead' then
  update public.enrollments set status='failed',next_at=null,last_error='Le suivi est arrêté après un échec permanent ou plusieurs tentatives. Vérifiez le compte et la boîte d’envoi avant de réinscrire.'
  where id=(new.payload->>'enrollment_id')::uuid and workspace_id=new.workspace_id and user_id=new.user_id and status in ('active','paused');
  update public.sequence_deliveries set status='uncertain' where enrollment_id=(new.payload->>'enrollment_id')::uuid and workspace_id=new.workspace_id and status='sending';
 end if;
 return new;
end $$;
revoke all on function relay_private.stop_terminal_sequence_job() from public,anon,authenticated;
create trigger stop_terminal_sequence_job after update of status on relay_private.jobs for each row execute function relay_private.stop_terminal_sequence_job();
commit;
