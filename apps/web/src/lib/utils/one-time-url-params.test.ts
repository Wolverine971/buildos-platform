// apps/web/src/lib/utils/one-time-url-params.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
	callbacks: [] as Array<(nav: { to: { url: URL } | null }) => void>,
	goto: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: (nav: { to: { url: URL } | null }) => void) => {
		navigation.callbacks.push(callback);
	},
	goto: navigation.goto
}));

import { consumeOneTimeUrlParams } from './one-time-url-params';

function navigateTo(href: string | null) {
	for (const callback of navigation.callbacks) {
		callback({ to: href ? { url: new URL(href) } : null });
	}
}

describe('consumeOneTimeUrlParams', () => {
	beforeEach(() => {
		navigation.callbacks = [];
		navigation.goto.mockReset();
	});

	it('acts once, then strips only the consumed params with a replacing goto', async () => {
		const consume = vi.fn((url: URL) =>
			url.searchParams.get('calendar') === '1' ? ['calendar', 'success'] : []
		);
		consumeOneTimeUrlParams(consume);

		navigateTo(
			'https://build-os.com/profile?tab=calendar&calendar=1&success=calendar_connected#prefs'
		);

		expect(consume).toHaveBeenCalledTimes(1);
		// Deferred: the first afterNavigate fires before the router is started.
		expect(navigation.goto).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(navigation.goto).toHaveBeenCalledWith('/profile?tab=calendar#prefs', {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});

		// The cleanup navigation carries no params, so nothing replays.
		navigateTo('https://build-os.com/profile?tab=calendar#prefs');
		await Promise.resolve();
		expect(navigation.goto).toHaveBeenCalledTimes(1);
	});

	it('leaves the URL alone when nothing was consumed', async () => {
		consumeOneTimeUrlParams(() => []);
		navigateTo('https://build-os.com/profile?tab=calendar&error=unrelated');
		navigateTo(null);
		await Promise.resolve();
		expect(navigation.goto).not.toHaveBeenCalled();
	});
});
