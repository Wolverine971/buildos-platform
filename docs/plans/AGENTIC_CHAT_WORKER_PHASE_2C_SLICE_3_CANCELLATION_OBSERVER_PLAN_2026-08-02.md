<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_3_CANCELLATION_OBSERVER_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2C Slice 3 — Batched Cancellation Observer Plan

**Date:** 2026-08-02

**Status:** Implemented, applied, and hosted-verified through exact receipt `20260802035000`. Generated database types/schema are refreshed; queue-consumer registration and worker routing remain intentionally deferred.

## Objective

Add the durable worker-side cancellation observation boundary without introducing a real Agentic Chat consumer. One worker-level loop must observe cancellation for all locally registered current generations through one bounded RPC per interval, then fan exact results out to local `AbortController`s.

## Locked scope

- One service-only `observe_agentic_chat_turn_cancellations(jsonb)` RPC.
- At most 128 unique `(turn_run_id, execution_generation)` pairs per call.
- One deterministic turn-lock pass per call, ordered by turn id, so the returned cancellation set is generation-consistent with concurrent claim, cancel, and terminal transactions.
- Return only accepted cancellations for still-running, current-generation worker turns.
- Stale generations, unknown turns, uncancelled turns, and terminal turns return no row.
- Atomically record the signal's first `consumed_at` / `consumed_by_generation` receipt while continuing to return the durable cancellation on later identical polls. A lost RPC response must never hide an accepted cancellation.
- One worker-level 500 ms observation loop with no per-turn timers, queries, or promise fan-out.
- Exact-generation local registration, idempotent same-generation registration, bounded active capacity, non-overlapping polls, safe mixed-result fan-out, and retry on the next interval after a failed poll.
- A dependency-injected observation port and fake-clock-compatible single timer so the package is deterministic and remains unregistered.

## Database contract

Migration `20260802035000_agentic_chat_worker_cancel_observation.sql` adds:

```sql
public.observe_agentic_chat_turn_cancellations(p_turns jsonb) -> jsonb
```

The RPC accepts only an array of objects containing exactly `turn_run_id` and a positive integer `execution_generation`. Duplicate turn ids, malformed identities, and inputs above 128 pairs fail closed. It preserves the established turn-first lock order by locking matching current-generation turn rows in UUID order before validating or consuming their signal rows.

For each returned row, the turn must still be `worker_realtime`, `running`, and current for the requested generation; `cancel_requested_at` and the corresponding immutable signal must agree on scope, reason, and timestamp. Missing or contradictory durable signal state raises an integrity error instead of silently withholding cancellation.

## Worker contract

`AgenticChatCancellationObserver` owns one map from turn id to the exact registered generation and its `AbortController`.

- `registerTurn` refuses capacity overflow or a conflicting generation and returns the generation's signal.
- `pollNow` submits all non-aborted registrations in one call; it never chunks a single interval into multiple RPCs.
- Exact current results abort only their matching controller with a typed `AgenticChatCancellationError` carrying signal identity, reason, source, and timestamps.
- Unknown, duplicate, or mismatched response rows never abort another generation and are reported as invalid receipts.
- An RPC failure leaves controllers untouched and is retried by the next interval.
- An in-flight poll prevents interval overlap.
- `unregisterTurn(turnId, generation)` cannot remove a newer generation accidentally.
- Startup validation requires the configured RPC bound to be at least worker consumer concurrency and never above the database limit of 128.
- `stop` is idempotent, clears the single timer, and waits at most two seconds for the current poll without creating cancellation or terminal state itself.

## Required proof

- Service role succeeds; anonymous, authenticated, and signed-definer authenticated calls are denied.
- Empty input returns an empty array; malformed, duplicate, and over-bound input fails closed.
- A mixed batch returns only current-generation accepted cancellation rows.
- First observation records signal consumption for the exact current generation; replay returns the same durable cancellation without changing the receipt.
- Concurrent cancellation cannot produce a mixed or missed committed state: either the current poll precedes it and the next poll sees it, or the current poll sees it.
- Missing or mismatched signal state fails closed.
- Package-only migration rollback restores the prior schema.
- Multiple local turns use one RPC call per interval and exact-generation fan-out.
- A failed interval retries without aborting; an overlapping interval does not create a second query.
- Capacity, conflicting-generation registration, invalid response scope, idempotent registration/unregistration, and a stuck-RPC shutdown bound are covered.

