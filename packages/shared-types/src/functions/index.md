<!-- packages/shared-types/src/functions/index.md -->

# Supabase RPC Functions Index

This directory contains SQL definitions for all RPC functions available in the BuildOS database.

## Active Functions (91 total)

> **Note:** 52 unused functions were removed on 2026-01-12. See `supabase/migrations/20260112000000_cleanup_unused_rpc_functions.sql` for details.

### Project & Collaboration (15 active)

- [accept_project_invite](./accept_project_invite.sql) - Accept a project invite via token hash
- [accept_project_invite_by_id](./accept_project_invite_by_id.sql) - Accept a project invite by ID
- [current_actor_has_project_access](./current_actor_has_project_access.sql) - Check if current actor has access to project
- [current_actor_id](./current_actor_id.sql) - Get current actor ID for authenticated user (used by RLS)
- [current_actor_is_project_member](./current_actor_is_project_member.sql) - Check if current actor is project member (used by RLS)
- [decline_project_invite](./decline_project_invite.sql) - Decline a project invite
- [delete_onto_project](./delete_onto_project.sql) - Permanently delete an ontology project
- [get_project_full](./get_project_full.sql) - Get full project data with all related entities
- [get_project_invite_preview](./get_project_invite_preview.sql) - Preview invite details before accepting
- [get_project_phases_hierarchy](./get_project_phases_hierarchy.sql) - Get project phases in hierarchy
- [get_project_skeleton](./get_project_skeleton.sql) - Get project skeleton structure
- [get_project_statistics](./get_project_statistics.sql) - Get project statistics
- [list_pending_project_invites](./list_pending_project_invites.sql) - List pending invites for current user
- [soft_delete_onto_project](./soft_delete_onto_project.sql) - Soft delete an ontology project

### Tasks & Plans (2 active)

- [task_series_delete](./task_series_delete.sql) - Delete a task series
- [task_series_enable](./task_series_enable.sql) - Enable a task series

### Phases (3 active)

- [batch_update_phase_dates](./batch_update_phase_dates.sql) - Batch update phase dates
- [decrement_phase_order](./decrement_phase_order.sql) - Decrement phase order position
- [reorder_phases_with_tasks](./reorder_phases_with_tasks.sql) - Reorder phases with associated tasks

### Queue System (7 active)

- [add_queue_job](./add_queue_job.sql) - Add a job to the queue
- [cancel_job_with_reason](./cancel_job_with_reason.sql) - Cancel a job with reason
- [cancel_jobs_atomic](./cancel_jobs_atomic.sql) - Atomically cancel multiple jobs
- [claim_pending_jobs](./claim_pending_jobs.sql) - Claim pending jobs for processing
- [complete_queue_job](./complete_queue_job.sql) - Mark queue job as complete
- [fail_queue_job](./fail_queue_job.sql) - Mark queue job as failed
- [reset_stalled_jobs](./reset_stalled_jobs.sql) - Reset stalled jobs

### Daily Briefs (5 active)

- [cancel_brief_jobs_for_date](./cancel_brief_jobs_for_date.sql) - Cancel brief jobs for a date
- [cleanup_stale_brief_generations](./cleanup_stale_brief_generations.sql) - Cleanup stale brief generations
- [get_brief_generation_stats](./get_brief_generation_stats.sql) - Get brief generation statistics
- [get_latest_ontology_daily_briefs](./get_latest_ontology_daily_briefs.sql) - Get latest daily briefs for users
- [start_or_resume_brief_generation](./start_or_resume_brief_generation.sql) - Start or resume brief generation

### Notifications (8 active)

- [emit_notification_event](./emit_notification_event.sql) - Emit a notification event
- [get_notification_active_subscriptions](./get_notification_active_subscriptions.sql) - Get active notification subscriptions
- [get_notification_channel_performance](./get_notification_channel_performance.sql) - Get notification channel performance
- [get_notification_delivery_timeline](./get_notification_delivery_timeline.sql) - Get notification delivery timeline
- [get_notification_event_performance](./get_notification_event_performance.sql) - Get notification event performance
- [get_notification_failed_deliveries](./get_notification_failed_deliveries.sql) - Get failed notification deliveries
- [get_notification_overview_metrics](./get_notification_overview_metrics.sql) - Get notification overview metrics
- [log_notification_event](./log_notification_event.sql) - Log a notification event (used internally by SQL)

