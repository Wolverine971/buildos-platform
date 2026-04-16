// apps/web/src/lib/services/admin/llm-usage-costs.test.ts
import { describe, expect, it } from 'vitest';
import { resolveUsageLogCostBreakdown } from './llm-usage-costs';

describe('resolveUsageLogCostBreakdown', () => {
	it('keeps stored costs when they are present', () => {
		const result = resolveUsageLogCostBreakdown({
			model_used: 'qwen/qwen3.5-flash-20260224',
			model_requested: 'qwen/qwen3.5-flash-02-23',
			prompt_tokens: 1_000,
			completion_tokens: 500,
			input_cost_usd: 0.001,
			output_cost_usd: 0.002,
			total_cost_usd: 0.003
		});

		expect(result.inputCost).toBe(0.001);
		expect(result.outputCost).toBe(0.002);
		expect(result.totalCost).toBe(0.003);
		expect(result.wasEstimated).toBe(false);
	});

	it('prefers OpenRouter usage cost when available', () => {
		const result = resolveUsageLogCostBreakdown({
			model_used: 'x-ai/grok-4.1-fast',
			model_requested: 'x-ai/grok-4.1-fast',
			prompt_tokens: 10_000,
			completion_tokens: 1_000,
			input_cost_usd: 0.002,
			output_cost_usd: 0.0005,
			total_cost_usd: 0.0025,
			openrouter_usage_cost_usd: 0.0018
		});

		expect(result.inputCost).toBe(0.002);
		expect(result.outputCost).toBe(0.0005);
		expect(result.totalCost).toBe(0.0018);
		expect(result.wasEstimated).toBe(false);
	});

	it('recomputes zero-cost provider aliases from the requested model fallback', () => {
		const result = resolveUsageLogCostBreakdown({
			model_used: 'qwen/qwen3.5-flash-20260224',
			model_requested: 'qwen/qwen3.5-flash-02-23',
			prompt_tokens: 29_537,
			completion_tokens: 313,
			total_cost_usd: 0
		});

		expect(result.pricingModel).toBe('qwen/qwen3.5-flash-02-23');
		expect(result.inputCost).toBeGreaterThan(0);
		expect(result.outputCost).toBeGreaterThan(0);
		expect(result.totalCost).toBeCloseTo(result.inputCost + result.outputCost);
		expect(result.wasEstimated).toBe(true);
	});

	it('uses metadata model attempts as a final pricing fallback', () => {
		const result = resolveUsageLogCostBreakdown({
			model_used: 'provider/unknown-snapshot',
			model_requested: 'provider/unknown-request',
			prompt_tokens: 1_000,
			completion_tokens: 500,
			total_cost_usd: 0,
			metadata: {
				modelsAttempted: ['qwen/qwen3-32b']
			}
		});

		expect(result.pricingModel).toBe('qwen/qwen3-32b');
		expect(result.totalCost).toBeCloseTo(0.0002);
		expect(result.wasEstimated).toBe(true);
	});
});
