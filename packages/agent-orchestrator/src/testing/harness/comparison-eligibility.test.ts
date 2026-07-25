// packages/agent-orchestrator/src/testing/harness/comparison-eligibility.test.ts
import { describe, expect, it } from 'vitest';

import {
	binomialTailProbability,
	COMPARISON_SCENARIO_IDS,
	isExcludedFromPrimary,
	primaryComparisonScenarioIds,
	primaryDenominator
} from './comparison-eligibility';

describe('primary comparison denominator', () => {
	it('excludes the scenario whose control arm crashed', () => {
		expect(isExcludedFromPrimary('a0-c07-campaign-workflow-research')).toBe(true);
		expect(primaryComparisonScenarioIds()).toEqual([
			'a0-c06-single-source-article',
			'a0-c08-context-app-recommendation'
		]);
	});

	it('reports a 6-pair primary denominator at three runs per scenario', () => {
		const denominator = primaryDenominator(3);
		expect(denominator.pairCount).toBe(6);
		expect(denominator.excluded).toHaveLength(1);
		expect(denominator.excluded[0]!.restoredBy).toContain('fresh control cohort');
	});

	it('keeps the excluded scenario in the declared comparison set for reporting', () => {
		expect(COMPARISON_SCENARIO_IDS).toHaveLength(3);
	});
});

describe('binomial tail probability', () => {
	it('matches the hand-computed values used in the research chapters', () => {
		// 130/512 — the false-positive rate of the original >=6-of-9 Go threshold.
		expect(binomialTailProbability(6, 9)).toBeCloseTo(130 / 512, 10);
		// 42/64 — >=3 of 6, the secondary gate.
		expect(binomialTailProbability(3, 6)).toBeCloseTo(42 / 64, 10);
		// The reduced primary denominator is not a 5% test at any achievable threshold.
		expect(binomialTailProbability(4, 6)).toBeCloseTo(22 / 64, 10);
		expect(binomialTailProbability(5, 6)).toBeCloseTo(7 / 64, 10);
		expect(binomialTailProbability(6, 6)).toBeCloseTo(1 / 64, 10);
	});

	it('handles degenerate inputs', () => {
		expect(binomialTailProbability(0, 0)).toBe(0);
		expect(binomialTailProbability(7, 6)).toBe(0);
	});
});
