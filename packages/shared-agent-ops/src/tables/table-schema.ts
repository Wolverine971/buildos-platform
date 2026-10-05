// packages/shared-agent-ops/src/tables/table-schema.ts
// Column schema helpers for BuildOS Tables (docs/specs/tables/CONTRACT.md):
// building and repairing `props.table`, resolving columns, coercing raw input
// into typed cell values, and applying column changes.
//
// Browser-safe: no Node or Supabase imports.
//
// Parsing note (AGENTS.md "never classify language with regex"): the regexes
// and token sets below parse STRUCTURED cell formats only — numbers, currency,
// dates, URLs, emails, checkbox marks. Column meaning always comes from the
// column's declared `type`, never from its name or from prose.
import { TableServiceError } from './table-errors';
import {
	TABLE_CHOICE_COLORS,
	TABLE_COLUMN_TYPES,
	TABLE_FILTER_OPS,
	TABLE_LIMITS,
	TABLE_LINK_KINDS,
	type TableCellMeta,
	type TableCellValue,
	type TableColumn,
	type TableColumnAiConfig,
	type TableColumnChange,
	type TableColumnInput,
	type TableColumnOptions,
	type TableColumnType,
	type TableFilter,
	type TableLinkKind,
	type TableLinkValue,
	type TableNumberFormat,
	type TableRow,
	type TableRowOp,
	type TableSchema,
	type TableSelectChoice,
	type TableSort,
	type TableSourceKind,
	type TableView
} from './table-types';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const MAX_COLUMN_NAME_CHARS = 120;
const MAX_COLUMN_DESCRIPTION_CHARS = 1_000;
const MAX_AI_PROMPT_CHARS = 2_000;
const MAX_CHOICE_CHARS = 200;
const MAX_CHOICES = 200;
const NUMBER_FORMATS: readonly TableNumberFormat[] = ['number', 'currency', 'percent', 'hours'];
const SOURCE_KINDS: readonly TableSourceKind[] = [
	'blank',
	'csv',
	'paste',
	'markdown',
	'chat',
	'agent'
];
const SELECT_TYPES = new Set<TableColumnType>(['select', 'multi_select']);

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Empty = absent, null, blank string, or empty list. */
export function isEmptyCellValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

/** Structural equality for cell values (strings, numbers, booleans, lists, link objects). */
export function cellValuesEqual(left: unknown, right: unknown): boolean {
	const a = left === undefined ? null : left;
	const b = right === undefined ? null : right;
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, index) => cellValuesEqual(item, b[index]));
	}
	if (isRecord(a) && isRecord(b)) {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const key of keys) {
			if (!cellValuesEqual(a[key], b[key])) return false;
		}
		return true;
	}
	return false;
}

function clip(value: string, max: number): string {
	return value.length > max ? value.slice(0, max) : value;
}

function cleanName(value: unknown): string {
	if (typeof value !== 'string') return '';
	return clip(value.replace(/\s+/g, ' ').trim(), MAX_COLUMN_NAME_CHARS);
}

function uniqueName(desired: string, takenLower: Set<string>): string {
	let candidate = desired;
	let suffix = 2;
	while (takenLower.has(candidate.toLowerCase())) {
		candidate = `${desired} (${suffix})`;
		suffix += 1;
	}
	return candidate;
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBase36(length: number): string {
	const cryptoLike = (
		globalThis as {
			crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
		}
	).crypto;
	const bytes = new Uint8Array(length);
	if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
		cryptoLike.getRandomValues(bytes);
	} else {
		for (let index = 0; index < length; index += 1) {
			bytes[index] = Math.floor(Math.random() * 256);
		}
	}
	let out = '';
	for (const byte of bytes) out += ID_ALPHABET[byte % 36];
	return out;
}

/** A new stable column id: 'c_' + 8 base36 chars, unique against `existingIds`. */
export function createColumnId(existingIds: Iterable<string>): string {
	const taken = new Set(existingIds);
	for (let attempt = 0; attempt < 64; attempt += 1) {
		const id = `c_${randomBase36(8)}`;
		if (!taken.has(id)) return id;
	}
	let counter = taken.size;
	while (taken.has(`c_${counter.toString(36).padStart(8, '0')}`)) counter += 1;
	return `c_${counter.toString(36).padStart(8, '0')}`;
}

function createViewId(existingIds: Iterable<string>): string {
	const taken = new Set(existingIds);
	let id = `v_${randomBase36(8)}`;
	while (taken.has(id)) id = `v_${randomBase36(8)}`;
	return id;
}

