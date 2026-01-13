-- supabase/migrations/20260112000000_cleanup_unused_rpc_functions.sql
-- Migration: 20260112000000_cleanup_unused_rpc_functions.sql
-- Description: Remove unused RPC functions that are not called from application code,
--              not used by triggers, not used by RLS policies, and not called by other SQL functions.
--
-- AUDIT PERFORMED: 2026-01-12
--
-- Functions verified SAFE to delete:
-- - Not called from apps/web or apps/worker code
-- - Not used by database triggers
-- - Not used by RLS policies
-- - Not called by other SQL functions internally
--
-- Functions preserved (used internally):
-- - current_actor_id (RLS policies)
-- - current_actor_is_project_member (RLS policies)
-- - onto_check_guard (called by other SQL functions)
-- - onto_jsonb_extract (called by onto_check_guard)
-- - onto_jsonb_extract_text (called by onto_check_guard)
-- - onto_jsonb_has_value (called by onto_check_guard)
-- - onto_comment_validate_target (used by triggers)
-- - log_notification_event (called by other SQL functions via PERFORM)
-- - upsert_legacy_entity_mapping (called by triggers)
-- - update_llm_usage_summary (called by trigger)
-- - generate_short_code (called by create_tracking_link)
-- - soft_delete_onto_project (used in production code)
-- - show_limit, show_trgm, unaccent (PostgreSQL extension functions)

-- ============================================================================
-- PROJECT & COLLABORATION (7 functions)
-- ============================================================================

-- restore_onto_project: Never called - feature not implemented
DROP FUNCTION IF EXISTS restore_onto_project(uuid);

-- get_project_context_document: Legacy function - context documents deprecated
DROP FUNCTION IF EXISTS get_project_context_document(uuid);

-- get_project_history: Version history feature not exposed in UI
DROP FUNCTION IF EXISTS get_project_history(uuid);

-- get_project_version: Version retrieval not used
DROP FUNCTION IF EXISTS get_project_version(uuid, integer);

-- get_project_with_template: Template system deprecated
DROP FUNCTION IF EXISTS get_project_with_template(uuid);

-- log_project_change: Helper function never called from code
DROP FUNCTION IF EXISTS log_project_change(uuid, text, uuid, text, jsonb, jsonb, uuid, text, uuid);

-- update_project_next_step: Helper function never called from code
DROP FUNCTION IF EXISTS update_project_next_step(uuid, text, text, text);

-- ============================================================================
-- TASKS & PLANS (5 functions)
-- ============================================================================

-- get_plan_tasks: Task-plan relationship queries done differently
DROP FUNCTION IF EXISTS get_plan_tasks(uuid);

-- get_task_dependencies: Dependencies handled via onto_edges
DROP FUNCTION IF EXISTS get_task_dependencies(uuid);

-- get_task_plan: Plan retrieval not used
DROP FUNCTION IF EXISTS get_task_plan(uuid);

-- get_unblocking_tasks: Dependency UI not implemented
DROP FUNCTION IF EXISTS get_unblocking_tasks(uuid);

-- restore_deleted_task: Task restoration not implemented
DROP FUNCTION IF EXISTS restore_deleted_task(uuid);

-- ============================================================================
-- GOALS & PHASES (3 functions)
-- ============================================================================

-- get_goal_progress: Progress calculation done client-side
DROP FUNCTION IF EXISTS get_goal_progress(uuid);

-- approve_generated_phases: AI phase generation not implemented
DROP FUNCTION IF EXISTS approve_generated_phases(uuid, uuid[]);

-- batch_update_phase_orders: Phase reordering uses different approach
DROP FUNCTION IF EXISTS batch_update_phase_orders(uuid, jsonb);

-- ============================================================================
-- DOCUMENTS (1 function)
-- ============================================================================

-- link_document_to_task: Document-task linking handled via edges
DROP FUNCTION IF EXISTS link_document_to_task(uuid, uuid, text);

