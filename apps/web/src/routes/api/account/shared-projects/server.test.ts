// apps/web/src/routes/api/account/shared-projects/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

describe('GET /api/account/shared-projects', () => {
	it('returns shared projects the user owns', async () => {
		const projects = [{ project_id: 'p1', project_name: 'Apollo', members: [] }];
		const rpc = vi.fn().mockResolvedValue({ data: projects, error: null });
		const response = await GET({
			locals: {
				supabase: { rpc },
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledWith('list_my_shared_owned_onto_projects');
		expect(payload.data.projects).toEqual(projects);
	});

	it('requires sign-in', async () => {
		const response = await GET({
			locals: { safeGetSession: vi.fn().mockResolvedValue({ user: null }) }
		} as any);

		expect(response.status).toBe(401);
	});
});
