// packages/smart-llm/src/openrouter-client.ts

import type { OpenRouterResponse, OpenRouterTranscriptionResponse } from './types';
import {
	buildOpenRouterChatCompletionBody,
	type OpenRouterPrivacyMode
} from './openrouter-request';
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

const DEFAULT_DRAIN_MS = 120_000;

/** How one chat-completions request went, for incident capture. */
export type OpenRouterCallObservation = {
	/** The exact JSON body sent. */
	requestBody: string;
	requestHeaders: Record<string, string>;
	/** Epoch ms when the request was sent. */
	startedAt: number;
	/** Ms after send when the response headers arrived, if they did. */
	openedMs: number | null;
	/** Ms after send when the caller got its answer or error. */
	endedMs: number;
	httpStatus: number | null;
	responseHeaders: Record<string, string> | null;
	responseText: string | null;
	outcome:
		| 'ok'
		| 'http_error'
		| 'timeout'
		| 'cancelled'
		| 'invalid_json'
		| 'error_response'
		| 'request_failed';
	errorName: string | null;
	timeoutMs: number;
	/** The parsed completion, when one arrived. */
	response: OpenRouterResponse | null;
	/** Set when a timed-out request was left running; settles with how it ended. */
	eventual: Promise<OpenRouterCallEventual> | null;
};

export type OpenRouterCallEventual = {
	/** Same vocabulary as the chat worker's drain: the story renderer reads it. */
	endedBy: 'stream_end' | 'response_error' | 'request_error' | 'deadline' | 'cancelled';
	/** Ms after the original send. */
	totalMs: number;
	/** Ms after send when the response headers arrived, if they did. */
	openedMs: number | null;
	httpStatus: number | null;
	responseHeaders: Record<string, string> | null;
	responseText: string | null;
};

export type OpenRouterCallObserver = {
	onEnd: (observation: OpenRouterCallObservation) => void;
	/**
	 * Asked when the request times out. Return a release callback to leave the
	 * request running (up to `drainMs`) so its ending can be recorded, or null to
	 * abort it as usual.
	 */
	acquireDrain?: () => (() => void) | null;
	drainMs?: number;
};

type ExchangeState = {
	openedMs: number | null;
	httpStatus: number | null;
	headers: Record<string, string> | null;
	text: string | null;
	generationIdHeader: string | null;
};

function errorName(error: unknown): string | null {
	return error instanceof Error ? error.name : null;
}

function headerRecord(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		if (key === 'set-cookie' || key === 'cookie') return;
		out[key] = value.slice(0, 500);
	});
	return out;
}

/** Observers run after the call settles and must never change its result. */
function notify(observer: OpenRouterCallObserver | null, observation: OpenRouterCallObservation) {
	if (!observer) return;
	try {
		observer.onEnd(observation);
	} catch {
		// Incident capture is best effort.
	}
}

