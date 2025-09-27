// src/routes/api/queue-jobs/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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
				return json({ error: 'Job not found' }, { status: 404 });
			}
			throw error;
		}

		return json(job);
	} catch (error) {
		console.error('Error fetching queue job:', error);
		return json({ error: 'Failed to fetch job' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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

		return json({ success: true });
	} catch (error) {
		console.error('Error cancelling job:', error);
		return json({ error: 'Failed to cancel job' }, { status: 500 });
	}
};
