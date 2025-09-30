// apps/web/src/routes/api/project-briefs/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const { data, error } = await supabase
			.from('project_daily_briefs')
			.select(
				`
                *,
                projects (
                    name,
                    slug,
                    description,
                    status
                )
            `
			)
			.eq('id', params.id)
			.eq('user_id', userId)
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		if (!data) {
			return ApiResponse.notFound('Brief');
		}

		return ApiResponse.success({ brief: data });
	} catch (error) {
		console.error('Error fetching project brief:', error);
		return ApiResponse.internalError(error, 'Failed to fetch project brief');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const { error } = await supabase
			.from('project_daily_briefs')
			.delete()
			.eq('id', params.id)
			.eq('user_id', userId);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ message: 'Brief deleted successfully' });
	} catch (error) {
		console.error('Error deleting project brief:', error);
		return ApiResponse.internalError(error, 'Failed to delete brief');
	}
};
