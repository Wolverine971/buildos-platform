// apps/web/src/routes/api/projects/[id]/calendar-status/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { safeGetSession, supabase } = locals;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		const googleCalendarService = new GoogleOAuthService(supabase);
		const calendarStatus = await googleCalendarService.getCalendarStatus(user.id);

		return ApiResponse.success({ calendarStatus });
	} catch (error) {
		console.error('Error fetching calendar status:', error);
		return ApiResponse.error('Failed to fetch calendar status');
	}
};
