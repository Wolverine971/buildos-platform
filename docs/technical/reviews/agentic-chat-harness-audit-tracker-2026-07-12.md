<!-- docs/technical/reviews/agentic-chat-harness-audit-tracker-2026-07-12.md -->

# Agentic Chat Harness Audit Tracker

**Date:** 2026-07-12
**Scope:** Agent chat modal, API/runtime E2E harness, model routing, system prompt, skills, tools, orchestration, telemetry, and scenario quality.
**Principle:** Re-evaluate the harness at every model launch. Remove scaffolding when measured model behavior no longer needs it; retain hard product-integrity controls.

## Status Legend

- `OPEN` - confirmed issue, not started
- `IN PROGRESS` - implementation underway
- `BLOCKED` - needs an external dependency or decision
- `DONE` - implemented and verified

## Findings

| Priority | Status      | Finding                                                                                                             | Required outcome                                                                                                                                                 |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | DONE        | The API harness called `releaseTurn()` before assertions and could rewrite `running` telemetry to `completed`.      | Assertions and judging run first; only a checked intermediate turn is explicitly cancelled to unlock a follow-up, with ordering covered by unit tests.           |
| P1       | IN PROGRESS | The paid suite is endpoint E2E, not modal E2E. Its custom client omits modal request and lifecycle behavior.        | Keep an explicitly named API/runtime lane, share the production wire-request builder, and add a browser lane through the real modal.                             |
| P1       | DONE        | Harness results were not attributed to actual model/provider/pass role or native-versus-rescued behavior.           | Structured per-turn attribution now records every pass and classifies factual intervention telemetry; eval launches support pinned models and scaffold labels.   |
| P1       | DONE        | Scenario assertions were weaker than their titles and rubrics.                                                      | Deterministic oracles now verify task priority/date, requested document sections/bullets, targeted edits, canonical tree organization, and content preservation. |
| P1       | DONE        | The calendar stub could mutate an unseeded external event when enabled by an environment flag.                      | The stub is unconditionally skipped with regression coverage; re-enable only after owned event seed/readback/delete exists.                                      |
| P2       | OPEN        | The custom SSE parser silently drops malformed frames and does not enforce production identity/deduplication rules. | Reuse the production SSE processor/protocol utilities or test exact parity.                                                                                      |
| P2       | OPEN        | Skill steering is duplicated across the static catalog, domain sensing, preload, and post-hoc repair.               | Build model-specific ablations, then remove layers that do not improve success.                                                                                  |
| P2       | OPEN        | Regex intent and tool-surface routing remain unmeasured pre-model crutches.                                         | Compare against lean discovery and model-led routing by pinned model.                                                                                            |
| P2       | OPEN        | Telemetry reads often ignore database errors and telemetry is soft locally.                                         | Distinguish unavailable, query failure, running, and terminal states; make CI telemetry authoritative.                                                           |
| P2       | IN PROGRESS | New harness helpers have incomplete isolated unit coverage.                                                         | Release ordering has isolated coverage; add parser, assertion, cleanup, and judge-boundary tests.                                                                |
| P2       | OPEN        | `AgentChatModal.svelte` remains a 2,958-line composition boundary without a direct integration test.                | Cover modal composition in the browser lane while continuing controller extraction.                                                                              |

## P1-1: Turn Completion Truthfulness

### Defect

The runner force-completes the turn before scenario assertions. This makes `assertTurnRunCompleted` incapable of detecting the local finalization problem, including under `AGENTIC_ASSERT_TELEMETRY=true`.

### Implementation

- Run deterministic assertions first.
- Run the optional judge second.
- Release a still-running row only when another turn follows in the same scenario.
- Keep the final turn untouched for post-run inspection.
- Treat release-query failures as harness failures rather than silently continuing.

### Acceptance

- A `running` row is visible to assertions before release.
- Single-turn scenarios never mutate their telemetry status.
- Multi-turn scenarios release only the preceding turn after its checks finish.
- Strict telemetry mode fails on a stuck first turn before any release occurs.

