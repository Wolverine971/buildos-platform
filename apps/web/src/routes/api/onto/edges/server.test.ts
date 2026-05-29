// apps/web/src/routes/api/onto/edges/server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { POST } from './+server';

function createSelectInQuery(data: unknown[]) {
	const query = {
		select: vi.fn(() => query),
		in: vi.fn(() => Promise.resolve({ data, error: null }))
	};
	return query;
}

describe('POST /api/onto/edges', () => {
	it('skips direct project endpoint edges instead of persisting them', async () => {
		const insert = vi.fn();
		const supabase = {
			rpc: vi.fn((fn: string) => {
				if (fn === 'ensure_actor_for_user') {
					return Promise.resolve({ data: 'actor-1', error: null });
				}
				if (fn === 'current_actor_has_project_member_access') {
					return Promise.resolve({ data: true, error: null });
				}
				return Promise.resolve({ data: null, error: null });
			}),
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					return createSelectInQuery([{ id: 'project-1' }]);
				}
				if (table === 'onto_tasks') {
					return createSelectInQuery([{ id: 'task-1', project_id: 'project-1' }]);
				}
				if (table === 'onto_edges') {
					return { insert };
				}
				throw new Error(`Unexpected table: ${table}`);
			})
		};

		const response = await POST({
			request: new Request('http://localhost/api/onto/edges', {
				method: 'POST',
				body: JSON.stringify({
					edges: [
						{
							src_kind: 'project',
							src_id: 'project-1',
							dst_kind: 'task',
							dst_id: 'task-1',
							rel: 'has_task'
						}
					]
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toEqual({ created: 0, skipped_project_edges: 1 });
		expect(insert).not.toHaveBeenCalled();
	});
});
