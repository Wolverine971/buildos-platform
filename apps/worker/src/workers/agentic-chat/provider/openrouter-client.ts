// apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts
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
	AgenticChatProviderPassRoleV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderMessageV1,
	AgenticChatTurnProviderToolV1
} from './contracts';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from '../tools/execution-adapter';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	reviewedAgenticChatMutationSpecV1
} from '../mutationToolCatalog';
import { runWithAbortableDeadline } from '../abortableDeadline';
import {
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from '../executionObservation';
import { isToolArgumentsTextTruncated } from './stream-tool-calls';

const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
/**
 * Every attempt keeps at least this long, and reserves this much of the turn
 * budget for the executor to finalize after the last provider pass. Below it a
 * request cannot realistically open a stream, so a nearly-spent budget fails
 * fast instead of being spread across a doomed attempt.
 */
const MIN_ATTEMPT_TIMEOUT_MS = 5_000;
const BUDGET_FINALIZATION_RESERVE_MS = 5_000;
/** Bump when the reviewer prefix (system prompt or tool schemas) changes shape. */
const REVIEWER_PROMPT_CACHE_KEY = 'agentic-chat-reviewer-v1';
/**
 * Acting passes can spend hidden reasoning tokens before writing a tool call.
 *
 * The 2026-08-31 Phase 4 production gate reached the previous 2_000-token cap
 * twice on logical round three while composing `delegate_task` after seven
 * successful discovery reads. OpenRouter reported 2_001 completion tokens in
 * both runs, and the truncation guard correctly rejected the incomplete call.
 * This matches the reviewed semantic-reviewer ceiling and keeps a firm bound;
 * calls that already fit are billed only for the tokens they generate.
 */
export const AGENTIC_CHAT_ACTING_MAX_TOKENS = 4_000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_SSE_BUFFER_BYTES = 256 * 1024;
const PROVIDER_TELEMETRY_TIMEOUT_MS = 5_000;
const TURN_ROUTE_HEALTH_TTL_MS = 10 * 60_000;
const MAX_TURN_ROUTE_HEALTH_ENTRIES = 256;
const USAGE_LOG_IDENTITY_VERSION = 'agentic_chat_provider_usage_v2';
const REJECTED_TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
// Mirrors the consumer's accumulator bounds; past them the consumer rejects the
// pass without a name-level diagnostic, so the receipt must stay silent too.
const MAX_OBSERVED_TOOL_CALLS = 40;
const MAX_OBSERVED_TOOL_NAME_CHARS = 256;
const MAX_OBSERVED_TOOL_ARGUMENT_BYTES = 64 * 1024;
const MAX_REVIEWED_PROVIDER_TOOLS =
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.length +
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames.length;

export type AgenticChatOpenRouterProviderRoutingV1 = {
	allow_fallbacks?: boolean;
	require_parameters?: boolean;
	data_collection?: 'allow' | 'deny';
	zdr?: boolean;
	sort?: 'price' | 'throughput' | 'latency';
	order?: readonly string[];
	only?: readonly string[];
	ignore?: readonly string[];
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
	passRole: AgenticChatProviderPassRoleV1;
	providerAttempt: number;
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

type ClientInput = Parameters<AgenticChatTurnProviderClientPortV1['stream']>[0];

type RouteFailure = {
	routeId: string;
	message: string;
	retryable: boolean;
};

type ActiveResponse = {
	route: AgenticChatOpenAiCompatibleRouteV1;
	response: Response;
	requestId: string | null;
	signal: AbortSignal;
	/** Timeout this attempt was given, after the turn budget was applied. */
	timeoutMs: number;
	cleanup(): void;
	timedOut(): boolean;
	timing(): ProviderAttemptTiming;
};

type ProviderAttemptTiming = {
	networkStartedAtMs: number;
	deadlineAtMs: number;
	responseOpenedAtMs: number | null;
	timeoutFiredAtMs: number | null;
};

type StreamState = {
	rawUsage: unknown;
	finishReason: string | null;
	modelUsed: string | null;
	provider: string | null;
	providerSlug: string | null;
	requestId: string | null;
	inThinkingBlock: boolean;
	completionChars: number;
	toolCalls: Map<number, ObservedToolCall>;
	toolCallsObservable: boolean;
};

/**
 * Name-level shadow of the consumer's tool-call accumulator. The consumer
 * (`turn-provider`) decides whether a streamed call is acceptable only after
 * this generator has closed, by which point the durable `provider_attempt_ended`
 * receipt is already written under a replay-locked key. So the receipt can name
 * a rejected tool only if this client recognises the rejection itself, from the
 * same inputs: the assembled name against the advertised surface, and whether
 * the assembled arguments form a JSON object. Argument text is held in memory
 * solely for that parse test and never leaves this module.
 */
type ObservedToolCall = {
	name: string;
	argumentsText: string;
	argumentsRejected: boolean;
};

type TurnRouteHealth = {
	failedModels: Set<string>;
	failedProviderSlugs: Set<string>;
	preferredModels: string[];
	/** First successful route in this turn; released as soon as that route fails. */
	pin: {
		model: string;
		providerSlug: string | null;
	} | null;
	/** Exact completed response eligible for delayed semantic-validation feedback. */
	lastResponse: { identity: string; model: string; providerSlug: string | null } | null;
	updatedAtMs: number;
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
 * OpenAI-compatible network client for the production provider lane. Route fallback
 * is allowed only before a response stream is accepted, so emitted assistant
 * text can never be replayed against a second provider.
 */
export class AgenticChatOpenRouterClient implements AgenticChatTurnProviderClientPortV1 {
	private readonly routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
	private readonly fetchImpl: typeof fetch;
	private readonly requestTimeoutMs: number;
	private readonly maxTokens: number;
	private readonly temperature: number;
	private readonly maxSseBufferBytes: number;
	private readonly turnRouteHealth = new Map<string, TurnRouteHealth>();

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
			options.maxTokens ?? AGENTIC_CHAT_ACTING_MAX_TOKENS,
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

	rejectRepeatedInvalidToolResponse(input: ClientInput): void {
		const response = this.getTurnRouteHealth(input.turnRunId, false)?.lastResponse;
		if (input.signal.aborted || !response || response.identity !== responseIdentity(input))
			return;
		// Transport success was already accounted for. Validation is recorded by
		// the coordinator; this only steers its remaining repair and is idempotent.
		this.observeTurnRouteFailure(input.turnRunId, response.model, response.providerSlug);
	}

	async *stream(input: ClientInput): AsyncGenerator<AgenticChatTurnProviderClientEventV1> {
		validateToolSurface(input);
		throwIfAborted(input.signal);
		const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
		const passRole = canonicalProviderPassRole(input.passRole);
		const inputChars =
			JSON.stringify(input.messages).length + JSON.stringify(input.tools).length;
		const requestStartedAtMs = Date.now();
		const attemptedRouteIds: string[] = [];
		const failures: RouteFailure[] = [];
		let lastAttemptedRoute: AgenticChatOpenAiCompatibleRouteV1 | null = null;
		let active: ActiveResponse | null = null;
		let activeAttemptStartedAtMs: number | null = null;
		let activeAttemptKind: 'primary' | 'retry' | null = null;
		let activeAttemptEnded = false;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		let accounted = false;
		const state: StreamState = {
			rawUsage: null,
			finishReason: null,
			modelUsed: null,
			provider: null,
			providerSlug: null,
			requestId: null,
			inThinkingBlock: false,
			completionChars: 0,
			toolCalls: new Map(),
			toolCallsObservable: true
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
						passRole,
						providerAttempt,
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
					passRole,
					providerAttempt,
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
			for (const configuredRoute of this.routes) {
				const route = this.applyTurnRouteHealth(configuredRoute, input.turnRunId);
				lastAttemptedRoute = route;
				attemptedRouteIds.push(route.id);
				const attemptKind: 'primary' | 'retry' =
					providerAttempt > 1 || attemptedRouteIds.length > 1 ? 'retry' : 'primary';
				const attemptStartedAtMs = Date.now();
				await this.observeProviderAttempt(input, route, 'provider_attempt_started', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					pass_role: passRole,
					provider_attempt: providerAttempt,
					attempt_kind: attemptKind,
					route_id: route.id,
					model_requested: route.model
				});
				try {
					active = await this.openRoute(route, input);
					activeAttemptStartedAtMs = attemptStartedAtMs;
					activeAttemptKind = attemptKind;
					break;
				} catch (error) {
					if (input.signal.aborted) throwAbort(input.signal);
					this.observeTurnRouteFailure(input.turnRunId, route.model, null);
					const failure = routeFailure(route.id, error);
					failures.push(failure);
					await this.observeProviderAttempt(input, route, 'provider_attempt_ended', {
						round: input.providerRound,
						logical_provider_round: input.logicalProviderRound,
						pass_role: passRole,
						provider_attempt: providerAttempt,
						attempt_kind: attemptKind,
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
			state.providerSlug = normalizeProviderSlug(state.provider) ?? null;
			const activeReader = active.response.body!.getReader();
			reader = activeReader;
			const decoder = new TextDecoder();
			let buffer = '';
			let providerDone = false;

			while (!providerDone) {
				// Some fetch implementations resolve once response headers arrive but do
				// not reliably reject a pending body read when that request signal later
				// aborts. Race the read ourselves so the configured request deadline
				// bounds the complete SSE response, not only the header wait.
				const chunk = await abortableProviderRead(() => activeReader.read(), active.signal);
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
					throwIfAborted(active.signal);
					const outcome = parseSseLine(line, state);
					for (const event of outcome.events) {
						throwIfAborted(active.signal);
						yield event;
						// Async generators pause at `yield`. If the provider deadline fires
						// while the downstream consumer persists that event, do not drain
						// already-buffered SSE frames after the consumer resumes.
						throwIfAborted(active.signal);
					}
					if (outcome.done) {
						providerDone = true;
						break;
					}
				}
			}

			if (!providerDone && buffer.trim()) {
				throwIfAborted(active.signal);
				const outcome = parseSseLine(buffer, state);
				for (const event of outcome.events) {
					throwIfAborted(active.signal);
					yield event;
					throwIfAborted(active.signal);
				}
				providerDone = outcome.done;
			}
			if (state.finishReason === 'error') {
				throw new AgenticChatProviderNetworkError(
					'Agentic Chat provider stream ended with finish_reason=error',
					false
				);
			}

			const exactUsage = normalizeProviderUsage(state.rawUsage);
			// A generation that produced exactly the completion budget we sent was
			// cut off at the cap, whatever finish_reason the provider reports.
			// Azure-hosted reasoning models returned `tool_calls` on capped
			// responses in the 2026-08-20 battery, so the truncated tool arguments
			// reached the JSON parser as if the model had finished writing them.
			// `max_tokens` is a value we chose, so this correction never guesses.
			const finishedReason =
				exactUsage && exactUsage.completionTokens >= this.maxTokens
					? 'length'
					: (state.finishReason ?? 'stop');
			const attemptEndedAtMs = Date.now();
			const usagePayload = exactUsage
				? {
						prompt_tokens: exactUsage.promptTokens,
						completion_tokens: exactUsage.completionTokens,
						total_tokens: exactUsage.totalTokens,
						reasoning_tokens: exactUsage.reasoningTokens,
						cached_prompt_tokens: exactUsage.cachedPromptTokens,
						cache_write_tokens: exactUsage.cacheWriteTokens
					}
				: null;
			// A streamed tool call the consumer cannot trust complete — the
			// provider reported a finish reason other than tool calls (Alibaba
			// returned `stop` on a 2,001-token tool-call response in the 2026-09-01
			// window), or the arguments end mid-object — is a failed attempt of
			// this route, not a successful pass. Name it as such in the durable
			// receipt, release the turn's route pin so the atomic-pass retry lands
			// on the next model/provider, and surface a retryable error rather than
			// a `done` the consumer would have to reject permanently.
			const toolCallTruncation = observedToolCallTruncation(state, input, finishedReason);
			if (toolCallTruncation) {
				await this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					pass_role: passRole,
					provider_attempt: providerAttempt,
					attempt_kind: activeAttemptKind ?? (providerAttempt > 1 ? 'retry' : 'primary'),
					route_id: active.route.id,
					model_requested: active.route.model,
					model_used: state.modelUsed ?? active.route.model,
					provider: state.provider ?? active.route.id,
					status: 'failure',
					duration_ms: boundedDuration(
						activeAttemptStartedAtMs ?? requestStartedAtMs,
						attemptEndedAtMs
					),
					provider_timing: providerAttemptTimingPayload(
						active.timing(),
						attemptEndedAtMs
					),
					finish_reason: finishedReason,
					error_class: 'provider_tool_arguments_truncated',
					tool_call_truncation: toolCallTruncation,
					usage: usagePayload,
					...rejectedToolCallPayload(state, input)
				});
				activeAttemptEnded = true;
				this.observeTurnRouteFailure(
					input.turnRunId,
					state.modelUsed ?? active.route.model,
					state.providerSlug ?? normalizeProviderSlug(state.provider)
				);
				const message = `Agentic Chat provider truncated a tool call (${toolCallTruncation}, finish_reason=${finishedReason})`;
				await account('failure', message, true);
				yield {
					type: 'error',
					error: message,
					retryable: true,
					cause: 'tool_arguments_truncated'
				};
				return;
			}
			// Forced synthesis already owns one bounded retry for disabled tools.
			// Treat this response as a route failure before releasing its `done`,
			// so that existing retry leaves the bad pin. Do not emit a retryable
			// error here: the atomic-pass layer would add another retry allowance.
			const toolsDisabledViolation =
				input.toolChoice === 'none' &&
				(state.toolCalls.size > 0 ||
					!state.toolCallsObservable ||
					state.finishReason === 'tool_calls' ||
					state.finishReason === 'function_call');
			await this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
				round: input.providerRound,
				logical_provider_round: input.logicalProviderRound,
				pass_role: passRole,
				provider_attempt: providerAttempt,
				attempt_kind: activeAttemptKind ?? (providerAttempt > 1 ? 'retry' : 'primary'),
				route_id: active.route.id,
				model_requested: active.route.model,
				model_used: state.modelUsed ?? active.route.model,
				provider: state.provider ?? active.route.id,
				status: toolsDisabledViolation ? 'failure' : 'success',
				duration_ms: boundedDuration(
					activeAttemptStartedAtMs ?? requestStartedAtMs,
					attemptEndedAtMs
				),
				provider_timing: providerAttemptTimingPayload(active.timing(), attemptEndedAtMs),
				finish_reason: finishedReason,
				error_class: toolsDisabledViolation ? 'provider_tool_call_disabled' : null,
				usage: usagePayload,
				...rejectedToolCallPayload(state, input)
			});
			activeAttemptEnded = true;
			if (toolsDisabledViolation) {
				this.observeTurnRouteFailure(
					input.turnRunId,
					state.modelUsed ?? active.route.model,
					state.providerSlug ?? normalizeProviderSlug(state.provider)
				);
				await account(
					'failure',
					'Agentic Chat provider requested tool calls while tool_choice=none',
					true
				);
			} else {
				this.observeTurnRouteSuccess(
					input.turnRunId,
					state.modelUsed ?? active.route.model,
					active.route.model,
					state.providerSlug,
					active.route.kind === 'openrouter'
				);
				this.getTurnRouteHealth(input.turnRunId, true)!.lastResponse = {
					identity: responseIdentity(input),
					model: state.modelUsed ?? active.route.model,
					providerSlug: state.providerSlug
				};
				await account('success', null, false);
			}
			yield {
				type: 'done',
				finishedReason,
				usage: exactUsage
					? {
							promptTokens: exactUsage.promptTokens,
							completionTokens: exactUsage.completionTokens,
							totalTokens: exactUsage.totalTokens
						}
					: undefined
			};
		} catch (error) {
			if (active && !input.signal.aborted) {
				this.observeTurnRouteFailure(
					input.turnRunId,
					state.modelUsed ?? active.route.model,
					state.providerSlug ?? normalizeProviderSlug(state.provider)
				);
			}
			if (active && !activeAttemptEnded) {
				const aborted = input.signal.aborted;
				const attemptEndedAtMs = Date.now();
				await this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					pass_role: passRole,
					provider_attempt: providerAttempt,
					attempt_kind: activeAttemptKind ?? (providerAttempt > 1 ? 'retry' : 'primary'),
					route_id: active.route.id,
					model_requested: active.route.model,
					model_used: state.modelUsed ?? active.route.model,
					provider: state.provider ?? active.route.id,
					status: aborted ? 'aborted' : 'failure',
					duration_ms: boundedDuration(
						activeAttemptStartedAtMs ?? requestStartedAtMs,
						attemptEndedAtMs
					),
					provider_timing: providerAttemptTimingPayload(
						active.timing(),
						attemptEndedAtMs
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
			const message =
				active?.timedOut() === true
					? `Agentic Chat provider request timed out after ${active.timeoutMs}ms`
					: canonicalError(error);
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

	/**
	 * Per-attempt timeout bounded by the turn's remaining wall-clock budget.
	 * Without this, 90s × two attempts × every acting and reviewer pass composes
	 * past the executor's 300s wall and the turn dies at the wall after
	 * durable writes (turn-executor audit 2026-09-02, finding 14).
	 */
	private attemptTimeoutMs(input: ClientInput): number {
		const deadlineAtMs = input.budget?.deadlineAtMs;
		if (!Number.isFinite(deadlineAtMs)) return this.requestTimeoutMs;
		const remaining = (deadlineAtMs as number) - Date.now() - BUDGET_FINALIZATION_RESERVE_MS;
		return Math.max(
			MIN_ATTEMPT_TIMEOUT_MS,
			Math.min(this.requestTimeoutMs, Math.floor(remaining))
		);
	}

	private async openRoute(
		route: AgenticChatOpenAiCompatibleRouteV1,
		input: ClientInput
	): Promise<ActiveResponse> {
		const timeoutMs = this.attemptTimeoutMs(input);
		const attempt = createAttemptSignal(input.signal, timeoutMs);
		try {
			const response = await this.fetchImpl(`${route.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${route.apiKey}`,
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
					'HTTP-Referer': this.httpReferer,
					'X-Title': this.appName,
					...(route.kind === 'openrouter' ? { 'X-OpenRouter-Metadata': 'enabled' } : {}),
					...(route.headers ?? {})
				},
				body: JSON.stringify(this.requestBody(route, input)),
				signal: attempt.signal
			});
			attempt.markResponseOpened();
			if (!response.ok) {
				const message = await responseErrorMessage(response);
				// A warm provider can accept an auto-tool pass but have no endpoint
				// for a later required-tool pass. Its pin disables OpenRouter fallback,
				// so let the existing bounded pass retry run after the catch clears it.
				// An unpinned 404 still represents a permanent route/model failure.
				const pinnedEndpointUnavailable =
					response.status === 404 &&
					route.kind === 'openrouter' &&
					Boolean(this.getTurnRouteHealth(input.turnRunId, false)?.pin?.providerSlug);
				throw new AgenticChatProviderNetworkError(
					`Agentic Chat provider start failed (${response.status}): ${message}`,
					isRetryableStatus(response.status) || pinnedEndpointUnavailable
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
				signal: attempt.signal,
				timeoutMs,
				cleanup: attempt.cleanup,
				timedOut: attempt.timedOut,
				timing: attempt.timing
			};
		} catch (error) {
			attempt.cleanup();
			if (input.signal.aborted) throwAbort(input.signal);
			if (attempt.timedOut()) {
				throw new AgenticChatProviderNetworkError(
					`Agentic Chat provider request timed out after ${timeoutMs}ms`,
					true
				);
			}
			throw error;
		}
	}

	private applyTurnRouteHealth(
		route: AgenticChatOpenAiCompatibleRouteV1,
		turnRunId: string
	): AgenticChatOpenAiCompatibleRouteV1 {
		const health = this.getTurnRouteHealth(turnRunId, false);
		if (!health || route.kind !== 'openrouter') return route;
		const models = [route.model, ...(route.fallbackModels ?? [])];
		const preferred = models.filter((model) => health.preferredModels.includes(model));
		const healthy = models.filter(
			(model) => !health.preferredModels.includes(model) && !health.failedModels.has(model)
		);
		const failed = models.filter((model) => health.failedModels.has(model));
		const reordered = [...preferred, ...healthy, ...failed];
		const ignoredProviders = Array.from(
			new Set([...(route.providerRouting?.ignore ?? []), ...health.failedProviderSlugs])
		);
		const pin =
			health.pin &&
			!health.failedModels.has(health.pin.model) &&
			(!health.pin.providerSlug || !ignoredProviders.includes(health.pin.providerSlug))
				? health.pin
				: null;
		const modelPin =
			pin ??
			(health.pin && !health.failedModels.has(health.pin.model)
				? { model: health.pin.model, providerSlug: null }
				: null);
		return {
			...route,
			model: modelPin?.model ?? reordered[0] ?? route.model,
			// Every pass resends the full accumulated prompt. Once a route succeeds,
			// keep subsequent passes on the model/provider that owns that warm prefix.
			// A real failure clears the pin below and restores this fallback list.
			fallbackModels: modelPin ? [] : reordered.slice(1),
			providerRouting: {
				...(route.providerRouting ?? {}),
				...(ignoredProviders.length > 0 ? { ignore: ignoredProviders } : {}),
				...(pin?.providerSlug ? { order: [pin.providerSlug], allow_fallbacks: false } : {})
			}
		};
	}

	private observeTurnRouteFailure(
		turnRunId: string,
		model: string | null,
		providerSlug: string | null
	): void {
		const health = this.getTurnRouteHealth(turnRunId, true)!;
		health.lastResponse = null;
		if (model) {
			health.failedModels.add(model);
			health.preferredModels = health.preferredModels.filter(
				(candidate) => candidate !== model
			);
		}
		if (providerSlug) health.failedProviderSlugs.add(providerSlug);
		if (
			health.pin &&
			((model && health.pin.model === model) ||
				(providerSlug && health.pin.providerSlug === providerSlug))
		) {
			health.pin = null;
		}
		health.updatedAtMs = Date.now();
	}

	private observeTurnRouteSuccess(
		turnRunId: string,
		model: string,
		requestedModel: string,
		providerSlug: string | null,
		pinEligible: boolean
	): void {
		const health = this.getTurnRouteHealth(turnRunId, true)!;
		health.updatedAtMs = Date.now();
		if (pinEligible && !health.pin) health.pin = { model, providerSlug };
		const recoveredFromFailure =
			health.failedModels.size > 0 || health.failedProviderSlugs.size > 0;
		const resolvedFallback = model !== requestedModel;
		health.failedModels.delete(model);
		if (!recoveredFromFailure && !resolvedFallback) return;
		health.preferredModels = [
			model,
			...health.preferredModels.filter((candidate) => candidate !== model)
		];
	}

	private getTurnRouteHealth(turnRunId: string, create: boolean): TurnRouteHealth | null {
		const now = Date.now();
		for (const [candidateTurnRunId, health] of this.turnRouteHealth) {
			if (now - health.updatedAtMs > TURN_ROUTE_HEALTH_TTL_MS) {
				this.turnRouteHealth.delete(candidateTurnRunId);
			}
		}
		const existing = this.turnRouteHealth.get(turnRunId);
		if (existing || !create) return existing ?? null;
		while (this.turnRouteHealth.size >= MAX_TURN_ROUTE_HEALTH_ENTRIES) {
			const oldestTurnRunId = this.turnRouteHealth.keys().next().value as string | undefined;
			if (!oldestTurnRunId) break;
			this.turnRouteHealth.delete(oldestTurnRunId);
		}
		const health: TurnRouteHealth = {
			failedModels: new Set(),
			failedProviderSlugs: new Set(),
			preferredModels: [],
			pin: null,
			lastResponse: null,
			updatedAtMs: now
		};
		this.turnRouteHealth.set(turnRunId, health);
		return health;
	}

	private requestBody(
		route: AgenticChatOpenAiCompatibleRouteV1,
		input: ClientInput
	): Record<string, unknown> {
		const toolSurface =
			input.toolChoice !== 'none'
				? { tools: input.tools.map(copyTool), tool_choice: input.toolChoice }
				: { tool_choice: 'none' as const };
		// Reviewer passes share one byte-identical prefix (system prompt + tools)
		// across every review, so their cache key is a constant and the prefix
		// warms across sessions. Acting passes keep the per-session key because
		// their prefix is the session's own prompt.
		const promptCacheKey =
			input.passRole === 'contract_review' || input.passRole === 'mutation_review'
				? REVIEWER_PROMPT_CACHE_KEY
				: input.sessionId;
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
				prompt_cache_key: promptCacheKey
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
			prompt_cache_key: promptCacheKey
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
		const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
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
								scope:
									`provider:${input.logicalProviderRound}:` +
									`${canonicalProviderPassRole(input.passRole)}:${input.providerRound}:` +
									`${route.id}` +
									(providerAttempt === 1 ? '' : `:attempt:${providerAttempt}`),
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
				passRole: observation.passRole,
				providerAttempt: observation.providerAttempt,
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
): { events: AgenticChatTurnProviderClientEventV1[]; done: boolean } {
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
	const routerAttempt = lastOpenRouterAttempt(chunk.openrouter_metadata);
	state.requestId = canonicalOptionalText(chunk.id) ?? state.requestId;
	state.modelUsed =
		canonicalOptionalText(routerAttempt?.model) ??
		canonicalOptionalText(chunk.model) ??
		state.modelUsed;
	state.provider =
		canonicalOptionalText(routerAttempt?.provider) ??
		canonicalOptionalText(chunk.provider) ??
		state.provider;
	state.providerSlug =
		canonicalOptionalText(chunk.provider_slug) ??
		normalizeProviderSlug(state.provider) ??
		state.providerSlug;
	if (chunk.error !== undefined && chunk.error !== null) {
		const error = providerFrameError(chunk.error);
		throw new AgenticChatProviderNetworkError(error.message, error.retryable);
	}
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

	const events: AgenticChatTurnProviderClientEventV1[] = [];
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
			observeToolCallDelta(state, delta.tool_calls);
			events.push({ type: 'tool_call', toolCall: delta.tool_calls });
		}
	}
	return { events, done: false };
}

/**
 * Lenient mirror of the consumer's `appendToolCallDelta`. Anything the consumer
 * would reject without a name-level diagnostic (malformed delta, oversized name
 * or arguments, too many calls) makes the pass unobservable here rather than
 * guessing; a non-string arguments delta is the consumer's `delta_type`
 * rejection and is recorded against the call's name.
 */
function observeToolCallDelta(state: StreamState, value: readonly unknown[]): void {
	if (!state.toolCallsObservable) return;
	const unobservable = (): void => {
		state.toolCallsObservable = false;
		state.toolCalls.clear();
	};
	for (let position = 0; position < value.length; position += 1) {
		const delta = value[position];
		if (!delta || typeof delta !== 'object' || Array.isArray(delta)) return unobservable();
		const record = delta as Record<string, unknown>;
		const index = record.index ?? (value.length === 1 ? 0 : position);
		if (
			typeof index !== 'number' ||
			!Number.isSafeInteger(index) ||
			index < 0 ||
			index >= MAX_OBSERVED_TOOL_CALLS
		) {
			return unobservable();
		}
		const call = state.toolCalls.get(index) ?? {
			name: '',
			argumentsText: '',
			argumentsRejected: false
		};
		if (record.function !== undefined) {
			const fn = record.function;
			if (!fn || typeof fn !== 'object' || Array.isArray(fn)) return unobservable();
			const { name, arguments: argumentsDelta } = fn as Record<string, unknown>;
			if (name !== undefined) {
				if (typeof name !== 'string') return unobservable();
				call.name += name;
				if (call.name.length > MAX_OBSERVED_TOOL_NAME_CHARS) return unobservable();
			}
			if (argumentsDelta !== undefined) {
				if (typeof argumentsDelta !== 'string') {
					call.argumentsRejected = true;
				} else if (!call.argumentsRejected) {
					call.argumentsText += argumentsDelta;
					if (
						Buffer.byteLength(call.argumentsText, 'utf8') >
						MAX_OBSERVED_TOOL_ARGUMENT_BYTES
					) {
						return unobservable();
					}
				}
			}
		}
		state.toolCalls.set(index, call);
	}
}

/**
 * The consumer accepts an assembled name that exactly matches an advertised
 * tool, or that is an exact repetition of one (some providers resend the whole
 * name per delta). Everything else is rejected as not allowlisted.
 */
function isAdvertisedToolName(name: string, advertised: readonly string[]): boolean {
	if (advertised.includes(name)) return true;
	return advertised.some(
		(candidate) =>
			candidate.length > 0 &&
			name.length > candidate.length &&
			name.length % candidate.length === 0 &&
			candidate.repeat(name.length / candidate.length) === name
	);
}

/**
 * Mirror of the consumer's `detectToolCallPassTruncation` over the shadow
 * accumulator: streamed calls with a non-tool-call finish reason, or arguments
 * that end mid-object. Silent when the pass was unobservable or no tool
 * surface was offered (the consumer rejects those calls as disabled, which is
 * permanent and must not be retried).
 */
function observedToolCallTruncation(
	state: StreamState,
	input: ClientInput,
	finishedReason: string
): 'finish_reason' | 'arguments' | null {
	if (!state.toolCallsObservable || state.toolCalls.size === 0 || input.toolChoice === 'none') {
		return null;
	}
	if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
		return 'finish_reason';
	}
	for (const call of state.toolCalls.values()) {
		if (call.argumentsRejected) continue;
		if (isToolArgumentsTextTruncated(call.argumentsText)) return 'arguments';
	}
	return null;
}

function acceptsToolArguments(call: ObservedToolCall): boolean {
	if (call.argumentsRejected) return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(call.argumentsText || '{}');
	} catch {
		return false;
	}
	return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
}

/**
 * Name-only receipt extension for a completed attempt whose streamed tool call
 * the consumer will reject: the first such call's name (when it is a bounded
 * identifier token) and the size of the advertised surface. Emits nothing when
 * every call is acceptable, when the pass could not be observed faithfully, or
 * when no tool surface was offered — that rejection is about the disabled
 * surface, not a name.
 */
function rejectedToolCallPayload(state: StreamState, input: ClientInput): JsonObject {
	if (!state.toolCallsObservable || state.toolCalls.size === 0 || input.toolChoice === 'none') {
		return {};
	}
	const advertised = input.tools.map((tool) => tool.function.name);
	const rejected = [...state.toolCalls.entries()]
		.sort(([left], [right]) => left - right)
		.map(([, call]) => call)
		.find(
			(call) => !isAdvertisedToolName(call.name, advertised) || !acceptsToolArguments(call)
		);
	if (!rejected) return {};
	return {
		rejected_tool_name: REJECTED_TOOL_NAME_PATTERN.test(rejected.name) ? rejected.name : null,
		advertised_tool_count: input.tools.length
	};
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
	passRole?: AgenticChatProviderPassRoleV1;
	providerAttempt?: number;
	routeId: string;
}): string {
	const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
	const passRole = canonicalProviderPassRole(input.passRole);
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
			`${USAGE_LOG_IDENTITY_VERSION}:${input.turnRunId}:${input.executionGeneration}:` +
				`${input.logicalProviderRound}:${passRole}:${input.routeId}` +
				(providerAttempt === 1 ? '' : `:attempt:${providerAttempt}`),
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
	if (input.usage?.cost === undefined || input.usage.cost === null) {
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
	markResponseOpened(): void;
	timing(): ProviderAttemptTiming;
} {
	const controller = new AbortController();
	const networkStartedAtMs = Date.now();
	const deadlineAtMs = networkStartedAtMs + timeoutMs;
	let didTimeout = false;
	let responseOpenedAtMs: number | null = null;
	let timeoutFiredAtMs: number | null = null;
	const onAbort = () => controller.abort(external.reason);
	if (external.aborted) controller.abort(external.reason);
	else external.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(() => {
		didTimeout = true;
		timeoutFiredAtMs = Date.now();
		controller.abort(new Error(`Agentic Chat provider timeout after ${timeoutMs}ms`));
	}, timeoutMs);
	timer.unref?.();
	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timer);
			external.removeEventListener('abort', onAbort);
		},
		timedOut: () => didTimeout,
		markResponseOpened: () => {
			responseOpenedAtMs ??= Date.now();
		},
		timing: () => ({
			networkStartedAtMs,
			deadlineAtMs,
			responseOpenedAtMs,
			timeoutFiredAtMs
		})
	};
}

