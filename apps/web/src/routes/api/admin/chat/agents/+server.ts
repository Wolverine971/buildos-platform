// apps/web/src/routes/api/admin/chat/agents/+server.ts
/**
 * Chat Runtime Analytics API
 *
 * This route previously reported legacy multi-agent tables. It now powers the
 * runtime drilldown from the current FastChat telemetry sources.
 */

import type { RequestHandler } from './$types';
import { getAdminChatDashboardAnalytics } from '$lib/server/admin-chat-dashboard-analytics';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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
		const adminSupabase = createAdminSupabaseClient();
		return ApiResponse.success(await getAdminChatDashboardAnalytics(adminSupabase, timeframe));
	} catch (err) {
		console.error('Chat runtime analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat runtime analytics');
	}
};
