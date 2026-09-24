// apps/worker/src/workers/agentic-chat/provider/openrouter/types.ts
import type {
	AgenticChatProviderDispatchPermitV1,
	AgenticChatProviderPassRoleV1,
	AgenticChatTurnProviderClientPortV1
} from '../contracts';
import type { LocalPromptDump } from '../../effects/prompt-dump';

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
	localPromptDump?: { jsonFile: string; markdownFile: string };
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
	observe(
		observation: AgenticChatProviderUsageObservationV1,
		signal?: AbortSignal
	): void | Promise<void>;
};

export type ClientInput = Parameters<AgenticChatTurnProviderClientPortV1['stream']>[0];

export type RouteFailure = {
	routeId: string;
	message: string;
	retryable: boolean;
};

export type ActiveResponse = {
	promptDump: LocalPromptDump | null;
	route: AgenticChatOpenAiCompatibleRouteV1;
	response: Response;
	requestId: string | null;
	signal: AbortSignal;
	/** Timeout this attempt was given, after the turn budget was applied. */
	timeoutMs: number;
	/** Workflow dispatch reservation for this physical request; null on the ordinary path. */
	dispatchPermit: AgenticChatProviderDispatchPermitV1 | null;
	cleanup(): void;
	timedOut(): boolean;
	timing(): ProviderAttemptTiming;
	abort(reason: Error): void;
};

export type ProviderAttemptTiming = {
	networkStartedAtMs: number;
	deadlineAtMs: number;
	responseOpenedAtMs: number | null;
	timeoutFiredAtMs: number | null;
};

export type StreamState = {
	rawUsage: unknown;
	finishReason: string | null;
	modelUsed: string | null;
	provider: string | null;
	providerSlug: string | null;
	requestId: string | null;
	inThinkingBlock: boolean;
	completionChars: number;
	/** Actual output bytes, excluding SSE/tool-delta envelopes and repeated IDs. */
	generatedBytes: number;
	/**
	 * Streamed reasoning bytes. Never surfaced: they only show the slow-stream
	 * watch that a thinking model is still generating.
	 */
	reasoningBytes: number;
	/** When the first reasoning, text, or tool-argument byte arrived. */
	firstProgressAtMs: number | null;
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
export type ObservedToolCall = {
	name: string;
	argumentsText: string;
	argumentsRejected: boolean;
};

export type ProviderUsage = {
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
