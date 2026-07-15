// apps/web/src/routes/api/onto/projects/[id]/tasks/options/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { requireProjectMemberAccessMock } = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function createEvent(search = '', rows = [{ id: 'task-1', title: 'First task' }], total = 201) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn().mockResolvedValue({ data: rows, error: null, count: total })
	};
	const supabase = { from: vi.fn(() => query) };
	return {
		event: {
			params: { id: PROJECT_ID },
			url: new URL(
				`https://buildos.test/api/onto/projects/${PROJECT_ID}/tasks/options${search}`
			),
			locals: { supabase }
		} as unknown as RequestEvent,
		query,
		supabase
	};
}

describe('GET /api/onto/projects/[id]/tasks/options', () => {
	beforeEach(() => {
		requireProjectMemberAccessMock.mockReset().mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-1'
		});
	});

	it('returns a minimal, stable, paginated task-option list', async () => {
		const { event, query, supabase } = createEvent('?limit=200&offset=200');

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({
			tasks: [{ id: 'task-1', title: 'First task' }],
			total: 201,
			hasMore: false,
			nextOffset: null
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_tasks');
		expect(query.select).toHaveBeenCalledWith('id, title', { count: 'exact' });
		expect(query.order).toHaveBeenNthCalledWith(1, 'title', { ascending: true });
		expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
		expect(query.range).toHaveBeenCalledWith(200, 399);
	});

	it('reports the next page without exposing full task records', async () => {
		const { event } = createEvent('', [{ id: 'task-1', title: 'First task' }], 2);

		const response = await GET(event);
		const payload = await response.json();

		expect(payload.data).toMatchObject({ total: 2, hasMore: true, nextOffset: 1 });
		expect(Object.keys(payload.data.tasks[0])).toEqual(['id', 'title']);
	});
});
