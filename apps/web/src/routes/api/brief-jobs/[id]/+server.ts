// apps/web/src/routes/api/brief-jobs/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// First try to find by ID (primary key)
		const { data: jobById, error: idError } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('queue_job_id', params.id)
			.eq('user_id', user.id)
			.single();

		if (!idError && jobById) {
			return ApiResponse.success({ job: jobById });
		}

		// If not found by ID, try queue_job_id
		// This maintains backward compatibility
		const { data: jobByQueueId, error: queueIdError } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('queue_job_id', params.id)
			.eq('user_id', user.id)
			.single();

		if (!queueIdError && jobByQueueId) {
			return ApiResponse.success({ job: jobByQueueId });
		}

		// If still not found, return 404
		return ApiResponse.notFound('Job');
	} catch (error) {
		console.error('Error fetching queue job:', error);
		return ApiResponse.internalError(error, 'Failed to fetch job');
	}
};
