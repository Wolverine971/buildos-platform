<!-- apps/web/docs/technical/services/openrouter-v2-simplified-spec.md -->

# OpenRouter V2 Simplified Service Spec

**Date:** 2026-02-22  
**Author:** Codex (GPT-5)  
**Status:** Draft  
**Intent:** Build a parallel, simpler OpenRouter-first system and migrate agent/chat traffic to it while keeping the current SmartLLM stack intact.

---

## Executive Summary

Current SmartLLM behavior mixes model scoring, provider-specific routing, argument coercion, repair loops, and logging concerns in one service. This spec defines a new parallel path with three jobs only:

1. Select a model lane (`text`, `json`, `tool_calling`).
2. Call OpenRouter with a minimal, documented request shape.
3. Return deterministic stream events (`text`, `tool_call`, `done`, `error`) without hidden mutations.

The old system stays in place behind a flag until V2 reaches parity.

---

## Why We Are Redoing This

Observed issues in current stack (`packages/smart-llm/src/smart-llm-service.ts`, `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`):

- Multiple overlapping retry and repair systems make failures hard to reason about.
- Tool-call argument coercion and fallback emission can mask upstream model problems.
- Provider/model routing includes non-OpenRouter branches that increase complexity.
- Too many model profiles and heuristics for what should be lane-based selection.
- Tool-calling reliability is inconsistent; orchestration compensates with extra complexity.

---

## Goals

- OpenRouter-first architecture with explicit, documented request formats.
- Minimal model selection strategy based on lanes, not weighted heuristics.
- Stronger tool-calling reliability through:
    - strict schema usage,
    - predictable streaming assembly,
    - optional `:exacto` variants for tool-heavy loops.
- Reuse existing tool definitions (`ChatToolDefinition`) where possible.
- Keep current system untouched and enable migration by feature flag.

## Non-Goals

- Remove or refactor existing SmartLLM implementation in this phase.
- Change business tool semantics.
- Introduce autonomous tool actions outside model intent.

---

## OpenRouter Baseline (Docs-Derived)

This design is grounded in OpenRouter docs linked by product:

- Quickstart and chat completions usage
- Streaming SSE behavior (`data: ...`, `[DONE]`, stream cancellation/error events)
- Tool-calling request format (`tools`, `tool_choice`) and tool-call assembly from deltas
- Responses API (`/responses`) for basic, reasoning, and tool-calling workflows
- Model fallback routing (`models` array / `extra_body.models` for OpenAI SDK compatibility)
- Model variant pinning via `:exacto`
- Reasoning token controls (`reasoning.effort`, `reasoning.max_tokens`, `reasoning.exclude`)

Important notes from docs for implementation:

- Tool-calling reliability improves when provider/model randomness is reduced.
- `:exacto` pins provider + model variant and can still use fallback models.
- For parameter-sensitive features, provider routing can enforce param support with `provider.require_parameters = true`.
- Responses API docs currently show both `/api/v1/responses` and `/api/beta/responses` examples; endpoint should be config-driven and validated in integration tests.

---

## Proposed Architecture

Create a parallel module:

- `apps/web/src/lib/services/openrouter-v2/`

Files:

- `client.ts`: minimal HTTP wrapper for OpenRouter endpoints.
- `model-lanes.ts`: static lane config and fallback order.
- `chat.ts`: text + json calls (non-stream and stream).
- `tool-stream.ts`: tool-call streaming loop and delta assembler.
- `types.ts`: request/response contracts.

Adapter/wiring:

- `apps/web/src/lib/services/openrouter-v2-service.ts` (thin app wrapper, env + logging integration).
- `apps/web/src/routes/api/agent/v2/stream/+server.ts` chooses old vs new by flag.

No changes to existing `packages/smart-llm/*` required for phase 1.

---

## V2 API Surface

```ts
export type ModelLane = 'text' | 'json' | 'tool_calling';

export type OpenRouterV2Config = {
	apiKey: string;
	baseUrl?: string; // default: https://openrouter.ai/api/v1
	httpReferer: string;
	appName: string;
	responsesApiEnabled?: boolean;
	responsesPath?: '/responses' | '/beta/responses';
};

export type GenerateTextInput = {
	messages: Array<{
		role: 'system' | 'user' | 'assistant' | 'tool';
		content: string;
		tool_call_id?: string;
	}>;
	lane?: 'text';
	model?: string;
	models?: string[];
	temperature?: number;
	maxTokens?: number;
	reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean };
};

export type GenerateJsonInput = {
	messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
	lane?: 'json';
	model?: string;
	models?: string[];
	jsonMode?: 'json_object' | 'json_schema';
	jsonSchema?: Record<string, unknown>;
	temperature?: number;
	maxTokens?: number;
};

export type StreamWithToolsInput = {
	messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }>;
	tools: any[]; // reuse current ChatToolDefinition-derived payload
	tool_choice?: 'auto' | 'none' | 'required';
	lane?: 'tool_calling';
	model?: string;
	models?: string[];
	temperature?: number;
	maxTokens?: number;
	signal?: AbortSignal;
};
```

Output event contract (kept compatible with current orchestration):

- `text`
- `tool_call`
- `done`
- `error`

---

