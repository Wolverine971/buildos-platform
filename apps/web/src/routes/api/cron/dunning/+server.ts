// apps/web/src/routes/api/cron/dunning/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DunningService } from '$lib/services/dunning-service';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
	try {
		// First check lengths - if different, fail fast but still in constant time
		if (a.length !== b.length) {
			return false;
		}
		// Use crypto.timingSafeEqual for constant-time comparison
		return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
	} catch {
		return false;
	}
}

// Vercel cron jobs use GET requests
export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret (Vercel adds this header)
	const authHeader = request.headers.get('authorization');
	const expectedAuth = `Bearer ${PRIVATE_CRON_SECRET}`;

	if (!authHeader || !constantTimeCompare(authHeader, expectedAuth)) {
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
