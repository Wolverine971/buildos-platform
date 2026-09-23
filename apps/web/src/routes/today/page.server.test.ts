import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getFeed, needsOnboarding } = vi.hoisted(() => ({
	getFeed: vi.fn(),
	needsOnboarding: vi.fn()
}));
vi.mock('$lib/server/today-feed.service', () => ({ getTodayFeed: getFeed }));
vi.mock('$lib/server/project-visibility', () => ({ needsOnboarding }));
import { load } from './+page.server';

function loadToday(user: Record<string, unknown>, url = 'https://example.test/today') {
	return load({
		locals: {
			safeGetSession: async () => ({ user }),
			supabase: {}
		},
		depends: vi.fn(),
		url: new URL(url)
	} as any);
}

describe('first Today activation context', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		needsOnboarding.mockResolvedValue(false);
	});

	it.each([
		['visible-project', 'visible-project'],
		['foreign-project', null]
	])(
		'only accepts a next-move project visible in the authorized feed: %s',
		async (requested, expected) => {
			getFeed.mockResolvedValue({ projects: [{ id: 'visible-project' }] });
			const result = await loadToday(
				{ id: 'user-1', onboarding_completed_at: '2026-09-09', timezone: 'UTC' },
				`https://example.test/today?activated_project=${requested}`
			);
			expect(result).toMatchObject({ activatedProjectId: expected });
		}
	);
});

describe('Today onboarding gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getFeed.mockResolvedValue({ projects: [] });
	});

	it('sends a new user with no projects into onboarding', async () => {
		needsOnboarding.mockResolvedValue(true);
		const user = { id: 'user-1', onboarding_completed_at: null, timezone: 'UTC' };

		await expect(loadToday(user)).rejects.toMatchObject({
			status: 303,
			location: '/onboarding'
		});
		expect(needsOnboarding).toHaveBeenCalledWith({}, user);
		expect(getFeed).not.toHaveBeenCalled();
	});

	it('keeps a returning user with projects on Today even when the flag is null', async () => {
		needsOnboarding.mockResolvedValue(false);

		const result = await loadToday({
			id: 'user-1',
			onboarding_completed_at: null,
			timezone: 'UTC'
		});

		expect(result).toMatchObject({ feed: { projects: [] } });
		expect(getFeed).toHaveBeenCalledOnce();
	});
});
