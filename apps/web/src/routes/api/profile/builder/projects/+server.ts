// apps/web/src/routes/api/profile/builder/projects/+server.ts
// PUT { projects: [{ project_id, level: 'listed'|'live', public_name?, pitch?, looking_for?, reply_url?,
//       link_url?, goal_ids?, show_next_milestone?, this_week?, audience? }] }
// → the projects on the page, in order. Projects left out go back to hidden.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	parsePlacements,
	replacePlacements
} from '$lib/server/builder-profile/builder-profile.service';

export const PUT: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { projects?: unknown } | null;
	try {
		const placements = parsePlacements(body?.projects);
		await replacePlacements({ admin: createAdminSupabaseClient() as any, userId: user.id, placements });
		return ApiResponse.success({ saved: placements.length });
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save your projects');
	}
};
