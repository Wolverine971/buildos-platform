// apps/web/src/routes/api/cron/email-campaign-replies/+server.ts
// Every 10 minutes: mark campaign recipients who replied (or bounced) by reading
// envelopes in the dj@build-os.com mailbox. Never reads message bodies.

export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET, PRIVATE_DJ_GMAIL_APP_PASSWORD } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { checkCampaignReplies } from '$lib/server/email-campaigns/replies';

const JOB_NAME = 'email_campaign_replies';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const supabase = createAdminSupabaseClient();
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	try {
		const summary = await checkCampaignReplies({
			supabase,
			password: PRIVATE_DJ_GMAIL_APP_PASSWORD
		});

		// Runs with nothing to check are not logged.
		if (!summary.skipped) {
			await supabase.from('cron_logs').insert({
				job_name: JOB_NAME,
				status: 'success',
				message: `Checked ${summary.checkedRecipients} recipient(s) across ${summary.checkedAddresses} address(es): ${summary.repliesFound} replied, ${summary.bouncesFound} bounced`,
				executed_at: new Date().toISOString()
			});
		}

		return ApiResponse.success(summary);
	} catch (error) {
		console.error('Email campaign replies cron error:', error);
		await errorLogger.logError(error, {
			endpoint: '/api/cron/email-campaign-replies',
			httpMethod: 'GET',
			operationType: 'email_campaign_replies'
		});
		await supabase.from('cron_logs').insert({
			job_name: JOB_NAME,
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});
		return ApiResponse.internalError(error, 'Failed to check campaign replies');
	}
};
