// apps/web/src/routes/api/admin/notifications/test/history/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		// Get test notification events (marked with test_mode metadata)
		const { data: events, error: eventsError } = await supabase
			.from('notification_events')
			.select(
				`
				id,
				event_type,
				created_at,
				metadata,
				payload
			`
			)
			.eq('metadata->>test_mode', 'true')
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (eventsError) {
			console.error('Error fetching test events:', eventsError);
			return ApiResponse.databaseError(eventsError);
		}

		// Get total count
		const { count, error: countError } = await supabase
			.from('notification_events')
			.select('id', { count: 'exact', head: true })
			.eq('metadata->>test_mode', 'true');

		if (countError) {
			console.error('Error getting test events count:', countError);
		}

		// For each event, get its deliveries
		const testsWithDeliveries = await Promise.all(
			(events || []).map(async (event) => {
				const { data: deliveries } = await supabase
					.from('notification_deliveries')
					.select(
						`
						id,
						channel,
						status,
						last_error,
						recipient_user_id,
						users!inner(email)
					`
					)
					.eq('event_id', event.id);

				const metadata = event.metadata as Record<string, any>;
				const channels = metadata?.test_channels || [];
				const recipientCount = metadata?.test_recipients?.length || 0;

				return {
					event_id: event.id,
					event_type: event.event_type,
					created_at: event.created_at,
					recipient_count: recipientCount,
					channel_count: channels.length,
					channels,
					deliveries:
						deliveries?.map((d: any) => ({
							delivery_id: d.id,
							channel: d.channel,
							recipient_email: d.users?.email,
							status: d.status,
							error: d.last_error
						})) || []
				};
			})
		);

		return ApiResponse.success({
			tests: testsWithDeliveries,
			total_count: count || 0
		});
	} catch (error) {
		console.error('Error fetching test notification history:', error);
		return ApiResponse.internalError(error, 'Failed to fetch test notification history');
	}
};
