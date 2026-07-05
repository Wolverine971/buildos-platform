<!-- apps/web/docs/technical/audits/AGENT_CHAT_SSE_HANDLER_FIX_SPEC_2026-07-04.md -->

# Agent Chat SSE Handler Fix Spec - 2026-07-04

**Status:** research and implementation spec. Original audit pass made no application-code changes; follow-up implementation through Phase 4 shipped on 2026-07-05.

**Scope:** `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts` and the upstream/downstream contracts that determine whether live client state stays equivalent to persisted turn state.

**Primary risks covered:**

- event ordering
- duplicate event handling
- reconnect, detach, and resume behavior
- partial tool-result display
- divergence between live UI state and persisted turn/session state

---

## Implementation Update - 2026-07-05

Phases 1-4 from this spec have been implemented and verified.

| Phase                                        | Status   | Implementation summary                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 - Backward-Compatible Client Safety  | Complete | Agent-stream semantic `type:'error'` frames now reach the handler through an opt-in SSE processor option; created-entity chips are suppressed on error/cancel terminal states; tool calls/results are deduped; result-before-call side effects replay once after the matching call appears.                                      |
| Phase 2 - Persistence-Backed Reconciliation  | Complete | Accepted streams that detach or error now preserve turn identifiers long enough to reload the session snapshot and reconcile against durable state, while explicit Stop remains a user-visible cancellation path.                                                                                                                |
| Phase 3 - Stream Envelope And Ordering       | Complete | Agent SSE payloads now carry event envelope metadata (`event_id`, `stream_run_id`, `client_turn_id`, `turn_run_id`, `sequence_index`, `phase`, `event_type`, `durable`); the SSE response can emit `id:`; the client rejects stale stream/client-turn frames and duplicate event keys.                                           |
| Phase 4 - Live/Restored Tool Timeline Parity | Complete | Live `tool_result` payloads now include the same meaningful telemetry restored timelines use: result count, zero-result, duration, tokens, user-action state, affected entities, and bounded/redacted stream-event previews. Live activity metadata is sanitized and mapped into the same row shape as restored tool executions. |

Current implementation files:

- `packages/shared-types/src/agent.types.ts`
- `apps/web/src/lib/utils/sse-processor.ts`
- `apps/web/src/lib/utils/sse-response.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`
- `apps/web/src/lib/components/agent/agent-chat-timeline.ts`
- `apps/web/src/lib/components/agent/agent-chat-session.ts`

Latest verification, run from `apps/web` on 2026-07-05:

```bash
pnpm exec vitest run src/lib/components/agent/agent-chat-sse-handler.test.ts src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts src/lib/components/agent/agent-chat-timeline.test.ts src/lib/components/agent/agent-chat-session.test.ts src/lib/utils/sse-processor.test.ts src/lib/utils/sse-response.test.ts src/routes/api/agent/v2/stream/server.test.ts
```

Result: 7 files passed, 114 tests passed.

```bash
pnpm check
```

Result: `svelte-check found 0 errors and 0 warnings`.

```bash
git diff --check
```

Result: passed.

---

## Executive Summary

The component is doing useful work, but it is not yet robust enough for an orchestration-adjacent stream boundary. The current path assumes a mostly linear, exactly-once stream. The server, database, and modal have enough pieces to make the stream idempotent and recoverable, but those pieces are not connected end to end.

The correct fix is not just "patch the handler." The handler needs three supporting contracts:

1. **A stream event envelope** with `stream_run_id`, `client_turn_id`, `turn_run_id`, and `sequence_index`.
2. **Idempotent client-side event application** keyed by stream event id or `{stream_run_id, sequence_index}`, plus tool-call-specific ids.
3. **Persistence-backed reconciliation** when a live transport detaches, errors, or closes before the turn's durable terminal state is known.

The highest-priority implementation should start with targeted, backward-compatible safety fixes:

- make agent-stream `type: 'error'` frames reach `createSSEHandler()`
- stop flushing optimistic created-entity chips on `done(error)`
- dedupe `tool_call` and `tool_result` events by tool-call/result identity
- replay buffered result side effects when a `tool_result` arrives before its `tool_call`
- reconcile from `chat_sessions/[id]` after transport failure or detach

The larger protocol fix should then expose the server's existing durable event sequence to the live SSE payload.

---

## Verified Current Data Flow

### Live Stream Path

