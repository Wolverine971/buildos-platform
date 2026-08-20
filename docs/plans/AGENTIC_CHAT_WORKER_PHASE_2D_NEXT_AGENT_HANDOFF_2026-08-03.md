<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_NEXT_AGENT_HANDOFF_2026-08-03.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-06; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat Worker Phase 2D — Next-Agent Handoff

**Prepared:** 2026-08-03 EDT

**Current continuation (2026-08-05):** Phase 3 activation and the first fourteen Phase 4 slices were subsequently authorized. The linked hosted ledger now contains Slice 6 timing receipt `20260804000120`, Slice 7 prompt-snapshot receipt `20260804032000`, Slice 8 partial-cancellation receipt `20260804033000`, Slice 9 provider-failure receipt `20260804034000`, Slice 10 provider-call identity receipt `20260804035100`, Slice 10 read-tool ledger receipt `20260804036000`, and Slice 12 private lifecycle-observability receipt `20260804037000`. Slice 11 activates exactly one worker-owned `get_project_overview` definition; Slice 12 exposes the private lifecycle projection; and Slice 13 hardens capacity freshness and adds the explicit-turn verifier. Mutation remains disabled. Exact pushed revision `8ae5ae7f2d5b7c6f48855c5371a05031d3bca677` contains the bounded-read implementation. The first production request was correctly rejected as verifier evidence because it used `legacy_sse` under drifted routing. After the cohort repair, a second request selected worker transport but failed closed before atomic admission: the web's 1.5-second end-to-end capacity timeout equaled the worker's independent 1.5-second collection ceiling, leaving no DNS/TLS/proxy budget. The exact durable lookup returned zero worker turns, so no provider or mutation ran. Routing is back to exact `false` in Ready deployment `dpl_7467BvfiP1pids538fmTszcfFS46`. Slice 14 locally raises only the web's outer deadline to a bounded 5 seconds and adds a 4,999 ms regression while preserving every fail-closed boundary. Deploy that repair with routing false, then authorize one new canary and require the Slice 13 verifier to pass before widening anything. Continue at `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_14_CAPACITY_TRANSPORT_BUDGET_PLAN_2026-08-05.md`; retain this file as historical Phase 2 evidence. (Later 2026-08-05: the Slice 14 repair shipped as `35c2ca8b1` and canary attempt 3 still failed closed pre-admission; the deadline-stacking repair and current gate live in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_15_ADMISSION_CAPACITY_OVERLAP_PLAN_2026-08-05.md`.)

