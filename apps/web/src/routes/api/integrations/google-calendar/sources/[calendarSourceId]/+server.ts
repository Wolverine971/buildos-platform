// apps/web/src/routes/api/integrations/google-calendar/sources/[calendarSourceId]/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarConnectionErrorResponse } from '$lib/server/google-calendar-api-errors';
import {
	GoogleCalendarConnectionService,
	normalizeGoogleCalendarSourcePreferences
} from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const sourcePreferencesSchema = z
	.object({
		readEnabled: z.boolean().optional(),
		availabilityEnabled: z.boolean().optional(),
		analysisEnabled: z.boolean().optional(),
		syncEnabled: z.boolean().optional()
	})
	.strict()
	.refine((value) => Object.values(value).some((item) => item !== undefined), {
		message: 'At least one source preference is required'
	});

export const PATCH: RequestHandler = async ({ request, params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	if (!isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
	}

	const parsed = await parseJsonRequest(request, sourcePreferencesSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const admin = createAdminSupabaseClient();
		const service = new GoogleCalendarConnectionService(admin);
		const webhookService = new CalendarWebhookService(admin);
		const webhookUrl = `${url.origin}/webhooks/calendar-events`;
		const preferences = normalizeGoogleCalendarSourcePreferences(parsed.data);
		if (preferences.syncEnabled === false) {
			await webhookService.unregisterWebhook(user.id, 'primary', params.calendarSourceId);
		}
		await service.setSourcePreferences(user.id, params.calendarSourceId, preferences);
		if (preferences.syncEnabled === true) {
			const registration = await webhookService.registerWebhook(
				user.id,
				webhookUrl,
				'primary',
				params.calendarSourceId
			);
			if (!registration.success) {
				await service.setSourcePreferences(user.id, params.calendarSourceId, {
					syncEnabled: false
				});
				return ApiResponse.error(
					'Google Calendar sync could not be enabled',
					502,
					'GOOGLE_CALENDAR_WEBHOOK_REGISTRATION_FAILED'
				);
			}
		}
		return ApiResponse.success({ updated: true, syncEnabled: preferences.syncEnabled });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};
