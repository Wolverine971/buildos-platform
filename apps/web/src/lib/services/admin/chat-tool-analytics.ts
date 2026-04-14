// apps/web/src/lib/services/admin/chat-tool-analytics.ts
export type ToolOutcomeFilter = 'all' | 'success' | 'failed';
export type ToolTrendBucket = 'hour' | 'day';

export interface ToolExecutionAnalyticsRow {
	id: string;
	session_id: string | null;
	turn_run_id: string | null;
	stream_run_id: string | null;
	client_turn_id: string | null;
	tool_name: string | null;
	tool_category: string | null;
	gateway_op: string | null;
	help_path: string | null;
	execution_time_ms: number | string | null;
	tokens_consumed: number | string | null;
	success: boolean | null;
	error_message: string | null;
	requires_user_action: boolean | null;
	created_at: string | null;
}

export interface ToolTurnRunAnalyticsRow {
	id: string;
	session_id?: string | null;
	context_type: string | null;
	status?: string | null;
	finished_reason?: string | null;
	tool_round_count?: number | string | null;
	tool_call_count?: number | string | null;
	validation_failure_count?: number | string | null;
	first_lane?: string | null;
	first_help_path?: string | null;
	first_skill_path?: string | null;
	first_canonical_op?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
}

export interface ToolSessionAnalyticsRow {
	id: string;
	context_type: string | null;
}

export interface ToolAnalyticsFilters {
	toolSearch?: string | null;
	category?: string | null;
	contextType?: string | null;
	outcome?: ToolOutcomeFilter | null;
	gatewayOp?: string | null;
	helpPath?: string | null;
	minCalls?: number | null;
}

export interface ToolAnalyticsBuildOptions {
	filters?: ToolAnalyticsFilters;
	trendBucket?: ToolTrendBucket;
	startDate?: string;
	endDate?: string;
	totalRowsAvailable?: number | null;
	truncated?: boolean;
	maxRows?: number;
}

export interface ToolGroupMetric {
	key: string;
	label: string;
	total_executions: number;
	successful_executions: number;
	failed_executions: number;
	success_rate: number;
	failure_rate: number;
	share_of_calls: number;
	avg_execution_time_ms: number | null;
	p50_execution_time_ms: number | null;
	p95_execution_time_ms: number | null;
	duration_sample_count: number;
	total_tokens: number;
	avg_tokens_per_execution: number | null;
	unique_sessions: number;
	unique_turns: number;
	last_used_at: string | null;
}

export interface ToolMetric extends ToolGroupMetric {
	tool_name: string;
	tool_category: string;
	top_gateway_op: string | null;
	top_help_path: string | null;
	sample_errors: string[];
	error_count: number;
}

export interface ToolCategoryMetric extends ToolGroupMetric {
	category: string;
}

export interface ToolDimensionMetric {
	key: string;
	label: string;
	total_executions: number;
	successful_executions: number;
	failed_executions: number;
	success_rate: number;
	failure_rate: number;
	share_of_calls: number;
	last_used_at: string | null;
}

export interface ToolTrendMetric {
	bucket: string;
	total_executions: number;
	successful_executions: number;
	failed_executions: number;
	success_rate: number;
	failure_rate: number;
	avg_execution_time_ms: number | null;
	p95_execution_time_ms: number | null;
	duration_sample_count: number;
}

export interface ToolErrorMetric {
	error_message: string;
	count: number;
	affected_tools: string[];
	last_seen_at: string | null;
}

export interface RecentToolFailure {
	id: string;
	session_id: string | null;
	turn_run_id: string | null;
	stream_run_id: string | null;
	tool_name: string;
	tool_category: string;
	gateway_op: string | null;
	help_path: string | null;
	context_type: string | null;
	execution_time_ms: number | null;
	error_message: string;
	created_at: string | null;
}

