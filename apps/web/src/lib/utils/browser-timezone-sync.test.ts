// apps/web/src/lib/utils/browser-timezone-sync.test.ts
// @vitest-environment jsdom
//
// The layout used to send the browser's zone on every signed-in page load. The server only
// fills in an unset zone, so once it has answered for an account and zone there is nothing
// left to say until one of them changes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false, browser: true }));

/** A fresh page load: the module's once-per-load flag starts over, storage stays. */
async function pageLoad() {
	vi.resetModules();
	return await import('./browser-timezone-sync');
}

function serve(status = 200) {
	const sent = vi.fn(async () => new Response('{}', { status }));
	vi.stubGlobal('fetch', sent);
	return sent;
}

describe('syncBrowserTimezone', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends the zone once per account and zone, not once per page load', async () => {
		const sent = serve();

		expect(
			await (
				await pageLoad()
			).syncBrowserTimezone({ userId: 'user-1', timezone: 'America/New_York' })
		).toBe(true);
		await (
			await pageLoad()
		).syncBrowserTimezone({ userId: 'user-1', timezone: 'America/New_York' });
		expect(sent).toHaveBeenCalledTimes(1);

		// The laptop travelled, or someone else signed in: that is news.
		await (
			await pageLoad()
		).syncBrowserTimezone({ userId: 'user-1', timezone: 'Europe/Lisbon' });
		await (
			await pageLoad()
		).syncBrowserTimezone({ userId: 'user-2', timezone: 'Europe/Lisbon' });
		expect(sent).toHaveBeenCalledTimes(3);
	});

	it('asks again on the next load when the server did not answer', async () => {
		const sent = serve(500);
		await (
			await pageLoad()
		).syncBrowserTimezone({ userId: 'user-1', timezone: 'America/New_York' });
		await (
			await pageLoad()
		).syncBrowserTimezone({ userId: 'user-1', timezone: 'America/New_York' });
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('still sends when asked to on purpose', async () => {
		const sent = serve();
		const { syncBrowserTimezone } = await pageLoad();
		await syncBrowserTimezone({ userId: 'user-1', timezone: 'America/New_York' });
		await syncBrowserTimezone({
			userId: 'user-1',
			timezone: 'America/New_York',
			force: true
		});
		expect(sent).toHaveBeenCalledTimes(2);
	});
});
