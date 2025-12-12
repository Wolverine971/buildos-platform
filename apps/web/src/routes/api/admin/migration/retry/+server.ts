// apps/web/src/routes/api/admin/migration/retry/+server.ts
// POST /api/admin/migration/retry - Retry failed migrations
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { MigrationRetryService } from '$lib/services/ontology/migration-retry.service';
import type { ErrorCategory, EntityType } from '$lib/services/ontology/migration-error.service';
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

	// Validate at least one target selector is provided
	const { errorIds, runId, userId, projectId } = payload;
	if (!errorIds?.length && !runId && !userId && !projectId) {
		return ApiResponse.badRequest(
			'At least one target selector is required: errorIds, runId, userId, or projectId'
		);
	}

	const supabase = createAdminSupabaseClient();

	try {
		const retryService = new MigrationRetryService(supabase);
		const result = await retryService.retry(
			{
				errorIds: Array.isArray(errorIds) ? errorIds : undefined,
				runId: typeof runId === 'string' ? runId : undefined,
				userId: typeof userId === 'string' ? userId : undefined,
				projectId: typeof projectId === 'string' ? projectId : undefined,
				entityType: payload.entityType as EntityType | undefined,
				errorCategory: payload.errorCategory as ErrorCategory | undefined,
				maxRetries: typeof payload.maxRetries === 'number' ? payload.maxRetries : 3
			},
			user.id
		);

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Retry failed', error);
		return ApiResponse.internalError(error, 'Failed to retry migrations');
	}
};
