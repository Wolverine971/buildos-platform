// apps/web/src/routes/api/onto/tables/[id]/ai-fill/[runId]/+server.ts
/**
 * GET /api/onto/tables/[id]/ai-fill/[runId] — progress of one Fill, for the grid to poll.
 * 200 → { status: 'queued'|'running'|'done'|'error', filled, failed, total, pending, skipped,
 *         column_id, error? }
 *
 * Thin wrapper over getTableAiFillStatus. Cell counts are read with the user's client (RLS);
 * the queue row is read with the admin client, because users can only see queue rows they
 * created and a collaborator may be watching someone else's Fill.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireTableHeadAccess } from '$lib/server/tables/table-api';
import { logOntologyApiError } from '../../../../shared/error-logging';
import { getTableAiFillStatus } from '@buildos/shared-agent-ops/tables';
import { tableAiFillErrorResponse } from '../ai-fill-errors';

export const GET: RequestHandler = async ({ params, locals }) => {
	const endpoint = `/api/onto/tables/${params.id}/ai-fill/${params.runId}`;
	try {
		if (!params.runId || !isValidUUID(params.runId)) {
			return ApiResponse.badRequest('Invalid fill id');
		}
		const access = await requireTableHeadAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'read',
			method: 'GET',
			endpoint
		});
		if (!access.ok) return access.response;

		const status = await getTableAiFillStatus(
			access.supabase,
			{ documentId: access.document.id, runId: params.runId },
			{ queueClient: createAdminSupabaseClient() }
		);
		return ApiResponse.success(status);
	} catch (error) {
		const mapped = tableAiFillErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected ai-fill status error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint,
			method: 'GET',
			entityType: 'document',
			entityId: params.id,
			operation: 'table_ai_fill_status'
		});
		return ApiResponse.internalError(error, 'Failed to load fill progress');
	}
};
