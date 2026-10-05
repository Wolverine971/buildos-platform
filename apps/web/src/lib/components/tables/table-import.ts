// apps/web/src/lib/components/tables/table-import.ts
//
// Paste / CSV import previews for NewTableDialog and "Paste rows": parse with
// the shared parser, infer column types, let the user override a type, and
// build the create / append payloads. Structured parsing only.
import {
	inferColumns,
	parseDelimitedText,
	TABLE_LIMITS,
	type TableCellValue,
	type TableColumnInput,
	type TableColumnType,
	type TableSchema
} from '@buildos/shared-agent-ops/tables';
import type { CreateTableInput } from './table-client';
import type { CoerceCell } from './table-grid-model';
import { isEditableColumn } from './table-cell-format';
import { findColumn, orderedVisibleColumns } from './table-view-model';

export const IMPORT_PREVIEW_ROWS = 5;
/** Paste/CSV text larger than this is refused in the browser (≈ a 10k-row sheet). */
export const MAX_IMPORT_CHARS = 5_000_000;

export interface ImportPreview {
	/** First line exactly as parsed (used when it turns out to be data, not names). */
	rawHeaders: string[];
	headers: string[];
	rows: string[][];
	delimiter: ',' | '\t' | ';';
	columns: TableColumnInput[];
	sample: string[][];
	rowCount: number;
	warnings: string[];
}

/** Blank or duplicate headers get readable unique names ("Column 3", "Name (2)"). */
export function uniqueHeaders(headers: readonly string[]): string[] {
	const seen = new Map<string, number>();
	return headers.map((header, index) => {
		const base = header.trim() || `Column ${index + 1}`;
		const key = base.toLowerCase();
		const count = seen.get(key) ?? 0;
		seen.set(key, count + 1);
		return count === 0 ? base : `${base} (${count + 1})`;
	});
}

function isBlankRow(row: readonly string[]): boolean {
	return row.every((cell) => cell.trim() === '');
}

export function buildImportPreview(text: string): ImportPreview | null {
	if (!text.trim()) return null;
	const warnings: string[] = [];
	if (text.length > MAX_IMPORT_CHARS) {
		return {
			rawHeaders: [],
			headers: [],
			rows: [],
			delimiter: ',',
			columns: [],
			sample: [],
			rowCount: 0,
			warnings: ['That file is too large to import here. Split it into smaller files.']
		};
	}
	const parsed = parseDelimitedText(text);
	if (!parsed.headers.length) return null;
	let headers = uniqueHeaders(parsed.headers);
	let rows = parsed.rows.filter((row) => !isBlankRow(row));

	if (headers.length > TABLE_LIMITS.maxColumns) {
		warnings.push(
			`Only the first ${TABLE_LIMITS.maxColumns} of ${headers.length} columns will be kept.`
		);
		headers = headers.slice(0, TABLE_LIMITS.maxColumns);
		rows = rows.map((row) => row.slice(0, TABLE_LIMITS.maxColumns));
	}
	if (rows.length > TABLE_LIMITS.maxRows) {
		warnings.push(`Only the first ${TABLE_LIMITS.maxRows.toLocaleString()} rows will be kept.`);
		rows = rows.slice(0, TABLE_LIMITS.maxRows);
	}

	const inferred = inferColumns(headers, rows);
	const columns = headers.map(
		(name, index): TableColumnInput => ({ ...(inferred[index] ?? { name }), name })
	);

	return {
		rawHeaders: parsed.headers.slice(0, TABLE_LIMITS.maxColumns),
		headers,
		rows,
		delimiter: parsed.delimiter,
		columns,
		sample: rows.slice(0, IMPORT_PREVIEW_ROWS),
		rowCount: rows.length,
		warnings
	};
}

/** Applies a user's type pick; choices are dropped when a column stops being a choice column. */
export function overrideColumnType(
	column: TableColumnInput,
	type: TableColumnType
): TableColumnInput {
	if (column.type === type) return column;
	const next: TableColumnInput = { ...column, type };
	const keepsChoices = type === 'select' || type === 'multi_select';
	if (!keepsChoices && next.options?.choices) {
		const { choices: _choices, ...rest } = next.options;
		next.options = Object.keys(rest).length ? rest : undefined;
	}
	if (type !== 'number' && next.options) {
		const { format: _format, currency: _currency, decimals: _decimals, ...rest } = next.options;
		next.options = Object.keys(rest).length ? rest : undefined;
	}
	return next;
}

export function rowsToRecords(headers: readonly string[], rows: readonly string[][]) {
	return rows.map((row) => {
		const record: Record<string, string> = {};
		headers.forEach((header, index) => {
			const value = row[index];
			if (value !== undefined && value !== '') record[header] = value;
		});
		return record;
	});
}

