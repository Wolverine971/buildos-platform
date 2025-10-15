// apps/web/src/routes/api/admin/notifications/nlogs/deliveries/+server.ts
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
		// Parse query parameters
		const channel = url.searchParams.get('channel');
		const status = url.searchParams.get('status');
		const userId = url.searchParams.get('user_id');
		const eventId = url.searchParams.get('event_id');
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');

		// Build query
		let query = supabase
			.from('notification_deliveries')
			.select(
				`
				id,
				event_id,
				recipient_user_id,
				channel,
				channel_identifier,
				status,
				payload,
				created_at,
				sent_at,
				delivered_at,
				failed_at,
				opened_at,
				clicked_at,
				last_error,
				notification_events!inner (
					id,
					event_type,
					event_source,
					actor_user_id
				),
				users!notification_deliveries_recipient_user_id_fkey (
					id,
					email,
					name
				)
			`,
				{ count: 'exact' }
			)
			.order('created_at', { ascending: false });

		// Apply filters
		if (channel) {
			query = query.eq('channel', channel);
		}
		if (status) {
			query = query.eq('status', status);
		}
		if (userId) {
			query = query.eq('recipient_user_id', userId);
		}
		if (eventId) {
			query = query.eq('event_id', eventId);
		}
		if (from) {
			query = query.gte('created_at', from);
		}
		if (to) {
			query = query.lte('created_at', to);
		}

		// Apply pagination
		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		const { data: deliveries, error, count } = await query;

		if (error) {
			console.error('Error fetching notification deliveries:', error);
			return ApiResponse.databaseError(error);
		}

		// Enrich deliveries with timeline data
		const enrichedDeliveries = deliveries?.map((delivery) => {
			const timeline = {
				created: delivery.created_at,
				sent: delivery.sent_at,
				delivered: delivery.delivered_at,
				failed: delivery.failed_at,
				opened: delivery.opened_at,
				clicked: delivery.clicked_at
			};

			// Calculate durations
			const durations = {
				to_send:
					delivery.sent_at && delivery.created_at
						? new Date(delivery.sent_at).getTime() -
							new Date(delivery.created_at).getTime()
						: null,
				to_deliver:
					delivery.delivered_at && delivery.sent_at
						? new Date(delivery.delivered_at).getTime() -
							new Date(delivery.sent_at).getTime()
						: null,
				to_open:
					delivery.opened_at && delivery.delivered_at
						? new Date(delivery.opened_at).getTime() -
							new Date(delivery.delivered_at).getTime()
						: null
			};

			return {
				...delivery,
				timeline,
				durations
			};
		});

		return ApiResponse.success({
			deliveries: enrichedDeliveries || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				total_pages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error fetching notification delivery logs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification delivery logs');
	}
};
