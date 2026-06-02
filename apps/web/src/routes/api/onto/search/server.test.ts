// apps/web/src/routes/api/onto/search/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

import { POST } from './+server';

function createSupabase() {
	const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
		if (fn === 'onto_search_entities') {
			return {
				data: [
					{
						id: 'task-1',
						type: 'task',
						title: 'Cadre content ops task',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						project_name: 'Cadre',
						snippet: 'Cadre content ops task',
						score: 0.94,
						state_key: 'in_progress',
						type_key: 'task.execution'
					}
				],
				error: null
			};
		}

		if (fn === 'current_actor_has_project_member_access') {
			return { data: true, error: null };
		}

		throw new Error(`Unexpected rpc: ${fn} ${JSON.stringify(args)}`);
	});

	const eventLookup = {
		select: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		or: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		then: vi.fn((resolve) => Promise.resolve({ data: [], error: null }).then(resolve))
	};

	const taskLookup = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		not: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		then: vi.fn((resolve) => Promise.resolve({ data: [], error: null }).then(resolve))
	};

	const projectLookup = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null })
	};

	return {
		rpc,
		eventLookup,
		taskLookup,
		from: vi.fn((table: string) => {
			if (table === 'onto_events') return eventLookup;
			if (table === 'onto_tasks') return taskLookup;
			return projectLookup;
		})
	};
}

