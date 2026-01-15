// apps/web/src/routes/api/admin/security/logs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ request, locals: { supabase, safeGetSession }, url }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse query parameters
		const eventType = url.searchParams.get('eventType') || 'all';
		const wasBlocked = url.searchParams.get('wasBlocked') || 'all';
		const dateFilter = url.searchParams.get('dateFilter') || '7days';
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');

		// Build date filter
		let dateThreshold: string | null = null;
		const now = new Date();
		switch (dateFilter) {
			case '24hours':
				dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
				break;
			case '7days':
				dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
				break;
			case '30days':
				dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
				break;
			case 'all':
			default:
				dateThreshold = null;
		}

		// Build query
		let query = supabase
			.from('security_logs')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false });

		// Apply filters
		if (eventType !== 'all') {
			query = query.eq('event_type', eventType);
		}

		if (wasBlocked === 'true') {
			query = query.eq('was_blocked', true);
		} else if (wasBlocked === 'false') {
			query = query.eq('was_blocked', false);
		}

		if (dateThreshold) {
			query = query.gte('created_at', dateThreshold);
		}

		// Apply pagination
		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		// Execute query
		const { data: logs, error, count } = await query;

		if (error) {
			console.error('Error fetching security logs:', error);
			return ApiResponse.internalError(error);
		}

		return ApiResponse.success({
			logs: logs || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error in security logs API:', error);
		return ApiResponse.internalError(error);
	}
};
