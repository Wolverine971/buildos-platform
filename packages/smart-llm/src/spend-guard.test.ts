// packages/smart-llm/src/spend-guard.test.ts
import { describe, expect, it } from 'vitest';
import { GLM_52_MODEL } from './model-config';
import { planJSONRequestSpend } from './spend-guard';

describe('JSON request spend guard', () => {
	it('reserves conservatively for input and caps output inside the call budget', () => {
		const plan = planJSONRequestSpend({
			models: [GLM_52_MODEL],
			systemPrompt: 'Return JSON.',
			userPrompt: 'Analyze this bounded research packet.',
			requestedMaxTokens: 100_000,
			maxCostUsd: 0.01,
			minOutputTokens: 128
		});

		expect(plan.model).toBe(GLM_52_MODEL);
		expect(plan.maxTokens).toBeGreaterThanOrEqual(128);
		expect(plan.maxTokens).toBeLessThan(100_000);
		expect(plan.reservedCostUsd).toBeLessThanOrEqual(0.01);
		expect(plan.estimatedInputTokens).toBeGreaterThan(
			'Return JSON.Analyze this bounded research packet.'.length
		);
	});

	it('rejects an unpriced model instead of making an unbounded request', () => {
		expect(() =>
			planJSONRequestSpend({
				models: ['unknown/expensive-model'],
				systemPrompt: 'Return JSON.',
				userPrompt: 'Do work.',
				requestedMaxTokens: 1000,
				maxCostUsd: 0.01
			})
		).toThrow('No priced model can satisfy');
	});

	it('rejects a request whose prompt reservation leaves no useful output budget', () => {
		expect(() =>
			planJSONRequestSpend({
				models: [GLM_52_MODEL],
				systemPrompt: 'x'.repeat(100_000),
				userPrompt: 'Do work.',
				requestedMaxTokens: 1000,
				maxCostUsd: 0.0001,
				minOutputTokens: 128
			})
		).toThrow('No priced model can satisfy');
	});
});
