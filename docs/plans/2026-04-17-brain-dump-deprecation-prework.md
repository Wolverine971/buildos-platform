<!-- docs/plans/2026-04-17-brain-dump-deprecation-prework.md -->

# Brain Dump Deprecation — Pre-Work Tasker

**Status:** Pre-work complete; deletion phases 1-6 implemented; retention purge pending
**Created:** 2026-04-17
**Owner:** DJ
**Scope:** Pre-work only — untangling and decoupling required _before_ brain dump can be safely removed. The actual deletion plan is a follow-up doc.

---

## Why this doc exists

The in-app Brain Dump modal is being deprecated in favor of the agentic chat modal (`AgentChatModal`). A naive deletion is unsafe because brain dump code is tangled with code that must survive:

- The calendar analysis service (`calendar-analysis.service.ts`) uses helpers that currently live inside a brain-dump-named file.
- The project synthesis notification bridge imports a shared operation type (`ParsedOperation`) from the brain dump types file.
- The agentic chat itself registers `brain_dump` as a chat context type with its own tool scopes and model selection.
- The history page and `AgentChatModal` have an `initialBraindump` flow.
- Several prompt-template helpers are shared between brain dump and non-brain-dump flows.
- Consumption billing lists brain dump endpoints in its metered routes.

This tasker inventories the untangling work needed first. Each task should ship as its own PR.

---

## Decisions recorded 2026-04-17

