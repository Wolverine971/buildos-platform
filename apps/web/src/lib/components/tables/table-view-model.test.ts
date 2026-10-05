// apps/web/src/lib/components/tables/table-view-model.test.ts
import { describe, expect, it } from 'vitest';
import type { TableApplyResult } from '@buildos/shared-agent-ops/tables';
import { buildJobApplicationsTable, COL } from './fixtures';
import {
	activeFilters,
	applyApplyResult,
	applyLocalColumnChanges,
	applyPendingOps,
	applyView,
	ariaSortFor,
	buildBoardLanes,
	buildViewQuery,
	computeTotals,
	cycleSort,
	defaultViewState,
	filterOpsFor,
	footerCells,
	groupEditsByRow,
	newlyFilledCells,
	normalizeFilterValue,
	orderedVisibleColumns,
	parseStoredViewState,
	patchRowCells,
	remapPendingRowId,
	rowTitle,
	tempRowId,
	type PendingOp,
	type WorkspaceViewState
} from './table-view-model';

function baseView(patch: Partial<WorkspaceViewState> = {}): WorkspaceViewState {
	return {
		mode: 'grid',
		search: '',
		filters: [],
		match: 'all',
		sort: [],
		boardColumnId: COL.status,
		...patch
	};
}

describe('columns + view', () => {
	it('pins the primary column first and drops hidden columns', () => {
		const table = buildJobApplicationsTable();
		table.schema.primary_column_id = COL.role;
		table.schema.columns = table.schema.columns.map((c) =>
			c.id === COL.notes ? { ...c, hidden: true } : c
		);
		const ids = orderedVisibleColumns(table.schema).map((c) => c.id);
		expect(ids[0]).toBe(COL.role);
		expect(ids[1]).toBe(COL.company);
		expect(ids).not.toContain(COL.notes);
	});

	it('runs filters, search and sort through the shared queryTable', () => {
		const table = buildJobApplicationsTable();
		const interviews = applyView(
			table,
			baseView({ filters: [{ column: COL.status, op: 'eq', value: 'Interview' }] })
		);
		expect(interviews.filtered).toBe(true);
		expect(interviews.rows.map((r) => r.cells[COL.company])).toEqual([
			'Northwind Labs',
			'Tidewater Systems',
			'Arcadia Bio'
		]);
		expect(interviews.total).toBe(12);

		const search = applyView(table, baseView({ search: 'harbor' }));
		expect(search.rows).toHaveLength(1);

		const sorted = applyView(
			table,
			baseView({ sort: [{ column: COL.salary, direction: 'desc' }] })
		);
		expect(sorted.rows[0]!.cells[COL.company]).toBe('Harbor Analytics');
		// Empty salaries sort last.
		expect(sorted.rows.at(-1)!.cells[COL.salary]).toBeUndefined();
	});

	it('skips the query entirely when nothing narrows or orders the rows', () => {
		const table = buildJobApplicationsTable();
		const result = applyView(table, baseView());
		expect(result.rows).toBe(table.rows);
		expect(result.filtered).toBe(false);
	});

	it('drops incomplete filters and keeps value-less ops', () => {
		expect(
			activeFilters([
				{ column: COL.status, op: 'eq' },
				{ column: COL.notes, op: 'is_empty' },
				{ column: COL.company, op: 'contains', value: '  ' },
				{ column: COL.salary, op: 'gt', value: 100 }
			])
		).toEqual([
			{ column: COL.notes, op: 'is_empty' },
			{ column: COL.salary, op: 'gt', value: 100 }
		]);
		const query = buildViewQuery(baseView({ search: '  x ' }));
		expect(query.search).toBe('x');
		expect(query.limit).toBe(10_000);
	});

	it('offers filter ops by type and types filter values', () => {
		expect(filterOpsFor({ type: 'number' })).toContain('gte');
		expect(filterOpsFor({ type: 'checkbox' })).toEqual(['eq']);
		expect(normalizeFilterValue({ type: 'number' }, '$150,000')).toBe(150000);
		expect(normalizeFilterValue({ type: 'number' }, 'abc')).toBeUndefined();
		expect(normalizeFilterValue({ type: 'checkbox' }, 'true')).toBe(true);
	});

	it('cycles sort none → asc → desc → none, shift adds a secondary sort', () => {
		let sort = cycleSort([], COL.salary);
		expect(sort).toEqual([{ column: COL.salary, direction: 'asc' }]);
		sort = cycleSort(sort, COL.salary);
		expect(sort).toEqual([{ column: COL.salary, direction: 'desc' }]);
		expect(ariaSortFor(sort, COL.salary)).toBe('descending');
		expect(cycleSort(sort, COL.salary)).toEqual([]);
		const two = cycleSort([{ column: COL.status, direction: 'asc' }], COL.salary, true);
		expect(two.map((s) => s.column)).toEqual([COL.status, COL.salary]);
	});

	it('restores a remembered view and drops references to deleted columns', () => {
		const table = buildJobApplicationsTable();
		const restored = parseStoredViewState(
			{
				mode: 'board',
				filters: [
					{ column: COL.status, op: 'eq', value: 'Applied' },
					{ column: 'c_gone0000', op: 'eq', value: 'x' }
				],
				sort: [{ column: 'c_gone0000', direction: 'asc' }],
				match: 'any',
				boardColumnId: 'c_gone0000'
			},
			table.schema
		);
		expect(restored?.mode).toBe('board');
		expect(restored?.filters).toHaveLength(1);
		expect(restored?.sort).toEqual([]);
		expect(restored?.boardColumnId).toBe(COL.status);
		expect(parseStoredViewState('junk', table.schema)).toBeNull();
	});

	it('seeds from a saved table view when there is one', () => {
		const table = buildJobApplicationsTable();
		table.schema.views = [
			{ id: 'v1', name: 'Pipeline', layout: 'board', group_by: COL.status, sort: [] }
		];
		expect(defaultViewState(table.schema).mode).toBe('board');
	});
});

