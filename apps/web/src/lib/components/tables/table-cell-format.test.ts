// apps/web/src/lib/components/tables/table-cell-format.test.ts
import { describe, expect, it } from 'vitest';
import type { TableColumn } from '@buildos/shared-agent-ops/tables';
import {
	cellCopyText,
	cellEditText,
	columnTypeLabel,
	defaultColumnWidth,
	formatCellDisplay,
	formatDate,
	formatNumber,
	isEmptyCell,
	nextChoiceColor,
	safeHref,
	toDateInputValue,
	toTsv,
	urlLabel
} from './table-cell-format';
import { COL, jobApplicationColumns } from './fixtures';

const col = (id: string): TableColumn => jobApplicationColumns.find((c) => c.id === id)!;

describe('formatNumber', () => {
	it('formats currency with the column currency and decimals', () => {
		expect(formatNumber(col(COL.salary), 185000)).toBe('$185,000');
		expect(
			formatNumber({ options: { format: 'currency', currency: 'EUR', decimals: 2 } }, 12.5)
		).toBe('€12.50');
	});

	it('treats percent values as the percentage itself and hours as hours', () => {
		expect(formatNumber({ options: { format: 'percent' } }, 25)).toBe('25%');
		expect(formatNumber({ options: { format: 'hours' } }, 1.5)).toBe('1.5 h');
		expect(formatNumber({}, 1234.567)).toBe('1,234.57');
	});

	it('falls back to plain numbers for a bad currency code', () => {
		expect(formatNumber({ options: { format: 'currency', currency: 'NOPE!' } }, 10)).toBe('10');
	});
});

describe('dates', () => {
	it('shows date-only values without a timezone shift', () => {
		expect(formatDate('2026-10-04')).toBe('Oct 4, 2026');
		expect(formatDate('not a date')).toBe('not a date');
		expect(toDateInputValue('2026-01-31')).toBe('2026-01-31');
		expect(toDateInputValue(42)).toBe('');
	});
});

describe('links', () => {
	it('only renders http(s) and mailto hrefs', () => {
		expect(safeHref('javascript:alert(1)')).toBeNull();
		expect(safeHref('data:text/html,hi')).toBeNull();
		expect(safeHref('careers.northwind.example/jobs')).toBe(
			'https://careers.northwind.example/jobs'
		);
		expect(safeHref('maya@northwind.example', 'email')).toBe('mailto:maya@northwind.example');
		expect(safeHref('not an email', 'email')).toBeNull();
	});

	it('labels URLs as host + path', () => {
		expect(urlLabel('https://www.northwind.example/jobs/fde/')).toBe(
			'northwind.example/jobs/fde'
		);
	});
});

describe('formatCellDisplay / edit / copy', () => {
	it('formats by declared type', () => {
		expect(formatCellDisplay(col(COL.salary), 160000)).toBe('$160,000');
		expect(formatCellDisplay(col(COL.applied), '2026-09-12')).toBe('Sep 12, 2026');
		expect(formatCellDisplay(col(COL.remote), true)).toBe('Yes');
		expect(formatCellDisplay(col(COL.link), 'https://lumen.example/careers/')).toBe(
			'lumen.example/careers'
		);
		expect(
			formatCellDisplay({ id: 'c_x', name: 'Tags', type: 'multi_select' }, ['a', 'b'])
		).toBe('a, b');
		expect(
			formatCellDisplay(
				{ id: 'c_l', name: 'Task', type: 'link' },
				{ kind: 'task', id: '1234567890', label: 'Follow up' }
			)
		).toBe('Follow up');
		expect(formatCellDisplay(col(COL.company), undefined)).toBe('');
	});

	it('edits raw values and copies spreadsheet-friendly text', () => {
		expect(cellEditText(col(COL.salary), 185000)).toBe('185000');
		expect(cellCopyText(col(COL.salary), 185000)).toBe('185000');
		expect(cellCopyText(col(COL.remote), false)).toBe('FALSE');
		expect(cellCopyText({ id: 'c_x', name: 'Tags', type: 'multi_select' }, ['a', 'b'])).toBe(
			'a, b'
		);
	});

	it('quotes TSV cells that contain tabs, newlines or quotes', () => {
		expect(
			toTsv([
				['a', 'b\tc'],
				['line 1\nline 2', 'say "hi"']
			])
		).toBe('a\t"b\tc"\n"line 1\nline 2"\t"say ""hi"""');
	});

	it('knows empty cells', () => {
		expect(isEmptyCell(null)).toBe(true);
		expect(isEmptyCell('  ')).toBe(true);
		expect(isEmptyCell([])).toBe(true);
		expect(isEmptyCell(false)).toBe(false);
		expect(isEmptyCell(0)).toBe(false);
	});
});

describe('columns', () => {
	it('labels number formats in plain words', () => {
		expect(columnTypeLabel(col(COL.salary))).toBe('Currency');
		expect(columnTypeLabel(col(COL.status))).toBe('Choice');
		expect(columnTypeLabel(col(COL.notes))).toBe('Long text');
	});

	it('uses stored widths within bounds, defaults by type otherwise', () => {
		expect(defaultColumnWidth({ type: 'text', width: 220 })).toBe(220);
		expect(defaultColumnWidth({ type: 'text', width: 9999 })).toBe(640);
		expect(defaultColumnWidth({ type: 'checkbox' })).toBe(96);
	});

	it('picks an unused choice color', () => {
		expect(nextChoiceColor([])).toBe('blue');
		expect(
			nextChoiceColor([
				{ value: 'A', color: 'blue' },
				{ value: 'B', color: 'green' }
			])
		).toBe('yellow');
	});
});
