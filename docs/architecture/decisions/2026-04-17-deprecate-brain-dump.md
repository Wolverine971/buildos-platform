<!-- docs/architecture/decisions/2026-04-17-deprecate-brain-dump.md -->

# Deprecate the in-app Brain Dump modal in favor of the agentic chat modal

**Date:** 2026-04-17
**Status:** Accepted (Phases 1-6 implemented; Phase 7 retention-gated; Phase 8 public blog/archive pass pending)
**Deciders:** DJ
**Related:**

- Pre-work tasker: `docs/plans/2026-04-17-brain-dump-deprecation-prework.md`
- Agentic chat services analysis: `docs/plans/AGENTIC_CHAT_SERVICES_ANALYSIS.md`
- Consumption billing endpoint audit: `docs/business/sales/consumption-pricing-endpoint-audit.md`

## Context

BuildOS shipped the Brain Dump modal as its original capture surface: users paste stream-of-consciousness text, an LLM parses it into structured operations (projects, tasks, notes, context updates), and the user accepts/rejects the proposed operations. The feature is wired across ~14 API routes under `/api/braindumps/**`, 5 client services, 2 stores, 9 UI components, 3 database tables (`brain_dumps`, `brain_dump_links`, `onto_braindumps`), a worker processor, notification bridges, onboarding assets, and consumption billing.

Since then, the agentic chat (`AgentChatModal` + `/api/agent/v2/stream` + the ontology tool surface) has matured into a superset of the capture + execution flow:

- The agent can create projects, tasks, goals, plans, documents, milestones, and risks via ontology tools.
- The agent can update existing entities in-conversation — brain dump was create-only on accept.
- The agent has calendar, web research, and Libri tools that brain dump never had.
- The agent already runs through the same `llm_usage_logs` pipeline that the consumption gate reads.

The two feature surfaces have diverged into parallel code paths, and brain dump has accumulated couplings that now bleed into the agent itself (`brain_dump` as a registered chat context type, `initialBraindump` prop on `AgentChatModal`, shared operation types, a calendar-analysis path living inside a brain-dump-named adapter file).

## Decision

1. **Deprecate the in-app Brain Dump modal and its supporting API + worker surface.** The agentic chat is the supported capture + execution surface going forward.
2. **Keep `onto_braindumps`.** It is the ontology persistence layer used by the agent/history pipeline, distinct from the legacy `brain_dumps` table. It is not part of this deprecation.
3. **Retain historical `brain_dumps` + `brain_dump_links` data until a retention date** (to be set in the pre-work tasker). No table drop in the initial deletion pass. A purge migration follows on the retention date.
4. **Preserve the calendar analysis service.** It is the sole non-brain-dump consumer of shared ontology/operation types. The pre-work tasker specifically untangles it (extract `ParsedOperation` to `$lib/types/operations.ts`; split the adapter so the calendar-suggestion path lives independently of brain dump).
5. **Switch consumption billing to agent-only metering.** Today's `METERED_ENDPOINTS` list in `consumption-billing.ts` includes `/api/braindumps/*`; after deprecation these entries are removed. The gate continues to work because `evaluate_user_consumption_gate()` reads `llm_usage_logs` totals that agent endpoints already populate.
6. **Accept the short-term capability regressions** listed under _Consequences — Negative_ below. They will be addressed in a separate follow-up flow (explicitly **not** blocking deprecation).
7. **Remove, not rename, the `brain_dump` chat context.** It was a legacy quick-capture mode, not a surviving domain concept. New capture should use the normal `global` agent context. Existing `chat_sessions.context_type = 'brain_dump'` rows are migrated to `global` before the enum/type is removed.

## Consequences

### Positive

- **One capture + execution surface.** Stops paying the tax of maintaining two parallel LLM pipelines, two prompt template sets, two notification bridges, two sets of operation validators, and two worker job types.
- **Consumption billing simplifies.** Metering already follows the LLM usage table; removing brain dump endpoints from the middleware block list is a config change.
- **Agent gets a cleaner tool surface.** Removing `brain_dump` as a chat context type collapses an odd legacy scope into the agent's normal context model.
- **Calendar analysis becomes self-contained.** After the adapter split, calendar suggestion logic no longer imports from a brain-dump-named file and carries no brain-dump type dependencies.
- **Onboarding gets a more honest first-run experience** (the "paste a brain dump" step maps poorly to what the product actually does now).

### Negative

The following capabilities brain dump has today are **not** replicated by the agent at time of deprecation. They are accepted regressions and tracked in the pre-work tasker's "Gap Tracking" section for a follow-up flow:

- No persistent "in progress" notification on page reload.
- No background retry queue for failed LLM streams.
- No stream resume after reload.
- No auto-accept batch execution flow (agent requires explicit tool-call confirmation per operation).
- No automatic profile/contact signal processing from freeform content (brain dump worker pipeline had this; the agent's `classify_chat_session` only covers title/topics today).

Additionally:

- **Non-trivial untangling work before deletion.** The shared types (`ParsedOperation`), the adapter split (calendar-suggestion path), and the `operations-executor` decoupling from `BrainDumpStatusService` are prerequisites. The pre-work tasker covers this.
- **History page legacy handling.** During retention, `brain_dumps` rows must either be rendered read-only or filtered out of the history view. The `initialBraindump` "explore via agent" flow goes away.
- **Public docs and blog content.** The public-facing "effective brain dumping" content needs an archival decision (SEO + backlinks).

## Alternatives considered

1. **Keep both surfaces; use brain dump for bulk capture, agent for interactive refinement.**
    - Rejected. Maintaining two LLM pipelines, two prompt sets, two notification bridges, and two worker paths is the main cost being paid today, and users overwhelmingly prefer the conversational surface.
2. **Port brain dump's background resilience (persistent notifications, retry queue, stream resume) into the agent before deprecating.**
    - Rejected as a blocker. The regressions are acceptable in the short term; porting this into the agent is a larger, independent project and shouldn't gate the cleanup.
3. **Delete brain dump first, untangle later.**
    - Rejected. The shared dependencies (`ParsedOperation` type, calendar-suggestion adapter, `operations-executor`) are load-bearing for calendar analysis and project synthesis. Deleting without untangling first breaks those flows.
4. **Repurpose the brain dump modal as an "unstructured capture" frontend that calls the agent under the hood.**
    - Rejected. The modal's value was its dedicated parse-and-review ceremony, not the textarea. Once the ceremony is gone, the modal is a worse entry point to the agent than the existing "Ask AI" CTA.

## Execution plan

Two stages. Pre-work is sequenced in its own tasker; the deletion itself is an 8-phase sequence below. The type/adapter/executor decoupling chain (pre-work Tasks 1–3) must be complete before deletion work starts. Remaining pre-work decisions are now folded into the relevant deletion phases below so the work can proceed without a separate planning PR.

### Stage 1: Pre-work (see `docs/plans/2026-04-17-brain-dump-deprecation-prework.md`)

Untangles shared dependencies and closes outstanding decisions (history page behavior, onboarding replacement, search handling, retention date). Tasks 1 → 2 → 3 form the critical chain and are complete as of the first pre-work pass. Tasks 4–8 are executed as part of the early deletion phases. Task 9 gates only the irreversible database purge. Task 10 gates the billing switchover.

### Stage 2: Deletion phases

Each phase should be reviewable on its own. Phases 1–6 can land before the retention date because they only remove shipping code paths and references. Phase 7 is retention-date-gated and must receive explicit sign-off before running in production. Phase 8 is documentation/public-copy cleanup.

**Implementation status as of 2026-04-17:** Phases 1–6 have been implemented in the deletion slices. The legacy app/API/client stack is removed, shared app types no longer expose the legacy feature, and shipping product copy has been scrubbed outside public blog/archive content. `onto_braindumps`, `/api/onto/braindumps/**`, `process_onto_braindump`, and the worker path that enriches ontology captures remain by design.

**Phase 1 — Cut UI entry points.**
Status: implemented. The global nav now opens the agent chat as BuildOS AI, onboarding no longer routes users through the legacy modal, and the dedicated `initialBraindump` handoff was removed from `AgentChatModal` and history.

Remove `initBrainDumpNotificationBridge()` + `BackgroundJobIndicator` wiring from `apps/web/src/routes/+layout.svelte`. Strip any nav/FAB/onboarding CTA that opens the brain dump modal. Remove Quick capture from `ContextSelectionScreen.svelte`; users should enter freeform capture through the normal global agent context. Remove the `initialBraindump` prop and the dedicated brain-dump mode from `AgentChatModal` + call sites in the history page. After this phase, the feature is off the shipping path even if server routes still exist.

**Phase 2 — Consumption billing switchover.**
Status: implemented. Brain dump endpoints are no longer in the frozen-route matrix; agentic chat remains guarded through `/api/agent/` and `llm_usage_logs`.

Remove `/api/braindumps/generate`, `/api/braindumps/stream`, and `/api/braindumps/` entries from the `ai_compute` and `workspace_write` lists in `apps/web/src/lib/server/consumption-billing.ts`. Pre-work Task 10 will have already confirmed the `evaluate_user_consumption_gate()` RPC meters correctly from agent `llm_usage_logs`. Update `docs/business/sales/consumption-pricing-endpoint-audit.md` in the same PR.

**Phase 3 — Delete client surface.**
Status: implemented. The legacy stores, services, background job indicator, brain-dump components, and brain-dump notification subtype are deleted.

Delete:

- `apps/web/src/lib/stores/brain-dump-v2.store.ts`
- `apps/web/src/lib/stores/backgroundJobs.ts`
- `apps/web/src/lib/services/braindump-api.service.ts`
- `apps/web/src/lib/services/braindump-background.service.ts`
- `apps/web/src/lib/services/brain-dump-notification.bridge.ts`
- `apps/web/src/lib/services/braindump-status.service.ts`
- `apps/web/src/lib/components/BackgroundJobIndicator.svelte`
- `apps/web/src/lib/components/brain-dump/**`
- `apps/web/src/lib/components/notifications/types/brain-dump/**`
- `BrainDumpNotification` variant from `apps/web/src/lib/types/notification.types.ts` (and the `NotificationUnion`).

**Phase 4 — Delete server + API surface.**
Status: implemented for the legacy surface. `/api/braindumps/**`, project/task brain dump routes, the legacy processor/validation/stream helpers, note `brain_dump_links` sync, and expensive-operation limiter policies are removed. The operations executor had no surviving non-brain-dump caller after cleanup, so it was deleted; `validation-utils` remains for surviving generic helpers.

Delete:

- `apps/web/src/routes/api/braindumps/**`
- `apps/web/src/routes/api/projects/[id]/braindumps/**`
- `apps/web/src/routes/api/tasks/[id]/braindumps/**`
- `apps/web/src/lib/utils/braindump-processor.ts`
- `apps/web/src/lib/utils/braindump-validation.ts`
- `apps/web/src/lib/utils/stream-format-helpers.ts`
- `apps/web/src/lib/utils/brain-dump-navigation.ts`
- `apps/web/src/lib/constants/brain-dump-thresholds.ts`

Operations utility outcome:

- `apps/web/src/lib/utils/operations/operation-validator.ts`, `reference-resolver.ts`, and `operations-executor.ts` were deleted after caller checks showed no surviving non-brain-dump consumer.
- `apps/web/src/lib/utils/operations/validation-utils.ts` remains for generic helpers still used outside the legacy flow.
- Brain-dump-specific _consumers_ of these utilities are deleted alongside the API routes.
- Remove brain-dump policies from `apps/web/src/lib/server/expensive-operation-limiter.ts`.
- Remove note endpoint linking through `brain_dump_links` before the table is dropped.

`/api/onto/braindumps/**` and `apps/web/src/lib/server/braindump-processing.service.ts` stay — `onto_braindumps` is the agent's ontology persistence layer.

**Phase 5 — Scrub brain-dump-aware agent code.**
Status: implemented. The `brain_dump` chat context, agent tool/model-scope references, prompt-template imports, prompt core brain-dump wording, and shared chat permission/tool types were removed. Historical audit labels that use `brain_dump` as stored provenance are displayed as captured context where user-facing.

Finishes pre-work Task 4 if any remnants remain. Remove `brain_dump` context type from:

- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- `apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts`
- `apps/web/src/lib/services/agentic-chat/shared/context-utils.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
- `apps/web/src/lib/services/agentic-chat/tools/buildos/overview.ts`, `references.ts`, `usage-guide.ts`
- `packages/shared-types/src/chat.types.ts`

Also remove `brain_dump` labels/badges from `agent-chat.constants.ts` and session-title helpers, then delete the apparently dead `apps/web/src/lib/services/chat-context-service.ts` if a final grep confirms it has no callers. Strip `DisplayedBrainDumpQuestion` and remaining braindump references from `apps/web/src/lib/services/prompts/core/*` (post pre-work Task 6). Remove any brain-dump-only methods from `apps/web/src/lib/services/promptTemplate.service.ts`.

**Phase 6 — Types, tests, static assets, notifications, and search.**
Status: implemented for app/shared source. The legacy type module, LLM fixtures, prompt fixtures, notification event/payload support, search surface, operation table references, onboarding binary assets, and `process_brain_dump` shared queue-type support are removed. Public blog/static blog assets are intentionally deferred to Phase 8 because live content still references them and needs SEO/backlink handling.

Delete `apps/web/src/lib/types/brain-dump.ts` once no surviving import remains (Task 1's type extraction made operation types independent). Delete brain-dump test fixtures (`apps/web/tests/test-*braindump*.md`, brain-dump schemas under `apps/web/src/lib/tests/llm*/`). Delete static assets: `apps/web/static/blogs/brain-dump-*`, `apps/web/static/blogs/braindump-*`, `apps/web/static/onboarding-assets/**/*brain_dump*`. Remove `brain_dump.processed` from shared notification types, payload transformers, admin filters/selectors, and UI renderers. Remove brain-dump search grouping/types from `/api/search`, `/api/search/more`, `apps/web/src/lib/types/search.ts`, and the shared SQL functions `search_all_content.sql` / `search_by_type.sql`.

**Phase 7 — Database migration (retention-date-gated).**
Status: pending explicit retention/purge sign-off. Do not drop retained legacy tables until the retention date is set. Generated database types still reflect retained historical schema until this phase runs and types are regenerated.

Single migration, scheduled for the retention date set in pre-work Task 9:

- Resolve FKs on `error_logs.brain_dump_id` and `llm_usage_logs.brain_dump_id` (drop column or `SET NULL`, per Task 9 decision).
- Resolve `project_questions.answer_brain_dump_id`.
- Drop `brain_dump_links`.
- Drop `brain_dumps`.
- Drop the `brain_dump_status` enum.
- Drop trigram + tag indexes on `brain_dumps`.
- Remove `brain_dump.processed` from any `notification_events` event-type check constraints.
- Remove `brain_dump` from chat context database constraints/enums after migrating existing sessions to `global`.
- Remove `process_brain_dump` from queue-job database constraints/enums after confirming only `process_onto_braindump` is still used.

Regenerate types: `pnpm gen:all`. Do **not** rewrite migration history — cleanup comments only.

**Phase 8 — Docs + blog decisions (non-code).**
Status: partially implemented. Shipping product pages, lifecycle emails, registration/login metadata, admin filters, and default SEO copy no longer advertise the legacy feature. Technical docs and public blog content remain for a deliberate archive/SEO pass.

- Technical docs (`apps/web/docs/features/braindump-context/**`, `apps/web/docs/technical/api/endpoints/braindumps.md`, `apps/web/docs/technical/services/brain-dump-service.md`, `apps/web/docs/prompts/brain-dump/**`, `apps/web/docs/technical/audits/BRAINDUMP_FLOW_AUDIT_2025.md`): move to `docs/archive/` with a short header noting the deprecation date.
- Public blog content (`apps/web/src/content/blogs/getting-started/effective-brain-dumping.md`, `docs/blogs/getting-started/effective-brain-dumping.md`, `docs/philosophy/braindump-psychology.md`): do **not** delete without a separate SEO/backlink review. Default to retain + add a top-of-post "updated for agentic chat" note.
- Product/legal/public pages (`/docs`, `/about`, `/help`, `/privacy`, `/terms`, `/contact`, registration metadata, SEO helpers, roadmap copy) must be searched and updated so shipping product copy no longer advertises Brain Dump.

## Notes

- `brain_dump_id` FKs on `error_logs` and `llm_usage_logs`, plus `project_questions.answer_brain_dump_id`, are retained during the retention window; their fate is decided as part of the retention policy (pre-work Task 9).
- No change to `onto_braindumps` or the `process_onto_braindump` worker job.
- Worker-side files and identifiers under `apps/worker/src/workers/braindump/**` are retained on purpose: they process the surviving `onto_braindumps` table. The "braindump" terminology mirrors the table name, not the deprecated feature.
- Deletion-phase PRs should include a rollback note: Phases 3–6 are recoverable from git; Phase 7 is **not** reversible without a restore — gate it behind the retention-date calendar reminder and require explicit sign-off.

## Verification pass — 2026-04-17

Re-checked the codebase after the deletion slices were committed. Phases 1–6 hold up against the file system; the residual cleanups below were applied as part of this pass:

- Removed 5 empty leftover directories that survived the file deletions:
    - `apps/web/src/routes/api/braindumps/**`
    - `apps/web/src/routes/api/projects/[id]/braindumps`
    - `apps/web/src/routes/api/tasks/[id]/braindumps`
    - `apps/web/src/lib/components/brain-dump`
    - `apps/web/src/lib/components/notifications/types/brain-dump`
- Deleted the orphaned `apps/web/src/lib/services/realtimeProject.service.ts` shim (its only stated purpose was supporting `brain-dump-navigation`, which is gone; verified zero callers).
- Removed the `canUseBrainDump: false` capability flag from `apps/web/src/lib/config/trial.ts` (no remaining shipping consumer; only a stale Stripe-implementation doc still references the name).
- Removed the `brain_dump: 'Chat session about captured context'` chat-context label from `apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.ts` (the `brain_dump` chat context type was removed in Phase 5; the lookup entry could never fire).

No imports of any deleted brain-dump module remain in shipping code. Detailed verification findings, including residual stragglers that are intentionally left in place (historical audit-label switches in ontology/admin components, retained `brain_dump_id` columns wired through error logging until Phase 7) and the next-tier cleanup recommendations (orphaned activity-log enum members, `ProjectLogChangeSource` union value, history-page UI labels) are catalogued in the pre-work tasker's "Verification 2026-04-17" section.