1. `AgentChatStreamController.sendMessage()` posts to `/api/agent/v2/stream` with `stream_run_id` and `client_turn_id`.
    - `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:443-462`
2. `SSEProcessor.processStream()` parses `data:` frames and routes parsed JSON into callbacks.
    - `apps/web/src/lib/utils/sse-processor.ts:214-278`
3. The stream controller forwards most parsed events to `createSSEHandler()`.
    - `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:469-487`
4. `createSSEHandler()` mutates modal state, assistant text buffers, thinking-block activities, created-entity chips, and tool mutation/toast side effects.
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:289-624`
5. Live tools and changes tabs are derived from in-memory thinking-block activities.
    - `apps/web/src/lib/components/agent/agent-chat-timeline.ts`
    - `apps/web/docs/technical/audits/AGENTIC_CHAT_LIVE_SYNC_AUDIT_2026-07-02.md`

### Durable State Path

The server already persists richer, ordered turn state:

- `chat_turn_runs` stores `stream_run_id`, `client_turn_id`, status, and assistant message references.
- `chat_turn_events` stores `turn_run_id`, `stream_run_id`, `sequence_index`, `phase`, `event_type`, and payload.
- `chat_tool_executions` stores tool results and telemetry used by restored history/timeline.

Important verified code:

- `PendingTurnEventRow` includes `stream_run_id` and `sequence_index`.
    - `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts:81-90`
- `TurnObservabilityWriter.recordEvent()` increments `turnEventSequence`.
    - `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts:159-187`
- The session API selects turn events ordered by `sequence_index`.
    - `apps/web/src/routes/api/chat/sessions/[id]/+server.ts:522-525`
- The detached-turn plan already says SSE should be a live view of a durable turn, not the owner of that turn.
    - `docs/specs/AGENTIC_CHAT_DETACHED_TURN_EXECUTION_PLAN.md`

### Current Protocol Gap

`AgentSSEMessage` has no stream envelope fields.

- Active type: `packages/shared-types/src/agent.types.ts:461-489`

The actual union carries event-specific payloads like `tool_call`, `tool_result`, `done`, and `error`, but no shared `event_id`, `stream_run_id`, `client_turn_id`, `turn_run_id`, or `sequence_index`.

The SSE writer emits optional `event:` and JSON `data:`, but no SSE `id:` field.

- `apps/web/src/lib/utils/sse-response.ts:132-144`

So the browser cannot ask for `Last-Event-ID`, and the handler cannot distinguish a legitimate repeated action from a duplicate network frame except for tool-specific ids.

---

## Findings And Correct Fixes

### P1 - Live UI Can Permanently Diverge From Persisted Turn State

**Finding:** The controller treats transport failure as a final local failure. It marks the thinking block as `error`, finalizes the assistant message, clears active stream ids, and does not reconcile the active turn from persisted state.

Relevant code:

- transport callback path: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:488-503`
- catch path: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:526-560`
- detach path: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:610-634`

This conflicts with the detached-turn model. The server can continue after the client stream is detached and persist later tool/message state, but the live modal can remain stuck on an optimistic failed/interrupted view.

**Correct fix:**

Add a reconciliation state machine owned by the stream controller:

1. Preserve the active `stream_run_id`, `client_turn_id`, and `session_id` when transport fails or detaches.
2. Mark the live UI as `restoring` or `syncing`, not final terminal `error`, when the failure is a transport loss and not an explicit user cancellation.
3. Poll the session snapshot endpoint for the active turn until `chat_turn_runs.status` is terminal or a bounded timeout expires.
4. Replace optimistic live messages and thinking activities with persisted session messages, timeline items, and turn events once the turn completes.
5. Only show a permanent local error if the persisted turn is terminal `error`, the session cannot be loaded, or reconciliation times out.

**Implementation target:**

- Add a dependency hook to `AgentChatStreamController` such as `reconcileTurnFromSession({ sessionId, streamRunId, clientTurnId, reason })`.
- Implement it in `AgentChatModal.svelte` using existing session loading/hydration helpers.
- Reuse the current restored-active-turn polling behavior, but trigger it for transport failure and detach too.

**Acceptance criteria:**

- Closing or navigating away during a long tool run does not create a permanent "connection error" in the chat if the server later persists a completed turn.
- Reopening the same session shows the assistant response and tool timeline from persisted state.
- Explicit user stop still persists and displays as cancelled/interrupted, not silently completed.

