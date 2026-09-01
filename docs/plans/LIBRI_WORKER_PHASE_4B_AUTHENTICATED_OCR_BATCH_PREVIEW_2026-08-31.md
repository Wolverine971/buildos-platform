# Libri Worker Phase 4B: Authenticated OCR Batch Preview

Date: 2026-08-31
Status: deployed and production-smoke-tested; worker dispatch and consumption remain disabled

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

## Production receipt

The Phase 4A database objects are live. Vercel deployment `dpl_AfCphzWgapHx3LYnr3bGRauXKke1`
reached Ready and the BuildOS production aliases point to it. An unauthenticated production POST to
the planning endpoint returned `401` with private, no-store cache controls; no queue or Libri rows
were created.

GitHub run `33473757045` retained a red repository-wide BuildOS job because of unrelated existing
documentation and worker test-type failures. The Libri migration scope passed within that job. The
user explicitly authorized this isolated deployment after review; the global CI exception remains
recorded and must not be represented as a green BuildOS gate.

## Next slice

Phase 4C's separate confirmation route is now deployed. The next boundary is Phase 4D's default-off
Railway dispatcher; queue consumption and paid OCR stay separate.
