<!-- docs/technical/reviews/DATABASE_SCHEMA_RPC_AUDIT_2026-07-30.md -->
<!-- doc-status: point-in-time -->

# BuildOS database schema and RPC audit

Date: 2026-07-30  
Mode: read-only live Data API metadata/probing plus repository dependency tracing  
Scope: public tables, views, PostgREST RPCs, generated models, migrations, application/worker code, SQL snapshots, tests, and operational scripts

Post-audit implementation note: Phase 0 containment is implemented in `20260730020000_phase0_rls_lockdown_remaining_tables.sql` and `20260730030000_phase0_view_and_rpc_hardening.sql`, with server call-path changes and a non-mutating catalog verifier. Production verification passed for all 58 catalog invariants on 2026-08-04. The operational webhook-token rotation and live-log review remain governed by `docs/operations/security/RLS_LOCKDOWN_2026-07-30.md`.

Phase 1's main cleanup is live: 15 of 16 retirement invariants pass. The only remaining object is the 78-row `user_notification_preferences_backup`, which still needs its external export receipt before the guarded drop migration can succeed. See `docs/operations/security/PHASE1_SCHEMA_LEANUP_2026-07-30.md`.

Phase 2 is also live and verified. `onto_decisions`, legacy notes, and legacy brain dumps/links are absent; project ownership and Question Tree run-scoped foreign keys resolve through PostgREST; and all Phase 2 access checks pass. See `docs/operations/security/PHASE2_SCHEMA_RETIREMENT_2026-08-04.md`.

## Live reassessment — 2026-08-04

The current production and repository checks establish this next-work order:

1. **Finish Phase 1:** archive and drop the remaining 78-row preferences backup.
2. **Cut legacy agent-chat readers over:** counts are unchanged (`agents` 832, `agent_plans` 81, `agent_chat_sessions` 164, `agent_chat_messages` 535, `agent_executions` 94), and active admin, analytics, email, retargeting, timing, and SQL-function callers remain. Use `tasker/45-legacy-agent-chat-retirement.md`.
3. **Resolve legacy project migration gaps before dropping anything:** the ledger remains at one unmapped project, 214 unmapped tasks, and 43 unmapped phases, with no missing mapped targets. Search RPCs and the admin migration control plane still use the legacy generation. Use `tasker/46-legacy-project-generation-retirement.md`.
4. **Repair chat-run relational debt:** among 636 `chat_turn_runs`, 118 populated `project_id` values do not match `onto_projects`, 529 populated `prompt_snapshot_id` values do not match the current 52-row snapshot table, and two populated `timing_metric_id` values have no parent. These columns need an explicit historical-correlation-versus-FK policy before constraints are added.
5. **Tighten lifecycle integrity:** one of 135 ontology projects has `deleted_at` populated without `archived_at`. Existing documentation makes `archived_at` the visibility source of truth, so this row and the write path that produced it should be reconciled before adding a check constraint.

The homework bundle is small but non-empty (4 runs, 58 iterations, 282 events), and the recurring-task migration log has 51 rows. They are secondary archive candidates, not immediate blind-drop candidates. The beta bundle also remains non-empty and connected to current retargeting/product data, so it requires a product-retention decision rather than schema-only cleanup.

## Executive summary

BuildOS has a coherent current core, but it is carrying several full generations of the product in one exposed `public` schema.

| Surface                |                                     Live/current count | Key result                                                                                                                    |
| ---------------------- | -----------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| Tables                 |                                                    246 | 79 are empty; 23 are empty with no product-runtime reference                                                                  |
| Views                  |                                                     14 | 1 is empty; multiple internal/admin views are anonymously readable                                                            |
| Relations total        |                                                    260 | Generated relation names match the live Data API exactly                                                                      |
| RPCs                   |                                               199 live | Generated types contain 196; 3 live functions are missing locally                                                             |
| Repository usage       |                          5,934 scanned text/code files | 44 relations and 59 generated RPC names have no product-runtime reference; many are still SQL-internal                        |
| Anonymous exposure     | 54 non-empty relations returned a row to the anon role | Includes admin cost views, emails/names, agent chat content, queue/error/notification data, and user calendar items           |
| Data-model consistency |                                    246 tables reviewed | 1 table has no primary key; 16 tables use timestamp-without-time-zone; the core project row has no generated FK relationships |

The most important conclusion is not “drop all empty tables.” Sixty of the 80 empty relations still have product-runtime references, and several others are called only through database functions. The safe path is:

