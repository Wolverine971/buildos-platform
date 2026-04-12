// apps/web/src/lib/server/admin-chat-dashboard-analytics.ts
import { resolveModelPricingProfile } from '@buildos/smart-llm';

export type ChatDashboardTimeframe = '24h' | '7d' | '30d' | '90d' | '365d';

type Trend = {
	direction: 'up' | 'down';
	value: number;
};

export type ChatDashboardActivityEvent = {
	timestamp: string;
	type:
		| 'turn_completed'
		| 'turn_failed'
		| 'turn_cancelled'
		| 'message'
		| 'tool_failed'
		| 'tool_execution'
		| 'llm_failed'
		| 'eval_run';
	severity: 'info' | 'success' | 'warning' | 'error';
	user_email: string;
	session_id: string | null;
	details: string;
	tokens_used?: number;
};

export type ChatDashboardDistributionMetric = {
	label: string;
	count: number;
	share: number;
	success_rate: number;
	tool_calls: number;
	p95_duration_ms: number;
};

export type ChatDashboardTopUser = {
	user_id: string;
	email: string;
	name: string | null;
	session_count: number;
	turn_count: number;
	message_count: number;
	tool_calls: number;
	total_cost: number;
	total_tokens: number;
	last_activity: string | null;
};

export type ChatDashboardAnalytics = {
	kpis: {
		totalSessions: number;
		newSessions: number;
		activeSessions: number;
		uniqueUsers: number;
		totalMessages: number;
		avgMessagesPerSession: number;
		totalTurns: number;
		completedTurns: number;
		failedTurns: number;
		cancelledTurns: number;
		staleTurns: number;
		turnSuccessRate: number;
		turnTrend: Trend;
		totalTokensUsed: number;
		billableRequests: number;
		billableCost: number;
		estimatedCost: number;
		isCostEstimated: boolean;
		avgTokensPerTurn: number;
		tokenTrend: Trend;
		costTrend: Trend;
		toolCalls: number;
		toolFailures: number;
		toolSuccessRate: number;
		validationFailures: number;
		avgToolsPerTurn: number;
		avgLlmPassesPerTurn: number;
		llmPasses: number;
		p95TurnDurationMs: number;
		avgTurnDurationMs: number;
		p95LlmResponseMs: number;
		historyCompressionRate: number;
		prewarmedContextRate: number;
		gatewayEnabledRate: number;
		cacheHitRate: number;
	};
	runtime_distribution: {
		first_actions: ChatDashboardDistributionMetric[];
		context_types: ChatDashboardDistributionMetric[];
		statuses: ChatDashboardDistributionMetric[];
		cache_sources: ChatDashboardDistributionMetric[];
	};
	activity_feed: ChatDashboardActivityEvent[];
	top_users: ChatDashboardTopUser[];
	date_range: {
		start: string;
		end: string;
		timeframe: ChatDashboardTimeframe;
	};
	data_health: {
		rows: {
			sessions: number;
			messages: number;
			turnRuns: number;
			llmUsageLogs: number;
			llmPassEvents: number;
			toolExecutions: number;
			evalRuns: number;
		};
		truncated: Record<string, boolean>;
		hasBillableUsage: boolean;
		hasTurnTelemetry: boolean;
		staleRunningTurns: number;
	};
};

export type ChatDashboardSessionRow = {
	id: string;
	user_id?: string | null;
	status?: string | null;
	context_type?: string | null;
	message_count?: number | string | null;
	total_tokens_used?: number | string | null;
	tool_call_count?: number | string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
};

export type ChatDashboardMessageRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	role?: string | null;
	content?: string | null;
	total_tokens?: number | string | null;
	error_message?: string | null;
	created_at?: string | null;
};

export type ChatDashboardTurnRunRow = {
	id: string;
	session_id?: string | null;
	user_id?: string | null;
	context_type?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	gateway_enabled?: boolean | null;
	source?: string | null;
	request_message?: string | null;
	first_lane?: string | null;
	first_canonical_op?: string | null;
	first_help_path?: string | null;
	first_skill_path?: string | null;
	history_compressed?: boolean | null;
	cache_source?: string | null;
	request_prewarmed_context?: boolean | null;
	tool_call_count?: number | string | null;
	validation_failure_count?: number | string | null;
	llm_pass_count?: number | string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
};

export type ChatDashboardUsageRow = {
	id: string;
	user_id?: string | null;
	chat_session_id?: string | null;
	turn_run_id?: string | null;
	operation_type?: string | null;
	model_used?: string | null;
	model_requested?: string | null;
	provider?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	total_cost_usd?: number | string | null;
	response_time_ms?: number | string | null;
	status?: string | null;
	error_message?: string | null;
	openrouter_cache_status?: string | null;
	created_at?: string | null;
	request_started_at?: string | null;
};

