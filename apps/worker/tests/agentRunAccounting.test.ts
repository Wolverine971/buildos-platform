// apps/worker/tests/agentRunAccounting.test.ts
import { beforeEach, expect, it, vi } from 'vitest';
import type { JSONSpendReservationEvent, JSONUsageEvent } from '@buildos/smart-llm';
import type { AgentRunRow } from '../src/workers/agent-run/agentRunLifecycle';
import type { PaidToolCharge } from '../src/workers/agent-run/webResearchPort';

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), settle: vi.fn(), usage: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/workers/agent-run/agentRunJournal', () => ({ emitEvent: vi.fn() }));
vi.mock('@buildos/smart-llm', () => ({
	LLMUsageLogger: class {
		logUsageToDatabase = mocks.usage;
	}
}));
vi.mock('../src/workers/agent-run/agentRunCostLedger', async (importOriginal) => ({
	...(await importOriginal<object>()),
	reserveAgentRunCost: mocks.reserve,
	settleAgentRunCost: mocks.settle
}));
import { createAgentRunAccounting } from '../src/workers/agent-run/agentRunAccounting';

const reservation: JSONSpendReservationEvent = {
	model: 'offline-test-model',
	provider: 'openrouter',
	maxTokens: 100,
	estimatedInputTokens: 200,
	reservedCostUsd: 0.04,
	providerMaxPrice: { prompt: 1, completion: 1, request: 0 }
};
const usage: JSONUsageEvent = {
	model: 'offline-test-model',
	promptTokens: 200,
	completionTokens: 100,
	totalTokens: 300,
	inputCost: 0.01,
	outputCost: 0.01,
	totalCost: 0.02,
	costSource: 'provider_reported',
	billingDisposition: 'settled'
};
const charge: PaidToolCharge = {
	provider: 'tavily',
	credits: 2,
	unit_cost_usd: 0.008,
	cost_usd: 0.016,
	source: 'search_depth_fallback'
};
function accounting(assertOwnership = vi.fn(async () => {})) {
	return createAgentRunAccounting({
		run: { id: 'run-1', user_id: 'user-1', project_id: null } as AgentRunRow,
		jobId: 'job-1',
		maxCostUsd: 1,
		assertOwnership
	});
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.reserve.mockResolvedValue({
		id: 'entry-1',
		provider: 'tavily',
		reserved_cost_usd: 0.016
	});
	mocks.settle.mockResolvedValue({ id: 'entry-1', status: 'settled' });
	mocks.usage.mockResolvedValue(undefined);
});

it('blocks both paid dispatch paths when the executor loses ownership', async () => {
	const a = accounting(
		vi.fn(async () => {
			throw new Error('superseded');
		})
	);
	a.beginTool('search-1');
	await expect(a.onSearchDispatched(charge)).rejects.toThrow('superseded');
	await expect(
		a.createLlmAccountingHooks('turn-1', 'agent_run.turn').onSpendReservation(reservation)
	).rejects.toThrow('superseded');
	expect(mocks.reserve).not.toHaveBeenCalled();
});

it('preserves model usage even when settlement requires a retry', async () => {
	const a = accounting();
	const hooks = a.createLlmAccountingHooks('turn-1', 'agent_run.turn');
	await hooks.onSpendReservation(reservation);
	expect(mocks.reserve).toHaveBeenCalledWith(
		expect.objectContaining({
			attemptKey: 'turn-1',
			requireNewAttempt: true,
			reservedUnits: 300
		})
	);
	mocks.settle.mockRejectedValueOnce(new Error('ledger unavailable'));
	await expect(hooks.onUsage(usage)).rejects.toThrow('ledger unavailable');
	expect(a.totals).toMatchObject({ tokens: 300, cost: 0.02, llmCost: 0.02 });
});

it('settles web charges once and publishes the same cost to usage analytics', async () => {
	const a = accounting();
	a.beginTool('search-1');
	await a.onSearchDispatched(charge);
	a.endToolDispatch();
	expect(a.totals.cost).toBe(0.016);
	await a.finishTool(Date.now(), {
		ok: true,
		op: 'util.web.search',
		data: {
			info: {
				billing: { ...charge, credits: 1, cost_usd: 0.008, source: 'provider_reported' }
			}
		}
	});
	expect(a.totals).toMatchObject({ cost: 0.008, paidToolCost: 0.008, tavilyCredits: 1 });
	expect(mocks.settle).toHaveBeenCalledWith(
		expect.objectContaining({ attemptKey: 'search-1', status: 'settled', actualCostUsd: 0.008 })
	);
	expect(mocks.usage).toHaveBeenCalledWith(
		expect.objectContaining({
			operationType: 'agent_run_web_search',
			provider: 'tavily',
			totalTokens: 0,
			totalCost: 0.008
		})
	);
	a.beginTool(null); // a later free visit does not settle the previous search again
	await a.finishTool(Date.now(), { ok: true, op: 'util.web.visit', data: {} });
	expect(mocks.settle).toHaveBeenCalledTimes(1);
});

it('keeps uncertain search cost reserved and surfaces settlement failures', async () => {
	const a = accounting();
	a.beginTool('search-1');
	await a.onSearchDispatched(charge);
	a.endToolDispatch();
	mocks.settle.mockRejectedValueOnce(new Error('ledger unavailable'));
	await a.finishTool(Date.now(), {
		ok: false,
		op: 'util.web.search',
		error: { code: 'EXECUTION_ERROR', message: 'timeout' }
	});
	expect(a.totals.cost).toBe(0.016);
	expect(a.failure?.message).toContain('ledger unavailable');
	expect(mocks.settle).toHaveBeenCalledWith(
		expect.objectContaining({ status: 'reconciliation_required', actualCostUsd: undefined })
	);
});
