// apps/web/src/routes/api/onto/projects/trash/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

describe('GET /api/onto/projects/trash', () => {
	it('returns the deleted projects from the RPC', async () => {
		const projects = [{ id: 'p1', name: 'Apollo', member_count: 2 }];
		const rpc = vi.fn().mockResolvedValue({ data: projects, error: null });
		const response = await GET({
			locals: {
				supabase: { rpc },
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('list_my_deleted_onto_projects');
		expect(payload.data.projects).toEqual(projects);
	});

	it('requires sign-in', async () => {
		const response = await GET({
			locals: { safeGetSession: vi.fn().mockResolvedValue({ user: null }) }
		} as any);

		expect(response.status).toBe(401);
	});
});
