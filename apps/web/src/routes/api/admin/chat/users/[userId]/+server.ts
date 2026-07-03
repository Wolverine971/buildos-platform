// apps/web/src/routes/api/admin/chat/users/[userId]/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	assertAdminChatUserAnalyticsRedacted,
	loadAdminChatUserDetail,
	parseAdminChatUserDetailQuery
} from '$lib/server/admin-chat-user-analytics';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const userId = params.userId?.trim();
		if (!userId) {
			return ApiResponse.badRequest('User ID required');
		}

		const query = parseAdminChatUserDetailQuery(url.searchParams);
		const adminSupabase = createAdminSupabaseClient();
		const payload = await loadAdminChatUserDetail(adminSupabase, userId, query);
		if (!payload) {
			return ApiResponse.notFound('Chat user analytics');
		}
		assertAdminChatUserAnalyticsRedacted(payload);
		return ApiResponse.success(payload);
	} catch (err) {
		console.error('Chat user detail analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat user detail analytics');
	}
};
