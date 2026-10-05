// apps/web/src/routes/projects/[id]/tasks/[task_id]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { load } from './+page.server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const CARD_PATH = `/api/onto/projects/${PROJECT_ID}/card`;
const TASK_PATH = `/api/onto/tasks/${TASK_ID}/full?include_linked=false&include_task_documents=true`;

async function loadTaskPage(event: Parameters<typeof load>[0]) {
	const result = await load(event);
	if (!result) throw new Error('Expected task page data');
	return result;
}

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

const card = {
	data: {
		project: { id: PROJECT_ID, name: 'Project', can_write: false, documents: [], tasks: [] },
		goals: []
	}
};

describe('task page load', () => {
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
			if (path === CARD_PATH) return jsonResponse(card);
			if (path === TASK_PATH) {
				return jsonResponse({
					data: { task: { id: TASK_ID, project_id: 'another-project' } }
				});
			}
			return jsonResponse({ error: 'Unexpected read' }, 500);
		});

		await expect(load(createEvent(fetchMock))).rejects.toMatchObject({
			status: 404,
			body: { message: 'Task not found in this project' }
		});
	});

	it('loads the task beside the project list, read-only when the user cannot write', async () => {
		const task = { id: TASK_ID, project_id: PROJECT_ID, title: 'Ship it' };
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const path = String(input);
			if (path === CARD_PATH) return jsonResponse(card);
			if (path === TASK_PATH) return jsonResponse({ data: { task } });
			return jsonResponse({ error: 'Unexpected read' }, 500);
		});

		const result = await loadTaskPage(createEvent(fetchMock));

		expect(result.item).toEqual({ kind: 'task', id: TASK_ID });
		expect(result.itemTitle).toBe('Ship it');
		expect(result.canWrite).toBe(false);
		expect(result.seed).toEqual({ task });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
