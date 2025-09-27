// src/routes/api/projects/[id]/notes/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const projectId = params.id;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		// Get pagination parameters
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = (page - 1) * limit;

		// Fetch notes for the project
		const {
			data: notes,
			error,
			count
		} = await supabase
			.from('notes')
			.select('*', { count: 'exact' })
			.eq('project_id', projectId)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			console.error('Error fetching notes:', error);
			return ApiResponse.error('Failed to fetch notes');
		}

		return ApiResponse.success({
			notes: notes || [],
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit)
			}
		});
	} catch (error) {
		console.error('Error in notes API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};
