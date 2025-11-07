// apps/web/src/routes/api/cron/dunning/+server.ts
import type { RequestHandler } from './$types';
import { DunningService } from '$lib/services/dunning-service';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';

// Vercel cron jobs use GET requests
export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret (Vercel adds this header)
	if (!isAuthorizedCronRequest(request, PRIVATE_CRON_SECRET)) {
		return ApiResponse.unauthorized();
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

		return ApiResponse.success({
			processed: true,
			message: 'Dunning queue processed'
		});
	} catch (error) {
		console.error('Error processing dunning queue:', error);

		// Log the error
		await supabase.from('cron_logs').insert({
			job_name: 'dunning_process',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return ApiResponse.internalError(error, 'Failed to process dunning queue');
	}
};
