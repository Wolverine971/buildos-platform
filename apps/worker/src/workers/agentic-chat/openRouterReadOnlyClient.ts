// apps/worker/src/workers/agentic-chat/openRouterReadOnlyClient.ts
import { createHash } from 'node:crypto';
import {
	buildOpenRouterChatCompletionBody,
	normalizeStreamingContent,
	resolveModelPricingProfile
} from '@buildos/smart-llm';
import type { UsageLogger } from '@buildos/smart-llm';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type {
	AgenticChatReadOnlyProviderClientEventV1,
	AgenticChatReadOnlyProviderClientPortV1,
	AgenticChatReadOnlyProviderMessageV1,
	AgenticChatReadOnlyProviderToolV1
} from './readOnlyProvider';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from './readOnlyTool';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	reviewedAgenticChatMutationSpecV1
} from './mutationToolCatalog';
import { runWithAbortableDeadline } from './abortableDeadline';
import {
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from './executionObservation';

const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 2_000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_SSE_BUFFER_BYTES = 256 * 1024;
const PROVIDER_TELEMETRY_TIMEOUT_MS = 5_000;
const USAGE_LOG_IDENTITY_VERSION = 'agentic_chat_provider_usage_v1';
const MAX_REVIEWED_PROVIDER_TOOLS =
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.length +
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames.length;

export type AgenticChatOpenRouterProviderRoutingV1 = {
	allow_fallbacks?: boolean;
	require_parameters?: boolean;
	data_collection?: 'allow' | 'deny';
	zdr?: boolean;
	sort?: 'price' | 'throughput' | 'latency';
	order?: string[];
	only?: string[];
	ignore?: string[];
};

export type AgenticChatOpenAiCompatibleRouteV1 = {
	id: string;
	kind: 'openrouter' | 'openai_compatible';
	baseUrl: string;
	apiKey: string;
	model: string;
	fallbackModels?: readonly string[];
	providerRouting?: AgenticChatOpenRouterProviderRoutingV1;
	headers?: Readonly<Record<string, string>>;
};

export type AgenticChatProviderUsageObservationV1 = {
	usageLogId: string;
	status: 'success' | 'failure' | 'aborted';
	requestStartedAtMs: number;
	observedAtMs: number;
	userId: string;
	sessionId: string;
	turnRunId: string;
	streamRunId: string;
	clientTurnId: string;
	contextType: string;
	entityId: string | null;
	projectId: string | null;
	logicalProviderRound: number;
	attemptedRouteIds: string[];
	routeId: string | null;
	modelRequested: string | null;
	modelUsed: string | null;
	provider: string | null;
	requestId: string | null;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	reasoningTokens?: number;
	cachedPromptTokens?: number;
	cacheWriteTokens?: number;
	cacheStatus?: string;
	estimated: boolean;
	providerCost: number | null;
	providerInputCost: number;
	providerOutputCost: number;
	costSource: 'provider_reported' | 'catalog_estimate' | 'unknown';
	providerByok?: boolean;
	providerUpstreamInferenceCost?: number;
	retryable: boolean;
	error: string | null;
};

export type AgenticChatProviderUsageObserverPortV1 = {
	observe(observation: AgenticChatProviderUsageObservationV1): void | Promise<void>;
};

type ClientInput = Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0];

type RouteFailure = {
	routeId: string;
	message: string;
	retryable: boolean;
};

type ActiveResponse = {
	route: AgenticChatOpenAiCompatibleRouteV1;
	response: Response;
	requestId: string | null;
	cleanup(): void;
	timedOut(): boolean;
};

type StreamState = {
	rawUsage: unknown;
	finishReason: string | null;
	modelUsed: string | null;
	provider: string | null;
	requestId: string | null;
	inThinkingBlock: boolean;
	completionChars: number;
};

type ProviderUsage = {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	reasoningTokens: number;
	cachedPromptTokens: number;
	cacheWriteTokens: number;
	cacheStatus: string;
	cost: number | null;
	byok: boolean | null;
	upstreamInferenceCost: number | null;
	upstreamPromptCost: number | null;
	upstreamCompletionCost: number | null;
};

class AgenticChatProviderNetworkError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean
	) {
		super(message);
		this.name = 'AgenticChatProviderNetworkError';
	}
}

/**
 * Parity-focused network client for the Phase 3 no-tools lane. Route fallback
 * is allowed only before a response stream is accepted, so emitted assistant
 * text can never be replayed against a second provider.
 */
