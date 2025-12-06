// apps/web/src/routes/api/admin/migration/analyze/+server.ts
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
	const limitInput = Number(payload?.limit);
	const limit = Number.isFinite(limitInput) ? Math.min(Math.max(1, limitInput), 100) : 25;

	// Use admin client to bypass RLS - this endpoint is admin-only and needs to access
	// projects belonging to any user for migration purposes
	const supabase = createAdminSupabaseClient();

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const analysis = await orchestrator.analyze(
			{
				projectIds,
				includeArchived,
				limit
			},
			user.id
		);
		const previews = await orchestrator.previewProjects(
			{
				projectIds,
				includeArchived,
				limit
			},
			user.id
		);

		return ApiResponse.success({ ...analysis, previews });
	} catch (error) {
		console.error('[Migration] Analyze failed', error);
		return ApiResponse.internalError(error, 'Failed to analyze migration workload');
	}
};
