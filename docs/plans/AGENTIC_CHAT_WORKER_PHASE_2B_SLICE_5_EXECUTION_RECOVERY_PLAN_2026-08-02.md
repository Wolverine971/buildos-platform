<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2B_SLICE_5_EXECUTION_RECOVERY_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2B Slice 5 — Execution Fence and Recovery Plan

**Date:** 2026-08-02

**Status:** Local implementation, review, and hosted application complete through exact receipt `20260802031000`. Hosted types/schema are regenerated at 240 tables / 13 views / 212 RPC names; worker routing remains disabled.

## Objective

Add the last pre-provider ownership boundary and a database-enforced, fail-closed recovery decision surface without adding a queue consumer, provider call, retry loop, or worker route.

This slice must make two facts durable:

1. exactly one current queue owner can receive permission to invoke the provider; and
2. a whole turn can be requeued only when the database proves it has not crossed provider or mutation boundaries and the supplied failure class is explicitly retryable.

## Deliverables

- `20260802031000_agentic_chat_worker_execution_recovery.sql`
    - service-only `begin_agentic_chat_turn_execution(...)`;
    - service-only `recover_agentic_chat_turn(...)`;
    - exact queue/turn/generation/token/envelope validation;
    - atomic pre-start turn-and-queue requeue;
    - terminal-domain queue reconciliation;
    - no generic `agentic_chat_turn` recovery path.
- Shared TypeScript result and decision contracts in `agentic-chat-worker-contract.ts`.
- Pure contract fixtures covering the complete retry matrix.
- Disposable PostgreSQL proof, including real start-versus-recovery and duplicate-start contention.
- Updated Phase 2 handoff and parent migration plan after the package is green.

## Provider-start fence

`begin_agentic_chat_turn_execution(...)` follows the established turn-then-queue lock order and validates the current service role, queue job, processing token, user, dedup key, turn/correlation metadata, execution generation, running predecessor, input artifact scope, and cancellation/terminal state.

The first valid caller atomically sets `execution_started_at` and returns `invoke_provider=true`. Every later call returns the committed start receipt with `invoke_provider=false`. This is intentionally fail-closed: if the winning response is lost, no retry may infer permission to invoke the provider.

The fence also refuses provider start after the locked 300-second maximum queue residence. A stale input returns a typed `stale_context` result and must be terminalized as failed by the later caller/loop.

## Recovery decision table

| Durable state                                                               | Failure class                            | Decision                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Turn already terminal                                                       | any                                      | Reconcile the queue row to the terminal domain result; never execute.                            |
| Stale requested generation                                                  | any                                      | Return `stale_generation`; no write.                                                             |
| Accepted cancellation                                                       | any                                      | Return `finalize_cancelled`; no requeue.                                                         |
| Before `execution_started_at`, no mutation/effect boundary, attempts remain | `transient_infra` or `provider_throttle` | Atomically move turn `running -> queued` and queue `processing -> pending` with bounded backoff. |
| Same safe pre-start state, first attempt only                               | `timeout_pre_start`                      | Atomically requeue once into a new claim generation.                                             |
| Same safe pre-start state                                                   | any other class                          | Return `finalize_failed`; no requeue.                                                            |
| Maximum queue residence exceeded                                            | any                                      | Return `finalize_failed` with `stale_context`; no requeue.                                       |
| After `execution_started_at`                                                | any                                      | Never requeue the whole turn; return a terminalization decision.                                 |
| Reserved/started/uncertain effect requires resolution                       | any                                      | Return `effect_reconciliation_required`; never replay the turn.                                  |
| Retry attempts exhausted                                                    | otherwise retryable                      | Return `finalize_failed`; no requeue.                                                            |
| Queued/pending row produced by a prior recovery                             | same request replay                      | Return `already_requeued`; do not consume another attempt.                                       |
| Unmapped/`unknown` failure                                                  | any boundary                             | Never retry automatically.                                                                       |

The accepted failure classes remain the locked `agentic_chat_error_v1` execution taxonomy:

- `transient_infra`
- `provider_throttle`
- `timeout_pre_start`
- `permanent`
- `stale_context`
- `publisher_overload`
- `timeout_post_start`
- `cancelled`
- `uncertain_external_commit`
- `unknown`

