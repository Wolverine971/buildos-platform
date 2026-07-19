// apps/web/src/lib/server/agent-runs/dispatch.test.ts
import { describe, expect, it } from 'vitest';
import {
	MAX_AGENT_RUN_COST_USD,
	normalizeAgentRunBudgets,
	resolveAgentRunEffortBudgets
} from './dispatch';

describe('agent run effort and cost budgets', () => {
	it('defaults deep runs to $0.50 without changing standard runs', () => {
		expect(resolveAgentRunEffortBudgets('deep', undefined)).toEqual({
			budgets: { max_cost_usd: 0.5 }
		});
		expect(resolveAgentRunEffortBudgets('standard', undefined)).toEqual({ budgets: {} });
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
