// apps/web/src/routes/api/cron/renew-webhooks/+server.ts
import type { RequestHandler } from './$types';
import { createCustomClient } from '@buildos/supabase-client';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { batchCheckAndRegisterWebhooks } from '$lib/services/calendar-webhook-check';
import { env } from '$env/dynamic/private';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_CRON_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';

export const config = {
	maxDuration: 300
};

const run: RequestHandler = async ({ request, url }) => {
	// Verify cron secret with constant-time comparison
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}

	const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY);

	const webhookService = new CalendarWebhookService(supabase);

	// Construct the webhook URL
	const protocol = url.protocol;
	const host = url.host;
	const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;
	const rotateAll = url.searchParams.get('rotate_all') === 'true';

	try {
		const [legacyRepair, reconciliation, renewal] = await Promise.all([
			batchCheckAndRegisterWebhooks(supabase, `${protocol}//${host}`, 25),
			webhookService.reconcileSourceWebhooks(webhookUrl),
			webhookService.renewExpiringWebhooks(webhookUrl, { rotateAll })
		]);
		const hasWarnings =
			legacyRepair.failures > 0 ||
			reconciliation.failed > 0 ||
			renewal.failed > 0 ||
			reconciliation.hasMore ||
			renewal.hasMore;
		const { error: logError } = await supabase.from('cron_logs').insert({
			job_name: 'calendar_webhook_renewal',
			status: hasWarnings ? 'warning' : 'success',
			message: `Calendar webhooks: legacy_checked=${legacyRepair.total}, legacy_registered=${legacyRepair.registered}, legacy_failed=${legacyRepair.failures}, missing_attempted=${reconciliation.attempted}, registered=${reconciliation.registered}, missing_failed=${reconciliation.failed}, renewal_attempted=${renewal.attempted}, renewed=${renewal.renewed}, renewal_failed=${renewal.failed}, has_more=${reconciliation.hasMore || renewal.hasMore}.`,
			executed_at: new Date().toISOString()
		});
		if (logError) console.error('Failed to persist Calendar webhook cron summary:', logError);

		return ApiResponse.success({ legacyRepair, reconciliation, renewal });
	} catch (error) {
		console.error('Calendar webhook cron failed:', error);
		const { error: logError } = await supabase.from('cron_logs').insert({
			job_name: 'calendar_webhook_renewal',
			status: 'failed',
			message: 'Calendar webhook maintenance failed before a complete summary was produced.',
			executed_at: new Date().toISOString()
		});
		if (logError) console.error('Failed to persist Calendar webhook cron failure:', logError);
		return ApiResponse.internalError(error, 'Calendar webhook maintenance failed');
	}
};

export const GET = run;
export const POST = run;
