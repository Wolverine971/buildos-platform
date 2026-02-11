// apps/web/src/routes/api/daily-briefs/status/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]!;
	const userId = url.searchParams.get('userId') || user.id;

	try {
		// Get daily brief for the date
		const { data: brief, error } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', date)
			.single();

		if (error && error.code !== 'PGRST116') {
			throw error;
		}

		// Also check for any active generation jobs in the new queue_jobs table
		const { data: activeJobs } = await supabase
			.from('queue_jobs') // Updated table name
			.select('*')
			.eq('user_id', userId)
			.eq('job_type', 'generate_daily_brief') // Filter by job type
			.in('status', ['pending', 'processing', 'failed', 'completed'])
			.gte('scheduled_for', `${date}T00:00:00Z`)
			.lt('scheduled_for', `${date}T23:59:59Z`)
			.order('created_at', { ascending: false })
			.limit(1);

		const activeJobsList =
			activeJobs?.filter((j) => j.status !== 'failed' && j.status !== 'completed') ?? [];
		const hasActiveJob = activeJobsList.length > 0;
		const activeJob = hasActiveJob ? (activeJobsList[0] as any) : null;
		const isGenerating = brief?.generation_status === 'processing' || hasActiveJob;

		// Extract progress information from job metadata if available
		let progress = null;
		if (activeJob?.metadata?.progress) {
			progress = {
				projects: activeJob.metadata.progress.projects || { completed: 0, total: 0 },
				message: activeJob.metadata.progress.message || 'Generating brief...',
				percentage: activeJob.metadata.progress.projects
					? Math.round(
							(activeJob.metadata.progress.projects.completed /
								Math.max(1, activeJob.metadata.progress.projects.total)) *
								100
						)
					: 0
			};
		}

		return ApiResponse.success({
			brief: brief || null,
			generation_status:
				brief?.generation_status || (hasActiveJob ? activeJob?.status : null),
			isGenerating,
			activeJob: activeJob
				? {
						id: activeJob.id,
						queue_job_id: activeJob.queue_job_id,
						status: activeJob.status,
						scheduled_for: activeJob.scheduled_for,
						created_at: activeJob.created_at,
						processed_at: activeJob.processed_at,
						error_message: activeJob.error_message,
						progress
					}
				: null,
			progress
		});
	} catch (error) {
		console.error('Error fetching brief status:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief status');
	}
};
