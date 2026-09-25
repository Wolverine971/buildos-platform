-- supabase/migrations/20260925013000_contain_client_callable_definer_rpcs.sql
-- Tasker 104 / 76: 76 SECURITY DEFINER functions were executable by anon (the public key in
-- the web bundle), 72 of them without needing to be. Confirmed live 2026-09-25: anon could read
-- revenue metrics and top users with emails. Grants only; no function body changes.
-- Classification: every call site traced to its client (service vs user session), plus prod
-- catalog dependencies (policies, invoker callers, triggers). Revoking from anon alone is a
-- no-op while PUBLIC keeps its default EXECUTE, so both are revoked and grants made explicit.
-- Deliberately unchanged: public.is_admin() (anon-read policies on public pages evaluate it),
-- get_project_invite_preview (logged-out invite page), log_client_error (logged-out error
-- logging), app_auth.is_admin() (prod-only, unreferenced; checks the caller only), and the
-- caller-only RLS helpers current_actor_id() / current_actor_has_project_access(): policies on
-- nine tables apply to anon, so revoking them turns an expired session's empty result into an
-- error (caught by `pnpm db:rehearse --role-probe`). They answer only about the caller.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Server-only (44): called only with the service-role client, by definer SQL, or not at all.
REVOKE ALL ON FUNCTION onto.ensure_actor_for_user(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION onto.ensure_actor_for_user(p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_send_next_step_now(p_enrollment_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_next_step_now(p_enrollment_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.build_fastchat_project_intelligence(p_context_type text, p_user_id uuid, p_project_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_fastchat_project_intelligence(p_context_type text, p_user_id uuid, p_project_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.check_and_increment_sms_daily_limit(p_user_id uuid, p_increment integer, p_default_limit integer, p_now timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_increment_sms_daily_limit(p_user_id uuid, p_increment integer, p_default_limit integer, p_now timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.claim_pending_email_sequence_sends(p_sequence_key text, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_email_sequence_sends(p_sequence_key text, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_specific_email_sequence_send(p_enrollment_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_specific_email_sequence_send(p_enrollment_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_security_events(p_now timestamp with time zone, p_low_signal_retention_days integer, p_high_signal_retention_days integer, p_dry_run boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_security_events(p_now timestamp with time zone, p_low_signal_retention_days integer, p_high_signal_retention_days integer, p_dry_run boolean) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_stale_brief_generations(p_user_id uuid, p_timeout_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_brief_generations(p_user_id uuid, p_timeout_minutes integer) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_structure_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_structure_history() TO service_role;
REVOKE ALL ON FUNCTION public.complete_email_sequence_send(p_enrollment_id uuid, p_email_id uuid, p_branch_key text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_email_sequence_send(p_enrollment_id uuid, p_email_id uuid, p_branch_key text, p_metadata jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.defer_email_sequence_step(p_enrollment_id uuid, p_next_send_at timestamp with time zone, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_email_sequence_step(p_enrollment_id uuid, p_next_send_at timestamp with time zone, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.emit_project_activity_batched_event(p_recipient_user_id uuid, p_project_id uuid, p_payload jsonb, p_metadata jsonb, p_actor_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_project_activity_batched_event(p_recipient_user_id uuid, p_project_id uuid, p_payload jsonb, p_metadata jsonb, p_actor_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.enroll_user_in_email_sequence(p_user_id uuid, p_sequence_key text, p_recipient_email text, p_signup_method text, p_trigger_source text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_user_in_email_sequence(p_user_id uuid, p_sequence_key text, p_recipient_email text, p_signup_method text, p_trigger_source text, p_metadata jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.exit_email_from_email_sequence(p_email text, p_sequence_key text, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exit_email_from_email_sequence(p_email text, p_sequence_key text, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.exit_user_from_email_sequence(p_user_id uuid, p_sequence_key text, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exit_user_from_email_sequence(p_user_id uuid, p_sequence_key text, p_reason text) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_draft_project(p_draft_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_draft_project(p_draft_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.flush_project_activity_notification_batch(p_batch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flush_project_activity_notification_batch(p_batch_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_admin_model_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_model_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.get_admin_operation_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_operation_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.get_admin_top_users(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_top_users(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_content_release_performance(p_from_date date, p_to_date date, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_release_performance(p_from_date date, p_to_date date, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_migration_platform_lock_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_migration_platform_lock_status() TO service_role;
REVOKE ALL ON FUNCTION public.get_project_phases_hierarchy(p_project_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_phases_hierarchy(p_project_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_project_skeleton_with_access(p_project_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access(p_project_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_project_statistics(p_project_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_statistics(p_project_id uuid, p_user_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_revenue_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_revenue_metrics() TO service_role;
REVOKE ALL ON FUNCTION public.get_user_sms_metrics(p_user_id uuid, p_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sms_metrics(p_user_id uuid, p_days integer) TO service_role;
REVOKE ALL ON FUNCTION public.increment_migration_retry_count(row_id bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_migration_retry_count(row_id bigint) TO service_role;
REVOKE ALL ON FUNCTION public.increment_onto_public_page_view_count(p_public_page_id uuid, p_is_author boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_onto_public_page_view_count(p_public_page_id uuid, p_is_author boolean) TO service_role;
REVOKE ALL ON FUNCTION public.is_email_suppressed(p_email text, p_scope text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_suppressed(p_email text, p_scope text) TO service_role;
REVOKE ALL ON FUNCTION public.log_notification_event(p_level text, p_message text, p_namespace text, p_correlation_id uuid, p_event_id uuid, p_delivery_id uuid, p_user_id uuid, p_context jsonb, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_notification_event(p_level text, p_message text, p_namespace text, p_correlation_id uuid, p_event_id uuid, p_delivery_id uuid, p_user_id uuid, p_context jsonb, p_metadata jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.log_project_change(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_before_data jsonb, p_after_data jsonb, p_changed_by uuid, p_change_source text, p_chat_session_id uuid, p_external_agent_caller_id uuid, p_agent_call_session_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_project_change(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_before_data jsonb, p_after_data jsonb, p_changed_by uuid, p_change_source text, p_chat_session_id uuid, p_external_agent_caller_id uuid, p_agent_call_session_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.queue_project_activity_notification_batch(p_project_id uuid, p_actor_user_id uuid, p_actor_actor_id uuid, p_entity_type text, p_action text, p_occurred_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_project_activity_notification_batch(p_project_id uuid, p_actor_user_id uuid, p_actor_actor_id uuid, p_entity_type text, p_action text, p_occurred_at timestamp with time zone) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_onto_public_page_30d_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_onto_public_page_30d_counts() TO service_role;
REVOKE ALL ON FUNCTION public.release_migration_platform_lock(p_run_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_migration_platform_lock(p_run_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reorder_phases_with_tasks(p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean, p_affected_task_ids uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_phases_with_tasks(p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean, p_affected_task_ids uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.retry_or_fail_email_sequence_send(p_enrollment_id uuid, p_error text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_or_fail_email_sequence_send(p_enrollment_id uuid, p_error text) TO service_role;
REVOKE ALL ON FUNCTION public.rollup_security_events(p_start_date date, p_end_date date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_security_events(p_start_date date, p_end_date date) TO service_role;
REVOKE ALL ON FUNCTION public.settle_agent_run_cost(p_leaf_run_id uuid, p_attempt_key text, p_terminal_status text, p_actual_cost_usd numeric, p_actual_units numeric, p_provider_request_id text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_agent_run_cost(p_leaf_run_id uuid, p_attempt_key text, p_terminal_status text, p_actual_cost_usd numeric, p_actual_units numeric, p_provider_request_id text, p_metadata jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.skip_email_sequence_step(p_enrollment_id uuid, p_branch_key text, p_reason text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_email_sequence_step(p_enrollment_id uuid, p_branch_key text, p_reason text, p_metadata jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.start_or_resume_brief_generation(p_user_id uuid, p_brief_date date, p_force_regenerate boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_resume_brief_generation(p_user_id uuid, p_brief_date date, p_force_regenerate boolean) TO service_role;
REVOKE ALL ON FUNCTION public.update_llm_usage_summary(p_user_id uuid, p_date date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_llm_usage_summary(p_user_id uuid, p_date date) TO service_role;
REVOKE ALL ON FUNCTION public.upsert_email_suppression(p_email text, p_scope text, p_reason text, p_source text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_email_suppression(p_email text, p_scope text, p_reason text, p_source text, p_metadata jsonb) TO service_role;

-- Signed-in users only (26): user-session callers, RLS helpers, or invoker trigger paths
-- (upsert_legacy_entity_mapping runs inside onto_projects/onto_tasks triggers as the writer).
REVOKE ALL ON FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_project_invite_by_id(p_invite_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_by_id(p_invite_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_actor_is_project_member(p_project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actor_is_project_member(p_project_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decline_project_invite(p_invite_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_project_invite(p_invite_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.evaluate_user_consumption_gate(p_user_id uuid, p_project_limit integer, p_credit_limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_user_consumption_gate(p_user_id uuid, p_project_limit integer, p_credit_limit integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_onto_project_summaries_v1(p_actor_id uuid, p_limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(p_actor_id uuid, p_limit integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_pending_project_invite_context(p_invite_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_project_invite_context(p_invite_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_full_v2_initial(p_project_id uuid, p_actor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_full_v2_initial(p_project_id uuid, p_actor_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_notification_settings(p_project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_notification_settings(p_project_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_route_access_state(p_project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_route_access_state(p_project_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_project_skeleton_with_access_v2(p_project_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access_v2(p_project_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_dashboard_analytics_v1(p_actor_id uuid, p_user_id uuid, p_recent_limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_dashboard_analytics_v1(p_actor_id uuid, p_user_id uuid, p_recent_limit integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_llm_usage(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_llm_usage(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_subscription_status(user_uuid uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_status(user_uuid uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_trial_status(p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_trial_status(p_user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.increment_question_display_count(question_ids uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_question_display_count(question_ids uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin(user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_pending_project_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_project_invites() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.load_fastchat_context(p_context_type text, p_user_id uuid, p_project_id uuid, p_focus_type text, p_focus_entity_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_fastchat_context(p_context_type text, p_user_id uuid, p_project_id uuid, p_focus_type text, p_focus_entity_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.onto_task_move_atomic(p_task_id uuid, p_expected_source_project_id uuid, p_destination_project_id uuid, p_confirmation_token text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onto_task_move_atomic(p_task_id uuid, p_expected_source_project_id uuid, p_destination_project_id uuid, p_confirmation_token text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.queue_sms_message(p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority, p_scheduled_for timestamp with time zone, p_metadata jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_sms_message(p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority, p_scheduled_for timestamp with time zone, p_metadata jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_onto_public_page_slug_prefix(p_actor_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_onto_public_page_slug_prefix(p_actor_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_project_notification_settings(p_project_id uuid, p_member_enabled boolean, p_project_default_enabled boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_notification_settings(p_project_id uuid, p_member_enabled boolean, p_project_default_enabled boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.suggest_onto_public_page_slug(p_slug_prefix text, p_slug_base text, p_exclude_page_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_onto_public_page_slug(p_slug_prefix text, p_slug_base text, p_exclude_page_id uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_legacy_entity_mapping(p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_legacy_entity_mapping(p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
