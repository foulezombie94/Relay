begin;
-- Performance audit P-07. Two pg_cron jobs run every minute and pg_cron keeps every run:
-- cron.job_run_details had 110 000 rows (19 MB, 42 % of the database) after seven weeks.
-- Runs older than 7 days are deleted now and every night. Only the scheduler's own run
-- history is affected; no application data.
delete from cron.job_run_details where end_time < now() - interval '7 days';
select cron.schedule(
  'relay-cron-history-retention',
  '23 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
commit;