## Model Selection Strategy (Simple Lanes)

No weighted scoring. No complexity analyzer.

Single source of truth in `model-lanes.ts`:

- `text` lane: fast conversational models.
- `json` lane: models with reliable structured output support.
- `tool_calling` lane: models with strong tool behavior; exacto-first option.

Initial lane lists should be short (max 4 per lane) and reviewed weekly.

Example initial config (candidate set, to validate in staging):

- `text`: `google/gemini-3-flash-preview`, `openai/gpt-4o-mini`, `x-ai/grok-4.1-fast`
- `json`: `openai/gpt-4o-mini`, `deepseek/deepseek-chat`, `google/gemini-3-flash-preview`
- `tool_calling`: `deepseek/deepseek-v3.1-terminus:exacto`, `qwen/qwen3-coder:exacto`, `moonshotai/kimi-k2-0905:exacto`, `openai/gpt-4o-mini`

Notes:

- Exacto model IDs above come directly from OpenRouter Exacto docs examples.
- Use `models` fallback list in each request. Primary model is first; fallbacks follow.
- Keep lane list editable by env override without code deploy.

---

## Tool-Calling Reliability Contract

### Request

- Pass tool schemas as OpenRouter function tools directly.
- Reuse existing tool definitions from shared types.
- Default `tool_choice: 'auto'`.
- For strict feature support routes, set `provider.require_parameters = true`.

### Streaming Assembly (No Hidden Repair)

- Assemble `delta.tool_calls` by `index` and `id`.
- Append `function.arguments` fragments exactly as received.
- Emit completed tool calls when:
    - `finish_reason === 'tool_calls'`, or
    - stream ends and arguments parse as valid JSON.

### Validation Policy

- Parse arguments exactly once before execution.
- On invalid JSON: emit a structured tool validation error back into chat history as tool result; do not auto-coerce to `{}`.
- No synthetic/autonomous tool execution in V2 base path.

---

## JSON Strategy

Two modes:

1. Stable default: Chat Completions + `response_format: { type: 'json_object' }`.
2. Optional strict mode: Responses API + `text.format` JSON schema (`json_schema`) when enabled.

Behavior:

- If strict schema mode fails or is unsupported, fall back to json_object mode in same lane.
- Keep parsing strict: no regex cleanup, no truncated JSON repair in V2 base path.

---

## Reasoning Token Strategy

Defaults by lane:

- `text`: `reasoning.exclude = true`
- `json`: `reasoning.effort = low` only when prompt explicitly needs reasoning
- `tool_calling`: `reasoning.effort = low` by default; escalate to `medium` only on explicit retry path

Rules from docs:

- Do not send both `reasoning.effort` and `reasoning.max_tokens` unless intentionally overriding.
- Use bounded `reasoning.max_tokens` for tool loops to avoid runaway hidden tokens.
- Capture and log reasoning token usage for model tuning.

---

## Parallel Rollout Plan

### Phase 0: Spec + Guardrails

- Add this spec.
- Add feature flags:
    - `OPENROUTER_V2_ENABLED`
    - `OPENROUTER_V2_RESPONSES_ENABLED`
    - `OPENROUTER_V2_EXACTO_TOOLS_ENABLED`
    - `OPENROUTER_V2_LANE_*` (optional overrides)

### Phase 1: Build V2 Service

- Implement `openrouter-v2/*` minimal client + lane selector + stream parser.
- Reuse existing usage/error logging interfaces.

### Phase 2: Agent Stream Integration

- In `apps/web/src/routes/api/agent/v2/stream/+server.ts`, choose service by flag.
- Preserve existing SSE event semantics and `onToolResult` flow.

### Phase 3: Shadow + Compare

- Run V2 in shadow mode for selected sessions.
- Compare:
    - tool argument validity rate,
    - tool-call completion rate,
    - tool rounds to completion,
    - timeout/failure rates,
    - cost/latency.

### Phase 4: Default Switch

- Move production traffic to V2.
- Keep V1 rollback flag for at least one release cycle.

---

## Acceptance Criteria

- Tool-call JSON argument validity >= 95% in staging for gateway ops.
- No autonomous tool mutations in V2 path.
- Median first-token latency is not worse than V1 by more than 10%.
- Fallback routing works when primary model fails (simulated 5xx/timeouts).
- Existing tools execute unchanged via reused definitions.

---

## Risks and Open Questions

- Responses endpoint path variance (`/v1/responses` vs `/beta/responses`) needs one-time integration confirmation.
- Exacto variants improve determinism but may reduce provider-level failover flexibility.
- Some models in rankings may not have equally strong JSON + tool behavior in our domain; benchmark required.

---

## References

OpenRouter docs and pages used for this spec:

- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/api/reference/streaming
- https://openrouter.ai/docs/guides/features/tool-calling
- https://openrouter.ai/docs/api/reference/responses/basic-usage
- https://openrouter.ai/docs/api/reference/responses/reasoning
- https://openrouter.ai/docs/api/reference/responses/tool-calling
- https://openrouter.ai/docs/guides/routing/model-variants/exacto
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/docs/features/model-routing
- https://openrouter.ai/docs/features/provider-routing
- https://openrouter.ai/docs/api-reference/parameters
- https://openrouter.ai/rankings
