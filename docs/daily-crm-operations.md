# Daily CRM operations — 6 October 2026

## Delivered
- Server search, status/owner/due filters and pagination for tasks, commitments, notes, meetings, conflicts, handovers, lists and portals. Related record names come from the matching page, without relying on a 100-record cache.
- Searchable, paginated record selectors for links and email personalization.
- Editable sources, milestones, sequence steps, attribute options and workflow conditions/actions.
- Optimistic version checks for tasks, commitments, conflicts and sequences. Task completion timestamp stored separately from the due date.
- Private assignment notifications and due reminders. Supabase Cron generates reminders every five minutes; UI polls every minute.
- Durable connector pages, atomic upsert/checkpoint commits, exclusive leases, retries after failure. Email first import: past 30 days; subsequent imports: received timestamps with five-minute overlap. Calendars: primary calendar, upcoming 30 days, refreshed snapshots with deletion reconciliation on cycle completion.
- Opt-in automatic connector imports. The standalone worker consumes Postgres jobs directly; completed cycles are due after five minutes.
- Sequence delivery engine: confirmed enrollment, immutable step/address snapshot, timezone/business-hour scheduling, pause/resume, fresh reply check, suppressions, token-backed unsubscribe, exclusive attempt per step, and no blind retry after an uncertain send.

## Deployment
Run `npm run worker` on Railway or another durable host. It uses Supabase directly. `/api/jobs/run` is an optional authenticated enqueue trigger only. See [deployment](deployment.md) for flags, health, metrics, retry policy and telemetry privacy.

The local worker operates while this computer is running. For public use, set APP_URL to the deployed HTTPS origin and register matching OAuth callbacks. Sequence enrollment deliberately refuses a loopback/http origin: recipients need a usable unsubscribe link. Existing disconnected integrations do not auto-enable synchronization; reconnecting or changing the connected email resets cursor and automatic mode.

SQL migrations have been applied to the configured project. Supabase Cron for reminders is independent of the local worker.

## Verification and limits
Targeted tests cover timezone/DST scheduling, message validation, provider page host validation, OAuth refresh and prior import/forecast behavior. The rollback SQL test covers notifications, cross-user RLS, version/completion timestamps, sync lease/resume, pause/resume, uncertain send handling, and unsubscribe exclusions. No real email is sent by these tests.

This is not full bidirectional email/calendar mirroring: emails contain previews, deletion/move history in mail is not mirrored, calendars remain read-only and the configured 30-day window is intentional. Provider rejection or missing consent remains an external configuration issue. Accepted emails are not proof of delivery. A message already in flight can arrive after a pause or unsubscribe.

Workflows still require preview/confirmation; automatic record-change workflow triggers, SSO/SCIM, field/team ACLs, telephony and mobile apps are outside this delivery. Some administrative pickers (members, pipelines, object definitions) remain bounded to 100 items; large-enterprise support requires further work. Historical context summaries and diagnostics retain their documented limits.

## Official references
- https://support.pipedrive.com/en/article/activities
- https://attio.com/help/reference/automations/workflows
- https://help.close.com/feature-guide/workflows
- https://developers.google.com/workspace/gmail/api/guides/list-messages
- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list

These guided the interactions and safeguards; no competitor code or branding was copied.
