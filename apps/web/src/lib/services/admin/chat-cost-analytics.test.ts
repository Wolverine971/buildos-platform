// apps/web/src/lib/services/admin/chat-cost-analytics.test.ts
import { describe, expect, it } from 'vitest';
import { buildChatCostAnalytics } from './chat-cost-analytics';

describe('buildChatCostAnalytics', () => {
	it('aggregates exact and inferred LLM usage by session, turn, and model', () => {
		const analytics = buildChatCostAnalytics({
			users: [{ id: 'user-1', email: 'writer@example.com' }],
			sessions: [
				{
					id: 'session-1',
					user_id: 'user-1',
					title: 'Novel planning',
					context_type: 'project',
					created_at: '2026-04-10T10:00:00.000Z',
					users: { id: 'user-1', email: 'writer@example.com' }
				}
			],
			turnRuns: [
				{
					id: 'turn-1',
					session_id: 'session-1',
					user_id: 'user-1',
					request_message: 'Start the outline',
					started_at: '2026-04-10T10:00:00.000Z',
					finished_at: '2026-04-10T10:00:10.000Z',
					llm_pass_count: 1
				},
				{
					id: 'turn-2',
					session_id: 'session-1',
					user_id: 'user-1',
					request_message: 'Expand chapter two with more scene detail',
					started_at: '2026-04-10T10:01:00.000Z',
					finished_at: '2026-04-10T10:01:30.000Z',
					llm_pass_count: 2
				},
				{
					id: 'turn-3',
					session_id: 'session-1',
					user_id: 'user-1',
					request_message: 'Now rewrite the whole plan with every prior note included',
					started_at: '2026-04-10T10:02:00.000Z',
					finished_at: '2026-04-10T10:02:40.000Z',
					llm_pass_count: 1
				}
			],
			usageRows: [
				{
					id: 'usage-1',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					turn_run_id: 'turn-1',
					model_used: 'openai/gpt-4o-mini',
					prompt_tokens: 100,
					completion_tokens: 50,
					total_tokens: 150,
					input_cost_usd: 0.004,
					output_cost_usd: 0.006,
					total_cost_usd: 0.01,
					created_at: '2026-04-10T10:00:05.000Z'
				},
				{
					id: 'usage-2',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					model_used: 'openai/gpt-4o-mini',
					prompt_tokens: 500,
					completion_tokens: 100,
					total_tokens: 600,
					input_cost_usd: 0.03,
					output_cost_usd: 0.02,
					total_cost_usd: 0.05,
					request_started_at: '2026-04-10T10:01:05.000Z',
					created_at: '2026-04-10T10:01:08.000Z'
				},
				{
					id: 'usage-3',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					turn_run_id: 'turn-2',
					model_used: 'anthropic/claude-sonnet-4.6',
					prompt_tokens: 700,
					completion_tokens: 200,
					total_tokens: 900,
					input_cost_usd: 0.04,
					output_cost_usd: 0.06,
					total_cost_usd: 0.1,
					created_at: '2026-04-10T10:01:20.000Z'
				},
				{
					id: 'usage-4',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					turn_run_id: 'turn-3',
					model_used: 'anthropic/claude-sonnet-4.6',
					prompt_tokens: 2_000,
					completion_tokens: 500,
					total_tokens: 2_500,
					input_cost_usd: 0.2,
					output_cost_usd: 0.1,
					total_cost_usd: 0.3,
					created_at: '2026-04-10T10:02:20.000Z'
				}
			]
		});

		expect(analytics.overview.total_cost).toBeCloseTo(0.46);
		expect(analytics.overview.turn_count).toBe(3);
		expect(analytics.overview.attributed_cost).toBeCloseTo(0.41);
		expect(analytics.overview.inferred_cost).toBeCloseTo(0.05);

		expect(analytics.top_turns[0]).toMatchObject({
			turn_run_id: 'turn-3',
			turn_index: 3,
			primary_model: 'anthropic/claude-sonnet-4.6',
			cost: 0.3
		});
		expect(analytics.top_turns[0]?.prompt_preview).toContain('rewrite the whole plan');

		expect(analytics.cost_by_turn_index.map((entry) => entry.avg_cost)).toEqual([
			0.01, 0.15000000000000002, 0.3
		]);
		expect(analytics.growth_summary.shape).toBe('compounding');

		const claude = analytics.by_model.find(
			(model) => model.model === 'anthropic/claude-sonnet-4.6'
		);
		expect(claude?.turn_count).toBe(2);
		expect(claude?.avg_cost_per_turn).toBeCloseTo(0.2);

		expect(analytics.top_sessions[0]).toMatchObject({
			id: 'session-1',
			turn_count: 3,
			max_turn_index: 3,
			primary_model: 'anthropic/claude-sonnet-4.6'
		});
	});

	it('keeps session cost while flagging rows that cannot be attributed to a turn', () => {
		const analytics = buildChatCostAnalytics({
			users: [{ id: 'user-1', email: 'founder@example.com' }],
			sessions: [
				{
					id: 'session-1',
					user_id: 'user-1',
					title: 'Quick chat',
					created_at: '2026-04-10T10:00:00.000Z',
					users: { id: 'user-1', email: 'founder@example.com' }
				}
			],
			turnRuns: [
				{
					id: 'turn-1',
					session_id: 'session-1',
					request_message: 'Hello',
					started_at: '2026-04-10T10:00:00.000Z',
					finished_at: '2026-04-10T10:00:05.000Z'
				}
			],
			usageRows: [
				{
					id: 'usage-1',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					model_used: 'openai/gpt-4o-mini',
					total_tokens: 10,
					total_cost_usd: 0.02,
					created_at: '2026-04-10T09:59:00.000Z'
				}
			]
		});

		expect(analytics.overview.total_cost).toBeCloseTo(0.02);
		expect(analytics.overview.turn_count).toBe(0);
		expect(analytics.overview.avg_cost_per_turn).toBe(0);
		expect(analytics.overview.unattributed_cost).toBeCloseTo(0.02);
		expect(analytics.top_sessions[0]?.unattributed_cost).toBeCloseTo(0.02);
		expect(analytics.by_model[0]?.unattributed_cost).toBeCloseTo(0.02);
		expect(analytics.by_model[0]?.avg_cost_per_turn).toBe(0);
		expect(analytics.top_turns).toEqual([]);
	});
});