/** Lets a timed-out request finish (or hit the drain deadline) and reports how it ended. */
function drainExchange(input: {
	exchange: Promise<{ response: Response; text: string }>;
	transport: AbortController;
	startedAt: number;
	drainMs: number;
	release: () => void;
	state: ExchangeState;
	/** The caller's signal: a job cancelled after its timeout still stops the request. */
	signal?: AbortSignal;
}): Promise<OpenRouterCallEventual> {
	let deadlineHit = false;
	let cancelled = false;
	const deadline = setTimeout(() => {
		deadlineHit = true;
		input.transport.abort(new DOMException('Incident drain deadline', 'TimeoutError'));
	}, input.drainMs);
	(deadline as { unref?: () => void }).unref?.();
	const onCancel = () => {
		cancelled = true;
		input.transport.abort(input.signal?.reason);
	};
	if (input.signal?.aborted) onCancel();
	else input.signal?.addEventListener('abort', onCancel, { once: true });
	const ended = (endedBy: OpenRouterCallEventual['endedBy']): OpenRouterCallEventual => ({
		endedBy,
		totalMs: Date.now() - input.startedAt,
		openedMs: input.state.openedMs,
		httpStatus: input.state.httpStatus,
		responseHeaders: input.state.headers,
		responseText: input.state.text
	});
	return input.exchange
		.then(
			({ response }) => ended(response.ok ? 'stream_end' : 'response_error'),
			() => ended(cancelled ? 'cancelled' : deadlineHit ? 'deadline' : 'request_error')
		)
		.finally(() => {
			clearTimeout(deadline);
			input.signal?.removeEventListener('abort', onCancel);
			input.release();
		});
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
		signal?: AbortSignal; // Caller cancellation, combined with the timeout
		response_format?: { type: string };
		reasoning?: unknown;
		stream?: boolean;
		transforms?: string[];
		route?: 'fallback'; // NOTE: Not used - kept for backwards compatibility
		provider?: Record<string, unknown>;
		privacy?: OpenRouterPrivacyMode;
		/** Told how the call went, once, after it settles (incident capture). */
		observe?: OpenRouterCallObserver;
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
			provider: params.provider,
			privacy: params.privacy
		});
		const timeoutMs = params.timeoutMs ?? 120000;
		const requestBody = JSON.stringify(body);
		const observer = params.observe ?? null;
		const startedAt = Date.now();
		const exchangeState: ExchangeState = {
			openedMs: null,
			httpStatus: null,
			headers: null,
			text: null,
			generationIdHeader: null
		};

		// The transport has its own controller so a timed-out request can be left
		// running for incident capture while the caller still gets its timeout.
		const transport = new AbortController();
		const onCallerAbort = () => transport.abort(params.signal?.reason);
		if (params.signal?.aborted) onCallerAbort();
		else params.signal?.addEventListener('abort', onCallerAbort, { once: true });

		let timedOut = false;
		let eventual: Promise<OpenRouterCallEventual> | null = null;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

		const exchange = (async () => {
			const response = await this.fetchImpl(this.apiUrl, {
				method: 'POST',
				headers,
				body: requestBody,
				signal: transport.signal
			});
			exchangeState.openedMs = Date.now() - startedAt;
			exchangeState.httpStatus = response.status;
			exchangeState.generationIdHeader = response.headers.get('x-generation-id');
			if (observer) exchangeState.headers = headerRecord(response.headers);
			try {
				exchangeState.text = await response.text();
			} catch (error) {
				const abortLike =
					error instanceof Error &&
					(error.name === 'TimeoutError' || error.name === 'AbortError');
				// A broken 200 body reads as invalid JSON, as it did with response.json().
				const thrown =
					abortLike || !response.ok || params.signal?.aborted
						? error
						: new SyntaxError('OpenRouter returned invalid JSON');
				(thrown as Error & { openrouter?: Record<string, unknown> }).openrouter = {
					generationId: safeProviderIdentifier(exchangeState.generationIdHeader)
				};
				throw thrown;
			}
			return { response, text: exchangeState.text };
		})();
		// A timeout can win the race below; the exchange may still settle later.
		exchange.catch(() => undefined);

		const timeout = new Promise<never>((_, reject) => {
			timeoutTimer = setTimeout(() => {
				timedOut = true;
				const error = new DOMException(
					`The operation timed out after ${timeoutMs}ms`,
					'TimeoutError'
				) as DOMException & { openrouter?: Record<string, unknown> };
				error.openrouter = {
					generationId: safeProviderIdentifier(exchangeState.generationIdHeader)
				};
				const release = observer?.acquireDrain?.() ?? null;
				if (release) {
					eventual = drainExchange({
						exchange,
						transport,
						startedAt,
						drainMs: observer?.drainMs ?? DEFAULT_DRAIN_MS,
						release,
						state: exchangeState,
						signal: params.signal
					});
				} else {
					transport.abort(error);
				}
				reject(error);
			}, timeoutMs);
			(timeoutTimer as { unref?: () => void }).unref?.();
		});
		timeout.catch(() => undefined);

		let data: OpenRouterResponse | null = null;
		try {
			let settled: { response: Response; text: string };
			try {
				settled = await Promise.race([exchange, timeout]);
			} finally {
				clearTimeout(timeoutTimer);
				params.signal?.removeEventListener('abort', onCallerAbort);
			}
			const { response, text: responseText } = settled;

			if (!response.ok) {
				const errorText = responseText;
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
			try {
				data = JSON.parse(responseText) as OpenRouterResponse;
			} catch {
				const enrichedError = new SyntaxError(
					'OpenRouter returned invalid JSON'
				) as Error & {
					openrouter?: Record<string, unknown>;
				};
				enrichedError.openrouter = {
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

			notify(observer, {
				...observation(),
				outcome: 'ok',
				errorName: null,
				response: data
			});
			return data;
		} catch (error) {
			// The caller's abort reason arrives verbatim (the queue uses a plain
			// Error), so cancellation must be checked before error.name.
			if (params.signal?.aborted) {
				// A caller's own AbortSignal.timeout is a stall, not a cancellation.
				const callerTimedOut =
					(params.signal.reason as { name?: unknown } | undefined)?.name ===
					'TimeoutError';
				notify(observer, {
					...observation(),
					outcome: callerTimedOut ? 'timeout' : 'cancelled',
					errorName: errorName(error),
					response: data
				});
				throw new LLMRequestCancelledError(reasonMessage(params.signal.reason));
			}

			const abortLike =
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError');
			notify(observer, {
				...observation(),
				outcome:
					timedOut || abortLike
						? 'timeout'
						: error instanceof Error && error.name === 'OpenRouterHTTPError'
							? 'http_error'
							: error instanceof Error && error.name === 'OpenRouterResponseError'
								? 'error_response'
								: error instanceof SyntaxError
									? 'invalid_json'
									: 'request_failed',
				errorName: errorName(error),
				response: data
			});
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

		function observation(): Omit<
			OpenRouterCallObservation,
			'outcome' | 'errorName' | 'response'
		> {
			return {
				requestBody,
				requestHeaders: {
					'HTTP-Referer': headers['HTTP-Referer'],
					'X-Title': headers['X-Title'],
					Authorization: '[redacted]'
				},
				startedAt,
				endedMs: Date.now() - startedAt,
				openedMs: exchangeState.openedMs,
				httpStatus: exchangeState.httpStatus,
				responseHeaders: exchangeState.headers,
				responseText: exchangeState.text,
				timeoutMs,
				eventual
			};
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
				signal: AbortSignal.timeout(Math.max(1, Math.floor(params.timeoutMs)))
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
