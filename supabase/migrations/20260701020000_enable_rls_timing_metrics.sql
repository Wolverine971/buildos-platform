-- supabase/migrations/20260701020000_enable_rls_timing_metrics.sql
-- Enable Row Level Security on timing_metrics.
--
-- The table was created in 20260130_235900_add_timing_metrics.sql with NO RLS
-- and no policies; the only later migration touching it
-- (20260428000015_add_chat_turn_observability_phase1.sql) just added a column.
-- With RLS off, default PostgREST grants let any authenticated user read/write
-- every user's timing rows (session/project/entity UUIDs, message lengths,
-- prepared-prompt ids, timing metadata) — a cross-tenant metadata leak.
--
-- Policies mirror the sibling observability tables (chat_turn_runs,
-- chat_prompt_snapshots, chat_turn_events) from 20260428000015:
--   - user insert scoped to their own rows (the FastChat stream writer inserts
--     via the user-scoped locals.supabase client with user_id = auth.uid())
--   - user + admin select (the admin timing dashboard reads via the user-scoped
--     client and relies on is_admin(); the session-detail reader uses the
--     service-role client which bypasses RLS)
--   - service_role ALL escape hatch

alter table public.timing_metrics enable row level security;

drop policy if exists "timing_metrics_user_insert" on public.timing_metrics;
create policy "timing_metrics_user_insert"
  on public.timing_metrics
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "timing_metrics_user_select" on public.timing_metrics;
create policy "timing_metrics_user_select"
  on public.timing_metrics
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "timing_metrics_admin_select" on public.timing_metrics;
create policy "timing_metrics_admin_select"
  on public.timing_metrics
  for select
  to authenticated
  using (is_admin());

drop policy if exists "timing_metrics_service_role" on public.timing_metrics;
create policy "timing_metrics_service_role"
  on public.timing_metrics
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