export class AgenticChatOpenRouterReadOnlyClient
	implements AgenticChatReadOnlyProviderClientPortV1
{
	private readonly routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
	private readonly fetchImpl: typeof fetch;
	private readonly requestTimeoutMs: number;
	private readonly maxTokens: number;
	private readonly temperature: number;
	private readonly maxSseBufferBytes: number;

	constructor(
		private readonly ports: {
			usage: AgenticChatProviderUsageObserverPortV1;
			executionObservations?: AgenticChatExecutionObservationPortV1;
			onUsageError?: (error: unknown) => void;
			onExecutionObservationError?: (error: unknown) => void;
		},
		options: {
			routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
			httpReferer: string;
			appName: string;
			fetchImpl?: typeof fetch;
			requestTimeoutMs?: number;
			maxTokens?: number;
			temperature?: number;
			maxSseBufferBytes?: number;
		}
	) {
		this.routes = validateRoutes(options.routes);
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		this.requestTimeoutMs = boundedInteger(
			options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
			'requestTimeoutMs',
			1_000,
			360_000
		);
		this.maxTokens = boundedInteger(
			options.maxTokens ?? DEFAULT_MAX_TOKENS,
			'maxTokens',
			1,
			32_768
		);
		this.maxSseBufferBytes = boundedInteger(
			options.maxSseBufferBytes ?? DEFAULT_MAX_SSE_BUFFER_BYTES,
			'maxSseBufferBytes',
			1_024,
			1024 * 1024
		);
		this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
		if (!Number.isFinite(this.temperature) || this.temperature < 0 || this.temperature > 2) {
			throw new Error('Agentic Chat provider temperature must be between 0 and 2');
		}
		this.httpReferer = canonicalHeaderValue(options.httpReferer, 'httpReferer');
		this.appName = canonicalHeaderValue(options.appName, 'appName');
		if (typeof this.fetchImpl !== 'function') {
			throw new Error('Agentic Chat provider fetch implementation is unavailable');
		}
	}

	private readonly httpReferer: string;
	private readonly appName: string;

	async *stream(input: ClientInput): AsyncGenerator<AgenticChatReadOnlyProviderClientEventV1> {
		validateToolSurface(input);
		throwIfAborted(input.signal);
		const inputChars =
			JSON.stringify(input.messages).length + JSON.stringify(input.tools).length;
		const requestStartedAtMs = Date.now();
		const attemptedRouteIds: string[] = [];
		const failures: RouteFailure[] = [];
		let lastAttemptedRoute: AgenticChatOpenAiCompatibleRouteV1 | null = null;
		let active: ActiveResponse | null = null;
		let activeAttemptStartedAtMs: number | null = null;
		let activeAttemptEnded = false;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		let accounted = false;
		const state: StreamState = {
			rawUsage: null,
			finishReason: null,
			modelUsed: null,
			provider: null,
			requestId: null,
			inThinkingBlock: false,
			completionChars: 0
		};

		const account = async (
			status: AgenticChatProviderUsageObservationV1['status'],
			error: string | null,
			retryable: boolean
		): Promise<void> => {
			if (accounted) return;
			let exactUsage: ProviderUsage | null;
			try {
				exactUsage = normalizeProviderUsage(state.rawUsage);
			} catch (usageError) {
				if (status === 'success') throw usageError;
				exactUsage = null;
			}
			accounted = true;
			const promptTokens = exactUsage?.promptTokens ?? estimateTokens(inputChars);
			const completionTokens =
				exactUsage?.completionTokens ?? estimateTokens(state.completionChars);
			const routeId = active?.route.id ?? lastAttemptedRoute?.id ?? 'none';
			const modelRequested = active?.route.model ?? lastAttemptedRoute?.model ?? null;
			const modelUsed = state.modelUsed ?? modelRequested;
			const costs = resolveProviderUsageCosts({
				usage: exactUsage,
				modelRequested,
				modelUsed,
				promptTokens,
				completionTokens
			});
			await this.observeUsage(
				{
					usageLogId: createStableAgenticChatProviderUsageLogIdV1({
						turnRunId: input.turnRunId,
						executionGeneration: input.executionGeneration,
						logicalProviderRound: input.logicalProviderRound,
						routeId
					}),
					status,
					requestStartedAtMs,
					observedAtMs: Date.now(),
					userId: input.userId,
					sessionId: input.sessionId,
					turnRunId: input.turnRunId,
					streamRunId: input.streamRunId,
					clientTurnId: input.clientTurnId,
					contextType: input.contextType,
					entityId: input.entityId,
					projectId: input.projectId,
					logicalProviderRound: input.logicalProviderRound,
					attemptedRouteIds: [...attemptedRouteIds],
					routeId: routeId === 'none' ? null : routeId,
					modelRequested,
					modelUsed,
					provider: state.provider ?? active?.route.id ?? lastAttemptedRoute?.id ?? null,
					requestId: state.requestId ?? active?.requestId ?? null,
					promptTokens,
					completionTokens,
					totalTokens: exactUsage?.totalTokens ?? promptTokens + completionTokens,
					...(exactUsage
						? {
								reasoningTokens: exactUsage.reasoningTokens,
								cachedPromptTokens: exactUsage.cachedPromptTokens,
								cacheWriteTokens: exactUsage.cacheWriteTokens,
								cacheStatus: exactUsage.cacheStatus,
								...(exactUsage.byok === null
									? {}
									: { providerByok: exactUsage.byok }),
								...(exactUsage.upstreamInferenceCost === null
									? {}
									: {
											providerUpstreamInferenceCost:
												exactUsage.upstreamInferenceCost
										})
							}
						: {}),
					estimated: exactUsage === null,
					providerCost: exactUsage?.cost ?? null,
					providerInputCost: costs.inputCost,
					providerOutputCost: costs.outputCost,
					costSource: costs.source,
					retryable,
					error
				},
				input.signal
			);
		};

		try {
			for (const route of this.routes) {
				lastAttemptedRoute = route;
				attemptedRouteIds.push(route.id);
				const attemptStartedAtMs = Date.now();
				await this.observeProviderAttempt(input, route, 'provider_attempt_started', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					route_id: route.id,
					model_requested: route.model
				});
				try {
					active = await this.openRoute(route, input);
					activeAttemptStartedAtMs = attemptStartedAtMs;
					break;
				} catch (error) {
					if (input.signal.aborted) throwAbort(input.signal);
					const failure = routeFailure(route.id, error);
					failures.push(failure);
					await this.observeProviderAttempt(input, route, 'provider_attempt_ended', {
						round: input.providerRound,
						logical_provider_round: input.logicalProviderRound,
						route_id: route.id,
						model_requested: route.model,
						status: 'failure',
						duration_ms: boundedDuration(attemptStartedAtMs, Date.now()),
						finish_reason: null,
						error_class: failure.retryable
							? 'provider_retryable_error'
							: 'provider_permanent_error',
						usage: null
					});
				}
			}

			if (!active) {
				const failure = failures.at(-1) ?? {
					routeId: 'none',
					message: 'Agentic Chat provider has no available route',
					retryable: false
				};
				await account('failure', failure.message, failure.retryable);
				yield { type: 'error', error: failure.message, retryable: failure.retryable };
				return;
			}

			state.requestId = active.requestId;
			state.modelUsed = canonicalOptionalHeader(
				active.response.headers.get('x-openrouter-model')
			);
			state.provider = canonicalOptionalHeader(
				active.response.headers.get('x-openrouter-provider')
			);
			reader = active.response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let providerDone = false;

			while (!providerDone) {
				const chunk = await reader.read();
				if (chunk.done) {
					buffer += decoder.decode();
					break;
				}
				buffer += decoder.decode(chunk.value, { stream: true });
				if (Buffer.byteLength(buffer, 'utf8') > this.maxSseBufferBytes) {
					throw new AgenticChatProviderNetworkError(
						'Agentic Chat provider SSE buffer exceeded its bound',
						false
					);
				}

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					const outcome = parseSseLine(line, state);
					for (const event of outcome.events) yield event;
					if (outcome.done) {
						providerDone = true;
						break;
					}
				}
			}

			if (!providerDone && buffer.trim()) {
				const outcome = parseSseLine(buffer, state);
				for (const event of outcome.events) yield event;
				providerDone = outcome.done;
			}
			if (state.finishReason === 'error') {
				throw new AgenticChatProviderNetworkError(
					'Agentic Chat provider stream ended with finish_reason=error',
					false
				);
			}

			const exactUsage = normalizeProviderUsage(state.rawUsage);
			await this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
				round: input.providerRound,
				logical_provider_round: input.logicalProviderRound,
				route_id: active.route.id,
				model_requested: active.route.model,
				model_used: state.modelUsed ?? active.route.model,
				provider: state.provider ?? active.route.id,
				status: 'success',
				duration_ms: boundedDuration(
					activeAttemptStartedAtMs ?? requestStartedAtMs,
					Date.now()
				),
				finish_reason: state.finishReason ?? 'stop',
				error_class: null,
				usage: exactUsage
					? {
							prompt_tokens: exactUsage.promptTokens,
							completion_tokens: exactUsage.completionTokens,
							total_tokens: exactUsage.totalTokens,
							reasoning_tokens: exactUsage.reasoningTokens,
							cached_prompt_tokens: exactUsage.cachedPromptTokens,
							cache_write_tokens: exactUsage.cacheWriteTokens
						}
					: null
			});
			activeAttemptEnded = true;
			await account('success', null, false);
			yield {
				type: 'done',
				finishedReason: state.finishReason ?? 'stop',
				usage: exactUsage
					? {
							promptTokens: exactUsage.promptTokens,
							completionTokens: exactUsage.completionTokens,
							totalTokens: exactUsage.totalTokens
						}
					: undefined
			};
		} catch (error) {
			if (active && !activeAttemptEnded) {
				const aborted = input.signal.aborted;
				await this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					route_id: active.route.id,
					model_requested: active.route.model,
					model_used: state.modelUsed ?? active.route.model,
					provider: state.provider ?? active.route.id,
					status: aborted ? 'aborted' : 'failure',
					duration_ms: boundedDuration(
						activeAttemptStartedAtMs ?? requestStartedAtMs,
						Date.now()
					),
					finish_reason: state.finishReason,
					error_class: aborted
						? 'aborted'
						: active.timedOut()
							? 'provider_timeout'
							: error instanceof AgenticChatProviderNetworkError && error.retryable
								? 'provider_retryable_error'
								: 'provider_permanent_error',
					usage: null
				});
				activeAttemptEnded = true;
			}
			if (input.signal.aborted) {
				await account('aborted', canonicalError(input.signal.reason), false);
				throwAbort(input.signal);
			}
			const retryable =
				error instanceof AgenticChatProviderNetworkError
					? error.retryable
					: active?.timedOut() === true || isRetryableUnknownError(error);
			const message = canonicalError(error);
			await account('failure', message, retryable);
			yield { type: 'error', error: message, retryable };
		} finally {
			if (!accounted) {
				await account(
					input.signal.aborted ? 'aborted' : 'failure',
					input.signal.aborted
						? canonicalError(input.signal.reason)
						: 'Agentic Chat provider stream was closed before completion',
					false
				);
			}
			if (reader) void reader.cancel().catch(() => undefined);
			active?.cleanup();
		}
	}

	private async openRoute(
		route: AgenticChatOpenAiCompatibleRouteV1,
		input: ClientInput
	): Promise<ActiveResponse> {
		const attempt = createAttemptSignal(input.signal, this.requestTimeoutMs);
		try {
			const response = await this.fetchImpl(`${route.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${route.apiKey}`,
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
					'HTTP-Referer': this.httpReferer,
					'X-Title': this.appName,
					...(route.headers ?? {})
				},
				body: JSON.stringify(this.requestBody(route, input)),
				signal: attempt.signal
			});
			if (!response.ok) {
				const message = await responseErrorMessage(response);
				throw new AgenticChatProviderNetworkError(
					`Agentic Chat provider start failed (${response.status}): ${message}`,
					isRetryableStatus(response.status)
				);
			}
			if (!response.body) {
				throw new AgenticChatProviderNetworkError(
					'Agentic Chat provider returned no response stream',
					true
				);
			}
			const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
			const mediaType = contentType.split(';', 1)[0]?.trim();
			if (mediaType !== 'text/event-stream') {
				await response.body.cancel().catch(() => undefined);
				throw new AgenticChatProviderNetworkError(
					'Agentic Chat provider returned a non-SSE success response',
					false
				);
			}
			return {
				route,
				response,
				requestId:
					canonicalOptionalHeader(response.headers.get('x-request-id')) ??
					canonicalOptionalHeader(response.headers.get('x-openrouter-request-id')),
				cleanup: attempt.cleanup,
				timedOut: attempt.timedOut
			};
		} catch (error) {
			attempt.cleanup();
			if (input.signal.aborted) throwAbort(input.signal);
			if (attempt.timedOut()) {
				throw new AgenticChatProviderNetworkError(
					`Agentic Chat provider request timed out after ${this.requestTimeoutMs}ms`,
					true
				);
			}
			throw error;
		}
	}

	private requestBody(
		route: AgenticChatOpenAiCompatibleRouteV1,
		input: ClientInput
	): Record<string, unknown> {
		const toolSurface =
			input.toolChoice === 'auto'
				? { tools: input.tools.map(copyTool), tool_choice: 'auto' as const }
				: { tool_choice: 'none' as const };
		if (route.kind === 'openrouter') {
			return buildOpenRouterChatCompletionBody({
				model: route.model,
				models: route.fallbackModels ? [...route.fallbackModels] : undefined,
				messages: input.messages.map(copyMessage),
				...toolSurface,
				temperature: this.temperature,
				max_tokens: this.maxTokens,
				reasoning: { exclude: true },
				provider: {
					allow_fallbacks: true,
					data_collection: 'deny',
					...(route.providerRouting ?? {})
				},
				stream: true,
				stream_options: { include_usage: true },
				session_id: input.sessionId,
				prompt_cache_key: input.sessionId
			});
		}
		return {
			model: route.model,
			messages: input.messages.map(copyMessage),
			...toolSurface,
			temperature: this.temperature,
			max_tokens: this.maxTokens,
			stream: true,
			stream_options: { include_usage: true },
			prompt_cache_key: input.sessionId
		};
	}

	private async observeUsage(
		observation: AgenticChatProviderUsageObservationV1,
		signal: AbortSignal
	): Promise<void> {
		try {
			const observationSignal = signal.aborted ? new AbortController().signal : signal;
			await runWithAbortableDeadline({
				parentSignal: observationSignal,
				timeoutMs: PROVIDER_TELEMETRY_TIMEOUT_MS,
				createTimeoutError: () =>
					new Error('Agentic Chat provider usage observation timed out'),
				run: () => Promise.resolve(this.ports.usage.observe(observation))
			});
		} catch (error) {
			try {
				this.ports.onUsageError?.(error);
			} catch {
				// Usage telemetry failures cannot alter the durable turn outcome.
			}
		}
	}

	private async observeProviderAttempt(
		input: ClientInput,
		route: AgenticChatOpenAiCompatibleRouteV1,
		eventType: 'provider_attempt_started' | 'provider_attempt_ended',
		payload: JsonObject
	): Promise<void> {
		if (!this.ports.executionObservations) return;
		try {
			const observationSignal = input.signal.aborted
				? new AbortController().signal
				: input.signal;
			await runWithAbortableDeadline({
				parentSignal: observationSignal,
				timeoutMs: PROVIDER_TELEMETRY_TIMEOUT_MS,
				createTimeoutError: () =>
					new Error('Agentic Chat provider execution observation timed out'),
				run: (deadlineSignal) =>
					this.ports.executionObservations!.observe(
						{
							turnRunId: input.turnRunId,
							queueJobId: input.queueJobId,
							processingToken: input.processingToken,
							userId: input.userId,
							executionGeneration: input.executionGeneration,
							observationKey: createStableAgenticChatExecutionObservationKeyV1({
								turnRunId: input.turnRunId,
								scope: `provider:${input.logicalProviderRound}:${input.providerRound}:${route.id}`,
								boundary: eventType
							}),
							phase: 'provider',
							eventType,
							payload
						},
						deadlineSignal
					)
			});
		} catch (error) {
			try {
				this.ports.onExecutionObservationError?.(error);
			} catch {
				// Private observation failures remain bounded and cannot alter the turn.
			}
		}
	}
}

