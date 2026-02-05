// packages/smart-llm/src/openrouter-client.ts

import type { ErrorLogger, OpenRouterResponse } from './types';

export class OpenRouterClient {
	private apiKey: string;
	private apiUrl: string;
	private httpReferer: string;
	private appName: string;
	private errorLogger?: ErrorLogger;
	private fetchImpl: typeof fetch;

	constructor(config: {
		apiKey: string;
		apiUrl: string;
		httpReferer: string;
		appName: string;
		errorLogger?: ErrorLogger;
		fetchImpl?: typeof fetch;
	}) {
		this.apiKey = config.apiKey;
		this.apiUrl = config.apiUrl;
		this.httpReferer = config.httpReferer;
		this.appName = config.appName;
		this.errorLogger = config.errorLogger;
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
	}

	async callOpenRouter(params: {
		model: string;
		models?: string[]; // Additional models for fallback (OpenRouter extension)
		messages: Array<{ role: string; content: string }>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs?: number;
		response_format?: { type: string };
		stream?: boolean;
		transforms?: string[];
		route?: 'fallback'; // NOTE: Not used - kept for backwards compatibility
		provider?: any; // NOTE: Not used - kept for backwards compatibility
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		// Build request body following OpenRouter API v1 spec
		// See: https://openrouter.ai/docs/api-reference/chat/send-chat-completion-request
		const body: any = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: params.stream || false
		};

		// Add response format if supported (e.g., json_object for compatible models)
		if (params.response_format) {
			body.response_format = params.response_format;
		}

		// Add fallback models using extra_body (OpenRouter convention)
		// The primary model is in 'model', fallbacks go in extra_body.models
		if (params.models && params.models.length > 1) {
			body.extra_body = {
				models: params.models.slice(1) // All models except the first (primary)
			};
		}

		if (params.transforms && params.transforms.length > 0) {
			body.transforms = params.transforms;
		}

		try {
			const timeoutMs = params.timeoutMs ?? 120000;
			const response = await this.fetchImpl(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs)
			});

			if (!response.ok) {
				const errorText = await response.text();
				let parsed: any = null;
				try {
					parsed = JSON.parse(errorText);
				} catch {
					parsed = null;
				}

				const errorObject =
					parsed?.error && typeof parsed.error === 'object' ? parsed.error : parsed;
				const providerMessage =
					typeof errorObject?.message === 'string'
						? errorObject.message
						: typeof errorText === 'string'
							? errorText
							: 'Unknown error';
				const trimmedMessage =
					providerMessage.length > 4000
						? `${providerMessage.slice(0, 4000)}…`
						: providerMessage;
				const requestIdHeader =
					response.headers.get('x-request-id') ||
					response.headers.get('x-openrouter-request-id') ||
					response.headers.get('openrouter-request-id');
				const errorMetadata =
					errorObject?.metadata && typeof errorObject.metadata === 'object'
						? (errorObject.metadata as Record<string, unknown>)
						: null;
				const providerName =
					typeof errorMetadata?.provider_name === 'string'
						? errorMetadata.provider_name
						: null;

				const enrichedError = new Error(
					`OpenRouter API error: ${response.status} - ${trimmedMessage}`
				) as Error & {
					status?: number;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.status = response.status;
				enrichedError.openrouter = {
					httpStatus: response.status,
					requestId: requestIdHeader ?? null,
					errorType: errorObject?.type ?? null,
					errorCode: errorObject?.code ?? null,
					errorParam: errorObject?.param ?? null,
					error: errorObject ?? null,
					metadata: errorMetadata,
					providerName
				};
				throw enrichedError;
			}

			const data = (await response.json()) as OpenRouterResponse;
			if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
				const errorMetadata =
					data.error.metadata && typeof data.error.metadata === 'object'
						? (data.error.metadata as Record<string, unknown>)
						: null;
				const providerName =
					typeof errorMetadata?.provider_name === 'string'
						? errorMetadata.provider_name
						: null;
				const enrichedError = new Error(
					`OpenRouter API error: ${data.error.message}`
				) as Error & {
					openrouter?: Record<string, unknown>;
				};
				enrichedError.openrouter = {
					error: data.error,
					metadata: errorMetadata,
					providerName
				};
				throw enrichedError;
			}

			// Log OpenRouter routing result with all available metadata
			const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
			const cacheHitRate = data.usage?.prompt_tokens
				? ((cachedTokens / data.usage.prompt_tokens) * 100).toFixed(1)
				: '0.0';

			console.debug('OpenRouter routing result:', {
				model: data.model || params.model,
				provider: data.provider || 'Unknown',
				cacheStatus:
					cachedTokens > 0
						? `${cacheHitRate}% cached (${cachedTokens} tokens)`
						: 'no cache',
				requestId: data.id,
				systemFingerprint: data.system_fingerprint,
				reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens || 0
			});

			return data;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				if (this.errorLogger) {
					await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', undefined, {
						operation: 'callOpenRouter_timeout',
						errorType: 'llm_api_timeout',
						modelRequested: params.model,
						alternativeModels: params.models?.join(', ') || 'none',
						timeoutMs: params.timeoutMs ?? 120000,
						temperature: params.temperature,
						maxTokens: params.max_tokens
					});
				}
				throw new Error(`Request timeout for model ${params.model}`);
			}
			throw error;
		}
	}

	async callOpenRouterAudio(params: {
		model: string;
		messages: Array<{
			role: string;
			content:
				| string
				| Array<
						| { type: 'text'; text: string }
						| { type: 'input_audio'; input_audio: { data: string; format: string } }
				  >;
		}>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs: number;
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		const body = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: false
		};

		try {
			const response = await this.fetchImpl(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(params.timeoutMs)
			});

			if (!response.ok) {
				const errorText = await response.text();
				const error = new Error(
					`OpenRouter API error: ${response.status} - ${errorText}`
				) as Error & { status?: number };
				error.status = response.status;
				throw error;
			}

			return (await response.json()) as OpenRouterResponse;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				const timeoutError = new Error(
					`Transcription request timed out after ${params.timeoutMs}ms`
				) as Error & { name: string };
				timeoutError.name = 'TranscriptionTimeoutError';
				throw timeoutError;
			}
			throw error;
		}
	}
}
