// src/routes/api/brief-jobs/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Get query parameters
		const jobType = url.searchParams.get('job_type') || 'generate_daily_brief';
		const status = url.searchParams.get('status');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');

		// Build query
		let query = supabase
			.from('queue_jobs')
			.select('*', { count: 'exact' })
			.eq('user_id', user.id)
			.eq('job_type', jobType)
			.order('created_at', { ascending: false });

		// Apply status filter (can be comma-separated)
		if (status) {
			const statuses = status.split(',').map((s) => s.trim());
			query = query.in('status', statuses);
		}

		// Apply pagination
		query = query.range(offset, offset + limit - 1);

		const { data: jobs, error, count } = await query;

		if (error) {
			throw error;
		}

		return json({
			jobs: jobs || [],
			total: count || 0,
			limit,
			offset,
			hasMore: (count || 0) > offset + limit
		});
	} catch (error) {
		console.error('Error fetching brief jobs:', error);
		return json({ error: 'Failed to fetch jobs' }, { status: 500 });
	}
};
