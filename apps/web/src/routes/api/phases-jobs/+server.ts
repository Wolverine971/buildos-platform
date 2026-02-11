// apps/web/src/routes/api/phases-jobs/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get query parameters
		const status = url.searchParams.get('status');
		const projectId = url.searchParams.get('project_id');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

		// Build query for phases generation jobs
		let query = supabase
			.from('queue_jobs')
			.select('*')
			.eq('user_id', user.id)
			.eq('job_type', 'generate_phases')
			.order('created_at', { ascending: false })
			.limit(limit);

		// Apply filters
		if (status) {
			query = query.eq('status', status as any);
		}
		if (projectId) {
			query = query.eq('metadata->>projectId', projectId);
		}

		const { data: jobs, error } = await query;

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			jobs: jobs || [],
			total: jobs?.length || 0
		});
	} catch (error) {
		console.error('Error fetching phases jobs:', error);
		return ApiResponse.internalError(error, 'Failed to fetch phases jobs');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { projectId, options } = await request.json();

		if (!projectId) {
			return json({ error: 'projectId is required' }, { status: 400 });
		}

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, name')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found or access denied' }, { status: 404 });
		}

		// Check if there's already a pending phases generation for this project
		const { data: existingJob } = await supabase
			.from('queue_jobs')
			.select('id, queue_job_id, status')
			.eq('user_id', user.id)
			.eq('job_type', 'generate_phases')
			.eq('metadata->>projectId', projectId)
			.in('status', ['pending', 'processing'])
			.single();

		if (existingJob) {
			return json(
				{
					error: 'Phases generation already in progress for this project',
					existingJobId: existingJob.queue_job_id
				},
				{ status: 409 }
			);
		}

		// Call Railway worker to queue phases generation
		try {
			const RAILWAY_WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
			const headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};
			if (PRIVATE_RAILWAY_WORKER_TOKEN) {
				headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
			}

			const response = await fetch(`${RAILWAY_WORKER_URL}/queue/phases`, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					userId: user.id,
					projectId,
					options
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to queue phases generation');
			}

			const result = await response.json();

			return ApiResponse.success({
				jobId: result.jobId,
				projectId,
				message: 'Phases generation queued successfully'
			});
		} catch (fetchError) {
			console.error('Railway worker error:', fetchError);
			return json(
				{
					error: 'Failed to queue phases generation',
					details: fetchError instanceof Error ? fetchError.message : 'Unknown error'
				},
				{ status: 500 }
			);
		}
	} catch (error) {
		console.error('Error queuing phases generation:', error);
		return ApiResponse.internalError(error, 'Failed to queue phases generation');
	}
};
