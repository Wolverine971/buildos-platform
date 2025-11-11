// apps/web/src/routes/api/admin/migration/status/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyMigrationOrchestrator } from '$lib/services/ontology/ontology-migration-orchestrator';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const runId = url.searchParams.get('runId') ?? undefined;
	const limitParam = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 20) : undefined;

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const status = await orchestrator.getStatus({ runId, limit });
		return ApiResponse.success({ runs: status });
	} catch (error) {
		console.error('[Migration] Status fetch failed', error);
		return ApiResponse.internalError(error, 'Failed to fetch migration status');
	}
};