1. Close the live anonymous exposure first.
2. Drop a small set of isolated empty relics and the expired preferences backup.
3. Archive and cut over legacy product generations as bundles, rather than deleting individual tables.
4. Reduce the public API surface by separating `api`, `internal`, `analytics`, `legacy`, and `extensions` schemas.

No tables, rows, functions, grants, policies, or migrations were changed by this audit.

## Critical finding: anonymous reads expose internal and user data

Using only the configured public anon key, a one-column, one-row read returned data from 54 live relations. Values were discarded; only status, row presence, and column names were retained.

Confirmed examples:

| Relation                               | Exposed shape (column names only)                                        | Risk                                    |
| -------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `admin_user_llm_costs`                 | `email`, `name`, `user_id`, usage totals/cost, last usage                | Critical privacy/business data exposure |
| `agent_chat_messages`                  | `content`, tool calls, model, tokens, `user_id`                          | Critical conversation exposure          |
| `agent_chat_sessions`                  | `initial_context`, entity/session identifiers, `user_id`                 | Critical context exposure               |
| `beta_members` / `beta_signups`        | email, name, company, job title, IP/user-agent and application answers   | Critical PII exposure                   |
| `calendar_webhook_channels`            | channel/resource IDs, sync token, webhook token, user ID                 | Critical integration-secret exposure    |
| `error_logs`                           | messages/stacks, operation payload, IP, user/project IDs, metadata       | Critical operational/user-data exposure |
| `notification_deliveries`              | recipient, payload, channel identifier, external/tracking IDs and errors | High privacy exposure                   |
| `queue_jobs`                           | metadata, result, error, processing token, user ID                       | High operational exposure               |
| `user_calendar_items`                  | titles, timestamps, project/task/event IDs and props                     | Critical calendar exposure              |
| `user_notification_preferences_backup` | user IDs, channels, quiet hours and limits                               | High privacy exposure                   |
| `visitors`                             | IP address, visitor ID, user agent                                       | High privacy exposure                   |

The full set of anonymously readable, non-empty relations observed was:

`admin_llm_cost_analytics`, `admin_user_llm_costs`, `agent_call_tool_executions`, `agent_chat_messages`, `agent_chat_sessions`, `beta_events`, `beta_members`, `beta_signups`, `brief_email_stats`, `calendar_webhook_channels`, `discount_codes`, `error_logs`, `error_summary`, `global_migration_progress`, `legacy_entity_mappings`, `migration_log`, `migration_platform_lock`, `notes`, `notification_deliveries`, `notification_events`, `notification_subscriptions`, `onto_actors`, `onto_document_versions`, `onto_event_sync`, `onto_events`, `onto_facet_definitions`, `onto_facet_values`, `onto_metrics`, `onto_public_page_slug_history`, `onto_public_pages`, `project_brief_templates`, `project_kept_versions`, `project_loop_runs`, `project_notification_batches`, `project_questions`, `queue_jobs`, `queue_jobs_stats`, `recurring_task_summary`, `retargeting_founder_pilot_members`, `sms_metrics_daily`, `sms_templates`, `subscription_plans`, `system_metrics`, `task_calendar_events`, `trial_statistics`, `user_calendar_items`, `user_calendar_preferences`, `user_migration_stats`, `user_notification_preferences`, `user_notification_preferences_backup`, `user_notifications`, `user_sms_preferences`, `visitors`, `welcome_email_sequences`.

Some reference/catalog rows may be intentionally public (`onto_public_pages`, perhaps plans/templates/facets), but the majority are not plausibly safe for anonymous direct reads. Treat the list as deny-by-default and explicitly allow only reviewed public projections.

### Root cause and current draft remediation

The repository creates admin-only policies on legacy agent tables but does not enable RLS there; a policy has no effect while RLS is disabled. See `supabase/migrations/20260127_admin_analytics_ontology_updates.sql`.

A separate in-progress migration appeared in the workspace during this audit: `supabase/migrations/20260730010000_rls_lockdown_batch_1_inert_tables.sql`. It independently records 52 public tables with `relrowsecurity = false` while anon/authenticated have broad DML, and enables RLS for an initial 18-table batch. A later catalog check confirmed that batch in production, leaving 34 tables for the Phase 0 follow-up. Do not consider the incident closed until the follow-up migrations, token rotation, and log review are complete.