### SMS (7 active)

- [get_sms_daily_metrics](./get_sms_daily_metrics.sql) - Get SMS daily metrics
- [get_sms_notification_stats](./get_sms_notification_stats.sql) - Get SMS notification statistics
- [get_user_sms_metrics](./get_user_sms_metrics.sql) - Get user SMS metrics
- [queue_sms_message](./queue_sms_message.sql) - Queue an SMS message
- [record_sms_metric](./record_sms_metric.sql) - Record an SMS metric
- [refresh_sms_metrics_daily](./refresh_sms_metrics_daily.sql) - Refresh SMS metrics daily
- [update_sms_status_atomic](./update_sms_status_atomic.sql) - Atomically update SMS status

### Search (4 active)

- [onto_search_entities](./onto_search_entities.sql) - Search ontology entities
- [search_all_content](./search_all_content.sql) - Search all content
- [search_by_type](./search_by_type.sql) - Search by content type
- [search_similar_items](./search_similar_items.sql) - Search similar items (vector)

### Graph & Edges (1 active)

- [apply_graph_reorg_changes](./apply_graph_reorg_changes.sql) - Apply graph reorganization changes

### Recurring Tasks (1 active)

- [generate_recurring_instances](./generate_recurring_instances.sql) - Generate recurring task instances

### Project Drafts (1 active)

- [finalize_draft_project](./finalize_draft_project.sql) - Finalize a draft project

### Tracking Links (3 active)

- [create_tracking_link](./create_tracking_link.sql) - Create a tracking link
- [generate_short_code](./generate_short_code.sql) - Generate a short code (used internally)
- [get_link_click_stats](./get_link_click_stats.sql) - Get link click statistics

### Migration System (6 active)

- [acquire_migration_platform_lock](./acquire_migration_platform_lock.sql) - Acquire migration platform lock
- [get_migration_platform_lock_status](./get_migration_platform_lock_status.sql) - Get migration lock status
- [increment_migration_retry_count](./increment_migration_retry_count.sql) - Increment migration retry count
- [refresh_user_migration_stats](./refresh_user_migration_stats.sql) - Refresh user migration stats
- [release_migration_platform_lock](./release_migration_platform_lock.sql) - Release migration platform lock
- [upsert_legacy_entity_mapping](./upsert_legacy_entity_mapping.sql) - Upsert legacy entity mapping (used by triggers)

### Admin & Analytics (8 active)

- [get_admin_model_breakdown](./get_admin_model_breakdown.sql) - Get admin LLM model breakdown
- [get_admin_operation_breakdown](./get_admin_operation_breakdown.sql) - Get admin operation breakdown
- [get_admin_top_users](./get_admin_top_users.sql) - Get top users for admin
- [get_daily_active_users](./get_daily_active_users.sql) - Get daily active users
- [get_daily_visitors](./get_daily_visitors.sql) - Get daily visitors
- [get_user_engagement_metrics](./get_user_engagement_metrics.sql) - Get user engagement metrics
- [get_visitor_overview](./get_visitor_overview.sql) - Get visitor overview
- [is_admin](./is_admin.sql) - Check if user is admin

### Subscriptions & Payments (4 active)

- [get_revenue_metrics](./get_revenue_metrics.sql) - Get revenue metrics
- [get_subscription_overview](./get_subscription_overview.sql) - Get subscription overview
- [get_user_subscription_status](./get_user_subscription_status.sql) - Get user subscription status
- [get_user_trial_status](./get_user_trial_status.sql) - Get user trial status

### LLM Usage (2 active)

- [get_user_llm_usage](./get_user_llm_usage.sql) - Get user LLM usage
- [update_llm_usage_summary](./update_llm_usage_summary.sql) - Update LLM usage summary (used by trigger)

### Dashboard (0 active)

### Chat System (1 active)

- [increment_chat_session_metrics](./increment_chat_session_metrics.sql) - Increment chat session metrics

### Feedback (2 active)

- [check_feedback_rate_limit](./check_feedback_rate_limit.sql) - Check feedback rate limit
- [increment_question_display_count](./increment_question_display_count.sql) - Increment question display count

### Ontology Helpers (7 active)

