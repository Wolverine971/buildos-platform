# Libri Worker Phase 3G: Atomic OCR Execution

Date: 2026-08-31
Status: implemented and verified locally; migration and disabled release pending

## Decision

OCR execution is a bounded pipeline:

1. reserve integer-microusd budget for the exact step generation;
2. issue and redeem one opaque asset capability;
3. atomically convert the reservation to `started` and claim the exact image;
4. call the allowlisted OpenRouter model once;
5. atomically insert the OCR source chunk, settle provider usage, update the image, complete the
   shared queue row, complete the Libri step, update counters, and finalize the run.

The database-only persistence routine and the shared queue/lifecycle writes execute on the same
PostgreSQL connection and transaction. If queue or lifecycle completion fails, the OCR chunk,
image update, and cost settlement roll back with it. This closes the previous commit/completion
crash gap without placing cross-schema writes inside a Libri SQL routine.

## Duplicate-spend prevention

`libri.authorize_ocr_provider_call` locks the run, reservation, and image. Only one live exact lease
can transition a pending or failed image to `processing`. A competing step receives
`image_unavailable` while its reservation remains releasable; an already-started reservation never
renews network authority.

After authority starts, provider, timeout, missing-cost, and persistence ambiguity become
`ocr_reconciliation_required` and are not automatically retried. This preserves the ledger's rule
that paid exposure is never silently released or repeated.

## Least-privilege boundary

- All new routines and enforcement triggers are `SECURITY INVOKER` with a fixed
  `pg_catalog, libri` search path.
- The worker can update only image OCR status/version/metadata and insert/select only the exact OCR
  source-chunk columns. It cannot read object paths, write verification fields, update/delete
  chunks, access Storage, or mutate a non-Libri queue row.
- RLS plus before-write triggers reject direct invalid image transitions and non-OCR chunk writes.
- The startup probe requires the exact routines, hashing-schema usage, and reviewed columns while
  rejecting broader image/chunk privileges.
- The existing Libri migration checker remains green: no `SECURITY DEFINER`, hidden public/storage
  routine access, destructive DDL, or unreviewed shared-schema changes.

## Activation boundary

Hosted execution accepts only `disabled`, `synthetic_canary`, or `ocr_canary`. Both canary modes
require concurrency one, one exact step UUID, and an expiry one to thirty minutes ahead. OCR mode
additionally requires the broker URL/token, a single model, a maximum output-token bound, and a
positive reservation capped at 1,000,000 microusd ($1). Disabled deployments require no provider
credential.

## Verification receipt

- Disposable SQL contract passed on fresh PostgreSQL: exact authorization, second-authorization
  denial, competing-image denial, pre-start release, atomic persistence/settlement, database-derived
  SHA-256, direct-DML rejection, restricted grants, and unchanged BuildOS queue control.
- Focused activation-through-completion stack: 92/92 tests passed.
- OCR processor and atomic execution contracts: 13/13 tests passed.
- Consumer regression proves `libri_ingest` exact-step claiming and no generic double-completion.
- Worker production typecheck and focused ESLint passed.
- Earlier complete worker run passed 169 files and 1,479 tests; a final complete gate is required
  after composition formatting before deployment.

## Deployment sequence

1. Pass the complete worker, migration, SQL-contract, and BuildOS migration-safety gates.
2. Commit and push the reviewed slice on local `main`.
3. Apply `20260831220245_libri_ocr_atomic_completion` transactionally.
4. Deploy web and worker with the Libri worker disabled.
5. Configure the shared broker token and verify unauthorized/random-grant probes fail without queue
   or ledger changes.
6. Inspect one real Libri image and exact step before provisioning the provider key and opening a
   maximum thirty-minute OCR canary window.
7. Run the byte-identical non-Libri BuildOS control, then return to disabled mode immediately.

Recurring polling, recursive research, book/person discovery, and successor enqueue remain outside
this phase.
