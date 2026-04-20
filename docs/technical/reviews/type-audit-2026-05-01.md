<!-- docs/technical/reviews/type-audit-2026-05-01.md -->

# Type System Audit — 2026-05-01

Audit of SQL-generated types, shared-types package, and app-level types across the BuildOS monorepo. Goal: find drift, duplicates, and unsafe patterns that mask runtime bugs.

**Scope:**

- `packages/shared-types/src/**` (generated DB types + hand-written)
- `apps/web/src/lib/types/**`
- `apps/worker/src/**` (job processors, scheduler, lib)
- Supabase migrations `20260428*`–`20260501*` vs generated types

**Audit method:** four parallel agent sweeps + DB migration cross-check.

---

## Codex Review — 2026-04-20

Reviewed against the current workspace on 2026-04-20. The main finding was partly accurate: generated Supabase types were behind recent migrations, but most migrations previously called "missing" were already present in the live Supabase project. Keep migration state and generated-type state separate: `database.types.ts` can be stale even when the live DB has already been updated.

Current verification:

- `pnpm exec turbo typecheck --force` passes: 11/11 tasks, uncached.
- `pnpm --filter=@buildos/web check` passes with 0 errors and 204 warnings.
- Live Supabase REST/OpenAPI checks show `email_suppressions`, Phase 2 `email_sequence_*` tables/RPCs, `get_onto_project_summaries_v1(p_actor_id, p_limit)`, enriched `get_project_full`, and `get_admin_dashboard_chat_usage` are present.
- Earlier live DB gap: `cron_logs.message` was absent. User applied migration `20260428000020`; fresh generated types now include `cron_logs.message`.
- Not verified through REST/OpenAPI: index-only migration `20260501000003_ws5_p2_composite_indexes.sql`. Verifying that needs direct SQL access to `pg_indexes` or `supabase migration list`.
- Local generated types are current for the P0/P1 surfaces after running `pnpm run gen:types` and `pnpm run gen:schema` without stale fallback. Note: the user's `pnpm run gen:all` appeared to keep stale generated types because that path allows stale generation in this environment.

Corrections from this review:

- `packages/shared-types/src/index.ts` no longer has the redundant `Database, Json` re-export. No fix needed there.
- `project_context_snapshot` and `project_context_snapshot_metrics` are present in generated types now; the remaining worker casts around that surface are cleanup work, not blocked by those table types being absent.
- Initial review found 14 `supabase as any` casts in `treeAgentWorker.ts` and 2 more in `treeAgentToolExecutor.ts`. Those P2 Supabase casts are now removed.
- The prior "known pre-existing issues" around `buildWelcomeEmailContent` and `EmailService` lifecycle sink methods no longer reproduce in the current tree.

## Action Checklist (prioritized)

### 🔴 Critical — do first

- [x] **Run `pnpm gen:all`** — user ran it, but local generated types were still stale afterward. This can happen if generation kept existing types or did not run against the updated Supabase project. Running `pnpm run gen:types` and `pnpm run gen:schema` without stale fallback refreshed the generated files.
- [x] **Apply/push the remaining live DB gap, then regenerate types.**
    - [x] Confirm/apply `cron_logs.message` column (migration 20260428000020). Generated types now include the column.
    - [x] `email_suppressions` table + `upsert_email_suppression` + `is_email_suppressed` RPCs are present in live Supabase.
    - [x] Email sequence Phase 2 tables and RPCs are present in live Supabase.
    - [x] `get_onto_project_summaries_v1` accepts `p_limit` in live Supabase.
    - [x] `get_project_full` includes `goal_milestone_edges`, `task_assignees`, and `task_last_changed_by` in live Supabase. The audit's earlier `get_project_full_with_goal_edges` / `get_project_full_with_task_enrichment` names are migration labels, not separate RPC names.
    - [x] `get_admin_dashboard_chat_usage` from 20260502000000 is present in live Supabase.
    - [x] Re-run type generation after the remaining DB gap is fixed.
