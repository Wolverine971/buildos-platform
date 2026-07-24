// apps/web/src/routes/api/cron/gmail-relevance-retention/+server.ts
export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { purgeExpiredEmailRelevanceMetadata } from '$lib/server/gmail-relevance/metadata-retention';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();
	try {
		const purge = await purgeExpiredEmailRelevanceMetadata(admin);
		await admin.from('cron_logs').insert({
			job_name: 'gmail_relevance_retention',
			status: purge.drained ? 'success' : 'warning',
			message: `Deleted ${purge.observations_deleted} expired observation(s) and ${purge.candidates_deleted} expired candidate(s) in ${purge.batches_run} bounded batch(es); drained=${purge.drained}.`,
			executed_at: executedAt
		});
		return ApiResponse.success(purge);
	} catch {
		console.error('Gmail relevance retention failed with fixed code: retention_failed');
		await admin.from('cron_logs').insert({
			job_name: 'gmail_relevance_retention',
			status: 'error',
			error_message: 'retention_failed',
			executed_at: executedAt
		});
		return ApiResponse.error(
			'Failed to enforce Gmail relevance retention',
			500,
			'gmail_relevance_retention_failed'
		);
	}
};
