// apps/web/src/lib/components/project/v2/TaskKanbanBoard.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '$lib/types/onto';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
import { notifyDataMutation } from '$lib/stores/projectDataMutations';
import TaskKanbanBoard from './TaskKanbanBoard.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function task(title: string, state_key: Task['state_key'], overrides: Partial<Task> = {}): Task {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		project_id: PROJECT_ID,
		title,
		type_key: 'task.project',
		state_key,
		priority: null,
		description: `${title} description`,
		start_at: null,
		due_at: null,
		completed_at: state_key === 'done' ? now : null,
		deleted_at: null,
		props: {},
		created_by: USER_ID,
		created_at: now,
		updated_at: now,
		...overrides
	};
}

function archivedTask(title: string): Task {
	const at = new Date().toISOString();
	return task(title, 'todo', { deleted_at: at, archived_at: at });
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function archivePage(tasks: Task[]) {
	return json({ success: true, data: { tasks, total: tasks.length, hasMore: false } });
}

function drop(target: HTMLElement, taskId: string) {
	return fireEvent.drop(target, {
		dataTransfer: { getData: () => taskId, setData: () => undefined }
	});
}

function renderBoard(tasks: Task[]) {
	return render(TaskKanbanBoard, {
		props: {
			projectId: PROJECT_ID,
			tasks,
			tasksCoverage: createCompleteProjectTasksCoverage(tasks),
			canEdit: true,
			onEditTask: vi.fn()
		}
	});
}

describe('TaskKanbanBoard workflow', () => {
	beforeEach(() => {
		// The delete confirmation modal restores scroll on close.
		vi.stubGlobal('scrollTo', vi.fn());
		Element.prototype.animate = vi.fn(() => {
			return {
				finished: Promise.resolve(),
				cancel: vi.fn(),
				play: vi.fn(),
				pause: vi.fn(),
				currentTime: 0
			} as unknown as Animation;
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps due-date states inside the familiar four-stage workflow', () => {
		const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
		const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
		renderBoard([
			task('Undated idea', 'todo'),
			task('Upcoming launch', 'todo', { due_at: future }),
			task('Late active task', 'in_progress', { due_at: past }),
			task('Waiting on approval', 'blocked'),
			task('Shipped task', 'done')
		]);

		const backlog = screen.getByRole('region', { name: 'Backlog column' });
		const inProgress = screen.getByRole('region', { name: 'In progress column' });

		expect(within(backlog).getByText('Undated idea')).toBeInTheDocument();
		expect(within(backlog).getByText('Upcoming launch')).toBeInTheDocument();
		expect(within(inProgress).getByText('Late active task')).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Blocked column' })).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Done column' })).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Scheduled column' })).not.toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Overdue column' })).not.toBeInTheDocument();
		expect(screen.queryByRole('region', { name: 'Archived column' })).not.toBeInTheDocument();
	});

	it('filters by overdue and scheduled dates while keeping selected filters visible', async () => {
		const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
		const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
		renderBoard([
			task('Undated idea', 'todo'),
			task('Upcoming launch', 'todo', { due_at: future }),
			task('Late active task', 'in_progress', { due_at: past })
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Filter by overdue tasks' }));

		expect(screen.getByRole('button', { name: 'Remove overdue filter' })).toBeInTheDocument();
		expect(screen.getByText('Late active task')).toBeInTheDocument();
		expect(screen.queryByText('Upcoming launch')).not.toBeInTheDocument();
		expect(screen.queryByText('Undated idea')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Filter by scheduled tasks' }));
		expect(screen.getByText('Late active task')).toBeInTheDocument();
		expect(screen.getByText('Upcoming launch')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect(screen.getByText('Undated idea')).toBeInTheDocument();
		expect(screen.queryByLabelText('Active task filters')).not.toBeInTheDocument();
	});

	it('loads archived work only when its secondary column is opened', async () => {
		const archived = archivedTask('Archived research');
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					data: { tasks: [archived], total: 1, hasMore: false }
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);
		renderBoard([]);

		expect(screen.queryByRole('region', { name: 'Archived column' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Show archived tasks' }));

		const archivedColumn = await screen.findByRole('region', { name: 'Archived column' });
		await waitFor(() => {
			expect(within(archivedColumn).getByText('Archived research')).toBeInTheDocument();
		});
		expect(fetchMock).toHaveBeenCalledWith(
			`/api/onto/projects/${PROJECT_ID}/tasks/archived?limit=50&offset=0`,
			{ credentials: 'same-origin' }
		);
		expect(screen.getByRole('button', { name: 'Hide archived tasks' })).toBeInTheDocument();
	});

	it('refreshes a loaded archive after chat changes and removes stale archived rows', async () => {
		const old = archivedTask('Old archived task');
		const archived = archivedTask('Archived through chat');
		const response = (tasks: Task[]) =>
			new Response(
				JSON.stringify({
					success: true,
					data: { tasks, total: tasks.length, hasMore: false }
				})
			);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(response([old]))
			.mockResolvedValueOnce(response([archived]));
		vi.stubGlobal('fetch', fetchMock);
		renderBoard([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show archived tasks' }));
		expect(await screen.findByText(old.title)).toBeInTheDocument();
		notifyDataMutation({
			hasChanges: true,
			totalMutations: 1,
			affectedProjectIds: [PROJECT_ID],
			hasMessagesSent: true,
			mutations: [
				{
					entityKind: 'task',
					entityId: archived.id,
					operation: 'delete',
					projectIds: [PROJECT_ID]
				}
			]
		});
		expect(await screen.findByText(archived.title)).toBeInTheDocument();
		expect(screen.queryByText(old.title)).not.toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('archives a dropped card with archive: true so it is kept', async () => {
		const live = task('Park this idea', 'todo');
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/tasks/archived')) return archivePage([]);
			if (init?.method === 'DELETE') return json({ success: true, data: {} });
			throw new Error(`Unexpected fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		renderBoard([live]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show archived tasks' }));
		const archivedColumn = await screen.findByRole('region', { name: 'Archived column' });
		await waitFor(() =>
			expect(within(archivedColumn).getByText('No archived tasks')).toBeTruthy()
		);

		await drop(archivedColumn, live.id);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(`/api/onto/tasks/${live.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ archive: true })
			});
		});
		expect(within(archivedColumn).getByText('Park this idea')).toBeInTheDocument();
		expect(within(archivedColumn).getByText('archived today')).toBeInTheDocument();
	});

	it('restores an archived card dragged back to a workflow column', async () => {
		const archived = archivedTask('Bring this back');
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/tasks/archived')) return archivePage([archived]);
			if (url.endsWith('/restore') && init?.method === 'POST')
				return json({ success: true, data: { task: archived } });
			throw new Error(`Unexpected fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		renderBoard([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show archived tasks' }));
		await screen.findByText('Bring this back');

		await drop(screen.getByRole('region', { name: 'Backlog column' }), archived.id);

		const backlog = screen.getByRole('region', { name: 'Backlog column' });
		await waitFor(() => expect(within(backlog).getByText('Bring this back')).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledWith(`/api/onto/tasks/${archived.id}/restore`, {
			method: 'POST',
			credentials: 'same-origin'
		});
		expect(
			within(screen.getByRole('region', { name: 'Archived column' })).queryByText(
				'Bring this back'
			)
		).not.toBeInTheDocument();
	});

	it('deletes an archived card after confirmation and drops it from the board', async () => {
		const archived = archivedTask('Old experiment');
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/tasks/archived')) return archivePage([archived]);
			if (init?.method === 'DELETE') return json({ success: true, data: {} });
			throw new Error(`Unexpected fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		renderBoard([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Show archived tasks' }));
		await screen.findByText('Old experiment');

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Old experiment' }));
		expect(
			await screen.findByText(/leaves the archive now and is erased for good after 30/)
		).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));

		await waitFor(() => expect(screen.queryByText('Old experiment')).not.toBeInTheDocument());
		expect(fetchMock).toHaveBeenLastCalledWith(`/api/onto/tasks/${archived.id}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});
		expect(
			within(screen.getByRole('region', { name: 'Archived column' })).getByText(
				'No archived tasks'
			)
		).toBeInTheDocument();
	});

	it('never shows a deleted task that was not archived', () => {
		renderBoard([
			task('Still here', 'todo'),
			task('Deleted for good', 'todo', { deleted_at: new Date().toISOString() })
		]);

		expect(screen.getByText('Still here')).toBeInTheDocument();
		expect(screen.queryByText('Deleted for good')).not.toBeInTheDocument();
	});
});
