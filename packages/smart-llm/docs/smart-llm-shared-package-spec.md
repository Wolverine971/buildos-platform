<!-- packages/smart-llm/docs/smart-llm-shared-package-spec.md -->

# SmartLLM Shared Package Spec (Web + Worker)

Status: Draft
Date: 2026-02-05
Owner: BuildOS Platform

## Summary

We currently maintain two divergent SmartLLMService implementations: a modular, feature-rich version in web and a monolithic version in worker. This spec proposes extracting a shared SmartLLM package that centralizes model configuration, selection, OpenRouter calls, parsing, and core service logic, while keeping environment-specific concerns (env vars, error logging, optional Supabase logging) in thin wrappers for web and worker.

## Goals

- Single source of truth for SmartLLMService behavior, model config, and selection logic.
- Preserve existing public API surface for web and worker imports.
- Make environment-specific dependencies (SvelteKit env, ErrorLoggerService, process.env) injectable.
- Support existing features: JSON/text generation, streaming, transcription, embeddings, usage logging, and cost tracking.
- Allow incremental migration with minimal breaking changes.

## Non-goals

- Replacing OpenRouter or changing upstream provider contracts.
- Redesigning llm_usage_logs schema or admin reporting.
- Changing prompt formats or consumer-level call sites beyond wrapper adjustments.

## Research Notes (Current State)

Reviewed the following sources to identify overlaps and divergences:

- Web SmartLLMService: `apps/web/src/lib/services/smart-llm-service.ts`
- Web SmartLLM modules: `apps/web/src/lib/services/smart-llm/*`
    - `model-config.ts`, `model-selection.ts`, `openrouter-client.ts`, `response-parsing.ts`, `errors.ts`, `usage-logger.ts`, `transcription-utils.ts`, `types.ts`
- Worker SmartLLMService: `apps/worker/src/lib/services/smart-llm-service.ts`
- Usage references across both apps (imports and mocks): multiple files under `apps/web/src/lib/services/*` and `apps/worker/src/workers/*`

### Web Implementation Highlights

- Modularized into `smart-llm/*` submodules.
- Advanced error handling with `OpenRouterEmptyContentError` and retry logic.
- Uses `OpenRouterClient` with `extra_body.models` for fallback routing.
- Supports streaming (`streamText`) with tool calls and SSE parsing.
- Supports audio transcription (`transcribeAudio`) with OpenRouter audio input.
- Uses `LLMUsageLogger` with Supabase and ErrorLoggerService integration.
- Uses `$env/static/private` for `PRIVATE_OPENROUTER_API_KEY`.

### Worker Implementation Highlights

- Monolithic file containing types, model config, selection, OpenRouter call, and usage logging.
- Uses `models` + `route: 'fallback'` and `provider` preferences in request body.
- Uses `transforms: ['middle-out']` compression.
- Includes `onUsage` callback and `metadata` in request options.
- Requires `userId` for JSON/text options.
- No streaming or transcription methods.
- Uses `process.env.PRIVATE_OPENROUTER_API_KEY` or config.apiKey.

## Key Divergences to Resolve

1. **Model Config and Profile Mappings**
    - Web has newer, larger model list (updated 2026-01-15) with tool-calling ordering and emergency fallbacks.
    - Worker has a smaller, older list (updated 2026-01-01) and different profile mappings.

2. **OpenRouter Request Format**
    - Web uses `extra_body.models` for fallback.
    - Worker uses `models` + `route` + `provider` fields (OpenRouter API no longer guarantees provider routing).

3. **Error Handling and Retries**
    - Web has robust empty-content detection, parse retry paths, and error metadata capture.
    - Worker has minimal retry behavior for JSON parse failures.

4. **Usage Logging**
    - Web uses `LLMUsageLogger` with Supabase and metadata fields like cache status, OpenRouter request id.
    - Worker logs directly, includes `onUsage` callback and `metadata` field, and requires userId.

5. **API Surface**
    - Web includes `streamText`, `transcribeAudio`, `generateTextDetailed`.
    - Worker includes only `getJSONResponse`, `generateText`, `generateEmbedding(s)`.

6. **Environment Dependencies**
    - Web imports SvelteKit env (`$env/static/private`) and ErrorLoggerService.
    - Worker relies on `process.env` and has no ErrorLoggerService.

## Proposed Shared Package

Create `packages/smart-llm` (name TBD, e.g. `@buildos/smart-llm`) as the canonical implementation.

### Package Structure (proposed)

```
packages/smart-llm/
  src/
    index.ts
    smart-llm-service.ts
    openrouter-client.ts
    model-config.ts
    model-selection.ts
    response-parsing.ts
    errors.ts
    transcription-utils.ts
    usage-logger.ts
    types.ts
```

### Core Design

- Move the web modular implementation into the shared package as the canonical base.
- Merge worker-only capabilities (onUsage callbacks, metadata, optional transforms) into shared types and logic.
- Keep all environment-specific dependencies injectable via constructor config.

### Constructor Config (proposed)

```
type SmartLLMConfig = {
  apiKey: string;
  httpReferer?: string;
  appName?: string;
  supabase?: SupabaseClient<Database>;
  usageLogger?: UsageLogger; // optional override
  errorLogger?: ErrorLogger; // optional interface adapter
  fetch?: typeof globalThis.fetch; // allow injection for tests/edge runtimes
  openrouter?: {
    timeoutMs?: number;
    transforms?: string[]; // optional, defaults to none
  };
};
```

### Shared Interfaces