function providerAttemptTimingPayload(
	timing: ProviderAttemptTiming,
	endedAtMs: number
): JsonObject {
	return {
		network_started_at_ms: timing.networkStartedAtMs,
		deadline_at_ms: timing.deadlineAtMs,
		response_opened_at_ms: timing.responseOpenedAtMs,
		timeout_fired_at_ms: timing.timeoutFiredAtMs,
		timeout_overshoot_ms:
			timing.timeoutFiredAtMs === null
				? null
				: Math.max(0, timing.timeoutFiredAtMs - timing.deadlineAtMs),
		post_timeout_cleanup_ms:
			timing.timeoutFiredAtMs === null
				? null
				: Math.max(0, endedAtMs - timing.timeoutFiredAtMs),
		network_boundary_ms: boundedDuration(timing.networkStartedAtMs, endedAtMs)
	};
}

function abortableProviderRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) {
		return Promise.reject(
			signal.reason instanceof Error ? signal.reason : new Error('Provider request aborted')
		);
	}
	const pendingRead = read();
	return new Promise<T>((resolve, reject) => {
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		const onAbort = () => {
			cleanup();
			reject(
				signal.reason instanceof Error
					? signal.reason
					: new Error('Provider request aborted')
			);
		};
		signal.addEventListener('abort', onAbort, { once: true });
		void pendingRead.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			}
		);
	});
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
			[
				'authorization',
				'content-type',
				'accept',
				'http-referer',
				'x-title',
				'x-openrouter-metadata'
			].includes(key.toLowerCase())
		) {
			throw new Error('Agentic Chat provider route cannot override protected headers');
		}
		result[key] = canonicalHeaderValue(value, `route header ${key}`);
	}
	return Object.freeze(result);
}

