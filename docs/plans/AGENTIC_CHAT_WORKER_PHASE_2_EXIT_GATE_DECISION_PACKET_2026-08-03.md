<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2_EXIT_GATE_DECISION_PACKET_2026-08-03.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-06; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 2 — Exit-Gate Decision Packet

**Prepared:** 2026-08-03 EDT  
**Decision:** Phase 2 is locally complete and eligible for an explicit Phase 3 implementation decision.  
**Production activation:** Not authorized.

## Decision boundary

This packet closes the implementation and fake-provider/tool proof required by the parent Phase 2 exit gate. It does not authorize production worker routing, a real provider/model call, browser worker-mode negotiation, live capacity admission, or consumer startup.

The evidence has three deliberately separate classes:

- **Hosted control plane:** Phase 2A, Phase 2B Slices 1–5, and Phase 2C Slices 1–5 are hosted through exact receipt `20260802037000`.
- **Local inert proof:** Phase 2D client adoption and the fixture consumer/executor/recovery matrix are local and test-owned. The consumer and sweeper are absent from production entrypoints.
- **Preliminary local measurement:** the 100-turn disposable-PostgreSQL result is a deterministic regression ceiling, not hosted capacity or Railway/Supabase headroom.

No migration was needed for the final matrix. The hosted schema already contained the exact admission, claim, provider-start, cancellation, terminalization, recovery, input-retention, and prepared-cache cleanup primitives. The only cleanup change is a test-fixture correction that makes its stub match the already-hosted cleanup body.

## Exit-gate evidence map

|   # | Parent exit requirement                                                                                                              | Evidence                                                                                                                           | Decision                                               |
| --: | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
|   1 | Duplicate admissions create one turn, user message, and queue job.                                                                   | `20260802020000_agentic_chat_worker_atomic_admission.test.sql`; `phase2b-admission-claim.postgres.test.ts`                         | Pass — hosted primitive, disposable proof              |
|   2 | Matching duplicates converge; changed canonical content conflicts without writes.                                                    | Atomic-admission PostgreSQL proof; `worker-turn-admission.test.ts`; `worker-turn-adoption.test.ts`                                 | Pass                                                   |
|   3 | Unauthorized users cannot subscribe/query/cancel/write/read worker-owned data.                                                       | Phase 2A trust/queue-lockdown PostgreSQL suites; Phase 2C private-Realtime authorization; owned turn/cancel routes                 | Pass — hosted database and local route proof           |
|   4 | Stale generations cannot write events, snapshots, messages, effects, or terminal truth.                                              | Claim-fencing, effect, terminal-control, stream-write, and execution-recovery PostgreSQL suites                                    | Pass — hosted primitive                                |
|   5 | Fixture streaming survives disconnect/reconnect, reconstructs text/projection, changes generation, and cancels without a real model. | `agenticChatFixtureTurnExecutor.test.ts`; `agenticChatRecoverySnapshot.test.ts`; `worker-phase2d-composed-flow.test.ts`            | Pass — local inert proof                               |
|   6 | Cancellation/completion races produce one terminal truth and bounded assistant-message truth.                                        | `20260802030500_agentic_chat_worker_terminal_control.test.sql`                                                                     | Pass — hosted primitive and two-connection proof       |
|   7 | Supersede waits for durable terminal truth, including an abort-ignoring provider.                                                    | `20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql`; executor abort-refusal test                                 | Pass — composed local proof                            |
|   8 | Mutation effects reserve/begin exactly once, use stable identity, replay receipts, and fail uncertain commits closed.                | Effect PostgreSQL suites; `agenticChatEffectControl.test.ts`; `agenticChatFixtureMutationExecutor.test.ts`                         | Pass — hosted ownership plus local inert adapter       |
|   9 | Transport disagreement, lost admission response, lease expiry/kill epoch, and duplicates converge on stored mode.                    | `transport-lease.test.ts`; `transport-decision.test.ts`; `worker-turn-gateway.test.ts`; admission route tests                      | Pass — local legacy-only gateway proof                 |
|  10 | No-lease clients remain on the persisted legacy path and cannot attach to a worker turn.                                             | Transport decision/gateway/admission route tests                                                                                   | Pass — local compatibility proof                       |
|  11 | First-turn session-inline admission creates one session under duplicates and receives/reconciles the first event.                    | Atomic-admission concurrency proof; mounted runtime/adoption tests; composed browser flow                                          | Pass — hosted admission plus local receive proof       |
|  12 | General queue saturation cannot consume the chat slot and vice versa.                                                                | `supabaseQueueRefill.test.ts`; `agenticChatFixtureConsumer.test.ts`                                                                | Pass — two actual isolated `SupabaseQueue` instances   |
|  13 | One 100-turn cancellation batch respects publisher memory/high-water bounds.                                                         | `agenticChatFixtureLoad.test.ts`                                                                                                   | Pass — deterministic local fixture                     |
|  14 | The 100-turn fixture records statements, rows, payload, latency, and WAL within the preliminary budget.                              | `20260803000000_agentic_chat_worker_100_turn_load.test.sql`                                                                        | Pass — preliminary local measurement only              |
|  15 | Capacity rejection creates no objects and hard concurrent caps cannot be exceeded.                                                   | Atomic-admission PostgreSQL proof; `worker-turn-capacity.test.ts`; admission adapter/route tests                                   | Pass — hosted hard cap, local soft gate remains closed |
|  16 | Delayed/retry prompt input contains the user message once and source history edits/deletes cannot alter it.                          | Atomic-admission input proof; `20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql`; execution-input adapter tests | Pass — generation 1 → 2 composed proof                 |
|  17 | Prepared cleanup cannot delete retained active input and the turn remains executable after cache cleanup.                            | Exact cleanup fixture body plus `20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql`                              | Pass — hosted cleanup semantics, local composed proof  |
|  18 | Only pre-start classified failures retry; post-start/unknown/generic recovery cannot blindly replay.                                 | Execution-recovery PostgreSQL suite; executor/stalled-recovery tests                                                               | Pass — hosted fencing plus local sweep proof           |
|  19 | Legacy SSE remains unaffected.                                                                                                       | Complete Agentic Chat service/route/PostgreSQL suite; legacy stream-controller coverage; worker routing remains disabled           | Pass locally; production mode unchanged                |