function nowIso(): string {
	return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Options / ai / views normalization
// ---------------------------------------------------------------------------

function normalizeChoices(raw: unknown): TableSelectChoice[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const choices: TableSelectChoice[] = [];
	for (const entry of raw) {
		const value =
			typeof entry === 'string'
				? entry
				: isRecord(entry) && typeof entry.value === 'string'
					? entry.value
					: typeof entry === 'number'
						? String(entry)
						: '';
		const cleaned = clip(value.trim(), MAX_CHOICE_CHARS);
		if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
		seen.add(cleaned.toLowerCase());
		const rawColor = isRecord(entry) ? entry.color : undefined;
		const color = (TABLE_CHOICE_COLORS as readonly string[]).includes(String(rawColor))
			? (rawColor as TableSelectChoice['color'])
			: TABLE_CHOICE_COLORS[choices.length % TABLE_CHOICE_COLORS.length];
		choices.push({ value: cleaned, color });
		if (choices.length >= MAX_CHOICES) break;
	}
	return choices;
}

function normalizeColumnOptions(
	type: TableColumnType,
	raw: unknown
): TableColumnOptions | undefined {
	const record = isRecord(raw) ? raw : {};
	const options: TableColumnOptions = {};
	if (SELECT_TYPES.has(type)) {
		options.choices = normalizeChoices(record.choices);
	}
	if (type === 'number') {
		if (NUMBER_FORMATS.includes(record.format as TableNumberFormat)) {
			options.format = record.format as TableNumberFormat;
		}
		if (typeof record.currency === 'string' && /^[A-Za-z]{3}$/.test(record.currency.trim())) {
			options.currency = record.currency.trim().toUpperCase();
		}
		if (
			typeof record.decimals === 'number' &&
			Number.isInteger(record.decimals) &&
			record.decimals >= 0 &&
			record.decimals <= 10
		) {
			options.decimals = record.decimals;
		}
	}
	if (type === 'link' && Array.isArray(record.link_kinds)) {
		const kinds = record.link_kinds.filter((kind): kind is TableLinkKind =>
			(TABLE_LINK_KINDS as readonly string[]).includes(String(kind))
		);
		if (kinds.length > 0) options.link_kinds = Array.from(new Set(kinds));
	}
	return Object.keys(options).length > 0 ? options : undefined;
}

function normalizeAiConfig(raw: unknown, stamp: boolean): TableColumnAiConfig | null {
	if (!isRecord(raw)) return null;
	const prompt =
		typeof raw.prompt === 'string' ? clip(raw.prompt.trim(), MAX_AI_PROMPT_CHARS) : '';
	if (!prompt) return null;
	const config: TableColumnAiConfig = { prompt, research: raw.research === true };
	if (stamp) config.updated_at = nowIso();
	else if (typeof raw.updated_at === 'string') config.updated_at = raw.updated_at;
	return config;
}

function normalizeFilters(raw: unknown): TableFilter[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const filters: TableFilter[] = [];
	for (const entry of raw) {
		if (!isRecord(entry) || typeof entry.column !== 'string') continue;
		if (!(TABLE_FILTER_OPS as readonly string[]).includes(String(entry.op))) continue;
		const filter: TableFilter = { column: entry.column, op: entry.op as TableFilter['op'] };
		if (entry.value !== undefined) filter.value = entry.value as TableFilter['value'];
		filters.push(filter);
	}
	return filters;
}

function normalizeSorts(raw: unknown): TableSort[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((entry): entry is Record<string, unknown> => isRecord(entry))
		.filter((entry) => typeof entry.column === 'string')
		.map((entry) => ({
			column: String(entry.column),
			direction: entry.direction === 'desc' ? ('desc' as const) : ('asc' as const)
		}));
}

function normalizeViews(raw: unknown): TableView[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const ids = new Set<string>();
	const views: TableView[] = [];
	for (const entry of raw) {
		if (!isRecord(entry)) continue;
		let id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
		if (!id || ids.has(id)) id = createViewId(ids);
		ids.add(id);
		const view: TableView = {
			id,
			name:
				typeof entry.name === 'string' && entry.name.trim()
					? clip(entry.name.trim(), MAX_COLUMN_NAME_CHARS)
					: `View ${views.length + 1}`,
			layout: entry.layout === 'board' ? 'board' : 'grid'
		};
		const filters = normalizeFilters(entry.filters);
		if (filters) view.filters = filters;
		if (entry.match === 'any' || entry.match === 'all') view.match = entry.match;
		const sort = normalizeSorts(entry.sort);
		if (sort) view.sort = sort;
		if (typeof entry.group_by === 'string' && entry.group_by.trim()) {
			view.group_by = entry.group_by.trim();
		}
		if (Array.isArray(entry.hidden_column_ids)) {
			view.hidden_column_ids = entry.hidden_column_ids.filter(
				(value): value is string => typeof value === 'string'
			);
		}
		views.push(view);
	}
	return views;
}

function normalizeSource(raw: unknown): TableSchema['source'] | undefined {
	if (!isRecord(raw) || !SOURCE_KINDS.includes(raw.kind as TableSourceKind)) return undefined;
	const source: NonNullable<TableSchema['source']> = { kind: raw.kind as TableSourceKind };
	if (typeof raw.filename === 'string' && raw.filename.trim()) {
		source.filename = clip(raw.filename.trim(), 255);
	}
	if (raw.origin_entity === null) source.origin_entity = null;
	else if (
		isRecord(raw.origin_entity) &&
		typeof raw.origin_entity.kind === 'string' &&
		typeof raw.origin_entity.id === 'string'
	) {
		source.origin_entity = { kind: raw.origin_entity.kind, id: raw.origin_entity.id };
	}
	source.created_at = typeof raw.created_at === 'string' ? raw.created_at : nowIso();
	return source;
}

function nonNegativeInt(value: unknown): number {
	const numeric = typeof value === 'string' ? Number(value) : value;
	return typeof numeric === 'number' && Number.isFinite(numeric) && numeric >= 0
		? Math.floor(numeric)
		: 0;
}

function isColumnType(value: unknown): value is TableColumnType {
	return (TABLE_COLUMN_TYPES as readonly string[]).includes(String(value));
}

// ---------------------------------------------------------------------------
// Schema build + repair
// ---------------------------------------------------------------------------

function columnFromInput(
	input: TableColumnInput,
	takenIds: Set<string>,
	takenNames: Set<string>,
	index: number
): TableColumn {
	const record: Record<string, unknown> = isRecord(input) ? (input as never) : {};
	const type = isColumnType(record.type) ? record.type : 'text';
	const name = uniqueName(cleanName(record.name) || `Column ${index + 1}`, takenNames);
	const id = createColumnId(takenIds);
	takenIds.add(id);
	takenNames.add(name.toLowerCase());
	const column: TableColumn = { id, name, type };
	if (typeof record.description === 'string' && record.description.trim()) {
		column.description = clip(record.description.trim(), MAX_COLUMN_DESCRIPTION_CHARS);
	}
	const options = normalizeColumnOptions(type, record.options);
	if (options) column.options = options;
	const ai = normalizeAiConfig(record.ai, true);
	if (ai) column.ai = ai;
	return column;
}

/**
 * Repairs whatever is stored at props.table into a valid TableSchema. Missing
 * ids are minted, duplicate names suffixed, unknown types become text. Never
 * throws; never drops a column that has an id (cells are keyed by it).
 */
export function normalizeTableSchema(raw: unknown): TableSchema {
	const record = isRecord(raw) ? raw : {};
	const ids = new Set<string>();
	const names = new Set<string>();
	const columns: TableColumn[] = [];
	const rawColumns = Array.isArray(record.columns) ? record.columns : [];

	rawColumns.forEach((entry, index) => {
		if (!isRecord(entry)) return;
		let id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
		if (!id || ids.has(id)) id = createColumnId(ids);
		ids.add(id);
		const type = isColumnType(entry.type) ? entry.type : 'text';
		const name = uniqueName(cleanName(entry.name) || `Column ${index + 1}`, names);
		names.add(name.toLowerCase());
		const column: TableColumn = { id, name, type };
		if (typeof entry.description === 'string' && entry.description.trim()) {
			column.description = clip(entry.description.trim(), MAX_COLUMN_DESCRIPTION_CHARS);
		}
		const options = normalizeColumnOptions(type, entry.options);
		if (options) column.options = options;
		const ai = normalizeAiConfig(entry.ai, false);
		if (ai) column.ai = ai;
		if (typeof entry.width === 'number' && Number.isFinite(entry.width) && entry.width > 0) {
			column.width = Math.round(entry.width);
		}
		if (entry.hidden === true) column.hidden = true;
		columns.push(column);
	});

	const schema: TableSchema = {
		format: 1,
		columns,
		revision: nonNegativeInt(record.revision),
		row_count: nonNegativeInt(record.row_count)
	};
	const views = normalizeViews(record.views);
	if (views && views.length > 0) schema.views = views;
	if (
		typeof record.primary_column_id === 'string' &&
		columns.some((column) => column.id === record.primary_column_id)
	) {
		schema.primary_column_id = record.primary_column_id;
	}
	const source = normalizeSource(record.source);
	if (source) schema.source = source;
	return schema;
}

/**
 * A fresh schema from column inputs. An empty list yields one "Name" text
 * column so a blank table is still usable. Throws LIMIT_EXCEEDED past
 * TABLE_LIMITS.maxColumns.
 */
export function buildTableSchema(
	columns: TableColumnInput[],
	opts: { source?: TableSchema['source'] } = {}
): TableSchema {
	const inputs = Array.isArray(columns) ? columns : [];
	if (inputs.length > TABLE_LIMITS.maxColumns) {
		throw new TableServiceError(
			'LIMIT_EXCEEDED',
			`A table can have at most ${TABLE_LIMITS.maxColumns} columns (got ${inputs.length}).`
		);
	}
	const ids = new Set<string>();
	const names = new Set<string>();
	const built = inputs.map((input, index) => columnFromInput(input, ids, names, index));
	if (built.length === 0)
		built.push(columnFromInput({ name: 'Name', type: 'text' }, ids, names, 0));
	const schema: TableSchema = {
		format: 1,
		columns: built,
		primary_column_id: built[0]!.id,
		revision: 0,
		row_count: 0
	};
	const source = normalizeSource(opts.source);
	if (source) schema.source = source;
	return schema;
}

/** Column by id, then by case-insensitive name. */
export function resolveColumn(schema: TableSchema, ref: string): TableColumn | null {
	if (typeof ref !== 'string') return null;
	const trimmed = ref.trim();
	if (!trimmed) return null;
	const byId = schema.columns.find((column) => column.id === trimmed);
	if (byId) return byId;
	const lower = trimmed.toLowerCase();
	return schema.columns.find((column) => column.name.toLowerCase() === lower) ?? null;
}

/** The row's title column: primary_column_id, else the first visible column. */
export function primaryColumn(schema: TableSchema): TableColumn | null {
	if (schema.primary_column_id) {
		const primary = schema.columns.find((column) => column.id === schema.primary_column_id);
		if (primary) return primary;
	}
	return schema.columns.find((column) => !column.hidden) ?? schema.columns[0] ?? null;
}

// ---------------------------------------------------------------------------
// Structured value parsers (exported for CSV inference and queries)
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
	$: 'USD',
	'€': 'EUR',
	'£': 'GBP',
	'¥': 'JPY',
	'₹': 'INR'
};
/** ISO 4217 codes accepted next to an amount ("USD 40", "40 EUR"). */
const CURRENCY_CODES = new Set([
	'USD',
	'EUR',
	'GBP',
	'JPY',
	'CAD',
	'AUD',
	'NZD',
	'CHF',
	'CNY',
	'INR',
	'MXN',
	'BRL',
	'SEK',
	'NOK',
	'DKK',
	'SGD',
	'HKD',
	'ZAR'
]);
const MAGNITUDE_SUFFIXES: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9, bn: 1e9 };
const HOURS_SUFFIXES = new Set(['h', 'hr', 'hrs', 'hour', 'hours']);

