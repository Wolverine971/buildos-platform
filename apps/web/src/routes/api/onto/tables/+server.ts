// apps/web/src/routes/api/onto/tables/+server.ts
/**
 * POST /api/onto/tables — create a table (a `document.table` document).
 *
 * Exactly one source per request (docs/specs/tables/CONTRACT.md, "Web API"):
 * - `columns` (+ optional `rows` keyed by column name) — blank or prefilled;
 * - `csv` — CSV/TSV text (pasted from Sheets/Excel or an uploaded file);
 * - `markdown` — one GFM table (used by "Make live table").
 * csv/markdown infer typed columns from the values, create the table, then
 * import every row in one apply batch.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import {
	requireCurrentActorProjectAccess,
	requireOntologyActor
} from '$lib/server/ontology-api-access';
import { logOntologyApiError } from '../shared/error-logging';
import { isPlainObject, readJsonObject, tableErrorResponse } from '$lib/server/tables/table-api';
import {
	TABLE_COLUMN_TYPES,
	TABLE_LIMITS,
	applyTableChanges,
	createTableDocument,
	importRowsToOps,
	inferColumns,
	loadTable,
	parseDelimitedText,
	parseMarkdownTable,
	type TableColumnInput,
	type TableSchema,
	type TableSourceKind
} from '@buildos/shared-agent-ops/tables';

const MAX_IMPORT_TEXT_CHARS = 5_000_000;
const MAX_TITLE_CHARS = 200;
const SOURCE_KINDS = new Set<TableSourceKind>([
	'blank',
	'csv',
	'paste',
	'markdown',
	'chat',
	'agent'
]);
const COLUMN_TYPES = new Set<string>(TABLE_COLUMN_TYPES);

type ParsedSource =
	| { mode: 'columns'; columns: TableColumnInput[]; rows: Record<string, unknown>[] }
	| { mode: 'import'; kind: 'csv' | 'markdown'; headers: string[]; rows: string[][] };

function parseColumns(raw: unknown): TableColumnInput[] | string {
	if (!Array.isArray(raw)) return 'columns must be an array';
	if (raw.length === 0) return 'Add at least one column';
	if (raw.length > TABLE_LIMITS.maxColumns) {
		return `A table can have at most ${TABLE_LIMITS.maxColumns} columns`;
	}
	const columns: TableColumnInput[] = [];
	for (const [index, entry] of raw.entries()) {
		if (!isPlainObject(entry) || typeof entry.name !== 'string' || !entry.name.trim()) {
			return `columns[${index}] needs a name`;
		}
		if (
			entry.type !== undefined &&
			(typeof entry.type !== 'string' || !COLUMN_TYPES.has(entry.type))
		) {
			return `columns[${index}] has an unknown type`;
		}
		const column: TableColumnInput = { name: entry.name.trim() };
		if (entry.type) column.type = entry.type as TableColumnInput['type'];
		if (typeof entry.description === 'string' && entry.description.trim()) {
			column.description = entry.description.trim();
		}
		if (isPlainObject(entry.options))
			column.options = entry.options as TableColumnInput['options'];
		if (
			isPlainObject(entry.ai) &&
			typeof entry.ai.prompt === 'string' &&
			entry.ai.prompt.trim()
		) {
			column.ai = { prompt: entry.ai.prompt.trim(), research: entry.ai.research === true };
		}
		columns.push(column);
	}
	return columns;
}

function parseSource(body: Record<string, unknown>): ParsedSource | string {
	const hasColumns = body.columns !== undefined && body.columns !== null;
	const hasCsv = typeof body.csv === 'string';
	const hasMarkdown = typeof body.markdown === 'string';
	const sources = [hasColumns, hasCsv, hasMarkdown].filter(Boolean).length;
	if (sources !== 1) return 'Send exactly one of columns, csv or markdown';

	if (hasColumns) {
		const columns = parseColumns(body.columns);
		if (typeof columns === 'string') return columns;
		const rawRows = body.rows ?? [];
		if (!Array.isArray(rawRows) || rawRows.some((row) => !isPlainObject(row))) {
			return 'rows must be an array of objects keyed by column name';
		}
		if (rawRows.length > TABLE_LIMITS.maxRows) {
			return `A table can have at most ${TABLE_LIMITS.maxRows} rows`;
		}
		return { mode: 'columns', columns, rows: rawRows as Record<string, unknown>[] };
	}

	const text = (hasCsv ? body.csv : body.markdown) as string;
	if (!text.trim()) return hasCsv ? 'The pasted data is empty' : 'The markdown table is empty';
	if (text.length > MAX_IMPORT_TEXT_CHARS) return 'That data is too large to import at once';

	if (hasCsv) {
		const parsed = parseDelimitedText(text);
		return { mode: 'import', kind: 'csv', headers: parsed.headers, rows: parsed.rows };
	}
	const parsed = parseMarkdownTable(text);
	if (!parsed) return 'No markdown table found';
	return { mode: 'import', kind: 'markdown', headers: parsed.headers, rows: parsed.rows };
}

function parseSourceMeta(
	raw: unknown,
	fallback: TableSourceKind
): NonNullable<TableSchema['source']> {
	const source: NonNullable<TableSchema['source']> = { kind: fallback };
	if (!isPlainObject(raw)) return source;
	if (typeof raw.kind === 'string' && SOURCE_KINDS.has(raw.kind as TableSourceKind)) {
		source.kind = raw.kind as TableSourceKind;
	}
	if (typeof raw.filename === 'string' && raw.filename.trim()) {
		source.filename = raw.filename.trim().slice(0, 200);
	}
	const origin = raw.origin_entity;
	if (
		isPlainObject(origin) &&
		typeof origin.kind === 'string' &&
		typeof origin.id === 'string' &&
		origin.kind.length <= 40 &&
		origin.id.length <= 120
	) {
		source.origin_entity = { kind: origin.kind, id: origin.id };
	}
	return source;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.safeGetSession();
	const userId = session?.user?.id;
	if (!userId) return ApiResponse.unauthorized('Authentication required');

	const parsedBody = await readJsonObject(request);
	if (!parsedBody.ok) return parsedBody.response;
	const body = parsedBody.body;

	const projectId = typeof body.project_id === 'string' ? body.project_id : '';
	if (!isValidUUID(projectId)) return ApiResponse.badRequest('project_id is required');

	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) return ApiResponse.badRequest('title is required');
	if (title.length > MAX_TITLE_CHARS) return ApiResponse.badRequest('title is too long');

	const description =
		typeof body.description === 'string' && body.description.trim()
			? body.description.trim()
			: null;

	const parentId =
		typeof body.parent_id === 'string' && body.parent_id.trim() ? body.parent_id.trim() : null;
	if (parentId && !isValidUUID(parentId)) return ApiResponse.badRequest('Invalid parent_id');

	let source: ParsedSource | string;
	try {
		source = parseSource(body);
	} catch (parseError) {
		console.error('[Tables API] Could not parse import data:', parseError);
		return ApiResponse.badRequest('That data could not be read as a table');
	}
	if (typeof source === 'string') return ApiResponse.badRequest(source);

	if (source.mode === 'import') {
		if (source.headers.length === 0)
			return ApiResponse.badRequest('No columns found in that data');
		if (source.headers.length > TABLE_LIMITS.maxColumns) {
			return ApiResponse.error(
				`A table can have at most ${TABLE_LIMITS.maxColumns} columns`,
				400,
				'LIMIT_EXCEEDED'
			);
		}
		if (source.rows.length > TABLE_LIMITS.maxRows) {
			return ApiResponse.error(
				`A table can have at most ${TABLE_LIMITS.maxRows.toLocaleString('en-US')} rows`,
				400,
				'LIMIT_EXCEEDED'
			);
		}
	}

	const supabase = locals.supabase;
	const audit = {
		endpoint: '/api/onto/tables',
		method: 'POST',
		entityType: 'document',
		projectId,
		consoleLabel: 'Tables API'
	};

	try {
		const [actorResult, projectResult, parentResult] = await Promise.all([
			requireOntologyActor({
				supabase,
				user: { id: userId },
				audit,
				operation: 'table_actor_resolve'
			}),
			supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.is('deleted_at', null)
				.maybeSingle(),
			parentId
				? supabase
						.from('onto_documents')
						.select('id, project_id')
						.eq('id', parentId)
						.is('deleted_at', null)
						.maybeSingle()
				: Promise.resolve({ data: null, error: null })
		]);
		if (!actorResult.ok) return actorResult.response;
		if (projectResult.error) return ApiResponse.databaseError(projectResult.error);
		if (!projectResult.data) return ApiResponse.notFound('Project');
		if (parentId) {
			const parent = parentResult.data as unknown as {
				id: string;
				project_id: string;
			} | null;
			if (!parent || parent.project_id !== projectId) {
				return ApiResponse.badRequest('parent_id must be a document in this project');
			}
		}

		const access = await requireCurrentActorProjectAccess({
			supabase,
			actor: actorResult.actor,
			projectId,
			requiredAccess: 'write',
			audit,
			operation: 'table_access_check',
			forbiddenMessage: 'You do not have permission to add tables to this project'
		});
		if (!access.ok) return access.response;

		const actorId = actorResult.actor.actorId;
		const warnings: string[] = [];
		const fallbackKind: TableSourceKind =
			source.mode === 'import' ? source.kind : source.rows.length > 0 ? 'paste' : 'blank';
		const sourceMeta = parseSourceMeta(body.source, fallbackKind);

		const columns =
			source.mode === 'columns' ? source.columns : inferColumns(source.headers, source.rows);

		const created = await createTableDocument(supabase as never, {
			projectId,
			actorId,
			title,
			description,
			columns,
			rows: source.mode === 'columns' && source.rows.length > 0 ? source.rows : undefined,
			parentId,
			source: sourceMeta
		});
		warnings.push(...(created.warnings ?? []));
		let table = created.table;

		if (source.mode === 'import' && source.rows.length > 0) {
			// Map file positions to the inferred columns. inferColumns keeps one
			// column per header in order, so its (deduplicated) names are the
			// safest header order; fall back to the raw headers otherwise.
			const headerOrder =
				columns.length === source.headers.length
					? columns.map((column) => column.name)
					: source.headers;
			const imported = importRowsToOps(table.schema, source.rows, headerOrder);
			warnings.push(...imported.errors);
			if (imported.ops.length > 0) {
				try {
					await applyTableChanges(supabase as never, {
						documentId: table.document.id,
						ops: imported.ops,
						actorId
					});
					table = await loadTable(supabase as never, table.document.id);
				} catch (importError) {
					// The table itself exists; say what did not land instead of failing.
					console.error('[Tables API] Row import failed:', importError);
					warnings.push(
						importError instanceof Error && importError.message
							? `Rows could not be imported: ${importError.message}`
							: 'Rows could not be imported.'
					);
					await logOntologyApiError({
						supabase,
						error: importError,
						endpoint: '/api/onto/tables',
						method: 'POST',
						userId,
						projectId,
						entityType: 'document',
						entityId: table.document.id,
						operation: 'table_import_rows',
						metadata: { rows: source.rows.length, nonFatal: true }
					});
				}
			}
		}

		logCreateAsync(
			supabase,
			projectId,
			'document',
			table.document.id,
			{
				title: table.document.title,
				type_key: table.document.type_key,
				state_key: table.document.state_key,
				table: {
					source: sourceMeta.kind,
					columns: table.schema.columns.length,
					rows: table.schema.row_count
				}
			},
			userId,
			getChangeSourceFromRequest(request),
			getChatSessionIdFromRequest(request)
		);

		return ApiResponse.success({ table, warnings });
	} catch (error) {
		const mapped = tableErrorResponse(error);
		if (mapped) return mapped;
		console.error('[Tables API] Unexpected create error:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: '/api/onto/tables',
			method: 'POST',
			userId,
			projectId,
			entityType: 'document',
			operation: 'table_create'
		});
		return ApiResponse.internalError(error, 'Failed to create table');
	}
};
