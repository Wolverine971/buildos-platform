// apps/web/src/routes/api/projects/dashboard/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	getUserDashboardAnalytics: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId
}));
vi.mock('$lib/services/dashboard/user-dashboard-analytics.service', () => ({
	getUserDashboardAnalytics: mocks.getUserDashboardAnalytics
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

describe('GET /api/projects/dashboard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureActorId.mockResolvedValue('actor-1');
	});

	it('turns away a signed-out request without reading anything', async () => {
		const response = await GET(event(null));

		expect(response.status).toBe(401);
		expect(mocks.getUserDashboardAnalytics).not.toHaveBeenCalled();
	});

	it("answers with the page load's Today payload, read the same way", async () => {
		const analytics = { attention: { overdueTasks: 3 }, recent: { projects: [] } };
		mocks.getUserDashboardAnalytics.mockResolvedValue(analytics);

		const response = await GET(event());
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toMatchObject({ success: true, data: { dashboard: analytics } });
		// The viewer's own client and actor, and no parent-label query: as +page.server.ts.
		expect(mocks.getUserDashboardAnalytics).toHaveBeenCalledWith(
			viewerClient,
			'user-1',
			undefined,
			'actor-1',
			{ projectParents: false }
		);
	});

	it('answers 500 when the viewer cannot be resolved', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.ensureActorId.mockRejectedValue(new Error('database is down'));

		const response = await GET(event());

		expect(response.status).toBe(500);
		expect((await response.json()).success).toBe(false);
	});
});