export interface ParsedNumberText {
	value: number;
	currency?: string;
	percent?: boolean;
	hours?: boolean;
}

/**
 * Number formats seen in spreadsheets: "150000", "150,000", "$150k", "1.5M",
 * "(1,200)", "-5", "12%", "€1.200,50", "2.5h", "USD 40". Returns null when the
 * text is not a single number.
 */
export function parseNumberText(raw: string): ParsedNumberText | null {
	if (typeof raw !== 'string') return null;
	let text = raw.trim().replace(/−/g, '-').replace(/ /g, ' ');
	if (!text) return null;
	let negative = false;
	let currency: string | undefined;
	let percent = false;
	let hours = false;

	if (text.startsWith('(') && text.endsWith(')')) {
		negative = true;
		text = text.slice(1, -1).trim();
	}
	const takeSign = () => {
		if (text.startsWith('-')) {
			negative = !negative;
			text = text.slice(1).trim();
		} else if (text.startsWith('+')) {
			text = text.slice(1).trim();
		}
	};
	takeSign();

	const codePrefix = /^([A-Z]{3})\s*(?=[\d.(+-])/.exec(text);
	if (codePrefix && CURRENCY_CODES.has(codePrefix[1]!)) {
		currency = codePrefix[1];
		text = text.slice(codePrefix[0].length).trim();
	} else {
		const codeSuffix = /^(.*\d)\s*([A-Z]{3})$/.exec(text);
		if (codeSuffix && CURRENCY_CODES.has(codeSuffix[2]!)) {
			currency = codeSuffix[2];
			text = codeSuffix[1]!.trim();
		}
	}
	const firstChar = text.charAt(0);
	if (CURRENCY_SYMBOLS[firstChar]) {
		currency = CURRENCY_SYMBOLS[firstChar];
		text = text.slice(1).trim();
	} else if (CURRENCY_SYMBOLS[text.charAt(text.length - 1)]) {
		currency = CURRENCY_SYMBOLS[text.charAt(text.length - 1)];
		text = text.slice(0, -1).trim();
	}
	takeSign();

	if (text.endsWith('%')) {
		percent = true;
		text = text.slice(0, -1).trim();
	}

	let multiplier = 1;
	const suffixMatch = /^(.*?\d)\s*([a-zA-Z]{1,5})$/.exec(text);
	if (suffixMatch) {
		const suffix = suffixMatch[2]!.toLowerCase();
		if (MAGNITUDE_SUFFIXES[suffix]) {
			multiplier = MAGNITUDE_SUFFIXES[suffix]!;
			text = suffixMatch[1]!.trim();
		} else if (HOURS_SUFFIXES.has(suffix)) {
			hours = true;
			text = suffixMatch[1]!.trim();
		} else {
			return null;
		}
	}

	let normalized: string | null = null;
	if (/^\d+(\.\d+)?$/.test(text) || /^\.\d+$/.test(text)) {
		normalized = text;
	} else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
		normalized = text.replace(/,/g, '');
	} else if (/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(text)) {
		normalized = text.replace(/ /g, '').replace(',', '.');
	} else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
		normalized = text.replace(/\./g, '').replace(',', '.');
	} else if (/^\d+,\d{1,2}$/.test(text)) {
		normalized = text.replace(',', '.');
	} else if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(text)) {
		normalized = text;
	}
	if (normalized === null) return null;
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) return null;
	const value = roundNumber((negative ? -parsed : parsed) * multiplier);
	const result: ParsedNumberText = { value };
	if (currency) result.currency = currency;
	if (percent) result.percent = true;
	if (hours) result.hours = true;
	return result;
}

