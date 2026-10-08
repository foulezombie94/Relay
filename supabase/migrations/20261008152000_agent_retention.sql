begin;
-- Same scheduler as the existing durable worker, no extra service.
create function relay_private.agent_maintenance() returns void language plpgsql security definer set search_path='' as $$begin
 update relay_private.agent_runs set status='error',completed_at=now() where status='running' and expires_at<now();
 update relay_private.agent_actions a set status='uncertain',error_code='delivery_uncertain',completed_at=now() from relay_private.jobs j where a.job_id=j.id and a.status='sending' and j.status='dead';
 delete from relay_private.agent_actions where status in ('sent','completed','failed','uncertain','cancelled') and completed_at<now()-interval '90 days';
 delete from relay_private.agent_actions where status in ('draft','pending') and requested_at<now()-interval '30 days';
 delete from relay_private.agent_runs where completed_at<now()-interval '90 days';
 delete from relay_private.agent_usage where month<date_trunc('month',now())::date-interval '13 months';
end $$;
revoke all on function relay_private.agent_maintenance() from public,anon,authenticated;
create or replace function public.relay_job_worker(operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 if operation='schedule' then perform relay_private.agent_maintenance();end if;
 return relay_private.workflow_job_dispatch(operation,payload);
end $$;
revoke all on function public.relay_job_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.relay_job_worker(text,jsonb) to service_role;
commit;
