// apps/web/src/lib/components/ontology/linked-entities/linked-entities.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLinkedEntities } from './linked-entities.service';

const emptyLinkedEntities = {
	tasks: [],
	plans: [],
	goals: [],
	milestones: [],
	documents: [],
	risks: [],
	events: [],
	requirements: []
};

const emptyAvailableEntities = {
	...emptyLinkedEntities
};

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

function linkedEntitiesResponse(): Response {
	return new Response(
		JSON.stringify({
			data: {
				linkedEntities: emptyLinkedEntities,
				availableEntities: emptyAvailableEntities
			}
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchLinkedEntities', () => {
	it('deduplicates concurrent requests for the same entity and releases the request afterward', async () => {
		const requests: Deferred<Response>[] = [];
		const fetchMock = vi.fn(() => {
			const request = deferred<Response>();
			requests.push(request);
			return request.promise;
		});
		vi.stubGlobal('fetch', fetchMock);

		const first = fetchLinkedEntities('task-1', 'task', 'project-1');
		const second = fetchLinkedEntities('task-1', 'task', 'project-1');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		requests[0].resolve(linkedEntitiesResponse());

		await expect(Promise.all([first, second])).resolves.toHaveLength(2);

		const third = fetchLinkedEntities('task-1', 'task', 'project-1');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		requests[1].resolve(linkedEntitiesResponse());
		await third;
	});

	it('keeps a shared transport alive while another consumer still needs it', async () => {
		const request = deferred<Response>();
		let transportSignal: AbortSignal | undefined;
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			transportSignal = init?.signal ?? undefined;
			return request.promise;
		});
		vi.stubGlobal('fetch', fetchMock);
		const firstController = new AbortController();
		const secondController = new AbortController();

		const first = fetchLinkedEntities('task-shared', 'task', 'project-shared', {
			signal: firstController.signal
		});
		const second = fetchLinkedEntities('task-shared', 'task', 'project-shared', {
			signal: secondController.signal
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		firstController.abort();
		await expect(first).rejects.toMatchObject({ name: 'AbortError' });
		expect(transportSignal?.aborted).toBe(false);

		request.resolve(linkedEntitiesResponse());
		await expect(second).resolves.toMatchObject({ linkedEntities: emptyLinkedEntities });
	});

	it('aborts and retires a transport after its final consumer leaves', async () => {
		const requests: Array<Deferred<Response> & { signal?: AbortSignal }> = [];
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			const request = deferred<Response>();
			requests.push({ ...request, signal: init?.signal ?? undefined });
			return request.promise;
		});
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();

		const abandoned = fetchLinkedEntities('task-retired', 'task', 'project-retired', {
			signal: controller.signal
		});
		controller.abort();
		await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
		expect(requests[0].signal?.aborted).toBe(true);

		// A new caller must not inherit the abandoned request, even if that transport ignores abort.
		const replacement = fetchLinkedEntities('task-retired', 'task', 'project-retired');
		expect(fetchMock).toHaveBeenCalledTimes(2);

		// The late abandoned request must not remove the newer request from the dedupe map.
		requests[0].resolve(linkedEntitiesResponse());
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		const sharedReplacement = fetchLinkedEntities('task-retired', 'task', 'project-retired');
		expect(fetchMock).toHaveBeenCalledTimes(2);

		requests[1].resolve(linkedEntitiesResponse());
		await expect(Promise.all([replacement, sharedReplacement])).resolves.toHaveLength(2);
	});
});
