// apps/web/src/routes/api/admin/chat/sessions/+server.ts
/**
 * Chat Session Audit List API
 *
 * Returns paginated current-agent sessions (`chat_sessions`) with
 * aggregated metrics from:
 * - chat_messages
 * - chat_tool_executions
 * - llm_usage_logs
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type SessionAggregate = {
	messageCount: number;
	messageTokens: number;
	messageErrors: number;
	toolTraceCount: number;
};

type ToolAggregate = {
	total: number;
	failures: number;
	lastExecutedAt: string | null;
};

type UsageAggregate = {
	llmCalls: number;
	totalTokens: number;
	totalCost: number;
	failures: number;
};

const COST_PER_MILLION_TOKENS_USD = 0.21;

const parsePositiveInt = (value: string | null, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return parsed;
};

const asNumber = (value: unknown): number => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const toIsoOrNow = (value: string | null | undefined): string => value ?? new Date().toISOString();

const buildTitle = (session: {
	title?: string | null;
	auto_title?: string | null;
	summary?: string | null;
	context_type?: string | null;
}): string => {
	const explicitTitle = session.title?.trim() || session.auto_title?.trim();
	if (explicitTitle) return explicitTitle;
	if (session.summary?.trim()) {
		return session.summary.trim().slice(0, 120);
	}
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `Agent Session (${contextType})`;
};

const calcStartDate = (timeframe: string): Date => {
	const now = new Date();
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

const parseToolTraceCountFromMetadata = (metadata: unknown): number => {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
	const record = metadata as Record<string, unknown>;
	const trace = record.fastchat_tool_trace_v1;
	return Array.isArray(trace) ? trace.length : 0;
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
	const status = url.searchParams.get('status');
	const contextType = url.searchParams.get('context_type');
	const search = url.searchParams.get('search')?.trim();
	const sortOrder = url.searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc';
	const page = parsePositiveInt(url.searchParams.get('page'), 1);
	const limit = Math.min(parsePositiveInt(url.searchParams.get('limit'), 20), 100);
	const offset = (page - 1) * limit;
	const startDate = calcStartDate(timeframe);

	const allowedDbSortFields = new Set(['created_at', 'updated_at', 'last_message_at']);
	const requestedSort = (url.searchParams.get('sort_by') || 'updated_at').trim();
	const sortBy = allowedDbSortFields.has(requestedSort) ? requestedSort : 'updated_at';

	try {
		let query = supabase
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
        entity_id,
        message_count,
        total_tokens_used,
        tool_call_count,
        created_at,
        updated_at,
        last_message_at,
        agent_metadata,
        users!chat_sessions_user_id_fkey(id, email, name)
      `,
				{ count: 'exact' }
			)
			.gte('created_at', startDate.toISOString())
			.order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: sortOrder === 'asc' })
			.range(offset, offset + limit - 1);

		if (status && status !== 'all') {
			query = query.eq('status', status);
		}

		if (contextType && contextType !== 'all') {
			query = query.eq('context_type', contextType);
		}

		if (search) {
			query = query.or(
				`id.ilike.%${search}%,title.ilike.%${search}%,auto_title.ilike.%${search}%,summary.ilike.%${search}%`
			);
		}

		const { data: sessionRows, error: sessionError, count } = await query;
		if (sessionError) throw sessionError;

		const sessionsData = sessionRows ?? [];
		const sessionIds = sessionsData.map((session: any) => session.id).filter(Boolean);

		const messageAggBySession = new Map<string, SessionAggregate>();
		const toolAggBySession = new Map<string, ToolAggregate>();
		const usageAggBySession = new Map<string, UsageAggregate>();
		const sessionsWithErrors = new Set<string>();

		if (sessionIds.length > 0) {
			const [
				{ data: messageRows, error: messageError },
				{ data: toolRows, error: toolError },
				{ data: usageRows, error: usageError }
			] = await Promise.all([
				supabase
					.from('chat_messages')
					.select('session_id, total_tokens, error_message, role, metadata')
					.in('session_id', sessionIds),
				supabase
					.from('chat_tool_executions')
					.select('session_id, success, created_at')
					.in('session_id', sessionIds),
				supabase
					.from('llm_usage_logs')
					.select('chat_session_id, total_tokens, total_cost_usd, status, error_message')
					.in('chat_session_id', sessionIds)
			]);

			if (messageError) throw messageError;
			if (toolError) throw toolError;
			if (usageError) throw usageError;

			for (const row of messageRows ?? []) {
				const sessionId = row.session_id;
				if (!sessionId) continue;
				const current = messageAggBySession.get(sessionId) ?? {
					messageCount: 0,
					messageTokens: 0,
					messageErrors: 0,
					toolTraceCount: 0
				};
				current.messageCount += 1;
				current.messageTokens += asNumber(row.total_tokens);
				current.toolTraceCount += parseToolTraceCountFromMetadata(row.metadata);
				if (row.error_message) {
					current.messageErrors += 1;
					sessionsWithErrors.add(sessionId);
				}
				messageAggBySession.set(sessionId, current);
			}

			for (const row of toolRows ?? []) {
				const sessionId = row.session_id;
				if (!sessionId) continue;
				const current = toolAggBySession.get(sessionId) ?? {
					total: 0,
					failures: 0,
					lastExecutedAt: null
				};
				current.total += 1;
				if (row.success === false) {
					current.failures += 1;
					sessionsWithErrors.add(sessionId);
				}
				if (
					row.created_at &&
					(!current.lastExecutedAt || row.created_at > current.lastExecutedAt)
				) {
					current.lastExecutedAt = row.created_at;
				}
				toolAggBySession.set(sessionId, current);
			}

			for (const row of usageRows ?? []) {
				const sessionId = row.chat_session_id;
				if (!sessionId) continue;
				const current = usageAggBySession.get(sessionId) ?? {
					llmCalls: 0,
					totalTokens: 0,
					totalCost: 0,
					failures: 0
				};
				current.llmCalls += 1;
				current.totalTokens += asNumber(row.total_tokens);
				current.totalCost += asNumber(row.total_cost_usd);
				if (row.status !== 'success' || row.error_message) {
					current.failures += 1;
					sessionsWithErrors.add(sessionId);
				}
				usageAggBySession.set(sessionId, current);
			}
		}

		const sessions = sessionsData.map((session: any) => {
			const messageAgg = messageAggBySession.get(session.id);
			const toolAgg = toolAggBySession.get(session.id);
			const usageAgg = usageAggBySession.get(session.id);
			const metadata =
				session.agent_metadata && typeof session.agent_metadata === 'object'
					? (session.agent_metadata as Record<string, unknown>)
					: {};

			const messageCount = Number(session.message_count ?? messageAgg?.messageCount ?? 0);
			const totalTokens = Number(
				session.total_tokens_used ?? usageAgg?.totalTokens ?? messageAgg?.messageTokens ?? 0
			);
			const toolCallCount = Number(
				toolAgg?.total ?? session.tool_call_count ?? messageAgg?.toolTraceCount ?? 0
			);
			const llmCallCount = usageAgg?.llmCalls ?? 0;
			const toolFailureCount = toolAgg?.failures ?? 0;
			const hasErrors =
				sessionsWithErrors.has(session.id) ||
				toolFailureCount > 0 ||
				(usageAgg?.failures ?? 0) > 0 ||
				(messageAgg?.messageErrors ?? 0) > 0;
			const costEstimate =
				usageAgg?.totalCost && usageAgg.totalCost > 0
					? usageAgg.totalCost
					: (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS_USD;

			return {
				id: session.id,
				title: buildTitle(session),
				user: {
					id: session.users?.id ?? session.user_id,
					email: session.users?.email ?? '',
					name: session.users?.name ?? ''
				},
				status: session.status ?? 'active',
				context_type: session.context_type ?? 'global',
				entity_id: session.entity_id ?? null,
				message_count: messageCount,
				total_tokens: totalTokens,
				tool_call_count: toolCallCount,
				llm_call_count: llmCallCount,
				tool_failure_count: toolFailureCount,
				cost_estimate: costEstimate,
				has_errors: hasErrors,
				has_agent_state: Boolean(metadata.agent_state),
				has_context_shift: Boolean(metadata.fastchat_last_context_shift),
				last_tool_at: toolAgg?.lastExecutedAt ?? null,
				created_at: toIsoOrNow(session.created_at),
				updated_at: toIsoOrNow(
					session.updated_at ?? session.last_message_at ?? session.created_at
				),
				last_message_at: session.last_message_at ?? null
			};
		});

		return ApiResponse.success({
			sessions,
			total: count || 0,
			page,
			limit,
			total_pages: Math.max(1, Math.ceil((count || 0) / limit))
		});
	} catch (err) {
		console.error('Sessions list error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat sessions');
	}
};
