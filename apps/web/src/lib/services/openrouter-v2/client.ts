// apps/web/src/lib/services/openrouter-v2/client.ts

import type { OpenRouterChatRequest, OpenRouterChatResponse, OpenRouterV2Config } from './types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const CHAT_COMPLETIONS_PATH = '/chat/completions';

export class OpenRouterApiError extends Error {
	status?: number;
	requestId?: string;
	details?: Record<string, unknown>;

	constructor(
		message: string,
		params?: { status?: number; requestId?: string; details?: Record<string, unknown> }
	) {
		super(message);
		this.name = 'OpenRouterApiError';
		this.status = params?.status;
		this.requestId = params?.requestId;
		this.details = params?.details;
	}
}

function extractErrorMessage(rawText: string, parsed: unknown): string {
	if (parsed && typeof parsed === 'object') {
		const root = parsed as Record<string, unknown>;
		const error =
			root.error && typeof root.error === 'object'
				? (root.error as Record<string, unknown>)
				: root;
		const message = error.message;
		if (typeof message === 'string' && message.trim().length > 0) {
			return message;
		}
	}
	if (rawText.trim().length > 0) {
		return rawText;
	}
	return 'Unknown OpenRouter error';
}

function buildMergedAbortSignal(params: { external?: AbortSignal; timeoutMs?: number }): {
	signal?: AbortSignal;
	cleanup: () => void;
} {
	const timeoutMs = params.timeoutMs;
	const external = params.external;

	if (!timeoutMs || timeoutMs <= 0) {
		return { signal: external, cleanup: () => undefined };
	}

	const controller = new AbortController();
	const onExternalAbort = () => controller.abort(external?.reason);
	if (external) {
		if (external.aborted) {
			controller.abort(external.reason);
		} else {
			external.addEventListener('abort', onExternalAbort, { once: true });
		}
	}

	const timeoutId = setTimeout(() => {
		controller.abort(new Error(`OpenRouter request timeout after ${timeoutMs}ms`));
	}, timeoutMs);

	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timeoutId);
			if (external) {
				external.removeEventListener('abort', onExternalAbort);
			}
		}
	};
}

export class OpenRouterV2Client {
	private apiKey: string;
	private baseUrl: string;
	private httpReferer: string;
	private appName: string;
	private fetchImpl: typeof fetch;
	private defaultTimeoutMs?: number;

	constructor(config: OpenRouterV2Config) {
		this.apiKey = config.apiKey;
		this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
		this.httpReferer = config.httpReferer;
		this.appName = config.appName;
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
		this.defaultTimeoutMs = config.defaultTimeoutMs;
	}

	async createChatCompletion(request: OpenRouterChatRequest): Promise<OpenRouterChatResponse> {
		const response = await this.requestChatCompletions(request);
		const parsed = (await response.json()) as OpenRouterChatResponse;
		const responseError = parsed.error?.message;
		if (typeof responseError === 'string' && responseError.trim().length > 0) {
			throw new OpenRouterApiError(`OpenRouter API error: ${responseError}`, {
				status: response.status,
				requestId:
					response.headers.get('x-request-id') ||
					response.headers.get('x-openrouter-request-id') ||
					undefined,
				details: parsed.error as Record<string, unknown>
			});
		}
		return parsed;
	}

	async openChatCompletionStream(request: OpenRouterChatRequest): Promise<Response> {
		return this.requestChatCompletions({
			...request,
			stream: true
		});
	}

	private async requestChatCompletions(request: OpenRouterChatRequest): Promise<Response> {
		const url = `${this.baseUrl}${CHAT_COMPLETIONS_PATH}`;
		const body: Record<string, unknown> = {
			model: request.model,
			messages: request.messages,
			stream: request.stream === true
		};

		if (typeof request.temperature === 'number') body.temperature = request.temperature;
		if (typeof request.max_tokens === 'number') body.max_tokens = request.max_tokens;
		if (request.response_format) body.response_format = request.response_format;
		if (request.reasoning) body.reasoning = request.reasoning;
		if (request.provider) body.provider = request.provider;
		if (Array.isArray(request.tools) && request.tools.length > 0) body.tools = request.tools;
		if (request.tool_choice) body.tool_choice = request.tool_choice;

		if (Array.isArray(request.models) && request.models.length > 1) {
			body.extra_body = {
				models: request.models.slice(1)
			};
		}

		const { signal, cleanup } = buildMergedAbortSignal({
			external: request.signal,
			timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs
		});

		try {
			const response = await this.fetchImpl(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': this.httpReferer,
					'X-Title': this.appName
				},
				body: JSON.stringify(body),
				signal
			});

			if (response.ok) {
				return response;
			}

			const rawText = await response.text();
			let parsed: unknown = null;
			try {
				parsed = JSON.parse(rawText);
			} catch {
				parsed = null;
			}
			const message = extractErrorMessage(rawText, parsed);
			const requestId =
				response.headers.get('x-request-id') ||
				response.headers.get('x-openrouter-request-id') ||
				undefined;

			throw new OpenRouterApiError(`OpenRouter API error: ${response.status} - ${message}`, {
				status: response.status,
				requestId,
				details:
					parsed && typeof parsed === 'object'
						? (parsed as Record<string, unknown>)
						: undefined
			});
		} finally {
			cleanup();
		}
	}
}
