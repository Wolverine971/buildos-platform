// apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts
// Entry point of the OpenRouter/OpenAI-compatible provider lane: the client
// class and its `stream()` loop. Focused seams live in `./openrouter/`:
// route opening and request bodies (open-route), per-turn route health
// (route-health), SSE decoding (sse), usage normalization (usage), durable
// side writes (telemetry), attempt deadlines (watchdog), route/tool-surface
// validation (validation), and retry classification (retry).
import type { JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1
} from './contracts';
import { AgenticChatProviderDispatchDeniedError } from './contracts';
import type { LocalPromptDump } from '../effects/prompt-dump';
import {
	AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY,
	type AgenticChatPendingEffectsRegistry
} from '../effects/pending-effects';
import type {
	ActiveResponse,
	AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatProviderUsageObservationV1,
	ClientInput,
	ProviderUsage,
	RouteFailure,
	StreamState
} from './openrouter/types';
import {
	boundedDuration,
	boundedInteger,
	canonicalError,
	canonicalHeaderValue,
	canonicalOptionalHeader,
	canonicalProviderAttempt,
	canonicalProviderPassRole,
	estimateTokens,
	normalizeProviderSlug,
	throwAbort
} from './openrouter/canonical';
import { throwIfAborted } from '../shared/abortable-deadline';
import { AgenticChatProviderNetworkError, AgenticChatSlowStreamError } from './openrouter/errors';
import { type OpenRouteSettings, openProviderRoute, sentMaxTokens } from './openrouter/open-route';
import { attributedProviderSlug, isRetryableUnknownError, routeFailure } from './openrouter/retry';
import { TurnRouteHealthTracker, responseIdentity } from './openrouter/route-health';
import {
	observedToolCallTruncation,
	parseSseLine,
	rejectedToolCallPayload
} from './openrouter/sse';
import {
	type OpenRouterClientPorts,
	type ProviderAttemptEventType,
	persistProviderAttemptObservation,
	persistProviderUsage
} from './openrouter/telemetry';
import {
	createStableAgenticChatProviderUsageLogIdV1,
	normalizeProviderUsage,
	resolveProviderUsageCosts
} from './openrouter/usage';
import { validateRoutes, validateToolSurface } from './openrouter/validation';
import {
	abortableProviderRead,
	isV41FlashModel,
	providerAttemptTimingPayload,
	watchStreamProgress
} from './openrouter/watchdog';

export type {
	AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatOpenRouterProviderRoutingV1,
	AgenticChatProviderUsageObservationV1,
	AgenticChatProviderUsageObserverPortV1
} from './openrouter/types';
export { AgenticChatLlmUsageObserver } from './openrouter/telemetry';
export { createStableAgenticChatProviderUsageLogIdV1 } from './openrouter/usage';

const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
// Sep 13: 1,270/1,275 retained successful acting responses opened within 5s.
// Bound opening separately; the full generation keeps its own deadline.
export const DEFAULT_AGENTIC_CHAT_RESPONSE_HEADERS_TIMEOUT_MS = 5_000;
/**
 * Acting passes can spend hidden reasoning tokens before writing a tool call.
 *
 * The 2026-08-31 Phase 4 production gate reached the previous 2_000-token cap
 * twice on logical round three while composing `delegate_task` after seven
 * successful discovery reads. OpenRouter reported 2_001 completion tokens in
 * both runs, and the truncation guard correctly rejected the incomplete call.
 * This matches the reviewed semantic-reviewer ceiling and keeps a firm bound;
 * calls that already fit are billed only for the tokens they generate.
 *
 * 2026-09-22 book loop: DeepSeek V4.1 Flash spent 4,000/4,000 tokens on hidden
 * reasoning while composing a commissioned ~20-call restructure (project, goal,
 * nine plans, five tasks, three document rewrites) and returned nothing, twice.
 * It ignores `reasoning.effort` and `reasoning.max_tokens`, so the only lever is
 * room: 12,000 leaves space for reasoning plus a batch of document-sized calls.
 */
export const AGENTIC_CHAT_ACTING_MAX_TOKENS = 12_000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_SSE_BUFFER_BYTES = 256 * 1024;

/**
 * OpenAI-compatible network client for the production provider lane. Route fallback
 * is allowed only before a response stream is accepted, so emitted assistant
 * text can never be replayed against a second provider.
 */