1. **`onto_braindumps` stays.** It is the ontology persistence layer used by the agentic chat / history pipeline, distinct from the legacy `brain_dumps` table. Not part of this deprecation.
2. **Historical `brain_dumps` data is retained until a specific retention date** (TBD in Task 9). No table drop in the initial deletion pass.
3. **Agent gaps vs brain dump** (no background retry, no persistent in-progress notification on reload, no stream resume, no auto-accept batch execution, no automatic profile/contact signal processing) are **not blockers**. They will be handled in a separate flow. Documented in [Gap Tracking](#gap-tracking) below for reference.
4. **Calendar analysis service must survive.** It's the single non-brain-dump consumer of shared ontology/operation types. Work in Tasks 1–3 below is specifically to preserve it.
5. **`brain_dump` chat context is removed, not renamed.** Quick capture was legacy brain-dump UX; future freeform capture uses the normal `global` agent context. Any existing chat sessions with `context_type = 'brain_dump'` migrate to `global`.
6. **Legacy `brain_dumps` are hidden from shipping UI/search during retention.** `onto_braindumps` stays visible because it belongs to the surviving ontology pipeline. The legacy table is retained only for retention/export/purge policy.
7. **Onboarding removes the brain-dump step.** No new brain-dump-equivalent asset is required for this deprecation slice; onboarding can point users at the normal agent surface.

---

## Related context

- Brain dump inventory + rough deletion phasing: see conversation transcript 2026-04-17 (not yet a doc; produce from this tasker when ready).
- Agentic chat services: `docs/plans/AGENTIC_CHAT_SERVICES_ANALYSIS.md`.
- Consumption billing endpoint audit: `docs/business/sales/consumption-pricing-endpoint-audit.md`.
- Inkprint design system (for any UI replacement work): `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`.
- Monorepo + engineering conventions: `CLAUDE.md`.

---

## Dependency order

```
Task 1 (extract types) ──┬──▶ Task 2 (split adapter) ──▶ Task 3 (decouple operations-executor)
                         │
                         └──▶ Task 6 (prompts audit)

Task 4 (agent context scrub) — independent, but blocks brain dump deletion
Task 5 (AgentChatModal initialBraindump) — independent
Task 7 (onboarding replacement) — independent
Task 8 (search behavior) — independent
Task 9 (retention policy) — decision only, no code
Task 10 (billing gate verification) — decision + validation, no code
Task 11 (gap tracking) — documentation only
```

Tasks 1 → 3 were completed in the first pre-work pass. Tasks 4–8 and 10 were completed across the deletion slices. Task 9 still gates the irreversible database purge.

---

## Tasks

### Task 1 — Extract `ParsedOperation` (and siblings) out of `$lib/types/brain-dump.ts`

**Status:** Done in pre-work pass 1.

**Goal:** Move the operation-shape types from the brain-dump types module into a neutral `$lib/types/operations.ts` so that downstream consumers can stop depending on brain-dump.

**Current non-brain-dump consumers of `ParsedOperation`:**

- `apps/web/src/lib/services/project-synthesis-notification.bridge.ts:31,374`
- `apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts:4` (will be split in Task 2)
- `apps/web/src/lib/utils/operations/operations-executor.ts`
- `apps/web/src/lib/utils/operations/operation-validator.ts`
- `apps/web/src/lib/utils/operations/reference-resolver.ts`

**Approach:**

1. Create `apps/web/src/lib/types/operations.ts` exporting `ParsedOperation` and any related types (operation table types, operation kinds, result shapes) that are used outside brain dump.
2. Keep `$lib/types/brain-dump.ts` importing re-exports from the new file so the brain-dump surface keeps compiling (brain-dump gets deleted whole later).
3. Update non-brain-dump importers to pull directly from `$lib/types/operations`.
4. Re-run `pnpm typecheck`.

**Done when:**

- `project-synthesis-notification.bridge.ts` no longer imports from `$lib/types/brain-dump`.
- `ontology/braindump-to-ontology-adapter.ts` no longer imports `ParsedOperation` from `$lib/types/brain-dump`.
- `pnpm typecheck` passes.

**Blocks:** Task 2, Task 3, final brain dump deletion.

---

### Task 2 — Split `ontology/braindump-to-ontology-adapter.ts` into brain-dump and calendar-suggestion files

**Status:** Done in pre-work pass 1.

**Goal:** The adapter file holds two independent code paths — a brain-dump converter (`convertBrainDumpToProjectSpec`) and a calendar-suggestion converter (`convertCalendarSuggestionToProjectSpec`). `calendar-analysis.service.ts` only uses the calendar-suggestion path. Extract the calendar-suggestion path so the whole brain-dump file can die cleanly later.

**Files:**

- `apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts` (source — has both paths)
- `apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.calendar-suggestion.test.ts` (test for the calendar-suggestion path)
- `apps/web/src/lib/services/calendar-analysis.service.ts:6-11` (importer)

**Approach:**

1. Create `apps/web/src/lib/services/ontology/calendar-suggestion-to-ontology-adapter.ts` containing:
    - `convertCalendarSuggestionToProjectSpec`
    - Types: `CalendarSuggestionInput`, `CalendarSuggestionEventPatterns`, `CalendarSuggestionTask`
    - Any shared helpers currently in the file (e.g., `PROJECT_TYPE_INFERENCE` regex list) — duplicate or extract into a third `ontology-type-inference.ts` shared utility; duplication is fine at this scale.
2. Move `braindump-to-ontology-adapter.calendar-suggestion.test.ts` next to the new file and rename accordingly.
3. Update `calendar-analysis.service.ts` import to the new file.
4. Leave the brain-dump path in the original file; it dies with brain dump.

**Done when:**

- `calendar-analysis.service.ts` no longer imports from `braindump-to-ontology-adapter`.
- Calendar suggestion test runs against the new file.
- Typecheck + tests pass.

**Depends on:** Task 1 (if `ParsedOperation` is still referenced in extracted code).

---

### Task 3 — Decouple `operations-executor` and friends from `BrainDumpStatusService`

**Status:** Done. The status-service dependency was removed in pre-work pass 1; the executor itself was deleted in deletion Phase 4 after a final caller grep showed no surviving non-brain-dump consumer.

**Goal:** `operations-executor.ts` currently instantiates `BrainDumpStatusService` inline. At least one non-brain-dump consumer (`next-step-seeding.service.ts`) imports it. Either make the status dependency optional, or confirm the non-brain-dump consumer is itself dead.

**Files:**

- `apps/web/src/lib/utils/operations/operations-executor.ts:17,27,39` (imports and instantiates `BrainDumpStatusService`)
- `apps/web/src/lib/utils/operations-executor.ts` ← duplicate copy one level up; verify which is canonical
- `apps/web/src/lib/services/next-step-seeding.service.ts` (non-brain-dump consumer)
- `apps/web/src/lib/services/braindump-status.service.ts` (dependency — dies with brain dump)

**Approach:**

1. Determine whether `next-step-seeding.service.ts` is still wired into any shipping flow (grep for its exports).
    - If not shipping: mark for deletion with brain dump; skip refactor.
    - If shipping: proceed to step 2.
2. Resolve the duplicate `operations-executor.ts` at `apps/web/src/lib/utils/operations-executor.ts` vs `apps/web/src/lib/utils/operations/operations-executor.ts`. Delete the dead copy.
3. Refactor the surviving `operations-executor.ts` to accept an optional status reporter interface (`OperationStatusReporter`) with a no-op default. Remove the hard `BrainDumpStatusService` import.
4. Inside brain-dump call sites that need the status service, pass a concrete reporter; everyone else (calendar-analysis indirectly, next-step-seeding) gets the no-op default.
5. Typecheck + run any tests under `apps/web/src/lib/utils/operations/`.

**Done when:**

- `operations-executor.ts` (the surviving copy) does not import `BrainDumpStatusService`.
- Duplicate file removed.
- Typecheck passes.

**Depends on:** Task 1.

---

### Task 4 — Scrub `brain_dump` as a chat context type from the agentic chat

**Status:** Implemented in first deletion slice. App/shared context types were removed, existing DB rows are migrated to `global` by `supabase/migrations/20260430000003_remove_brain_dump_chat_context.sql`.

**Goal:** The agent registers `brain_dump` as a distinct context with its own tool scopes and model selection. If that context only exists to service legacy brain dump, rip it out. If it has real UX meaning (e.g., "quick capture"), rename it.

**Files:**

- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts` (brain_dump in tool scopes at ~lines 37 and 309)
- `apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts:86`
- `apps/web/src/lib/services/agentic-chat/shared/context-utils.ts:14`
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts:124`
- `apps/web/src/lib/services/agentic-chat/tools/buildos/overview.ts`
- `apps/web/src/lib/services/agentic-chat/tools/buildos/references.ts`
- `apps/web/src/lib/services/agentic-chat/tools/buildos/usage-guide.ts`
- `packages/shared-types/src/chat.types.ts` (`ChatContextType` union)
- Migrations that added `'brain_dump'` to the `chat_context_types` enum (check `supabase/migrations/*brain_dump*` and `*chat_context_types*`)
- Any Supabase RPC referencing the enum value

**Approach:**

1. Read each file to understand what behavior the `brain_dump` context changes (tool surface, model selection, prompt copy).
2. Decision: **remove** the context type and collapse any historical rows into `global`. Do not add a replacement enum value.
3. Write a migration to update `chat_context_types` enum: migrate any existing `chat_sessions` rows with `context_type = 'brain_dump'` to `global`, then remove/drop the `'brain_dump'` value according to the current schema representation.
4. Update the three chat-tool and two buildos-doc files to drop the case.
5. Remove `brain_dump` from `ChatContextType` union in `packages/shared-types`.
6. Regenerate types: `pnpm gen:all`.
7. Typecheck + run chat tests.

**Done when:**

- No reference to `'brain_dump'` as a chat context type in the agentic chat code path.
- Migration merged and applied.
- `pnpm typecheck` passes.

**Blocks:** Final brain dump deletion (the agent must not name a context after the dead feature).

---

### Task 5 — Remove `initialBraindump` from `AgentChatModal` and clean up history page

**Status:** Implemented in first deletion slice. The dedicated modal handoff is gone; `onto_braindumps` history entries can reopen their associated chat session when one exists.

**Goal:** `AgentChatModal` exposes an `initialBraindump` prop used by the history page to "explore" an old brain dump via the agent. Decide what the history page shows for legacy brain dumps, then remove the prop.

**Files:**

- `apps/web/src/lib/components/agent/AgentChatModal.svelte` (prop definition)
- `apps/web/src/routes/history/+page.svelte` (prop consumer)
- `apps/web/src/routes/history/+page.server.ts` (queries both `onto_braindumps` and `brain_dumps`)

**Approach:**

1. Decision: hide legacy `brain_dumps` from the shipping history page during retention. Keep `onto_braindumps` visible because it belongs to the surviving ontology/history pipeline.
2. Implement chosen behavior in `+page.server.ts` + `+page.svelte`.
3. Remove `initialBraindump` prop from `AgentChatModal.svelte`, strip any internal handling, drop the import/reference in the history page.
4. Typecheck.

**Done when:**

- `AgentChatModal.svelte` has no `initialBraindump` prop.
- History page behavior matches the retention decision.
- Typecheck passes.

---

### Task 6 — Audit prompt templates and extract shared components

**Status:** Done in second deletion slice. Brain-dump-only prompt modules were deleted, surviving prompt core modules no longer import brain-dump types, and reusable prompt wording now refers to neutral user input/project context.

**Goal:** `promptTemplate.service.ts` and `$lib/services/prompts/core/*` mix brain-dump-specific prompt content with shared utilities. Extract the shared pieces so they survive.

**Files:**

- `apps/web/src/lib/services/promptTemplate.service.ts`
- `apps/web/src/lib/services/prompts/core/data-models.ts`
- `apps/web/src/lib/services/prompts/core/task-extraction.ts`
- `apps/web/src/lib/services/prompts/core/prompt-components.ts` (imports `generateProjectContextFramework` used by `calendar-analysis.service.ts:15`)
- `apps/web/src/lib/services/prompts/core/validations.ts`

**Approach:**

1. For each file, list its exported symbols and grep their callers.
2. Classify each symbol: brain-dump-only, shared, or dead.
3. Brain-dump-only symbols: tag with a comment `// TODO: delete with brain dump` and leave in place; they die in the deletion pass.
4. Shared symbols: confirm they don't transitively import from `$lib/types/brain-dump` (Task 1 should have cleared this, but double-check `DisplayedBrainDumpQuestion` in `task-extraction.ts`).
5. Rename/move if the file itself is going to die (e.g., extract `generateProjectContextFramework` into its own file if its current home is brain-dump-only).

**Done when:**

- Every non-brain-dump consumer of these modules works without any brain-dump import.
- The brain-dump-only surface is clearly scoped and marked for deletion.
- Typecheck passes.

**Depends on:** Task 1.

---

### Task 7 — Replace brain dump in onboarding

**Status:** Done. Onboarding now uses project capture / agent chat language, and the orphaned brain-dump onboarding screenshots/video were deleted in Phase 6 cleanup.

**Goal:** Onboarding features a brain dump step with assets. Replace with an agent chat equivalent or remove the step.

**Files:**

- `apps/web/src/lib/config/onboarding.config.ts` (`suggestedFeatures`, `brainDumpExample`/`GuidedDemo` assets, brain_dump step definition)
- `apps/web/src/lib/server/onboarding-profile-seed.service.ts`
- `apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte` (currently modified on this branch — coordinate with any in-flight work before touching)
- `apps/web/static/onboarding-assets/screenshots/*brain_dump*`
- `apps/web/static/onboarding-assets/videos/*brain_dump*`

**Approach:**

1. Decision: remove the brain-dump-specific step and assets. Do not add a replacement demo asset in this deprecation slice.
2. Update `onboarding.config.ts` step list + feature-suggestion copy.
3. If replacing with an agent chat demo, capture a short demo screenshot/video and replace the asset references.
4. Delete unused brain-dump assets once the config stops referencing them.
5. Confirm `onboarding-profile-seed.service.ts` doesn't seed anything brain-dump-shaped that new users still need.

**Done when:**

- Onboarding flow tested end-to-end with no brain dump references.
- Unused assets removed.

---

### Task 8 — Decide search integration behavior

**Status:** Implemented in first deletion slice. App search types/routes and SQL function definitions now omit legacy `brain_dumps`; `supabase/migrations/20260430000004_remove_brain_dump_search_results.sql` applies the DB change.

**Goal:** `/api/search` includes brain dumps. Decide what happens to brain dump matches during and after retention.

**Files:**

- `apps/web/src/routes/api/search/+server.ts`
- `apps/web/src/routes/api/search/more/+server.ts`
- `apps/web/src/lib/types/search.ts`

**Approach:**

1. Decision: hide legacy `brain_dumps` from search now; search only surfaces surviving ontology entities and chat content going forward.
2. Implement via a branch in the search route or a simple flag.
3. Mark the brain-dump-specific search result type/formatter for deletion with brain dump.

**Done when:**

- Search behavior matches the decision and is documented here.

---

### Task 9 — Set retention policy for `brain_dumps` + `brain_dump_links`

**Goal:** Decide the exact retention window for legacy data before the purge migration.

**Decisions to make (inline below when agreed):**

- Retention end date: **TBD**.
- Access during retention: **TBD** (e.g., read-only in history page, export-only, no UI access).
- Purge mechanism: **TBD** (manual migration on date X, or scheduled worker job).
- Downstream FKs — `error_logs.brain_dump_id`, `llm_usage_logs.brain_dump_id`, `project_questions.answer_brain_dump_id`:
    - Option A: drop FK now, keep column for historical join.
    - Option B: set null on any new writes, keep FK until purge.
- Whether to add a one-time export endpoint so users can grab their own brain dump history before purge.

**Approach:**

1. Record decisions above.
2. Open a follow-up issue/doc scheduled at the retention date to run the purge migration.

**Done when:**

- Retention date + access rules + purge plan are written into this file.
- Follow-up calendar reminder or scheduled trigger set.

---

### Task 10 — Verify consumption-billing gate works on agent-only LLM logs

**Status:** Done for local code and docs. The frozen-route matrix no longer includes brain dump endpoints, and the audit doc records that the gate evaluates aggregate `llm_usage_logs` totals from agentic chat. Live production evidence can still be collected as an operational spot-check, but it is no longer blocking the deletion slices.

**Goal:** The `evaluate_user_consumption_gate()` RPC reads `llm_usage_logs` totals to decide whether to freeze accounts. Before removing brain dump endpoints from `METERED_ENDPOINTS`, confirm that agent endpoints are correctly populating `llm_usage_logs` and that the gate still fires without the brain-dump contributions.

**Files:**

- `apps/web/src/lib/server/consumption-billing.ts` (METERED_ENDPOINTS lists — contains `/api/braindumps/generate`, `/api/braindumps/stream`, `/api/braindumps/` today)
- `apps/web/src/hooks.server.ts:430-542` (gate invocation)
- Supabase RPC `evaluate_user_consumption_gate` (see latest migration defining it)
- `packages/smart-llm/src/usage-logger.ts` (where LLM usage is written)
- `docs/business/sales/consumption-pricing-endpoint-audit.md` (source-of-truth doc to update)

**Approach:**

1. Query Supabase: confirm `llm_usage_logs` rows exist with `operation_type` in the agent set (`agentic_chat_v2_stream`, `agent_message_generate`, chat classification, etc.) and that `user_id` + `total_tokens` are populated.
2. Trace the agent streaming endpoint (`/api/agent/v2/stream/+server.ts`) to confirm its LLM calls route through `SmartLLMService.logUsageToDatabase()`.
3. Confirm the RPC's `SUM(total_tokens)` query doesn't filter by `operation_type` — if it does, make sure the filter includes all agent operations.
4. Update `consumption-pricing-endpoint-audit.md` to show brain dump endpoints as "deprecated; no longer metered."
5. Plan: post-deprecation PR to delete brain dump entries from `METERED_ENDPOINTS` lands alongside or after brain dump route deletion.

**Done when:**

- Confirmed in Supabase that agent LLM usage feeds the gate.
- Audit doc updated.
- Open PR queued to remove `/api/braindumps/*` from `METERED_ENDPOINTS` (land with route deletion).

---

### Task 11 — Document agent gaps vs brain dump (separate flow, tracking only)

**Goal:** Per the 2026-04-17 decision, gaps below are _not_ blockers for deprecation. Track them here so the follow-up flow has a complete list.

See [Gap Tracking](#gap-tracking) below.

**Done when:** gaps section below is reviewed and accepted as the source-of-truth for the follow-up flow.

---

## Gap Tracking

Capabilities brain dump has that the agentic chat does not (to be addressed in a separate flow, not blocking deprecation):

| #   | Gap                                                | Where brain dump handles it today                                               | Suggested follow-up                                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Persistent in-progress notification on page reload | `brain-dump-notification.bridge.ts` rehydrates from `brainDumpV2Store` on mount | Generalize the notification bridge for agent streams                                     |
| 2   | Background job retry for failed LLM streams        | `backgroundBrainDumpService` retry queue                                        | Port retry semantics to a generic agent job runner                                       |
| 3   | Stream resume on reload                            | `braindump-v2.store` + bridge subscription reconnect                            | Out of scope unless user demand surfaces                                                 |
| 4   | Auto-accept batch execution flow                   | `BrainDumpModalContent` auto-apply path                                         | Replace with an agent tool-call confirmation UX                                          |
| 5   | Automatic profile/contact signal processing        | Worker pipeline tied to brain dump processing                                   | Evaluate whether `classify_chat_session` already emits equivalent signals; extend if not |

---

## Remaining questions (resolve during Task execution)

1. **Task 9 — exact retention date and purge owner.** This is the only remaining product/operations decision before the irreversible DB migration.
2. **Optional billing spot-check.** Code and docs are complete; production evidence can still be collected by querying live `llm_usage_logs` for agent operations.

---

## After this tasker is done

With Tasks 1–8 and 10 complete, the ADR's remaining work is:

1. Retention-date-gated DB migration (see Task 9).
2. Docs + blog content archival/SEO decisions.

---

## Verification 2026-04-17

Post-commit sweep of the deletion slices. Findings catalogued by category.

### Verified clean

- `apps/web/src/routes/+layout.svelte` — no brain-dump bridge, no `BackgroundJobIndicator` mount.
- `apps/web/src/lib/server/consumption-billing.ts` — no `/api/braindumps/*` entries.
- All Phase 3 + 4 + 6 source files (stores, services, components, utils, types) deleted as listed in the ADR.
- No active code in `apps/web/src` or `apps/worker/src` imports any deleted brain-dump module (verified via targeted grep across `braindump-api.service`, `braindump-background.service`, `brain-dump-notification.bridge`, `braindump-status.service`, `brain-dump-v2.store`, `braindump-processor`, `braindump-validation`, `brain-dump-navigation`, `BackgroundJobIndicator`, `brain-dump.ts`, `operations-executor`, `operation-validator`, `reference-resolver`).
- Migrations present: `supabase/migrations/20260430000003_remove_brain_dump_chat_context.sql`, `20260430000004_remove_brain_dump_search_results.sql`.
- `initialBraindump` only appears in documentation (no source consumer).

### Cleaned in this pass

- 5 empty leftover directories removed: `apps/web/src/routes/api/braindumps/**`, `apps/web/src/routes/api/projects/[id]/braindumps`, `apps/web/src/routes/api/tasks/[id]/braindumps`, `apps/web/src/lib/components/brain-dump`, `apps/web/src/lib/components/notifications/types/brain-dump`.
- Deleted orphaned `apps/web/src/lib/services/realtimeProject.service.ts` (stated purpose: shim for now-deleted brain-dump navigation; zero callers).
- `apps/web/src/lib/config/trial.ts` — dropped `canUseBrainDump: false` capability.
- `apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.ts` — dropped the `brain_dump` chat-context label entry.

### Intentional residuals (do not touch)

These match the ADR's design and should remain as-is until Phase 7 / Phase 8:

- **Historical audit-label switches** in `apps/web/src/lib/components/ontology/EntityActivityLog.svelte`, `DocumentVersionHistoryPanel.svelte`, `DocumentComparisonView.svelte`, and `apps/web/src/lib/components/admin/ActivityTimelineChart.svelte` keep a `case 'brain_dump':` branch to render historical `change_source = 'brain_dump'` rows in `onto_project_logs`. The ADR Phase 5 note covers this explicitly.
- **`brain_dump_id` columns / field handling** in `apps/web/src/lib/services/errorLogger.service.ts`, `apps/web/src/lib/types/error-logging.ts`, `apps/web/src/lib/services/openrouter-v2-service.ts`, `apps/web/src/lib/services/async-activity-logger.ts`, and `packages/smart-llm/src/usage-logger.ts` are tied to retained DB columns. They go away with Phase 7.
- **`packages/shared-types/src/queue-types.ts`** intentionally `Exclude<>`s `'process_brain_dump'` from `QueueJobType`. Defensive; correct.
- **Worker-side `apps/worker/src/workers/braindump/**`and`process_onto_braindump`job** are the surviving ontology-capture pipeline. Naming uses "braindump" because the table is`onto_braindumps`.

### Follow-up cleanup recommendations (next-tier, not blocking)

Each of these is dead-but-bloating. Removing them is low-risk if no caller still narrows on the value; defer until someone explicitly wants the diff:

1. `apps/web/src/lib/utils/activityLogger.ts:21,22,23,33,34` — `brain_dump_*` activity-type union members. No emit sites remain in the web app.
2. `apps/worker/src/lib/utils/activityLogger.ts:20,21,22,32` — same, worker side.
3. `apps/web/src/lib/services/async-activity-logger.ts:44,48` — accepts `'brain_dump'` as a `change_source` header. No client sends it anymore.
4. `packages/shared-types/src/project-activity.types.ts:45` — `'brain_dump'` in `ProjectLogChangeSource` union.
5. `apps/web/src/lib/types/project.ts:55` — `'brain-dump'` in project log type union.

### UX decisions still open (separate from cleanup)

1. **History page terminology.** `apps/web/src/routes/history/+page.svelte` and `+page.server.ts` query `onto_braindumps` (correct, the table stays) but render UI labels and tabs as "Braindumps" / "All Braindumps". Decide whether to rename user-facing copy to "Captures" or similar to match the agent-only product narrative. Internal type names (`OntoBraindump`, `braindumpCount`) can stay since they reflect the table.
2. **`apps/web/src/content/docs/_index.json`** still surfaces a `brain-dump` slug pointing to `apps/web/src/content/docs/brain-dump.md`. Decide as part of Phase 8 whether to retitle or remove.

### Phase 8 (docs + blog) pending — known references

The following docs still reference deleted modules or feature surface and need either an "as of 2026-04-17 deprecated" header or relocation to `docs/archive/`:

- `apps/web/docs/features/braindump-context/**`
- `apps/web/docs/features/history-page/CHAT_SESSIONS_HISTORY_SPEC.md`
- `apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATED_SPEC.md`, `ONBOARDING_V2_UPDATE_ASSESSMENT.md`
- `apps/web/docs/features/time-blocks/NOTIFICATION_STACK_INTEGRATION_SPEC.md`
- `apps/web/docs/features/notifications/{generic-stackable-notification-system-spec,NOTIFICATION_SYSTEM_IMPLEMENTATION,project-synthesis-notification-spec}.md`
- `apps/web/docs/features/conversational-agent/SYSTEM_PROMPT_ARCHITECTURE.md`
- `apps/web/docs/features/chat-system/{QUICK_START,ADMIN_UI_SPECIFICATION,DATABASE_SCHEMA_ANALYSIS,ADMIN_MONITORING,UI_LAYER_ANALYSIS}.md`
- `apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md`
- `apps/web/docs/technical/api/endpoints/projects.md`, `utilities.md`, `summary.md`
- `apps/web/docs/technical/deployment/runbooks/performance-issues.md`
- `apps/web/docs/technical/services/brain-dump-service.md`
- `apps/web/docs/prompts/brain-dump/**`
- `docs/architecture/BRAIN_DUMP_STREAM_API_QUICK_REFERENCE.md`, `BRAIN_DUMP_STREAM_API_EXPLORATION.md`
- `docs/integrations/stripe/implementation-summary.md` (still names `canUseBrainDump`)

Public blog content (`apps/web/src/content/blogs/getting-started/effective-brain-dumping.md`, `docs/blogs/...`, `docs/philosophy/braindump-psychology.md`) and blog tag `brain-dump` in frontmatter are intentionally untouched pending the SEO/backlink review.
