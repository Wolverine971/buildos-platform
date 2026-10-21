// apps/web/src/routes/layout.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ browser: true, createBrowser: vi.fn() }));
vi.mock('$app/environment', () => ({
	get browser() {
		return mocks.browser;
	}
}));
vi.mock('$lib/supabase', () => ({ createSupabaseBrowser: mocks.createBrowser }));

import { load } from './+layout';

function loadLayout(path: string, user: { id: string } | null) {
	return load({
		data: { user, stripeEnabled: false },
		depends: vi.fn(),
		url: new URL(path, 'https://buildos.test')
	} as Parameters<typeof load>[0]);
}

describe('root browser client loading', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.browser = true;
	});

	it.each([
		'/auth/login',
		'/auth/register',
		'/auth/forgot-password',
		'/auth/reset-password',
		'/'
	])('renders signed-out %s without initializing a browser database client', async (path) => {
		expect(await loadLayout(path, null)).toMatchObject({ user: null, supabase: null });
		expect(mocks.createBrowser).not.toHaveBeenCalled();
	});

	it('provides the client after server-side sign-in redirects to the app', async () => {
		await loadLayout('/auth/login', null);
		const client = { auth: {} };
		mocks.createBrowser.mockReturnValue(client);
		const user = { id: 'signed-in-user' };

		expect(await loadLayout('/today', user)).toMatchObject({ user, supabase: client });
		expect(mocks.createBrowser).toHaveBeenCalledTimes(1);
	});

	it('preserves the browser client for an authenticated password recovery session', async () => {
		const client = { auth: {} };
		mocks.createBrowser.mockReturnValue(client);
		expect(await loadLayout('/auth/reset-password', { id: 'recovering-user' })).toMatchObject({
			supabase: client
		});
	});

	it('never constructs a browser client during server rendering', async () => {
		mocks.browser = false;
		expect(await loadLayout('/today', { id: 'signed-in-user' })).toMatchObject({
			supabase: null
		});
		expect(mocks.createBrowser).not.toHaveBeenCalled();
	});
});