- [ensure_actor_for_user](./ensure_actor_for_user.sql) - Ensure actor exists for user
- [onto_check_guard](./onto_check_guard.sql) - Check ontology guard condition (used by SQL)
- [onto_comment_validate_target](./onto_comment_validate_target.sql) - Validate comment target entity (used by triggers)
- [onto_jsonb_extract](./onto_jsonb_extract.sql) - Extract JSONB value at path (used by SQL)
- [onto_jsonb_extract_text](./onto_jsonb_extract_text.sql) - Extract JSONB text at path (used by SQL)
- [onto_jsonb_has_value](./onto_jsonb_has_value.sql) - Check if JSONB has value at path (used by SQL)
- [validate_facet_values](./validate_facet_values.sql) - Validate facet values

### PostgreSQL Extensions (3 active)

- [show_limit](./show_limit.sql) - Show pg_trgm similarity limit
- [show_trgm](./show_trgm.sql) - Show trigrams for text
- [unaccent](./unaccent.sql) - Remove accents from text

---

## Deprecated Functions (52 total - removed 2026-01-12)

> **Note:** The SQL files for these deprecated functions have been deleted from this directory.
> The functions were removed from Supabase via migration `20260112000000_cleanup_unused_rpc_functions.sql`.

### Project & Collaboration (removed: 7)

- ~~restore_onto_project~~ - Restore feature not implemented
- ~~get_project_context_document~~ - Context documents deprecated
- ~~get_project_history~~ - Version history not exposed in UI
- ~~get_project_version~~ - Version retrieval not used
- ~~get_project_with_template~~ - Template system deprecated
- ~~log_project_change~~ - Helper never called from code
- ~~update_project_next_step~~ - Helper never called from code

### Tasks & Plans (removed: 5)

- ~~get_plan_tasks~~ - Queries done differently
- ~~get_task_dependencies~~ - Handled via onto_edges
- ~~get_task_plan~~ - Not used
- ~~get_unblocking_tasks~~ - Dependency UI not implemented
- ~~restore_deleted_task~~ - Task restoration not implemented

### Goals & Phases (removed: 3)

- ~~get_goal_progress~~ - Progress calculated client-side
- ~~approve_generated_phases~~ - AI phase generation not implemented
- ~~batch_update_phase_orders~~ - Uses different approach

### Documents (removed: 1)

- ~~link_document_to_task~~ - Handled via edges

### Queue System (removed: 3)

- ~~cancel_jobs_in_time_window~~ - Time-based cancellation not used
- ~~normalize_queue_job_metadata~~ - Metadata normalization not used
- ~~validate_all_queue_jobs~~ - Validation not used in production

### Brain Dump (removed: 4)

- ~~brain_dump_cleanup_preview~~ - Not exposed in UI
- ~~brain_dump_cleanup_report~~ - Not used
- ~~brain_dump_cleanup_with_report~~ - Not used
- ~~cleanup_duplicate_brain_dump_drafts~~ - Not used

### Daily Briefs (removed: 6)

- ~~cleanup_old_brief_jobs~~ - Not scheduled
- ~~get_brief_email_status~~ - Not used
- ~~get_pending_brief_emails~~ - Not used
- ~~get_user_active_generations~~ - Not used
- ~~start_daily_brief_generation~~ - Uses start_or_resume instead
- ~~update_brief_generation_progress~~ - Handled differently

### Notifications (removed: 1)

- ~~update_user_notification_preferences~~ - Direct table update used

### SMS (removed: 4)

- ~~cancel_scheduled_sms_for_event~~ - Not used
- ~~get_scheduled_sms_for_user~~ - Not exposed
- ~~get_user_sms_channel_info~~ - Not used
- ~~update_scheduled_sms_send_time~~ - Not used

### Calendar (removed: 2)

- ~~get_calendar_analysis_stats~~ - Not exposed
- ~~get_pending_calendar_suggestions~~ - Handled differently

### Search (removed: 1)

- ~~search_all_similar~~ - Uses search_similar_items instead

### Recurring Tasks (removed: 1)

- ~~complete_recurring_instance~~ - Handled via task update

### Project Drafts & Versioning (removed: 4)

- ~~cleanup_orphaned_drafts~~ - Not scheduled
- ~~cleanup_project_history~~ - Not scheduled
- ~~create_manual_project_version~~ - Manual versioning not implemented
- ~~cleanup_old_tracking_links~~ - Not scheduled

### Admin & Analytics (removed: 2)

