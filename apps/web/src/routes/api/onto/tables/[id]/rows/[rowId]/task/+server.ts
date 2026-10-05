// apps/web/src/routes/api/onto/tables/[id]/rows/[rowId]/task/+server.ts
/**
 * POST /api/onto/tables/[id]/rows/[rowId]/task — make a follow-up task from a
 * row: the task lands in the table's project, is linked to the table with a
 * row-anchored edge, and (with `link_column`) the row's link cell points at it.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	logCreateAsync,
	logUpdateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import {
	readJsonObject,
	requireTableAccess,
	tableErrorResponse
} from '$lib/server/tables/table-api';
import {
	RowTaskError,
	createTaskForTableRow,
	defaultRowTaskTitle
} from '$lib/server/tables/table-row-task';
import {
	applyTableChanges,
	resolveColumn,
	rowHandle,
	type TableApplyResult
} from '@buildos/shared-agent-ops/tables';

const MAX_TITLE_CHARS = 200;

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const rowId = params.rowId;
	if (!rowId || !isValidUUID(rowId)) return ApiResponse.badRequest('Invalid row id');

	const parsedBody = await readJsonObject(request);
	if (!parsedBody.ok) return parsedBody.response;
	const body = parsedBody.body;

	if (body.title !== undefined && typeof body.title !== 'string') {
		return ApiResponse.badRequest('title must be a string');
	}
	if (
		body.link_column !== undefined &&
		body.link_column !== null &&
		typeof body.link_column !== 'string'
	) {
		return ApiResponse.badRequest('link_column must be a column name or id');
	}

	let userId: string | undefined;
	let projectId: string | undefined;
	try {
		const access = await requireTableAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'write',
			method: 'POST',
			endpoint: `/api/onto/tables/${params.id}/rows/${rowId}/task`
		});
		if (!access.ok) return access.response;
		userId = access.userId;
		projectId = access.projectId;
		const { supabase, actorId, table } = access;

		const row = table.rows.find((candidate) => candidate.id === rowId);
		if (!row) return ApiResponse.error('Row not found', 404, 'ROW_NOT_FOUND');

		let linkColumnId: string | null = null;
		if (typeof body.link_column === 'string' && body.link_column) {
			const column = resolveColumn(table.schema, body.link_column);
			if (!column) return ApiResponse.badRequest(`Unknown column "${body.link_column}"`);
			if (column.type !== 'link') {
				return ApiResponse.badRequest(`"${column.name}" is not a link column`);
			}
			linkColumnId = column.id;
		}

		const requestedTitle = typeof body.title === 'string' ? body.title.trim() : '';
		const title = (
			requestedTitle || defaultRowTaskTitle(table.document, table.schema, row)
		).slice(0, MAX_TITLE_CHARS);

		const { task, edge } = await createTaskForTableRow({
			supabase,
			actorId,
			document: table.document,
			row,
			title
		});

		const changeSource = getChangeSourceFromRequest(request);
		const chatSessionId = getChatSessionIdFromRequest(request);
		logCreateAsync(
			supabase,
			table.document.project_id,
			'task',
			task.id,
			{
				title: task.title,
				type_key: (task as { type_key?: string }).type_key ?? 'task.default',
				state_key: (task as { state_key?: string }).state_key ?? 'todo',
				from_table: { document_id: table.document.id, row: rowHandle(row.row_number) }
			},
			access.userId,
			changeSource,
			chatSessionId
		);

		let apply: TableApplyResult | null = null;
		if (linkColumnId) {
			apply = await applyTableChanges(supabase as never, {
				documentId: table.document.id,
				ops: [
					{
						op: 'update',
						row_id: row.id,
						cells: { [linkColumnId]: { kind: 'task', id: task.id, label: task.title } }
					}
				],
				actorId
			});
			logUpdateAsync(
				supabase,
				table.document.project_id,
				'document',
				table.document.id,
				{ revision: table.schema.revision },
				{ revision: apply.revision, row_ids: [row.id], linked_task_id: task.id },
				access.userId,
				changeSource,
				chatSessionId
			);
		}

		return ApiResponse.success({ task, apply, edge });
	} catch (error) {
		if (error instanceof RowTaskError) {
			if (error.status >= 500) {
				await logOntologyApiError({
					supabase: locals.supabase,
					error: error.original ?? error,
					endpoint: `/api/onto/tables/${params.id}/rows/${rowId}/task`,
					method: 'POST',
					userId,
					projectId,
					entityType: 'task',
					operation: 'table_row_task_create'
				});
			}
			return ApiResponse.error(error.message, error.status);
		}
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected row task error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}/rows/${rowId}/task`,
			method: 'POST',
			userId,
			projectId,
			entityType: 'document',
			entityId: params.id,
			operation: 'table_row_task_create'
		});
		return ApiResponse.internalError(error, 'Failed to create a task from this row');
	}
};
