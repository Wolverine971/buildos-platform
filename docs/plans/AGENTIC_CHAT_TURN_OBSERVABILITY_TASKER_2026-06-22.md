<!-- docs/plans/AGENTIC_CHAT_TURN_OBSERVABILITY_TASKER_2026-06-22.md -->

# Agentic Chat Turn Persistence And Observability Tasker

Status: implemented
Created: 2026-06-22
Owner: BuildOS agentic chat
Workstream: backend decomposition / write amplification / observability

## Purpose

Give one agent enough context to centralize turn-run persistence, turn events, timing metrics, and detached write handling for the v2 stream endpoint.

The stream endpoint is the canonical path, but it still owns too many persistence concerns inline. This workstream should reduce duplication and make stream lifecycle persistence easier to reason about before deeper endpoint decomposition.

## Goal

Extract request-scoped turn observability into one service/module used by `apps/web/src/routes/api/agent/v2/stream/+server.ts`.

Recommended new file:

```text
apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts
```

Possible companion test:

```text
apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts
```

## Required Reading

Read these before editing:

1. `apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - Focus on `detachFastChatTask`, `queueTurnRunUpdate`, `recordTurnEvent`, `persistTurnRunFinalState`, `detachTimingTask`, `buildTimingSummary`, and `queueTimingMetric`.
2. `apps/web/src/lib/services/agentic-chat/shared/timing-metrics.ts`
    - Existing timing metric session-reference normalization.
3. `apps/web/src/lib/services/agentic-chat-v2/turn-run-conflicts.ts`
    - Turn-run unique violation helper.
4. `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts`
    - Reads `chat_turn_runs` and `chat_turn_events`.
5. `apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.ts`
    - Reads/persists turn replay context.
6. `apps/web/src/routes/api/agent/v2/stream/server.test.ts`
    - Existing endpoint test harness covers turn events/checkpoints.
7. `apps/web/docs/features/agentic-chat/AUDIT_2026-06-10_HOLISTIC_ASSESSMENT.md`
    - Notes endpoint god-file and turn-event/timing extraction.

## Current State

The endpoint has inline persistence helpers and many call sites:

- `detachFastChatTask()` handles detached non-timing writes.
- `queueTurnRunUpdate()` updates `chat_turn_runs` in detached tasks.
- `recordTurnEvent()` inserts one row into `chat_turn_events` per event and tracks first help/skill/op sequence.
- `persistTurnRunFinalState()` performs final `chat_turn_runs` update.
- `detachTimingTask()` catches/logs detached timing failures.
- `buildTimingSummary()` builds the user-facing/server timing summary.
- `queueTimingMetric()` inserts into `timing_metrics` once.
- Tool execution persistence is detached separately near finalization.
- Some paths skip `agentStream.close()` when `streamDetached` is true.

The logic works, but it is hard to audit because persistence policy is mixed with streaming, prompting, tool execution, supervisor checkpoints, domain sensing, and finalization.

## Recommended Design

Create a request-scoped writer object that owns persistence side effects and in-memory counters.

Suggested shape:

```ts
export class TurnObservabilityWriter {
	constructor(params: TurnObservabilityWriterParams);

