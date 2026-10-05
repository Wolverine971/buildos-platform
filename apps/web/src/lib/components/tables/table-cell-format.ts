// apps/web/src/lib/components/tables/table-cell-format.ts
//
// How a cell reads in the grid, on cards, in the editor and on the clipboard.
// Meaning comes only from the column's declared type and options, never its name.
import type {
	TableAggregateValue,
	TableCellValue,
	TableChoiceColor,
	TableColumn,
	TableColumnType,
	TableLinkValue,
	TableNumberFormat,
	TableSelectChoice
} from '@buildos/shared-agent-ops/tables';

export const CHOICE_COLORS: readonly TableChoiceColor[] = [
	'gray',
	'blue',
	'green',
	'yellow',
	'orange',
	'red',
	'purple',
	'pink',
	'teal'
];

export function isEmptyCell(value: TableCellValue | undefined): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

export function isLinkValue(value: unknown): value is TableLinkValue {
	return (
		!!value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		typeof (value as TableLinkValue).id === 'string' &&
		typeof (value as TableLinkValue).kind === 'string'
	);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
	let formatter = numberFormatCache.get(key);
	if (!formatter) {
		try {
			formatter = new Intl.NumberFormat('en-US', options);
		} catch {
			// Bad currency code from a hand-edited schema: fall back to plain numbers.
			formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
		}
		numberFormatCache.set(key, formatter);
	}
	return formatter;
}

function fractionDigits(value: number, decimals: number | undefined, fallback: number): number {
	if (typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0) {
		return Math.min(decimals, 6);
	}
	return Number.isInteger(value) ? 0 : fallback;
}

/**
 * Number formats: `currency` (options.currency, default USD), `percent`
 * (the stored number is the percentage: 25 → "25%"), `hours` (1.5 → "1.5 h").
 */
