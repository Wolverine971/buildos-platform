// apps/web/src/routes/api/profile/builder/projects/+server.ts
// PUT { projects: [{ project_id, level: 'listed'|'live', public_name?, pitch?, looking_for?, reply_url?,
//       link_url?, goal_ids?, show_next_milestone?, this_week?, audience? }] }
//       , base_rev? }
// → the projects on the page, in order. Projects left out go back to hidden. base_rev works
// like the links route's: a stale one gets 409. Returns the new counter.

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
	const body = (await request.json().catch(() => null)) as {
		projects?: unknown;
		base_rev?: unknown;
	} | null;
	try {
		const placements = parsePlacements(body?.projects);
		const { rev } = await replacePlacements({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			placements,
			baseRev: typeof body?.base_rev === 'number' ? body.base_rev : null
		});
		return ApiResponse.success({ saved: placements.length, rev });
	} catch (error) {
		if (error instanceof BuilderProfileError)
			return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save your projects');
	}
};
