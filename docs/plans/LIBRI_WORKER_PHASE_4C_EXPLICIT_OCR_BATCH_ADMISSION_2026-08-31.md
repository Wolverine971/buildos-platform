# Libri Worker Phase 4C: Explicit OCR Batch Admission

Date: 2026-08-31
Status: implemented and verified locally; not pushed or deployed while the shared BuildOS gate is red

## Decision

Phase 4C adds a second, explicit operator action after the Phase 4B preview. It records one exact
OCR batch admission at `POST /api/libri/ocr-batches/confirm`, but it still does not insert into
`public.queue_jobs`, link a queue row to a research step, activate Railway, or call an OCR provider.

The separation is intentional:

1. Phase 4B plans and displays the exact finite work.
2. Phase 4C confirms the reviewed manifest into a Libri-owned admission outbox.
3. A later default-off Railway dispatcher will atomically translate that admission into the shared
   BuildOS queue.

This avoids a web-side multi-transaction enqueue. Calling `public.add_queue_job` once per image and
then linking Libri steps in later requests could leave visible orphan jobs if the web process died
between operations. It would also weaken the migration firewall by putting shared BuildOS queue
mutations inside a Libri database routine. Phase 4C does neither.

## Database boundary

Migration `20260901020431_libri_explicit_ocr_batch_admission.sql` creates:

- `libri.ocr_batch_admissions`, with one row per research run and one globally unique confirmation
  UUID;
- forced RLS and no authenticated or `libri_worker` table privileges;
- a service-role-only, `SECURITY INVOKER`, fixed-search-path confirmation function; and
- a small status/time index for the later dispatcher.

The function locks the research run and independently checks:

- the caller is the same owner/editor who requested the plan;
- the run is the exact bounded `ocr_book_batch` contract for the requested book;
- the run remains queued, un-cancelled, and inside its deadline for a first confirmation;
- every step is pending, unattempted, one-attempt OCR with no active queue row; and
- the ordered step IDs, image IDs, expected OCR versions, and source SHA-256 values exactly match
  the immutable Phase 4A manifest.

An exact replay returns the original admission. Replays continue to work after a future dispatcher
marks the admission enqueued, even when the run and steps have advanced; conflicting confirmation
IDs, users, hashes, or manifests fail closed. The migration contains no `public` or `storage`
mutation and preserves the existing BuildOS queue control row byte-for-byte in its disposable
contract.

## Server boundary

The confirmation endpoint accepts only:

- a confirmation UUID;
- a library UUID;
- a book UUID;
- the planned run UUID; and
- the 64-character manifest SHA-256 returned by Phase 4B.

It authenticates first, reads the manifest through the caller's RLS-scoped Supabase session, and
recomputes the canonical hash. Service authority is created only after the hash matches. The server
then passes the exact reviewed arrays and authenticated user ID to the database function. Callers
cannot provide a user ID, queue type, priority, schedule, worker activation flag, or queue payload.

Responses remain private and non-cacheable. A successful first confirmation reports
`status: confirmed` and `transportEnqueued: false`. A later exact replay may truthfully report
`transportEnqueued: true` only after the database admission status has been advanced by a future
dispatcher.

## Verification receipt

- Migration ledger: 413 files valid.
- Libri migration scope: 15 migrations valid; 26/26 guard tests passed.
- Disposable PostgreSQL contracts: 31/31 passed, including first confirmation, exact replay,
  rejected user/manifest changes, enqueued replay, and an unchanged BuildOS queue control.
- Focused web route tests: 43/43 passed across Phase 4B and Phase 4C.
- Full `@buildos/web` Svelte check: 0 errors and 0 warnings.
- Focused ESLint and Prettier: passed.
- Server-route size guard: passed with no new oversized route.

No `.svelte` component changed, so the Svelte component autofixer was not applicable.

## Deployment gate

Production remains unchanged. The Phase 4A planner and retry-guard migrations are still absent,
there are zero active Libri queue jobs, the stable BuildOS queue control hash remains
`5d3787c8d3513d3117bcf4696776d5b5`, and the Railway service remains disabled with concurrency two,
no canary scope, no provider key, and no Supabase service key.

GitHub run `33460108936` remains red from unrelated repository-wide documentation and worker type
failures. The dedicated Libri job correctly refuses migration deployment until the full BuildOS job
passes. Phase 4C must not be pushed to a production-deploying web branch or applied to Supabase while
that gate is closed.

## Next slice

Phase 4D should add the default-off Railway admission dispatcher. It should use the restricted
`libri_worker` PostgreSQL role and one direct transaction to:

1. claim one explicitly scoped admission;
2. lock the run and all ordered steps;
3. create the exact deduplicated `libri_ingest` queue rows;
4. link every step to its queue row;
5. mark the admission enqueued; and
6. commit all of those changes together or none of them.

The first deployment must remain disabled. A later canary must pin one admission/run, use no
recursive discovery or successor enqueue, and pass the same BuildOS pre/post control checks before
any OCR provider key is provisioned.
