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

		if (fn === 'current_actor_has_project_access') {
			return { data: true, error: null };
		}

		throw new Error(`Unexpected rpc: ${fn} ${JSON.stringify(args)}`);
	});

	const projectLookup = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null })
	};

	return {
		rpc,
		from: vi.fn(() => projectLookup)
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
});
