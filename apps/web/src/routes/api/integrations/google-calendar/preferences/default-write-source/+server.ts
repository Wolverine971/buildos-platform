// apps/web/src/routes/api/integrations/google-calendar/preferences/default-write-source/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarConnectionErrorResponse } from '$lib/server/google-calendar-api-errors';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const defaultSourceSchema = z.object({ calendarSourceId: z.string().uuid() }).strict();

export const PATCH: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	if (!isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
	}

	const parsed = await parseJsonRequest(request, defaultSourceSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const service = new GoogleCalendarConnectionService(createAdminSupabaseClient());
		await service.setDefaultWriteSource(user.id, parsed.data.calendarSourceId);
		return ApiResponse.success({ updated: true });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};
