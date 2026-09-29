// apps/web/src/lib/components/today/TodayTaskGroups.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodayTask } from '$lib/types/today';
import TodayTaskGroups from './TodayTaskGroups.svelte';

vi.mock('$lib/actions/preload-entity-modal', () => ({ preloadEntityModal: () => ({}) }));
afterEach(cleanup);

function task(id: string, overrides: Partial<TodayTask> = {}): TodayTask {
	return {
		id,
		title: id,
		project_id: 'one',
		project_name: 'Same name',
		bucket: 'in_progress',
		state_key: 'in_progress',
		description: null,
		due_at: null,
		start_at: null,
		priority: null,
		updated_at: '2026-09-29T12:00:00Z',
		...overrides
	};
}

describe('Today task grouping', () => {
	it('keeps deadlines first and equally named projects separate without losing tasks', () => {
		const tasks = [
			task('Ongoing'),
			task('Due in second project', { bucket: 'due_today', project_id: 'two' }),
			task('Starting', { bucket: 'starts_today' }),
			task('Due in first project', { bucket: 'due_today' })
		];
		render(TodayTaskGroups, {
			tasks,
			doneIds: new Set(),
			onOpenTask: vi.fn(),
			onToggleDone: vi.fn(),
			onChat: vi.fn()
		});
		expect(
			screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
		).toEqual(['Due today', 'Starting today', 'In progress']);
		const due = within(screen.getByRole('region', { name: 'Due today' }));
		expect(due.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
			'/projects/two',
			'/projects/one'
		]);
		expect(screen.getAllByRole('listitem')).toHaveLength(4);
		expect(tasks.map((item) => item.id)).toEqual([
			'Ongoing',
			'Due in second project',
			'Starting',
			'Due in first project'
		]);
	});

	it('preserves the selected task and completion/undo state through prop updates', async () => {
		const selected = task('Write outline');
		const onOpenTask = vi.fn();
		const onToggleDone = vi.fn();
		const onChat = vi.fn();
		const props = {
			tasks: [selected],
			doneIds: new Set<string>(),
			onOpenTask,
			onToggleDone,
			onChat
		};
		const view = render(TodayTaskGroups, props);
		await fireEvent.click(
			screen.getByRole('button', { name: 'Open task details for "Write outline"' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Chat about "Write outline"' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Mark "Write outline" done' }));
		for (const callback of [onOpenTask, onToggleDone, onChat])
			expect(callback.mock.calls[0]?.[0]).toStrictEqual(selected);
		await view.rerender({ ...props, doneIds: new Set([selected.id]) });
		const undo = screen.getByRole('button', { name: 'Mark "Write outline" as not done' });
		expect(undo.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(undo);
		expect(onToggleDone).toHaveBeenCalledTimes(2);
		await view.rerender({
			...props,
			tasks: [task(selected.id, { bucket: 'due_today', state_key: 'blocked' })]
		});
		expect(screen.queryByRole('region', { name: 'In progress' })).toBeNull();
		expect(
			within(screen.getByRole('region', { name: 'Due today' })).getByText('Blocked')
		).toBeTruthy();
	});
});
