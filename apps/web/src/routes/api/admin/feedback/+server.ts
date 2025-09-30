// apps/web/src/routes/api/admin/feedback/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const status = url.searchParams.get('status');
		const category = url.searchParams.get('category');
		const search = url.searchParams.get('search');
		const sortBy = url.searchParams.get('sort_by') || 'created_at';
		const sortOrder = url.searchParams.get('sort_order') || 'desc';

		const offset = (page - 1) * limit;

		// Build query
		let query = supabase.from('feedback').select('*', { count: 'exact' });

		// Apply filters
		if (status && status !== 'all') {
			query = query.eq('status', status);
		}

		if (category && category !== 'all') {
			query = query.eq('category', category);
		}

		if (search) {
			query = query.or(`feedback_text.ilike.%${search}%,user_email.ilike.%${search}%`);
		}

		// Apply sorting and pagination
		query = query
			.order(sortBy, { ascending: sortOrder === 'asc' })
			.range(offset, offset + limit - 1);

		const { data: feedback, error, count } = await query;

		if (error) throw error;

		const totalPages = Math.ceil((count || 0) / limit);

		return ApiResponse.success({
			feedback: feedback || [],
			pagination: {
				current_page: page,
				total_pages: totalPages,
				total_items: count || 0,
				items_per_page: limit
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch feedback');
	}
};

export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { feedback_id, updates } = await request.json();

		if (!feedback_id) {
			return ApiResponse.badRequest('Feedback ID is required');
		}

		const { data, error } = await supabase
			.from('feedback')
			.update(updates)
			.eq('id', feedback_id)
			.select()
			.single();

		if (error) throw error;

		return ApiResponse.success({ feedback: data }, 'Feedback updated successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update feedback');
	}
};
