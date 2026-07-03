// apps/web/src/lib/server/admin-chat-user-analytics.test.ts
import { describe, expect, it } from 'vitest';
import {
	assertAdminChatUserAnalyticsRedacted,
	buildAdminChatUserAnalytics,
	type AdminChatUserAnalyticsQuery
} from './admin-chat-user-analytics';

const baseQuery: AdminChatUserAnalyticsQuery = {
	timeframe: '7d',
	page: 1,
	limit: 50,
	sort_by: 'last_activity_at',
	sort_order: 'desc',
	search: '',
	user_id: null,
	project_id: null,
	context_type: 'all',
	topic: '',
	slow_threshold_ms: 10_000,
	errors: 'all',
	tool_bucket: 'all',
	entity_action: 'all',
	classification: 'all'
};

describe('admin chat user analytics', () => {
	it('rolls up user performance without returning raw chat content', () => {
		const analytics = buildAdminChatUserAnalytics(
			{
				sessions: [
					{
						id: 'session-1',
						user_id: 'user-1',
						title: 'Launch planning',
						auto_title: 'Secret auto title should not matter',
						chat_topics: ['launch video', 'landing page'],
						context_type: 'project',
						entity_id: 'project-1',
						status: 'active',
						created_at: '2026-07-01T10:00:00.000Z',
						updated_at: '2026-07-01T10:20:00.000Z',
						last_message_at: '2026-07-01T10:20:00.000Z',
						last_classified_at: '2026-07-01T10:10:00.000Z',
						summary: 'SECRET TRANSCRIPT SUMMARY'
					} as any
				],
				users: [{ id: 'user-1', email: 'founder@example.com', name: 'Founder' }],
				sessionProjects: [{ chat_session_id: 'session-1', project_id: 'project-1' }],
				projects: [{ id: 'project-1', name: 'BuildOS Demo Campaign' }],
				messages: [
					{
						id: 'message-1',
						session_id: 'session-1',
						user_id: 'user-1',
						role: 'user',
						total_tokens: 20,
						created_at: '2026-07-01T10:01:00.000Z',
						content: 'SECRET USER MESSAGE'
					} as any,
					{
						id: 'message-2',
						session_id: 'session-1',
						user_id: 'user-1',
						role: 'assistant',
						total_tokens: 30,
						created_at: '2026-07-01T10:02:00.000Z',
						content: 'SECRET ASSISTANT MESSAGE'
					} as any,
					{
						id: 'message-3',
						session_id: 'session-1',
						user_id: 'user-1',
						role: 'assistant',
						error_message: 'stream interrupted',
						created_at: '2026-07-01T10:03:00.000Z'
					}
				],
				turnRuns: [
					{
						id: 'turn-1',
						session_id: 'session-1',
						user_id: 'user-1',
						status: 'completed',
						tool_call_count: 1,
						validation_failure_count: 1,
						llm_pass_count: 2,
						first_canonical_op: 'onto.project.read',
						started_at: '2026-07-01T10:01:00.000Z',
						finished_at: '2026-07-01T10:02:00.000Z',
						request_message: 'SECRET REQUEST MESSAGE'
					} as any
				],
				timingRows: [
					{
						id: 'timing-1',
						session_id: 'session-1',
						turn_run_id: 'turn-1',
						user_id: 'user-1',
						time_to_first_response_ms: 800,
						created_at: '2026-07-01T10:01:30.000Z'
					},
					{
						id: 'timing-2',
						session_id: 'session-1',
						turn_run_id: 'turn-1',
						user_id: 'user-1',
						time_to_first_response_ms: 12_000,
						created_at: '2026-07-01T10:02:30.000Z'
					}
				],
				toolExecutions: [
					{
						id: 'tool-1',
						session_id: 'session-1',
						turn_run_id: 'turn-1',
						tool_name: 'ontology.read',
						gateway_op: 'onto.project.read',
						success: false,
						error_message: 'Project not found',
						execution_time_ms: 250,
						created_at: '2026-07-01T10:01:20.000Z',
						arguments: { query: 'SECRET TOOL ARG' },
						result: { text: 'SECRET TOOL RESULT' }
					} as any
				],
				usageRows: [
					{
						id: 'usage-1',
						user_id: 'user-1',
						chat_session_id: 'session-1',
						turn_run_id: 'turn-1',
						model_used: 'openai/gpt-4.1-mini',
						status: 'success',
						prompt_tokens: 100,
						completion_tokens: 40,
						total_tokens: 140,
						total_cost_usd: 0.001,
						created_at: '2026-07-01T10:01:40.000Z'
					}
				],
				projectLogs: [
					{
						id: 'log-1',
						chat_session_id: 'session-1',
						project_id: 'project-1',
						entity_type: 'task',
						entity_id: 'task-1',
						action: 'created',
						change_source: 'chat',
						changed_by: 'user-1',
						created_at: '2026-07-01T10:03:00.000Z',
						before_data: { text: 'SECRET BEFORE' },
						after_data: { text: 'SECRET AFTER' }
					} as any
				],
				appErrors: [],
				truncated: { sessions: false }
			},
			baseQuery
		);

		expect(analytics.kpis).toMatchObject({
			active_users: 1,
			sessions: 1,
			turns: 1,
			user_messages: 1,
			assistant_responses: 2,
			ttfr_p50_ms: 800,
			ttfr_p95_ms: 12000,
			slow_turns: 1,
			error_impacted_users: 1,
			chat_created_entities: 1
		});
		expect(analytics.data_health.classification_stale_sessions).toBe(1);
		expect(analytics.users[0]).toMatchObject({
			user_id: 'user-1',
			email: 'founder@example.com',
			session_count: 1,
			message_count: 3,
			tool_call_count: 1,
			tool_failure_count: 1,
			validation_failure_count: 1,
			created_entity_count: 1
		});
		const payloadText = JSON.stringify(analytics);
		expect(payloadText).not.toContain('SECRET USER MESSAGE');
		expect(payloadText).not.toContain('SECRET ASSISTANT MESSAGE');
		expect(payloadText).not.toContain('SECRET REQUEST MESSAGE');
		expect(payloadText).not.toContain('SECRET TOOL ARG');
		expect(payloadText).not.toContain('SECRET TOOL RESULT');
		expect(payloadText).not.toContain('SECRET TRANSCRIPT SUMMARY');
		expect(analytics.users[0].preview).toContain('Topics: landing page, launch video.');
	});

	it('marks missing classification and filters by entity impact', () => {
		const analytics = buildAdminChatUserAnalytics(
			{
				sessions: [
					{
						id: 'session-1',
						user_id: 'user-1',
						chat_topics: [],
						context_type: 'global',
						status: 'active',
						created_at: '2026-07-01T10:00:00.000Z',
						updated_at: '2026-07-01T10:00:00.000Z',
						last_message_at: '2026-07-01T10:00:00.000Z',
						last_classified_at: null
					}
				],
				users: [{ id: 'user-1', email: 'none@example.com', name: null }],
				sessionProjects: [],
				projects: [],
				messages: [],
				turnRuns: [],
				timingRows: [],
				toolExecutions: [],
				usageRows: [],
				projectLogs: [],
				appErrors: [],
				truncated: {}
			},
			{ ...baseQuery, classification: 'missing', entity_action: 'created' }
		);

		expect(analytics.data_health.classification_missing_sessions).toBe(1);
		expect(analytics.users).toEqual([]);
	});

	it('rejects forbidden raw payload keys', () => {
		expect(() =>
			assertAdminChatUserAnalyticsRedacted({
				session: {
					request_message: 'raw prompt'
				}
			})
		).toThrow(/forbidden key/);
	});
});
