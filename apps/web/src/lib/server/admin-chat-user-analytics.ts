// apps/web/src/lib/server/admin-chat-user-analytics.ts
import { resolveUsageLogCostBreakdown } from '$lib/services/admin/llm-usage-costs';
import { resolveBillableTokenTotal } from '$lib/services/admin/chat-session-metrics';
import { DEFAULT_SLOW_THRESHOLD_MS } from './admin-chat-user-analytics/query';
import { assertAdminChatUserAnalyticsRedacted } from './admin-chat-user-analytics/redaction';

export {
	parseAdminChatRedactedSessionQuery,
	parseAdminChatUserDetailQuery,
	parseAdminChatUsersQuery
} from './admin-chat-user-analytics/query';
export { assertAdminChatUserAnalyticsRedacted } from './admin-chat-user-analytics/redaction';

export type AdminChatUserAnalyticsTimeframe = '24h' | '7d' | '30d' | '90d';

export type AdminChatUserMetric = {
	user_id: string;
	email: string;
	name: string | null;
	first_chat_at: string | null;
	last_activity_at: string | null;
	active_day_count: number;
	consecutive_day_streak: number;
	session_count: number;
	project_session_count: number;
	global_session_count: number;
	turn_count: number;
	completed_turn_count: number;
	failed_turn_count: number;
	cancelled_turn_count: number;
	running_turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	message_error_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	tool_failure_rate: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	slow_turn_count: number;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	project_count: number;
	top_topics: Array<{ topic: string; count: number }>;
	top_projects: Array<{ project_id: string; name: string | null; count: number }>;
	top_tools: Array<{ tool_name: string; count: number; failures: number }>;
	preview: string;
};

export type AdminChatClassificationJobSummary = {
	job_id: string;
	queue_job_id: string | null;
	status: string;
	error_message: string | null;
	queued_at: string | null;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
};

export type AdminChatSessionMetric = {
	session_id: string;
	user_id: string;
	user_email: string;
	user_name: string | null;
	title: string;
	context_type: string;
	entity_id: string | null;
	project_ids: string[];
	project_names: string[];
	status: string;
	created_at: string;
	last_activity_at: string | null;
	last_classified_at: string | null;
	classification_state: 'classified' | 'missing' | 'stale';
	classification_job: AdminChatClassificationJobSummary | null;
	topics: string[];
	summary_preview: string | null;
	turn_count: number;
	message_count: number;
	user_message_count: number;
	assistant_message_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	llm_call_count: number;
	llm_failure_count: number;
	validation_failure_count: number;
	ttfr_p50_ms: number | null;
	ttfr_p95_ms: number | null;
	ttfr_max_ms: number | null;
	slow_turn_count: number;
	duration_ms: number | null;
	total_tokens: number;
	total_cost_usd: number;
	created_entity_count: number;
	updated_entity_count: number;
	deleted_entity_count: number;
	has_errors: boolean;
	has_slow_response: boolean;
};

export type AdminChatUsersResponse = {
	kpis: {
		active_users: number;
		sessions: number;
		turns: number;
		user_messages: number;
		assistant_responses: number;
		ttfr_p50_ms: number | null;
		ttfr_p95_ms: number | null;
		slow_turns: number;
		error_impacted_users: number;
		chat_created_entities: number;
	};
	leaderboards: {
		most_sessions: AdminChatUserMetric[];
		slowest_first_responses: AdminChatUserMetric[];
		most_tool_calls: AdminChatUserMetric[];
		longest_threads: AdminChatSessionMetric[];
		most_requests_responses: AdminChatUserMetric[];
		most_created_entities: AdminChatUserMetric[];
		most_error_impacted: AdminChatUserMetric[];
	};
	users: AdminChatUserMetric[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		total_pages: number;
	};
	filter_options: {
		context_types: string[];
		topics: string[];
		tools: string[];
		gateway_ops: string[];
		projects: Array<{ project_id: string; name: string | null }>;
	};
	data_health: {
		truncated: Record<string, boolean>;
		classification_missing_sessions: number;
		classification_stale_sessions: number;
		raw_message_content_returned: false;
	};
};

export type AdminChatUserDetailResponse = {
	user: {
		id: string;
		email: string;
		name: string | null;
	};
	summary: AdminChatUserMetric;
	timeline: Array<{
		date: string;
		session_count: number;
		turn_count: number;
		message_count: number;
		slow_turn_count: number;
		error_count: number;
		created_entity_count: number;
		top_topics: string[];
		project_names: string[];
	}>;
	sessions: AdminChatSessionMetric[];
	errors: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation' | 'app';
		session_id: string | null;
		turn_run_id: string | null;
		error_message: string;
		severity: string | null;
		created_at: string;
	}>;
	tools: Array<{
		tool_name: string;
		gateway_op: string | null;
		count: number;
		failures: number;
		p95_execution_time_ms: number | null;
	}>;
	entities: Array<{
		project_id: string;
		project_name: string | null;
		entity_type: string;
		action: string;
		count: number;
	}>;
	entity_changes: Array<{
		session_id: string;
		project_id: string | null;
		project_name: string | null;
		entity_type: string;
		entity_id: string | null;
		entity_title: string | null;
		action: string;
		source: string | null;
		created_at: string;
	}>;
};

export type AdminChatRedactedTurn = {
	turn_run_id: string;
	session_id: string;
	turn_index: number;
	status: string;
	finished_reason: string | null;
	started_at: string;
	finished_at: string | null;
	duration_ms: number | null;
	ttfr_ms: number | null;
	ttfe_ms: number | null;
	tool_round_count: number;
	tool_call_count: number;
	tool_failure_count: number;
	validation_failure_count: number;
	llm_pass_count: number;
	first_lane: string | null;
	first_skill_path: string | null;
	first_canonical_op: string | null;
	cache_source: string | null;
	prepared_prompt_hit: boolean | null;
	error_summaries: Array<{
		source: 'message' | 'tool' | 'llm' | 'turn' | 'validation';
		message: string;
	}>;
	entity_changes: Array<{
		action: string;
		entity_type: string;
		entity_id: string;
		entity_title: string | null;
		project_id: string | null;
	}>;
};

export type AdminChatRedactedSessionTimelineEvent = {
	id: string;
	timestamp: string;
	type:
		| 'session'
		| 'turn'
		| 'timing'
		| 'tool'
		| 'llm'
		| 'entity_change'
		| 'error'
		| 'context_shift';
	severity: 'info' | 'success' | 'warning' | 'error';
	turn_index: number | null;
	title: string;
	summary: string;
};

export type AdminChatRedactedSessionResponse = {
	session: AdminChatSessionMetric;
	turns: AdminChatRedactedTurn[];
	timeline: AdminChatRedactedSessionTimelineEvent[];
	privacy: {
		raw_message_content_returned: false;
		raw_assistant_content_returned: false;
		raw_request_message_returned: false;
		raw_tool_arguments_returned: false;
		raw_tool_results_returned: false;
		prompt_snapshot_returned: false;
	};
};

export type AdminChatUserAnalyticsQuery = {
	timeframe: AdminChatUserAnalyticsTimeframe;
	page: number;
	limit: number;
	sort_by: AdminChatUserSortField;
	sort_order: 'asc' | 'desc';
	search: string;
	user_id: string | null;
	project_id: string | null;
	context_type: string;
	topic: string;
	slow_threshold_ms: number;
	errors: 'all' | 'only' | 'none';
	tool_bucket: 'all' | 'none' | 'some' | 'heavy';
	entity_action: 'all' | 'created' | 'updated' | 'deleted';
	classification: 'all' | 'classified' | 'missing' | 'stale';
};

export type AdminChatUserSortField =
	| 'last_activity_at'
	| 'session_count'
	| 'turn_count'
	| 'message_count'
	| 'user_message_count'
	| 'assistant_message_count'
	| 'tool_call_count'
	| 'tool_failure_count'
	| 'tool_failure_rate'
	| 'llm_failure_count'
	| 'validation_failure_count'
	| 'p95_ttfr_ms'
	| 'max_ttfr_ms'
	| 'slow_turn_count'
	| 'longest_session_turns'
	| 'longest_session_messages'
	| 'created_entity_count'
	| 'updated_entity_count'
	| 'total_tokens'
	| 'total_cost_usd';

export type AdminChatSessionSortField =
	| 'last_activity_at'
	| 'created_at'
	| 'turn_count'
	| 'message_count'
	| 'user_message_count'
	| 'assistant_message_count'
	| 'tool_call_count'
	| 'tool_failure_count'
	| 'llm_call_count'
	| 'llm_failure_count'
	| 'max_ttfr_ms'
	| 'p95_ttfr_ms'
	| 'duration_ms'
	| 'created_entity_count'
	| 'total_tokens'
	| 'total_cost_usd';

export type AdminChatUserDetailQuery = {
	timeframe: AdminChatUserAnalyticsTimeframe;
	session_page: number;
	session_limit: number;
	session_sort_by: AdminChatSessionSortField;
	session_sort_order: 'asc' | 'desc';
	search: string;
	slow_threshold_ms: number;
};

export type AdminChatRedactedSessionQuery = {
	slow_threshold_ms: number;
};

export type AdminChatUserSessionRow = {
	id: string;
	user_id?: string | null;
	title?: string | null;
	auto_title?: string | null;
	chat_topics?: string[] | null;
	context_type?: string | null;
	entity_id?: string | null;
	status?: string | null;
	message_count?: number | string | null;
	tool_call_count?: number | string | null;
	total_tokens_used?: number | string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	last_classified_at?: string | null;
};

export type AdminChatUserRow = {
	id: string;
	email?: string | null;
	name?: string | null;
};

export type AdminChatSessionProjectRow = {
	chat_session_id?: string | null;
	project_id?: string | null;
};

export type AdminChatProjectRow = {
	id: string;
	name?: string | null;
};

export type AdminChatUserMessageRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	role?: string | null;
	total_tokens?: number | string | null;
	error_code?: string | null;
	error_message?: string | null;
	created_at?: string | null;
};

export type AdminChatUserTurnRunRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	tool_round_count?: number | string | null;
	tool_call_count?: number | string | null;
	validation_failure_count?: number | string | null;
	llm_pass_count?: number | string | null;
	first_lane?: string | null;
	first_skill_path?: string | null;
	first_canonical_op?: string | null;
	first_help_path?: string | null;
	cache_source?: string | null;
	prepared_prompt_hit?: boolean | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
};

export type AdminChatUserTimingRow = {
	id: string;
	session_id?: string | null;
	turn_run_id?: string | null;
	user_id?: string | null;
	context_type?: string | null;
	time_to_first_response_ms?: number | string | null;
	time_to_first_event_ms?: number | string | null;
	created_at?: string | null;
};

export type AdminChatUserToolExecutionRow = {
	id: string;
	session_id?: string | null;
	turn_run_id?: string | null;
	tool_name?: string | null;
	tool_category?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	success?: boolean | null;
	execution_time_ms?: number | string | null;
	tokens_consumed?: number | string | null;
	result_count?: number | string | null;
	zero_result?: boolean | null;
	error_message?: string | null;
	affected_entities?: unknown;
	created_at?: string | null;
};

export type AdminChatUserUsageRow = {
	id: string;
	user_id?: string | null;
	chat_session_id?: string | null;
	turn_run_id?: string | null;
	model_requested?: string | null;
	model_used?: string | null;
	provider?: string | null;
	profile?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	input_cost_usd?: number | string | null;
	output_cost_usd?: number | string | null;
	total_cost_usd?: number | string | null;
	openrouter_usage_cost_usd?: number | string | null;
	response_time_ms?: number | string | null;
	status?: string | null;
	error_message?: string | null;
	openrouter_cache_status?: string | null;
	created_at?: string | null;
};

export type AdminChatUserProjectLogRow = {
	id: string;
	chat_session_id?: string | null;
	project_id?: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	action?: string | null;
	change_source?: string | null;
	changed_by?: string | null;
	created_at?: string | null;
};

export type AdminChatUserAppErrorRow = {
	id: string;
	user_id?: string | null;
	error_message?: string | null;
	error_type?: string | null;
	severity?: string | null;
	endpoint?: string | null;
	record_id?: string | null;
	project_id?: string | null;
	created_at?: string | null;
};

