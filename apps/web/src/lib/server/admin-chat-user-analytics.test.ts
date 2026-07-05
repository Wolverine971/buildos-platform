// apps/web/src/lib/server/admin-chat-user-analytics.test.ts
import { describe, expect, it } from 'vitest';
import {
	assertAdminChatUserAnalyticsRedacted,
	buildAdminChatRedactedSession,
	buildAdminChatUserAnalytics,
	buildAdminChatUserDetail,
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
			created_entity_count: 1,
			total_tokens: 140
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

	it('returns safe entity-change drilldown details for a user', () => {
		const detail = buildAdminChatUserDetail(
			{
				sessions: [
					{
						id: 'session-1',
						user_id: 'user-1',
						title: 'Launch planning',
						chat_topics: ['launch video'],
						context_type: 'project',
						entity_id: 'project-1',
						status: 'active',
						created_at: '2026-07-01T10:00:00.000Z',
						updated_at: '2026-07-01T10:20:00.000Z',
						last_message_at: '2026-07-01T10:20:00.000Z',
						last_classified_at: '2026-07-01T10:21:00.000Z'
					}
				],
				users: [{ id: 'user-1', email: 'founder@example.com', name: 'Founder' }],
				sessionProjects: [{ chat_session_id: 'session-1', project_id: 'project-1' }],
				projects: [{ id: 'project-1', name: 'BuildOS Demo Campaign' }],
				messages: [],
				turnRuns: [],
				timingRows: [],
				toolExecutions: [],
				usageRows: [],
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
						before_data: { text: 'SECRET BEFORE DRILLDOWN' },
						after_data: { text: 'SECRET AFTER DRILLDOWN' }
					} as any
				],
				appErrors: [],
				truncated: {}
			},
			'user-1',
			{
				timeframe: '7d',
				session_page: 1,
				session_limit: 25,
				session_sort_by: 'last_activity_at',
				session_sort_order: 'desc',
				search: '',
				slow_threshold_ms: 10_000
			}
		);

		expect(detail?.entities).toEqual([
			{
				project_id: 'project-1',
				project_name: 'BuildOS Demo Campaign',
				entity_type: 'task',
				action: 'created',
				count: 1
			}
		]);
		expect(detail?.entity_changes).toEqual([
			{
				session_id: 'session-1',
				project_id: 'project-1',
				project_name: 'BuildOS Demo Campaign',
				entity_type: 'task',
				entity_id: 'task-1',
				entity_title: null,
				action: 'created',
				source: 'chat',
				created_at: '2026-07-01T10:03:00.000Z'
			}
		]);
		assertAdminChatUserAnalyticsRedacted(detail);

		const payloadText = JSON.stringify(detail);
		expect(payloadText).not.toContain('SECRET BEFORE DRILLDOWN');
		expect(payloadText).not.toContain('SECRET AFTER DRILLDOWN');
	});

	it('filters user drilldown sessions by session-level search matches', () => {
		const detail = buildAdminChatUserDetail(
			{
				sessions: [
					{
						id: 'session-launch',
						user_id: 'user-1',
						title: 'Launch planning',
						chat_topics: ['launch'],
						context_type: 'project',
						entity_id: 'project-1',
						status: 'active',
						created_at: '2026-07-01T10:00:00.000Z',
						updated_at: '2026-07-01T10:20:00.000Z',
						last_message_at: '2026-07-01T10:20:00.000Z',
						last_classified_at: '2026-07-01T10:21:00.000Z'
					},
					{
						id: 'session-billing',
						user_id: 'user-1',
						title: 'Billing audit',
						chat_topics: ['billing'],
						context_type: 'global',
						status: 'active',
						created_at: '2026-07-02T10:00:00.000Z',
						updated_at: '2026-07-02T10:20:00.000Z',
						last_message_at: '2026-07-02T10:20:00.000Z',
						last_classified_at: '2026-07-02T10:21:00.000Z'
					}
				],
				users: [{ id: 'user-1', email: 'founder@example.com', name: 'Founder' }],
				sessionProjects: [{ chat_session_id: 'session-launch', project_id: 'project-1' }],
				projects: [{ id: 'project-1', name: 'Launch Project' }],
				messages: [],
				turnRuns: [],
				timingRows: [],
				toolExecutions: [],
				usageRows: [],
				projectLogs: [],
				appErrors: [],
				truncated: {}
			},
			'user-1',
			{
				timeframe: '7d',
				session_page: 1,
				session_limit: 25,
				session_sort_by: 'last_activity_at',
				session_sort_order: 'desc',
				search: 'launch',
				slow_threshold_ms: 10_000
			}
		);

		expect(detail?.sessions.map((session) => session.session_id)).toEqual(['session-launch']);
	});

	it('builds a redacted per-session turn timeline without raw payloads', () => {
		const redacted = buildAdminChatRedactedSession(
			{
				sessions: [
					{
						id: 'session-1',
						user_id: 'user-1',
						title: 'Launch planning',
						auto_title: 'Auto launch plan',
						chat_topics: ['launch video'],
						context_type: 'project',
						entity_id: 'project-1',
						status: 'active',
						created_at: '2026-07-01T10:00:00.000Z',
						updated_at: '2026-07-01T10:04:00.000Z',
						last_message_at: '2026-07-01T10:04:00.000Z',
						last_classified_at: '2026-07-01T10:05:00.000Z',
						summary: 'SECRET CLASSIFIER SUMMARY'
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
						content: 'SECRET USER TURN TEXT'
					} as any,
					{
						id: 'message-2',
						session_id: 'session-1',
						user_id: 'user-1',
						role: 'assistant',
						total_tokens: 30,
						error_message: 'stream interrupted',
						created_at: '2026-07-01T10:02:00.000Z',
						content: 'SECRET ASSISTANT TURN TEXT'
					} as any
				],
				turnRuns: [
					{
						id: 'turn-1',
						session_id: 'session-1',
						user_id: 'user-1',
						status: 'completed',
						tool_round_count: 1,
						tool_call_count: 1,
						validation_failure_count: 1,
						llm_pass_count: 1,
						first_lane: 'ontology',
						first_skill_path: 'projects.read',
						first_canonical_op: 'onto.project.read',
						cache_source: 'miss',
						prepared_prompt_hit: true,
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
						time_to_first_response_ms: 900,
						time_to_first_event_ms: 400,
						created_at: '2026-07-01T10:01:20.000Z'
					}
				],
				toolExecutions: [
					{
						id: 'tool-1',
						session_id: 'session-1',
						turn_run_id: 'turn-1',
						tool_name: 'ontology.read',
						gateway_op: 'onto.project.read',
						help_path: 'projects/read',
						success: false,
						execution_time_ms: 250,
						result_count: 0,
						zero_result: true,
						error_message: 'Project not found',
						affected_entities: [
							{ entity_id: 'task-1', entity_type: 'task', action: 'created' }
						],
						created_at: '2026-07-01T10:01:30.000Z',
						arguments: { query: 'SECRET TOOL ARGUMENT' },
						result: { value: 'SECRET TOOL RESULT' }
					} as any
				],
				usageRows: [
					{
						id: 'usage-1',
						user_id: 'user-1',
						chat_session_id: 'session-1',
						turn_run_id: 'turn-1',
						model_used: 'openai/gpt-4.1-mini',
						provider: 'openai',
						status: 'success',
						total_tokens: 140,
						total_cost_usd: 0.001,
						created_at: '2026-07-01T10:01:45.000Z'
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
						created_at: '2026-07-01T10:02:10.000Z',
						before_data: { title: 'SECRET BEFORE ENTITY' },
						after_data: { title: 'SECRET AFTER ENTITY' }
					} as any
				],
				appErrors: [],
				truncated: {}
			},
			'user-1',
			'session-1'
		);

		expect(redacted).not.toBeNull();
		expect(redacted?.session).toMatchObject({
			session_id: 'session-1',
			user_id: 'user-1',
			turn_count: 1,
			message_count: 2,
			total_tokens: 140,
			tool_failure_count: 1,
			validation_failure_count: 1,
			created_entity_count: 1
		});
		expect(redacted?.privacy).toMatchObject({
			raw_message_content_returned: false,
			raw_assistant_content_returned: false,
			raw_request_message_returned: false,
			raw_tool_arguments_returned: false,
			raw_tool_results_returned: false,
			prompt_snapshot_returned: false
		});
		expect(redacted?.turns[0]).toMatchObject({
			turn_run_id: 'turn-1',
			turn_index: 1,
			ttfr_ms: 900,
			ttfe_ms: 400,
			tool_call_count: 1,
			tool_failure_count: 1,
			validation_failure_count: 1,
			llm_pass_count: 1,
			entity_changes: [
				{
					action: 'created',
					entity_type: 'task',
					entity_id: 'task-1',
					project_id: 'project-1'
				}
			]
		});
		expect(redacted?.turns[0].error_summaries).toEqual(
			expect.arrayContaining([
				{ source: 'validation', message: '1 validation failure' },
				{ source: 'message', message: 'stream interrupted' },
				{ source: 'tool', message: 'Project not found' }
			])
		);
		expect(redacted?.timeline.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				'session',
				'turn',
				'timing',
				'tool',
				'llm',
				'entity_change',
				'error'
			])
		);
		assertAdminChatUserAnalyticsRedacted(redacted);

		const payloadText = JSON.stringify(redacted);
		expect(payloadText).not.toContain('SECRET USER TURN TEXT');
		expect(payloadText).not.toContain('SECRET ASSISTANT TURN TEXT');
		expect(payloadText).not.toContain('SECRET REQUEST MESSAGE');
		expect(payloadText).not.toContain('SECRET TOOL ARGUMENT');
		expect(payloadText).not.toContain('SECRET TOOL RESULT');
		expect(payloadText).not.toContain('SECRET CLASSIFIER SUMMARY');
		expect(payloadText).not.toContain('SECRET BEFORE ENTITY');
		expect(payloadText).not.toContain('SECRET AFTER ENTITY');
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
