// packages/shared-agent-ops/src/tables/table-query.ts
// In-memory query engine for BuildOS Tables: the one implementation behind
// agent reads (read_table_rows), saved views, and the grid footer.
//
// Pure and browser-safe. Filters arrive as structured {column, op, value}
// objects — never parsed out of prose (AGENTS.md). Unknown columns or bad
// filter values become warnings, not throws, so a model can correct itself.
import {
	cellToText,
	isEmptyCellValue,
	isRecord,
	parseDateText,
	parseNumberText,
	resolveColumn,
	roundNumber,
	parseBooleanText
} from './table-schema';
import {
	TABLE_AGGREGATE_FNS,
	TABLE_FILTER_OPS,
	parseRowHandle,
	type LoadedTable,
	type TableAggregate,
	type TableAggregateValue,
	type TableCellValue,
	type TableColumn,
	type TableFilterOp,
	type TableLinkValue,
	type TableQuery,
	type TableQueryGroup,
	type TableQueryResult,
	type TableRow,
	type TableSchema
} from './table-types';

type ColumnRef = TableColumn | 'row';

type Comparable =
	| { kind: 'number'; value: number }
	| { kind: 'date'; value: string }
	| { kind: 'boolean'; value: boolean }
	| { kind: 'text'; value: string };

type PreparedFilter = {
	column: ColumnRef;
	op: TableFilterOp;
	/** Comparable filter values; empty for is_empty / is_not_empty. */
	values: Comparable[];
	/** Raw lowercase text for contains / not_contains. */
	needle: string;
	/** The filter value could not be read for this column: it matches no rows. */
	never: boolean;
};

function columnLabel(column: ColumnRef): string {
	return column === 'row' ? 'row' : column.name;
}

function resolveColumnRef(schema: TableSchema, ref: unknown): ColumnRef | null {
	if (typeof ref !== 'string') return null;
	const column = resolveColumn(schema, ref);
	if (column) return column;
	return ref.trim().toLowerCase() === 'row' ? 'row' : null;
}

function rawCell(row: TableRow, column: ColumnRef): TableCellValue | number {
	if (column === 'row') return row.row_number;
	const value = row.cells?.[column.id];
	return value === undefined ? null : value;
}

function isEmptyForColumn(column: ColumnRef, value: unknown): boolean {
	if (column !== 'row' && column.type === 'checkbox') return value !== true;
	return isEmptyCellValue(value);
}

function linkText(value: TableLinkValue): string {
	return (value.label ?? '').toLowerCase();
}

/** A filter value in the column's comparable form, or null when unreadable. */
function toComparable(column: ColumnRef, raw: unknown): Comparable | null {
	if (column === 'row') {
		const parsed =
			typeof raw === 'number' || typeof raw === 'string' ? parseRowHandle(raw) : null;
		return parsed === null ? null : { kind: 'number', value: parsed };
	}
	switch (column.type) {
		case 'number': {
			if (typeof raw === 'number' && Number.isFinite(raw))
				return { kind: 'number', value: raw };
			if (typeof raw === 'string') {
				const parsed = parseNumberText(raw);
				return parsed ? { kind: 'number', value: parsed.value } : null;
			}
			return null;
		}
		case 'date': {
			if (typeof raw !== 'string') return null;
			const parsed = parseDateText(raw);
			return parsed ? { kind: 'date', value: parsed } : null;
		}
		case 'checkbox': {
			if (typeof raw === 'boolean') return { kind: 'boolean', value: raw };
			if (typeof raw === 'number' && (raw === 0 || raw === 1)) {
				return { kind: 'boolean', value: raw === 1 };
			}
			if (typeof raw === 'string') {
				const parsed = parseBooleanText(raw);
				return parsed === null ? null : { kind: 'boolean', value: parsed };
			}
			return null;
		}
		default: {
			if (raw === null || raw === undefined) return null;
			if (isRecord(raw) && typeof raw.id === 'string') {
				return { kind: 'text', value: String(raw.id).toLowerCase() };
			}
			const text = typeof raw === 'string' ? raw : String(raw);
			return { kind: 'text', value: text.trim().toLowerCase() };
		}
	}
}