/** Strips binary float noise (0.1 + 0.2 → 0.3) without changing real precision. */
export function roundNumber(value: number): number {
	if (!Number.isFinite(value)) return value;
	return Number(value.toPrecision(15));
}

const MONTHS: Record<string, number> = {
	jan: 1,
	january: 1,
	feb: 2,
	february: 2,
	mar: 3,
	march: 3,
	apr: 4,
	april: 4,
	may: 5,
	jun: 6,
	june: 6,
	jul: 7,
	july: 7,
	aug: 8,
	august: 8,
	sep: 9,
	sept: 9,
	september: 9,
	oct: 10,
	october: 10,
	nov: 11,
	november: 11,
	dec: 12,
	december: 12
};
const WEEKDAYS = new Set([
	'mon',
	'monday',
	'tue',
	'tues',
	'tuesday',
	'wed',
	'wednesday',
	'thu',
	'thur',
	'thurs',
	'thursday',
	'fri',
	'friday',
	'sat',
	'saturday',
	'sun',
	'sunday'
]);

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
	if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
	if (!Number.isInteger(month) || month < 1 || month > 12) return false;
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return Number.isInteger(day) && day >= 1 && day <= daysInMonth;
}

function isoDate(year: number, month: number, day: number): string | null {
	return isValidCalendarDate(year, month, day) ? `${year}-${pad2(month)}-${pad2(day)}` : null;
}

function expandTwoDigitYear(value: number): number {
	return value < 70 ? 2000 + value : 1900 + value;
}

/**
 * Date formats seen in spreadsheets → 'YYYY-MM-DD' (or a full ISO datetime
 * when a clock time was given): "2026-10-04", "2026-10-04T15:00Z",
 * "10/4/2026", "4.10.2026", "Oct 4 2026", "October 4, 2026", "4 Oct 2026",
 * "Mon, Oct 4 2026", "Oct 4" (current year). Null when not a date.
 */
export function parseDateText(raw: string, now: Date = new Date()): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim();
	if (!text) return null;

	let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
	if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

	match =
		/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(
			text
		);
	if (match) {
		const date = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
		const hour = Number(match[4]);
		const minute = Number(match[5]);
		if (!date || hour > 23 || minute > 59) return null;
		return `${date}T${match[4]}:${match[5]}${match[6] ?? ''}${match[8] ? match[8].toUpperCase() : ''}`;
	}

	match = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(text);
	if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

	match = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})$/.exec(text);
	if (match) {
		const first = Number(match[1]);
		const second = Number(match[3]);
		const yearRaw = Number(match[4]);
		const year = match[4]!.length === 2 ? expandTwoDigitYear(yearRaw) : yearRaw;
		// '.' is day-first (European); '/' and '-' are month-first (US) unless
		// the first number cannot be a month.
		const dayFirst = match[2] === '.' || (first > 12 && second <= 12);
		return dayFirst ? isoDate(year, second, first) : isoDate(year, first, second);
	}

	const tokens = text
		.toLowerCase()
		.replace(/,/g, ' ')
		.split(/\s+/)
		.map((token) => token.replace(/\.$/, ''))
		.filter(Boolean);
	if (tokens.length > 0 && WEEKDAYS.has(tokens[0]!)) tokens.shift();
	if (tokens.length < 2 || tokens.length > 3) return null;
	let month: number | null = null;
	let day: number | null = null;
	let year: number | null = null;
	for (const token of tokens) {
		if (MONTHS[token] !== undefined) {
			if (month !== null) return null;
			month = MONTHS[token]!;
			continue;
		}
		const dayMatch = /^(\d{1,2})(st|nd|rd|th)?$/.exec(token);
		if (dayMatch && day === null) {
			day = Number(dayMatch[1]);
			continue;
		}
		if (/^\d{4}$/.test(token) && year === null) {
			year = Number(token);
			continue;
		}
		return null;
	}
	if (month === null || day === null) return null;
	return isoDate(year ?? now.getUTCFullYear(), month, day);
}

