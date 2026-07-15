// apps/web/src/routes/api/onto/projects/[id]/full/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { requireProjectMemberAccessMock, listProjectEventsMock } = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn(),
	listProjectEventsMock: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

vi.mock('$lib/services/ontology/onto-event-sync.service', () => ({
	OntoEventSyncService: vi.fn().mockImplementation(() => ({
		listProjectEvents: listProjectEventsMock
	}))
}));

import { GET } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function projectFullPayload(overrides: Record<string, unknown> = {}) {
	return {
		project: {
			id: PROJECT_ID,
			name: 'Project 1',
			props: {},
			deleted_at: null
		},
		current_actor_id: 'actor-v2',
		goals: [],
		plans: [],
		tasks: [],
		documents: [],
		milestones: [],
		risks: [],
		context_document: { id: 'doc-1', project_id: PROJECT_ID, title: 'Start Here' },
		goal_milestone_edges: [],
		task_assignees: {},
		task_last_changed_by: {},
		...overrides
	};
}

function createPublicPageCountQuery() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => Promise.resolve({ count: 0, error: null }))
	};
	return query;
}

function createEvent(search = ''): RequestEvent {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn((table: string) => {
			if (table === 'onto_public_pages') return createPublicPageCountQuery();
			throw new Error(`Unexpected table requested: ${table}`);
		})
	};

	return {
		params: { id: PROJECT_ID },
		url: new URL(`https://buildos.test/api/onto/projects/${PROJECT_ID}/full${search}`),
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'member@example.com' }
			})
		}
	} as unknown as RequestEvent;
}

describe('GET /api/onto/projects/[id]/full', () => {
	beforeEach(() => {
		requireProjectMemberAccessMock.mockReset();
		listProjectEventsMock.mockReset();
	});

	it('uses the v2 full RPC as the v2 initial profile authorization boundary', async () => {
		const event = createEvent('?profile=v2-initial');
		const supabase = event.locals.supabase as any;
		const tasks = Array.from({ length: 25 }, (_, index) => ({
			id: `task-${index}`,
			project_id: PROJECT_ID,
			title: `Task ${index}`,
			state_key: 'todo',
			deleted_at: null,
			due_at: null,
			start_at: null,
			completed_at: null,
			priority: index + 1,
			updated_at: '2026-07-15T12:00:00.000Z'
		}));
		supabase.rpc.mockResolvedValue({
			data: projectFullPayload({ tasks }),
			error: null
		});
		listProjectEventsMock
			.mockResolvedValueOnce(
				Array.from({ length: 26 }, (_, index) => ({ id: `recent-${index}` }))
			)
			.mockResolvedValueOnce(
				Array.from({ length: 51 }, (_, index) => ({ id: `upcoming-${index}` }))
			);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.current_actor_id).toBe('actor-v2');
		expect(payload.data.tasks).toHaveLength(20);
		expect(payload.data.tasks.map((task: { id: string }) => task.id)).not.toContain('task-24');
		expect(payload.data.tasks_coverage).toMatchObject({
			scope: 'initial-board',
			complete: false,
			returned: 20,
			total: 25,
			limit_per_bucket: 20,
			buckets: {
				backlog: { returned: 20, total: 25, complete: false }
			}
		});
		expect(payload.data.pulse_tasks).toEqual([]);
		expect(payload.data.events).toHaveLength(75);
		expect(payload.data.events_coverage).toMatchObject({
			scope: 'initial-window',
			complete: false,
			returned: 75,
			recent_limit: 25,
			upcoming_limit: 50,
			recent_has_more: true,
			upcoming_has_more: true
		});
		expect(requireProjectMemberAccessMock).not.toHaveBeenCalled();
		expect(supabase.rpc).toHaveBeenCalledWith('get_project_full_v2_initial', {
			p_project_id: PROJECT_ID,
			p_actor_id: null
		});
		expect(event.locals.safeGetSession).toHaveBeenCalledOnce();
		expect(listProjectEventsMock).toHaveBeenNthCalledWith(
			1,
			PROJECT_ID,
			expect.objectContaining({
				includeDeleted: false,
				limit: 26,
				orderDirection: 'descending'
			}),
			'user-1'
		);
		expect(listProjectEventsMock).toHaveBeenNthCalledWith(
			2,
			PROJECT_ID,
			expect.objectContaining({
				includeDeleted: false,
				limit: 51,
				orderDirection: 'ascending'
			}),
			'user-1'
		);
	});

	it('keeps the explicit access helper for the classic profile', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;
		requireProjectMemberAccessMock.mockResolvedValue({
			ok: true,
			projectId: PROJECT_ID,
			userId: 'user-1',
			actorId: 'actor-classic'
		});
		supabase.rpc.mockResolvedValue({
			data: projectFullPayload({ current_actor_id: 'actor-classic' }),
			error: null
		});
		listProjectEventsMock.mockResolvedValue([]);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.current_actor_id).toBe('actor-classic');
		expect(payload.data.events_coverage).toEqual({
			scope: 'all',
			complete: true,
			returned: 0
		});
		expect(requireProjectMemberAccessMock).toHaveBeenCalledWith({
			locals: event.locals,
			projectId: PROJECT_ID,
			requiredAccess: 'read'
		});
		expect(supabase.rpc).toHaveBeenCalledWith('get_project_full', {
			p_project_id: PROJECT_ID,
			p_actor_id: 'actor-classic'
		});
		expect(event.locals.safeGetSession).not.toHaveBeenCalled();
	});

	it('preserves RPC-provided task and Pulse windows without recomputing them', async () => {
		const event = createEvent('?profile=v2-initial');
		const supabase = event.locals.supabase as any;
		const boardTask = {
			id: 'board-task',
			project_id: PROJECT_ID,
			title: 'Board task',
			state_key: 'todo',
			deleted_at: null,
			due_at: null,
			start_at: null,
			completed_at: null,
			priority: 1,
			updated_at: '2026-07-15T12:00:00.000Z'
		};
		const pulseOnlyTask = {
			...boardTask,
			id: 'pulse-only-task',
			title: 'Pulse-only task',
			due_at: '2026-07-16T12:00:00.000Z'
		};
		const coverage = {
			scope: 'initial-board',
			as_of: '2026-07-15T12:00:00.000Z',
			complete: false,
			returned: 1,
			total: 21,
			limit_per_bucket: 20,
			buckets: {
				backlog: { returned: 1, total: 1, complete: true },
				in_progress: { returned: 0, total: 0, complete: true },
				scheduled: { returned: 0, total: 20, complete: false },
				overdue: { returned: 0, total: 0, complete: true },
				blocked: { returned: 0, total: 0, complete: true },
				done: { returned: 0, total: 0, complete: true }
			}
		};
		supabase.rpc.mockResolvedValue({
			data: projectFullPayload({
				tasks: [boardTask],
				pulse_tasks: [pulseOnlyTask],
				tasks_coverage: coverage
			}),
			error: null
		});
		listProjectEventsMock.mockResolvedValue([]);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.tasks).toHaveLength(1);
		expect(payload.data.tasks[0]).toMatchObject(boardTask);
		expect(payload.data.tasks_coverage).toEqual(coverage);
		expect(payload.data.pulse_tasks).toEqual([pulseOnlyTask]);
	});
});
