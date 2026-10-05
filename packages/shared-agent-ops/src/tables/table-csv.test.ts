// packages/shared-agent-ops/src/tables/table-csv.test.ts
import { describe, expect, it } from 'vitest';
import {
	findMarkdownTables,
	importRowsToOps,
	inferColumns,
	parseDelimitedText,
	parseMarkdownTable,
	tableToCsv
} from './table-csv';
import { buildTableSchema } from './table-schema';
import type { TableRow, TableSchema } from './table-types';

describe('parseDelimitedText', () => {
	it('parses RFC 4180 quotes, doubled quotes, CRLF, and embedded newlines', () => {
		const csv =
			'﻿Company,Notes,Salary\r\n"Acme, Inc.","Said ""call me""\nnext week",150000\r\nBeta,,90000\r\n';
		const parsed = parseDelimitedText(csv);
		expect(parsed.delimiter).toBe(',');
		expect(parsed.headers).toEqual(['Company', 'Notes', 'Salary']);
		expect(parsed.rows).toEqual([
			['Acme, Inc.', 'Said "call me"\nnext week', '150000'],
			['Beta', '', '90000']
		]);
	});

	it('detects TSV pasted from a spreadsheet', () => {
		const tsv = 'Company\tStage\tSalary\nAcme\tApplied\t$150,000\nBeta\tOffer\t"$90,000"\n';
		const parsed = parseDelimitedText(tsv);
		expect(parsed.delimiter).toBe('\t');
		expect(parsed.rows[0]).toEqual(['Acme', 'Applied', '$150,000']);
		expect(parsed.rows[1]![2]).toBe('$90,000');
	});

	it('detects semicolon CSV, pads ragged rows, names and dedupes headers', () => {
		const parsed = parseDelimitedText('Name;Name;\na;b;c\nd\n\n');
		expect(parsed.delimiter).toBe(';');
		expect(parsed.headers).toEqual(['Name', 'Name (2)', 'Column 3']);
		expect(parsed.rows).toEqual([
			['a', 'b', 'c'],
			['d', '', '']
		]);
	});

	it('drops trailing empty columns and blank lines; handles empty input', () => {
		const parsed = parseDelimitedText('A,B,,\n1,2,,\n,,,\n');
		expect(parsed.headers).toEqual(['A', 'B']);
		expect(parsed.rows).toEqual([['1', '2']]);
		expect(parseDelimitedText('')).toEqual({ headers: [], rows: [], delimiter: ',' });
	});
});

describe('markdown tables', () => {
	const doc = [
		'# Research',
		'',
		'| Company | Notes |',
		'|:--- | ---:|',
		'| Acme | uses a \\| pipe |',
		'| Beta | line one<br>line two |',
		'',
		'```',
		'| Not | A table |',
		'| --- | --- |',
		'| x | y |',
		'```',
		'',
		'Name | Score',
		'--- | ---',
		'Gamma | 3',
		'Delta',
		'text after'
	].join('\n');

	it('finds every GFM table outside fenced code, with offsets', () => {
		const tables = findMarkdownTables(doc);
		expect(tables).toHaveLength(2);
		expect(tables[0]!.headers).toEqual(['Company', 'Notes']);
		expect(tables[0]!.rows).toEqual([
			['Acme', 'uses a | pipe'],
			['Beta', 'line one\nline two']
		]);
		expect(doc.slice(tables[0]!.start, tables[0]!.end)).toBe(
			'| Company | Notes |\n|:--- | ---:|\n| Acme | uses a \\| pipe |\n| Beta | line one<br>line two |'
		);
		expect(tables[1]!.headers).toEqual(['Name', 'Score']);
		expect(tables[1]!.rows).toEqual([['Gamma', '3']]);
	});

	it('parseMarkdownTable returns the first table or null', () => {
		expect(parseMarkdownTable(doc)?.headers).toEqual(['Company', 'Notes']);
		expect(parseMarkdownTable('no tables here\n---')).toBeNull();
		expect(parseMarkdownTable('a | b\n---')).toBeNull();
	});
});

