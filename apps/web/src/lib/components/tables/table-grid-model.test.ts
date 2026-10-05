// apps/web/src/lib/components/tables/table-grid-model.test.ts
import { describe, expect, it } from 'vitest';
import { coerceCellValue, type TableColumn } from '@buildos/shared-agent-ops/tables';
import { buildJobApplicationsTable, COL } from './fixtures';
import {
	buildClear,
	buildFillDown,
	buildPasteChanges,
	collapsed,
	isPrintableKey,
	navigate,
	rangeToTsv,
	scrollLeftForColumn,
	scrollTopForRow,
	selectionRange,
	splitClipboardText,
	tabMove,
	virtualWindow,
	type CoerceCell
} from './table-grid-model';
import { orderedVisibleColumns } from './table-view-model';

const coerce: CoerceCell = (column, raw) => coerceCellValue(column, raw);

function setup() {
	const table = buildJobApplicationsTable();
	const columns = orderedVisibleColumns(table.schema);
	const index = (id: string) => columns.findIndex((c) => c.id === id);
	return { table, rows: table.rows, columns, index };
}

describe('navigation', () => {
	const opts = { rowCount: 10, colCount: 5, pageRows: 4 };

	it('moves with arrows, clamps at edges and jumps with Ctrl/⌘', () => {
		expect(navigate({ row: 0, col: 0 }, 'ArrowUp', opts)).toEqual({ row: 0, col: 0 });
		expect(navigate({ row: 2, col: 2 }, 'ArrowDown', opts)).toEqual({ row: 3, col: 2 });
		expect(navigate({ row: 2, col: 2 }, 'ArrowRight', { ...opts, jump: true })).toEqual({
			row: 2,
			col: 4
		});
		expect(navigate({ row: 2, col: 2 }, 'End', { ...opts, jump: true })).toEqual({
			row: 9,
			col: 4
		});
		expect(navigate({ row: 8, col: 1 }, 'PageDown', opts)).toEqual({ row: 9, col: 1 });
		expect(navigate({ row: 0, col: 0 }, 'x', opts)).toBeNull();
	});

	it('tabs across and wraps rows', () => {
		expect(tabMove({ row: 0, col: 4 }, false, 10, 5)).toEqual({ row: 1, col: 0 });
		expect(tabMove({ row: 1, col: 0 }, true, 10, 5)).toEqual({ row: 0, col: 4 });
		expect(tabMove({ row: 9, col: 4 }, false, 10, 5)).toEqual({ row: 9, col: 4 });
	});

	it('only treats bare single characters as typing', () => {
		expect(isPrintableKey({ key: 'a', ctrlKey: false, metaKey: false, altKey: false })).toBe(
			true
		);
		expect(isPrintableKey({ key: 'c', ctrlKey: false, metaKey: true, altKey: false })).toBe(
			false
		);
		expect(
			isPrintableKey({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false })
		).toBe(false);
	});
});

describe('virtual window', () => {
	it('renders the visible rows plus overscan with spacer heights', () => {
		const win = virtualWindow({
			scrollTop: 3600,
			viewportHeight: 360,
			rowHeight: 36,
			rowCount: 1000,
			overscan: 5
		});
		expect(win.start).toBe(95);
		expect(win.end).toBe(115);
		expect(win.padTop).toBe(95 * 36);
		expect(win.padBottom).toBe((1000 - 115) * 36);
	});

	it('handles empty and short tables', () => {
		expect(
			virtualWindow({ scrollTop: 0, viewportHeight: 400, rowHeight: 36, rowCount: 0 })
		).toEqual({
			start: 0,
			end: 0,
			padTop: 0,
			padBottom: 0
		});
		const short = virtualWindow({
			scrollTop: 0,
			viewportHeight: 400,
			rowHeight: 36,
			rowCount: 3
		});
		expect([short.start, short.end, short.padBottom]).toEqual([0, 3, 0]);
	});

	it('scrolls rows and columns into view only when needed', () => {
		const base = { rowHeight: 36, viewportHeight: 400, headerHeight: 38, footerHeight: 34 };
		expect(scrollTopForRow({ ...base, row: 2, scrollTop: 0 })).toBeNull();
		expect(scrollTopForRow({ ...base, row: 20, scrollTop: 0 })).toBe(21 * 36 - (400 - 72));
		expect(scrollTopForRow({ ...base, row: 1, scrollTop: 500 })).toBe(36);
		const widths = [64, 200, 150, 150, 150];
		expect(
			scrollLeftForColumn({
				col: 4,
				widths,
				pinnedWidth: 264,
				pinnedCount: 2,
				scrollLeft: 0,
				viewportWidth: 500
			})
		).toBe(714 - 500);
		expect(
			scrollLeftForColumn({
				col: 2,
				widths,
				pinnedWidth: 264,
				pinnedCount: 2,
				scrollLeft: 200,
				viewportWidth: 500
			})
		).toBe(0);
		expect(
			scrollLeftForColumn({
				col: 1,
				widths,
				pinnedWidth: 264,
				pinnedCount: 2,
				scrollLeft: 200,
				viewportWidth: 500
			})
		).toBeNull();
	});
});

