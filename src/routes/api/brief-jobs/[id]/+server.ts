// src/routes/api/brief-jobs/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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
			return json(jobById);
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
			return json(jobByQueueId);
		}

		// If still not found, return 404
		return json({ error: 'Job not found' }, { status: 404 });
	} catch (error) {
		console.error('Error fetching queue job:', error);
		return json({ error: 'Failed to fetch job' }, { status: 500 });
	}
};
