// apps/web/src/routes/api/onto/organize/snapshot/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';
import {
	loadOrganizeSnapshot,
	OrganizeSnapshotError
} from '$lib/server/organize/organize-snapshot';

vi.mock('$lib/server/organize/organize-snapshot', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/server/organize/organize-snapshot')>();
	return { ...original, loadOrganizeSnapshot: vi.fn() };
});

const projectId = '11111111-1111-4111-8111-111111111111';
function event(id = projectId, authenticated = true) {
	return {
		url: new URL(`https://example.test/api/onto/organize/snapshot?project_id=${id}`),
		locals: {
			safeGetSession: async () => ({ user: authenticated ? { id: 'user' } : null }),
			supabase: {}
		}
	} as unknown as Parameters<typeof GET>[0];
}

describe('GET Organize snapshot', () => {
	beforeEach(() => vi.resetAllMocks());
	it('rejects anonymous requests before loading anything', async () => {
		expect((await GET(event(projectId, false))).status).toBe(401);
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
	});
	it('validates the project id', async () => {
		expect((await GET(event('invalid'))).status).toBe(400);
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
	});
	it('returns independently checked membership failures', async () => {
		vi.mocked(loadOrganizeSnapshot).mockRejectedValue(
			new OrganizeSnapshotError('No access', 403)
		);
		expect((await GET(event())).status).toBe(403);
	});
	it('serves only the shaped snapshot through the session client', async () => {
		const request = event();
		vi.mocked(loadOrganizeSnapshot).mockResolvedValue({
			project: { id: projectId },
			related_projects: []
		} as never);
		const response = await GET(request);
		expect(response.status).toBe(200);
		expect(loadOrganizeSnapshot).toHaveBeenCalledWith(request.locals.supabase, projectId);
		expect(await response.json()).toMatchObject({
			data: { project: { id: projectId }, related_projects: [] }
		});
	});
});
