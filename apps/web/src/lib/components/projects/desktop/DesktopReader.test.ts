// apps/web/src/lib/components/projects/desktop/DesktopReader.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/paths', () => ({
	resolve: (route: string, params?: Record<string, string>) =>
		route.replace('[id]', params?.id ?? '').replace('[task_id]', params?.task_id ?? '')
}));
vi.mock('$lib/stores/toast.store', () => ({
	toastService: { success: vi.fn(() => 'toast-1'), error: vi.fn(), remove: vi.fn() }
}));
vi.mock('$lib/components/ui/RichMarkdownEditor.svelte', async () => ({
	default: (await import('./__fixtures__/EditorStub.svelte')).default
}));

import DesktopReader from './DesktopReader.svelte';
import { removedIds, undo } from './reader-removals.svelte';

function ok(data: unknown) {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
	if (init?.method === 'PATCH') return ok({ task: { id: 't1', state_key: 'done' } });
	if (url.startsWith('/api/onto/tasks/t1/full'))
		return ok({
			task: {
				id: 't1',
				title: 'Ship the phone Today',
				description: '## Plan\n\n- **Fold** the details',
				state_key: 'in_progress',
				priority: 2,
				due_at: null,
				start_at: null,
				updated_at: '2026-10-06T12:00:00.000Z'
			}
		});
	// The Details panel's own reads (members, links, collaboration) answer empty.
	if (url.startsWith('/api/')) return ok({});
	throw new Error(`Unexpected fetch ${url}`);
});

function patches() {
	return fetchMock.mock.calls
		.filter(([, init]) => init?.method === 'PATCH')
		.map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) }));
}

function renderReader(extra: Record<string, unknown> = {}) {
	const onChanged = vi.fn();
	const onStep = vi.fn();
	render(DesktopReader, {
		props: {
			item: { kind: 'task', id: 't1' },
			projectId: 'p1',
			canWrite: true,
			order: ['t1', 't2'],
			fallbackTitle: 'Ship the phone Today',
			layout: 'peek',
			listShown: true,
			chatOn: false,
			phone: false,
			onClose: vi.fn(),
			onStep,
			onToggleFocus: vi.fn(),
			onToggleList: vi.fn(),
			onChat: vi.fn(),
			onChanged,
			...extra
		}
	});
	return { onChanged, onStep };
}

describe('DesktopReader on Today', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('names the task’s project where the list mixes projects', async () => {
		renderReader({ projectName: 'BuildOS Mobile' });

		await screen.findByRole('heading', { name: 'Plan' });
		expect(screen.getByRole('link', { name: 'BuildOS Mobile' })).toHaveAttribute(
			'href',
			'/projects/p1'
		);
	});

	it('reports a state change to a host that tracks it, instead of a full refresh', async () => {
		const onTaskState = vi.fn();
		const { onChanged } = renderReader({ onTaskState });

		await screen.findByRole('heading', { name: 'Plan' });
		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		await waitFor(() => expect(onTaskState).toHaveBeenCalledWith('t1', 'done', 'in_progress'));
		expect(onChanged).not.toHaveBeenCalled();
		const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
		expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ state_key: 'done' });
	});

	it('still announces changes through onChanged on the project page', async () => {
		const { onChanged } = renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		expect(screen.queryByRole('link', { name: 'BuildOS Mobile' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));

		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
	});

	it('changes priority from its chip, with no editor in between', async () => {
		const { onChanged } = renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		await fireEvent.click(screen.getByRole('button', { name: 'Priority: P2 · High' }));
		await fireEvent.click(screen.getByRole('button', { name: /^P4/ }));

		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
		expect(patches()).toEqual([{ url: '/api/onto/tasks/t1', body: { priority: 4 } }]);
		expect(screen.getByRole('button', { name: 'Priority: P4 · Low' })).toBeInTheDocument();
	});

	it('renames from the title pencil and edits the text from its Edit tab, apart', async () => {
		const { onChanged } = renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		// No Edit button: the title has its pencil, the text its Edit | Preview.
		expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
		expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute(
			'aria-selected',
			'true'
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Rename this task' }));
		const titleInput = await screen.findByRole('textbox', { name: 'Task title' });
		expect(screen.queryByRole('textbox', { name: 'Body' })).not.toBeInTheDocument();
		await fireEvent.input(titleInput, { target: { value: 'Ship the phone Today, for real' } });
		await fireEvent.keyDown(titleInput, { key: 'Enter' });
		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
		expect(patches()).toEqual([
			{ url: '/api/onto/tasks/t1', body: { title: 'Ship the phone Today, for real' } }
		]);
		await waitFor(() =>
			expect(screen.queryByRole('textbox', { name: 'Task title' })).not.toBeInTheDocument()
		);

		await fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
		const body = await screen.findByRole('textbox', { name: 'Body' });
		await fireEvent.input(body, { target: { value: 'Just ship it.' } });
		await fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
		await waitFor(() => expect(patches()).toHaveLength(2));
		expect(patches()[1]).toEqual({
			url: '/api/onto/tasks/t1',
			body: { description: 'Just ship it.' }
		});
		await waitFor(() =>
			expect(screen.queryByRole('textbox', { name: 'Body' })).not.toBeInTheDocument()
		);
	});

	it('cancels a rename with Esc and sends nothing', async () => {
		renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		await fireEvent.click(screen.getByRole('button', { name: 'Rename this task' }));
		const titleInput = await screen.findByRole('textbox', { name: 'Task title' });
		await fireEvent.input(titleInput, { target: { value: 'Oops' } });
		await fireEvent.keyDown(titleInput, { key: 'Escape' });

		await waitFor(() =>
			expect(screen.queryByRole('textbox', { name: 'Task title' })).not.toBeInTheDocument()
		);
		await new Promise((done) => setTimeout(done, 1700));
		expect(patches()).toEqual([]);
		expect(screen.getByRole('heading', { name: /Ship the phone Today/ })).toBeInTheDocument();
	});

	it('archives from the bottom left: the task leaves at once and the reader moves on', async () => {
		const { onStep } = renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		expect(removedIds.has('t1')).toBe(true);
		await waitFor(() => expect(onStep).toHaveBeenCalledWith('t2'));
		// Nothing is sent inside the Undo window.
		expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
		expect(undo('t1')).toBe(true);
	});

	it('opens Details beside the task: people, repeat, links, comments, activity, images', async () => {
		renderReader();

		await screen.findByRole('heading', { name: 'Plan' });
		expect(screen.queryByRole('complementary', { name: 'Details' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Details' }));
		// The panel is loaded on first open.
		await vi.dynamicImportSettled();
		const panel = await screen.findByRole(
			'complementary',
			{ name: 'Details' },
			{ timeout: 5000 }
		);
		expect(panel).toHaveTextContent('Assignees');
		expect(panel).toHaveTextContent("Doesn't repeat");
		for (const section of ['Linked items', 'Comments', 'Activity', 'Images']) {
			expect(screen.getByRole('button', { name: new RegExp(section) })).toBeInTheDocument();
		}
		expect(screen.getByRole('button', { name: 'Open the full editor' })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
		await waitFor(() =>
			expect(screen.queryByRole('complementary', { name: 'Details' })).not.toBeInTheDocument()
		);
		localStorage.clear();
	}, 15000);
});
