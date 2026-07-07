<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_STREAM_ORCHESTRATOR_SIMPLIFICATION_PLAN_2026-07-07.md -->

# Agentic Chat Stream Orchestrator Simplification Plan

Date: 2026-07-07

Scope: `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` and its immediate upstream/downstream contracts.

## Goals

- Fix the remaining correctness issues found in the stream orchestrator review.
- Reduce the size and coupling of `streamFastChat` without changing behavior during extraction-only phases.
- Centralize tool classification so read/write/discovery semantics stay consistent across orchestration, supervision, finalization, SSE, and persistence.
- Keep each phase reviewable with focused tests.

## Current Findings

### Fixed

- P1 incomplete LLM streams: the orchestrator now throws when an LLM stream ends without a terminal `done` event, unless the request signal was actually aborted.
- P2 tool-call accounting: terminal validation, skipped, duplicate, and executed results now count toward the public handled-call count; executor reach is tracked separately inside the orchestrator.
- P2 mixed validation-write plus read rounds: context-gathering ledger observation now uses whether a write actually reached execution, so validation-only writes do not suppress read evidence accounting.
- P3 duplicate-write skipped payloads: duplicate skips now include compact previous-result metadata instead of embedding the full prior result payload.

### Remaining

- Structural complexity: `streamFastChat` still owns LLM streaming, tool validation, tool execution, materialization, repair loops, finalization, cancellation, and telemetry wiring in one large state machine.

## Phase 0: Baseline Regression Coverage

Purpose: capture intended behavior before broad changes.

Tasks:

- Add focused coverage for validation-only tool-call accounting.
- Add focused coverage for mixed validation-write/read rounds feeding the context-gathering ledger.
- Add focused coverage for duplicate-write skipped payload compaction.
- Keep the existing incomplete-stream tests as the baseline for the P1 fix.

Implementation note: for bugs that are not fixed yet, encode desired behavior with `it.fails` tests. When Phase 1 fixes land, convert each matching `it.fails` to `it`.

Acceptance:

- `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts` passes.
- Known remaining bugs are represented by explicit failing-regression tests, not only by this document.

## Phase 1: Correctness Fixes

Status: implemented. The Phase 0 `it.fails` regressions have been converted to normal passing tests, and route final-state persistence now stores the larger of the orchestrator handled-call count and terminal execution-row count.

### 1. Tool-Call Accounting

Target behavior:

- Every model-emitted tool call that receives a terminal tool result counts as handled.
- Executor invocations are tracked separately from handled calls.

Likely implementation:

- Add `toolCallsHandled` and `toolCallsExecuted` internally.
- Keep the public `toolCallsMade` return field mapped to handled calls unless route consumers require a separate migration.
- Update runtime budget copy to use handled calls when enforcing the safety cap.
- Update route final-state persistence to avoid undercounting when validation results exist.

Tests:

- Convert the Phase 0 accounting `it.fails` regression to a normal passing test.
- Confirm existing call-limit tests still count skipped terminal results.

### 2. Mixed Validation-Write/Read Ledger Accounting

Target behavior:

- A validation-only write should not suppress read evidence accounting.
- A write that actually reaches the executor should still reset/disable read-loop pressure as designed.

Likely implementation:

- Pass `roundReachedWriteExecutor` into `ContextGatheringLedger`, or pass an effective post-validation round pattern.
- Keep `hasWriteAttempt` tied to actual executor reach, not mere write intent.

Tests:

- Convert the Phase 0 mixed-round ledger `it.fails` regression to a normal passing test.
- Keep the existing read-loop test that verifies controls stay armed after validation-only writes.

### 3. Duplicate-Write Skipped Payload Compaction

Target behavior:

- Duplicate write skipped results should explain that the write was skipped without embedding the full prior result payload.

Likely implementation:

- Replace `previous_result` with compact metadata:
    - previous tool call id
    - previous tool name
    - previous entity id/title/state when extractable
    - short status/message

Tests:

- Convert the Phase 0 duplicate payload `it.fails` regression to a normal passing test.
- Add a positive assertion that the model still gets enough duplicate-skip context.

## Phase 2: Centralize Tool Classification

Purpose: remove diverging read/write/discovery logic.

Status: implemented for the stream orchestrator path. `tool-classification.ts` now owns canonical op extraction, read/write/discovery classification, gateway `ok`-aware success, duplicate-write skip detection, write-executor reach, write-ledger inclusion, pure-read batching, and persisted trace classification.

Create or extend a shared classifier that owns:

- canonical op resolution
- read/write/discovery classification
- gateway `ok`-aware success
- validation-only vs reached-executor distinction
- duplicate-write skipped detection

Consumers to migrate:

