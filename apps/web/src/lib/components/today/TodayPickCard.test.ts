// apps/web/src/lib/components/today/TodayPickCard.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodayPickCard from './TodayPickCard.svelte';
import type { TodayPick } from './today-picks';

afterEach(() => {
	cleanup();
});

const task = {
	id: 'task-1',
	project_id: 'project-1',
	project_name: 'Launch Project',
	title: 'Write launch plan',
	description: null,
	state_key: 'todo',
	due_at: null,
	start_at: null,
	priority: null,
	updated_at: '2026-11-21T00:00:00Z',
	bucket: 'due_soon' as const
};

const taskPick: TodayPick = {
	key: 'task:task-1',
	kind: 'due',
	title: task.title,
	projectId: 'project-1',
	projectName: 'Launch Project',
	why: 'Due tomorrow.',
	task,
	waiting: null
};

/** An ask the morning pass wrote with no task behind it. */
const askPick: TodayPick = {
	key: 'waiting:ask-1',
	kind: 'waiting',
	title: 'Your approval on the script draft',
	projectId: 'project-1',
	projectName: 'Launch Project',
	why: 'BuildOS agent is waiting on you since Nov 9.',
	task: null,
	waiting: {
		id: 'ask-1',
		direction: 'on_you',
		who: 'BuildOS agent',
		who_kind: 'agent',
		what: 'Your approval on the script draft',
		project_id: 'project-1',
		project_name: 'Launch Project',
		task_id: null,
		since: '2026-11-09'
	}
};

function renderCard(pick: TodayPick) {
	const handlers = {
		onOpen: vi.fn(),
		onTaskState: vi.fn(),
		onAskStatus: vi.fn(),
		onSkip: vi.fn(),
		onShowSkipped: vi.fn()
	};
	render(TodayPickCard, { props: { picks: [pick], time: 'afternoon', ...handlers } });
	return handlers;
}

describe('TodayPickCard', () => {
	it('links the title to the task and the project name to the project, with no Open or Done button', async () => {
		const handlers = renderCard(taskPick);

		expect(screen.getByRole('link', { name: 'Open project Launch Project' })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
		expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();

		await fireEvent.click(
			screen.getByRole('button', { name: 'Open task "Write launch plan"' })
		);
		expect(handlers.onOpen).toHaveBeenCalledWith(taskPick);
	});

	it('changes the task status from the menu and ignores a pick of the status it already has', async () => {
		const handlers = renderCard(taskPick);
		const trigger = () => screen.getByRole('button', { name: 'Status: To do. Change status' });

		await fireEvent.click(trigger());
		expect(
			screen.getAllByRole('menuitemradio').map((item) => item.textContent?.trim())
		).toEqual(['To do', 'In progress', 'Blocked', 'Done']);
		expect(screen.getByRole('menuitemradio', { name: 'To do' })).toHaveAttribute(
			'aria-checked',
			'true'
		);

		await fireEvent.click(screen.getByRole('menuitemradio', { name: 'In progress' }));
		expect(handlers.onTaskState).toHaveBeenCalledWith(taskPick, 'in_progress');
		expect(screen.queryByRole('menu')).toBeNull();

		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('menuitemradio', { name: 'To do' }));
		expect(handlers.onTaskState).toHaveBeenCalledTimes(1);
	});

	it('gives an ask with no task a plain title and Handled / Not needed instead of task statuses', async () => {
		const handlers = renderCard(askPick);

		expect(screen.queryByRole('button', { name: /^Open task/ })).toBeNull();
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(askPick.title);
		expect(
			screen.getByRole('link', { name: 'Open project Launch Project' })
		).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Change status' }));
		expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
		await fireEvent.click(screen.getByRole('menuitem', { name: /Not needed/ }));
		expect(handlers.onAskStatus).toHaveBeenCalledWith(askPick, 'dismissed');
		expect(handlers.onTaskState).not.toHaveBeenCalled();
	});
});
