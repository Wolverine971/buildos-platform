// apps/web/src/lib/components/today/today-picks.test.ts
import { describe, expect, it } from 'vitest';
import type { TodayTask, TodayWaitingItem } from '$lib/types/today';
import { dueWords, pickTodayFocus, timeOfDay } from './today-picks';

function task(id: string, over: Partial<TodayTask> = {}): TodayTask {
	return {
		id,
		project_id: `p-${id}`,
		project_name: `Project ${id}`,
		title: `Task ${id}`,
		description: null,
		state_key: 'todo',
		due_at: null,
		start_at: null,
		priority: null,
		updated_at: '2026-11-04T10:00:00Z',
		bucket: 'due_soon',
		created_by_you: true,
		due_in_days: null,
		...over
	};
}

function ask(id: string, over: Partial<TodayWaitingItem> = {}): TodayWaitingItem {
	return {
		id,
		direction: 'on_you',
		who: 'Rod',
		who_kind: 'person',
		what: 'Record your intro',
		project_id: `wp-${id}`,
		project_name: 'Beyond Exit Planning',
		task_id: null,
		since: '2026-10-04',
		...over
	};
}

const weekdayOf = () => 'Fri';

describe('pickTodayFocus', () => {
	it('puts the soonest due task first, then someone waiting, then what you just added', () => {
		const picks = pickTodayFocus({
			tasks: [
				task('new', { bucket: 'new', due_in_days: null }),
				task('fri', { due_in_days: 2, due_at: '2026-11-06T23:59:59Z' })
			],
			waiting: [ask('rod')],
			doneIds: new Set(),
			weekdayOf
		});
		expect(picks.map((pick) => pick.key)).toEqual(['task:fri', 'waiting:rod', 'task:new']);
		expect(picks[0]!.why).toBe('Due Fri.');
		expect(picks[1]!.why).toBe('Rod is waiting on you since Oct 4.');
	});

	it('keeps one pick per project and drops done and blocked tasks', () => {
		const picks = pickTodayFocus({
			tasks: [
				task('a', { project_id: 'same', due_in_days: 0 }),
				task('b', { project_id: 'same', due_in_days: 1 }),
				task('done', { due_in_days: 0 }),
				task('blocked', { state_key: 'blocked', due_in_days: 0 })
			],
			waiting: [],
			doneIds: new Set(['done']),
			weekdayOf
		});
		expect(picks.map((pick) => pick.key)).toEqual(['task:a']);
	});

	it('ranks agent-made new tasks below your own and ignores asks you are waiting on', () => {
		const picks = pickTodayFocus({
			tasks: [
				task('agent', { bucket: 'new', created_by_you: false }),
				task('mine', { bucket: 'new', created_by_you: true })
			],
			waiting: [ask('them', { direction: 'on_them' })],
			doneIds: new Set(),
			weekdayOf
		});
		expect(picks.map((pick) => [pick.key, pick.kind])).toEqual([
			['task:mine', 'new'],
			['task:agent', 'agent']
		]);
	});

	it('uses the linked task for a waiting ask and never shows that task twice', () => {
		const linked = task('linked', { due_in_days: 5, project_id: 'x' });
		const picks = pickTodayFocus({
			tasks: [linked],
			waiting: [ask('w', { task_id: 'linked', project_id: 'y' })],
			doneIds: new Set(),
			weekdayOf
		});
		expect(picks).toHaveLength(1);
		expect(picks[0]!.kind).toBe('waiting');
		expect(picks[0]!.task?.id).toBe('linked');
	});
});

describe('words', () => {
	it('says due dates plainly', () => {
		expect(dueWords(-1, 'Wed')).toBe('Was due yesterday');
		expect(dueWords(0, 'Thu')).toBe('Due today');
		expect(dueWords(1, 'Fri')).toBe('Due tomorrow');
		expect(dueWords(4, 'Mon')).toBe('Due Mon');
	});

	it('splits the day at noon and 5 PM', () => {
		expect([timeOfDay(8), timeOfDay(13), timeOfDay(18)]).toEqual([
			'morning',
			'afternoon',
			'evening'
		]);
	});
});