function createEvent(body: Record<string, unknown>) {
	const supabase = createSupabase();

	return {
		request: new Request('http://localhost/api/onto/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	};
}

describe('/api/onto/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
	});

	it('treats the string none as an absent optional project_id', async () => {
		const event = createEvent({
			query: 'Cadre content operations',
			project_id: 'none'
		});

		const response = await POST(event as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toMatchObject({
			query: 'Cadre content operations',
			search_scope: 'workspace',
			project_id: null,
			total_returned: 1,
			maybe_more: false,
			total: 1
		});
		expect(payload.data.results).toEqual([
			expect.objectContaining({
				type: 'task',
				id: 'task-1',
				project_id: '31021625-1377-4715-9fb4-f93102974628',
				project_name: 'Cadre',
				state_key: 'in_progress',
				type_key: 'task.execution',
				matched_fields: ['title', 'description', 'props'],
				path: 'project:31021625-1377-4715-9fb4-f93102974628/task:task-1'
			})
		]);
		expect(event.locals.supabase.rpc).toHaveBeenCalledTimes(1);
		expect(event.locals.supabase.rpc).toHaveBeenCalledWith(
			'onto_search_entities',
			expect.objectContaining({
				p_actor_id: 'actor-1',
				p_query: 'Cadre content operations',
				p_project_id: undefined
			})
		);
	});

	it('returns 400 for malformed non-sentinel project ids', async () => {
		const event = createEvent({
			query: 'Cadre content operations',
			project_id: 'not-a-uuid'
		});

		const response = await POST(event as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.success).toBe(false);
		expect(payload.error).toBe('Invalid project_id');
		expect(event.locals.supabase.rpc).not.toHaveBeenCalled();
	});

	it('accepts expanded phase-1 types including project and risk', async () => {
		const event = createEvent({
			query: 'onboarding',
			project_id: '31021625-1377-4715-9fb4-f93102974628',
			types: ['project', 'risk', 'document']
		});

		const response = await POST(event as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(event.locals.supabase.rpc).toHaveBeenCalledWith(
			'onto_search_entities',
			expect.objectContaining({
				p_types: ['project', 'risk', 'document']
			})
		);
		expect(payload.data).toMatchObject({
			search_scope: 'project',
			project_id: '31021625-1377-4715-9fb4-f93102974628'
		});
	});

	it('searches project events without calling the RPC for event-only requests', async () => {
		const event = createEvent({
			query: 'kickoff',
			project_id: '31021625-1377-4715-9fb4-f93102974628',
			types: ['event']
		});
		event.locals.supabase.eventLookup.then.mockImplementationOnce((resolve: any) =>
			Promise.resolve({
				data: [
					{
						id: 'event-1',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						title: 'Kickoff call',
						description: 'Initial planning session',
						location: 'Zoom',
						start_at: '2026-05-31T15:00:00Z',
						state_key: 'scheduled',
						type_key: 'event.general'
					}
				],
				error: null
			}).then(resolve)
		);

		const response = await POST(event as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.results).toEqual([
			expect.objectContaining({
				type: 'event',
				id: 'event-1',
				title: 'Kickoff call',
				project_id: '31021625-1377-4715-9fb4-f93102974628',
				matched_fields: ['title', 'description', 'location'],
				path: 'project:31021625-1377-4715-9fb4-f93102974628/event:event-1'
			})
		]);
		expect(event.locals.supabase.rpc).toHaveBeenCalledTimes(1);
		expect(event.locals.supabase.rpc).toHaveBeenCalledWith(
			'current_actor_has_project_member_access',
			expect.any(Object)
		);
		expect(event.locals.supabase.eventLookup.or).toHaveBeenCalled();
	});

	it('ranks active working entities ahead of terminal or stale matches', async () => {
		const event = createEvent({
			query: 'roadmap',
			project_id: '31021625-1377-4715-9fb4-f93102974628',
			limit: 6
		});

		event.locals.supabase.rpc.mockImplementation(async (fn: string) => {
			if (fn === 'current_actor_has_project_member_access') {
				return { data: true, error: null };
			}
			if (fn === 'onto_search_entities') {
				return {
					data: [
						{
							id: 'done-task',
							type: 'task',
							title: 'Roadmap archive cleanup',
							project_id: '31021625-1377-4715-9fb4-f93102974628',
							project_name: 'Cadre',
							snippet: 'Roadmap archive cleanup',
							score: 1.3,
							state_key: 'done',
							type_key: 'task.execution'
						},
						{
							id: 'active-task',
							type: 'task',
							title: 'Roadmap launch task',
							project_id: '31021625-1377-4715-9fb4-f93102974628',
							project_name: 'Cadre',
							snippet: 'Roadmap launch task',
							score: 0.85,
							state_key: 'in_progress',
							type_key: 'task.execution'
						},
						{
							id: 'blocked-task',
							type: 'task',
							title: 'Roadmap vendor task',
							project_id: '31021625-1377-4715-9fb4-f93102974628',
							project_name: 'Cadre',
							snippet: 'Roadmap vendor task',
							score: 0.95,
							state_key: 'blocked',
							type_key: 'task.execution'
						},
						{
							id: 'roadmap-doc',
							type: 'document',
							title: 'Roadmap source doc',
							project_id: '31021625-1377-4715-9fb4-f93102974628',
							project_name: 'Cadre',
							snippet: 'Roadmap source doc',
							score: 0.75,
							state_key: 'ready',
							type_key: 'document.brief'
						}
					],
					error: null
				};
			}
			throw new Error(`Unexpected rpc: ${fn}`);
		});

		event.locals.supabase.eventLookup.then.mockImplementationOnce((resolve: any) =>
			Promise.resolve({
				data: [
					{
						id: 'past-event',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						title: 'Roadmap retro',
						description: 'Past roadmap meeting',
						location: 'Zoom',
						start_at: '2000-01-01T15:00:00Z',
						state_key: 'scheduled',
						type_key: 'event.general'
					},
					{
						id: 'future-event',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						title: 'Roadmap planning',
						description: 'Future roadmap meeting',
						location: 'Zoom',
						start_at: '2999-01-01T15:00:00Z',
						state_key: 'scheduled',
						type_key: 'event.general'
					}
				],
				error: null
			}).then(resolve)
		);

		const response = await POST(event as any);
		const payload = await response.json();
		const orderedIds = payload.data.results.map((result: { id: string }) => result.id);

		expect(response.status).toBe(200);
		expect(orderedIds.slice(0, 3)).toEqual(['future-event', 'active-task', 'roadmap-doc']);
		expect(orderedIds.indexOf('done-task')).toBeGreaterThan(orderedIds.indexOf('roadmap-doc'));
		expect(orderedIds.indexOf('blocked-task')).toBeGreaterThan(
			orderedIds.indexOf('active-task')
		);
		expect(payload.data.results[0]).toEqual(
			expect.objectContaining({
				id: 'future-event',
				ranking_factors: expect.arrayContaining([
					expect.objectContaining({ key: 'event_future' })
				])
			})
		);
	});

	it('searches task bucket aliases so backlogged tasks find todo backlog rows', async () => {
		const event = createEvent({
			query: 'backlogged tasks',
			project_id: '31021625-1377-4715-9fb4-f93102974628',
			types: ['task'],
			limit: 10
		});

		event.locals.supabase.rpc.mockImplementation(async (fn: string) => {
			if (fn === 'current_actor_has_project_member_access') {
				return { data: true, error: null };
			}
			if (fn === 'onto_search_entities') {
				return { data: [], error: null };
			}
			throw new Error(`Unexpected rpc: ${fn}`);
		});

		event.locals.supabase.taskLookup.then.mockImplementationOnce((resolve: any) =>
			Promise.resolve({
				data: [
					{
						id: 'backlog-task',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						title: 'Write launch checklist',
						description: null,
						state_key: 'todo',
						type_key: 'task.execution',
						start_at: null,
						due_at: null,
						completed_at: null,
						updated_at: '2026-05-31T12:00:00Z',
						deleted_at: null,
						archived_at: null,
						priority: 4
					},
					{
						id: 'scheduled-task',
						project_id: '31021625-1377-4715-9fb4-f93102974628',
						title: 'Send launch reminder',
						description: null,
						state_key: 'todo',
						type_key: 'task.execution',
						start_at: null,
						due_at: '2999-01-01T12:00:00Z',
						completed_at: null,
						updated_at: '2026-05-31T12:00:00Z',
						deleted_at: null,
						archived_at: null,
						priority: 3
					}
				],
				error: null
			}).then(resolve)
		);

		const response = await POST(event as any);
		const payload = await response.json();
		const orderedIds = payload.data.results.map((result: { id: string }) => result.id);

		expect(response.status).toBe(200);
		expect(orderedIds).toContain('backlog-task');
		expect(orderedIds).not.toContain('scheduled-task');
		expect(event.locals.supabase.taskLookup.in).toHaveBeenCalledWith('state_key', ['todo']);
		expect(payload.data.results[0]).toEqual(
			expect.objectContaining({
				id: 'backlog-task',
				state_key: 'todo',
				bucket_key: 'backlog',
				matched_fields: ['title', 'description', 'props', 'state_key', 'bucket'],
				ranking_factors: expect.arrayContaining([
					expect.objectContaining({ key: 'bucket_backlog' })
				])
			})
		);
	});
});
