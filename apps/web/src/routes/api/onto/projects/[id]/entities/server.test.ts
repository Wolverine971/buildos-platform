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
		const supabase = {
			rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
				if (fn === 'current_actor_has_project_access') {
					return { data: true, error: null };
				}

				throw new Error(`Unexpected rpc: ${fn} ${JSON.stringify(args)}`);
			}),
			from: vi.fn(() => query)
		};

		const response = await GET({
			params: { id: 'project-1' },
			url: new URL(
				'http://localhost/api/onto/projects/project-1/entities?type=task&search=ship&limit=10'
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(supabase.rpc).toHaveBeenCalledTimes(1);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_tasks');
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