/** Comparable form of a stored cell (for sorting and range filters). */
function cellComparable(column: ColumnRef, value: unknown): Comparable | null {
	if (column === 'row') return typeof value === 'number' ? { kind: 'number', value } : null;
	if (isEmptyForColumn(column, value) && column.type !== 'checkbox') return null;
	if (typeof value === 'number') return { kind: 'number', value };
	if (typeof value === 'boolean') return { kind: 'boolean', value };
	if (column.type === 'date' && typeof value === 'string') return { kind: 'date', value };
	if (isRecord(value))
		return { kind: 'text', value: linkText(value as unknown as TableLinkValue) };
	if (Array.isArray(value)) return { kind: 'text', value: value.join(', ').toLowerCase() };
	if (typeof value === 'string') return { kind: 'text', value: value.trim().toLowerCase() };
	return null;
}

function cellMatchesValue(column: ColumnRef, value: unknown, target: Comparable): boolean {
	if (column === 'row') return typeof value === 'number' && value === target.value;
	switch (target.kind) {
		case 'number':
			return typeof value === 'number' && Math.abs(value - target.value) < 1e-9;
		case 'date': {
			if (typeof value !== 'string') return false;
			return target.value.length === 10
				? value.slice(0, 10) === target.value
				: value === target.value;
		}
		case 'boolean':
			return (value === true) === target.value;
		case 'text': {
			if (Array.isArray(value)) {
				return value.some((entry) => String(entry).trim().toLowerCase() === target.value);
			}
			if (isRecord(value)) {
				const link = value as unknown as TableLinkValue;
				return link.id.toLowerCase() === target.value || linkText(link) === target.value;
			}
			if (typeof value === 'string') return value.trim().toLowerCase() === target.value;
			if (typeof value === 'number' || typeof value === 'boolean') {
				return String(value).toLowerCase() === target.value;
			}
			return false;
		}
	}
}

function compareComparable(left: Comparable, right: Comparable): number {
	if (left.kind === 'number' && right.kind === 'number') return left.value - right.value;
	if (left.kind === 'boolean' && right.kind === 'boolean') {
		return Number(left.value) - Number(right.value);
	}
	if (left.kind === 'date' && right.kind === 'date') {
		const width = Math.min(left.value.length, right.value.length) === 10 ? 10 : undefined;
		const a = width ? left.value.slice(0, width) : left.value;
		const b = width ? right.value.slice(0, width) : right.value;
		return a < b ? -1 : a > b ? 1 : 0;
	}
	if (left.kind === 'number' && right.kind !== 'number') return -1;
	if (right.kind === 'number' && left.kind !== 'number') return 1;
	return String(left.value).localeCompare(String(right.value), 'en', {
		numeric: true,
		sensitivity: 'base'
	});
}

function displayText(column: ColumnRef, row: TableRow): string {
	if (column === 'row') return `r${row.row_number}`;
	return cellToText(column, row.cells?.[column.id] ?? null);
}

