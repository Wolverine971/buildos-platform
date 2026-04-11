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
};

function uniqueNonEmpty(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
	);
}

export function resolveOpenRouterFallbackModels(model: string, models?: string[]): string[] {
	const primary = model.trim();
	return uniqueNonEmpty(models ?? []).filter((entry) => entry !== primary);
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

	const fallbackModels = resolveOpenRouterFallbackModels(params.model, params.models);
	if (fallbackModels.length > 0) {
		body.models = fallbackModels;
	}

	return body;
}