## Atomicity and lock order

Every mutating path locks the owning turn before subordinate effect and queue state. Safe requeue updates the domain turn and queue row in one transaction. It never clears or rewrites `execution_started_at`, `mutation_reserved_at`, or `irreversible_boundary_at`; their presence makes whole-turn requeue impossible.

Queue reconciliation is allowed only after the domain turn is terminal. It clears the old processing token and maps `completed`, `failed`, and `cancelled` to the identical queue status without invoking application work.

## Proof requirements

- Direct and signed-definer authenticated calls are denied; `service_role` succeeds.
- Exactly one concurrent start caller receives `invoke_provider=true`.
- A lost-response start replay receives `already_started` and cannot invoke.
- Start and recovery races are serialized in both orders.
- Start and recovery timestamps are captured after their governing locks.
- Wrong token, queue envelope, user, generation, or turn relationship fails closed.
- Explicit retryable pre-start classes requeue atomically; `timeout_pre_start` does so only once.
- Unknown, post-start, stale-context, mutation-boundary, effect-reconciliation, and exhausted cases never requeue.
- Terminal-domain queue reconciliation is idempotent.
- The complete earlier migration/test chain remains green and rollback removes only this slice.

## Non-goals

This slice adds no application caller, worker processor, provider/model call, publisher, cancellation observer, stalled sweep timer, queue consumer registration, feature-flag change, or automatic terminal-finalization loop. It provides the fenced primitives and exhaustive decisions those later components must obey.

## Hosted gate

After local review and explicit hosted-application approval:

1. run a read-only preflight for worker-mode active rows, target routine conflicts, and current receipt parity;
2. apply only `20260802031000` from a receipt-isolated workdir;
3. verify routine grants, definitions, and the new receipt;
4. regenerate hosted database types once;
5. rerun shared types, PostgreSQL gates, web checks, and RPC drift checks.

Hosted application completed on 2026-08-02. The read-only preflight found zero active worker-mode turns and no conflicting target RPCs. A receipt-isolated workdir contained the 40 exact hosted receipts plus only `20260802031000`; `20260802032000_native_search_query_cache.sql` was intentionally excluded and remained unapplied at this Slice 5 gate. The staged SQL matched the reviewed SHA-256 below, the dry run named only `20260802031000`, application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger showed local/remote parity for `20260802031000`. The native-search `20260802032000` receipt was subsequently applied and verified later on 2026-08-02.

Hosted OpenAPI exposes both new RPCs to `service_role` and neither to anonymous clients; the project returns its expected anonymous `401`. Database types and the lightweight schema were regenerated at 240 tables / 13 views, and RPC drift is aligned at 212 function names.

## Local implementation result

Completed on 2026-08-02:

- added `begin_agentic_chat_turn_execution(...)` with exactly-one `invoke_provider=true` authorization, immutable duplicate receipts, post-lock timing, stale-input denial, and complete queue/domain ownership validation;
- added `recover_agentic_chat_turn(...)` with explicit failure taxonomy, atomic safe pre-start requeue, one-time pre-start timeout retry, attempt exhaustion, effect/boundary fail-closed rules, duplicate recovery, and idempotent terminal queue reconciliation;
- made the defensive retry predicate require zero effect rows of any state as well as clean provider/mutation boundary timestamps;
- added typed shared RPC/decision contracts and a pure recovery mirror;
- added real two-connection start/start, start/recovery, and recovery/start races plus post-lock timing, security-wrapper, rollback, stale-context, effect, token, generation, and terminal reconciliation proofs.

Local migration SHA-256: `0885c69b21f468152c96884028a33fc98ea061b0dbc3cfd5aed47a06714f6736`.

Validation:

- focused execution/recovery PostgreSQL runner: 1/1;
- cumulative Agentic Chat PostgreSQL gate: 11 files / 15 tests;
- complete `agentic-chat-v2` suite: 83 files / 736 tests;
- shared worker contract: 14/14;
- shared-types package: 19/19 plus typecheck/build;
- web `svelte-check`: 0 errors / 0 warnings;
- formatting and `git diff --check`: clean.

No application caller, queue consumer, feature-flag change, staging, commit, or push was performed for Slice 5. The hosted migration and generated-type regeneration are complete.
