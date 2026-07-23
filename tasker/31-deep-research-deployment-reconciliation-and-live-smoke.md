<!-- tasker/31-deep-research-deployment-reconciliation-and-live-smoke.md -->

# 31 — Deep Research Deployment, Reconciliation & Live Smoke

**Created 2026-07-19.** Owner: worker / platform reliability engineer.  
**Type:** production-readiness handoff.  
**Depends on:** V0.1 migrations and worker code; task 29 before unrestricted production rollout.

## Outcome

The orchestration schema is deployed safely, stranded runs recover automatically, and a real
Tavily/OpenRouter run proves the complete queue → children → synthesis → chat-return path.

## Migration boundary

Apply only the timestamped files in `supabase/migrations/`:

- `20260719010000_agent_run_effort.sql`
- `20260719020000_deep_research_orchestration.sql`
- `20260719030000_agent_run_cost_ledger.sql`
- `20260719040000_agent_run_cost_reconciliation.sql`
- `20260719050000_agent_run_cost_rpc_privileges.sql`

`apps/worker/tests/integration/fixtures/deep-research-base.sql` is test scaffolding for disposable
Postgres. It is **not** a production migration and must never be applied to a real environment.

## Work packages

### WP-1 — Schema deploy and verification (P0, privilege hardening deployed)

Drain or explicitly terminate any pre-ledger active deep-research runs, apply migrations in
staging, regenerate types, and verify constraints/indexes/RLS/RPC behavior from both user and
service-role paths. Test migration rollback in a disposable database; do not improvise a
production rollback after launch.

2026-07-19 checkpoint: the first four migrations are deployed on the configured production project.

2026-07-20 update: the fifth migration (`20260719050000`) **is deployed** (verified live), and the
`20260720010000_deep_research_hardening.sql` migration is **also deployed** (atomic transaction,
preconditions checked). Anonymous/authenticated denial is re-verified for every cost RPC, the ledger
table, and — after the hardening migration closed a missed grant — `queue_deep_research_synthesis`
(all return 42501); `service_role` retains access. The disposable-PostgreSQL suite is now 31 cases
and wired into CI. Reconciliation remains disabled pending deliberate live-provider observation.
Type regeneration remains blocked because `SUPABASE_ACCESS_TOKEN` is unavailable. A staging rollback
rehearsal remains open.

### WP-2 — Real-provider smoke (P0)

Run one tightly capped research request with real Tavily and OpenRouter credentials. Record:

- root/child rows and queue jobs;
- permissions/depth/concurrency/budgets;
- progress and terminal events;
- provider request ids, Tavily credits, and total cost;
- one `reserved → settled` ledger lifecycle per paid call, with root totals inside the ceiling;
- final chat injection and report/source quality;
- cancellation during research and before synthesis.

The smoke budget must be explicit and small; do not use the `$10` validation ceiling. **Runbook:**
`apps/web/docs/technical/architecture/agent-work/DEEP_RESEARCH_BAKEOFF_RUNBOOK.md` (scoped worker,
Railway-pause, driver, gotchas, and what to verify on re-run).

2026-07-20 update: a capped live smoke DID run — four real deep-research runs ($0.23 total)
against production Supabase via a local scoped worker (Railway paused, `agent_run`-only). Results
in `apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md` ("Live $2 bake-off").
Smoke verdict: the reserve→settle ledger lifecycle works for the coordinator (verified live in Q2
fan-out), BUT (1) **BLOCKER**: budgeted powerful-lane calls fail with OpenRouter `404 — no
endpoints satisfy max_price` (catalog price below real endpoint price), failing every fan-out
synthesis; (2) failures degrade silently to `partial`; (3) child/single-run turn calls produced
zero ledger rows — WP-2's "one reserved→settled per paid call" is not yet met. Fix list in the
audit doc. Re-run this smoke after the `max_price` fix.

