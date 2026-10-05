// packages/shared-agent-ops/src/tables/table-query.test.ts
import { describe, expect, it } from 'vitest';
import { computeColumnTotals, queryTable } from './table-query';
import type { LoadedTable, TableColumn, TableRow, TableSchema } from './table-types';

const columns: TableColumn[] = [
	{ id: 'c_company', name: 'Company', type: 'text' },
	{
		id: 'c_stage',
		name: 'Stage',
		type: 'select',
		options: { choices: [{ value: 'Applied' }, { value: 'Interview' }, { value: 'Offer' }] }
	},
	{
		id: 'c_salary',
		name: 'Salary',
		type: 'number',
		options: { format: 'currency', currency: 'USD' }
	},
	{ id: 'c_applied', name: 'Applied on', type: 'date' },
	{ id: 'c_remote', name: 'Remote', type: 'checkbox' },
	{ id: 'c_tags', name: 'Tags', type: 'multi_select' },
	{ id: 'c_secret', name: 'Secret', type: 'text', hidden: true }
];

function row(rowNumber: number, cells: TableRow['cells']): TableRow {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: {},
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '2026-10-04T00:00:00Z',
		updated_at: '2026-10-04T00:00:00Z'
	};
}

function table(): LoadedTable {
	const schema: TableSchema = { format: 1, columns, revision: 3, row_count: 5 };
	return {
		document: {
			id: 'doc-1',
			project_id: 'project-1',
			title: 'Job applications',
			description: null,
			type_key: 'document.table',
			state_key: 'draft',
			updated_at: '2026-10-04T00:00:00Z'
		},
		schema,
		rows: [
			row(1, {
				c_company: 'Acme',
				c_stage: 'Applied',
				c_salary: 150000,
				c_applied: '2026-09-01',
				c_remote: true,
				c_tags: ['Remote', 'Equity']
			}),
			row(2, {
				c_company: 'Beta',
				c_stage: 'Offer',
				c_salary: 120000,
				c_applied: '2026-09-15',
				c_tags: ['Equity']
			}),
			row(3, {
				c_company: 'Gamma',
				c_stage: 'Interview',
				c_applied: '2026-10-01T09:30',
				c_remote: false
			}),
			row(4, {
				c_company: 'delta',
				c_stage: 'Applied',
				c_salary: 90000,
				c_secret: 'hidden text'
			}),
			row(5, { c_company: 'Epsilon', c_salary: 200000, c_remote: true })
		]
	};
}

