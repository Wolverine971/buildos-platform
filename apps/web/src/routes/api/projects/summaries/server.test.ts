// apps/web/src/routes/api/projects/summaries/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	loadProjectListSummaries: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId
}));
vi.mock('$lib/server/projects/project-list-summaries', () => ({
	loadProjectListSummaries: mocks.loadProjectListSummaries
}));

import { GET } from './+server';

const viewerClient = { viewer: true };

function event(user: { id: string } | null = { id: 'user-1' }) {
	return {
		locals: {
			supabase: viewerClient,
			serverTiming: undefined,
			safeGetSession: vi.fn(async () => ({ user }))
		}
	} as never;
}

describe('GET /api/projects/summaries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureActorId.mockResolvedValue('actor-1');
	});

	it('turns away a signed-out request without reading anything', async () => {
		const response = await GET(event(null));

		expect(response.status).toBe(401);
		expect(mocks.ensureActorId).not.toHaveBeenCalled();
		expect(mocks.loadProjectListSummaries).not.toHaveBeenCalled();
	});

	it("answers with the page load's tile list, read through the viewer's own client", async () => {
		const tiles = [{ id: 'project-1', name: 'Launch event' }];
		mocks.loadProjectListSummaries.mockResolvedValue(tiles);

		const response = await GET(event());
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toMatchObject({ success: true, data: { projects: tiles } });
		expect(mocks.ensureActorId).toHaveBeenCalledWith(viewerClient, 'user-1');
		expect(mocks.loadProjectListSummaries).toHaveBeenCalledWith(
			viewerClient,
			'actor-1',
			undefined
		);
	});

	it('answers 500, not an empty list, when the tiles cannot be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.loadProjectListSummaries.mockRejectedValue(new Error('database is down'));

		const response = await GET(event());
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json.success).toBe(false);
		expect(json.data?.projects).toBeUndefined();
	});
});
