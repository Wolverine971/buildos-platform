// packages/shared-agent-ops/src/tables/table-llm-format.ts
// How tables are shown to a model: schema-first, short row handles ("r12") as
// the first column, columns by name, markdown for narrow tables and key-value
// blocks for wide ones. Reads fit themselves by dropping whole rows — never by
// trimming cells — because a generic payload guard that shortens strings would
// silently corrupt values (docs/specs/tables/research/chat-tools.md §1j).
//
// Browser-safe.
import { cellToText, resolveColumn } from './table-schema';
import {
	TABLE_LIMITS,
	rowHandle,
	type LoadedTable,
	type TableColumn,
	type TableRow,
	type TableSchema
} from './table-types';

/** Default budget for one formatted read (fits the chat worker's 6,000-char tool payload cap). */
export const TABLE_MODEL_DEFAULT_MAX_CHARS = 4_500;
/** Tables with more columns than this render as key-value blocks. */
export const TABLE_MODEL_WIDE_COLUMN_THRESHOLD = 8;

const FOOTER_RESERVE_CHARS = 160;

export interface TableModelFormatOptions {
	/** Column names or ids to show (default: all visible columns). */
	columns?: string[];
	/** Offset of rows[0] within the matching rows (for the footer + next offset). */
	offset?: number;
	/** Total matching rows (default: offset + rows.length). */
	totalMatched?: number;
	maxChars?: number;
}

export interface FormattedTableForModel {
	text: string;
	/** Rows actually rendered (after dropping rows to fit maxChars). */
	rows_shown: number;
	/** Offset to read next, or null when the last matching row was shown. */
	next_offset: number | null;
}

function pickColumns(schema: TableSchema, refs: string[] | undefined): TableColumn[] {
	const visible = schema.columns.filter((column) => !column.hidden);
	if (!Array.isArray(refs) || refs.length === 0) return visible;
	const picked: TableColumn[] = [];
	for (const ref of refs) {
		const column = typeof ref === 'string' ? resolveColumn(schema, ref) : null;
		if (column && !picked.includes(column)) picked.push(column);
	}
	return picked.length > 0 ? picked : visible;
}

function capCell(text: string): string {
	const cap = TABLE_LIMITS.modelCellChars;
	if (text.length <= cap) return text;
	let cut = cap;
	const code = text.charCodeAt(cut - 1);
	if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
	return `${text.slice(0, cut)}…[+${text.length - cut} chars]`;
}

/** One cell as the model sees it, plus whether it carries the AI marker. */
function modelCell(column: TableColumn, row: TableRow): { text: string; ai: boolean } {
	const meta = row.cell_meta?.[column.id];
	let text = cellToText(column, row.cells?.[column.id] ?? null).replace(/\r\n?|\n/g, '<br>');
	text = capCell(text);
	if (!text && meta?.state === 'pending') return { text: '(filling…)', ai: false };
	if (!text && meta?.state === 'error') return { text: '(fill failed)', ai: false };
	const ai =
		Boolean(text) &&
		Boolean(meta) &&
		(meta!.by === 'ai_column' || meta!.by === 'agent') &&
		meta!.state !== 'pending' &&
		meta!.state !== 'error';
	return { text: ai ? `${text}†` : text, ai };
}

function escapePipes(text: string): string {
	return text.replace(/\|/g, '\\|');
}

function renderTableRow(row: TableRow, columns: TableColumn[]): { text: string; ai: boolean } {
	let ai = false;
	const cells = columns.map((column) => {
		const cell = modelCell(column, row);
		ai ||= cell.ai;
		return escapePipes(cell.text);
	});
	return { text: `| ${rowHandle(row.row_number)} | ${cells.join(' | ')} |`, ai };
}

