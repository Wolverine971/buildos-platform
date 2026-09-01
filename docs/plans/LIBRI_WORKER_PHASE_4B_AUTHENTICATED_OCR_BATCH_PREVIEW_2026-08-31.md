# Libri Worker Phase 4B: Authenticated OCR Batch Preview

Date: 2026-08-31
Status: implemented and verified locally; production deployment blocked on the full BuildOS CI gate

## Decision

BuildOS exposes one authenticated, server-only planning endpoint at
`POST /api/libri/ocr-batches/plan`. It creates or replays the exact Phase 4A database plan and
returns its reviewed manifest before any queue transport exists. The endpoint never calls
`public.add_queue_job`, never writes `public.queue_jobs`, and always reports
`transportEnqueued: false`.

The browser supplies only:

- one request UUID;
- one library UUID;
- one book UUID; and
- one to ten ordered, unique image UUIDs.

The server derives the database idempotency key from the authenticated Supabase user and request
UUID. It never accepts a caller-supplied user ID or raw idempotency namespace. The Phase 4A RPC
independently verifies that the session user is an owner or editor of the requested Libri library.

## Response review boundary

The route uses service authority only after session and strict request validation. Generated types
do not yet include custom-schema RPCs, so the custom `libri` client cast is limited to the exact
planner and manifest contracts. Every untyped value returned by PostgREST is then checked before it
can reach the caller:

- exactly one planner receipt;
- one unique step UUID per requested image;
- exact manifest cardinality and order;
- exact requested image/returned step pairing;
- a positive expected OCR version; and
- a lowercase 64-character image SHA-256.

Malformed, incomplete, reordered, or database-error receipts fail closed with a private,
non-cacheable response. PostgreSQL authorization, eligibility, and conflict codes map to 403, 400,
and 409 respectively without exposing database messages.

## Finite preview

The response repeats the reviewed limits from the Phase 4A contract:

- one attempt per image;
- at most two concurrent images;
- 100,000 microusd reserved per image;
- 50,000 output characters per image; and
- a one-hour planning deadline window.

These values are preview metadata only. Phase 4B does not register a consumer, activate Railway,
or add enqueue behavior.

The response also includes a versioned SHA-256 over the run, library, book, and exact ordered
manifest. Phase 4C requires that hash before it will record a confirmation, so a stale, reordered,
or replaced preview cannot silently cross the admission boundary.

## Verification receipt

- Focused route tests: 19/19 passed.
- Full `@buildos/web` Svelte check: 0 errors and 0 warnings.
- Focused ESLint: passed.
- Prettier and `git diff --check`: passed.
- The required Svelte code-analysis and Svelte 5 best-practice workflows were reviewed; no
  `.svelte` component was changed, so the component autofixer was not applicable.

## Deployment gate

The Phase 4A migrations remain unapplied. GitHub run `33460108936` proved that the repaired planner
migration is byte-preserved and the Libri migration scope/contracts pass inside the full job. The
dedicated Libri job correctly refused to proceed because the repository-wide BuildOS job remains
red from unrelated pre-existing failures: three unstamped legacy documents and the worker
`agenticChatTurnExecutor.test.ts` type cascade. Production must remain unchanged until a commit
containing Phase 4A passes the complete BuildOS job and the dependent Libri safety job.

## Next slice

After the full BuildOS gate is green:

1. apply the isolated Phase 4A migrations and capture pre/post database and Railway receipts;
2. deploy this Phase 4B route against the now-present planner RPC;
3. exercise one authenticated idempotent plan/replay with no queue rows; and
4. deploy Phase 4C's separate explicit admission boundary only after its own shared-system gate.
