// apps/web/src/lib/server/admin-chat-dashboard-analytics.test.ts
import { describe, expect, it } from 'vitest';
import { buildAdminChatDashboardAnalytics } from './admin-chat-dashboard-analytics';

describe('buildAdminChatDashboardAnalytics', () => {
	it('aggregates current chat telemetry from turn, usage, tool, and message rows', () => {
		const result = buildAdminChatDashboardAnalytics({
			startIso: '2026-04-01T00:00:00.000Z',
			endIso: '2026-04-08T00:00:00.000Z',
			timeframe: '7d',
			sessions: [
				{
					id: 'session-1',
					user_id: 'user-1',
					status: 'active',
					context_type: 'project',
					created_at: '2026-04-01T10:00:00.000Z',
					updated_at: '2026-04-01T10:02:00.000Z',
					last_message_at: '2026-04-01T10:02:00.000Z'
				},
				{
					id: 'session-2',
					user_id: 'user-2',
					status: 'archived',
					context_type: 'global',
					created_at: '2026-03-25T10:00:00.000Z',
					updated_at: '2026-04-02T10:02:00.000Z',
					last_message_at: '2026-04-02T10:02:00.000Z'
				}
			],
			messages: [
				{
					id: 'message-1',
					session_id: 'session-1',
					user_id: 'user-1',
					role: 'user',
					content: 'Create a launch plan',
					total_tokens: 10,
					created_at: '2026-04-01T10:00:00.000Z'
				},
				{
					id: 'message-2',
					session_id: 'session-1',
					user_id: 'user-1',
					role: 'assistant',
					content: 'Done',
					total_tokens: 40,
					created_at: '2026-04-01T10:00:12.000Z'
				},
				{
					id: 'message-3',
					session_id: 'session-2',
					user_id: 'user-2',
					role: 'user',
					content: 'What changed?',
					total_tokens: 8,
					created_at: '2026-04-02T10:00:00.000Z'
				}
			],
			turnRuns: [
				{
					id: 'turn-1',
					session_id: 'session-1',
					user_id: 'user-1',
					context_type: 'project',
					status: 'completed',
					gateway_enabled: true,
					first_canonical_op: 'onto.plan.create',
					history_compressed: true,
					cache_source: 'metadata_cache',
					request_prewarmed_context: true,
					tool_call_count: 2,
					validation_failure_count: 0,
					llm_pass_count: 2,
					started_at: '2026-04-01T10:00:00.000Z',
					finished_at: '2026-04-01T10:00:12.000Z',
					created_at: '2026-04-01T10:00:00.000Z'
				},
				{
					id: 'turn-2',
					session_id: 'session-2',
					user_id: 'user-2',
					context_type: 'global',
					status: 'failed',
					gateway_enabled: false,
					first_help_path: 'help.search',
					history_compressed: false,
					cache_source: 'fresh_load',
					request_prewarmed_context: false,
					tool_call_count: 1,
					validation_failure_count: 1,
					llm_pass_count: 1,
					started_at: '2026-04-02T10:00:00.000Z',
					finished_at: '2026-04-02T10:00:30.000Z',
					created_at: '2026-04-02T10:00:00.000Z'
				}
			],
			previousTurnRuns: [{ id: 'previous-turn', status: 'completed' }],
			usageRows: [
				{
					id: 'usage-1',
					user_id: 'user-1',
					chat_session_id: 'session-1',
					turn_run_id: 'turn-1',
					operation_type: 'agentic_chat',
					model_used: 'openai/gpt-4o-mini',
					total_tokens: 1000,
					total_cost_usd: 0.01,
					response_time_ms: 1200,
					status: 'success',
					openrouter_cache_status: 'hit',
					created_at: '2026-04-01T10:00:10.000Z'
				},
				{
					id: 'usage-2',
					user_id: 'user-2',
					chat_session_id: 'session-2',
					turn_run_id: 'turn-2',
					operation_type: 'agentic_chat',
					model_used: 'openai/gpt-4o-mini',
					total_tokens: 500,
					total_cost_usd: 0.005,
					response_time_ms: 5000,
					status: 'failure',
					error_message: 'model failed',
					created_at: '2026-04-02T10:00:10.000Z'
				}
			],
			previousUsageRows: [{ total_tokens: 1000, total_cost_usd: 0.01 }],
			llmPassEvents: [
				{
					id: 'event-1',
					turn_run_id: 'turn-1',
					event_type: 'llm_pass_completed',
					payload: {
						model: 'openai/gpt-4o-mini',
						prompt_tokens: 800,
						completion_tokens: 200,
						total_tokens: 1000,
						cache_status: 'hit'
					},
					created_at: '2026-04-01T10:00:10.000Z'
				}
			],
			toolExecutions: [
				{
					id: 'tool-1',
					session_id: 'session-1',
					turn_run_id: 'turn-1',
					tool_name: 'tool_exec',
					gateway_op: 'onto.plan.create',
					success: true,
					execution_time_ms: 300,
					created_at: '2026-04-01T10:00:04.000Z'
				},
				{
					id: 'tool-2',
					session_id: 'session-2',
					turn_run_id: 'turn-2',
					tool_name: 'tool_exec',
					gateway_op: 'help.search',
					success: false,
					error_message: 'bad args',
					execution_time_ms: 100,
					created_at: '2026-04-02T10:00:04.000Z'
				}
			],
			evalRuns: [
				{
					id: 'eval-1',
					turn_run_id: 'turn-1',
					scenario_slug: 'project.plan_create',
					status: 'passed',
					started_at: '2026-04-01T10:01:00.000Z',
					created_at: '2026-04-01T10:01:00.000Z'
				}
			],
			users: [
				{ id: 'user-1', email: 'one@example.com', name: 'One' },
				{ id: 'user-2', email: 'two@example.com', name: 'Two' }
			]
		});

		expect(result.kpis).toMatchObject({
			totalSessions: 2,
			newSessions: 1,
			activeSessions: 1,
			uniqueUsers: 2,
			totalMessages: 3,
			totalTurns: 2,
			completedTurns: 1,
			failedTurns: 1,
			totalTokensUsed: 1500,
			billableRequests: 2,
			billableCost: 0.015,
			toolCalls: 3,
			toolFailures: 1,
			validationFailures: 1,
			llmPasses: 3,
			p95TurnDurationMs: 30000,
			p95LlmResponseMs: 5000,
			cacheHitRate: 50
		});
		expect(result.kpis.turnTrend).toEqual({ direction: 'up', value: 100 });
		expect(result.kpis.costTrend).toEqual({ direction: 'up', value: 50 });
		expect(result.runtime_distribution.first_actions[0]).toMatchObject({
			label: 'help.search',
			count: 1
		});
		expect(result.top_users[0]).toMatchObject({
			user_id: 'user-1',
			email: 'one@example.com',
			session_count: 1,
			turn_count: 1,
			message_count: 2,
			total_cost: 0.01
		});
		expect(result.activity_feed.some((event) => event.type === 'tool_failed')).toBe(true);
		expect(result.data_health).toMatchObject({
			hasBillableUsage: true,
			hasTurnTelemetry: true
		});
	});

	it('falls back to estimated cost when billable logs are missing', () => {
		const result = buildAdminChatDashboardAnalytics({
			startIso: '2026-04-01T00:00:00.000Z',
			endIso: '2026-04-08T00:00:00.000Z',
			timeframe: '7d',
			sessions: [],
			messages: [],
			turnRuns: [
				{
					id: 'turn-1',
					session_id: 'session-1',
					user_id: 'user-1',
					status: 'completed',
					llm_pass_count: 1,
					started_at: '2026-04-01T10:00:00.000Z',
					finished_at: '2026-04-01T10:00:01.000Z'
				}
			],
			previousTurnRuns: [],
			usageRows: [],
			previousUsageRows: [],
			llmPassEvents: [
				{
					event_type: 'llm_pass_completed',
					payload: {
						model: 'openai/gpt-4o-mini',
						prompt_tokens: 1000,
						completion_tokens: 500,
						total_tokens: 1500
					}
				}
			],
			toolExecutions: [],
			evalRuns: [],
			users: [{ id: 'user-1', email: 'one@example.com' }]
		});

		expect(result.kpis.totalTokensUsed).toBe(1500);
		expect(result.kpis.estimatedCost).toBeGreaterThan(0);
		expect(result.kpis.isCostEstimated).toBe(true);
		expect(result.data_health.hasBillableUsage).toBe(false);
	});
});
