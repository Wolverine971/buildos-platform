// packages/shared-agent-ops/src/tables/table-schema.test.ts
import { describe, expect, it } from 'vitest';
import { TableServiceError } from './table-errors';
import {
	applyColumnChanges,
	buildTableSchema,
	cellToText,
	coerceCellValue,
	coerceRowInput,
	createColumnId,
	normalizeTableSchema,
	parseDateText,
	parseNumberText,
	primaryColumn,
	resolveColumn
} from './table-schema';
import type { TableColumn, TableRow, TableSchema } from './table-types';

function column(partial: Partial<TableColumn> & Pick<TableColumn, 'type'>): TableColumn {
	return { id: 'c_test0001', name: 'Test', ...partial };
}

function row(
	id: string,
	rowNumber: number,
	cells: TableRow['cells'],
	extra: Partial<TableRow> = {}
): TableRow {
	return {
		id,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: {},
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '2026-10-04T00:00:00Z',
		updated_at: '2026-10-04T00:00:00Z',
		...extra
	};
}

describe('createColumnId', () => {
	it('mints c_ + 8 base36 chars, unique against existing ids', () => {
		const existing = new Set<string>();
		for (let index = 0; index < 200; index += 1) {
			const id = createColumnId(existing);
			expect(id).toMatch(/^c_[0-9a-z]{8}$/);
			expect(existing.has(id)).toBe(false);
			existing.add(id);
		}
	});
});

describe('buildTableSchema + normalizeTableSchema', () => {
	it('builds typed columns with unique names, primary column, and choices', () => {
		const schema = buildTableSchema(
			[
				{ name: 'Company' },
				{ name: 'company' },
				{
					name: 'Stage',
					type: 'select',
					options: {
						choices: [{ value: 'Applied' }, { value: 'applied' }, { value: 'Offer' }]
					}
				},
				{
					name: 'Salary',
					type: 'number',
					options: { format: 'currency', currency: 'usd' }
				},
				{ name: 'Weird', type: 'spreadsheet' as never }
			],
			{ source: { kind: 'chat' } }
		);
		expect(schema.columns.map((entry) => entry.name)).toEqual([
			'Company',
			'company (2)',
			'Stage',
			'Salary',
			'Weird'
		]);
		expect(schema.columns[2]!.options!.choices!.map((choice) => choice.value)).toEqual([
			'Applied',
			'Offer'
		]);
		expect(schema.columns[3]!.options).toEqual({ format: 'currency', currency: 'USD' });
		expect(schema.columns[4]!.type).toBe('text');
		expect(schema.primary_column_id).toBe(schema.columns[0]!.id);
		expect(schema.revision).toBe(0);
		expect(schema.source?.kind).toBe('chat');
	});

	it('gives a blank table one Name column and refuses more than 50 columns', () => {
		expect(buildTableSchema([]).columns.map((entry) => entry.name)).toEqual(['Name']);
		expect(() =>
			buildTableSchema(Array.from({ length: 51 }, (_, index) => ({ name: `C${index}` })))
		).toThrow(TableServiceError);
	});

	it('repairs junk without throwing and keeps existing column ids', () => {
		const repaired = normalizeTableSchema({
			columns: [
				{ id: 'c_keep0001', name: '  Company  ', type: 'text' },
				{ id: 'c_keep0001', name: 'Dup id', type: 'number' },
				{ name: '', type: 'bogus' },
				'not a column'
			],
			revision: '7',
			row_count: -3,
			primary_column_id: 'c_missing'
		});
		expect(repaired.columns[0]).toMatchObject({
			id: 'c_keep0001',
			name: 'Company',
			type: 'text'
		});
		expect(repaired.columns[1]!.id).not.toBe('c_keep0001');
		expect(repaired.columns[2]).toMatchObject({ name: 'Column 3', type: 'text' });
		expect(repaired.columns).toHaveLength(3);
		expect(repaired.revision).toBe(7);
		expect(repaired.row_count).toBe(0);
		expect(repaired.primary_column_id).toBeUndefined();
		expect(normalizeTableSchema(null)).toEqual({
			format: 1,
			columns: [],
			revision: 0,
			row_count: 0
		});
	});

	it('resolves columns by id, then case-insensitive name', () => {
		const schema = buildTableSchema([{ name: 'Company' }, { name: 'Stage' }]);
		expect(resolveColumn(schema, schema.columns[1]!.id)?.name).toBe('Stage');
		expect(resolveColumn(schema, '  company ')?.name).toBe('Company');
		expect(resolveColumn(schema, 'Missing')).toBeNull();
		expect(primaryColumn(schema)?.name).toBe('Company');
	});
});

