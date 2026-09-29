// packages/agentic-chat-runtime/src/tools/record-scope.test.ts
import { describe, expect, it, vi } from 'vitest';
import { currentRecordsOnly, isArchivedOrDeletedRecord } from './record-scope';

function recorder() {
	const query: Record<string, any> = {};
	query.is = vi.fn(() => query);
	query.neq = vi.fn(() => query);
	return query;
}

describe('record scope', () => {
	it('keeps a query to rows that are neither deleted nor archived', () => {
		const query = recorder();
		currentRecordsOnly(query as never, 'task');
		expect(query.is.mock.calls).toEqual([
			['deleted_at', null],
			['archived_at', null]
		]);
		expect(query.neq).not.toHaveBeenCalled();
	});

	it('also drops documents archived from the tree', () => {
		const query = recorder();
		currentRecordsOnly(query as never, 'document');
		expect(query.neq).toHaveBeenCalledWith('state_key', 'archived');
	});

	it('recognizes every archive form', () => {
		expect(isArchivedOrDeletedRecord({ archived_at: '2026-07-02' }, 'task')).toBe(true);
		expect(
			isArchivedOrDeletedRecord({ archived_at: '2026-07-02', deleted_at: '2026-07-02' }, 'task')
		).toBe(true);
		expect(isArchivedOrDeletedRecord({ state_key: 'archived' }, 'document')).toBe(true);
		expect(isArchivedOrDeletedRecord({ state_key: 'archived' }, 'goal')).toBe(false);
		expect(isArchivedOrDeletedRecord({ state_key: 'todo', archived_at: null }, 'task')).toBe(
			false
		);
	});
});
