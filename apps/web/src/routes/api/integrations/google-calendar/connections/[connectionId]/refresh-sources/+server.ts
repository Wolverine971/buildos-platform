// apps/web/src/routes/api/integrations/google-calendar/connections/[connectionId]/refresh-sources/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarConnectionErrorResponse } from '$lib/server/google-calendar-api-errors';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	if (!isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
	}

	try {
		const service = new GoogleCalendarConnectionService(createAdminSupabaseClient());
		const sources = await service.discoverSources(user.id, params.connectionId);
		return ApiResponse.success({ sources });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};
