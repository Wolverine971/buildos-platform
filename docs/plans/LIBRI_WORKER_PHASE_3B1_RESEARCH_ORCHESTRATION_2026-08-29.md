# Libri Worker Phase 3B.1: Research Orchestration Foundation

Date: 2026-08-29
Status: deployed and verified in production on 2026-08-30

## Outcome

This expansion-only slice adds the durable domain state that the future Libri consumer will claim:

- `libri.research_runs`
- `libri.research_steps`
- `public.queue_type` labels `libri_ingest`, `libri_research`, `libri_derive`, and
  `libri_maintenance`

It does not add an enqueue route, claim RPC, poller, processor, scheduled trigger, or database
credential. The deployed Railway process still requires `LIBRI_WORKER_ENABLED=false`, so applying
this migration cannot execute research work.

## Reliability contract encoded in the tables

Runs have per-library idempotency, explicit subject and queue family, a finite versioned plan,
step/depth/source/attempt/concurrency/deadline/token/cost budgets, progress counters, cancellation,
terminal reasons, and monotonic execution generation.

Steps have per-run idempotency, a bounded stage and depth, scheduling priority, attempt caps, queue
and processing-token correlation, a separate lease token, lease owner/expiry/heartbeat, monotonic
execution generation, provider/model/token/cost telemetry, and terminal result/error fields. A
leased row is rejected unless the complete queue/domain ownership envelope is present.

Queue rows are not foreign-key parents of Libri domain state. Queue retention can remove transport
history without deleting or corrupting durable run/step records.

## Access boundary

Authenticated library members can read run and step status through forced RLS. Authenticated and
anonymous clients cannot mutate either table. `service_role` temporarily has table privileges for
the later worker implementation, but the Railway consumer stays disabled until a narrower
credential or RPC boundary is tested.

## Deferred activation work

The next slices must add and independently prove:

1. an enum-array Libri-only queue claim path whose production plan uses the pending queue index;
2. atomic domain claim/heartbeat/finalize/retry/cancel/stall-recovery primitives;
3. the least-privilege worker authorization boundary; and
4. the synthetic maintenance job through every lifecycle state.

No activation flag may change in Phase 3B.1.

## Production receipt

- Supabase project: `iwifjtlebphefldmwbkh`
- Migration: `20260829232231_libri_research_orchestration.sql`
- SHA-256: `f24697fc997a93dc802ce745b960961af489c94f88f1380d50a7dc555c673a7a`
- Release gate: GitHub Actions run `33326085278` passed the complete BuildOS job and the dedicated
  PostgreSQL 15 Libri migration-safety job.
- Migration ledger: the local and hosted receipts match, and the post-apply dry run reports the
  remote database is up to date.
- Isolation proof: the non-Libri catalog signature remained exactly `9625` objects with fingerprint
  `43c6ed371bfe648af6fd924bf00f9844` before and after the migration.
- Postconditions: all ten schema, RLS, grant, emptiness, queue-isolation, and BuildOS core-table
  checks passed. Both research tables are empty and no Libri queue jobs exist.
- Advisors: no Libri-specific security or performance warnings were reported.
- Railway: all worker services were healthy after the migration. `libri-worker` remained running in
  health-only mode with `LIBRI_WORKER_ENABLED=false`; queue poll and claim flags were unset.