describe('parsers', () => {
	it('reads spreadsheet number formats', () => {
		expect(parseNumberText('$150k')).toEqual({ value: 150_000, currency: 'USD' });
		expect(parseNumberText('150,000')).toEqual({ value: 150_000 });
		expect(parseNumberText('1.5M')).toEqual({ value: 1_500_000 });
		expect(parseNumberText('(1,200)')).toEqual({ value: -1200 });
		expect(parseNumberText('-$5.25')).toEqual({ value: -5.25, currency: 'USD' });
		expect(parseNumberText('12%')).toEqual({ value: 12, percent: true });
		expect(parseNumberText('€1.200,50')).toEqual({ value: 1200.5, currency: 'EUR' });
		expect(parseNumberText('USD 40')).toEqual({ value: 40, currency: 'USD' });
		expect(parseNumberText('2.5h')).toEqual({ value: 2.5, hours: true });
		expect(parseNumberText('SKU123')).toBeNull();
		expect(parseNumberText('2026-10-04')).toBeNull();
		expect(parseNumberText('abc')).toBeNull();
	});

	it('reads date formats into ISO dates', () => {
		const now = new Date('2026-06-01T00:00:00Z');
		expect(parseDateText('2026-10-04', now)).toBe('2026-10-04');
		expect(parseDateText('Oct 4 2026', now)).toBe('2026-10-04');
		expect(parseDateText('October 4, 2026', now)).toBe('2026-10-04');
		expect(parseDateText('4 Oct 2026', now)).toBe('2026-10-04');
		expect(parseDateText('Mon, Oct 4th 2026', now)).toBe('2026-10-04');
		expect(parseDateText('10/4/2026', now)).toBe('2026-10-04');
		expect(parseDateText('25/12/2026', now)).toBe('2026-12-25');
		expect(parseDateText('4.10.2026', now)).toBe('2026-10-04');
		expect(parseDateText('Oct 4', now)).toBe('2026-10-04');
		expect(parseDateText('2026-10-04 15:30', now)).toBe('2026-10-04T15:30');
		expect(parseDateText('2026-02-30', now)).toBeNull();
		expect(parseDateText('soon', now)).toBeNull();
	});
});

