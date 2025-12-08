// apps/web/src/routes/api/admin/migration/rollback/+server.ts
// Enhanced rollback endpoint with soft/hard modes and actual data deletion
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	MigrationRollbackService,
	type RollbackEntityType,
	type RollbackMode
} from '$lib/services/ontology/migration-rollback.service';
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

	// Validate required fields
	const runId = typeof body?.runId === 'string' ? body.runId : null;
	if (!runId) {
		return ApiResponse.badRequest('Missing runId to rollback');
	}

	// Mode: 'soft' (default) or 'hard'
	const mode: RollbackMode = body?.mode === 'hard' ? 'hard' : 'soft';

	// Optional entity type filter
	const entityTypes: RollbackEntityType[] | undefined = Array.isArray(body?.entityTypes)
		? body.entityTypes.filter((t: unknown): t is RollbackEntityType =>
				['project', 'task', 'phase', 'calendar'].includes(t as string)
			)
		: undefined;

	// Optional timestamp filter
	const fromTimestamp = typeof body?.fromTimestamp === 'string' ? body.fromTimestamp : undefined;

	// Confirmation code (required for hard mode, optional for soft)
	const confirmationCode =
		typeof body?.confirmationCode === 'string' ? body.confirmationCode : '';

	// For hard mode, confirmation code is required
	if (mode === 'hard' && !confirmationCode) {
		return ApiResponse.badRequest(
			'Confirmation code required for hard rollback. Provide first 8 characters of run ID.'
		);
	}

	// For soft mode without confirmation, auto-generate
	const effectiveConfirmationCode = confirmationCode || runId.slice(0, 8);

	// Use admin client to bypass RLS - this endpoint is admin-only
	const supabase = createAdminSupabaseClient();

	try {
		const rollbackService = new MigrationRollbackService(supabase);

		// Validate rollback first
		const validation = await rollbackService.validateRollback(runId);

		// Perform the rollback
		const result = await rollbackService.rollback({
			runId,
			mode,
			entityTypes,
			fromTimestamp,
			confirmationCode: effectiveConfirmationCode
		});

		// Include warnings in response
		return ApiResponse.success({
			...result,
			warnings: validation.warnings,
			blockers: validation.blockers
		});
	} catch (error) {
		console.error('[Migration] Rollback failed', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to rollback migration run'
		);
	}
};

// GET endpoint to validate rollback before executing
export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const runId = url.searchParams.get('runId');
	if (!runId) {
		return ApiResponse.badRequest('Missing runId parameter');
	}

	const supabase = createAdminSupabaseClient();

	try {
		const rollbackService = new MigrationRollbackService(supabase);
		const validation = await rollbackService.validateRollback(runId);

		return ApiResponse.success(validation);
	} catch (error) {
		console.error('[Migration] Rollback validation failed', error);
		return ApiResponse.internalError(error, 'Failed to validate rollback');
	}
};
