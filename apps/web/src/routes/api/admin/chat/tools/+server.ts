// apps/web/src/routes/api/admin/chat/tools/+server.ts
/**
 * Tool Analytics API
 *
 * Uses first-class FastChat tool execution rows as the source of truth.
 * `chat_turn_runs` and `chat_sessions` are loaded only to enrich context
 * filters and gateway/skill distribution metrics.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildChatToolAnalytics,
	type ToolExecutionAnalyticsRow,
	type ToolOutcomeFilter,
	type ToolSessionAnalyticsRow,
	type ToolTurnRunAnalyticsRow
} from '$lib/services/admin/chat-tool-analytics';

const TOOL_EXECUTION_SELECT = `
	id,
	session_id,
	turn_run_id,
	stream_run_id,
	client_turn_id,
	tool_name,
	tool_category,
	gateway_op,
	help_path,
	execution_time_ms,
	tokens_consumed,
	success,
	error_message,
	requires_user_action,
	created_at
`;

const TURN_RUN_SELECT = `
	id,
	session_id,
	context_type,
	status,
	finished_reason,
	tool_round_count,
	tool_call_count,
	validation_failure_count,
	first_lane,
	first_help_path,
	first_skill_path,
	first_canonical_op,
	started_at,
	finished_at,
	created_at
`;

const SESSION_SELECT = `
	id,
	context_type
`;

const PAGE_SIZE = 1000;
const MAX_TOOL_ROWS = 20_000;
const ID_CHUNK_SIZE = 250;

type Timeframe = '24h' | '7d' | '30d';

const isOptionalTableMissing = (error: unknown): boolean => {
	const maybe = error as { code?: string; message?: string } | null;
	if (!maybe) return false;
	if (maybe.code === '42P01') return true;
	return typeof maybe.message === 'string' && /does not exist/i.test(maybe.message);
};

const parseTimeframe = (value: string | null): Timeframe => {
	if (value === '24h' || value === '7d' || value === '30d') return value;
	return '7d';
};

const calcStartDate = (timeframe: Timeframe, now: Date): Date => {
	switch (timeframe) {
		case '24h':
			return new Date(now.getTime() - 24 * 60 * 60 * 1000);
		case '30d':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case '7d':
		default:
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}
};

const parseOutcome = (value: string | null): ToolOutcomeFilter => {
	if (value === 'success' || value === 'failed') return value;
	return 'all';
};

const parseMinCalls = (value: string | null): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1;
};

const chunk = <T>(values: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
};

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] =>
	Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));

async function fetchToolExecutions(params: {
	supabase: any;
	startDate: Date;
	endDate: Date;
}): Promise<{
	rows: ToolExecutionAnalyticsRow[];
	totalCount: number | null;
	truncated: boolean;
}> {
	const rows: ToolExecutionAnalyticsRow[] = [];
	let totalCount: number | null = null;

	for (let offset = 0; offset < MAX_TOOL_ROWS; offset += PAGE_SIZE) {
		const selectOptions = offset === 0 ? { count: 'exact' as const } : undefined;
		const baseQuery = selectOptions
			? params.supabase
					.from('chat_tool_executions')
					.select(TOOL_EXECUTION_SELECT, selectOptions)
			: params.supabase.from('chat_tool_executions').select(TOOL_EXECUTION_SELECT);

		const { data, error, count } = await baseQuery
			.gte('created_at', params.startDate.toISOString())
			.lte('created_at', params.endDate.toISOString())
			.order('created_at', { ascending: false })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) throw error;
		if (offset === 0) {
			totalCount = typeof count === 'number' ? count : null;
		}

		const page = (data ?? []) as ToolExecutionAnalyticsRow[];
		rows.push(...page);

		if (page.length < PAGE_SIZE) break;
	}

	const truncated = totalCount !== null ? rows.length < totalCount : rows.length >= MAX_TOOL_ROWS;

	return {
		rows,
		totalCount,
		truncated
	};
}

async function fetchTurnRunsByIds(
	supabase: any,
	turnRunIds: string[]
): Promise<ToolTurnRunAnalyticsRow[]> {
	if (turnRunIds.length === 0) return [];

	const rows: ToolTurnRunAnalyticsRow[] = [];
	for (const idChunk of chunk(turnRunIds, ID_CHUNK_SIZE)) {
		const { data, error } = await supabase
			.from('chat_turn_runs')
			.select(TURN_RUN_SELECT)
			.in('id', idChunk);

		if (error) {
			if (isOptionalTableMissing(error)) return [];
			throw error;
		}

		rows.push(...((data ?? []) as ToolTurnRunAnalyticsRow[]));
	}
	return rows;
}

async function fetchSessionsByIds(
	supabase: any,
	sessionIds: string[]
): Promise<ToolSessionAnalyticsRow[]> {
	if (sessionIds.length === 0) return [];

	const rows: ToolSessionAnalyticsRow[] = [];
	for (const idChunk of chunk(sessionIds, ID_CHUNK_SIZE)) {
		const { data, error } = await supabase
			.from('chat_sessions')
			.select(SESSION_SELECT)
			.in('id', idChunk);

		if (error) throw error;
		rows.push(...((data ?? []) as ToolSessionAnalyticsRow[]));
	}
	return rows;
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = parseTimeframe(url.searchParams.get('timeframe'));
	const now = new Date();
	const startDate = calcStartDate(timeframe, now);

	try {
		const { rows, totalCount, truncated } = await fetchToolExecutions({
			supabase,
			startDate,
			endDate: now
		});

		const turnRunIds = uniqueNonEmpty(rows.map((row) => row.turn_run_id));
		const sessionIds = uniqueNonEmpty(rows.map((row) => row.session_id));

		const [turnRuns, sessions] = await Promise.all([
			fetchTurnRunsByIds(supabase, turnRunIds),
			fetchSessionsByIds(supabase, sessionIds)
		]);

		const data = buildChatToolAnalytics(rows, turnRuns, sessions, {
			filters: {
				toolSearch: url.searchParams.get('search'),
				category: url.searchParams.get('category'),
				contextType: url.searchParams.get('context_type'),
				outcome: parseOutcome(url.searchParams.get('outcome')),
				gatewayOp: url.searchParams.get('gateway_op'),
				helpPath: url.searchParams.get('help_path'),
				minCalls: parseMinCalls(url.searchParams.get('min_calls'))
			},
			trendBucket: timeframe === '24h' ? 'hour' : 'day',
			startDate: startDate.toISOString(),
			endDate: now.toISOString(),
			totalRowsAvailable: totalCount,
			truncated,
			maxRows: MAX_TOOL_ROWS
		});

		return ApiResponse.success(data);
	} catch (err) {
		console.error('Tool analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load tool analytics');
	}
};