export function formatNumber(column: Pick<TableColumn, 'options'>, value: number): string {
	if (!Number.isFinite(value)) return '';
	const format: TableNumberFormat = column.options?.format ?? 'number';
	const decimals = column.options?.decimals;
	if (format === 'currency') {
		const currency = (column.options?.currency || 'USD').toUpperCase();
		const digits = fractionDigits(value, decimals, 2);
		return numberFormatter(`cur:${currency}:${digits}`, {
			style: 'currency',
			currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(value);
	}
	const digits = fractionDigits(value, decimals, 2);
	const plain = numberFormatter(`num:${digits}:${decimals ?? 'auto'}`, {
		minimumFractionDigits: typeof decimals === 'number' ? digits : 0,
		maximumFractionDigits: digits
	}).format(value);
	if (format === 'percent') return `${plain}%`;
	if (format === 'hours') return `${plain} h`;
	return plain;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → "Oct 4, 2026" (no timezone shift); ISO datetimes include the time. */
export function formatDate(value: string): string {
	const trimmed = value.trim();
	const dateOnly = DATE_ONLY.exec(trimmed);
	if (dateOnly) {
		const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
		if (Number.isNaN(date.getTime())) return trimmed;
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
	const date = new Date(trimmed);
	if (Number.isNaN(date.getTime())) return trimmed;
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** ISO date part for `<input type="date">`, or '' when the value is not a date. */
export function toDateInputValue(value: TableCellValue | undefined): string {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (DATE_ONLY.test(trimmed)) return trimmed;
	const date = new Date(trimmed);
	if (Number.isNaN(date.getTime())) return '';
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Only http(s) and mailto links are ever rendered as anchors. */
export function safeHref(
	raw: string | null | undefined,
	kind: 'url' | 'email' = 'url'
): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	if (kind === 'email') {
		if (value.includes('@') && !/[\s<>"]/.test(value)) {
			return `mailto:${value}`;
		}
		return null;
	}
	const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
	try {
		const url = new URL(candidate);
		if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
	} catch {
		return null;
	}
	return null;
}

/** "careers.northwind.example/jobs/fde-east" — host + path, no protocol or trailing slash. */
export function urlLabel(raw: string): string {
	const href = safeHref(raw);
	if (!href) return raw;
	try {
		const url = new URL(href);
		const host = url.hostname.replace(/^www\./, '');
		const path = `${url.pathname}${url.search}`.replace(/\/$/, '');
		return `${host}${path}`;
	} catch {
		return raw;
	}
}

export function hostnameOf(raw: string): string {
	const href = safeHref(raw);
	if (!href) return raw;
	try {
		return new URL(href).hostname.replace(/^www\./, '');
	} catch {
		return raw;
	}
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export function choiceFor(
	column: Pick<TableColumn, 'options'>,
	value: string
): TableSelectChoice | undefined {
	const needle = value.trim().toLowerCase();
	return column.options?.choices?.find((choice) => choice.value.trim().toLowerCase() === needle);
}

export function choiceColor(column: Pick<TableColumn, 'options'>, value: string): TableChoiceColor {
	return choiceFor(column, value)?.color ?? 'gray';
}

/** The first palette color not used yet, cycling once all are taken. */
export function nextChoiceColor(choices: readonly TableSelectChoice[] = []): TableChoiceColor {
	const used = new Set(choices.map((choice) => choice.color ?? 'gray'));
	const palette = CHOICE_COLORS.filter((color) => color !== 'gray');
	const free = palette.find((color) => !used.has(color));
	return free ?? palette[choices.length % palette.length] ?? 'blue';
}

export function selectValues(value: TableCellValue | undefined): string[] {
	if (Array.isArray(value))
		return value.filter((item) => typeof item === 'string' && item !== '');
	if (typeof value === 'string' && value.trim()) return [value];
	return [];
}

// ---------------------------------------------------------------------------
// Display / edit / copy text
// ---------------------------------------------------------------------------

export function linkLabel(value: TableLinkValue): string {
	return value.label?.trim() || `${value.kind} ${value.id.slice(0, 8)}`;
}

/** What the cell reads as for humans (grid text, cards, embeds, aria labels). */
export function formatCellDisplay(column: TableColumn, value: TableCellValue | undefined): string {
	if (isEmptyCell(value)) return '';
	switch (column.type) {
		case 'number':
			return typeof value === 'number' ? formatNumber(column, value) : String(value);
		case 'date':
			return typeof value === 'string' ? formatDate(value) : String(value);
		case 'checkbox':
			return value === true ? 'Yes' : 'No';
		case 'multi_select':
			return selectValues(value).join(', ');
		case 'url':
			return typeof value === 'string' ? urlLabel(value) : String(value);
		case 'link':
			return isLinkValue(value) ? linkLabel(value) : String(value);
		default:
			if (Array.isArray(value)) return value.join(', ');
			if (isLinkValue(value)) return linkLabel(value);
			return String(value);
	}
}

/** Text a cell editor starts from (raw, unformatted). */
export function cellEditText(column: TableColumn, value: TableCellValue | undefined): string {
	if (value === null || value === undefined) return '';
	switch (column.type) {
		case 'number':
			return typeof value === 'number' && Number.isFinite(value)
				? String(value)
				: String(value);
		case 'date':
			return toDateInputValue(value) || (typeof value === 'string' ? value : '');
		case 'multi_select':
			return selectValues(value).join(', ');
		case 'checkbox':
			return value === true ? 'true' : 'false';
		case 'link':
			return isLinkValue(value) ? linkLabel(value) : '';
		default:
			if (Array.isArray(value)) return value.join(', ');
			if (isLinkValue(value)) return linkLabel(value);
			return String(value);
	}
}

/** Plain text for the clipboard: numbers stay numbers so Sheets/Excel can sum them. */
export function cellCopyText(column: TableColumn, value: TableCellValue | undefined): string {
	if (value === null || value === undefined) return '';
	switch (column.type) {
		case 'number':
			return typeof value === 'number' ? String(value) : String(value);
		case 'checkbox':
			return value === true ? 'TRUE' : 'FALSE';
		case 'multi_select':
			return selectValues(value).join(', ');
		case 'link':
			return isLinkValue(value) ? linkLabel(value) : '';
		default:
			if (Array.isArray(value)) return value.join(', ');
			if (isLinkValue(value)) return linkLabel(value);
			return String(value);
	}
}

/** Tab-separated text the way Sheets/Excel write it (quotes around tabs, newlines, quotes). */
export function toTsv(rows: string[][]): string {
	return rows
		.map((row) =>
			row
				.map((cell) => (/[\t\n\r"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
				.join('\t')
		)
		.join('\n');
}

// ---------------------------------------------------------------------------
// Column types
// ---------------------------------------------------------------------------

export const COLUMN_TYPE_OPTIONS: Array<{ type: TableColumnType; label: string; hint: string }> = [
	{ type: 'text', label: 'Text', hint: 'Short text' },
	{ type: 'long_text', label: 'Long text', hint: 'Notes and paragraphs' },
	{ type: 'number', label: 'Number', hint: 'Amounts, money, hours' },
	{ type: 'date', label: 'Date', hint: 'A day on the calendar' },
	{ type: 'select', label: 'Choice', hint: 'One option from a list' },
	{ type: 'multi_select', label: 'Multiple choice', hint: 'Several options from a list' },
	{ type: 'checkbox', label: 'Checkbox', hint: 'Yes or no' },
	{ type: 'url', label: 'Web link', hint: 'A URL' },
	{ type: 'email', label: 'Email', hint: 'An email address' },
	{ type: 'link', label: 'Linked item', hint: 'A task or doc in BuildOS' }
];

export function columnTypeLabel(column: Pick<TableColumn, 'type' | 'options'>): string {
	if (column.type === 'number') {
		const format = column.options?.format;
		if (format === 'currency') return 'Currency';
		if (format === 'percent') return 'Percent';
		if (format === 'hours') return 'Hours';
	}
	return COLUMN_TYPE_OPTIONS.find((option) => option.type === column.type)?.label ?? 'Text';
}

/** Numbers and dates align right like a ledger; everything else reads left to right. */
export function isNumericColumn(column: Pick<TableColumn, 'type'>): boolean {
	return column.type === 'number';
}

/** Cells the grid can edit in place. Linked items change through their own flows. */
export function isEditableColumn(column: Pick<TableColumn, 'type'>): boolean {
	return column.type !== 'link';
}

export function defaultColumnWidth(column: Pick<TableColumn, 'type' | 'width'>): number {
	if (typeof column.width === 'number' && column.width >= 60) {
		return Math.min(Math.round(column.width), 640);
	}
	switch (column.type) {
		case 'long_text':
			return 260;
		case 'number':
			return 120;
		case 'date':
			return 132;
		case 'select':
			return 150;
		case 'multi_select':
			return 200;
		case 'checkbox':
			return 96;
		case 'url':
		case 'email':
			return 200;
		default:
			return 180;
	}
}

/** Footer text for one column's total. */
export function formatAggregate(
	column: TableColumn,
	value: TableAggregateValue | undefined
): string {
	if (value === null || value === undefined || value === '') return '';
	if (column.type === 'number' && typeof value === 'number') return formatNumber(column, value);
	return String(value);
}
