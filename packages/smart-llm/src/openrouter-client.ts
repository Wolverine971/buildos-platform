// packages/smart-llm/src/openrouter-client.ts

import type { OpenRouterResponse, OpenRouterTranscriptionResponse } from './types';
import { buildOpenRouterChatCompletionBody } from './openrouter-request';
import {
	isOpenRouterModelAvailabilityError,
	isOpenRouterProviderError,
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	safeLlmErrorDiagnostic,
	safeProviderIdentifier
} from './errors';

function reasonMessage(reason: unknown): string {
	if (reason instanceof Error && reason.message.trim()) return reason.message;
	if (typeof reason === 'string' && reason.trim()) return reason;
	return 'caller cancelled';
}

export class OpenRouterClient {
	private apiKey: string;
	private apiUrl: string;
	private httpReferer: string;
	private appName: string;
	private fetchImpl: typeof fetch;

	constructor(config: {
		apiKey: string;
		apiUrl: string;
		httpReferer: string;
		appName: string;
		fetchImpl?: typeof fetch;
	}) {
		this.apiKey = config.apiKey;
		this.apiUrl = config.apiUrl;
		this.httpReferer = config.httpReferer;
		this.appName = config.appName;
		this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
	}

	async callOpenRouter(params: {
		model: string;
		models?: string[]; // Additional models for fallback (OpenRouter extension)
		messages: Array<{ role: string; content: string }>;
		temperature?: number;
		max_tokens?: number;
		timeoutMs?: number;
		signal?: AbortSignal; // Caller cancellation, combined with the timeout signal
		response_format?: { type: string };
		reasoning?: unknown;
		stream?: boolean;
		transforms?: string[];
		route?: 'fallback'; // NOTE: Not used - kept for backwards compatibility
		provider?: Record<string, unknown>;
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		const body = buildOpenRouterChatCompletionBody({
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: params.stream || false,
			response_format: params.response_format,
			reasoning: params.reasoning,
			models: params.models,
			transforms: params.transforms,
			provider: params.provider
		});
		const timeoutMs = params.timeoutMs ?? 120000;

		try {
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
					response.headers.get('x-request-id') ||
					response.headers.get('x-openrouter-request-id') ||
					response.headers.get('openrouter-request-id');
				const generationIdHeader = response.headers.get('x-generation-id');
				const retryAfterHeader = response.headers.get('retry-after');
				const retryAfterSeconds =
					retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
				const retryAfterMs =
					Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
						? retryAfterSeconds * 1000
						: null;
				const errorMetadata =
					errorObject?.metadata && typeof errorObject.metadata === 'object'
						? (errorObject.metadata as Record<string, unknown>)
						: null;
				const providerName =
					typeof errorMetadata?.provider_name === 'string'
						? errorMetadata.provider_name
						: null;
				const classificationSource = {
					status: response.status,
					message: providerMessage,
					openrouter: { metadata: errorMetadata, providerName }
				};
				const safeErrorCode = safeLlmErrorDiagnostic({
					status: response.status,
					code: errorObject?.code
				}).code;

				const enrichedError = new Error(
					`OpenRouter API request failed (status=${response.status}).`
				) as Error & {
					status?: number;
					openrouter?: Record<string, unknown>;
				};
				enrichedError.name = 'OpenRouterHTTPError';
				enrichedError.status = response.status;
				enrichedError.openrouter = {
					httpStatus: response.status,
					requestId: safeProviderIdentifier(requestIdHeader),
					generationId: safeProviderIdentifier(generationIdHeader),
					errorCode: safeErrorCode ?? null,
					providerName: null,
					retryAfterMs,
					modelAvailabilityError:
						isOpenRouterModelAvailabilityError(classificationSource),
					providerError: isOpenRouterProviderError(classificationSource)
				};
				throw enrichedError;
			}

			const generationIdHeader = response.headers.get('x-generation-id');
			let data: OpenRouterResponse;
			try {
				data = (await response.json()) as OpenRouterResponse;
			} catch (error) {
				const enrichedError =
					error instanceof Error &&
					(error.name === 'TimeoutError' || error.name === 'AbortError')
						? error
						: new SyntaxError('OpenRouter returned invalid JSON');
				(
					enrichedError as Error & {
						openrouter?: Record<string, unknown>;
					}
				).openrouter = {
					generationId: safeProviderIdentifier(generationIdHeader)
				};
				throw enrichedError;
			}
			if (data.error && typeof data.error.message === 'string' && data.error.message.trim()) {
				const errorMetadata =
					data.error.metadata && typeof data.error.metadata === 'object'
						? (data.error.metadata as Record<string, unknown>)
						: null;
				const providerName =
					typeof errorMetadata?.provider_name === 'string'
						? errorMetadata.provider_name
						: null;
				const classificationSource = {
					message: data.error.message,
					openrouter: { metadata: errorMetadata, providerName }
				};
				const safeErrorCode = safeLlmErrorDiagnostic({ code: data.error.code }).code;
				const enrichedError = new Error(
					'OpenRouter API returned an error response.'
				) as Error & {
					openrouter?: Record<string, unknown>;
				};
				enrichedError.name = 'OpenRouterResponseError';
				enrichedError.openrouter = {
					errorCode: safeErrorCode ?? null,
					providerName: null,
					generationId:
						safeProviderIdentifier(data.id) ??
						safeProviderIdentifier(generationIdHeader),
					modelAvailabilityError:
						isOpenRouterModelAvailabilityError(classificationSource),
					providerError: isOpenRouterProviderError(classificationSource)
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
			// AbortSignal.any() rejects with the caller's reason verbatim. The queue
			// uses a plain Error, so cancellation must be checked before error.name.
			if (params.signal?.aborted) {
				throw new LLMRequestCancelledError(reasonMessage(params.signal.reason));
			}

			const abortLike =
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError');
			if (abortLike) {
				const generationId =
					(
						error as Error & {
							openrouter?: { generationId?: string | null };
						}
					).openrouter?.generationId ?? null;
				const timeoutError = new LLMRequestTimeoutError(timeoutMs, params.model, {
					generationId
				});
				(timeoutError as Error & { cause?: unknown }).cause = error;
				// Deliberately not logged here. A timeout at this layer may still be
				// recovered by the caller's model failover, and logging it created
				// actionable incidents for requests that later succeeded — the same
				// reason the JSON parse-retry path defers to its outer catch. The
				// service-layer catch owns terminal logging and carries strictly more
				// context (profile, attempts, models attempted, generation id).
				throw timeoutError;
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
		provider?: Record<string, unknown>;
	}): Promise<OpenRouterResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};

		const body = buildOpenRouterChatCompletionBody({
			model: params.model,
			messages: params.messages,
			temperature: params.temperature,
			max_tokens: params.max_tokens,
			stream: false,
			provider: params.provider
		});

		try {
			const response = await this.fetchImpl(this.apiUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(params.timeoutMs)
			});

			if (!response.ok) {
				const error = new Error(
					`OpenRouter audio request failed (status=${response.status}).`
				) as Error & { status?: number };
				error.name = 'OpenRouterHTTPError';
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

	async callOpenRouterTranscription(params: {
		model: string;
		inputAudio: { data: string; format: string };
		temperature?: number;
		timeoutMs: number;
		provider?: Record<string, unknown>;
	}): Promise<OpenRouterTranscriptionResponse> {
		const headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': this.httpReferer,
			'X-Title': this.appName
		};
		const transcriptionUrl = this.apiUrl.replace(
			/\/chat\/completions\/?$/,
			'/audio/transcriptions'
		);

		try {
			const response = await this.fetchImpl(transcriptionUrl, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					model: params.model,
					input_audio: params.inputAudio,
					...(params.temperature === undefined
						? {}
						: { temperature: params.temperature }),
					...(params.provider ? { provider: params.provider } : {})
				}),
				signal: AbortSignal.timeout(params.timeoutMs)
			});

			if (!response.ok) {
				const enrichedError = new Error(
					`OpenRouter transcription request failed (status=${response.status}).`
				) as Error & { status?: number; openrouter?: Record<string, unknown> };
				enrichedError.name = 'OpenRouterHTTPError';
				enrichedError.status = response.status;
				enrichedError.openrouter = {
					httpStatus: response.status,
					requestId:
						safeProviderIdentifier(response.headers.get('x-generation-id')) ??
						safeProviderIdentifier(response.headers.get('x-request-id'))
				};
				throw enrichedError;
			}

			const data = (await response.json()) as OpenRouterTranscriptionResponse;
			return {
				...data,
				requestId:
					data.requestId ||
					response.headers.get('x-generation-id') ||
					response.headers.get('x-request-id') ||
					undefined
			};
		} catch (error) {
			if (
				error instanceof Error &&
				(error.name === 'AbortError' || error.name === 'TimeoutError')
			) {
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