function copyMessage(message: AgenticChatTurnProviderMessageV1) {
	return {
		role: message.role,
		content: message.content,
		...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
		...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {})
	};
}

function copyTool(tool: AgenticChatTurnProviderToolV1) {
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
	canonicalProviderAttempt(input.providerAttempt);
	canonicalProviderPassRole(input.passRole);
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
		(input.toolChoice !== 'auto' && input.toolChoice !== 'required') ||
		input.tools.length < 1 ||
		input.tools.length > MAX_REVIEWED_PROVIDER_TOOLS
	) {
		throw new Error(
			'Agentic Chat toolChoice=auto|required requires a bounded reviewed tool surface'
		);
	}
	const seen = new Set<string>();
	for (const tool of input.tools) {
		validateReadToolDefinition(tool, seen);
	}
}

function responseIdentity(input: ClientInput): string {
	// Physical retries belong to the same logical pass. The completed retry's
	// actual route is retained, without retaining its prompt or tool arguments.
	return JSON.stringify([
		input.streamRunId,
		input.processingToken,
		input.executionGeneration,
		input.logicalProviderRound,
		input.providerRound,
		input.passRole ?? 'acting'
	]);
}

function canonicalProviderAttempt(value: number | undefined): number {
	const attempt = value ?? 1;
	if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 8) {
		throw new Error('Agentic Chat provider attempt must be between 1 and 8');
	}
	return attempt;
}

