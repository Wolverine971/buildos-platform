// apps/web/src/lib/components/tables/table-controller.svelte.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	LoadedTable,
	TableApplyResult,
	TableChangeReceipt,
	TableRowOp
} from '@buildos/shared-agent-ops/tables';
import { TableClientError, type TableClient } from './table-client';
import { createTableController, type TableNotifier } from './table-controller.svelte';
import {
	buildJobApplicationsTable,
	COL,
	createMemoryTableClient,
	FIXTURE_DOCUMENT_ID,
	FIXTURE_PROJECT_ID
} from './fixtures';
import { cellKey, tempRowId } from './table-view-model';

function receiptFor(ops: TableRowOp[]): TableChangeReceipt {
	return {
		kind: 'table_change',
		document_id: FIXTURE_DOCUMENT_ID,
		project_id: FIXTURE_PROJECT_ID,
		title: 'Job applications',
		revision: 8,
		rows_added: ops.filter((op) => op.op === 'insert').length,
		rows_updated: ops.filter((op) => op.op === 'update').length,
		rows_deleted: ops.filter((op) => op.op === 'delete').length,
		cells_changed: ops.length,
		columns_changed: [],
		sample: [],
		inverse_ops: [],
		applied_revision: 8
	};
}

function applyFor(ops: TableRowOp[]): TableApplyResult {
	return {
		document_id: FIXTURE_DOCUMENT_ID,
		revision: 8,
		row_count: 12,
		updated_at: '2026-10-04T16:00:00.000Z',
		results: ops.map((op) => {
			if (op.op === 'insert') {
				return {
					op: 'insert',
					ref: op.ref,
					row_id: `real-${op.ref}`,
					row_number: 13,
					version: 1,
					before: null,
					after: { cells: op.cells }
				};
			}
			if (op.op === 'update') {
				return {
					op: 'update',
					row_id: op.row_id,
					row_number: 1,
					version: (op.expected_version ?? 1) + 1,
					before: { cells: {} },
					after: { cells: op.cells ?? {} }
				};
			}
			return {
				op: op.op,
				row_id: op.row_id,
				row_number: 1,
				version: 2,
				before: null,
				after: null
			};
		})
	};
}

function mockClient(overrides: Partial<TableClient> = {}) {
	const client = {
		createTable: vi.fn(),
		getTable: vi.fn(async () => ({ table: buildJobApplicationsTable(), totals: {} })),
		patchTable: vi.fn(),
		applyRows: vi.fn(async (_id: string, input: { ops: TableRowOp[] }) => ({
			apply: applyFor(input.ops),
			receipt: receiptFor(input.ops)
		})),
		revertChange: vi.fn(),
		exportCsvUrl: (id: string) => `/api/onto/tables/${id}/export.csv`,
		createTaskFromRow: vi.fn(),
		startAiFill: vi.fn(),
		getAiFillStatus: vi.fn(),
		...overrides
	} satisfies TableClient;
	return client;
}

function mockNotify() {
	return {
		success: vi.fn(),
		info: vi.fn(),
		warning: vi.fn(),
		error: vi.fn()
	} satisfies TableNotifier;
}

