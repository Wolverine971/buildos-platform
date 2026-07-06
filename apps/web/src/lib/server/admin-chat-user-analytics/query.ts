// apps/web/src/lib/server/admin-chat-user-analytics/query.ts
import type {
	AdminChatRedactedSessionQuery,
	AdminChatSessionSortField,
	AdminChatUserAnalyticsQuery,
	AdminChatUserAnalyticsTimeframe,
	AdminChatUserDetailQuery,
	AdminChatUserSortField
} from '$lib/types/admin-chat-user-analytics';

export const DEFAULT_SLOW_THRESHOLD_MS = 10_000;

const USER_SORT_FIELDS = new Set<AdminChatUserSortField>([
	'last_activity_at',
	'session_count',
	'turn_count',
	'message_count',
	'user_message_count',
	'assistant_message_count',
	'tool_call_count',
	'tool_failure_count',
	'tool_failure_rate',
	'llm_failure_count',
	'validation_failure_count',
	'p95_ttfr_ms',
	'max_ttfr_ms',
	'slow_turn_count',
	'longest_session_turns',
	'longest_session_messages',
	'created_entity_count',
	'updated_entity_count',
	'total_tokens',
	'total_cost_usd'
]);

const SESSION_SORT_FIELDS = new Set<AdminChatSessionSortField>([
	'last_activity_at',
	'created_at',
	'turn_count',
	'message_count',
	'user_message_count',
	'assistant_message_count',
	'tool_call_count',
	'tool_failure_count',
	'llm_call_count',
	'llm_failure_count',
	'max_ttfr_ms',
	'p95_ttfr_ms',
	'duration_ms',
	'created_entity_count',
	'total_tokens',
	'total_cost_usd'
]);

export function parseAdminChatUsersQuery(
	searchParams: URLSearchParams
): AdminChatUserAnalyticsQuery {
	const requestedSort = searchParams.get('sort_by') as AdminChatUserSortField | null;
	const sortBy =
		requestedSort && USER_SORT_FIELDS.has(requestedSort) ? requestedSort : 'last_activity_at';
	const errors = searchParams.get('errors');
	const toolBucket = searchParams.get('tool_bucket');
	const entityAction = searchParams.get('entity_action');
	const classification = searchParams.get('classification');

	return {
		timeframe: parseTimeframe(searchParams.get('timeframe')),
		page: parsePositiveInt(searchParams.get('page'), 1, 10_000),
		limit: parsePositiveInt(searchParams.get('limit'), 50, 100),
		sort_by: sortBy,
		sort_order: searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc',
		search: searchParams.get('search')?.trim() ?? '',
		user_id: textParam(searchParams.get('user_id')),
		project_id: textParam(searchParams.get('project_id')),
		context_type: searchParams.get('context_type')?.trim() || 'all',
		topic: searchParams.get('topic')?.trim() || '',
		slow_threshold_ms: parseSlowThreshold(searchParams.get('slow_threshold_ms')),
		errors: errors === 'only' || errors === 'none' ? errors : 'all',
		tool_bucket:
			toolBucket === 'none' || toolBucket === 'some' || toolBucket === 'heavy'
				? toolBucket
				: 'all',
		entity_action:
			entityAction === 'created' || entityAction === 'updated' || entityAction === 'deleted'
				? entityAction
				: 'all',
		classification:
			classification === 'classified' ||
			classification === 'missing' ||
			classification === 'stale'
				? classification
				: 'all'
	};
}

export function parseAdminChatUserDetailQuery(
	searchParams: URLSearchParams
): AdminChatUserDetailQuery {
	const requestedSort = searchParams.get('session_sort_by') as AdminChatSessionSortField | null;
	const sessionSort =
		requestedSort && SESSION_SORT_FIELDS.has(requestedSort)
			? requestedSort
			: 'last_activity_at';
	return {
		timeframe: parseTimeframe(searchParams.get('timeframe')),
		session_page: parsePositiveInt(searchParams.get('session_page'), 1, 10_000),
		session_limit: parsePositiveInt(searchParams.get('session_limit'), 25, 100),
		session_sort_by: sessionSort,
		session_sort_order: searchParams.get('session_sort_order') === 'asc' ? 'asc' : 'desc',
		search: searchParams.get('search')?.trim() ?? '',
		slow_threshold_ms: parseSlowThreshold(searchParams.get('slow_threshold_ms'))
	};
}

export function parseAdminChatRedactedSessionQuery(
	searchParams: URLSearchParams
): AdminChatRedactedSessionQuery {
	return {
		slow_threshold_ms: parseSlowThreshold(searchParams.get('slow_threshold_ms'))
	};
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, max);
}

function parseSlowThreshold(value: string | null): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed)) return DEFAULT_SLOW_THRESHOLD_MS;
	return Math.min(Math.max(parsed, 1_000), 120_000);
}

function parseTimeframe(value: string | null | undefined): AdminChatUserAnalyticsTimeframe {
	if (value === '24h' || value === '7d' || value === '30d' || value === '90d') return value;
	return '7d';
}

function textParam(value: string | null): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
