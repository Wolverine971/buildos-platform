// apps/web/src/routes/api/admin/migration/tasks/preview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyMigrationOrchestrator } from '$lib/services/ontology/ontology-migration-orchestrator';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const payload = await request.json().catch(() => ({}));
	const projectId = typeof payload?.projectId === 'string' ? payload.projectId.trim() : '';

	if (!projectId) {
		return ApiResponse.badRequest('projectId is required');
	}

	try {
		const orchestrator = new OntologyMigrationOrchestrator(supabase);
		const [preview] = await orchestrator.previewProjects(
			{
				projectIds: [projectId],
				includeArchived: true,
				limit: 1
			},
			user.id
		);

		if (!preview) {
			return ApiResponse.notFound('Preview');
		}

		return ApiResponse.success({ preview });
	} catch (error) {
		console.error('[Migration] Task preview failed', error);
		return ApiResponse.internalError(error, 'Failed to build task migration preview');
	}
};
