// apps/web/src/routes/api/admin/migration/rollback/+server.ts
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

	const body = await request.json().catch(() => ({}));
	const runId = typeof body?.runId === 'string' ? (body.runId as string) : null;
	const fromDate = typeof body?.fromDate === 'string' ? (body.fromDate as string) : undefined;

	if (!runId) {
		return ApiResponse.badRequest('Missing runId to rollback');
	}

	// Use admin client to bypass RLS - this endpoint is admin-only
	const supabase = createAdminSupabaseClient();

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const result = await orchestrator.rollback(runId, fromDate, user.id);
		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Rollback failed', error);
		return ApiResponse.internalError(error, 'Failed to rollback migration run');
	}
};