function prepareFilters(
	schema: TableSchema,
	query: TableQuery,
	warnings: string[]
): PreparedFilter[] {
	if (!Array.isArray(query.filters)) return [];
	const prepared: PreparedFilter[] = [];
	for (const filter of query.filters) {
		if (!isRecord(filter)) {
			warnings.push('A filter that was not an object was ignored.');
			continue;
		}
		const column = resolveColumnRef(schema, filter.column);
		if (!column) {
			warnings.push(`Unknown column "${String(filter.column)}" in filters was ignored.`);
			continue;
		}
		const op = filter.op as TableFilterOp;
		if (!(TABLE_FILTER_OPS as readonly string[]).includes(String(op))) {
			warnings.push(
				`Unknown filter op "${String(filter.op)}" on "${columnLabel(column)}" was ignored. Ops: ${TABLE_FILTER_OPS.join(', ')}.`
			);
			continue;
		}
		const entry: PreparedFilter = { column, op, values: [], needle: '', never: false };
		if (op === 'is_empty' || op === 'is_not_empty') {
			prepared.push(entry);
			continue;
		}
		if (op === 'contains' || op === 'not_contains') {
			const raw = Array.isArray(filter.value) ? filter.value[0] : filter.value;
			if (raw === undefined || raw === null || String(raw).trim() === '') {
				warnings.push(
					`Filter ${op} on "${columnLabel(column)}" needs a value; it was ignored.`
				);
				continue;
			}
			entry.needle = String(isRecord(raw) ? (raw.label ?? raw.id ?? '') : raw)
				.trim()
				.toLowerCase();
			prepared.push(entry);
			continue;
		}
		const rawValues = Array.isArray(filter.value)
			? filter.value
			: filter.value === undefined
				? []
				: [filter.value];
		if (rawValues.length === 0) {
			warnings.push(
				`Filter ${op} on "${columnLabel(column)}" needs a value; it was ignored.`
			);
			continue;
		}
		const multiValue = op === 'in' || op === 'not_in';
		for (const raw of multiValue ? rawValues : rawValues.slice(0, 1)) {
			const comparable = toComparable(column, raw);
			if (comparable) entry.values.push(comparable);
		}
		if (entry.values.length === 0) {
			entry.never = true;
			const kind =
				column === 'row'
					? 'a row handle like r12'
					: column.type === 'number'
						? 'a number'
						: column.type === 'date'
							? 'a date'
							: column.type === 'checkbox'
								? 'true or false'
								: 'a value';
			warnings.push(
				`Filter on "${columnLabel(column)}": ${JSON.stringify(filter.value)} is not ${kind}, so it matches no rows.`
			);
		}
		prepared.push(entry);
	}
	return prepared;
}

function rowMatchesFilter(row: TableRow, filter: PreparedFilter): boolean {
	const value = rawCell(row, filter.column);
	switch (filter.op) {
		case 'is_empty':
			return isEmptyForColumn(filter.column, value);
		case 'is_not_empty':
			return !isEmptyForColumn(filter.column, value);
		case 'contains':
			return displayText(filter.column, row).toLowerCase().includes(filter.needle);
		case 'not_contains':
			return !displayText(filter.column, row).toLowerCase().includes(filter.needle);
	}
	if (filter.never) return false;
	switch (filter.op) {
		case 'eq':
		case 'in':
			return filter.values.some((target) => cellMatchesValue(filter.column, value, target));
		case 'neq':
		case 'not_in':
			return !filter.values.some((target) => cellMatchesValue(filter.column, value, target));
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte': {
			const cell = cellComparable(filter.column, value);
			const target = filter.values[0];
			if (!cell || !target || cell.kind !== target.kind) return false;
			const compared = compareComparable(cell, target);
			if (filter.op === 'gt') return compared > 0;
			if (filter.op === 'gte') return compared >= 0;
			if (filter.op === 'lt') return compared < 0;
			return compared <= 0;
		}
		default:
			return true;
	}
}

function sortValue(column: ColumnRef, row: TableRow): Comparable | null {
	const value = rawCell(row, column);
	if (column !== 'row' && (column.type === 'select' || column.type === 'multi_select')) {
		const first = Array.isArray(value) ? value[0] : value;
		if (typeof first !== 'string' || !first.trim()) return null;
		const choices = column.options?.choices ?? [];
		const index = choices.findIndex(
			(choice) => choice.value.toLowerCase() === first.trim().toLowerCase()
		);
		// Known options sort in their defined order, unknown ones after them.
		return index >= 0
			? { kind: 'number', value: index }
			: { kind: 'text', value: first.trim().toLowerCase() };
	}
	if (column !== 'row' && column.type === 'checkbox') {
		return { kind: 'boolean', value: value === true };
	}
	return cellComparable(column, value);
}

