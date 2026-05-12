// apps/web/src/lib/services/agentic-chat-v2/context-usage.ts
import type { ContextUsageSnapshot } from '@buildos/shared-types';

// UI badge budget — calibrated for "your conversation is getting long, consider
// compressing or starting a new chat." Used by the chat-header pill in the UI.
// NOT used to drive orchestrator stop-the-loop decisions.
const DEFAULT_FASTCHAT_TOKEN_BUDGET = 15000;

// Orchestration budget — calibrated for "the model's context window is filling
// up, the agent should stop calling read tools and synthesize." Used by the
// stream orchestrator to gate maxToolRounds and (in future) to trigger the
// saturation ledger's must_synthesize state. Sized for modern context windows
// (≥128k) with a conservative safety margin. Env-overridable for per-model
// tuning. See docs/specs/agent-token-tracking-investigation-2026-05-12.md
// for why this is a distinct number from the UI budget.
const DEFAULT_ORCHESTRATION_TOKEN_BUDGET = 80000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
}

export const FASTCHAT_TOKEN_BUDGETS = {
	UI: parsePositiveInt(process.env.FASTCHAT_UI_TOKEN_BUDGET, DEFAULT_FASTCHAT_TOKEN_BUDGET),
	ORCHESTRATION: parsePositiveInt(
		process.env.FASTCHAT_ORCHESTRATION_TOKEN_BUDGET,
		DEFAULT_ORCHESTRATION_TOKEN_BUDGET
	)
} as const;

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
	const tokenBudget = params.tokenBudget ?? FASTCHAT_TOKEN_BUDGETS.UI;
	const systemTokens = estimateTokensFromText(params.systemPrompt);
	const historyTokens = params.history.reduce(
		(sum, msg) => sum + estimateTokensFromText(msg.content ?? ''),
		0
	);
	const userTokens = estimateTokensFromText(params.userMessage);
	const estimatedTokens = systemTokens + historyTokens + userTokens;

	return buildSnapshotFromTokens({ estimatedTokens, tokenBudget });
}

// Build a snapshot from a known token count (e.g. provider-reported
// prompt_tokens from a streaming `done` event). Used by the orchestrator to
// keep a live snapshot of context window load as tool results accumulate.
export function buildLiveSnapshotFromTokens(params: {
	estimatedTokens: number;
	tokenBudget?: number;
}): ContextUsageSnapshot {
	const tokenBudget = params.tokenBudget ?? FASTCHAT_TOKEN_BUDGETS.ORCHESTRATION;
	return buildSnapshotFromTokens({
		estimatedTokens: Math.max(0, params.estimatedTokens),
		tokenBudget
	});
}

function buildSnapshotFromTokens(params: {
	estimatedTokens: number;
	tokenBudget: number;
}): ContextUsageSnapshot {
	const { estimatedTokens, tokenBudget } = params;
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
