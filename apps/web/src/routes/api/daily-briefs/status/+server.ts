// apps/web/src/routes/api/daily-briefs/status/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { mapOntologyDailyBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]!;
	const userId = url.searchParams.get('userId') || user.id;

	try {
		const { data: briefRow, error } = await supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', date)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw error;
		}

		const { data: activeJobs } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('user_id', userId)
			.eq('job_type', 'generate_daily_brief')
			.in('status', ['pending', 'processing', 'failed', 'completed'])
			.gte('scheduled_for', `${date}T00:00:00Z`)
			.lt('scheduled_for', `${date}T23:59:59Z`)
			.order('created_at', { ascending: false })
			.limit(1);

		const activeJobsList =
			activeJobs?.filter((job) => job.status !== 'failed' && job.status !== 'completed') ??
			[];
		const hasActiveJob = activeJobsList.length > 0;
		const activeJob = hasActiveJob ? (activeJobsList[0] as any) : null;

		let mappedBrief = briefRow ? mapOntologyDailyBriefRow(briefRow) : null;
		if (mappedBrief && activeJob?.metadata?.generation_progress) {
			mappedBrief = {
				...mappedBrief,
				generation_progress: activeJob.metadata.generation_progress
			};
		}

		const isGenerating = mappedBrief?.generation_status === 'pending' || hasActiveJob;

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
			brief: mappedBrief,
			generation_status:
				mappedBrief?.generation_status || (hasActiveJob ? activeJob?.status : null),
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
