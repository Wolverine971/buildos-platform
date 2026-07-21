// packages/smart-llm/src/spend-guard.test.ts
import { describe, expect, it } from 'vitest';
import { GLM_52_MODEL, resolveModelPricingProfile } from './model-config';
import { LLMSpendLimitError, planJSONRequestSpend } from './spend-guard';

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
		let error: unknown;
		try {
			planJSONRequestSpend({
				models: ['unknown/expensive-model'],
				systemPrompt: 'Return JSON.',
				userPrompt: 'Do work.',
				requestedMaxTokens: 1000,
				maxCostUsd: 0.01
			});
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(LLMSpendLimitError);
		expect((error as Error).message).toContain('No priced model can satisfy');
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

	it('sets max_price above the raw catalog rate so real endpoints are not all rejected', () => {
		// Regression: max_price was set to the exact catalog rate, so OpenRouter
		// returned 404 "No endpoints found that satisfy the max price" whenever a
		// model's real endpoints cost more than its (lagging) catalog price. A live
		// probe confirmed z-ai/glm-5.2 clears at >=1.25x catalog.
		const pricing = resolveModelPricingProfile(GLM_52_MODEL);
		const catalogPrompt = pricing!.profile.cost;
		const catalogCompletion = pricing!.profile.outputCost;

		const plan = planJSONRequestSpend({
			models: [GLM_52_MODEL],
			systemPrompt: 'Return JSON.',
			userPrompt: 'Analyze this.',
			requestedMaxTokens: 1000,
			maxCostUsd: 0.05,
			safetyMultiplier: 2
		});

		expect(plan.providerMaxPrice.prompt).toBeCloseTo(catalogPrompt * 2, 6);
		expect(plan.providerMaxPrice.completion).toBeCloseTo(catalogCompletion * 2, 6);
		expect(plan.providerMaxPrice.prompt).toBeGreaterThan(catalogPrompt);
		// Any accepted endpoint (price <= max_price) keeps actual <= reserved:
		// reserved uses estimatedInputTokens + maxTokens at the same 2x multiplier.
		const worstCaseActual =
			(plan.estimatedInputTokens * plan.providerMaxPrice.prompt +
				plan.maxTokens * plan.providerMaxPrice.completion) /
			1_000_000;
		expect(worstCaseActual).toBeLessThanOrEqual(plan.reservedCostUsd + 1e-9);
	});

	it('keeps the requested model id while using its normalized catalog pricing', () => {
		const versionedModel = `${GLM_52_MODEL}-20270101`;
		const plan = planJSONRequestSpend({
			models: [versionedModel],
			systemPrompt: 'Return JSON.',
			userPrompt: 'Analyze this.',
			requestedMaxTokens: 1000,
			maxCostUsd: 0.01
		});

		expect(plan.model).toBe(versionedModel);
	});
});
