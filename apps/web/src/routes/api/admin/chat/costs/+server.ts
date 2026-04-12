// apps/web/src/routes/api/admin/chat/costs/+server.ts
/**
 * Chat Cost Analytics API
 *
 * Uses llm_usage_logs as the source of truth and joins chat session / turn
 * observability rows so admins can inspect session cost, marginal turn cost,
 * model cost, and expensive prompts.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildChatCostAnalytics,
	type ChatCostSessionRow,
	type ChatCostTurnRunRow,
	type ChatCostUsageRow,
	type ChatCostUserRow
} from '$lib/services/admin/chat-cost-analytics';

const MAX_USAGE_ROWS = 20_000;
const CHUNK_SIZE = 200;

const calcStartDate = (timeframe: string, now: Date): Date => {
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

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
	Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const chunks = <T>(values: T[], size: number): T[][] => {
	const result: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
};

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

	const timeframe = url.searchParams.get('timeframe') || '7d';
	const now = new Date();
	const startDate = calcStartDate(timeframe, now);

	try {
		const { data: usageLogs, error: usageError } = await supabase
			.from('llm_usage_logs')
			.select(
				`
				id,
				user_id,
				chat_session_id,
				turn_run_id,
				stream_run_id,
				client_turn_id,
				operation_type,
				model_requested,
				model_used,
				prompt_tokens,
				completion_tokens,
				total_tokens,
				input_cost_usd,
				output_cost_usd,
				total_cost_usd,
				request_started_at,
				request_completed_at,
				created_at,
				metadata
			`
			)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', now.toISOString())
			.not('chat_session_id', 'is', null)
			.order('created_at', { ascending: false })
			.range(0, MAX_USAGE_ROWS - 1);

		if (usageError) throw usageError;

		const usageRows = (usageLogs ?? []) as ChatCostUsageRow[];
		const sessionIds = uniqueStrings(usageRows.map((row) => row.chat_session_id));
		const userIds = uniqueStrings(usageRows.map((row) => row.user_id));

		const sessions: ChatCostSessionRow[] = [];
		const turnRuns: ChatCostTurnRunRow[] = [];
		const users: ChatCostUserRow[] = [];

		for (const idChunk of chunks(sessionIds, CHUNK_SIZE)) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select(
					`
					id,
					user_id,
					title,
					auto_title,
					summary,
					context_type,
					created_at,
					updated_at,
					last_message_at,
					users!chat_sessions_user_id_fkey(id, email, name)
				`
				)
				.in('id', idChunk);

			if (error) throw error;
			sessions.push(...((data ?? []) as ChatCostSessionRow[]));
		}

		const sessionUserIds = uniqueStrings(sessions.map((session) => session.user_id));
		for (const idChunk of chunks(uniqueStrings([...userIds, ...sessionUserIds]), CHUNK_SIZE)) {
			const { data, error } = await supabase
				.from('users')
				.select('id, email, name')
				.in('id', idChunk);

			if (error) throw error;
			users.push(...((data ?? []) as ChatCostUserRow[]));
		}

		for (const idChunk of chunks(sessionIds, CHUNK_SIZE)) {
			const { data, error } = await supabase
				.from('chat_turn_runs')
				.select(
					`
					id,
					session_id,
					user_id,
					stream_run_id,
					client_turn_id,
					request_message,
					status,
					llm_pass_count,
					tool_call_count,
					history_strategy,
					history_compressed,
					raw_history_count,
					history_for_model_count,
					started_at,
					finished_at,
					created_at
				`
				)
				.in('session_id', idChunk)
				.order('started_at', { ascending: true });

			if (error) throw error;
			turnRuns.push(...((data ?? []) as ChatCostTurnRunRow[]));
		}

		const analytics = buildChatCostAnalytics({
			usageRows,
			sessions,
			turnRuns,
			users
		});

		return ApiResponse.success({
			...analytics,
			data_quality: {
				source: 'llm_usage_logs',
				usage_rows_returned: usageRows.length,
				usage_row_limit: MAX_USAGE_ROWS,
				is_truncated: usageRows.length >= MAX_USAGE_ROWS,
				exact_attribution_cost: analytics.overview.attributed_cost,
				inferred_attribution_cost: analytics.overview.inferred_cost,
				unattributed_cost: analytics.overview.unattributed_cost
			}
		});
	} catch (err) {
		console.error('Cost analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load cost analytics');
	}
};
