// apps/web/src/lib/server/tables/table-revert.test.ts
import { describe, expect, it } from 'vitest';
import type { TableSchema } from '@buildos/shared-agent-ops/tables';
import { combineTableChangeReceipts, schemaForRevertValidation } from './table-revert';

const TABLE = 'a7ab0000-0000-4000-8000-000000000004';

function schema(columnIds: string[], revision = 1): TableSchema {
	return {
		format: 1,
		revision,
		row_count: 2,
		columns: columnIds.map((id) => ({ id, name: id.toUpperCase(), type: 'text' as const }))
	};
}

function receipt(overrides: Record<string, unknown>) {
	return {
		kind: 'table_change',
		document_id: TABLE,
		applied_revision: 5,
		inverse_ops: [],
		inverse_schema: null,
		...overrides
	};
}

describe('combineTableChangeReceipts', () => {
	it('folds "add a column, then fill it" into one undo: newest ops first, earliest schema', () => {
		const addColumn = receipt({ applied_revision: 6, inverse_schema: schema(['c_a'], 5) });
		const fill = receipt({
			applied_revision: 7,
			inverse_ops: [
				{ op: 'update', row_id: 'row-1', cells: { c_new: null }, expected_version: 3 },
				{ op: 'update', row_id: 'row-2', cells: { c_new: null }, expected_version: 2 }
			]
		});

		const combined = combineTableChangeReceipts(TABLE, [addColumn, fill]);
		expect(combined).toEqual({
			ok: true,
			newestRevision: 7,
			ops: [
				{ op: 'update', row_id: 'row-1', cells: { c_new: null } },
				{ op: 'update', row_id: 'row-2', cells: { c_new: null } }
			],
			inverseSchema: schema(['c_a'], 5)
		});
	});

	it('orders by revision regardless of input order and keeps the earliest column change', () => {
		const first = receipt({
			applied_revision: 3,
			inverse_schema: schema(['c_a'], 2),
			inverse_ops: [{ op: 'delete', row_id: 'r-first' }]
		});
		const second = receipt({
			applied_revision: 4,
			inverse_schema: schema(['c_a', 'c_b'], 3),
			inverse_ops: [{ op: 'delete', row_id: 'r-second' }]
		});
		const combined = combineTableChangeReceipts(TABLE, [second, first]);
		expect(combined.ok && combined.ops).toEqual([
			{ op: 'delete', row_id: 'r-second' },
			{ op: 'delete', row_id: 'r-first' }
		]);
		expect(combined.ok && combined.inverseSchema).toEqual(schema(['c_a'], 2));
		expect(combined.ok && combined.newestRevision).toBe(4);
	});

	it('refuses receipts from another table or without a revision', () => {
		expect(
			combineTableChangeReceipts(TABLE, [receipt({ document_id: 'other' }), receipt({})])
		).toMatchObject({ ok: false });
		expect(
			combineTableChangeReceipts(TABLE, [receipt({ applied_revision: null }), receipt({})])
		).toMatchObject({ ok: false });
		expect(combineTableChangeReceipts(TABLE, [{ kind: 'document_change' }])).toMatchObject({
			ok: false
		});
	});

	it('reports nothing to undo when no receipt carries ops or a schema', () => {
		expect(combineTableChangeReceipts(TABLE, [receipt({}), receipt({})])).toEqual({
			ok: false,
			error: 'Nothing to undo'
		});
	});
});

describe('schemaForRevertValidation', () => {
	it('keeps the restored columns and adds current-only ones so their clears validate', () => {
		const merged = schemaForRevertValidation(schema(['c_a']), schema(['c_a', 'c_new'], 7));
		expect(merged.columns.map((column) => column.id)).toEqual(['c_a', 'c_new']);
		expect(merged.revision).toBe(1);
	});
});
