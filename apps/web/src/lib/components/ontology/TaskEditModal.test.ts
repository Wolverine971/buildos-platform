// apps/web/src/lib/components/ontology/TaskEditModal.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskEditModal from './TaskEditModal.svelte';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function taskResponse(id: string, title: string): Response {
	return new Response(
		JSON.stringify({
			data: {
				task: {
					id,
					title,
					description: '',
					priority: 3,
					state_key: 'todo',
					type_key: 'task.default',
					assignees: [],
					props: {}
				}
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

describe('TaskEditModal task loading', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: vi.fn((query: string) => ({
				matches: query === '(min-width: 1024px)',
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			}))
		});
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		Object.defineProperty(Element.prototype, 'animate', {
			configurable: true,
			writable: true,
			value: vi.fn(() => ({
				cancel: vi.fn(),
				commitStyles: vi.fn(),
				finished: Promise.resolve(),
				play: vi.fn()
			}))
		});
	});

	it('opens with task details closed behind the right-edge tab', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(taskResponse('task-a', 'Task A')))
		);

		render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose: vi.fn()
			}
		});

		await screen.findByDisplayValue('Task A');
		expect(screen.getByRole('dialog', { name: 'Task A' })).toBeInTheDocument();
		const openButton = screen.getByRole('button', { name: 'Open Task details' });
		const panelId = openButton.getAttribute('aria-controls');
		const panel = document.getElementById(String(panelId));
		const panelContent = document.getElementById(`${panelId}-content`);

		expect(openButton).toHaveAttribute('aria-expanded', 'false');
		expect(openButton.parentElement).toHaveClass('right-0');
		expect(panel).toHaveAttribute('aria-hidden', 'true');
		expect((panel as HTMLElement & { inert: boolean }).inert).toBe(true);
		expect(panel?.firstElementChild).toHaveClass(
			'lg:sticky',
			'lg:top-0',
			'lg:h-[calc(85dvh-10.125rem)]',
			'lg:overflow-hidden'
		);
		expect(panelContent).toHaveClass(
			'lg:min-h-0',
			'lg:flex-1',
			'lg:overflow-y-auto',
			'lg:overscroll-contain',
			'lg:[scrollbar-gutter:stable]'
		);

		await fireEvent.click(openButton);

		const closeButton = screen.getByRole('button', { name: 'Close Task details' });
		expect(closeButton).toHaveAttribute('aria-expanded', 'true');
		expect(closeButton.parentElement).toHaveClass('right-80');
		expect(panel).toHaveAttribute('aria-hidden', 'false');
		expect((panel as HTMLElement & { inert: boolean }).inert).toBe(false);
		expect(screen.getByText('TASK DETAILS')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Linked Entities' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	});

	it('keeps task details available inline below the desktop breakpoint', async () => {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: vi.fn((query: string) => ({
				matches: false,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			}))
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(() => Promise.resolve(taskResponse('task-a', 'Task A')))
		);

		render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose: vi.fn()
			}
		});

		await screen.findByDisplayValue('Task A');
		const button = screen.getByRole('button', { name: 'Open Task details' });
		const panel = document.getElementById(String(button.getAttribute('aria-controls')));

		expect(panel).toHaveAttribute('aria-hidden', 'false');
		expect((panel as HTMLElement & { inert: boolean }).inert).toBe(false);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('keeps the latest task when an obsolete request resolves last', async () => {
		const taskA = deferred<Response>();
		const taskB = deferred<Response>();
		const requestSignals = new Map<string, AbortSignal | undefined>();
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			requestSignals.set(url, init?.signal ?? undefined);

			if (url.includes('/tasks/task-a/')) return taskA.promise;
			if (url.includes('/tasks/task-b/')) return taskB.promise;

			return Promise.resolve(
				new Response(JSON.stringify({ data: {} }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onClose = vi.fn();

		const view = render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose,
				onLoaded
			}
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/tasks/task-a/full?include_linked=false',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			)
		);

		await view.rerender({
			taskId: 'task-b',
			projectId: 'project-1',
			onClose,
			onLoaded
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/tasks/task-b/full?include_linked=false',
				expect.objectContaining({ signal: expect.any(AbortSignal) })
			)
		);
		expect(
			requestSignals.get('/api/onto/tasks/task-a/full?include_linked=false')?.aborted
		).toBe(true);

		taskB.resolve(taskResponse('task-b', 'Task B'));
		await waitFor(() => expect(screen.getByDisplayValue('Task B')).toBeInTheDocument());
		expect(onLoaded).toHaveBeenCalledTimes(1);

		// Simulate a transport that ignores abort and still resolves the obsolete request.
		taskA.resolve(taskResponse('task-a', 'Task A'));
		await waitFor(() => {
			expect(screen.getByDisplayValue('Task B')).toBeInTheDocument();
			expect(screen.queryByDisplayValue('Task A')).not.toBeInTheDocument();
			expect(onLoaded).toHaveBeenCalledTimes(1);
		});
	});

	it('settles loading when the active task is cleared', async () => {
		const pendingTask = deferred<Response>();
		let requestSignal: AbortSignal | undefined;
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return pendingTask.promise;
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onClose = vi.fn();

		const view = render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose,
				onLoaded
			}
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await view.rerender({
			taskId: '',
			projectId: 'project-1',
			onClose,
			onLoaded
		});

		await waitFor(() => expect(screen.getByText('Task not found')).toBeInTheDocument());
		expect(requestSignal?.aborted).toBe(true);
		expect(onLoaded).not.toHaveBeenCalled();
	});

	it('cancels the active load when the modal closes', async () => {
		const pendingTask = deferred<Response>();
		let requestSignal: AbortSignal | undefined;
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			requestSignal = init?.signal ?? undefined;
			return pendingTask.promise;
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onClose = vi.fn();

		render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose,
				onLoaded
			}
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

		expect(requestSignal?.aborted).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);

		pendingTask.resolve(taskResponse('task-a', 'Task A'));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(onLoaded).not.toHaveBeenCalled();
	});

	it('ignores a task save that resolves after the component switches tasks', async () => {
		const taskA = deferred<Response>();
		const taskB = deferred<Response>();
		const taskASave = deferred<Response>();
		const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);

			if (init?.method === 'PATCH' && url.endsWith('/tasks/task-a')) {
				return taskASave.promise;
			}
			if (url.includes('/tasks/task-a/full')) return taskA.promise;
			if (url.includes('/tasks/task-b/full')) return taskB.promise;

			return Promise.resolve(
				new Response(JSON.stringify({ data: {} }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const onLoaded = vi.fn();
		const onUpdated = vi.fn();
		const onClose = vi.fn();

		const view = render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose,
				onLoaded,
				onUpdated
			}
		});

		taskA.resolve(taskResponse('task-a', 'Task A'));
		await waitFor(() => expect(screen.getByDisplayValue('Task A')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				'/api/onto/tasks/task-a',
				expect.objectContaining({ method: 'PATCH' })
			)
		);

		await view.rerender({
			taskId: 'task-b',
			projectId: 'project-1',
			onClose,
			onLoaded,
			onUpdated
		});
		taskB.resolve(taskResponse('task-b', 'Task B'));
		await waitFor(() => expect(screen.getByDisplayValue('Task B')).toBeInTheDocument());

		taskASave.resolve(
			new Response(
				JSON.stringify({
					data: {
						task: {
							id: 'task-a',
							state_key: 'done',
							completed_at: '2026-07-14T12:00:00.000Z'
						}
					}
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		await waitFor(() => {
			expect(screen.getByDisplayValue('Task B')).toBeInTheDocument();
			expect(onUpdated).not.toHaveBeenCalled();
			expect(onClose).not.toHaveBeenCalled();
		});
	});

	it('keeps the latest calendar-link status when delete confirmation is reopened', async () => {
		const calendarRequests: Array<{
			response: Deferred<Response>;
			signal: AbortSignal | undefined;
		}> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes('/tasks/task-a/full')) {
					return Promise.resolve(taskResponse('task-a', 'Task A'));
				}
				if (url.includes('/events?owner_type=task')) {
					const response = deferred<Response>();
					calendarRequests.push({ response, signal: init?.signal ?? undefined });
					// Deliberately ignore abort so the request token is exercised too.
					return response.promise;
				}

				return Promise.resolve(
					new Response(JSON.stringify({ data: {} }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
				);
			})
		);

		render(TaskEditModal, {
			props: {
				taskId: 'task-a',
				projectId: 'project-1',
				onClose: vi.fn()
			}
		});

		await waitFor(() => expect(screen.getByDisplayValue('Task A')).toBeInTheDocument());
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(calendarRequests).toHaveLength(1));

		await fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!);
		expect(calendarRequests[0].signal?.aborted).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await waitFor(() => expect(calendarRequests).toHaveLength(2));

		calendarRequests[1].response.resolve(
			new Response(
				JSON.stringify({
					data: {
						events: [{ onto_event_sync: [{ id: 'sync-1' }], props: {} }]
					}
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Delete + Calendar' })).toBeInTheDocument()
		);

		calendarRequests[0].response.resolve(
			new Response(JSON.stringify({ data: { events: [] } }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByRole('button', { name: 'Delete + Calendar' })).toBeInTheDocument();
	});
});