describe('coerceCellValue', () => {
	it('coerces numbers, checkboxes, dates, urls, emails, links', () => {
		const number = column({ type: 'number' });
		expect(coerceCellValue(number, '$150k')).toEqual({ value: 150_000 });
		expect(coerceCellValue(number, '150,000')).toEqual({ value: 150_000 });
		expect(coerceCellValue(number, 42)).toEqual({ value: 42 });
		expect(coerceCellValue(number, 'competitive')).toMatchObject({
			value: null,
			error: expect.stringContaining('not a number')
		});

		const checkbox = column({ type: 'checkbox' });
		expect(coerceCellValue(checkbox, 'yes')).toEqual({ value: true });
		expect(coerceCellValue(checkbox, 'N')).toEqual({ value: false });
		expect(coerceCellValue(checkbox, 'maybe').error).toBeDefined();

		const date = column({ type: 'date' });
		expect(coerceCellValue(date, 'Oct 4 2026')).toEqual({ value: '2026-10-04' });

		const url = column({ type: 'url' });
		expect(coerceCellValue(url, 'acme.com/jobs')).toEqual({ value: 'https://acme.com/jobs' });
		expect(coerceCellValue(url, 'not a url').error).toBeDefined();

		const email = column({ type: 'email' });
		expect(coerceCellValue(email, 'mailto:jo@acme.com')).toEqual({ value: 'jo@acme.com' });

		const link = column({ type: 'link' });
		const id = '11111111-2222-4333-8444-555555555555';
		expect(coerceCellValue(link, `[[task:${id}|Follow up]]`)).toEqual({
			value: { kind: 'task', id, label: 'Follow up' }
		});
		expect(coerceCellValue(link, 'task:nope').error).toBeDefined();
	});

	it('empty input clears; long text is cut with an error', () => {
		const text = column({ type: 'text' });
		expect(coerceCellValue(text, '   ')).toEqual({ value: null });
		expect(coerceCellValue(text, null)).toEqual({ value: null });
		const long = coerceCellValue(text, 'x'.repeat(10_050));
		expect((long.value as string).length).toBe(10_000);
		expect(long.error).toContain('cut');
	});

	it('keeps unknown select values and canonicalizes known ones', () => {
		const stage = column({
			type: 'select',
			options: { choices: [{ value: 'Applied' }, { value: 'Offer' }] }
		});
		expect(coerceCellValue(stage, 'applied')).toEqual({ value: 'Applied' });
		expect(coerceCellValue(stage, 'Ghosted')).toEqual({ value: 'Ghosted' });
		expect(coerceCellValue(stage, ['a', 'b']).error).toContain('pick one');
		const tags = column({ type: 'multi_select', options: { choices: [{ value: 'Remote' }] } });
		expect(coerceCellValue(tags, 'remote, Equity; remote')).toEqual({
			value: ['Remote', 'Equity']
		});
	});
});

describe('coerceRowInput', () => {
	it('maps names to ids, reports unknown columns, bad values, and new choices', () => {
		const schema = buildTableSchema([
			{ name: 'Company' },
			{ name: 'Stage', type: 'select', options: { choices: [{ value: 'Applied' }] } },
			{ name: 'Salary', type: 'number' }
		]);
		const [company, stage, salary] = schema.columns;
		const result = coerceRowInput(schema, {
			company: 'Acme',
			Stage: 'Interview',
			Salary: 'lots',
			Notes: 'x'
		});
		expect(result.cells).toEqual({ [company!.id]: 'Acme', [stage!.id]: 'Interview' });
		expect(result.newChoices).toEqual({ [stage!.id]: ['Interview'] });
		expect(result.errors).toHaveLength(2);
		expect(result.errors.join('\n')).toContain('Salary');
		expect(result.errors.join('\n')).toContain('unknown column "Notes"');
		expect(salary).toBeDefined();
		expect(coerceRowInput(schema, { Salary: null }).cells).toEqual({ [salary!.id]: null });
	});
});

describe('cellToText', () => {
	it('formats by column type', () => {
		expect(
			cellToText(
				column({ type: 'number', options: { format: 'currency', currency: 'USD' } }),
				150000
			)
		).toBe('$150,000');
		expect(cellToText(column({ type: 'number', options: { format: 'percent' } }), 12.5)).toBe(
			'12.5%'
		);
		expect(cellToText(column({ type: 'checkbox' }), true)).toBe('Yes');
		expect(cellToText(column({ type: 'multi_select' }), ['a', 'b'])).toBe('a, b');
		expect(cellToText(column({ type: 'text' }), null)).toBe('');
	});
});