const TRUE_MARKS = new Set(['true', 'yes', 'y', '1', 'x', '✓', '✔', '✅', '☑', 'checked', 'on']);
const FALSE_MARKS = new Set(['false', 'no', 'n', '0', '✗', '✘', '❌', '☐', 'unchecked', 'off']);

/** Checkbox marks: TRUE/yes/y/1/x/✓ → true, FALSE/no/n/0/✗ → false, else null. */
export function parseBooleanText(raw: string): boolean | null {
	if (typeof raw !== 'string') return null;
	const token = raw.trim().toLowerCase();
	if (TRUE_MARKS.has(token)) return true;
	if (FALSE_MARKS.has(token)) return false;
	return null;
}

/** http(s) URL, adding https:// to a bare domain ("acme.com/jobs"). Null otherwise. */
export function normalizeUrlText(raw: string): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw.trim();
	if (!text || /\s/.test(text)) return null;
	let candidate = text;
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
		if (text.includes('@')) return null;
		if (!/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/:?#].*)?$/i.test(text)) return null;
		candidate = `https://${text}`;
	}
	try {
		const url = new URL(candidate);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return candidate;
	} catch {
		return null;
	}
}

/** Lowercase-trimmed address when the text is one email address, else null. */
export function normalizeEmailText(raw: string): string | null {
	if (typeof raw !== 'string') return null;
	const text = raw
		.trim()
		.replace(/^mailto:/i, '')
		.trim();
	return /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]{2,}$/.test(text) ? text : null;
}

function parseLinkValue(raw: unknown, column: TableColumn): TableLinkValue | null {
	const allowed = column.options?.link_kinds;
	const accept = (kind: string, id: string, label?: string): TableLinkValue | null => {
		if (!(TABLE_LINK_KINDS as readonly string[]).includes(kind)) return null;
		if (allowed && allowed.length > 0 && !allowed.includes(kind as TableLinkKind)) return null;
		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
			return null;
		const value: TableLinkValue = { kind: kind as TableLinkKind, id: id.toLowerCase() };
		if (label && label.trim()) value.label = clip(label.trim(), MAX_CHOICE_CHARS);
		return value;
	};
	if (isRecord(raw) && typeof raw.kind === 'string' && typeof raw.id === 'string') {
		return accept(
			raw.kind.trim().toLowerCase(),
			raw.id.trim(),
			typeof raw.label === 'string' ? raw.label : undefined
		);
	}
	if (typeof raw === 'string') {
		const mention = /^\[\[([a-z_]+):([0-9a-f-]{36})(?:\|([^\]]*))?\]\]$/i.exec(raw.trim());
		if (mention) return accept(mention[1]!.toLowerCase(), mention[2]!, mention[3]);
		const plain = /^([a-z_]+):([0-9a-f-]{36})$/i.exec(raw.trim());
		if (plain) return accept(plain[1]!.toLowerCase(), plain[2]!);
	}
	return null;
}

// ---------------------------------------------------------------------------
// Cell coercion
// ---------------------------------------------------------------------------

function scalarToText(raw: unknown): string | null {
	if (typeof raw === 'string') return raw;
	if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;
	if (typeof raw === 'boolean') return raw ? 'true' : 'false';
	if (isRecord(raw)) {
		if (typeof raw.label === 'string' && raw.label) return raw.label;
		if (typeof raw.value === 'string') return raw.value;
		if (typeof raw.id === 'string') return raw.id;
	}
	return null;
}

