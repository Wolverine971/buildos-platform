// apps/web/src/routes/api/onto/tables/[id]/+server.ts
/**
 * GET   /api/onto/tables/[id] — the table (schema + live rows), footer totals, and
 *                             the tasks made from its rows.
 * PATCH /api/onto/tables/[id] — title/description, column changes, saved views,
 *                               primary column.
 *
 * Column changes go through `applyColumnChanges`, which returns the new schema
 * plus the row ops that keep cells consistent (retype coerces, delete clears).
 * Schema + ops are saved in ONE apply call, guarded by the revision the change
 * was computed from, so a concurrent edit can never be half-applied.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logUpdateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { updateDocNodeMetadata } from '$lib/services/ontology/doc-structure.service';
import { logOntologyApiError } from '../../shared/error-logging';
import {
	isPlainObject,
	readJsonObject,
	readOptionalRevision,
	requireTableAccess,
	tableErrorResponse
} from '$lib/server/tables/table-api';
import { loadTableRowTasks } from '$lib/server/tables/table-row-task';
import {
	TABLE_LIMITS,
	applyColumnChanges,
	applyTableChanges,
	buildTableChangeReceipt,
	computeColumnTotals,
	loadTable,
	type TableChangeReceipt,
	type TableColumnChange,
	type TableRowOp,
	type TableSchema,
	type TableView
} from '@buildos/shared-agent-ops/tables';

const COLUMN_CHANGE_ACTIONS = new Set(['add', 'rename', 'retype', 'update', 'delete', 'move']);
const VIEW_LAYOUTS = new Set(['grid', 'board']);
const MAX_VIEWS = 20;
const MAX_TITLE_CHARS = 200;

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const access = await requireTableAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'read',
			method: 'GET',
			endpoint: `/api/onto/tables/${params.id}`
		});
		if (!access.ok) return access.response;

		const totals = computeColumnTotals(access.table.schema, access.table.rows);
		const rowTasks = await loadTableRowTasks(
			access.supabase,
			access.table.document.project_id,
			access.table.document.id
		);
		return ApiResponse.success({ table: access.table, totals, row_tasks: rowTasks });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}`,
			method: 'GET',
			entityType: 'document',
			entityId: params.id,
			operation: 'table_get'
		});
		return ApiResponse.internalError(error, 'Failed to load table');
	}
};

function parseColumnChanges(raw: unknown): TableColumnChange[] | string {
	if (!Array.isArray(raw)) return 'column_changes must be an array';
	if (raw.length > TABLE_LIMITS.maxColumns * 2) return 'Too many column changes at once';
	for (const [index, change] of raw.entries()) {
		if (
			!isPlainObject(change) ||
			typeof change.action !== 'string' ||
			!COLUMN_CHANGE_ACTIONS.has(change.action)
		) {
			return `column_changes[${index}] has an unknown action`;
		}
		if (change.action === 'add') {
			if (typeof change.name !== 'string' || !change.name.trim()) {
				return `column_changes[${index}] needs a column name`;
			}
		} else if (typeof change.column !== 'string' || !change.column) {
			return `column_changes[${index}] needs the column it changes`;
		}
	}
	return raw as TableColumnChange[];
}

function parseViews(raw: unknown): TableView[] | string {
	if (!Array.isArray(raw)) return 'views must be an array';
	if (raw.length > MAX_VIEWS) return `A table can have at most ${MAX_VIEWS} views`;
	const seen = new Set<string>();
	for (const [index, view] of raw.entries()) {
		if (
			!isPlainObject(view) ||
			typeof view.id !== 'string' ||
			!view.id ||
			typeof view.name !== 'string' ||
			typeof view.layout !== 'string' ||
			!VIEW_LAYOUTS.has(view.layout)
		) {
			return `views[${index}] needs an id, a name and a layout (grid or board)`;
		}
		if (seen.has(view.id)) return `views[${index}] repeats view id ${view.id}`;
		seen.add(view.id);
	}
	return raw as TableView[];
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const parsedBody = await readJsonObject(request);
	if (!parsedBody.ok) return parsedBody.response;
	const body = parsedBody.body;

	const expectedRevision = readOptionalRevision(body.expected_revision);
	if (expectedRevision === undefined) {
		return ApiResponse.badRequest('expected_revision must be a non-negative integer');
	}

	const hasTitle = body.title !== undefined;
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (hasTitle && (!title || title.length > MAX_TITLE_CHARS)) {
		return ApiResponse.badRequest('title must be 1-200 characters');
	}
	const hasDescription = body.description !== undefined;
	if (hasDescription && body.description !== null && typeof body.description !== 'string') {
		return ApiResponse.badRequest('description must be a string or null');
	}
	const description =
		typeof body.description === 'string' && body.description.trim()
			? body.description.trim()
			: null;

	let columnChanges: TableColumnChange[] = [];
	if (body.column_changes !== undefined) {
		const parsed = parseColumnChanges(body.column_changes);
		if (typeof parsed === 'string') return ApiResponse.badRequest(parsed);
		columnChanges = parsed;
	}
	let views: TableView[] | null = null;
	if (body.views !== undefined) {
		const parsed = parseViews(body.views);
		if (typeof parsed === 'string') return ApiResponse.badRequest(parsed);
		views = parsed;
	}
	const hasPrimary = body.primary_column_id !== undefined;
	if (
		hasPrimary &&
		body.primary_column_id !== null &&
		(typeof body.primary_column_id !== 'string' || !body.primary_column_id)
	) {
		return ApiResponse.badRequest('primary_column_id must be a column id');
	}

	const schemaTouched = columnChanges.length > 0 || views !== null || hasPrimary;
	if (!schemaTouched && !hasTitle && !hasDescription) {
		return ApiResponse.badRequest('Nothing to change');
	}

	let userId: string | undefined;
	let projectId: string | undefined;
	try {
		const access = await requireTableAccess({
			locals,
			tableId: params.id,
			requiredAccess: 'write',
			method: 'PATCH',
			endpoint: `/api/onto/tables/${params.id}`
		});
		if (!access.ok) return access.response;
		userId = access.userId;
		projectId = access.projectId;
		const { supabase, actorId } = access;
		const before = access.table;

		if (expectedRevision !== null && expectedRevision !== before.schema.revision) {
			return ApiResponse.error(
				'The table changed since you loaded it. Reload to see the latest version.',
				409,
				'TABLE_CONFLICT',
				{ revision: before.schema.revision }
			);
		}

		let receipt: TableChangeReceipt | null = null;
		const warnings: string[] = [];

		if (schemaTouched) {
			let nextSchema: TableSchema = before.schema;
			let rowOps: TableRowOp[] = [];
			if (columnChanges.length > 0) {
				const changed = applyColumnChanges(before.schema, before.rows, columnChanges);
				nextSchema = changed.schema;
				rowOps = changed.rowOps;
				warnings.push(...changed.warnings);
			}
			if (views !== null) nextSchema = { ...nextSchema, views };
			if (hasPrimary) {
				const primaryId = body.primary_column_id as string | null;
				if (primaryId && !nextSchema.columns.some((column) => column.id === primaryId)) {
					return ApiResponse.badRequest(
						'primary_column_id is not a column of this table'
					);
				}
				nextSchema = { ...nextSchema, primary_column_id: primaryId ?? undefined };
			}
			if (nextSchema.columns.length > TABLE_LIMITS.maxColumns) {
				return ApiResponse.error(
					`A table can have at most ${TABLE_LIMITS.maxColumns} columns`,
					400,
					'LIMIT_EXCEEDED'
				);
			}

			// Guard on the revision the change was computed from. A huge retype is
			// chunked by the repository, which only happens without a guard.
			const guardRevision =
				rowOps.length <= TABLE_LIMITS.maxOpsPerApply ? before.schema.revision : null;
			const apply = await applyTableChanges(supabase as never, {
				documentId: before.document.id,
				ops: rowOps,
				schema: nextSchema,
				expectedRevision: guardRevision,
				actorId
			});
			receipt = buildTableChangeReceipt({
				table: before,
				apply,
				previousSchema: before.schema
			});
		}

		if (hasTitle || hasDescription) {
			const update: { title?: string; description?: string | null } = {};
			if (hasTitle) update.title = title;
			if (hasDescription) update.description = description;
			const { error: updateError } = await supabase
				.from('onto_documents')
				.update(update)
				.eq('id', before.document.id)
				.eq('project_id', before.document.project_id)
				.is('deleted_at', null);
			if (updateError) return ApiResponse.databaseError(updateError);

			// Keep the doc tree's cached title in step (best effort, like documents).
			void updateDocNodeMetadata(
				supabase,
				before.document.project_id,
				before.document.id,
				{
					...(hasTitle ? { title } : {}),
					...(hasDescription ? { description } : {})
				},
				actorId
			).catch((syncError: unknown) => {
				console.error('[Tables API] Failed to sync doc tree metadata:', syncError);
			});
		}

		const table = await loadTable(supabase as never, before.document.id);

		logUpdateAsync(
			supabase,
			before.document.project_id,
			'document',
			before.document.id,
			{
				title: before.document.title,
				revision: before.schema.revision,
				columns: before.schema.columns.map((column) => column.name)
			},
			{
				title: table.document.title,
				revision: table.schema.revision,
				columns: table.schema.columns.map((column) => column.name),
				...(columnChanges.length > 0
					? { column_changes: columnChanges.map((change) => change.action) }
					: {})
			},
			access.userId,
			getChangeSourceFromRequest(request),
			getChatSessionIdFromRequest(request)
		);

		return ApiResponse.success({ table, receipt, warnings });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected PATCH error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tables/${params.id}`,
			method: 'PATCH',
			userId,
			projectId,
			entityType: 'document',
			entityId: params.id,
			operation: 'table_update'
		});
		return ApiResponse.internalError(error, 'Failed to update table');
	}
};
