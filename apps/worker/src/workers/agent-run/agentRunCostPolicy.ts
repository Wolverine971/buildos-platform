// apps/worker/src/workers/agent-run/agentRunCostPolicy.ts
import type { JSONUsageEvent } from '@buildos/smart-llm';
import type { PaidToolCharge } from './webResearchPort';

const MAX_LLM_CALL_RESERVATION_USD = 0.04;
const MIN_LLM_OUTPUT_TOKENS = 128;
const USD_EPSILON = 1e-12;

export interface AgentRunLlmSpendLimit {
	maxCostUsd: number;
	minOutputTokens: number;
}

export interface AgentRunRetryLedgerEntry {
	provider?: unknown;
	status?: unknown;
	reserved_units?: unknown;
	actual_units?: unknown;
	unit_type?: unknown;
	reserved_cost_usd?: unknown;
	actual_cost_usd?: unknown;
}

export interface AgentRunRetryLedgerSummary {
	observedTokens: number;
	uncertainTokenExposure: number;
	costUsd: number;
	llmCostUsd: number;
	paidToolCostUsd: number;
	tavilyCredits: number;
}

function finiteNonNegativeNumber(value: unknown): number | null {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim() !== ''
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Rebuilds the conservative paid-usage checkpoint for a queue retry.
 *
 * PostgreSQL NUMERIC values may arrive as strings. Released reservations have
 * no exposure. Settled token units are observed usage; token units whose final
 * billing is still unknown remain separate uncertainty so they cannot silently
 * consume the run's observed-token target. Costs fail closed at the larger of
 * actual and reserved exposure for every non-released row.
 */
export function summarizeAgentRunRetryLedger(
	entries: AgentRunRetryLedgerEntry[]
): AgentRunRetryLedgerSummary {
	const summary: AgentRunRetryLedgerSummary = {
		observedTokens: 0,
		uncertainTokenExposure: 0,
		costUsd: 0,
		llmCostUsd: 0,
		paidToolCostUsd: 0,
		tavilyCredits: 0
	};

	for (const entry of entries) {
		if (entry.status === 'released') continue;
		if (!['reserved', 'settled', 'reconciliation_required'].includes(String(entry.status))) {
			continue;
		}

		const reservedCost = finiteNonNegativeNumber(entry.reserved_cost_usd) ?? 0;
		const actualCost = finiteNonNegativeNumber(entry.actual_cost_usd);
		const exposedCost =
			entry.status === 'settled'
				? (actualCost ?? reservedCost)
				: Math.max(reservedCost, actualCost ?? 0);
		const reservedUnits = finiteNonNegativeNumber(entry.reserved_units) ?? 0;
		const actualUnits = finiteNonNegativeNumber(entry.actual_units);
		const exposedUnits =
			entry.status === 'settled'
				? (actualUnits ?? reservedUnits)
				: Math.max(reservedUnits, actualUnits ?? 0);

		summary.costUsd += exposedCost;
		if (entry.unit_type === 'tokens') {
			summary.llmCostUsd += exposedCost;
			if (entry.status === 'settled' && actualUnits !== null) {
				summary.observedTokens += actualUnits;
			} else {
				summary.uncertainTokenExposure += exposedUnits;
			}
		}
		if (entry.unit_type === 'credits' || entry.provider === 'tavily') {
			summary.paidToolCostUsd += exposedCost;
			summary.tavilyCredits += exposedUnits;
		}
	}

	return summary;
}

export function resolveAgentRunLlmLedgerSettlement(
	usage: Pick<JSONUsageEvent, 'billingDisposition' | 'costSource' | 'totalCost' | 'totalTokens'>
): {
	status: 'settled' | 'released' | 'reconciliation_required';
	actualCostUsd: number;
	actualUnits: number;
} {
	if (usage.billingDisposition === 'released') {
		return { status: 'released', actualCostUsd: 0, actualUnits: 0 };
	}
	return {
		status:
			usage.billingDisposition === 'uncertain' || usage.costSource === 'reservation'
				? 'reconciliation_required'
				: 'settled',
		actualCostUsd: usage.totalCost,
		actualUnits: usage.totalTokens
	};
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

export function settlePaidToolReservation(
	reserved: PaidToolCharge,
	providerReported: PaidToolCharge | null
): {
	charge: PaidToolCharge;
	costAdjustmentUsd: number;
	creditAdjustment: number;
} {
	const charge = providerReported ?? reserved;
	return {
		charge,
		costAdjustmentUsd: charge.cost_usd - reserved.cost_usd,
		creditAdjustment: charge.credits - reserved.credits
	};
}
