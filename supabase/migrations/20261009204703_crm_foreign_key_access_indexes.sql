begin;
set local lock_timeout='5s';
-- Cover the new per-user cache FK and the account/record/retention paths used
-- by these changes. Other FK advisor suggestions remain subject to profiling.
create index crm_cache_user_idx on relay_private.crm_aggregate_cache(user_id);
create index communications_user_idx on public.communications(user_id);
create index communications_workspace_integration_idx on public.communications(workspace_id,integration_id);
create index communications_workspace_record_idx on public.communications(workspace_id,record_id);
create index meetings_integration_idx on public.meetings(workspace_id,integration_id);
create index agent_runs_user_idx on relay_private.agent_runs(user_id);
create index agent_actions_user_idx on relay_private.agent_actions(user_id);
create index agent_actions_run_idx on relay_private.agent_actions(run_id);
create index agent_actions_conversation_idx on relay_private.agent_actions(conversation_id);
create index agent_actions_job_idx on relay_private.agent_actions(job_id);
commit;