export type AdminChatClassificationJobRow = {
	id: string;
	queue_job_id?: string | null;
	metadata?: unknown;
	status?: string | null;
	error_message?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
};

export type BuildAdminChatUserAnalyticsInput = {
	sessions: AdminChatUserSessionRow[];
	users: AdminChatUserRow[];
	sessionProjects: AdminChatSessionProjectRow[];
	projects: AdminChatProjectRow[];
	messages: AdminChatUserMessageRow[];
	turnRuns: AdminChatUserTurnRunRow[];
	timingRows: AdminChatUserTimingRow[];
	toolExecutions: AdminChatUserToolExecutionRow[];
	usageRows: AdminChatUserUsageRow[];
	projectLogs: AdminChatUserProjectLogRow[];
	appErrors: AdminChatUserAppErrorRow[];
	classificationJobs?: AdminChatClassificationJobRow[];
	truncated?: Record<string, boolean>;
};

type AnySupabase = {
	from: (table: string) => any;
};

type FetchResult<T> = {
	rows: T[];
	truncated: boolean;
};

type UserAccumulator = AdminChatUserMetric & {
	activeDays: Set<string>;
	ttfrValues: number[];
	projectIds: Set<string>;
	topicCounts: Map<string, number>;
	projectCounts: Map<string, number>;
	toolCounts: Map<string, { count: number; failures: number }>;
	longest_session_turns: number;
	longest_session_messages: number;
	error_count: number;
	searchParts: string[];
};

type SessionAccumulator = AdminChatSessionMetric & {
	ttfrValues: number[];
	messageTokenTotal: number;
	sessionTokenTotal: number;
	usageTokenTotal: number;
	startMs: number | null;
	endMs: number | null;
	searchParts: string[];
};

type DetailBuild = {
	response: AdminChatUsersResponse;
	allUsers: AdminChatUserMetric[];
	allSessions: AdminChatSessionMetric[];
	userAccumulators: Map<string, UserAccumulator>;
	sessionAccumulators: Map<string, SessionAccumulator>;
	errorsByUser: Map<string, AdminChatUserDetailResponse['errors']>;
	toolsByUser: Map<string, AdminChatUserDetailResponse['tools']>;
	entitiesByUser: Map<string, AdminChatUserDetailResponse['entities']>;
	entityChangesByUser: Map<string, AdminChatUserDetailResponse['entity_changes']>;
	timelineByUser: Map<string, AdminChatUserDetailResponse['timeline']>;
};

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_SOURCE = 50_000;
const ID_CHUNK_SIZE = 250;
function numberValue(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function textValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function timeframeToMs(timeframe: AdminChatUserAnalyticsTimeframe): number {
	switch (timeframe) {
		case '24h':
			return 24 * 60 * 60 * 1000;
		case '30d':
			return 30 * 24 * 60 * 60 * 1000;
		case '90d':
			return 90 * 24 * 60 * 60 * 1000;
		case '7d':
		default:
			return 7 * 24 * 60 * 60 * 1000;
	}
}

function dateMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = new Date(value).getTime();
	return Number.isFinite(parsed) ? parsed : null;
}

function isoOrNull(value: string | null | undefined): string | null {
	const parsed = dateMs(value);
	return parsed === null ? null : new Date(parsed).toISOString();
}

function maxIso(...values: Array<string | null | undefined>): string | null {
	let max: number | null = null;
	for (const value of values) {
		const parsed = dateMs(value);
		if (parsed === null) continue;
		if (max === null || parsed > max) max = parsed;
	}
	return max === null ? null : new Date(max).toISOString();
}

function minIso(current: string | null, next: string | null | undefined): string | null {
	const nextMs = dateMs(next);
	if (nextMs === null) return current;
	const currentMs = dateMs(current);
	if (currentMs === null || nextMs < currentMs) return new Date(nextMs).toISOString();
	return current;
}

function dayKey(value: string | null | undefined): string | null {
	const parsed = dateMs(value);
	if (parsed === null) return null;
	return new Date(parsed).toISOString().slice(0, 10);
}

function percentile(values: number[], target: number): number | null {
	const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (filtered.length === 0) return null;
	const index = Math.min(filtered.length - 1, Math.ceil((target / 100) * filtered.length) - 1);
	return Math.round(filtered[index] ?? 0);
}

function consecutiveDayStreak(days: Set<string>): number {
	const sorted = [...days].sort((a, b) => b.localeCompare(a));
	if (sorted.length === 0) return 0;
	let streak = 1;
	let cursor = new Date(`${sorted[0]}T00:00:00.000Z`).getTime();
	for (let index = 1; index < sorted.length; index += 1) {
		const current = new Date(`${sorted[index]}T00:00:00.000Z`).getTime();
		const diffDays = Math.round((cursor - current) / (24 * 60 * 60 * 1000));
		if (diffDays !== 1) break;
		streak += 1;
		cursor = current;
	}
	return streak;
}

function addCount(map: Map<string, number>, key: string | null | undefined, amount = 1): void {
	const normalized = textValue(key);
	if (!normalized) return;
	map.set(normalized, (map.get(normalized) ?? 0) + amount);
}

