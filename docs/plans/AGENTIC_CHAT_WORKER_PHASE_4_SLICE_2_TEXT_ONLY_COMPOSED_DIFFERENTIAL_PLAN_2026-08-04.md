<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_2_TEXT_ONLY_COMPOSED_DIFFERENTIAL_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 2 — Text-Only Composed Differential

**Prepared:** 2026-08-04 EDT  
**Status:** Implemented and validated locally. The worker remains internal-only and this slice does not change routing, provider selection, admission, schema, startup, or production environment state.  
**Authority:** The user asked to continue into the next Phase 4 work while deploying the preceding changes.

**Follow-on:** The lifecycle cluster identified here is implemented in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_3_DURABLE_LIFECYCLE_PARITY_PLAN_2026-08-04.md`.

## Outcome

One canned text-only success now runs through the real legacy route harness and the real worker executor harness against a shared deterministic product-behavior golden.

The shared fixture fixes the clock, request, response, finish reason, and usage. The legacy adapter proves the golden from its actual SSE, admitted user message, persisted assistant message, terminal turn state, tool rows, checkpoints, lifecycle rows, and prompt-snapshot write. The worker adapter constructs the same projection from actual durable Broadcast events and terminal-finalization inputs.

The comparison is executable and bounded. It does not use broad ignore lists or declare the thin worker equal to legacy while known behavior is absent.

## Implemented

- Added a stable JSON-pointer differential to `@buildos/agentic-chat-runtime`.
- Aligned events by semantic type and phase before payload comparison, so one missing lifecycle event does not create a false index-shift cascade.
- Corrected the parity normalizer to accept the real durable-worker `text_delta` payload spelling as well as legacy `content`; conflicting dual spellings fail closed.
- Added a shared text-only fixture and exact legacy golden.
- Added runtime-source aliases to the web and worker Vitest configs so direct package tests work from a clean checkout without a pre-existing runtime `dist` directory.
- Added a fresh legacy-route test with a Date-only clock. It proves the full golden without changing timers used by the SSE implementation.
- Repaired the route harness's stale complete mock of `$lib/services/agentic-chat-v2` by adding the canonical attachment-admission normalizer. Fresh targeted runs had correctly rejected the missing mock export before route admission.
- Added a worker executor differential that asserts the exact remaining gap inventory.
- Closed the first safe gap by persisting and publishing `completion_status`, `answer_source`, and terminal token usage for completed worker turns.

## Parity proven by this fixture

- Assistant text and text chunk normalization.
- User and assistant message content.
- Assistant completion status and answer source metadata.
- Empty tool-execution and checkpoint collections.
- Completed outcome, finish reason, assistant-message linkage, and total token usage.
- Admission status, context type, and user-message linkage.

## Remaining exact differential

This is the historical differential at the Slice 2 exit. Slice 3 closes the acknowledged and finalizing public events plus the matching finalizing observability row; its plan records the current inventory.

The worker is still missing these public legacy events for the fixture:

1. acknowledged `turn_phase`;
2. `session`;
3. `context_usage`;
4. finalizing `turn_phase`;
5. `last_turn_context`; and
6. `timing`.

The worker projection also lacks seven legacy observability lifecycle rows and the legacy prompt snapshot. Its durable `done` event intentionally retains authoritative `status` and `failure_code` fields in addition to the now-matching public completion fields; the differential keeps those additions visible.

## Safety boundary

- No live provider call.
- No production or hosted database mutation.
- No migration.
- No transport/cohort expansion.
- No attachment, tool, mutation, supervisor, billing, or failure-path claim.
- Text-only success parity is not complete while the asserted differential remains non-empty.

## Slice 3 handoff

The following lifecycle cluster was handed to, and is now completed by, Slice 3:

1. add stable transition identity for executor-owned semantic lifecycle events;
2. durably publish acknowledged and finalizing `turn_phase` events at the corresponding worker boundaries;
3. persist their worker observability equivalents without duplicating events on response loss or generation replay; and
4. update the composed differential only by removing gaps actually closed by those real writes.

Session/context-usage emission should follow only after the immutable input artifact carries the exact legacy session/context snapshot required to produce those payloads. Timing, last-turn context, and prompt-snapshot parity remain separate slices because they need additional persisted product data and should not be fabricated inside the test adapter.

## Validation gate

1. Runtime parity suite, typecheck, and CJS/ESM/declaration build pass.
2. The fresh legacy golden test passes after rebuilding the runtime workspace package.
   Direct web and worker Vitest commands also pass with the runtime `dist` temporarily absent.
3. The complete legacy route test file passes.
4. The complete worker executor test file passes.
5. Worker source lint and typecheck pass.
6. Whole-web Svelte check passes.
7. `git diff --check` passes for the worktree.
