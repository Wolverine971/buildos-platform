# Libri Worker Phase 4A: Explicit OCR Batch Planner

Date: 2026-08-31
Status: implemented locally; production migration and activation pending

## Decision

The first multi-image slice is a planning boundary, not an always-on consumer. One server-only
request may select one to ten exact images from one book and atomically create:

- one bounded `libri.research_runs` row;
- one pending `ocr_image` step per selected image; and
- one immutable `libri.ocr_batch_items` manifest row per step.

Planning creates no `public.queue_jobs` rows. The Railway worker remains disabled, and recurring
polling, recursive discovery, and successor enqueue remain absent. A later activation slice must
explicitly enqueue this already-reviewed manifest.

## Bounded contract

- Batch size: 1–10 unique image UUIDs, all from the requested book.
- Eligible image state: `pending` or `failed`; `processing` and `complete` are rejected.
- Attempts: exactly one per step.
- Concurrency: at most two.
- Deadline: one hour after planning.
- Reservation budget: 100,000 microusd ($0.10) per image, at most 1,000,000 microusd ($1) per
  batch.
- Output bound: 50,000 characters per image.
- Execution mode: manual exact batch, with recurring polling and successor enqueue explicitly
  false in the versioned run plan.

The manifest records input order, image content SHA-256, and the exact next OCR version. Image-row
locks plus an active-manifest check prevent two executable runs from planning the same paid OCR
generation. Historical manifests remain immutable, while a terminally failed, cancelled, skipped,
or dead-lettered generation may be deliberately replanned under a fresh idempotency key. Repeating
the same library/idempotency key and exact contract returns the original run and ordered step IDs;
reusing the key for a different contract is rejected.

## Access boundary

`libri.plan_explicit_ocr_batch` is `SECURITY INVOKER` with a fixed `pg_catalog, libri` search path.
Only `service_role` may execute it. The function independently requires the requesting user to be
an owner or editor of the library. Anonymous, authenticated, and `libri_worker` roles cannot call
the planner or mutate the manifest.

Authenticated library members may read manifest rows through forced RLS. The restricted Railway
worker receives no privilege on `libri.ocr_batch_items`; execution continues to depend only on the
reviewed step, lease, cost, asset-capability, and atomic-completion contracts from Phase 3.

## Transaction and isolation behavior

Image rows are locked in UUID order before the run is created, keeping overlapping planners
deadlock-resistant. Run, steps, and manifest are inserted within the function's single database
transaction. Any invalid image, duplicate image/version, or manifest conflict rolls back all three.
No external call occurs while locks are held.

This migration touches only the `libri` schema. The disposable contract stores a non-Libri
`public.queue_jobs` control signature before planning and proves the row remains byte-identical and
the queue row count remains unchanged afterward.

## Verification target

- Libri migration scope and immutable-ledger gates pass.
- All disposable PostgreSQL contracts pass, including exact creation, idempotent replay, owner/
  editor authorization, viewer denial, state denial, duplicate denial, active overlapping-generation
  denial, terminal-failure replanning, rollback, and BuildOS queue isolation.
- A linked migration dry run identifies only this migration before production apply and reports
  current afterward.
- Production pre/post receipts preserve the existing BuildOS queue control and show zero active
  Libri queue jobs.
- Railway remains `LIBRI_WORKER_ENABLED=false`, activation mode `disabled`, with no provider or
  Supabase service credential.

## Next slice

Phase 4B will add an authenticated/server-side control-plane call that invokes this planner and
shows the exact batch before enqueue. Enqueue and hosted multi-step execution remain a separate,
explicitly reviewed activation slice.
