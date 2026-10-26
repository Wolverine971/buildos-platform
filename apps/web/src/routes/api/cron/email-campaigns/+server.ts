// apps/web/src/routes/api/cron/email-campaigns/+server.ts
// Once a minute: send the due waves of every running email campaign.
// The sender stops starting new emails after ~40 s and hands leftovers back to
// the queue, so a run always finishes inside maxDuration.

export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { parseDailyCap, processDueCampaignSends } from '$lib/server/email-campaigns/sender';

const JOB_NAME = 'email_campaigns';

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	// Local dev shares the production database and only logs campaign email, so a
	// local run would mark real people "sent" without mailing them. Production only.
	if (dev && env.PRIVATE_ALLOW_DEV_CAMPAIGN_SENDS !== 'true') {
		return ApiResponse.success({
			skipped:
				'Campaign sends only run in production (local dev shares the production database).'
		});
	}

	const supabase = createAdminSupabaseClient();
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	try {
		const summary = await processDueCampaignSends({
			supabase,
			dailyCap: parseDailyCap(env.PRIVATE_CAMPAIGN_DAILY_CAP)
		});

		for (const entry of summary.errors.slice(0, 25)) {
			await errorLogger.logError(new Error(entry.error), {
				endpoint: '/api/cron/email-campaigns',
				httpMethod: 'GET',
				operationType: 'email_campaign_send',
				metadata: { jobName: JOB_NAME, campaignRecipientId: entry.recipientId }
			});
		}

		// Quiet minutes (nothing due) are not logged, so cron_logs stays readable.
		const didWork =
			summary.claimed > 0 || summary.expired > 0 || summary.completedCampaigns > 0;
		if (didWork) {
			await supabase.from('cron_logs').insert({
				job_name: JOB_NAME,
				status: summary.failed > 0 || summary.expired > 0 ? 'partial_success' : 'success',
				message: `Claimed ${summary.claimed}, sent ${summary.sent}, failed ${summary.failed}, skipped ${summary.skipped}, released ${summary.released}, expired ${summary.expired}, completed ${summary.completedCampaigns} campaign(s), daily allowance at start ${summary.dailyCapRemaining}`,
				error_message:
					summary.errors
						.slice(0, 10)
						.map((entry) => `${entry.recipientId}: ${entry.error}`)
						.join(' | ')
						.slice(0, 1000) || null,
				executed_at: new Date().toISOString()
			});
		}

		return ApiResponse.success(summary);
	} catch (error) {
		console.error('Email campaigns cron error:', error);
		await errorLogger.logError(error, {
			endpoint: '/api/cron/email-campaigns',
			httpMethod: 'GET',
			operationType: 'email_campaign_send'
		});
		await supabase.from('cron_logs').insert({
			job_name: JOB_NAME,
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});
		return ApiResponse.internalError(error, 'Failed to process email campaigns');
	}
};