function setup(client = mockClient(), table: LoadedTable = buildJobApplicationsTable()) {
	const notify = mockNotify();
	const onChanged = vi.fn();
	const controller = createTableController({
		documentId: FIXTURE_DOCUMENT_ID,
		projectId: FIXTURE_PROJECT_ID,
		initialTable: table,
		client,
		notify,
		onChanged,
		aiPollMs: 1000,
		pendingPollMs: 60_000,
		flashMs: 500
	});
	return { controller, client, notify, onChanged, table };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('TableController edits', () => {
	it('shows an edit instantly, sends the row version, and keeps the server answer', async () => {
		const { controller, client, onChanged, table } = setup();
		const row = table.rows[0]!;
		const done = controller.editCells([
			{ rowId: row.id, columnId: COL.status, value: 'Offer' }
		]);
		expect(controller.table!.rows[0]!.cells[COL.status]).toBe('Offer');
		expect(controller.saving).toBe(true);
		await done;
		expect(client.applyRows).toHaveBeenCalledWith(FIXTURE_DOCUMENT_ID, {
			ops: [
				{
					op: 'update',
					row_id: row.id,
					cells: { [COL.status]: 'Offer' },
					expected_version: 1
				}
			]
		});
		expect(controller.serverTable!.rows[0]!.version).toBe(2);
		expect(controller.serverTable!.rows[0]!.cells[COL.status]).toBe('Offer');
		expect(controller.pending).toEqual([]);
		expect(controller.canUndo).toBe(true);
		expect(controller.saving).toBe(false);
		expect(onChanged).toHaveBeenCalled();
	});

	it('uses the version from the previous write for back-to-back edits on one row', async () => {
		const { controller, client, table } = setup();
		const row = table.rows[0]!;
		void controller.editCells([{ rowId: row.id, columnId: COL.status, value: 'Offer' }]);
		await controller.editCells([{ rowId: row.id, columnId: COL.notes, value: 'Signed' }]);
		expect(client.applyRows).toHaveBeenNthCalledWith(2, FIXTURE_DOCUMENT_ID, {
			ops: [expect.objectContaining({ row_id: row.id, expected_version: 2 })]
		});
	});

	it('on a 409 refetches, warns gently and drops the stale edit', async () => {
		const client = mockClient({
			applyRows: vi.fn(async () => {
				throw new TableClientError('Row changed', 409, 'ROW_CONFLICT');
			})
		});
		const { controller, notify, table } = setup(client);
		const row = table.rows[0]!;
		await controller.editCells([{ rowId: row.id, columnId: COL.status, value: 'Offer' }]);
		expect(client.getTable).toHaveBeenCalledTimes(1);
		expect(notify.warning).toHaveBeenCalledTimes(1);
		expect(notify.error).not.toHaveBeenCalled();
		expect(controller.table!.rows[0]!.cells[COL.status]).toBe('Interview');
		expect(controller.pending).toEqual([]);
	});

	it('rolls back and explains other failures', async () => {
		const client = mockClient({
			applyRows: vi.fn(async () => {
				throw new TableClientError(
					'VALIDATION_ERROR: Salary must be a number',
					400,
					'VALIDATION_ERROR'
				);
			})
		});
		const { controller, notify, table } = setup(client);
		await controller.editCells([
			{ rowId: table.rows[0]!.id, columnId: COL.salary, value: 'lots' }
		]);
		expect(notify.error).toHaveBeenCalledWith('Salary must be a number');
		expect(controller.table!.rows[0]!.cells[COL.salary]).toBe(185000);
	});

	it('lets you edit a new row before the server has given it an id', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const applyRows = vi.fn(async (_id: string, input: { ops: TableRowOp[] }) => {
			if (applyRows.mock.calls.length === 1) await gate;
			return { apply: applyFor(input.ops), receipt: receiptFor(input.ops) };
		});
		const { controller } = setup(mockClient({ applyRows }));
		const tempId = controller.insertRow({ [COL.company]: 'Orbit Labs' });
		expect(tempId).toMatch(/^tmp:/);
		expect(controller.table!.rows.at(-1)!.id).toBe(tempId);
		const edit = controller.editCells([{ rowId: tempId, columnId: COL.role, value: 'FDE' }]);
		expect(controller.table!.rows.at(-1)!.cells[COL.role]).toBe('FDE');
		release();
		await edit;
		const insertOp = (applyRows.mock.calls[0]![1] as { ops: TableRowOp[] }).ops[0]!;
		expect(insertOp).toMatchObject({ op: 'insert', cells: { [COL.company]: 'Orbit Labs' } });
		const realId = controller.resolveRowId(tempId);
		expect(realId).toMatch(/^real-/);
		expect(applyRows.mock.calls[1]![1]).toEqual({
			ops: [
				{ op: 'update', row_id: realId, cells: { [COL.role]: 'FDE' }, expected_version: 1 }
			]
		});
		const last = controller.table!.rows.at(-1)!;
		expect(last.id).toBe(realId);
		expect(last.cells).toMatchObject({ [COL.company]: 'Orbit Labs', [COL.role]: 'FDE' });
	});

	it('sends a paste as one write (one undo step)', async () => {
		const { controller, client, table } = setup();
		await controller.applyPaste(
			[{ rowId: table.rows[0]!.id, columnId: COL.status, value: 'Offer' }],
			[{ [COL.company]: 'Tern' }],
			{ undoToast: 'Pasted 2 cells' }
		);
		expect(client.applyRows).toHaveBeenCalledExactlyOnceWith(FIXTURE_DOCUMENT_ID, {
			ops: [
				expect.objectContaining({ op: 'update' }),
				expect.objectContaining({ op: 'insert' })
			]
		});
		expect(controller.undoStack).toHaveLength(1);
		expect(controller.table!.rows).toHaveLength(13);
	});

	it('deletes rows and offers undo', async () => {
		const { controller, notify, table } = setup();
		await controller.deleteRows([table.rows[2]!.id]);
		expect(controller.table!.rows).toHaveLength(11);
		expect(notify.info).toHaveBeenCalledWith(
			'Row deleted',
			expect.objectContaining({ label: 'Undo' })
		);
	});
});

