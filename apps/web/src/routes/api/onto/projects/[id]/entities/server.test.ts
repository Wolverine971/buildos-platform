// apps/web/src/routes/api/onto/projects/[id]/entities/server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { GET } from './+server';

function createEntityQueryResult(data: unknown[]) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		ilike: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
			Promise.resolve({ data, error: null }).then(resolve, reject)
	};
}

describe('GET /api/onto/projects/[id]/entities', () => {
	it('uses the lean project access check before loading entities', async () => {
		const projectId = '11111111-1111-4111-8111-111111111111';
		const query = createEntityQueryResult([
			{
				id: 'task-1',
				title: 'Ship onboarding',
				state_key: 'active',
				priority: 2,
				updated_at: '2026-03-12T00:00:00.000Z',
				created_at: '2026-03-11T00:00:00.000Z',
				props: null
			}
		]);
		const projectQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null })
		};
		let entityQueryRequested = false;
		const supabase = {
			rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
				if (fn === 'ensure_actor_for_user') {
					return { data: 'actor-1', error: null };
				}
				if (fn === 'current_actor_has_project_member_access') {
					return { data: true, error: null };
				}

				throw new Error(`Unexpected rpc: ${fn} ${JSON.stringify(args)}`);
			}),
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectQuery;
				entityQueryRequested = true;
				return query;
			})
		};

		const response = await GET({
			params: { id: projectId },
			url: new URL(
				`http://localhost/api/onto/projects/${projectId}/entities?type=task&search=ship&limit=10`
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(supabase.rpc).toHaveBeenCalledWith('ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: projectId,
			p_required_access: 'read'
		});
		expect(projectQuery.maybeSingle).toHaveBeenCalled();
		expect(supabase.from).toHaveBeenCalledWith('onto_tasks');
		expect(entityQueryRequested).toBe(true);
		expect(payload.data).toEqual([
			{
				id: 'task-1',
				name: 'Ship onboarding',
				type: 'task',
				metadata: {
					state_key: 'active',
					type_key: null,
					priority: 2,
					due_at: null,
					impact: null,
					probability: null
				}
			}
		]);
	});
});
