// packages/smart-llm/src/openrouter-request.ts

import { GPT_56_LUNA_MODEL, KIMI_K3_MODEL } from './model-config';

export type OpenRouterChatCompletionBodyParams = {
	model: string;
	messages: unknown[];
	models?: string[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	response_format?: unknown;
	reasoning?: unknown;
	provider?: unknown;
	tools?: unknown[];
	tool_choice?: unknown;
	stream_options?: Record<string, unknown>;
	transforms?: string[];
	// OpenRouter's documented sticky-routing / cache-affinity key (top-level field,
	// max 256 chars). See https://openrouter.ai/docs/guides/best-practices/prompt-caching
	session_id?: string;
	// OpenAI-compatible prompt-cache routing hint. OpenRouter does not document this
	// field itself, but forwards pass-through params to OpenAI-compatible upstreams,
	// where it improves cache-hit routing. Additive/optional — safe when unsupported.
	prompt_cache_key?: string;
};

export const OPENROUTER_MAX_FALLBACK_MODELS = 3;

export const OPENROUTER_NO_DATA_COLLECTION_PROVIDER = Object.freeze({
	data_collection: 'deny' as const
});

export const OPENROUTER_PRIVATE_PROVIDER = Object.freeze({
	data_collection: 'deny' as const,
	zdr: true
});

export type OpenRouterModelRequestPolicy = {
	temperature: 'supported' | 'omit';
	requiredReasoningEffort?: 'max';
	includeReasoningDetails?: boolean;
};

export const OPENROUTER_MODEL_REQUEST_POLICIES: Readonly<
	Record<string, OpenRouterModelRequestPolicy>
> = Object.freeze({
	[KIMI_K3_MODEL]: Object.freeze({
		temperature: 'omit' as const,
		requiredReasoningEffort: 'max' as const,
		includeReasoningDetails: true
	}),
	[GPT_56_LUNA_MODEL]: Object.freeze({
		temperature: 'omit' as const
	})
});

function uniqueNonEmpty(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
	);
}

export function resolveOpenRouterFallbackModels(model: string, models?: string[]): string[] {
	const primary = model.trim();
	return uniqueNonEmpty(models ?? [])
		.filter((entry) => entry !== primary)
		.slice(0, OPENROUTER_MAX_FALLBACK_MODELS);
}

function normalizeReasoningForModel(model: string, reasoning: unknown): unknown {
	const policy = OPENROUTER_MODEL_REQUEST_POLICIES[model];
	if (!policy?.requiredReasoningEffort) return reasoning;

	const suppliedReasoning =
		reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning)
			? (reasoning as Record<string, unknown>)
			: {};

	return {
		...suppliedReasoning,
		effort: policy.requiredReasoningEffort,
		...(policy.includeReasoningDetails ? { exclude: false } : {})
	};
}

export function buildOpenRouterChatCompletionBody(
	params: OpenRouterChatCompletionBodyParams
): Record<string, unknown> {
	const requestPolicy = OPENROUTER_MODEL_REQUEST_POLICIES[params.model];
	const body: Record<string, unknown> = {
		model: params.model,
		messages: params.messages
	};

	if (typeof params.stream === 'boolean') body.stream = params.stream;
	if (typeof params.temperature === 'number' && requestPolicy?.temperature !== 'omit') {
		body.temperature = params.temperature;
	}
	if (typeof params.max_tokens === 'number') body.max_tokens = params.max_tokens;
	if (params.response_format) body.response_format = params.response_format;
	const normalizedReasoning = normalizeReasoningForModel(params.model, params.reasoning);
	if (normalizedReasoning) body.reasoning = normalizedReasoning;
	if (params.provider) body.provider = params.provider;
	if (Array.isArray(params.tools) && params.tools.length > 0) body.tools = params.tools;
	if (params.tool_choice) body.tool_choice = params.tool_choice;
	if (params.stream_options) body.stream_options = params.stream_options;
	if (Array.isArray(params.transforms) && params.transforms.length > 0) {
		body.transforms = params.transforms;
	}
	if (typeof params.session_id === 'string' && params.session_id.trim().length > 0) {
		body.session_id = params.session_id.trim().slice(0, 256);
	}
	if (typeof params.prompt_cache_key === 'string' && params.prompt_cache_key.trim().length > 0) {
		body.prompt_cache_key = params.prompt_cache_key.trim();
	}

	// Opt in to OpenRouter usage accounting so responses carry authoritative
	// usage.cost. Settlement then records provider-reported spend instead of a
	// catalog estimate, and budgeted-call reconciliation traffic shrinks.
	body.usage = { include: true };

	const fallbackModels = resolveOpenRouterFallbackModels(params.model, params.models);
	if (fallbackModels.length > 0) {
		body.models = fallbackModels;
	}

	return body;
}
