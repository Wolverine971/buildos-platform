// packages/shared-agent-ops/src/tables/table-change.test.ts
import { describe, expect, it } from 'vitest';
import { buildTableChangeReceipt, previewTableRowChanges } from './table-change';
import type { LoadedTable, TableApplyResult, TableRow, TableSchema } from './table-types';

const schema: TableSchema = {
	format: 1,
	revision: 4,
	row_count: 3,
	primary_column_id: 'c_company',
	columns: [
		{ id: 'c_company', name: 'Company', type: 'text' },
		{ id: 'c_stage', name: 'Stage', type: 'text' }
	]
};

function row(rowNumber: number, cells: TableRow['cells'], extra: Partial<TableRow> = {}): TableRow {
	return {
		id: `row-${rowNumber}`,
		row_number: rowNumber,
		position: rowNumber * 1024,
		cells,
		cell_meta: {},
		version: 2,
		created_by: null,
		updated_by: null,
		created_at: '',
		updated_at: '',
		...extra
	};
}

const document = {
	id: 'doc-1',
	project_id: 'project-1',
	title: 'Pipeline',
	description: null,
	type_key: 'document.table',
	state_key: 'draft',
	updated_at: ''
};

function loaded(): LoadedTable {
	return {
		document,
		schema,
		rows: [
			row(1, { c_company: 'Acme', c_stage: 'Applied' }),
			row(2, { c_company: 'Beta' }),
			row(3, { c_company: 'Gamma', c_stage: 'Offer' }, { deleted_at: '2026-10-01T00:00:00Z' })
		]
	};
}

describe('buildTableChangeReceipt', () => {
	const apply: TableApplyResult = {
		document_id: 'doc-1',
		revision: 5,
		row_count: 3,
		updated_at: '2026-10-04T00:00:00Z',
		results: [
			{
				op: 'insert',
				ref: null,
				row_id: 'row-9',
				row_number: 9,
				version: 1,
				before: null,
				after: { cells: { c_company: 'Delta', c_stage: 'Applied' }, cell_meta: {} }
			},
			{
				op: 'update',
				row_id: 'row-1',
				row_number: 1,
				version: 3,
				before: {
					cells: { c_stage: 'Applied' },
					cell_meta: { c_stage: { by: 'ai_column', state: 'filled', at: 'then' } }
				},
				after: { cells: { c_company: 'Acme', c_stage: 'Interview' }, cell_meta: {} }
			},
			{
				op: 'update',
				row_id: 'row-1',
				row_number: 1,
				version: 4,
				before: { cells: { c_company: 'Acme' }, cell_meta: { c_company: null } },
				after: { cells: { c_company: 'Acme Corp', c_stage: 'Interview' }, cell_meta: {} }
			},
			{
				op: 'delete',
				row_id: 'row-2',
				row_number: 2,
				version: 3,
				before: { cells: { c_company: 'Beta' }, cell_meta: {} },
				after: null
			},
			{
				op: 'move',
				row_id: 'row-5',
				row_number: 5,
				version: 7,
				before: { position: 5120 },
				after: { position: 100 }
			}
		]
	};

	it('counts rows and cells and samples readable diffs, updates first', () => {
		const receipt = buildTableChangeReceipt({ table: loaded(), apply });
		expect(receipt).toMatchObject({
			kind: 'table_change',
			document_id: 'doc-1',
			project_id: 'project-1',
			title: 'Pipeline',
			revision: 5,
			applied_revision: 5,
			rows_added: 1,
			rows_updated: 2,
			rows_deleted: 1,
			cells_changed: 4,
			columns_changed: [],
			inverse_schema: null
		});
		expect(receipt.sample).toEqual([
			{ row: 'r1', column: 'Stage', before: 'Applied', after: 'Interview' },
			{ row: 'r1', column: 'Company', before: 'Acme', after: 'Acme Corp' },
			{ row: 'r9', column: 'Company', before: '', after: 'Delta' },
			{ row: 'r2', column: 'Company', before: 'Beta', after: '' }
		]);
	});

	it('builds inverse ops in reverse order, guarding only the last version per row', () => {
		const receipt = buildTableChangeReceipt({ table: loaded(), apply });
		expect(receipt.inverse_ops).toEqual([
			{ op: 'move', row_id: 'row-5', position: 5120 },
			{ op: 'restore', row_id: 'row-2' },
			{
				op: 'update',
				row_id: 'row-1',
				cells: { c_company: 'Acme' },
				cell_meta: { c_company: null },
				expected_version: 4
			},
			{
				op: 'update',
				row_id: 'row-1',
				cells: { c_stage: 'Applied' },
				cell_meta: { c_stage: { by: 'ai_column', state: 'filled', at: 'then' } }
			},
			{ op: 'delete', row_id: 'row-9', expected_version: 1 }
		]);
	});

	it('reports column changes and keeps the previous schema for undo', () => {
		const next: TableSchema = {
			...schema,
			columns: [
				{ id: 'c_stage', name: 'Status', type: 'text' },
				{ id: 'c_company', name: 'Company', type: 'text', width: 300 },
				{ id: 'c_new', name: 'Contact', type: 'email' }
			]
		};
		const receipt = buildTableChangeReceipt({
			table: { document, schema: next },
			apply: { ...apply, results: [] },
			previousSchema: schema
		});
		expect(receipt.columns_changed).toEqual(['Status', 'Company', 'Contact']);
		expect(receipt.inverse_schema).toBe(schema);
		const widthOnly = buildTableChangeReceipt({
			table: {
				document,
				schema: {
					...schema,
					columns: [{ ...schema.columns[0]!, width: 99 }, schema.columns[1]!]
				}
			},
			apply: { ...apply, results: [] },
			previousSchema: schema
		});
		expect(widthOnly.columns_changed).toEqual([]);
	});
});

