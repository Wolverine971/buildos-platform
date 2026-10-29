// apps/mobile/tests/task-cache.test.ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { applyTaskEdit, serverFields } from '@/lib/task-cache';

const USER = 'user-1';

function seed() {
	const queryClient = new QueryClient();
	const task = {
		id: 't1',
		title: 'Draft chapter 3',
		description: null,
		state_key: 'todo',
		due_at: null,
		start_at: null,
		priority: 3
	};
	queryClient.setQueryData(['task', USER, 't1'], { task, linkedEntities: {}, entities: [] });
	queryClient.setQueryData(['today', USER, 'America/New_York'], {
		tasks: [
			{ id: 't1', title: task.title, state_key: 'todo', due_at: null },
			{ id: 't2', title: 'Other', state_key: 'todo', due_at: null }
		]
	});
	queryClient.setQueryData(['project', USER, 'p1'], { tasks: [{ ...task }] });
	const read = () => ({
		task: (queryClient.getQueryData(['task', USER, 't1']) as { task: Record<string, unknown> })
			.task,
		today: (
			queryClient.getQueryData(['today', USER, 'America/New_York']) as {
				tasks: Record<string, unknown>[];
			}
		).tasks[0]!,
		project: (
			queryClient.getQueryData(['project', USER, 'p1']) as {
				tasks: Record<string, unknown>[];
			}
		).tasks[0]!
	});
	return { queryClient, read };
}

describe('task cache edits', () => {
	it('shows a change in every copy at once, without inventing fields a copy lacks', () => {
		const { queryClient, read } = seed();
		applyTaskEdit(queryClient, USER, 't1', { state_key: 'done', priority: 1 });
		expect(read().task).toMatchObject({ state_key: 'done', priority: 1 });
		expect(read().today).toMatchObject({ state_key: 'done' });
		expect(read().today).not.toHaveProperty('priority');
		expect(read().project).toMatchObject({ state_key: 'done' });
	});

	it('keeps a fast Mark done when a slower due-date answer lands after it', () => {
		const { queryClient, read } = seed();
		const due = applyTaskEdit(queryClient, USER, 't1', { due_at: '2026-10-30T03:59:59.000Z' });
		const done = applyTaskEdit(queryClient, USER, 't1', { state_key: 'done' });
		done.confirm(serverFields({ state_key: 'done', due_at: null }, { state_key: 'done' }));
		// The due-date row was read before the done write; only due_at may come from it.
		due.confirm(
			serverFields(
				{ state_key: 'todo', due_at: '2026-10-30T03:59:59+00:00' },
				{ due_at: 'x' }
			)
		);
		expect(read().task).toMatchObject({
			state_key: 'done',
			due_at: '2026-10-30T03:59:59+00:00'
		});
		expect(read().today).toMatchObject({ state_key: 'done' });
	});

	it('undoes only its own field, and not over a newer edit', () => {
		const { queryClient, read } = seed();
		const first = applyTaskEdit(queryClient, USER, 't1', { title: 'First try' });
		applyTaskEdit(queryClient, USER, 't1', { title: 'Second try' });
		const done = applyTaskEdit(queryClient, USER, 't1', { state_key: 'done' });

		first.undo();
		expect(read().task.title).toBe('Second try');

		done.undo();
		expect(read().task).toMatchObject({ state_key: 'todo', title: 'Second try' });
		expect(read().project).toMatchObject({ state_key: 'todo' });
	});

	it('an older answer to the same field does not overwrite a newer pick', () => {
		const { queryClient, read } = seed();
		const today = applyTaskEdit(queryClient, USER, 't1', { due_at: 'today-guess' });
		const tomorrow = applyTaskEdit(queryClient, USER, 't1', { due_at: 'tomorrow-guess' });
		tomorrow.confirm({ due_at: 'tomorrow-server' });
		today.confirm({ due_at: 'today-server' });
		expect(read().task.due_at).toBe('tomorrow-server');
	});
});