**Implemented:** 2026-07-12. The runner now performs assertions and judging
against untouched telemetry, and releases only a checked intermediate turn when
a follow-up exists. A stuck row is marked `cancelled` with the explicit
`agentic_e2e_followup_release_after_observation` reason rather than falsified as
`completed/stop`. Final turns remain untouched, ordering has isolated regression
coverage, and test-owned chat sessions are deleted in `finally`.

## P1-2: Real Modal E2E

### Diagnosis

The current suite correctly exercises the production server route, model, tools, and database, but it does not exercise the browser modal. The modal adds behavior absent from the custom client:

- session preparation and prepared-prompt prewarm;
- `client_turn_id` and transport `stream_run_id` generation;
- `lastTurnContext`, focus, attachment, and voice fields;
- production SSE parsing, stale-event rejection, and event deduplication;
- optimistic user messages and rendered assistant messages;
- cancellation reporting, stream detachment, and session reconciliation.

### Two-Lane Test Contract

1. **API/runtime E2E:** broad scenario coverage, direct database assertions, model/tool telemetry, lower UI overhead.
2. **Modal browser E2E:** a smaller Playwright suite through the real `AgentChatModal`, validating browser integration and wire parity.

The API lane must not be described as modal E2E. Both callers should use the same request-body builder so fields cannot drift silently.

### Browser Lane, Phase 1

- Authenticate the dedicated harness user in a real browser context.
- Launch the modal from the authenticated application route.
- Observe the prewarm request.
- Submit through the real composer.
- Assert `client_turn_id`, `stream_run_id`, canonical context fields, and prepared-prompt field presence.
- Wait for natural stream completion and assert rendered user and assistant messages.

**Implemented, live run pending:** A dedicated Playwright configuration and
tagged `test:agentic:modal:wiring` / `test:agentic:modal:live` commands exercise
this path. The modal is launched through the real dashboard and context chooser.
Draft prewarm is correctly asserted as cache-only (`ensure_session: false`);
the paid live case preserves prepared-prompt flow and resolves any stream-created
session by exact `client_turn_id` for cleanup. The paid model/browser case has
not been executed.

### Browser Lane, Phase 2

- Controlled cancellation and cancel-reason acknowledgement.
- Forced transport interruption followed by session reconciliation.
- Attachment upload/OCR and `lastTurnContext` follow-up coverage.
- Project-scoped write with database ground-truth verification.

**Implemented in the no-model wiring lane:** controlled Stop now verifies the
same session, transport stream, and client-turn IDs reach the cancellation
endpoint. A second case supplies a valid non-terminal SSE event and closes the
transport without `done`, then verifies the modal requests the exact persisted
session snapshot and renders reconciliation state. These browser tests use a
minimal actor-owned `AE2E ·` project to pass the real chooser and always attempt
both exact session and project teardown.

The browser case exposed a production lifecycle defect: a clean response-body
close caused `SSEProcessor.onComplete` even without terminal `done`, and the
controller treated any prior event as successful completion. The controller now
requires an accepted terminal event; otherwise it starts turn reconciliation.
Unit coverage verifies this boundary. Project-scoped attachment/OCR and
database-write cases remain open, so this P1 stays `IN PROGRESS`.

**Implemented in the no-model wiring lane:** a two-turn case now emits a
server-owned `last_turn_context` packet on turn one and proves turn two forwards
that exact packet while minting new client-turn and stream IDs. A temporary-image
case drives the real hidden file input, browser SHA-256 hashing, upload state,
optimistic attachment rendering, and canonical `temporary_file` stream ref.
Signed storage and stream boundaries are intercepted, so it creates no media
artifact. Project-scoped upload/OCR readback and project-write database truth
remain open.

## P1-3: Model and Intervention Attribution

**Implemented:** 2026-07-12. The runtime emits one factual orchestration
intervention summary alongside per-pass model/provider/role/profile telemetry.
The API harness polls those events, prints a structured result per turn, and
classifies the outcome as `native`, `self_repaired`, `supervisor_rescued`, or
`unattributed`. Strict telemetry mode rejects unattributed results.

Server-only `FASTCHAT_EVAL_PINNED_MODELS` pins every pass to an ordered model
list, while `FASTCHAT_EVAL_SCAFFOLD_VARIANT` records the scaffold ablation label.
Both are inert when unset; the label is attribution only and never changes
runtime behavior.

