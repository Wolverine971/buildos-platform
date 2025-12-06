// apps/web/src/routes/api/admin/migration/validate/+server.ts
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
		return ApiResponse.badRequest('Missing runId to validate');
	}

	// Use admin client to bypass RLS - this endpoint is admin-only
	const supabase = createAdminSupabaseClient();

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const result = await orchestrator.validate(runId);
		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Validation failed', error);
		return ApiResponse.internalError(error, 'Failed to validate migration run');
	}
};