---

### P1 - Stream Events Need Stable Ordering And Identity Metadata

**Finding:** The durable event log already has `sequence_index`, but live SSE events do not expose it. The handler applies events in received order and cannot reliably reject duplicates, late events after terminal frames, or events from a previous transport.

**Correct fix:**

Introduce a shared, backward-compatible envelope:

```ts
export interface AgentStreamEventMeta {
  event_id?: string;
  stream_run_id?: string;
  client_turn_id?: string;
  turn_run_id?: string;
  sequence_index?: number;
  phase?: 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';
  event_type?: string;
}

export type AgentSSEMessage = AgentStreamEventMeta & (
  | { type: 'context_usage'; usage: ContextUsageSnapshot }
  | { type: 'session'; session?: ChatSession; sessionId?: string }
  | ...
);
```

Alternatively, wrap events:

```ts
type AgentSSEEnvelope<T extends AgentSSEMessage = AgentSSEMessage> = {
	type: T['type'];
	meta: AgentStreamEventMeta;
	payload: Omit<T, 'type'>;
};
```

The first form is lower migration cost because the current handler switch can remain mostly unchanged.

**Server rules:**

- Every emitted live frame should include `stream_run_id` and `client_turn_id` when known.
- Once `turn_run_id` exists, every durable event should include `turn_run_id` and `sequence_index`.
- If a frame is not recorded in `chat_turn_events`, it should still receive a monotonic live sequence scoped to `stream_run_id`, then be marked `durable: false`.
- Terminal events must include the final persisted status/finished reason if available.

**Client rules:**

- Drop events whose `stream_run_id` or `client_turn_id` does not match the active turn.
- Track processed event identity by `event_id`, falling back to `${stream_run_id}:${sequence_index}`.
- Treat terminal events as a boundary. Late non-observability events after `done`, `error`, or `cancelled` should be ignored and logged in development.

**Why this should work:**

The server already has a sequence source in `TurnObservabilityWriter`. The fix connects that durable ordering to the live stream instead of inventing a second ordering system in the UI.

---

### P2 - `type: 'error'` Frames Bypass The Agent Handler

**Finding:** `createSSEHandler()` contains a real `case 'error'`, but the generic parser currently routes `{ type: 'error', error: '...' }` to the stream controller's transport `onError` callback.

Relevant code:

- parser route: `apps/web/src/lib/utils/sse-processor.ts:261-278`
- handler route that is bypassed: `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:474-491`
- current test asserts generic behavior: `apps/web/src/lib/utils/sse-processor.test.ts:59-67`

That means handler cleanup such as `createdEntitiesBuffer = []` is dead for production agent-stream semantic errors.

**Correct fix:**

Add an option to `SSEProcessorOptions`:

```ts
treatErrorEventsAsProgress?: boolean;
```

Then, in `handleParsedEvent()`:

```ts
} else if (data.type === 'error' || data.error) {
  if (options.treatErrorEventsAsProgress && data.type === 'error') {
    callbacks.onProgress?.(data);
  } else {
    callbacks.onError?.(data.error || data.message || 'Unknown error');
  }
}
```

Enable it only for `AgentChatStreamController`.

**Why this should work:**

It preserves existing generic SSE behavior and only changes the agent stream, where `error` is a semantic event in the same protocol union as `done`.

**Tests to add:**

- Default `SSEProcessor` behavior still routes error frames to `onError`.
- With `treatErrorEventsAsProgress`, `{type:'error'}` reaches `onProgress`.
- Agent handler receives the error event and clears created-entity buffer.

---

### P2 - `done(error)` Can Flush Optimistic Created-Entity Chips

**Finding:** `handleDone()` finalizes the assistant and flushes `createdEntitiesBuffer` for every finished reason, including `error`.

Relevant code:

- `resolveDoneFinalization('error')` returns `{ status: 'error' }`.
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:162-181`
- `handleDone()` flushes created entities unconditionally.
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:450-459`

If a tool result created an entity and the turn later fails, the live UI can show "created" chips even though the final persisted state should be treated as uncertain until reconciliation.

**Correct fix:**

- Never flush optimistic created-entity chips on `done(error)`.
- For `done(cancelled)`, choose one explicit policy:
    - conservative: do not flush optimistic chips; rely on persisted tool executions after reconciliation
    - permissive: flush only if the matching tool execution has already been persisted and reported as committed
