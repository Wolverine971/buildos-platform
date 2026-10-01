// apps/web/src/lib/components/projects/desktop/desktop-signals.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildLooks,
	emptySignals,
	projectPulse,
	rankScale,
	shiftTask,
	taskBucket,
	type ProjectSignals
} from './desktop-signals';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const signals = (patch: Partial<ProjectSignals>): ProjectSignals => ({
	...emptySignals(),
	...patch
});

describe('taskBucket', () => {
	const task = (patch: Partial<Parameters<typeof taskBucket>[0]>) => ({
		state_key: 'todo',
		start_at: null,
		due_at: null,
		...patch
	});

	it('puts overdue first, then in progress, then dated work, then the backlog', () => {
		expect(taskBucket(task({ state_key: 'in_progress', due_at: at(-1) }), NOW)).toBe('overdue');
		expect(taskBucket(task({ state_key: 'in_progress', due_at: at(5) }), NOW)).toBe(
			'in_progress'
		);
		expect(taskBucket(task({ due_at: at(5) }), NOW)).toBe('scheduled');
		expect(taskBucket(task({ start_at: at(2) }), NOW)).toBe('scheduled');
		expect(taskBucket(task({}), NOW)).toBe('backlog');
		// Started in the past, nothing due: still waiting.
		expect(taskBucket(task({ start_at: at(-3) }), NOW)).toBe('backlog');
		// Blocked waits with the backlog unless it's past due.
		expect(taskBucket(task({ state_key: 'blocked', due_at: at(4) }), NOW)).toBe('backlog');
		expect(taskBucket(task({ state_key: 'done', due_at: at(-4) }), NOW)).toBe('done');
	});
});

describe('projectPulse', () => {
	const pulse = (state_key: string, patch: Partial<ProjectSignals> | null) =>
		projectPulse({ state_key, signals: patch ? signals(patch) : null }, NOW);

	it('reads what happened, not the status field', () => {
		expect(pulse('planning', { done_recent: 2, last_touch_at: at(-1) })).toEqual({
			pulse: 'moving',
			reason: 'Finished 2 tasks in the last 14 days'
		});
		expect(pulse('active', { last_touch_at: at(-3) })).toEqual({
			pulse: 'shaping',
			reason: 'Worked on 3 days ago, nothing finished yet'
		});
		expect(pulse('active', { last_touch_at: at(-20) })).toEqual({
			pulse: 'quiet',
			reason: 'Last change 20 days ago'
		});
		expect(pulse('active', { last_touch_at: at(-75) })?.pulse).toBe('parked');
		expect(pulse('active', { last_touch_at: null })).toEqual({
			pulse: 'parked',
			reason: 'No changes in 60 days'
		});
	});

	it('trusts the field only when someone parked the project on purpose', () => {
		expect(pulse('paused', { done_recent: 4, last_touch_at: at(0) })).toEqual({
			pulse: 'parked',
			reason: 'Marked paused'
		});
		expect(pulse('active', null)).toBeNull();
	});
});

describe('bars', () => {
	it('ranks so one huge project does not flatten the rest', () => {
		const scale = rankScale([85, 49, 10, 4, 0]);
		expect(scale(0)).toBe(0);
		expect(scale(85)).toBe(1);
		// Ten open tasks is 12% of the biggest, but third of four by rank.
		expect(scale(10)).toBeCloseTo(0.18 + 0.82 * 0.5);
		expect(scale(4)).toBeGreaterThan(0.18);
	});

	it('builds each tile: pulse, ranked bars, task mix; START HERE alone counts as no docs', () => {
		const looks = buildLooks(
			[
				{
					id: 'big',
					state_key: 'active',
					document_count: 31,
					task_count: 0,
					signals: signals({
						last_touch_at: at(-2),
						overdue: 11,
						in_progress: 2,
						backlog: 21
					})
				},
				{
					id: 'shell',
					state_key: 'planning',
					document_count: 1,
					task_count: 3,
					signals: null
				}
			],
			NOW
		);
		expect(looks.get('big')).toMatchObject({
			pulse: 'shaping',
			docs: 1,
			tasks: 1,
			open: 34,
			mix: { overdue: 11, in_progress: 2, scheduled: 0, backlog: 21 }
		});
		// No signals: no color, the summary's task count stands in as backlog.
		expect(looks.get('shell')).toMatchObject({
			pulse: null,
			docs: 0,
			open: 3,
			mix: { backlog: 3 }
		});
	});

	it('moves a task between projects without touching the other buckets', () => {
		const before = signals({ overdue: 2, backlog: 5 });
		const task = { state_key: 'todo', start_at: null, due_at: at(-1) };
		expect(shiftTask(before, task, -1, NOW)).toEqual(signals({ overdue: 1, backlog: 5 }));
		expect(shiftTask(before, { ...task, due_at: null }, 1, NOW)).toEqual(
			signals({ overdue: 2, backlog: 6 })
		);
		expect(shiftTask(null, task, 1, NOW)).toBeNull();
	});
});
