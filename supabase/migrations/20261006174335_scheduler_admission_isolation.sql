begin;
-- Version matches the applied Supabase migration history.
-- Saturated scheduled accounts must not roll back other tenants' scheduler batch.
-- Authenticated interactive callers still receive the explicit admission error.
create or replace function relay_private.limit_job_admission() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type in ('imports','workflow_run','email_sync','calendar_sync') and new.user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('job-admission:'||new.workspace_id::text||new.user_id::text,0));
  if (select count(*) from relay_private.jobs where workspace_id=new.workspace_id and user_id=new.user_id and created_at>now()-interval '1 minute')>=30 then
   if (select auth.role())='service_role' then return null;end if;
   raise exception 'Job admission limit reached' using errcode='53300';
  end if;
 end if;
 return new;
end $$;
revoke all on function relay_private.limit_job_admission() from public,anon,authenticated;
commit;