/** Durable usage adapter for the existing `llm_usage_logs` writer. */
export class AgenticChatLlmUsageObserver implements AgenticChatProviderUsageObserverPortV1 {
	constructor(private readonly logger: UsageLogger) {}

	observe(observation: AgenticChatProviderUsageObservationV1): Promise<void> {
		return this.logger.logUsageToDatabase({
			id: observation.usageLogId,
			userId: observation.userId,
			operationType: 'agentic_chat_worker_stream',
			modelRequested: observation.modelRequested ?? 'unknown',
			modelUsed: observation.modelUsed ?? observation.modelRequested ?? 'unknown',
			provider: observation.provider ?? undefined,
			promptTokens: observation.promptTokens,
			completionTokens: observation.completionTokens,
			totalTokens: observation.totalTokens,
			inputCost: observation.providerInputCost,
			outputCost: observation.providerOutputCost,
			totalCost: observation.providerCost ?? 0,
			responseTimeMs: Math.max(0, observation.observedAtMs - observation.requestStartedAtMs),
			requestStartedAt: new Date(observation.requestStartedAtMs),
			requestCompletedAt: new Date(observation.observedAtMs),
			status: observation.status === 'success' ? 'success' : 'failure',
			errorMessage: observation.error ?? undefined,
			streaming: true,
			projectId: observation.projectId ?? undefined,
			chatSessionId: observation.sessionId,
			turnRunId: observation.turnRunId,
			streamRunId: observation.streamRunId,
			clientTurnId: observation.clientTurnId,
			openrouterRequestId: observation.requestId ?? undefined,
			openrouterUsageCost: observation.providerCost ?? undefined,
			openrouterCacheStatus: observation.cacheStatus,
			openrouterByok: observation.providerByok,
			openrouterUpstreamInferenceCost: observation.providerUpstreamInferenceCost,
			reasoningTokens: observation.reasoningTokens,
			cachedPromptTokens: observation.cachedPromptTokens,
			cacheWriteTokens: observation.cacheWriteTokens,
			metadata: {
				contextType: observation.contextType,
				entityId: observation.entityId,
				routeId: observation.routeId,
				logicalProviderRound: observation.logicalProviderRound,
				attemptedRouteIds: observation.attemptedRouteIds,
				estimatedUsage: observation.estimated,
				costSource: observation.costSource,
				retryable: observation.retryable,
				providerStatus: observation.status
			}
		});
	}
}

