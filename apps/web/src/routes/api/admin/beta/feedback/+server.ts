// apps/web/src/routes/api/admin/beta/feedback/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const type = url.searchParams.get('type');
		const status = url.searchParams.get('status');
		const search = url.searchParams.get('search');
		const sortBy = url.searchParams.get('sort_by') || 'created_at';
		const sortOrder = url.searchParams.get('sort_order') || 'desc';

		const offset = (page - 1) * limit;

		// Build query with member join for user details
		let query = supabase.from('beta_feedback').select(
			`
				*,
				beta_members (
					full_name,
					email,
					beta_tier
				)
			`,
			{ count: 'exact' }
		);

		// Apply filters
		if (type && type !== 'all') {
			query = query.eq('feedback_type', type);
		}

		if (status && status !== 'all') {
			query = query.eq('feedback_status', status);
		}

		if (search) {
			query = query.or(
				`feedback_title.ilike.%${search}%,feedback_description.ilike.%${search}%`
			);
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
		console.error('Error fetching beta feedback:', error);
		return ApiResponse.internalError(error, 'Failed to fetch beta feedback');
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

		// If implementing feedback, update implemented_at
		if (updates.feedback_status === 'completed' && !updates.implemented_at) {
			updates.implemented_at = new Date().toISOString();
		}

		// If adding founder response, update responded timestamp
		if (updates.founder_response && !updates.founder_responded_at) {
			updates.founder_responded_at = new Date().toISOString();
		}

		const { data, error } = await supabase
			.from('beta_feedback')
			.update(updates)
			.eq('id', feedback_id)
			.select(
				`
				*,
				beta_members (
					full_name,
					email,
					beta_tier
				)
			`
			)
			.single();

		if (error) throw error;

		return ApiResponse.success({ feedback: data }, 'Feedback updated');
	} catch (error) {
		console.error('Error updating beta feedback:', error);
		return ApiResponse.internalError(error, 'Failed to update beta feedback');
	}
};