function renderKeyValueRow(row: TableRow, columns: TableColumn[]): { text: string; ai: boolean } {
	let ai = false;
	const lines = [rowHandle(row.row_number)];
	for (const column of columns) {
		const cell = modelCell(column, row);
		if (!cell.text) continue;
		ai ||= cell.ai;
		lines.push(`- ${column.name}: ${cell.text}`);
	}
	if (lines.length === 1) lines[0] = `${lines[0]} (empty row)`;
	return { text: lines.join('\n'), ai };
}

/**
 * formatTableForModel plus the bookkeeping a caller needs to page correctly:
 * how many rows fit and the offset to read next.
 */
export function formatTableForModelDetailed(
	schema: TableSchema,
	rows: TableRow[],
	opts: TableModelFormatOptions = {}
): FormattedTableForModel {
	const columns = pickColumns(schema, opts.columns);
	const list = Array.isArray(rows) ? rows : [];
	const offset =
		typeof opts.offset === 'number' && Number.isFinite(opts.offset)
			? Math.max(0, Math.floor(opts.offset))
			: 0;
	const total =
		typeof opts.totalMatched === 'number' && Number.isFinite(opts.totalMatched)
			? Math.max(0, Math.floor(opts.totalMatched))
			: offset + list.length;
	const maxChars =
		typeof opts.maxChars === 'number' && Number.isFinite(opts.maxChars) && opts.maxChars > 0
			? Math.floor(opts.maxChars)
			: TABLE_MODEL_DEFAULT_MAX_CHARS;
	const keyValue = columns.length > TABLE_MODEL_WIDE_COLUMN_THRESHOLD;

	const parts: string[] = [];
	if (!keyValue) {
		parts.push(`| row | ${columns.map((column) => escapePipes(column.name)).join(' | ')} |`);
		parts.push(`|${' --- |'.repeat(columns.length + 1)}`);
	}
	let used = parts.reduce((sum, part) => sum + part.length + 1, 0);
	let shown = 0;
	let anyAi = false;
	const separator = keyValue ? '\n\n' : '\n';
	for (const row of list) {
		const rendered = keyValue ? renderKeyValueRow(row, columns) : renderTableRow(row, columns);
		const cost = rendered.text.length + separator.length;
		if (used + cost + FOOTER_RESERVE_CHARS > maxChars) break;
		parts.push(rendered.text);
		used += cost;
		shown += 1;
		anyAi ||= rendered.ai;
	}

	const end = offset + shown;
	const nextOffset = end < total ? end : null;
	let footer: string;
	if (shown === 0 && list.length > 0) {
		footer = `Row ${rowHandle(list[0]!.row_number)} is too wide to show within the limit; read fewer columns (pass columns: [...]).`;
	} else if (shown === 0) {
		footer = total === 0 ? 'No rows.' : `No rows at offset ${offset} (${total} total).`;
	} else {
		footer = `Rows ${offset + 1}–${end} of ${total}${nextOffset !== null ? ` · next offset ${nextOffset}` : ''}`;
	}

	const body = keyValue
		? parts.join(separator)
		: shown === 0 && list.length === 0 && total === 0
			? ''
			: parts.join('\n');
	const lines = [body, footer];
	if (anyAi) lines.push('† filled by AI (sources are kept on the cell)');
	return {
		text: lines.filter((line) => line !== '').join(keyValue ? '\n\n' : '\n'),
		rows_shown: shown,
		next_offset: nextOffset
	};
}

/**
 * Rows as model-readable text: markdown with `row` (r12) first, or key-value
 * blocks past 8 columns. Cells cap at TABLE_LIMITS.modelCellChars with
 * "…[+N chars]"; AI-filled cells end with †. Whole rows are dropped to fit
 * maxChars, and the footer says what was shown and the next offset.
 */
export function formatTableForModel(
	schema: TableSchema,
	rows: TableRow[],
	opts?: TableModelFormatOptions
): string {
	return formatTableForModelDetailed(schema, rows, opts).text;
}

