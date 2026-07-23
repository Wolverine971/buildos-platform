// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/shared.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type {
	FastChatForcedSynthesisRoutingVariant,
	FastChatLlmPassRole,
	FastChatModelTieringVariant
} from '../model-tiering';

export type LLMStreamAttemptRoute = {
	attempt: number;
	models?: string[];
	ignoredProviderSlugs?: string[];
	maxTokens: number;
};

export type LLMStreamPassTerminalOutcome =
	| 'completed'
	| 'timed_out'
	| 'missing_completion_event'
	| 'provider_error'
	| 'aborted'
	| 'stream_error';

export type LLMStreamPassTerminalMeasurements = {
	pass: number;
	passRole?: FastChatLlmPassRole;
	forcedNoToolSynthesis: boolean;
	attempts: number;
	maxAttempts: number;
	retryCount: number;
	timeoutMs: number;
	durationMs: number;
	terminalEventReceived: boolean;
	assistantTextCharsReceived: number;
	reasoningCharsReceived: number;
	toolCallsReceived: number;
	retryable: boolean;
	attemptsExhausted: boolean;
	attemptRoutes?: LLMStreamAttemptRoute[];
	lastErrorMessage?: string;
};

export type FastChatCompletionOutcome = {
	status: 'completed' | 'completed_degraded';
	answerSource: 'model' | 'partial_model' | 'deterministic_evidence' | 'precise_no_evidence';
	recovery?: {
		outcome: Exclude<LLMStreamPassTerminalOutcome, 'completed' | 'aborted'>;
		measurements: LLMStreamPassTerminalMeasurements;
		evidenceToolExecutionCount: number;
	};
};

export type FastToolExecution = {
	toolCall: ChatToolCall;
	result: ChatToolResult;
};

export type GatewayRequiredFieldFailure = {
	op: string;
	field: string;
	occurrences: number;
};

export type FastChatDebugContext = {
	promptVariant?: string;
	turnNumber?: number;
	gatewayEnabled?: boolean;
	historyStrategy?: string;
	historyCompressed?: boolean;
	rawHistoryCount?: number;
	historyForModelCount?: number;
	tailMessagesKept?: number;
	continuityHintUsed?: boolean;
	liteSections?: unknown;
	liteContextInventory?: unknown;
	liteToolsSummary?: unknown;
};

export type LLMStreamPassMetadata = {
	pass: number;
	passRole?: FastChatLlmPassRole;
	requestedProfile?: string;
	requestedModels?: string[];
	modelTieringVariant?: FastChatModelTieringVariant;
	forcedSynthesisRoutingVariant?: FastChatForcedSynthesisRoutingVariant;
	ignoredProviderSlugs?: string[];
	maxTokens?: number;
	retryModelRotation?: boolean;
	attemptRoutes?: LLMStreamAttemptRoute[];
	finishedReason?: string;
	model?: string;
	provider?: string;
	providerRaw?: string;
	providerSlug?: string;
	requestId?: string;
	systemFingerprint?: string;
	cacheStatus?: string;
	reasoningTokens?: number;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
	attempts?: number;
	streamRetryCount?: number;
	lastStreamRetryError?: string;
	forcedNoToolSynthesis?: boolean;
	suppressedNoToolSynthesisToolCalls?: number;
	suppressedNoToolSynthesisToolCallDetails?: Array<{
		name: string;
		argumentsPreview: string;
	}>;
	// Reasoning channel counters (populated when the provider emits reasoning
	// via delta.reasoning or delta.reasoning_details). Lets us see at a glance
	// whether a provider properly separates reasoning from content, or leaks
	// it into delta.content instead. See the 2026-04-17 audit.
	reasoningChannelChunks?: number;
	reasoningChannelChars?: number;
	// Pass-level timing telemetry. startedAtMs/durationMs cover the full pass
	// wall-clock (including retry attempts); firstTokenAtMs/timeToFirstTokenMs
	// track the first content signal (text delta, reasoning delta, or tool-call
	// delta) from the SUCCESSFUL attempt's stream.
	startedAtMs?: number;
	firstTokenAtMs?: number | null;
	durationMs?: number;
	timeToFirstTokenMs?: number | null;
	// Terminal transport state is present on both cleanly completed passes and
	// failed passes that the orchestrator recovered as a degraded completion.
	terminalOutcome?: LLMStreamPassTerminalOutcome;
	terminalEventReceived?: boolean;
	assistantTextCharsReceived?: number;
	reasoningCharsReceived?: number;
	toolCallsReceived?: number;
	attemptsExhausted?: boolean;
	recoveredAsDegradedCompletion?: boolean;
};

export type FastChatOrchestrationInterventions = {
	projectCreateStopRepair: boolean;
	gatewayMutationStopRepair: boolean;
	skillGateStopRepair: boolean;
	gatewaySchemaRepair: boolean;
	gatewayCreateFieldRepair: boolean;
	validationRepairRounds: number;
	readLoopRepairRank: number;
	forcedSynthesisPasses: number;
	writeIntentCarveOut: boolean;
	lengthContinuations: number;
	documentOrganizationRecovery: boolean;
	finalizationGuard: boolean;
	supervisorRecoveryDecisions: number;
	streamRetries: number;
	synthesisTransportRecovery: boolean;
};
