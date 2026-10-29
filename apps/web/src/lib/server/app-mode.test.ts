// apps/web/src/lib/server/app-mode.test.ts
import { describe, expect, it, vi } from 'vitest';
import { APP_MODE_COOKIE, resolveAppMode } from './app-mode';

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