export interface ToolAnalyticsPayload {
	data_source: {
		primary: 'chat_tool_executions';
		row_count: number;
		total_rows_available: number | null;
		truncated: boolean;
		max_rows: number | null;
		start_date: string | null;
		end_date: string | null;
	};
	overview: {
		total_executions: number;
		successful_executions: number;
		failed_executions: number;
		success_rate: number;
		failure_rate: number;
		unique_tools_used: number;
		unique_categories: number;
		unique_sessions: number;
		unique_turns: number;
		avg_calls_per_turn: number;
		avg_execution_time_ms: number | null;
		p50_execution_time_ms: number | null;
		p95_execution_time_ms: number | null;
		duration_sample_count: number;
		total_tokens: number;
		avg_tokens_per_execution: number | null;
		validation_failures: number;
		requires_user_action_count: number;
	};
	by_tool: ToolMetric[];
	by_category: ToolCategoryMetric[];
	top_tools: ToolMetric[];
	slowest_tools: ToolMetric[];
	most_problematic_tools: ToolMetric[];
	gateway_usage: {
		by_gateway_op: ToolDimensionMetric[];
		by_help_path: ToolDimensionMetric[];
		first_lanes: ToolDimensionMetric[];
		first_skills: ToolDimensionMetric[];
		first_canonical_ops: ToolDimensionMetric[];
	};
	reliability: {
		top_errors: ToolErrorMetric[];
		recent_failures: RecentToolFailure[];
		total_errors: number;
		validation_failures: number;
	};
	trends: ToolTrendMetric[];
	filter_options: {
		categories: string[];
		context_types: string[];
		gateway_ops: string[];
		help_paths: string[];
	};
}

type NormalizedToolExecution = {
	id: string;
	sessionId: string | null;
	turnRunId: string | null;
	streamRunId: string | null;
	clientTurnId: string | null;
	toolName: string;
	toolCategory: string;
	gatewayOp: string | null;
	helpPath: string | null;
	contextType: string | null;
	executionTimeMs: number | null;
	tokensConsumed: number;
	success: boolean;
	errorMessage: string | null;
	requiresUserAction: boolean;
	createdAt: string | null;
};

type MutableGroup = {
	key: string;
	label: string;
	total: number;
	successful: number;
	failed: number;
	durations: number[];
	totalTokens: number;
	sessionIds: Set<string>;
	turnRunIds: Set<string>;
	lastUsedAt: string | null;
	errors: string[];
	gatewayOps: Map<string, number>;
	helpPaths: Map<string, number>;
};

const UNKNOWN = 'unknown';

const asNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const asOptionalText = (value: string | null | undefined): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

const percentage = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

const calculatePercentile = (values: number[], percentile: number): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.ceil((percentile / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)] ?? null;
};

