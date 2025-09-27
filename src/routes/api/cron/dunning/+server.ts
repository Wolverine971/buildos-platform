// src/routes/api/cron/dunning/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DunningService } from '$lib/services/dunning-service';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

// Vercel cron jobs use GET requests
export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret (Vercel adds this header)
	const authHeader = request.headers.get('authorization');
	if (!authHeader || authHeader !== `Bearer ${PRIVATE_CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Use admin client for cron jobs
	const supabase = createAdminSupabaseClient();

	try {
		const dunningService = new DunningService(supabase);
		await dunningService.processDunningQueue();

		// Log the cron execution
		await supabase.from('cron_logs').insert({
			job_name: 'dunning_process',
			status: 'success',
			executed_at: new Date().toISOString()
		});

		return json({ success: true, message: 'Dunning queue processed' });
	} catch (error) {
		console.error('Error processing dunning queue:', error);

		// Log the error
		await supabase.from('cron_logs').insert({
			job_name: 'dunning_process',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return json({ error: 'Failed to process dunning queue' }, { status: 500 });
	}
};
