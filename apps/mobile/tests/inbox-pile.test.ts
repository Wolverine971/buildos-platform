// apps/mobile/tests/inbox-pile.test.ts
// The cleared pile: Undo sends nothing, holds expire into merged saves, failures come back.
import type { CleanupDecideResponse, CheckInAnswersResponse } from '@buildos/api-client';
import { describe, expect, it, vi } from 'vitest';

import { chunkEntries, createPile, type PileOutcome } from '@/lib/inbox/pile';

function harness(
	overrides: {
		sendCleanup?: (projectId: string, decisions: unknown[]) => Promise<CleanupDecideResponse>;
		sendCheckIns?: () => Promise<CheckInAnswersResponse>;
	} = {}
) {
	let clock = 0;
	const timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
	const sendCleanup = vi.fn(
		overrides.sendCleanup ??
			(async (_projectId: string, decisions: Array<{ suggestion_id: string }>) => ({
				outcomes: decisions.map((decision) => ({
					suggestion_id: decision.suggestion_id,
					ok: true,
					status: 'applied' as const
				})),
				view: null
			}))
	);
	const sendCheckIns = vi.fn(
		overrides.sendCheckIns ?? (async () => ({ results: [], changed: 0, failed: 0 }))
	);
	const pile = createPile({
		sendCleanup: sendCleanup as never,
		sendCheckIns: sendCheckIns as never,
		holdMs: 5000,
		lingerMs: 4000,
		now: () => clock,
		setTimer: (fn, ms) => {
			const timer = { at: clock + ms, fn, live: true };
			timers.push(timer);
			return timer;
		},
		clearTimer: (handle) => {
			if (handle) (handle as { live: boolean }).live = false;
		}
	});
	const advance = async (ms: number) => {
		clock += ms;
		for (const timer of timers) {
			if (timer.live && timer.at <= clock) {
				timer.live = false;
				timer.fn();
			}
		}
		// Let the drain's awaits run.
		for (let i = 0; i < 10; i += 1) await Promise.resolve();
	};
	return { pile, sendCleanup, sendCheckIns, advance };
}

const cleanupJob = (projectId: string, ...ids: string[]) => ({
	kind: 'cleanup' as const,
	projectId,
	decisions: ids.map((id) => ({ suggestion_id: id, action: 'approve' as const }))
});

describe('cleared pile', () => {
	it('sends nothing for an answer taken back while it waits', async () => {
		const { pile, sendCleanup, advance } = harness();
		const onResult = vi.fn();
		const onUndo = vi.fn();
		const id = pile.add({
			title: 'Archive old log',
			label: 'Applied',
			job: cleanupJob('p1', 's1'),
			onResult,
			onUndo
		});
		await advance(3000);
		expect(pile.undo(id)).toBe(true);
		expect(onUndo).toHaveBeenCalledTimes(1);
		await advance(10_000);
		expect(sendCleanup).not.toHaveBeenCalled();
		expect(onResult).not.toHaveBeenCalled();
		expect(pile.snapshot()).toEqual([]);
	});

	it("merges one project's answers released together into one request", async () => {
		const { pile, sendCleanup, advance } = harness();
		pile.add({ title: 'A', label: 'Applied', job: cleanupJob('p1', 's1') });
		pile.add({ title: 'B', label: 'Not needed', job: cleanupJob('p1', 's2', 's3') });
		pile.add({ title: 'C', label: 'Applied', job: cleanupJob('p2', 's4') });
		await advance(5000);
		expect(sendCleanup).toHaveBeenCalledTimes(2);
		const p1 = sendCleanup.mock.calls.find(([projectId]) => projectId === 'p1')!;
		expect((p1[1] as Array<{ suggestion_id: string }>).map((d) => d.suggestion_id)).toEqual([
			's1',
			's2',
			's3'
		]);
	});

	it('hands each answer only its own outcomes', async () => {
		const { pile, advance } = harness();
		const a = vi.fn<(outcome: PileOutcome) => void>();
		const b = vi.fn<(outcome: PileOutcome) => void>();
		pile.add({ title: 'A', label: 'Applied', job: cleanupJob('p1', 's1'), onResult: a });
		pile.add({ title: 'B', label: 'Applied', job: cleanupJob('p1', 's2'), onResult: b });
		await advance(5000);
		const first = a.mock.calls[0]![0];
		expect(first.ok && first.cleanup?.map((o) => o.suggestion_id)).toEqual(['s1']);
		const second = b.mock.calls[0]![0];
		expect(second.ok && second.cleanup?.map((o) => o.suggestion_id)).toEqual(['s2']);
	});

	it('reports a failed save so the card can take the item back', async () => {
		const { pile, advance } = harness({
			sendCleanup: async () => {
				throw new Error('Network down');
			}
		});
		const onResult = vi.fn();
		pile.add({ title: 'A', label: 'Applied', job: cleanupJob('p1', 's1'), onResult });
		await advance(5000);
		expect(onResult).toHaveBeenCalledWith({ ok: false, error: 'Network down' });
		expect(pile.snapshot()[0]).toMatchObject({ status: 'failed', message: 'Network down' });
		await advance(4000);
		expect(pile.snapshot()).toEqual([]);
	});

	it('cannot undo once saving has started, and flushAll sends at once', async () => {
		const { pile, sendCleanup, advance } = harness();
		const id = pile.add({ title: 'A', label: 'Applied', job: cleanupJob('p1', 's1') });
		pile.flushAll();
		await advance(0);
		expect(sendCleanup).toHaveBeenCalledTimes(1);
		expect(pile.undo(id)).toBe(false);
	});

	it('splits check-in results back to their answers in request order', async () => {
		const { pile, advance } = harness({
			sendCheckIns: async () => ({
				results: [
					{
						kind: 'task',
						task_id: 't1',
						answer: 'done',
						ok: true,
						changed: true
					} as never,
					{
						kind: 'task',
						task_id: 't2',
						answer: 'drop',
						ok: false,
						status: 404,
						error: 'Task not found'
					}
				],
				changed: 1,
				failed: 1
			})
		});
		const one = vi.fn();
		const two = vi.fn();
		pile.add({
			title: 'T1',
			label: 'Done',
			job: { kind: 'check_in', answers: [{ task_id: 't1', answer: 'done' }] },
			onResult: one
		});
		pile.add({
			title: 'T2',
			label: 'Drop',
			job: { kind: 'check_in', answers: [{ task_id: 't2', answer: 'drop' }] },
			onResult: two
		});
		await advance(5000);
		expect(one.mock.calls[0]![0].ok).toBe(true);
		expect(two).toHaveBeenCalledWith({ ok: false, error: 'Task not found' });
	});

	it('runs a plain call on its own', async () => {
		const { pile, advance } = harness();
		const run = vi.fn(async () => undefined);
		const onResult = vi.fn();
		pile.add({ title: 'Snooze', label: 'Snoozed', job: { kind: 'call', run }, onResult });
		await advance(4999);
		expect(run).not.toHaveBeenCalled();
		await advance(1);
		expect(run).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledWith({ ok: true });
	});
});

describe('chunkEntries', () => {
	it('keeps whole entries together under the cap', () => {
		expect(chunkEntries([30, 5, 10, 40, 1], (n) => n, 40)).toEqual([[30, 5], [10], [40], [1]]);
	});
});
