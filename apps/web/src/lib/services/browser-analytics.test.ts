// apps/web/src/lib/services/browser-analytics.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('./tracking-consent', () => ({
	getEffectiveTrackingPreferences: () => ({ analytics: false, marketing: true }),
	TRACKING_PREFERENCES_CHANGED_EVENT: 'buildos:test-tracking-preferences'
}));
vi.mock('@vercel/analytics/sveltekit', () => ({ injectAnalytics: vi.fn() }));
vi.mock('@vercel/speed-insights/sveltekit', () => ({ injectSpeedInsights: vi.fn() }));

type FbqStub = { queue: unknown[][]; disablePushState?: boolean };

describe('Meta Pixel route gating', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		vi.stubGlobal('window', {
			location: { pathname: '/pricing', search: '' },
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
		vi.stubGlobal('document', {
			getElementById: vi.fn(() => null),
			createElement: vi.fn(() => ({})),
			head: { appendChild: vi.fn() }
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('classifies public marketing routes by route id, never app or user-content routes', async () => {
		const { isMetaPageViewRoute } = await import('./browser-analytics');

		for (const routeId of [
			'/',
			'/pricing',
			'/blogs',
			'/blogs/[category]/[slug]',
			'/docs/[slug]',
			'/(public)/integrations'
		]) {
			expect(isMetaPageViewRoute(routeId), routeId).toBe(true);
		}
		for (const routeId of [
			null,
			'/today',
			'/history',
			'/projects/[id]',
			'/projects/[id]/tasks/[task_id]',
			'/(public)/p/[slug]',
			'/invites/[token]',
			'/auth/register',
			'/beta/thank-you',
			'/blogsearch'
		]) {
			expect(isMetaPageViewRoute(routeId), String(routeId)).toBe(false);
		}
	});

	it('disables autoConfig before init and sends PageView only on marketing routes', async () => {
		const { initializeBrowserAnalytics, trackMetaPageView } = await import(
			'./browser-analytics'
		);
		initializeBrowserAnalytics();
		await vi.waitFor(() => expect((window as any).fbq).toBeDefined());
		const fbq = (window as unknown as { fbq: FbqStub }).fbq;

		expect(fbq.disablePushState).toBe(true);
		expect(fbq.queue).toEqual([
			['consent', 'grant'],
			['set', 'autoConfig', false, '1295810581888875'],
			['init', '1295810581888875']
		]);

		trackMetaPageView('/projects/[id]');
		expect(fbq.queue.filter(([method]) => method === 'track')).toEqual([]);

		trackMetaPageView('/pricing');
		expect(fbq.queue.filter(([method]) => method === 'track')).toEqual([['track', 'PageView']]);
	});
});
