// apps/web/src/routes/api/integrations/google-calendar/connections/[connectionId]/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarConnectionErrorResponse } from '$lib/server/google-calendar-api-errors';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const renameRequestSchema = z.object({ accountLabel: z.string().trim().min(1).max(60) }).strict();

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	if (!isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
	}

	const parsed = await parseJsonRequest(request, renameRequestSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const service = new GoogleCalendarConnectionService(createAdminSupabaseClient());
		await service.renameConnection(user.id, params.connectionId, parsed.data.accountLabel);
		return ApiResponse.success({ updated: true });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	if (!isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
	}

	try {
		const admin = createAdminSupabaseClient();
		const service = new GoogleCalendarConnectionService(admin);
		await new CalendarWebhookService(admin).unregisterConnectionWebhooks(
			user.id,
			params.connectionId
		);
		const result = await service.disconnectConnection(user.id, params.connectionId);
		return ApiResponse.success({ disconnected: true, ...result });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};
