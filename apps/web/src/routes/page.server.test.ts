// apps/web/src/routes/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { needsOnboarding } = vi.hoisted(() => ({ needsOnboarding: vi.fn() }));
vi.mock('$lib/server/project-visibility', () => ({ needsOnboarding }));

describe('public home route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('serves the landing page to anonymous visitors', async () => {
		const { load } = await import('./+page.server');
		const safeGetSession = vi.fn(async () => ({ session: null, user: null }));

		const result = await load({
			locals: { safeGetSession },
			url: new URL('https://build-os.com/')
		} as any);

		expect(result).toEqual({});
		expect(safeGetSession).toHaveBeenCalledOnce();
	});

	it('redirects a completed visitor to /today and preserves query state', async () => {
		const { load } = await import('./+page.server');
		needsOnboarding.mockResolvedValue(false);

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({
						session: {},
						user: { id: 'user-1', onboarding_completed_at: '2026-01-01T00:00:00.000Z' }
					})),
					supabase: {}
				},
				url: new URL('https://build-os.com/?message=Welcome')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/today?message=Welcome'
		});
	});

	it('routes a new visitor with no projects into /onboarding and preserves query state', async () => {
		const { load } = await import('./+page.server');
		needsOnboarding.mockResolvedValue(true);

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({
						session: {},
						user: { id: 'user-1', onboarding_completed_at: null }
					})),
					supabase: {}
				},
				url: new URL('https://build-os.com/?message=Welcome')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/onboarding?message=Welcome'
		});
	});

	it('sends a returning visitor with projects to /today even when the flag is null', async () => {
		const { load } = await import('./+page.server');
		needsOnboarding.mockResolvedValue(false);
		const user = { id: 'user-1', onboarding_completed_at: null };

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn(async () => ({ session: {}, user })),
					supabase: {}
				},
				url: new URL('https://build-os.com/')
			} as any)
		).rejects.toMatchObject({ status: 303, location: '/today' });
		expect(needsOnboarding).toHaveBeenCalledWith({}, user);
	});
});
