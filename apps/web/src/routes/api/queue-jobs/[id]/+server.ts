// apps/web/src/routes/api/queue-jobs/[id]/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const { data: job, error } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('queue_job_id', params.id)
			.eq('user_id', user.id)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				return ApiResponse.notFound('Job');
			}
			throw error;
		}

		return ApiResponse.success(job);
	} catch (error) {
		console.error('Error fetching queue job:', error);
		return ApiResponse.internalError(error, 'Failed to fetch job');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		// Only allow cancelling pending jobs
		const { error } = await supabase
			.from('queue_jobs')
			.update({
				status: 'cancelled',
				error_message: 'Cancelled by user',
				processed_at: new Date().toISOString()
			})
			.eq('queue_job_id', params.id)
			.eq('user_id', user.id)
			.eq('status', 'pending');

		if (error) {
			throw error;
		}

		return ApiResponse.success({ success: true }, 'Job cancelled');
	} catch (error) {
		console.error('Error cancelling job:', error);
		return ApiResponse.internalError(error, 'Failed to cancel job');
	}
};