describe('TableController undo', () => {
	it('reverts the last receipt and shows the server table', async () => {
		const reverted = buildJobApplicationsTable();
		reverted.document.title = 'Reverted';
		const client = mockClient({
			revertChange: vi.fn(async () => ({ apply: null, table: reverted }))
		});
		const { controller, table } = setup(client);
		await controller.editCells([
			{ rowId: table.rows[0]!.id, columnId: COL.status, value: 'Offer' }
		]);
		const receipt = controller.undoStack[0]!;
		await controller.undo();
		expect(client.revertChange).toHaveBeenCalledWith(FIXTURE_DOCUMENT_ID, receipt);
		expect(controller.table!.document.title).toBe('Reverted');
		expect(controller.canUndo).toBe(false);
	});

	it('says so when the rows moved on', async () => {
		const client = mockClient({
			revertChange: vi.fn(async () => {
				throw new TableClientError('moved on', 409, 'TABLE_CONFLICT');
			})
		});
		const { controller, notify, table } = setup(client);
		await controller.editCells([
			{ rowId: table.rows[0]!.id, columnId: COL.status, value: 'Offer' }
		]);
		await controller.undo();
		expect(notify.warning).toHaveBeenCalledWith("Couldn't undo — those rows changed since.");
		expect(client.getTable).toHaveBeenCalled();
	});
});

describe('TableController columns', () => {
	it('shows a rename instantly and adopts the server table', async () => {
		const server = buildJobApplicationsTable();
		server.schema.columns[0]!.name = 'Employer';
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const client = mockClient({
			patchTable: vi.fn(async () => {
				await gate;
				return { table: server, receipt: null };
			})
		});
		const { controller } = setup(client);
		const done = controller.changeColumns([
			{ action: 'rename', column: COL.company, name: 'Employer' }
		]);
		expect(controller.table!.schema.columns[0]!.name).toBe('Employer');
		release();
		await done;
		expect(client.patchTable).toHaveBeenCalledWith(FIXTURE_DOCUMENT_ID, {
			column_changes: [{ action: 'rename', column: COL.company, name: 'Employer' }]
		});
		expect(controller.pending).toEqual([]);
		expect(controller.serverTable!.schema.columns[0]!.name).toBe('Employer');
	});
});

