// apps/web/src/routes/api/admin/chat/sessions/+server.ts
/**
 * Chat Sessions List API
 *
 * Returns paginated list of chat sessions with filters
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	// Check admin permission
	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	// Parse query parameters
	const timeframe = url.searchParams.get('timeframe') || '7d';
	const status = url.searchParams.get('status');
	const contextType = url.searchParams.get('context_type');
	const search = url.searchParams.get('search');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '20');

	// Calculate time range
	const now = new Date();
	let startDate: Date;

	switch (timeframe) {
		case '24h':
			startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '30d':
			startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case '7d':
		default:
			startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}

	try {
		// Build query
		let query = supabase
			.from('chat_sessions')
			.select(
				`
        *,
        users!inner(id, email, name)
      `,
				{ count: 'exact' }
			)
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false });

		// Apply filters
		if (status) {
			query = query.eq('status', status);
		}

		if (contextType) {
			query = query.eq('context_type', contextType);
		}

		if (search) {
			// Search in user email or session ID
			query = query.or(`id.ilike.%${search}%,users.email.ilike.%${search}%`);
		}

		// Apply pagination
		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		const { data: sessionsData, error: sessionsError, count } = await query;

		if (sessionsError) throw sessionsError;

		// For each session, check for agent plans, compressions, and errors
		const sessionIds = sessionsData?.map((s) => s.id) || [];

		const usageBySession = new Map<string, { total_tokens: number; total_cost: number }>();
		if (sessionIds.length > 0) {
			const { data: usageLogs, error: usageError } = await supabase
				.from('llm_usage_logs')
				.select('chat_session_id, total_tokens, total_cost_usd')
				.in('chat_session_id', sessionIds);

			if (usageError) throw usageError;

			(usageLogs || []).forEach((log) => {
				if (!log.chat_session_id) return;
				const current = usageBySession.get(log.chat_session_id) || {
					total_tokens: 0,
					total_cost: 0
				};
				current.total_tokens += log.total_tokens || 0;
				current.total_cost += Number(log.total_cost_usd || 0);
				usageBySession.set(log.chat_session_id, current);
			});
		}

		// Check for agent plans
		const { data: plansData } = await supabase
			.from('agent_plans')
			.select('session_id')
			.in('session_id', sessionIds);

		const sessionsWithPlans = new Set(plansData?.map((p) => p.session_id) || []);

		// Check for compressions
		const { data: compressionsData } = await supabase
			.from('chat_compressions')
			.select('session_id')
			.in('session_id', sessionIds);

		const sessionsWithCompressions = new Set(compressionsData?.map((c) => c.session_id) || []);

		// Check for errors (messages with error_message)
		const { data: errorMessagesData } = await supabase
			.from('chat_messages')
			.select('session_id')
			.in('session_id', sessionIds)
			.not('error_message', 'is', null);

		const sessionsWithErrors = new Set(errorMessagesData?.map((m) => m.session_id) || []);

		// Format sessions
		const sessions = (sessionsData || []).map((session) => {
			const usageStats = usageBySession.get(session.id);
			const totalTokens = usageStats?.total_tokens ?? session.total_tokens_used ?? 0;
			const costEstimate = usageStats?.total_cost ?? (totalTokens / 1000000) * 0.21; // $0.21 per 1M tokens fallback

			return {
				id: session.id,
				title: session.title || session.auto_title || 'Untitled Session',
				user: {
					id: session.users.id,
					email: session.users.email,
					name: session.users.name
				},
				message_count: session.message_count || 0,
				total_tokens: totalTokens,
				tool_call_count: session.tool_call_count || 0,
				context_type: session.context_type,
				status: session.status,
				created_at: session.created_at,
				updated_at: session.updated_at,
				has_agent_plan: sessionsWithPlans.has(session.id),
				has_compression: sessionsWithCompressions.has(session.id),
				has_errors: sessionsWithErrors.has(session.id),
				cost_estimate: costEstimate
			};
		});

		return ApiResponse.success({
			sessions,
			total: count || 0,
			page,
			limit,
			total_pages: Math.ceil((count || 0) / limit)
		});
	} catch (err) {
		console.error('Sessions list error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat sessions');
	}
};
