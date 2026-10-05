// apps/web/src/lib/server/tables/table-api.ts
//
// Shared plumbing for the Tables API routes (docs/specs/tables/CONTRACT.md,
// "Web API"). A table is an onto_documents row (type_key 'document.table'), so
// access follows the document rules: resolve the actor, load the document with
// the user-scoped client (RLS), then check project membership for the access
// the route needs. Row writes go through the shared repository, which calls the
// SECURITY INVOKER apply RPC with the same user-scoped client.
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor,
	type OntologyProjectAccessLevel
} from '$lib/server/ontology-api-access';
import {
	isTableTypeKey,
	loadTable,
	normalizeTableSchema,
	type LoadedTable,
	type TableDocumentSummary,
	type TableErrorCode,
	type TableSchema
} from '@buildos/shared-agent-ops/tables';

type Locals = App.Locals;
type Supabase = App.Locals['supabase'];

const TABLE_ERROR_STATUS: Record<TableErrorCode, number> = {
	TABLE_NOT_FOUND: 404,
	ROW_NOT_FOUND: 404,
	NOT_A_TABLE: 400,
	TABLE_CONFLICT: 409,
	ROW_CONFLICT: 409,
	INVALID_OP: 400,
	VALIDATION_ERROR: 400,
	LIMIT_EXCEEDED: 400
};

const TABLE_ERROR_MESSAGES: Partial<Record<TableErrorCode, string>> = {
	TABLE_NOT_FOUND: 'Table not found',
	ROW_NOT_FOUND: 'Row not found',
	NOT_A_TABLE: 'This document is not a table',
	TABLE_CONFLICT: 'The table changed since you loaded it. Reload to see the latest version.',
	ROW_CONFLICT: 'A row changed since you loaded it. Reload to see the latest version.'
};

function readTableErrorCode(error: unknown): TableErrorCode | null {
	if (!error || typeof error !== 'object') return null;
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' && code in TABLE_ERROR_STATUS ? (code as TableErrorCode) : null;
}

/**
 * Map a TableServiceError (or anything carrying a TableErrorCode) to an
 * ApiResponse. Conflicts answer 409 with `code` so the grid can reload the row.
 * Returns null for errors that are not table errors.
 */
export function tableErrorResponse(error: unknown): Response | null {
	const code = readTableErrorCode(error);
	if (!code) return null;
	const status = TABLE_ERROR_STATUS[code];
	const rawMessage = error instanceof Error && error.message ? error.message : '';
	const message =
		status === 409 || status === 404
			? (TABLE_ERROR_MESSAGES[code] ?? rawMessage)
			: rawMessage || TABLE_ERROR_MESSAGES[code] || 'Invalid table change';
	const details = (error as { details?: unknown }).details;
	return ApiResponse.error(message, status, code, details ?? undefined);
}

export const TABLE_DOCUMENT_HEAD_COLUMNS =
	'id, project_id, type_key, title, description, state_key, updated_at, archived_at, props';

type DocumentHeadRow = {
	id: string;
	project_id: string;
	type_key: string | null;
	title: string | null;
	description: string | null;
	state_key: string | null;
	updated_at: string;
	archived_at?: string | null;
	props?: unknown;
};

export function toTableDocumentSummary(row: DocumentHeadRow): TableDocumentSummary {
	return {
		id: row.id,
		project_id: row.project_id,
		title: row.title ?? 'Untitled table',
		description: row.description ?? null,
		type_key: row.type_key ?? 'document.table',
		state_key: row.state_key ?? null,
		updated_at: row.updated_at,
		archived_at: row.archived_at ?? null
	};
}

function readSchemaFromProps(props: unknown): TableSchema {
	const table =
		props && typeof props === 'object' && !Array.isArray(props)
			? (props as Record<string, unknown>).table
			: undefined;
	return normalizeTableSchema(table);
}

export type TableHeadAccess = {
	ok: true;
	supabase: Supabase;
	userId: string;
	actorId: string;
	projectId: string;
	document: TableDocumentSummary;
	schema: TableSchema;
};

export type TableFullAccess = {
	ok: true;
	supabase: Supabase;
	userId: string;
	actorId: string;
	projectId: string;
	table: LoadedTable;
};

type AccessFailure = { ok: false; response: Response };

type AccessOptions = {
	locals: Locals;
	tableId: string | undefined;
	requiredAccess: OntologyProjectAccessLevel;
	method: string;
	endpoint: string;
};

