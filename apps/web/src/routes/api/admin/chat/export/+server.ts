// apps/web/src/routes/api/admin/chat/export/+server.ts
/**
 * Chat Data Export API
 *
 * Exports current FastChat runtime data and dashboard analytics in JSON or CSV.
 */

import type { RequestHandler } from './$types';
import {
	getAdminChatDashboardAnalytics,
	type ChatDashboardSessionRow
} from '$lib/server/admin-chat-dashboard-analytics';
import { getAdminLlmUsageStats } from '$lib/server/admin-llm-usage-analytics';
import { ApiResponse } from '$lib/utils/api-response';

type Timeframe = '24h' | '7d' | '30d' | '90d' | '365d';

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50_000;
const ID_CHUNK_SIZE = 250;

const CHAT_USAGE_FILTER = 'chat_session_id.not.is.null,turn_run_id.not.is.null';

function parseTimeframe(value: string | null): Timeframe {
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

function timeframeToMs(timeframe: Timeframe): number {
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

function timeframeToDays(timeframe: Timeframe): number {
	return Math.max(1, Math.round(timeframeToMs(timeframe) / (24 * 60 * 60 * 1000)));
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

function csvCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	const raw = String(value);
	if (!/[",\n\r]/.test(raw)) return raw;
	return `"${raw.replaceAll('"', '""')}"`;
}

function numberValue(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
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
				`
				id,
				user_id,
				title,
				auto_title,
				summary,
				status,
				context_type,
				message_count,
				total_tokens_used,
				tool_call_count,
				created_at,
				updated_at,
				last_message_at,
				users!chat_sessions_user_id_fkey(id, email, name)
			`
			)
			.in('id', idChunk);

		if (error) throw error;
		rows.push(...((data ?? []) as ChatDashboardSessionRow[]));
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
	const format = url.searchParams.get('format') || 'json';
	const now = new Date();
	const startDate = new Date(now.getTime() - timeframeToMs(timeframe));
	const startIso = startDate.toISOString();
	const endIso = now.toISOString();

	try {
		const [
			dashboardAnalytics,
			llmUsageStats,
			sessionResult,
			turnRunResult,
			messageResult,
			toolResult,
			turnEventResult,
			usageResult,
			promptSnapshotResult,
			evalRunResult
		] = await Promise.all([
			getAdminChatDashboardAnalytics(supabase, timeframe),
			format === 'json' ? getAdminLlmUsageStats(supabase, timeframeToDays(timeframe)) : null,
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_sessions')
					.select(
						`
						id,
						user_id,
						title,
						auto_title,
						summary,
						status,
						context_type,
						message_count,
						total_tokens_used,
						tool_call_count,
						created_at,
						updated_at,
						last_message_at,
						users!chat_sessions_user_id_fkey(id, email, name)
					`
					)
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_turn_runs')
					.select('*')
					.gte('started_at', startIso)
					.lte('started_at', endIso)
					.order('started_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_messages')
					.select('*')
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_tool_executions')
					.select('*')
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_turn_events')
					.select('*')
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('llm_usage_logs')
					.select('*')
					.or(CHAT_USAGE_FILTER)
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_prompt_snapshots')
					.select(
						'id, turn_run_id, session_id, user_id, snapshot_version, system_prompt_sha256, messages_sha256, tools_sha256, system_prompt_chars, message_chars, approx_prompt_tokens, created_at'
					)
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			),
			fetchAllRows<any>((from, to) =>
				supabase
					.from('chat_prompt_eval_runs')
					.select('*')
					.gte('created_at', startIso)
					.lte('created_at', endIso)
					.order('created_at', { ascending: false })
					.range(from, to)
			)
		]);

		const sessionsById = new Map<string, any>(
			(sessionResult.rows ?? []).map((row) => [row.id, row])
		);
		const sessionIds = uniqueStrings([
			...turnRunResult.rows.map((row: any) => row.session_id),
			...messageResult.rows.map((row: any) => row.session_id),
			...toolResult.rows.map((row: any) => row.session_id),
			...turnEventResult.rows.map((row: any) => row.session_id),
			...usageResult.rows.map((row: any) => row.chat_session_id),
			...promptSnapshotResult.rows.map((row: any) => row.session_id)
		]);
		const missingSessionIds = sessionIds.filter((sessionId) => !sessionsById.has(sessionId));
		const extraSessions = await fetchSessionsByIds(supabase, missingSessionIds);
		for (const session of extraSessions) {
			sessionsById.set(session.id, session);
		}

		const turnById = new Map<string, any>(turnRunResult.rows.map((row: any) => [row.id, row]));
		const messageCountBySession = new Map<string, number>();
		const toolCountBySession = new Map<string, number>();
		const tokensBySession = new Map<string, number>();
		const costBySession = new Map<string, number>();

		for (const message of messageResult.rows) {
			if (!message.session_id) continue;
			messageCountBySession.set(
				message.session_id,
				(messageCountBySession.get(message.session_id) || 0) + 1
			);
		}

		for (const tool of toolResult.rows) {
			const sessionId = tool.session_id ?? turnById.get(tool.turn_run_id)?.session_id;
			if (!sessionId) continue;
			toolCountBySession.set(sessionId, (toolCountBySession.get(sessionId) || 0) + 1);
		}

		for (const usage of usageResult.rows) {
			const sessionId = usage.chat_session_id ?? turnById.get(usage.turn_run_id)?.session_id;
			if (!sessionId) continue;
			tokensBySession.set(
				sessionId,
				(tokensBySession.get(sessionId) || 0) + numberValue(usage.total_tokens)
			);
			costBySession.set(
				sessionId,
				(costBySession.get(sessionId) || 0) + numberValue(usage.total_cost_usd)
			);
		}

		const exportData = {
			export_date: now.toISOString(),
			timeframe,
			date_range: {
				start: startIso,
				end: endIso
			},
			dashboard_analytics: dashboardAnalytics,
			llm_usage_stats: llmUsageStats,
			chat_sessions: Array.from(sessionsById.values()),
			chat_messages: messageResult.rows,
			chat_turn_runs: turnRunResult.rows,
			chat_turn_events: turnEventResult.rows,
			chat_tool_executions: toolResult.rows,
			llm_usage_logs: usageResult.rows,
			chat_prompt_snapshots: promptSnapshotResult.rows,
			chat_prompt_eval_runs: evalRunResult.rows,
			data_quality: {
				row_limit_per_table: MAX_ROWS_PER_TABLE,
				truncated: {
					chat_sessions: sessionResult.truncated,
					chat_turn_runs: turnRunResult.truncated,
					chat_messages: messageResult.truncated,
					chat_tool_executions: toolResult.truncated,
					chat_turn_events: turnEventResult.truncated,
					llm_usage_logs: usageResult.truncated,
					chat_prompt_snapshots: promptSnapshotResult.truncated,
					chat_prompt_eval_runs: evalRunResult.truncated
				}
			},
			summary: {
				total_chat_sessions: sessionsById.size,
				total_chat_messages: messageResult.rows.length,
				total_turn_runs: turnRunResult.rows.length,
				total_turn_events: turnEventResult.rows.length,
				total_tool_executions: toolResult.rows.length,
				total_llm_usage_logs: usageResult.rows.length,
				total_prompt_snapshots: promptSnapshotResult.rows.length,
				total_prompt_eval_runs: evalRunResult.rows.length
			}
		};

		if (format === 'json') {
			return new Response(JSON.stringify(exportData, null, 2), {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': `attachment; filename="chat-export-${timeframe}-${now.toISOString().split('T')[0]}.json"`
				}
			});
		}

		if (format === 'csv') {
			const csvRows = [
				[
					'Session ID',
					'User Email',
					'Status',
					'Context Type',
					'Message Count',
					'Turn Count',
					'Tokens Used',
					'Cost USD',
					'Tool Calls',
					'Created At',
					'Last Message At'
				]
					.map(csvCell)
					.join(',')
			];

			for (const session of Array.from(sessionsById.values())) {
				const turnCount = turnRunResult.rows.filter(
					(turn: any) => turn.session_id === session.id
				).length;
				csvRows.push(
					[
						session.id,
						session.users?.email || '',
						session.status || '',
						session.context_type || '',
						messageCountBySession.get(session.id) ?? session.message_count ?? 0,
						turnCount,
						tokensBySession.get(session.id) ?? session.total_tokens_used ?? 0,
						costBySession.get(session.id) ?? 0,
						toolCountBySession.get(session.id) ?? session.tool_call_count ?? 0,
						session.created_at || '',
						session.last_message_at || ''
					]
						.map(csvCell)
						.join(',')
				);
			}

			return new Response(csvRows.join('\n'), {
				headers: {
					'Content-Type': 'text/csv',
					'Content-Disposition': `attachment; filename="chat-export-${timeframe}-${now.toISOString().split('T')[0]}.csv"`
				}
			});
		}

		return ApiResponse.badRequest('Invalid format. Use "json" or "csv".');
	} catch (err) {
		console.error('Chat export error:', err);
		return ApiResponse.internalError(err, 'Failed to export chat data');
	}
};
