-- Explicit grants: new public tables can inherit anon privileges from defaults.
-- RLS already denies anonymous rows; remove the unnecessary table grants too.
revoke all on table public.dashboard_preferences from public, anon;
