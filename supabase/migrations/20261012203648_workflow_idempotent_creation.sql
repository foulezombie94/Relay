-- The shared save API supplies an explicit UUID from Idempotency-Key.
-- Allow that insert column while retaining RLS and all protected workflow fields.
grant insert (id) on public.workflows to authenticated;
