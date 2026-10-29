// apps/web/src/lib/server/app-mode.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_MODE_COOKIE, resolveAppMode } from './app-mode';

const environment = vi.hoisted(() => ({ building: false }));
vi.mock('$app/environment', () => ({
	get building() {
		return environment.building;
	}
}));

function makeEvent(search: string, cookieValue?: string) {
	const cookies = {
		get: vi.fn((name: string) => (name === APP_MODE_COOKIE ? cookieValue : undefined)),
		set: vi.fn(),
		delete: vi.fn()
	};
	const url = new URL(`https://build-os.com/profile${search}`);
	return { event: { url, cookies } as any, cookies };
}

describe('resolveAppMode', () => {
	beforeEach(() => {
		environment.building = false;
	});

	it('keeps prerendered pages in web mode without reading query params or cookies', () => {
		environment.building = true;
		const { event, cookies } = makeEvent('', '1');
		event.url = new URL('https://build-os.com/blogs');
		// SvelteKit disables this getter while prerendering, even with no query string.
		Object.defineProperty(event.url, 'searchParams', {
			get() {
				throw new Error(
					'Cannot access url.searchParams on a page with prerendering enabled'
				);
			}
		});

		expect(resolveAppMode(event, { secure: true })).toBe(false);
		expect(cookies.get).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('sets the cookie and returns true when ?app=1 is present', () => {
		const { event, cookies } = makeEvent('?app=1');
		expect(resolveAppMode(event, { secure: true })).toBe(true);
		expect(cookies.set).toHaveBeenCalledWith(
			APP_MODE_COOKIE,
			'1',
			expect.objectContaining({
				path: '/',
				sameSite: 'lax',
				secure: true,
				maxAge: 60 * 60 * 24
			})
		);
	});

	it('returns true from the cookie alone without re-setting it', () => {
		const { event, cookies } = makeEvent('', '1');
		expect(resolveAppMode(event, { secure: true })).toBe(true);
		expect(cookies.set).not.toHaveBeenCalled();
		expect(cookies.delete).not.toHaveBeenCalled();
	});

	it('returns false with neither flag nor cookie', () => {
		const { event, cookies } = makeEvent('');
		expect(resolveAppMode(event, { secure: false })).toBe(false);
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('deletes the cookie and returns false when ?app=0 is present', () => {
		const { event, cookies } = makeEvent('?app=0', '1');
		expect(resolveAppMode(event, { secure: true })).toBe(false);
		expect(cookies.delete).toHaveBeenCalledWith(APP_MODE_COOKIE, { path: '/' });
		expect(cookies.set).not.toHaveBeenCalled();
	});
});
