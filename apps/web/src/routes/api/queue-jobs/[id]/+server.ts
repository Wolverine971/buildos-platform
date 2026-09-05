// apps/web/src/routes/api/queue-jobs/[id]/+server.ts
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
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
		const { data: cancelledJob, error } = await supabase
			.from('queue_jobs')
			.update({
				status: 'cancelled',
				error_message: 'Cancelled by user',
				processed_at: new Date().toISOString()
			})
			.eq('queue_job_id', params.id)
			.eq('user_id', user.id)
			.eq('status', 'pending')
			.select('id')
			.maybeSingle();

		if (error) {
			throw error;
		}

		if (!cancelledJob) {
			// A worker may have claimed the job before the conditional update.
			// Only look up the current user's row when cancellation did not occur.
			const { data: existingJob, error: lookupError } = await supabase
				.from('queue_jobs')
				.select('id')
				.eq('queue_job_id', params.id)
				.eq('user_id', user.id)
				.maybeSingle();
			if (lookupError) throw lookupError;
			if (!existingJob) return ApiResponse.notFound('Job');
			return ApiResponse.error(
				'Job is no longer pending and could not be cancelled',
				HttpStatus.CONFLICT,
				'JOB_NOT_PENDING'
			);
		}

		return ApiResponse.success({ success: true }, 'Job cancelled');
	} catch (error) {
		console.error('Error cancelling job:', error);
		return ApiResponse.internalError(error, 'Failed to cancel job');
	}
};
