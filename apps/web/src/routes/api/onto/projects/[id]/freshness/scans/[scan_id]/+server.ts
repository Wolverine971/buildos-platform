// apps/web/src/routes/api/onto/projects/[id]/freshness/scans/[scan_id]/+server.ts
//
// GET /api/onto/projects/[id]/freshness/scans/[scan_id] -> FreshnessScanStatusV1 (Tasker 88)
//
// Live state for one chat card: each card flag's status and whether it can still be undone,
// plus the scan's newest bundle. Owner-only through RLS.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { loadFreshnessScanStatus } from '$lib/server/freshness-radar.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

export const GET: RequestHandler = async ({ params, locals }) => {
	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;
	if (!isValidUUID(params.scan_id)) return ApiResponse.badRequest('Invalid scan ID');

	try {
		const status = await loadFreshnessScanStatus({
			supabase: locals.supabase,
			projectId: access.projectId,
			scanId: params.scan_id,
			userId: access.userId
		});
		if (!status) return ApiResponse.notFound('Scan');
		return ApiResponse.success(status);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load scan status');
	}
};
