<!-- apps/web/docs/technical/services/voice-transcription-openrouter-spec.md -->

# Voice Transcription via OpenRouter - Spec

**Date:** 2026-01-13
**Author:** Codex (GPT-5)
**Status:** Implemented for web on 2026-07-10

---

## Executive Summary

Centralize web audio transcription in `SmartLLMService` and send it through OpenRouter's dedicated speech-to-text endpoint. The web route fails closed on OpenRouter and never sends transcription audio to OpenAI directly. The existing `/api/transcribe` response contract remains stable.

---

## Current State

- `/api/transcribe` (`apps/web/src/routes/api/transcribe/+server.ts`) uses OpenRouter exclusively.
- Background voice note transcription (`apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts`) uses the same OpenRouter-only shared service.
- Transcription response fields consumed by the UI: `transcript`, `duration_ms`, `audio_duration`, `transcription_model`, `transcription_service`.
- Custom vocabulary prompt is supported via `vocabularyTerms` form field.

---

## Research Findings (OpenRouter Speech-to-Text)

OpenRouter supports dedicated transcription requests:

- **Endpoint:** `POST https://openrouter.ai/api/v1/audio/transcriptions`
- **Audio payload:** top-level `input_audio` object
- **Encoding:** audio must be **base64-encoded**; direct URLs are not supported
- **Format:** `input_audio.format` must be provided (e.g., `wav`, `mp3`, `m4a`)
- **Models:** only speech-to-text models that support the transcription endpoint will accept these requests
- **Common formats:** `wav`, `mp3`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, `pcm16`, `pcm24`

The request is authenticated and billed with `PRIVATE_OPENROUTER_API_KEY`. The default model is `openai/gpt-4o-mini-transcribe`, but the request is sent to OpenRouter rather than OpenAI's API.

---

## Goals

- Route web transcription through OpenRouter (OpenAI models via OpenRouter).
- Provide ordered OpenRouter model fallbacks without a direct-provider fallback.
- Move transcription logic into `apps/web/src/lib/services/smart-llm-service.ts`.
- Keep API response shape stable for existing UI.

## Non-Goals

- UI changes or streaming transcription.
- Changing the voice note upload API contract.
- Replacing live (browser) transcription.

---

## Proposed API (SmartLLMService)

Add a new method in `apps/web/src/lib/services/smart-llm-service.ts`:

```ts
type TranscriptionProvider = 'openrouter' | 'openai' | 'auto';

type TranscriptionOptions = {
	audioFile: File;
	userId?: string;
	vocabularyTerms?: string;
	models?: string[]; // ordered, provider-specific ids
	provider?: TranscriptionProvider;
	timeoutMs?: number;
	maxRetries?: number;
	initialRetryDelayMs?: number;
};

type TranscriptionResult = {
	text: string;
	durationMs: number;
	audioDuration?: number | null;
	model: string;
	service: 'openrouter' | 'openai';
	requestId?: string;
};
```

Implementation notes:

- Retain `vocabularyTerms` for API compatibility; OpenRouter's dedicated endpoint does not currently expose a vocabulary prompt field.
- Retry only on transient errors (timeout, network, 429, 5xx).
- Use **base64 + JSON** for OpenRouter's `input_audio` field.

---

## Routing & Fallback Strategy

### Default Model Order (if not overridden)

OpenRouter speech-to-text models:

1. `openai/gpt-4o-mini-transcribe` (default)
2. Values from `TRANSCRIPTION_OPENROUTER_FALLBACK_MODELS` (optional)

### Provider Order

1. **OpenRouter** using its dedicated speech-to-text endpoint
2. Return an OpenRouter-specific error if all configured models fail

### Fallback Logic

- **Per-model fallback**: try models in order until success.
- **Provider behavior**: fail closed on OpenRouter; never send transcription audio to OpenAI directly.
- **Retry**: exponential backoff per model on retryable errors.

---

## Configuration

Add/extend env configuration (defaults shown):

```
TRANSCRIPTION_OPENROUTER_MODEL=openai/gpt-4o-mini-transcribe
TRANSCRIPTION_OPENROUTER_FALLBACK_MODELS=<optional-comma-separated-models>
TRANSCRIPTION_TIMEOUT_MS=30000
TRANSCRIPTION_MAX_RETRIES=2
TRANSCRIPTION_INITIAL_RETRY_DELAY_MS=1000
```

Notes:

- Transcription always uses OpenRouter's `/api/v1/audio/transcriptions` endpoint.
- OpenRouter models must support the speech-to-text transcription endpoint.
- Only `PRIVATE_OPENROUTER_API_KEY` is required for transcription.

---

## Integration Points

### 1) `/api/transcribe` (web)

Refactor to:

- Validate audio + vocabulary as today.
- Call `SmartLLMService.transcribeAudio(...)`.
- Return the same response shape:
    - `transcription_service: 'openrouter' | 'openai'`
    - `transcription_model: string`

### 2) Background Transcription (worker)

- Uses `SmartLLMService.transcribeAudio(...)` with the same primary and fallback model variables.
- Stores `transcription_service: 'openrouter'` and the actual model in voice-note metadata.

---

## Error Handling & Logging

- Reuse existing `ErrorLoggerService` in the web service for API errors.
- Log provider + model + audio metadata (size, mime type).
- For success, consider adding a lightweight usage log entry with `operationType: 'transcribe_audio'` and metadata, since token counts are not available for audio.

---

## Testing Plan

- **Manual**: Use `/api/transcribe` with a short audio clip.
- **Fallback**: Force an invalid primary OpenRouter model and verify the configured OpenRouter model fallback.
- **Timeout**: Set low `TRANSCRIPTION_TIMEOUT_MS` and verify retry behavior.
- **UI**: Confirm transcription fields still populate in `TextareaWithVoice`, `CommentTextareaWithVoice`, and `DocumentEditor`.

---

## Risks / Open Questions

- **Model selection**: Periodically compare supported OpenRouter speech-to-text models for accuracy and cost.
- **File size limits**: Determine OpenRouter max request size (may differ from OpenAI).
- **Data handling**: Confirm OpenRouter data retention / privacy constraints for audio.

---

## Recommendations

- Keep transcription fail-closed on OpenRouter to prevent accidental direct OpenAI spend.
- Consider a short-lived circuit breaker if OpenRouter audio is unavailable.
- Keep web and worker transcription model configuration aligned.
