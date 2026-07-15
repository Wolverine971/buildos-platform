// apps/web/src/routes/api/onto/projects/[id]/tasks/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const {
	requireProjectMemberAccessMock,
	fetchTaskAssigneesMapMock,
	attachAssigneesToTasksMock,
	fetchTaskLastChangedByActorMapMock,
	attachLastChangedByActorToTasksMock
} = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn(),
	fetchTaskAssigneesMapMock: vi.fn(),
	attachAssigneesToTasksMock: vi.fn((tasks) => tasks),
	fetchTaskLastChangedByActorMapMock: vi.fn(),
	attachLastChangedByActorToTasksMock: vi.fn((tasks) => tasks)
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	fetchTaskAssigneesMap: fetchTaskAssigneesMapMock,
	attachAssigneesToTasks: attachAssigneesToTasksMock
}));

vi.mock('$lib/server/task-relevance.service', () => ({
	fetchTaskLastChangedByActorMap: fetchTaskLastChangedByActorMapMock,
	attachLastChangedByActorToTasks: attachLastChangedByActorToTasksMock
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function createEvent(search: string, rows = [{ id: 'task-1', title: 'Task 1' }]) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		neq: vi.fn(() => query),
		lt: vi.fn(() => query),
		or: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn().mockResolvedValue({ data: rows, error: null, count: 25 })
	};
	const supabase = { from: vi.fn(() => query) };
	return {
		event: {
			params: { id: PROJECT_ID },
			url: new URL(`https://buildos.test/api/onto/projects/${PROJECT_ID}/tasks${search}`),
			locals: { supabase }
		} as unknown as RequestEvent,
		query,
		supabase
	};
}

describe('GET /api/onto/projects/[id]/tasks', () => {
	beforeEach(() => {
		requireProjectMemberAccessMock.mockReset();
		fetchTaskAssigneesMapMock.mockReset().mockResolvedValue(new Map());
		fetchTaskLastChangedByActorMapMock.mockReset().mockResolvedValue(new Map());
		attachAssigneesToTasksMock.mockClear();
		attachLastChangedByActorToTasksMock.mockClear();
		requireProjectMemberAccessMock.mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-1'
		});
	});

	it('rejects unknown buckets before querying access or data', async () => {
		const { event } = createEvent('?bucket=unknown');

		const response = await GET(event);

		expect(response.status).toBe(400);
		expect(requireProjectMemberAccessMock).not.toHaveBeenCalled();
	});

	it('uses the hydration clock and stable pagination order for scheduled tasks', async () => {
		const asOf = '2026-07-15T12:00:00.000Z';
		const { event, query } = createEvent(
			`?bucket=scheduled&limit=20&offset=20&asOf=${encodeURIComponent(asOf)}`
		);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			bucket: 'scheduled',
			total: 25,
			hasMore: true,
			offset: 20,
			nextOffset: 21
		});
		expect(query.or).toHaveBeenCalledWith(
			`due_at.gte.${asOf},and(due_at.is.null,start_at.gte.${asOf})`
		);
		expect(query.order).toHaveBeenNthCalledWith(1, 'priority', {
			ascending: true,
			nullsFirst: false
		});
		expect(query.order).toHaveBeenNthCalledWith(2, 'due_at', {
			ascending: true,
			nullsFirst: false
		});
		expect(query.order).toHaveBeenNthCalledWith(3, 'start_at', {
			ascending: true,
			nullsFirst: false
		});
		expect(query.range).toHaveBeenCalledWith(20, 39);
		expect(fetchTaskAssigneesMapMock).toHaveBeenCalledWith(
			expect.objectContaining({ taskIds: ['task-1'] })
		);
		expect(fetchTaskLastChangedByActorMapMock).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: PROJECT_ID, taskIds: ['task-1'] })
		);
	});

	it('rejects an invalid pagination clock', async () => {
		const { event } = createEvent('?bucket=backlog&asOf=not-a-date');

		const response = await GET(event);

		expect(response.status).toBe(400);
		expect(requireProjectMemberAccessMock).not.toHaveBeenCalled();
	});
});
