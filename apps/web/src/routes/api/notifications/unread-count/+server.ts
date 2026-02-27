// apps/web/src/routes/api/notifications/unread-count/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

const SUPPORTED_CHANNELS = new Set(['push', 'in_app', 'email', 'sms']);
const ACTIVE_STATUSES = ['pending', 'sent', 'delivered'];

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		const requestedChannel = url.searchParams.get('channel');
		let channels: string[] = ['push', 'in_app'];

		if (requestedChannel) {
			if (!SUPPORTED_CHANNELS.has(requestedChannel)) {
				return ApiResponse.badRequest('Invalid channel');
			}
			channels = [requestedChannel];
		}

		const { count, error } = await supabase
			.from('notification_deliveries')
			.select('id', { count: 'exact', head: true })
			.eq('recipient_user_id', user.id)
			.in('channel', channels as any)
			.in('status', ACTIVE_STATUSES as any)
			.is('failed_at', null)
			.is('opened_at', null);

		if (error) {
			console.error('[notifications/unread-count] Failed to fetch count:', error);
			return ApiResponse.internalError(error, 'Failed to fetch unread notification count');
		}

		return ApiResponse.success({ count: count ?? 0, channels });
	} catch (error) {
		console.error('[notifications/unread-count] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to fetch unread notification count');
	}
};
