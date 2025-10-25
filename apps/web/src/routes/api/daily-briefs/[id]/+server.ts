// apps/web/src/routes/api/daily-briefs/[id]/+server.ts
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
			.from('daily_briefs')
			.select('*')
			.eq('id', params.id)
			.eq('user_id', userId)
			.single();

		if (error) throw error;

		return ApiResponse.success({ brief: data });
	} catch (error) {
		console.error('Error fetching daily brief:', error);
		return ApiResponse.notFound('Brief');
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const updates = await request.json();

		const { data, error } = await supabase
			.from('daily_briefs')
			.update({ ...updates, updated_at: new Date().toISOString() })
			.eq('id', params.id)
			.eq('user_id', userId)
			.select()
			.single();

		if (error) throw error;

		return ApiResponse.success({ brief: data });
	} catch (error) {
		console.error('Error updating daily brief:', error);
		return ApiResponse.internalError(error, 'Failed to update brief');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { id } = params;

	try {
		// Delete the daily brief (this should cascade to project briefs)
		const { error: deleteError } = await supabase
			.from('daily_briefs')
			.delete()
			.eq('id', id)
			.eq('user_id', user.id);

		if (deleteError) {
			throw deleteError;
		}

		return ApiResponse.success({ success: true });
	} catch (err) {
		console.error('Error deleting brief:', err);
		return ApiResponse.internalError(err, 'Failed to delete brief');
	}
};
