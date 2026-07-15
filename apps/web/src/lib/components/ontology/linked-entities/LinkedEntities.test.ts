// apps/web/src/lib/components/ontology/linked-entities/LinkedEntities.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableEntity, LinkedEntitiesResult, LinkedEntity } from './linked-entities.types';
import LinkedEntities from './LinkedEntities.svelte';

const { toastError, toastSuccess, logOntologyClientError } = vi.hoisted(() => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	logOntologyClientError: vi.fn()
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { error: toastError, success: toastSuccess }
}));

vi.mock('$lib/utils/ontology-client-logger', () => ({
	logOntologyClientError
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

interface PendingRequest {
	url: string;
	method: string;
	signal?: AbortSignal;
	response: Deferred<Response>;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function emptyLinkedEntities(): LinkedEntitiesResult {
	return {
		tasks: [],
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		risks: [],
		events: [],
		requirements: []
	};
}

function linkedTask(id: string, title: string, edgeId = `edge-${id}`): LinkedEntity {
	return {
		id,
		title,
		edge_id: edgeId,
		edge_rel: 'relates_to',
		edge_direction: 'outgoing'
	};
}

function withTask(task: LinkedEntity): LinkedEntitiesResult {
	return { ...emptyLinkedEntities(), tasks: [task] };
}

function linkedResponse(linkedEntities: LinkedEntitiesResult): Response {
	return new Response(
		JSON.stringify({
			data: {
				linkedEntities,
				availableEntities: emptyLinkedEntities()
			}
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

function availableResponse(entities: AvailableEntity[]): Response {
	return new Response(JSON.stringify({ data: { entities } }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('LinkedEntities request ownership', () => {
	let requests: PendingRequest[];

	beforeEach(() => {
		requests = [];
		toastError.mockReset();
		toastSuccess.mockReset();
		logOntologyClientError.mockReset();
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
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const response = deferred<Response>();
				requests.push({
					url: String(input),
					method: init?.method ?? 'GET',
					signal: init?.signal ?? undefined,
					response
				});
				return response.promise;
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	function requestFor(fragment: string, method = 'GET'): PendingRequest {
		const request = requests.find(
			(candidate) => candidate.url.includes(fragment) && candidate.method === method
		);
		expect(request).toBeDefined();
		return request!;
	}

	it('keeps the latest source when an aborted transport resolves the old source last', async () => {
		const onLoaded = vi.fn();
		const view = render(LinkedEntities, {
			props: { sourceId: 'task-a', sourceKind: 'task', projectId: 'project-1', onLoaded }
		});

		await waitFor(() => expect(requests).toHaveLength(1));
		const requestA = requestFor('sourceId=task-a');

		await view.rerender({
			sourceId: 'task-b',
			sourceKind: 'task',
			projectId: 'project-1',
			onLoaded
		});
		await waitFor(() => expect(requests).toHaveLength(2));
		expect(requestA.signal?.aborted).toBe(true);

		requestFor('sourceId=task-b').response.resolve(
			linkedResponse(withTask(linkedTask('linked-b', 'Linked to B')))
		);
		const tasksButton = await screen.findByRole('button', { name: /Tasks \(1\)/ });
		await fireEvent.click(tasksButton);
		expect(await screen.findByText('Linked to B')).toBeInTheDocument();
		expect(onLoaded).toHaveBeenCalledTimes(1);

		// Simulate a fetch implementation that ignores abort and resolves obsolete work late.
		requestA.response.resolve(linkedResponse(withTask(linkedTask('linked-a', 'Linked to A'))));
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByText('Linked to B')).toBeInTheDocument();
		expect(screen.queryByText('Linked to A')).not.toBeInTheDocument();
		expect(onLoaded).toHaveBeenCalledTimes(1);
	});

	it('clears the view and cancels loading when the source identity becomes empty', async () => {
		const onLoaded = vi.fn();
		const view = render(LinkedEntities, {
			props: { sourceId: 'task-a', sourceKind: 'task', projectId: 'project-1', onLoaded }
		});

		await waitFor(() => expect(requests).toHaveLength(1));
		const obsoleteRequest = requests[0];
		await view.rerender({
			sourceId: '',
			sourceKind: 'task',
			projectId: 'project-1',
			onLoaded
		});

		expect(obsoleteRequest.signal?.aborted).toBe(true);
		expect(await screen.findByRole('button', { name: /Tasks \(0\)/ })).toBeInTheDocument();

		obsoleteRequest.response.resolve(
			linkedResponse(withTask(linkedTask('linked-a', 'Obsolete link')))
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByText('Obsolete link')).not.toBeInTheDocument();
		expect(onLoaded).not.toHaveBeenCalled();
	});

	it('cancels the primary request when the component unmounts', async () => {
		const view = render(LinkedEntities, {
			props: { sourceId: 'task-a', sourceKind: 'task', projectId: 'project-1' }
		});

		await waitFor(() => expect(requests).toHaveLength(1));
		const request = requests[0];
		view.unmount();
		expect(request.signal?.aborted).toBe(true);
	});

	it('does not open or populate a picker from a stale available-entity request', async () => {
		const view = render(LinkedEntities, {
			props: {
				sourceId: 'task-a',
				sourceKind: 'task',
				projectId: 'project-1',
				initialLinkedEntities: emptyLinkedEntities(),
				allowedEntityTypes: ['plan']
			}
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Add plan' }));
		await waitFor(() => expect(requests).toHaveLength(1));
		const requestA = requestFor('sourceId=task-a');

		await view.rerender({
			sourceId: 'task-b',
			sourceKind: 'task',
			projectId: 'project-1',
			initialLinkedEntities: emptyLinkedEntities(),
			allowedEntityTypes: ['plan']
		});
		expect(requestA.signal?.aborted).toBe(true);

		requestA.response.resolve(
			availableResponse([{ id: 'plan-a', title: 'Plan for A', isLinked: false }])
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Add plan' }));
		await waitFor(() => expect(requests).toHaveLength(2));
		requestFor('sourceId=task-b').response.resolve(
			availableResponse([{ id: 'plan-b', title: 'Plan for B', isLinked: false }])
		);

		expect(await screen.findByText('Plan for B')).toBeInTheDocument();
		expect(screen.queryByText('Plan for A')).not.toBeInTheDocument();
		expect(toastError).not.toHaveBeenCalled();
	});

	it('does not roll a failed unlink back into a replacement source', async () => {
		const onLinksChanged = vi.fn();
		const view = render(LinkedEntities, {
			props: {
				sourceId: 'task-a',
				sourceKind: 'task',
				projectId: 'project-1',
				initialLinkedEntities: withTask(linkedTask('linked-a', 'Linked to A')),
				onLinksChanged
			}
		});

		await fireEvent.click(await screen.findByRole('button', { name: /Tasks \(1\)/ }));
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Remove link to Linked to A' })
		);
		await waitFor(() => expect(requests).toHaveLength(1));

		await view.rerender({
			sourceId: 'task-b',
			sourceKind: 'task',
			projectId: 'project-1',
			initialLinkedEntities: withTask(linkedTask('linked-b', 'Linked to B')),
			onLinksChanged
		});
		await fireEvent.click(await screen.findByRole('button', { name: /Tasks \(1\)/ }));
		expect(await screen.findByText('Linked to B')).toBeInTheDocument();

		requests[0].response.resolve(jsonResponse({ error: 'Late unlink failure' }, 500));
		await tick();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByText('Linked to B')).toBeInTheDocument();
		expect(screen.queryByText('Linked to A')).not.toBeInTheDocument();
		expect(toastError).not.toHaveBeenCalled();
		expect(onLinksChanged).not.toHaveBeenCalled();
	});

	it('does not reload, toast, or callback when a link mutation resolves for an old source', async () => {
		const onLinksChanged = vi.fn();
		const view = render(LinkedEntities, {
			props: {
				sourceId: 'task-a',
				sourceKind: 'task',
				projectId: 'project-1',
				initialLinkedEntities: emptyLinkedEntities(),
				allowedEntityTypes: ['document'],
				onLinksChanged
			}
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Add document' }));
		await waitFor(() => expect(requests).toHaveLength(1));
		requests[0].response.resolve(
			availableResponse([{ id: 'document-a', title: 'Document A', isLinked: false }])
		);
		await fireEvent.click(await screen.findByRole('button', { name: 'Document A' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add Selected (1)' }));
		await waitFor(() => expect(requests).toHaveLength(2));
		const mutation = requestFor('/api/onto/edges', 'POST');

		await view.rerender({
			sourceId: 'task-b',
			sourceKind: 'task',
			projectId: 'project-1',
			initialLinkedEntities: emptyLinkedEntities(),
			allowedEntityTypes: ['document'],
			onLinksChanged
		});
		mutation.response.resolve(jsonResponse({ data: { created: 1 } }));
		await tick();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(requests).toHaveLength(2);
		expect(toastSuccess).not.toHaveBeenCalled();
		expect(toastError).not.toHaveBeenCalled();
		expect(onLinksChanged).not.toHaveBeenCalled();
	});
});
