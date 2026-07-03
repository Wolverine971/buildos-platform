// apps/web/src/routes/api/admin/chat/users/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	assertAdminChatUserAnalyticsRedacted,
	loadAdminChatUserAnalytics,
	parseAdminChatUsersQuery
} from '$lib/server/admin-chat-user-analytics';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const query = parseAdminChatUsersQuery(url.searchParams);
		const adminSupabase = createAdminSupabaseClient();
		const payload = await loadAdminChatUserAnalytics(adminSupabase, query);
		assertAdminChatUserAnalyticsRedacted(payload);
		return ApiResponse.success(payload);
	} catch (err) {
		console.error('Chat user analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat user analytics');
	}
};
