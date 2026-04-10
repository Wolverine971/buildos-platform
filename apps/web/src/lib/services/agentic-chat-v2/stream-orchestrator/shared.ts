// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/shared.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';

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
	gatewayEnabled?: boolean;
	historyStrategy?: string;
	historyCompressed?: boolean;
	rawHistoryCount?: number;
	historyForModelCount?: number;
	tailMessagesKept?: number;
	continuityHintUsed?: boolean;
};

export type LLMStreamPassMetadata = {
	pass: number;
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
};
