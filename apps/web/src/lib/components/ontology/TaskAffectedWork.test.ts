// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskAffectedWorkPayload } from '@buildos/shared-types';
import TaskAffectedWork from './TaskAffectedWork.svelte';

vi.mock('$app/paths', () => ({
	resolve: (_route: string, params: { id: string; task_id: string }) =>
		`/projects/${params.id}/tasks/${params.task_id}`
}));

function payload(sourceId = 'source-task'): TaskAffectedWorkPayload {
	return {
		source_task: { id: sourceId, title: 'Approve design', project_id: 'project-1' },
		tasks: [
			{
				id: 'dependent-task',
				title: 'Build checkout',
				state_key: 'todo',
				due_at: null,
				distance: 1,
				path: [
					{ task_id: sourceId, title: 'Approve design' },
					{ task_id: 'dependent-task', title: 'Build checkout' }
				],
				edge_ids: ['edge-1'],
				relations: ['depends_on']
			}
		],
		limits: { max_depth: 3, max_tasks: 50 },
		truncated: false,
		truncation_reasons: []
	};
}

const response = (data: TaskAffectedWorkPayload) =>
	new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});

function deferredResponse() {
	let resolve!: (value: Response) => void;
	const promise = new Promise<Response>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

describe('TaskAffectedWork', () => {
	it('loads only on request and shows the direct dependency path with a task link', async () => {
		fetchMock.mockResolvedValueOnce(response(payload()));
		render(TaskAffectedWork, { taskId: 'source-task' });
		expect(fetchMock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		expect(await screen.findByRole('link', { name: 'Build checkout' })).toHaveAttribute(
			'href',
			'/projects/project-1/tasks/dependent-task'
		);
		expect(screen.getByText('Direct')).toBeInTheDocument();
		expect(screen.getByText('Approve design → Build checkout')).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/onto/tasks/source-task/affected-work?max_depth=3&max_tasks=50',
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('cancels a previous depth request and ignores its late answer', async () => {
		const first = deferredResponse();
		fetchMock
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(
				response({ ...payload(), tasks: [], limits: { max_depth: 1, max_tasks: 50 } })
			);
		render(TaskAffectedWork, { taskId: 'source-task' });
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		await fireEvent.change(screen.getByRole('combobox', { name: 'Follow dependencies' }), {
			target: { value: '1' }
		});
		expect(signal?.aborted).toBe(true);
		await screen.findByText(/No open downstream tasks found/);
		first.resolve(response(payload()));
		await waitFor(() =>
			expect(screen.queryByRole('link', { name: 'Build checkout' })).toBeNull()
		);
		expect(fetchMock.mock.calls[1]?.[0]).toContain('max_depth=1');
	});

	it('resets when the reader changes task and never displays a late answer from the old task', async () => {
		const first = deferredResponse();
		fetchMock
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(response({ ...payload('second-task'), tasks: [] }));
		const view = render(TaskAffectedWork, { taskId: 'source-task' });
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		const signal = fetchMock.mock.calls[0]?.[1]?.signal;
		await view.rerender({ taskId: 'second-task' });
		expect(signal?.aborted).toBe(true);
		expect(screen.getByRole('button', { name: 'Affected work' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		await screen.findByText(/No open downstream tasks found/);
		first.resolve(response(payload()));
		await waitFor(() =>
			expect(screen.queryByRole('link', { name: 'Build checkout' })).toBeNull()
		);
	});

	it('distinguishes a failed read from an empty graph and allows retry', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('{}', { status: 500 }))
			.mockResolvedValueOnce(response({ ...payload(), tasks: [] }));
		render(TaskAffectedWork, { taskId: 'source-task' });
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Affected work could not be loaded'
		);
		expect(screen.queryByText(/No open downstream tasks found/)).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(await screen.findByText(/Unlinked work may still be affected/)).toBeInTheDocument();
	});

	it('labels incomplete traversal without presenting it as the full impact', async () => {
		const data = payload();
		data.tasks[0]!.distance = 2;
		data.truncated = true;
		data.truncation_reasons = ['depth', 'tasks'];
		fetchMock.mockResolvedValueOnce(response(data));
		render(TaskAffectedWork, { taskId: 'source-task' });
		await fireEvent.click(screen.getByRole('button', { name: 'Affected work' }));
		expect(await screen.findByText(/Showing a partial view/)).toHaveTextContent(
			'50-task limit'
		);
		expect(screen.getByText(/More tasks may be connected beyond 3 steps/)).toBeInTheDocument();
		expect(screen.getByText('Indirect · 2 steps')).toBeInTheDocument();
	});
});