- ~~get_engagement_analytics~~ - Uses get_user_engagement_metrics
- ~~refresh_system_metrics~~ - Not used

### Subscriptions & Payments (removed: 4)

- ~~get_subscription_changes~~ - Queried directly
- ~~get_user_failed_payments_count~~ - Not used
- ~~has_active_subscription~~ - Uses get_user_subscription_status
- ~~user_has_payment_issues~~ - Not used

### Onboarding (removed: 2)

- ~~check_onboarding_complete~~ - Checked differently
- ~~get_onboarding_v2_progress~~ - Not used

### Chat System (removed: 1)

- ~~clean_expired_context_cache~~ - Not scheduled

### Deliverables (removed: 1)

- ~~get_deliverable_primitive~~ - Not used

---

## Function Categories Summary (Active)

| Category                 | Active | Removed |
| ------------------------ | ------ | ------- |
| Project & Collaboration  | 15     | 7       |
| Tasks & Plans            | 2      | 5       |
| Phases                   | 3      | 3       |
| Documents                | 0      | 1       |
| Queue System             | 7      | 3       |
| Brain Dump               | 0      | 4       |
| Daily Briefs             | 5      | 6       |
| Notifications            | 8      | 1       |
| SMS                      | 7      | 4       |
| Calendar                 | 0      | 2       |
| Search                   | 4      | 1       |
| Graph & Edges            | 1      | 0       |
| Recurring Tasks          | 1      | 1       |
| Project Drafts           | 1      | 1       |
| Versioning               | 0      | 2       |
| Tracking Links           | 3      | 1       |
| Migration System         | 6      | 0       |
| Admin & Analytics        | 8      | 2       |
| Subscriptions & Payments | 4      | 4       |
| LLM Usage                | 2      | 0       |
| Onboarding               | 0      | 2       |
| Dashboard                | 1      | 0       |
| Chat System              | 1      | 1       |
| Feedback                 | 2      | 0       |
| Deliverables             | 0      | 1       |
| Ontology Helpers         | 7      | 0       |
| PostgreSQL Extensions    | 3      | 0       |

**Active: 91 functions | Removed: 52 functions | Original Total: 143**

---

## Database Trigger Functions (64 triggers)

These are internal PostgreSQL trigger functions that execute automatically when database events occur. They are **separate from RPC functions** and cannot be called directly via `supabase.rpc()`.

### User & Auth Triggers

| Trigger                                     | Table        | Function                               | Events              |
| ------------------------------------------- | ------------ | -------------------------------------- | ------------------- |
| after_user_insert_create_notification_prefs | users        | `ensure_user_notification_preferences` | AFTER INSERT        |
| after_user_insert_notify                    | users        | `notify_user_signup`                   | AFTER INSERT        |
| before_user_insert_set_trial                | users        | `set_user_trial_period`                | BEFORE INSERT       |
| protect_user_privilege_escalation           | users        | `prevent_privilege_escalation`         | BEFORE UPDATE       |
| insert_users_updated_at                     | users        | `update_updated_at_column`             | BEFORE INSERT       |
| update_users_updated_at                     | users        | `update_updated_at_column`             | BEFORE UPDATE       |
| update_onboarding_status_trigger            | user_context | `update_user_onboarding_status`        | AFTER INSERT/UPDATE |

### Ontology System Triggers

| Trigger                          | Table             | Function                           | Events              |
| -------------------------------- | ----------------- | ---------------------------------- | ------------------- |
| trg_onto_projects_updated        | onto_projects     | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_projects_legacy_mapping | onto_projects     | `sync_legacy_mapping_from_props`   | AFTER INSERT/UPDATE |
| trg_onto_projects_owner_member   | onto_projects     | `add_project_owner_membership`     | AFTER INSERT        |
| trg_onto_tasks_updated           | onto_tasks        | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_tasks_legacy_mapping    | onto_tasks        | `sync_legacy_mapping_from_props`   | AFTER INSERT/UPDATE |
| trg_onto_documents_updated_at    | onto_documents    | `update_onto_documents_updated_at` | BEFORE UPDATE       |
| trg_onto_plans_updated           | onto_plans        | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_outputs_updated         | onto_outputs      | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_events_updated          | onto_events       | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_event_sync_updated      | onto_event_sync   | `set_updated_at`                   | BEFORE UPDATE       |
| trg_onto_comments_before_insert  | onto_comments     | `onto_comments_before_insert`      | BEFORE INSERT       |
| trg_onto_comments_before_update  | onto_comments     | `onto_comments_before_update`      | BEFORE UPDATE       |
| trg_onto_project_logs_actor      | onto_project_logs | `set_project_log_actor`            | BEFORE INSERT       |
| set_onto_braindumps_updated_at   | onto_braindumps   | `update_updated_at_column`         | BEFORE UPDATE       |