- [x] **P1 typed email-sequence and cron-log surface** (2026-04-20):
    - Removed P1 `supabase as any` casts around `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments`, `email_sequence_events`, `email_suppressions`, and `cron_logs` in the welcome-sequence/admin/cron paths.
    - Typed Phase 2 email sequence RPC calls from generated `Database['public']['Functions']` args/returns.
    - Typed `is_email_suppressed` directly.
    - Added a guard before `complete_email_sequence_send` because the DB RPC requires a non-null `p_email_id`.
- [x] **Deleted legacy interfaces from `packages/shared-types/src/index.ts`** (2026-05-01) — `BriefGenerationJob`, `UserPreferences`, `ProjectContext`, `Task`, `DailyBriefNotificationPreferences`. Verified zero consumers imported any of them from shared-types. Also removed the redundant `export type { Database, Json }` (already covered by `export *`).
- [x] **Fixed job-metadata validators** (2026-05-01):
    - `queue-types.ts isValidJobMetadata` — added cases for `transcribe_voice_note`, `buildos_homework`, `buildos_tree_agent`, `build_project_context_snapshot`, `extract_onto_asset_ocr`, `other`, each with a new type guard function.
    - `validation.ts validateJobMetadata` — added cases + validators for `buildos_homework`, `buildos_tree_agent`, `build_project_context_snapshot`, `process_onto_braindump`.
    - Added `TreeAgentJobResult` interface and `buildos_tree_agent: TreeAgentJobResult` to `JobResultMap`.
- [x] **Stripped stale `as any` casts in worker** (2026-05-01):
    - `apps/worker/src/worker.ts` — all 5 `'...' as any` casts on `queue.process()` removed.
    - `apps/worker/src/worker.ts` — all 4 `job as any` processor casts fixed by typing wrappers as `ProcessingJob<SpecificMetadata>`.
    - `apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts` — replaced inline `{ projectId; reason?; force? }` with `ProjectContextSnapshotJobMetadata`.
- [x] **Removed P2 worker Supabase casts where generated types already exist** (2026-04-20):
    - `treeAgentWorker.ts` — removed the 14 `supabase as any` casts, derived tree-agent rows/statuses from generated DB types, and narrowed JSON write boundaries to `Json`.
    - `treeAgentToolExecutor.ts` — removed the 2 `ctx.supabase as any` casts by typing dynamic entity tables as generated table keys.
    - `projectContextSnapshotWorker.ts` — removed Supabase casts around `project_context_snapshot`, `project_context_snapshot_metrics`, `onto_project_icon_generations`, and `onto_projects`.
    - `projectIconWorker.ts` — removed Supabase casts around icon generation/candidate/project writes and replaced the raw graph/candidate response `as any` boundaries with `unknown` guards.
    - Remaining loose payload typing in `projectContextSnapshotWorker.ts ProjectGraphDataLight` is still tracked under the lower-priority broad `any` sweep.
- [x] **Tightened `jobAdapter` + `supabaseQueue` generics** — 2026-05-01.
    - `LegacyJob<T>` and `JobAdapter<T>` no longer default to `any` — callers must supply the concrete metadata type.
    - `ProcessingJob<T = unknown>` and `JobProcessor<T = unknown>` default to `unknown` instead of `any`.
    - Made `SupabaseQueue.process<T>()` generic so per-job metadata types flow in without contravariance errors.
    - `isProcessingJob` and `isLegacyJob` type guards now take `unknown` with proper narrowing.
    - Typed all 10 processor wrappers in `apps/worker/src/worker.ts` with their specific metadata types (`BriefJobData`, `OnboardingAnalysisJobData`, `SendSMSJobMetadata`, `NotificationJobMetadata`, `ProjectActivityBatchFlushJobMetadata`, `DailySMSJobData`, `ChatClassificationJobData`, `BraindumpProcessingJobData`, `VoiceNoteTranscriptionJobMetadata`, `HomeworkJobMetadata`).
    - Exported `DailySMSJobData` from `dailySmsWorker.ts` so the scheduler/worker.ts wrapper can reference it.

### 🟠 High

