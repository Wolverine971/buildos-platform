<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_1_REALTIME_INBOX_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2D Slice 1 — Private Channel and Reconciliation Inbox Plan

**Date:** 2026-08-02

**Status:** Local implementation and review complete. The Slice 4 hosted policy and Slice 5 hosted reconciliation RPC/type gates are verified. Phase 2D Slice 2 has since mounted this channel/inbox behind an authenticated, handle-free coordinator; worker routing remains disabled pending the remaining Phase 2D API, lease, adapter, consumer, and exit-matrix work.

## Objective

Build the transport-neutral browser machinery that can receive the private per-user Broadcast stream, track only explicitly registered worker turns, buffer bounded live events while durable reconciliation is in flight, and apply a reconciled watermark without skipping sequence gaps.

## Locked scope

- Move the two Realtime Broadcast event names and reconcile-hint payload into the shared worker contract so worker and browser cannot drift.
- Add one private-channel lifecycle for exact topic `chat-user:<user_id>` with observable `idle | connecting | subscribed | unavailable | closed` state.
- Rely on the installed Supabase client's auth-token propagation and channel rejoin behavior; do not create a second auth client or manual token-refresh loop.
- Track only explicit `worker_realtime` handles. Events for another tab, session, or unregistered turn are ignored.
- Begin every registered turn in reconciliation/buffering mode so no live event can be applied ahead of durable baseline truth.
- Apply same-generation live events only at `last_applied_sequence + 1`; ignore duplicates/stale generations and request reconciliation on gaps or future generations.
- Buffer live events during reconciliation with hard per-turn bounds of 128 events and 1 MiB. Overflow drops acceleration data, never durable truth, and forces another reconciliation.
- Apply the reconciled snapshot first, adopt its response watermark, then apply only contiguous buffered events newer than that watermark. A remaining gap requests another reconciliation and does not advance over the gap.
- A channel error/reconnect requests reconciliation for registered turns because Realtime is only an acceleration path.
- Preserve the existing legacy SSE controller and session-snapshot reconciliation unchanged.
- Do not mount the channel, call the reconciliation endpoint, admit/cancel a worker turn, register a queue consumer, invoke a provider/model, or enable worker routing in this slice.

## Required proof

- Exact private topic/configuration and both shared Broadcast event names are registered once.
- Repeated same-user connection is idempotent; close removes the exact channel and ignores late callbacks.
- Unregistered and cross-scope events cannot reach a turn observer.
- Registration requests an initial reconciliation before live application.
- Duplicate and stale events are ignored; contiguous events apply once; gaps and future generations buffer and request one reconciliation.
- Reconciliation applies snapshot truth before post-watermark buffered events.
- Buffered duplicates are removed, ordering is deterministic, and no event beyond a gap is applied.
- Event/byte overflow stays bounded and forces a second durable reconciliation.
- Reconcile hints and channel reconnects converge through the same request boundary.
- No production component imports or constructs the new channel yet.

## Local implementation result

Completed locally on 2026-08-02:

- centralized `agent-stream-event`, `agent-stream-reconcile`, and the reconcile-hint payload in the shared worker contract;
- changed the existing worker publisher to consume those shared names without changing its wire payload or behavior;
- added `AgenticChatWorkerRealtimeChannel`, which opens only `private: true` `chat-user:<canonical UUID>`, registers no send method, exposes channel status, distinguishes library-managed transient rejoin from terminal `CLOSED`, and bounds terminal-close replacement to one channel-level retry timer;
- added `AgenticChatWorkerRealtimeInbox`, capped at eight tracked turns and 128 events / 1 MiB per turn;
- made explicit worker-handle registration enter buffering mode and request durable baseline truth before applying any live event;
- enforced exact handle scope, deterministic event identity, current generation, duplicate suppression, and contiguous live sequence application;
- applied reconciled snapshot truth before post-watermark buffered events and preserved all events at/after the first remaining gap for another reconciliation;
- treated buffer overflow as loss of acceleration data only and forced another durable reconciliation; and
- left all production Svelte components, admission, cancellation, polling, queue registration, feature flags, and routing unchanged.

Implementation and proof:

- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`
- `apps/worker/src/workers/agentic-chat/streamPublisher.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts`

Validation:

- focused private-channel/inbox suite: 2 files / 15 tests;
- complete `agentic-chat-v2` suite: 91 files / 762 tests;
- complete worker suite: 69 files / 586 tests, plus typecheck;
- shared-types suite: 2 files / 24 tests, plus typecheck/build;
- web `svelte-check`: 0 errors / 0 warnings;
- Svelte analyzer on the intended stream-controller integration boundary: zero issues; one unrelated pre-existing `Date`-to-`SvelteDate` suggestion was intentionally left outside this slice.

No migration or hosted mutation belongs to this slice. At this slice's completion the channel and inbox had no production construction/import site. Phase 2D Slice 2 has since mounted them without registering a worker handle or changing Send/cancel selection, so legacy SSE behavior remains unchanged.

## Routing gate

This slice is necessary but not sufficient for routing. The Slice 4 policy and Slice 5 RPC/type hosted gates are closed, and Phase 2D Slice 2 now mounts the channel plus reconciliation coordinator. Before a worker lease can be selected, worker admission/discovery/cancel routes, server-authoritative transport leases, and the worker event-to-UI adapter must exist, and the inert consumer/fake-provider Phase 2 exit matrix must pass. Real asynchronous provider execution remains a Phase 3 decision.
