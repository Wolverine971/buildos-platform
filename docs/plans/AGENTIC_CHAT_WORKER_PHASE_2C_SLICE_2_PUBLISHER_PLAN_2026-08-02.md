<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_2_PUBLISHER_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2C Slice 2 — Bounded Publisher Plan

**Date:** 2026-08-02

**Status:** Implemented, applied, and verified on the hosted database through exact receipt `20260802034000`. Generated database types are refreshed; worker routing remains disabled.

## Objective

Build the inert worker-side publisher package on top of the hosted Slice 1 persistence RPCs. The package must preserve one ordered write slot per turn, coalesce provider text without token-row writes, publish only database-authorized receipts, degrade safely to durable reconciliation when Realtime is uncertain, and bound memory and asynchronous work before a real provider consumer exists.

## Locked scope

- One worker-level scheduler and flush loop shared by every registered turn; no per-turn timers.
- One ordered per-turn operation queue shared by text batches and semantic events.
- Immediate first-text persistence, then steady-state text coalescing by the locked time/size thresholds.
- Multi-turn use of `flush_agentic_chat_text_batches(...)`, capped by its 128-item / 16 MiB contract.
- Post-persistence Broadcast to private topic `chat-user:<user_id>` only when the database returns `outcome='persisted'` and `publish_allowed=true`.
- Fenced acknowledgement of the exact current delivered sequence before `reconcile_required` may be cleared.
- Fail-closed handling for lost persistence responses, stale/cancelled/terminal receipts, Broadcast failure, and acknowledgement failure.
- Per-turn and worker-wide pending-byte/event soft and hard bounds with explicit pressure and typed `publisher_overload` signals.
- Bounded terminal Broadcast attempts after terminal truth commits.
- Dependency-injected persistence, Broadcast, clock, identity, and metrics ports so the package is deterministic and testable without registering a queue consumer.

## Database package

`20260802034000_agentic_chat_worker_stream_delivery_ack.sql` adds service-only `acknowledge_agentic_chat_stream_delivery(...)`.

The function follows the existing `turn -> queue -> stream` lock order and validates the exact worker turn, queue job, processing token, execution generation, and delivered sequence. It clears `reconcile_required` only when the acknowledged sequence equals the current `snapshot_sequence` and `durable_through_sequence`. A stale generation or older acknowledgement returns a typed no-op; it never clears a newer durable snapshot.

## Publisher invariants

- Text and semantic operations for one turn never overlap, including Broadcast and acknowledgement work.
- Adjacent text may merge only before its persistence payload becomes in flight.
- A semantic transition cannot pass an earlier unpersisted text prefix.
- Persistence results that do not carry publication authority are never Broadcast.
- Once delivery becomes uncertain for a turn, normal live events stay suppressed for that generation; only rate-limited reconcile hints may be attempted and the durable reconcile flag remains set.
- A successful Broadcast cannot clear a newer snapshot: the database acknowledgement is exact-sequence fenced.
- Soft pressure is observable and supplies a relief promise that an await-capable provider loop can use for backpressure.
- A hard bound aborts further publisher admission with the complete accumulated assistant prefix attached to a typed overload error; the later worker caller must abort and terminalize with `failure_code='publisher_overload'`.
- Shutdown has one bounded drain path and creates no new work after stop begins.

## Local implementation result

Completed locally on 2026-08-02:

- added `AgenticChatStreamPublisher`, an inert worker package with one worker-level scheduler, ordered per-turn text/semantic queues, immediate first-text persistence, 150 ms / 3 KiB steady-state coalescing, bounded multi-turn text flushes, and at most 16 concurrent semantic writes across distinct turns;
- added per-turn and worker-wide byte/event soft and hard limits, pressure-relief promises, complete-prefix `publisher_overload` errors, bounded idempotent shutdown drain, and bounded terminal Broadcast attempts;
- added fail-closed receipt-scope checks, transient-only persistence retry classification, permanent isolated-row rejection handling, database-authority-only publication, generation-local reconcile-only degradation, and rate-limited reconcile hints;
- added Supabase adapters for the three hosted persistence RPCs, the local acknowledgement RPC, and acknowledged private `chat-user:<user_id>` Broadcast, with a bounded 256-topic least-recently-used channel cache and explicit release/close paths;
- added the shared typed acknowledgement receipt and helper that recognizes only exact/idempotent successful acknowledgement;
- added service-only `acknowledge_agentic_chat_stream_delivery(...)`, which preserves `turn -> queue -> stream` lock order and clears `reconcile_required` only for the exact current generation and durable sequence;
- kept the package unregistered: no `agentic_chat_turn` queue processor, provider/model call, feature-flag change, or user-visible worker route exists.