export class AgenticChatOpenRouterClient implements AgenticChatTurnProviderClientPortV1 {
	private readonly routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
	private readonly routeSettings: OpenRouteSettings;
	private readonly maxSseBufferBytes: number;
	private readonly routeHealth: TurnRouteHealthTracker;
	private readonly pendingEffects: Pick<AgenticChatPendingEffectsRegistry, 'forTurn'>;

	constructor(
		private readonly ports: OpenRouterClientPorts,
		options: {
			routes: readonly AgenticChatOpenAiCompatibleRouteV1[];
			httpReferer: string;
			appName: string;
			fetchImpl?: typeof fetch;
			requestTimeoutMs?: number;
			responseHeadersTimeoutMs?: number;
			maxTokens?: number;
			temperature?: number;
			maxSseBufferBytes?: number;
		}
	) {
		this.routes = validateRoutes(options.routes);
		this.routeHealth = new TurnRouteHealthTracker(
			new Set(this.routes.flatMap((route) => [route.model, ...(route.fallbackModels ?? [])]))
		);
		this.pendingEffects = ports.pendingEffects ?? AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY;
		const fetchImpl = options.fetchImpl ?? globalThis.fetch;
		const requestTimeoutMs = boundedInteger(
			options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
			'requestTimeoutMs',
			1_000,
			360_000
		);
		const responseHeadersTimeoutMs = boundedInteger(
			options.responseHeadersTimeoutMs ?? DEFAULT_AGENTIC_CHAT_RESPONSE_HEADERS_TIMEOUT_MS,
			'responseHeadersTimeoutMs',
			1_000,
			360_000
		);
		const maxTokens = boundedInteger(
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
		const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
		if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
			throw new Error('Agentic Chat provider temperature must be between 0 and 2');
		}
		const httpReferer = canonicalHeaderValue(options.httpReferer, 'httpReferer');
		const appName = canonicalHeaderValue(options.appName, 'appName');
		if (typeof fetchImpl !== 'function') {
			throw new Error('Agentic Chat provider fetch implementation is unavailable');
		}
		this.routeSettings = {
			fetchImpl,
			httpReferer,
			appName,
			requestTimeoutMs,
			responseHeadersTimeoutMs,
			maxTokens,
			temperature
		};
	}

