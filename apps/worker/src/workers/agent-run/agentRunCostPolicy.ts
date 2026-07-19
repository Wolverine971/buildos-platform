// apps/worker/src/workers/agent-run/agentRunCostPolicy.ts
const MAX_LLM_CALL_RESERVATION_USD = 0.04;
const MIN_LLM_OUTPUT_TOKENS = 128;
const USD_EPSILON = 1e-12;

export interface AgentRunLlmSpendLimit {
	maxCostUsd: number;
	minOutputTokens: number;
}

export function resolveAgentRunLlmSpendLimit(
	maxCostUsd: number | undefined,
	currentCostUsd: number
): AgentRunLlmSpendLimit | null | undefined {
	if (maxCostUsd === undefined) return undefined;
	const remainingCostUsd = Math.max(0, maxCostUsd - currentCostUsd);
	if (remainingCostUsd <= USD_EPSILON) return null;
	return {
		maxCostUsd: Math.min(remainingCostUsd, MAX_LLM_CALL_RESERVATION_USD),
		minOutputTokens: MIN_LLM_OUTPUT_TOKENS
	};
}

export function canReservePaidToolCost(params: {
	maxCostUsd: number | undefined;
	currentCostUsd: number;
	reservationCostUsd: number;
}): boolean {
	if (params.maxCostUsd === undefined) return true;
	return params.currentCostUsd + params.reservationCostUsd <= params.maxCostUsd + USD_EPSILON;
}
