// packages/smart-llm/src/model-config.test.ts
import { describe, expect, it } from 'vitest';
import { resolveModelPricingProfile } from './model-config';

describe('resolveModelPricingProfile', () => {
	it('normalizes provider date-suffixed model ids for pricing', () => {
		const result = resolveModelPricingProfile('deepseek/deepseek-v3.2-20251201');

		expect(result?.modelId).toBe('deepseek/deepseek-v3.2');
		expect(result?.profile.cost).toBeGreaterThan(0);
		expect(result?.profile.outputCost).toBeGreaterThan(0);
	});

	it('matches configured snapshot aliases when providers return compact dates', () => {
		const result = resolveModelPricingProfile('qwen/qwen3.5-flash-20260224');

		expect(result?.modelId).toBe('qwen/qwen3.5-flash-02-23');
		expect(result?.profile.cost).toBeGreaterThan(0);
		expect(result?.profile.outputCost).toBeGreaterThan(0);
	});

	it('normalizes provider month-day snapshot aliases', () => {
		const result = resolveModelPricingProfile('qwen/qwen3-32b-04-28');

		expect(result?.modelId).toBe('qwen/qwen3-32b');
		expect(result?.profile.cost).toBe(0.08);
		expect(result?.profile.outputCost).toBe(0.24);
	});

	it('falls back to a requested model when the resolved model is not configured', () => {
		const result = resolveModelPricingProfile('provider/unknown-model', ['qwen/qwen3.6-plus']);

		expect(result?.modelId).toBe('qwen/qwen3.6-plus');
	});
});
