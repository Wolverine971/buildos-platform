<!-- tasker/84-chat-workflow-delivery-and-stall-visibility.md -->

# 84 — Separate durable progress from slow delivery and expose stalled turns

**Created:** 2026-09-12  
**Status:** No repair gate accepted. The September 14 isolated run scored **45/52**, with Case 8 r3 at 34.521s and Case 9/10/14 content/quality failures. The Case 8 miss contains a slow-stream abort plus V4 fallback; its publisher requests peaked at 404ms with no persistence retries. Cases 2/4 and Case 14 time/read limits pass; startup/final provenance match. See [Task 90 closeout](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md).

**September 14 validation:** The provider/reviewer repairs passed 392 focused tests, worker source/test types, and changed-runtime lint. DJ then authorized one full gate; it failed and was classified without an unchanged rerun. See the [complete receipt and next repairs](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md). Earlier scorecards remain preserved.

**Task 90 closeout:** The subsequent batch fixed event identity with queued text
and recovery-policy coverage; 371 distinct focused worker tests passed. Case 8
passed all three repetitions in each focused diagnostic. The latest run did not
exercise its recovery path, so these passes do not prove recovery improved latency.
DJ closed Task 90 and deferred calendar work; 89 retains full acceptance, and 83
may proceed under 81's updated sequencing decision. See the
[phase 2 evidence](../docs/technical/reviews/CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md).

**Depends on:** [81](81-chat-workflow-implementation-program.md) ownership and evidence handoff.  
**Parallel with:** 82 correctness repairs; 85 interface design.  
**Integration:** One stabilization change set with 82; later tasks consume this boundary.

## Outcome and existing fix

A slow or disconnected Realtime subscriber must not hold up context loading or
model computation after progress has been durably accepted. Operators and the UI
can distinguish a queued turn, active computation, delayed delivery, and a turn
that has stopped making progress.

The reproduced subscription race already has a fix: one in-flight opening promise
per topic plus a bounded callback wait. Preserve its installed-SDK regression tests.
The remaining issue is architectural: executor lifecycle publication still awaits
subscription, broadcast, and acknowledgement. Read the
[startup-stall report](../docs/technical/reviews/DJFLOW_STARTUP_STALL_2026-09-12.md)
and `output/agentic-gate/djflow-timing-profile-2026-09-12/timing-analysis.json`.
The diagnostic counted 63/75 tagged REST calls in two turns; those counts alone do
not prove the critical path or justify deleting acknowledgements.

## Work

1. Trace persistence, sequence allocation, broadcast, ACK, reconciliation, terminal
   drain, and close. Specify which return value means **durably accepted** and
   which means **delivered** before changing any caller.
2. Introduce the smallest ordered delivery pump/adapter boundary that lets semantic
   computation proceed after confirmed durable acceptance. Reuse existing batching
   and reconciliation. Bound pending memory and apply backpressure; reconnect must
   recover from persisted events rather than depending on an in-memory queue.
3. Preserve persist-before-broadcast, exact-sequence ACK, stale-owner fencing,
   monotonic ordering, sticky delivery uncertainty, and a bounded terminal drain.
   A lost ACK cannot mean unsaved work; a failed persistence cannot mean acceptance.
   Do not implement this as unchecked fire-and-forget promises or ACK deletion.
4. Preserve one terminal writer and terminal reconciliation. An accepted terminal
   state can outlive a failed broadcast, but the delivery state must remain truthful.
   Avoid parallel persistence that changes established event/text ordering.
5. Record separate last durable progress, execution phase, provider activity and
   delivery state/age using existing observations where possible. A fresh queue
   poll or socket subscription is not evidence that a particular turn is advancing.
   In-memory metrics must be labeled as such and not used as recovery authority.
6. Expose a bounded, privacy-safe progress/stall projection for 88. Distinguish queue
   delay, long provider work and disconnected delivery; avoid a busy heartbeat that
   resets semantic progress age or adds a database write on every poll. Coordinate
   new fields with 85; provide fixtures that the UI owner can consume.

## Ownership and parallel boundary

Own `apps/worker/src/workers/agentic-chat/stream/stream-publisher.ts`,
`supabaseStreamPublisherAdapters.ts`, their tests, and narrow existing health/observation
adapters. 82 owns ordinary prompts/review fixes. Coordinate executor/composition
wiring through 81. Use existing durable event/stream state for stabilization. If
the reproduction proves a small SQL correction is essential, 85 owns that correction
inside the 82/84 repair change set; do not wait for the later workflow schema package
or pull its new tables into stabilization. 61 retains fleet-capacity work; this is
per-turn progress health.

Do not replace Realtime, rewrite the effect ledger, loosen tool authorization,
change ordinary recovery eligibility, or build a new generic event bus.

## Acceptance

- With subscription/broadcast/ACK deliberately delayed or absent, confirmed durable
  progress permits context/model work within a bounded test deadline.
- Persistence errors prevent acceptance; a stale generation cannot persist, publish
  authoritative new work, or advance an ACK owned by its replacement.
- Reconnect after dropped/out-of-order/duplicate messages restores the same ordered
  text/progress and exactly one terminal answer. Lost terminal responses reconcile.
- Pending memory stays bounded under a slow client; close/cancel settles all waits.
- Existing silent-callback, concurrent subscribe, late success, retry and close
  tests remain green. Add deterministic fault coverage at the new boundary.
- A deliberately stalled turn is distinguishable from a healthy long provider call
  and a queued turn without leaking prompt contents or claiming computation stopped
  merely because delivery disconnected.

Start with `test-gate run pnpm --filter @buildos/worker exec vitest run
tests/agenticChatStreamPublisher.test.ts tests/agenticChatTurnExecutor.test.ts`.
Run the narrow health/projection tests and worker typecheck as needed, serially.
The coordinator runs the complete gate with 82 and preserves before/after phase
timings on the same fixture. Report measured critical-path changes without promising
a subsecond response. Task is accepted only with fault proof and a passing full gate.

## 82 latency handoff — 2026-09-13

Retained Case 14 repetition 1 measured 49,959.8 ms at the client and 44,788.2 ms
from server admission through terminal commit. Provider authority through finish
accounted for 40,580.5 ms; worker start to authority was 1,460 ms and provider
finish to terminal-call start was 1,356.1 ms. The first four-read round already
covered the missing marketing, permit, invoice/payment/spend, and construction
facts. Rounds two and three added seven unnecessary reads; 82 now directs the
model to stop by evidence coverage.

The first round's execution graph had a 3,387 ms critical path despite a 12,044 ms
sum of concurrent call durations (8,657 ms parallel savings). Do not treat that
sum as elapsed time. Retained logs expose `read_op`, `ledger_persist`, and
`tool_result_publish`, while `agentic_chat_runtime_timing` collapses the detailed
provider, durable-acknowledgement, publisher-delivery, and drain span payloads to
`[Object]`. Mutation traces likewise do not retain separately inspectable effect
reserve/begin, adapter, reconciliation, receipt-persistence, and delivery spans.
Make those structured spans inspectable before using them to move or remove an
await boundary. Full evidence is in
`docs/technical/reviews/CHAT_WORKFLOW_REGRESSION_REPAIRS_2026-09-13.md`.