describe('queryTable', () => {
	it('returns all live rows with visible columns by default', () => {
		const result = queryTable(table(), {});
		expect(result.total_rows).toBe(5);
		expect(result.matched_rows).toBe(5);
		expect(result.rows).toHaveLength(5);
		expect(result.columns.map((column) => column.name)).not.toContain('Secret');
		expect(result.next_offset).toBeNull();
		expect(result.warnings).toBeUndefined();
	});

	it('filters numbers numerically, dates as ISO, text case-insensitively', () => {
		const t = table();
		expect(
			queryTable(t, { filters: [{ column: 'salary', op: 'gte', value: '$120k' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([1, 2, 5]);
		expect(
			queryTable(t, {
				filters: [{ column: 'Applied on', op: 'lte', value: '2026-10-01' }]
			}).rows.map((r) => r.row_number)
		).toEqual([1, 2, 3]);
		expect(
			queryTable(t, {
				filters: [{ column: 'Applied on', op: 'eq', value: 'Oct 1 2026' }]
			}).rows.map((r) => r.row_number)
		).toEqual([3]);
		expect(
			queryTable(t, { filters: [{ column: 'Company', op: 'eq', value: 'DELTA' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([4]);
		expect(
			queryTable(t, {
				filters: [{ column: 'Company', op: 'contains', value: 'ta' }]
			}).rows.map((r) => r.row_number)
		).toEqual([2, 4]);
		expect(
			queryTable(t, {
				filters: [{ column: 'Stage', op: 'in', value: ['offer', 'Interview'] }]
			}).rows.map((r) => r.row_number)
		).toEqual([2, 3]);
		expect(
			queryTable(t, { filters: [{ column: 'Tags', op: 'eq', value: 'equity' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([1, 2]);
		expect(
			queryTable(t, { filters: [{ column: 'Remote', op: 'eq', value: 'yes' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([1, 5]);
		expect(
			queryTable(t, { filters: [{ column: 'Remote', op: 'is_empty' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([2, 3, 4]);
		expect(
			queryTable(t, { filters: [{ column: 'Salary', op: 'is_empty' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([3]);
		expect(
			queryTable(t, { filters: [{ column: 'row', op: 'in', value: ['r2', 'r4'] }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([2, 4]);
	});

	it('combines filters with all (default) or any', () => {
		const t = table();
		const filters = [
			{ column: 'Stage', op: 'eq' as const, value: 'Applied' },
			{ column: 'Remote', op: 'eq' as const, value: true }
		];
		expect(queryTable(t, { filters }).rows.map((r) => r.row_number)).toEqual([1]);
		expect(queryTable(t, { filters, match: 'any' }).rows.map((r) => r.row_number)).toEqual([
			1, 4, 5
		]);
	});

	it('warns instead of throwing on unknown columns, ops, and unreadable values', () => {
		const result = queryTable(table(), {
			filters: [
				{ column: 'Nope', op: 'eq', value: 'x' },
				{ column: 'Stage', op: 'like' as never, value: 'x' },
				{ column: 'Salary', op: 'gt', value: 'lots' }
			],
			sort: [{ column: 'Missing', direction: 'asc' }],
			columns: ['Company', 'Ghost']
		});
		expect(result.rows).toHaveLength(0);
		expect(result.warnings).toHaveLength(5);
		expect(result.warnings!.join('\n')).toContain('Unknown column "Nope"');
		expect(result.warnings!.join('\n')).toContain('matches no rows');
		expect(result.columns.map((column) => column.name)).toEqual(['Company']);
	});

	it('sorts by type with empties last in both directions, and by choice order', () => {
		const t = table();
		expect(
			queryTable(t, { sort: [{ column: 'Salary', direction: 'desc' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([5, 1, 2, 4, 3]);
		expect(
			queryTable(t, { sort: [{ column: 'Salary', direction: 'asc' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([4, 2, 1, 5, 3]);
		expect(
			queryTable(t, { sort: [{ column: 'Stage', direction: 'asc' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([1, 4, 3, 2, 5]);
		expect(
			queryTable(t, { sort: [{ column: 'Company', direction: 'asc' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([1, 2, 4, 5, 3]);
		expect(
			queryTable(t, { sort: [{ column: 'row', direction: 'desc' }] }).rows.map(
				(r) => r.row_number
			)
		).toEqual([5, 4, 3, 2, 1]);
	});

	it('searches visible cells only', () => {
		const t = table();
		expect(queryTable(t, { search: 'equity' }).rows.map((r) => r.row_number)).toEqual([1, 2]);
		expect(queryTable(t, { search: 'hidden text' }).rows).toHaveLength(0);
	});

	it('pages with limit/offset and reports next_offset', () => {
		const t = table();
		const first = queryTable(t, { limit: 2 });
		expect(first.rows.map((r) => r.row_number)).toEqual([1, 2]);
		expect(first.next_offset).toBe(2);
		const last = queryTable(t, { limit: 2, offset: 4 });
		expect(last.rows.map((r) => r.row_number)).toEqual([5]);
		expect(last.next_offset).toBeNull();
	});

	it('computes aggregates over every matching row, not just the page', () => {
		const result = queryTable(table(), {
			limit: 1,
			aggregates: [
				{ fn: 'count' },
				{ fn: 'sum', column: 'Salary' },
				{ fn: 'avg', column: 'Salary' },
				{ fn: 'min', column: 'Applied on' },
				{ fn: 'max', column: 'Salary' },
				{ fn: 'count_empty', column: 'Stage' },
				{ fn: 'distinct', column: 'Stage' },
				{ fn: 'sum', column: 'Company' }
			]
		});
		expect(result.rows).toHaveLength(1);
		expect(result.aggregates).toEqual({
			count: 5,
			'sum:Salary': 560000,
			'avg:Salary': 140000,
			'min:Applied on': '2026-09-01',
			'max:Salary': 200000,
			'count_empty:Stage': 1,
			'distinct:Stage': 3,
			'sum:Company': null
		});
		expect(result.warnings).toEqual(['sum needs a number column; "Company" is text.']);
	});

	it('groups by a select column in choice order with per-group aggregates', () => {
		const result = queryTable(table(), {
			group_by: 'Stage',
			aggregates: [{ fn: 'sum', column: 'Salary' }]
		});
		expect(result.groups).toEqual([
			{ key: 'Applied', label: 'Applied', count: 2, aggregates: { 'sum:Salary': 240000 } },
			{ key: 'Interview', label: 'Interview', count: 1, aggregates: { 'sum:Salary': 0 } },
			{ key: 'Offer', label: 'Offer', count: 1, aggregates: { 'sum:Salary': 120000 } },
			{ key: null, label: '(empty)', count: 1, aggregates: { 'sum:Salary': 200000 } }
		]);
	});

	it('counts multi-select rows in each of their groups', () => {
		const result = queryTable(table(), { group_by: 'Tags' });
		expect(result.groups!.map((group) => [group.label, group.count])).toEqual([
			['Equity', 2],
			['Remote', 1],
			['(empty)', 3]
		]);
	});
});

describe('computeColumnTotals', () => {
	it('sums number columns and counts filled cells elsewhere (checked for checkboxes)', () => {
		const t = table();
		const totals = computeColumnTotals(t.schema, t.rows);
		expect(totals.c_salary).toBe(560000);
		expect(totals.c_company).toBe(5);
		expect(totals.c_stage).toBe(4);
		expect(totals.c_remote).toBe(2);
		expect(totals.c_tags).toBe(2);
	});
});