describe('optimistic edits', () => {
	it('patches cells and clears provenance for touched cells only', () => {
		const table = buildJobApplicationsTable();
		const row = table.rows[0]!;
		const next = patchRowCells(table, [
			{ rowId: row.id, columnId: COL.manager, value: 'Someone Else' },
			{ rowId: row.id, columnId: COL.notes, value: '' }
		]);
		const updated = next.rows[0]!;
		expect(updated.cells[COL.manager]).toBe('Someone Else');
		expect(updated.cell_meta[COL.manager]).toBeUndefined();
		expect(COL.notes in updated.cells).toBe(false);
		expect(table.rows[0]!.cells[COL.manager]).toBe('Priya Raman');
	});

	it('groups edits per row with empty values as null', () => {
		expect(
			groupEditsByRow([
				{ rowId: 'a', columnId: 'c1', value: 'x' },
				{ rowId: 'a', columnId: 'c2', value: '' },
				{ rowId: 'b', columnId: 'c1', value: 3 }
			])
		).toEqual([
			{ rowId: 'a', cells: { c1: 'x', c2: null } },
			{ rowId: 'b', cells: { c1: 3 } }
		]);
	});

	it('replays pending inserts, edits, deletes and column changes over the server copy', () => {
		const table = buildJobApplicationsTable();
		const [first, second] = table.rows;
		const ops: PendingOp[] = [
			{
				id: 1,
				kind: 'insert',
				ref: 'n1',
				cells: { [COL.company]: 'New Co' },
				afterRowId: first!.id
			},
			{
				id: 2,
				kind: 'edit',
				edits: [{ rowId: tempRowId('n1'), columnId: COL.role, value: 'FDE' }]
			},
			{ id: 3, kind: 'delete', rowIds: [second!.id] },
			{
				id: 4,
				kind: 'columns',
				changes: [{ action: 'rename', column: COL.company, name: 'Employer' }]
			}
		];
		const view = applyPendingOps(table, ops);
		expect(view.rows[1]!.id).toBe(tempRowId('n1'));
		expect(view.rows[1]!.cells).toEqual({ [COL.company]: 'New Co', [COL.role]: 'FDE' });
		expect(view.rows[1]!.row_number).toBe(13);
		expect(view.rows.some((r) => r.id === second!.id)).toBe(false);
		expect(view.schema.columns[0]!.name).toBe('Employer');
		// The server copy is untouched.
		expect(table.rows).toHaveLength(12);
	});

	it('remaps temp ids in pending ops once the server assigns a real id', () => {
		const ops: PendingOp[] = [
			{ id: 1, kind: 'edit', edits: [{ rowId: 'tmp:n1', columnId: 'c', value: 1 }] },
			{ id: 2, kind: 'delete', rowIds: ['tmp:n1', 'other'] }
		];
		const remapped = remapPendingRowId(ops, 'tmp:n1', 'real-1');
		expect(remapped[0]!.kind === 'edit' && remapped[0]!.edits[0]!.rowId).toBe('real-1');
		expect(remapped[1]!.kind === 'delete' && remapped[1]!.rowIds).toEqual(['real-1', 'other']);
	});

	it('local column changes rename, hide, move and delete but wait on add/retype', () => {
		const table = buildJobApplicationsTable();
		const schema = applyLocalColumnChanges(table.schema, [
			{ action: 'update', column: COL.notes, hidden: true, width: 300 },
			{ action: 'move', column: COL.salary, after: null },
			{ action: 'delete', column: COL.remote },
			{ action: 'add', name: 'Later' },
			{ action: 'retype', column: COL.contact, type: 'text' }
		]);
		expect(schema.columns[0]!.id).toBe(COL.salary);
		expect(schema.columns.find((c) => c.id === COL.notes)).toMatchObject({
			hidden: true,
			width: 300
		});
		expect(schema.columns.some((c) => c.id === COL.remote)).toBe(false);
		expect(schema.columns.some((c) => c.name === 'Later')).toBe(false);
		expect(schema.columns.find((c) => c.id === COL.contact)!.type).toBe('email');
	});
});