- The recommended policy is conservative for live UI and persistence-backed after refresh.

**Tests to add:**

- A successful create tool result followed by `done(error)` does not call `addCreatedEntitiesMessage`.
- A successful create tool result followed by `done(stop)` still surfaces created chips.
- A cancellation path follows the chosen policy.

---

### P2 - Tool Calls And Results Are Not Idempotent

**Finding:** `handleToolCall()` always appends a new activity. `handleToolResult()` always indexes entities, updates activity status, shows toast, records mutation, and extracts created entities if applicable.

Relevant code:

- append: `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:366-370`
- result side effects: `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:398-447`

Duplicate frames can therefore:

- create duplicate live tool activities
- show duplicate toasts
- double-count live mutation side effects
- duplicate created chips unless deduped by entity id
- overwrite activity state after terminal or after a newer event

**Correct fix:**

Add handler-local idempotency sets reset per active stream:

```ts
type SSEHandlerStreamState = {
	streamRunId: string | null;
	clientTurnId: string | null;
	processedEventKeys: Set<string>;
	processedToolCallIds: Set<string>;
	processedToolResultKeys: Set<string>;
	terminalReceived: boolean;
};
```

Required behavior:

- `tool_call` with an existing `tool_call.id` should update/upsert the existing activity rather than append a second one.
- `tool_result` should be applied once per `{stream_run_id, tool_call_id}` or event id.
- Result side effects such as `showToolResultToast()`, `recordDataMutation()`, and `extractCreatedEntity()` should run only on first application.
- Duplicate hidden-tool results should be ignored after the first clear.
- If no tool id exists, dedupe by event identity when envelope metadata is available; otherwise preserve current behavior and log in development.

**Implementation target:**

- Extend `ThinkingBlockDeps` with `upsertToolCallActivity()` or make `handleToolCall()` update the block by `toolCallId`.
- Keep current `pendingToolResults` for result-before-call recovery, but make its stored value include a side-effect status.

**Tests to add:**

- Duplicate `tool_call` with the same id creates one activity.
- Duplicate `tool_result` with the same id calls toast/mutation once.
- Hidden tool result duplicate does not reprocess side effects.
- A `tool_result` without `tool_call_id` remains supported, but is event-id deduped once envelope metadata exists.

---

### P2 - Result-Before-Call Recovery Is Status-Only

**Finding:** The handler correctly buffers a `tool_result` when the matching visible activity has not arrived yet. When the `tool_call` arrives, it updates status and deletes the pending result. It does not replay all side effects with the resolved arguments.

Relevant code:

- pending result buffer: `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:417-423`
- pending result consumption: `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:372-383`
- side effects only occur in `handleToolResult()` when a matched activity returns args immediately.
    - `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:423-447`

This means the handler can recover the status but still miss the same toast/mutation/created-entity behavior it would have produced in normal order.

**Correct fix:**

Store a richer pending object:

```ts
type PendingToolStatus = {
	status: 'completed' | 'failed';
	errorMessage?: string;
	toolResult?: Record<string, any>;
	rawToolName?: string;
	sideEffectsApplied?: boolean;
};
```

When the matching `tool_call` later arrives:

1. Update the activity status.
2. Resolve tool name and args from the newly created activity.
3. Apply toast/mutation/created-entity extraction exactly once.
4. Delete the pending entry.

**Tests to add:**

- Result-before-call eventually shows a completion toast with resolved args.
- Result-before-call records mutation exactly once.
- Duplicate result-before-call frames still apply side effects once after call arrival.

---

### P2 - Live Tool Detail Is Still Less Complete Than Restored Tool Detail

**Finding:** The previous live-sync audit found that history is built from persisted `chat_tool_executions`, while live tabs are built from in-memory thinking-block metadata. Some rich fields are persisted and restored, but not carried through the live metadata path.

Existing audit:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_LIVE_SYNC_AUDIT_2026-07-02.md`

**Correct fix:**

For live `tool_result` updates, carry the same fields the restored timeline expects:

- `streamRunId`
- `clientTurnId`
- `sequenceIndex`
- `toolCategory`
- `gatewayOp`
- `helpPath`
- `durationMs`
- `tokensConsumed`
- `resultCount`
- `zeroResult`
- `requiresUserAction`
- `streamEvents`, only if intentionally bounded/redacted

The inline thinking block should remain compact. Rich detail belongs in the Tools/Steps/Changes tab, but the live tab should have data parity with restored history.

**Tests to add:**

- A live thinking-block tool activity with telemetry maps to the same `AgentTimelineItem.tool` fields as a restored row.
- Search zero-result telemetry appears in live timeline summary without client re-deriving it from raw results.

---

### P3 - Clarification And Terminal Events Need Dedupe Rules Too

**Finding:** The handler appends clarification messages and activities whenever it receives `clarifying_questions`.

Relevant code:

- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:553-568`

