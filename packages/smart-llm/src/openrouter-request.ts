// packages/smart-llm/src/openrouter-request.ts

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

export function buildOpenRouterChatCompletionBody(
	params: OpenRouterChatCompletionBodyParams
): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: params.model,
		messages: params.messages
	};

	if (typeof params.stream === 'boolean') body.stream = params.stream;
	if (typeof params.temperature === 'number') body.temperature = params.temperature;
	if (typeof params.max_tokens === 'number') body.max_tokens = params.max_tokens;
	if (params.response_format) body.response_format = params.response_format;
	if (params.reasoning) body.reasoning = params.reasoning;
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

	const fallbackModels = resolveOpenRouterFallbackModels(params.model, params.models);
	if (fallbackModels.length > 0) {
		body.models = fallbackModels;
	}

	return body;
}