export function titleFromFilename(filename: string): string {
	const base = filename
		.replace(/\.[^.]+$/, '')
		.replace(/[_-]+/g, ' ')
		.trim();
	if (!base) return 'Untitled table';
	return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * The create payload. When the user kept every inferred type, the server
 * re-infers from the raw text (one code path for agents and humans); after an
 * override we send the typed columns and the rows by column name.
 */
export function buildCreatePayload(args: {
	projectId: string;
	parentId?: string | null;
	title: string;
	description?: string | null;
	text: string;
	preview: ImportPreview;
	columns: TableColumnInput[];
	sourceKind: 'paste' | 'csv';
	filename?: string;
}): CreateTableInput {
	const overridden = args.columns.some(
		(column, index) => column.type !== args.preview.columns[index]?.type
	);
	const truncated = args.preview.warnings.length > 0;
	const base: CreateTableInput = {
		project_id: args.projectId,
		title: args.title.trim() || 'Untitled table',
		description: args.description?.trim() || undefined,
		parent_id: args.parentId ?? undefined,
		source: {
			kind: args.sourceKind,
			...(args.filename ? { filename: args.filename } : {})
		}
	};
	if (!overridden && !truncated) return { ...base, csv: args.text };
	return {
		...base,
		columns: args.columns,
		rows: rowsToRecords(args.preview.headers, args.preview.rows)
	};
}

export function buildBlankPayload(args: {
	projectId: string;
	parentId?: string | null;
	title: string;
	description?: string | null;
	columns?: TableColumnInput[];
}): CreateTableInput {
	return {
		project_id: args.projectId,
		title: args.title.trim() || 'Untitled table',
		description: args.description?.trim() || undefined,
		parent_id: args.parentId ?? undefined,
		columns: args.columns?.length
			? args.columns
			: [
					{ name: 'Name', type: 'text' },
					{ name: 'Notes', type: 'long_text' }
				],
		rows: [],
		source: { kind: 'blank' }
	};
}

export interface HeaderMapping {
	header: string;
	columnId: string | null;
}

/** Matches pasted headers to existing columns by name (case-insensitive) or id. */
export function mapHeadersToColumns(
	schema: TableSchema,
	headers: readonly string[]
): { mappings: HeaderMapping[]; unknown: string[] } {
	const used = new Set<string>();
	const mappings = headers.map((header) => {
		const column = findColumn(schema, header);
		if (!column || used.has(column.id)) return { header, columnId: null };
		used.add(column.id);
		return { header, columnId: column.id };
	});
	return {
		mappings,
		unknown: mappings.filter((mapping) => !mapping.columnId).map((mapping) => mapping.header)
	};
}

/** Does the first pasted line look like this table's own header row? */
export function firstLineIsHeader(schema: TableSchema, headers: readonly string[]): boolean {
	if (!headers.length) return false;
	const { mappings } = mapHeadersToColumns(schema, headers);
	const matched = mappings.filter((mapping) => mapping.columnId).length;
	return matched >= Math.max(1, Math.ceil(headers.length / 2));
}

export interface AppendPlan {
	/** Columns to add first (pasted headers the table doesn't have yet). */
	newColumns: TableColumnInput[];
	/** One record per pasted row, keyed by column name. */
	records: Array<Record<string, string>>;
	/** Column names that will receive values. */
	mapped: string[];
	/** Pasted headers (or extra positions) that will be left out. */
	ignored: string[];
}

/**
 * How pasted rows land in an existing table. With a header line, values go to
 * the columns of the same name (unknown names become new columns when asked).
 * Without one, values fill the visible columns left to right.
 */
export function planAppend(
	schema: TableSchema,
	preview: ImportPreview,
	opts: { hasHeader: boolean; addUnknown: boolean }
): AppendPlan {
	const plan: AppendPlan = { newColumns: [], records: [], mapped: [], ignored: [] };
	if (opts.hasHeader) {
		const { mappings } = mapHeadersToColumns(schema, preview.headers);
		const keys = mappings.map((mapping, index) => {
			if (mapping.columnId) {
				const column = schema.columns.find((c) => c.id === mapping.columnId);
				if (column && isEditableColumn(column)) {
					plan.mapped.push(column.name);
					return column.name;
				}
				plan.ignored.push(mapping.header);
				return null;
			}
			if (
				opts.addUnknown &&
				schema.columns.length + plan.newColumns.length < TABLE_LIMITS.maxColumns
			) {
				const inferred = preview.columns[index] ?? { name: mapping.header };
				plan.newColumns.push({ ...inferred, name: mapping.header });
				plan.mapped.push(mapping.header);
				return mapping.header;
			}
			plan.ignored.push(mapping.header);
			return null;
		});
		plan.records = preview.rows.map((row) => {
			const record: Record<string, string> = {};
			keys.forEach((key, index) => {
				const value = row[index];
				if (key && value !== undefined && value.trim() !== '') record[key] = value;
			});
			return record;
		});
	} else {
		const targets = orderedVisibleColumns(schema).filter(isEditableColumn);
		const lines = [preview.rawHeaders, ...preview.rows];
		const width = Math.max(0, ...lines.map((line) => line.length));
		for (let i = 0; i < width; i += 1) {
			const column = targets[i];
			if (column) plan.mapped.push(column.name);
			else plan.ignored.push(`Column ${i + 1}`);
		}
		plan.records = lines.map((line) => {
			const record: Record<string, string> = {};
			line.forEach((value, index) => {
				const column = targets[index];
				if (column && value.trim() !== '') record[column.name] = value;
			});
			return record;
		});
	}
	plan.records = plan.records.filter((record) => Object.keys(record).length > 0);
	return plan;
}

/** Typed cells (keyed by column id) for planned records against the final schema. */
export function recordsToCells(
	schema: TableSchema,
	records: Array<Record<string, string>>,
	coerce: CoerceCell
): { rows: Array<Record<string, TableCellValue>>; errors: string[] } {
	const errors: string[] = [];
	const rows = records.map((record, index) => {
		const cells: Record<string, TableCellValue> = {};
		for (const [name, raw] of Object.entries(record)) {
			const column = findColumn(schema, name);
			if (!column) continue;
			const result = coerce(column, raw);
			if (result.error) {
				if (errors.length < 20)
					errors.push(`Row ${index + 1}, ${column.name}: ${result.error}`);
				continue;
			}
			if (result.value !== null && result.value !== undefined && result.value !== '') {
				cells[column.id] = result.value;
			}
		}
		return cells;
	});
	return { rows, errors };
}
