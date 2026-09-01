# Libri Worker Phase 3F.3: OCR Asset Broker Client

Date: 2026-08-31
Status: deployed and production-canary verified; worker disabled and provider credential removed

## Decision

The dedicated Libri worker redeems one opaque OCR asset grant through the BuildOS web broker. It
never receives a Supabase service key, Storage credential, bucket path, or durable signed URL.

The client accepts only the exact `/api/internal/libri/ocr-assets/redeem` endpoint, production HTTPS
(or loopback HTTP in local development), the dedicated broker bearer credential, one UUID grant,
and the database-issued grant expiry. It sends no retries because a response can be ambiguous after
the broker consumes the one-time grant. The caller must issue a fresh grant for any retry.

## Safety boundaries

- The request timeout is 250 to 10,000 ms and is additionally bounded by grant expiry minus a
  two-second safety margin.
- Caller cancellation and timeout cover the fetch and bounded body read.
- Responses must be JSON no larger than 8 KiB with exactly `signedUrl` and `mimeType`.
- Signed URLs must be credential-free HTTPS; MIME is limited to JPEG, PNG, or WebP.
- HTTP and transport failures report whether retry is allowed and whether a fresh grant is required.
- No URL, token, bucket path, or object identity is logged or written into queue payloads.

## Verification receipt

- Broker client contract: 21/21 tests passed, including timeout, caller abort, one-time ambiguity,
  response-size limits, URL validation, MIME validation, and status classification.
- Worker production typecheck, source ESLint, test-type baseline, and Prettier checks passed.
- The complete worker suite subsequently passed 169 files and 1,479 tests after Phase 3G was added.

## Deployment gate

Deploy the web broker and worker client with `LIBRI_WORKER_ENABLED=false`. Configure one randomly
generated broker token on only the BuildOS web service and dedicated Libri worker. Do not configure
the provider credential until an exact, expiring OCR canary step has been reviewed.

Production followed this gate: the client redeemed one consumed grant during the exact-step canary,
then the service returned to disabled mode and removed the provider key, target step, and expiry.
