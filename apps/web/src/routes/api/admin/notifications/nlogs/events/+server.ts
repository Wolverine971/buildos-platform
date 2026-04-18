// apps/web/src/routes/api/admin/notifications/nlogs/events/+server.ts
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
		const eventType = url.searchParams.get('event_type');
		const userId = url.searchParams.get('user_id');
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
		const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50'), 1), 200);

		// Build query.
		// `payload` and `metadata` are kept because the admin event table renders
		// them inside an expandable detail row. They are bounded by the page limit
		// (max 200) so total bytes stay reasonable. Switched count to 'estimated'
		// to avoid a per-page COUNT(*) over the entire notification_events table.
		let query = supabase
			.from('notification_events')
			.select(
				`
				id,
				event_type,
				event_source,
				actor_user_id,
				payload,
				metadata,
				created_at,
				users!notification_events_actor_user_id_fkey (
					id,
					email,
					name
				),
				notification_deliveries (
					id,
					channel,
					status,
					recipient_user_id
				)
			`,
				{ count: 'estimated' }
			)
			.order('created_at', { ascending: false });

		// Apply filters
		if (eventType) {
			query = query.eq('event_type', eventType);
		}
		if (userId) {
			query = query.eq('actor_user_id', userId);
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

		const { data: events, error, count } = await query;

		if (error) {
			console.error('Error fetching notification events:', error);
			return ApiResponse.databaseError(error);
		}

		// Calculate delivery status breakdown for each event
		const enrichedEvents = events?.map((event) => {
			const deliveries = event.notification_deliveries || [];
			const statusBreakdown = deliveries.reduce(
				(acc, d) => {
					acc[d.status] = (acc[d.status] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			);

			return {
				...event,
				delivery_count: deliveries.length,
				status_breakdown: statusBreakdown
			};
		});

		return ApiResponse.success({
			events: enrichedEvents || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				total_pages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error fetching notification event logs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification event logs');
	}
};