describe('applyApplyResult', () => {
	it('merges inserts (temp → real), updates (version + server values) and deletes', () => {
		const table = buildJobApplicationsTable();
		const [first, second, third] = table.rows;
		const apply: TableApplyResult = {
			document_id: table.document.id,
			revision: 8,
			row_count: 12,
			updated_at: '2026-10-04T16:00:00.000Z',
			results: [
				{
					op: 'insert',
					ref: 'n1',
					row_id: 'real-row',
					row_number: 13,
					version: 1,
					before: null,
					after: { cells: { [COL.company]: 'New Co' }, position: 1500 }
				},
				{
					op: 'update',
					row_id: second!.id,
					row_number: second!.row_number,
					version: 2,
					before: { cells: { [COL.status]: 'Applied', [COL.salary]: 160000 } },
					after: { cells: { [COL.status]: 'Interview', [COL.salary]: null } }
				},
				{
					op: 'delete',
					row_id: third!.id,
					row_number: third!.row_number,
					version: 2,
					before: null,
					after: null
				}
			]
		};
		const merged = applyApplyResult(table, apply, {
			n1: { tempId: 'tmp:n1', cells: { [COL.company]: 'New Co' }, afterRowId: first!.id }
		});
		expect(merged.idMap).toEqual([['tmp:n1', 'real-row']]);
		expect(merged.table.rows[1]!.id).toBe('real-row');
		const updated = merged.table.rows.find((r) => r.id === second!.id)!;
		expect(updated.version).toBe(2);
		expect(updated.cells[COL.status]).toBe('Interview');
		expect(COL.salary in updated.cells).toBe(false);
		// Salary provenance from the agent is cleared because the cell was touched.
		expect(updated.cell_meta[COL.salary]).toBeUndefined();
		// Untouched provenance stays.
		expect(updated.cell_meta[COL.manager]).toBeDefined();
		expect(merged.table.rows.some((r) => r.id === third!.id)).toBe(false);
		expect(merged.table.schema.revision).toBe(8);
		expect(merged.needsRefresh).toBe(false);
	});

	it('asks for a refresh when a result cannot be rebuilt locally', () => {
		const table = buildJobApplicationsTable();
		const merged = applyApplyResult(table, {
			document_id: table.document.id,
			revision: 9,
			row_count: 13,
			updated_at: '2026-10-04T16:00:00.000Z',
			results: [
				{
					op: 'restore',
					row_id: 'x',
					row_number: 99,
					version: 3,
					before: null,
					after: null
				}
			]
		});
		expect(merged.needsRefresh).toBe(true);
	});
});

describe('AI fills', () => {
	it('finds cells that went from pending to filled', () => {
		const prev = buildJobApplicationsTable();
		const next = buildJobApplicationsTable();
		const row = next.rows[1]!;
		row.cells[COL.manager] = 'Lee Morgan';
		row.cell_meta[COL.manager] = { by: 'ai_column', state: 'filled', at: 'now' };
		expect(newlyFilledCells(prev, next)).toEqual([`${row.id}:${COL.manager}`]);
		expect(newlyFilledCells(null, next)).toEqual([]);
	});
});

describe('board', () => {
	it('builds one lane per choice in order, plus extras and a "No value" lane', () => {
		const table = buildJobApplicationsTable();
		table.rows[0]!.cells[COL.status] = 'Ghosted';
		delete table.rows[1]!.cells[COL.status];
		const status = table.schema.columns.find((c) => c.id === COL.status)!;
		const lanes = buildBoardLanes(status, table.rows);
		expect(lanes.map((l) => l.label)).toEqual([
			'Researching',
			'Applied',
			'Interview',
			'Offer',
			'Rejected',
			'Ghosted',
			'No Status'
		]);
		expect(lanes.find((l) => l.label === 'Ghosted')!.rows).toHaveLength(1);
		expect(lanes.at(-1)!.key).toBeNull();
		expect(lanes.at(-1)!.rows).toHaveLength(1);
	});
});

describe('footer', () => {
	it('sums numbers, counts checkboxes and partial fills, and labels row counts', () => {
		const table = buildJobApplicationsTable();
		const columns = orderedVisibleColumns(table.schema);
		const totals = computeTotals(table.schema, table.rows);
		const footer = footerCells(columns, table.rows, totals, {
			primaryColumnId: COL.company,
			matched: 12,
			total: 12
		});
		expect(footer[COL.company]!.text).toBe('12 rows');
		expect(footer[COL.salary]!.text).toBe('Σ $1,520,000');
		expect(footer[COL.remote]!.text).toBe('8 of 12');
		expect(footer[COL.contact]!.text).toBe('4 filled');
		expect(footer[COL.role]!.text).toBe('');

		const filtered = footerCells(columns, table.rows.slice(0, 3), totals, {
			primaryColumnId: COL.company,
			matched: 3,
			total: 12
		});
		expect(filtered[COL.company]!.text).toBe('3 of 12 rows');
	});

	it('titles rows by the primary column', () => {
		const table = buildJobApplicationsTable();
		expect(rowTitle(table.schema, table.rows[0]!)).toBe('Northwind Labs');
		delete table.rows[0]!.cells[COL.company];
		expect(rowTitle(table.schema, table.rows[0]!)).toBe('Row 1');
	});
});
