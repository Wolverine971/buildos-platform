# Libri Worker Phase 3D: Exact Synthetic Activation

Date: 2026-08-30
Status: implemented and locally verified; Phase 3C gate passed; disabled deployment and canary pending

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

## Production sequence

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
