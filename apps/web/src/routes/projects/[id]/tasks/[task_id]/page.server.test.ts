// apps/web/src/routes/projects/[id]/tasks/[task_id]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function createEvent(
	fetch: (input: RequestInfo | URL) => Promise<Response>,
	rpc = vi.fn().mockResolvedValue({ data: 'allowed', error: null }),
	search = ''
) {
	return {
		params: { id: PROJECT_ID, task_id: TASK_ID },
		fetch,
		locals: { supabase: { rpc } },
		url: new URL(`https://buildos.test/projects/${PROJECT_ID}/tasks/${TASK_ID}${search}`)
	} as any;
}

describe('task focus page load', () => {
	it('turns an RLS-hidden project into a helpful forbidden state for a signed-in nonmember', async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ error: 'Not found' }, 404));
		const rpc = vi.fn().mockResolvedValue({ data: 'forbidden', error: null });

		await expect(load(createEvent(fetchMock, rpc))).rejects.toMatchObject({
			status: 403,
			body: { message: 'You do not have access to this project.' }
		});
		expect(rpc).toHaveBeenCalledWith('get_project_route_access_state', {
			p_project_id: PROJECT_ID
		});
	});

	it('redirects an unauthenticated request while preserving its query', async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401));

		await expect(
			load(createEvent(fetchMock, undefined, '?from=notification'))
		).rejects.toMatchObject({
			status: 303,
			location: `/auth/login?redirect=${encodeURIComponent(
				`/projects/${PROJECT_ID}/tasks/${TASK_ID}?from=notification`
			)}`
		});
	});

	it('rejects a task that belongs to another project', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === `/api/onto/projects/${PROJECT_ID}`) {
				return jsonResponse({ data: { project: { id: PROJECT_ID } } });
			}
			if (path === `/api/onto/tasks/${TASK_ID}/full`) {
				return jsonResponse({
					data: { task: { id: TASK_ID, project_id: 'another-project' } }
				});
			}
			return jsonResponse({ data: { events: [], linkedEntities: {} } });
		});

		await expect(load(createEvent(fetchMock))).rejects.toMatchObject({
			status: 404,
			body: { message: 'Task not found in this project' }
		});
	});

	it('loads the task and keeps only owned or graph-linked project events', async () => {
		const task = { id: TASK_ID, project_id: PROJECT_ID, title: 'Ship it' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === `/api/onto/projects/${PROJECT_ID}`) {
				return jsonResponse({ data: { project: { id: PROJECT_ID }, tasks: [task] } });
			}
			if (path === `/api/onto/tasks/${TASK_ID}/full`) {
				return jsonResponse({ data: { task, linkedEntities: {} } });
			}
			if (path.includes('/events?')) {
				return jsonResponse({
					data: {
						events: [
							{ id: 'owned', owner_entity_type: 'task', owner_entity_id: TASK_ID },
							{
								id: 'linked',
								owner_entity_type: 'project',
								owner_entity_id: PROJECT_ID
							},
							{
								id: 'unrelated',
								owner_entity_type: 'project',
								owner_entity_id: PROJECT_ID
							}
						]
					}
				});
			}
			return jsonResponse({ data: { linkedEntities: { events: [{ id: 'linked' }] } } });
		});

		const result = await load(createEvent(fetchMock));

		expect(result.task).toEqual(task);
		expect(result.events).toEqual([
			{ id: 'owned', owner_entity_type: 'task', owner_entity_id: TASK_ID },
			{ id: 'linked', owner_entity_type: 'project', owner_entity_id: PROJECT_ID }
		]);
	});
});
