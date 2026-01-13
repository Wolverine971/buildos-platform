# RPC Function Cross-Reference Audit

Scope: compare `packages/shared-types/src/functions/index.md` and the SQL files in `packages/shared-types/src/functions/` against function signatures in `packages/shared-types/src/database.types.ts`. Focus: signature discrepancies and RPC functions touched by the outputs/decisions removal.

## Summary

- Active functions listed in `packages/shared-types/src/functions/index.md`: 91
- `packages/shared-types/src/database.types.ts` defines `is_admin` as an overload (no args + `{ user_id }`), so it does not map cleanly to a single signature entry.
- Supabase definitions synced for `accept_project_invite`, `accept_project_invite_by_id`, `get_latest_ontology_daily_briefs`, and `upsert_legacy_entity_mapping`.
- Functions present in `packages/shared-types/src/database.types.ts` but not listed as active in `packages/shared-types/src/functions/index.md`:
    - `cancel_jobs_in_time_window`
    - `cancel_scheduled_sms_for_event`
    - `cleanup_project_history`
    - `complete_recurring_instance`
    - `create_manual_project_version`
    - `get_brief_email_status`
    - `get_scheduled_sms_for_user`
    - `search_all_similar`
- Non-order signature mismatches (details below): 2
- Order-only arg differences (likely benign, generator ordering): 45 (list below)
- No `onto_outputs`/`onto_decisions` references remain in `packages/shared-types/src/functions/`.

## Signature Mismatches (Non-Order)

### show_trgm

- SQL: `packages/shared-types/src/functions/show_trgm.sql`
- SQL args: `text` (extension function), returns `text[]`
- database.types args: `{ \"\": string }` (unnamed arg)
- Code reference: none found (RPC)
- Action: confirm how Supabase expects params for extension functions and align types or docs.

### unaccent

- SQL: `packages/shared-types/src/functions/unaccent.sql`
- SQL args: `text`, returns `text`
- database.types args: `{ \"\": string }` (unnamed arg)
- Code reference: none found (RPC)
- Action: same as `show_trgm`.

## Order-Only Arg Differences (Likely Benign)

These appear to be generated arg ordering differences (Supabase types sort keys). No action needed unless you want perfect alignment.

`accept_project_invite`, `get_project_full`, `get_project_skeleton`, `get_projects_with_stats`, `task_series_delete`, `task_series_enable`, `decrement_phase_order`, `reorder_phases_with_tasks`, `add_queue_job`, `cancel_job_with_reason`, `cancel_jobs_atomic`, `claim_pending_jobs`, `fail_queue_job`, `cancel_brief_jobs_for_date`, `cleanup_stale_brief_generations`, `get_brief_generation_stats`, `start_or_resume_brief_generation`, `emit_notification_event`, `get_notification_delivery_timeline`, `log_notification_event`, `get_sms_daily_metrics`, `get_user_sms_metrics`, `queue_sms_message`, `record_sms_metric`, `update_sms_status_atomic`, `onto_search_entities`, `search_all_content`, `search_by_type`, `search_similar_items`, `apply_graph_reorg_changes`, `generate_recurring_instances`, `get_link_click_stats`, `acquire_migration_platform_lock`, `upsert_legacy_entity_mapping`, `get_admin_model_breakdown`, `get_admin_operation_breakdown`, `get_admin_top_users`, `get_daily_active_users`, `get_daily_visitors`, `get_user_llm_usage`, `update_llm_usage_summary`, `get_dashboard_data`, `increment_chat_session_metrics`, `onto_check_guard`, `onto_comment_validate_target`

## Functions Tied To Outputs/Decisions Removal (RPC-Related)

These are the RPC functions whose SQL definitions were updated to remove `onto_outputs`/`onto_decisions`. Please verify their definitions before we create migrations.

### get_project_full

- SQL: `packages/shared-types/src/functions/get_project_full.sql`
- SQL args: `p_project_id uuid`, `p_actor_id uuid`
- database.types args: `p_actor_id: string`, `p_project_id: string`
- Returns: `jsonb` (types: `Json`)
- Call sites:
    - `apps/web/src/routes/projects/[id]/+page.server.ts:197`
    - `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts:75`
- Note: outputs/decisions removed from JSON payload.

### get_project_skeleton

- SQL: `packages/shared-types/src/functions/get_project_skeleton.sql`
- SQL args: `p_project_id uuid`, `p_actor_id uuid`
- database.types args: `p_actor_id: string`, `p_project_id: string`
- Returns: `jsonb` (types: `Json`)
- Call site:
    - `apps/web/src/routes/projects/[id]/+page.server.ts:142`
- Note: output/decision counts removed.

### delete_onto_project

- SQL: `packages/shared-types/src/functions/delete_onto_project.sql`
- SQL args: `p_project_id uuid`
- database.types args: `p_project_id: string`
- Returns: `void` (types: `undefined`)
- Call sites:
    - `apps/web/src/routes/api/onto/projects/[id]/+server.ts:632`
    - `apps/web/src/lib/services/ontology/migration-rollback.service.ts:308`
- Note: outputs/decisions deletions removed.

### soft_delete_onto_project

- SQL: `packages/shared-types/src/functions/soft_delete_onto_project.sql`
- SQL args: `p_project_id uuid`
- database.types args: `p_project_id: string`
- Returns: `void` (types: `undefined`)
- Call sites:
    - `apps/web/src/routes/api/onto/projects/[id]/+server.ts:632`
- Note: outputs/decisions soft-delete removed.

### restore_onto_project (Deprecated)

- SQL: `packages/shared-types/src/functions/restore_onto_project.sql`
- Status: deprecated in `packages/shared-types/src/functions/index.md`
- Call sites: none found.
- Note: outputs/decisions restore removed in SQL, but function is listed as removed; decide if it should remain.

### onto_comment_validate_target

- SQL: `packages/shared-types/src/functions/onto_comment_validate_target.sql`
- SQL args: `p_project_id uuid`, `p_entity_type text`, `p_entity_id uuid`
- database.types args: `p_entity_id: string`, `p_entity_type: string`, `p_project_id: string`
- Returns: `boolean`
- Call site:
    - `apps/web/src/routes/api/onto/comments/+server.ts:312`
- Note: outputs/decisions removed from allowed entity types.

## Suggested Plan Of Attack

1. Confirm canonical signatures for the non-order mismatches listed above.
2. Decide whether SQL files or live DB definitions are the source of truth.
3. Update SQL function definitions (and then migrations) to match the canonical signatures.
4. Regenerate `packages/shared-types/src/database.types.ts` and update `packages/shared-types/src/functions/index.md` if the active list changes.
5. Re-run the RPC comparison and re-check call sites for `get_project_full` / `get_project_skeleton` payload expectations.
