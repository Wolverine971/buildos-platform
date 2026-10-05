// apps/web/src/lib/components/agent/agent-chat-tool-presenter.tables.test.ts
//
// BuildOS Tables (2026-10-04): table tools read in plain words built from the
// call's structured arguments, a table write refreshes the table document, and
// a table change receipt gets the "Title · +3 rows · 7 cells" toast.
import { describe, expect, it, vi } from 'vitest';
import { createToolPresenter, type ToolPresenterContext } from './agent-chat-tool-presenter';
import type { TableChangeReceipt } from './table-change-cards';

function presenterWith(overrides: Partial<ToolPresenterContext> = {}) {
	const success = vi.fn();
	const onDocumentMutation = vi.fn();
	const presenter = createToolPresenter({
		getContextType: () => 'project',
		getEntityId: () => 'project-1',
		getContextLabel: () => 'Job hunt',
		getProjectFocus: () => null,
		getResolvedProjectFocus: () => null,
		toast: { success, error: vi.fn() },
		onDocumentMutation,
		isDev: false,
		...overrides
	});
	presenter.cacheEntityName('document', 'table-1', 'Job applications');
	return { presenter, success, onDocumentMutation };
}

describe('table tool display', () => {
	it('describes reads by what they do', () => {
		const { presenter } = presenterWith();
		expect(
			presenter.formatToolMessage(
				'get_onto_table_details',
				{ table_id: 'table-1' },
				'pending'
			)
		).toBe('Opening table: "Job applications"');
		expect(
			presenter.formatToolMessage(
				'read_table_rows',
				{ table_id: 'table-1', group_by: 'Status' },
				'pending'
			)
		).toBe('Grouping table rows: "Job applications"');
		expect(
			presenter.formatToolMessage(
				'read_table_rows',
				{
					table_id: 'table-1',
					filters: [{ column: 'Status', op: 'eq', value: 'Interview' }]
				},
				'pending'
			)
		).toBe('Filtering table rows: "Job applications"');
	});

	it('counts row and column changes from the call', () => {
		const { presenter } = presenterWith();
		expect(
			presenter.formatToolMessage(
				'update_onto_table_rows',
				{
					table_id: 'table-1',
					add: [{ values: {} }, { values: {} }, { values: {} }],
					delete: ['r4']
				},
				'pending'
			)
		).toBe('Adding 3 rows, deleting 1 row in table: "Job applications"');
		expect(
			presenter.formatToolMessage(
				'update_onto_table',
				{ table_id: 'table-1', column_changes: [{ action: 'add', name: 'Remote policy' }] },
				'pending'
			)
		).toContain('Adding a column');
	});

	it('reports a table write as a change to the table document', () => {
		const { presenter, onDocumentMutation } = presenterWith();
		presenter.recordDataMutation(
			'update_onto_table_rows',
			{ table_id: 'table-1', add: [{ values: {} }] },
			true,
			{ result: { document: { id: 'table-1', project_id: 'project-1' } } },
			{ turnId: null }
		);
		expect(onDocumentMutation).toHaveBeenCalledWith(
			expect.objectContaining({ entityKind: 'document', entityId: 'table-1' })
		);
	});

	it('toasts a change receipt as "Title · +3 rows · 7 cells"', () => {
		const { presenter, success } = presenterWith();
		presenter.showTableChangeToast({
			kind: 'table_change',
			document_id: 'table-1',
			project_id: 'project-1',
			title: 'Job applications',
			revision: 4,
			applied_revision: 5,
			rows_added: 3,
			rows_updated: 0,
			rows_deleted: 0,
			cells_changed: 7,
			columns_changed: [],
			sample: [],
			inverse_ops: []
		} as TableChangeReceipt);
		expect(success).toHaveBeenCalledWith('Job applications · +3 rows · 7 cells');
	});
});
