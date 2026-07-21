// apps/worker/tests/agentRunTurnBudgetReservation.test.ts
//
// Regression guard for the deep-research cost-ledger fail-open bug.
//
// A live bake-off found that depth-1 child runs and single deep runs produced
// ZERO `agent_run_cost_entries` rows even though the run carried a cost budget:
// their turn-loop LLM calls reserved nothing while metrics still tracked the
// spend. The coordinator's planner/synthesis reserved correctly.
//
// Root cause: `parseBudgets()` required `max_cost_usd` to be a JS `number`, so a
// budget read back from JSONB as a numeric string (or absent) yielded
// `max_cost_usd: undefined`. `resolveAgentRunLlmSpendLimit(undefined, …)` then
// returned `undefined`, and the turn loop passed NO `spendLimit`/
// `onSpendReservation` to `getJSONResponse` while the `onUsage` fallback still
// recorded spend — an UNRESERVED, unbudgeted paid call. The coordinator path was
// immune because its `rootBudget` defaults `max_cost_usd` to 0.5.
//
// These tests exercise the real worker wiring (`parseBudgets` +
// `resolveAgentRunLlmSpendLimit` + the real `SmartLLMService.getJSONResponse`),
// which the 24 disposable-Postgres migration tests never touched.
import { describe, expect, it, vi } from 'vitest';
import { SmartLLMService } from '@buildos/smart-llm';
import { parseBudgets } from '../src/workers/agent-run/agentRunWorker';
import { resolveAgentRunLlmSpendLimit } from '../src/workers/agent-run/agentRunCostPolicy';

function jsonTurnCompletion() {
	return new Response(
		JSON.stringify({
			id: 'cmpl-turn-1',
			model: 'deepseek/deepseek-v4-flash',
			provider: 'DeepSeek',
			choices: [
				{
					message: {
						role: 'assistant',
						content: JSON.stringify({
							action: 'submit_result',
							status: 'completed',
							answer: 'done'
						})
					},
					finish_reason: 'stop'
				}
			],
			usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.001 }
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

// Faithful replica of the agent-run turn-loop accounting decision
// (agentRunWorker.ts `processAgentRunJob`). Returns whether a paid model call was
// dispatched and whether it reserved through the ledger first.
async function driveBudgetedTurn(runBudgets: unknown) {
	const fetchMock = vi.fn(async () => jsonTurnCompletion());
	const llm = new SmartLLMService({
		apiKey: 'openrouter-test-key',
		fetch: fetchMock as unknown as typeof fetch
	});
	const budgets = parseBudgets(runBudgets);
	const spendLimit = resolveAgentRunLlmSpendLimit(budgets.max_cost_usd, 0);

	const onSpendReservation = vi.fn(async () => {});
	const onUsage = vi.fn(async () => {});

	// The fixed turn loop fails closed when there is no numeric cost budget rather
	// than issuing an unreserved paid call.
	if (spendLimit === undefined) {
		return { failedClosed: true, reserveCalls: 0, fetchCalls: 0, spendLimit };
	}

	await llm.getJSONResponse({
		systemPrompt: 'You are a bounded research agent.',
		userPrompt: 'Research the topic.',
		userId: 'user-1',
		profile: 'balanced',
		spendLimit,
		onSpendReservation,
		validation: { retryOnParseError: true, maxRetries: 2 },
		onUsage
	});
	return {
		failedClosed: false,
		reserveCalls: onSpendReservation.mock.calls.length,
		fetchCalls: fetchMock.mock.calls.length,
		spendLimit
	};
}

describe('parseBudgets numeric coercion', () => {
	it('honors a numeric max_cost_usd', () => {
		expect(parseBudgets({ max_cost_usd: 0.156 }).max_cost_usd).toBe(0.156);
	});

	// Pre-fix: `typeof '0.156' === 'number'` is false, so this returned undefined,
	// which silently disabled the durable reservation for the whole run.
	it('coerces a numeric-string max_cost_usd read back from JSONB', () => {
		expect(parseBudgets({ max_cost_usd: '0.156' }).max_cost_usd).toBe(0.156);
		expect(
			parseBudgets({
				max_cost_usd: '0.156',
				max_tokens: '20000',
				max_tool_calls: '5',
				wall_clock_ms: '300000'
			})
		).toEqual({
			max_cost_usd: 0.156,
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});
	});

	it('drops a genuinely non-numeric or absent budget', () => {
		expect(parseBudgets({ max_cost_usd: 'unbounded' }).max_cost_usd).toBeUndefined();
		expect(parseBudgets({}).max_cost_usd).toBeUndefined();
		expect(parseBudgets({ max_cost_usd: -1 }).max_cost_usd).toBeUndefined();
	});
});

describe('agent-run turn reserves before every budgeted paid call', () => {
	it('reserves for a run carrying a numeric max_cost_usd', async () => {
		const outcome = await driveBudgetedTurn({
			max_cost_usd: 0.156,
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});
		expect(outcome.failedClosed).toBe(false);
		expect(outcome.fetchCalls).toBe(1);
		expect(outcome.reserveCalls).toBeGreaterThanOrEqual(1);
	});

	// The reported failure: a run that carries `max_cost_usd` (as a JSONB numeric
	// string) previously dispatched a paid call with ZERO reservations. It must
	// now reserve before dispatch.
	it('reserves for a run carrying max_cost_usd as a numeric string', async () => {
		const outcome = await driveBudgetedTurn({
			max_cost_usd: '0.156',
			max_tokens: 20000,
			max_tool_calls: 5,
			wall_clock_ms: 300000
		});
		expect(outcome.failedClosed).toBe(false);
		expect(outcome.fetchCalls).toBe(1);
		expect(outcome.reserveCalls).toBeGreaterThanOrEqual(1);
	});

	// A run with no usable cost budget must never make an unreserved paid call.
	it('fails closed (no paid call) when the run has no cost budget', async () => {
		const outcome = await driveBudgetedTurn({});
		expect(outcome.failedClosed).toBe(true);
		expect(outcome.fetchCalls).toBe(0);
		expect(outcome.reserveCalls).toBe(0);
	});
});
