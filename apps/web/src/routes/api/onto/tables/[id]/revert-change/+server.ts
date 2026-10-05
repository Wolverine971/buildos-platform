// apps/web/src/routes/api/onto/tables/[id]/revert-change/+server.ts
/**
 * POST /api/onto/tables/[id]/revert-change — undo one table change from its
 * receipt (chat card or grid toast).
 *
 * When the table has not moved on since the change, the inverse ops are applied
 * guarded by that exact revision. When it has, the inverse ops still carry
 * per-row versions, so undo goes through only if the affected rows are
 * untouched; otherwise 409. A column change is only undone while the table is
 * still at the revision it produced (restoring an old schema over later column
 * work would lose it).
 *
 * `receipts` (several changes from one chat turn, e.g. add a column then fill
 * it) are undone together in one guarded apply; see table-revert.ts.
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
	isPlainObject,
	readJsonObject,
	requireTableHeadAccess,
	tableErrorResponse
} from '$lib/server/tables/table-api';
import { prepareRowOps } from '$lib/server/tables/table-row-ops';
import {
	combineTableChangeReceipts,
	schemaForRevertValidation
} from '$lib/server/tables/table-revert';
import {
	TABLE_LIMITS,
	applyTableChanges,
	loadTable,
	normalizeTableSchema,
	type TableApplyResult
} from '@buildos/shared-agent-ops/tables';

const MOVED_ON_MESSAGE =
	'This change can no longer be undone because the table changed since. Reload to see the latest version.';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const parsedBody = await readJsonObject(request);
	if (!parsedBody.ok) return parsedBody.response;
	const receiptList = parsedBody.body.receipts;
	if (Array.isArray(receiptList) && receiptList.length > 1) {
		return revertSeveral(params.id, receiptList, request, locals);
	}
	const receipt = Array.isArray(receiptList) ? receiptList[0] : parsedBody.body.receipt;

	if (!isPlainObject(receipt) || receipt.kind !== 'table_change') {
		return ApiResponse.badRequest('receipt must be a table change receipt');
	}
	if (receipt.document_id !== params.id) {
		return ApiResponse.badRequest('This receipt belongs to a different table');
	}
	const inverseOps = receipt.inverse_ops;
	if (!Array.isArray(inverseOps)) return ApiResponse.badRequest('receipt.inverse_ops is missing');
	if (inverseOps.length > TABLE_LIMITS.maxRows) {
		return ApiResponse.error('This change is too large to undo', 400, 'LIMIT_EXCEEDED');
	}
	const appliedRevision =
		typeof receipt.applied_revision === 'number' && Number.isInteger(receipt.applied_revision)
			? receipt.applied_revision
			: null;
	const inverseSchema = isPlainObject(receipt.inverse_schema) ? receipt.inverse_schema : null;
	if (inverseOps.length === 0 && !inverseSchema) {
		return ApiResponse.badRequest('Nothing to undo');
	}

	let userId: string | undefined;
	let projectId: string | undefined;
	try {
		const access = await requireTableHeadAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'write',
			method: 'POST',
			endpoint: `/api/onto/tables/${params.id}/revert-change`
		});
		if (!access.ok) return access.response;
		userId = access.userId;
		projectId = access.projectId;

		const atAppliedRevision =
			appliedRevision !== null && access.schema.revision === appliedRevision;
		if (inverseSchema && !atAppliedRevision) {
			return ApiResponse.error(MOVED_ON_MESSAGE, 409, 'TABLE_CONFLICT');
		}

		// Inverse ops address cells by column id; validate them against the schema
		// they will be applied with (the restored one for column changes).
		const targetSchema = inverseSchema ? normalizeTableSchema(inverseSchema) : access.schema;
		let apply: TableApplyResult | null = null;
		if (inverseOps.length > 0 || inverseSchema) {
			const prepared = prepareRowOps(targetSchema, inverseOps);
			if (!prepared.ok) {
				return ApiResponse.error(
					prepared.errors[0] ?? 'This change cannot be undone',
					400,
					'VALIDATION_ERROR',
					{ errors: prepared.errors.slice(0, 20) }
				);
			}
			const guard =
				atAppliedRevision && prepared.ops.length <= TABLE_LIMITS.maxOpsPerApply
					? appliedRevision
					: null;
			apply = await applyTableChanges(access.supabase as never, {
				documentId: access.document.id,
				ops: prepared.ops,
				schema: inverseSchema ? targetSchema : null,
				expectedRevision: guard,
				actorId: access.actorId
			});
		}

		const table = await loadTable(access.supabase as never, access.document.id);

		logUpdateAsync(
			access.supabase,
			access.projectId,
			'document',
			access.document.id,
			{ revision: access.schema.revision },
			{
				revision: table.schema.revision,
				reverted_revision: appliedRevision,
				reverted_ops: inverseOps.length
			},
			access.userId,
			getChangeSourceFromRequest(request),
			getChatSessionIdFromRequest(request)
		);

		return ApiResponse.success({ apply, table });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) {
			if (mapped.status === 409) {
				const code = (error as { code?: string }).code ?? 'ROW_CONFLICT';
				return ApiResponse.error(MOVED_ON_MESSAGE, 409, code);
			}
			return mapped;
		}
		console.error('[Tables API] Unexpected revert error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}/revert-change`,
			method: 'POST',
			userId,
			projectId,
			entityType: 'document',
			entityId: params.id,
			operation: 'table_revert_change'
		});
		return ApiResponse.internalError(error, 'Failed to undo table change');
	}
};

async function revertSeveral(
	tableId: string,
	receipts: unknown[],
	request: Request,
	locals: App.Locals
): Promise<Response> {
	const combined = combineTableChangeReceipts(tableId, receipts);
	if (!combined.ok) return ApiResponse.badRequest(combined.error);
	if (combined.ops.length > TABLE_LIMITS.maxOpsPerApply) {
		return ApiResponse.error(
			'These changes are too large to undo together',
			400,
			'LIMIT_EXCEEDED'
		);
	}

	let userId: string | undefined;
	let projectId: string | undefined;
	try {
		const access = await requireTableHeadAccess({
			locals,
			tableId,
			requiredAccess: 'write',
			method: 'POST',
			endpoint: `/api/onto/tables/${tableId}/revert-change`
		});
		if (!access.ok) return access.response;
		userId = access.userId;
		projectId = access.projectId;

		if (access.schema.revision !== combined.newestRevision) {
			return ApiResponse.error(MOVED_ON_MESSAGE, 409, 'TABLE_CONFLICT');
		}

		const restoredSchema = combined.inverseSchema
			? normalizeTableSchema(combined.inverseSchema)
			: null;
		const prepared = prepareRowOps(
			restoredSchema
				? schemaForRevertValidation(restoredSchema, access.schema)
				: access.schema,
			combined.ops
		);
		if (!prepared.ok) {
			return ApiResponse.error(
				prepared.errors[0] ?? 'These changes cannot be undone',
				400,
				'VALIDATION_ERROR',
				{ errors: prepared.errors.slice(0, 20) }
			);
		}

		const apply = await applyTableChanges(access.supabase as never, {
			documentId: access.document.id,
			ops: prepared.ops,
			schema: restoredSchema,
			expectedRevision: combined.newestRevision,
			actorId: access.actorId
		});
		const table = await loadTable(access.supabase as never, access.document.id);

		logUpdateAsync(
			access.supabase,
			access.projectId,
			'document',
			access.document.id,
			{ revision: access.schema.revision },
			{
				revision: table.schema.revision,
				reverted_revision: combined.newestRevision,
				reverted_receipts: receipts.length,
				reverted_ops: combined.ops.length
			},
			access.userId,
			getChangeSourceFromRequest(request),
			getChatSessionIdFromRequest(request)
		);

		return ApiResponse.success({ apply, table });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) {
			if (mapped.status === 409) {
				const code = (error as { code?: string }).code ?? 'TABLE_CONFLICT';
				return ApiResponse.error(MOVED_ON_MESSAGE, 409, code);
			}
			return mapped;
		}
		console.error('[Tables API] Unexpected revert error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${tableId}/revert-change`,
			method: 'POST',
			userId,
			projectId,
			entityType: 'document',
			entityId: tableId,
			operation: 'table_revert_change'
		});
		return ApiResponse.internalError(error, 'Failed to undo table changes');
	}
}
