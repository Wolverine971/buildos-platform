// apps/web/src/routes/api/calendar/webhook/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';

// todo check this
// Register webhook for current user
export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const webhookService = new CalendarWebhookService(supabase);

	// Construct the webhook URL
	const protocol = url.protocol;
	const host = url.host;
	const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;

	const result = await webhookService.registerWebhook(user.id, webhookUrl);

	if (!result.success) {
		return json({ error: result.error || 'Failed to register webhook' }, { status: 500 });
	}

	return json({ success: true, message: 'Webhook registered successfully' });
};

// Unregister webhook
export const DELETE: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { session, user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const webhookService = new CalendarWebhookService(supabase);

	await webhookService.unregisterWebhook(user.id);

	return json({ success: true, message: 'Webhook unregistered' });
};
