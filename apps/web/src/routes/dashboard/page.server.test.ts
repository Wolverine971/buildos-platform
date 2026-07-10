import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserDashboardAnalytics, ensureActorId } = vi.hoisted(() => ({
	getUserDashboardAnalytics: vi.fn(),
	ensureActorId: vi.fn()
}));

vi.mock('$lib/services/dashboard/user-dashboard-analytics.service', () => ({
	getUserDashboardAnalytics
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId
}));

describe('dashboard route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sends anonymous visitors to login with a dashboard return path', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({ session: null, user: null })),
					supabase: {},
					serverTiming: null
				},
				depends: vi.fn()
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=%2Fdashboard'
		});
	});

	it('loads analytics for an onboarded user', async () => {
		const { load } = await import('./+page.server');
		const user = {
			id: 'user-1',
			email: 'person@example.com',
			onboarding_completed_at: '2026-07-09T00:00:00.000Z'
		};
		const dashboard = { projects: [], totals: { projects: 0 } };
		getUserDashboardAnalytics.mockResolvedValue(dashboard);

		const result = await load({
			locals: {
				safeGetSession: vi.fn(async () => ({ session: {}, user })),
				supabase: {},
				serverTiming: null
			},
			depends: vi.fn()
		} as any);

		expect(getUserDashboardAnalytics).toHaveBeenCalledWith({}, user.id, null);
		expect(result).toEqual({ user, dashboard });
	});
});
