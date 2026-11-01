// apps/mobile/tests/web-pages.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BuildOsApiError } from '@buildos/api-client';

import { isAccountGoneError, openWebPage, signOutIfAccountGone, WEB_PAGES } from '@/lib/web-pages';

const unauthorized = () =>
	Promise.reject(
		new BuildOsApiError({ message: 'Unauthorized', status: 401, code: 'UNAUTHORIZED' })
	);
const refresh = async () => {};

describe('web pages inside the app', () => {
	it('opens the page through a handoff and waits for the browser to close', async () => {
		const createHandoff = vi.fn(async () => ({
			url: 'https://build-os.com/auth/handoff?code=x'
		}));
		const open = vi.fn(async () => ({ type: 'dismiss' }));
		await openWebPage(WEB_PAGES.account, { createHandoff, open });
		expect(createHandoff).toHaveBeenCalledWith({ next: '/profile?tab=account' });
		expect(open).toHaveBeenCalledWith('https://build-os.com/auth/handoff?code=x');
	});

	it('signs out only when the account answers 401 twice, with a refresh between', async () => {
		const refreshSpy = vi.fn(async () => {});
		const signOut = vi.fn(async () => {});
		expect(
			await signOutIfAccountGone({ check: unauthorized, refresh: refreshSpy, signOut })
		).toBe(true);
		expect(refreshSpy).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('keeps the session when the account is fine, offline, or the token just needed a refresh', async () => {
		const signOut = vi.fn(async () => {});
		expect(
			await signOutIfAccountGone({ check: async () => ({ id: 'u1' }), refresh, signOut })
		).toBe(false);
		const offline = () =>
			Promise.reject(
				new BuildOsApiError({ message: 'offline', status: 0, isNetworkError: true })
			);
		expect(await signOutIfAccountGone({ check: offline, refresh, signOut })).toBe(false);
		let calls = 0;
		const flaky = () => (calls++ === 0 ? unauthorized() : Promise.resolve({ id: 'u1' }));
		expect(await signOutIfAccountGone({ check: flaky, refresh, signOut })).toBe(false);
		expect(signOut).not.toHaveBeenCalled();
	});

	it('knows what a gone account looks like', () => {
		expect(isAccountGoneError(new BuildOsApiError({ message: 'x', status: 401 }))).toBe(true);
		expect(isAccountGoneError(new BuildOsApiError({ message: 'x', status: 403 }))).toBe(false);
		expect(isAccountGoneError(new Error('x'))).toBe(false);
	});
});
