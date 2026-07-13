// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/shared.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastChatLlmPassRole, FastChatModelTieringVariant } from '../model-tiering';

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
	finishedReason?: string;
	model?: string;
	provider?: string;
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
};
