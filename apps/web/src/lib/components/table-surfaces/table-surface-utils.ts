// apps/web/src/lib/components/table-surfaces/table-surface-utils.ts
//
// Pure helpers the document/tree/chat surfaces share for Tables
// (docs/specs/tables/CONTRACT.md, "Surfaces"). Browser-safe, no Svelte.

/** Fence language for a table embedded in a document body. */
export const TABLE_EMBED_LANGUAGE = 'buildos-table';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value.trim());
}

/** The markdown that embeds a table: a fenced `buildos-table` block holding its id. */
export function tableEmbedBlock(tableId: string): string {
	return `\`\`\`${TABLE_EMBED_LANGUAGE}\n${tableId}\n\`\`\``;
}

/** Same block padded with blank lines, for inserting at a cursor. */
export function tableEmbedInsertion(tableId: string): string {
	return `\n\n${tableEmbedBlock(tableId)}\n\n`;
}

/** Row count from a tree document's `props.table.row_count` (no rows loaded). */
export function tableRowCountOf(doc: { props?: unknown } | null | undefined): number | null {
	if (!doc?.props || typeof doc.props !== 'object') return null;
	const table = (doc.props as Record<string, unknown>).table;
	if (!table || typeof table !== 'object') return null;
	const count = Number((table as Record<string, unknown>).row_count);
	return Number.isFinite(count) ? count : null;
}

export function formatRowCount(count: number): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? 'row' : 'rows'}`;
}

export type GridData = { headers: string[]; rows: string[][] };

function cellText(cell: Element): string {
	return (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Read a rendered HTML table's cells (structured DOM, not text classification):
 * header cells from <thead> (or the first row), body rows from the rest.
 * Rows are padded/trimmed to the header width; fully empty rows are dropped.
 */
export function readRenderedTable(table: HTMLTableElement): GridData {
	const allRows = Array.from(table.rows);
	if (allRows.length === 0) return { headers: [], rows: [] };
	const headRow = table.tHead?.rows[0] ?? allRows[0]!;
	const headers = Array.from(headRow.cells).map(cellText);
	const width = headers.length;
	const rows: string[][] = [];
	for (const row of allRows) {
		if (row === headRow) continue;
		const cells = Array.from(row.cells).map(cellText).slice(0, width);
		while (cells.length < width) cells.push('');
		if (cells.some((cell) => cell !== '')) rows.push(cells);
	}
	return { headers, rows };
}

function csvCell(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV text for prefilling the new-table dialog. */
export function gridToCsv(data: GridData): string {
	return [data.headers, ...data.rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Header comparison key: case/punctuation/markdown-emphasis insensitive. */
export function headerKey(headers: string[]): string {
	return headers
		.map((header) =>
			header
				.toLowerCase()
				.replace(/[`*_~[\]()]/g, '')
				.replace(/\s+/g, ' ')
				.trim()
		)
		.join('|');
}

/**
 * Pick which parsed markdown table a rendered <table> came from. Prefer the
 * same ordinal; verify by header cells so a fence-wrapped table or a renderer
 * difference can never convert the wrong block. Returns -1 when unsure.
 */
export function matchMarkdownTable(
	candidates: Array<{ headers: string[] }>,
	renderedIndex: number,
	renderedHeaders: string[]
): number {
	const key = headerKey(renderedHeaders);
	const atIndex = candidates[renderedIndex];
	if (atIndex && headerKey(atIndex.headers) === key) return renderedIndex;
	const matches = candidates
		.map((candidate, index) => ({ index, key: headerKey(candidate.headers) }))
		.filter((candidate) => candidate.key === key);
	return matches.length === 1 ? matches[0]!.index : -1;
}

/** Replace `content[start, end)` (a markdown table) with an embed block on its own lines. */
export function replaceRangeWithEmbed(
	content: string,
	range: { start: number; end: number },
	tableId: string
): string {
	const before = content.slice(0, range.start);
	const after = content.slice(range.end);
	const lead = before === '' || before.endsWith('\n') ? '' : '\n';
	const trail = after === '' || after.startsWith('\n') ? '' : '\n';
	return `${before}${lead}${tableEmbedBlock(tableId)}${trail}${after}`;
}

/** A default title for a table lifted out of a document. */
export function liftedTableTitle(documentTitle: string, ordinal: number, total: number): string {
	const base = documentTitle.trim() || 'Table';
	return total > 1 ? `${base} · table ${ordinal + 1}` : `${base} · table`;
}
