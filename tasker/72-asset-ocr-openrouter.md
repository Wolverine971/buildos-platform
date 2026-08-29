<!-- tasker/72-asset-ocr-openrouter.md -->

# 72 — Asset OCR via OpenRouter

**Created:** 2026-08-29

**Status:** FIXED (uncommitted work committed same day) — pending deploy + live verify

**Priority:** P2 — prod breakage fix, rides the semantic-discovery deploy

## Kernel

`extract_onto_asset_ocr` (`apps/worker/src/workers/assets/assetOcrWorker.ts`)
called direct OpenAI (`gpt-4o-mini` vision), so every OCR job in prod has been
failing since the OpenAI org's credits hit zero (`429 credit_balance_exhausted`,
discovered 2026-08-29 during the semantic-discovery apply). Fixed by routing
through OpenRouter — same pattern as the embeddings pipeline (tasker/71):
`PRIVATE_OPENROUTER_API_KEY` primary → `https://openrouter.ai/api/v1/chat/completions`
with model `openai/gpt-4o-mini`; direct OpenAI key remains the fallback route.
`IMAGE_OCR_MODEL` override is used verbatim (must carry the provider prefix on
the OpenRouter route).

Verified: live curl of the exact request shape (vision + `json_object`) through
OpenRouter returned correct OCR output; the 3 worker unit tests pass (they mock
fetch and assert no route-specific URL); worker typecheck clean. No deploy env
changes needed — both Railway services already carry the OpenRouter key.

## Checklist

- [x] Route OCR through OpenRouter with direct-OpenAI fallback
- [x] Request-shape verified live (vision + response_format via OpenRouter)
- [ ] Deploy (rides the tasker/71 push to main)
- [ ] Live verify: upload an image asset in prod, confirm `ocr_status`
      completes and `extraction_summary` populates; check no
      `extract_onto_asset_ocr` failures in `queue_jobs` after deploy

## Related

- Direct-OpenAI usages remaining by design: smart-llm chat fallback
  (`openrouter-v2-service.ts`) and the OpenAI-key fallback paths here and in
  `packages/shared-agent-ops/src/embeddings/openai-embeddings.ts`.
- Voice transcription was already on OpenRouter
  (`TRANSCRIPTION_OPENROUTER_MODEL`); the `TRANSCRIPTION_USE_OPENROUTER` env
  var is dead (no code references) and can be cleaned from env files.
