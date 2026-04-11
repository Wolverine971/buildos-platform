// apps/web/src/lib/services/admin/chat-tool-analytics.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildChatToolAnalytics,
	type ToolExecutionAnalyticsRow,
	type ToolTurnRunAnalyticsRow
} from './chat-tool-analytics';

const row = (
	overrides: Partial<ToolExecutionAnalyticsRow> & { id: string }
): ToolExecutionAnalyticsRow => ({
	id: overrides.id,
	session_id: 'session-1',
	turn_run_id: null,
	stream_run_id: null,
	client_turn_id: null,
	tool_name: 'execute_op',
	tool_category: null,
	gateway_op: null,
	help_path: null,
	execution_time_ms: null,
	tokens_consumed: null,
	success: true,
	error_message: null,
	requires_user_action: null,
	created_at: '2026-04-10T12:00:00.000Z',
	...overrides
});

const turnRun = (
	overrides: Partial<ToolTurnRunAnalyticsRow> & { id: string }
): ToolTurnRunAnalyticsRow => ({
	id: overrides.id,
	session_id: 'session-1',
	context_type: 'project',
	status: 'completed',
	finished_reason: 'stop',
	tool_round_count: 1,
	tool_call_count: 1,
	validation_failure_count: 0,
	first_lane: null,
	first_help_path: null,
	first_skill_path: null,
	first_canonical_op: null,
	started_at: '2026-04-10T12:00:00.000Z',
	finished_at: '2026-04-10T12:00:05.000Z',
	created_at: '2026-04-10T12:00:00.000Z',
	...overrides
});

describe('buildChatToolAnalytics', () => {
	it('aggregates real tool execution rows with duration percentiles and gateway metadata', () => {
		const payload = buildChatToolAnalytics(
			[
				row({
					id: 'exec-1',
					turn_run_id: 'turn-1',
					gateway_op: 'onto.task.update',
					execution_time_ms: 100,
					created_at: '2026-04-10T12:00:00.000Z'
				}),
				row({
					id: 'exec-2',
					turn_run_id: 'turn-1',
					gateway_op: 'onto.task.update',
					execution_time_ms: 400,
					success: false,
					error_message: 'Permission denied',
					created_at: '2026-04-10T12:01:00.000Z'
				}),
				row({
					id: 'exec-3',
					session_id: 'session-2',
					turn_run_id: 'turn-2',
					tool_name: 'tool_search',
					help_path: 'capabilities.tasks',
					execution_time_ms: null,
					created_at: '2026-04-10T12:02:00.000Z'
				}),
				row({
					id: 'exec-4',
					session_id: 'session-2',
					turn_run_id: 'turn-3',
					tool_name: 'list_calendar_events',
					tool_category: 'calendar',
					execution_time_ms: 900,
					created_at: '2026-04-10T12:03:00.000Z'
				})
			],
			[
				turnRun({
					id: 'turn-1',
					validation_failure_count: 1,
					first_lane: 'direct_exact_op',
					first_canonical_op: 'onto.task.update'
				}),
				turnRun({
					id: 'turn-2',
					session_id: 'session-2',
					context_type: 'global',
					first_lane: 'skill_first',
					first_skill_path: 'task_management'
				}),
				turnRun({
					id: 'turn-3',
					session_id: 'session-2',
					context_type: 'global'
				})
			],
			[
				{ id: 'session-1', context_type: 'project' },
				{ id: 'session-2', context_type: 'global' }
			],
			{ trendBucket: 'hour' }
		);

		expect(payload.overview.total_executions).toBe(4);
		expect(payload.overview.successful_executions).toBe(3);
		expect(payload.overview.failed_executions).toBe(1);
		expect(payload.overview.success_rate).toBe(75);
		expect(payload.overview.unique_sessions).toBe(2);
		expect(payload.overview.unique_turns).toBe(3);
		expect(payload.overview.p50_execution_time_ms).toBe(400);
		expect(payload.overview.p95_execution_time_ms).toBe(900);
		expect(payload.overview.validation_failures).toBe(1);

		const executeOp = payload.by_tool.find((tool) => tool.tool_name === 'execute_op');
		expect(executeOp).toMatchObject({
			tool_category: 'gateway_execution',
			total_executions: 2,
			failed_executions: 1,
			top_gateway_op: 'onto.task.update',
			error_count: 1
		});

		expect(payload.gateway_usage.by_gateway_op[0]).toMatchObject({
			label: 'onto.task.update',
			total_executions: 2
		});
		expect(payload.gateway_usage.first_lanes.map((lane) => lane.label)).toContain(
			'direct_exact_op'
		);
		expect(payload.trends).toHaveLength(1);
		expect(payload.trends[0].bucket).toBe('2026-04-10T12:00:00.000Z');
	});

	it('applies outcome, context, and minimum-call filters without shrinking filter options', () => {
		const payload = buildChatToolAnalytics(
			[
				row({
					id: 'exec-1',
					turn_run_id: 'turn-1',
					gateway_op: 'onto.task.update',
					execution_time_ms: 100
				}),
				row({
					id: 'exec-2',
					turn_run_id: 'turn-1',
					gateway_op: 'onto.task.update',
					execution_time_ms: 200,
					success: false,
					error_message: 'Permission denied'
				}),
				row({
					id: 'exec-3',
					session_id: 'session-2',
					turn_run_id: 'turn-2',
					tool_name: 'tool_search',
					execution_time_ms: 50
				})
			],
			[
				turnRun({ id: 'turn-1', context_type: 'project' }),
				turnRun({ id: 'turn-2', session_id: 'session-2', context_type: 'global' })
			],
			[
				{ id: 'session-1', context_type: 'project' },
				{ id: 'session-2', context_type: 'global' }
			],
			{
				filters: {
					contextType: 'project',
					outcome: 'failed',
					minCalls: 2
				}
			}
		);

		expect(payload.overview.total_executions).toBe(1);
		expect(payload.overview.failed_executions).toBe(1);
		expect(payload.by_tool).toHaveLength(0);
		expect(payload.reliability.recent_failures).toHaveLength(1);
		expect(payload.filter_options.context_types).toEqual(['global', 'project']);
		expect(payload.filter_options.categories).toContain('gateway_execution');
		expect(payload.filter_options.categories).toContain('gateway_discovery');
	});

	it('groups repeated error messages and keeps affected tools distinct', () => {
		const payload = buildChatToolAnalytics([
			row({
				id: 'exec-1',
				success: false,
				error_message: 'Missing required project_id'
			}),
			row({
				id: 'exec-2',
				tool_name: 'tool_search',
				success: false,
				error_message: 'Missing required project_id'
			}),
			row({
				id: 'exec-3',
				tool_name: 'list_calendar_events',
				tool_category: 'calendar',
				success: false,
				error_message: 'Calendar disconnected'
			})
		]);

		expect(payload.reliability.top_errors[0]).toEqual({
			error_message: 'Missing required project_id',
			count: 2,
			affected_tools: ['execute_op', 'tool_search'],
			last_seen_at: '2026-04-10T12:00:00.000Z'
		});
		expect(payload.most_problematic_tools[0].failure_rate).toBe(100);
	});
});
