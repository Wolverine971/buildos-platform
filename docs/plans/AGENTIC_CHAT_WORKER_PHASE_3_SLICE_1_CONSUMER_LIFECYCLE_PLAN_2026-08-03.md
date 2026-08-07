<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_1_CONSUMER_LIFECYCLE_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 1 — Internal Consumer Lifecycle

**Prepared:** 2026-08-03 EDT  
**Status:** Implemented locally; production activation remains closed.  
**Authority:** The user's 2026-08-03 instruction to apply any required migration and continue with the next work accepts beginning Phase 3 implementation. It does not by itself open internal routing or authorize interpreting local capacity fixtures as hosted capacity.

## Migration receipt

The linked production migration ledger was checked before this slice. The Agentic Chat chain is already hosted through exact receipt `20260802037000`; there is no later Agentic migration to apply. The final Phase 2 matrix contains SQL tests and a fixture correction only. Applying the migration is therefore a verified no-op.

`supabase db push` was deliberately not used: the full local ledger includes unrelated historical gaps and unrelated 2026-08-03 migrations. A broad push would expand the authorized scope and could apply work that is not part of Agentic Chat.

## Slice boundary

This slice promotes the proven Phase 2 queue isolation into a production-shaped, still-inert lifecycle:

- `createAgenticChatConsumer(...)` constructs a separate `SupabaseQueue` and registers only `agentic_chat_turn`.
- Phase 3 Slice 1 requires `CHAT_CONCURRENCY=1`; a value of `2` is rejected until the first real load-smoke gate is recorded. It never inherits `QUEUE_BATCH_SIZE`.
- Durable polling defaults to one second. `SupabaseQueue.wake()` adds a low-latency refill hook and replays a wake that overlaps an active claim.
- Chat disables the generic stalled-job timer and instead requires the fenced Agentic Chat recovery service.
- Processor-managed lifecycle prevents generic complete/fail/retry behavior from owning chat outcomes.
- `AgenticChatConsumerRuntime` starts publisher, cancellation observation, recovery, and the queue in dependency order; drain stops recovery first, keeps cancellation/publication alive while jobs finish, and attempts every shutdown stage even after one failure.
- Startup configuration is disabled by default and cannot enable without an explicit canonical-UUID internal cohort. The consumer independently rechecks every claimed job against that cohort before invoking its executor.
- The factory requires an injected executor. It never imports or falls back to the Phase 2 fixture executor.

## Production boundary retained

At Slice 1 completion, production entrypoints did not import or start this consumer and there was no provider adapter or live capacity collector. Slices 2–5 have since added those local boundaries and mounted the lifecycle behind `AGENTIC_CHAT_WORKER_ENABLED=false`. Capacity publication and worker-mode browser negotiation remain disconnected, and every new transport decision remains legacy SSE.

## Proving coverage

`apps/worker/tests/agenticChatConsumer.test.ts` covers:

- inert construction and exact one-type registration;
- exact-one concurrency, polling, and timeout invariants;
- default-off and explicit internal-cohort parsing;
- out-of-cohort rejection before executor invocation;
- immediate wake pickup and wake-during-claim replay;
- processor-managed queue lifecycle;
- generic stalled recovery exclusion;
- service start/drain ordering;
- startup rollback;
- shutdown continuation after a service error; and
- rejection of a mixed/general queue and restart-after-drain.

Focused validation after implementation:

- `agenticChatConsumer`, `agenticChatFixtureConsumer`, and `supabaseQueueRefill`: 3 files / 21 tests passed.
- Complete worker package: 79 files / 655 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck passed.
- Touched worker source lint passed without errors or warnings.

## Continuation

Phase 3 Slice 2 is now recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_2_READ_ONLY_ASSEMBLY_PLAN_2026-08-03.md`. It assembles—but keeps default-off—the read-only turn executor boundary and live worker capacity observation:

1. preserve the consumer's internal UUID cohort check and add a durable typed terminal path for any impossible out-of-cohort claimed row;
2. assemble the hosted execution-control, immutable-input, publisher, cancellation, and recovery adapters;
3. add a constrained real provider streaming adapter behind `begin_agentic_chat_turn_execution` so no provider call can occur without the database start winner;
4. expose fresh queue/provider/publisher health evidence without opening web admission on missing, stale, or malformed evidence;
5. keep mutating tools absent, transport decisions legacy-only, and production entrypoints unchanged until the executor and capacity tests pass; and
6. leaves the provider network client, default-off startup integration, capacity publication, and internal routing gate for separately reviewed slices.

The provider-network continuation is recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_3_PROVIDER_NETWORK_CLIENT_PLAN_2026-08-03.md`, and the default-off production lifecycle mount is recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_5_PRODUCTION_LIFECYCLE_MOUNT_PLAN_2026-08-03.md`. Capacity publication, deployment/flag activation, internal routing, and paid provider use are still closed.
