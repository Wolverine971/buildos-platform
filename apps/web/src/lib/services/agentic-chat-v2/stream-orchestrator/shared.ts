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
	// Reasoning channel counters (populated when the provider emits reasoning
	// via delta.reasoning or delta.reasoning_details). Lets us see at a glance
	// whether a provider properly separates reasoning from content, or leaks
	// it into delta.content instead. See the 2026-04-17 audit.
	reasoningChannelChunks?: number;
	reasoningChannelChars?: number;
};
