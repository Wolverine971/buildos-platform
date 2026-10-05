// apps/web/src/lib/components/projects/desktop/reader-task-groups.test.ts
import { describe, expect, it } from 'vitest';
import { groupTasksForReader, taskReaderOrder, type ReaderTask } from './reader-task-groups';

function task(id: string, state_key: string, extra: Partial<ReaderTask> = {}): ReaderTask {
	return { id, title: id, state_key, updated_at: '2026-10-01T00:00:00Z', ...extra };
}

describe('the board folded into a list', () => {
	it('stacks the columns with In progress first, drops empty and archived ones', () => {
		const groups = groupTasksForReader([
			task('a', 'todo'),
			task('b', 'in_progress'),
			task('c', 'done'),
			task('d', 'blocked', { archived_at: '2026-10-02T00:00:00Z' })
		]);
		expect(groups.map((group) => [group.key, group.tasks.map((t) => t.id)])).toEqual([
			['in_progress', ['b']],
			['backlog', ['a']],
			['done', ['c']]
		]);
	});

	it('keeps the board order inside a column: priority, then the soonest due date', () => {
		const groups = groupTasksForReader([
			task('later', 'todo', { priority: 2, due_at: '2026-10-20T00:00:00Z' }),
			task('sooner', 'todo', { priority: 2, due_at: '2026-10-08T00:00:00Z' }),
			task('urgent', 'todo', { priority: 1 })
		]);
		expect(groups[0]!.tasks.map((t) => t.id)).toEqual(['urgent', 'sooner', 'later']);
	});

	it('walks only the rows on screen: Done joins once it is unfolded', () => {
		const groups = groupTasksForReader([
			task('a', 'todo'),
			task('b', 'in_progress'),
			task('c', 'done')
		]);
		expect(taskReaderOrder(groups, false)).toEqual(['b', 'a']);
		expect(taskReaderOrder(groups, true)).toEqual(['b', 'a', 'c']);
	});
});