-- ============================================================================
-- QUEUE SYSTEM (3 functions)
-- ============================================================================

-- cancel_jobs_in_time_window: Time-based cancellation not used
DROP FUNCTION IF EXISTS cancel_jobs_in_time_window(text, timestamptz, timestamptz, uuid);

-- normalize_queue_job_metadata: Metadata normalization not used
DROP FUNCTION IF EXISTS normalize_queue_job_metadata();

-- validate_all_queue_jobs: Validation not used in production
DROP FUNCTION IF EXISTS validate_all_queue_jobs(boolean);

-- ============================================================================
-- BRAIN DUMP (4 functions)
-- ============================================================================

-- brain_dump_cleanup_preview: Cleanup preview not exposed in UI
DROP FUNCTION IF EXISTS brain_dump_cleanup_preview();

-- brain_dump_cleanup_report: Report generation not used
DROP FUNCTION IF EXISTS brain_dump_cleanup_report();

-- brain_dump_cleanup_with_report: Combined cleanup not used
DROP FUNCTION IF EXISTS brain_dump_cleanup_with_report(boolean);

-- cleanup_duplicate_brain_dump_drafts: Duplicate cleanup not used
DROP FUNCTION IF EXISTS cleanup_duplicate_brain_dump_drafts();

-- ============================================================================
-- DAILY BRIEFS (6 functions)
-- ============================================================================

-- cleanup_old_brief_jobs: Old job cleanup not scheduled
DROP FUNCTION IF EXISTS cleanup_old_brief_jobs();

-- get_brief_email_status: Email status check not used (see READY_TO_DEPLOY.md)
DROP FUNCTION IF EXISTS get_brief_email_status(uuid);

-- get_pending_brief_emails: Pending email retrieval not used
DROP FUNCTION IF EXISTS get_pending_brief_emails(integer);

-- get_user_active_generations: Active generation check not used
DROP FUNCTION IF EXISTS get_user_active_generations(uuid);

-- start_daily_brief_generation: Generation uses start_or_resume_brief_generation instead
DROP FUNCTION IF EXISTS start_daily_brief_generation(uuid, date);

-- update_brief_generation_progress: Progress updates handled differently
DROP FUNCTION IF EXISTS update_brief_generation_progress(uuid, integer, integer, integer, integer);

-- ============================================================================
-- NOTIFICATIONS (1 function)
-- ============================================================================

-- update_user_notification_preferences: Preferences updated via direct table update
DROP FUNCTION IF EXISTS update_user_notification_preferences(uuid, text, boolean, boolean, boolean, boolean, boolean, text, text, text);

-- ============================================================================
-- SMS (4 functions)
-- ============================================================================

-- cancel_scheduled_sms_for_event: Event-based SMS cancellation not used
DROP FUNCTION IF EXISTS cancel_scheduled_sms_for_event(uuid, uuid);

-- get_scheduled_sms_for_user: Scheduled SMS retrieval not exposed
DROP FUNCTION IF EXISTS get_scheduled_sms_for_user(uuid, text, text, text);

-- get_user_sms_channel_info: SMS channel info not used
DROP FUNCTION IF EXISTS get_user_sms_channel_info(uuid);

-- update_scheduled_sms_send_time: Send time updates not used
DROP FUNCTION IF EXISTS update_scheduled_sms_send_time(uuid, timestamptz, timestamptz, timestamptz);

-- ============================================================================
-- CALENDAR (2 functions)
-- ============================================================================

-- get_calendar_analysis_stats: Calendar analysis stats not exposed
DROP FUNCTION IF EXISTS get_calendar_analysis_stats(uuid);

-- get_pending_calendar_suggestions: Suggestions handled differently
DROP FUNCTION IF EXISTS get_pending_calendar_suggestions(uuid);

-- ============================================================================
-- SEARCH (1 function)
-- ============================================================================