- [x] **Deleted `apps/web/src/lib/types/postgrest.api.d.ts` and the dead `merge-comments.ts` script** — 2026-05-01. Also removed the `merge:comments` entry from `apps/web/package.json` and the `postgrest.api.d.ts` lines from `.gitignore` / `.prettierignore`. The script's I/O paths had long rotted after DB types moved to shared-types; user confirmed removal.
- [x] **Deleted `apps/worker/src/workers/smsWorker.ts.bak2` and `.bak3`** — 2026-05-01
- [x] **Rewrote `apps/web/src/lib/types/daily-brief.ts`** — 2026-05-01. Added `'processing'` to status union, marked status non-optional to match DB non-null column, documented synthesized fields (`chat_brief_id`, `executive_summary`, `llm_analysis`) vs real columns, relaxed `metadata`/`llm_analysis` to `any` to keep existing UI code compiling (tightening those requires component-by-component narrowing and was out of scope).
- [x] **Fixed `apps/web/src/lib/types/operations.ts`** — removed phantom `'project_context'` and `'project_notes'` from `TableName`. Verified no `{ table: 'project_context' | 'project_notes' }` call sites.
- [x] **Fixed `agent.types.ts TableName`** — same phantom tables removed. Left `ChatContextType` alone (already matches post-migration DB CHECK constraint) and `AgentChatType` alone (it is a semantic subset of agent-capable modes, not a mirror of chat_type CHECK).
- [x] **Replaced hand-rolled status unions in `apps/web/src/lib/types/project.ts`** — `ProjectStatus`, `TaskStatus`, `TaskPriority`, `TaskType` now derive from `Database['public']['Enums']`.
- [x] **Deleted duplicate enums in `apps/web/src/lib/types/search.ts`** — unused `ProjectStatus`, `TaskStatus`, `PriorityLevel` removed.
- [x] **Derived `AbbreviatedTask`/`AbbreviatedProject` enums in `chat.types.ts`** — 2026-05-01. `AbbreviatedTask.status/priority` and `AbbreviatedProject.status` now derive from `Database['public']['Enums']`.
- [x] **Fixed `time-block.types.ts` nullability** — 2026-05-01. `TimeBlock.sync_source: TimeBlockSyncSource | null` (was non-null; DB column is `string | null`).
- [x] **`project-page.types.ts TaskCalendarEvent`** — 2026-05-01. Replaced hand-rolled shape with `Pick<Database[...]['task_calendar_events']['Row'], ...>`. Fixes drifted `sync_status` union (was `'pending'|'synced'|'error'|'deleted'`, actual DB enum is `'pending'|'synced'|'failed'|'cancelled'`) and incorrect non-null `event_start`/`event_end`.
- [x] **`onto-api.ts` partial pass** — 2026-05-01. Added header warning that `Onto*` interfaces are UI projections; fixed `props` nullability across all 11 entities to match DB (non-null). Full replacement with DB rows deferred (touches too many consumers).
- [x] **Deleted unused hand-rolled rows in `apps/worker/src/lib/supabase.ts`** — `Project`, `Note`, `Task`, `DailyBrief`, `ProjectDailyBrief`, `BriefGenerationJob` removed. Verified zero importers.

### 🟡 Medium

- [x] **Renamed `NotificationStatus` collision** — 2026-05-01. Web type is now `UiNotificationStatus` in `apps/web/src/lib/types/notification.types.ts`.
- [x] **Renamed `api-types.ts ApiResponse` → `ApiResponseBody`** — 2026-05-01. Added a deprecated `ApiResponse` alias for back-compat. Updated all 4 call sites (`lib/types/index.ts`, `lib/utils/api-client.ts`, `lib/utils/api-response.ts`, `lib/utils/api-client-helpers.ts`) to import the new name.
- [x] **De-duplicated `index.ts` vs `project.ts`** — 2026-05-01. `Phase`, `PhaseInsert`, `PhaseWithTasks`, `UserDataResult`, `TabType`, `ModalState` now live only in `project.ts` and are re-exported from `types/index.ts`. Kept the wider `project.ts` `ModalState` union (adds `'synthesis' | 'brain-dump'` — the narrower `index.ts` version was a bug).
- [x] **Stripped `error-logging.ts` dual snake/camel keys** — 2026-05-01. `ErrorLogEntry` now snake_case only (matches DB). Fixed 3 consumers: `ErrorDetailsModal.svelte`, `UserActivityModal.svelte`, `admin/errors/+page.svelte` — dropped `X || error.camelCase` fallback patterns (~70 replacements total, all cargo-culted since the ErrorLogger service writes snake_case to DB).
- [x] **Scheduler/queue typing** — 2026-05-01:
    - `apps/worker/src/scheduler.ts queueBriefGeneration` now takes `options?: NonNullable<DailyBriefJobMetadata['options']>` and returns `Promise<QueueJobRow>`.
    - `apps/worker/src/workers/shared/queueUtils.ts updateData` now typed as `Database['public']['Tables']['queue_jobs']['Update']`.
    - All 4 queue-utils validators (`validateBriefJobData`, `validateSMSJobData`, `validateChatClassificationJobData`, `validateBraindumpProcessingJobData`) now take `unknown` with proper narrowing instead of `any`.
    - Still deferred: annotating `jobData` in scheduler with explicit `DailyBriefJobMetadata` type (low value — the shape is already correct).

