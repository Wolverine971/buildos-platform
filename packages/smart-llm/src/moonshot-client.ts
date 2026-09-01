// packages/smart-llm/src/moonshot-client.ts

import type { OpenRouterResponse } from './types';
import {
	isOpenRouterModelAvailabilityError,
	isOpenRouterProviderError,
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	safeLlmErrorDiagnostic,
	safeProviderIdentifier
} from './errors';

export class MoonshotClient {
	private apiKey: string;
	private apiUrl: string;
	private fetchImpl: typeof fetch;

	constructor(config: { apiKey: string; apiUrl: string; fetchImpl?: typeof fetch }) {
		this.apiKey = config.apiKey;
		this.apiUrl = config.apiUrl;
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
		signal?: AbortSignal;
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
			const timeoutSignal = AbortSignal.timeout(timeoutMs);
			const requestSignal = params.signal
				? AbortSignal.any([timeoutSignal, params.signal])
				: timeoutSignal;
			const response = await this.fetchImpl(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: requestSignal
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
				const requestIdHeader =
					response.headers.get('x-request-id') || response.headers.get('msh-request-id');
				const classificationSource = {
					status: response.status,
					message: providerMessage,
					openrouter: { providerName: 'moonshotai' }
				};
				const safeErrorCode = safeLlmErrorDiagnostic({
					status: response.status,
					code: errorObject?.code
				}).code;

				const enrichedError = new Error(
					`Moonshot API request failed (status=${response.status}).`
				) as Error & {
					status?: number;
					moonshot?: Record<string, unknown>;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.name = 'MoonshotHTTPError';
				enrichedError.status = response.status;
				enrichedError.moonshot = {
					httpStatus: response.status,
					requestId: safeProviderIdentifier(requestIdHeader),
					errorCode: safeErrorCode ?? null,
					providerName: 'moonshotai',
					modelAvailabilityError:
						isOpenRouterModelAvailabilityError(classificationSource),
					providerError: isOpenRouterProviderError(classificationSource)
				};
				enrichedError.openrouter = enrichedError.moonshot;
				throw enrichedError;
			}

			let data: OpenRouterResponse;
			try {
				data = (await response.json()) as OpenRouterResponse;
			} catch (error) {
				if (
					error instanceof Error &&
					(error.name === 'TimeoutError' || error.name === 'AbortError')
				) {
					throw error;
				}
				throw new SyntaxError('Moonshot returned invalid JSON');
			}
			if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
				const classificationSource = {
					message: data.error.message,
					openrouter: { providerName: 'moonshotai' }
				};
				const safeErrorCode = safeLlmErrorDiagnostic({ code: data.error.code }).code;
				const enrichedError = new Error(
					'Moonshot API returned an error response.'
				) as Error & {
					moonshot?: Record<string, unknown>;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.name = 'MoonshotResponseError';
				enrichedError.moonshot = {
					errorCode: safeErrorCode ?? null,
					providerName: 'moonshotai',
					modelAvailabilityError:
						isOpenRouterModelAvailabilityError(classificationSource),
					providerError: isOpenRouterProviderError(classificationSource)
				};
				enrichedError.openrouter = enrichedError.moonshot;
				throw enrichedError;
			}

			if (!data.provider) {
				data.provider = 'moonshotai';
			}

			return data;
		} catch (error) {
			if (params.signal?.aborted) {
				const reason =
					params.signal.reason instanceof Error
						? params.signal.reason.message
						: typeof params.signal.reason === 'string'
							? params.signal.reason
							: 'caller cancelled';
				const cancelledError = new LLMRequestCancelledError(reason);
				(cancelledError as Error & { cause?: unknown }).cause = error;
				throw cancelledError;
			}

			// AbortSignal.timeout() rejects with a DOMException named TimeoutError,
			// not AbortError. Surface the same typed error as the OpenRouter client so
			// callers and usage logging classify Moonshot timeouts identically.
			if (
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError')
			) {
				const timeoutMs = params.timeoutMs ?? 120000;
				const timeoutError = new LLMRequestTimeoutError(timeoutMs, params.model, {
					generationId: null
				});
				(timeoutError as Error & { cause?: unknown }).cause = error;
				// Terminal logging is owned by the service-layer catch; see the same
				// note in openrouter-client.ts.
				throw timeoutError;
			}
			throw error;
		}
	}
}
