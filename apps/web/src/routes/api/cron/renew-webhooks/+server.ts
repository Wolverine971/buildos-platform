// apps/web/src/routes/api/cron/renew-webhooks/+server.ts
import type { RequestHandler } from './$types';
import { createCustomClient } from '@buildos/supabase-client';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_CRON_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, url }) => {
	// Verify cron secret with constant-time comparison
	if (!isAuthorizedCronRequest(request, PRIVATE_CRON_SECRET)) {
		return ApiResponse.unauthorized();
	}

	const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY);

	const webhookService = new CalendarWebhookService(supabase);

	// Construct the webhook URL
	const protocol = url.protocol;
	const host = url.host;
	const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;

	await webhookService.renewExpiringWebhooks(webhookUrl);

	return ApiResponse.success({ renewed: true });
};
