-- supabase/migrations/20260730010000_rls_lockdown_batch_1_inert_tables.sql
--
-- Batch 1 of the RLS lockdown. Closes unauthenticated read/write access to 18
-- tables that have NO user-scoped or browser callers, so this batch changes no
-- product behavior.
--
-- Context: 52 public tables were found with `relrowsecurity = false` while `anon`
-- and `authenticated` held full DML. The anon key ships to every browser, so those
-- tables were world-readable and world-writable. See
-- docs/operations/security/RLS_LOCKDOWN_2026-07-30.md for the full map and the
-- remaining batches.
--
-- WHY RLS-ONLY AND NO `REVOKE`:
--   Enabling RLS with no permissive policy already denies `anon` and
--   `authenticated` (only `service_role` bypasses via rolbypassrls), which is how
--   `users`/`onto_projects`/`chat_sessions` are protected today. A table-level
--   REVOKE would add nothing for these tables while introducing a different and
--   worse failure mode: SECURITY INVOKER functions hit a hard `permission denied`
--   instead of simply seeing zero rows. There is also no precedent for revoking
--   table grants anywhere in supabase/migrations — every existing revoke targets a
--   function. Revokes are therefore deliberately deferred to a later, separate
--   change, after the seven SECURITY INVOKER functions that read these tables are
--   converted to SECURITY DEFINER.
--
-- DELIBERATELY EXCLUDED from this batch:
--   * retargeting_founder_pilot_members — 45 rows read by two SECURITY INVOKER
--     functions whose call sites are not yet pinned down; RLS could silently zero
--     their results. Needs its reader policy decided first.
--   * Every table with a user-scoped, browser, or unauthenticated caller
--     (queue_jobs, error_logs, visitors, beta_signups, feedback_rate_limit, and the
--     Tier B set) — those require code changes and/or ownership policies first.
--
-- Rollback: `alter table <t> disable row level security;` per table, plus dropping
-- the policies created here. Reverting restores the previous (insecure) state.

begin;

-- ---------------------------------------------------------------------------
-- Group 1: no callers of any kind. RLS with no policy = service-role only.
-- ---------------------------------------------------------------------------

alter table public.agent_call_tool_executions enable row level security;
alter table public.beta_event_attendance enable row level security;
alter table public.beta_events enable row level security;
alter table public.beta_feature_votes enable row level security;
alter table public.llm_prompts enable row level security;
alter table public.onto_tools enable row level security;
alter table public.question_metrics enable row level security;
alter table public.question_templates enable row level security;
alter table public.research_artifact_refs enable row level security;
alter table public.user_notification_preferences_backup enable row level security;
alter table public.welcome_email_sequences enable row level security;

-- Reached only through acquire_/release_/get_migration_platform_lock_status,
-- all SECURITY DEFINER, so RLS cannot affect them.
alter table public.migration_platform_lock enable row level security;

-- ---------------------------------------------------------------------------
-- Group 2: empty tables reachable from SECURITY INVOKER functions.
-- All four are read/deleted by delete_onto_project (an agentic chat tool) and
-- by onto_comment_validate_target / load_project_graph_context. They hold zero
-- rows, so an RLS-filtered read or a DELETE affecting zero rows is already the
-- status quo and chat behavior is unchanged. This is exactly why they are NOT
-- revoked: a revoke would turn today's no-op into a hard error.
-- ---------------------------------------------------------------------------

alter table public.onto_permissions enable row level security;
alter table public.onto_insights enable row level security;
alter table public.onto_metric_points enable row level security;
alter table public.onto_signals enable row level security;

-- ---------------------------------------------------------------------------
-- Group 3: has rows AND a live reader, so a policy is required alongside RLS.
-- ---------------------------------------------------------------------------

-- Global reference data (facet labels/colors/icons) with no ownership column,
-- read by validate_facet_values (SECURITY INVOKER). `to authenticated` keeps that
-- function working for signed-in callers while excluding anon by role targeting.
alter table public.onto_facet_definitions enable row level security;

drop policy if exists "onto_facet_definitions_authenticated_select" on public.onto_facet_definitions;
create policy "onto_facet_definitions_authenticated_select"
  on public.onto_facet_definitions
  for select
  to authenticated
  using (true);

-- Already carries correct dormant policies (own-row ALL + is_admin() SELECT);
-- they activate on enable and are intentionally left in place.
alter table public.agent_chat_messages enable row level security;

-- ---------------------------------------------------------------------------
-- service_role escape hatch, matching the established pattern in
-- 20260701020000_enable_rls_timing_metrics.sql. Strictly redundant because
-- service_role has rolbypassrls, but it is the repo convention and documents
-- intent.
-- ---------------------------------------------------------------------------

drop policy if exists "agent_call_tool_executions_service_role" on public.agent_call_tool_executions;
create policy "agent_call_tool_executions_service_role" on public.agent_call_tool_executions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "beta_event_attendance_service_role" on public.beta_event_attendance;
create policy "beta_event_attendance_service_role" on public.beta_event_attendance
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "beta_events_service_role" on public.beta_events;
create policy "beta_events_service_role" on public.beta_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "beta_feature_votes_service_role" on public.beta_feature_votes;
create policy "beta_feature_votes_service_role" on public.beta_feature_votes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "llm_prompts_service_role" on public.llm_prompts;
create policy "llm_prompts_service_role" on public.llm_prompts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "migration_platform_lock_service_role" on public.migration_platform_lock;
create policy "migration_platform_lock_service_role" on public.migration_platform_lock
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_tools_service_role" on public.onto_tools;
create policy "onto_tools_service_role" on public.onto_tools
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "question_metrics_service_role" on public.question_metrics;
create policy "question_metrics_service_role" on public.question_metrics
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "question_templates_service_role" on public.question_templates;
create policy "question_templates_service_role" on public.question_templates
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "research_artifact_refs_service_role" on public.research_artifact_refs;
create policy "research_artifact_refs_service_role" on public.research_artifact_refs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "user_notification_preferences_backup_service_role" on public.user_notification_preferences_backup;
create policy "user_notification_preferences_backup_service_role" on public.user_notification_preferences_backup
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "welcome_email_sequences_service_role" on public.welcome_email_sequences;
create policy "welcome_email_sequences_service_role" on public.welcome_email_sequences
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_permissions_service_role" on public.onto_permissions;
create policy "onto_permissions_service_role" on public.onto_permissions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_insights_service_role" on public.onto_insights;
create policy "onto_insights_service_role" on public.onto_insights
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_metric_points_service_role" on public.onto_metric_points;
create policy "onto_metric_points_service_role" on public.onto_metric_points
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_signals_service_role" on public.onto_signals;
create policy "onto_signals_service_role" on public.onto_signals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "onto_facet_definitions_service_role" on public.onto_facet_definitions;
create policy "onto_facet_definitions_service_role" on public.onto_facet_definitions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "agent_chat_messages_service_role" on public.agent_chat_messages;
create policy "agent_chat_messages_service_role" on public.agent_chat_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

commit;