function parseSseLine(
	line: string,
	state: StreamState
): { events: AgenticChatReadOnlyProviderClientEventV1[]; done: boolean } {
	const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
	if (!normalized.trim() || normalized.startsWith(':')) return { events: [], done: false };
	if (!normalized.startsWith('data:')) return { events: [], done: false };
	const payload = normalized.slice(5).trimStart();
	if (payload === '[DONE]') return { events: [], done: true };

	let value: unknown;
	try {
		value = JSON.parse(payload);
	} catch {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider returned malformed SSE JSON',
			false
		);
	}
	const chunk = requireRecord(value, 'provider chunk');
	if (chunk.error !== undefined && chunk.error !== null) {
		const error = providerFrameError(chunk.error);
		throw new AgenticChatProviderNetworkError(error.message, error.retryable);
	}
	state.requestId = canonicalOptionalText(chunk.id) ?? state.requestId;
	state.modelUsed = canonicalOptionalText(chunk.model) ?? state.modelUsed;
	state.provider = canonicalOptionalText(chunk.provider) ?? state.provider;
	if (chunk.usage !== undefined && chunk.usage !== null) state.rawUsage = chunk.usage;

	const choices = chunk.choices;
	if (choices === undefined || choices === null) return { events: [], done: false };
	if (!Array.isArray(choices)) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider choices payload is malformed',
			false
		);
	}
	if (choices.length > 1) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider returned more than one streamed choice',
			false
		);
	}
	const choice = choices[0];
	if (choice === undefined) return { events: [], done: false };
	const record = requireRecord(choice, 'provider choice');
	if (record.usage !== undefined && record.usage !== null) state.rawUsage = record.usage;
	if (record.finish_reason !== undefined && record.finish_reason !== null) {
		state.finishReason = canonicalRequiredText(record.finish_reason, 'finish reason', 256);
	}

	const events: AgenticChatReadOnlyProviderClientEventV1[] = [];
	if (record.delta !== undefined && record.delta !== null) {
		const delta = requireRecord(record.delta, 'provider delta');
		const reasoning = extractReasoning(delta);
		if (reasoning) events.push({ type: 'reasoning', ...reasoning });
		if (delta.content !== undefined && delta.content !== null) {
			const normalizedContent = normalizeStreamingContent(
				delta.content,
				state.inThinkingBlock
			);
			state.inThinkingBlock = normalizedContent.inThinkingBlock;
			if (normalizedContent.text) {
				state.completionChars += normalizedContent.text.length;
				events.push({ type: 'text', content: normalizedContent.text });
			}
		}
		if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
			state.completionChars += JSON.stringify(delta.tool_calls).length;
			events.push({ type: 'tool_call', toolCall: delta.tool_calls });
		}
	}
	return { events, done: false };
}