/** Visible columns plus the requested ones (names or ids); unknown names warn. */
function selectColumns(schema: TableSchema, requested: unknown, warnings: string[]): TableColumn[] {
	const visible = schema.columns.filter((column) => !column.hidden);
	if (!Array.isArray(requested) || requested.length === 0) return visible;
	const picked: TableColumn[] = [];
	for (const ref of requested) {
		if (typeof ref === 'string' && ref.trim().toLowerCase() === 'row') continue;
		const column = typeof ref === 'string' ? resolveColumn(schema, ref) : null;
		if (!column) {
			warnings.push(`Unknown column "${String(ref)}" in columns was ignored.`);
			continue;
		}
		if (!picked.includes(column)) picked.push(column);
	}
	if (picked.length === 0) {
		warnings.push('None of the requested columns exist; showing all visible columns.');
		return visible;
	}
	return picked;
}

function aggregateKey(fn: string, column: TableColumn | null, rawRef?: string): string {
	if (!column) return rawRef ? `${fn}:${rawRef}` : fn;
	return `${fn}:${column.name}`;
}

function distinctKey(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim().toLowerCase());
	if (isRecord(value)) return [String((value as unknown as TableLinkValue).id)];
	if (typeof value === 'string') return [value.trim().toLowerCase()];
	return [JSON.stringify(value)];
}

function computeAggregates(
	schema: TableSchema,
	rows: TableRow[],
	aggregates: TableAggregate[],
	warnings: string[] | null
): Record<string, TableAggregateValue> {
	const out: Record<string, TableAggregateValue> = {};
	for (const aggregate of aggregates) {
		if (!isRecord(aggregate)) continue;
		const fn = aggregate.fn;
		if (!(TABLE_AGGREGATE_FNS as readonly string[]).includes(String(fn))) {
			warnings?.push(
				`Unknown aggregate "${String(fn)}" was ignored. Aggregates: ${TABLE_AGGREGATE_FNS.join(', ')}.`
			);
			continue;
		}
		if (fn === 'count' && (aggregate.column === undefined || aggregate.column === '')) {
			out.count = rows.length;
			continue;
		}
		const column =
			typeof aggregate.column === 'string' ? resolveColumn(schema, aggregate.column) : null;
		if (!column) {
			warnings?.push(
				aggregate.column === undefined
					? `Aggregate ${fn} needs a column; it was ignored.`
					: `Unknown column "${String(aggregate.column)}" in aggregates was ignored.`
			);
			if (aggregate.column !== undefined)
				out[aggregateKey(fn, null, String(aggregate.column))] = null;
			continue;
		}
		const key = aggregateKey(fn, column);
		const values = rows.map((row) => row.cells?.[column.id]);
		switch (fn) {
			case 'count':
				out[key] = rows.length;
				break;
			case 'count_empty':
				out[key] = values.filter((value) => isEmptyForColumn(column, value)).length;
				break;
			case 'count_filled':
				out[key] = values.filter((value) => !isEmptyForColumn(column, value)).length;
				break;
			case 'sum':
			case 'avg': {
				const numbers = values.filter(
					(value): value is number => typeof value === 'number' && Number.isFinite(value)
				);
				if (column.type !== 'number' && numbers.length === 0) {
					warnings?.push(
						`${fn} needs a number column; "${column.name}" is ${column.type}.`
					);
					out[key] = null;
					break;
				}
				const total = numbers.reduce((sum, value) => sum + value, 0);
				out[key] =
					fn === 'sum'
						? roundNumber(total)
						: numbers.length > 0
							? roundNumber(total / numbers.length)
							: null;
				break;
			}
			case 'min':
			case 'max': {
				const numbers = values.filter(
					(value): value is number => typeof value === 'number' && Number.isFinite(value)
				);
				if (numbers.length > 0) {
					out[key] = fn === 'min' ? Math.min(...numbers) : Math.max(...numbers);
					break;
				}
				const texts = rows
					.filter((row) => !isEmptyForColumn(column, row.cells?.[column.id]))
					.map((row) =>
						column.type === 'date'
							? String(row.cells?.[column.id] ?? '')
							: cellToText(column, row.cells?.[column.id] ?? null)
					)
					.filter(Boolean);
				if (texts.length === 0) {
					out[key] = null;
					break;
				}
				const sorted = [...texts].sort((a, b) =>
					column.type === 'date'
						? a < b
							? -1
							: a > b
								? 1
								: 0
						: a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
				);
				out[key] = fn === 'min' ? sorted[0]! : sorted[sorted.length - 1]!;
				break;
			}
			case 'distinct': {
				const seen = new Set<string>();
				for (const value of values) {
					if (isEmptyForColumn(column, value)) continue;
					for (const entry of distinctKey(value)) seen.add(entry);
				}
				out[key] = seen.size;
				break;
			}
		}
	}
	return out;
}