function describeRaw(raw: unknown): string {
	const text = JSON.stringify(raw) ?? String(raw);
	return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function canonicalChoice(column: TableColumn, value: string): string {
	const lower = value.toLowerCase();
	const match = (column.options?.choices ?? []).find(
		(choice) => choice.value.toLowerCase() === lower
	);
	return match ? match.value : value;
}

function capText(value: string): { value: string; error?: string } {
	if (value.length <= TABLE_LIMITS.maxCellChars) return { value };
	return {
		value: value.slice(0, TABLE_LIMITS.maxCellChars),
		error: `text was cut to ${TABLE_LIMITS.maxCellChars} characters`
	};
}

/**
 * Raw input (typed value or spreadsheet text) → the column's cell value.
 * Empty input → null (clears the cell). A value that cannot be read returns
 * `{value: null, error}`; text cut to the cell cap returns the cut value plus
 * an error. Unknown select values are kept as-is (callers report them as new
 * choices).
 */
export function coerceCellValue(
	column: TableColumn,
	raw: unknown
): { value: TableCellValue; error?: string } {
	if (raw === null || raw === undefined) return { value: null };
	if (typeof raw === 'string' && raw.trim() === '') return { value: null };
	if (Array.isArray(raw) && raw.length === 0) return { value: null };

	const fail = (expected: string) => ({
		value: null,
		error: `${describeRaw(raw)} is not ${expected}`
	});

	switch (column.type) {
		case 'text':
		case 'long_text': {
			if (Array.isArray(raw)) {
				const parts = raw.map(scalarToText).filter((part): part is string => part !== null);
				return capText(parts.join(', '));
			}
			const text = scalarToText(raw);
			if (text === null) return fail('text');
			return capText(column.type === 'text' ? text.trim() : text.replace(/\s+$/, ''));
		}
		case 'number': {
			if (typeof raw === 'number')
				return Number.isFinite(raw) ? { value: raw } : fail('a number');
			if (Array.isArray(raw) && raw.length === 1) return coerceCellValue(column, raw[0]);
			if (typeof raw !== 'string') return fail('a number');
			const parsed = parseNumberText(raw);
			return parsed ? { value: parsed.value } : fail('a number');
		}
		case 'date': {
			if (raw instanceof Date) {
				return Number.isNaN(raw.getTime())
					? fail('a date')
					: { value: raw.toISOString().slice(0, 10) };
			}
			if (Array.isArray(raw) && raw.length === 1) return coerceCellValue(column, raw[0]);
			if (typeof raw !== 'string') return fail('a date (YYYY-MM-DD)');
			const parsed = parseDateText(raw);
			return parsed ? { value: parsed } : fail('a date (YYYY-MM-DD)');
		}
		case 'checkbox': {
			if (typeof raw === 'boolean') return { value: raw };
			if (typeof raw === 'number' && (raw === 0 || raw === 1)) return { value: raw === 1 };
			if (typeof raw !== 'string') return fail('a checkbox value (true/false)');
			const parsed = parseBooleanText(raw);
			return parsed === null ? fail('a checkbox value (true/false)') : { value: parsed };
		}
		case 'select': {
			let candidate: unknown = raw;
			if (Array.isArray(raw)) {
				if (raw.length > 1) return { value: null, error: 'pick one option, not a list' };
				candidate = raw[0];
			}
			const text = scalarToText(candidate);
			if (text === null) return fail('an option');
			const cleaned = clip(text.trim(), MAX_CHOICE_CHARS);
			return cleaned ? { value: canonicalChoice(column, cleaned) } : { value: null };
		}
		case 'multi_select': {
			const parts = Array.isArray(raw)
				? raw.map(scalarToText).filter((part): part is string => part !== null)
				: (scalarToText(raw) ?? '').split(/[,;\n]/);
			const seen = new Set<string>();
			const values: string[] = [];
			for (const part of parts) {
				const cleaned = clip(part.trim(), MAX_CHOICE_CHARS);
				if (!cleaned) continue;
				const canonical = canonicalChoice(column, cleaned);
				if (seen.has(canonical.toLowerCase())) continue;
				seen.add(canonical.toLowerCase());
				values.push(canonical);
			}
			return values.length > 0 ? { value: values } : { value: null };
		}
		case 'url': {
			const text = scalarToText(raw);
			const url = text === null ? null : normalizeUrlText(text);
			return url ? capText(url) : fail('a web address (https://…)');
		}
		case 'email': {
			const text = scalarToText(raw);
			const email = text === null ? null : normalizeEmailText(text);
			return email ? { value: email } : fail('an email address');
		}
		case 'link': {
			const link = parseLinkValue(raw, column);
			return link ? { value: link } : fail('a link to a BuildOS item ({kind, id})');
		}
		default:
			return fail('a supported value');
	}
}

/** Unknown select/multi_select values in `value`, given the column's choices. */
function unknownChoices(column: TableColumn, value: TableCellValue): string[] {
	if (!SELECT_TYPES.has(column.type) || value === null) return [];
	const known = new Set(
		(column.options?.choices ?? []).map((choice) => choice.value.toLowerCase())
	);
	const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
	return values.filter((entry) => !known.has(entry.toLowerCase()));
}

/**
 * A row patch keyed by column name or id → cells keyed by column id. A null
 * value clears that cell. Unknown columns and unreadable values are reported
 * in `errors` and left out of `cells`. `newChoices` is keyed by column id.
 */
export function coerceRowInput(
	schema: TableSchema,
	input: Record<string, unknown>
): {
	cells: Record<string, TableCellValue>;
	errors: string[];
	newChoices: Record<string, string[]>;
} {
	const cells: Record<string, TableCellValue> = {};
	const errors: string[] = [];
	const newChoices: Record<string, string[]> = {};
	if (!isRecord(input)) {
		return { cells, errors: ['values must be an object of {column: value}'], newChoices };
	}
	for (const [key, raw] of Object.entries(input)) {
		const column = resolveColumn(schema, key);
		if (!column) {
			errors.push(
				`unknown column "${key}" (columns: ${schema.columns.map((entry) => entry.name).join(', ')})`
			);
			continue;
		}
		const result = coerceCellValue(column, raw);
		if (result.error) errors.push(`${column.name}: ${result.error}`);
		if (result.error && result.value === null) continue;
		cells[column.id] = result.value;
		for (const choice of unknownChoices(column, result.value)) {
			const list = (newChoices[column.id] ??= []);
			if (!list.some((entry) => entry.toLowerCase() === choice.toLowerCase()))
				list.push(choice);
		}
	}
	return { cells, errors, newChoices };
}

/** Adds `newChoices` (keyed by column id) to the matching select columns. */
export function withNewChoices(
	schema: TableSchema,
	newChoices: Record<string, string[]>
): TableSchema {
	const entries = Object.entries(newChoices).filter(([, values]) => values.length > 0);
	if (entries.length === 0) return schema;
	return {
		...schema,
		columns: schema.columns.map((column) => {
			const additions = newChoices[column.id];
			if (!additions || additions.length === 0 || !SELECT_TYPES.has(column.type))
				return column;
			const choices = normalizeChoices([...(column.options?.choices ?? []), ...additions]);
			return { ...column, options: { ...(column.options ?? {}), choices } };
		})
	};
}

// ---------------------------------------------------------------------------
// Display text
// ---------------------------------------------------------------------------

function formatPlainNumber(value: number, decimals?: number): string {
	return value.toLocaleString('en-US', {
		maximumFractionDigits: decimals ?? 6,
		...(decimals !== undefined ? { minimumFractionDigits: decimals } : {})
	});
}

function formatNumberCell(column: TableColumn | null | undefined, value: number): string {
	const options = column?.type === 'number' ? column.options : undefined;
	const decimals = options?.decimals;
	switch (options?.format) {
		case 'currency': {
			try {
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: options.currency ?? 'USD',
					minimumFractionDigits: decimals ?? (Number.isInteger(value) ? 0 : 2),
					maximumFractionDigits: decimals ?? 2
				}).format(value);
			} catch {
				return `${options.currency ?? 'USD'} ${formatPlainNumber(value, decimals)}`;
			}
		}
		case 'percent':
			return `${formatPlainNumber(value, decimals)}%`;
		case 'hours':
			return `${formatPlainNumber(value, decimals)}h`;
		default:
			return formatPlainNumber(value, decimals);
	}
}

/** Human-readable text for one cell ("" when empty). */
export function cellToText(
	column: TableColumn | null | undefined,
	value: TableCellValue | undefined
): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'number') return formatNumberCell(column, value);
	if (isRecord(value)) {
		const link = value as unknown as TableLinkValue;
		return link.label?.trim() ? link.label : `${link.kind}:${link.id}`;
	}
	return String(value);
}

