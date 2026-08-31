# Libri Worker Phase 3F.1: OCR Asset Capabilities

Date: 2026-08-30
Status: implemented and locally verified; awaiting CI, deployment, and migration; not activated

## Decision

Private OCR images will cross the worker-to-web boundary through one-time database capabilities,
not a Supabase service key, Storage credential, persistent signed URL, or caller-supplied object
path.

The Railway worker may issue an opaque grant only while it owns the exact leased `ocr_image` step.
The BuildOS web server will redeem that grant through the already-exposed, RLS-protected `libri`
Data API schema, use its existing server-only Storage client to create a short-lived signed URL, and
return only that URL and reviewed MIME type. The `libri_worker` credential never receives Storage
authority.

## Database boundary

- `libri.ocr_asset_grants` stores the exact step generation, lease token, image identity, expected
  OCR version, content hash, and an expiry no more than 60 seconds after issuance.
- A `SECURITY INVOKER` validation routine locks the step and run, requires an active Libri ingest
  lease and uncancelled running run, accepts only the five-key version-1 OCR payload, and verifies
  the fixed private bucket, MIME type, byte limit, content hash, pending/failed status, and next OCR
  version.
- A before-write trigger applies the same validation to routine calls and direct DML, derives all
  authority-bearing columns, clears consumption state, and bounds expiry. Column grants cannot
  bypass the lease fence.
- The restricted database role may read only the non-location image metadata required by the
  invoker-safe validator. It cannot read object paths, access Storage tables, or authenticate to
  Storage. The worker adapter returns only opaque grant IDs/expiries and cannot consume, update,
  or delete grants. `anon` and `authenticated` receive no grant-table or routine access.
- Only `service_role` may atomically consume a grant. Consumption revalidates the current lease,
  run, payload, image, version, and content hash, then succeeds exactly once.
- All routines remain invoker-safe with a fixed `pg_catalog, libri` search path. No public-schema
  wrapper, role, extension, BuildOS table mutation, or Storage policy is added.

## Deployment sequence

1. Pass static migration scope, the disposable SQL contract, worker adapter tests, full worker
   validation, and BuildOS/Libri CI.
2. Deploy with `LIBRI_WORKER_ENABLED=false`, no activation target, no OpenRouter key, and no broad
   Supabase key.
3. Apply the exact capability migration and verify the empty grant ledger plus restricted grants.
4. Add the narrow SvelteKit redemption endpoint using the existing server-only Supabase client and
   `.schema('libri')`; reject malformed bodies, map invalid/stale grants to a generic response, set
   `Cache-Control: no-store`, and cap the signed URL at the database expiry.
5. Wire the worker HTTP client, then persist OCR output under the lifecycle fence before any exact
   image canary. Provider wiring and recurring polling remain out of scope until those gates pass.

## Deliberate exclusions

- No provider credential or paid call.
- No OCR queue registration or recurring polling.
- No service-role key, Storage S3 key, or JWT signing secret in Railway.
- No direct object bytes, bucket, path, or signed URL in durable step/queue payloads.
- No multi-image orchestration, recursive research, source-chunk write, or OCR completion write yet.

## Local verification receipt

- Static Libri scope accepted all 10 migrations; the migration ledger and all 118 SQL-contract
  inventory entries remained valid.
- The 25 disposable SQL contracts passed: the existing 24 passed in sequence and the corrected OCR
  asset contract passed in a fresh isolated database. The new proof covers exact lease issuance,
  direct-DML enforcement, server-only redemption, replay denial, post-issuance cancellation, grant
  immutability, restricted privileges, and an unchanged BuildOS queue control.
- The SQL proof found and fixed an over-broad append-only trigger that initially blocked legitimate
  consumption. The final transition permits only the first `consumed_at` write while every identity,
  generation, lease, hash, issuance, and expiry field remains immutable.
- The focused worker boundary passed 32/32 tests. The complete worker run passed 1,434 tests; four
  loopback-listener tests blocked by the sandbox passed 5/5 outside it. The two unchanged disposable
  PostgreSQL suites could not start locally because macOS exhausted System V shared-memory IDs; both
  remain covered by the fresh CI runner and had passed on the immediately preceding commit.
- Worker build, production typecheck, ESLint, HTTP-module guard, Prettier, `git diff --check`, and the
  established 217/217 worker test-type debt baseline passed.
