// apps/web/src/routes/api/admin/migration/resume/+server.ts
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

	if (!runId) {
		return ApiResponse.badRequest('runId is required');
	}

	// Use admin client to bypass RLS - this endpoint is admin-only
	const supabase = createAdminSupabaseClient();

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		await orchestrator.resume(runId, user.id);
		return ApiResponse.success({ runId, status: 'in_progress' });
	} catch (error) {
		console.error('[Migration] Resume failed', error);
		return ApiResponse.internalError(error, 'Failed to resume migration run');
	}
};
