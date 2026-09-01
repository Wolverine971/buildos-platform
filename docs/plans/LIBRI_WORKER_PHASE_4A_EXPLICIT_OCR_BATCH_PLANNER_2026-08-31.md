# Libri Worker Phase 4A: Explicit OCR Batch Planner

Date: 2026-08-31
Status: deployed and production-verified; queue dispatch and consumption remain disabled

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

The terminal-retry correction is carried by the append-only
`20260901014021_libri_ocr_batch_retry_guard.sql` follow-up rather than rewriting the already
committed planner migration. Its insert trigger takes the same image lock before replacing the
permanent image/version uniqueness rule with an active-generation exclusion.

The hosted ledger gate rejected the intermediate rewrite at `ac2762868` and, as designed, also
rejected the correcting `14316af3c` push when comparing it directly with that bad immediate base.
At `14316af3c`, the committed planner migration is restored byte-for-byte and the retry correction
is append-only. The next docs-only tip is the first hosted comparison whose base and head both
preserve the planner migration, so it is the authoritative deployment gate.

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

## Production receipt

Migrations `20260901012550`, `20260901014021`, and `20260901020431` were applied to Supabase
project `iwifjtlebphefldmwbkh` from an isolated work directory after a dry run listed exactly those
three versions. The post-apply receipt recorded:

- all planner, retry-guard, manifest, admission, and confirmation objects present;
- zero manifest and admission rows and zero active Libri queue jobs;
- the existing Libri Phase 3 run, step, reservation, and asset-grant counts unchanged at one each;
- BuildOS queue control hash `5d3787c8d3513d3117bcf4696776d5b5` unchanged; and
- shared queue contract hash `ff0f6cdfedfe6c889597696cec2037e0` unchanged.

Railway remained disabled with concurrency two, no target admission or step, no provider key, and
no Supabase service credential.

## Next slice

Phase 4B will add an authenticated/server-side control-plane call that invokes this planner and
shows the exact batch before enqueue. Enqueue and hosted multi-step execution remain a separate,
explicitly reviewed activation slice.
