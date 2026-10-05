// apps/web/src/routes/api/onto/tables/[id]/ai-fill/+server.ts
/**
 * POST /api/onto/tables/[id]/ai-fill — "Fill" on a question column.
 * Body: { column: string (name or id), row_ids?: string[], only_empty?: boolean }
 * 200 → { run_id, row_count, column_id, column_name, research, remaining, skipped_filled }
 * 409 → RUN_ACTIVE (the column is already filling; details.run_id) or NOTHING_TO_FILL.
 *
 * Thin wrapper over enqueueTableAiFill (docs/specs/tables/CONTRACT.md, "AI question columns").
 * The pending marks go through the user's own client, so RLS decides write access; the queue
 * row is server-only, so it is inserted with the admin client after that write succeeded.
 * `only_empty` defaults to true: a second Fill never re-bills rows that already have an
 * answer. Pass false to refill (e.g. "Re-run" on chosen rows).
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { captureServerEvent } from '$lib/server/posthog';
import { readJsonObject, requireTableHeadAccess } from '$lib/server/tables/table-api';
import { logOntologyApiError } from '../../../shared/error-logging';
import { TABLE_LIMITS, enqueueTableAiFill } from '@buildos/shared-agent-ops/tables';
import { tableAiFillErrorResponse } from './ai-fill-errors';

const MAX_COLUMN_REF_CHARS = 200;

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const endpoint = `/api/onto/tables/${params.id}/ai-fill`;
	try {
		const parsed = await readJsonObject(request);
		if (!parsed.ok) return parsed.response;
		const { body } = parsed;

		const column = typeof body.column === 'string' ? body.column.trim() : '';
		if (!column || column.length > MAX_COLUMN_REF_CHARS) {
			return ApiResponse.badRequest('column is required (a column name or id)');
		}
		let rowIds: string[] | undefined;
		if (body.row_ids !== undefined && body.row_ids !== null) {
			if (
				!Array.isArray(body.row_ids) ||
				body.row_ids.length > TABLE_LIMITS.maxRows ||
				!body.row_ids.every((id) => typeof id === 'string' && isValidUUID(id))
			) {
				return ApiResponse.badRequest('row_ids must be an array of row ids');
			}
			rowIds = body.row_ids as string[];
		}
		if (body.only_empty !== undefined && typeof body.only_empty !== 'boolean') {
			return ApiResponse.badRequest('only_empty must be true or false');
		}

		const access = await requireTableHeadAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'write',
			method: 'POST',
			endpoint
		});
		if (!access.ok) return access.response;

		const result = await enqueueTableAiFill(
			access.supabase,
			{
				documentId: access.document.id,
				column,
				rowIds,
				onlyEmpty: body.only_empty as boolean | undefined,
				userId: access.userId,
				actorId: access.actorId
			},
			{ queueClient: createAdminSupabaseClient() }
		);

		await captureServerEvent(access.userId, 'table_ai_fill_started', {
			project_id: access.projectId,
			document_id: access.document.id,
			column_id: result.column_id,
			row_count: result.row_count,
			remaining: result.remaining,
			research: result.research,
			only_empty: body.only_empty !== false,
			targeted_rows: Boolean(rowIds?.length)
		});
		return ApiResponse.success(result);
	} catch (error) {
		const mapped = tableAiFillErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected ai-fill error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint,
			method: 'POST',
			entityType: 'document',
			entityId: params.id,
			operation: 'table_ai_fill_start'
		});
		return ApiResponse.internalError(error, 'Failed to start filling this column');
	}
};