	rejectRepeatedInvalidToolResponse(input: ClientInput): void {
		const response = this.routeHealth.get(input.turnRunId, false)?.lastResponse;
		if (input.signal.aborted || !response || response.identity !== responseIdentity(input))
			return;
		// Transport success was already accounted for. Validation is recorded by
		// the coordinator; this only steers its remaining repair and is idempotent.
		this.routeHealth.observeFailure(input.turnRunId, response.model, response.providerSlug);
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
		let lastPromptDump: LocalPromptDump | null = null;
		let activeAttemptStartedAtMs: number | null = null;
		let activeAttemptKind: 'primary' | 'retry' | null = null;
		let activeAttemptEnded = false;
		let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
		let accounted = false;
		let dispatchDenied = false;
		let stopProgressWatch: (() => void) | undefined;
		const state: StreamState = {
			rawUsage: null,
			finishReason: null,
			modelUsed: null,
			provider: null,
			providerSlug: null,
			requestId: null,
			inThinkingBlock: false,
			completionChars: 0,
			generatedBytes: 0,
			toolCalls: new Map(),
			toolCallsObservable: true
		};

		const account = (
			status: AgenticChatProviderUsageObservationV1['status'],
			error: string | null,
			retryable: boolean
		): void => {
			if (accounted) return;
			let exactUsage: ProviderUsage | null;
			try {
				exactUsage = normalizeProviderUsage(state.rawUsage);
			} catch (usageError) {
				if (status === 'success') throw usageError;
				exactUsage = null;
			}
			accounted = true;
			active?.dispatchPermit?.settle({
				kind: 'stream_ended',
				httpStatus: active.response.status,
				requestId: state.requestId ?? active.requestId,
				usage: exactUsage
					? {
							promptTokens: exactUsage.promptTokens,
							completionTokens: exactUsage.completionTokens,
							totalTokens: exactUsage.totalTokens,
							reasoningTokens: exactUsage.reasoningTokens,
							cachedPromptTokens: exactUsage.cachedPromptTokens,
							costUsd: exactUsage.cost,
							modelUsed: state.modelUsed
						}
					: null
			});
			active?.promptDump?.complete({
				status,
				error,
				retryable,
				requestId: state.requestId ?? active.requestId,
				modelUsed: state.modelUsed ?? active.route.model,
				provider: state.provider,
				finishReason: state.finishReason,
				usage: state.rawUsage,
				timing: active.timing()
			});
			// A rejected start is not evidence that the prompt was processed.
			// Retain the failed attempt, but do not turn its request size into
			// billable usage. Accepted streams still need estimates if usage is lost.
			const hasUsageEvidence = active !== null || exactUsage !== null;
			const promptTokens =
				exactUsage?.promptTokens ?? (hasUsageEvidence ? estimateTokens(inputChars) : 0);
			const completionTokens =
				exactUsage?.completionTokens ?? estimateTokens(state.completionChars);
			const routeId = active?.route.id ?? lastAttemptedRoute?.id ?? 'none';
			const modelRequested = active?.route.model ?? lastAttemptedRoute?.model ?? null;
			const modelUsed = state.modelUsed ?? modelRequested;
			const costs = hasUsageEvidence
				? resolveProviderUsageCosts({
						usage: exactUsage,
						modelRequested,
						modelUsed,
						promptTokens,
						completionTokens
					})
				: { inputCost: 0, outputCost: 0, source: 'unknown' as const };
			this.enqueueUsage(
				{
					...(lastPromptDump
						? {
								localPromptDump: {
									jsonFile: lastPromptDump.jsonFile,
									markdownFile: lastPromptDump.markdownFile
								}
							}
						: {}),
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
				input.executionGeneration
			);
		};

		try {
			for (const configuredRoute of this.routes) {
				const route = this.routeHealth.apply(configuredRoute, input.turnRunId);
				lastAttemptedRoute = route;
				attemptedRouteIds.push(route.id);
				const attemptKind: 'primary' | 'retry' =
					providerAttempt > 1 || attemptedRouteIds.length > 1 ? 'retry' : 'primary';
				const attemptStartedAtMs = Date.now();
				this.observeProviderAttempt(input, route, 'provider_attempt_started', {
					round: input.providerRound,
					logical_provider_round: input.logicalProviderRound,
					pass_role: passRole,
					provider_attempt: providerAttempt,
					attempt_kind: attemptKind,
					route_id: route.id,
					model_requested: route.model
				});
				try {
					active = await openProviderRoute(this.routeSettings, route, input, (dump) => {
						lastPromptDump = dump;
					});
					activeAttemptStartedAtMs = attemptStartedAtMs;
					activeAttemptKind = attemptKind;
					break;
				} catch (error) {
					if (input.signal.aborted) throwAbort(input.signal);
					// A dispatch gate refused this request before any network I/O. It
					// says nothing about the route, and no further route may be tried.
					const denied = error instanceof AgenticChatProviderDispatchDeniedError;
					// A 5xx or a timeout before the stream opens is the only 5xx-storm
					// signal this lane gets. Record the endpoint it can be attributed
					// to — the one the error named, or the one a timed-out request
					// was ordered to — so the next attempt's `provider.ignore` routes
					// around it instead of walking back into the same upstream.
					if (!denied) {
						this.routeHealth.observeFailure(
							input.turnRunId,
							route.model,
							attributedProviderSlug(route, error)
						);
					}
					const failure = denied
						? { routeId: route.id, message: canonicalError(error), retryable: false }
						: routeFailure(route.id, error);
					dispatchDenied ||= denied;
					failures.push(failure);
					this.observeProviderAttempt(input, route, 'provider_attempt_ended', {
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
					if (denied) break;
				}
			}

			if (!active) {
				const failure = failures.at(-1) ?? {
					routeId: 'none',
					message: 'Agentic Chat provider has no available route',
					retryable: false
				};
				account('failure', failure.message, failure.retryable);
				yield {
					type: 'error',
					error: failure.message,
					retryable: failure.retryable,
					...(dispatchDenied ? { cause: 'dispatch_denied' as const } : {})
				};
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
			if (
				input.allowSlowStreamRecovery === true &&
				attemptedRouteIds.length === 1 &&
				active.route.kind === 'openrouter' &&
				isV41FlashModel(state.modelUsed ?? active.route.model) &&
				['acting', 'repair', 'final_response'].includes(passRole)
			) {
				stopProgressWatch = watchStreamProgress(active, state, input);
			}
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
						active.promptDump?.recordEvent(event);
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
					active.promptDump?.recordEvent(event);
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
			// The cap is the `max_tokens` actually sent, including a smaller per-request
			// ceiling; ordinary calls send none, so their cap stays the client maximum.
			const finishedReason =
				exactUsage &&
				exactUsage.completionTokens >= sentMaxTokens(this.routeSettings.maxTokens, input)
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
				this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
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
				this.routeHealth.observeFailure(
					input.turnRunId,
					this.routeHealth.routingModel(state.modelUsed, active.route),
					state.providerSlug ?? normalizeProviderSlug(state.provider)
				);
				const message = `Agentic Chat provider truncated a tool call (${toolCallTruncation}, finish_reason=${finishedReason})`;
				account('failure', message, true);
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
			this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
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
				this.routeHealth.observeFailure(
					input.turnRunId,
					this.routeHealth.routingModel(state.modelUsed, active.route),
					state.providerSlug ?? normalizeProviderSlug(state.provider),
					// The pin is what put this pass on this endpoint, and the
					// endpoint ignored `tool_choice=none`. Retire the pin even when
					// the response named neither the pinned model nor the pinned
					// provider, so the bounded retry can land somewhere else.
					{ releasePin: true }
				);
				account(
					'failure',
					'Agentic Chat provider requested tool calls while tool_choice=none',
					true
				);
			} else {
				const routingModel = this.routeHealth.routingModel(state.modelUsed, active.route);
				this.routeHealth.observeSuccess(
					input.turnRunId,
					routingModel,
					active.route.model,
					state.providerSlug,
					active.route.kind === 'openrouter'
				);
				this.routeHealth.get(input.turnRunId, true)!.lastResponse = {
					identity: responseIdentity(input),
					model: routingModel,
					providerSlug: state.providerSlug
				};
				account('success', null, false);
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
				this.routeHealth.observeFailure(
					input.turnRunId,
					this.routeHealth.routingModel(state.modelUsed, active.route),
					state.providerSlug ?? normalizeProviderSlug(state.provider)
				);
			}
			if (active && !activeAttemptEnded) {
				const aborted = input.signal.aborted;
				const attemptEndedAtMs = Date.now();
				this.observeProviderAttempt(input, active.route, 'provider_attempt_ended', {
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
							: error instanceof AgenticChatSlowStreamError
								? 'provider_slow_stream'
								: error instanceof AgenticChatProviderNetworkError &&
									  error.retryable
									? 'provider_retryable_error'
									: 'provider_permanent_error',
					usage: null,
					...(error instanceof AgenticChatSlowStreamError
						? {
								progress_window_ms: error.windowMs,
								progress_output_bytes: error.outputBytes
							}
						: {})
				});
				activeAttemptEnded = true;
			}
			if (input.signal.aborted) {
				account('aborted', canonicalError(input.signal.reason), false);
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
			account('failure', message, retryable);
			yield {
				type: 'error',
				error: message,
				retryable,
				...(error instanceof AgenticChatSlowStreamError
					? { cause: 'slow_stream' as const }
					: {})
			};
		} finally {
			stopProgressWatch?.();
			if (!accounted) {
				account(
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

	private enqueueUsage(
		observation: AgenticChatProviderUsageObservationV1,
		executionGeneration: number
	): void {
		// Accounting belongs to the turn, not the provider call's cancellation lifetime.
		// The executor joins this same bounded registry before billing and terminal truth.
		this.pendingEffects
			.forTurn(observation.turnRunId)
			.enqueue(persistProviderUsage(this.ports, observation, executionGeneration));
	}

	/**
	 * Starts the durable attempt receipt and returns without waiting for it.
	 * The write is tracked in the turn's pending set; the executor drains that
	 * set at finalization, before the terminal fence, so the row lands while
	 * the turn is still running (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F50).
	 * The receipt is not on the path to the next network call: a pass no
	 * longer pays a serial round trip before its request opens or before its
	 * `done` is released.
	 */
	private observeProviderAttempt(
		input: ClientInput,
		route: AgenticChatOpenAiCompatibleRouteV1,
		eventType: ProviderAttemptEventType,
		payload: JsonObject
	): void {
		if (!this.ports.executionObservations) return;
		this.pendingEffects
			.forTurn(input.turnRunId)
			.enqueue(
				persistProviderAttemptObservation(this.ports, input, route, eventType, payload)
			);
	}
}
