// apps/web/src/lib/components/agent/table-change-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildTableChangeCards,
	buildTableChangeToastMessage,
	describeTableChange,
	extractTableChangeReceipt,
	tableChangeHref,
	undoTableChange,
	type TableChangeReceipt
} from './table-change-cards';

function receipt(overrides: Partial<TableChangeReceipt> = {}): TableChangeReceipt {
	return {
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
		sample: [{ row: 'r12', column: 'Hiring manager', before: '', after: 'Ana Ruiz' }],
		inverse_ops: [{ op: 'delete', row: 'r12' }] as unknown as TableChangeReceipt['inverse_ops'],
		...overrides
	};
}

function respond(status: number, body: unknown) {
	return vi.fn(
		async () =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

describe('extractTableChangeReceipt', () => {
	it('reads the structured receipt from a live result, a stored result, or the data alias', () => {
		const change = receipt();
		expect(extractTableChangeReceipt({ table_change: change })).toEqual(change);
		expect(extractTableChangeReceipt({ result: { table_change: change } })).toEqual(change);
		expect(extractTableChangeReceipt({ data: { table_change: change } })).toEqual(change);
		expect(extractTableChangeReceipt({ result: { result: { table_change: change } } })).toEqual(
			change
		);
	});

	it('ignores anything that is not a complete table_change receipt', () => {
		expect(extractTableChangeReceipt(null)).toBeNull();
		expect(extractTableChangeReceipt({ message: 'Added 3 rows' })).toBeNull();
		expect(
			extractTableChangeReceipt({ table_change: { ...receipt(), kind: 'other' } })
		).toBeNull();
		// The model-facing compacted receipt (no inverse ops) never builds a card.
		const { inverse_ops: _ops, ...compacted } = receipt();
		expect(extractTableChangeReceipt({ table_change: compacted })).toBeNull();
	});
});

describe('buildTableChangeCards', () => {
	it('merges a turn into one card per table and chains Undo newest first', () => {
		const first = receipt();
		const second = receipt({
			revision: 5,
			applied_revision: 6,
			rows_added: 0,
			rows_updated: 2,
			cells_changed: 2,
			columns_changed: ['Remote policy']
		});
		const other = receipt({ document_id: 'table-2', title: 'Leads', applied_revision: 2 });
		const cards = buildTableChangeCards([first, second, other, first]);
		expect(cards).toHaveLength(2);
		const [card] = cards;
		expect(card).toMatchObject({
			id: 'table-1:6',
			documentId: 'table-1',
			projectId: 'project-1',
			title: 'Job applications',
			rowsAdded: 3,
			rowsUpdated: 2,
			cellsChanged: 9,
			columnsChanged: ['Remote policy'],
			changeCount: 2
		});
		expect(card!.receipts).toEqual([first, second]);
	});

	it('skips an empty batch', () => {
		expect(
			buildTableChangeCards([
				receipt({ rows_added: 0, cells_changed: 0, sample: [], inverse_ops: [] })
			])
		).toEqual([]);
	});
});

describe('describe + toast copy', () => {
	it('builds "Job applications · +3 rows · 7 cells"', () => {
		expect(buildTableChangeToastMessage(receipt())).toBe(
			'Job applications · +3 rows · 7 cells'
		);
		expect(
			describeTableChange({
				rowsAdded: 0,
				rowsUpdated: 1,
				rowsDeleted: 2,
				cellsChanged: 0,
				columnsChanged: ['Remote policy']
			})
		).toBe('1 row changed · 2 deleted · 1 column');
		expect(tableChangeHref({ projectId: 'project-1', documentId: 'table-1' })).toBe(
			'/projects/project-1?doc=table-1'
		);
	});
});

describe('undoTableChange', () => {
	it('reverts every change on the card in one request to the table revert endpoint', async () => {
		const [card] = buildTableChangeCards([
			receipt(),
			receipt({ revision: 5, applied_revision: 6 })
		]);
		const fetchMock = respond(200, { success: true, data: {} });
		await expect(undoTableChange(card!, fetchMock as unknown as typeof fetch)).resolves.toEqual(
			{
				status: 'undone',
				reverted: 2
			}
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
		expect(calls[0]![0]).toBe('/api/onto/tables/table-1/revert-change');
		const body = JSON.parse(String(calls[0]![1].body));
		expect(body.receipts.map((r: { applied_revision: number }) => r.applied_revision)).toEqual([
			5, 6
		]);
	});

	it('sends a single change as one receipt', async () => {
		const [card] = buildTableChangeCards([receipt()]);
		const fetchMock = respond(200, { success: true, data: {} });
		await undoTableChange(card!, fetchMock as unknown as typeof fetch);
		const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
		expect(JSON.parse(String(calls[0]![1].body)).receipt.applied_revision).toBe(5);
	});

	it('reports a 409 conflict in plain language and stops', async () => {
		const [card] = buildTableChangeCards([receipt()]);
		const fetchMock = respond(409, { success: false, code: 'ROW_CONFLICT' });
		const result = await undoTableChange(card!, fetchMock as unknown as typeof fetch);
		expect(result).toMatchObject({ status: 'conflict', reason: 'ROW_CONFLICT', reverted: 0 });
		expect(result.status === 'conflict' && result.message).toContain('edited since');
	});

	it('reports a network failure as an error', async () => {
		const [card] = buildTableChangeCards([receipt()]);
		const fetchMock = vi.fn(async () => {
			throw new Error('offline');
		});
		await expect(
			undoTableChange(card!, fetchMock as unknown as typeof fetch)
		).resolves.toMatchObject({ status: 'error', reverted: 0 });
	});
});
