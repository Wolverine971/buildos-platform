// apps/web/src/routes/api/admin/chat/dashboard/+server.ts
/**
 * Chat Monitoring Dashboard API
 *
 * Top-level chat dashboard metrics use the current FastChat runtime sources:
 * chat_sessions, chat_messages, chat_turn_runs, chat_turn_events,
 * chat_tool_executions, and chat-linked llm_usage_logs.
 */

import type { RequestHandler } from './$types';
import { getAdminChatDashboardAnalytics } from '$lib/server/admin-chat-dashboard-analytics';
import { ApiResponse } from '$lib/utils/api-response';

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

	try {
		const timeframe = url.searchParams.get('timeframe') || '7d';
		return ApiResponse.success(await getAdminChatDashboardAnalytics(supabase, timeframe));
	} catch (err) {
		console.error('Chat dashboard error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat dashboard');
	}
};
