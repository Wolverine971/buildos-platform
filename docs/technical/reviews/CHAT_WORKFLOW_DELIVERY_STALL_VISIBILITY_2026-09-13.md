<!-- docs/technical/reviews/CHAT_WORKFLOW_DELIVERY_STALL_VISIBILITY_2026-09-13.md -->

# Agentic Chat delivery boundary and stall visibility — 2026-09-13

Status: **ready for integration** with Tasker 82. Not accepted until the combined
82/84 three-repetition gate passes and the delivery tail is re-measured on it.
Owner package: [Tasker 84](../../../tasker/84-chat-workflow-delivery-and-stall-visibility.md).

## Outcome

Semantic work (context loading, provider calls, tools) continues once progress is
**durably accepted**. Realtime subscription, Broadcast, and acknowledgement no
longer sit on that path. Operators can tell a queued turn, a long provider call,
delayed or disconnected delivery, and a turn that has stopped saving progress apart
from one another, without prompt contents.

## Accepted versus delivered

`appendText()` and `enqueueSemantic()` return two independent promises.

| Promise    | Resolves when                                                                                                                                                                  | Rejects when                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `accepted` | Postgres returned `persisted` or `already_persisted` for this turn, queue job, execution generation, and exactly the next durable sequence.                                    | Persistence error, `stale_generation`/ownership loss, sequence gap, overload, abandon, or shutdown drain. |
| `delivery` | The ordered live-delivery decision for that accepted event: `broadcast_acknowledged`, `broadcast_sent_reconcile_pending`, `reconcile_only`, `already_persisted`, or `blocked`. | Same blocking conditions. A lost ACK or failed Broadcast never rejects accepted work.                     |

Executor lifecycle publication awaits `accepted` only (plus `pressureRelieved`
under soft pressure). `flushTurn()` remains the delivery and terminal fence.
`publishSemantic()` is kept as a compatibility wrapper that awaits `delivery`.

## Ordering, acknowledgement, and uncertainty

- Persistence stays FIFO per turn, and persist-before-broadcast is unchanged. Delivery is
  a second FIFO per turn that holds accepted receipts only.
- A delivery run broadcasts consecutive accepted events in order, then sends one
  **exact-sequence ACK** for the last one. `acknowledge_agentic_chat_stream_delivery`
  clears reconciliation only for the current `snapshot_sequence`, so an ACK for an
  older event after later work is saved is necessarily refused (`newer_snapshot`).
- `newer_snapshot` caused by this turn's own later write is **not sticky**. The
  write is accounted for by the publisher's durable sequence, an in-flight
  persistence, or a pending retry, and the next run carries the exact ACK.
- Sticky uncertainty is preserved for a failed Broadcast, a thrown or lost ACK, and a
  newer sequence the publisher cannot account for. After that the turn is
  reconcile-only and no later ACK can erase it.
- A stale generation blocks the turn without Broadcast or ACK. Receipt scope and sequence
  checks are unchanged.
- The slot ownership token (`deliveryTask`) prevents a finished run's cleanup from
  releasing a slot that a newer run for the same turn already owns. This closes a
  duplicate Broadcast/ACK race seen in the first 84 draft.

## Terminal path

- There is still one terminal writer (`finalize_agentic_chat_turn_with_terminal_events`)
  and terminal queue reconciliation. Finalization still requires a drained write slot;
  the pre-finalization drain is bounded by the executor's overhead deadline.
- The finalize transaction commits `last_turn_context`, `timing`, and `done` together.
  `publishCommittedSemantic(..., { committedThroughSequence })` Broadcasts the
  prefix events without their doomed ACKs, and `publishTerminal` sends the exact ACK
  for `done`.
- The invariant "no live `done` unless the committed prefix was delivered" is
  unchanged. Clients still reconcile when a prefix Broadcast genuinely fails.

## Backpressure and memory

- Accepted-but-undelivered events count toward the same per-turn and worker soft and hard
  limits. Soft pressure applies backpressure through `pressureRelieved`, and the hard limit
  is a typed overload. A delivery run is capped at `turnPendingSoftEvents`.
- A blocked or abandoned turn settles its pressure waiters immediately. Before this,
  a waiter could hang until the turn deadline once worker-wide pressure stayed high.
- Shutdown drain expiry rejects every acceptance and delivery waiter and zeroes
  accounting. Broadcast send and subscription both have deadlines. Close listeners
  are now per attempt and released on settlement, which fixes unbounded closure
  retention on long-lived workers.
- Reconnect recovers from persisted events through the existing reconcile RPC, never
  from the in-memory queue.

## Root cause of the post-84 delivery tail