### 🟢 Low

- [x] Removed `"future_feature"` placeholder in `feature-flags.types.ts` — 2026-05-01. Also dropped the matching `FEATURE_KEYS.futureFeature` entry in `apps/web/src/lib/utils/feature-flags.ts`.
- [x] `packages/shared-types/src/index.ts` — redundant `Database, Json` re-export already removed
- [ ] Sweep `any` in `apps/worker/src/lib/services/llm-pool.ts`, `apps/worker/src/workers/onboarding/onboardingAnalysisService.ts`, `projectContextSnapshotWorker.ts`, `projectIconWorker.ts`
- [ ] Delete `@deprecated ProjectPreferences` from `apps/web/src/lib/types/user-preferences.ts`
- [ ] Dormant job types in `JobMetadataMap` with no processor: product decision, not an immediate type bug. Decide keep/drop `generate_phases`, `send_email`, `update_recurring_tasks`, `cleanup_old_data`, `generate_brief_email`
- [ ] `queue-types.ts:6` — also `Exclude<…, 'generate_brief_email'>` only if fully decommissioned or excluded at the DB enum boundary
- [ ] Heavy `any` typing on `NotificationEvent`, `ChatToolResult`, `ParsedOperation`, `EmitEventRequest` (in shared-types)
- [ ] `api-types.ts` — convert `enum ErrorCode` and `enum StreamEventType` to `as const` objects

---

## Findings Summary

### Critical drift (before regen)

Recent migration/type status:

| Migration                                              | Missing                                                                                            | Severity |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| 20260428000020 `add_message_to_cron_logs`              | Generated types now include `cron_logs.message` after migration + regen                            | Verified |
| 20260430000006 `add_email_suppressions`                | Live DB has table + 2 RPCs; generated types now include them                                       | Verified |
| 20260501000004 `add_email_sequence_queue_phase2`       | Live DB has 4 tables + 10 RPCs; generated types now include them                                   | Verified |
| 20260430000007 `get_project_full_with_goal_edges`      | Live DB `get_project_full` returns `goal_milestone_edges`; not a separate RPC                      | Verified |
| 20260501000002 `get_project_full_with_task_enrichment` | Live DB `get_project_full` returns `task_assignees` and `task_last_changed_by`; not a separate RPC | Verified |
| 20260501000001 `add_p_limit_to_project_summaries_v1`   | Live DB accepts `p_limit`; generated types now include it                                          | Verified |

Items already correctly reflected: `users.username`, `chat_sessions.extracted_entities`, `chat_prompt_snapshots.prompt_variant`, `llm_usage_logs` turn attribution + openrouter columns, `security_events`, `onto_public_page_views` and friends, `onto_task_update_atomic`, `get_project_skeleton_with_access`.

Items removed correctly: `brain_dumps.context_document`, `brain_dumps.chat_context`, `brain_dumps.search_results`, `onto_projects.context_document_id`.

### Non-obvious bugs found by the audit

