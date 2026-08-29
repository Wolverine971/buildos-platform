# Libri Worker Phase 3A: Isolated Railway Bootstrap

Date: 2026-08-29
Status: implemented and locally live-smoked; Railway deployment pending

## Outcome

Phase 3A introduces a physically isolated `libri-worker` process and Railway configuration without
claiming production work. It owns no general BuildOS scheduler, general queue processor, Agentic
Chat runtime, or non-Libri processor import.

The `/health` response reports release, uptime, event-loop lag, database reachability, the four
declared Libri queue families, and zero active jobs. Startup and shutdown are idempotent, HTTP close
is bounded, and SIGTERM drains below Railway's hard shutdown window.

## Safe activation boundary

`LIBRI_WORKER_ENABLED=false` is enforced in the Phase 3A production profile. The process declares
ownership of `libri_ingest`, `libri_research`, `libri_derive`, and `libri_maintenance`, but it starts
no queue poller and registers no business processor.

That deliberate gap prevents a second service-role poller from reaching production before:

1. `libri.research_runs` and `libri.research_steps` plus leases/generation fencing exist;
2. the four queue enum values and a Libri-only enum-typed claim path are deployed;
3. the worker has a tested least-privilege credential or equally narrow database boundary; and
4. the synthetic maintenance job passes enqueue/claim/heartbeat/complete/retry/cancel recovery.

## Claim-plan finding

Production `EXPLAIN` proved that the shared `claim_pending_jobs(text[])` path casts `job_type` to
text and uses only `idx_queue_jobs_status_updated_at`. The equivalent enum-array predicate uses
`idx_queue_jobs_pending_claim_priority` with `job_type` and `scheduled_for` as index conditions.
The Libri claim path must therefore accept `public.queue_type[]`; it must not copy the text-cast
predicate into a second poller.

## Verification

The focused worker tests cover healthy/failed/recovered database probes, queue-disabled health,
idempotent start/drain, bounded HTTP close, strict hosted configuration, isolated source imports,
and exact Railway entrypoint/profile configuration.

The production build passed. A local production-profile process then reached the hosted Supabase
database and returned HTTP 200 from `/health`, with database connected, zero probe failures, all
four declared queue families, concurrency two, zero active jobs, and queue claims disabled. SIGINT
completed the bounded drain and exited zero.

Deployment must create a separate Railway service using `/railway.libri.toml`, copy only the
minimum Supabase variables required for the health probe, and keep `LIBRI_WORKER_ENABLED=false`.
