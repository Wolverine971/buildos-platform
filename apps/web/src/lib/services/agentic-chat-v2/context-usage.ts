// apps/web/src/lib/services/agentic-chat-v2/context-usage.ts
import type { ContextUsageSnapshot } from '@buildos/shared-types';

const DEFAULT_FASTCHAT_TOKEN_BUDGET = 8000;

export function estimateTokensFromText(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

export function buildFastContextUsageSnapshot(params: {
	systemPrompt: string;
	history: Array<{ content: string }>;
	userMessage: string;
	tokenBudget?: number;
}): ContextUsageSnapshot {
	const tokenBudget = params.tokenBudget ?? DEFAULT_FASTCHAT_TOKEN_BUDGET;
	const systemTokens = estimateTokensFromText(params.systemPrompt);
	const historyTokens = params.history.reduce(
		(sum, msg) => sum + estimateTokensFromText(msg.content ?? ''),
		0
	);
	const userTokens = estimateTokensFromText(params.userMessage);
	const estimatedTokens = systemTokens + historyTokens + userTokens;

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
		lastCompressedAt: null,
		lastCompression: null
	};
}
