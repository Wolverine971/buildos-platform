// apps/mobile/tests/chat-demo.test.ts
import { describe, expect, it } from 'vitest';

import { demoChats, parseDemoParam, runDemoTurn, seedDemo, type Scheduler } from '@/lib/chat/demo';
import { isNearLatest, showJumpToLatest } from '@/lib/chat/list-follow';
import { createSessionStore, type WorkRow } from '@/lib/chat/session-store';
import { workHeadline } from '@/lib/chat/work-summary';

/** A scheduler the test advances by hand. */
function fakeClock() {
	const queue: Array<{ at: number; run: () => void; cancelled: boolean }> = [];
	let now = 0;
	const schedule: Scheduler = (run, delayMs) => {
		const entry = { at: now + delayMs, run, cancelled: false };
		queue.push(entry);
		return () => {
			entry.cancelled = true;
		};
	};
	const advance = (ms: number) => {
		const until = now + ms;
		for (;;) {
			const next = queue
				.filter((entry) => !entry.cancelled && entry.at <= until)
				.sort((a, b) => a.at - b.at)[0];
			if (!next) break;
			now = next.at;
			next.cancelled = true;
			next.run();
		}
		now = until;
	};
	return { schedule, advance, now: () => now };
}

describe('demo states', () => {
	it('parses the route param', () => {
		expect(parseDemoParam(undefined)).toBeNull();
		expect(parseDemoParam('1')).toBe('live');
		expect(parseDemoParam('streaming')).toBe('streaming');
		expect(parseDemoParam(['done'])).toBe('done');
		expect(parseDemoParam('nope')).toBeNull();
	});

	it('history is two finished turns, each with its work folded above the answer', () => {
		const store = createSessionStore();
		seedDemo(store, 'history', { now: () => 1_000_000_000_000 });
		const kinds = store.getState().rows.map((row) => row.kind);
		expect(kinds).toEqual(['user', 'work', 'assistant', 'user', 'work', 'assistant']);
		expect(store.getState().activeTurn).toBeNull();
		expect(demoChats(Date.now())).toHaveLength(4);
	});

	it('streaming shows a live step and partial text; done shows the fold', () => {
		const streaming = createSessionStore();
		seedDemo(streaming, 'streaming', { now: () => 1_000_000_000_000 });
		const live = streaming
			.getState()
			.rows.find((row) => row.kind === 'work' && row.status === 'active') as WorkRow;
		expect(live.steps.map((step) => step.status)).toEqual([
			'completed',
			'completed',
			'pending'
		]);
		expect(workHeadline(live)).toBe('Searching documents…');
		expect(streaming.getState().activeTurn).not.toBeNull();

		const done = createSessionStore();
		seedDemo(done, 'done', { now: () => 1_000_000_000_000 });
		const last = done.getState().rows.at(-2) as WorkRow;
		expect(last.status).toBe('completed');
		expect(workHeadline(last)).toMatch(/^Worked for/);
		expect(done.getState().activeTurn).toBeNull();
	});
});

describe('runDemoTurn', () => {
	it('walks the port from send to a finished answer', () => {
		const clock = fakeClock();
		const store = createSessionStore({ now: clock.now });
		runDemoTurn(store, 'Plan my morning', { schedule: clock.schedule, now: clock.now });
		expect(store.getState().rows.map((row) => row.kind)).toEqual(['user', 'work']);
		clock.advance(400);
		expect(store.getState().activeTurn).not.toBeNull();
		clock.advance(3000);
		const work = store.getState().rows[1] as WorkRow;
		expect(work.steps).toHaveLength(3);
		clock.advance(20_000);
		expect(store.getState().activeTurn).toBeNull();
		expect(store.getState().rows[2]).toMatchObject({ kind: 'assistant', status: 'done' });
		expect((store.getState().rows[2] as { text: string }).text).toContain('morning');
	});

	it('Stop ends it as cancelled and keeps what had arrived', () => {
		const clock = fakeClock();
		const store = createSessionStore({ now: clock.now });
		const cancel = runDemoTurn(store, 'Plan my morning', {
			schedule: clock.schedule,
			now: clock.now
		});
		clock.advance(3800);
		cancel();
		expect(store.getState().activeTurn).toBeNull();
		expect(workHeadline(store.getState().rows[1] as WorkRow)).toBe('Stopped');
		clock.advance(60_000);
		expect(store.getState().rows.filter((row) => row.kind === 'assistant')).toHaveLength(
			(store.getState().rows[2] as { text?: string } | undefined)?.text ? 1 : 0
		);
	});
});

describe('list follow', () => {
	it('follows near the newest row and offers a jump further back', () => {
		expect(isNearLatest(0)).toBe(true);
		expect(isNearLatest(80)).toBe(true);
		expect(isNearLatest(81)).toBe(false);
		expect(showJumpToLatest(100)).toBe(false);
		expect(showJumpToLatest(241)).toBe(true);
	});
});