describe('previewTableRowChanges', () => {
	it('dry-runs inserts, updates, deletes and restores', () => {
		const preview = previewTableRowChanges(loaded(), [
			{ op: 'insert', cells: { c_company: 'Delta' } },
			{
				op: 'update',
				row_id: 'row-1',
				cells: { c_stage: 'Interview', c_company: 'Acme' },
				expected_version: 2
			},
			{ op: 'update', row_id: 'row-2', cells: { c_stage: 'Applied' } },
			{ op: 'delete', row_id: 'row-2' },
			{ op: 'restore', row_id: 'row-3' }
		]);
		expect(preview).toEqual({
			rows_added: 2,
			rows_updated: 2,
			rows_deleted: 1,
			cells_changed: 3,
			sample: [
				{ row: 'r1', column: 'Stage', before: 'Applied', after: 'Interview' },
				{ row: 'new row 1', column: 'Company', before: '', after: 'Delta' },
				{ row: 'r2', column: 'Stage', before: '', after: 'Applied' },
				{ row: 'r2', column: 'Company', before: 'Beta', after: '' }
			],
			errors: []
		});
	});

	it('reports unknown rows, unknown columns, and stale versions', () => {
		const preview = previewTableRowChanges(loaded(), [
			{ op: 'update', row_id: 'row-404', cells: { c_stage: 'x' } },
			{ op: 'update', row_id: 'row-1', cells: { c_nope: 'x' }, expected_version: 1 },
			{ op: 'delete', row_id: 'row-3' },
			{ op: 'restore', row_id: 'row-1' }
		]);
		expect(preview.errors).toEqual([
			'Row row-404 was not found (it may have been deleted).',
			'Row r1 changed since it was read; read it again.',
			'r1: unknown column id "c_nope".',
			'Row row-3 was not found (it may already be deleted).',
			'Row row-1 is not a deleted row of this table.'
		]);
	});
});
