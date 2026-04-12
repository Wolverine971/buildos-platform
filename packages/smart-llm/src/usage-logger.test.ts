// packages/smart-llm/src/usage-logger.test.ts
import { describe, expect, it, vi } from 'vitest';
import { LLMUsageLogger } from './usage-logger';

describe('LLMUsageLogger', () => {
	it('recomputes zero costs when a provider model alias maps to configured pricing', async () => {
		const insert = vi.fn(async () => ({ error: null }));
		const logger = new LLMUsageLogger({
			supabase: {
				from: vi.fn(() => ({ insert }))
			} as any
		});

		await logger.logUsageToDatabase({
			userId: '11111111-1111-4111-8111-111111111111',
			operationType: 'agent_state_reconciliation',
			modelRequested: 'deepseek/deepseek-v3.2',
			modelUsed: 'deepseek/deepseek-v3.2-20251201',
			promptTokens: 1000,
			completionTokens: 500,
			totalTokens: 1500,
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
			responseTimeMs: 100,
			requestStartedAt: new Date('2026-04-11T15:36:50.000Z'),
			requestCompletedAt: new Date('2026-04-11T15:36:55.000Z'),
			status: 'success'
		});

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			model_requested: 'deepseek/deepseek-v3.2',
			model_used: 'deepseek/deepseek-v3.2-20251201',
			prompt_tokens: 1000,
			completion_tokens: 500,
			total_tokens: 1500
		});
		expect(insert.mock.calls[0]?.[0]?.input_cost_usd).toBeCloseTo(0.00026);
		expect(insert.mock.calls[0]?.[0]?.output_cost_usd).toBeCloseTo(0.00019);
		expect(insert.mock.calls[0]?.[0]?.total_cost_usd).toBeCloseTo(0.00045);
	});
});
