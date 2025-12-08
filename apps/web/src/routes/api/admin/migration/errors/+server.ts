// apps/web/src/routes/api/admin/migration/errors/+server.ts
// GET /api/admin/migration/errors - Paginated, filterable error list
// DELETE /api/admin/migration/errors - Delete errors by IDs
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	MigrationErrorService,
	type ErrorCategory,
	type EntityType
} from '$lib/services/ontology/migration-error.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { z } from 'zod';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// Parse query parameters
	const limitParam = url.searchParams.get('limit');
	const offsetParam = url.searchParams.get('offset');
	const userId = url.searchParams.get('userId');
	const entityType = url.searchParams.get('entityType') as EntityType | null;
	const errorCategory = url.searchParams.get('errorCategory') as ErrorCategory | null;
	const runId = url.searchParams.get('runId');
	const projectId = url.searchParams.get('projectId');
	const search = url.searchParams.get('search');
	const sortBy = url.searchParams.get('sortBy') as
		| 'createdAt'
		| 'entityType'
		| 'errorCategory'
		| null;
	const sortOrder = url.searchParams.get('sortOrder') as 'asc' | 'desc' | null;

	const limit = limitParam ? parseInt(limitParam, 10) : 50;
	const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

	const supabase = createAdminSupabaseClient();

	try {
		const errorService = new MigrationErrorService(supabase);
		const result = await errorService.getErrors({
			limit,
			offset,
			userId: userId ?? undefined,
			entityType: entityType ?? undefined,
			errorCategory: errorCategory ?? undefined,
			runId: runId ?? undefined,
			projectId: projectId ?? undefined,
			search: search ?? undefined,
			sortBy: sortBy ?? undefined,
			sortOrder: sortOrder ?? undefined
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Errors fetch failed', error);
		return ApiResponse.internalError(error, 'Failed to fetch errors');
	}
};

// Schema for delete request
const deleteSchema = z.object({
	errorIds: z.array(z.number()).optional(),
	deleteAll: z.boolean().optional(),
	errorCategory: z.enum(['recoverable', 'data', 'fatal']).optional(),
	entityType: z.enum(['project', 'task', 'phase', 'calendar']).optional()
});

export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const body = await request.json();
		const parsed = deleteSchema.safeParse(body);

		if (!parsed.success) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const { errorIds, deleteAll, errorCategory, entityType } = parsed.data;

		const supabase = createAdminSupabaseClient();
		const errorService = new MigrationErrorService(supabase);

		let result: { deleted: number };

		if (deleteAll) {
			// Delete all errors matching filters
			result = await errorService.deleteAllErrors({
				errorCategory: errorCategory as ErrorCategory | undefined,
				entityType: entityType as EntityType | undefined
			});
		} else if (errorIds && errorIds.length > 0) {
			// Delete specific errors by ID
			result = await errorService.deleteErrors(errorIds);
		} else {
			return ApiResponse.badRequest('Either errorIds or deleteAll must be provided');
		}

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Errors delete failed', error);
		return ApiResponse.internalError(error, 'Failed to delete errors');
	}
};
