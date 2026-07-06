// apps/web/src/lib/components/admin/chat-users/chat-user-export.ts
import type {
	ClassificationFilter,
	EntityActionFilter,
	ErrorFilter,
	RedactedSession,
	SortField,
	SortOrder,
	Timeframe,
	ToolBucketFilter,
	UserDetail,
	UsersResponse
} from './chat-user-types';

export type CsvValue = string | number | boolean | null | undefined;

export type ChatUserExportFilters = {
	timeframe: Timeframe;
	page: number;
	limit: number;
	sort_by: SortField;
	sort_order: SortOrder;
	search: string;
	context_type: string;
	project_id: string;
	topic: string;
	errors: ErrorFilter;
	tool_bucket: ToolBucketFilter;
	classification: ClassificationFilter;
	entity_action: EntityActionFilter;
	slow_threshold_ms: string;
};

export type TextFileDownload = {
	filename: string;
	mimeType: string;
	contents: string;
};

const CHAT_USERS_CSV_HEADERS = [
	'user_id',
	'email',
	'name',
	'last_activity_at',
	'active_day_count',
	'consecutive_day_streak',
	'session_count',
	'project_session_count',
	'global_session_count',
	'turn_count',
	'message_count',
	'user_message_count',
	'assistant_message_count',
	'ttfr_p50_ms',
	'ttfr_p95_ms',
	'ttfr_max_ms',
	'slow_turn_count',
	'tool_call_count',
	'tool_failure_count',
	'tool_failure_rate',
	'llm_call_count',
	'llm_failure_count',
	'validation_failure_count',
	'created_entity_count',
	'updated_entity_count',
	'deleted_entity_count',
	'project_count',
	'top_topics',
	'top_projects',
	'top_tools',
	'preview'
] as const;

export function exportTimestamp(now = new Date()): string {
	return now.toISOString().replace(/[:.]/g, '-');
}

export function csvCell(value: CsvValue): string {
	if (value === null || value === undefined) return '';
	const text = String(value);
	if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
	return text;
}

export function csvRows(headers: readonly string[], rows: Array<Record<string, CsvValue>>): string {
	return [
		headers.map(csvCell).join(','),
		...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
	].join('\n');
}

export function buildChatUsersCsvFile({
	data,
	timeframe,
	now = new Date()
}: {
	data: UsersResponse;
	timeframe: Timeframe;
	now?: Date;
}): TextFileDownload {
	return {
		filename: `admin-chat-users-${filenamePart(timeframe)}-${exportTimestamp(now)}.csv`,
		mimeType: 'text/csv;charset=utf-8',
		contents: csvRows(
			CHAT_USERS_CSV_HEADERS,
			data.users.map((user) => ({
				user_id: user.user_id,
				email: user.email,
				name: user.name,
				last_activity_at: user.last_activity_at,
				active_day_count: user.active_day_count,
				consecutive_day_streak: user.consecutive_day_streak,
				session_count: user.session_count,
				project_session_count: user.project_session_count,
				global_session_count: user.global_session_count,
				turn_count: user.turn_count,
				message_count: user.message_count,
				user_message_count: user.user_message_count,
				assistant_message_count: user.assistant_message_count,
				ttfr_p50_ms: user.ttfr_p50_ms,
				ttfr_p95_ms: user.ttfr_p95_ms,
				ttfr_max_ms: user.ttfr_max_ms,
				slow_turn_count: user.slow_turn_count,
				tool_call_count: user.tool_call_count,
				tool_failure_count: user.tool_failure_count,
				tool_failure_rate: user.tool_failure_rate,
				llm_call_count: user.llm_call_count,
				llm_failure_count: user.llm_failure_count,
				validation_failure_count: user.validation_failure_count,
				created_entity_count: user.created_entity_count,
				updated_entity_count: user.updated_entity_count,
				deleted_entity_count: user.deleted_entity_count,
				project_count: user.project_count,
				top_topics: user.top_topics
					.map((topic) => `${topic.topic} (${topic.count})`)
					.join('; '),
				top_projects: user.top_projects
					.map((project) => `${project.name ?? project.project_id} (${project.count})`)
					.join('; '),
				top_tools: user.top_tools
					.map((tool) => `${tool.tool_name} (${tool.count}/${tool.failures} failed)`)
					.join('; '),
				preview: user.preview
			}))
		)
	};
}

export function buildChatUsersJsonFile({
	data,
	filters,
	now = new Date()
}: {
	data: UsersResponse;
	filters: ChatUserExportFilters;
	now?: Date;
}): TextFileDownload {
	return {
		filename: `admin-chat-users-${filenamePart(filters.timeframe)}-${exportTimestamp(now)}.json`,
		mimeType: 'application/json;charset=utf-8',
		contents: JSON.stringify(
			{
				exported_at: now.toISOString(),
				filters,
				data
			},
			null,
			2
		)
	};
}

export function buildChatUserDetailJsonFile({
	userDetail,
	filters,
	selectedEntityGroup,
	visibleEntityChanges,
	redactedSession,
	now = new Date()
}: {
	userDetail: UserDetail;
	filters: ChatUserExportFilters;
	selectedEntityGroup: UserDetail['entities'][number] | null;
	visibleEntityChanges: UserDetail['entity_changes'];
	redactedSession: RedactedSession | null;
	now?: Date;
}): TextFileDownload {
	return {
		filename: `admin-chat-user-${filenamePart(userDetail.user.id)}-${exportTimestamp(now)}.json`,
		mimeType: 'application/json;charset=utf-8',
		contents: JSON.stringify(
			{
				exported_at: now.toISOString(),
				filters,
				user_detail: userDetail,
				selected_entity_group: selectedEntityGroup,
				visible_entity_changes: visibleEntityChanges,
				redacted_session: redactedSession
			},
			null,
			2
		)
	};
}

export function downloadTextFile(file: TextFileDownload): void {
	if (
		typeof document === 'undefined' ||
		typeof Blob === 'undefined' ||
		typeof URL === 'undefined'
	) {
		return;
	}
	const blob = new Blob([file.contents], { type: file.mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = file.filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

function filenamePart(value: string | number | null | undefined): string {
	const normalized = String(value ?? '')
		.trim()
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return normalized || 'unknown';
}
