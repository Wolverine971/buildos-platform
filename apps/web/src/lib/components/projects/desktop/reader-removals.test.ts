// apps/web/src/lib/components/projects/desktop/reader-removals.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
	success: vi.fn(() => 'toast-1'),
	error: vi.fn(),
	remove: vi.fn()
}));
vi.mock('$lib/stores/toast.store', () => ({ toastService: toast }));

import {
	UNDO_WINDOW_MS,
	removeWithUndo,
	removedIds,
	treeWithoutRemoved,
	undo,
	withoutRemoved
} from './reader-removals.svelte';

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

describe('reader removals', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		removedIds.clear();
	});

	it('hides the item at once and sends nothing until the undo window closes', async () => {
		const onSent = vi.fn();
		removeWithUndo({
			id: 't1',
			message: 'Archived “Trash”',
			failMessage: 'nope',
			request: { url: '/api/onto/tasks/t1', method: 'DELETE', body: { archive: true } },
			onSent
		});
		expect(withoutRemoved([{ id: 't1' }, { id: 't2' }])).toEqual([{ id: 't2' }]);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(toast.success).toHaveBeenCalledWith(
			'Archived “Trash”',
			expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })
		);

		await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/tasks/t1',
			expect.objectContaining({
				method: 'DELETE',
				body: JSON.stringify({ archive: true }),
				keepalive: true
			})
		);
		expect(onSent).toHaveBeenCalled();
		// Still hidden while the lists re-read.
		expect(removedIds.has('t1')).toBe(true);
	});

	it('undo puts the item back and sends nothing', async () => {
		removeWithUndo({
			id: 't1',
			message: 'Archived',
			failMessage: 'nope',
			request: { url: '/api/onto/tasks/t1', method: 'DELETE' }
		});
		expect(undo('t1')).toBe(true);
		expect(removedIds.has('t1')).toBe(false);
		await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(undo('t1')).toBe(false);
	});

	it('brings the item back and says so when the server refuses', async () => {
		fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
		removeWithUndo({
			id: 'g1',
			message: 'Deleted',
			failMessage: 'Could not delete “Launch”.',
			request: { url: '/api/onto/goals/g1', method: 'DELETE' }
		});
		await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
		expect(removedIds.has('g1')).toBe(false);
		expect(toast.error).toHaveBeenCalledWith('Could not delete “Launch”.');
	});

	it('lifts a removed doc’s children into its place in a tree', () => {
		removedIds.add('b');
		const tree = [
			{ id: 'a', children: [{ id: 'b', children: [{ id: 'c', children: [] }] }] },
			{ id: 'd', children: [] }
		];
		expect(treeWithoutRemoved(tree)).toEqual([
			{ id: 'a', children: [{ id: 'c', children: [] }] },
			{ id: 'd', children: [] }
		]);
	});
});
