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

	it('persists OpenRouter-native accounting fields when provided', async () => {
		const insert = vi.fn(async () => ({ error: null }));
		const logger = new LLMUsageLogger({
			supabase: {
				from: vi.fn(() => ({ insert }))
			} as any
		});

		await logger.logUsageToDatabase({
			userId: '11111111-1111-4111-8111-111111111111',
			operationType: 'agentic_chat_v2_stream',
			modelRequested: 'x-ai/grok-4.1-fast',
			modelUsed: 'x-ai/grok-4.1-fast',
			promptTokens: 1000,
			completionTokens: 500,
			totalTokens: 1500,
			inputCost: 0.0001,
			outputCost: 0.0002,
			totalCost: 0.0003,
			responseTimeMs: 100,
			requestStartedAt: new Date('2026-04-11T15:36:50.000Z'),
			requestCompletedAt: new Date('2026-04-11T15:36:55.000Z'),
			status: 'success',
			openrouterRequestId: 'gen-test',
			openrouterCacheStatus: '40% cache hit',
			reasoningTokens: 125,
			cachedPromptTokens: 400,
			cacheWriteTokens: 25,
			openrouterUsageCost: 0.0003,
			openrouterByok: true,
			openrouterUpstreamInferenceCost: 0.00027
		});

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			openrouter_request_id: 'gen-test',
			openrouter_cache_status: '40% cache hit',
			reasoning_tokens: 125,
			cached_prompt_tokens: 400,
			cache_write_tokens: 25,
			openrouter_usage_cost_usd: 0.0003,
			openrouter_byok: true,
			openrouter_upstream_inference_cost_usd: 0.00027
		});
	});

	it('clears retryable foreign-key columns until usage logging succeeds', async () => {
		const insert = vi
			.fn()
			.mockResolvedValueOnce({
				error: {
					code: '23503',
					details:
						'Key (project_id)=(22222222-2222-4222-8222-222222222222) is not present in table "projects".',
					message:
						'insert or update on table "llm_usage_logs" violates foreign key constraint "llm_usage_logs_project_id_fkey"'
				}
			})
			.mockResolvedValueOnce({
				error: {
					code: '23503',
					details:
						'Key (brief_id)=(33333333-3333-4333-8333-333333333333) is not present in table "daily_briefs".',
					message:
						'insert or update on table "llm_usage_logs" violates foreign key constraint "llm_usage_logs_brief_id_fkey"'
				}
			})
			.mockResolvedValueOnce({ error: null });
		const logger = new LLMUsageLogger({
			supabase: {
				from: vi.fn(() => ({ insert }))
			} as any
		});

		await logger.logUsageToDatabase({
			userId: '11111111-1111-4111-8111-111111111111',
			operationType: 'daily_brief_project_brief',
			modelRequested: 'deepseek/deepseek-v3.2',
			modelUsed: 'deepseek/deepseek-v3.2',
			promptTokens: 1000,
			completionTokens: 500,
			totalTokens: 1500,
			inputCost: 0.0001,
			outputCost: 0.0002,
			totalCost: 0.0003,
			responseTimeMs: 100,
			requestStartedAt: new Date('2026-04-11T15:36:50.000Z'),
			requestCompletedAt: new Date('2026-04-11T15:36:55.000Z'),
			status: 'success',
			projectId: '22222222-2222-4222-8222-222222222222',
			briefId: '33333333-3333-4333-8333-333333333333'
		});

		expect(insert).toHaveBeenCalledTimes(3);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			project_id: '22222222-2222-4222-8222-222222222222',
			brief_id: '33333333-3333-4333-8333-333333333333'
		});
		expect(insert.mock.calls[1]?.[0]).toMatchObject({
			project_id: null,
			brief_id: '33333333-3333-4333-8333-333333333333'
		});
		expect(insert.mock.calls[2]?.[0]).toMatchObject({
			project_id: null,
			brief_id: null
		});
	});

	it('does not estimate a nonzero total when OpenRouter reports a zero native cost', async () => {
		const insert = vi.fn(async () => ({ error: null }));
		const logger = new LLMUsageLogger({
			supabase: {
				from: vi.fn(() => ({ insert }))
			} as any
		});

		await logger.logUsageToDatabase({
			userId: '11111111-1111-4111-8111-111111111111',
			operationType: 'agentic_chat_v2_stream',
			modelRequested: 'x-ai/grok-4.1-fast',
			modelUsed: 'x-ai/grok-4.1-fast',
			promptTokens: 1000,
			completionTokens: 500,
			totalTokens: 1500,
			inputCost: 0,
			outputCost: 0,
			totalCost: 0,
			responseTimeMs: 100,
			requestStartedAt: new Date('2026-04-11T15:36:50.000Z'),
			requestCompletedAt: new Date('2026-04-11T15:36:55.000Z'),
			status: 'success',
			openrouterUsageCost: 0,
			openrouterByok: true
		});

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]?.[0]).toMatchObject({
			input_cost_usd: 0,
			output_cost_usd: 0,
			total_cost_usd: 0,
			openrouter_usage_cost_usd: 0,
			openrouter_byok: true
		});
	});
});