function extractReasoning(
	delta: Record<string, unknown>
): { reasoning?: string; reasoning_details?: unknown[] } | null {
	const reasoning = [delta.reasoning, delta.reasoning_content, delta.thinking]
		.map(stringifyReasoning)
		.filter(Boolean)
		.join('');
	const reasoningDetails = Array.isArray(delta.reasoning_details)
		? delta.reasoning_details
		: undefined;
	if (!reasoning && !reasoningDetails) return null;
	return {
		...(reasoning ? { reasoning } : {}),
		...(reasoningDetails ? { reasoning_details: reasoningDetails } : {})
	};
}

function stringifyReasoning(value: unknown): string {
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(stringifyReasoning).filter(Boolean).join('');
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const text = record.text ?? record.content ?? record.value;
		return typeof text === 'string' ? text : '';
	}
	return '';
}

function normalizeProviderUsage(value: unknown): ProviderUsage | null {
	if (value === null || value === undefined) return null;
	const usage = requireRecord(value, 'provider usage');
	const promptTokens = usage.prompt_tokens ?? usage.promptTokens;
	const completionTokens = usage.completion_tokens ?? usage.completionTokens;
	const totalTokens = usage.total_tokens ?? usage.totalTokens;
	const promptTokenDetails = optionalRecord(
		usage.prompt_tokens_details ?? usage.promptTokensDetails,
		'provider prompt-token details'
	);
	const completionTokenDetails = optionalRecord(
		usage.completion_tokens_details ?? usage.completionTokensDetails,
		'provider completion-token details'
	);
	const costDetails = optionalRecord(
		usage.cost_details ?? usage.costDetails,
		'provider cost details'
	);
	if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
		return null;
	}
	if (
		!nonnegativeInteger(promptTokens) ||
		!nonnegativeInteger(completionTokens) ||
		!nonnegativeInteger(totalTokens) ||
		totalTokens !== promptTokens + completionTokens
	) {
		throw new AgenticChatProviderNetworkError(
			'Agentic Chat provider usage payload is malformed',
			false
		);
	}
	const cachedPromptTokens = optionalNonnegativeInteger(
		promptTokenDetails?.cached_tokens ?? promptTokenDetails?.cachedTokens,
		'provider cached prompt tokens'
	);
	return {
		promptTokens,
		completionTokens,
		totalTokens,
		reasoningTokens: optionalNonnegativeInteger(
			completionTokenDetails?.reasoning_tokens ?? completionTokenDetails?.reasoningTokens,
			'provider reasoning tokens'
		),
		cachedPromptTokens,
		cacheWriteTokens: optionalNonnegativeInteger(
			promptTokenDetails?.cache_write_tokens ?? promptTokenDetails?.cacheWriteTokens,
			'provider cache-write tokens'
		),
		cacheStatus: describePromptCacheStatus(promptTokens, cachedPromptTokens),
		cost: finiteNonnegativeNumber(usage.cost) ? usage.cost : null,
		byok: optionalBoolean(usage.is_byok ?? usage.isByok, 'provider BYOK flag'),
		upstreamInferenceCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_cost ?? costDetails?.upstreamInferenceCost,
			'provider upstream inference cost'
		),
		upstreamPromptCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_prompt_cost ?? costDetails?.upstreamInferencePromptCost,
			'provider upstream prompt cost'
		),
		upstreamCompletionCost: optionalNonnegativeNumber(
			costDetails?.upstream_inference_completions_cost ??
				costDetails?.upstreamInferenceCompletionsCost,
			'provider upstream completion cost'
		)
	};
}

