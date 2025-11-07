// apps/web/src/routes/api/brief-jobs/next-scheduled/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Query for the next scheduled brief job for this user
		const { data: nextJob, error } = await supabase
			.from('queue_jobs')
			.select('scheduled_for, created_at, status, job_type')
			.eq('user_id', user.id)
			.eq('job_type', 'generate_daily_brief')
			.in('status', ['pending', 'scheduled'])
			.gte('scheduled_for', new Date().toISOString()) // Only future jobs
			.order('scheduled_for', { ascending: true })
			.limit(1)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 is "no rows returned" which is expected when no jobs are scheduled
			throw error;
		}

		return ApiResponse.success({
			nextScheduledBrief: nextJob
				? {
						scheduledFor: nextJob.scheduled_for,
						createdAt: nextJob.created_at,
						status: nextJob.status,
						jobType: nextJob.job_type
					}
				: null
		});
	} catch (error) {
		console.error('Error fetching next scheduled brief:', error);
		return ApiResponse.internalError(error, 'Failed to fetch next scheduled brief');
	}
};
