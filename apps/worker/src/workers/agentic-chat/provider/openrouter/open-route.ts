// apps/worker/src/workers/agentic-chat/provider/openrouter/open-route.ts
// Builds one route's request body and opens its SSE response, admitting the
// dispatch gate and starting the local prompt dump before any network I/O.
import { OPENROUTER_PRIVATE_PROVIDER, buildOpenRouterChatCompletionBody } from '@buildos/smart-llm';
import type { AgenticChatTurnProviderMessageV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import {
	type LocalPromptDump,
	localPromptDumpsEnabled,
	startLocalPromptDump
} from '../../effects/prompt-dump';
import type { ActiveResponse, AgenticChatOpenAiCompatibleRouteV1, ClientInput } from './types';
import {
	canonicalError,
	canonicalOptionalHeader,
	canonicalProviderAttempt,
	canonicalProviderPassRole,
	throwAbort
} from './canonical';
import { AgenticChatProviderNetworkError } from './errors';
import {
	isRetryableStatus,
	orderedProviderSlug,
	readBoundedResponseText,
	responseError
} from './retry';
import {
	type CallCaptureSettings,
	ProviderCallCapture,
	capturedRequestHeaders
} from './call-capture';
import { createStableAgenticChatProviderUsageLogIdV1 } from './usage';
import {
	OUTPUT_RECOVERY_TIMEOUT_MS,
	isActingOutputPass,
	outputBudgetInstruction
} from '../output-budget';
import {
	type AgenticChatContinuationReasoningMode,
	type TurnReasoningReplayStore,
	attachReplayedReasoning,
	capturesReasoning,
	effectiveReasoningEffort,
	replaysReasoning
} from './reasoning-replay';
import {
	abortableProviderRead,
	attemptTimeoutMs,
	createAttemptSignal,
	watchesStreamProgress
} from './watchdog';

const FINAL_BUFFERED_RESPONSE_HEADERS_TIMEOUT_MS = 10_000;
/** Bump when the reviewer prefix (system prompt or tool schemas) changes shape. */
const REVIEWER_PROMPT_CACHE_KEY = 'agentic-chat-reviewer-v3';

/** Client-level settings every request on every route shares. */
export type OpenRouteSettings = {
	fetchImpl: typeof fetch;
	httpReferer: string;
	appName: string;
	requestTimeoutMs: number;
	responseHeadersTimeoutMs: number;
	maxTokens: number;
	temperature: number;
	/** AGENTIC_CHAT_CONTINUATION_REASONING; absent means `default` (today's requests). */
	continuationReasoning?: AgenticChatContinuationReasoningMode;
	/** The replay variant's per-turn reasoning; present only in `replay` mode. */
	reasoningReplay?: TurnReasoningReplayStore;
	/** Stall and error capture (`llm_call_incidents`); absent sends exactly as before. */
	capture?: CallCaptureSettings;
};

/** The `max_tokens` value this request sends. */
export function sentMaxTokens(maxTokens: number, input: ClientInput): number {
	return Math.min(maxTokens, input.maxOutputTokens ?? maxTokens);
}

export async function openProviderRoute(
	settings: OpenRouteSettings,
	route: AgenticChatOpenAiCompatibleRouteV1,
	input: ClientInput,
	onPromptDump: (dump: LocalPromptDump | null) => void,
	onCapture?: (capture: ProviderCallCapture | null) => void
): Promise<ActiveResponse> {
	const body = JSON.stringify(buildProviderRequestBody(settings, route, input));
	// Workflow requests reserve budget for this exact body before any network I/O.
	// A refusal propagates as AgenticChatProviderDispatchDeniedError; nothing is sent.
	const dispatchPermit = input.dispatchGate
		? await input.dispatchGate.admit(
				{
					routeId: route.id,
					routeKind: route.kind,
					model: route.model,
					fallbackModels: [...(route.fallbackModels ?? [])],
					serializedRequestBytes: Buffer.byteLength(body, 'utf8'),
					maxOutputTokens: sentMaxTokens(settings.maxTokens, input)
				},
				input.signal
			)
		: null;
	const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
	const passRole = canonicalProviderPassRole(input.passRole);
	const promptDump = localPromptDumpsEnabled()
		? startLocalPromptDump(
				{
					sessionId: input.sessionId,
					turnRunId: input.turnRunId,
					streamRunId: input.streamRunId,
					clientTurnId: input.clientTurnId,
					executionGeneration: input.executionGeneration,
					logicalProviderRound: input.logicalProviderRound,
					providerRound: input.providerRound,
					passRole,
					providerAttempt,
					routeId: route.id,
					usageLogId: createStableAgenticChatProviderUsageLogIdV1({
						turnRunId: input.turnRunId,
						executionGeneration: input.executionGeneration,
						logicalProviderRound: input.logicalProviderRound,
						passRole,
						providerAttempt,
						routeId: route.id
					})
				},
				body
			)
		: null;
	onPromptDump(promptDump);
	const timeoutMs = attemptTimeoutMs(
		input.outputBudgetRecovery
			? Math.min(settings.requestTimeoutMs, OUTPUT_RECOVERY_TIMEOUT_MS)
			: settings.requestTimeoutMs,
		input
	);
	// The first header cutoff leaves a retry. On the buffer's final attempt,
	// allow a slower connection instead of spending that last chance at the
	// same speculative cutoff. The existing attempt/turn budget still wins.
	const headersTimeoutMs = input.finalBufferedAttempt
		? Math.max(settings.responseHeadersTimeoutMs, FINAL_BUFFERED_RESPONSE_HEADERS_TIMEOUT_MS)
		: settings.responseHeadersTimeoutMs;
	const attempt = createAttemptSignal(
		input.signal,
		timeoutMs,
		Math.min(timeoutMs, headersTimeoutMs)
	);
	const requestHeaders: Record<string, string> = {
		Authorization: `Bearer ${route.apiKey}`,
		'Content-Type': 'application/json',
		Accept: 'text/event-stream',
		'HTTP-Referer': settings.httpReferer,
		'X-Title': settings.appName,
		...(route.kind === 'openrouter' ? { 'X-OpenRouter-Metadata': 'enabled' } : {}),
		...(route.headers ?? {})
	};
	const capture = settings.capture
		? new ProviderCallCapture(
				settings.capture,
				{
					userId: input.userId,
					sessionId: input.sessionId,
					turnRunId: input.turnRunId,
					projectId: input.projectId,
					usageLogId: createStableAgenticChatProviderUsageLogIdV1({
						turnRunId: input.turnRunId,
						executionGeneration: input.executionGeneration,
						logicalProviderRound: input.logicalProviderRound,
						passRole,
						providerAttempt,
						routeId: route.id
					}),
					passRole,
					logicalProviderRound: input.logicalProviderRound,
					providerAttempt,
					routeId: route.id,
					routeKind: route.kind,
					baseUrl: route.baseUrl,
					modelRequested: route.model,
					drainAllowed: !input.dispatchGate,
					context: {
						provider_round: input.providerRound,
						execution_generation: input.executionGeneration,
						context_type: input.contextType,
						tool_choice: input.toolChoice,
						tool_count: input.tools.length,
						timeout_ms: timeoutMs,
						headers_timeout_ms: Math.min(timeoutMs, headersTimeoutMs),
						output_budget_recovery: input.outputBudgetRecovery === true,
						final_buffered_attempt: input.finalBufferedAttempt === true,
						...(input.hedge
							? {
									hedge_backup: {
										reason: input.hedge.trigger.reason,
										elapsed_ms: input.hedge.trigger.elapsedMs,
										avoided_providers: [...input.hedge.avoidProviderSlugs]
									}
								}
							: {})
					}
				},
				route.apiKey,
				body,
				capturedRequestHeaders(requestHeaders)
			)
		: null;
	onCapture?.(capture);
	if (capture) {
		// The fetch runs on the capture's signal so a stall can be left running
		// to its end; every other abort still ends the request at once.
		const onAttemptAbort = () =>
			capture.onAttemptAbort(
				attempt.signal.reason,
				attempt.timedOut(),
				attempt.timing().responseOpenedAtMs !== null
			);
		if (attempt.signal.aborted) onAttemptAbort();
		else attempt.signal.addEventListener('abort', onAttemptAbort, { once: true });
	}
	let httpStatus: number | null = null;
	let requestId: string | null = null;
	try {
		const pendingResponse = settings.fetchImpl(`${route.baseUrl}/chat/completions`, {
			method: 'POST',
			headers: requestHeaders,
			body,
			signal: capture?.signal ?? attempt.signal
		});
		// Some fetch adapters ignore abort. Bound the await and dispose a late
		// response without accepting any text or tools from an expired attempt.
		void pendingResponse.then(
			(response) => {
				if (!attempt.signal.aborted || capture?.adoptLateResponse(response)) return;
				void response.body?.cancel().catch(() => undefined);
			},
			(error: unknown) => capture?.adoptLateFailure(error)
		);
		const response = await abortableProviderRead(() => pendingResponse, attempt.signal);
		attempt.markResponseOpened();
		capture?.observeResponse(response);
		httpStatus = response.status;
		requestId =
			canonicalOptionalHeader(response.headers.get('x-request-id')) ??
			canonicalOptionalHeader(response.headers.get('x-openrouter-request-id'));
		if (!response.ok) {
			// Raced: an error body that stalls cannot outlive the attempt.
			const {
				message,
				providerSlug,
				body: errorBody
			} = await abortableProviderRead(() => responseError(response), attempt.signal);
			capture?.recordErrorBody(errorBody);
			throw new AgenticChatProviderNetworkError(
				`Agentic Chat provider start failed (${response.status}): ${message}`,
				isRetryableStatus(response.status),
				providerSlug
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
			if (capture) {
				const unexpected = await abortableProviderRead(
					() => readBoundedResponseText(response, 16 * 1024),
					attempt.signal
				).catch(() => '');
				capture.recordErrorBody(unexpected);
			}
			await response.body.cancel().catch(() => undefined);
			throw new AgenticChatProviderNetworkError(
				'Agentic Chat provider returned a non-SSE success response',
				false
			);
		}
		return {
			promptDump,
			capture,
			route,
			// The turn reads one branch; the capture records the other.
			response: capture ? capture.tee(response) : response,
			requestId,
			signal: attempt.signal,
			timeoutMs,
			dispatchPermit,
			cleanup: attempt.cleanup,
			timedOut: attempt.timedOut,
			timing: attempt.timing,
			abort: attempt.abort
		};
	} catch (error) {
		// Only a non-2xx provider response proves the request was refused; anything
		// else may have crossed the provider boundary and stays uncertain.
		dispatchPermit?.settle({
			kind:
				httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)
					? 'provider_error_response'
					: 'no_provider_receipt',
			httpStatus,
			requestId,
			usage: null
		});
		promptDump?.complete({
			status: input.signal.aborted ? 'aborted' : 'failure',
			error: canonicalError(error),
			httpStatus,
			requestId,
			timing: attempt.timing()
		});
		attempt.cleanup();
		if (input.signal.aborted) throwAbort(input.signal);
		if (attempt.timedOut()) {
			// A request whose `order` names one endpoint went there first, so a
			// timeout before any response is that endpoint holding the request.
			// Only timeouts carry this attribution: fallbacks stay allowed, so a
			// 4xx/5xx may have come from any endpoint and names nothing unless
			// the gateway named it (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F76).
			throw new AgenticChatProviderNetworkError(
				`Agentic Chat provider request timed out after ${attempt.timing().deadlineAtMs - attempt.timing().networkStartedAtMs}ms`,
				true,
				orderedProviderSlug(route)
			);
		}
		throw error;
	}
}

function buildProviderRequestBody(
	settings: Pick<
		OpenRouteSettings,
		'maxTokens' | 'temperature' | 'continuationReasoning' | 'reasoningReplay'
	>,
	route: AgenticChatOpenAiCompatibleRouteV1,
	input: ClientInput
): Record<string, unknown> {
	const messages: Record<string, unknown>[] = input.messages.map(copyMessage);
	const mode = settings.continuationReasoning;
	const replayStore = settings.reasoningReplay;
	if (replayStore && replaysReasoning(mode, input, route)) {
		// Same turn only: the store is keyed by this turn and its own tool-call ids.
		attachReplayedReasoning(messages, input.messages, (ids) =>
			replayStore.lookup(input.turnRunId, ids)
		);
	}
	const reasoningEffort = effectiveReasoningEffort(mode, input, route.model);
	if (isActingOutputPass(input)) {
		messages.push({
			role: 'system',
			content: outputBudgetInstruction(sentMaxTokens(settings.maxTokens, input))
		});
	}
	const toolSurface =
		input.toolChoice !== 'none'
			? { tools: input.tools.map(copyTool), tool_choice: input.toolChoice }
			: { tool_choice: 'none' as const };
	// Reviewer passes share one byte-identical prefix (system prompt + tools)
	// across every review, so their cache key is a constant and the prefix
	// warms across sessions. Acting passes keep the per-session key because
	// their prefix is the session's own prompt.
	const contractReview =
		input.passRole === 'contract_review' || input.passRole === 'mutation_review';
	const promptCacheKey =
		input.passRole === 'research_review'
			? 'buildos:research-review:v1'
			: contractReview
				? REVIEWER_PROMPT_CACHE_KEY
				: input.sessionId;
	if (route.kind === 'openrouter') {
		return buildOpenRouterChatCompletionBody({
			model: route.model,
			models: route.fallbackModels ? [...route.fallbackModels] : undefined,
			messages,
			...toolSurface,
			temperature: settings.temperature,
			max_tokens: sentMaxTokens(settings.maxTokens, input),
			// A contract review is one bounded verdict over a filtered evidence
			// set. At the provider default 52% of its completion tokens were
			// hidden reasoning and calls ran p50 10.3 s; a verdict does not
			// need a document's worth of thinking. Acting and research-review
			// passes keep the provider default
			// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F80).
			// A watched pass streams its reasoning so the slow-stream watch can
			// tell thinking from stalling; the parser never surfaces it. The
			// replay variant streams it on every tool-capable acting attempt so
			// the turn's later passes can be sent it back.
			reasoning:
				reasoningEffort === 'none'
					? { enabled: false }
					: contractReview || reasoningEffort === 'low'
						? { effort: 'low', exclude: true }
						: {
								exclude: !(
									capturesReasoning(mode, input, route) ||
									watchesStreamProgress(
										input,
										canonicalProviderPassRole(input.passRole),
										route.model
									)
								)
							},
			// The privacy policy follows the routing spread so no route
			// preference can drop it (tasker 103).
			provider: {
				allow_fallbacks: true,
				...(route.providerRouting ?? {}),
				...OPENROUTER_PRIVATE_PROVIDER,
				...(input.dispatchGate
					? { max_price: { ...input.dispatchGate.providerMaxPrice } }
					: {})
			},
			stream: true,
			stream_options: { include_usage: true },
			session_id: input.sessionId,
			prompt_cache_key: promptCacheKey
		});
	}
	return {
		model: route.model,
		messages,
		...toolSurface,
		temperature: settings.temperature,
		max_tokens: sentMaxTokens(settings.maxTokens, input),
		stream: true,
		stream_options: { include_usage: true },
		prompt_cache_key: promptCacheKey
	};
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