export function createStableAgenticChatProviderUsageLogIdV1(input: {
	turnRunId: string;
	executionGeneration: number;
	logicalProviderRound: number;
	routeId: string;
}): string {
	if (
		!Number.isSafeInteger(input.executionGeneration) ||
		input.executionGeneration < 1 ||
		!Number.isSafeInteger(input.logicalProviderRound) ||
		input.logicalProviderRound < 1 ||
		!input.routeId ||
		input.routeId !== input.routeId.trim()
	) {
		throw new Error('Invalid Agentic Chat provider usage identity');
	}
	const bytes = createHash('sha256')
		.update(
			`${USAGE_LOG_IDENTITY_VERSION}:${input.turnRunId}:${input.executionGeneration}:${input.logicalProviderRound}:${input.routeId}`,
			'utf8'
		)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function resolveProviderUsageCosts(input: {
	usage: ProviderUsage | null;
	modelRequested: string | null;
	modelUsed: string | null;
	promptTokens: number;
	completionTokens: number;
}): {
	inputCost: number;
	outputCost: number;
	source: AgenticChatProviderUsageObservationV1['costSource'];
} {
	const pricing = resolveModelPricingProfile(input.modelUsed ?? 'unknown', [
		input.modelRequested ?? 'unknown'
	])?.profile;
	const estimatedInputCost = pricing ? (input.promptTokens / 1_000_000) * pricing.cost : 0;
	const estimatedOutputCost = pricing
		? (input.completionTokens / 1_000_000) * pricing.outputCost
		: 0;
	if (input.usage === null || input.usage.cost === null) {
		return {
			inputCost: estimatedInputCost,
			outputCost: estimatedOutputCost,
			source: pricing ? 'catalog_estimate' : 'unknown'
		};
	}
	if (input.usage.upstreamPromptCost !== null || input.usage.upstreamCompletionCost !== null) {
		return {
			inputCost: input.usage.upstreamPromptCost ?? 0,
			outputCost: input.usage.upstreamCompletionCost ?? 0,
			source: 'provider_reported'
		};
	}
	const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;
	if (estimatedTotalCost > 0) {
		const scale = input.usage.cost / estimatedTotalCost;
		return {
			inputCost: estimatedInputCost * scale,
			outputCost: estimatedOutputCost * scale,
			source: 'provider_reported'
		};
	}
	return { inputCost: 0, outputCost: 0, source: 'provider_reported' };
}

function describePromptCacheStatus(promptTokens: number, cachedPromptTokens: number): string {
	if (cachedPromptTokens <= 0) return 'no cache';
	if (promptTokens <= 0) return `cached ${cachedPromptTokens} prompt tokens`;
	const hitRate = Math.round((cachedPromptTokens / promptTokens) * 1_000) / 10;
	return `${hitRate}% cache hit`;
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value as Record<string, unknown>;
}

function optionalNonnegativeInteger(value: unknown, label: string): number {
	if (value === undefined || value === null) return 0;
	if (!nonnegativeInteger(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}

function optionalNonnegativeNumber(value: unknown, label: string): number | null {
	if (value === undefined || value === null) return null;
	if (!finiteNonnegativeNumber(value)) {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}

function optionalBoolean(value: unknown, label: string): boolean | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'boolean') {
		throw new AgenticChatProviderNetworkError(`${label} is malformed`, false);
	}
	return value;
}

function providerFrameError(value: unknown): { message: string; retryable: boolean } {
	if (typeof value === 'string') {
		return { message: canonicalError(value), retryable: retryableMessage(value) };
	}
	const error = requireRecord(value, 'provider error');
	const message = canonicalError(
		error.message ?? 'Agentic Chat provider returned an error frame'
	);
	const status = numericStatus(error.code ?? error.status);
	return {
		message,
		retryable: status === null ? retryableMessage(message) : isRetryableStatus(status)
	};
}

function createAttemptSignal(
	external: AbortSignal,
	timeoutMs: number
): {
	signal: AbortSignal;
	cleanup(): void;
	timedOut(): boolean;
} {
	const controller = new AbortController();
	let didTimeout = false;
	const onAbort = () => controller.abort(external.reason);
	if (external.aborted) controller.abort(external.reason);
	else external.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(() => {
		didTimeout = true;
		controller.abort(new Error(`Agentic Chat provider timeout after ${timeoutMs}ms`));
	}, timeoutMs);
	timer.unref?.();
	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timer);
			external.removeEventListener('abort', onAbort);
		},
		timedOut: () => didTimeout
	};
}

