# Libri Worker Phase 3C: Synthetic Maintenance Consumer

Date: 2026-08-30
Status: deployed, exact synthetic activation canaried, and complete; recurring polling disabled

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

## Production release receipt

Commit `27e08de55224d1b34008c2e51ea36f3c5818e253` deployed the maintenance consumer with
`LIBRI_WORKER_ENABLED=false`. A one-line follow-up commit,
`702f90ad42c1b81017681f104c01f63763003b21`, raised the coverage-only architecture scan timeout
from the implicit 5-second default to 15 seconds after the first release gate exceeded the old
limit under runner contention. The assertion and scan scope were unchanged; the package's full
173-test coverage suite passed locally before the follow-up deployed.

The follow-up release reached `SUCCESS` on every Railway service:

- `agentic-chat-worker`: deployment `068a7a3f-3b7a-4712-ab91-3f27365fd68e`, four running replicas;
- `daily-brief-worker`: deployment `b6975a34-169b-4629-9201-a9a6e5e9d254`, one running replica; and
- `libri-worker`: deployment `2e6fd5c4-a6ef-48ae-9d03-381f9f4ad5e7`, one running replica.

The Libri service remained disabled with the restricted database URL and CA present and both the
broad Supabase service key and public Supabase URL absent. Its new deployment log contained only
container startup and no warning or error. Production still held one library, zero research runs,
zero research steps, and zero Libri queue rows. The eight reviewed Libri migrations were present,
and the `libri_worker` role remained a non-superuser, non-RLS-bypass login capped at three
connections.

GitHub Actions run `33336106083` passed the full BuildOS repository contract, monorepo coverage,
deep-research database suite, self-contained Supabase SQL contracts, and the dependent PostgreSQL
15 `Libri migration safety` job. The jobs completed in 28m4s and 1m2s respectively.

## Release gates

1. The Phase 3B.3 lifecycle GitHub gate must finish green before this commit can advance. Passed.
2. Deploy this image with `LIBRI_WORKER_ENABLED=false` and confirm all three Railway workers remain
   healthy on the same release. Passed.
3. Require the full BuildOS and dependent `Libri migration safety` jobs on the disabled release.
   Passed.
4. Change the hosted production gate from absolute-off to an explicit synthetic-canary profile.
5. Seed an exact synthetic maintenance canary plus isolation controls, enable one replica at
   concurrency one, and prove exact claim/completion plus unchanged controls.
6. Return the worker to disabled immediately after the canary. Recurring or real research work is a
   later processor slice.
