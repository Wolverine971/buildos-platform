// apps/web/src/lib/components/admin/chat-users/chat-user-export.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildChatUserDetailJsonFile,
	buildChatUsersCsvFile,
	csvRows,
	type ChatUserExportFilters
} from './chat-user-export';
import type { UserDetail, UserMetric, UsersResponse } from './chat-user-types';

const NOW = new Date('2026-07-06T15:30:45.123Z');

describe('chat-user-export', () => {
	it('escapes CSV cells with commas, quotes, and newlines', () => {
		expect(
			csvRows(
				['name', 'note', 'empty'],
				[{ name: 'Ada, Lovelace', note: 'Said "ship it"\nagain', empty: null }]
			)
		).toBe('name,note,empty\n"Ada, Lovelace","Said ""ship it""\nagain",');
	});

	it('builds the users CSV export with nested summary columns', () => {
		const file = buildChatUsersCsvFile({
			data: usersResponse(),
			timeframe: '7d',
			now: NOW
		});

		expect(file.filename).toBe('admin-chat-users-7d-2026-07-06T15-30-45-123Z.csv');
		expect(file.mimeType).toBe('text/csv;charset=utf-8');
		expect(file.contents).toContain('user_id,email,name,last_activity_at');
		expect(file.contents).toContain('"topic, one (2)"');
		expect(file.contents).toContain('Project Alpha (3)');
		expect(file.contents).toContain('search_files (4/1 failed)');
	});

	it('builds the user detail JSON export with filters and visible entity context', () => {
		const detail = userDetail();
		const file = buildChatUserDetailJsonFile({
			userDetail: detail,
			filters: exportFilters(),
			selectedEntityGroup: detail.entities[0],
			visibleEntityChanges: detail.entity_changes,
			redactedSession: null,
			now: NOW
		});

		expect(file.filename).toBe(
			'admin-chat-user-user-with-spaces-2026-07-06T15-30-45-123Z.json'
		);
		expect(file.mimeType).toBe('application/json;charset=utf-8');

		const parsed = JSON.parse(file.contents);
		expect(parsed.exported_at).toBe(NOW.toISOString());
		expect(parsed.filters).toEqual(exportFilters());
		expect(parsed.user_detail.user.id).toBe('user:with spaces');
		expect(parsed.selected_entity_group).toEqual(detail.entities[0]);
		expect(parsed.visible_entity_changes).toEqual(detail.entity_changes);
		expect(parsed.redacted_session).toBeNull();
	});
});

function exportFilters(): ChatUserExportFilters {
	return {
		timeframe: '7d',
		page: 1,
		limit: 50,
		sort_by: 'last_activity_at',
		sort_order: 'desc',
		search: '',
		context_type: 'all',
		project_id: 'all',
		topic: 'all',
		errors: 'all',
		tool_bucket: 'all',
		classification: 'all',
		entity_action: 'all',
		slow_threshold_ms: '10000'
	};
}

function userMetric(overrides: Partial<UserMetric> = {}): UserMetric {
	return {
		user_id: 'user:with spaces',
		email: 'ada@example.com',
		name: 'Ada Lovelace',
		first_chat_at: '2026-07-01T10:00:00.000Z',
		last_activity_at: '2026-07-06T10:00:00.000Z',
		active_day_count: 3,
		consecutive_day_streak: 2,
		session_count: 5,
		project_session_count: 4,
		global_session_count: 1,
		turn_count: 12,
		completed_turn_count: 10,
		failed_turn_count: 1,
		cancelled_turn_count: 1,
		running_turn_count: 0,
		message_count: 24,
		user_message_count: 12,
		assistant_message_count: 12,
		message_error_count: 1,
		tool_call_count: 4,
		tool_failure_count: 1,
		tool_failure_rate: 25,
		llm_call_count: 6,
		llm_failure_count: 1,
		validation_failure_count: 0,
		ttfr_p50_ms: 800,
		ttfr_p95_ms: 1500,
		ttfr_max_ms: 2000,
		slow_turn_count: 1,
		total_tokens: 1000,
		total_cost_usd: 0.42,
		created_entity_count: 2,
		updated_entity_count: 1,
		deleted_entity_count: 0,
		project_count: 1,
		top_topics: [{ topic: 'topic, one', count: 2 }],
		top_projects: [{ project_id: 'project-1', name: 'Project Alpha', count: 3 }],
		top_tools: [{ tool_name: 'search_files', count: 4, failures: 1 }],
		preview: 'Preview with "quotes"',
		...overrides
	};
}

function usersResponse(): UsersResponse {
	return {
		kpis: {
			active_users: 1,
			sessions: 5,
			turns: 12,
			user_messages: 12,
			assistant_responses: 12,
			ttfr_p50_ms: 800,
			ttfr_p95_ms: 1500,
			slow_turns: 1,
			error_impacted_users: 1,
			chat_created_entities: 2
		},
		leaderboards: {
			most_sessions: [],
			slowest_first_responses: [],
			most_tool_calls: [],
			longest_threads: [],
			most_requests_responses: [],
			most_created_entities: [],
			most_error_impacted: []
		},
		users: [userMetric()],
		pagination: { page: 1, limit: 50, total: 1, total_pages: 1 },
		filter_options: {
			context_types: [],
			topics: [],
			tools: [],
			gateway_ops: [],
			projects: []
		},
		data_health: {
			truncated: {},
			classification_missing_sessions: 0,
			classification_stale_sessions: 0,
			raw_message_content_returned: false
		}
	};
}

function userDetail(): UserDetail {
	return {
		user: { id: 'user:with spaces', email: 'ada@example.com', name: 'Ada Lovelace' },
		summary: userMetric(),
		timeline: [],
		sessions: [],
		errors: [],
		tools: [],
		entities: [
			{
				project_id: 'project-1',
				project_name: 'Project Alpha',
				entity_type: 'task',
				action: 'created',
				count: 1
			}
		],
		entity_changes: [
			{
				session_id: 'session-1',
				project_id: 'project-1',
				project_name: 'Project Alpha',
				entity_type: 'task',
				entity_id: 'task-1',
				entity_title: 'Draft audit plan',
				action: 'created',
				source: 'chat',
				created_at: '2026-07-06T10:00:00.000Z'
			}
		]
	};
}