```
interface UsageLogger {
  logUsageToDatabase(params: UsageLogParams): Promise<void>;
}

interface ErrorLogger {
  logAPIError(
    error: unknown,
    url: string,
    method: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  logDatabaseError?(...): Promise<void>;
}
```

### Shared Options (superset)

- `JSONRequestOptions` and `TextGenerationOptions` should include:
    - `userId?: string` (optional but validated before DB logging)
    - `operationType`, `projectId`, `taskId`, `briefId`, `brainDumpId`, `chatSessionId`, `agentSessionId`, `agentPlanId`, `agentExecutionId`
    - `metadata?: Record<string, unknown>`
    - `onUsage?: (event) => void | Promise<void>`
    - `timeoutMs?: number`

### Service Methods (shared)

- `getJSONResponse<T>(options)`
- `generateText(options)`
- `generateTextDetailed(options)`
- `streamText(options)` (SSE + tool calling)
- `transcribeAudio(options)` (optional, OpenRouter audio input)
- `generateEmbedding(s)`
- `selectProfile(context)`

## Wrapper Strategy (No Breaking Imports)

Keep the existing entrypoints as thin wrappers:

### Web Wrapper

`apps/web/src/lib/services/smart-llm-service.ts`

- Import `SmartLLMService` from shared package.
- Inject `apiKey` from `$env/static/private`.
- Inject `ErrorLoggerService` adapter.
- Re-export types for compatibility with `$lib/services/smart-llm-service` imports.

### Worker Wrapper

`apps/worker/src/lib/services/smart-llm-service.ts`

- Import `SmartLLMService` from shared package.
- Inject `apiKey` from `process.env.PRIVATE_OPENROUTER_API_KEY` or config override.
- Provide optional `onUsage` hook via request options (supported in shared types).
- Re-export types for existing relative imports.

## Model Config Unification

- Adopt web `model-config.ts` as canonical (updated 2026-01-15) and treat it as authoritative.
- Provide an override hook in shared package for custom model pools (future-proofing).
- Keep `TOOL_CALLING_MODEL_ORDER` and `EMERGENCY_TEXT_FALLBACKS` centralized.

## OpenRouter Request Strategy

- Standardize on `extra_body.models` fallback (per current OpenRouter spec).
- Deprecate provider routing preferences and `route` field unless we confirm supported behavior.
- Apply `transforms: ['middle-out']` conditionally for extremely long prompts (see rule below).

## Migration Plan (Phased)

1. **Create shared package skeleton** (`packages/smart-llm`).
2. **Move web smart-llm modules** into package, adjust imports to be environment-agnostic.
3. **Merge worker-only features** into shared types and logic:
    - `onUsage` callback
    - `metadata` field
    - optional `transforms`
4. **Implement thin wrappers** in web and worker that re-export shared service.
5. **Update tests/mocks** to import from wrappers only (no direct path changes).
6. **Delete duplicated code** or reduce to wrappers after validation.

## Testing Plan

- Unit tests for model selection, JSON parsing, and fallback routing.
- Snapshot tests for usage logging payloads (web + worker).
- Integration test for streaming parsing and tool calls (web).
- Regression checks for existing worker flows that call `getJSONResponse` and `generateText`.

## Risks

- Streaming depends on fetch returning a Web ReadableStream in worker runtime.
- OpenRouter fallback behavior could change; we should confirm before removing `provider` routing.
- Model list unification may impact latency/cost in worker flows.

## Decisions (from review)

1. **Fallback routing:** Standardize on a single fallback style. Use `extra_body.models` consistently.
2. **User ID:** Enforce `userId` for worker calls as well. The worker should always pass the end-user ID when making LLM calls.
3. **Model list:** Use the web model list as the authoritative source of truth.
4. **Audio input:** Proceed with the proposed `AudioInput` union.
5. **Transforms:** Use `middle-out` only for extremely long prompts, applied conditionally.

## Next Steps

- Approve the shared package shape and wrapper strategy.
- Implement conditional `middle-out` logic and confirm the threshold (see below).

## Proposed Audio Input Abstraction (My Best Judgment)

**Recommendation:** Add a minimal `AudioInput` union type to support both browser `File` and worker/server buffers without over-engineering.

```
type AudioInput =
  | { kind: 'file'; file: File }
  | { kind: 'buffer'; data: Uint8Array; format: string; filename?: string };
```

**Rationale:**

- Web already has `File` support; worker typically has `Buffer` (or a byte array) from storage or inbound messages.
- Keeps transcription in the shared package without leaking browser-specific types into worker code.
- Avoids adding a heavier `FileLike` shim unless we actually need it.

## What is `transforms: ['middle-out']` and why it matters

OpenRouter supports optional request transforms. The `middle-out` transform compresses large prompts by keeping the beginning and end of the prompt and trimming some of the middle. This can reduce token usage and cost for very long contexts, but it can also drop potentially important information located in the middle of a prompt or chat history. That makes it a tradeoff:

- **Pros:** Lower cost, faster requests for very long prompts.
- **Cons:** Possible loss of critical context; harder to reason about model behavior if key details were trimmed.

## Conditional `middle-out` rule (proposed)

Apply `transforms: ['middle-out']` only when the total prompt content is extremely long. For example:\n\n- **Threshold:** If combined message/prompt content length exceeds ~60,000 characters (rough proxy for very large token counts), enable `middle-out`.\n- **Otherwise:** No transforms.\n\nThis keeps behavior deterministic for normal requests, while giving us a cost/latency escape hatch for very large prompts.
