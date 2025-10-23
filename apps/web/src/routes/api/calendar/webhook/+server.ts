// apps/web/src/routes/api/calendar/webhook/+server.ts
import type { RequestHandler } from './$types';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { dev } from '$app/environment';

import { ApiResponse } from '$lib/utils/api-response';

// Register webhook for current user
export const POST: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	// In dev, webhooks need a publicly accessible URL (e.g., ngrok)
	// You can override this check with an environment variable if using a tunnel
	if (dev) {
		return;
	}

	const webhookService = new CalendarWebhookService(supabase);

	// Construct the webhook URL
	const protocol = url.protocol;
	const host = url.host;
	const webhookUrl = `${protocol}//${host}/webhooks/calendar-events`;

	const result = await webhookService.registerWebhook(user.id, webhookUrl);

	if (!result.success) {
		return ApiResponse.internalError('Failed to register webhook');
	}

	return ApiResponse.success('Webhook registered successfully');
};

// Unregister webhook
export const DELETE: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const webhookService = new CalendarWebhookService(supabase);

	await webhookService.unregisterWebhook(user.id);

	return ApiResponse.success('Webhook unregistered');
};
