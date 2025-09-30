// apps/web/src/routes/api/cron/renew-webhooks/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCustomClient } from '@buildos/supabase-client';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_CRON_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request, url }) => {
	// Verify cron secret
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${PRIVATE_CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY);

	const webhookService = new CalendarWebhookService(supabase);

	// Construct the webhook URL
	const protocol = url.protocol;
	const host = url.host;
	const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;

	await webhookService.renewExpiringWebhooks(webhookUrl);

	return json({ success: true });
};
