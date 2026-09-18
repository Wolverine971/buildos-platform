<!-- docs/technical/reviews/CHAT_WORKFLOW_DELIVERY_STABILIZATION_2026-09-13.md -->

# Chat workflow delivery stabilization

**Date:** 2026-09-13  
**Package:** Tasker 84 in the Tasker 81 stabilization change set  
**Status:** Focused fault proof passes; full stabilization gate remains open

## Result

Persistence acceptance and live delivery now have separate promises and separate
ordered pumps. Context loading and provider execution may continue after a scoped,
generation-fenced Postgres receipt, while Broadcast and acknowledgement finish in
the background. The terminal lane still joins both pumps with a bounded drain.

This is not fire-and-forget delivery. Accepted-but-undelivered events remain in the
publisher's existing byte/event pressure accounting. Failed persistence never
resolves acceptance. Abandon, stale ownership, hard overload, and shutdown settle
all waiters.

## Contract

`enqueueSemantic()` and `appendText()` return three independent observations:

1. `accepted`: resolves only after the persistence adapter returns `persisted` or
   the exact transition returns `already_persisted` for the claimed turn and
   execution generation at the next durable sequence.
2. `delivery`: resolves after Broadcast/ACK or with an explicit reconciliation
   outcome.
3. `pressureRelieved`: exists only at the soft bound and is the bounded
   backpressure await used by semantic execution.

The publisher snapshot separates pending persistence from pending delivery and
exposes whether a persistence retry is scheduled. `flushTurn()` waits until the
specific turn is actually idle, including delivery-task cleanup; this closes the
microtask race where a delivery promise could settle one tick before
`deliveryBusy` cleared and terminalization incorrectly abandoned the turn.

## Ordered delivery decision

The existing acknowledgement RPC intentionally returns `newer_snapshot` if event
A is acknowledged after event B has already advanced the durable snapshot. That
is expected once persistence can run ahead of delivery. The accepted behavior is:

- A was already persisted and Broadcast before its ACK was attempted.
- `newer_snapshot` makes delivery uncertainty sticky and returns
  `broadcast_sent_reconcile_pending` for A.
- B and later events use the existing reconcile path/hints instead of claiming
  individual live delivery.
- Reconnect restores the authoritative ordered snapshot from Postgres.

This preserves persist-before-Broadcast, sequence monotonicity, and exact replay.
It deliberately does not promise that every event durably accepted ahead of an
older ACK will also receive an individual Broadcast.

## Health projection

`deliveryHealth.ts` provides a bounded, privacy-safe v1 projection with:

- durable progress time and age, explicitly sourced from the database;
- queue age and execution phase;
- provider state/time and delivery state/time, explicitly labeled worker-memory
  observations;
- distinct queued, active, bounded-provider-active, stalled, and terminal states.

A disconnected subscriber does not mark computation stalled. A healthy provider
observation suppresses the stalled classification only within its configured
provider deadline. Socket subscriptions and queue polls do not advance semantic
progress.

This projection is worker-local. Durable/shared exposure remains a Tasker 85/88
consumer decision and is not recovery authority.

## Deterministic evidence

The integrated publisher, executor, and health suite passes 122/122:

```text
pnpm --filter @buildos/worker exec vitest run \
  tests/agenticChatStreamPublisher.test.ts \
  tests/agenticChatTurnExecutor.test.ts \
  tests/agenticChatDeliveryHealth.test.ts

3 files passed; 122 tests passed
```

The fault tests prove:

- provider work begins after the acknowledged/session/context semantic events are
  durably accepted while the first Broadcast is still gated;
- event B is durably accepted while A's Broadcast/ACK remains gated, and the real
  `newer_snapshot` outcome converges through reconciliation;
- permanent persistence rejection and stale generation reject both acceptance and
  delivery without Broadcast or ACK;
- accepted delivery backlog is bounded and shutdown/abandon settles it;
- silent subscription, silent send, concurrent subscription, late success, retry,
  and close all remain bounded;
- queued, active provider, stalled durable progress, disconnected delivery, and
  terminal states remain distinguishable.

Focused type evidence also passes:

```text
@buildos/worker typecheck: passed
@buildos/worker typecheck:tests: 0/0 debt
```

## Full-gate status

The first integrated Tasker 82/84 gate is retained at
`output/agentic-gate/chat-workflow-stabilization-2026-09-13/`. It is a failed run,
not acceptance:

- 13 cases and three repetitions executed; score 49/52.
- Case 8 had one post-turn evidence-capture `fetch failed` and one 504.2-second
  client duration. Its third repetition was admitted about eight minutes after
  request start, then completed the server/model path in about 19.5 seconds.
- Case 10 had one 3/5 answer that swapped user- and project-scope calendar source
  attribution.
- The checkout provenance changed during the battery because only the generated
  timestamp in `packages/shared-types/src/database.schema.ts` was rewritten. Web
  and worker both started from the expected hash, but the mandatory final checkout
  hash differed.

The calendar result now carries an explicit normalized `query_scope`, backed by
focused shared-runtime, worker-port, prompt, and prompt-budget tests. Another full
gate with a stable source tree is required before Tasker 84 or the stabilization
change set is accepted. No Tasker 83 runtime work may integrate before that pass.
Superseded on 2026-09-14: DJ's Task 90 closeout let 83 proceed on the recorded
baseline. 83 has since closed, and Tasker 89 holds its gate debt. See the
[Task 83 receipt](CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).

The follow-up three-repetition Case 10 diagnostic scored 4/4 with three
end-to-end passes in 20.6–25.4 seconds and matching source provenance. It is
retained at `output/agentic-gate/chat-workflow-case10-diagnostic-2026-09-13/`.
As an explicitly narrowed diagnostic it exits failed and is not a substitute for
the complete gate.
