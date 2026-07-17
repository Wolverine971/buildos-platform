// apps/web/src/routes/__tests__/authenticated-pages.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserDashboardAnalytics = vi.fn();
const mockLoadBlogPosts = vi.fn();
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

vi.mock('$lib/utils/blog', () => ({
	loadBlogPosts: mockLoadBlogPosts
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
		mockLoadBlogPosts.mockResolvedValue([
			{ slug: 'how-buildos-works', title: 'How BuildOS Works' },
			{ slug: 'first-project-setup', title: 'First Project Setup' },
			{ slug: 'daily-brief-guide', title: 'Daily Brief Guide' },
			{ slug: 'not-featured', title: 'Ignore Me' }
		]);
	});

	describe('Homepage (/) - landing/redirect', () => {
		it('returns an empty payload for unauthenticated users', async () => {
			const { load } = await import('../+page.server');

			const result = await load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: null })
				},
				url: new URL('https://build-os.com/')
			} as any);

			expect(result).toEqual({});
		});

		it('redirects an un-onboarded authenticated user into /onboarding, preserving the query string', async () => {
			const { load } = await import('../+page.server');

			// mockUser.onboarding_completed_at is null → route into the onboarding flow.
			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({ user: mockUser })
					},
					url: new URL('https://build-os.com/?open=agent-chat')
				} as any)
			).rejects.toMatchObject({
				status: 303,
				location: '/onboarding?open=agent-chat'
			});
		});

		it('redirects a completed user to /today, preserving the query string', async () => {
			const { load } = await import('../+page.server');

			await expect(
				load({
					locals: {
						safeGetSession: vi.fn().mockResolvedValue({
							user: {
								...mockUser,
								onboarding_completed_at: '2026-01-01T00:00:00.000Z'
							}
						})
					},
					url: new URL('https://build-os.com/?open=agent-chat')
				} as any)
			).rejects.toMatchObject({
				status: 303,
				location: '/today?open=agent-chat'
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

		it('redirects unauthenticated users to login and preserves the requested URL', async () => {
			const { load } = await import('../briefs/+page.server');

			await expect(
				load({
					parent: vi.fn().mockResolvedValue({ user: null }),
					url: new URL('https://build-os.com/briefs?date=2024-01-15&view=week')
				} as any)
			).rejects.toMatchObject({
				status: 303,
				location: '/auth/login?redirect=%2Fbriefs%3Fdate%3D2024-01-15%26view%3Dweek'
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