A parallel stabilization check measured `terminalEventMs − responseHeadersMs −
serverTiming.phases.total_request_ms`. The median rose from 0.5 s before 84
(`output/agentic-gate/djflow-subscription-race-2026-09-12`) to 2.0–2.2 s in every
post-84 run, with server and provider time unchanged. That extra time pushed Case 8 over
its ceiling.

Mechanism: the first 84 draft let later events persist before an older ACK. The real
SQL returned `newer_snapshot`, and the publisher treated it as sticky uncertainty.
Streams then fell to throttled reconcile hints. The committed terminal prefix hit the
same refusal: the prefix was considered undelivered, so `done` was not broadcast and
the browser waited for its 2 s / 5 s reconciliation watchdog. Both test fakes
acknowledged any sequence, which hid this. The fakes now mirror the SQL contract.
**The tail must be re-measured on the combined gate.** A value near 2 s means the fix did
not take.

## Per-turn progress health

`/health` → `agenticChat.runtime.progress` (`agentic_chat_turn_progress_health_v1`) lists the
turns this worker holds. The list is bounded to 64, and invalid entries are omitted rather
than thrown.

| Field                     | Source                                                                 | Authority                                                   |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `durableProgress`         | Commit time and event type from the last accepted publisher receipt    | Database time; event type only                              |
| `providerActivity`        | Provider attempt start/end, recorded before the durable observation    | `worker_memory` hint                                        |
| `delivery`                | Sticky publisher state, pending count, oldest accepted-undelivered age | `worker_memory` hint                                        |
| `executionState`, `stall` | Pure projection                                                        | Stalled only when no bounded provider call explains silence |

- A long provider call younger than the provider budget (300 s default) is
  `provider_active`, not stalled. A turn is `stalled` when no durable progress arrives
  within the stall timeout (420 s) and no bounded call explains it.
- Disconnected or delayed delivery never marks computation stalled.
- Stalled turns are **reported, not treated as process unhealthiness**. A restart cannot
  repair them and would interrupt healthy turns.
- Clock skew between database and worker is clamped. The projection does not throw on it.
- No poll heartbeat or per-read database write was added.

UI fixtures for Tasker 88 are in
`apps/worker/tests/fixtures/agentic-chat-turn-progress-health.v1.json`, generated from
the real projection and guarded by `agenticChatTurnProgressHealthFixtures.test.ts`.
They cover queued, preparing, long provider call, delivery disconnected, delivery
delayed, stalled, and completed.

## Timing inspectability

- `agentic_chat_runtime_timing` is now one JSON line. Nested spans previously rendered as
  `[Object]`. A new `publisherDeliveryLag` aggregate measures durable acceptance to live
  delivery decision. Spans are log-only and are not in the persisted timing draft.
- `agentic_chat_mutation_span` JSON lines time `effect_reserve`, `effect_begin`,
  `mutation_adapter`, and `effect_reconcile` with finished or failed state. They carry
  identifiers and durations only, and a throwing sink cannot change the effect outcome.

## Requests to 85 (contract owner)

The browser cannot see worker memory. A durable, browser-facing projection needs these
fields added to the reconcile snapshot, **with no new writes**:

1. `chat_turn_runs.last_progress_at`, already stamped by write, ledger, claim, and terminal
   RPCs. Confirm the `20260806020000` text-flush redefinition still stamps it.
2. A bounded current-generation provider activity summary: open attempt count and the latest
   start time from `agentic_chat_execution_observations`. Observation writes are best
   effort, so a missing end row must not be read as "finished".
3. Keep `reconcile_required` and `updated_at` as they are. `updated_at` also moves on
   ACK and is **not** semantic progress.

## Handoff to 88

- `worker-realtime-runtime` exposes the socket `onStatus`/`status`, but
  `AgentChatModal.svelte` does not pass `onStatus`, so the UI cannot show
  **Reconnecting** today.
- Map `delivery.state = disconnected` or `delivery.delayed` to delivery copy, never to
  failed execution.

## Residuals

- The mutation receipt-persistence span (`persistMutation`) is not yet split out. The
  mutation lane has no `job` handle, so it needs a small executor port through the
  coordinator lock.
- A genuinely failed prefix Broadcast still leaves `done` to reconciliation, bounded by
  the client watchdog.
- For 82: `validateExactDocumentLiterals` rejects explicit requests for HTML-escaped
  output. It is bounded by validation-repair rounds but can silently skip the write.
- Tasker 61 fleet capacity is unchanged. This work covers per-turn health only.

## Validation

Focused runs used `test-gate`, serially, on 2026-09-13:

