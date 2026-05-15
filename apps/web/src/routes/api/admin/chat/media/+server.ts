// apps/web/src/routes/api/admin/chat/media/+server.ts
import type { RequestHandler } from './$types';
import { getAdminChatMediaUsageAnalytics } from '$lib/server/admin-chat-media-analytics';
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
		return ApiResponse.success(await getAdminChatMediaUsageAnalytics(supabase, timeframe));
	} catch (err) {
		console.error('Chat media analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat media analytics');
	}
};
