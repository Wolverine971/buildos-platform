# Libri Worker Phase 3G: Atomic OCR Execution

Date: 2026-08-31
Status: deployed, production-canary verified, sanitized, and complete; recurring polling disabled

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
- The startup probe requires the exact routines, core `pg_catalog.sha256` access, and reviewed
  columns while rejecting the shared `extensions` schema and broader image/chunk privileges.
- The existing Libri migration checker remains green: no `SECURITY DEFINER`, hidden public/storage
  routine access, destructive DDL, or unreviewed shared-schema changes.

## Activation boundary

Hosted execution accepts only `disabled`, `synthetic_canary`, or `ocr_canary`. Both canary modes
require concurrency one, one exact step UUID, and an expiry one to thirty minutes ahead. OCR mode
additionally requires the broker URL/token, a single model, a maximum output-token bound, and a
positive reservation capped at 1,000,000 microusd ($1). Disabled deployments require no provider
credential.

## Verification receipt

- `39290e149` implemented Phase 3G and `62f2e85d3` restored the worker test-type baseline.
  `bba27f4f1` replaced the two OCR hash expressions with `pg_catalog.sha256`, because granting
  `extensions` schema usage would have exposed 72 executable extension routines to the worker.
- Local gates passed: 28/28 disposable PostgreSQL contracts, 32/32 restricted-database unit tests,
  worker production typecheck, and the fixed 217/217 test-type baseline.
- GitHub CI run `33450486746` passed the full BuildOS job in 28m05s and the dedicated PostgreSQL 15
  Libri migration-safety job in 1m05s.
- Production migrations `20260831220245_libri_ocr_atomic_completion` and
  `20260831223000_libri_ocr_core_sha256` are applied; a linked dry run reports the database current.
- The production restricted-role probe passes while `extensions` remains inaccessible, object paths
  remain unreadable, and no Supabase service key is present on the worker.

## Production OCR canary

- Run `714448cd-17a0-43fc-955e-069545a4f9af` and step
  `992afcc4-bd00-4091-a269-70d0762f1b1c` were the only admitted work. The step had
  `max_attempts=1`, concurrency was one, and the hosted profile carried an exact step UUID plus a
  twenty-minute expiry.
- Image `4c3e1b23-60b5-5d44-92bd-20d31ee434cf` advanced atomically from failed OCR version 6 to
  complete version 7. Run, step, and shared queue row all completed with no error.
- Reservation `3891a4e7-69a9-4262-841d-1fef9b74a620` settled exactly once at 1,176 microusd
  ($0.001176): 2,411 prompt tokens and 132 completion tokens on `openai/gpt-4.1-mini`.
- OCR chunk `30f1969d-fb5a-44b7-9d78-e01c165f1758` contains 370 characters, a database-verified
  SHA-256, and the exact version-7 idempotency key. The one asset grant was consumed.
- The non-Libri BuildOS queue control remained byte-identical at MD5
  `7e89ac7606ab26280c7b1c66f5ee51b2`; active Libri queue jobs returned to zero.
- Final Railway deployment `14abb8b5-a79d-412a-a51d-40791bb4fa9f` succeeded on `bba27f4f1` with
  disabled mode, concurrency two, no target/expiry, no provider key, and no Supabase service key.

## Phase boundary

Phase 3 is complete. Recurring polling, recursive research, book/person discovery, successor
enqueue, and multi-image orchestration remain outside this phase and require a separately reviewed
Phase 4 plan.

Recurring polling, recursive research, book/person discovery, and successor enqueue remain outside
this phase.