**Superseded later on 2026-08-03:** The user explicitly authorized continuing into Phase 3. Phase 3 Slice 1 is recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_1_CONSUMER_LIFECYCLE_PLAN_2026-08-03.md`; retain this document as the closed Phase 2 evidence handoff.

**Current stopping point:** Phase 2D Slices 1–6, the remaining Phase 2 exit matrix, and the Phase 2 exit-gate decision packet are complete and audited. The final composed proof closes supersede/terminal-wait ordering, both provider-start-versus-cancel branches, abort-ignoring provider output fencing, immutable-history reuse across retry generations after source edit/delete, prepared-cache cleanup retention, and duplicate/reload/reconnect/sequence-gap/terminal client convergence. No production worker path was enabled. Phase 3 remains the first unit allowed to add a real asynchronous provider or production worker routing and requires explicit approval.

**Production safety state:** Worker routing is disabled. Every genuinely new transport decision is hardcoded to `legacy_sse` / `legacy_internal_v1`. The production browser does not call the new transport/admission gateway and continues using the existing v2 legacy SSE Send/Stop path. Live capacity evidence is not wired, so direct new worker admission defaults closed. The fixture consumer is not imported or started by `worker.ts` or another production entrypoint and has no real provider adapter. Do not change those facts while preparing the Phase 2 exit decision.

**Git/worktree instruction:** Work directly in the user's local `main` worktree. Do not create a branch, stage, commit, push, restore, or discard files unless the user explicitly asks. The tree is intentionally dirty and contains many unrelated user-owned changes; restrict edits to the Agentic Chat files named here and inspect overlap before editing.

## Read first

Read these in order:

1. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_6_INERT_FIXTURE_CONSUMER_PLAN_2026-08-03.md`
2. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_5_CLIENT_ADOPTION_UI_PLAN_2026-08-03.md`
3. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_4_ATOMIC_ADMISSION_GATEWAY_PLAN_2026-08-03.md`
4. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2_HANDOFF_2026-07-31.md` — start at Phase 2D Slice 1
5. `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` — especially §§7.3–7.5, §8.4, and the Phase 2 exit gate
6. `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2_EXIT_GATE_DECISION_PACKET_2026-08-03.md`
7. `supabase/migrations/20260801041100_agentic_chat_worker_effect_rpcs.sql`
8. `supabase/migrations/20260802031000_agentic_chat_worker_execution_recovery.sql`
9. `packages/shared-types/src/agentic-chat-worker-contract.ts`
10. `apps/web/AGENTS.md` when changing the Svelte client surface

If editing or reviewing Svelte, load the repository's Svelte skills and run the Svelte autofixer as required by `apps/web/AGENTS.md`.

## What is complete

### Hosted foundation — do not rebuild it

Phase 2A, Phase 2B Slices 1–5, and Phase 2C Slices 1–5 are hosted through exact receipt `20260802037000`. The database already owns:

- duplicate-first atomic worker admission and session-inline creation;
- queue/domain claim and current-generation fencing;
- effect reservation/start/reconciliation ownership;
- cancellation, terminal compare-and-set, and pre-provider execution fencing;
- safe pre-start recovery classification;
- generation-fenced stream state/event writes and text batching;
- post-commit publication authority and delivery acknowledgement;
- batched cancellation observation;
- exact receive-only private Realtime authorization; and
- generation-consistent reconciliation.

No migration is currently needed for the remaining fixture matrix.

### Phase 2D Slice 1–2 — mounted receive path

The browser has an authenticated, handle-free Realtime runtime mounted at `AgentChatModal`:

- `worker-realtime-inbox.ts`
- `worker-realtime-channel.ts`
- `worker-realtime-coordinator.ts`
- `worker-realtime-runtime.ts`
- `AgentChatModal.svelte`

The post-implementation audit fixed exact-channel cleanup/replacement, partial construction failure, false reconnect reporting, stop-time in-flight latch retention, turn-observer retention across auth/teardown, malformed auth identities, synchronous auth subscription failure cleanup, and synchronous auth-event versus initial-lookup races. Focused Realtime coverage is 34/34.

No worker handle is registered, so this mount makes no reconciliation request and cannot affect production Send/Stop behavior.

### Phase 2D Slice 3 — legacy-only transport and owned-turn gateway

Implemented locally:

- `transport-lease.server.ts` / `.test.ts`
- `transport-decision.server.ts` / `.test.ts`
- `worker-turn-gateway.server.ts` / `.test.ts`
- `POST /api/agent/v2/transport`
- `GET /api/agent/v2/turns/<id>`
- `GET /api/agent/v2/turns?session_id=<id>`
- `POST /api/agent/v2/turns/<id>/cancel`

Important behavior:

- `actl1` leases are canonical, HMAC-SHA-256 signed, short-lived, size-bounded, constant-time verified, and bound to authenticated user/client-turn/stream/context plus mode/contract/decision/expiry/kill epoch.
- An unproven client `priorDecisionId` is lookup-only and never authoritative. Only an owned persisted turn can preserve it; otherwise the server generates a new decision id.
- Existing turns reissue only their immutable stored mode/contract/decision.
- Every genuinely new decision remains legacy-only.
- Owned discovery and cancellation hide absent, foreign, and non-worker rows behind one not-found boundary.
- `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET` and `AGENTIC_CHAT_WORKER_KILL_EPOCH` are documented in `apps/web/.env.example`.

Focused transport/gateway coverage is 43/43. No browser call site exists.

### Phase 2D Slice 4 — atomic admission gateway complete and inert

Implemented locally:

- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.test.ts`
- `POST /api/agent/v2/turns`

The adapter invokes the exact hosted `create_agentic_chat_turn_with_job` signature and fail-closes all receipt shapes. It supports:

- `newly_admitted` with exact server-generated identity checks;
- `matching_duplicate` without execution authority;
- `active_turn_conflict`, including an old active legacy turn whose `client_turn_id` is legitimately null;
- `idempotency_conflict`; and
- bounded `capacity_exceeded`.