function validateRoutes(
	routes: readonly AgenticChatOpenAiCompatibleRouteV1[]
): readonly AgenticChatOpenAiCompatibleRouteV1[] {
	if (!Array.isArray(routes) || routes.length < 1 || routes.length > 4) {
		throw new Error('Agentic Chat provider requires between one and four routes');
	}
	const ids = new Set<string>();
	const validated = routes.map((route) => {
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(route.id) || ids.has(route.id)) {
			throw new Error('Agentic Chat provider route ids must be unique canonical identifiers');
		}
		ids.add(route.id);
		if (route.kind !== 'openrouter' && route.kind !== 'openai_compatible') {
			throw new Error('Agentic Chat provider route kind is invalid');
		}
		let url: URL;
		try {
			url = new URL(route.baseUrl);
		} catch {
			throw new Error('Agentic Chat provider route must use a clean HTTPS base URL');
		}
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
			throw new Error('Agentic Chat provider route must use a clean HTTPS base URL');
		}
		const baseUrl = route.baseUrl.replace(/\/+$/, '');
		const apiKey = canonicalSecret(route.apiKey);
		const model = canonicalModel(route.model);
		const fallbackModels = uniqueModels(route.fallbackModels ?? []).filter(
			(candidate) => candidate !== model
		);
		if (fallbackModels.length > 3) {
			throw new Error('Agentic Chat provider route supports at most three fallback models');
		}
		if (route.kind !== 'openrouter' && fallbackModels.length > 0) {
			throw new Error('Direct Agentic Chat provider routes cannot declare fallback models');
		}
		if (route.kind !== 'openrouter' && route.providerRouting) {
			throw new Error('Provider routing preferences are supported only for OpenRouter');
		}
		return Object.freeze({
			...route,
			baseUrl,
			apiKey,
			model,
			fallbackModels: Object.freeze(fallbackModels),
			providerRouting: validateProviderRouting(route.providerRouting),
			headers: validateHeaders(route.headers)
		});
	});
	return Object.freeze(validated);
}

function validateProviderRouting(
	value: AgenticChatOpenRouterProviderRoutingV1 | undefined
): AgenticChatOpenRouterProviderRoutingV1 | undefined {
	if (!value) return undefined;
	if (value.data_collection !== undefined && value.data_collection !== 'deny') {
		throw new Error('Agentic Chat provider routing cannot allow data collection');
	}
	for (const key of ['allow_fallbacks', 'require_parameters', 'zdr'] as const) {
		if (value[key] !== undefined && typeof value[key] !== 'boolean') {
			throw new Error(`Agentic Chat provider routing ${key} must be boolean`);
		}
	}
	if (
		value.sort !== undefined &&
		value.sort !== 'price' &&
		value.sort !== 'throughput' &&
		value.sort !== 'latency'
	) {
		throw new Error('Agentic Chat provider routing sort is invalid');
	}
	const result: AgenticChatOpenRouterProviderRoutingV1 = {};
	if (value.allow_fallbacks !== undefined) result.allow_fallbacks = value.allow_fallbacks;
	if (value.require_parameters !== undefined) {
		result.require_parameters = value.require_parameters;
	}
	if (value.data_collection !== undefined) result.data_collection = value.data_collection;
	if (value.zdr !== undefined) result.zdr = value.zdr;
	if (value.sort !== undefined) result.sort = value.sort;
	for (const key of ['order', 'only', 'ignore'] as const) {
		if (value[key] === undefined) continue;
		if (!Array.isArray(value[key]) || value[key].length > 16) {
			throw new Error(`Agentic Chat provider routing ${key} is invalid`);
		}
		result[key] = Object.freeze(
			Array.from(
				new Set(
					value[key].map((entry) =>
						canonicalRoutingName(entry, `provider routing ${key}`)
					)
				)
			)
		) as string[];
	}
	return Object.freeze(result);
}

function validateHeaders(
	headers: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> | undefined {
	if (!headers) return undefined;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (!/^[A-Za-z0-9-]{1,64}$/.test(key)) {
			throw new Error('Agentic Chat provider route header name is invalid');
		}
		if (
			['authorization', 'content-type', 'accept', 'http-referer', 'x-title'].includes(
				key.toLowerCase()
			)
		) {
			throw new Error('Agentic Chat provider route cannot override protected headers');
		}
		result[key] = canonicalHeaderValue(value, `route header ${key}`);
	}
	return Object.freeze(result);
}

function copyMessage(message: AgenticChatReadOnlyProviderMessageV1) {
	return {
		role: message.role,
		content: message.content,
		...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
		...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {})
	};
}

function copyTool(tool: AgenticChatReadOnlyProviderToolV1) {
	return {
		type: 'function' as const,
		function: {
			name: tool.function.name,
			description: tool.function.description,
			parameters: tool.function.parameters
		}
	};
}

