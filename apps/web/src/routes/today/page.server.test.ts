// apps/web/src/routes/today/page.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getFeed, needsOnboarding } = vi.hoisted(() => ({
	getFeed: vi.fn(),
	needsOnboarding: vi.fn()
}));
vi.mock('$lib/server/today-feed.service', () => ({ getTodayFeed: getFeed }));
vi.mock('$lib/server/project-visibility', () => ({ needsOnboarding }));
import { _CHAT_LAUNCH_GRACE_COOKIE, load } from './+page.server';

function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	return {
		jar,
		get: vi.fn((name: string) => jar.get(name)),
		set: vi.fn((name: string, value: string) => void jar.set(name, value))
	};
}

function loadToday(
	user: Record<string, unknown>,
	url = 'https://example.test/today',
	cookies = fakeCookies()
) {
	const untrack = vi.fn(<T>(fn: () => T) => fn());
	return load({
		locals: {
			safeGetSession: async () => ({ user }),
			supabase: {}
		},
		depends: vi.fn(),
		url: new URL(url),
		cookies,
		untrack
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

	it('keeps a new user on Today, launch params intact, when they arrive with a chat launch', async () => {
		needsOnboarding.mockResolvedValue(true);
		const launch = new URLSearchParams({
			open: 'agent-chat',
			skill: 'going_viral',
			prompt: 'Use the Going Viral skill.\n\nStarting ask: help me',
			onboarding: 'true',
			new_user: 'true'
		});

		const result = await loadToday(
			{ id: 'user-1', onboarding_completed_at: null, timezone: 'UTC' },
			`https://example.test/today?${launch}`
		);

		expect(result).toMatchObject({ feed: { projects: [] } });
		expect(needsOnboarding).not.toHaveBeenCalled();
	});

	it('sets a grace cookie on a launch so the param-stripping re-run stays on Today', async () => {
		needsOnboarding.mockResolvedValue(true);
		const user = { id: 'user-1', onboarding_completed_at: null, timezone: 'UTC' };
		const cookies = fakeCookies();
		const launch = new URLSearchParams({
			open: 'agent-chat',
			skill: 'going_viral',
			prompt: 'hi'
		});

		await loadToday(user, `https://example.test/today?${launch}`, cookies);
		expect(cookies.set).toHaveBeenCalledWith(
			_CHAT_LAUNCH_GRACE_COOKIE,
			'1',
			expect.objectContaining({ path: '/today', httpOnly: true, maxAge: 3600 })
		);

		// Navigation removes the launch params; the re-run sees a bare /today plus the cookie.
		const result = await loadToday(user, 'https://example.test/today', cookies);
		expect(result).toMatchObject({ feed: { projects: [] } });
		expect(needsOnboarding).not.toHaveBeenCalled();
	});

	it('still sends a new user to onboarding when the launch has nothing to open', async () => {
		needsOnboarding.mockResolvedValue(true);

		await expect(
			loadToday(
				{ id: 'user-1', onboarding_completed_at: null, timezone: 'UTC' },
				'https://example.test/today?open=agent-chat'
			)
		).rejects.toMatchObject({ status: 303, location: '/onboarding' });
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