It deliberately never returns `executionMayStart=true`; queue workers, not browsers, own execution. Database detail is hidden behind a typed error.

`AgenticChatWorkerAdmissionResultV1` was corrected so only an active conflict may carry `clientTurnId: null`; new, matching-duplicate, and idempotency-conflict results still require the exact request identity. The preparation boundary owns normalized message/attachments, access and session intent, exact `resolveFastChatTurnPreparation(...)` output, stable prepared lineage, canonical request hash v2, frozen model history/source ids, trusted prompt/context/tool inputs, canonical artifact hash/byte counts, request/message metadata, and generated UUIDs.

Prepared prompts use an inspect-only worker path; the hosted RPC remains the only claimant/consumer. Retry request-hash lineage ignores mutable consumed/expired state, while the exact prepared copy is still revalidated transactionally. Brand-new inline sessions carry empty `admission_window` history and no prepared lineage. Capacity requires fresh queue/provider/publisher evidence and defaults closed because no live collector is wired.

The POST route authenticates and strictly validates before admin-client creation, verifies the worker lease against every binding/current kill epoch, rejects legacy leases and trusted-field injection, calls preparation and admission once, returns only a private immutable handle, hides conflicts, returns exact bounded `Retry-After`, and refuses to adopt a legacy duplicate.

Focused Slice 4 coverage is 5 files / 30 tests. The complete Agentic Chat service/route/PostgreSQL gate is 104 files / 852 tests. No browser call site or registered worker handle exists.

### Phase 2D Slice 5 — authoritative client adoption/UI projection complete

Implemented locally:

- `worker-turn-adoption.ts` / `.test.ts`
- `agent-chat-worker-ui-adapter.ts` / `.test.ts`
- worker-handle ownership in `agent-chat-stream-controller.svelte.ts`
- mounted discovery/adoption in `AgentChatModal.svelte`

Only a handle returned by server admission or owned discovery can register with the mounted worker runtime. Matching duplicates converge on the same immutable handle; legacy/non-worker/foreign/absent rows are refused. Reconciliation applies the complete current-generation text snapshot before semantic projection and contiguous post-watermark events. Terminal, auth, session, and modal teardown release the exact handle without tearing down the standing receive-only user channel.

The audit fixed a synchronous auth-callback versus asynchronous initial-auth race that could clear a newly discovered handle. Reconciliation now also rejects incomplete durable windows and malformed terminal shape, while the reconcile route returns private/no-store headers on every response path.

Focused controller/UI coverage is 32/32. The complete Agentic Chat gate is now 105 files / 860 tests, and web check is 0 errors / 0 warnings. Production Send remains legacy-only.

### Phase 2D Slice 6 — inert fixture, recovery, and first 100-turn load units complete

Implemented locally:

- `apps/worker/src/workers/agentic-chat/executionControl.ts`
- `apps/worker/src/workers/agentic-chat/executionInput.ts`
- `apps/worker/src/workers/agentic-chat/effectControl.ts`
- `apps/worker/src/workers/agentic-chat/effectIdentity.ts`
- `apps/worker/src/workers/agentic-chat/fixtureMutationExecutor.ts`
- `apps/worker/src/workers/agentic-chat/fixtureTurnExecutor.ts`
- `apps/worker/src/workers/agentic-chat/fixtureConsumer.ts`
- `apps/worker/src/workers/agentic-chat/recoverySnapshot.ts`
- `apps/worker/src/workers/agentic-chat/stalledRecovery.ts`
- `apps/worker/tests/agenticChatFixtureLoad.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-phase2d-composed-flow.test.ts`
- `supabase/tests/20260803001000_agentic_chat_worker_phase2d_behavior_matrix.test.sql`
- `supabase/tests/20260803000000_agentic_chat_worker_100_turn_load.test.sql`
- processor-managed lifecycle/timeout support in `SupabaseQueue`

The executor verifies the queue envelope, claims one generation, loads only the immutable retained artifact, obtains immediate-before-provider authority, combines durable cancellation/queue timeout/publisher overload, executes canned text and read-only/mutating tool steps, writes reconnect-safe projections, finalizes terminal truth before terminal Broadcast, and reconciles the queue according to terminal outcome. Strict RPC parsing accepts immutable execution/effect/terminal winners across response-loss and generation races but never grants stale invocation authority.