type GroupBucket = { key: TableCellValue; label: string; rows: TableRow[]; order: number };

function groupRows(column: TableColumn, rows: TableRow[]): GroupBucket[] {
	const buckets = new Map<string, GroupBucket>();
	const add = (id: string, key: TableCellValue, label: string, row: TableRow) => {
		let bucket = buckets.get(id);
		if (!bucket) {
			bucket = { key, label, rows: [], order: buckets.size };
			buckets.set(id, bucket);
		}
		bucket.rows.push(row);
	};
	for (const row of rows) {
		const value = row.cells?.[column.id];
		if (column.type === 'checkbox') {
			const checked = value === true;
			add(checked ? 'true' : 'false', checked, checked ? 'Yes' : 'No', row);
			continue;
		}
		if (isEmptyCellValue(value)) {
			add('\u0000empty', null, '(empty)', row);
			continue;
		}
		if (Array.isArray(value)) {
			for (const entry of value) {
				const text = String(entry);
				add(`t:${text.trim().toLowerCase()}`, text, text, row);
			}
			continue;
		}
		if (isRecord(value)) {
			const link = value as unknown as TableLinkValue;
			add(`l:${link.id}`, link, cellToText(column, link), row);
			continue;
		}
		if (typeof value === 'number') {
			add(`n:${value}`, value, cellToText(column, value), row);
			continue;
		}
		const text = String(value);
		add(`t:${text.trim().toLowerCase()}`, text, text, row);
	}

	const list = [...buckets.values()];
	const choiceIndex = (bucket: GroupBucket): number => {
		const choices = column.options?.choices ?? [];
		const index = choices.findIndex(
			(choice) => choice.value.toLowerCase() === bucket.label.toLowerCase()
		);
		return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
	};
	list.sort((a, b) => {
		if (a.key === null && b.key !== null) return 1;
		if (b.key === null && a.key !== null) return -1;
		if (column.type === 'select' || column.type === 'multi_select') {
			const diff = choiceIndex(a) - choiceIndex(b);
			if (diff !== 0) return diff;
		}
		if (column.type === 'checkbox') return a.key === true ? -1 : b.key === true ? 1 : 0;
		if (column.type === 'date' || column.type === 'number') {
			const left = cellComparable(column, a.key);
			const right = cellComparable(column, b.key);
			if (left && right) return compareComparable(left, right);
		}
		if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
		return a.label.localeCompare(b.label, 'en', { numeric: true, sensitivity: 'base' });
	});
	return list;
}

/**
 * Runs a structured query over a loaded table, in memory. Numbers compare
 * numerically, dates as ISO strings, text case-insensitively. Aggregates and
 * groups cover every matching row (not just the page). Empty values sort last
 * in either direction.
 */