The original verifier was unsafe because it sent probe inserts. It has been replaced: `scripts/security/verify-rls-lockdown.mjs` now calls a service-only `STABLE` catalog RPC and checks grants, RLS, policies, and view options without reading or mutating application rows.

### Recommended security sequence

1. Immediately enable RLS or revoke anon/authenticated privileges on internal tables and views; use explicit policies only where browser access is required.
2. Recreate views as `security_invoker = true` where supported, or move them to a non-exposed `analytics`/`internal` schema and expose only authorization-checking RPCs.
3. Test with three principals: anon, a real user JWT (own and other-user rows), and service role.
4. Audit write grants from the catalog before any public release. This audit intentionally did not test writes.
5. Rotate any integration/webhook secrets that may have been readable and review access logs. `calendar_webhook_channels` warrants immediate attention.

## Cleanup recommendations

### Tier 1: strong removal candidates

These objects have no product-runtime callers. Empty objects also have no live SQL-function dependency unless noted.

| Candidate                              | Live rows | Evidence                                                                                                     | Recommendation                                                   |
| -------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `user_notification_preferences_backup` |        78 | No PK, no FKs/callers; table comment says keep only 7 days after the 2025-10 migration; anonymously readable | Export once, checksum, then drop immediately                     |
| `onto_decisions`                       |        87 | No product caller; last activity 2025-12-22; migration explicitly says deprecated/scheduled for removal      | Export/archive, verify no out-of-repo consumer, then drop        |
| `api_keys`                             |         0 | No callers, SQL dependencies, or FK dependencies; superseded by current OAuth/agent access tables            | Drop                                                             |
| `calendar_themes`                      |         0 | No callers, SQL dependencies, or FK dependencies                                                             | Drop unless a committed feature is imminent                      |
| `chat_sessions_daily_briefs`           |         0 | No callers/dependencies                                                                                      | Drop                                                             |
| `chat_sessions_tasks`                  |         0 | No callers/dependencies                                                                                      | Drop                                                             |
| `llm_prompts`                          |         0 | No callers/dependencies; current prompt storage uses snapshots/eval tables                                   | Drop                                                             |
| `onto_tools`                           |         0 | No callers or SQL dependencies                                                                               | Drop                                                             |
| `question_metrics`                     |         0 | No callers/dependencies; `project_questions` is the active model                                             | Drop                                                             |
| `question_templates`                   |         0 | No callers/dependencies                                                                                      | Drop                                                             |
| `research_artifact_refs`               |         0 | No callers/dependencies                                                                                      | Drop or implement before retaining                               |
| `task_documents` view                  |         0 | No callers; legacy task-document model has moved to ontology documents/edges                                 | Drop view                                                        |
| `beta_event_attendance`                |         0 | No product caller/SQL dependency                                                                             | Drop with beta-events cleanup                                    |
| `beta_feature_votes`                   |         0 | No product caller/SQL dependency                                                                             | Drop with beta-events cleanup                                    |
| `beta_events`                          |         1 | No product caller; last activity 2025-06-29                                                                  | Archive the single row and drop if the events feature is retired |

The `tree_agent_*` generation is also a strong bundle candidate: `tree_agent_runs`, `tree_agent_nodes`, `tree_agent_plans`, `tree_agent_artifacts`, and `tree_agent_events` are all empty. There are no product callers; the only apparent `tree_agent_events` reference is a retention-audit SQL file. Drop the five tables together in FK-safe order, along with their enums, triggers, indexes, and policies, after confirming the January 2026 experiment is retired.

### Tier 2: archive/cut over as bundles

These are not safe one-table drops because code, analytics, functions, or relationships still tie the generation together.

#### Legacy project generation

| Table              | Exact rows | Latest observed activity |
| ------------------ | ---------: | ------------------------ |
| `projects`         |         64 | 2025-11-26               |
| `tasks`            |        650 | 2025-10-31               |
| `phases`           |        113 | 2025-10-24               |
| `phase_tasks`      |        239 | 2025-10-31               |
| `notes`            |        136 | 2025-09-29               |
| `projects_history` |        545 | 2025-11-26               |

The current product uses `onto_projects`, `onto_tasks`, `onto_plans`, and `onto_documents`, but admin migration routes and legacy RPCs still read the old tables. Rewrite/remove `finalize_draft_project`, `get_project_phases_hierarchy`, `get_project_statistics`, legacy search RPCs, migration dashboards/routes, and history helpers before dropping this bundle. Export legacy rows and prove every legacy ID has an ontology mapping first.