-- search_all_similar: Vector search uses search_similar_items instead
DROP FUNCTION IF EXISTS search_all_similar(vector, numeric);

-- ============================================================================
-- RECURRING TASKS (1 function)
-- ============================================================================

-- complete_recurring_instance: Instance completion handled via task update
DROP FUNCTION IF EXISTS complete_recurring_instance(uuid, uuid, date);

-- ============================================================================
-- PROJECT DRAFTS & VERSIONING (4 functions)
-- ============================================================================

-- cleanup_orphaned_drafts: Orphan cleanup not scheduled
DROP FUNCTION IF EXISTS cleanup_orphaned_drafts(integer);

-- cleanup_project_history: History cleanup not scheduled
DROP FUNCTION IF EXISTS cleanup_project_history(uuid, integer);

-- create_manual_project_version: Manual versioning not implemented
DROP FUNCTION IF EXISTS create_manual_project_version(uuid, uuid, text);

-- cleanup_old_tracking_links: Link cleanup not scheduled
DROP FUNCTION IF EXISTS cleanup_old_tracking_links(integer);

-- ============================================================================
-- ADMIN & ANALYTICS (2 functions)
-- ============================================================================

-- get_engagement_analytics: Analytics handled by get_user_engagement_metrics
DROP FUNCTION IF EXISTS get_engagement_analytics();

-- refresh_system_metrics: System metrics refresh not used (see ONTOLOGY_ANALYTICS_PLAN.md)
DROP FUNCTION IF EXISTS refresh_system_metrics();

-- ============================================================================
-- SUBSCRIPTIONS & PAYMENTS (4 functions)
-- ============================================================================

-- get_subscription_changes: Subscription changes queried directly
DROP FUNCTION IF EXISTS get_subscription_changes(text);

-- get_user_failed_payments_count: Failed payment count not used
DROP FUNCTION IF EXISTS get_user_failed_payments_count(uuid);

-- has_active_subscription: Subscription check uses get_user_subscription_status
DROP FUNCTION IF EXISTS has_active_subscription(uuid);

-- user_has_payment_issues: Payment issue check not used
DROP FUNCTION IF EXISTS user_has_payment_issues(uuid);

-- ============================================================================
-- ONBOARDING (2 functions)
-- ============================================================================

-- check_onboarding_complete: Onboarding completion checked differently
DROP FUNCTION IF EXISTS check_onboarding_complete(uuid);

-- get_onboarding_v2_progress: V2 progress not used
DROP FUNCTION IF EXISTS get_onboarding_v2_progress(uuid);

-- ============================================================================
-- CHAT SYSTEM (1 function)
-- ============================================================================

-- clean_expired_context_cache: Context cache cleanup not scheduled
DROP FUNCTION IF EXISTS clean_expired_context_cache();

-- ============================================================================
-- DELIVERABLES (1 function)
-- ============================================================================

-- get_deliverable_primitive: Deliverable primitive type not used
DROP FUNCTION IF EXISTS get_deliverable_primitive(text);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total functions removed: 52
--
-- Categories:
-- - Project & Collaboration: 7
-- - Tasks & Plans: 5
-- - Goals & Phases: 3
-- - Documents: 1
-- - Queue System: 3
-- - Brain Dump: 4
-- - Daily Briefs: 6
-- - Notifications: 1
-- - SMS: 4
-- - Calendar: 2
-- - Search: 1
-- - Recurring Tasks: 1
-- - Project Drafts & Versioning: 4
-- - Admin & Analytics: 2
-- - Subscriptions & Payments: 4
-- - Onboarding: 2
-- - Chat System: 1
-- - Deliverables: 1
--
-- Note: This reduces total RPC functions from 137 to 85

-- Add comment for audit trail
COMMENT ON SCHEMA public IS 'RPC function cleanup performed 2026-01-12. Removed 52 unused functions.';
