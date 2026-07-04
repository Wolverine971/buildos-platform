// apps/web/src/routes/api/admin/chat/users/[userId]/sessions/[sessionId]/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	assertAdminChatUserAnalyticsRedacted,
	loadAdminChatRedactedSession
} from '$lib/server/admin-chat-user-analytics';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const userId = params.userId?.trim();
		const sessionId = params.sessionId?.trim();
		if (!userId || !sessionId) {
			return ApiResponse.badRequest('User ID and session ID required');
		}

		const adminSupabase = createAdminSupabaseClient();
		const payload = await loadAdminChatRedactedSession(adminSupabase, userId, sessionId);
		if (!payload) {
			return ApiResponse.notFound('Chat session analytics');
		}
		assertAdminChatUserAnalyticsRedacted(payload);
		return ApiResponse.success(payload);
	} catch (err) {
		console.error('Redacted chat session analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load redacted chat session analytics');
	}
};