// ---------------------------------------------------------------------------
// Column changes
// ---------------------------------------------------------------------------

type RowPatch = {
	cells: Record<string, TableCellValue>;
	meta: Record<string, TableCellMeta | null>;
};

function insertIndexFor(
	columns: TableColumn[],
	after: string | null | undefined,
	schemaForRefs: TableSchema
): number {
	if (after === undefined) return columns.length;
	if (after === null || after === '') return 0;
	const anchor = resolveColumn({ ...schemaForRefs, columns }, after);
	if (!anchor) {
		throw new TableServiceError('VALIDATION_ERROR', `Unknown column "${after}" in after.`);
	}
	return columns.findIndex((column) => column.id === anchor.id) + 1;
}

function requireColumn(schema: TableSchema, columns: TableColumn[], ref: unknown): TableColumn {
	const column = typeof ref === 'string' ? resolveColumn({ ...schema, columns }, ref) : null;
	if (!column) {
		throw new TableServiceError(
			'VALIDATION_ERROR',
			`Unknown column "${String(ref)}". Columns: ${columns.map((entry) => entry.name).join(', ')}.`
		);
	}
	return column;
}

function assertNameFree(columns: TableColumn[], name: string, exceptId?: string): void {
	const lower = name.toLowerCase();
	const clash = columns.find(
		(column) => column.id !== exceptId && column.name.toLowerCase() === lower
	);
	if (clash) {
		throw new TableServiceError(
			'VALIDATION_ERROR',
			`A column named "${clash.name}" already exists.`
		);
	}
}

function rewriteViewRefs(
	views: TableView[] | undefined,
	matches: (ref: string) => boolean,
	replacement: string | null
): TableView[] | undefined {
	if (!views) return views;
	return views.map((view) => {
		const next: TableView = { ...view };
		if (view.filters) {
			next.filters =
				replacement === null
					? view.filters.filter((filter) => !matches(filter.column))
					: view.filters.map((filter) =>
							matches(filter.column) ? { ...filter, column: replacement } : filter
						);
		}
		if (view.sort) {
			next.sort =
				replacement === null
					? view.sort.filter((sort) => !matches(sort.column))
					: view.sort.map((sort) =>
							matches(sort.column) ? { ...sort, column: replacement } : sort
						);
		}
		if (view.group_by && matches(view.group_by)) {
			if (replacement === null) delete next.group_by;
			else next.group_by = replacement;
		}
		if (replacement === null && view.hidden_column_ids) {
			next.hidden_column_ids = view.hidden_column_ids.filter((ref) => !matches(ref));
		}
		return next;
	});
}

/**
 * Applies column changes in order. Retyping re-coerces existing cells (cells
 * that cannot convert keep their old value and are reported in `warnings`);
 * deleting a column emits ops that clear its cells (so the change can be
 * undone). Invalid changes throw TableServiceError('VALIDATION_ERROR').
 */