## Final composed proof

The final PostgreSQL matrix proves the cross-component ordering rather than relying only on isolated RPC tests:

1. A prepared-prompt turn is admitted and its short-lived prepared row is aged through the normal 10-minute consumed-cache cleanup.
2. Cleanup deletes exactly that cache row while the immutable input artifact, source UUID, content hash, and history remain unchanged.
3. The turn is claimed and receives immediate-before-provider start authority from that retained artifact.
4. Replacement admission fails before supersede and still fails after `cancel_requested`; no replacement turn, message, artifact, or job exists.
5. The abort-ignoring first turn commits one cancelled terminal receipt, after which the replacement is admitted exactly once.
6. Two real scheduler connections run cancel-first against the replacement. Cancellation wins the turn lock; the late provider-start caller gets `invoke_provider=false` and creates no provider output.
7. A second turn freezes source-backed history, survives source edit and deletion, safely requeues generation 1, and begins generation 2 with the same artifact/hash/history.

The executor proof permits the current owner to publish only the committed terminal `done` after cancel-first. It forbids provider invocation, semantic output, and provider text. In the start-first branch, an abort-ignoring provider may continue yielding in memory, but its post-abort text is neither finalized nor Broadcast.

The composed browser proof then converges new and duplicate admission on one immutable handle, releases/recreates it through owned reload discovery, reconciles channel reconnect, repairs a sequence-3-before-sequence-2 gap from the durable cursor without appending duplicate text, and retains the handle through cancellation acknowledgement until the terminal receipt releases it.

## Validation receipt

- Complete Agentic Chat service/route/PostgreSQL gate: **106 files / 863 tests passed**.
- Complete worker package: **78 files / 641 tests passed**, with one explicit opt-in file/test skipped.
- Focused Agentic worker/queue gate: **12 files / 79 tests passed**.
- Focused controller/UI/composed gate: **3 files / 33 tests passed**.
- Worker typecheck: passed.
- Worker lint: exit 0; **170 pre-existing warnings**, none in this matrix's touched production source.
- Whole-worktree `svelte-check`: **0 errors / 0 warnings**.
- `git diff --check`: passed.
- Latest complete-suite 100-turn sample: 102 logical RPCs, 300 affected rows, 234,000 flush-payload bytes, 8,400 cancellation-payload bytes, 448,376 WAL bytes total / 4,483.76 bytes per turn, 20.62 ms flush, and 31.20 ms total. Guardrails remain 64 KiB WAL/turn, 2 seconds flush, and 5 seconds total.

The PostgreSQL suite initially hit the restricted-sandbox `listen EPERM` condition before database startup. The identical permission-correct rerun passed. This is environment evidence, not a product retry.

## Production safety audit

- New transport decisions remain hardcoded to `legacy_sse` / `legacy_internal_v1`.
- The production browser still uses legacy v2 SSE Send/Stop and does not call worker admission.
- Live capacity evidence is not wired, so direct worker admission defaults closed.
- `createAgenticChatFixtureConsumer(...)` and `AgenticChatStalledRecoverySweep` are exported only from the inert Agentic Chat module; no production worker entrypoint imports or starts them.
- No real provider adapter or asynchronous model call exists in the worker fixture.
- No migration was created or applied for this matrix.

## Decision and next authority boundary

Phase 2's implementation/fixture exit gate is satisfied for a Phase 3 implementation decision. The next action requires explicit authorization because it materially expands scope from inert proof to real asynchronous execution.

If Phase 3 is approved, its first slice must remain internal/admin-only, keep `CHAT_CONCURRENCY=1`, instantiate the already-proven chat-only queue pool, wire fresh live capacity evidence, add the real provider through the immediate-before-provider fence, and preserve the kill epoch and legacy-only default until an independently reviewed internal routing gate is opened.

Until that approval, stop here. Do not import/start the consumer, enable worker lease negotiation in the browser, open capacity, invoke a real provider, or reinterpret local WAL/latency as hosted headroom.