### Project & Task Triggers

| Trigger                                      | Table                   | Function                                   | Events               |
| -------------------------------------------- | ----------------------- | ------------------------------------------ | -------------------- |
| projects_history_trigger                     | projects                | `save_project_version`                     | AFTER INSERT/UPDATE  |
| trigger_update_recurring_tasks               | projects                | `update_recurring_tasks_on_project_change` | AFTER UPDATE         |
| trigger_delete_phase_tasks_on_deleted        | tasks                   | `delete_phase_tasks_on_deleted`            | AFTER UPDATE         |
| trigger_delete_phase_tasks_on_insert_deleted | tasks                   | `delete_phase_tasks_on_insert_deleted`     | AFTER INSERT         |
| trigger_ensure_single_active_template        | project_brief_templates | `ensure_single_active_template`            | BEFORE INSERT/UPDATE |
| update_project_calendars_updated_at          | project_calendars       | `update_updated_at_column`                 | BEFORE UPDATE        |
| update_project_drafts_updated_at             | project_drafts          | `update_project_drafts_updated_at`         | BEFORE UPDATE        |
| update_draft_tasks_updated_at                | draft_tasks             | `update_draft_tasks_updated_at`            | BEFORE UPDATE        |

### Chat & Agent Triggers

| Trigger                         | Table                | Function                                | Events        |
| ------------------------------- | -------------------- | --------------------------------------- | ------------- |
| agent_message_count_trigger     | agent_chat_messages  | `increment_agent_session_message_count` | AFTER INSERT  |
| agent_plans_updated_at          | agent_plans          | `update_agent_plans_updated_at`         | BEFORE UPDATE |
| update_session_stats_on_message | chat_messages        | `update_chat_session_stats`             | AFTER INSERT  |
| update_tool_count_on_execution  | chat_tool_executions | `update_tool_call_count`                | AFTER INSERT  |

### Daily Brief Triggers

| Trigger                                   | Table                   | Function                         | Events              |
| ----------------------------------------- | ----------------------- | -------------------------------- | ------------------- |
| handle_manual_brief_generation_trigger    | daily_briefs            | `handle_manual_brief_generation` | AFTER INSERT/UPDATE |
| update_ontology_daily_briefs_updated_at   | ontology_daily_briefs   | `update_updated_at_column`       | BEFORE UPDATE       |
| update_ontology_project_briefs_updated_at | ontology_project_briefs | `update_updated_at_column`       | BEFORE UPDATE       |
| update_user_brief_preferences_updated_at  | user_brief_preferences  | `update_updated_at_column`       | BEFORE UPDATE       |

### Notification & SMS Triggers

| Trigger                                  | Table                      | Function                         | Events        |
| ---------------------------------------- | -------------------------- | -------------------------------- | ------------- |
| update_notif_deliveries_updated_at       | notification_deliveries    | `update_notification_updated_at` | BEFORE UPDATE |
| update_notif_subs_updated_at             | notification_subscriptions | `update_notification_updated_at` | BEFORE UPDATE |
| update_sms_messages_updated_at           | sms_messages               | `update_updated_at_column`       | BEFORE UPDATE |
| update_sms_templates_updated_at          | sms_templates              | `update_updated_at_column`       | BEFORE UPDATE |
| update_user_sms_preferences_updated_at   | user_sms_preferences       | `update_updated_at_column`       | BEFORE UPDATE |
| update_scheduled_sms_messages_updated_at | scheduled_sms_messages     | `update_updated_at_column`       | BEFORE UPDATE |

### Email Triggers

| Trigger                            | Table            | Function                   | Events        |
| ---------------------------------- | ---------------- | -------------------------- | ------------- |
| generate_email_tracking_id         | emails           | `generate_tracking_id`     | BEFORE INSERT |
| update_emails_updated_at           | emails           | `update_updated_at_column` | BEFORE UPDATE |
| update_email_recipients_updated_at | email_recipients | `update_updated_at_column` | BEFORE UPDATE |