export type ChatDashboardTurnEventRow = {
	id?: string | null;
	turn_run_id?: string | null;
	session_id?: string | null;
	user_id?: string | null;
	event_type?: string | null;
	payload?: unknown;
	created_at?: string | null;
};

export type ChatDashboardToolExecutionRow = {
	id: string;
	session_id?: string | null;
	turn_run_id?: string | null;
	tool_name?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	success?: boolean | null;
	execution_time_ms?: number | string | null;
	tokens_consumed?: number | string | null;
	error_message?: string | null;
	created_at?: string | null;
};

export type ChatDashboardEvalRunRow = {
	id: string;
	turn_run_id?: string | null;
	scenario_slug?: string | null;
	status?: string | null;
	started_at?: string | null;
	created_at?: string | null;
};

export type ChatDashboardUserRow = {
	id: string;
	email?: string | null;
	name?: string | null;
};

export type BuildChatDashboardAnalyticsInput = {
	sessions: ChatDashboardSessionRow[];
	messages: ChatDashboardMessageRow[];
	turnRuns: ChatDashboardTurnRunRow[];
	previousTurnRuns: Pick<ChatDashboardTurnRunRow, 'id' | 'status'>[];
	usageRows: ChatDashboardUsageRow[];
	previousUsageRows: Pick<ChatDashboardUsageRow, 'total_tokens' | 'total_cost_usd'>[];
	llmPassEvents: ChatDashboardTurnEventRow[];
	toolExecutions: ChatDashboardToolExecutionRow[];
	evalRuns: ChatDashboardEvalRunRow[];
	users: ChatDashboardUserRow[];
	startIso: string;
	endIso: string;
	timeframe: ChatDashboardTimeframe;
	truncated?: Record<string, boolean>;
};

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50_000;
const ID_CHUNK_SIZE = 250;
const STALE_RUNNING_TURN_MS = 10 * 60 * 1000;

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

function percent(part: number, total: number): number {
	return total > 0 ? (part / total) * 100 : 0;
}

function average(values: number[]): number {
	return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], target: number): number {
	const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (filtered.length === 0) return 0;
	const index = Math.min(filtered.length - 1, Math.ceil((target / 100) * filtered.length) - 1);
	return filtered[index] ?? 0;
}

function computeTrend(current: number, previous: number): Trend {
	const rawValue = previous > 0 ? Math.abs(((current - previous) / previous) * 100) : 0;
	return {
		direction: current >= previous ? 'up' : 'down',
		value: Math.round(rawValue * 10) / 10
	};
}

function parseTimeframe(value: string | null | undefined): ChatDashboardTimeframe {
	if (
		value === '24h' ||
		value === '7d' ||
		value === '30d' ||
		value === '90d' ||
		value === '365d'
	) {
		return value;
	}
	return '7d';
}