const average = (values: number[]): number | null => {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const increment = (map: Map<string, number>, key: string | null | undefined): void => {
	const normalized = asOptionalText(key) ?? UNKNOWN;
	map.set(normalized, (map.get(normalized) ?? 0) + 1);
};

const topKey = (map: Map<string, number>): string | null => {
	let selected: string | null = null;
	let selectedCount = 0;
	for (const [key, count] of map.entries()) {
		if (key === UNKNOWN) continue;
		if (count > selectedCount) {
			selected = key;
			selectedCount = count;
		}
	}
	return selected;
};

const createGroup = (key: string, label = key): MutableGroup => ({
	key,
	label,
	total: 0,
	successful: 0,
	failed: 0,
	durations: [],
	totalTokens: 0,
	sessionIds: new Set<string>(),
	turnRunIds: new Set<string>(),
	lastUsedAt: null,
	errors: [],
	gatewayOps: new Map<string, number>(),
	helpPaths: new Map<string, number>()
});

const pushIntoGroup = (group: MutableGroup, row: NormalizedToolExecution): void => {
	group.total += 1;
	if (row.success) {
		group.successful += 1;
	} else {
		group.failed += 1;
		if (row.errorMessage) {
			group.errors.push(row.errorMessage);
		}
	}
	if (row.executionTimeMs !== null) {
		group.durations.push(row.executionTimeMs);
	}
	group.totalTokens += row.tokensConsumed;
	if (row.sessionId) {
		group.sessionIds.add(row.sessionId);
	}
	if (row.turnRunId) {
		group.turnRunIds.add(row.turnRunId);
	}
	if (row.createdAt && (!group.lastUsedAt || row.createdAt > group.lastUsedAt)) {
		group.lastUsedAt = row.createdAt;
	}
	increment(group.gatewayOps, row.gatewayOp);
	increment(group.helpPaths, row.helpPath);
};

const toGroupMetric = (group: MutableGroup, totalExecutions: number): ToolGroupMetric => ({
	key: group.key,
	label: group.label,
	total_executions: group.total,
	successful_executions: group.successful,
	failed_executions: group.failed,
	success_rate: percentage(group.successful, group.total),
	failure_rate: percentage(group.failed, group.total),
	share_of_calls: percentage(group.total, totalExecutions),
	avg_execution_time_ms: average(group.durations),
	p50_execution_time_ms: calculatePercentile(group.durations, 50),
	p95_execution_time_ms: calculatePercentile(group.durations, 95),
	duration_sample_count: group.durations.length,
	total_tokens: group.totalTokens,
	avg_tokens_per_execution: group.total > 0 ? group.totalTokens / group.total : null,
	unique_sessions: group.sessionIds.size,
	unique_turns: group.turnRunIds.size,
	last_used_at: group.lastUsedAt
});

const toToolMetric = (group: MutableGroup, totalExecutions: number): ToolMetric => {
	const base = toGroupMetric(group, totalExecutions);
	return {
		...base,
		tool_name: group.key,
		tool_category: group.label,
		top_gateway_op: topKey(group.gatewayOps),
		top_help_path: topKey(group.helpPaths),
		sample_errors: Array.from(new Set(group.errors)).slice(0, 3),
		error_count: group.errors.length
	};
};

const toCategoryMetric = (group: MutableGroup, totalExecutions: number): ToolCategoryMetric => ({
	...toGroupMetric(group, totalExecutions),
	category: group.key
});

const toDimensionMetric = (group: MutableGroup, totalExecutions: number): ToolDimensionMetric => ({
	key: group.key,
	label: group.label,
	total_executions: group.total,
	successful_executions: group.successful,
	failed_executions: group.failed,
	success_rate: percentage(group.successful, group.total),
	failure_rate: percentage(group.failed, group.total),
	share_of_calls: percentage(group.total, totalExecutions),
	last_used_at: group.lastUsedAt
});

const normalizeToolCategory = (row: ToolExecutionAnalyticsRow): string => {
	const category = asOptionalText(row.tool_category);
	if (category) return category;

	const toolName = asOptionalText(row.tool_name);
	if (!toolName) return UNKNOWN;
	if (toolName === 'skill_load') return 'gateway_skill';
	if (toolName === 'tool_search' || toolName === 'tool_schema') return 'gateway_discovery';
	if (asOptionalText(row.gateway_op)) return 'gateway_execution';
	return UNKNOWN;
};

const normalizeRows = (
	rows: ToolExecutionAnalyticsRow[],
	turnRunsById: Map<string, ToolTurnRunAnalyticsRow>,
	sessionsById: Map<string, ToolSessionAnalyticsRow>
): NormalizedToolExecution[] => {
	return rows.map((row) => {
		const turnRun = row.turn_run_id ? turnRunsById.get(row.turn_run_id) : undefined;
		const session = row.session_id ? sessionsById.get(row.session_id) : undefined;
		const duration = asNumber(row.execution_time_ms);
		const tokensConsumed = asNumber(row.tokens_consumed) ?? 0;

		return {
			id: row.id,
			sessionId: asOptionalText(row.session_id),
			turnRunId: asOptionalText(row.turn_run_id),
			streamRunId: asOptionalText(row.stream_run_id),
			clientTurnId: asOptionalText(row.client_turn_id),
			toolName: asOptionalText(row.tool_name) ?? UNKNOWN,
			toolCategory: normalizeToolCategory(row),
			gatewayOp: asOptionalText(row.gateway_op),
			helpPath: asOptionalText(row.help_path),
			contextType:
				asOptionalText(turnRun?.context_type) ?? asOptionalText(session?.context_type),
			executionTimeMs: duration !== null && duration >= 0 ? duration : null,
			tokensConsumed: tokensConsumed >= 0 ? tokensConsumed : 0,
			success: row.success !== false,
			errorMessage: asOptionalText(row.error_message),
			requiresUserAction: row.requires_user_action === true,
			createdAt: row.created_at ?? null
		};
	});
};

const applyFilters = (
	rows: NormalizedToolExecution[],
	filters: ToolAnalyticsFilters
): NormalizedToolExecution[] => {
	const toolSearch = filters.toolSearch?.trim().toLowerCase() ?? '';
	const category = filters.category && filters.category !== 'all' ? filters.category : null;
	const contextType =
		filters.contextType && filters.contextType !== 'all' ? filters.contextType : null;
	const outcome = filters.outcome && filters.outcome !== 'all' ? filters.outcome : null;
	const gatewayOp = filters.gatewayOp && filters.gatewayOp !== 'all' ? filters.gatewayOp : null;
	const helpPath = filters.helpPath && filters.helpPath !== 'all' ? filters.helpPath : null;

	return rows.filter((row) => {
		if (
			toolSearch &&
			!row.toolName.toLowerCase().includes(toolSearch) &&
			!(row.gatewayOp ?? '').toLowerCase().includes(toolSearch) &&
			!(row.helpPath ?? '').toLowerCase().includes(toolSearch)
		) {
			return false;
		}
		if (category && row.toolCategory !== category) return false;
		if (contextType && row.contextType !== contextType) return false;
		if (outcome === 'success' && !row.success) return false;
		if (outcome === 'failed' && row.success) return false;
		if (gatewayOp && row.gatewayOp !== gatewayOp) return false;
		if (helpPath && row.helpPath !== helpPath) return false;
		return true;
	});
};

const addToGroupMap = (
	map: Map<string, MutableGroup>,
	key: string | null | undefined,
	row: NormalizedToolExecution,
	label?: string
): void => {
	const normalizedKey = asOptionalText(key) ?? UNKNOWN;
	const group = map.get(normalizedKey) ?? createGroup(normalizedKey, label ?? normalizedKey);
	pushIntoGroup(group, row);
	map.set(normalizedKey, group);
};

const sortByExecutions = <T extends { total_executions: number; label?: string }>(
	items: T[]
): T[] =>
	items.sort((a, b) => {
		const executionDiff = b.total_executions - a.total_executions;
		if (executionDiff !== 0) return executionDiff;
		return (a.label ?? '').localeCompare(b.label ?? '');
	});

const buildDimensionMetrics = (
	rows: NormalizedToolExecution[],
	totalExecutions: number,
	getKey: (row: NormalizedToolExecution) => string | null | undefined
): ToolDimensionMetric[] => {
	const groups = new Map<string, MutableGroup>();
	for (const row of rows) {
		addToGroupMap(groups, getKey(row), row);
	}
	return sortByExecutions(
		Array.from(groups.values())
			.filter((group) => group.key !== UNKNOWN)
			.map((group) => toDimensionMetric(group, totalExecutions))
	).slice(0, 15);
};

const bucketDate = (iso: string | null, bucket: ToolTrendBucket): string | null => {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	if (bucket === 'hour') {
		date.setUTCMinutes(0, 0, 0);
		return date.toISOString();
	}
	return date.toISOString().slice(0, 10);
};

const buildTrends = (
	rows: NormalizedToolExecution[],
	bucket: ToolTrendBucket
): ToolTrendMetric[] => {
	const groups = new Map<string, MutableGroup>();
	for (const row of rows) {
		const key = bucketDate(row.createdAt, bucket);
		if (!key) continue;
		addToGroupMap(groups, key, row);
	}
	return Array.from(groups.values())
		.map((group) => {
			const metric = toGroupMetric(group, group.total);
			return {
				bucket: group.key,
				total_executions: metric.total_executions,
				successful_executions: metric.successful_executions,
				failed_executions: metric.failed_executions,
				success_rate: metric.success_rate,
				failure_rate: metric.failure_rate,
				avg_execution_time_ms: metric.avg_execution_time_ms,
				p95_execution_time_ms: metric.p95_execution_time_ms,
				duration_sample_count: metric.duration_sample_count
			};
		})
		.sort((a, b) => a.bucket.localeCompare(b.bucket));
};

const buildTopErrors = (rows: NormalizedToolExecution[]): ToolErrorMetric[] => {
	const errors = new Map<
		string,
		{ count: number; affectedTools: Set<string>; lastSeenAt: string | null }
	>();

	for (const row of rows) {
		if (row.success || !row.errorMessage) continue;
		const key = row.errorMessage.slice(0, 180);
		const current = errors.get(key) ?? {
			count: 0,
			affectedTools: new Set<string>(),
			lastSeenAt: null
		};
		current.count += 1;
		current.affectedTools.add(row.toolName);
		if (row.createdAt && (!current.lastSeenAt || row.createdAt > current.lastSeenAt)) {
			current.lastSeenAt = row.createdAt;
		}
		errors.set(key, current);
	}

	return Array.from(errors.entries())
		.map(([errorMessage, value]) => ({
			error_message: errorMessage,
			count: value.count,
			affected_tools: Array.from(value.affectedTools).sort(),
			last_seen_at: value.lastSeenAt
		}))
		.sort((a, b) => b.count - a.count || a.error_message.localeCompare(b.error_message))
		.slice(0, 10);
};

const buildRecentFailures = (rows: NormalizedToolExecution[]): RecentToolFailure[] =>
	rows
		.filter((row) => !row.success)
		.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
		.slice(0, 20)
		.map((row) => ({
			id: row.id,
			session_id: row.sessionId,
			turn_run_id: row.turnRunId,
			stream_run_id: row.streamRunId,
			tool_name: row.toolName,
			tool_category: row.toolCategory,
			gateway_op: row.gatewayOp,
			help_path: row.helpPath,
			context_type: row.contextType,
			execution_time_ms: row.executionTimeMs,
			error_message: row.errorMessage ?? 'Tool execution failed',
			created_at: row.createdAt
		}));

const optionValues = (
	rows: NormalizedToolExecution[],
	getValue: (row: NormalizedToolExecution) => string | null | undefined
): string[] =>
	Array.from(
		new Set(
			rows
				.map((row) => asOptionalText(getValue(row)))
				.filter((value): value is string => Boolean(value))
		)
	).sort((a, b) => a.localeCompare(b));

const countValidationFailures = (
	rows: NormalizedToolExecution[],
	turnRunsById: Map<string, ToolTurnRunAnalyticsRow>
): number => {
	const turnIds = new Set(
		rows.map((row) => row.turnRunId).filter((id): id is string => Boolean(id))
	);
	let count = 0;
	for (const turnId of turnIds) {
		count += asNumber(turnRunsById.get(turnId)?.validation_failure_count) ?? 0;
	}
	return count;
};

const buildTurnRunDimensionMetrics = (
	rows: NormalizedToolExecution[],
	turnRunsById: Map<string, ToolTurnRunAnalyticsRow>,
	totalExecutions: number,
	getKey: (turnRun: ToolTurnRunAnalyticsRow) => string | null | undefined
): ToolDimensionMetric[] => {
	const groups = new Map<string, MutableGroup>();
	const seenTurnIds = new Set<string>();

	for (const row of rows) {
		if (!row.turnRunId || seenTurnIds.has(row.turnRunId)) continue;
		const turnRun = turnRunsById.get(row.turnRunId);
		if (!turnRun) continue;
		seenTurnIds.add(row.turnRunId);
		addToGroupMap(groups, getKey(turnRun), row);
	}

	return sortByExecutions(
		Array.from(groups.values())
			.filter((group) => group.key !== UNKNOWN)
			.map((group) => toDimensionMetric(group, totalExecutions))
	).slice(0, 15);
};

export function buildChatToolAnalytics(
	rows: ToolExecutionAnalyticsRow[],
	turnRuns: ToolTurnRunAnalyticsRow[] = [],
	sessions: ToolSessionAnalyticsRow[] = [],
	options: ToolAnalyticsBuildOptions = {}
): ToolAnalyticsPayload {
	const turnRunsById = new Map(turnRuns.map((turnRun) => [turnRun.id, turnRun]));
	const sessionsById = new Map(sessions.map((session) => [session.id, session]));
	const allRows = normalizeRows(rows, turnRunsById, sessionsById);
	const filteredRows = applyFilters(allRows, options.filters ?? {});
	const minCalls = Math.max(1, Math.floor(options.filters?.minCalls ?? 1));

	const toolGroups = new Map<string, MutableGroup>();
	const categoryGroups = new Map<string, MutableGroup>();

	for (const row of filteredRows) {
		const toolGroup =
			toolGroups.get(row.toolName) ?? createGroup(row.toolName, row.toolCategory);
		pushIntoGroup(toolGroup, row);
		if (toolGroup.label === UNKNOWN && row.toolCategory !== UNKNOWN) {
			toolGroup.label = row.toolCategory;
		}
		toolGroups.set(row.toolName, toolGroup);

		addToGroupMap(categoryGroups, row.toolCategory, row);
	}

	const totalExecutions = filteredRows.length;
	const successfulExecutions = filteredRows.filter((row) => row.success).length;
	const failedExecutions = totalExecutions - successfulExecutions;
	const durationValues = filteredRows
		.map((row) => row.executionTimeMs)
		.filter((value): value is number => value !== null);
	const totalTokens = filteredRows.reduce((sum, row) => sum + row.tokensConsumed, 0);
	const uniqueSessions = new Set(
		filteredRows.map((row) => row.sessionId).filter((id): id is string => Boolean(id))
	);
	const uniqueTurns = new Set(
		filteredRows.map((row) => row.turnRunId).filter((id): id is string => Boolean(id))
	);
	const validationFailures = countValidationFailures(filteredRows, turnRunsById);

	const byTool = sortByExecutions(
		Array.from(toolGroups.values())
			.map((group) => toToolMetric(group, totalExecutions))
			.filter((metric) => metric.total_executions >= minCalls)
	);
	const byCategory = sortByExecutions(
		Array.from(categoryGroups.values()).map((group) => toCategoryMetric(group, totalExecutions))
	);

	const slowestTools = [...byTool]
		.filter((tool) => tool.p95_execution_time_ms !== null)
		.sort(
			(a, b) =>
				(b.p95_execution_time_ms ?? 0) - (a.p95_execution_time_ms ?? 0) ||
				b.total_executions - a.total_executions
		)
		.slice(0, 10);

	const mostProblematicTools = [...byTool]
		.filter((tool) => tool.failed_executions > 0)
		.sort(
			(a, b) =>
				b.failure_rate - a.failure_rate ||
				b.failed_executions - a.failed_executions ||
				b.total_executions - a.total_executions
		)
		.slice(0, 10);

	return {
		data_source: {
			primary: 'chat_tool_executions',
			row_count: rows.length,
			total_rows_available: options.totalRowsAvailable ?? null,
			truncated: options.truncated === true,
			max_rows: options.maxRows ?? null,
			start_date: options.startDate ?? null,
			end_date: options.endDate ?? null
		},
		overview: {
			total_executions: totalExecutions,
			successful_executions: successfulExecutions,
			failed_executions: failedExecutions,
			success_rate: percentage(successfulExecutions, totalExecutions),
			failure_rate: percentage(failedExecutions, totalExecutions),
			unique_tools_used: toolGroups.size,
			unique_categories: categoryGroups.size,
			unique_sessions: uniqueSessions.size,
			unique_turns: uniqueTurns.size,
			avg_calls_per_turn: uniqueTurns.size > 0 ? totalExecutions / uniqueTurns.size : 0,
			avg_execution_time_ms: average(durationValues),
			p50_execution_time_ms: calculatePercentile(durationValues, 50),
			p95_execution_time_ms: calculatePercentile(durationValues, 95),
			duration_sample_count: durationValues.length,
			total_tokens: totalTokens,
			avg_tokens_per_execution: totalExecutions > 0 ? totalTokens / totalExecutions : null,
			validation_failures: validationFailures,
			requires_user_action_count: filteredRows.filter((row) => row.requiresUserAction).length
		},
		by_tool: byTool,
		by_category: byCategory,
		top_tools: byTool.slice(0, 10),
		slowest_tools: slowestTools,
		most_problematic_tools: mostProblematicTools,
		gateway_usage: {
			by_gateway_op: buildDimensionMetrics(
				filteredRows,
				totalExecutions,
				(row) => row.gatewayOp
			),
			by_help_path: buildDimensionMetrics(
				filteredRows,
				totalExecutions,
				(row) => row.helpPath
			),
			first_lanes: buildTurnRunDimensionMetrics(
				filteredRows,
				turnRunsById,
				totalExecutions,
				(turnRun) => turnRun.first_lane
			),
			first_skills: buildTurnRunDimensionMetrics(
				filteredRows,
				turnRunsById,
				totalExecutions,
				(turnRun) => turnRun.first_skill_path
			),
			first_canonical_ops: buildTurnRunDimensionMetrics(
				filteredRows,
				turnRunsById,
				totalExecutions,
				(turnRun) => turnRun.first_canonical_op
			)
		},
		reliability: {
			top_errors: buildTopErrors(filteredRows),
			recent_failures: buildRecentFailures(filteredRows),
			total_errors: failedExecutions,
			validation_failures: validationFailures
		},
		trends: buildTrends(filteredRows, options.trendBucket ?? 'day'),
		filter_options: {
			categories: optionValues(allRows, (row) => row.toolCategory),
			context_types: optionValues(allRows, (row) => row.contextType),
			gateway_ops: optionValues(allRows, (row) => row.gatewayOp),
			help_paths: optionValues(allRows, (row) => row.helpPath)
		}
	};
}
