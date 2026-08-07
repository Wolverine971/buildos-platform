<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_6_INERT_FIXTURE_CONSUMER_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 2D Slice 6 — Inert Fixture Consumer Kernel

**Implemented:** 2026-08-03 EDT  
**State:** Fixture-consumer, fake mutating-effect, durable stalled-recovery, pool-isolation, and first 100-turn load units complete; not imported or started by a production entrypoint.

## Purpose

Compose the hosted claim/start/recovery/finalization and effect primitives, immutable input artifact, bounded publisher, and cancellation observer into one executable fake-provider/read-tool/mutating-tool kernel. Keep it inert while proving interruption recovery, queue-pool isolation, and the first 100-turn publisher/PostgreSQL measurement.

## Queue isolation

`SupabaseQueue` now supports a per-processor `processor_managed` lifecycle and processor-scoped timeout. For such jobs the generic wrapper still owns claim slots, heartbeat, timeout abort, and drain, but never calls generic complete/fail/retry RPCs. The processing job exposes the database `queue_jobs.id` separately from the existing human queue id.

`fixtureConsumer.ts` constructs a new queue instance registered only for `agentic_chat_turn`, with independent concurrency, poll, worker-timeout, stalled-timeout, and drain policy. The factory does not start the queue. Neither `worker.ts` nor another production entrypoint imports it.

The isolation fixture runs a saturated 20-slot general queue beside a 2-slot chat queue. Each instance calls `claim_pending_jobs` with only its own registered `p_job_types`; both pools run concurrently, and the chat processor never consumes or completes a general job.

## Strict execution adapters

- `executionControl.ts` invokes and parses the exact claim, provider-start, recovery, terminal-finalize, and queue-completion RPCs. It rejects malformed authority, scope, generation, retry flags, deterministic terminal ids, and terminal message/failure relationships.
- Idempotent `already_terminal` parsing returns the committed winner even when a stale caller attempted a different status or an older generation. Only a newly `finalized` receipt must equal the requested status/generation.
- `executionInput.ts` loads the exact fenced command and retained input artifact, verifies all turn/queue/user/session/correlation/generation relationships, request binding, canonical content hash/byte metadata, lineage, and retention, and never reloads mutable source history/prepared rows.

## Fixture executor

`fixtureTurnExecutor.ts`:

1. validates the queue envelope and claims the domain generation;
2. registers one batched cancellation observation and loads immutable input;
3. calls the immediate-before-provider start RPC and invokes the provider only for the single `started/invoke_provider=true` receipt;
4. streams fake text and read-tool call/result events through the bounded publisher;
5. stores deterministic full semantic events in the UI projection so the projection watermark cannot skip tool state on reconnect;
6. combines queue timeout, durable cancellation, and publisher overload into typed recovery;
7. finalizes terminal database truth before terminal Broadcast; and
8. completes a newly completed queue row or asks chat recovery to reconcile failed/cancelled/already-terminal truth.

Publisher abandonment explicitly rejects and detaches pending writes during terminal convergence; an in-flight fenced database receipt can never Broadcast after abandonment. A `return await` cleanup regression found by the worker-wide gate was corrected so publisher teardown cannot run before cancellation/overload recovery captures and finalizes the partial prefix.

## Fake mutating-effect boundary

- `effectControl.ts` strictly invokes and parses the hosted reserve, begin, and reconcile RPCs. It verifies the complete effect/turn/session/user/capability scope, permits a duplicate receipt from its original reservation generation, and rejects every contradictory state/timestamp/receipt/authority shape.
- `effectIdentity.ts` derives one stable UUID from the turn plus a runtime-owned logical-operation UUID, independently canonicalizes and hashes arguments, and emits the downstream key `chat-effect:<effect_id>`. Provider tool-call id and execution generation are absent from the identity.
- `fixtureMutationExecutor.ts` reserves first, rechecks cancellation before begin, invokes only the exact `started/invokeAdapter=true` winner, and records the downstream result before the turn continues. A committed duplicate replays its receipt without begin or reinvocation.
- Idempotent downstream retries reuse the exact effect key. A non-queryable possible commit is attempted once, recorded `uncertain`, classified `uncertain_external_commit`, and handed to chat recovery without terminal finalization or full-turn retry.
- The provider fixture now accepts a `mutating_tool` step and emits reconnect-safe call/result semantics only through this boundary. Effect uncertainty outranks concurrent cancellation in recovery classification.