#### Legacy brain-dump generation

`brain_dumps` has 520 rows and `brain_dump_links` has 494; neither has a product-runtime caller, but operational/reactivation scripts still use the old data. Latest activity is 2025-11. Convert those scripts to `onto_braindumps`, archive the rows, then drop the legacy pair.

#### Legacy multi-agent chat generation

| Table                 | Exact rows | Latest observed activity |
| --------------------- | ---------: | ------------------------ |
| `agents`              |        832 | 2026-02-06               |
| `agent_plans`         |         81 | 2026-02-06               |
| `agent_chat_sessions` |        164 | 2026-01-31               |
| `agent_chat_messages` |        535 | 2026-01-31               |
| `agent_executions`    |         94 | 2026-01-31               |

Current chat/run systems are `chat_*`, `agent_runs`, `agent_run_*`, and `agent_tool_executions`. The old generation remains in admin routes/analytics, retargeting metrics, and nullable observability FKs. Migrate those readers, snapshot historical analytics, then archive/drop the bundle. Lock down RLS immediately rather than waiting for removal.

#### Other product-decision candidates

- `homework_runs` (4), `homework_run_iterations` (58), and `homework_run_events` (281) last changed in February 2026 and have no product-runtime callers. Archive/drop the feature as one bundle if homework chat is retired.
- `recurring_task_migration_log` (51) last changed in August 2025. Export and drop after confirming the recurring-task migration is permanently complete.
- `project_kept_versions` mirrors all 545 `projects_history` rows and has no caller. Drop it with the legacy history table.
- `admin_llm_cost_analytics`, `admin_user_llm_costs`, `brief_email_stats`, `trial_statistics`, and other admin views should move to an unexposed analytics schema even if retained.

### Empty tables that should not be dropped merely because they are empty

- Active/failure-state storage: `account_deletion_requests`, `failed_payments`, `email_suppressions`, `billing_ops_anomalies`, `billing_ops_snapshots`, `webhook_events`.
- New/active control planes: `agent_operatives`, `agentic_chat_prepared_prompts`, email-relevance review/adjudication tables, project review signals.
- Active feature schemas with code callers: profile documents/fragments/source/version tables, user contacts, recurring instances, scheduled SMS, requirements/sources.
- `feedback_rate_limit` is empty but is read/written by `check_feedback_rate_limit`.
- `billing_credit_ledger` is empty but is part of the current consumption/billing gate; keep unless billing design changes.
- `security_event_daily_rollups` is empty but is part of active security-retention functions.
- `onto_metric_points` and `onto_permissions` are empty but current SQL functions still reference them. Decide whether to remove the model, then update those functions in the same migration.
- `onto_facet_definitions`/`onto_facet_values` contain reference data and are used by `validate_facet_values`; keep and secure.
- `email_relevance_*`, `legal_acceptances`, and `user_calendar_items` can appear to have no direct code caller because they are accessed behind RPCs/views. Keep and secure.

## RPC audit

### Inventory and drift

- Live Data API RPC paths: 199.
- Generated `database.types.ts` functions: 196.
- Present live but missing locally: `get_sms_notification_stats`, `is_admin`, `settle_agent_run_cost`.
- No locally generated function is missing live.

Regenerate types after the RLS/function cleanup and fail CI when live RPC names drift from generated types.

### Confirmed cleanup residue: eight functions intended to be removed are still live

The January cleanup migration documents these functions as unused, but its `DROP FUNCTION` signatures do not match the surviving overloads. PostgreSQL drops by exact identity signature, so the wrong overloads remained.

| Live function                    | Cleanup signature problem                                       |
| -------------------------------- | --------------------------------------------------------------- |
| `cancel_jobs_in_time_window`     | Cleanup omitted/reordered the leading UUID/text parameters      |
| `get_brief_email_status`         | Cleanup used UUID; live function accepts text                   |
| `cancel_scheduled_sms_for_event` | Cleanup used UUID event ID; live function uses text             |
| `get_scheduled_sms_for_user`     | Cleanup used text date arguments; live uses timestamptz         |
| `search_all_similar`             | Cleanup used numeric threshold; live uses double precision      |
| `complete_recurring_instance`    | Cleanup argument order/types do not match live                  |
| `cleanup_project_history`        | Cleanup targeted a two-argument overload; live has one argument |
| `create_manual_project_version`  | Cleanup targeted three arguments; live has two                  |

