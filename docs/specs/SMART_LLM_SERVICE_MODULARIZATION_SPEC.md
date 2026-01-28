<!-- docs/specs/SMART_LLM_SERVICE_MODULARIZATION_SPEC.md -->

# Smart LLM Service Modularization Spec

## Purpose

Break `SmartLLMService` into focused, testable modules while keeping the public API stable. The goal is to reduce file size, isolate error handling/parsing, and clarify responsibilities across model selection, OpenRouter I/O, response parsing, and logging.

## Scope

- Refactor only the implementation details of `apps/web/src/lib/services/smart-llm-service.ts`.
- Preserve the existing public class (`SmartLLMService`) and exported types.
- Introduce a `smart-llm/` subfolder for internal modules.

## Non-goals

- Changing runtime behavior, retry policy, or model selection logic.
- Renaming the service or updating import paths across the app (except internal service modules).
- Introducing new external dependencies.

## Module Boundaries (Target)

- `smart-llm/types.ts`
    - Shared types: `JSONProfile`, `TextProfile`, `ModelProfile`, request/response interfaces, `OpenRouterResponse`.
- `smart-llm/model-config.ts`
    - Model catalogs, profile presets, tool-calling model order, empty-content retry constants.
- `smart-llm/model-selection.ts`
    - Complexity analysis, JSON/text model selection, JSON mode support, length estimation, tool-compatible filtering.
- `smart-llm/errors.ts`
    - Error parsing + normalization (`parseOpenRouterErrorMetadata`), retry detection, `OpenRouterEmptyContentError`, content summaries, empty-content error builder.
- `smart-llm/response-parsing.ts`
    - Content extraction, JSON cleaning, thinking-token filtering, streaming normalization helpers.
- `smart-llm/openrouter-client.ts`
    - OpenRouter request logic (chat + audio), request metadata parsing, timeout handling.
- `smart-llm/usage-logger.ts`
    - Usage logging + ID normalization helpers for Supabase.
- `smart-llm/transcription-utils.ts` (optional)
    - Audio helpers: format detection, base64 encode, retryable error checks, sleep.

## Migration Phases

1. Extract shared types + constants into `smart-llm/` and re-export from `smart-llm-service.ts`.
2. Move error parsing + response parsing helpers to modules and replace `this.*` calls.
3. Move model selection helpers and constants to modules; update selection usage.
4. Move OpenRouter client and logging utilities; update service to delegate.
5. Optional: split large methods into smaller functions if needed for readability.

## Acceptance Criteria

- `SmartLLMService` remains the single public entry point.
- Existing call sites compile without changing their imports.
- All extracted modules are pure/side-effect-minimal where possible.
- Error handling and parsing are centralized in dedicated modules.

## Verification

- Type-check/build passes for `apps/web`.
- Spot-check key flows: JSON response, text generation, streaming, transcription.
