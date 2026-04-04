// apps/web/src/lib/components/agent/agent-chat-formatters.ts
import type { ContextUsageSnapshot } from '@buildos/shared-types';
import { hasMarkdownFormatting } from '$lib/utils/markdown';
import type { UIMessage } from './agent-chat.types';

export const DEFAULT_AGENT_CHAT_TOKEN_BUDGET = 8000;

export function formatTime(date: Date): string {
	return date.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function formatTokensEstimate(value?: number | null): string {
	if (value === undefined || value === null || Number.isNaN(value)) return '0';
	if (value >= 10000) return `${Math.round(value / 1000)}k`;
	if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
	return Math.round(value).toLocaleString();
}

export function formatCompressionTimestamp(timestamp?: string | null): string {
	if (!timestamp) return 'Not yet compressed';
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) return 'Unknown';
	const diffMs = Date.now() - parsed.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function estimateTokensFromText(value?: string | null): number {
	if (!value) return 0;
	return Math.ceil(value.length / 4);
}

export function estimateConversationTokens(
	messages: Array<Pick<UIMessage, 'content' | 'role'>>
): number {
	return messages.reduce((sum, message) => {
		if (message.role !== 'user' && message.role !== 'assistant') {
			return sum;
		}
		return sum + estimateTokensFromText(message.content);
	}, 0);
}

export function deriveContextOverheadTokens(params: {
	serverSnapshot: ContextUsageSnapshot;
	messages: Array<Pick<UIMessage, 'content' | 'role'>>;
	draft?: string;
}): number {
	const visibleTokens =
		estimateConversationTokens(params.messages) + estimateTokensFromText(params.draft);
	return Math.max(params.serverSnapshot.estimatedTokens - visibleTokens, 0);
}

export function buildLiveContextUsageSnapshot(params: {
	messages: Array<Pick<UIMessage, 'content' | 'role'>>;
	draft?: string;
	serverSnapshot?: ContextUsageSnapshot | null;
	overheadTokens?: number;
	tokenBudget?: number;
}): ContextUsageSnapshot {
	const tokenBudget =
		params.serverSnapshot?.tokenBudget ?? params.tokenBudget ?? DEFAULT_AGENT_CHAT_TOKEN_BUDGET;
	const estimatedFromVisibleTokens =
		estimateConversationTokens(params.messages) +
		estimateTokensFromText(params.draft) +
		Math.max(params.overheadTokens ?? 0, 0);
	const estimatedTokens = Math.max(
		estimatedFromVisibleTokens,
		params.serverSnapshot?.estimatedTokens ?? 0
	);
	const usagePercent = Math.min(Math.round((estimatedTokens / tokenBudget) * 100), 999);
	const tokensRemaining = Math.max(tokenBudget - estimatedTokens, 0);
	const status: ContextUsageSnapshot['status'] =
		estimatedTokens > tokenBudget ? 'over_budget' : usagePercent >= 85 ? 'near_limit' : 'ok';

	return {
		estimatedTokens,
		tokenBudget,
		usagePercent,
		tokensRemaining,
		status,
		lastCompressedAt: params.serverSnapshot?.lastCompressedAt ?? null,
		lastCompression: params.serverSnapshot?.lastCompression ?? null
	};
}

export function shouldRenderAsMarkdown(content: string): boolean {
	return hasMarkdownFormatting(content);
}
