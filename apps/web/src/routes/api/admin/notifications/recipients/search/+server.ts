// apps/web/src/routes/api/admin/notifications/recipients/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { EventType } from '@buildos/shared-types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const query = url.searchParams.get('q') || '';
		const eventType = url.searchParams.get('event_type') as EventType | null;
		const limit = parseInt(url.searchParams.get('limit') || '20', 10);

		// Build the query
		let usersQuery = supabase.from('users').select(`
				id,
				email,
				name,
				is_admin,
				phone,
				push_subscriptions!inner(id),
				notification_subscriptions(event_type, is_active)
			`);

		// Search filter
		if (query) {
			usersQuery = usersQuery.or(`email.ilike.%${query}%,name.ilike.%${query}%`);
		}

		// Apply limit
		usersQuery = usersQuery.limit(limit);

		const { data: users, error } = await usersQuery;

		if (error) {
			console.error('Error searching users:', error);
			return ApiResponse.databaseError(error);
		}

		// Transform data
		const results = (users || []).map((u: any) => ({
			id: u.id,
			email: u.email,
			name: u.name,
			is_admin: u.is_admin,
			has_push_subscription: (u.push_subscriptions || []).length > 0,
			has_phone: !!u.phone,
			is_subscribed_to_event: eventType
				? (u.notification_subscriptions || []).some(
						(sub: any) => sub.event_type === eventType && sub.is_active
					)
				: undefined
		}));

		return ApiResponse.success({ users: results });
	} catch (error) {
		console.error('Error searching recipients:', error);
		return ApiResponse.internalError(error, 'Failed to search recipients');
	}
};
