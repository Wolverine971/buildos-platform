// apps/web/src/lib/components/project/v2/TaskKanbanBoard.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '$lib/types/onto';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
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
		const archived = task('Archived research', 'todo', {
			deleted_at: new Date().toISOString()
		});
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
});