Migration SHA-256:

- `20260802034000`: `68b13b8263dd7bce619025ad8e7e6619dc53870193ce8a5a855f510dc9d14267`

Validation:

- focused publisher/adapters: 11/11;
- complete worker suite: 68 files / 575 tests, with the opt-in Phase A workflow evaluation still skipped;
- worker typecheck/build: passed;
- worker lint/guardrails: passed; the two new source files have zero lint findings, while the package retains 170 unrelated pre-existing warnings;
- focused acknowledgement PostgreSQL runner: 1/1;
- cumulative Agentic Chat PostgreSQL gate: 13 files / 17 tests;
- complete `agentic-chat-v2` suite: 85 files / 738 tests;
- shared worker contract: 16/16;
- shared-types package: 21/21 plus typecheck/build;
- web `svelte-check`: 0 errors / 0 warnings.

Hosted application completed on 2026-08-02. The reviewed source and receipt-isolated staged migration both matched SHA-256 `68b13b8263dd7bce619025ad8e7e6619dc53870193ce8a5a855f510dc9d14267`. The read-only preflight found no historical or active worker-mode turns, no reconcile-pending worker stream rows, and no conflicting RPC. The isolated directory contained the 45 exact hosted receipts plus only `20260802034000`; its dry run named only that receipt, application succeeded, the post-apply dry run reported the remote database up to date, and the linked ledger is aligned through `20260802034000`.

Service-role OpenAPI now exposes the exact acknowledgement RPC. An exact null-identity service probe reaches the function and fails closed with `agentic_chat_stream_ack_invalid_identity`, while the same anonymous call is denied with SQLSTATE `42501`. The worker-turn count remained zero after application. Regenerated types/schema align at 241 tables / 13 views, RPC drift is clean at 221 function names, the OpenAPI type-generator proof passes 3/3, shared types pass 21/21 plus typecheck/build, the focused publisher passes 11/11 plus worker typecheck/build, and web `svelte-check` reports zero errors and zero warnings.

No queue-consumer registration, provider/model call, private Realtime authorization policy, feature-flag change, staging, commit, or push was performed.

## Deferred

- Queue consumer registration and any real provider/model invocation.
- Wiring overload into the terminal finalizer and combined execution abort signal.
- Batched durable cancellation observation is hosted and verified in Phase 2C Slice 3; exact private per-user Realtime authorization is locally complete in Slice 4 and awaits hosted review.
- Browser subscription, private Realtime authorization policy, reconciliation transaction/route, and client buffering.
- Large-output spill storage and terminal retention cleanup.
- Feature-flag or transport-routing changes.

## Required proof

- First text persists before Broadcast and acknowledgement.
- Multiple turns share one batch call while each turn retains its own write slot.
- Adjacent text coalesces; semantic transitions remain ordered behind earlier text.
- No result lacking `publish_allowed=true` is Broadcast.
- Lost-response replay and Broadcast failure enter reconcile-only mode without clearing durable reconciliation state.
- Reconcile hints are rate-limited and do not restore unsafe live publication.
- Soft pressure resolves after draining; hard per-turn/worker bounds produce typed overload with the full prefix.
- Terminal publication attempts are bounded.
- The acknowledgement RPC is service-only, resists signed-definer authenticated calls, clears only the exact current sequence, preserves the flag for older/stale acknowledgements, rejects forged ownership, and rolls back with the migration package.

All required local and hosted proofs pass. Batched cancellation observation is hosted and verified in Phase 2C Slice 3. Exact private per-user Realtime authorization is locally complete in Slice 4; after its hosted gate, the next Phase 2C work is the generation-consistent reconciliation transaction/routes. Worker routing remains disabled.