describe('clipboard', () => {
	it('reads Sheets/Excel TSV including quoted multi-line cells', () => {
		expect(splitClipboardText('a\tb\n"x\ny"\t2\n')).toEqual([
			['a', 'b'],
			['x\ny', '2']
		]);
	});

	it('keeps a single pasted value whole even with commas', () => {
		expect(splitClipboardText('Baltimore, MD')).toEqual([['Baltimore, MD']]);
		expect(splitClipboardText('one\r\ntwo\r\n')).toEqual([['one'], ['two']]);
		expect(splitClipboardText('')).toEqual([['']]);
	});

	it('pastes a block from the active cell, typing values and adding rows past the end', () => {
		const { rows, columns, index } = setup();
		const start = { row: rows.length - 1, col: index(COL.company) };
		const block = [
			['Signal Peak', 'Staff FDE'],
			['Orbit Labs', 'Solutions Engineer'],
			['Tern', '']
		];
		const changes = buildPasteChanges({
			block,
			selection: collapsed(start),
			rows,
			columns,
			coerce
		});
		expect(changes.edits).toEqual([
			{ rowId: rows.at(-1)!.id, columnId: COL.company, value: 'Signal Peak' },
			{ rowId: rows.at(-1)!.id, columnId: COL.role, value: 'Staff FDE' }
		]);
		expect(changes.inserts).toEqual([
			{ [COL.company]: 'Orbit Labs', [COL.role]: 'Solutions Engineer' },
			{ [COL.company]: 'Tern' }
		]);
		expect(changes.errors).toEqual([]);
	});

	it('coerces typed columns and reports values that do not fit', () => {
		const { rows, columns, index } = setup();
		const changes = buildPasteChanges({
			block: [
				['$150k', 'yes'],
				['lots', 'no']
			],
			selection: collapsed({ row: 0, col: index(COL.salary) }),
			rows,
			columns,
			coerce
		});
		expect(changes.edits).toEqual([
			{ rowId: rows[0]!.id, columnId: COL.salary, value: 150000 },
			{ rowId: rows[0]!.id, columnId: COL.remote, value: true },
			{ rowId: rows[1]!.id, columnId: COL.remote, value: false }
		]);
		expect(changes.errors).toHaveLength(1);
		expect(changes.errors[0]).toContain('Salary');
	});

	it('fills a whole selection when one value is pasted over it', () => {
		const { rows, columns, index } = setup();
		const col = index(COL.status);
		const changes = buildPasteChanges({
			block: [['Applied']],
			selection: { anchor: { row: 0, col }, focus: { row: 2, col } },
			rows,
			columns,
			coerce
		});
		expect(changes.edits.map((e) => [e.rowId, e.value])).toEqual([
			[rows[0]!.id, 'Applied'],
			[rows[1]!.id, 'Applied'],
			[rows[2]!.id, 'Applied']
		]);
		expect(changes.inserts).toEqual([]);
	});

	it('counts pasted columns that run past the last column', () => {
		const { rows, columns } = setup();
		const last = columns.length - 1;
		const changes = buildPasteChanges({
			block: [['a', 'b', 'c']],
			selection: collapsed({ row: 0, col: last }),
			rows,
			columns,
			coerce
		});
		expect(changes.edits).toHaveLength(1);
		expect(changes.skippedColumns).toBe(2);
	});

	it('skips linked-item columns', () => {
		const { rows } = setup();
		const columns: TableColumn[] = [
			{ id: 'c_task0001', name: 'Task', type: 'link' },
			{ id: COL.company, name: 'Company', type: 'text' }
		];
		const changes = buildPasteChanges({
			block: [['x', 'Acme']],
			selection: collapsed({ row: 0, col: 0 }),
			rows,
			columns,
			coerce
		});
		expect(changes.skippedReadOnly).toBe(1);
		expect(changes.edits).toEqual([
			{ rowId: rows[0]!.id, columnId: COL.company, value: 'Acme' }
		]);
	});

	it('copies a range as TSV with raw numbers', () => {
		const { rows, columns, index } = setup();
		const tsv = rangeToTsv(
			{
				anchor: { row: 0, col: index(COL.status) },
				focus: { row: 1, col: index(COL.salary) }
			},
			rows,
			columns
		);
		expect(tsv).toBe('Interview\t2026-09-12\t185000\nApplied\t2026-09-20\t160000');
	});
});

describe('fill down + clear', () => {
	it('copies the top row down through the selection', () => {
		const { rows, columns, index } = setup();
		const col = index(COL.status);
		const edits = buildFillDown(
			{ anchor: { row: 0, col }, focus: { row: 2, col } },
			rows,
			columns
		);
		expect(edits).toEqual([
			{ rowId: rows[1]!.id, columnId: COL.status, value: 'Interview' },
			{ rowId: rows[2]!.id, columnId: COL.status, value: 'Interview' }
		]);
	});

	it('fills a single row from the row above', () => {
		const { rows, columns, index } = setup();
		const col = index(COL.remote);
		const edits = buildFillDown(collapsed({ row: 2, col }), rows, columns);
		expect(edits).toEqual([{ rowId: rows[2]!.id, columnId: COL.remote, value: true }]);
		expect(buildFillDown(collapsed({ row: 0, col }), rows, columns)).toEqual([]);
	});

	it('clears only filled cells in the selection', () => {
		const { rows, columns, index } = setup();
		const edits = buildClear(
			{
				anchor: { row: 0, col: index(COL.contact) },
				focus: { row: 2, col: index(COL.contact) }
			},
			rows,
			columns
		);
		expect(edits).toEqual([
			{ rowId: rows[0]!.id, columnId: COL.contact, value: null },
			{ rowId: rows[1]!.id, columnId: COL.contact, value: null }
		]);
	});

	it('normalizes reversed selections', () => {
		expect(selectionRange({ anchor: { row: 5, col: 3 }, focus: { row: 1, col: 0 } })).toEqual({
			top: 1,
			bottom: 5,
			left: 0,
			right: 3
		});
	});
});