export function applyColumnChanges(
	schema: TableSchema,
	rows: TableRow[],
	changes: TableColumnChange[]
): { schema: TableSchema; rowOps: TableRowOp[]; warnings: string[] } {
	let columns = schema.columns.map((column) => ({ ...column }));
	let primaryId = schema.primary_column_id;
	let views = schema.views?.map((view) => ({ ...view }));
	const warnings: string[] = [];
	const liveRows = rows.filter((row) => !row.deleted_at);
	const working = new Map(liveRows.map((row) => [row.id, { ...row.cells }]));
	const patches = new Map<string, RowPatch>();
	const changeList = Array.isArray(changes) ? changes : [];

	const patchFor = (rowId: string): RowPatch => {
		let patch = patches.get(rowId);
		if (!patch) {
			patch = { cells: {}, meta: {} };
			patches.set(rowId, patch);
		}
		return patch;
	};

	for (const change of changeList) {
		// Checked on a widened copy: narrowing `change` itself with isRecord would
		// drop the interface-based 'add' variant from the union.
		if (!isRecord(change as unknown)) {
			throw new TableServiceError(
				'VALIDATION_ERROR',
				'Each column change must be an object.'
			);
		}
		switch (change.action) {
			case 'add': {
				if (columns.length >= TABLE_LIMITS.maxColumns) {
					throw new TableServiceError(
						'LIMIT_EXCEEDED',
						`A table can have at most ${TABLE_LIMITS.maxColumns} columns.`
					);
				}
				const name = cleanName(change.name);
				if (!name)
					throw new TableServiceError('VALIDATION_ERROR', 'A new column needs a name.');
				assertNameFree(columns, name);
				if (change.type !== undefined && !isColumnType(change.type)) {
					throw new TableServiceError(
						'VALIDATION_ERROR',
						`Unknown column type "${String(change.type)}". Types: ${TABLE_COLUMN_TYPES.join(', ')}.`
					);
				}
				const index = insertIndexFor(columns, change.after, schema);
				const column = columnFromInput(
					{ ...change, name },
					new Set(columns.map((entry) => entry.id)),
					new Set(columns.map((entry) => entry.name.toLowerCase())),
					columns.length
				);
				columns.splice(index, 0, column);
				break;
			}
			case 'rename': {
				const column = requireColumn(schema, columns, change.column);
				const name = cleanName(change.name);
				if (!name)
					throw new TableServiceError(
						'VALIDATION_ERROR',
						'A column name cannot be empty.'
					);
				assertNameFree(columns, name, column.id);
				const oldLower = column.name.toLowerCase();
				columns = columns.map((entry) =>
					entry.id === column.id ? { ...entry, name } : entry
				);
				views = rewriteViewRefs(
					views,
					(ref) => ref.trim().toLowerCase() === oldLower,
					name
				);
				break;
			}
			case 'retype': {
				const column = requireColumn(schema, columns, change.column);
				if (!isColumnType(change.type)) {
					throw new TableServiceError(
						'VALIDATION_ERROR',
						`Unknown column type "${String(change.type)}". Types: ${TABLE_COLUMN_TYPES.join(', ')}.`
					);
				}
				const nextType = change.type;
				const keepOptions =
					change.options === undefined &&
					(column.type === nextType ||
						(SELECT_TYPES.has(column.type) && SELECT_TYPES.has(nextType)));
				const rawOptions = change.options ?? (keepOptions ? column.options : undefined);
				const options = normalizeColumnOptions(nextType, rawOptions);
				let next: TableColumn = { ...column, type: nextType };
				if (options) next.options = options;
				else delete next.options;

				const failed: string[] = [];
				const added: string[] = [];
				for (const row of liveRows) {
					const cells = working.get(row.id)!;
					const current = cells[column.id];
					if (isEmptyCellValue(current)) continue;
					const textual = ['text', 'long_text', 'url', 'email', 'select', 'multi_select'];
					const input =
						textual.includes(nextType) &&
						typeof current !== 'string' &&
						!(Array.isArray(current) && nextType === 'multi_select')
							? cellToText(column, current)
							: current;
					const result = coerceCellValue(next, input);
					if (result.error || result.value === null) {
						failed.push(`r${row.row_number}`);
						continue;
					}
					for (const choice of unknownChoices(next, result.value)) {
						if (!added.some((entry) => entry.toLowerCase() === choice.toLowerCase())) {
							added.push(choice);
						}
					}
					if (cellValuesEqual(result.value, current)) continue;
					cells[column.id] = result.value;
					const patch = patchFor(row.id);
					patch.cells[column.id] = result.value;
					patch.meta[column.id] = row.cell_meta?.[column.id] ?? null;
				}
				if (added.length > 0) {
					next = {
						...next,
						options: {
							...(next.options ?? {}),
							choices: normalizeChoices([...(next.options?.choices ?? []), ...added])
						}
					};
				}
				if (failed.length > 0) {
					warnings.push(
						`${failed.length} cell${failed.length === 1 ? '' : 's'} in "${column.name}" could not be read as ${nextType} and kept the old value (${failed.slice(0, 10).join(', ')}${failed.length > 10 ? ', …' : ''}).`
					);
				}
				columns = columns.map((entry) => (entry.id === column.id ? next : entry));
				break;
			}
			case 'update': {
				const column = requireColumn(schema, columns, change.column);
				const next: TableColumn = { ...column };
				if (change.description !== undefined) {
					const description =
						typeof change.description === 'string' ? change.description.trim() : '';
					if (description)
						next.description = clip(description, MAX_COLUMN_DESCRIPTION_CHARS);
					else delete next.description;
				}
				if (change.options !== undefined) {
					const options = normalizeColumnOptions(next.type, {
						...(column.options ?? {}),
						...(isRecord(change.options) ? change.options : {})
					});
					if (options) next.options = options;
					else delete next.options;
				}
				if (change.ai !== undefined) {
					const ai = change.ai === null ? null : normalizeAiConfig(change.ai, true);
					if (change.ai !== null && !ai) {
						throw new TableServiceError(
							'VALIDATION_ERROR',
							'A question column needs a non-empty ai.prompt.'
						);
					}
					if (ai) next.ai = ai;
					else delete next.ai;
				}
				if (change.width !== undefined) {
					if (
						typeof change.width === 'number' &&
						Number.isFinite(change.width) &&
						change.width > 0
					) {
						next.width = Math.min(1200, Math.max(40, Math.round(change.width)));
					} else {
						delete next.width;
					}
				}
				if (change.hidden !== undefined) {
					if (change.hidden === true) next.hidden = true;
					else delete next.hidden;
				}
				columns = columns.map((entry) => (entry.id === column.id ? next : entry));
				break;
			}
			case 'delete': {
				const column = requireColumn(schema, columns, change.column);
				if (columns.length <= 1) {
					throw new TableServiceError(
						'VALIDATION_ERROR',
						'A table needs at least one column.'
					);
				}
				columns = columns.filter((entry) => entry.id !== column.id);
				for (const row of liveRows) {
					const cells = working.get(row.id)!;
					const hasValue = column.id in cells && !isEmptyCellValue(cells[column.id]);
					const hasMeta = Boolean(row.cell_meta?.[column.id]);
					const patch = patches.get(row.id);
					if (!hasValue && !hasMeta && !(patch && column.id in patch.cells)) continue;
					delete cells[column.id];
					const target = patchFor(row.id);
					target.cells[column.id] = null;
					delete target.meta[column.id];
				}
				if (primaryId === column.id) primaryId = undefined;
				const lowerName = column.name.toLowerCase();
				views = rewriteViewRefs(
					views,
					(ref) => ref === column.id || ref.trim().toLowerCase() === lowerName,
					null
				);
				break;
			}
			case 'move': {
				const column = requireColumn(schema, columns, change.column);
				const remaining = columns.filter((entry) => entry.id !== column.id);
				if (change.after !== undefined && change.after !== null) {
					const anchor = requireColumn(schema, columns, change.after);
					if (anchor.id === column.id) break;
				}
				const index = insertIndexFor(remaining, change.after, schema);
				remaining.splice(index, 0, column);
				columns = remaining;
				break;
			}
			default:
				throw new TableServiceError(
					'VALIDATION_ERROR',
					`Unknown column change action "${String((change as { action?: unknown }).action)}". Actions: add, rename, retype, update, delete, move.`
				);
		}
	}

	const rowOps: TableRowOp[] = [];
	for (const row of liveRows) {
		const patch = patches.get(row.id);
		if (!patch || Object.keys(patch.cells).length === 0) continue;
		rowOps.push({
			op: 'update',
			row_id: row.id,
			cells: patch.cells,
			cell_meta: patch.meta,
			expected_version: row.version
		});
	}

	const nextSchema: TableSchema = { ...schema, columns };
	if (primaryId && columns.some((column) => column.id === primaryId)) {
		nextSchema.primary_column_id = primaryId;
	} else {
		delete nextSchema.primary_column_id;
		if (columns[0]) nextSchema.primary_column_id = columns[0].id;
	}
	if (views) nextSchema.views = views;
	return { schema: nextSchema, rowOps, warnings };
}
