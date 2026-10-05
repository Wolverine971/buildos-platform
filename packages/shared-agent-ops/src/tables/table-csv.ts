// packages/shared-agent-ops/src/tables/table-csv.ts
// Import/export for BuildOS Tables: RFC 4180 CSV (plus TSV pasted from
// Sheets/Excel and semicolon CSV), GFM markdown tables, column type inference
// from values, and formula-injection-safe CSV export.
//
// Hand-rolled (no dependency) and browser-safe. Everything here parses
// structured text formats; nothing classifies natural language (AGENTS.md).
import {
	coerceCellValue,
	normalizeEmailText,
	normalizeUrlText,
	parseBooleanText,
	parseDateText,
	parseNumberText,
	resolveColumn
} from './table-schema';
import {
	TABLE_LIMITS,
	type TableCellValue,
	type TableColumnInput,
	type TableLinkValue,
	type TableNumberFormat,
	type TableRow,
	type TableRowOp,
	type TableSchema
} from './table-types';

type Delimiter = ',' | '\t' | ';';

const MAX_REPORTED_ERRORS = 50;

// ---------------------------------------------------------------------------
// Delimited text
// ---------------------------------------------------------------------------

/** Per-line counts of each candidate delimiter outside quotes (first ~10 records). */
function sampleDelimiterCounts(input: string): Array<Record<Delimiter, number>> {
	const lines: Array<Record<Delimiter, number>> = [];
	let counts: Record<Delimiter, number> = { ',': 0, '\t': 0, ';': 0 };
	let inQuotes = false;
	for (let index = 0; index < input.length && lines.length < 10; index += 1) {
		const char = input[index]!;
		if (char === '"') {
			if (inQuotes && input[index + 1] === '"') {
				index += 1;
				continue;
			}
			inQuotes = !inQuotes;
			continue;
		}
		if (inQuotes) continue;
		if (char === ',' || char === '\t' || char === ';') {
			counts[char] += 1;
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && input[index + 1] === '\n') index += 1;
			lines.push(counts);
			counts = { ',': 0, '\t': 0, ';': 0 };
		}
	}
	if (lines.length < 10 && (counts[','] || counts['\t'] || counts[';'])) lines.push(counts);
	return lines;
}

function detectDelimiter(input: string): Delimiter {
	const lines = sampleDelimiterCounts(input);
	const first = lines[0];
	if (!first) return ',';
	// Sheets/Excel copy-paste is tab-separated.
	if (first['\t'] > 0) return '\t';
	const score = (delimiter: Delimiter): number => {
		const header = first[delimiter];
		if (header === 0) return 0;
		const consistent = lines.filter((line) => line[delimiter] === header).length;
		return consistent * 1000 + header;
	};
	return score(';') > score(',') ? ';' : ',';
}