export function queryTable(table: LoadedTable, query: TableQuery): TableQueryResult {
	const schema = table.schema;
	const q: TableQuery = isRecord(query) ? query : {};
	const warnings: string[] = [];
	const allRows = (Array.isArray(table.rows) ? table.rows : []).filter((row) => !row.deleted_at);

	const filters = prepareFilters(schema, q, warnings);
	const matchAny = q.match === 'any';
	let matched =
		filters.length === 0
			? allRows
			: allRows.filter((row) =>
					matchAny
						? filters.some((filter) => rowMatchesFilter(row, filter))
						: filters.every((filter) => rowMatchesFilter(row, filter))
				);

	const search = typeof q.search === 'string' ? q.search.trim().toLowerCase() : '';
	if (search) {
		const searchable = schema.columns.filter((column) => !column.hidden);
		matched = matched.filter(
			(row) =>
				`r${row.row_number}` === search ||
				searchable.some((column) =>
					cellToText(column, row.cells?.[column.id] ?? null)
						.toLowerCase()
						.includes(search)
				)
		);
	}

	const sorts: Array<{ column: ColumnRef; direction: 'asc' | 'desc' }> = [];
	if (Array.isArray(q.sort)) {
		for (const sort of q.sort) {
			if (!isRecord(sort)) continue;
			const column = resolveColumnRef(schema, sort.column);
			if (!column) {
				warnings.push(`Unknown column "${String(sort.column)}" in sort was ignored.`);
				continue;
			}
			sorts.push({ column, direction: sort.direction === 'desc' ? 'desc' : 'asc' });
		}
	}
	if (sorts.length > 0) {
		const indexed = matched.map((row, index) => ({ row, index }));
		indexed.sort((left, right) => {
			for (const sort of sorts) {
				const a = sortValue(sort.column, left.row);
				const b = sortValue(sort.column, right.row);
				if (!a && !b) continue;
				if (!a) return 1;
				if (!b) return -1;
				const compared = compareComparable(a, b);
				if (compared !== 0) return sort.direction === 'desc' ? -compared : compared;
			}
			return left.index - right.index;
		});
		matched = indexed.map((entry) => entry.row);
	}

	const columns = selectColumns(schema, q.columns, warnings);
	const offset =
		typeof q.offset === 'number' && Number.isFinite(q.offset)
			? Math.max(0, Math.floor(q.offset))
			: 0;
	const limit =
		typeof q.limit === 'number' && Number.isFinite(q.limit)
			? Math.max(0, Math.floor(q.limit))
			: Number.POSITIVE_INFINITY;
	const page = matched.slice(offset, offset + limit);
	const end = offset + page.length;

	const result: TableQueryResult = {
		columns,
		rows: page,
		total_rows: allRows.length,
		matched_rows: matched.length,
		offset,
		next_offset: end < matched.length ? end : null
	};

	const aggregates = Array.isArray(q.aggregates) ? q.aggregates : [];
	if (q.group_by !== undefined && q.group_by !== null && q.group_by !== '') {
		const groupColumn =
			typeof q.group_by === 'string' ? resolveColumn(schema, q.group_by) : null;
		if (!groupColumn) {
			warnings.push(`Unknown column "${String(q.group_by)}" in group_by was ignored.`);
		} else {
			// Validate aggregates once so groups do not repeat the same warning.
			computeAggregates(schema, [], aggregates, warnings);
			result.groups = groupRows(groupColumn, matched).map(
				(bucket): TableQueryGroup => ({
					key: bucket.key,
					label: bucket.label,
					count: bucket.rows.length,
					aggregates: computeAggregates(schema, bucket.rows, aggregates, null)
				})
			);
		}
	}
	if (aggregates.length > 0) {
		result.aggregates = computeAggregates(
			schema,
			matched,
			aggregates,
			result.groups ? null : warnings
		);
	}
	if (warnings.length > 0) result.warnings = Array.from(new Set(warnings));
	return result;
}

/**
 * The grid footer, keyed by column id: number columns → sum; checkbox →
 * checked count; everything else → filled count.
 */
export function computeColumnTotals(
	schema: TableSchema,
	rows: TableRow[]
): Record<string, TableAggregateValue> {
	const live = (Array.isArray(rows) ? rows : []).filter((row) => !row.deleted_at);
	const totals: Record<string, TableAggregateValue> = {};
	for (const column of schema.columns) {
		if (column.type === 'number') {
			let sum = 0;
			let any = false;
			for (const row of live) {
				const value = row.cells?.[column.id];
				if (typeof value === 'number' && Number.isFinite(value)) {
					sum += value;
					any = true;
				}
			}
			totals[column.id] = any ? roundNumber(sum) : null;
			continue;
		}
		totals[column.id] = live.filter(
			(row) => !isEmptyForColumn(column, row.cells?.[column.id])
		).length;
	}
	return totals;
}