Mutation identity is stable across provider-call ids and generations: one turn/logical-operation UUID derives the effect UUID, while canonical arguments get a separate SHA-256 conflict hash. Reservation rechecks cancellation before begin, only the exact begin winner may invoke, committed duplicates replay without reinvocation, downstream idempotent retries reuse `chat-effect:<effect_id>`, and a non-queryable possible commit becomes `uncertain_external_commit` without automatic retry.

The dedicated fixture consumer registers only `agentic_chat_turn`, owns independent concurrency/poll/worker/stalled/drain configuration, delegates queue lifecycle to the domain executor, and is never started by production code. Two actual `SupabaseQueue` instances prove that 20 saturated general slots and 2 bounded chat slots issue disjoint `p_job_types` claims and drain independently.

The stalled candidate reader selects only old `processing` chat rows and performs no direct lifecycle write. Recovery first reclaims the exact existing queue processing token through `claim_agentic_chat_turn`, then calls the fenced recovery RPC. Safe pre-provider work may requeue; post-start work finalizes from a strict, complete `reconcile_agentic_chat_turn` snapshot; effect uncertainty remains manual; stale owners stop. Terminal recovery preserves exact durable partial text/projection, never Broadcasts from the sweeper, and re-runs recovery to reconcile queue truth. Overlapping sweeps coalesce, shutdown is bounded, and the sweep cannot restart after stop.

The in-memory 100-turn fixture proves one cancellation-observation RPC carries all 100 exact generations. With 1 KiB pending per turn, publisher peak is 100 events / 102,400 bytes, below the default worker soft limits of 256 events / 2 MiB. The deliberately held first write produces two bounded text flushes—1 immediate, then 99 coalesced—and 100 exact acknowledgements with no overload.

The disposable PostgreSQL measurement then executes the corresponding 100-turn text-only cadence and records real WAL. The complete-suite sample produced 102 logical RPC calls, 300 affected turn/stream rows, 234,000 flush-payload bytes, 8,400 cancellation-payload bytes, 448,376 WAL bytes total / 4,483.76 bytes per turn, a 23.30 ms batch flush, and 69.68 ms total under concurrent test load. The explicit synthetic fixture ceilings are 64 KiB WAL per turn, 2 seconds for the flush, and 5 seconds total. These are Phase 2 regression guardrails on a disposable local database, not hosted capacity, Railway/Supabase headroom, or Phase 3 authorization.

The final composed database proof uses the production admission/claim/start/cancel/finalize/recovery contracts in one disposable PostgreSQL lifecycle. A prepared-prompt row is normally aged through the hosted 10-minute consumed-cache cleanup and deleted before claim, while the retained input artifact remains linked, hashed, and executable. A start-first turn that ignores abort remains the only active turn until its cancelled terminal receipt commits; admission writes for the replacement do not exist before that receipt and appear exactly once afterward. The replacement then exercises a real two-connection cancel-first race: cancellation wins the turn lock and the late start receives `invoke_provider=false` without durable provider output. A second session edits and deletes its source history after admission, requeues generation 1 before provider start, and starts generation 2 from the unchanged artifact/hash/history.

The executor counterpart proves cancel-first cannot invoke or publish provider output and may publish only the committed terminal `done`; the abort-ignoring branch proves post-abort provider text is neither finalized nor Broadcast. The composed browser test proves new/duplicate admission converge on one immutable handle, reload recreates it only through owned discovery, reconnect reuses the durable cursor, an out-of-order sequence is repaired from the exact missing durable window without duplicated text, and cancellation acknowledgement retains the handle until terminal reconciliation releases it.

Complete worker coverage is 78 passing files / 641 passing tests with one explicit opt-in skip. The complete Agentic Chat web/service/PostgreSQL gate is 106 files / 863 tests. Lost/already-started responses, stale start generations, both start/cancel interleavings, provider abort refusal, process interruption, concurrent sweeper ownership loss, 100-turn pressure, cross-pool isolation, immutable retry input, prepared cleanup, and composed client convergence are covered without duplicate provider invocation or post-cancel provider output.

## Exact next task — explicit Phase 3 decision required

The local Phase 2 exit matrix and decision packet are complete. Do not extend them into production execution implicitly.

### 1. Review the completed Phase 2 exit decision

