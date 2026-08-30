# Libri Worker Phase 3E.1: OCR Provider Boundary

Date: 2026-08-30
Status: implemented and locally verified; no queue registration, migration, provider call, or
production activation

## Decision

The first real Libri processor family will be one-image OCR under `libri_ingest`. This preserves the
worker architecture's intended ordering—ingestion/OCR before discovery and recursive research—while
keeping every paid call tied to one immutable source image and one fenced research step.

Phase 3E.1 adds only the provider-facing contract and deterministic response validation. It does
not import the general BuildOS OCR worker, Supabase client, scheduler, or service-role credential.
It remains unreachable from the dedicated Libri entrypoint until the budget and asset-access gates
below exist.

## Durable step contract

The future step payload is:

```json
{
	"version": 1,
	"kind": "ocr_image",
	"imageId": "uuid",
	"expectedOcrVersion": 1,
	"maxOutputChars": 100000
}
```

The payload never stores a signed URL, object bytes, bucket, path, library ID, or book ID. Those
values are reloaded from the claimed domain step and `libri.images`; queue metadata remains a
routing hint rather than authority.

## Provider boundary

- OpenRouter is the only initial paid-provider route. There is no silent direct-provider fallback.
- The Libri Railway service receives a dedicated provider key, not BuildOS's Supabase service key.
- The adapter accepts one short-lived HTTPS image URL, an allowed image MIME type, an explicit model,
  a bounded output-token limit, and an `AbortSignal`.
- It returns normalized OCR text, a short summary, optional language/confidence, provider/model,
  token counts, and provider-reported or separately reconciled cost.
- Empty text, malformed JSON, unsupported MIME types, unexpected response fields, non-finite usage,
  and over-limit output fail closed.
- HTTP 408, 409, 425, 429, and 5xx responses are transient; authentication, validation, and other
  4xx responses are permanent. The lifecycle—not the adapter—owns retry count and backoff.

## Gates before the adapter can be wired

1. Add an atomic per-run cost reservation/settlement ledger in `libri`, expressed in integer
   microusd and usable through the restricted `libri_worker` role. No paid call may start from a run
   without a positive budget and a successful reservation.
2. Add a narrow server-side asset broker. It must validate the leased step ID, lease token,
   execution generation, `ocr_image` payload, image ID, fixed `libri-assets` bucket, and unexpired
   lease before returning a short-lived signed URL. The worker must not receive a Supabase service
   key or Storage-wide credential.
3. Extend the restricted worker boundary only with the exact image/source-chunk columns and
   operations required for this processor. No table-wide or cross-schema grant is acceptable.
4. Persist OCR output and its source chunk idempotently under the existing lifecycle fence, then
   settle provider usage and complete the step without a commit/enqueue crash gap.
5. Deploy disabled, pass the complete BuildOS and Libri migration gates, and run one exact image
   canary with a byte-identical non-Libri control before considering recurring polling.

## Deliberate exclusions

- No book creation or metadata extraction.
- No TOC/chapter creation.
- No multi-image import orchestration.
- No recursive successor enqueue.
- No YouTube, person, book discovery, web fetch, embeddings, or derived-view generation.
- No reuse of `apps/worker/src/workers/assets/assetOcrWorker.ts`, because that module imports the
  broad BuildOS Supabase client and writes BuildOS ontology tables.

## Verification receipt

- Focused provider contract: 6/6 tests passed.
- Complete worker suite: 163 files and 1,417 tests passed; 3 files and 12 live/evaluation tests were
  intentionally skipped.
- Worker production typecheck, ESLint, HTTP-module guard, Prettier, and `git diff --check` passed.
- Test type-debt gate remained exactly at its established 217/217 baseline.
- The response must echo the exact requested model; a missing or changed model fails closed.
- No provider key, queue registration, database grant, schema migration, or production activation
  was added in this slice.
