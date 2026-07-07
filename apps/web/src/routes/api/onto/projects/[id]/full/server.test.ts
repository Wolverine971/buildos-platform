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
		supabase.rpc.mockResolvedValue({
			data: projectFullPayload(),
			error: null
		});
		listProjectEventsMock.mockResolvedValue([]);

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.current_actor_id).toBe('actor-v2');
		expect(requireProjectMemberAccessMock).not.toHaveBeenCalled();
		expect(supabase.rpc).toHaveBeenCalledWith('get_project_full_v2_initial', {
			p_project_id: PROJECT_ID,
			p_actor_id: null
		});
		expect(event.locals.safeGetSession).toHaveBeenCalledOnce();
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
});
