// apps/web/src/routes/api/onto/tables/[id]/rows/+server.ts
/**
 * POST /api/onto/tables/[id]/rows — apply a batch of row ops (grid edits,
 * pastes, deletes, moves) in one RPC call and return an undo receipt.
 *
 * Grid edits send per-row `expected_version`; a moved-on row answers 409
 * `ROW_CONFLICT`, a moved-on table (with `expected_revision`) 409
 * `TABLE_CONFLICT`. Only the document head is read (schema for coercion), never
 * the full row set.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logUpdateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { logOntologyApiError } from '../../../shared/error-logging';
import {
	readJsonObject,
	readOptionalRevision,
	requireTableHeadAccess,
	tableErrorResponse
} from '$lib/server/tables/table-api';
import { prepareRowOps } from '$lib/server/tables/table-row-ops';
import {
	TABLE_LIMITS,
	applyTableChanges,
	buildTableChangeReceipt
} from '@buildos/shared-agent-ops/tables';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const parsedBody = await readJsonObject(request);
	if (!parsedBody.ok) return parsedBody.response;
	const body = parsedBody.body;

	if (!Array.isArray(body.ops) || body.ops.length === 0) {
		return ApiResponse.badRequest('ops must be a non-empty array');
	}
	if (body.ops.length > TABLE_LIMITS.maxRows) {
		return ApiResponse.error('Too many row changes at once', 400, 'LIMIT_EXCEEDED');
	}
	const expectedRevision = readOptionalRevision(body.expected_revision);
	if (expectedRevision === undefined) {
		return ApiResponse.badRequest('expected_revision must be a non-negative integer');
	}
	if (expectedRevision !== null && body.ops.length > TABLE_LIMITS.maxOpsPerApply) {
		return ApiResponse.error(
			`Send at most ${TABLE_LIMITS.maxOpsPerApply} ops with expected_revision`,
			400,
			'LIMIT_EXCEEDED'
		);
	}

	let userId: string | undefined;
	let projectId: string | undefined;
	try {
		const access = await requireTableHeadAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'write',
			method: 'POST',
			endpoint: `/api/onto/tables/${params.id}/rows`
		});
		if (!access.ok) return access.response;
		userId = access.userId;
		projectId = access.projectId;

		const prepared = prepareRowOps(access.schema, body.ops);
		if (!prepared.ok) {
			return ApiResponse.error(
				prepared.errors[0] ?? 'Invalid row change',
				400,
				'VALIDATION_ERROR',
				{ errors: prepared.errors.slice(0, 20) }
			);
		}

		const apply = await applyTableChanges(access.supabase as never, {
			documentId: access.document.id,
			ops: prepared.ops,
			schema: prepared.schema,
			expectedRevision,
			actorId: access.actorId
		});
		const receipt = buildTableChangeReceipt({
			table: { document: access.document, schema: access.schema },
			apply,
			previousSchema: prepared.schema ? access.schema : null
		});

		logUpdateAsync(
			access.supabase,
			access.projectId,
			'document',
			access.document.id,
			{ revision: access.schema.revision, row_count: access.schema.row_count },
			{
				revision: apply.revision,
				row_count: apply.row_count,
				rows_added: receipt.rows_added,
				rows_updated: receipt.rows_updated,
				rows_deleted: receipt.rows_deleted,
				row_ids: apply.results.slice(0, 50).map((result) => result.row_id)
			},
			access.userId,
			getChangeSourceFromRequest(request),
			getChatSessionIdFromRequest(request)
		);

		return ApiResponse.success({ apply, receipt });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected rows error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}/rows`,
			method: 'POST',
			userId,
			projectId,
			entityType: 'document',
			entityId: params.id,
			operation: 'table_rows_apply'
		});
		return ApiResponse.internalError(error, 'Failed to save table rows');
	}
};
