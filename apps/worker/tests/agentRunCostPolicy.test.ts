// apps/worker/tests/agentRunCostPolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
	canReservePaidToolCost,
	resolveAgentRunLlmLedgerSettlement,
	resolveAgentRunLlmSpendLimit,
	settlePaidToolReservation,
	summarizeAgentRunRetryLedger
} from '../src/workers/agent-run/agentRunCostPolicy';

describe('Agent Run cost policy', () => {
	it('caps one LLM reservation and only exposes the remaining run budget', () => {
		expect(resolveAgentRunLlmSpendLimit(undefined, 0)).toBeUndefined();
		expect(resolveAgentRunLlmSpendLimit(0.5, 0.1)).toEqual({
			maxCostUsd: 0.04,
			minOutputTokens: 128
		});
		const nearlyExhausted = resolveAgentRunLlmSpendLimit(0.5, 0.49);
		expect(nearlyExhausted).toMatchObject({ minOutputTokens: 128 });
		expect(nearlyExhausted?.maxCostUsd).toBeCloseTo(0.01);
		expect(resolveAgentRunLlmSpendLimit(0.5, 0.5)).toBeNull();
	});

	it('allows an exact paid-tool reservation and blocks any overshoot', () => {
		expect(
			canReservePaidToolCost({
				maxCostUsd: 0.5,
				currentCostUsd: 0.484,
				reservationCostUsd: 0.016
			})
		).toBe(true);
		expect(
			canReservePaidToolCost({
				maxCostUsd: 0.5,
				currentCostUsd: 0.485,
				reservationCostUsd: 0.016
			})
		).toBe(false);
		expect(
			canReservePaidToolCost({
				maxCostUsd: undefined,
				currentCostUsd: 100,
				reservationCostUsd: 0.016
			})
		).toBe(true);
	});

	it('settles provider usage as an adjustment instead of double-charging the reservation', () => {
		const reserved = {
			provider: 'tavily' as const,
			credits: 2,
			unit_cost_usd: 0.008,
			cost_usd: 0.016,
			source: 'search_depth_fallback' as const
		};
		const providerReported = {
			...reserved,
			credits: 1,
			cost_usd: 0.008,
			source: 'provider_reported' as const
		};

		expect(settlePaidToolReservation(reserved, providerReported)).toEqual({
			charge: providerReported,
			costAdjustmentUsd: -0.008,
			creditAdjustment: -1
		});
		expect(settlePaidToolReservation(reserved, null)).toEqual({
			charge: reserved,
			costAdjustmentUsd: 0,
			creditAdjustment: 0
		});
	});

	it('releases definitive pre-generation rejection and reconciles uncertain exposure', () => {
		expect(
			resolveAgentRunLlmLedgerSettlement({
				billingDisposition: 'released',
				costSource: 'reservation',
				totalCost: 0.04,
				totalTokens: 9_000
			})
		).toEqual({ status: 'released', actualCostUsd: 0, actualUnits: 0 });
		expect(
			resolveAgentRunLlmLedgerSettlement({
				billingDisposition: 'uncertain',
				costSource: 'reservation',
				totalCost: 0.04,
				totalTokens: 9_000
			})
		).toEqual({
			status: 'reconciliation_required',
			actualCostUsd: 0.04,
			actualUnits: 9_000
		});
	});

	it('reconstructs conservative retry usage from settled and uncertain ledger rows', () => {
		expect(
			summarizeAgentRunRetryLedger([
				{
					provider: 'openrouter',
					status: 'settled',
					reserved_units: '12000',
					actual_units: '1000',
					unit_type: 'tokens',
					reserved_cost_usd: '0.04',
					actual_cost_usd: '0.01'
				},
				{
					provider: 'openrouter',
					status: 'reconciliation_required',
					reserved_units: '17000',
					actual_units: '16000',
					unit_type: 'tokens',
					reserved_cost_usd: '0.04',
					actual_cost_usd: '0.035'
				},
				{
					provider: 'tavily',
					status: 'settled',
					reserved_units: '2',
					actual_units: '1',
					unit_type: 'credits',
					reserved_cost_usd: '0.016',
					actual_cost_usd: '0.008'
				},
				{
					provider: 'openrouter',
					status: 'released',
					reserved_units: '9000',
					actual_units: '0',
					unit_type: 'tokens',
					reserved_cost_usd: '0.04',
					actual_cost_usd: '0'
				}
			])
		).toEqual({
			observedTokens: 1000,
			uncertainTokenExposure: 17000,
			costUsd: 0.058,
			llmCostUsd: 0.05,
			paidToolCostUsd: 0.008,
			tavilyCredits: 1
		});
	});
});
