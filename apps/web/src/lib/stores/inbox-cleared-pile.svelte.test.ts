// apps/web/src/lib/stores/inbox-cleared-pile.svelte.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearedPile,
	configureClearedPileForTests,
	pileClearedCount,
	type PileOutcome
} from './inbox-cleared-pile.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe('clearedPile', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		configureClearedPileForTests({ holdMs: 5000 });
	});

	afterEach(() => {
		configureClearedPileForTests();
		vi.useRealTimers();
	});

	it('hides the answer at once, holds it for Undo, then saves it', async () => {
		const run = vi.fn(async (): Promise<PileOutcome> => ({}));
		const { settled } = clearedPile.add({
			title: 'Call Dauntless Dogs',
			label: 'Marked done',
			keys: ['task:dogs'],
			lane: 'project-a',
			run
		});

		expect(clearedPile.isHidden('task:dogs')).toBe(true);
		expect(clearedPile.entries[0]).toMatchObject({ status: 'holding', count: 1 });
		expect(run).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5000);
		const entry = await settled;

		expect(run).toHaveBeenCalledWith({ keepalive: false });
		expect(entry.status).toBe('done');
		expect(pileClearedCount(clearedPile.entries[0]!)).toBe(1);
		// Cleared stays hidden after the pile is cleared, so an older view can't bring it back.
		clearedPile.dismissSettled();
		expect(clearedPile.entries).toHaveLength(0);
		expect(clearedPile.isHidden('task:dogs')).toBe(true);
	});

	it('takes an answer back while it waits, without saving', async () => {
		const run = vi.fn(async (): Promise<PileOutcome> => ({}));
		const onUndo = vi.fn();
		const { id, settled } = clearedPile.add({
			title: 'Archive Book Research',
			label: 'Make this change',
			keys: ['item:book'],
			lane: 'project-a',
			run,
			onUndo
		});

		expect(clearedPile.undo(id)).toBe(true);
		await vi.advanceTimersByTimeAsync(10_000);

		expect((await settled).status).toBe('undone');
		expect(onUndo).toHaveBeenCalledOnce();
		expect(run).not.toHaveBeenCalled();
		expect(clearedPile.entries).toHaveLength(0);
		expect(clearedPile.isHidden('item:book')).toBe(false);
		expect(clearedPile.undo(id)).toBe(false);
	});

	it('undoes the newest waiting answer first', () => {
		const run = async (): Promise<PileOutcome> => ({});
		clearedPile.add({ title: 'First', label: 'Done', keys: ['a'], lane: 'l', run });
		clearedPile.add({ title: 'Second', label: 'Done', keys: ['b'], lane: 'l', run });

		expect(clearedPile.undoLatest()).toBe(true);
		expect(clearedPile.entries.map((entry) => entry.title)).toEqual(['First']);
		expect(clearedPile.isHidden('b')).toBe(false);
		expect(clearedPile.isHidden('a')).toBe(true);
	});

	it('saves one lane in order and merges neighbours that are ready together', async () => {
		configureClearedPileForTests({ holdMs: 0 });
		const first = deferred<PileOutcome[]>();
		const runMany = vi.fn(
			(payloads: string[]): Promise<PileOutcome[]> =>
				runMany.mock.calls.length === 1
					? first.promise
					: Promise.resolve(payloads.map(() => ({})))
		);
		const merge = (payload: string, weight = 1) => ({
			key: 'cleanup',
			payload,
			weight,
			maxWeight: 3,
			runMany
		});
		const add = (title: string, weight = 1) =>
			clearedPile.add({
				title,
				label: 'Applied',
				keys: [title],
				lane: 'p',
				merge: merge(title, weight)
			});

		add('one');
		// While "one" saves, the next three line up; two fit in one request, the third waits.
		add('two');
		add('three', 2);
		add('four');
		expect(runMany).toHaveBeenCalledTimes(1);
		expect(runMany).toHaveBeenLastCalledWith(['one'], { keepalive: false });

		first.resolve([{}]);
		await vi.waitFor(() => expect(runMany).toHaveBeenCalledTimes(3));
		expect(runMany.mock.calls.map((call) => call[0])).toEqual([
			['one'],
			['two', 'three'],
			['four']
		]);
		await vi.waitFor(() =>
			expect(clearedPile.entries.every((entry) => entry.status === 'done')).toBe(true)
		);
	});

	it('runs different lanes side by side', async () => {
		configureClearedPileForTests({ holdMs: 0 });
		const slow = deferred<PileOutcome>();
		const fast = vi.fn(async (): Promise<PileOutcome> => ({}));
		clearedPile.add({ title: 'A', label: 'Done', lane: 'project-a', run: () => slow.promise });
		clearedPile.add({ title: 'B', label: 'Done', lane: 'project-b', run: fast });

		await vi.waitFor(() => expect(fast).toHaveBeenCalled());
		expect(clearedPile.entries.map((entry) => entry.status)).toEqual(['working', 'done']);
		slow.resolve({});
	});

	it('puts back what failed and keeps the rest cleared', async () => {
		configureClearedPileForTests({ holdMs: 0 });
		const partial = clearedPile.add({
			title: '3 tidy-ups',
			label: 'Applied',
			keys: ['x', 'y', 'z'],
			lane: 'p',
			run: async () => ({ returnedKeys: ['y'], detail: 'Locked. Back on your card.' })
		});
		const failed = clearedPile.add({
			title: 'Pause project',
			label: 'Paused',
			keys: ['project'],
			lane: 'p',
			run: async () => {
				throw new Error('Network down');
			}
		});

		const [partialEntry, failedEntry] = await Promise.all([partial.settled, failed.settled]);

		expect(partialEntry).toMatchObject({ status: 'partial', returnedKeys: ['y'] });
		expect(pileClearedCount(clearedPile.entries[0]!)).toBe(2);
		expect(clearedPile.isHidden('x')).toBe(true);
		expect(clearedPile.isHidden('y')).toBe(false);
		expect(failedEntry).toMatchObject({ status: 'failed', detail: 'Network down' });
		expect(clearedPile.isHidden('project')).toBe(false);
		expect(pileClearedCount(clearedPile.entries[1]!)).toBe(0);
	});

	it('lets a note decide afterwards whether its item stays open', async () => {
		configureClearedPileForTests({ holdMs: 0 });
		const { settled } = clearedPile.add({
			title: 'Archive the Rod folder',
			label: 'Your note',
			keys: ['rod'],
			lane: 'p',
			settles: false,
			run: async () => ({ detail: 'Kept it.' })
		});

		expect(clearedPile.isHidden('rod')).toBe(true);
		expect((await settled).status).toBe('done');
		// The card's fresh view now decides; the pile no longer hides it.
		expect(clearedPile.isHidden('rod')).toBe(false);
	});

	it('sends everything still waiting on flush, with keepalive when leaving', async () => {
		const run = vi.fn(async (): Promise<PileOutcome> => ({}));
		const { settled } = clearedPile.add({ title: 'A', label: 'Done', lane: 'p', run });

		clearedPile.flushAll({ keepalive: true });
		await settled;

		expect(run).toHaveBeenCalledWith({ keepalive: true });
	});
});
