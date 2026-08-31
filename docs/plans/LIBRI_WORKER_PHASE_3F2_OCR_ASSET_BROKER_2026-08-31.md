# Libri Worker Phase 3F.2: OCR Asset Broker

Date: 2026-08-31
Status: implemented and locally verified on `main`; not deployed, wired, or activated

## Decision

The BuildOS web server is the only component allowed to exchange a one-time Libri OCR asset grant
for a short-lived Supabase Storage URL. The dedicated Railway worker receives neither a Supabase
service-role key nor a Storage credential.

The endpoint uses two independent controls:

1. `PRIVATE_LIBRI_ASSET_BROKER_TOKEN` authenticates the dedicated worker before any database work,
   preventing public traffic from turning the broker into load on the shared BuildOS database.
2. The opaque grant ID authorizes exactly one live, lease-fenced OCR image and is atomically consumed
   by `libri.consume_ocr_asset_grant`.

The broker token is dedicated to this boundary. It must not reuse the general Railway worker token,
the shared BuildOS webhook secret, a Supabase key, or a provider credential.

## Endpoint contract

- `POST /api/internal/libri/ocr-assets/redeem`
- Header: `Authorization: Bearer <PRIVATE_LIBRI_ASSET_BROKER_TOKEN>`
- JSON body: exactly `{ "grantId": "uuid" }`, capped at 256 bytes
- Success body: exactly `{ "signedUrl": "https://...", "mimeType": "image/..." }`
- All responses use `Cache-Control: private, no-store`; failure bodies are generic and never return
  a grant ID, bucket, object path, database error, or Storage error.

After authentication and strict body validation, the route creates the existing server-only
Supabase admin client, selects the `libri` schema, and invokes only
`consume_ocr_asset_grant(p_grant_id)`. The result must contain exactly one row and must independently
pass the fixed `libri-assets` bucket, safe object-path, MIME allowlist, and expiry checks before the
Storage client is called.

The signed URL lifetime is the lesser of 60 seconds and the remaining database grant lifetime, with
a two-second signing-latency margin. The returned URL must use HTTPS (except loopback development)
and exactly match the configured Supabase origin.

## Failure behavior

- Missing or wrong broker token: generic `401`, no database client created.
- Missing broker configuration or operational database/Storage failure: generic `503`.
- Malformed, oversized, or non-JSON body: generic `400`, no database client created.
- Unknown, stale, replayed, malformed, or policy-invalid grant result: generic `404`, no Storage
  signing attempt.
- A Storage failure burns the already-consumed grant. A later worker slice must issue a fresh grant
  rather than retrying the same capability.

## Local verification receipt

- Focused route suite: 18/18 tests passed.
- The suite covers authentication/configuration failure, body and UUID rejection, exact-schema RPC
  invocation, bucket/path/MIME/expiry review, URL lifetime bounding, Storage-origin validation,
  generic failure responses, and replay denial.
- `pnpm --filter @buildos/web check`: 0 errors and 0 warnings.
- Focused ESLint and Prettier checks passed.
- Supabase's current changelog and official RPC/signed-URL documentation were reviewed. No current
  platform change alters this server-side RPC plus time-limited private-asset pattern.

## Deployment and next slice

1. Generate one long random broker token and set the identical value only on the BuildOS web service
   and the dedicated `libri-worker` Railway service.
2. Deploy the web endpoint with `LIBRI_WORKER_ENABLED=false` and no activation target/provider key.
3. Verify unauthenticated, malformed, and random-grant production probes fail generically and that
   the empty grant ledger plus the BuildOS queue control remain unchanged.
4. Phase 3F.3 may then add the bounded worker HTTP client: fixed broker base URL, bearer token,
   request timeout, exact response validation, and fresh-grant behavior after ambiguous failures.
5. Provider wiring, OCR result persistence, and any exact-image canary remain gated on the later
   lifecycle slice; recurring polling remains disabled.

## Deliberate exclusions

- No worker HTTP client or new Railway/Vercel secret value is configured in this slice.
- No provider credential, paid call, exact-image canary, or queue-family registration.
- No direct bytes, bucket, object path, signed URL, or broker token in durable queue/step payloads.
- No changes to BuildOS tables, public Storage policies, or non-Libri migrations.