## Local implementation result

Completed locally on 2026-08-02:

- added service-only `observe_agentic_chat_turn_cancellations(jsonb)`, with exact object-shape validation, positive integral generation validation, a hard 128-pair bound, duplicate-turn rejection, and deterministic current-generation turn locking;
- added idempotent first-consumption receipts while preserving replay visibility, so a lost successful response never hides an accepted durable cancellation;
- added fail-closed signal integrity checks and mixed-batch filtering for stale, unknown, uncancelled, and terminal turns;
- added genuine two-connection proof that an observer racing a cancellation transaction waits for complete committed turn/signal truth;
- added `AgenticChatCancellationObserver`, which owns one 500 ms worker timer, one exact-generation controller map, one non-overlapping batch RPC, bounded registration, safe response validation, retry-on-next-interval behavior, and idempotent shutdown;
- added the Supabase RPC adapter, typed cancellation error/receipts, and locked shared operating-value constants;
- kept the package unregistered: no queue processor, provider/model call, combined execution signal, terminal finalizer wiring, Realtime notification listener, feature-flag change, or user-visible route exists.

Migration SHA-256:

- `20260802035000`: `e547916267396c87160018af8d34863c1e887ab11c0f5252d9a2e9763ef1ec8d`

Validation:

- focused cancellation observer/adapter: 11/11;
- complete worker suite: 69 files / 586 tests, with the opt-in Phase A workflow evaluation still skipped;
- worker typecheck/build: passed;
- worker lint/guardrails: passed; the two new source files have zero lint findings, while the package retains 170 unrelated pre-existing warnings;
- focused cancellation-observation PostgreSQL runner: 1/1;
- cumulative Agentic Chat PostgreSQL gate: 14 files / 18 tests;
- complete `agentic-chat-v2` suite: 86 files / 739 tests;
- shared worker contract: 17/17;
- shared-types package: 22/22 plus typecheck/build;
- web `svelte-check`: 0 errors / 0 warnings.

The first complete worker run was intentionally executed alongside the complete web, shared, and lint gates. Its unrelated scheduler wall-clock assertion measured 173 ms against a 150 ms threshold. The failing scheduler file then passed in isolation, and the complete worker suite passed without competing validation load. After the stuck-RPC shutdown proof was added, the final complete worker run passed at 69 files / 586 tests. No observer timer, query, or behavioral failure occurred; the evidence isolates the first result to host contention rather than treating it as an unexplained retry.

Hosted application completed on 2026-08-02. A read-only preflight proved that the hosted ledger was aligned through `20260802034000`, the target RPC was absent, and there were zero worker-mode turns and zero reconcile-pending worker stream rows. A receipt-isolated workdir contained the 46 exact hosted receipts plus only `20260802035000`; the staged SQL matched SHA-256 `e547916267396c87160018af8d34863c1e887ab11c0f5252d9a2e9763ef1ec8d`. The dry run named only the Slice 3 migration, application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger shows exact local/remote parity for the receipt.

Hosted OpenAPI exposes the cancellation observer only to `service_role`. The exact empty-batch service probe returned `200 []`; anonymous invocation returned `401` with SQLSTATE `42501`; and the worker-turn count remained zero. Regenerated types/schema align at 241 tables / 13 views, RPC drift is clean at 222 function names, the OpenAPI generator proof passes 3/3, shared types pass 22/22 plus typecheck, and the focused observer remains green at 11/11 plus worker typecheck. Worker routing remains disabled.

## Deferred

- Targeted low-latency cancellation notification transport.
- Combined user-cancel, queue-timeout, shutdown, and wall-clock abort signal assembly.
- Cancellation terminalization wiring and publisher-overload terminalization.
- Private per-user Realtime authorization.
- Generation-consistent browser reconciliation transaction/routes.
- Queue-consumer registration, provider/model invocation, feature flags, and user-visible routing.
