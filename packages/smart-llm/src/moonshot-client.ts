// packages/smart-llm/src/moonshot-client.ts

import type { ErrorLogger, OpenRouterResponse } from './types';

export class MoonshotClient {
	private apiKey: string;
	private apiUrl: string;
	private errorLogger?: ErrorLogger;
	private fetchImpl: typeof fetch;

	constructor(config: {
		apiKey: string;
		apiUrl: string;
		errorLogger?: ErrorLogger;
		fetchImpl?: typeof fetch;
	}) {
		this.apiKey = config.apiKey;
		this.apiUrl = config.apiUrl;
		this.errorLogger = config.errorLogger;
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
	}

	async callMoonshot(params: {
		model: string;
		messages: Array<{
			role: string;
			content: unknown;
			tool_calls?: any[];
			tool_call_id?: string;
			reasoning_content?: string;
		}>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs?: number;
		response_format?: { type: string };
		stream?: boolean;
		tools?: any[];
		tool_choice?: 'auto' | 'none' | 'required';
		stream_options?: {
			include_usage?: boolean;
		};
		prompt_cache_key?: string;
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json'
		};

		const body: any = {
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: params.stream || false
		};

		if (params.response_format) {
			body.response_format = params.response_format;
		}
		if (params.tools && params.tools.length > 0) {
			body.tools = params.tools;
		}
		if (params.tool_choice) {
			body.tool_choice = params.tool_choice;
		}
		if (params.stream_options) {
			body.stream_options = params.stream_options;
		}
		if (params.prompt_cache_key) {
			body.prompt_cache_key = params.prompt_cache_key;
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
					response.headers.get('x-request-id') || response.headers.get('msh-request-id');

				const enrichedError = new Error(
					`Moonshot API error: ${response.status} - ${trimmedMessage}`
				) as Error & {
					status?: number;
					moonshot?: Record<string, unknown>;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.status = response.status;
				enrichedError.moonshot = {
					httpStatus: response.status,
					requestId: requestIdHeader ?? null,
					errorType: errorObject?.type ?? null,
					errorCode: errorObject?.code ?? null,
					errorParam: errorObject?.param ?? null,
					error: errorObject ?? null,
					providerName: 'moonshotai'
				};
				enrichedError.openrouter = enrichedError.moonshot;
				throw enrichedError;
			}

			const data = (await response.json()) as OpenRouterResponse;
			if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
				const enrichedError = new Error(
					`Moonshot API error: ${data.error.message}`
				) as Error & {
					moonshot?: Record<string, unknown>;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.moonshot = {
					error: data.error,
					providerName: 'moonshotai'
				};
				enrichedError.openrouter = enrichedError.moonshot;
				throw enrichedError;
			}

			if (!data.provider) {
				data.provider = 'moonshotai';
			}

			return data;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				if (this.errorLogger) {
					await this.errorLogger.logAPIError(error, this.apiUrl, 'POST', undefined, {
						operation: 'callMoonshot_timeout',
						errorType: 'llm_api_timeout',
						modelRequested: params.model,
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
}
