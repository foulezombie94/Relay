begin;
-- Version matches the applied Supabase migration history.
-- Bookkeeping only: these baseline migrations were applied before history tracking.
-- Validate their surviving objects; never replay initial DDL on the existing project.
do $checks$
declare missing text;
begin
 select string_agg(t,', ') into missing from unnest(array['public.activities','public.ai_conversations','public.attributes','public.audit_events','public.commitments','public.communications','public.conflicts','public.documents','public.duplicate_decisions','public.enrollments','public.handovers','public.integrations','public.invitations','public.list_entries','public.lists','public.meetings','public.memberships','public.merge_history','public.notes','public.objects','public.portal_comments','public.portal_items','public.portal_members','public.portals','public.record_relations','public.records','public.sequences','public.suppressions','public.tasks','public.views','public.workflow_runs','public.workflows','public.workspaces','public.zapier_keys','relay_private.integration_secrets','relay_private.merge_restore_points','relay_private.oauth_sessions','relay_private.zapier_credentials','relay_private.zapier_requests']) t where to_regclass(t) is null;
 if missing is not null then raise exception 'Baseline tables absent: %',missing;end if;
 select string_agg(f,', ') into missing from unnest(array['public.change_member','public.claim_invitations','public.create_workspace','public.decide_duplicate','public.execute_preview','public.integration_disconnect','public.integration_get','public.integration_oauth_begin','public.integration_oauth_consume','public.integration_refresh_claim','public.integration_refresh_finish','public.integration_save','public.integration_touch','public.merge_records','public.preview_undo_merge','public.undo_merge','public.zapier_key_create','public.zapier_key_revoke','public.zapier_request','relay_private.audit_change','relay_private.change_member','relay_private.claim_invitations','relay_private.create_workspace','relay_private.decide_duplicate','relay_private.execute_preview','relay_private.has_role','relay_private.immutable_workspace','relay_private.integration_disconnect','relay_private.integration_get','relay_private.integration_oauth_begin','relay_private.integration_oauth_consume','relay_private.integration_refresh_claim','relay_private.integration_refresh_finish','relay_private.integration_save','relay_private.integration_touch','relay_private.lock_workspace_identity','relay_private.merge_records','relay_private.merge_state','relay_private.portal_access','relay_private.preview_undo_merge','relay_private.protect_merged_record','relay_private.reject_merged_reference','relay_private.touch_version','relay_private.undo_merge','relay_private.validate_commitment','relay_private.zapier_key_create','relay_private.zapier_key_revoke','relay_private.zapier_request']) f
 where not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname=split_part(f,'.',1) and p.proname=split_part(f,'.',2));
 if missing is not null then raise exception 'Baseline functions absent: %',missing;end if;
end $checks$;
insert into supabase_migrations.schema_migrations(version,name,statements) values
 ('202610060001','schema',array[]::text[]),
 ('202610060002','operations',array[]::text[]),
 ('202610060003','finishing',array[]::text[]),
 ('202610060004','integrations',array[]::text[]),
 ('202610060005','communications',array[]::text[]),
 ('20261006093426','crm_improvements',array[]::text[]),
 ('20261006094214','merge_consistency',array[]::text[]),
 ('20261006095630','duplicate_decisions_and_undo',array[]::text[]),
 ('20261006102036','secure_service_connections',array[]::text[])
on conflict(version) do nothing;
commit;