/** RFC 4180 records: quoted fields, doubled quotes, CRLF/LF/CR, embedded newlines. */
function parseRecords(input: string, delimiter: Delimiter): string[][] {
	const records: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let fieldQuoted = false;
	let index = 0;
	while (index < input.length) {
		const char = input[index]!;
		if (inQuotes) {
			if (char === '"') {
				if (input[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				inQuotes = false;
				index += 1;
				continue;
			}
			field += char;
			index += 1;
			continue;
		}
		if (char === '"' && field === '' && !fieldQuoted) {
			inQuotes = true;
			fieldQuoted = true;
			index += 1;
			continue;
		}
		if (char === delimiter) {
			row.push(field);
			field = '';
			fieldQuoted = false;
			index += 1;
			continue;
		}
		if (char === '\n' || char === '\r') {
			row.push(field);
			records.push(row);
			row = [];
			field = '';
			fieldQuoted = false;
			index += char === '\r' && input[index + 1] === '\n' ? 2 : 1;
			continue;
		}
		field += char;
		index += 1;
	}
	if (field !== '' || fieldQuoted || row.length > 0) {
		row.push(field);
		records.push(row);
	}
	return records;
}

function dedupeHeaders(headers: string[]): string[] {
	const seen = new Set<string>();
	return headers.map((raw, index) => {
		const base = raw.replace(/\s+/g, ' ').trim() || `Column ${index + 1}`;
		let candidate = base;
		let suffix = 2;
		while (seen.has(candidate.toLowerCase())) {
			candidate = `${base} (${suffix})`;
			suffix += 1;
		}
		seen.add(candidate.toLowerCase());
		return candidate;
	});
}

function padRow(row: string[], width: number): string[] {
	if (row.length >= width) return row.slice(0, width);
	return [...row, ...Array.from({ length: width - row.length }, () => '')];
}

/** Drops columns with no header and no values (trailing delimiters from spreadsheets). */
function dropEmptyColumns(
	headers: string[],
	rows: string[][]
): { headers: string[]; rows: string[][] } {
	const keep = headers.map(
		(header, index) =>
			header.trim() !== '' || rows.some((row) => (row[index] ?? '').trim() !== '')
	);
	if (keep.every(Boolean)) return { headers, rows };
	return {
		headers: headers.filter((_, index) => keep[index]),
		rows: rows.map((row) => row.filter((_, index) => keep[index]))
	};
}

/**
 * CSV / TSV / semicolon text → headers + rows. Strips a UTF-8 BOM, detects
 * the delimiter (tabs win: that is a spreadsheet paste), drops blank lines,
 * pads ragged rows, names blank headers "Column N", and suffixes duplicate
 * headers "Name (2)". Field values are returned untrimmed.
 */
export function parseDelimitedText(text: string): {
	headers: string[];
	rows: string[][];
	delimiter: ',' | '\t' | ';';
} {
	let input = typeof text === 'string' ? text : '';
	if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
	const delimiter = detectDelimiter(input);
	const records = parseRecords(input, delimiter).filter((record) =>
		record.some((field) => field.trim() !== '')
	);
	if (records.length === 0) return { headers: [], rows: [], delimiter };
	const [headerRecord, ...dataRecords] = records as [string[], ...string[][]];
	let width = headerRecord.length;
	for (const record of dataRecords) width = Math.max(width, record.length);
	const rawHeaders = padRow(headerRecord, width);
	const rows = dataRecords.map((record) => padRow(record, width));
	const trimmed = dropEmptyColumns(rawHeaders, rows);
	return { headers: dedupeHeaders(trimmed.headers), rows: trimmed.rows, delimiter };
}

// ---------------------------------------------------------------------------
// Markdown tables
// ---------------------------------------------------------------------------

type MarkdownLine = { text: string; start: number; end: number };

function splitLines(markdown: string): MarkdownLine[] {
	const lines: MarkdownLine[] = [];
	let position = 0;
	while (position <= markdown.length) {
		const newline = markdown.indexOf('\n', position);
		const lineEnd = newline === -1 ? markdown.length : newline;
		let contentEnd = lineEnd;
		if (contentEnd > position && markdown[contentEnd - 1] === '\r') contentEnd -= 1;
		lines.push({
			text: markdown.slice(position, contentEnd),
			start: position,
			end: contentEnd
		});
		if (newline === -1) break;
		position = newline + 1;
	}
	return lines;
}

/** Cells of one GFM table line: outer pipes dropped, `\|` kept as a literal pipe. */
function splitTableRow(line: string): string[] {
	let text = line.trim();
	if (text.startsWith('|')) text = text.slice(1);
	if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
	const cells: string[] = [];
	let current = '';
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!;
		if (char === '\\' && text[index + 1] === '|') {
			current += '|';
			index += 1;
			continue;
		}
		if (char === '|') {
			cells.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	cells.push(current);
	return cells;
}

function cleanMarkdownCell(cell: string): string {
	return cell.replace(/<br\s*\/?>/gi, '\n').trim();
}

const SEPARATOR_CELL = /^\s*:?-+:?\s*$/;

function isSeparatorLine(line: string): boolean {
	if (!line.includes('-')) return false;
	const cells = splitTableRow(line);
	return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

function fenceOf(line: string): { char: string; length: number } | null {
	const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
	return match ? { char: match[1]![0]!, length: match[1]!.length } : null;
}

/**
 * Every GFM table in a markdown document, skipping fenced code. `start`/`end`
 * are character offsets of the header line start and the last row's end
 * (exclusive, before its newline), so `markdown.slice(start, end)` is the table.
 */
export function findMarkdownTables(
	markdown: string
): Array<{ start: number; end: number; headers: string[]; rows: string[][] }> {
	const text = typeof markdown === 'string' ? markdown : '';
	const lines = splitLines(text);
	const tables: Array<{ start: number; end: number; headers: string[]; rows: string[][] }> = [];
	let fence: { char: string; length: number } | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index]!;
		const lineFence = fenceOf(line.text);
		if (lineFence) {
			if (!fence) fence = lineFence;
			else if (lineFence.char === fence.char && lineFence.length >= fence.length)
				fence = null;
			continue;
		}
		if (fence) continue;
		const next = lines[index + 1];
		if (!next || !line.text.includes('|') || /^\s{4,}/.test(line.text)) continue;
		if (!isSeparatorLine(next.text)) continue;
		const headerCells = splitTableRow(line.text);
		if (headerCells.length !== splitTableRow(next.text).length) continue;

		const rows: string[][] = [];
		let cursor = index + 2;
		while (cursor < lines.length) {
			const rowLine = lines[cursor]!;
			if (!rowLine.text.trim() || !rowLine.text.includes('|') || fenceOf(rowLine.text)) break;
			rows.push(
				padRow(splitTableRow(rowLine.text).map(cleanMarkdownCell), headerCells.length)
			);
			cursor += 1;
		}
		const lastLine = lines[cursor - 1]!;
		tables.push({
			start: line.start,
			end: lastLine.end,
			headers: dedupeHeaders(headerCells.map(cleanMarkdownCell)),
			rows
		});
		index = cursor - 1;
	}
	return tables;
}

/** The first GFM table in `markdown`, or null. */
export function parseMarkdownTable(
	markdown: string
): { headers: string[]; rows: string[][] } | null {
	const first = findMarkdownTables(markdown)[0];
	return first ? { headers: first.headers, rows: first.rows } : null;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

const SELECT_MAX_DISTINCT = 12;
const SELECT_MIN_ROWS = 8;
const SELECT_MAX_VALUE_CHARS = 40;
const LONG_TEXT_CHARS = 120;

function inferColumn(name: string, values: string[]): TableColumnInput {
	if (values.length === 0) return { name, type: 'text' };

	if (values.every((value) => parseBooleanText(value) !== null)) {
		const allNumeric = values.every((value) => value === '0' || value === '1');
		if (!allNumeric) return { name, type: 'checkbox' };
	}

	const numbers = values.map((value) => parseNumberText(value));
	// "02134" (zip codes, ids) must stay text or the leading zero is lost.
	const hasLeadingZeroIds = values.some((value) => /^0\d/.test(value));
	if (!hasLeadingZeroIds && numbers.every((parsed) => parsed !== null)) {
		const parsed = numbers as NonNullable<(typeof numbers)[number]>[];
		const currency = parsed.find((entry) => entry.currency)?.currency;
		let format: TableNumberFormat | undefined;
		if (currency) format = 'currency';
		else if (parsed.every((entry) => entry.percent)) format = 'percent';
		else if (parsed.every((entry) => entry.hours)) format = 'hours';
		return {
			name,
			type: 'number',
			...(format ? { options: { format, ...(currency ? { currency } : {}) } } : {})
		};
	}

	if (values.every((value) => parseDateText(value) !== null)) return { name, type: 'date' };
	if (values.every((value) => normalizeEmailText(value) !== null)) return { name, type: 'email' };
	if (
		values.every(
			(value) =>
				normalizeUrlText(value) !== null && /^(https?:\/\/|www\.)/i.test(value.trim())
		)
	) {
		return { name, type: 'url' };
	}

	if (values.some((value) => value.length > LONG_TEXT_CHARS || value.includes('\n'))) {
		return { name, type: 'long_text' };
	}

	const distinct: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		distinct.push(value);
	}
	if (
		values.length >= SELECT_MIN_ROWS &&
		distinct.length <= SELECT_MAX_DISTINCT &&
		distinct.length < values.length &&
		distinct.every((value) => value.length <= SELECT_MAX_VALUE_CHARS)
	) {
		return { name, type: 'select', options: { choices: distinct.map((value) => ({ value })) } };
	}
	return { name, type: 'text' };
}

/**
 * Column types from cell values (never from header names): checkbox marks,
 * numbers (currency/percent/hours formats), dates, emails, URLs, long text,
 * and select when ≤12 distinct values repeat over ≥8 rows.
 */
export function inferColumns(headers: string[], rows: string[][]): TableColumnInput[] {
	const names = dedupeHeaders(Array.isArray(headers) ? headers : []);
	return names.map((name, index) => {
		const values = (Array.isArray(rows) ? rows : [])
			.map((row) => (Array.isArray(row) ? row[index] : undefined))
			.filter((value): value is string => typeof value === 'string')
			.map((value) => value.trim())
			.filter((value) => value !== '');
		return inferColumn(name, values);
	});
}

function pushCapped(errors: string[], message: string, state: { dropped: number }): void {
	if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
	else state.dropped += 1;
}

/**
 * Spreadsheet rows → insert ops for `schema`. `headerOrder[i]` names the
 * column (name or id) of field i. Blank rows are skipped; unreadable cells are
 * left out and reported in `errors` (capped at 50 lines).
 */
export function importRowsToOps(
	schema: TableSchema,
	rows: string[][],
	headerOrder: string[]
): { ops: TableRowOp[]; errors: string[] } {
	const errors: string[] = [];
	const overflow = { dropped: 0 };
	const order = Array.isArray(headerOrder) ? headerOrder : [];
	const mapping = order.map((header) =>
		typeof header === 'string' ? resolveColumn(schema, header) : null
	);
	order.forEach((header, index) => {
		if (!mapping[index] && typeof header === 'string' && header.trim()) {
			pushCapped(
				errors,
				`Column "${header}" is not in this table; its values were skipped.`,
				overflow
			);
		}
	});

	const ops: TableRowOp[] = [];
	(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
		if (!Array.isArray(row)) return;
		const cells: Record<string, TableCellValue> = {};
		mapping.forEach((column, fieldIndex) => {
			if (!column) return;
			const raw = row[fieldIndex];
			if (raw === undefined || raw === null || String(raw).trim() === '') return;
			const result = coerceCellValue(column, raw);
			if (result.error) {
				pushCapped(
					errors,
					`Row ${rowIndex + 1}, ${column.name}: ${result.error}`,
					overflow
				);
			}
			if (result.value !== null) cells[column.id] = result.value;
		});
		if (Object.keys(cells).length > 0) ops.push({ op: 'insert', cells });
	});

	if (schema.row_count + ops.length > TABLE_LIMITS.maxRows) {
		pushCapped(
			errors,
			`A table can hold at most ${TABLE_LIMITS.maxRows.toLocaleString('en-US')} rows; this import would make ${(schema.row_count + ops.length).toLocaleString('en-US')}.`,
			overflow
		);
	}
	if (overflow.dropped > 0) errors.push(`…and ${overflow.dropped} more problems.`);
	return { ops, errors };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Spreadsheet formula injection (OWASP): text starting with = + - @ tab or CR. */
function neutralizeFormula(text: string): string {
	return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvField(text: string): string {
	return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvCellText(value: TableCellValue | undefined): string {
	if (value === null || value === undefined) return '';
	// Typed numbers are data, not text, and stay unprefixed ("-5" must stay -5).
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	if (Array.isArray(value)) return neutralizeFormula(value.map(String).join(', '));
	if (typeof value === 'object') {
		const link = value as TableLinkValue;
		return neutralizeFormula(link.label?.trim() ? link.label : `${link.kind}:${link.id}`);
	}
	return neutralizeFormula(String(value));
}

/**
 * RFC 4180 CSV (CRLF) of every column in schema order, numbers unformatted,
 * checkboxes TRUE/FALSE. Text that would run as a spreadsheet formula is
 * prefixed with an apostrophe. No BOM (the download endpoint may add one).
 */
export function tableToCsv(schema: TableSchema, rows: TableRow[]): string {
	const columns = schema.columns;
	const lines = [columns.map((column) => csvField(neutralizeFormula(column.name))).join(',')];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.deleted_at) continue;
		lines.push(
			columns.map((column) => csvField(csvCellText(row.cells?.[column.id]))).join(',')
		);
	}
	return lines.join('\r\n');
}
