# Libri Worker Phase 3D: Exact Synthetic Activation

Date: 2026-08-30
Status: deployed, release-gated, production-canaried, cleaned, and complete; recurring polling disabled

## Outcome

This slice replaces the production absolute-off gate with a bounded activation profile. It still
cannot run ingest, research, derive, model, network, recursive, or BuildOS work. An enabled hosted
process must satisfy every condition below:

- `LIBRI_WORKER_PROFILE=production`
- `LIBRI_WORKER_ACTIVATION_MODE=synthetic_canary`
- `LIBRI_WORKER_CONCURRENCY=1`
- one valid `LIBRI_WORKER_CANARY_STEP_ID`
- one `LIBRI_WORKER_CANARY_EXPIRES_AT` timestamp between now and 30 minutes ahead

The lifecycle claim is additionally filtered by `metadata.researchStepId`, so the process can claim
only the configured step UUID. Queue-family filtering remains fixed to `libri_maintenance`, and the
processor still accepts only the versioned, zero-cost `synthetic_smoke` payload.

## Failure containment

- A missing, malformed, expired, or over-30-minute activation profile fails startup.
- The consumer fails health and stops claiming when its deadline passes.
- A claim that returns after shutdown or expiry is immediately aborted and returned through the
  fenced retry transaction.
- The exact step filter is part of the transactional `FOR UPDATE SKIP LOCKED` selection, not an
  in-memory check after a broad claim.
- Disabled production behavior is unchanged when `LIBRI_WORKER_ENABLED=false`.

## Verification

- Focused lifecycle/database/bootstrap/consumer suites: 37 tests passed.
- Restricted-role disposable PostgreSQL contract: 5 scenarios passed.
- The real consumer proof queued a higher-priority maintenance decoy and the configured canary; the
  decoy remained pending while only the configured step completed.
- Full worker suite: 162 files / 1,411 tests passed; 3 live-only files / 12 tests skipped.
- Worker lint, source typecheck, and HTTP module guard passed cleanly.

## Production release receipt

Commit `f1922ca8f38e5d1471d60c388299590bad57f3a0` deployed the exact activation gate while
`LIBRI_WORKER_ENABLED=false`. The disabled release reached `SUCCESS` on all watched Railway
services:

- `agentic-chat-worker`: deployment `8dccb442-0cdd-4c33-af73-6da6af3f4d3b`, four running replicas;
- `daily-brief-worker`: deployment `e10806f1-29a0-43cc-a416-4e2033a43551`, one running replica; and
- `libri-worker`: deployment `15927e60-cb64-4413-88ae-5a9c4829d5fe`, one running replica.

GitHub Actions run `33337502378` passed the full BuildOS repository contract, monorepo coverage,
deep-research database suite, self-contained Supabase SQL contracts, and the dependent PostgreSQL
15 `Libri migration safety` job. The jobs completed in 28m50s and 1m28s respectively. The complete
worker suite also passed locally with 162 files / 1,411 tests; 3 live-only files / 12 tests were
skipped.

## Production canary receipt

The final preflight found all eight reviewed Libri migrations, one existing library, zero research
runs, zero research steps, and zero Libri queue rows. The `libri_worker` login remained a
non-superuser, non-RLS-bypass role capped at three connections. The service held only the
restricted database URL and CA; no Supabase service key was present.

Guarded setup then created:

- exact canary step `b8b1b4d9-fc0e-40a5-ade1-091d64e38e00` at priority 100;
- higher-priority maintenance decoy step `99e7eddd-81eb-4723-8f24-4fa8d46d3106` at priority 1; and
- one completed non-Libri queue control with baseline MD5
  `b1f3c2ce0ecdc5babad27d40d94268b6`.

While still disabled, Railway was configured for `synthetic_canary`, concurrency one, the exact
canary step UUID, and a 29-minute expiry. Setting only `LIBRI_WORKER_ENABLED=true` created deployment
`6a0f846f-5994-4795-b4f5-ecd95f64875a`. The replica automatically completed the configured step
once with the expected version, kind, and nonce. It wrote `provider=synthetic`, `model=none`, zero
prompt tokens, zero completion tokens, and zero cost.

The priority-1 decoy remained pending/queued at zero attempts, proving the exact transactional step
filter overrode normal priority ordering. The non-Libri control remained byte-identical at the same
MD5. The replica was immediately set back to disabled with concurrency two. Replacement deployment
`cc99bad1-40a6-4be0-a1a4-798053254870` reached `SUCCESS`, the activation envelope was neutralized,
and the enabled replica logged a graceful SIGTERM drain with no warning or error.

Cleanup first revalidated every exact canary result, zero-cost field, untouched decoy state, and
control hash. It then deleted only the three recorded queue rows and two recorded runs; the two
recorded steps cascaded from those exact runs. The final audit restored one library, zero research
runs, zero research steps, and zero Libri queue rows while preserving the eight-migration ledger and
the restricted worker role.

## Production sequence (completed)

1. Require the disabled Phase 3C release CI and Libri migration-safety job to pass.
2. Deploy this gate with `LIBRI_WORKER_ENABLED=false` and confirm all workers are healthy.
3. Record the non-Libri control hash and catalog fingerprint; require zero active Libri jobs.
4. Seed one one-step `libri_maintenance` canary, one higher-priority maintenance decoy, and one
   completed non-Libri control row; record every exact ID and the control hash.
5. Set only the canary step UUID, concurrency one, activation mode, and a short expiry while still
   disabled.
6. Enable the one Libri replica, prove that only the exact canary completes while the higher-priority
   decoy remains pending and the non-Libri control remains byte-identical, then immediately set
   `LIBRI_WORKER_ENABLED=false` again.
7. Confirm the disabled replacement deployment is healthy and delete only the recorded canary,
   decoy, and control rows.

Recurring polling and real research processors remain out of scope after this canary.

## Next activation boundary

Production remains disabled. The next slice must select one real Libri work kind, define its
provider and budget contract, prove enqueue idempotency and terminal-state behavior locally, and
ship disabled before any recurring scheduler or broad queue-family activation is considered. The
exact-step canary profile is not an authorization to leave the worker enabled.
