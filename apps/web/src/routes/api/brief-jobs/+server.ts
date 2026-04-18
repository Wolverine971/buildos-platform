// apps/web/src/routes/api/brief-jobs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get query parameters
		const jobType = url.searchParams.get('job_type') || 'generate_daily_brief';
		const status = url.searchParams.get('status');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');

		// Build query. No count mode — the Brief Settings UI only renders
		// returned rows; tracking an exact count would force Postgres to run
		// a second COUNT(*) on queue_jobs for every poll.
		// Narrowed select drops `result` (post-job output JSON, can be large).
		let query = supabase
			.from('queue_jobs')
			.select(
				'id, user_id, job_type, status, scheduled_for, created_at, updated_at, processed_at, completed_at, started_at, error_message, queue_job_id, metadata, attempts, max_attempts, priority, dedup_key'
			)
			.eq('user_id', user.id)
			.eq('job_type', jobType as any)
			.order('created_at', { ascending: false });

		// Apply status filter (can be comma-separated)
		if (status) {
			const statuses = status.split(',').map((s) => s.trim());
			query = query.in('status', statuses as any);
		}

		// Apply pagination
		query = query.range(offset, offset + limit - 1);

		const { data: jobs, error } = await query;

		if (error) {
			throw error;
		}

		return ApiResponse.success({
			jobs: jobs || [],
			limit,
			offset,
			hasMore: (jobs?.length ?? 0) === limit
		});
	} catch (error) {
		console.error('Error fetching brief jobs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch jobs');
	}
};
