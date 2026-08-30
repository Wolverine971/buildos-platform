# Libri Worker Phase 3C: Synthetic Maintenance Consumer

Date: 2026-08-30
Status: implemented and locally verified; disabled deployment and exact activation canary pending

## Outcome

This slice adds the first owned poll-and-process loop on top of the Phase 3B transactional
lifecycle. It is deliberately restricted to `libri_maintenance` and one versioned payload:

```json
{
	"version": 1,
	"kind": "synthetic_smoke",
	"nonce": "optional bounded string"
}
```

The processor performs no network call, catalog mutation, model request, recursive enqueue, or
follow-on work. Its only effect is the already-fenced queue/step/run completion transaction with a
small deterministic result and zero usage/cost telemetry.

## Consumer boundary

- The lifecycle claim now accepts an optional validated subset of registered Libri queue types.
- This consumer always claims through the enum array `['libri_maintenance']`; it cannot claim
  ingest, research, derive, or any BuildOS queue family.
- Concurrency is capped at two, durable polling is at least 500 ms, the worker timeout is below the
  lease duration, and heartbeats occur before half the lease can elapse.
- Unsupported payloads terminally fail instead of retrying forever.
- Unknown processor failures retry through the fenced lifecycle; stale heartbeat/completion owners
  cannot write terminal state.
- Shutdown stops new claims, aborts active processor signals, returns interrupted work for retry,
  drains active promises, and only then closes the database pool.

## Bootstrap and health

The dedicated entrypoint owns the maintenance consumer but starts it only when the parsed queue flag
is enabled. An enabled startup fails closed if the initial restricted database probe fails. Health
now reports consumer status, active/available slots, the last successful claim, and consecutive
claim failures. The hosted production profile still rejects `LIBRI_WORKER_ENABLED=true`, so merely
deploying this code cannot consume a job.

## Verification

- Focused lifecycle/database/bootstrap/consumer suites: 35 tests passed.
- Restricted-role disposable PostgreSQL contract: 5 scenarios passed, including the real consumer
  claiming and completing the synthetic maintenance payload through RLS.
- Full worker suite on the rebased BuildOS main tree: 162 files / 1,409 tests passed; 3 live-only
  files / 12 tests skipped.
- Worker source typecheck passed.
- Worker test type debt remained exactly 217/217 at baseline.
- Worker lint and HTTP module guard passed cleanly.

Nine orphaned disposable PostgreSQL test servers, all parented by PID 1 and using exact
`/tmp/buildos-*` data directories from earlier test runs, were stopped before the PostgreSQL proof.
The normal local PostgreSQL 16 service was not touched.

## Release gates

1. The Phase 3B.3 lifecycle GitHub gate must finish green before this commit can advance.
2. Deploy this image with `LIBRI_WORKER_ENABLED=false` and confirm all three Railway workers remain
   healthy on the same release.
3. Change the hosted production gate from absolute-off to an explicit synthetic-canary profile.
4. Seed exactly one synthetic maintenance run/step, enable one replica at concurrency one, and prove
   automatic claim/completion plus unchanged non-Libri control and catalog fingerprint.
5. Return the worker to disabled immediately after the canary. Recurring or real research work is a
   later processor slice.