- 230/230 across 13 worker files: publisher and adapters (30), turn executor (89),
  composition root (12), runtime timing (5), delivery health (13), UI fixtures (2),
  mutation spans (3), mutation executor (11), bootstrap (27), chat worker service (4),
  consumer (18), and capacity (16).
- `pnpm --filter @buildos/worker typecheck` passes. `typecheck:tests` is 0/0 against the
  baseline.
- The executor suite first failed 11/89 once the fake followed the real exact-sequence ACK
  contract (terminal `timing`/`done` never broadcast). It passes after the
  `committedThroughSequence` fix. This is the deterministic reproduction of the tail.
- New fault coverage:
    - durable acceptance before a delayed Broadcast or ACK
    - own-write ACK supersession stays live
    - foreign newer snapshot stays sticky
    - persistence rejection and stale generation never accept
    - abandon after acceptance settles delivery
    - bounded backlog and shutdown drain expiry
    - close listeners released
    - pressure waiters settle on block

### Combined 82/84 gate — FAILED (one latency ceiling)

`output/agentic-gate/chat-workflow-82-84-combined-2026-09-13/` ran 2026-09-13 03:55–04:15 UTC:
three repetitions, verified worker provenance
(`c32476225` + dirty-tree `7b722d99…`), not diagnostic.

- **Behavior 52/52 (grade A).** All 45 turns are `end_to_end_pass`.
- **Only failure:** Case 8, repetition 2, at 34.8 s against the 30 s ceiling. Case 8's other
  repetitions took 22.3 s and 17.4 s.
- **Other ceilings passed:** Case 2 at most 48.8 s (limit 60 s); Case 4 update at most
  19.4 s (limit 30 s); Case 14 at most 23.0 s (limit 40 s) with at most 7 tool calls.
- **Delivery tail fixed:** measured as `terminalEventMs − responseHeadersMs −
total_request_ms` over 45 turns.

                    | Run                      | Median    | p90        | Max        |
                    | ------------------------ | --------- | ---------- | ---------- |
                    | Pre-84                   | 480 ms    | 922 ms     | 3.7 s      |
                    | Post-84, before this fix | 1,951 ms  | 2,417 ms   | 13.3 s     |
                    | **This run**             | **81 ms** | **387 ms** | **872 ms** |

**Case 8 rep 2 attribution.** The same four model passes and three tool calls ran, all
on the same provider. Server total was 32.1 s, of which provider authority to finish was
29.5 s. Worker overhead stayed small: worker start to authority 0.5 s, finish to terminal
0.85 s, delivery tail 16 ms. Tool rounds took 1.3 s, 0.7 s, and 2.7 s. Mutation spans took
reserve 0.17 s, begin 0.15 s, adapter 1.67 s, and reconcile 0.20 s.

The extra time sat between reviewer completion and the final acting pass: 14.5 s,
against 3.2 s in rep 1.

- The reviewer network call itself took 3.6 s, but the semantic-review span was 8.4 s
  (rep 1: 4.4 s).
- `publisherQueueing` shows one event waiting **6.1 s** from enqueue to durable
  receipt (rep 1 max: 0.33 s).
- The final pass had a prompt-cache miss (4,324 cached tokens against 13,568) and took
  2.7 s against 1.3 s.

Retained artifacts do not include per-event commit times or publisher retry metrics,
so this run cannot separate database latency from a persistence retry in the 6 s wait.
Case 8 was already near its ceiling before this change set: 28.7 s, 30.5 s, 30.3 s, and
34.4 s repetitions appear in the 09-13 stabilization and diagnostic runs.

**Next diagnostic (not yet done):** log the publisher's `persistence_retry` and
`soft_pressure` metrics, then read `chat_turn_events.created_at` for that turn from the
isolated database. Never rerun the product turn to improve the score.

### Investigation follow-up — September 13

The isolated-database read and provider-boundary review are now complete in
[Case 8 latency investigation](CHAT_WORKFLOW_CASE8_LATENCY_INVESTIGATION_2026-09-13.md).
The slow publication is sequence 8, a generic “Working…” event. The model client
also waits for usage accounting before releasing the reviewer result; that is the
first proposed repair, with an explicit usage drain before billing. Detached
reviewer observation persistence was delayed too, so the original database-versus-
retry question is not fully resolved by row timestamps alone.

The follow-up also corrects the delivery measurement: the 81 ms median above is a
residual with overlapping intervals subtracted. A wall-clock estimate is about
406 ms median and 373 ms for failed Case 8, subject to clock skew. The final model
request retained its prior prompt prefix and had partial cache reuse, so cache
warming is not the recommended first fix. Runtime fixes remain proposed; the
combined gate remains failed.