	setTurnRunId(id: string | null): void;
	recordEvent(phase, eventType, payload, options?): void;
	queueTurnRunUpdate(patch, label, metadata?): void;
	persistFinalState(patch, label): Promise<void>;
	queueTimingMetric(finishedReason?): AgentTimingSummary | null;
	trackDetachedTask(promise, label, metadata?): void;
	getFirstLanePatch(): Record<string, unknown>;
	getValidationFailureCount(): number;
	flush?(): Promise<void>;
}
```

Start with behavior-preserving extraction. Batching `chat_turn_events` is desirable but should be a second step inside this task only if tests remain straightforward. The first win is central ownership.

If batching is implemented:

- Preserve event order and `sequence_index`.
- Flush before final state persistence where tests or downstream readers depend on rows existing.
- Keep failure handling fail-open for telemetry writes.

## Implementation Tasks

1. Extract `detachTimingTask` / detached error logging into the writer.
2. Extract `recordTurnEvent` with first help/skill/op tracking and validation failure counting.
3. Extract `queueTurnRunUpdate`.
4. Extract `persistTurnRunFinalState`.
5. Extract timing summary and timing metric insert, or split pure summary building into a helper used by the writer.
6. Keep endpoint-local timestamp variables if moving them would create churn; pass a `getTimingState()` callback into the writer.
7. Replace endpoint call sites incrementally.
8. Add unit tests for:
    - event sequence increments
    - first help/skill/op tracking
    - validation failure counting
    - final state update
    - timing metric inserts once
    - detached task failure logs through injected logger/error reporter
9. Re-run endpoint tests.
10. Update this doc with final design and any deliberate deferred batching.

## Non-Goals

Do not do these in this task:

- Do not change the SSE event schema.
- Do not change database schema.
- Do not change prompt snapshot structure.
- Do not remove supervisor checkpoints.
- Do not rewrite the stream loop or orchestrator.
- Do not change user-visible timing payloads unless tests prove they were inconsistent.

## Risk Areas

- Some event rows are consumed by prompt eval/replay. Preserve schema and ordering.
- Timing metric should only be queued once per turn.
- Final state must include the first-lane/first-skill/first-help metadata currently tracked in memory.
- Telemetry failures should not fail the chat turn.
- Detached tasks can outlive the stream response; keep logs useful enough for failures.
- If a runtime has `event.platform.context.waitUntil` or equivalent, integrate only through a small optional adapter so SvelteKit portability does not regress.

## Acceptance Criteria

- `stream/+server.ts` no longer owns the low-level `chat_turn_events`, `chat_turn_runs`, and `timing_metrics` write helpers inline.
- The endpoint calls a named observability writer for turn events, turn updates, timing metrics, and detached telemetry writes.
- Behavior of emitted turn events and timing summaries is unchanged.
- Focused writer tests pass.
- Existing stream endpoint tests pass.

## Final Design

Implemented `TurnObservabilityWriter` in:

```text
apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts
```

The writer is request-scoped and owns:

- detached task failure logging through the injected logger/error reporter
- detached `chat_turn_runs` updates
- detached `chat_turn_events` inserts with `sequence_index`
- first help/skill/canonical-op tracking and validation failure counting
- final `chat_turn_runs` persistence
- timing summary construction
- single-insert `timing_metrics` persistence

The stream endpoint keeps timestamp and cache/prepared-prompt state local and passes a `getTimingState()` callback into the writer. This kept the extraction behavior-preserving and avoided moving unrelated stream lifecycle state.

`chat_turn_events` batching was deliberately deferred. The writer centralizes the write path first while preserving the existing one-insert-per-event behavior, event order, fail-open telemetry handling, and prompt eval/replay reader assumptions.

Added focused tests in:

```text
apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts
```

Covered:

- event sequence increments
- first help/skill/op tracking
- validation failure counting
- final state update
- timing metric inserts once
- detached task failure logging through injected logger/error reporter

## Verification Notes

Passed:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts
```

Passed:

```bash
pnpm --filter @buildos/web test -- \
  src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts \
  src/routes/api/agent/v2/stream/server.test.ts \
  src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts \
  src/lib/services/agentic-chat-v2/prompt-replay-runner.test.ts
```

`pnpm --filter @buildos/web check` currently fails on unrelated Svelte syntax/default-export diagnostics rooted at:

```text
apps/web/src/lib/components/agent/AgentChatModal.svelte:2484
```

No changed-file diagnostics were reported before `svelte-check` stopped on that existing component issue.

## Suggested Verification

Run focused tests:

```bash
pnpm --filter @buildos/web test -- \
  src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts \
  src/routes/api/agent/v2/stream/server.test.ts \
  src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts \
  src/lib/services/agentic-chat-v2/prompt-replay-runner.test.ts
```

Then run:

```bash
pnpm --filter @buildos/web check
```

If `check` fails from unrelated backlog, record only the diagnostics relevant to changed files.