function canonicalProviderPassRole(
	value: AgenticChatProviderPassRoleV1 | undefined
): AgenticChatProviderPassRoleV1 {
	const role = value ?? 'acting';
	if (
		role !== 'acting' &&
		role !== 'contract_review' &&
		role !== 'mutation_review' &&
		role !== 'repair' &&
		role !== 'final_response'
	) {
		throw new Error('Agentic Chat provider pass role is invalid');
	}
	return role;
}

function validateReadToolDefinition(
	tool: AgenticChatTurnProviderToolV1 | undefined,
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

const PROVIDER_DISPLAY_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	'baidu qianfan': 'baidu',
	'digital ocean': 'digitalocean',
	'google vertex': 'google-vertex',
	'moonshot ai': 'moonshotai',
	nvidia: 'nvidia',
	'weights & biases': 'wandb',
	'z.ai': 'z-ai'
});

function normalizeProviderSlug(value: string | null | undefined): string | null {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return null;
	const alias = PROVIDER_DISPLAY_NAME_ALIASES[normalized];
	if (alias) return alias;
	return /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(normalized) ? normalized : null;
}

function lastOpenRouterAttempt(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const attempts = (value as Record<string, unknown>).attempts;
	if (!Array.isArray(attempts)) return null;
	const lastAttempt = attempts.at(-1);
	return lastAttempt && typeof lastAttempt === 'object' && !Array.isArray(lastAttempt)
		? (lastAttempt as Record<string, unknown>)
		: null;
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
