<!-- apps/web/docs/technical/services/voice-transcription-openrouter-spec.md -->

# Voice Transcription via OpenRouter - Spec

**Date:** 2026-01-13
**Author:** Codex (GPT-5)
**Status:** Draft

---

## Executive Summary

Centralize audio transcription in `SmartLLMService` and attempt OpenRouter first via chat-completions audio inputs, with a direct OpenAI transcription fallback and model-level fallbacks. This keeps the existing `/api/transcribe` contract stable while enabling routing and failover.

---

## Current State

- `/api/transcribe` (`apps/web/src/routes/api/transcribe/+server.ts`) uses the OpenAI SDK directly.
- Background voice note transcription (`apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts`) calls OpenAI audio transcription directly.
- Transcription response fields consumed by the UI: `transcript`, `duration_ms`, `audio_duration`, `transcription_model`, `transcription_service`.
- Custom vocabulary prompt is supported via `vocabularyTerms` form field.

---

## Research Findings (OpenRouter Audio Inputs)

OpenRouter supports audio inputs through the chat completions API:

- **Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`
- **Audio payload:** `messages[].content[]` with `type: "input_audio"`
- **Encoding:** audio must be **base64-encoded**; direct URLs are not supported
- **Format:** `input_audio.format` must be provided (e.g., `wav`, `mp3`, `m4a`)
- **Models:** only models that declare audio input support will accept these requests
- **Common formats:** `wav`, `mp3`, `aiff`, `aac`, `ogg`, `flac`, `m4a`, `pcm16`, `pcm24`

This is **not** the OpenAI `/audio/transcriptions` multipart endpoint. For OpenRouter, the transcription task is performed by a chat model that accepts audio input.

---

## Goals

- Route transcription through OpenRouter when supported (OpenAI models via OpenRouter).
- Provide fallback models and provider-level fallback (OpenRouter -> OpenAI direct).
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

- Keep default vocabulary terms: `"BuildOS, brain dump, ontology, daily brief, phase, project context"`.
- Normalize model ids for OpenAI direct (strip `openai/` prefix).
- Retry only on transient errors (timeout, network, 429, 5xx).
- Use **base64 + JSON** for OpenRouter (`input_audio`) and `FormData` for OpenAI direct.

---

## Routing & Fallback Strategy

### Default Model Order (if not overridden)

OpenRouter (audio-input chat models, ordered by quality):

1. `<audio-capable-model-1>`
2. `<audio-capable-model-2>`

OpenAI direct (transcription endpoint):

1. `gpt-4o-mini-transcribe` (default, cheaper)
2. `gpt-4o-transcribe` (higher accuracy)
3. `whisper-1` (legacy)

### Provider Order

1. **OpenRouter** (if configured + supported)
2. **OpenAI direct** (fallback)

### Fallback Logic

- **Per-model fallback**: try models in order until success.
- **Provider fallback**: if OpenRouter returns 404/405/unsupported endpoint, fall back to OpenAI.
- **Retry**: exponential backoff per model on retryable errors.

---

## Configuration

Add/extend env configuration (defaults shown):

```
TRANSCRIPTION_USE_OPENROUTER=false # Feature flag for OpenRouter transcription
TRANSCRIPTION_OPENROUTER_MODEL=<audio-capable-model>
TRANSCRIPTION_OPENROUTER_FALLBACK_MODELS=<comma-separated>
# TRANSCRIPTION_MODEL=gpt-4o-transcribe
# NOTE: Testing the cheaper model to reduce transcription costs.
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
TRANSCRIPTION_FALLBACK_MODELS=gpt-4o-mini-transcribe,whisper-1
TRANSCRIPTION_TIMEOUT_MS=30000
TRANSCRIPTION_MAX_RETRIES=2
TRANSCRIPTION_INITIAL_RETRY_DELAY_MS=1000
```

Notes:

- When `TRANSCRIPTION_USE_OPENROUTER=true`, OpenRouter is attempted first and falls back to OpenAI direct.
- OpenRouter models must support **audio input** via chat completions (not transcription endpoint models).
- `PRIVATE_OPENROUTER_API_KEY` and `PRIVATE_OPENAI_API_KEY` are both required to allow fallback.

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

Optional follow-up:

- Update `apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts` to use the same routing logic (likely via a shared helper or duplicated logic).
- Keep the database metadata in sync with new `transcription_service` values.

---

## Error Handling & Logging

- Reuse existing `ErrorLoggerService` in the web service for API errors.
- Log provider + model + audio metadata (size, mime type).
- For success, consider adding a lightweight usage log entry with `operationType: 'transcribe_audio'` and metadata, since token counts are not available for audio.

---

## Testing Plan

- **Manual**: Use `/api/transcribe` with a short audio clip.
- **Fallback**: Force an invalid OpenRouter model to verify fallback to OpenAI.
- **Timeout**: Set low `TRANSCRIPTION_TIMEOUT_MS` and verify retry behavior.
- **UI**: Confirm transcription fields still populate in `TextareaWithVoice`, `CommentTextareaWithVoice`, and `DocumentEditor`.

---

## Risks / Open Questions

- **Model selection**: Which OpenRouter models provide the best transcription accuracy with audio input?
- **Response consistency**: Chat models may add commentary; need a strict transcription prompt and post-processing.
- **File size limits**: Determine OpenRouter max request size (may differ from OpenAI).
- **Data handling**: Confirm OpenRouter data retention / privacy constraints for audio.

---

## Recommendations

- Keep OpenAI direct fallback even if OpenRouter is enabled.
- Add a short-lived circuit breaker if OpenRouter audio is unavailable (avoid repeated 404s).
- Align worker transcription with web logic once OpenRouter viability is confirmed.
