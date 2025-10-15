// apps/web/src/routes/api/admin/notifications/nlogs/system/+server.ts
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
		const level = url.searchParams.get('level');
		const correlationId = url.searchParams.get('correlation_id');
		const eventId = url.searchParams.get('event_id');
		const deliveryId = url.searchParams.get('delivery_id');
		const namespace = url.searchParams.get('namespace');
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const search = url.searchParams.get('search');
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '100');

		// Build query
		let query = supabase
			.from('notification_logs')
			.select(
				`
				id,
				correlation_id,
				request_id,
				user_id,
				notification_event_id,
				notification_delivery_id,
				level,
				message,
				namespace,
				metadata,
				error_stack,
				created_at,
				users (
					id,
					email,
					full_name
				),
				notification_events (
					id,
					event_type
				),
				notification_deliveries (
					id,
					channel,
					status
				)
			`,
				{ count: 'exact' }
			)
			.order('created_at', { ascending: false });

		// Apply filters
		if (level) {
			query = query.eq('level', level);
		}
		if (correlationId) {
			query = query.eq('correlation_id', correlationId);
		}
		if (eventId) {
			query = query.eq('notification_event_id', eventId);
		}
		if (deliveryId) {
			query = query.eq('notification_delivery_id', deliveryId);
		}
		if (namespace) {
			query = query.ilike('namespace', `${namespace}%`);
		}
		if (from) {
			query = query.gte('created_at', from);
		}
		if (to) {
			query = query.lte('created_at', to);
		}
		if (search) {
			query = query.or(`message.ilike.%${search}%,namespace.ilike.%${search}%`);
		}

		// Apply pagination
		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		const { data: logs, error, count } = await query;

		if (error) {
			console.error('Error fetching notification system logs:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			logs: logs || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				total_pages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error fetching notification system logs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification system logs');
	}
};
