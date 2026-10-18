// apps/web/src/lib/components/agent/agent-chat-tool-outcome.ts
//
// What a finished read tool found, as a short count for its activity line:
// "7 tasks", "3 results", "no goals". Read only from structured result fields
// (`total`, the returned arrays, explicit count fields); never from the
// result's prose `message`.

type ResultRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ResultRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countOf(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? Math.floor(value)
		: null;
}

function formatCount(count: number, singular: string, pluralForm = `${singular}s`): string {
	if (count === 0) return `no ${pluralForm}`;
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Tools that only read. Writes and proposals report their change elsewhere. */
function isReadTool(toolName: string): boolean {
	return (
		toolName.startsWith('list_') ||
		toolName.startsWith('search_') ||
		toolName.startsWith('get_') ||
		toolName.startsWith('read_') ||
		toolName.startsWith('scan_') ||
		toolName === 'web_search'
	);
}

/** Live results wrap the payload as `{ result: {...}, success, tool_name }`; stored ones don't. */
function unwrapResult(toolResult: unknown): ResultRecord | null {
	if (!isRecord(toolResult)) return null;
	if (isRecord(toolResult.result)) return toolResult.result;
	return toolResult;
}

// Result arrays in priority order, with the noun each one counts.
const COUNTED_ARRAYS: Array<[key: string, singular: string]> = [
	['tasks', 'task'],
	['goals', 'goal'],
	['plans', 'plan'],
	['documents', 'document'],
	['milestones', 'milestone'],
	['risks', 'risk'],
	['projects', 'project'],
	['events', 'event'],
	['results', 'result'],
	['outline', 'heading']
];

export function describeToolOutcome(
	toolName: string | undefined,
	toolResult: unknown
): string | undefined {
	if (!toolName || !isReadTool(toolName)) return undefined;
	const payload = unwrapResult(toolResult);
	if (!payload) return undefined;

	switch (toolName) {
		case 'get_project_overview': {
			const counts = isRecord(payload.counts) ? payload.counts : null;
			const active = countOf(counts?.active_tasks);
			return active === null ? undefined : formatCount(active, 'active task');
		}
		case 'get_workspace_overview': {
			const projects =
				countOf(payload.projects_returned) ??
				(Array.isArray(payload.projects) ? payload.projects.length : null);
			return projects === null ? undefined : formatCount(projects, 'project');
		}
		case 'read_table_rows': {
			const rows =
				countOf(payload.matched_rows) ??
				countOf(payload.total_rows) ??
				countOf(payload.rows_returned);
			return rows === null ? undefined : formatCount(rows, 'row');
		}
		case 'scan_email_inbox': {
			const relevant = countOf(payload.relevant_count);
			return relevant === null ? undefined : formatCount(relevant, 'relevant email');
		}
		case 'list_email_accounts': {
			const inboxes =
				countOf(payload.count) ??
				(Array.isArray(payload.accounts) ? payload.accounts.length : null);
			return inboxes === null ? undefined : formatCount(inboxes, 'inbox', 'inboxes');
		}
	}

	for (const [key, singular] of COUNTED_ARRAYS) {
		const list = payload[key];
		if (!Array.isArray(list)) continue;
		const count =
			countOf(payload.total) ?? countOf(payload.result_count) ?? countOf(list.length);
		return count === null ? undefined : formatCount(count, singular);
	}
	return undefined;
}
