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

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchLinkedEntities', () => {
	it('deduplicates concurrent requests for the same entity and releases the request afterward', async () => {
		let resolveFetch: ((response: Response) => void) | undefined;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);

		const first = fetchLinkedEntities('task-1', 'task', 'project-1');
		const second = fetchLinkedEntities('task-1', 'task', 'project-1');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		resolveFetch?.(
			new Response(
				JSON.stringify({
					data: {
						linkedEntities: emptyLinkedEntities,
						availableEntities: emptyAvailableEntities
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);

		await expect(Promise.all([first, second])).resolves.toHaveLength(2);

		const third = fetchLinkedEntities('task-1', 'task', 'project-1');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		resolveFetch?.(
			new Response(
				JSON.stringify({
					data: {
						linkedEntities: emptyLinkedEntities,
						availableEntities: emptyAvailableEntities
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		await third;
	});
});