Use `DROP FUNCTION public.name(<pg_get_function_identity_arguments output>)`, verify with `to_regprocedure`, and add a migration test that asserts absence. This is a migration-quality issue: the repository documentation currently claims all eight were removed.

### Additional RPC candidates

- `get_content_release_performance`: no application, worker, test, migration, or documentation reference found.
- `log_project_change`: explicitly removed as unused in January, recreated with an expanded signature in May, and still has no caller.
- `update_agent_plan_step`: no caller and belongs to the legacy `agent_plans` generation.
- `cleanup_structure_history`: useful retention logic, but no scheduler/caller exists. Schedule it or remove it; currently it only creates a false sense of retention.
- `prune_stale_profile_fragments`: same issue; keep only if scheduled with the profile-memory feature.
- `check_onboarding_complete`: do not drop with the residue list. It was intentionally recreated in April against canonical `users.onboarding_completed_at`, although no repository caller is visible. Confirm external clients, then decide.
- `get_project_full_with_project_edge_context` and the `*_legacy_public_20260514` functions are internal wrappers used by current hardening wrappers. They are not unused even though app code does not invoke them directly.
- Email-relevance validators/state refreshers, activity batching helpers, slug normalization, security-retention helpers, ontology JSON helpers, and `strip_start_here_managed_regions` are SQL-internal. Keep them.
- `show_limit`, `show_trgm`, and `unaccent` are extension functions. Prefer installing extensions into a non-public `extensions` schema so they do not become application RPC surface.

For the remaining no-runtime RPCs (admin breakdowns, legacy phase/statistics/search functions, recurrence helpers), collect PostgREST/API gateway call logs for 30 days before removal; repository search cannot see older deployed clients or external automation.

## Data-model review

### What is working well

- The current ontology generation has clear entity tables and project-scoped FKs for most child entities.
- Recent queue, agent-run, email-relevance, legal, OAuth, and audit migrations use atomic RPCs, explicit constraints, RLS, idempotency/fencing, and retention concepts.
- Most new temporal columns use `timestamptz`.
- Generated database types and a lightweight schema provide a central model contract; all 260 relation names currently match live.
- High-volume operational entities are separated into run/event/signal/cost tables instead of one unbounded JSON blob.

### Structural issues to correct

1. **The public schema is both storage and API.** Internal helpers, admin views, extension functions, legacy tables, and public API objects all share `public`. Supabase exposes this too easily. Create an allowlisted `api` schema, move helpers to `internal`, reporting views to `analytics`, retired data to `legacy`, and extensions to `extensions`.
2. **Core project ownership has no FK.** Generated metadata reports zero relationships for `onto_projects`; `created_by`/`org_id` are UUIDs without a generated FK. The actor/user compatibility work has made ownership tolerant but weakly enforced. Choose a canonical `owner_actor_id -> onto_actors.id`; keep original auth user attribution in a separate column if needed.
3. **Polymorphic references trade integrity for flexibility.** `onto_edges.src_id/dst_id`, comments/entity IDs, assignments/permissions, assets, logs, inbox references, and voice-note links cannot use ordinary FKs. Add a periodic orphan audit, enforce kind/ID validity on write, and consider a canonical entity registry if polymorphism keeps expanding.
4. **Lifecycle has overlapping truth sources.** `onto_projects` has `state_key`, `deleted_at`, `archived_at`, and `is_public`. Document and constrain allowed combinations (for example, deleted implies non-public; archived is not active), or expose one canonical lifecycle projection.
5. **One live table has no PK.** `user_notification_preferences_backup` has no primary key and no relationships. It is an expired backup, so removal is better than repair.
6. **Timestamp types are inconsistent.** Sixteen tables still use timestamp-without-time-zone. The highest-risk are `chat_operations`, `project_drafts`, `draft_tasks`, `project_questions.answered_at`, `task_calendar_events.last_synced_at`, and `user_calendar_tokens`. Convert absolute instants to `timestamptz`; keep `date`/`time` only for intentionally local calendar semantics.
7. **Several current IDs lack FKs.** Examples include `agentic_chat_prepared_prompts.project_id`, `chat_turn_runs.project_id/prompt_snapshot_id/timing_metric_id`, and project-loop/review queue/session IDs. Add `ON DELETE SET NULL`/`CASCADE` constraints where the identifier is truly relational; document IDs that are external correlation keys.
8. **JSONB-heavy snapshots need contract enforcement.** `project_audits` has 9 JSONB columns; `project_suggestions` and `user_behavioral_profiles` have 6 each; `agent_runs`, `chat_operations`, `chat_prompt_snapshots`, and `homework_runs` have 5 each. Snapshot JSON is reasonable, but version it and validate shape at write time. Promote frequently filtered keys to typed columns.
9. **Backup/temporary objects lack enforceable expiry.** The nine-month-old “keep seven days” table is the clearest example. Every backup/temp table should have an owner, expiry date, and scheduled drop migration.