### Queue & Migration Triggers

| Trigger                      | Table         | Function                   | Events        |
| ---------------------------- | ------------- | -------------------------- | ------------- |
| update_queue_jobs_updated_at | queue_jobs    | `update_updated_at_column` | BEFORE UPDATE |
| trg_migration_log_updated    | migration_log | `set_updated_at`           | BEFORE UPDATE |

### Calendar Triggers

| Trigger                             | Table                         | Function                   | Events        |
| ----------------------------------- | ----------------------------- | -------------------------- | ------------- |
| update_calendar_analyses_updated_at | calendar_analyses             | `update_updated_at_column` | BEFORE UPDATE |
| update_calendar_themes_updated_at   | calendar_themes               | `update_updated_at_column` | BEFORE UPDATE |
| update_analysis_prefs_updated_at    | calendar_analysis_preferences | `update_updated_at_column` | BEFORE UPDATE |
| update_suggestions_updated_at       | calendar_project_suggestions  | `update_updated_at_column` | BEFORE UPDATE |

### Subscription & Payment Triggers

| Trigger                                  | Table                  | Function                   | Events        |
| ---------------------------------------- | ---------------------- | -------------------------- | ------------- |
| update_subscription_plans_updated_at     | subscription_plans     | `update_updated_at_column` | BEFORE UPDATE |
| update_customer_subscriptions_updated_at | customer_subscriptions | `update_updated_at_column` | BEFORE UPDATE |
| update_payment_methods_updated_at        | payment_methods        | `update_updated_at_column` | BEFORE UPDATE |
| update_discount_codes_updated_at         | discount_codes         | `update_updated_at_column` | BEFORE UPDATE |

### Beta & Feedback Triggers

| Trigger                         | Table         | Function                   | Events        |
| ------------------------------- | ------------- | -------------------------- | ------------- |
| update_beta_signups_updated_at  | beta_signups  | `update_updated_at_column` | BEFORE UPDATE |
| update_beta_members_updated_at  | beta_members  | `update_updated_at_column` | BEFORE UPDATE |
| update_beta_feedback_updated_at | beta_feedback | `update_updated_at_column` | BEFORE UPDATE |
| update_beta_events_updated_at   | beta_events   | `update_updated_at_column` | BEFORE UPDATE |
| update_feedback_updated_at      | feedback      | `update_updated_at_column` | BEFORE UPDATE |

### Other Triggers

| Trigger                              | Table             | Function                       | Events        |
| ------------------------------------ | ----------------- | ------------------------------ | ------------- |
| update_notes_updated_at              | notes             | `update_updated_at_column`     | BEFORE UPDATE |
| update_time_blocks_updated_at        | time_blocks       | `update_updated_at_column`     | BEFORE UPDATE |
| update_feature_flags_updated_at      | feature_flags     | `update_updated_at_column`     | BEFORE UPDATE |
| update_error_logs_updated_at_trigger | error_logs        | `update_error_logs_updated_at` | BEFORE UPDATE |
| trg_voice_notes_updated              | voice_notes       | `set_updated_at`               | BEFORE UPDATE |
| trg_voice_note_groups_updated        | voice_note_groups | `set_updated_at`               | BEFORE UPDATE |
| trg_web_page_visits_updated_at       | web_page_visits   | `set_updated_at`               | BEFORE UPDATE |

### Key Trigger Functions Summary

| Function                               | Used By                   | Description                       |
| -------------------------------------- | ------------------------- | --------------------------------- |
| `update_updated_at_column`             | 30+ tables                | Generic timestamp updater         |
| `set_updated_at`                       | 10+ tables                | Ontology timestamp updater        |
| `sync_legacy_mapping_from_props`       | onto_projects, onto_tasks | Sync legacy entity mappings       |
| `save_project_version`                 | projects                  | Auto-save project versions        |
| `handle_manual_brief_generation`       | daily_briefs              | Trigger brief generation          |
| `ensure_user_notification_preferences` | users                     | Create default notification prefs |
| `add_project_owner_membership`         | onto_projects             | Auto-add owner as member          |
| `update_chat_session_stats`            | chat_messages             | Update chat metrics               |

**Note:** These trigger functions are defined separately in the database and are not part of the RPC functions listed above. They execute automatically and cannot be called directly.
