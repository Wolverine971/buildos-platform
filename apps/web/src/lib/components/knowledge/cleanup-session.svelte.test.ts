// apps/web/src/lib/components/knowledge/cleanup-session.svelte.test.ts
//
// Clean up on /knowledge. What would go wrong on screen:
//   - Undo comes too late, or undoes the wrong card → the last answer is not saved until the
//     next one is given or the wait runs out, and Undo puts exactly that card back
//   - "merge into this, then remove this" lands in the wrong order → saves run one at a time,
//     in the order they were given
//   - a merge keeps the thin entry and loses the one tasks point at → the fuller one survives
//   - a failed save silently drops a card → it comes back, with the reason
//   - the queue runs dry or repeats cards → more are fetched early, without what was skipped
//     or is still waiting to be saved
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CLEANUP_UNDO_MS,
	CleanupSession,
	mergeSurvivor,
	type CleanupApi
} from './cleanup-session.svelte';
import type { KnowledgeCleanupEntry, KnowledgeCleanupQueue } from './knowledge-client';

function entry(name: string, over: Partial<KnowledgeCleanupEntry> = {}): KnowledgeCleanupEntry {
	return {
		id: name,
		kind: 'org',
		name,
		summary: null,
		sources: ['work'],
		circle: null,
		tasks: 1,
		documents: 0,
		people: 0,
		people_names: [],
		details: 0,
		created_at: '2026-11-01T00:00:00Z',
		reasons: [],
		similar: [],
		...over
	};
}

const similar = (name: string, records = 0, people = 0) => ({
	id: name,
	name,
	rule: 'ending',
	reason: 'Same name, one with a company ending',
	score: 0.9,
	sources: ['work' as const],
	records,
	people
});

function harness(batches: KnowledgeCleanupEntry[][]) {
	const calls: string[] = [];
	const failing = new Set<string>();
	let batch = 0;
	const save = (call: string) => {
		calls.push(call);
		return failing.has(call)
			? Promise.reject(new Error('It was already merged.'))
			: Promise.resolve();
	};
	const api: CleanupApi = {
		queue: vi.fn(async ({ skip }): Promise<KnowledgeCleanupQueue> => {
			calls.push(`queue skip=${[...skip].sort().join(',')}`);
			const entries = (batches[batch++] ?? []).filter((e) => !skip.includes(e.id));
			return { entries, remaining: entries.length, by_source: { work: entries.length } };
		}),
		remove: (id) => save(`remove ${id}`),
		keep: (id) => save(`keep ${id}`),
		person: (id) => save(`person ${id}`),
		merge: (keep, merge) => save(`merge ${merge} into ${keep}`),
		partOf: (id, parent) => save(`part ${id} of ${parent}`)
	};
	const session = new CleanupSession(api);
	const saves = () => calls.filter((call) => !call.startsWith('queue'));
	return { session, calls, saves, failing, api };
}

const names = (session: CleanupSession) => session.ahead.map((e) => e.name);
const many = (prefix: string, count: number) =>
	Array.from({ length: count }, (_, i) => entry(`${prefix}${i + 1}`));

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('mergeSurvivor', () => {
	it('keeps the entry more tasks and docs name, then the one with more people', () => {
		expect(
			mergeSurvivor(entry('Murtech, Inc', { tasks: 1 }), {
				id: 'm',
				name: 'Murtech',
				records: 3
			})
		).toBe('other');
		expect(
			mergeSurvivor(entry('Murtech', { tasks: 3 }), {
				id: 'm',
				name: 'Murtech, Inc',
				records: 1
			})
		).toBe('card');
		expect(
			mergeSurvivor(entry('Ideal Aerosmith', { tasks: 0, people: 0 }), {
				id: 'i',
				name: 'Ideal Aerosmith Inc.',
				records: 0,
				people: 2
			})
		).toBe('other');
	});

	it('keeps the shorter name when nothing else tells them apart', () => {
		expect(
			mergeSurvivor(entry('The Cadre Training', { tasks: 0 }), { id: 'c', name: 'The Cadre' })
		).toBe('other');
		expect(
			mergeSurvivor(entry('The Cadre', { tasks: 0 }), { id: 'c', name: 'The Cadre Training' })
		).toBe('card');
	});
});

