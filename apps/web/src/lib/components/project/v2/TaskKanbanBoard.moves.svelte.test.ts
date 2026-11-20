// apps/web/src/lib/components/project/v2/TaskKanbanBoard.moves.svelte.test.ts
// @vitest-environment jsdom
//
// The board shows the page's own task objects, with a drag laid over them while it is in
// flight. These cover the two things the old cloned list got wrong: a page refresh landing
// mid-drag put the dragged card back, and every refresh rebuilt every card.
//
// Mounted with `$state.raw` props, as the project page holds its tasks: Testing Library's
// render deep-proxies props, which changes every task's identity on each update.
import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '$lib/types/onto';
import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
import TaskKanbanBoard from './TaskKanbanBoard.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function task(title: string, state_key: Task['state_key'], overrides: Partial<Task> = {}): Task {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		project_id: PROJECT_ID,
		title,
		type_key: 'task.project',
		state_key,
		priority: null,
		description: null,
		start_at: null,
		due_at: null,
		completed_at: state_key === 'done' ? now : null,
		deleted_at: null,
		props: {},
		created_by: '22222222-2222-4222-8222-222222222222',
		created_at: now,
		updated_at: now,
		...overrides
	} as Task;
}

const stops: (() => void)[] = [];

function mountBoard(initial: Task[]) {
	let tasks = $state.raw(initial);
	const onTaskMoved = vi.fn();
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(TaskKanbanBoard, {
		target,
		props: {
			projectId: PROJECT_ID,
			get tasks() {
				return tasks;
			},
			get tasksCoverage() {
				return createCompleteProjectTasksCoverage(tasks);
			},
			canEdit: true,
			onEditTask: vi.fn(),
			onTaskMoved
		}
	});
	flushSync();
	stops.push(() => {
		unmount(component);
		target.remove();
	});
	return {
		onTaskMoved,
		setTasks(next: Task[]) {
			tasks = next;
			flushSync();
		}
	};
}

const column = (name: string) => screen.getByRole('region', { name: `${name} column` });

function drop(target: HTMLElement, taskId: string) {
	return fireEvent.drop(target, {
		dataTransfer: { getData: () => taskId, setData: () => undefined }
	});
}

/** A PATCH that waits until the test lets it answer. */
function heldRequest() {
	let answer!: (response: Response) => void;
	const response = new Promise<Response>((resolve) => (answer = resolve));
	vi.stubGlobal(
		'fetch',
		vi.fn(() => response)
	);
	const reply = (status: number) =>
		answer(
			new Response(JSON.stringify(status === 200 ? { success: true } : { error: 'Nope' }), {
				status,
				headers: { 'Content-Type': 'application/json' }
			})
		);
	return { succeed: () => reply(200), fail: () => reply(500) };
}

describe('TaskKanbanBoard moves', () => {
	beforeEach(() => {
		Element.prototype.animate = vi.fn(
			() =>
				({
					finished: Promise.resolve(),
					cancel: vi.fn(),
					play: vi.fn(),
					pause: vi.fn(),
					currentTime: 0
				}) as unknown as Animation
		);
	});
	afterEach(() => {
		for (const stop of stops.splice(0)) stop();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('keeps a dragged card where it was dropped when a page refresh lands mid-drag', async () => {
		const other = task('Other task', 'todo');
		const dragged = task('Dragged task', 'todo');
		const board = mountBoard([other, dragged]);
		const request = heldRequest();

		await drop(column('In progress'), dragged.id);
		expect(within(column('In progress')).getByText('Dragged task')).toBeInTheDocument();

		// Another task's refresh lands while the drag is still saving. It re-read both
		// tasks before the drag reached the server, so the dragged one still says "todo".
		board.setTasks([{ ...other, state_key: 'done' }, { ...dragged }]);
		expect(within(column('In progress')).getByText('Dragged task')).toBeInTheDocument();
		expect(within(column('Done')).getByText('Other task')).toBeInTheDocument();

		request.succeed();
		await waitFor(() =>
			expect(board.onTaskMoved).toHaveBeenCalledWith(dragged.id, 'in_progress')
		);
		flushSync();
		// Saved, and the page has not re-read it yet: it stays put.
		expect(within(column('In progress')).getByText('Dragged task')).toBeInTheDocument();

		// The page's re-read is the truth from here on, whatever it says.
		board.setTasks([
			{ ...other, state_key: 'done' },
			{ ...dragged, state_key: 'blocked' }
		]);
		expect(within(column('Blocked')).getByText('Dragged task')).toBeInTheDocument();
	});

	it('puts the card back when the move fails', async () => {
		const dragged = task('Dragged task', 'todo');
		mountBoard([dragged]);
		const request = heldRequest();

		await drop(column('Blocked'), dragged.id);
		expect(within(column('Blocked')).getByText('Dragged task')).toBeInTheDocument();

		request.fail();
		await waitFor(() =>
			expect(within(column('Backlog')).getByText('Dragged task')).toBeInTheDocument()
		);
	});

	it('rebuilds one card, not every card, when the page replaces one task', () => {
		// A month out, so each card's due label goes through the date formatter counted below.
		const due = new Date(Date.now() + 30 * 86_400_000).toISOString();
		const tasks = ['One', 'Two', 'Three', 'Four', 'Five'].map((title) =>
			task(title, 'todo', { due_at: due })
		);
		const formats = vi.spyOn(Date.prototype, 'toLocaleDateString');
		const board = mountBoard(tasks);
		const perCard = formats.mock.calls.length / tasks.length;
		expect(perCard).toBeGreaterThan(0);
		formats.mockClear();

		// Copy-on-write, as the page's refresh does it: one new object, four kept.
		board.setTasks([{ ...tasks[0]!, title: 'One, renamed' }, ...tasks.slice(1)]);

		expect(screen.getByText('One, renamed')).toBeInTheDocument();
		expect(formats.mock.calls.length).toBe(perCard);
	});
});
