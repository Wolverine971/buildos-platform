// apps/web/src/routes/api/onto/projects/[id]/freshness/+server.ts
//
// GET /api/onto/projects/[id]/freshness -> FreshnessBadgeReadV1 (Tasker 88)
//
// Badges ("may be out of date" / "updated automatically") and on-track gauges for the
// caller's own live freshness scans. RLS limits rows to the user whose brain dump produced
// them; flags whose entity changed since the flag are omitted.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { loadFreshnessBadges } from '$lib/server/freshness-radar.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	try {
		const read = await loadFreshnessBadges({
			supabase: locals.supabase,
			projectId: access.projectId,
			userId: access.userId
		});
		return ApiResponse.success(read);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load freshness badges');
	}
};
