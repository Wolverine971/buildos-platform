// apps/web/src/lib/components/today/today-task-order.test.ts
import { describe, expect, it } from 'vitest';
import type { TodayTask } from '$lib/types/today';
import { groupTodayTasks, todayTaskOrder } from './today-task-order';

function task(id: string, project: string, bucket: TodayTask['bucket']): TodayTask {
	return {
		id,
		project_id: project,
		project_name: `Project ${project}`,
		title: id,
		description: null,
		state_key: 'todo',
		due_at: null,
		start_at: null,
		priority: null,
		updated_at: '2026-10-06T00:00:00.000Z',
		bucket
	};
}

describe('today task order', () => {
	it('groups by urgency, then by project in first-seen order', () => {
		const groups = groupTodayTasks([
			task('a1', 'A', 'in_progress'),
			task('b1', 'B', 'due_today'),
			task('a2', 'A', 'due_today'),
			task('b2', 'B', 'due_today')
		]);

		expect(
			groups.map((group) => [group.key, group.projects.map((p) => p.tasks.map((t) => t.id))])
		).toEqual([
			['due_today', [['b1', 'b2'], ['a2']]],
			['in_progress', [['a1']]]
		]);
	});

	it('walks the timed schedule first, then the anytime groups, each task once', () => {
		const timed = task('timed', 'A', 'due_today');
		const linked = task('linked', 'B', 'starts_today');

		expect(
			todayTaskOrder(
				[null, timed, undefined, linked, timed],
				[
					task('a-progress', 'A', 'in_progress'),
					task('b-due', 'B', 'due_today'),
					task('a-due', 'A', 'due_today')
				]
			)
		).toEqual(['timed', 'linked', 'b-due', 'a-due', 'a-progress']);
	});
});