describe('TableController AI fills', () => {
	it('starts a fill after queued saves, polls, and flashes cells as they fill', async () => {
		vi.useFakeTimers();
		const pending = buildJobApplicationsTable();
		const target = pending.rows[5]!;
		pending.rows[5]!.cell_meta[COL.manager] = { by: 'ai_column', state: 'pending', at: 'now' };
		const filled = buildJobApplicationsTable();
		filled.rows[5]!.cells[COL.manager] = 'Lee Morgan';
		filled.rows[5]!.cell_meta[COL.manager] = { by: 'ai_column', state: 'filled', at: 'now' };
		const getTable = vi
			.fn()
			.mockResolvedValueOnce({ table: pending, totals: {} })
			.mockResolvedValue({ table: filled, totals: {} });
		const client = mockClient({
			getTable,
			startAiFill: vi.fn(async () => ({ run_id: 'run-1', row_count: 3 })),
			getAiFillStatus: vi.fn(async () => ({
				status: 'done' as const,
				filled: 2,
				failed: 1,
				total: 3
			}))
		});
		const { controller, notify } = setup(client);

		const started = await controller.startAiFill(COL.manager);
		expect(started).toBe(true);
		expect(client.startAiFill).toHaveBeenCalledWith(FIXTURE_DOCUMENT_ID, {
			column: COL.manager,
			only_empty: true
		});
		expect(controller.aiFill).toMatchObject({ runId: 'run-1', status: 'queued', total: 3 });
		expect(controller.pendingAiCells).toBeGreaterThan(0);

		await vi.advanceTimersByTimeAsync(1000);
		expect(client.getAiFillStatus).toHaveBeenCalledWith(FIXTURE_DOCUMENT_ID, 'run-1');
		expect(controller.aiFill?.status).toBe('done');
		expect(controller.table!.rows[5]!.cells[COL.manager]).toBe('Lee Morgan');
		expect(controller.flashKeys.has(cellKey(target.id, COL.manager))).toBe(true);
		expect(notify.success).toHaveBeenCalledWith("Filled 2 of 3 · 1 couldn't be found");

		await vi.advanceTimersByTimeAsync(500);
		expect(controller.flashKeys.size).toBe(0);
		await vi.advanceTimersByTimeAsync(6000);
		expect(controller.aiFill).toBeNull();
		controller.dispose();
	});

	it('tells you when there is nothing to fill', async () => {
		const client = mockClient({
			startAiFill: vi.fn(async () => ({ run_id: 'run-2', row_count: 0 }))
		});
		const { controller, notify } = setup(client);
		expect(await controller.startAiFill(COL.manager)).toBe(false);
		expect(notify.info).toHaveBeenCalled();
		expect(controller.aiFill).toBeNull();
	});
});

describe('TableController loading', () => {
	it('fetches when no initial table is given and reports failures plainly', async () => {
		const client = mockClient({
			getTable: vi.fn(async () => {
				throw new TableClientError('nope', 404, 'TABLE_NOT_FOUND');
			})
		});
		const controller = createTableController({
			documentId: 'missing',
			projectId: FIXTURE_PROJECT_ID,
			client
		});
		await controller.load();
		expect(controller.loadError).toBe('This table no longer exists.');
		expect(controller.table).toBeNull();
		expect(tempRowId('x')).toBe('tmp:x');
	});
});

describe('TableController with the in-memory preview client', () => {
	it('edits, pastes, deletes, undoes and fills end to end', async () => {
		const client = createMemoryTableClient(buildJobApplicationsTable(), {
			latencyMs: 0,
			fillPerPoll: 50
		});
		const controller = createTableController({
			documentId: FIXTURE_DOCUMENT_ID,
			projectId: FIXTURE_PROJECT_ID,
			client,
			aiPollMs: 5,
			pendingPollMs: 60_000
		});
		await controller.load();
		const first = controller.table!.rows[0]!;

		await controller.editCells([{ rowId: first.id, columnId: COL.status, value: 'Offer' }]);
		expect((await client.getTable(FIXTURE_DOCUMENT_ID)).table.rows[0]!.cells[COL.status]).toBe(
			'Offer'
		);

		await controller.applyPaste(
			[],
			[{ [COL.company]: 'Orbit Labs' }, { [COL.company]: 'Tern' }]
		);
		expect(controller.table!.rows).toHaveLength(14);

		await controller.undo();
		expect(controller.table!.rows).toHaveLength(12);
		await controller.undo();
		expect(controller.table!.rows[0]!.cells[COL.status]).toBe('Interview');

		await controller.deleteRows([first.id]);
		expect(controller.table!.rows).toHaveLength(11);
		await controller.undo();
		expect(controller.table!.rows[0]!.id).toBe(first.id);

		await controller.changeColumns([{ action: 'add', name: 'Recruiter', type: 'text' }]);
		const recruiter = controller.table!.schema.columns.find((c) => c.name === 'Recruiter')!;
		expect(recruiter.id).toMatch(/^c_new/);
		expect(await controller.startAiFill(recruiter.id)).toBe(true);
		await vi.waitFor(() => expect(controller.aiFill?.status).toBe('done'));
		await controller.settled();
		await controller.refresh();
		expect(
			controller.table!.rows.every((row) => typeof row.cells[recruiter.id] === 'string')
		).toBe(true);
		expect(controller.table!.rows[0]!.cell_meta[recruiter.id]?.source_urls?.length).toBe(1);
		controller.dispose();
	});
});