describe('CleanupSession', () => {
	it('holds the last answer back until the wait runs out, then saves it', async () => {
		const { session, saves } = harness([[entry('Desk'), entry('Email')]]);
		await session.start();
		session.remove();
		expect(session.current?.name).toBe('Email');
		expect(session.pending?.label).toBe('Removed “Desk”');
		expect(saves()).toEqual([]);

		await vi.advanceTimersByTimeAsync(CLEANUP_UNDO_MS);
		expect(saves()).toEqual(['remove Desk']);
		expect(session.pending).toBeNull();
		expect(session.tally.removed).toBe(1);
	});

	it('undo puts the card back and nothing is ever saved for it', async () => {
		const { session, saves } = harness([[entry('Desk'), entry('Email')]]);
		await session.start();
		session.remove();
		expect(session.undo()).toBe(true);
		expect(session.current?.name).toBe('Desk');
		expect(session.left).toBe(2);
		expect(session.tally.removed).toBe(0);

		await vi.advanceTimersByTimeAsync(CLEANUP_UNDO_MS * 2);
		expect(saves()).toEqual([]);
		expect(session.undo()).toBe(false);
	});

	it('the next answer makes the one before it final; only the newest can be undone', async () => {
		const { session, saves } = harness([[entry('Desk'), entry('Email'), entry('Murtech')]]);
		await session.start();
		session.remove();
		session.keep();
		await vi.advanceTimersByTimeAsync(0);
		expect(saves()).toEqual(['remove Desk']);

		session.undo();
		expect(session.current?.name).toBe('Email');
		await vi.advanceTimersByTimeAsync(CLEANUP_UNDO_MS * 2);
		expect(saves()).toEqual(['remove Desk']);
	});

	it('merges the card into a fuller look-alike and moves on', async () => {
		const { session, saves } = harness([
			[entry('Murtech, Inc', { similar: [similar('Murtech', 3, 3)] }), entry('Email')]
		]);
		await session.start();
		session.mergeWith(session.similarFor(session.current!)[0]!);
		expect(session.current?.name).toBe('Email');
		await session.flush();
		expect(saves()).toEqual(['merge Murtech, Inc into Murtech']);
	});

	it('folds a thinner look-alike into the card, which stays up, and hides it everywhere', async () => {
		const { session, saves } = harness([
			[
				entry('Murtech', { tasks: 3, similar: [similar('Murtech, Inc', 1)] }),
				entry('Fitzgerald & Murtech', { similar: [similar('Murtech, Inc', 1)] }),
				entry('Murtech, Inc')
			]
		]);
		await session.start();
		session.mergeWith(session.similarFor(session.current!)[0]!);
		expect(session.current?.name).toBe('Murtech');
		expect(session.similarFor(session.current!)).toEqual([]);
		expect(names(session)).toEqual(['Murtech', 'Fitzgerald & Murtech']);
		expect(session.tally.merged).toBe(1);

		// Undo brings the look-alike back as a card and as a suggestion.
		session.undo();
		expect(names(session)).toEqual(['Murtech', 'Fitzgerald & Murtech', 'Murtech, Inc']);
		expect(session.similarFor(session.current!).map((s) => s.name)).toEqual(['Murtech, Inc']);
		await session.flush();
		expect(saves()).toEqual([]);
	});

	it('saves in the order the answers were given', async () => {
		const { session, saves } = harness([
			[entry('Desk', { tasks: 2, similar: [similar('Desks', 1)] }), entry('Email')]
		]);
		await session.start();
		session.mergeWith(session.similarFor(session.current!)[0]!);
		session.remove();
		await session.flush();
		expect(saves()).toEqual(['merge Desks into Desk', 'remove Desk']);
	});

	it('a failed save puts the card back and says why', async () => {
		const { session, failing } = harness([[entry('Desk'), entry('Email')]]);
		failing.add('remove Desk');
		await session.start();
		session.remove();
		await session.flush();
		expect(session.current?.name).toBe('Desk');
		expect(session.tally.removed).toBe(0);
		expect(session.failure).toContain('Desk');
		expect(session.failure).toContain('It was already merged.');
	});

	it('skips a card, comes back to it, and can go through the skipped ones again', async () => {
		const { session } = harness([[entry('Desk'), entry('Email'), entry('Murtech')]]);
		await session.start();
		session.skip();
		session.skip();
		expect(session.current?.name).toBe('Murtech');
		expect(session.back()).toBe(true);
		expect(session.current?.name).toBe('Email');
		session.keep();
		session.keep();
		expect(session.current).toBeNull();
		session.revisitSkipped();
		expect(session.current?.name).toBe('Desk');
	});

	it('fetches more before running out, leaving out skipped cards and the waiting answer', async () => {
		const { session, calls } = harness([
			many('A', 10),
			[...many('A', 10).slice(2), ...many('B', 3)],
			[]
		]);
		await session.start();
		session.skip(); // A1
		session.remove(); // A2: 8 left ahead → refill
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toContain('queue skip=A1,A2');
		expect(names(session)).toEqual(
			[...many('A', 10).slice(2), ...many('B', 3)].map((e) => e.name)
		);
		expect(session.exhausted).toBe(false);

		// The waiting answer can still be undone after the refill.
		session.undo();
		expect(session.current?.name).toBe('A2');
		expect(session.left).toBe(12);
	});

	it('knows when the queue is finished', async () => {
		const { session } = harness([[entry('Desk')], []]);
		await session.start();
		session.remove();
		await vi.advanceTimersByTimeAsync(0);
		expect(session.current).toBeNull();
		expect(session.exhausted).toBe(true);
	});

	it('files a card under another one and can turn one into a person', async () => {
		const { session, saves } = harness([[entry('Gunwerks LRU'), entry('Jordan Peterson')]]);
		await session.start();
		session.partOf({ id: 'Gunwerks', name: 'Gunwerks' });
		session.isPerson();
		await session.flush();
		expect(saves()).toEqual(['part Gunwerks LRU of Gunwerks', 'person Jordan Peterson']);
		expect(session.tally).toMatchObject({ part: 1, person: 1 });
	});
});