async function resolveSession(locals: Locals): Promise<{ userId: string } | AccessFailure> {
	const session = await locals.safeGetSession();
	const userId = session?.user?.id;
	if (!userId)
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	return { userId };
}

function auditFor(options: AccessOptions) {
	return {
		endpoint: options.endpoint,
		method: options.method,
		entityType: 'document',
		entityId: options.tableId,
		consoleLabel: 'Tables API'
	};
}

/**
 * Resolve the actor and the table's document head (schema in props, no rows)
 * in parallel, then check project access. Used by row writes, task creation and
 * revert, which never need the full row set.
 */
export async function requireTableHeadAccess(
	options: AccessOptions
): Promise<TableHeadAccess | AccessFailure> {
	const { locals, tableId, requiredAccess } = options;
	const session = await resolveSession(locals);
	if ('ok' in session) return session;
	if (!tableId || !isValidUUID(tableId)) {
		return { ok: false, response: ApiResponse.badRequest('Invalid table id') };
	}

	const supabase = locals.supabase;
	const audit = auditFor(options);
	const [actorResult, documentResult] = await Promise.all([
		requireOntologyActor({
			supabase,
			user: { id: session.userId },
			audit,
			operation: 'table_actor_resolve'
		}),
		supabase
			.from('onto_documents')
			.select(TABLE_DOCUMENT_HEAD_COLUMNS)
			.eq('id', tableId)
			.is('deleted_at', null)
			.maybeSingle()
	]);
	if (!actorResult.ok) return actorResult;

	const { data: row, error } = documentResult as unknown as {
		data: DocumentHeadRow | null;
		error: unknown;
	};
	if (error) return { ok: false, response: ApiResponse.databaseError(error) };
	if (!row) return { ok: false, response: ApiResponse.notFound('Table') };
	if (!isTableTypeKey(row.type_key)) {
		return {
			ok: false,
			response: ApiResponse.error('This document is not a table', 400, 'NOT_A_TABLE')
		};
	}

	const access = await requireCurrentActorProjectAccess({
		supabase,
		actor: actorResult.actor,
		projectId: row.project_id,
		requiredAccess,
		audit,
		operation: 'table_access_check',
		forbiddenMessage: 'You do not have permission to access this table'
	});
	if (!access.ok) return access;

	return {
		ok: true,
		supabase,
		userId: session.userId,
		actorId: actorResult.actor.actorId,
		projectId: row.project_id,
		document: toTableDocumentSummary(row),
		schema: readSchemaFromProps(row.props)
	};
}

/**
 * Resolve the actor and load the whole table (schema + live rows) in parallel,
 * then check project access. Used by reads, exports and column changes.
 */
export async function requireTableAccess(
	options: AccessOptions
): Promise<TableFullAccess | AccessFailure> {
	const { locals, tableId, requiredAccess } = options;
	const session = await resolveSession(locals);
	if ('ok' in session) return session;
	if (!tableId || !isValidUUID(tableId)) {
		return { ok: false, response: ApiResponse.badRequest('Invalid table id') };
	}

	const supabase = locals.supabase;
	const audit = auditFor(options);
	const [actorResult, tableResult] = await Promise.all([
		requireOntologyActor({
			supabase,
			user: { id: session.userId },
			audit,
			operation: 'table_actor_resolve'
		}),
		loadTable(supabase as never, tableId).then(
			(table) => ({ table, error: null as unknown }),
			(error: unknown) => ({ table: null, error })
		)
	]);
	if (!actorResult.ok) return actorResult;
	if (!tableResult.table) {
		const mapped = tableErrorResponse(tableResult.error);
		if (mapped) return { ok: false, response: mapped };
		throw tableResult.error;
	}

	const table = tableResult.table;
	const access = await requireCurrentActorProjectAccess({
		supabase,
		actor: actorResult.actor,
		projectId: table.document.project_id,
		requiredAccess,
		audit,
		operation: 'table_access_check',
		forbiddenMessage: 'You do not have permission to access this table'
	});
	if (!access.ok) return access;

	return {
		ok: true,
		supabase,
		userId: session.userId,
		actorId: actorResult.actor.actorId,
		projectId: table.document.project_id,
		table
	};
}

export async function readJsonObject(
	request: Request
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return { ok: false, response: ApiResponse.badRequest('Invalid request body') };
	}
	return { ok: true, body: body as Record<string, unknown> };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Optional non-negative integer; `undefined`/`null` → null, anything else invalid → undefined. */
export function readOptionalRevision(value: unknown): number | null | undefined {
	if (value === undefined || value === null) return null;
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}
