// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import type { ProjectItemPageData } from '$lib/server/projects/project-item-page';
import TaskPageWithNavigation from './__fixtures__/TaskPageWithNavigation.svelte';

vi.mock('$app/state', () => ({
	page: { url: new URL('https://example.test/projects/p/tasks/a'), state: {}, data: {} }
}));
vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn(),
	replaceState: vi.fn()
}));
vi.mock('$lib/components/agent/load-agent-chat-modal', async () => {
	const modal = await import('./__fixtures__/TaskChatStub.svelte');
	return {
		loadAgentChatModal: () => Promise.resolve(modal),
		preloadAgentChatModal: () => () => {},
		warmAgentChatModal: vi.fn()
	};
});
// The task list and its selection are real. Skip fetching the reader's detail panel.
vi.mock(
	'$lib/components/projects/desktop/DesktopReader.svelte',
	async () => import('$lib/components/projects/desktop/__fixtures__/ModalStub.svelte')
);

const data: ProjectItemPageData = {
	projectId: 'p',
	projectName: 'The Cadre',
	item: { kind: 'task', id: 'a' },
	itemTitle: 'Gather instructor details',
	canWrite: false,
	seed: null,
	card: {
		project: {
			id: 'p',
			name: 'The Cadre',
			can_write: false,
			updated_at: '',
			shared_folder_document_id: null,
			shared_with_count: null,
			structure: { version: 1, root: [] },
			documents: [],
			tasks: [
				{ id: 'a', title: 'Gather instructor details' },
				{ id: 'b', title: 'Review bios' }
			].map((task) => ({
				...task,
				state_key: 'todo',
				updated_at: '',
				start_at: null,
				due_at: null
			}))
		},
		goals: []
	}
};

async function openTaskChat(id: string, title: string) {
	await fireEvent.click(screen.getByRole('button', { name: 'Open Task chat' }));
	const chat = await screen.findByRole('dialog', { name: 'Chat' });
	expect(JSON.parse(within(chat).getByRole('status').textContent!)).toEqual({
		focusType: 'task',
		focusEntityId: id,
		focusEntityName: title,
		projectId: data.projectId,
		projectName: data.projectName
	});
	return chat;
}

beforeEach(() => {
	// SvelteKit keeps the original loader data when the reader shallow-routes to the next task.
	Object.assign(page.data, data);
});
afterEach(cleanup);

describe('header chat on a task page', () => {
	it('opens the task from the loaded page even without a project task list', async () => {
		render(TaskPageWithNavigation, { data: { ...data, card: null } });
		await openTaskChat('a', 'Gather instructor details');
	});

	it('resumes the same task, then focuses the next task selected in the reader', async () => {
		render(TaskPageWithNavigation, { data });
		const chat = await openTaskChat('a', 'Gather instructor details');
		await fireEvent.input(within(chat).getByLabelText('Draft'), {
			target: { value: 'My draft' }
		});
		await fireEvent.click(within(chat).getByRole('button', { name: 'Minimize' }));
		expect(await openTaskChat('a', 'Gather instructor details')).toBe(chat);
		expect(within(chat).getByLabelText('Draft')).toHaveValue('My draft');

		await fireEvent.click(within(chat).getByRole('button', { name: 'Minimize' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Review bios' }));
		// The hidden instance must retain its own scope until a different chat is opened.
		expect(chat.querySelector('output')).toHaveTextContent('Gather instructor details');
		const nextChat = await openTaskChat('b', 'Review bios');
		expect(nextChat).not.toBe(chat);
	});
});