function validateToolSurface(input: ClientInput): void {
	if (!Array.isArray(input.tools)) {
		throw new Error('Agentic Chat provider tool surface must be an array');
	}
	if (input.toolChoice === 'none') {
		if (input.tools.length !== 0) {
			throw new Error('Agentic Chat toolChoice=none requires an empty tool surface');
		}
		return;
	}
	if (
		input.toolChoice !== 'auto' ||
		input.tools.length < 1 ||
		input.tools.length > MAX_REVIEWED_PROVIDER_TOOLS
	) {
		throw new Error('Agentic Chat toolChoice=auto requires a bounded reviewed tool surface');
	}
	const seen = new Set<string>();
	for (const tool of input.tools) {
		validateReadToolDefinition(tool, seen);
	}
}

function validateReadToolDefinition(
	tool: AgenticChatReadOnlyProviderToolV1 | undefined,
	seen: Set<string>
): void {
	if (
		tool?.type !== 'function' ||
		!tool.function ||
		typeof tool.function.name !== 'string' ||
		!tool.function.name ||
		tool.function.name !== tool.function.name.trim() ||
		(!isAgenticChatProductionReadToolNameV1(tool.function.name) &&
			reviewedAgenticChatMutationSpecV1(tool.function.name) === null) ||
		seen.has(tool.function.name) ||
		typeof tool.function.description !== 'string' ||
		!tool.function.description.trim() ||
		!tool.function.parameters ||
		typeof tool.function.parameters !== 'object' ||
		Array.isArray(tool.function.parameters) ||
		tool.function.parameters.type !== 'object'
	) {
		throw new Error('Agentic Chat read tool definition is invalid');
	}
	try {
		canonicalizeAgenticChatJson(tool as unknown as JsonValue);
	} catch {
		throw new Error('Agentic Chat read tool definition is invalid');
	}
	seen.add(tool.function.name);
}

async function responseErrorMessage(response: Response): Promise<string> {
	const text = (await readBoundedResponseText(response, 16 * 1024)).trim().slice(0, 2_000);
	if (!text) return response.statusText || 'provider request failed';
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed !== null && typeof parsed === 'object') {
			const root = parsed as Record<string, unknown>;
			const error =
				root.error !== null && typeof root.error === 'object'
					? (root.error as Record<string, unknown>)
					: root;
			if (typeof error.message === 'string' && error.message.trim()) {
				return error.message.trim().slice(0, 2_000);
			}
		}
	} catch {
		// Plain-text provider errors are returned below.
	}
	return text;
}

async function readBoundedResponseText(response: Response, maximumBytes: number): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let text = '';
	let remaining = maximumBytes;
	try {
		while (remaining > 0) {
			const chunk = await reader.read();
			if (chunk.done) break;
			const accepted = chunk.value.subarray(0, remaining);
			remaining -= accepted.byteLength;
			text += decoder.decode(accepted, { stream: true });
			if (accepted.byteLength < chunk.value.byteLength) break;
		}
		text += decoder.decode();
		return text;
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}

function routeFailure(routeId: string, error: unknown): RouteFailure {
	return {
		routeId,
		message: canonicalError(error),
		retryable:
			error instanceof AgenticChatProviderNetworkError
				? error.retryable
				: isRetryableUnknownError(error)
	};
}

function isRetryableUnknownError(error: unknown): boolean {
	return error instanceof TypeError || retryableMessage(canonicalError(error));
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryableMessage(message: string): boolean {
	return /rate.?limit|temporar|timeout|timed out|overload|unavailable|connection|network/i.test(
		message
	);
}

function numericStatus(value: unknown): number | null {
	const status = typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;
	return Number.isSafeInteger(status) && (status as number) >= 100 && (status as number) <= 599
		? (status as number)
		: null;
}

function estimateTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

function boundedDuration(startedAtMs: number, observedAtMs: number): number {
	return Math.min(2_147_483_647, Math.max(0, Math.floor(observedAtMs - startedAtMs)));
}

function canonicalError(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? '');
	return message.trim().slice(0, 2_000) || 'Agentic Chat provider request failed';
}

function canonicalOptionalHeader(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, 512) : null;
}

function canonicalOptionalText(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, 512) : null;
}

function canonicalRequiredText(value: unknown, label: string, maximum: number): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > maximum
	) {
		throw new AgenticChatProviderNetworkError(
			`Agentic Chat provider ${label} is invalid`,
			false
		);
	}
	return value;
}

function canonicalHeaderValue(value: string, label: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 512 ||
		/[\r\n]/.test(value)
	) {
		throw new Error(`Agentic Chat provider ${label} is invalid`);
	}
	return value;
}

function canonicalSecret(value: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 2_048 ||
		/[\r\n]/.test(value)
	) {
		throw new Error('Agentic Chat provider API key is invalid');
	}
	return value;
}

function canonicalModel(value: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 256
	) {
		throw new Error('Agentic Chat provider model is invalid');
	}
	return value;
}

function canonicalRoutingName(value: string, label: string): string {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		value !== value.trim() ||
		value.length > 128 ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
	) {
		throw new Error(`Agentic Chat ${label} contains an invalid name`);
	}
	return value;
}

function uniqueModels(values: readonly string[]): string[] {
	return Array.from(new Set(values.map(canonicalModel)));
}

function boundedInteger(value: number, label: string, minimum: number, maximum: number): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`Agentic Chat provider ${label} must be between ${minimum} and ${maximum}`);
	}
	return value;
}

function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function finiteNonnegativeNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderNetworkError(`Agentic Chat ${label} is malformed`, false);
	}
	return value as Record<string, unknown>;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throwAbort(signal);
}

function throwAbort(signal: AbortSignal): never {
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
