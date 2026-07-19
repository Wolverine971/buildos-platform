// apps/worker/tests/agentRunCostPolicy.test.ts
import { describe, expect, it } from 'vitest';
import {
	canReservePaidToolCost,
	resolveAgentRunLlmSpendLimit
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
});