- `stream-orchestrator/index.ts` - migrated.
- `stream-orchestrator/round-analysis.ts` - migrated, with compatibility re-exports for existing helper imports.
- `stream-orchestrator/write-ledger.ts` - migrated to shared write-ledger classification.
- `stream-orchestrator/repair-instructions.ts` - migrated to shared write/success helpers.
- `turn-supervisor/digest.ts` - migrated through compatibility exports.
- `turn-supervisor/finalization-guard.ts` - migrated directly to shared classification helpers.
- `routes/api/agent/v2/stream/+server.ts` - route persistence now uses normalized handled-call counts; persisted tool trace classification is migrated through `tool-trace.ts`.

Acceptance:

- No behavior change except removing inconsistencies covered by Phase 1 tests.
- Classifier has direct unit coverage for common direct tools, gateway ops, discovery tools, and duplicate/skipped executions.

## Phase 3: Extract Tool Round Execution

Purpose: reduce `streamFastChat` size by moving validation, execution, batching, materialization, and tool-message replay into a dedicated module.

Status: implemented for terminal preparation and single-call dispatch. `tool-round-runner.ts` now owns validation/blocked-retry terminal results, single tool-call dispatch, gateway materialization-on-miss, op-name resolution, late validation for newly materialized tools, duplicate-write skips, executor heartbeat/error normalization, result recording, supervisor/UI callback notification, known-entity/materialization side effects, and ordered model replay messages.

The outer orchestrator still owns round-level control flow: budget enforcement, pure-read batch grouping/execution, repair-loop decisions, read-loop ledger decisions, and final round fingerprinting. That boundary keeps this phase extraction-only and leaves batch execution as an optional follow-up once the round-control code is smaller.

Candidate module:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-round-runner.ts`

Input:

- pending tool calls
- available tools and materialization callbacks
- validation context
- execution callbacks
- limits/counters
- known-entity and write-dedup state
- supervisor observer callback

Output:

- ordered executions
- tool messages for model replay
- materialization notices
- updated counters
- round analysis flags such as `roundReachedWriteExecutor`

Acceptance:

- Extraction-only diff after Phase 1 fixes.
- Focused orchestrator tests pass before and after extraction.
- `tool-round-runner.test.ts` covers terminal preparation, result recording, direct executor dispatch, and duplicate-write skip compaction.

## Phase 4: Extract LLM Pass And Finalization

Status: implemented. `llm-pass-runner.ts` now owns the LLM streaming event loop, text/reasoning/tool-call event handling, no-tool synthesis tool-call suppression, per-pass usage and metadata capture, live context-usage update hooks, heartbeat cleanup, incomplete-stream detection, and `llm_pass_completed` supervisor observations. `finalization-runner.ts` now owns length-continuation decisions, no-tool synthesis retries/finalization, zero-tool finalization repair checks, cancellation partial-text handling, terminal finalization guard application, mutation outcome integrity, and tool-limit final text.

Candidate modules:

- `llm-pass-runner.ts`
- `finalization-runner.ts`

LLM pass runner owns:

- streaming event loop - implemented
- reasoning capture - implemented
- usage and pass metadata - implemented
- incomplete-stream guard - implemented
- length-finish detection inputs - implemented as pass result metadata; continuation policy remains in `streamFastChat`

Finalization runner owns:

- finalization guard - implemented
- mutation outcome integrity - implemented
- no-tool synthesis retries - implemented
- cancellation partial-text handling - implemented
- tool-limit final text - implemented

Acceptance:

- `streamFastChat` becomes orchestration glue: initialize state, run LLM pass, run tool round, update repair/ledger state, finalize.
- No user-visible behavior change during extraction.

## Phase 5: Verification And Cleanup

Status: implemented for this refactor slice.

Focused suites:

- `stream-orchestrator.test.ts` - passed.
- `stream-orchestrator/context-gathering-ledger.test.ts` - passed.
- `stream-orchestrator/repair-instructions.test.ts` - passed.
- `turn-supervisor/finalization-guard.test.ts` - passed.
- `routes/api/agent/v2/stream/server.test.ts` - passed.
- Runner/helper additions: `finalization-runner.test.ts`, `llm-pass-runner.test.ts`, `tool-round-runner.test.ts`, `tool-classification.test.ts`, `round-analysis.test.ts`, `write-ledger.test.ts`, `tool-trace.test.ts`, and `turn-supervisor/deterministic-supervisor.test.ts` - passed.

Broader suites:

- Focused Phase 5 suite: `13` files, `174` tests passed.
- Agentic chat v2 service suite: `51` files, `423` tests passed.
- Route-level stream suite: `1` file, `17` tests passed.
- TypeScript: `pnpm --filter @buildos/web exec tsc --noEmit --pretty false --skipLibCheck` passed after `pnpm --filter @buildos/web exec svelte-kit sync` regenerated missing SvelteKit `$types`.

Cleanup:

- Phase 0 `it.fails` regressions are already converted to normal passing tests.
- Obsolete finalization and LLM-pass inline helper code has been removed from `index.ts`.
- `stream-orchestrator/README.md` has been updated with the current module boundaries.
