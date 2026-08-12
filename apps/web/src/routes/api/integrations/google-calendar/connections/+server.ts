// apps/web/src/routes/api/integrations/google-calendar/connections/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarConnectionErrorResponse } from '$lib/server/google-calendar-api-errors';
import { GoogleCalendarConnectionService } from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const connectRequestSchema = z
	.object({
		connectionId: z.string().uuid().nullable().optional(),
		redirectPath: z.string().max(500).optional()
	})
	.strict();

function requireFeature(userId: string): Response | null {
	return isMultiCalendarUserAllowed(userId, privateEnv)
		? null
		: ApiResponse.forbidden('Multi-account Google Calendar is not enabled for this user');
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	const gated = requireFeature(user.id);
	if (gated) return gated;

	try {
		const service = new GoogleCalendarConnectionService(createAdminSupabaseClient());
		return ApiResponse.success(await service.listConnections(user.id), undefined, {
			public: false,
			maxAge: 0,
			mustRevalidate: true
		});
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	const gated = requireFeature(user.id);
	if (gated) return gated;

	const parsed = await parseJsonRequest(request, connectRequestSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const service = new GoogleCalendarConnectionService(createAdminSupabaseClient());
		const authorizationUrl = await service.createAuthorizationUrl({
			userId: user.id,
			redirectUri: `${url.origin}/auth/google/calendar-callback`,
			redirectPath: parsed.data.redirectPath ?? '/profile?tab=calendar&calendar=1',
			connectionId: parsed.data.connectionId ?? null
		});
		return ApiResponse.success({ authorizationUrl });
	} catch (error) {
		return googleCalendarConnectionErrorResponse(error);
	}
};
