import { describe, expect, it, vi } from 'vitest';
const { getFeed } = vi.hoisted(() => ({ getFeed: vi.fn() }));
vi.mock('$lib/server/today-feed.service', () => ({ getTodayFeed: getFeed }));
import { load } from './+page.server';

describe('first Today activation context', () => {
	it.each([
		['visible-project', 'visible-project'],
		['foreign-project', null]
	])(
		'only accepts a next-move project visible in the authorized feed: %s',
		async (requested, expected) => {
			getFeed.mockResolvedValue({ projects: [{ id: 'visible-project' }] });
			const result = await load({
				locals: {
					safeGetSession: async () => ({
						user: {
							id: 'user-1',
							onboarding_completed_at: '2026-09-09',
							timezone: 'UTC'
						}
					}),
					supabase: {}
				},
				depends: vi.fn(),
				url: new URL(`https://example.test/today?activated_project=${requested}`)
			} as any);
			expect(result).toMatchObject({ activatedProjectId: expected });
		}
	);
});