## P1-4: Deterministic Scenario Oracles

**Implemented:** 2026-07-12. Task creation now requires a beta-list email task
with high numeric priority and the exact upcoming Friday date. Document creation
requires all three requested sections with two or three bullets each. Both edit
turns compare section bodies so unrelated content cannot be silently rewritten,
and the context-only turn must change the Rollback section itself.

The organization scenario previously inspected `onto_edges`, an obsolete source
for document hierarchy. It now reads canonical `onto_projects.doc_structure`,
requires a real multi-document grouping, maps parent/child titles for the judge,
and verifies every original document ID and body remains intact.

## P1-5: Calendar Mutation Safety

**Implemented:** 2026-07-12. Removed the `AGENTIC_TEST_CALENDAR_READY` bypass.
The calendar mutation stub is unconditionally skipped and has a regression test
proving the legacy environment flag cannot enable it. It must not be re-enabled
until the scenario creates a throwaway event, targets and verifies that exact ID,
and deletes it in `finally`.

## Model and Scaffolding Review

The normal balanced tool path currently resolves among DeepSeek V4 Flash, Qwen 3.7 Plus, Tencent Hy3, Xiaomi MiMo 2.5, and Poolside Laguna after tool-compatibility filtering. The judge uses the powerful JSON route. The runtime already persists actual model, provider, requested profile, pass role, token usage, forced synthesis, and repair metadata; the harness must consume these before it can evaluate models or justify scaffolding.

Current repeated steering layers:

1. Always-on root-skill catalog in the system prompt.
2. Token/alias-based domain sensing and skill ranking.
3. Server-side short skill preload.
4. Post-hoc skill-gate repair.
5. Regex mutation intent and tool-surface routing.
6. Supervisor forced-write and forced-synthesis recovery.

Deletion order after model-attributed ablations:

1. Static root-skill catalog.
2. Regex surface-routing fallback.
3. Post-hoc skill-gate repair.
4. Automatic preload if on-demand discovery is sufficient.
5. Escalating forced-synthesis recovery where newer models finish reliably.

Retain authorization, schema validation, destructive-write controls, write deduplication, successful-write truthfulness, and final-state integrity checks.

## Verification Log

- 2026-07-12: 171 focused web tests passed across prompt budgets, tool surfaces, routing, repairs, supervisor behavior, and modal stream/SSE controllers.
- 2026-07-12: 45 smart-LLM model configuration, selection, failover, and logging tests passed.
- 2026-07-12: Tool-surface report measured project-write definitions at about 4.7k estimated tokens and project-write-document at about 5.1k.
- 2026-07-12: Paid hosted-database E2E scenarios were not run during the audit.
- 2026-07-12: Added one canonical stream-request builder used by both the modal controller and API harness; focused request/controller/SSE tests pass.
- 2026-07-12: Added the Playwright modal smoke lane; `playwright test --list` discovers one Chromium test.
- 2026-07-12: `svelte-check` passes with 0 errors and 0 warnings after the first two P1 changes.
- 2026-07-12: Double-check added release-order regression coverage, truthful follow-up unlock status, and exact session cleanup in both E2E lanes.
- 2026-07-12: Added pass-level model/provider attribution, factual intervention classification, strict unattributed failure, and pinned-model/scaffold eval controls.
- 2026-07-12: Strengthened all active scenario oracles and replaced the obsolete organization edge check with canonical document-tree verification.
- 2026-07-12: Closed the calendar safety P1 by removing its environment bypass and enforcing an unconditional skip in tests.
- 2026-07-12: Expanded modal discovery to one paid `@live` case and two no-model `@wiring` cases.
- 2026-07-12: Both authenticated wiring cases passed against the local BuildOS server: cancellation identity and clean-close reconciliation.
- 2026-07-12: The controller clean-close regression suite passes 22/22; the paid live browser/model case was not run.
- 2026-07-13: Tightened clean-close handling so a missing reconciliation identity fails as a transport error instead of falling through to completion; controller suite passes 23/23.
- 2026-07-13: The authenticated no-model browser lane now passes 4/4 cases, adding exact two-turn continuity forwarding and hermetic temporary-image upload/request coverage.
