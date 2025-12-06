// apps/web/src/routes/api/admin/migration/start/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyMigrationOrchestrator } from '$lib/services/ontology/ontology-migration-orchestrator';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const payload = await request.json().catch(() => ({}));
	const projectIds = Array.isArray(payload?.projectIds)
		? (payload.projectIds as string[])
		: undefined;
	const includeArchived = Boolean(payload?.includeArchived);
	const batchSizeInput = Number(payload?.batchSize);
	const batchSize = Number.isFinite(batchSizeInput)
		? Math.min(Math.max(1, batchSizeInput), 25)
		: 10;
	const dryRun = Boolean(payload?.dryRun);
	const orgId = typeof payload?.orgId === 'string' ? (payload.orgId as string) : null;

	// Use admin client to bypass RLS - this endpoint is admin-only and needs to access
	// projects belonging to any user for migration purposes
	const supabase = createAdminSupabaseClient();

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const result = await orchestrator.start({
			projectIds,
			includeArchived,
			batchSize,
			dryRun,
			initiatedBy: user.id,
			orgId
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Start failed', error);
		return ApiResponse.internalError(error, 'Failed to start migration run');
	}
};