2026-07-22 update: the four-case smoke was rerun after that fix wave. Paid-attempt coverage passed
(35 rows; 34 settled, one false-conservative route-404 reconciliation row), and known actual spend
was `$0.17764437`. End-to-end quality did **not** pass: fan-out children exhausted the 20,000-token
target before submitting evidence packets; the two single runs hit ZDR/no-endpoint and null-content
provider failures; a slow live job was reclaimed at 120 seconds while still executing; and one
successful visit failed telemetry persistence. Token-target finalization, separately reserved
fallback, definitive route-rejection release, telemetry sanitation, and a processing-token-fenced
queue heartbeat are fixed locally. WP-2 remains open until those changes are deployed and the smoke
produces auditable terminal output without duplicate execution.

Final 2026-07-22 remediation smoke: after detecting and stopping an accidental repo-wide local
worker, the batch was repeated with exactly one web-only server and one scoped `agent_run` worker.
All 55 paid attempts were terminal (50 settled, 5 released), children/direct runs respected their
token envelopes, slow calls were not stall-reclaimed, and pre-generation route failures released
their reservations. The clean batch spent `$0.267794599`; the full diagnostic session remained
`$1.0041 / $2`.

Two additional live defects were fixed locally: an unread redirect response could make SSRF-safe
web visit hang while awaiting `dispatcher.close()` (now destroyed per hop), and a queue redelivery
could skip a still-`running` Agent Run (now a retry ordinal reclaims it and reconstructs usage from
the durable ledger). Runtime/cost WP-2 now passes against production data, but production deploy
verification, reconciliation enablement, restart/duplicate-delivery proof, cancellation smokes,
rollback rehearsal, and guarded rollout remain open. Quality rollout remains blocked by task 33.

### WP-3 — Stranded-run reconciler (P0, cost + run-state slices built locally)

Built for stale cost rows: database lease claims, bounded attempts/backoff, OpenRouter generation
lookup, conservative operator routing for unsupported providers, and a five-minute scheduler
behind `AGENT_RUN_COST_RECONCILIATION_ENABLED`.

A bounded read-only operator report is also built. Its first deployed-ledger read found zero rows
older than ten minutes and zero unresolved exposure.

The scheduled non-cost sweep is now built locally. It covers jobless queued/running continuations,
roots waiting with settled children, partial deterministic dispatch, dead synthesis leases,
terminal parents with non-terminal children, and wall-clock-bounded terminalization. It is
idempotent across overlapping sweeps and skips runs with live pending/processing jobs. Disposable
PostgreSQL tests cover the DB-backed wake/dedupe/cleanup paths.

Still open: deployed overlapping-sweep/worker-restart proof and provider proof for stale cost
reservations/operator escalation.

Recovery must be idempotent and bounded by the original wall-clock deadline.

### WP-4 — Queue and lease hardening (P0)

Prove duplicate delivery, worker restart, child completion races, parent cancellation, and partial
dispatch do not create extra children or duplicate synthesis. Add observable attempt/lease data and
dead-letter handling.

2026-07-22 local fix: the shared queue now heartbeats a processing claim at one-third of its stalled
timeout (bounded to 5–60 seconds) and fences updates by `status='processing'` plus the exact
`processing_token`. This addresses the live 120-second reclaim race without allowing a stale worker
to revive a reassigned job. Deployed slow-provider/duplicate-delivery proof remains open.

### WP-5 — Rollout and operations (P1)

Ship behind a feature flag with per-user allowlist, dashboards for status/latency/cost/failures,
alerts for stranded runs and budget violations, and a documented kill switch. Expand gradually
after task 33 quality gates pass.

## Definition of done

- Staging real-provider smoke passes with cost attribution and no unauthorized op.
- Every enumerated stranded state either self-recovers or terminates explicitly.
- Duplicate queue delivery cannot duplicate children, paid calls, or final chat messages.
- Operations has a kill switch, dashboards, and an incident runbook.
