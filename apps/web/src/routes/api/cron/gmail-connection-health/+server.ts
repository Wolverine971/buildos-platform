export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { checkGmailConnectionHealth } from '$lib/server/gmail-connection-health';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();
	try {
		const result = await checkGmailConnectionHealth(admin);
		const status = result.transientFailures > 0 || result.hasMore ? 'warning' : 'success';
		await admin.from('cron_logs').insert({
			job_name: 'gmail_connection_health',
			status,
			message: `Checked ${result.checked} Gmail connection(s); refreshed=${result.refreshed}, reconnect_required=${result.reconnectRequired}, transient_failures=${result.transientFailures}, has_more=${result.hasMore}.`,
			executed_at: executedAt
		});
		return ApiResponse.success(result);
	} catch {
		console.error('Gmail connection health check failed with fixed code: health_check_failed');
		await admin.from('cron_logs').insert({
			job_name: 'gmail_connection_health',
			status: 'error',
			error_message: 'health_check_failed',
			executed_at: executedAt
		});
		return ApiResponse.error(
			'Failed to check Gmail connection health',
			500,
			'gmail_connection_health_failed'
		);
	}
};
