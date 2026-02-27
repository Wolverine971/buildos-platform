// apps/web/src/routes/__tests__/authenticated-pages.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserDashboardAnalytics = vi.fn();
const mockCreateEmptyDashboard = vi.fn(() => ({
	snapshot: { totalProjects: 0 },
	recent: { projects: [], tasks: [], goals: [], documents: [], chatSessions: [] },
	attention: { overdueTasks: 0, staleProjects7d: 0, staleProjects30d: 0 }
}));
const mockEnsureActorId = vi.fn();
const mockFetchProjectSummaries = vi.fn();

vi.mock('$lib/services/dashboard/user-dashboard-analytics.service', () => ({
	getUserDashboardAnalytics: mockGetUserDashboardAnalytics
}));

vi.mock('$lib/types/dashboard-analytics', () => ({
	createEmptyUserDashboardAnalytics: mockCreateEmptyDashboard
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mockEnsureActorId,
	fetchProjectSummaries: mockFetchProjectSummaries
}));

const mockUser = {
	id: 'test-user-id',
	email: 'test@example.com',
	onboarding_completed_at: null
};

function createCountQuery(count: number) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => Promise.resolve({ count, error: null }))
	};
	return query;
}

describe('Authenticated Pages', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnsureActorId.mockResolvedValue('actor-1');
		mockFetchProjectSummaries.mockResolvedValue([{ id: 'proj-1', name: 'Test project' }]);
	});

	describe('Homepage (/) - Dashboard', () => {
		it('returns null payload for unauthenticated users', async () => {
			const { load } = await import('../+page.server');
			const depends = vi.fn();

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: null }),
					supabase: {},
					serverTiming: null
				},
				depends
			} as any);

			expect(result).toEqual({ user: null, dashboard: null });
			expect(depends).toHaveBeenCalledWith('app:auth');
			expect(depends).toHaveBeenCalledWith('dashboard:analytics');
		});

		it('returns user + analytics payload for authenticated users', async () => {
			const { load } = await import('../+page.server');
			const depends = vi.fn();
			const dashboardPayload = { snapshot: { totalProjects: 2 } };
			mockGetUserDashboardAnalytics.mockResolvedValueOnce(dashboardPayload);

			const supabase = {
				from: vi.fn((table: string) => {
					if (table === 'onto_project_members') return createCountQuery(1);
					if (table === 'onto_projects') return createCountQuery(0);
					return createCountQuery(0);
				})
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase,
					serverTiming: null
				},
				depends
			} as any);

			expect(result).toEqual({
				user: mockUser,
				dashboard: dashboardPayload
			});
		});
	});

	describe('/projects page', () => {
		it('returns actorId, projectCount, and streamed projects', async () => {
			const { load } = await import('../projects/+page.server');
			const depends = vi.fn();
			const countQuery = createCountQuery(3);
			const supabase = {
				from: vi.fn((table: string) => {
					if (table === 'onto_project_members') return countQuery;
					if (table === 'onto_projects') return createCountQuery(0);
					return createCountQuery(0);
				}),
				rpc: vi.fn()
			};

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: mockUser }),
					supabase,
					serverTiming: null
				},
				depends
			} as any);

			expect(depends).toHaveBeenCalledWith('ontology:projects');
			expect(result.actorId).toBe('actor-1');
			expect(result.projectCount).toBe(3);
			expect(await result.projects).toEqual([{ id: 'proj-1', name: 'Test project' }]);
		});

		it('rejects unauthenticated users', async () => {
			const { load } = await import('../projects/+page.server');
			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: null }),
						supabase: {},
						serverTiming: null
					},
					depends: vi.fn()
				} as any)
			).rejects.toBeDefined();
		});
	});

	describe('/briefs page', () => {
		it('returns parent user and URL params', async () => {
			const { load } = await import('../briefs/+page.server');
			const result = await load({
				parent: vi.fn().mockResolvedValue({ user: mockUser }),
				url: {
					searchParams: {
						get: vi.fn((key) => {
							if (key === 'date') return '2024-01-15';
							if (key === 'view') return 'week';
							return null;
						})
					}
				}
			} as any);

			expect(result).toEqual({
				user: mockUser,
				initialDate: '2024-01-15',
				initialView: 'week'
			});
		});
	});

	describe('/history page', () => {
		it('calls depends and redirects unauthenticated users', async () => {
			const { load } = await import('../history/+page.server');
			const depends = vi.fn();

			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: null }),
						supabase: {}
					},
					url: {
						searchParams: { get: vi.fn(() => null) }
					},
					depends
				} as any)
			).rejects.toBeDefined();

			expect(depends).toHaveBeenCalledWith('history:data');
		});
	});
});
