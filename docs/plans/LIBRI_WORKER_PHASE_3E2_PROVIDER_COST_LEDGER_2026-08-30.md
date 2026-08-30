# Libri Worker Phase 3E.2: Provider Cost Ledger

Date: 2026-08-30
Status: implemented and locally verified; awaiting CI, deployment, and migration; not activated

## Decision

Every paid Libri call must pass two durable database gates before network authority:

1. reserve a positive, bounded amount of the owning run's integer-microusd budget; and
2. convert that reservation from `reserved` to `started` while the exact step generation, lease
   token, lease deadline, run deadline, and cancellation state remain current.

The provider adapter remains unwired. This slice creates accounting infrastructure only; it does
not add a provider credential, OCR queue registration, asset access, or a production processor.

## Accounting model

- Held, spent, and reconciliation state are derived from the durable ledger while the owning run
  row is locked. No mutable counter is copied onto `research_runs`, so accounting cannot drift from
  its source rows.
- `libri.provider_cost_reservations` is an append-oriented attempt ledger keyed by step, execution
  generation, and caller-supplied reservation key.
- Values use PostgreSQL `bigint` microusd. The worker adapter uses JavaScript `bigint` and sends
  decimal strings to `pg`; no financial value crosses a floating-point or JSON number boundary.
- A reservation is idempotent. Conflicting reuse of the same key fails rather than changing the
  amount, model, provider, or lease identity.
- Competing steps serialize on the run row. The sum held by concurrent reservations cannot exceed
  the operator-owned run budget.
- A reservation can be released only before provider authority begins. Once `started`, it must be
  settled or later reconciled; a crash cannot silently make the exposure available again.
- Settlement does not require the lease still to be fresh. It requires the original reservation,
  generation, and lease token so a delayed response can still be charged after execution ownership
  changes.
- Exact settlement retries are idempotent and cannot double-charge. Conflicting retries fail.
- If observed provider cost exceeds the reservation, the true cost is recorded and all future cost
  admission returns `reconciliation_required` instead of hiding the breach.

## Authorization boundary

- All routines and the transition-enforcement trigger are `SECURITY INVOKER` with a fixed
  `pg_catalog, libri` search path, preserving the repository's no-definer Libri boundary.
- The existing connection-capped, non-bypass `libri_worker` role receives only the ledger columns
  needed for the reviewed transitions. Before-write enforcement rechecks lease and budget state,
  makes reservation identity immutable, and permits only `reserved -> started`,
  `reserved -> released`, or `started -> settled`. The worker cannot change the run budget, delete
  ledger rows, or touch a non-Libri queue row.
- A successful start transition grants network authority exactly once. A retry reports
  `started` without renewing authority, preventing an ambiguous retry from issuing a duplicate
  paid request.
- RLS remains forced. No `anon` or `authenticated` ledger access is added.
- The migration changes only the `libri` schema and the existing `libri_worker` grants; it has no
  BuildOS domain-table DDL or DML.

## Local verification receipt

- Libri static migration scope passed with 9/9 migrations classified.
- All 24 self-contained disposable SQL contracts passed on PostgreSQL.
- The SQL contract proves reserve, duplicate reserve, budget denial, stale authorization,
  exact-once authorization, settlement, duplicate settlement, pre-start release, post-start release
  denial, direct-DML transition and overspend enforcement, overrun reconciliation fencing,
  restricted grants, and byte-for-byte BuildOS queue isolation.
- Concurrent PostgreSQL tests prove two 80-microusd claims cannot exceed a 100-microusd run budget,
  and two simultaneous retries of one 60-microusd key produce one ledger row and one 60-microusd
  hold.
- Focused worker tests passed 13/13 across the cost adapter, PostgreSQL race proof, and OCR provider
  boundary.
- Complete worker suite passed 165 files and 1,424 tests; 3 files and 12 live/evaluation tests were
  intentionally skipped.
- Worker production build, typecheck, ESLint, HTTP-module guard, Prettier, and `git diff --check`
  passed. Test type debt remained exactly at its established 217/217 baseline.
- The complete monorepo verification passed all 19 task equivalents, including 4,094 web tests, the
  established 354/354 web test-debt baseline, all builds, Svelte diagnostics, and migration safety.
  The default parallel web run exhausted the local macOS shared-memory ID limit before 16 PostgreSQL
  fixtures could start; rerunning the complete 646-file web suite with two workers passed 646/646.

## Remaining gates before OCR wiring

1. Pass the complete worker and repository suites and the test-debt baseline.
2. Commit and push only after the prior OCR-boundary CI run and Railway release are healthy.
3. Pass the new main-branch BuildOS and Libri migration-safety jobs.
4. Apply exactly this migration to production, re-probe the restricted role, and verify the empty
   provider ledger appears without mutating existing Libri rows or BuildOS controls.
5. Deploy and keep `LIBRI_WORKER_ENABLED=false`; do not add an OpenRouter key.
6. Build the lease-validating private asset broker before any real image can be fetched.
