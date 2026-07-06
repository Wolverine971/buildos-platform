// apps/web/src/lib/server/admin-chat-user-analytics/query.test.ts
import { describe, expect, it } from 'vitest';
import {
	parseAdminChatRedactedSessionQuery,
	parseAdminChatUserDetailQuery,
	parseAdminChatUsersQuery
} from './query';

describe('admin chat user analytics query parsing', () => {
	it('parses list query params and clamps bounded numbers', () => {
		const query = parseAdminChatUsersQuery(
			new URLSearchParams({
				timeframe: '90d',
				page: '2',
				limit: '500',
				sort_by: 'total_cost_usd',
				sort_order: 'asc',
				search: '  ada  ',
				user_id: ' user-1 ',
				project_id: ' project-1 ',
				context_type: ' project ',
				topic: ' retention ',
				slow_threshold_ms: '999999',
				errors: 'only',
				tool_bucket: 'heavy',
				entity_action: 'updated',
				classification: 'stale'
			})
		);

		expect(query).toEqual({
			timeframe: '90d',
			page: 2,
			limit: 100,
			sort_by: 'total_cost_usd',
			sort_order: 'asc',
			search: 'ada',
			user_id: 'user-1',
			project_id: 'project-1',
			context_type: 'project',
			topic: 'retention',
			slow_threshold_ms: 120_000,
			errors: 'only',
			tool_bucket: 'heavy',
			entity_action: 'updated',
			classification: 'stale'
		});
	});

	it('falls back for invalid list query params', () => {
		const query = parseAdminChatUsersQuery(
			new URLSearchParams({
				timeframe: 'forever',
				page: '-1',
				limit: '0',
				sort_by: 'unknown',
				sort_order: 'sideways',
				slow_threshold_ms: 'not-a-number',
				errors: 'maybe',
				tool_bucket: 'huge',
				entity_action: 'renamed',
				classification: 'queued'
			})
		);

		expect(query).toMatchObject({
			timeframe: '7d',
			page: 1,
			limit: 50,
			sort_by: 'last_activity_at',
			sort_order: 'desc',
			slow_threshold_ms: 10_000,
			errors: 'all',
			tool_bucket: 'all',
			entity_action: 'all',
			classification: 'all'
		});
	});

	it('parses user-detail session paging and sorting params', () => {
		const query = parseAdminChatUserDetailQuery(
			new URLSearchParams({
				timeframe: '24h',
				session_page: '3',
				session_limit: '999',
				session_sort_by: 'duration_ms',
				session_sort_order: 'asc',
				search: '  slow  ',
				slow_threshold_ms: '500'
			})
		);

		expect(query).toEqual({
			timeframe: '24h',
			session_page: 3,
			session_limit: 100,
			session_sort_by: 'duration_ms',
			session_sort_order: 'asc',
			search: 'slow',
			slow_threshold_ms: 1_000
		});
	});

	it('parses redacted session threshold params', () => {
		expect(
			parseAdminChatRedactedSessionQuery(new URLSearchParams({ slow_threshold_ms: '20000' }))
		).toEqual({ slow_threshold_ms: 20_000 });
		expect(parseAdminChatRedactedSessionQuery(new URLSearchParams())).toEqual({
			slow_threshold_ms: 10_000
		});
	});
});