## Durable stalled recovery

- `recoverySnapshot.ts` loads one generation-locked reconciliation snapshot from durable database truth, verifies a complete contiguous event window, deterministic event identities, terminal projection completeness, and exact assistant-message/text agreement.
- `stalledRecovery.ts` reads only old `processing` `agentic_chat_turn` queue rows. It performs no direct state reset and first presents the exact existing processing token to the domain claim RPC.
- Safe pre-start interruption can requeue. Post-start failure/cancellation finalizes from the durable assistant-text/projection prefix, performs no Broadcast, and calls recovery again to converge queue truth. Effect uncertainty remains manual and ownership loss stops immediately.
- Sweeps coalesce, drain within a configured bound, isolate optional telemetry failures, and cannot restart after shutdown.

## 100-turn load evidence

The in-memory fixture registers 100 active generations in one cancellation observer and one bounded publisher. One observation RPC carries all 100 pairs. Holding the first text write produces a deterministic peak of 100 pending events / 102,400 bytes—below the default 256-event / 2 MiB soft limits—and drains as one immediate item plus one 99-item batch.

The disposable PostgreSQL fixture measures the same 100-turn text-only cadence after seeding, so setup cost is outside the sample. The complete-suite sample recorded:

- 102 logical RPC calls: one text flush, 100 exact delivery acknowledgements, one cancellation observation;
- 300 affected turn/stream rows;
- 234,000 flush-payload bytes and 8,400 cancellation-payload bytes;
- 448,376 WAL bytes total / 4,483.76 bytes per turn;
- 23.30 ms text flush and 69.68 ms total under concurrent test load; and
- no semantic event rows, false cancellations, cursor gaps, or lingering reconciliation flags.

The synthetic fixture fails above 64 KiB WAL per turn, 2 seconds for the text flush, or 5 seconds total. These intentionally conservative ceilings guard local regression only; they do not claim hosted database headroom or authorize a production worker.

## Proof

Focused Agentic worker/queue coverage is 12 files / 78 tests. The executor/effect/recovery/load matrix proves:

- text plus a read-only fake tool and reconnect-safe semantic projection;
- explicit provider finish/usage and terminal ordering;
- immutable-input database failure requeue before provider start;
- durable cancellation with exact partial text;
- completion/cancellation terminal-winner convergence;
- publisher hard-bound overload to non-retry terminal failure;
- domain completion surviving an unacknowledged queue completion;
- chat-only queue identity, lifecycle, and processor-scoped timeout isolation;
- stable logical effect identity and canonical argument conflict hashing;
- reserve/cancel-before-begin with zero mutation invocation;
- single-winner mutation authority and committed-receipt replay;
- same-key idempotent downstream retry;
- non-queryable crash convergence to `uncertain` without retry or terminalization;
- lost/already-committed provider-start responses without a second invocation;
- stale start generations with no publish or terminal write; and
- a provider ignoring abort without persisting beyond the durable cancel prefix;
- exact process-interruption recovery from durable partial output;
- stale concurrent sweeper loss, bounded drain, and no restart after shutdown;
- one 100-pair cancel query, bounded publisher pressure, and exact batch drain; and
- independent saturated general/chat queue slots with zero cross-pool claims.

The complete worker package passes 78 files / 640 tests with one additional explicitly skipped opt-in workflow file/test. The complete Agentic Chat web/service/PostgreSQL suite passes 105 files / 861 tests. Worker typecheck and full lint pass; the 170 lint warnings are pre-existing and none are in the touched Agentic Chat source. Shared types pass 24/24 plus typecheck and CJS/ESM/declaration build. Whole-worktree `svelte-check` is currently blocked by one unrelated user-owned Gmail reconnect edit in `DashboardInboxModal.svelte`: its custom `onbuildosaiinboxchanged` window attribute is not declared in `SvelteWindowAttributes`. The Agentic Chat paths emit no check diagnostic.

## Not yet complete

This is not the full Phase 2 exit matrix. Next work must add the composed supersede/terminal-wait flow, any still-uncovered two-scheduler start/cancel ordering at the executor boundary, immutable-history retry-generation proof, and prepared-artifact TTL/cleanup proof. No real provider or production routing is allowed before those gates close.
