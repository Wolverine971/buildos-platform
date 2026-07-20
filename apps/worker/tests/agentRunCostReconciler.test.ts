// apps/worker/tests/agentRunCostReconciler.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgentRunCostEntry } from '../src/workers/agent-run/agentRunCostLedger';
import {
	ProviderCostLookupError,
	lookupOpenRouterGenerationCost,
	runAgentRunCostReconciliation
} from '../src/workers/agent-run/agentRunCostReconciler';

const NOW = new Date('2026-07-19T12:00:00.000Z');
const LOCK_TOKEN = '50000000-0000-4000-8000-000000000001';

function entry(overrides: Partial<AgentRunCostEntry> = {}): AgentRunCostEntry {
	return {
		id: '40000000-0000-4000-8000-000000000001',
		root_run_id: '10000000-0000-4000-8000-000000000001',
		leaf_run_id: '20000000-0000-4000-8000-000000000001',
		attempt_key: 'llm:job-1:turn:1',
		provider: 'openrouter',
		operation: 'agent.turn',
		resource: 'openai/gpt-5-mini',
		status: 'reserved',
		reserved_units: 2_000,
		actual_units: null,
		unit_type: 'tokens',
		reserved_cost_usd: 0.02,
		actual_cost_usd: null,
		provider_request_id: 'gen-1',
		metadata: {},
		reconciliation_attempts: 1,
		reconciliation_locked_at: NOW.toISOString(),
		reconciliation_lock_expires_at: '2026-07-19T12:02:00.000Z',
		reconciliation_lock_token: LOCK_TOKEN,
		reconciliation_completed_token: null,
		reconciliation_next_attempt_at: null,
		reconciliation_last_error: null,
		reconciliation_needs_operator_at: null,
		idempotent: false,
		...overrides
	};
}

describe('OpenRouter generation cost lookup', () => {
	it('returns authoritative provider cost and native token totals', async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: {
							id: 'gen-1',
							model: 'openai/gpt-5-mini',
							provider_name: 'OpenAI',
							total_cost: 0.0125,
							native_tokens_prompt: 700,
							native_tokens_completion: 300
						}
					}),
					{ status: 200 }
				)
		);

		const result = await lookupOpenRouterGenerationCost('gen-1', {
			apiKey: 'or-test',
			fetchFn: fetchFn as unknown as typeof fetch
		});

		expect(fetchFn).toHaveBeenCalledOnce();
		const [url, init] = fetchFn.mock.calls[0];
		expect(String(url)).toBe('https://openrouter.ai/api/v1/generation?id=gen-1');
		expect(init.headers).toEqual({ Authorization: 'Bearer or-test' });
		expect(result).toEqual({
			generationId: 'gen-1',
			totalCostUsd: 0.0125,
			totalTokens: 1_000,
			model: 'openai/gpt-5-mini',
			providerName: 'OpenAI'
		});
	});

	it('treats a not-yet-visible generation as retryable', async () => {
		const fetchFn = vi.fn(async () => new Response('', { status: 404 }));

		await expect(
			lookupOpenRouterGenerationCost('gen-late', {
				apiKey: 'or-test',
				fetchFn: fetchFn as unknown as typeof fetch
			})
		).rejects.toMatchObject({
			name: 'ProviderCostLookupError',
			retryable: true,
			status: 404
		} satisfies Partial<ProviderCostLookupError>);
	});
});

describe('Agent Run cost reconciliation batch', () => {
	it('settles OpenRouter from provider records and dead-letters unsupported Tavily lookup', async () => {
		const openRouter = entry();
		const tavily = entry({
			id: '40000000-0000-4000-8000-000000000002',
			attempt_key: 'tool:job-1:1:util.web.search',
			provider: 'tavily',
			resource: 'advanced',
			provider_request_id: 'tavily-request-1'
		});
		const claim = vi.fn(async () => [openRouter, tavily]);
		const reconcile = vi.fn(async () => ({ ...openRouter, status: 'settled' as const }));
		const release = vi.fn(async () => ({
			...tavily,
			reconciliation_lock_token: null,
			reconciliation_needs_operator_at: NOW.toISOString()
		}));
		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						data: {
							id: 'gen-1',
							total_cost: 0.01,
							tokens_prompt: 600,
							tokens_completion: 200
						}
					}),
					{ status: 200 }
				)
		);

		const result = await runAgentRunCostReconciliation({
			apiKey: 'or-test',
			fetchFn: fetchFn as unknown as typeof fetch,
			now: () => NOW,
			ledger: { claim, reconcile, release }
		});

		expect(result).toEqual({
			claimed: 2,
			settled: 1,
			retryScheduled: 0,
			needsOperator: 1,
			leaseConflicts: 0,
			errors: 0
		});
		expect(claim).toHaveBeenCalledWith({
			staleBefore: new Date('2026-07-19T11:50:00.000Z'),
			limit: 20,
			leaseSeconds: 120,
			maxAttempts: 8
		});
		expect(reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				entryId: openRouter.id,
				lockToken: LOCK_TOKEN,
				actualCostUsd: 0.01,
				actualUnits: 800,
				providerRequestId: 'gen-1'
			})
		);
		expect(release).toHaveBeenCalledWith(
			expect.objectContaining({
				entryId: tavily.id,
				retryable: false,
				error: expect.stringContaining('unsupported for provider tavily')
			})
		);
	});

	it('backs off retryable lookup failures and escalates the final attempt', async () => {
		const claim = vi.fn(async () => [entry({ reconciliation_attempts: 8 })]);
		const reconcile = vi.fn();
		const release = vi.fn(async () => entry());
		const fetchFn = vi.fn(async () => new Response('', { status: 429 }));

		const result = await runAgentRunCostReconciliation({
			apiKey: 'or-test',
			fetchFn: fetchFn as unknown as typeof fetch,
			now: () => NOW,
			maxAttempts: 8,
			ledger: { claim, reconcile, release }
		});

		expect(result.needsOperator).toBe(1);
		expect(result.retryScheduled).toBe(0);
		expect(reconcile).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledWith(
			expect.objectContaining({
				retryable: false,
				error: 'OpenRouter generation lookup returned HTTP 429.'
			})
		);
	});

	it('does not claim rows when the provider credential is missing', async () => {
		const claim = vi.fn();

		await expect(
			runAgentRunCostReconciliation({
				apiKey: ' ',
				now: () => NOW,
				ledger: {
					claim,
					reconcile: vi.fn(),
					release: vi.fn()
				}
			})
		).rejects.toThrow('requires PRIVATE_OPENROUTER_API_KEY');
		expect(claim).not.toHaveBeenCalled();
	});
});