function topCounts(map: Map<string, number>, limit: number): Array<{ key: string; count: number }> {
	return [...map.entries()]
		.map(([key, count]) => ({ key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
		.slice(0, limit);
}

function normalizeSearch(value: string): string {
	return value
		.replace(/[%*,()]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function buildTitle(session: AdminChatUserSessionRow): string {
	const explicitTitle = textValue(session.title) ?? textValue(session.auto_title);
	if (explicitTitle) return explicitTitle;
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `Agent Session (${contextType})`;
}

function classifySession(
	session: AdminChatUserSessionRow
): AdminChatSessionMetric['classification_state'] {
	const classifiedAt = dateMs(session.last_classified_at);
	if (classifiedAt === null) return 'missing';
	const lastActivity = dateMs(
		maxIso(session.last_message_at, session.updated_at, session.created_at)
	);
	if (lastActivity !== null && classifiedAt < lastActivity) return 'stale';
	return 'classified';
}

function classificationJobSessionId(job: AdminChatClassificationJobRow): string | null {
	if (!job.metadata || typeof job.metadata !== 'object' || Array.isArray(job.metadata)) {
		return null;
	}
	const sessionId = (job.metadata as Record<string, unknown>).sessionId;
	return textValue(sessionId);
}

function classificationJobSortMs(job: AdminChatClassificationJobRow): number {
	return dateMs(job.created_at) ?? dateMs(job.updated_at) ?? 0;
}

function latestClassificationJobsBySession(
	jobs: AdminChatClassificationJobRow[] | undefined
): Map<string, AdminChatClassificationJobRow> {
	const latest = new Map<string, AdminChatClassificationJobRow>();
	for (const job of jobs ?? []) {
		const sessionId = classificationJobSessionId(job);
		if (!sessionId) continue;
		const existing = latest.get(sessionId);
		if (!existing || classificationJobSortMs(job) > classificationJobSortMs(existing)) {
			latest.set(sessionId, job);
		}
	}
	return latest;
}

function publicClassificationJob(
	job: AdminChatClassificationJobRow | null | undefined
): AdminChatClassificationJobSummary | null {
	if (!job) return null;
	return {
		job_id: job.id,
		queue_job_id: textValue(job.queue_job_id),
		status: textValue(job.status) ?? 'unknown',
		error_message: textValue(job.error_message),
		queued_at: isoOrNull(job.created_at),
		started_at: isoOrNull(job.started_at),
		completed_at: isoOrNull(job.completed_at),
		updated_at: isoOrNull(job.updated_at)
	};
}

function userErrorCount(user: AdminChatUserMetric): number {
	return (
		user.message_error_count +
		user.tool_failure_count +
		user.llm_failure_count +
		user.validation_failure_count +
		user.failed_turn_count +
		user.cancelled_turn_count
	);
}

function metricNumber(user: AdminChatUserMetric, field: AdminChatUserSortField): number {
	switch (field) {
		case 'last_activity_at':
			return dateMs(user.last_activity_at) ?? 0;
		case 'p95_ttfr_ms':
			return user.ttfr_p95_ms ?? -1;
		case 'max_ttfr_ms':
			return user.ttfr_max_ms ?? -1;
		case 'longest_session_turns':
			return (
				(user as AdminChatUserMetric & { longest_session_turns?: number })
					.longest_session_turns ?? 0
			);
		case 'longest_session_messages':
			return (
				(user as AdminChatUserMetric & { longest_session_messages?: number })
					.longest_session_messages ?? 0
			);
		default:
			return numberValue((user as unknown as Record<string, unknown>)[field]);
	}
}

function sessionMetricNumber(
	session: AdminChatSessionMetric,
	field: AdminChatSessionSortField
): number {
	switch (field) {
		case 'last_activity_at':
			return dateMs(session.last_activity_at) ?? 0;
		case 'created_at':
			return dateMs(session.created_at) ?? 0;
		case 'p95_ttfr_ms':
			return session.ttfr_p95_ms ?? -1;
		case 'max_ttfr_ms':
			return session.ttfr_max_ms ?? -1;
		case 'duration_ms':
			return session.duration_ms ?? -1;
		default:
			return numberValue((session as unknown as Record<string, unknown>)[field]);
	}
}

function makeStrictPreview(user: UserAccumulator): string {
	const sessionPhrase = user.session_count === 1 ? '1 session' : `${user.session_count} sessions`;
	const dayPhrase = user.active_day_count === 1 ? '1 day' : `${user.active_day_count || 0} days`;
	const parts = [`${sessionPhrase} across ${dayPhrase}.`];
	const topics = user.top_topics.map((topic) => topic.topic).slice(0, 3);
	if (user.project_count > 0) {
		parts.push(
			`Project context: ${user.project_count} project${user.project_count === 1 ? '' : 's'}.`
		);
	}
	if (topics.length > 0) {
		parts.push(`Topics: ${topics.join(', ')}.`);
	}
	if (
		user.created_entity_count > 0 ||
		user.updated_entity_count > 0 ||
		user.deleted_entity_count > 0
	) {
		const entityParts = [];
		if (user.created_entity_count > 0) entityParts.push(`${user.created_entity_count} created`);
		if (user.updated_entity_count > 0) entityParts.push(`${user.updated_entity_count} updated`);
		if (user.deleted_entity_count > 0) entityParts.push(`${user.deleted_entity_count} deleted`);
		parts.push(`Project entities: ${entityParts.join(', ')}.`);
	}
	if (user.slow_turn_count > 0) {
		parts.push(
			`${user.slow_turn_count} slow first-response turn${user.slow_turn_count === 1 ? '' : 's'}.`
		);
	}
	return parts.join(' ');
}

function emptyUserAccumulator(userId: string, user?: AdminChatUserRow): UserAccumulator {
	return {
		user_id: userId,
		email: user?.email ?? '',
		name: user?.name ?? null,
		first_chat_at: null,
		last_activity_at: null,
		active_day_count: 0,
		consecutive_day_streak: 0,
		session_count: 0,
		project_session_count: 0,
		global_session_count: 0,
		turn_count: 0,
		completed_turn_count: 0,
		failed_turn_count: 0,
		cancelled_turn_count: 0,
		running_turn_count: 0,
		message_count: 0,
		user_message_count: 0,
		assistant_message_count: 0,
		message_error_count: 0,
		tool_call_count: 0,
		tool_failure_count: 0,
		tool_failure_rate: 0,
		llm_call_count: 0,
		llm_failure_count: 0,
		validation_failure_count: 0,
		ttfr_p50_ms: null,
		ttfr_p95_ms: null,
		ttfr_max_ms: null,
		slow_turn_count: 0,
		total_tokens: 0,
		total_cost_usd: 0,
		created_entity_count: 0,
		updated_entity_count: 0,
		deleted_entity_count: 0,
		project_count: 0,
		top_topics: [],
		top_projects: [],
		top_tools: [],
		preview: '',
		activeDays: new Set<string>(),
		ttfrValues: [],
		projectIds: new Set<string>(),
		topicCounts: new Map<string, number>(),
		projectCounts: new Map<string, number>(),
		toolCounts: new Map<string, { count: number; failures: number }>(),
		longest_session_turns: 0,
		longest_session_messages: 0,
		error_count: 0,
		searchParts: []
	};
}

function pushActivityDay(user: UserAccumulator | null, value: string | null | undefined): void {
	if (!user) return;
	const key = dayKey(value);
	if (key) user.activeDays.add(key);
}

function timelineEntry(
	map: Map<string, AdminChatUserDetailResponse['timeline'][number]>,
	date: string
): AdminChatUserDetailResponse['timeline'][number] {
	const existing = map.get(date);
	if (existing) return existing;
	const entry = {
		date,
		session_count: 0,
		turn_count: 0,
		message_count: 0,
		slow_turn_count: 0,
		error_count: 0,
		created_entity_count: 0,
		top_topics: [],
		project_names: []
	};
	map.set(date, entry);
	return entry;
}

function addTimelineTextSet(
	sets: Map<string, { topics: Set<string>; projects: Set<string> }>,
	date: string,
	kind: 'topics' | 'projects',
	value: string | null | undefined
): void {
	const normalized = textValue(value);
	if (!normalized) return;
	const bucket = sets.get(date) ?? { topics: new Set<string>(), projects: new Set<string>() };
	bucket[kind].add(normalized);
	sets.set(date, bucket);
}

function extractAffectedEntityChanges(
	value: unknown,
	projectId: string | null,
	sessionId: string
): AdminChatUserProjectLogRow[] {
	const rows: AdminChatUserProjectLogRow[] = [];
	const candidates = Array.isArray(value)
		? value
		: value && typeof value === 'object'
			? Object.values(value as Record<string, unknown>)
			: [];

	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
		const record = candidate as Record<string, unknown>;
		const entityId = textValue(record.entity_id) ?? textValue(record.id);
		const entityType = textValue(record.entity_type) ?? textValue(record.type);
		const action = textValue(record.action) ?? textValue(record.operation);
		if (!entityId || !entityType || !action) continue;
		rows.push({
			id: `tool:${sessionId}:${entityType}:${entityId}:${action}`,
			chat_session_id: sessionId,
			project_id: textValue(record.project_id) ?? projectId,
			entity_type: entityType,
			entity_id: entityId,
			action,
			change_source: 'chat_tool_affected_entities',
			created_at: textValue(record.created_at)
		});
	}
	return rows;
}

function extractRedactedEntityChanges(
	value: unknown,
	projectId: string | null
): AdminChatRedactedTurn['entity_changes'] {
	const changes: AdminChatRedactedTurn['entity_changes'] = [];
	const candidates = Array.isArray(value)
		? value
		: value && typeof value === 'object'
			? Object.values(value as Record<string, unknown>)
			: [];

	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
		const record = candidate as Record<string, unknown>;
		const entityId = textValue(record.entity_id) ?? textValue(record.id);
		const entityType = textValue(record.entity_type) ?? textValue(record.type);
		const action = textValue(record.action) ?? textValue(record.operation);
		if (!entityId || !entityType || !action) continue;
		changes.push({
			action,
			entity_type: entityType,
			entity_id: entityId,
			entity_title:
				textValue(record.entity_title) ?? textValue(record.title) ?? textValue(record.name),
			project_id: textValue(record.project_id) ?? projectId
		});
	}

	return changes;
}

function formatDurationForSummary(value: number | null | undefined): string {
	if (value === null || value === undefined) return '-';
	if (value < 1000) return `${Math.round(value)}ms`;
	return `${(value / 1000).toFixed(1)}s`;
}

function redactedEventSeverity(
	status: string | null | undefined,
	hasErrors = false
): AdminChatRedactedSessionTimelineEvent['severity'] {
	if (hasErrors || status === 'failed') return 'error';
	if (status === 'cancelled') return 'warning';
	if (status === 'completed' || status === 'success') return 'success';
	return 'info';
}

function passesUserFilters(
	user: UserAccumulator,
	query: Pick<AdminChatUserAnalyticsQuery, 'errors' | 'tool_bucket' | 'entity_action' | 'search'>
): boolean {
	if (query.errors === 'only' && user.error_count === 0) return false;
	if (query.errors === 'none' && user.error_count > 0) return false;

	if (query.tool_bucket === 'none' && user.tool_call_count > 0) return false;
	if (query.tool_bucket === 'some' && user.tool_call_count === 0) return false;
	if (query.tool_bucket === 'heavy' && user.tool_call_count < 20) return false;

	if (query.entity_action === 'created' && user.created_entity_count === 0) return false;
	if (query.entity_action === 'updated' && user.updated_entity_count === 0) return false;
	if (query.entity_action === 'deleted' && user.deleted_entity_count === 0) return false;

	const search = normalizeSearch(query.search);
	if (!search) return true;
	return user.searchParts.some((part) => part.toLowerCase().includes(search));
}

function publicUserMetric(user: UserAccumulator): AdminChatUserMetric {
	const {
		activeDays: _activeDays,
		ttfrValues: _ttfrValues,
		projectIds: _projectIds,
		topicCounts: _topicCounts,
		projectCounts: _projectCounts,
		toolCounts: _toolCounts,
		longest_session_turns: _longestSessionTurns,
		longest_session_messages: _longestSessionMessages,
		error_count: _errorCount,
		searchParts: _searchParts,
		...metric
	} = user;
	return metric;
}

function publicSessionMetric(session: SessionAccumulator): AdminChatSessionMetric {
	const {
		ttfrValues: _ttfrValues,
		messageTokenTotal: _messageTokenTotal,
		sessionTokenTotal: _sessionTokenTotal,
		usageTokenTotal: _usageTokenTotal,
		startMs: _startMs,
		endMs: _endMs,
		searchParts: _searchParts,
		...metric
	} = session;
	return metric;
}

async function fetchPagedRows<T>(
	createQuery: () => any,
	maxRows = MAX_ROWS_PER_SOURCE
): Promise<FetchResult<T>> {
	const rows: T[] = [];
	let truncated = false;

	for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
		const pageSize = Math.min(PAGE_SIZE, maxRows - offset);
		const { data, error } = await createQuery().range(offset, offset + pageSize - 1);
		if (error) throw error;
		const pageRows = (data ?? []) as T[];
		rows.push(...pageRows);
		if (pageRows.length < pageSize) break;
		if (rows.length >= maxRows) {
			truncated = true;
			break;
		}
	}

	return { rows, truncated };
}

function chunks<T>(items: T[], size: number): T[][] {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

async function fetchChunkedRows<T>(
	ids: string[],
	createQuery: (chunk: string[]) => any,
	maxRows = MAX_ROWS_PER_SOURCE
): Promise<FetchResult<T>> {
	const rows: T[] = [];
	let truncated = false;
	for (const chunk of chunks([...new Set(ids)].filter(Boolean), ID_CHUNK_SIZE)) {
		if (rows.length >= maxRows) {
			truncated = true;
			break;
		}
		const result = await fetchPagedRows<T>(() => createQuery(chunk), maxRows - rows.length);
		rows.push(...result.rows);
		if (result.truncated) {
			truncated = true;
			break;
		}
	}
	return { rows, truncated };
}

function buildAdminChatUserAnalyticsCore(
	input: BuildAdminChatUserAnalyticsInput,
	query: AdminChatUserAnalyticsQuery
): DetailBuild {
	const usersById = new Map(input.users.map((user) => [user.id, user]));
	const projectsById = new Map(input.projects.map((project) => [project.id, project]));
	const projectIdsBySession = new Map<string, Set<string>>();
	const classificationJobsBySession = latestClassificationJobsBySession(input.classificationJobs);

	for (const session of input.sessions) {
		const directProjectId =
			session.context_type === 'project' ? textValue(session.entity_id) : null;
		if (!directProjectId) continue;
		projectIdsBySession.set(session.id, new Set([directProjectId]));
	}

	for (const link of input.sessionProjects) {
		const sessionId = textValue(link.chat_session_id);
		const projectId = textValue(link.project_id);
		if (!sessionId || !projectId) continue;
		const ids = projectIdsBySession.get(sessionId) ?? new Set<string>();
		ids.add(projectId);
		projectIdsBySession.set(sessionId, ids);
	}

	const sessionAccumulators = new Map<string, SessionAccumulator>();
	const userAccumulators = new Map<string, UserAccumulator>();
	const turnToSession = new Map<string, string>();
	const appErrorUsers = new Set<string>();
	const errorsByUser = new Map<string, AdminChatUserDetailResponse['errors']>();
	const timelineMapsByUser = new Map<
		string,
		Map<string, AdminChatUserDetailResponse['timeline'][number]>
	>();
	const timelineSetsByUser = new Map<
		string,
		Map<string, { topics: Set<string>; projects: Set<string> }>
	>();
	const toolDurationsByUser = new Map<
		string,
		Map<
			string,
			{
				tool_name: string;
				gateway_op: string | null;
				count: number;
				failures: number;
				durations: number[];
			}
		>
	>();
	const entityGroupsByUser = new Map<
		string,
		Map<string, AdminChatUserDetailResponse['entities'][number]>
	>();
	const entityChangesByUser = new Map<string, AdminChatUserDetailResponse['entity_changes']>();

	function ensureUser(userId: string): UserAccumulator {
		const existing = userAccumulators.get(userId);
		if (existing) return existing;
		const user = emptyUserAccumulator(userId, usersById.get(userId));
		user.searchParts.push(user.user_id, user.email, user.name ?? '');
		userAccumulators.set(userId, user);
		return user;
	}

	function ensureErrorList(userId: string): AdminChatUserDetailResponse['errors'] {
		const list = errorsByUser.get(userId) ?? [];
		errorsByUser.set(userId, list);
		return list;
	}

	function ensureTimelineMap(
		userId: string
	): Map<string, AdminChatUserDetailResponse['timeline'][number]> {
		const existing = timelineMapsByUser.get(userId);
		if (existing) return existing;
		const map = new Map<string, AdminChatUserDetailResponse['timeline'][number]>();
		timelineMapsByUser.set(userId, map);
		return map;
	}

	function ensureTimelineSets(
		userId: string
	): Map<string, { topics: Set<string>; projects: Set<string> }> {
		const existing = timelineSetsByUser.get(userId);
		if (existing) return existing;
		const map = new Map<string, { topics: Set<string>; projects: Set<string> }>();
		timelineSetsByUser.set(userId, map);
		return map;
	}

	for (const session of input.sessions) {
		const userId = textValue(session.user_id);
		if (!userId) continue;
		const user = ensureUser(userId);
		const title = buildTitle(session);
		const topics = Array.isArray(session.chat_topics)
			? session.chat_topics.filter(
					(topic): topic is string => typeof topic === 'string' && topic.trim().length > 0
				)
			: [];
		const projectIds = [...(projectIdsBySession.get(session.id) ?? new Set<string>())];
		const projectNames = projectIds
			.map((projectId) => projectsById.get(projectId)?.name ?? null)
			.filter((name): name is string => Boolean(name));
		const createdAt = isoOrNull(session.created_at) ?? new Date(0).toISOString();
		const lastActivityAt = maxIso(
			session.last_message_at,
			session.updated_at,
			session.created_at
		);
		const classificationState = classifySession(session);
		const classificationJob = publicClassificationJob(
			classificationJobsBySession.get(session.id)
		);

		const accumulator: SessionAccumulator = {
			session_id: session.id,
			user_id: userId,
			user_email: user.email,
			user_name: user.name,
			title,
			context_type: session.context_type ?? 'global',
			entity_id: session.entity_id ?? null,
			project_ids: projectIds,
			project_names: projectNames,
			status: session.status ?? 'unknown',
			created_at: createdAt,
			last_activity_at: lastActivityAt,
			last_classified_at: isoOrNull(session.last_classified_at),
			classification_state: classificationState,
			classification_job: classificationJob,
			topics,
			summary_preview: null,
			turn_count: 0,
			message_count: 0,
			user_message_count: 0,
			assistant_message_count: 0,
			tool_call_count: 0,
			tool_failure_count: 0,
			llm_call_count: 0,
			llm_failure_count: 0,
			validation_failure_count: 0,
			ttfr_p50_ms: null,
			ttfr_p95_ms: null,
			ttfr_max_ms: null,
			slow_turn_count: 0,
			duration_ms: null,
			total_tokens: 0,
			total_cost_usd: 0,
			created_entity_count: 0,
			updated_entity_count: 0,
			deleted_entity_count: 0,
			has_errors: false,
			has_slow_response: false,
			ttfrValues: [],
			messageTokenTotal: 0,
			sessionTokenTotal: numberValue(session.total_tokens_used),
			usageTokenTotal: 0,
			startMs: dateMs(session.created_at),
			endMs: dateMs(lastActivityAt),
			searchParts: [
				session.id,
				title,
				session.context_type ?? '',
				classificationState,
				classificationJob?.status ?? '',
				...topics,
				...projectNames
			]
		};

		sessionAccumulators.set(session.id, accumulator);

		user.session_count += 1;
		user.first_chat_at = minIso(user.first_chat_at, session.created_at);
		user.last_activity_at = maxIso(user.last_activity_at, lastActivityAt);
		pushActivityDay(user, lastActivityAt ?? session.created_at);
		if (projectIds.length > 0 || session.context_type === 'project') {
			user.project_session_count += 1;
		}
		if ((session.context_type ?? 'global') === 'global') {
			user.global_session_count += 1;
		}
		for (const topic of topics) {
			addCount(user.topicCounts, topic);
			user.searchParts.push(topic);
		}
		for (const projectId of projectIds) {
			user.projectIds.add(projectId);
			addCount(user.projectCounts, projectId);
			user.searchParts.push(projectId, projectsById.get(projectId)?.name ?? '');
		}
		user.searchParts.push(session.id, title, session.context_type ?? '');

		const timelineDate = dayKey(lastActivityAt ?? session.created_at);
		if (timelineDate) {
			const entry = timelineEntry(ensureTimelineMap(userId), timelineDate);
			entry.session_count += 1;
			const sets = ensureTimelineSets(userId);
			for (const topic of topics) addTimelineTextSet(sets, timelineDate, 'topics', topic);
			for (const name of projectNames)
				addTimelineTextSet(sets, timelineDate, 'projects', name);
		}
	}

	for (const message of input.messages) {
		const sessionId = textValue(message.session_id);
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = textValue(message.user_id) ?? session?.user_id ?? null;
		if (!session || !userId) continue;
		const user = ensureUser(userId);
		session.message_count += 1;
		user.message_count += 1;
		const role = message.role ?? 'unknown';
		if (role === 'user') {
			session.user_message_count += 1;
			user.user_message_count += 1;
		}
		if (role === 'assistant') {
			session.assistant_message_count += 1;
			user.assistant_message_count += 1;
		}
		const tokens = numberValue(message.total_tokens);
		session.messageTokenTotal += tokens;
		user.last_activity_at = maxIso(user.last_activity_at, message.created_at);
		session.last_activity_at = maxIso(session.last_activity_at, message.created_at);
		pushActivityDay(user, message.created_at);
		if (message.error_message || message.error_code) {
			user.message_error_count += 1;
			user.error_count += 1;
			session.has_errors = true;
			ensureErrorList(userId).push({
				source: 'message',
				session_id: sessionId,
				turn_run_id: null,
				error_message: message.error_message ?? message.error_code ?? 'Message error',
				severity: null,
				created_at: isoOrNull(message.created_at) ?? new Date(0).toISOString()
			});
		}
		const timelineDate = dayKey(message.created_at);
		if (timelineDate) {
			const entry = timelineEntry(ensureTimelineMap(userId), timelineDate);
			entry.message_count += 1;
			if (message.error_message || message.error_code) entry.error_count += 1;
		}
	}

	for (const turn of input.turnRuns) {
		const sessionId = textValue(turn.session_id);
		if (sessionId && turn.id) turnToSession.set(turn.id, sessionId);
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = textValue(turn.user_id) ?? session?.user_id ?? null;
		if (!session || !userId) continue;
		const user = ensureUser(userId);
		const status = turn.status ?? 'unknown';
		const validationFailures = numberValue(turn.validation_failure_count);
		const start = dateMs(turn.started_at ?? turn.created_at);
		const finish = dateMs(turn.finished_at);

		session.turn_count += 1;
		session.validation_failure_count += validationFailures;
		session.startMs =
			session.startMs === null
				? start
				: start === null
					? session.startMs
					: Math.min(session.startMs, start);
		session.endMs =
			session.endMs === null
				? finish
				: finish === null
					? session.endMs
					: Math.max(session.endMs, finish);

		user.turn_count += 1;
		user.validation_failure_count += validationFailures;
		user.last_activity_at = maxIso(
			user.last_activity_at,
			turn.started_at ?? turn.created_at,
			turn.finished_at
		);
		pushActivityDay(user, turn.started_at ?? turn.created_at);

		if (status === 'completed') user.completed_turn_count += 1;
		else if (status === 'failed') user.failed_turn_count += 1;
		else if (status === 'cancelled') user.cancelled_turn_count += 1;
		else if (status === 'running') user.running_turn_count += 1;

		if (status === 'failed' || status === 'cancelled' || validationFailures > 0) {
			user.error_count +=
				status === 'failed' || status === 'cancelled' ? 1 : validationFailures;
			session.has_errors = true;
		}

		if (status === 'failed' || status === 'cancelled') {
			ensureErrorList(userId).push({
				source: 'turn',
				session_id: sessionId,
				turn_run_id: turn.id,
				error_message: turn.finished_reason ?? `Turn ${status}`,
				severity: status === 'failed' ? 'error' : 'warning',
				created_at:
					isoOrNull(turn.finished_at ?? turn.started_at ?? turn.created_at) ??
					new Date(0).toISOString()
			});
		}
		if (validationFailures > 0) {
			ensureErrorList(userId).push({
				source: 'validation',
				session_id: sessionId,
				turn_run_id: turn.id,
				error_message: `${validationFailures} validation failure${validationFailures === 1 ? '' : 's'}`,
				severity: 'warning',
				created_at:
					isoOrNull(turn.finished_at ?? turn.started_at ?? turn.created_at) ??
					new Date(0).toISOString()
			});
		}

		for (const part of [
			turn.first_lane,
			turn.first_skill_path,
			turn.first_canonical_op,
			turn.first_help_path,
			turn.cache_source
		]) {
			if (part) {
				user.searchParts.push(part);
				session.searchParts.push(part);
			}
		}

		const timelineDate = dayKey(turn.started_at ?? turn.created_at);
		if (timelineDate) {
			const entry = timelineEntry(ensureTimelineMap(userId), timelineDate);
			entry.turn_count += 1;
			if (status === 'failed' || status === 'cancelled' || validationFailures > 0) {
				entry.error_count += 1;
			}
		}
	}

	for (const timing of input.timingRows) {
		const sessionId =
			textValue(timing.session_id) ??
			(timing.turn_run_id ? turnToSession.get(timing.turn_run_id) : null);
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = textValue(timing.user_id) ?? session?.user_id ?? null;
		if (!session || !userId) continue;
		const user = ensureUser(userId);
		const ttfr = numberValue(timing.time_to_first_response_ms);
		if (ttfr > 0) {
			session.ttfrValues.push(ttfr);
			user.ttfrValues.push(ttfr);
			if (ttfr > query.slow_threshold_ms) {
				session.slow_turn_count += 1;
				session.has_slow_response = true;
				user.slow_turn_count += 1;
				const timelineDate = dayKey(timing.created_at);
				if (timelineDate) {
					timelineEntry(ensureTimelineMap(userId), timelineDate).slow_turn_count += 1;
				}
			}
		}
	}

	for (const tool of input.toolExecutions) {
		const sessionId = textValue(tool.session_id);
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = session?.user_id ?? null;
		if (!session || !userId) continue;
		const user = ensureUser(userId);
		const toolName = textValue(tool.tool_name) ?? 'unknown';
		const gatewayOp = textValue(tool.gateway_op);
		const failed = tool.success === false || Boolean(tool.error_message);
		session.tool_call_count += 1;
		user.tool_call_count += 1;
		if (failed) {
			session.tool_failure_count += 1;
			session.has_errors = true;
			user.tool_failure_count += 1;
			user.error_count += 1;
			ensureErrorList(userId).push({
				source: 'tool',
				session_id: sessionId,
				turn_run_id: textValue(tool.turn_run_id),
				error_message: tool.error_message ?? `${toolName} failed`,
				severity: 'error',
				created_at: isoOrNull(tool.created_at) ?? new Date(0).toISOString()
			});
		}
		const current = user.toolCounts.get(toolName) ?? { count: 0, failures: 0 };
		current.count += 1;
		if (failed) current.failures += 1;
		user.toolCounts.set(toolName, current);
		user.searchParts.push(toolName, gatewayOp ?? '', tool.help_path ?? '');
		session.searchParts.push(toolName, gatewayOp ?? '', tool.help_path ?? '');

		const toolKey = `${toolName}\u0000${gatewayOp ?? ''}`;
		const toolMap = toolDurationsByUser.get(userId) ?? new Map();
		const toolGroup = toolMap.get(toolKey) ?? {
			tool_name: toolName,
			gateway_op: gatewayOp,
			count: 0,
			failures: 0,
			durations: []
		};
		toolGroup.count += 1;
		if (failed) toolGroup.failures += 1;
		const duration = numberValue(tool.execution_time_ms);
		if (duration > 0) toolGroup.durations.push(duration);
		toolMap.set(toolKey, toolGroup);
		toolDurationsByUser.set(userId, toolMap);
	}

	for (const usage of input.usageRows) {
		const sessionId =
			textValue(usage.chat_session_id) ??
			(usage.turn_run_id ? turnToSession.get(usage.turn_run_id) : null) ??
			null;
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = textValue(usage.user_id) ?? session?.user_id ?? null;
		if (!session || !userId) continue;
		const user = ensureUser(userId);
		const tokens = numberValue(usage.total_tokens);
		const cost = resolveUsageLogCostBreakdown(usage).totalCost;
		const failed = usage.status !== 'success' || Boolean(usage.error_message);

		session.llm_call_count += 1;
		session.usageTokenTotal += tokens;
		session.total_cost_usd += cost;
		user.llm_call_count += 1;
		user.total_cost_usd += cost;
		if (failed) {
			session.llm_failure_count += 1;
			session.has_errors = true;
			user.llm_failure_count += 1;
			user.error_count += 1;
			ensureErrorList(userId).push({
				source: 'llm',
				session_id: sessionId,
				turn_run_id: textValue(usage.turn_run_id),
				error_message: usage.error_message ?? `LLM status: ${usage.status ?? 'unknown'}`,
				severity: 'error',
				created_at: isoOrNull(usage.created_at) ?? new Date(0).toISOString()
			});
		}
		for (const part of [
			usage.model_used,
			usage.model_requested,
			usage.provider,
			usage.profile
		]) {
			if (part) {
				user.searchParts.push(part);
				session.searchParts.push(part);
			}
		}
	}

	const hasProjectLogsBySession = new Set(
		input.projectLogs.map((row) => textValue(row.chat_session_id)).filter(Boolean) as string[]
	);
	const fallbackProjectLogs = input.toolExecutions.flatMap((tool) => {
		const sessionId = textValue(tool.session_id);
		if (!sessionId || hasProjectLogsBySession.has(sessionId)) return [];
		const session = sessionAccumulators.get(sessionId);
		return extractAffectedEntityChanges(
			tool.affected_entities,
			session?.project_ids[0] ?? null,
			sessionId
		);
	});

	for (const log of [...input.projectLogs, ...fallbackProjectLogs]) {
		const sessionId = textValue(log.chat_session_id);
		const session = sessionId ? sessionAccumulators.get(sessionId) : null;
		const userId = session?.user_id ?? textValue(log.changed_by);
		if (!sessionId || !session || !userId) continue;
		const user = ensureUser(userId);
		const action = (log.action ?? '').toLowerCase();
		if (action.includes('create')) {
			session.created_entity_count += 1;
			user.created_entity_count += 1;
		} else if (action.includes('update')) {
			session.updated_entity_count += 1;
			user.updated_entity_count += 1;
		} else if (action.includes('delete') || action.includes('archive')) {
			session.deleted_entity_count += 1;
			user.deleted_entity_count += 1;
		}
		const projectId = textValue(log.project_id);
		const projectName = projectId ? (projectsById.get(projectId)?.name ?? null) : null;
		if (projectId) {
			user.projectIds.add(projectId);
			addCount(user.projectCounts, projectId);
		}
		user.searchParts.push(log.entity_type ?? '', log.entity_id ?? '', projectName ?? '');
		session.searchParts.push(log.entity_type ?? '', log.entity_id ?? '', projectName ?? '');

		const entityMap = entityGroupsByUser.get(userId) ?? new Map();
		const key = `${projectId ?? 'unknown'}\u0000${log.entity_type ?? 'unknown'}\u0000${log.action ?? 'unknown'}`;
		const group = entityMap.get(key) ?? {
			project_id: projectId ?? '',
			project_name: projectName,
			entity_type: log.entity_type ?? 'unknown',
			action: log.action ?? 'unknown',
			count: 0
		};
		group.count += 1;
		entityMap.set(key, group);
		entityGroupsByUser.set(userId, entityMap);

		const entityChangeList = entityChangesByUser.get(userId) ?? [];
		entityChangeList.push({
			session_id: sessionId,
			project_id: projectId,
			project_name: projectName,
			entity_type: log.entity_type ?? 'unknown',
			entity_id: textValue(log.entity_id),
			entity_title: null,
			action: log.action ?? 'unknown',
			source: log.change_source ?? null,
			created_at: isoOrNull(log.created_at) ?? new Date(0).toISOString()
		});
		entityChangesByUser.set(userId, entityChangeList);

		const timelineDate = dayKey(log.created_at);
		if (timelineDate) {
			const entry = timelineEntry(ensureTimelineMap(userId), timelineDate);
			if (action.includes('create')) entry.created_entity_count += 1;
			if (projectName)
				addTimelineTextSet(
					ensureTimelineSets(userId),
					timelineDate,
					'projects',
					projectName
				);
		}
	}

	for (const error of input.appErrors) {
		const userId = textValue(error.user_id);
		if (!userId || !userAccumulators.has(userId)) continue;
		const user = ensureUser(userId);
		user.error_count += 1;
		appErrorUsers.add(userId);
		user.searchParts.push(
			error.error_message ?? '',
			error.error_type ?? '',
			error.endpoint ?? ''
		);
		ensureErrorList(userId).push({
			source: 'app',
			session_id: null,
			turn_run_id: null,
			error_message: error.error_message ?? error.error_type ?? 'Application error',
			severity: error.severity ?? null,
			created_at: isoOrNull(error.created_at) ?? new Date(0).toISOString()
		});
		const timelineDate = dayKey(error.created_at);
		if (timelineDate) timelineEntry(ensureTimelineMap(userId), timelineDate).error_count += 1;
	}

	for (const session of sessionAccumulators.values()) {
		session.total_tokens = resolveBillableTokenTotal({
			usageTokenTotal: session.usageTokenTotal,
			sessionTokenTotal: session.sessionTokenTotal,
			messageTokenTotal: session.messageTokenTotal
		});
		session.ttfr_p50_ms = percentile(session.ttfrValues, 50);
		session.ttfr_p95_ms = percentile(session.ttfrValues, 95);
		session.ttfr_max_ms = session.ttfrValues.length ? Math.max(...session.ttfrValues) : null;
		if (
			session.startMs !== null &&
			session.endMs !== null &&
			session.endMs >= session.startMs
		) {
			session.duration_ms = session.endMs - session.startMs;
		}
		session.has_errors =
			session.has_errors ||
			session.tool_failure_count > 0 ||
			session.llm_failure_count > 0 ||
			session.validation_failure_count > 0;
		const user = userAccumulators.get(session.user_id);
		if (user) {
			user.total_tokens += session.total_tokens;
			user.longest_session_turns = Math.max(user.longest_session_turns, session.turn_count);
			user.longest_session_messages = Math.max(
				user.longest_session_messages,
				session.message_count
			);
		}
	}

	for (const user of userAccumulators.values()) {
		user.active_day_count = user.activeDays.size;
		user.consecutive_day_streak = consecutiveDayStreak(user.activeDays);
		user.project_count = user.projectIds.size;
		user.tool_failure_rate =
			user.tool_call_count > 0
				? Math.round((user.tool_failure_count / user.tool_call_count) * 1000) / 10
				: 0;
		user.ttfr_p50_ms = percentile(user.ttfrValues, 50);
		user.ttfr_p95_ms = percentile(user.ttfrValues, 95);
		user.ttfr_max_ms = user.ttfrValues.length ? Math.max(...user.ttfrValues) : null;
		user.top_topics = topCounts(user.topicCounts, 5).map(({ key, count }) => ({
			topic: key,
			count
		}));
		user.top_projects = topCounts(user.projectCounts, 5).map(({ key, count }) => ({
			project_id: key,
			name: projectsById.get(key)?.name ?? null,
			count
		}));
		user.top_tools = [...user.toolCounts.entries()]
			.map(([tool_name, value]) => ({
				tool_name,
				count: value.count,
				failures: value.failures
			}))
			.sort((a, b) => b.count - a.count || a.tool_name.localeCompare(b.tool_name))
			.slice(0, 5);
		user.preview = makeStrictPreview(user);
		user.searchParts.push(
			user.preview,
			...user.top_topics.map((topic) => topic.topic),
			...user.top_projects.map((project) => project.name ?? project.project_id),
			...user.top_tools.map((tool) => tool.tool_name)
		);
	}

	const visibleUserAccumulators = [...userAccumulators.values()]
		.filter((user) => passesUserFilters(user, query))
		.sort((a, b) => {
			const direction = query.sort_order === 'asc' ? 1 : -1;
			const diff = metricNumber(a, query.sort_by) - metricNumber(b, query.sort_by);
			if (diff !== 0) return diff * direction;
			return (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '');
		});
	const visibleUserIds = new Set(visibleUserAccumulators.map((user) => user.user_id));
	const visibleSessionAccumulators = [...sessionAccumulators.values()].filter((session) =>
		visibleUserIds.has(session.user_id)
	);
	const visibleTtfrValues = visibleUserAccumulators.flatMap((user) => user.ttfrValues);

	const page = query.page;
	const limit = query.limit;
	const total = visibleUserAccumulators.length;
	const users = visibleUserAccumulators
		.slice((page - 1) * limit, page * limit)
		.map(publicUserMetric);
	const classificationMissing = [...sessionAccumulators.values()].filter(
		(session) => session.classification_state === 'missing'
	).length;
	const classificationStale = [...sessionAccumulators.values()].filter(
		(session) => session.classification_state === 'stale'
	).length;

	const response: AdminChatUsersResponse = {
		kpis: {
			active_users: visibleUserAccumulators.length,
			sessions: visibleSessionAccumulators.length,
			turns: visibleUserAccumulators.reduce((sum, user) => sum + user.turn_count, 0),
			user_messages: visibleUserAccumulators.reduce(
				(sum, user) => sum + user.user_message_count,
				0
			),
			assistant_responses: visibleUserAccumulators.reduce(
				(sum, user) => sum + user.assistant_message_count,
				0
			),
			ttfr_p50_ms: percentile(visibleTtfrValues, 50),
			ttfr_p95_ms: percentile(visibleTtfrValues, 95),
			slow_turns: visibleUserAccumulators.reduce(
				(sum, user) => sum + user.slow_turn_count,
				0
			),
			error_impacted_users: visibleUserAccumulators.filter(
				(user) => user.error_count > 0 || appErrorUsers.has(user.user_id)
			).length,
			chat_created_entities: visibleUserAccumulators.reduce(
				(sum, user) => sum + user.created_entity_count,
				0
			)
		},
		leaderboards: {
			most_sessions: [...visibleUserAccumulators]
				.sort(
					(a, b) =>
						b.session_count - a.session_count ||
						(b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '')
				)
				.slice(0, 5)
				.map(publicUserMetric),
			slowest_first_responses: [...visibleUserAccumulators]
				.filter((user) => user.ttfr_p95_ms !== null)
				.sort((a, b) => (b.ttfr_p95_ms ?? 0) - (a.ttfr_p95_ms ?? 0))
				.slice(0, 5)
				.map(publicUserMetric),
			most_tool_calls: [...visibleUserAccumulators]
				.sort(
					(a, b) =>
						b.tool_call_count - a.tool_call_count ||
						b.tool_failure_count - a.tool_failure_count
				)
				.slice(0, 5)
				.map(publicUserMetric),
			longest_threads: [...visibleSessionAccumulators]
				.sort((a, b) => b.turn_count - a.turn_count || b.message_count - a.message_count)
				.slice(0, 5)
				.map(publicSessionMetric),
			most_requests_responses: [...visibleUserAccumulators]
				.sort((a, b) => b.message_count - a.message_count || b.turn_count - a.turn_count)
				.slice(0, 5)
				.map(publicUserMetric),
			most_created_entities: [...visibleUserAccumulators]
				.sort(
					(a, b) =>
						b.created_entity_count - a.created_entity_count ||
						b.updated_entity_count - a.updated_entity_count
				)
				.slice(0, 5)
				.map(publicUserMetric),
			most_error_impacted: [...visibleUserAccumulators]
				.sort(
					(a, b) => b.error_count - a.error_count || userErrorCount(b) - userErrorCount(a)
				)
				.slice(0, 5)
				.map(publicUserMetric)
		},
		users,
		pagination: {
			page,
			limit,
			total,
			total_pages: Math.max(1, Math.ceil(total / limit))
		},
		filter_options: {
			context_types: [
				...new Set(input.sessions.map((session) => session.context_type ?? 'global'))
			].sort(),
			topics: [...new Set(input.sessions.flatMap((session) => session.chat_topics ?? []))]
				.filter(Boolean)
				.sort()
				.slice(0, 100),
			tools: [
				...new Set(
					input.toolExecutions
						.map((tool) => textValue(tool.tool_name))
						.filter(Boolean) as string[]
				)
			].sort(),
			gateway_ops: [
				...new Set(
					input.toolExecutions
						.map((tool) => textValue(tool.gateway_op))
						.filter(Boolean) as string[]
				)
			].sort(),
			projects: [...projectsById.values()]
				.map((project) => ({ project_id: project.id, name: project.name ?? null }))
				.sort((a, b) => (a.name ?? a.project_id).localeCompare(b.name ?? b.project_id))
		},
		data_health: {
			truncated: input.truncated ?? {},
			classification_missing_sessions: classificationMissing,
			classification_stale_sessions: classificationStale,
			raw_message_content_returned: false
		}
	};

	const toolsByUser = new Map<string, AdminChatUserDetailResponse['tools']>();
	for (const [userId, map] of toolDurationsByUser.entries()) {
		toolsByUser.set(
			userId,
			[...map.values()]
				.map((tool) => ({
					tool_name: tool.tool_name,
					gateway_op: tool.gateway_op,
					count: tool.count,
					failures: tool.failures,
					p95_execution_time_ms: percentile(tool.durations, 95)
				}))
				.sort((a, b) => b.count - a.count || b.failures - a.failures)
				.slice(0, 25)
		);
	}

	const entitiesByUser = new Map<string, AdminChatUserDetailResponse['entities']>();
	for (const [userId, map] of entityGroupsByUser.entries()) {
		entitiesByUser.set(
			userId,
			[...map.values()].sort(
				(a, b) => b.count - a.count || a.entity_type.localeCompare(b.entity_type)
			)
		);
	}

	for (const [userId, changes] of entityChangesByUser.entries()) {
		entityChangesByUser.set(
			userId,
			[...changes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200)
		);
	}

	const timelineByUser = new Map<string, AdminChatUserDetailResponse['timeline']>();
	for (const [userId, map] of timelineMapsByUser.entries()) {
		const sets = timelineSetsByUser.get(userId) ?? new Map();
		timelineByUser.set(
			userId,
			[...map.values()]
				.map((entry) => ({
					...entry,
					top_topics: [...(sets.get(entry.date)?.topics ?? new Set<string>())].slice(
						0,
						5
					),
					project_names: [...(sets.get(entry.date)?.projects ?? new Set<string>())].slice(
						0,
						5
					)
				}))
				.sort((a, b) => b.date.localeCompare(a.date))
		);
	}

	assertAdminChatUserAnalyticsRedacted(response);

	return {
		response,
		allUsers: [...userAccumulators.values()].map(publicUserMetric),
		allSessions: [...sessionAccumulators.values()].map(publicSessionMetric),
		userAccumulators,
		sessionAccumulators,
		errorsByUser,
		toolsByUser,
		entitiesByUser,
		entityChangesByUser,
		timelineByUser
	};
}

export function buildAdminChatUserAnalytics(
	input: BuildAdminChatUserAnalyticsInput,
	query: AdminChatUserAnalyticsQuery
): AdminChatUsersResponse {
	return buildAdminChatUserAnalyticsCore(input, query).response;
}

export function buildAdminChatRedactedSession(
	input: BuildAdminChatUserAnalyticsInput,
	userId: string,
	sessionId: string,
	slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
): AdminChatRedactedSessionResponse | null {
	const scopedSessions = input.sessions.filter(
		(session) => session.id === sessionId && textValue(session.user_id) === userId
	);
	if (scopedSessions.length === 0) return null;
	const scopedTurnIds = new Set(
		input.turnRuns
			.filter((turn) => textValue(turn.session_id) === sessionId)
			.map((turn) => turn.id)
	);

	const scopedInput: BuildAdminChatUserAnalyticsInput = {
		sessions: scopedSessions,
		users: input.users.filter((user) => user.id === userId),
		sessionProjects: input.sessionProjects.filter(
			(link) => textValue(link.chat_session_id) === sessionId
		),
		projects: input.projects,
		messages: input.messages.filter((message) => textValue(message.session_id) === sessionId),
		turnRuns: input.turnRuns.filter((turn) => scopedTurnIds.has(turn.id)),
		timingRows: input.timingRows.filter((timing) => textValue(timing.session_id) === sessionId),
		toolExecutions: input.toolExecutions.filter(
			(tool) => textValue(tool.session_id) === sessionId
		),
		usageRows: input.usageRows.filter(
			(usage) =>
				textValue(usage.chat_session_id) === sessionId ||
				scopedTurnIds.has(textValue(usage.turn_run_id) ?? '')
		),
		projectLogs: input.projectLogs.filter(
			(log) => textValue(log.chat_session_id) === sessionId
		),
		appErrors: [],
		truncated: input.truncated
	};

	const query: AdminChatUserAnalyticsQuery = {
		timeframe: '7d',
		page: 1,
		limit: 1,
		sort_by: 'last_activity_at',
		sort_order: 'desc',
		search: '',
		user_id: userId,
		project_id: null,
		context_type: 'all',
		topic: '',
		slow_threshold_ms: slowThresholdMs,
		errors: 'all',
		tool_bucket: 'all',
		entity_action: 'all',
		classification: 'all'
	};
	const build = buildAdminChatUserAnalyticsCore(scopedInput, query);
	const sessionMetric = build.allSessions.find(
		(candidate) => candidate.session_id === sessionId && candidate.user_id === userId
	);
	if (!sessionMetric) return null;
	const session: AdminChatSessionMetric = sessionMetric;

	const turnRows = [...scopedInput.turnRuns].sort((a, b) => {
		const aMs = dateMs(a.started_at ?? a.created_at) ?? 0;
		const bMs = dateMs(b.started_at ?? b.created_at) ?? 0;
		return aMs - bMs || a.id.localeCompare(b.id);
	});
	const turnRowsById = new Map(turnRows.map((turn) => [turn.id, turn]));
	const events: AdminChatRedactedSessionTimelineEvent[] = [];
	let eventSequence = 0;

	function timestamp(value: string | null | undefined): string {
		return isoOrNull(value) ?? session.created_at;
	}

	function addEvent(event: AdminChatRedactedSessionTimelineEvent): void {
		events.push({ ...event, id: `${event.id}:${eventSequence}` });
		eventSequence += 1;
	}

	function turnForTimestamp(value: string | null | undefined): AdminChatUserTurnRunRow | null {
		if (turnRows.length === 0) return null;
		const target = dateMs(value);
		if (target === null) return turnRows.length === 1 ? (turnRows[0] ?? null) : null;
		let selected: AdminChatUserTurnRunRow | null = null;
		for (const turn of turnRows) {
			const started = dateMs(turn.started_at ?? turn.created_at);
			if (started === null) continue;
			if (started <= target) selected = turn;
			if (started > target) break;
		}
		return selected ?? turnRows[0] ?? null;
	}

	function resolveTurnId(
		turnRunId: string | null | undefined,
		createdAt: string | null | undefined
	): string | null {
		const explicit = textValue(turnRunId);
		if (explicit && turnRowsById.has(explicit)) return explicit;
		return turnForTimestamp(createdAt)?.id ?? null;
	}

	function pushGrouped<T>(
		map: Map<string, T[]>,
		ungrouped: T[],
		turnId: string | null,
		value: T
	): void {
		if (!turnId) {
			ungrouped.push(value);
			return;
		}
		const list = map.get(turnId) ?? [];
		list.push(value);
		map.set(turnId, list);
	}

	const timingByTurn = new Map<string, AdminChatUserTimingRow[]>();
	const ungroupedTimings: AdminChatUserTimingRow[] = [];
	for (const timing of scopedInput.timingRows) {
		pushGrouped(
			timingByTurn,
			ungroupedTimings,
			resolveTurnId(timing.turn_run_id, timing.created_at),
			timing
		);
	}

	const toolsByTurn = new Map<string, AdminChatUserToolExecutionRow[]>();
	const ungroupedTools: AdminChatUserToolExecutionRow[] = [];
	for (const tool of scopedInput.toolExecutions) {
		pushGrouped(
			toolsByTurn,
			ungroupedTools,
			resolveTurnId(tool.turn_run_id, tool.created_at),
			tool
		);
	}

	const usageByTurn = new Map<string, AdminChatUserUsageRow[]>();
	const ungroupedUsageRows: AdminChatUserUsageRow[] = [];
	for (const usage of scopedInput.usageRows) {
		pushGrouped(
			usageByTurn,
			ungroupedUsageRows,
			resolveTurnId(usage.turn_run_id, usage.created_at),
			usage
		);
	}

	const messageErrorsByTurn = new Map<
		string,
		Array<{ message: string; created_at: string | null | undefined }>
	>();
	const ungroupedMessageErrors: Array<{
		message: string;
		created_at: string | null | undefined;
	}> = [];
	for (const message of scopedInput.messages) {
		const errorMessage = textValue(message.error_message) ?? textValue(message.error_code);
		if (!errorMessage) continue;
		pushGrouped(
			messageErrorsByTurn,
			ungroupedMessageErrors,
			resolveTurnId(null, message.created_at),
			{ message: errorMessage, created_at: message.created_at }
		);
	}

	const logEntityChangesByTurn = new Map<
		string,
		Array<AdminChatRedactedTurn['entity_changes'][number] & { created_at?: string | null }>
	>();
	const ungroupedEntityChanges: Array<
		AdminChatRedactedTurn['entity_changes'][number] & { created_at?: string | null }
	> = [];
	for (const log of scopedInput.projectLogs) {
		const action = textValue(log.action);
		const entityType = textValue(log.entity_type);
		const entityId = textValue(log.entity_id);
		if (!action || !entityType || !entityId) continue;
		pushGrouped(
			logEntityChangesByTurn,
			ungroupedEntityChanges,
			resolveTurnId(null, log.created_at),
			{
				action,
				entity_type: entityType,
				entity_id: entityId,
				entity_title: null,
				project_id: textValue(log.project_id),
				created_at: log.created_at
			}
		);
	}

	const hasProjectLogs = scopedInput.projectLogs.length > 0;
	if (!hasProjectLogs) {
		for (const tool of scopedInput.toolExecutions) {
			const changes = extractRedactedEntityChanges(
				tool.affected_entities,
				session.project_ids[0] ?? null
			);
			if (changes.length === 0) continue;
			for (const change of changes) {
				pushGrouped(
					logEntityChangesByTurn,
					ungroupedEntityChanges,
					resolveTurnId(tool.turn_run_id, tool.created_at),
					{ ...change, created_at: tool.created_at }
				);
			}
		}
	}

	addEvent({
		id: `session:${session.session_id}:start`,
		timestamp: session.created_at,
		type: 'session',
		severity: 'info',
		turn_index: null,
		title: 'Session started',
		summary: `${session.context_type} session · ${session.status}`
	});

	const turns = turnRows.map((turn, index): AdminChatRedactedTurn => {
		const turnIndex = index + 1;
		const startedAt = timestamp(turn.started_at ?? turn.created_at);
		const finishedAt = isoOrNull(turn.finished_at);
		const startMs = dateMs(startedAt);
		const finishMs = dateMs(finishedAt);
		const durationMs =
			startMs !== null && finishMs !== null && finishMs >= startMs
				? finishMs - startMs
				: null;
		const timings = timingByTurn.get(turn.id) ?? [];
		const ttfrValues = timings
			.map((timing) => numberValue(timing.time_to_first_response_ms))
			.filter((value) => value > 0);
		const ttfeValues = timings
			.map((timing) => numberValue(timing.time_to_first_event_ms))
			.filter((value) => value > 0);
		const ttfrMs = ttfrValues.length ? Math.min(...ttfrValues) : null;
		const ttfeMs = ttfeValues.length ? Math.min(...ttfeValues) : null;
		const turnTools = toolsByTurn.get(turn.id) ?? [];
		const turnUsageRows = usageByTurn.get(turn.id) ?? [];
		const toolCallCount = Math.max(numberValue(turn.tool_call_count), turnTools.length);
		const llmPassCount = Math.max(numberValue(turn.llm_pass_count), turnUsageRows.length);
		const validationFailures = numberValue(turn.validation_failure_count);
		const errorSummaries: AdminChatRedactedTurn['error_summaries'] = [];
		const entityChanges = (logEntityChangesByTurn.get(turn.id) ?? []).map(
			({ created_at: _createdAt, ...change }) => change
		);
		const status = turn.status ?? 'unknown';

		if (status === 'failed' || status === 'cancelled') {
			errorSummaries.push({
				source: 'turn',
				message: turn.finished_reason ?? `Turn ${status}`
			});
		}
		if (validationFailures > 0) {
			errorSummaries.push({
				source: 'validation',
				message: `${validationFailures} validation failure${validationFailures === 1 ? '' : 's'}`
			});
		}
		for (const messageError of messageErrorsByTurn.get(turn.id) ?? []) {
			errorSummaries.push({ source: 'message', message: messageError.message });
		}
		for (const tool of turnTools) {
			const toolName = textValue(tool.tool_name) ?? 'Unknown tool';
			if (tool.success === false || tool.error_message) {
				errorSummaries.push({
					source: 'tool',
					message: tool.error_message ?? `${toolName} failed`
				});
			}
		}
		for (const usage of turnUsageRows) {
			if (usage.status !== 'success' || usage.error_message) {
				errorSummaries.push({
					source: 'llm',
					message: usage.error_message ?? `LLM status: ${usage.status ?? 'unknown'}`
				});
			}
		}

		addEvent({
			id: `turn:${turn.id}`,
			timestamp: startedAt,
			type: 'turn',
			severity: redactedEventSeverity(status, errorSummaries.length > 0),
			turn_index: turnIndex,
			title: `Turn ${turnIndex}: ${status}`,
			summary: [
				turn.finished_reason ? `reason ${turn.finished_reason}` : null,
				`${numberValue(turn.tool_round_count)} tool rounds`,
				`${llmPassCount} LLM passes`
			]
				.filter(Boolean)
				.join(' · ')
		});

		if (turn.context_type && turn.context_type !== session.context_type) {
			addEvent({
				id: `context:${turn.id}`,
				timestamp: startedAt,
				type: 'context_shift',
				severity: 'info',
				turn_index: turnIndex,
				title: 'Context changed',
				summary: `${session.context_type} -> ${turn.context_type}`
			});
		}

		if (ttfrMs !== null || ttfeMs !== null) {
			addEvent({
				id: `timing:${turn.id}`,
				timestamp: timestamp(timings[0]?.created_at ?? startedAt),
				type: 'timing',
				severity: ttfrMs !== null && ttfrMs > slowThresholdMs ? 'warning' : 'info',
				turn_index: turnIndex,
				title: 'First response timing',
				summary: `TTFR ${formatDurationForSummary(ttfrMs)} · TTFE ${formatDurationForSummary(ttfeMs)}`
			});
		}

		for (const tool of turnTools) {
			const toolName = textValue(tool.tool_name) ?? 'Unknown tool';
			const failed = tool.success === false || Boolean(tool.error_message);
			const pieces = [
				textValue(tool.gateway_op),
				textValue(tool.help_path),
				`${formatDurationForSummary(numberValue(tool.execution_time_ms))}`,
				`${numberValue(tool.result_count)} result${numberValue(tool.result_count) === 1 ? '' : 's'}`,
				tool.zero_result ? 'zero result' : null
			].filter(Boolean);
			addEvent({
				id: `tool:${tool.id}`,
				timestamp: timestamp(tool.created_at),
				type: 'tool',
				severity: failed ? 'error' : 'success',
				turn_index: turnIndex,
				title: toolName,
				summary: pieces.join(' · ') || (failed ? 'Tool failed' : 'Tool completed')
			});
		}

		for (const usage of turnUsageRows) {
			const model = textValue(usage.model_used) ?? textValue(usage.model_requested) ?? 'LLM';
			const failed = usage.status !== 'success' || Boolean(usage.error_message);
			const cost = resolveUsageLogCostBreakdown(usage).totalCost;
			addEvent({
				id: `llm:${usage.id}`,
				timestamp: timestamp(usage.created_at),
				type: 'llm',
				severity: failed ? 'error' : 'success',
				turn_index: turnIndex,
				title: model,
				summary: `${usage.status ?? 'unknown'} · ${numberValue(usage.total_tokens)} tokens · $${cost.toFixed(4)}`
			});
		}

		for (const change of logEntityChangesByTurn.get(turn.id) ?? []) {
			addEvent({
				id: `entity:${turn.id}:${change.entity_type}:${change.entity_id}:${change.action}`,
				timestamp: timestamp(change.created_at ?? startedAt),
				type: 'entity_change',
				severity: 'info',
				turn_index: turnIndex,
				title: `${change.action} ${change.entity_type}`,
				summary: `${change.entity_title ?? change.entity_id}${change.project_id ? ` · ${change.project_id}` : ''}`
			});
		}

		errorSummaries.forEach((errorSummary, errorIndex) => {
			addEvent({
				id: `error:${turn.id}:${errorIndex}`,
				timestamp: finishedAt ?? startedAt,
				type: 'error',
				severity: errorSummary.source === 'validation' ? 'warning' : 'error',
				turn_index: turnIndex,
				title: `${errorSummary.source} error`,
				summary: errorSummary.message
			});
		});

		return {
			turn_run_id: turn.id,
			session_id: session.session_id,
			turn_index: turnIndex,
			status,
			finished_reason: turn.finished_reason ?? null,
			started_at: startedAt,
			finished_at: finishedAt,
			duration_ms: durationMs,
			ttfr_ms: ttfrMs,
			ttfe_ms: ttfeMs,
			tool_round_count: numberValue(turn.tool_round_count),
			tool_call_count: toolCallCount,
			tool_failure_count: turnTools.filter(
				(tool) => tool.success === false || Boolean(tool.error_message)
			).length,
			validation_failure_count: validationFailures,
			llm_pass_count: llmPassCount,
			first_lane: turn.first_lane ?? null,
			first_skill_path: turn.first_skill_path ?? null,
			first_canonical_op: turn.first_canonical_op ?? null,
			cache_source: turn.cache_source ?? null,
			prepared_prompt_hit: turn.prepared_prompt_hit ?? null,
			error_summaries: errorSummaries,
			entity_changes: entityChanges
		};
	});

	for (const timing of ungroupedTimings) {
		const ttfr = numberValue(timing.time_to_first_response_ms);
		const ttfe = numberValue(timing.time_to_first_event_ms);
		addEvent({
			id: `timing:${timing.id}`,
			timestamp: timestamp(timing.created_at),
			type: 'timing',
			severity: ttfr > slowThresholdMs ? 'warning' : 'info',
			turn_index: null,
			title: 'Session timing',
			summary: `TTFR ${formatDurationForSummary(ttfr || null)} · TTFE ${formatDurationForSummary(ttfe || null)}`
		});
	}

	for (const tool of ungroupedTools) {
		const toolName = textValue(tool.tool_name) ?? 'Unknown tool';
		const failed = tool.success === false || Boolean(tool.error_message);
		addEvent({
			id: `tool:${tool.id}`,
			timestamp: timestamp(tool.created_at),
			type: 'tool',
			severity: failed ? 'error' : 'success',
			turn_index: null,
			title: toolName,
			summary:
				textValue(tool.gateway_op) ??
				textValue(tool.help_path) ??
				(failed ? 'Tool failed' : 'Tool completed')
		});
		if (failed) {
			addEvent({
				id: `error:tool:${tool.id}`,
				timestamp: timestamp(tool.created_at),
				type: 'error',
				severity: 'error',
				turn_index: null,
				title: 'tool error',
				summary: tool.error_message ?? `${toolName} failed`
			});
		}
	}

	for (const usage of ungroupedUsageRows) {
		const model = textValue(usage.model_used) ?? textValue(usage.model_requested) ?? 'LLM';
		const failed = usage.status !== 'success' || Boolean(usage.error_message);
		addEvent({
			id: `llm:${usage.id}`,
			timestamp: timestamp(usage.created_at),
			type: 'llm',
			severity: failed ? 'error' : 'success',
			turn_index: null,
			title: model,
			summary: `${usage.status ?? 'unknown'} · ${numberValue(usage.total_tokens)} tokens`
		});
		if (failed) {
			addEvent({
				id: `error:llm:${usage.id}`,
				timestamp: timestamp(usage.created_at),
				type: 'error',
				severity: 'error',
				turn_index: null,
				title: 'llm error',
				summary: usage.error_message ?? `LLM status: ${usage.status ?? 'unknown'}`
			});
		}
	}

	for (const change of ungroupedEntityChanges) {
		addEvent({
			id: `entity:session:${change.entity_type}:${change.entity_id}:${change.action}`,
			timestamp: timestamp(change.created_at),
			type: 'entity_change',
			severity: 'info',
			turn_index: null,
			title: `${change.action} ${change.entity_type}`,
			summary: `${change.entity_title ?? change.entity_id}${change.project_id ? ` · ${change.project_id}` : ''}`
		});
	}

	for (const error of ungroupedMessageErrors) {
		addEvent({
			id: `error:message:${events.length}`,
			timestamp: timestamp(error.created_at),
			type: 'error',
			severity: 'error',
			turn_index: null,
			title: 'message error',
			summary: error.message
		});
	}

	const payload: AdminChatRedactedSessionResponse = {
		session,
		turns,
		timeline: events.sort((a, b) => {
			const diff = (dateMs(a.timestamp) ?? 0) - (dateMs(b.timestamp) ?? 0);
			if (diff !== 0) return diff;
			return a.id.localeCompare(b.id);
		}),
		privacy: {
			raw_message_content_returned: false,
			raw_assistant_content_returned: false,
			raw_request_message_returned: false,
			raw_tool_arguments_returned: false,
			raw_tool_results_returned: false,
			prompt_snapshot_returned: false
		}
	};

	assertAdminChatUserAnalyticsRedacted(payload);
	return payload;
}

export async function loadAdminChatUserAnalytics(
	supabase: AnySupabase,
	query: AdminChatUserAnalyticsQuery
): Promise<AdminChatUsersResponse> {
	const input = await loadAnalyticsRows(supabase, query);
	return buildAdminChatUserAnalytics(input, query);
}

export function buildAdminChatUserDetail(
	input: BuildAdminChatUserAnalyticsInput,
	userId: string,
	query: AdminChatUserDetailQuery
): AdminChatUserDetailResponse | null {
	const listQuery: AdminChatUserAnalyticsQuery = {
		timeframe: query.timeframe,
		page: 1,
		limit: 100,
		sort_by: 'last_activity_at',
		sort_order: 'desc',
		search: query.search,
		user_id: userId,
		project_id: null,
		context_type: 'all',
		topic: '',
		slow_threshold_ms: query.slow_threshold_ms,
		errors: 'all',
		tool_bucket: 'all',
		entity_action: 'all',
		classification: 'all'
	};
	const build = buildAdminChatUserAnalyticsCore(input, listQuery);
	const summary = build.userAccumulators.get(userId);
	if (!summary) return null;
	const summaryMetric = publicUserMetric(summary);
	const sessionDirection = query.session_sort_order === 'asc' ? 1 : -1;
	const search = normalizeSearch(query.search);
	const identityMatches =
		search.length === 0 ||
		[summary.user_id, summary.email, summary.name ?? ''].some((part) =>
			part.toLowerCase().includes(search)
		);
	const sortedSessionAccumulators = [...build.sessionAccumulators.values()]
		.filter((session) => session.user_id === userId)
		.filter(
			(session) =>
				identityMatches ||
				session.searchParts.some((part) => part.toLowerCase().includes(search))
		)
		.sort((a, b) => {
			const diff =
				sessionMetricNumber(a, query.session_sort_by) -
				sessionMetricNumber(b, query.session_sort_by);
			if (diff !== 0) return diff * sessionDirection;
			return (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '');
		});
	const sessions = sortedSessionAccumulators
		.slice(
			(query.session_page - 1) * query.session_limit,
			query.session_page * query.session_limit
		)
		.map(publicSessionMetric);
	const errors = (build.errorsByUser.get(userId) ?? [])
		.sort((a, b) => b.created_at.localeCompare(a.created_at))
		.slice(0, 100);
	const detail: AdminChatUserDetailResponse = {
		user: {
			id: summaryMetric.user_id,
			email: summaryMetric.email,
			name: summaryMetric.name
		},
		summary: summaryMetric,
		timeline: build.timelineByUser.get(userId) ?? [],
		sessions,
		errors,
		tools: build.toolsByUser.get(userId) ?? [],
		entities: build.entitiesByUser.get(userId) ?? [],
		entity_changes: build.entityChangesByUser.get(userId) ?? []
	};
	assertAdminChatUserAnalyticsRedacted(detail);
	return detail;
}

export async function loadAdminChatUserDetail(
	supabase: AnySupabase,
	userId: string,
	query: AdminChatUserDetailQuery
): Promise<AdminChatUserDetailResponse | null> {
	const listQuery: AdminChatUserAnalyticsQuery = {
		timeframe: query.timeframe,
		page: 1,
		limit: 100,
		sort_by: 'last_activity_at',
		sort_order: 'desc',
		search: query.search,
		user_id: userId,
		project_id: null,
		context_type: 'all',
		topic: '',
		slow_threshold_ms: query.slow_threshold_ms,
		errors: 'all',
		tool_bucket: 'all',
		entity_action: 'all',
		classification: 'all'
	};
	const input = await loadAnalyticsRows(supabase, listQuery);
	return buildAdminChatUserDetail(input, userId, query);
}

export async function loadAdminChatRedactedSession(
	supabase: AnySupabase,
	userId: string,
	sessionId: string,
	slowThresholdMs = DEFAULT_SLOW_THRESHOLD_MS
): Promise<AdminChatRedactedSessionResponse | null> {
	const { data: sessionData, error: sessionError } = await supabase
		.from('chat_sessions')
		.select(
			'id,user_id,title,auto_title,chat_topics,context_type,entity_id,status,message_count,tool_call_count,total_tokens_used,created_at,updated_at,last_message_at,last_classified_at'
		)
		.eq('id', sessionId)
		.eq('user_id', userId)
		.maybeSingle();
	if (sessionError) throw sessionError;
	if (!sessionData) return null;

	const session = sessionData as AdminChatUserSessionRow;
	const sessionProjectsResult = await fetchPagedRows<AdminChatSessionProjectRow>(() =>
		supabase
			.from('chat_sessions_projects')
			.select('chat_session_id,project_id')
			.eq('chat_session_id', sessionId)
	);
	const directProjectId =
		session.context_type === 'project' ? textValue(session.entity_id) : null;
	const projectIds = [
		...new Set(
			[
				directProjectId,
				...sessionProjectsResult.rows.map((link) => textValue(link.project_id))
			].filter(Boolean) as string[]
		)
	];

	const [
		usersResult,
		projectsResult,
		messagesResult,
		turnsResult,
		timingResult,
		toolsResult,
		usageResult,
		logsResult
	] = await Promise.all([
		fetchPagedRows<AdminChatUserRow>(
			() => supabase.from('users').select('id,email,name').eq('id', userId),
			10
		),
		projectIds.length > 0
			? fetchChunkedRows<AdminChatProjectRow>(projectIds, (chunk) =>
					supabase.from('onto_projects').select('id,name').in('id', chunk)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		fetchPagedRows<AdminChatUserMessageRow>(() =>
			supabase
				.from('chat_messages')
				.select(
					'id,session_id,user_id,role,total_tokens,error_code,error_message,created_at'
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true })
		),
		fetchPagedRows<AdminChatUserTurnRunRow>(() =>
			supabase
				.from('chat_turn_runs')
				.select(
					'id,session_id,user_id,status,finished_reason,context_type,entity_id,project_id,tool_round_count,tool_call_count,validation_failure_count,llm_pass_count,first_lane,first_skill_path,first_canonical_op,first_help_path,cache_source,prepared_prompt_hit,started_at,finished_at,created_at'
				)
				.eq('session_id', sessionId)
				.order('started_at', { ascending: true, nullsFirst: false })
				.order('created_at', { ascending: true })
		),
		fetchPagedRows<AdminChatUserTimingRow>(() =>
			supabase
				.from('timing_metrics')
				.select(
					'id,session_id,turn_run_id,user_id,context_type,time_to_first_response_ms,time_to_first_event_ms,created_at'
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true })
		),
		fetchPagedRows<AdminChatUserToolExecutionRow>(() =>
			supabase
				.from('chat_tool_executions')
				.select(
					'id,session_id,turn_run_id,tool_name,tool_category,gateway_op,help_path,success,execution_time_ms,tokens_consumed,result_count,zero_result,error_message,affected_entities,created_at'
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true })
		),
		fetchPagedRows<AdminChatUserUsageRow>(() =>
			supabase
				.from('llm_usage_logs')
				.select(
					'id,user_id,chat_session_id,turn_run_id,model_requested,model_used,provider,profile,prompt_tokens,completion_tokens,total_tokens,input_cost_usd,output_cost_usd,total_cost_usd,openrouter_usage_cost_usd,response_time_ms,status,error_message,openrouter_cache_status,created_at'
				)
				.eq('chat_session_id', sessionId)
				.order('created_at', { ascending: true })
		),
		fetchPagedRows<AdminChatUserProjectLogRow>(() =>
			supabase
				.from('onto_project_logs')
				.select(
					'id,chat_session_id,project_id,entity_type,entity_id,action,change_source,changed_by,created_at'
				)
				.eq('chat_session_id', sessionId)
				.order('created_at', { ascending: true })
		)
	]);

	const payload = buildAdminChatRedactedSession(
		{
			sessions: [session],
			users: usersResult.rows,
			sessionProjects: sessionProjectsResult.rows,
			projects: projectsResult.rows,
			messages: messagesResult.rows,
			turnRuns: turnsResult.rows,
			timingRows: timingResult.rows,
			toolExecutions: toolsResult.rows,
			usageRows: usageResult.rows,
			projectLogs: logsResult.rows,
			appErrors: [],
			truncated: {
				sessionProjects: sessionProjectsResult.truncated,
				users: usersResult.truncated,
				projects: projectsResult.truncated,
				messages: messagesResult.truncated,
				turnRuns: turnsResult.truncated,
				timingMetrics: timingResult.truncated,
				toolExecutions: toolsResult.truncated,
				llmUsageLogs: usageResult.truncated,
				projectLogs: logsResult.truncated
			}
		},
		userId,
		sessionId,
		slowThresholdMs
	);
	if (payload) assertAdminChatUserAnalyticsRedacted(payload);
	return payload;
}

async function loadAnalyticsRows(
	supabase: AnySupabase,
	query: AdminChatUserAnalyticsQuery
): Promise<BuildAdminChatUserAnalyticsInput> {
	const startIso = new Date(Date.now() - timeframeToMs(query.timeframe)).toISOString();
	const truncated: Record<string, boolean> = {};

	const sessionsResult = await fetchPagedRows<AdminChatUserSessionRow>(() => {
		let request = supabase
			.from('chat_sessions')
			.select(
				'id,user_id,title,auto_title,chat_topics,context_type,entity_id,status,message_count,tool_call_count,total_tokens_used,created_at,updated_at,last_message_at,last_classified_at'
			)
			.or(
				`last_message_at.gte.${startIso},updated_at.gte.${startIso},created_at.gte.${startIso}`
			)
			.order('last_message_at', { ascending: false, nullsFirst: false })
			.order('updated_at', { ascending: false, nullsFirst: false });
		if (query.user_id) request = request.eq('user_id', query.user_id);
		if (query.context_type && query.context_type !== 'all') {
			request = request.eq('context_type', query.context_type);
		}
		return request;
	});
	truncated.sessions = sessionsResult.truncated;

	let sessions = sessionsResult.rows;
	let sessionIds = sessions.map((session) => session.id).filter(Boolean);
	const sessionProjectsResult =
		sessionIds.length > 0
			? await fetchChunkedRows<AdminChatSessionProjectRow>(sessionIds, (chunk) =>
					supabase
						.from('chat_sessions_projects')
						.select('chat_session_id,project_id')
						.in('chat_session_id', chunk)
				)
			: { rows: [], truncated: false };
	truncated.sessionProjects = sessionProjectsResult.truncated;

	const projectIdsBySession = new Map<string, Set<string>>();
	for (const session of sessions) {
		if (session.context_type === 'project' && session.entity_id) {
			projectIdsBySession.set(session.id, new Set([session.entity_id]));
		}
	}
	for (const link of sessionProjectsResult.rows) {
		const sessionId = textValue(link.chat_session_id);
		const projectId = textValue(link.project_id);
		if (!sessionId || !projectId) continue;
		const ids = projectIdsBySession.get(sessionId) ?? new Set<string>();
		ids.add(projectId);
		projectIdsBySession.set(sessionId, ids);
	}

	if (query.project_id) {
		sessions = sessions.filter(
			(session) => projectIdsBySession.get(session.id)?.has(query.project_id!) ?? false
		);
		sessionIds = sessions.map((session) => session.id).filter(Boolean);
	}
	if (query.topic) {
		const topicSearch = normalizeSearch(query.topic);
		sessions = sessions.filter((session) =>
			(session.chat_topics ?? []).some((topic) =>
				normalizeSearch(topic).includes(topicSearch)
			)
		);
		sessionIds = sessions.map((session) => session.id).filter(Boolean);
	}
	if (query.classification !== 'all') {
		sessions = sessions.filter((session) => classifySession(session) === query.classification);
		sessionIds = sessions.map((session) => session.id).filter(Boolean);
	}

	const projectIds = [
		...new Set(
			sessions.flatMap((session) => [
				...(projectIdsBySession.get(session.id) ?? new Set<string>())
			])
		)
	];
	const userIds = [
		...new Set(
			[
				...sessions.map((session) => textValue(session.user_id)).filter(Boolean),
				query.user_id
			].filter(Boolean) as string[]
		)
	];
	const classificationJobsPromise =
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatClassificationJobRow>(sessionIds, (chunk) =>
					supabase
						.from('queue_jobs')
						.select(
							'id,queue_job_id,metadata,status,error_message,created_at,updated_at,started_at,completed_at'
						)
						.eq('job_type', 'classify_chat_session')
						.in('metadata->>sessionId', chunk)
						.order('created_at', { ascending: false })
				).catch((error) => {
					console.warn('Error fetching admin chat classification jobs:', error);
					return { rows: [], truncated: true };
				})
			: Promise.resolve({ rows: [], truncated: false });

	const [
		usersResult,
		projectsResult,
		messagesResult,
		turnsResult,
		timingResult,
		toolsResult,
		usageResult,
		logsResult,
		appErrorsResult,
		classificationJobsResult
	] = await Promise.all([
		userIds.length > 0
			? fetchChunkedRows<AdminChatUserRow>(userIds, (chunk) =>
					supabase.from('users').select('id,email,name').in('id', chunk)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		projectIds.length > 0
			? fetchChunkedRows<AdminChatProjectRow>(projectIds, (chunk) =>
					supabase.from('onto_projects').select('id,name').in('id', chunk)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserMessageRow>(sessionIds, (chunk) =>
					supabase
						.from('chat_messages')
						.select(
							'id,session_id,user_id,role,total_tokens,error_code,error_message,created_at'
						)
						.in('session_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserTurnRunRow>(sessionIds, (chunk) =>
					supabase
						.from('chat_turn_runs')
						.select(
							'id,session_id,user_id,status,finished_reason,context_type,entity_id,project_id,tool_round_count,tool_call_count,validation_failure_count,llm_pass_count,first_lane,first_skill_path,first_canonical_op,first_help_path,cache_source,prepared_prompt_hit,started_at,finished_at,created_at'
						)
						.in('session_id', chunk)
						.gte('started_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserTimingRow>(sessionIds, (chunk) =>
					supabase
						.from('timing_metrics')
						.select(
							'id,session_id,turn_run_id,user_id,context_type,time_to_first_response_ms,time_to_first_event_ms,created_at'
						)
						.in('session_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserToolExecutionRow>(sessionIds, (chunk) =>
					supabase
						.from('chat_tool_executions')
						.select(
							'id,session_id,turn_run_id,tool_name,tool_category,gateway_op,help_path,success,execution_time_ms,tokens_consumed,result_count,zero_result,error_message,affected_entities,created_at'
						)
						.in('session_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserUsageRow>(sessionIds, (chunk) =>
					supabase
						.from('llm_usage_logs')
						.select(
							'id,user_id,chat_session_id,turn_run_id,model_requested,model_used,provider,profile,prompt_tokens,completion_tokens,total_tokens,input_cost_usd,output_cost_usd,total_cost_usd,openrouter_usage_cost_usd,response_time_ms,status,error_message,openrouter_cache_status,created_at'
						)
						.in('chat_session_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		sessionIds.length > 0
			? fetchChunkedRows<AdminChatUserProjectLogRow>(sessionIds, (chunk) =>
					supabase
						.from('onto_project_logs')
						.select(
							'id,chat_session_id,project_id,entity_type,entity_id,action,change_source,changed_by,created_at'
						)
						.in('chat_session_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		userIds.length > 0
			? fetchChunkedRows<AdminChatUserAppErrorRow>(userIds, (chunk) =>
					supabase
						.from('error_logs')
						.select(
							'id,user_id,error_message,error_type,severity,endpoint,record_id,project_id,created_at'
						)
						.in('user_id', chunk)
						.gte('created_at', startIso)
				)
			: Promise.resolve({ rows: [], truncated: false }),
		classificationJobsPromise
	]);

	truncated.users = usersResult.truncated;
	truncated.projects = projectsResult.truncated;
	truncated.messages = messagesResult.truncated;
	truncated.turnRuns = turnsResult.truncated;
	truncated.timingMetrics = timingResult.truncated;
	truncated.toolExecutions = toolsResult.truncated;
	truncated.llmUsageLogs = usageResult.truncated;
	truncated.projectLogs = logsResult.truncated;
	truncated.appErrors = appErrorsResult.truncated;
	truncated.classificationJobs = classificationJobsResult.truncated;

	return {
		sessions,
		users: usersResult.rows,
		sessionProjects: sessionProjectsResult.rows.filter((link) =>
			sessionIds.includes(textValue(link.chat_session_id) ?? '')
		),
		projects: projectsResult.rows,
		messages: messagesResult.rows,
		turnRuns: turnsResult.rows,
		timingRows: timingResult.rows,
		toolExecutions: toolsResult.rows,
		usageRows: usageResult.rows,
		projectLogs: logsResult.rows,
		appErrors: appErrorsResult.rows,
		classificationJobs: classificationJobsResult.rows,
		truncated
	};
}
