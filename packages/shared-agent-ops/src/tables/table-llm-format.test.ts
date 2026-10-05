// packages/shared-agent-ops/src/tables/table-llm-format.test.ts
import { describe, expect, it } from 'vitest';
import {
	describeTableSchemaForModel,
	formatTableForModel,
	formatTableForModelDetailed,
	summarizeTableForContext
} from './table-llm-format';
import type { LoadedTable, TableColumn, TableRow, TableSchema } from './table-types';

function row(
	rowNumber: number,
	cells: TableRow['cells'],
	cellMeta: TableRow['cell_meta'] = {}
): TableRow {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: cellMeta,
		version: 1,
		created_by: null,
		updated_by: null,
		created_at: '',
		updated_at: ''
	};
}

const narrow: TableSchema = {
	format: 1,
	revision: 2,
	row_count: 3,
	columns: [
		{ id: 'c_company', name: 'Company', type: 'text' },
		{
			id: 'c_salary',
			name: 'Salary',
			type: 'number',
			options: { format: 'currency', currency: 'USD' }
		},
		{
			id: 'c_manager',
			name: 'Hiring manager',
			type: 'text',
			ai: { prompt: 'Who is the hiring manager?', research: true }
		},
		{ id: 'c_hidden', name: 'Hidden', type: 'text', hidden: true }
	]
};

describe('formatTableForModel', () => {
	it('renders markdown with row handles first, AI markers, pipes escaped, newlines flattened', () => {
		const text = formatTableForModel(
			narrow,
			[
				row(
					12,
					{ c_company: 'Acme | Co', c_salary: 150000, c_manager: 'Jo Lee' },
					{
						c_manager: {
							by: 'ai_column',
							state: 'filled',
							at: '2026-10-04T00:00:00Z',
							source_urls: ['https://acme.com']
						}
					}
				),
				row(
					13,
					{ c_company: 'Beta\nLabs' },
					{ c_manager: { by: 'ai_column', state: 'pending', at: '' } }
				)
			],
			{ totalMatched: 2 }
		);
		expect(text).toBe(
			[
				'| row | Company | Salary | Hiring manager |',
				'| --- | --- | --- | --- |',
				'| r12 | Acme \\| Co | $150,000 | Jo Lee† |',
				'| r13 | Beta<br>Labs |  | (filling…) |',
				'Rows 1–2 of 2',
				'† filled by AI (sources are kept on the cell)'
			].join('\n')
		);
	});

	it('caps long cells with a [+N chars] marker instead of cutting silently', () => {
		const text = formatTableForModel(narrow, [row(1, { c_company: 'x'.repeat(350) })]);
		expect(text).toContain(`${'x'.repeat(300)}…[+50 chars]`);
	});

	it('drops whole rows to fit maxChars and reports the next offset', () => {
		const rows = Array.from({ length: 40 }, (_, index) =>
			row(index + 1, { c_company: `Company number ${index + 1}`, c_salary: 1000 * index })
		);
		const result = formatTableForModelDetailed(narrow, rows, {
			offset: 25,
			totalMatched: 142,
			maxChars: 900
		});
		expect(result.rows_shown).toBeGreaterThan(0);
		expect(result.rows_shown).toBeLessThan(40);
		expect(result.text.length).toBeLessThanOrEqual(900);
		expect(result.next_offset).toBe(25 + result.rows_shown);
		expect(result.text).toContain(
			`Rows 26–${25 + result.rows_shown} of 142 · next offset ${25 + result.rows_shown}`
		);
		// Every rendered row line is complete.
		for (const line of result.text.split('\n').filter((entry) => entry.startsWith('| r'))) {
			expect(line.endsWith('|')).toBe(true);
		}
	});

	it('switches to key-value blocks for wide tables and omits empty cells', () => {
		const columns: TableColumn[] = Array.from({ length: 9 }, (_, index) => ({
			id: `c_${index}`,
			name: `Col ${index}`,
			type: 'text'
		}));
		const wide: TableSchema = { format: 1, revision: 1, row_count: 1, columns };
		const text = formatTableForModel(wide, [row(7, { c_0: 'zero', c_8: 'eight' })]);
		expect(text).toBe(['r7\n- Col 0: zero\n- Col 8: eight', 'Rows 1–1 of 1'].join('\n\n'));
	});

	it('honors requested columns and reports empty results', () => {
		expect(
			formatTableForModel(narrow, [row(1, { c_company: 'Acme', c_hidden: 'secret' })], {
				columns: ['Hidden']
			})
		).toContain('| r1 | secret |');
		expect(formatTableForModel(narrow, [], { totalMatched: 0 })).toBe('No rows.');
	});

	it('says when a single row is too wide for the budget', () => {
		const result = formatTableForModelDetailed(
			narrow,
			[row(1, { c_company: 'x'.repeat(290) })],
			{
				maxChars: 300
			}
		);
		expect(result.rows_shown).toBe(0);
		expect(result.next_offset).toBe(0);
		expect(result.text).toContain('Row r1 is too wide');
	});
});

describe('describeTableSchemaForModel', () => {
	it('lists each column with type, choices, description, and question', () => {
		const schema: TableSchema = {
			format: 1,
			revision: 1,
			row_count: 0,
			columns: [
				{
					id: 'a',
					name: 'Stage',
					type: 'select',
					options: { choices: [{ value: 'Applied' }, { value: 'Offer' }] },
					description: 'Where it stands'
				},
				{
					id: 'b',
					name: 'Salary',
					type: 'number',
					options: { format: 'currency', currency: 'EUR' }
				},
				{
					id: 'c',
					name: 'Manager',
					type: 'text',
					ai: { prompt: 'Who hires?', research: true }
				}
			]
		};
		expect(describeTableSchemaForModel(schema)).toBe(
			[
				'- Stage · select · choices: Applied, Offer · about: Where it stands',
				'- Salary · number (currency EUR)',
				'- Manager · text · question column: "Who hires?" (web research)'
			].join('\n')
		);
	});
});

describe('summarizeTableForContext', () => {
	function loaded(rowCount: number): LoadedTable {
		return {
			document: {
				id: 'doc',
				project_id: 'p',
				title: 'Job applications',
				description: null,
				type_key: 'document.table',
				state_key: 'draft',
				updated_at: ''
			},
			schema: narrow,
			rows: Array.from({ length: rowCount }, (_, index) =>
				row(index + 1, { c_company: `Company ${index + 1}`, c_salary: 100000 + index })
			)
		};
	}

	it('fits schema + first rows within the budget', () => {
		const text = summarizeTableForContext(loaded(42));
		expect(text.length).toBeLessThanOrEqual(3000);
		expect(text.startsWith('Table "Job applications" · 42 rows · 4 columns')).toBe(true);
		expect(text).toContain('- Company · text');
		expect(text).toContain('| r1 | Company 1 |');
		expect(text).toContain('Read more with read_table_rows.');
	});

	it('handles empty tables and tight budgets', () => {
		expect(summarizeTableForContext(loaded(0))).toContain('No rows yet.');
		const tight = summarizeTableForContext(loaded(5), { maxChars: 400 });
		expect(tight.length).toBeLessThanOrEqual(400);
	});
});