- `Task` interface exported from `@buildos/shared-types` used the wrong status enum. This was real, but is now resolved by deleting the legacy interface.
- `isValidJobMetadata` returned `true` for several live job types with no validation. This was real, but is now resolved by added validators/type guards.
- `validateJobMetadata` threw for several live job types. This was real, but is now resolved by added cases.
- Phase 2 email sequence RPCs are touched by current web code. They are now represented in generated types, and the P1 web call sites have been moved off `supabase as any`.

---

## Verification commands

```bash
# DB → types regen
pnpm gen:all

# Typecheck packages that expose a `typecheck` script
pnpm typecheck

# Web Svelte check; root typecheck does not run this package because it has `check`, not `typecheck`
pnpm --filter=@buildos/web check

# Find residual any-casts in worker
rg "as any" apps/worker/src | wc -l

# Find legacy Task imports to fix before deleting
rg "import.*\bTask\b.*@buildos/shared-types" apps/ packages/
```

---

## Stale notes from prior audit

- `buildWelcomeEmailContent` is now exported from `apps/web/src/lib/server/welcome-sequence.content.ts` and imported from there by the service/admin page.
- `EmailService` now includes `getLifecycleEmailSink`, `sendLifecycleLogSink`, `isLifecycleDevRecipientAllowed`, and `createLifecycleSmtpTransporter`.

## Fix-Next Priority List

Completed since review: P0 migration/type regen, P1 email-sequence/cron-log typing, and P2 worker Supabase cast removal for the named tree-agent/snapshot/icon files.

1. **P3 — Decide dormant queue job policy.** `generate_phases`, `send_email`, `update_recurring_tasks`, `cleanup_old_data`, and `generate_brief_email` have metadata/result validators but no active worker processor. Keep them only if they are intentional backlog/legacy API; otherwise exclude/remove them consistently from `QueueJobType`, maps, validators, and eventually the DB enum.
2. **P4 — Shared type hygiene.** Replace broad `any` defaults in `NotificationEvent`, `EmitEventRequest`, `ChatToolResult`, and `ParsedOperation`; remove deprecated `ProjectPreferences` if no consumers remain; convert `ErrorCode` and `StreamEventType` enums to `as const` only if bundle/API compatibility is acceptable.
3. **P5 — Remaining broad worker payload typing.** Sweep non-Supabase `any` in `llm-pool.ts`, `onboardingAnalysisService.ts`, `projectContextSnapshotWorker.ts`, and other JSON-heavy worker paths with focused runtime guards.

## Change log

- **2026-05-01** — Initial audit (Claude). Four parallel sweeps across shared-types, web, worker, and DB migrations.
- **2026-05-01 (round 5):** fifth pass:
    - Deleted stale `apps/web/src/lib/types/postgrest.api.d.ts` (21,597 lines) and dead `apps/web/scripts/merge-comments.ts` that referenced it.
    - Removed orphan `merge:comments` script from `apps/web/package.json` and the `postgrest.api.d.ts` entries in `.gitignore` / `.prettierignore`.
    - `npx turbo typecheck` — 11/11 pass. `svelte-check` — 0 errors, 224 warnings.

- **2026-05-01 (round 4):** fourth pass:
    - Removed camelCase dual-keys from `ErrorLogEntry` (snake_case only, matches DB) and stripped ~70 `X || error.camelCase` fallbacks across `ErrorDetailsModal.svelte`, `UserActivityModal.svelte`, and `admin/errors/+page.svelte`.
    - Tightened `jobAdapter.ts` generics: removed `= any` defaults on `LegacyJob<T>` and `JobAdapter<T>`; switched `isProcessingJob`/`isLegacyJob` to `unknown` with narrowing; replaced `(data as any).priority` with a typed cast.
    - Tightened `supabaseQueue.ts` generics: `ProcessingJob<T = unknown>` and `JobProcessor<T = unknown>`; made `process<T>()` generic.
    - Typed all 10 remaining worker.ts processor wrappers with their specific metadata types. Exported `DailySMSJobData`.
    - Removed `"future_feature"` placeholder from `feature-flags.types.ts` + matching `FEATURE_KEYS` entry.
    - `npx turbo typecheck` — 11/11 pass. `svelte-check` — 0 errors, 224 warnings (all pre-existing).