function columnTypeLabel(column: TableColumn): string {
	if (column.type !== 'number') return column.type;
	const format = column.options?.format;
	if (format === 'currency') return `number (currency ${column.options?.currency ?? 'USD'})`;
	if (format === 'percent') return 'number (percent)';
	if (format === 'hours') return 'number (hours)';
	return 'number';
}

function clipText(text: string, max: number): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** One line per column: name · type · choices · description · AI question. */
export function describeTableSchemaForModel(schema: TableSchema): string {
	return schema.columns
		.map((column) => {
			const parts = [column.name, columnTypeLabel(column)];
			const choices = column.options?.choices ?? [];
			if (
				(column.type === 'select' || column.type === 'multi_select') &&
				choices.length > 0
			) {
				const shown = choices.slice(0, 20).map((choice) => choice.value);
				parts.push(
					`choices: ${shown.join(', ')}${choices.length > 20 ? `, +${choices.length - 20} more` : ''}`
				);
			}
			if (column.description) parts.push(`about: ${clipText(column.description, 160)}`);
			if (column.ai?.prompt) {
				parts.push(
					`question column: "${clipText(column.ai.prompt, 200)}"${column.ai.research ? ' (web research)' : ''}`
				);
			}
			if (column.hidden) parts.push('hidden');
			return `- ${parts.join(' · ')}`;
		})
		.join('\n');
}

/**
 * The focused-table prompt block: title, row count, columns, and the first
 * rows, within maxChars (default 3,000).
 */
export function summarizeTableForContext(
	table: LoadedTable,
	opts: {
		sampleRows?: number;
		maxChars?: number;
		/** Live rows in the whole table when `table.rows` holds only a leading sample. */
		totalRows?: number;
	} = {}
): string {
	const maxChars =
		typeof opts.maxChars === 'number' && opts.maxChars > 0 ? Math.floor(opts.maxChars) : 3_000;
	const sampleRows =
		typeof opts.sampleRows === 'number' && opts.sampleRows >= 0
			? Math.floor(opts.sampleRows)
			: 10;
	const rows = (Array.isArray(table.rows) ? table.rows : []).filter((row) => !row.deleted_at);
	const totalRows =
		typeof opts.totalRows === 'number' && opts.totalRows > rows.length
			? Math.floor(opts.totalRows)
			: rows.length;
	const { document, schema } = table;
	const archived = Boolean(document.archived_at) || document.state_key === 'archived';
	const header = `Table "${document.title}" · ${totalRows} row${totalRows === 1 ? '' : 's'} · ${schema.columns.length} column${schema.columns.length === 1 ? '' : 's'}${archived ? ' · archived' : ''}`;

	const schemaLines = describeTableSchemaForModel(schema).split('\n').filter(Boolean);
	const schemaBudget = Math.floor(maxChars * 0.55);
	const keptSchema: string[] = [];
	let used = header.length + 'Columns:'.length + 2;
	for (let index = 0; index < schemaLines.length; index += 1) {
		const line = schemaLines[index]!;
		if (used + line.length + 1 > schemaBudget && keptSchema.length > 0) {
			keptSchema.push(`- … +${schemaLines.length - index} more columns`);
			used += 30;
			break;
		}
		keptSchema.push(line);
		used += line.length + 1;
	}

	// Leaves room for the "First rows:" label and the read-more line.
	const remaining = maxChars - used - 60;
	const blocks = [header, 'Columns:', ...keptSchema];
	if (rows.length === 0) {
		blocks.push('', 'No rows yet.');
	} else if (remaining >= 200 && sampleRows > 0) {
		const formatted = formatTableForModelDetailed(schema, rows.slice(0, sampleRows), {
			offset: 0,
			totalMatched: totalRows,
			maxChars: remaining
		});
		blocks.push('', 'First rows:', formatted.text);
		if (formatted.next_offset !== null || totalRows > rows.length) {
			blocks.push('Read more with read_table_rows.');
		}
	} else {
		blocks.push('', 'Read rows with read_table_rows.');
	}
	return blocks.join('\n');
}