There is no idempotency key, so reconnect/replay could duplicate supervisor questions in the chat.

**Correct fix:**

- Once stream envelope metadata exists, dedupe all event types by event key before event-specific handling.
- Until then, dedupe clarification by a stable content hash scoped to active stream.
- Do not decrement agent-to-agent remaining turns more than once per terminal event.

**Tests to add:**

- Duplicate clarification event appends one clarification message.
- Duplicate `done` event finalizes once and decrements agent-loop turns once.

---

## Proposed Implementation Plan

### Phase 1 - Backward-Compatible Client Safety

Files:

- `apps/web/src/lib/utils/sse-processor.ts`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.test.ts`
- `apps/web/src/lib/utils/sse-processor.test.ts`

Changes:

1. Add `treatErrorEventsAsProgress` to `SSEProcessorOptions`.
2. Enable that option in `AgentChatStreamController`.
3. Make `handleDone()` skip `createdEntitiesBuffer` flush for `error` and, preferably, `cancelled`.
4. Add per-handler stream state for tool-call/result dedupe using existing `tool_call.id` and `result.tool_call_id`.
5. Apply pending result side effects after a late call arrives.
6. Add tests for semantic errors, created-chip suppression, duplicate calls/results, and result-before-call side effects.

This phase does not require a server protocol migration.

### Phase 2 - Persistence-Backed Reconciliation

Files:

- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/agent-chat-session.ts`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`

Changes:

1. Preserve active turn identifiers on transport error/detach long enough to reconcile.
2. Add a modal hydration path that reloads the current session snapshot in the background.
3. Poll until the matching `stream_run_id`/`client_turn_id` turn is terminal.
4. Replace optimistic live state with persisted messages/timeline once terminal.
5. Keep explicit user stop separate from transport loss.

Acceptance checks:

- Transport failure after server accepted the request does not remove the user message or leave a failed assistant placeholder if persisted state later completes.
- Modal reopen restores full completed state.
- Stop/cancel remains user-visible as an intentional interruption.

### Phase 3 - Stream Envelope And Ordering

Files:

- `packages/shared-types/src/agent.types.ts`
- `apps/web/src/lib/utils/sse-response.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`

Changes:

1. Add optional shared metadata fields to `AgentSSEMessage`.
2. Add a server helper for all agent SSE emissions that attaches stream metadata.
3. Attach durable `turn_run_id` and `sequence_index` when available.
4. Optionally emit SSE `id:` using the same event identity.
5. Make the client reject stale stream/client turn ids and duplicate event keys.
6. Add development warnings for out-of-order or post-terminal events.

Acceptance checks:

- Replayed duplicate frames are no-ops.
- Previous-run frames cannot mutate the active modal.
- Restored timeline order and live event order are explainable from the same sequence.

### Phase 4 - Live/Restored Tool Timeline Parity

Files:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/agent-chat-timeline.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/components/agent/agent-chat-timeline.test.ts`

Changes:

1. Add missing telemetry to live `tool_result` payloads.
2. Store the telemetry in activity metadata.
3. Map live activity metadata into the same row shape used by restored timeline builder.
4. Keep large/raw stream detail redacted or bounded.

Acceptance checks:

- Live Tools/Steps/Changes tabs match restored history for result count, zero-result, duration, token, and user-action states.
- No client-only derivation forks backend telemetry logic.

---

## Verification Plan

### Current Tests To Run Before And After

From `apps/web`, use `pnpm exec` so Vitest receives the file filters directly:

```bash
pnpm exec vitest run src/lib/components/agent/agent-chat-sse-handler.test.ts src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts src/lib/utils/sse-processor.test.ts
```

The package script can also be used for full-suite confidence:

```bash
pnpm test:run
```

### Verification Performed For This Spec

This subsection records the original 2026-07-04 research baseline. For the current implemented-state verification, see "Implementation Update - 2026-07-05" above.