describe('inferColumns', () => {
	it('infers types from values, never from header names', () => {
		const headers = [
			'Company',
			'Salary',
			'Applied',
			'Remote',
			'Email',
			'Link',
			'Zip',
			'Stage',
			'Notes',
			'Status'
		];
		const stages = [
			'Applied',
			'Interview',
			'Applied',
			'Offer',
			'Applied',
			'Interview',
			'Applied',
			'Rejected'
		];
		const rows = stages.map((stage, index) => [
			`Company ${index}`,
			index % 2 ? '$150k' : '$90,000',
			`Oct ${index + 1} 2026`,
			index % 2 ? 'yes' : 'no',
			`person${index}@acme.com`,
			`https://acme.com/jobs/${index}`,
			`0213${index}`,
			stage,
			index === 0 ? 'x'.repeat(130) : 'short',
			''
		]);
		const inferred = inferColumns(headers, rows);
		expect(inferred.map((column) => column.type)).toEqual([
			'text',
			'number',
			'date',
			'checkbox',
			'email',
			'url',
			'text',
			'select',
			'long_text',
			'text'
		]);
		expect(inferred[1]!.options).toEqual({ format: 'currency', currency: 'USD' });
		expect(inferred[7]!.options!.choices!.map((choice) => choice.value)).toEqual([
			'Applied',
			'Interview',
			'Offer',
			'Rejected'
		]);
	});

	it('does not infer select from few rows or all-distinct values', () => {
		expect(inferColumns(['Stage'], [['A'], ['B'], ['A']])[0]!.type).toBe('text');
	});
});

describe('importRowsToOps', () => {
	it('maps headers to columns, coerces cells, skips blank rows, reports problems', () => {
		const schema = buildTableSchema([{ name: 'Company' }, { name: 'Salary', type: 'number' }]);
		const [company, salary] = schema.columns;
		const result = importRowsToOps(
			schema,
			[
				['Acme', '$150k', 'ignored'],
				['', '', ''],
				['Beta', 'lots', 'x']
			],
			['company', 'Salary', 'Extra']
		);
		expect(result.ops).toEqual([
			{ op: 'insert', cells: { [company!.id]: 'Acme', [salary!.id]: 150000 } },
			{ op: 'insert', cells: { [company!.id]: 'Beta' } }
		]);
		expect(result.errors).toEqual([
			'Column "Extra" is not in this table; its values were skipped.',
			'Row 3, Salary: "lots" is not a number'
		]);
	});
});

describe('tableToCsv', () => {
	it('quotes, uses CRLF, keeps numbers raw, and neutralizes formula injection', () => {
		const schema: TableSchema = {
			format: 1,
			revision: 1,
			row_count: 1,
			columns: [
				{ id: 'c_a', name: 'Company', type: 'text' },
				{ id: 'c_b', name: 'Delta', type: 'number' },
				{ id: 'c_c', name: 'Remote', type: 'checkbox' },
				{ id: 'c_d', name: 'Tags', type: 'multi_select' },
				{ id: 'c_e', name: '=Formula header', type: 'text' }
			]
		};
		const rows: TableRow[] = [
			{
				id: 'r1',
				row_number: 1,
				position: 1024,
				cells: {
					c_a: '=HYPERLINK("x")',
					c_b: -5,
					c_c: true,
					c_d: ['a', 'b'],
					c_e: '@SUM(A1)'
				},
				cell_meta: {},
				version: 1,
				created_by: null,
				updated_by: null,
				created_at: '',
				updated_at: ''
			},
			{
				id: 'r2',
				row_number: 2,
				position: 2048,
				cells: { c_a: 'Line 1\nLine 2', c_e: '+1' },
				cell_meta: {},
				version: 1,
				created_by: null,
				updated_by: null,
				created_at: '',
				updated_at: ''
			}
		];
		expect(tableToCsv(schema, rows)).toBe(
			[
				"Company,Delta,Remote,Tags,'=Formula header",
				`"'=HYPERLINK(""x"")",-5,TRUE,"a, b",'@SUM(A1)`,
				`"Line 1\nLine 2",,,,'+1`
			].join('\r\n')
		);
	});

	it('round-trips through parseDelimitedText', () => {
		const schema = buildTableSchema([{ name: 'Name' }, { name: 'Note' }]);
		const [name, note] = schema.columns;
		const csv = tableToCsv(schema, [
			{
				id: 'r1',
				row_number: 1,
				position: 1,
				cells: { [name!.id]: 'Acme, "Inc"', [note!.id]: 'two\r\nlines' },
				cell_meta: {},
				version: 1,
				created_by: null,
				updated_by: null,
				created_at: '',
				updated_at: ''
			}
		]);
		expect(parseDelimitedText(csv).rows).toEqual([['Acme, "Inc"', 'two\r\nlines']]);
	});
});