function timeframeToMs(timeframe: ChatDashboardTimeframe): number {
	switch (timeframe) {
		case '24h':
			return 24 * 60 * 60 * 1000;
		case '30d':
			return 30 * 24 * 60 * 60 * 1000;
		case '90d':
			return 90 * 24 * 60 * 60 * 1000;
		case '365d':
			return 365 * 24 * 60 * 60 * 1000;
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

function rowTimestamp(row: {
	created_at?: string | null;
	started_at?: string | null;
}): string | null {
	return row.started_at ?? row.created_at ?? null;
}

function durationMs(row: ChatDashboardTurnRunRow): number | null {
	const start = dateMs(row.started_at ?? row.created_at);
	const end = dateMs(row.finished_at);
	if (start === null || end === null || end < start) return null;
	return end - start;
}

function jsonObject(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function parseLlmPassPayload(row: ChatDashboardTurnEventRow) {
	const payload = jsonObject(row.payload);
	const model = textValue(payload.model) ?? 'unknown';
	const promptTokens = numberValue(payload.prompt_tokens);
	const completionTokens = numberValue(payload.completion_tokens);
	const totalTokens = numberValue(payload.total_tokens) || promptTokens + completionTokens;

	return {
		model,
		promptTokens,
		completionTokens,
		totalTokens,
		cacheStatus: textValue(payload.cache_status)
	};
}

function getModelCost(model: string, promptTokens: number, completionTokens: number): number {
	const modelConfig = resolveModelPricingProfile(model)?.profile;
	if (!modelConfig) return 0;
	return (
		(promptTokens / 1_000_000) * modelConfig.cost +
		(completionTokens / 1_000_000) * modelConfig.outputCost
	);
}

function isCacheHit(value: unknown): boolean {
	const normalized = String(value ?? '').toLowerCase();
	return normalized.includes('hit') || normalized.includes('cached');
}

function runtimeActionLabel(turn: ChatDashboardTurnRunRow): string {
	return (
		textValue(turn.first_canonical_op) ??
		textValue(turn.first_help_path) ??
		textValue(turn.first_skill_path) ??
		textValue(turn.first_lane) ??
		'none'
	);
}

function isStaleRunningTurn(
	turn: Pick<ChatDashboardTurnRunRow, 'status' | 'started_at' | 'created_at'>,
	nowMs = Date.now()
): boolean {
	if (turn.status !== 'running') return false;
	const started = dateMs(turn.started_at ?? turn.created_at);
	return started !== null && nowMs - started > STALE_RUNNING_TURN_MS;
}

function effectiveTurnStatus(turn: ChatDashboardTurnRunRow, nowMs = Date.now()): string {
	return isStaleRunningTurn(turn, nowMs) ? 'stale_running' : (turn.status ?? 'unknown');
}

function summarizeText(value: string | null | undefined, maxChars = 110): string {
	const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildDistribution(
	turns: ChatDashboardTurnRunRow[],
	getLabel: (turn: ChatDashboardTurnRunRow) => string | null | undefined
): ChatDashboardDistributionMetric[] {
	const groups = new Map<
		string,
		{ count: number; completed: number; failed: number; toolCalls: number; durations: number[] }
	>();

	for (const turn of turns) {
		const label = textValue(getLabel(turn)) ?? 'unknown';
		const status = effectiveTurnStatus(turn);
		const group = groups.get(label) ?? {
			count: 0,
			completed: 0,
			failed: 0,
			toolCalls: 0,
			durations: []
		};
		group.count += 1;
		if (status === 'completed') group.completed += 1;
		if (status === 'failed' || status === 'stale_running') group.failed += 1;
		group.toolCalls += numberValue(turn.tool_call_count);
		const duration = durationMs(turn);
		if (duration !== null) group.durations.push(duration);
		groups.set(label, group);
	}

	return Array.from(groups.entries())
		.map(([label, group]) => ({
			label,
			count: group.count,
			share: percent(group.count, turns.length),
			success_rate: percent(group.completed, group.count),
			tool_calls: group.toolCalls,
			p95_duration_ms: percentile(group.durations, 95)
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
	let latest: string | null = null;
	for (const value of values) {
		if (!value) continue;
		if (!latest || value > latest) latest = value;
	}
	return latest;
}

function addUserStat(
	stats: Map<string, ChatDashboardTopUser>,
	userMap: Map<string, ChatDashboardUserRow>,
	userId: string | null | undefined
): ChatDashboardTopUser | null {
	if (!userId) return null;
	const existing = stats.get(userId);
	if (existing) return existing;

	const user = userMap.get(userId);
	const created = {
		user_id: userId,
		email: user?.email || 'Unknown',
		name: user?.name || null,
		session_count: 0,
		turn_count: 0,
		message_count: 0,
		tool_calls: 0,
		total_cost: 0,
		total_tokens: 0,
		last_activity: null
	};
	stats.set(userId, created);
	return created;
}

function updateLastActivity(
	stat: ChatDashboardTopUser,
	timestamp: string | null | undefined
): void {
	if (!timestamp) return;
	if (!stat.last_activity || timestamp > stat.last_activity) {
		stat.last_activity = timestamp;
	}
}

export function buildAdminChatDashboardAnalytics(
	params: BuildChatDashboardAnalyticsInput
): ChatDashboardAnalytics {
	const sessionsById = new Map(params.sessions.map((session) => [session.id, session]));
	const turnById = new Map(params.turnRuns.map((turn) => [turn.id, turn]));
	const userMap = new Map(params.users.map((user) => [user.id, user]));
	const sessionIds = new Set<string>();
	const userIds = new Set<string>();

	for (const session of params.sessions) {
		sessionIds.add(session.id);
		if (session.user_id) userIds.add(session.user_id);
	}
	for (const turn of params.turnRuns) {
		if (turn.session_id) sessionIds.add(turn.session_id);
		if (turn.user_id) userIds.add(turn.user_id);
	}
	for (const message of params.messages) {
		if (message.session_id) sessionIds.add(message.session_id);
		if (message.user_id) userIds.add(message.user_id);
	}
	for (const usage of params.usageRows) {
		if (usage.chat_session_id) sessionIds.add(usage.chat_session_id);
		const turn = usage.turn_run_id ? turnById.get(usage.turn_run_id) : null;
		const session = usage.chat_session_id ? sessionsById.get(usage.chat_session_id) : null;
		if (usage.user_id || turn?.user_id || session?.user_id) {
			userIds.add((usage.user_id ?? turn?.user_id ?? session?.user_id) as string);
		}
	}
	for (const tool of params.toolExecutions) {
		if (tool.session_id) sessionIds.add(tool.session_id);
		const turn = tool.turn_run_id ? turnById.get(tool.turn_run_id) : null;
		const session = tool.session_id ? sessionsById.get(tool.session_id) : null;
		if (turn?.user_id || session?.user_id) {
			userIds.add((turn?.user_id ?? session?.user_id) as string);
		}
	}
	for (const event of params.llmPassEvents) {
		if (event.session_id) sessionIds.add(event.session_id);
		const turn = event.turn_run_id ? turnById.get(event.turn_run_id) : null;
		const session = event.session_id ? sessionsById.get(event.session_id) : null;
		if (event.user_id || turn?.user_id || session?.user_id) {
			userIds.add((event.user_id ?? turn?.user_id ?? session?.user_id) as string);
		}
	}
	for (const evalRun of params.evalRuns) {
		const turn = evalRun.turn_run_id ? turnById.get(evalRun.turn_run_id) : null;
		if (turn?.session_id) sessionIds.add(turn.session_id);
		if (turn?.user_id) userIds.add(turn.user_id);
	}

	const startMs = dateMs(params.startIso) ?? 0;
	const endMs = dateMs(params.endIso) ?? Number.POSITIVE_INFINITY;
	const sessionRows = Array.from(sessionsById.values());
	const newSessions = sessionRows.filter((session) => {
		const created = dateMs(session.created_at);
		return created !== null && created >= startMs && created <= endMs;
	}).length;
	const activeSessions = sessionRows.filter((session) => session.status === 'active').length;

	const completedTurns = params.turnRuns.filter((turn) => turn.status === 'completed').length;
	const failedTurns = params.turnRuns.filter((turn) => turn.status === 'failed').length;
	const cancelledTurns = params.turnRuns.filter((turn) => turn.status === 'cancelled').length;
	const staleTurns = params.turnRuns.filter((turn) => isStaleRunningTurn(turn, endMs)).length;
	const turnDurations = params.turnRuns
		.map(durationMs)
		.filter((value): value is number => value !== null);
	const turnToolCalls = params.turnRuns.reduce(
		(sum, turn) => sum + numberValue(turn.tool_call_count),
		0
	);
	const validationFailures = params.turnRuns.reduce(
		(sum, turn) => sum + numberValue(turn.validation_failure_count),
		0
	);
	const llmPassCountFromTurns = params.turnRuns.reduce(
		(sum, turn) => sum + numberValue(turn.llm_pass_count),
		0
	);
	const gatewayTurns = params.turnRuns.filter((turn) => turn.gateway_enabled === true).length;
	const compressedTurns = params.turnRuns.filter(
		(turn) => turn.history_compressed === true
	).length;
	const prewarmedTurns = params.turnRuns.filter(
		(turn) => turn.request_prewarmed_context === true
	).length;

	const totalBillableCost = params.usageRows.reduce(
		(sum, row) => sum + numberValue(row.total_cost_usd),
		0
	);
	const billableTokens = params.usageRows.reduce(
		(sum, row) => sum + numberValue(row.total_tokens),
		0
	);
	const previousBillableCost = params.previousUsageRows.reduce(
		(sum, row) => sum + numberValue(row.total_cost_usd),
		0
	);
	const previousBillableTokens = params.previousUsageRows.reduce(
		(sum, row) => sum + numberValue(row.total_tokens),
		0
	);
	const llmPassPayloads = params.llmPassEvents.map(parseLlmPassPayload);
	const eventTokens = llmPassPayloads.reduce((sum, pass) => sum + pass.totalTokens, 0);
	const estimatedEventCost = llmPassPayloads.reduce(
		(sum, pass) => sum + getModelCost(pass.model, pass.promptTokens, pass.completionTokens),
		0
	);
	const totalTokensUsed = billableTokens > 0 ? billableTokens : eventTokens;
	const isCostEstimated = totalBillableCost <= 0 && estimatedEventCost > 0;
	const estimatedCost = totalBillableCost > 0 ? totalBillableCost : estimatedEventCost;
	const responseTimes = params.usageRows
		.map((row) => numberValue(row.response_time_ms))
		.filter((value) => value > 0);
	const cacheHits =
		params.usageRows.length > 0
			? params.usageRows.filter((row) => isCacheHit(row.openrouter_cache_status)).length
			: llmPassPayloads.filter((pass) => isCacheHit(pass.cacheStatus)).length;
	const cacheDenominator =
		params.usageRows.length > 0 ? params.usageRows.length : llmPassPayloads.length;

	const toolFailures = params.toolExecutions.filter((row) => row.success === false).length;
	const successfulTools = params.toolExecutions.filter((row) => row.success === true).length;
	const totalToolCalls = Math.max(turnToolCalls, params.toolExecutions.length);
	const llmPasses = Math.max(llmPassCountFromTurns, params.llmPassEvents.length);

	const userStats = new Map<string, ChatDashboardTopUser>();
	const sessionsByUser = new Map<string, Set<string>>();

	for (const session of sessionRows) {
		const stat = addUserStat(userStats, userMap, session.user_id);
		if (!stat || !session.user_id) continue;
		const set = sessionsByUser.get(session.user_id) ?? new Set<string>();
		set.add(session.id);
		sessionsByUser.set(session.user_id, set);
		updateLastActivity(
			stat,
			latestTimestamp([session.last_message_at, session.updated_at, session.created_at])
		);
	}
	for (const turn of params.turnRuns) {
		const stat = addUserStat(userStats, userMap, turn.user_id);
		if (!stat) continue;
		stat.turn_count += 1;
		stat.tool_calls += numberValue(turn.tool_call_count);
		updateLastActivity(stat, rowTimestamp(turn));
		if (turn.user_id && turn.session_id) {
			const set = sessionsByUser.get(turn.user_id) ?? new Set<string>();
			set.add(turn.session_id);
			sessionsByUser.set(turn.user_id, set);
		}
	}
	for (const message of params.messages) {
		const stat = addUserStat(userStats, userMap, message.user_id);
		if (!stat) continue;
		stat.message_count += 1;
		updateLastActivity(stat, message.created_at);
		if (message.user_id && message.session_id) {
			const set = sessionsByUser.get(message.user_id) ?? new Set<string>();
			set.add(message.session_id);
			sessionsByUser.set(message.user_id, set);
		}
	}
	for (const usage of params.usageRows) {
		const turn = usage.turn_run_id ? turnById.get(usage.turn_run_id) : null;
		const session = usage.chat_session_id ? sessionsById.get(usage.chat_session_id) : null;
		const stat = addUserStat(
			userStats,
			userMap,
			usage.user_id ?? turn?.user_id ?? session?.user_id
		);
		if (!stat) continue;
		stat.total_cost += numberValue(usage.total_cost_usd);
		stat.total_tokens += numberValue(usage.total_tokens);
		updateLastActivity(stat, usage.request_started_at ?? usage.created_at);
		const sessionId = usage.chat_session_id ?? turn?.session_id;
		if (stat.user_id && sessionId) {
			const set = sessionsByUser.get(stat.user_id) ?? new Set<string>();
			set.add(sessionId);
			sessionsByUser.set(stat.user_id, set);
		}
	}
	for (const [userId, stat] of userStats.entries()) {
		stat.session_count = sessionsByUser.get(userId)?.size ?? 0;
	}

	const topUsers = Array.from(userStats.values())
		.sort(
			(a, b) =>
				b.total_cost - a.total_cost ||
				b.turn_count - a.turn_count ||
				b.message_count - a.message_count
		)
		.slice(0, 10);

	const emailForUser = (userId: string | null | undefined) =>
		userId ? userMap.get(userId)?.email || 'Unknown' : 'Unknown';

	const activityEvents: ChatDashboardActivityEvent[] = [];
	for (const turn of params.turnRuns.slice(0, 30)) {
		const timestamp = rowTimestamp(turn);
		if (!timestamp) continue;
		const status = effectiveTurnStatus(turn, endMs);
		const type =
			status === 'failed' || status === 'stale_running'
				? 'turn_failed'
				: status === 'cancelled'
					? 'turn_cancelled'
					: 'turn_completed';
		activityEvents.push({
			timestamp,
			type,
			severity:
				status === 'failed'
					? 'error'
					: status === 'stale_running' || status === 'cancelled'
						? 'warning'
						: 'success',
			user_email: emailForUser(turn.user_id),
			session_id: turn.session_id ?? null,
			details: `${status === 'stale_running' ? 'stale running' : type === 'turn_completed' ? 'completed' : type === 'turn_failed' ? 'failed' : 'cancelled'} a turn via ${runtimeActionLabel(turn)}`,
			tokens_used: undefined
		});
	}
	for (const tool of params.toolExecutions.filter((row) => row.success === false).slice(0, 20)) {
		const timestamp = tool.created_at;
		if (!timestamp) continue;
		const turn = tool.turn_run_id ? turnById.get(tool.turn_run_id) : null;
		const session = tool.session_id ? sessionsById.get(tool.session_id) : null;
		const label =
			textValue(tool.gateway_op) ??
			textValue(tool.help_path) ??
			textValue(tool.tool_name) ??
			'tool';
		activityEvents.push({
			timestamp,
			type: 'tool_failed',
			severity: 'error',
			user_email: emailForUser(turn?.user_id ?? session?.user_id),
			session_id: tool.session_id ?? turn?.session_id ?? null,
			details: `${label} failed${tool.error_message ? `: ${summarizeText(tool.error_message, 120)}` : ''}`,
			tokens_used: undefined
		});
	}
	for (const usage of params.usageRows
		.filter((row) => row.status && row.status !== 'success')
		.slice(0, 20)) {
		const timestamp = usage.request_started_at ?? usage.created_at;
		if (!timestamp) continue;
		const turn = usage.turn_run_id ? turnById.get(usage.turn_run_id) : null;
		const session = usage.chat_session_id ? sessionsById.get(usage.chat_session_id) : null;
		activityEvents.push({
			timestamp,
			type: 'llm_failed',
			severity: 'error',
			user_email: emailForUser(usage.user_id ?? turn?.user_id ?? session?.user_id),
			session_id: usage.chat_session_id ?? turn?.session_id ?? null,
			details: `${usage.operation_type ?? 'LLM request'} failed${usage.error_message ? `: ${summarizeText(usage.error_message, 120)}` : ''}`,
			tokens_used: numberValue(usage.total_tokens) || undefined
		});
	}
	for (const message of params.messages.slice(0, 20)) {
		if (!message.created_at) continue;
		activityEvents.push({
			timestamp: message.created_at,
			type: 'message',
			severity: message.error_message ? 'error' : 'info',
			user_email: emailForUser(message.user_id),
			session_id: message.session_id ?? null,
			details:
				message.role === 'user'
					? `sent: ${summarizeText(message.content, 100) || '(empty message)'}`
					: `${message.role ?? 'message'} recorded`,
			tokens_used: numberValue(message.total_tokens) || undefined
		});
	}
	for (const evalRun of params.evalRuns.slice(0, 10)) {
		const timestamp = evalRun.started_at ?? evalRun.created_at;
		if (!timestamp) continue;
		const turn = evalRun.turn_run_id ? turnById.get(evalRun.turn_run_id) : null;
		activityEvents.push({
			timestamp,
			type: 'eval_run',
			severity:
				evalRun.status === 'passed'
					? 'success'
					: evalRun.status === 'failed' || evalRun.status === 'error'
						? 'error'
						: 'warning',
			user_email: emailForUser(turn?.user_id),
			session_id: turn?.session_id ?? null,
			details: `prompt eval ${evalRun.scenario_slug ?? 'scenario'} ${evalRun.status ?? 'recorded'}`
		});
	}

	const activityFeed = activityEvents
		.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
		.slice(0, 50);

	const totalSessions = sessionIds.size;
	const totalTurns = params.turnRuns.length;

	return {
		kpis: {
			totalSessions,
			newSessions,
			activeSessions,
			uniqueUsers: userIds.size,
			totalMessages: params.messages.length,
			avgMessagesPerSession: totalSessions > 0 ? params.messages.length / totalSessions : 0,
			totalTurns,
			completedTurns,
			failedTurns,
			cancelledTurns,
			staleTurns,
			turnSuccessRate: percent(completedTurns, totalTurns),
			turnTrend: computeTrend(totalTurns, params.previousTurnRuns.length),
			totalTokensUsed,
			billableRequests: params.usageRows.length,
			billableCost: totalBillableCost,
			estimatedCost,
			isCostEstimated,
			avgTokensPerTurn: totalTurns > 0 ? totalTokensUsed / totalTurns : 0,
			tokenTrend: computeTrend(totalTokensUsed, previousBillableTokens),
			costTrend: computeTrend(totalBillableCost, previousBillableCost),
			toolCalls: totalToolCalls,
			toolFailures,
			toolSuccessRate:
				params.toolExecutions.length > 0
					? percent(successfulTools, params.toolExecutions.length)
					: 0,
			validationFailures,
			avgToolsPerTurn: totalTurns > 0 ? turnToolCalls / totalTurns : 0,
			avgLlmPassesPerTurn: totalTurns > 0 ? llmPasses / totalTurns : 0,
			llmPasses,
			p95TurnDurationMs: percentile(turnDurations, 95),
			avgTurnDurationMs: average(turnDurations),
			p95LlmResponseMs: percentile(responseTimes, 95),
			historyCompressionRate: percent(compressedTurns, totalTurns),
			prewarmedContextRate: percent(prewarmedTurns, totalTurns),
			gatewayEnabledRate: percent(gatewayTurns, totalTurns),
			cacheHitRate: percent(cacheHits, cacheDenominator)
		},
		runtime_distribution: {
			first_actions: buildDistribution(params.turnRuns, runtimeActionLabel).slice(0, 10),
			context_types: buildDistribution(params.turnRuns, (turn) => turn.context_type).slice(
				0,
				10
			),
			statuses: buildDistribution(params.turnRuns, (turn) =>
				effectiveTurnStatus(turn, endMs)
			).slice(0, 10),
			cache_sources: buildDistribution(params.turnRuns, (turn) => turn.cache_source).slice(
				0,
				10
			)
		},
		activity_feed: activityFeed,
		top_users: topUsers,
		date_range: {
			start: params.startIso,
			end: params.endIso,
			timeframe: params.timeframe
		},
		data_health: {
			rows: {
				sessions: params.sessions.length,
				messages: params.messages.length,
				turnRuns: params.turnRuns.length,
				llmUsageLogs: params.usageRows.length,
				llmPassEvents: params.llmPassEvents.length,
				toolExecutions: params.toolExecutions.length,
				evalRuns: params.evalRuns.length
			},
			truncated: params.truncated ?? {},
			hasBillableUsage: params.usageRows.length > 0,
			hasTurnTelemetry: params.turnRuns.length > 0,
			staleRunningTurns: staleTurns
		}
	};
}

async function fetchAllRows<T>(
	queryFactory: (
		from: number,
		to: number
	) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<{ rows: T[]; truncated: boolean }> {
	const rows: T[] = [];
	for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await queryFactory(from, to);
		if (error) throw error;

		const batch = (data ?? []) as T[];
		rows.push(...batch);
		if (batch.length < PAGE_SIZE) {
			return { rows, truncated: false };
		}
	}

	return { rows, truncated: true };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
	return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunk<T>(values: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

async function fetchSessionsByIds(
	supabase: any,
	sessionIds: string[]
): Promise<ChatDashboardSessionRow[]> {
	const rows: ChatDashboardSessionRow[] = [];
	for (const idChunk of chunk(sessionIds, ID_CHUNK_SIZE)) {
		const { data, error } = await supabase
			.from('chat_sessions')
			.select(
				'id, user_id, status, context_type, message_count, total_tokens_used, tool_call_count, created_at, updated_at, last_message_at'
			)
			.in('id', idChunk);
		if (error) throw error;
		rows.push(...((data ?? []) as ChatDashboardSessionRow[]));
	}
	return rows;
}

async function fetchUsersByIds(supabase: any, userIds: string[]): Promise<ChatDashboardUserRow[]> {
	const rows: ChatDashboardUserRow[] = [];
	for (const idChunk of chunk(userIds, ID_CHUNK_SIZE)) {
		const { data, error } = await supabase
			.from('users')
			.select('id, email, name')
			.in('id', idChunk);
		if (error) throw error;
		rows.push(...((data ?? []) as ChatDashboardUserRow[]));
	}
	return rows;
}

export async function getAdminChatDashboardAnalytics(
	supabase: any,
	timeframeValue: string | null | undefined
): Promise<ChatDashboardAnalytics> {
	const timeframe = parseTimeframe(timeframeValue);
	const endDate = new Date();
	const startDate = new Date(endDate.getTime() - timeframeToMs(timeframe));
	const previousStartDate = new Date(startDate.getTime() - timeframeToMs(timeframe));

	const startIso = startDate.toISOString();
	const endIso = endDate.toISOString();
	const previousStartIso = previousStartDate.toISOString();

	const chatUsageFilter = 'chat_session_id.not.is.null,turn_run_id.not.is.null';

	const [
		turnRunResult,
		previousTurnRunResult,
		usageResult,
		previousUsageResult,
		llmPassResult,
		toolResult,
		messageResult,
		evalResult,
		newSessionResult
	] = await Promise.all([
		fetchAllRows<ChatDashboardTurnRunRow>((from, to) =>
			supabase
				.from('chat_turn_runs')
				.select(
					'id, session_id, user_id, context_type, status, finished_reason, gateway_enabled, source, request_message, first_lane, first_canonical_op, first_help_path, first_skill_path, history_compressed, cache_source, request_prewarmed_context, tool_call_count, validation_failure_count, llm_pass_count, started_at, finished_at, created_at'
				)
				.gte('started_at', startIso)
				.lte('started_at', endIso)
				.order('started_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<Pick<ChatDashboardTurnRunRow, 'id' | 'status'>>((from, to) =>
			supabase
				.from('chat_turn_runs')
				.select('id, status')
				.gte('started_at', previousStartIso)
				.lt('started_at', startIso)
				.order('started_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardUsageRow>((from, to) =>
			supabase
				.from('llm_usage_logs')
				.select(
					'id, user_id, chat_session_id, turn_run_id, operation_type, model_used, model_requested, provider, prompt_tokens, completion_tokens, total_tokens, total_cost_usd, response_time_ms, status, error_message, openrouter_cache_status, created_at, request_started_at'
				)
				.or(chatUsageFilter)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<Pick<ChatDashboardUsageRow, 'total_tokens' | 'total_cost_usd'>>((from, to) =>
			supabase
				.from('llm_usage_logs')
				.select('total_tokens, total_cost_usd')
				.or(chatUsageFilter)
				.gte('created_at', previousStartIso)
				.lt('created_at', startIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardTurnEventRow>((from, to) =>
			supabase
				.from('chat_turn_events')
				.select('id, turn_run_id, session_id, user_id, event_type, payload, created_at')
				.eq('event_type', 'llm_pass_completed')
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardToolExecutionRow>((from, to) =>
			supabase
				.from('chat_tool_executions')
				.select(
					'id, session_id, turn_run_id, tool_name, gateway_op, help_path, success, execution_time_ms, tokens_consumed, error_message, created_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardMessageRow>((from, to) =>
			supabase
				.from('chat_messages')
				.select(
					'id, session_id, user_id, role, content, total_tokens, error_message, created_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardEvalRunRow>((from, to) =>
			supabase
				.from('chat_prompt_eval_runs')
				.select('id, turn_run_id, scenario_slug, status, started_at, created_at')
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		),
		fetchAllRows<ChatDashboardSessionRow>((from, to) =>
			supabase
				.from('chat_sessions')
				.select(
					'id, user_id, status, context_type, message_count, total_tokens_used, tool_call_count, created_at, updated_at, last_message_at'
				)
				.gte('created_at', startIso)
				.lte('created_at', endIso)
				.order('created_at', { ascending: false })
				.range(from, to)
		)
	]);

	const sessionsById = new Map(newSessionResult.rows.map((session) => [session.id, session]));
	const sessionIds = uniqueStrings([
		...turnRunResult.rows.map((row) => row.session_id),
		...usageResult.rows.map((row) => row.chat_session_id),
		...toolResult.rows.map((row) => row.session_id),
		...messageResult.rows.map((row) => row.session_id),
		...llmPassResult.rows.map((row) => row.session_id)
	]);
	const missingSessionIds = sessionIds.filter((sessionId) => !sessionsById.has(sessionId));
	const extraSessions = await fetchSessionsByIds(supabase, missingSessionIds);
	for (const session of extraSessions) {
		sessionsById.set(session.id, session);
	}

	const turnById = new Map(turnRunResult.rows.map((turn) => [turn.id, turn]));
	const userIds = uniqueStrings([
		...Array.from(sessionsById.values()).map((row) => row.user_id),
		...turnRunResult.rows.map((row) => row.user_id),
		...messageResult.rows.map((row) => row.user_id),
		...usageResult.rows.map((row) => row.user_id),
		...llmPassResult.rows.map((row) => row.user_id),
		...usageResult.rows.map((row) =>
			row.turn_run_id ? turnById.get(row.turn_run_id)?.user_id : null
		)
	]);
	const users = await fetchUsersByIds(supabase, userIds);

	return buildAdminChatDashboardAnalytics({
		sessions: Array.from(sessionsById.values()),
		messages: messageResult.rows,
		turnRuns: turnRunResult.rows,
		previousTurnRuns: previousTurnRunResult.rows,
		usageRows: usageResult.rows,
		previousUsageRows: previousUsageResult.rows,
		llmPassEvents: llmPassResult.rows,
		toolExecutions: toolResult.rows,
		evalRuns: evalResult.rows,
		users,
		startIso,
		endIso,
		timeframe,
		truncated: {
			sessions: newSessionResult.truncated,
			turnRuns: turnRunResult.truncated,
			previousTurnRuns: previousTurnRunResult.truncated,
			llmUsageLogs: usageResult.truncated,
			previousLlmUsageLogs: previousUsageResult.truncated,
			llmPassEvents: llmPassResult.truncated,
			toolExecutions: toolResult.truncated,
			messages: messageResult.truncated,
			evalRuns: evalResult.truncated
		}
	});
}