Run from `apps/web` on 2026-07-04:

```bash
pnpm exec vitest run src/lib/components/agent/agent-chat-sse-handler.test.ts src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts src/lib/utils/sse-processor.test.ts
```

Result: 3 files passed, 58 tests passed.

I also ran `pnpm test:run` accidentally through the package script while trying to filter by file. That executed the full web Vitest suite and passed: 313 files, 1,937 tests. This gives a clean baseline, but it does not verify the proposed fixes because no implementation changes were made in this pass.

### New Unit Tests

1. `SSEProcessor` routes semantic `type:'error'` frames to progress only when `treatErrorEventsAsProgress` is enabled.
2. `createSSEHandler()` handles semantic error frames and clears created-entity buffers.
3. `done(error)` does not emit created-entity chips.
4. Duplicate `tool_call` with the same id results in one visible activity.
5. Duplicate `tool_result` with the same id runs toast/mutation/created-entity side effects once.
6. Result-before-call later replays toast/mutation/created-entity extraction once with resolved args.
7. Duplicate clarification events append one clarification message.
8. Duplicate terminal events finalize and decrement agent-loop counters once.
9. Live tool telemetry maps to the same timeline fields as restored tool telemetry.

### Integration Tests

1. Mock stream emits `tool_result`, then disconnects before `done`; server snapshot later contains a completed turn. Modal reconciles to completed persisted state.
2. Mock stream emits a successful create result, then `done(error)`. Live UI does not show created chips; restored state remains source of truth.
3. Mock stream emits duplicated `tool_call` and `tool_result` frames. Timeline and mutation counts stay single.
4. Mock stream emits a previous `stream_run_id` after a new stream starts. Event is ignored.
5. Mock stream emits out-of-order result-before-call. Final activity, toast, and mutation output match normal order.

### Manual QA

1. Start a long agent turn with a tool mutation, then close the modal or navigate away before completion. Reopen the session and verify the completed assistant response and tool timeline appear.
2. Throttle the connection, interrupt the browser stream, and verify the UI enters a restoring state rather than a permanent failed state when the server completes.
3. Use explicit Stop and verify the result remains cancelled/interrupted instead of being reconciled as success.
4. Inject duplicate frames in a local test harness and verify no duplicate toasts, tools, changes, or created chips appear.
5. Run a search that returns zero results and verify live Tools/Steps display matches restored history.

---

## How To Know The Fix Improved The System

The implementation should be considered successful only if these invariants hold:

1. **At-most-once application:** applying the same event twice produces the same UI state as applying it once.
2. **Turn scoping:** an event from stream A cannot mutate stream B's UI state.
3. **Terminal stability:** once a turn reaches a terminal state, late non-terminal frames cannot reopen or rewrite it.
4. **Persistence convergence:** after transport loss, the live UI converges to the persisted turn state or shows a bounded reconciliation failure.
5. **Live/restored parity:** the live tool timeline and restored session timeline expose the same meaningful fields for the same execution.
6. **Explicit cancellation remains explicit:** user stop is not treated as an accidental disconnect.

These invariants can be checked with the new tests above. They are stronger than checking only that individual callbacks fire.

---

## Risks And Constraints

- Changing generic SSE error behavior would break existing consumers, so use an opt-in processor option for the agent stream.
- Polling session snapshots after every network error could create extra load. Scope polling to the active session and active turn, use backoff, and stop on terminal state or timeout.
- Some early events may be emitted before `turn_run_id` exists. Use `stream_run_id` plus a live sequence until durable turn metadata becomes available.
- Dedupe by `tool_call_id` assumes tool call ids are unique per stream. Scope keys by `stream_run_id` to avoid cross-turn collisions.
- Do not expose unbounded raw tool outputs in live metadata. Preserve previews/redaction for large result blobs.

---

## Recommended First Patch Set

The first patch set should stay small and prove the safety model:

1. Add `treatErrorEventsAsProgress` and wire it only into `AgentChatStreamController`.
2. Add created-chip suppression for `done(error)` and the chosen cancellation policy.
3. Add tool-call/result dedupe keyed by active stream and tool-call id.
4. Fix result-before-call side-effect replay.
5. Add the unit tests for those four behaviors.

That patch will immediately reduce divergence and duplicate UI effects without requiring DB or server protocol changes. The next patch should add reconciliation, then the stream envelope.