describe('applyColumnChanges', () => {
	function fixture(): { schema: TableSchema; rows: TableRow[] } {
		const schema = buildTableSchema([
			{ name: 'Company' },
			{ name: 'Salary', type: 'text' },
			{ name: 'Stage', type: 'text' }
		]);
		const [company, salary, stage] = schema.columns;
		const rows = [
			row(
				'row-1',
				1,
				{ [company!.id]: 'Acme', [salary!.id]: '$150k', [stage!.id]: 'Applied' },
				{
					cell_meta: { [salary!.id]: { by: 'agent', at: '2026-10-01T00:00:00Z' } }
				}
			),
			row('row-2', 2, {
				[company!.id]: 'Beta',
				[salary!.id]: 'competitive',
				[stage!.id]: 'Offer'
			}),
			row('row-3', 3, { [company!.id]: 'Gamma', [stage!.id]: 'Applied' })
		];
		return { schema, rows };
	}

	it('retypes with coercion ops, keeps unconvertible cells, and preserves provenance', () => {
		const { schema, rows } = fixture();
		const salary = schema.columns[1]!;
		const result = applyColumnChanges(schema, rows, [
			{ action: 'retype', column: 'Salary', type: 'number' }
		]);
		expect(result.schema.columns[1]!.type).toBe('number');
		expect(result.rowOps).toEqual([
			{
				op: 'update',
				row_id: 'row-1',
				cells: { [salary.id]: 150000 },
				cell_meta: { [salary.id]: { by: 'agent', at: '2026-10-01T00:00:00Z' } },
				expected_version: 1
			}
		]);
		expect(result.warnings[0]).toContain('r2');
	});

	it('retyping text to select collects choices from the cells', () => {
		const { schema, rows } = fixture();
		const result = applyColumnChanges(schema, rows, [
			{ action: 'retype', column: 'Stage', type: 'select' }
		]);
		expect(result.schema.columns[2]!.options!.choices!.map((choice) => choice.value)).toEqual([
			'Applied',
			'Offer'
		]);
		expect(result.rowOps).toEqual([]);
	});

	it('adds, renames, moves, and deletes columns (delete clears cells for undo)', () => {
		const { schema, rows } = fixture();
		const stage = schema.columns[2]!;
		const result = applyColumnChanges(schema, rows, [
			{ action: 'add', name: 'Contact', type: 'email', after: 'Company' },
			{ action: 'rename', column: 'Stage', name: 'Status' },
			{ action: 'move', column: 'Status', after: null },
			{ action: 'delete', column: 'Status' }
		]);
		expect(result.schema.columns.map((entry) => entry.name)).toEqual([
			'Company',
			'Contact',
			'Salary'
		]);
		expect(result.rowOps.map((op) => op.op === 'update' && op.cells)).toEqual([
			{ [stage.id]: null },
			{ [stage.id]: null },
			{ [stage.id]: null }
		]);
	});

	it('refuses duplicate names, unknown columns, and deleting the last column', () => {
		const { schema, rows } = fixture();
		expect(() =>
			applyColumnChanges(schema, rows, [{ action: 'add', name: 'company' }])
		).toThrow(/already exists/);
		expect(() =>
			applyColumnChanges(schema, rows, [{ action: 'rename', column: 'Nope', name: 'X' }])
		).toThrow(/Unknown column/);
		const single = buildTableSchema([{ name: 'Only' }]);
		expect(() =>
			applyColumnChanges(single, [], [{ action: 'delete', column: 'Only' }])
		).toThrow(/at least one column/);
	});

	it('updates description, ai question, and hidden flag', () => {
		const { schema, rows } = fixture();
		const result = applyColumnChanges(schema, rows, [
			{
				action: 'update',
				column: 'Company',
				description: 'Employer name',
				ai: { prompt: 'Who is the hiring manager?', research: true },
				hidden: true
			}
		]);
		expect(result.schema.columns[0]).toMatchObject({
			description: 'Employer name',
			hidden: true,
			ai: { prompt: 'Who is the hiring manager?', research: true }
		});
		expect(result.schema.columns[0]!.ai!.updated_at).toBeTruthy();
	});
});