### Timestamp-without-time-zone inventory

`chat_operations`, `chat_sessions_daily_briefs`, `chat_sessions_projects`, `chat_sessions_tasks`, `draft_tasks`, `llm_prompts`, `project_brief_templates`, `project_drafts`, `project_questions`, `projects_history`, `question_metrics`, `question_templates`, `system_metrics`, `task_calendar_events`, `user_calendar_tokens`, `user_context`.

## Index and performance review

The repository contains 536 historical `CREATE INDEX` statements but only 5 `DROP INDEX` statements. That does not prove 531 live indexes—migrations replace/recreate indexes—but it is a strong signal of index accretion.

The only checked-in index snapshot is from September 2025 and is too stale for live conclusions. It already showed likely redundancies such as a standalone `projects(id)` index beside the PK, a `recurring_task_instances(task_id)` index beside `(task_id, instance_date)`, and overlapping `brain_dumps(user_id, status...)` indexes. Verify whether these survive live before dropping anything.

Direct PostgreSQL catalog access was unavailable because the linked pooler URL has no password. The Supabase REST schema cannot expose:

- `pg_stat_user_tables` sequential/index scan counts,
- `pg_stat_user_indexes.idx_scan`, index sizes, or duplicate index definitions,
- `pg_stat_statements` query frequency/latency,
- exact RLS/policy/trigger/catalog dependencies,
- autovacuum/dead tuple statistics.

Before an index-removal migration, capture at least 30 days of statistics and run a catalog audit for duplicate/prefix indexes, unused indexes (excluding PK/unique/FK support), missing FK indexes, table/index bloat, and slow statements. Reset timestamps matter: an index with zero scans since a recent restart is not proven unused.

## Recommended execution plan

### Phase 0 — incident containment

- **Production verified:** all 58 current catalog invariants pass.
- **Production verified:** internal/admin views are service-only; ordinary views use `security_invoker`; `user_calendar_items` remains the authenticated user-scoped view in this set.
- **Operational follow-up:** complete any remaining webhook-token rotation and live-log review from the incident runbook.

### Phase 1 — low-risk lean-up

- **Production verified:** nine isolated zero-row relics, `task_documents`, and the retired `tree_agent_*` bundle are absent.
- **Pending:** externally archive and remove the 78-row `user_notification_preferences_backup`.
- **Verified:** the live/generated RPC drift assertion passes at 240 function names.

### Phase 2 — legacy cutovers

- **Production verified:** legacy notes, legacy brain dumps/links, and `onto_decisions` are retired.
- Replace remaining readers of legacy projects/tasks/phases/history after closing every migration-ledger gap.
- Move admin analytics and other active callers off legacy agent-chat tables.
- Archive/drop homework tables, recurring migration logs, and retired beta tables only after their retention decisions.

### Phase 3 — model hardening

- Split schemas and explicitly configure exposed schemas in Supabase.
- **Partially complete:** project ownership and Question Tree run-scoped FKs are live.
- Resolve historical chat-run orphan IDs, then add the appropriate canonical FKs.
- Add polymorphic integrity checks and lifecycle constraints.
- Normalize absolute timestamps to `timestamptz`.
- Add lifecycle constraints and JSON schema/version validation.
- Add automated backup expiry and catalog/RPC drift checks.

### Phase 4 — evidence-based performance cleanup

- Capture `pg_stat_statements` and index/table statistics.
- Remove proven duplicate/unused indexes in small reversible migrations.
- Re-run query plans and latency checks after each batch.

## Safe-drop gate

Before any table or function is removed, require all of the following:

- no product, worker, ops-script, test, SQL-function, trigger, policy, cron, or external-client dependency;
- exact row count and export/checksum for non-empty objects;
- incoming and outgoing FK/dependency check;
- API logs show no calls for an agreed observation window;
- rollback artifact exists;
- migration uses exact function identity arguments and asserts the object is gone;
- generated types/schema and documentation are regenerated in the same change.
