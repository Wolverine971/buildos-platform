// apps/web/src/lib/server/agent-runs/dispatch.test.ts
import { describe, expect, it } from 'vitest';
import {
	MAX_AGENT_RUN_COST_USD,
	MAX_AGENT_RUN_TOKENS,
	MAX_AGENT_RUN_TOOL_CALLS,
	MAX_AGENT_RUN_WALL_CLOCK_MS,
	dispatchAgentRun,
	normalizeAgentRunBudgets,
	resolveAgentRunEffortBudgets
} from './dispatch';

describe('agent run effort and cost budgets', () => {
	it('defaults deep runs to $0.50 and gives standard runs a default cost ceiling', () => {
		expect(resolveAgentRunEffortBudgets('deep', undefined)).toEqual({
			budgets: { max_cost_usd: 0.5 }
		});
		// Every run must carry a cost ceiling so the worker ledger engages.
		expect(resolveAgentRunEffortBudgets('standard', undefined)).toEqual({
			budgets: { max_cost_usd: 0.5 }
		});
		// An explicit standard budget is preserved, not overridden.
		expect(resolveAgentRunEffortBudgets('standard', { max_cost_usd: 2 })).toEqual({
			budgets: { max_cost_usd: 2 }
		});
	});

	it('clamps unbounded manual budget fields on every run', () => {
		expect(
			normalizeAgentRunBudgets({ wall_clock_ms: MAX_AGENT_RUN_WALL_CLOCK_MS + 1 }).error
		).toContain('wall_clock_ms cannot exceed');
		expect(
			normalizeAgentRunBudgets({ max_tool_calls: MAX_AGENT_RUN_TOOL_CALLS + 1 }).error
		).toContain('max_tool_calls cannot exceed');
		expect(normalizeAgentRunBudgets({ max_tokens: MAX_AGENT_RUN_TOKENS + 1 }).error).toContain(
			'max_tokens cannot exceed'
		);
		// At-ceiling values are accepted.
		expect(
			normalizeAgentRunBudgets({
				wall_clock_ms: MAX_AGENT_RUN_WALL_CLOCK_MS,
				max_tool_calls: MAX_AGENT_RUN_TOOL_CALLS,
				max_tokens: MAX_AGENT_RUN_TOKENS
			}).error
		).toBeUndefined();
	});

	it('accepts a lower explicit deep budget and rejects budgets over $1', () => {
		expect(resolveAgentRunEffortBudgets('deep', { max_cost_usd: 0.25 })).toEqual({
			budgets: { max_cost_usd: 0.25 }
		});
		expect(resolveAgentRunEffortBudgets('deep', { max_cost_usd: 1.01 }).error).toContain(
			'cannot exceed'
		);
	});

	it('reserves durable defaults and enforces a minimum for deep research', () => {
		expect(resolveAgentRunEffortBudgets('deep', undefined, 'deep_research')).toEqual({
			budgets: {
				max_cost_usd: 0.5,
				wall_clock_ms: 600_000,
				max_tokens: 60_000,
				max_tool_calls: 10
			}
		});
		expect(
			resolveAgentRunEffortBudgets('deep', { max_cost_usd: 0.24 }, 'deep_research').error
		).toContain('at least');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, max_tool_calls: 3 },
				'deep_research'
			).error
		).toContain('at least 4 tool calls');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, max_tokens: 11_999 },
				'deep_research'
			).error
		).toContain('at least 12000 tokens');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, max_tool_calls: 41 },
				'deep_research'
			).error
		).toContain('cannot exceed 40 tool calls');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, max_tokens: 100_001 },
				'deep_research'
			).error
		).toContain('cannot exceed 100000 tokens');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, wall_clock_ms: 1_200_001 },
				'deep_research'
			).error
		).toContain('cannot exceed 1200000ms');
		expect(
			resolveAgentRunEffortBudgets(
				'deep',
				{ max_cost_usd: 0.5, wall_clock_ms: 0 },
				'deep_research'
			).error
		).toContain('positive wall-clock budget');
	});

	it('validates the platform-wide manual budget ceiling', () => {
		expect(normalizeAgentRunBudgets({ max_cost_usd: MAX_AGENT_RUN_COST_USD })).toEqual({
			budgets: { max_cost_usd: MAX_AGENT_RUN_COST_USD }
		});
		expect(
			normalizeAgentRunBudgets({ max_cost_usd: MAX_AGENT_RUN_COST_USD + 0.01 }).error
		).toContain('cannot exceed');
	});
});

describe('dispatchAgentRun atomic admission', () => {
	function fakeAdmin(options: {
		activeCount?: number;
		rpcResult?: { data: unknown; error: { message: string } | null };
	}) {
		const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
		const admin = {
			from(_table: string) {
				return {
					select() {
						return {
							eq() {
								return {
									in: async () => ({
										count: options.activeCount ?? 0,
										error: null
									})
								};
							}
						};
					}
				};
			},
			rpc: async (fn: string, args: Record<string, unknown>) => {
				rpcCalls.push({ fn, args });
				if (fn === 'create_agent_run_with_job') {
					return (
						options.rpcResult ?? {
							data: { run: { id: 'run-1', status: 'queued' }, job_id: 'job-1' },
							error: null
						}
					);
				}
				return { data: null, error: null };
			}
		};
		return { admin: admin as never, rpcCalls };
	}

	it('creates the run and queue job through one atomic RPC', async () => {
		const { admin, rpcCalls } = fakeAdmin({});
		const outcome = await dispatchAgentRun({
			userId: '00000000-0000-4000-8000-000000000001',
			goal: 'Summarize project state',
			admin
		});

		expect(outcome.ok).toBe(true);
		const createCall = rpcCalls.find((call) => call.fn === 'create_agent_run_with_job');
		expect(createCall).toBeDefined();
		const runPayload = createCall!.args.p_run as Record<string, unknown>;
		expect(runPayload.user_id).toBe('00000000-0000-4000-8000-000000000001');
		expect(runPayload.goal).toBe('Summarize project state');
		// No separate add_queue_job call — atomicity lives in the RPC
		expect(rpcCalls.some((call) => call.fn === 'add_queue_job')).toBe(false);
	});

	it('maps a trigger capacity raise to RATE_LIMITED', async () => {
		const { admin } = fakeAdmin({
			rpcResult: {
				data: null,
				error: {
					message: 'agent_run_limit_exceeded: user already has 3 active agent runs'
				}
			}
		});
		const outcome = await dispatchAgentRun({
			userId: '00000000-0000-4000-8000-000000000001',
			goal: 'One run too many',
			admin
		});

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(429);
			expect(outcome.code).toBe('RATE_LIMITED');
		}
	});

	it('still fast-fails on the friendly pre-check when already at the cap', async () => {
		const { admin, rpcCalls } = fakeAdmin({ activeCount: 3 });
		const outcome = await dispatchAgentRun({
			userId: '00000000-0000-4000-8000-000000000001',
			goal: 'Blocked before any write',
			admin
		});

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(429);
		}
		expect(rpcCalls).toHaveLength(0);
	});
});