- Review `AGENTIC_CHAT_WORKER_PHASE_2_EXIT_GATE_DECISION_PACKET_2026-08-03.md` and explicitly accept or reject Phase 3 implementation.
- Keep hosted guarantees separate from local-only fixture evidence and preliminary disposable-local capacity measurements.
- Treat any Phase 3 provider, capacity, routing, or startup work as a new authorized scope.

### 2. Preserve the production safety boundary

- Keep all new transport decisions legacy-only, live capacity closed, and the fixture consumer/sweeper absent from production entrypoints.
- Keep the measured 100-turn fixture classified as a deterministic regression guardrail, not hosted headroom or a Phase 3 launch result.
- Stop for explicit Phase 3 authorization before importing the consumer, wiring live capacity, negotiating worker mode in the browser, or invoking a real provider.

## Validation baseline and commands

Latest validation state:

- complete Agentic Chat service/route/PostgreSQL suite: 106 files / 863 tests;
- focused controller/worker-UI/composed coverage: 3 files / 33 tests;
- focused Agentic worker/queue coverage: 12 files / 79 tests;
- complete worker package: 78 passing files / 641 passing tests with one explicit opt-in skip;
- shared types: 24/24 plus typecheck and CJS/ESM/declaration build;
- worker typecheck and touched-source lint: clean;
- the Agentic Chat web/service/PostgreSQL gate and whole-worktree `svelte-check` are clean at 0 errors / 0 warnings; and
- tracked `git diff --check`: clean.

Commands:

```bash
pnpm --filter @buildos/worker exec vitest run tests/agenticChatCancellationObserver.test.ts tests/agenticChatEffectControl.test.ts tests/agenticChatExecutionControl.test.ts tests/agenticChatExecutionInput.test.ts tests/agenticChatFixtureConsumer.test.ts tests/agenticChatFixtureLoad.test.ts tests/agenticChatFixtureMutationExecutor.test.ts tests/agenticChatFixtureTurnExecutor.test.ts tests/agenticChatRecoverySnapshot.test.ts tests/agenticChatStalledRecovery.test.ts tests/agenticChatStreamPublisher.test.ts tests/supabaseQueueRefill.test.ts
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2 src/routes/api/agent/v2/turns src/routes/api/agent/v2/transport
pnpm --filter @buildos/web exec vitest run src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts src/lib/components/agent/agent-chat-worker-ui-adapter.test.ts src/lib/services/agentic-chat-v2/worker-phase2d-composed-flow.test.ts
pnpm --filter @buildos/shared-types test:run
pnpm --filter @buildos/shared-types typecheck
pnpm --filter @buildos/shared-types build
pnpm --filter @buildos/web check
git diff --check
```

The disposable PostgreSQL tests bind a local socket. In a restricted sandbox they can fail during setup with `listen EPERM: operation not permitted 127.0.0.1` while every application assertion remains green. Do not classify that as a product failure or silently ignore it: rerun the same complete command with localhost permission. The permission-correct baseline passed 106/106 files and 863/863 tests.

Do not rerun the paid/hosted 24-scenario quality cohort for this work; it is unrelated to this inert control-plane slice and was previously closed.

## Worktree boundaries

Relevant local files are uncommitted. Preserve all unrelated modified/untracked files. In particular, do not use broad restore/reset/clean operations.

Expected Agentic Chat local changes include:

- `apps/web/.env.example`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/services/agentic-chat-v2/transport-*`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-*`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-*`
- `apps/web/src/routes/api/agent/v2/transport/**`
- `apps/web/src/routes/api/agent/v2/turns/**`
- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/workers/agentic-chat/**`
- `apps/worker/tests/agenticChat*.test.ts`
- `apps/worker/tests/supabaseQueueRefill.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_5_CLIENT_ADOPTION_UI_PLAN_2026-08-03.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_6_INERT_FIXTURE_CONSUMER_PLAN_2026-08-03.md`
- the Phase 2/Phase 2D plan and handoff files listed above.

## Stop conditions satisfied

The composed supersede/terminal-wait, start/cancel, immutable-input retention/cleanup, and browser convergence matrix passes. Production worker routing, live capacity evidence, consumer startup, and real-provider invocation remain disabled.

Phase 3 must still explicitly approve real asynchronous provider execution and production routing. Passing this fixture matrix alone is not authorization to enable either one.