- **2026-05-01 (round 3):** third pass:
    - Derived `AbbreviatedTask.status/priority` and `AbbreviatedProject.status` in `chat.types.ts` from `Database['public']['Enums']`.
    - Fixed `TimeBlock.sync_source` nullability in `time-block.types.ts`.
    - Replaced hand-rolled `TaskCalendarEvent` in `project-page.types.ts` with `Pick` of the DB row. Fixed drifted `sync_status` union ('error'/'deleted' were never valid; 'failed'/'cancelled' were missing).
    - De-duplicated `Phase`, `PhaseInsert`, `PhaseWithTasks`, `UserDataResult`, `TabType`, `ModalState` between `types/index.ts` and `types/project.ts` — now only declared in `project.ts` and re-exported from the index. Dropped the narrower `ModalState.type = ... | string` in favor of the explicit union.
    - Added header warning to `onto-api.ts` that `Onto*` interfaces are UI projections (not DB rows). Fixed `props` nullability across all 11 onto entities to match DB non-null shape.
    - Fixed `graph-reorganizer.ts toOntoEdge` to coalesce to `{}` instead of `null` to match the tightened `OntoEdge.props`.
    - `npx turbo typecheck` — 11/11 pass. `svelte-check` — 0 errors, 224 warnings (pre-existing).

- **2026-05-01 (round 2):** second pass of fixes:
    - Removed phantom tables (`project_context`, `project_notes`) from both `apps/web/src/lib/types/operations.ts TableName` and `packages/shared-types/src/agent.types.ts TableName`.
    - Derived `ProjectStatus`, `TaskStatus`, `TaskPriority`, `TaskType` in `apps/web/src/lib/types/project.ts` from `Database['public']['Enums']`. Removed unused duplicates from `search.ts`.
    - Added `'processing'` to `DailyBrief.generation_status` union; marked required; clearly separated synthesized fields (`chat_brief_id`, `executive_summary`, `llm_analysis`) from real DB columns.
    - Deleted 6 unused hand-rolled row interfaces in `apps/worker/src/lib/supabase.ts`.
    - Renamed web `NotificationStatus` → `UiNotificationStatus` (2 files, 5 call sites).
    - Renamed shared `ApiResponse` → `ApiResponseBody` with back-compat alias. Updated 4 web consumers.
    - Typed `scheduler.ts queueBriefGeneration` options + return type.
    - Typed `queueUtils.ts updateJobStatus updateData` via `Database[...]['queue_jobs']['Update']`.
    - Converted all 4 queue-utils validators from `(data: any)` to `(data: unknown)` with proper narrowing.
    - `pnpm typecheck` + `svelte-check` both clean (0 errors).

- **2026-05-01 (round 1):** first pass of fixes:
    - Deleted legacy interfaces (`Task`, `ProjectContext`, `UserPreferences`, `BriefGenerationJob`, `DailyBriefNotificationPreferences`) from `packages/shared-types/src/index.ts`. Verified zero external consumers.
    - Added missing cases to `isValidJobMetadata` (5 new job types) and `validateJobMetadata` (4 new job types). Wrote 5 new type guards in `queue-types.ts` and 4 new validators in `validation.ts`.
    - Added `TreeAgentJobResult` interface and `buildos_tree_agent` → result mapping.
    - Removed 9 `as any` casts in `apps/worker/src/worker.ts` (5 on `queue.process()`, 4 on processor invocations). Typed processor wrappers with `ProcessingJob<T>` for the right metadata types.
    - Replaced inline snapshot-job type in `projectContextSnapshotWorker.ts` with `ProjectContextSnapshotJobMetadata`.
    - Deleted `apps/worker/src/workers/smsWorker.ts.bak2` and `.bak3`.
    - All 11 `pnpm typecheck` tasks pass. `svelte-check` reports 0 errors (225 pre-existing warnings unrelated to audit).
    - **Blocker for remaining drift fixes:** local migrations 20260428000020 through 20260501000004 are not reflected in the generated types, indicating they have not been pushed to the remote Supabase project. Running `supabase db push` followed by `pnpm gen:all` should close that gap.
