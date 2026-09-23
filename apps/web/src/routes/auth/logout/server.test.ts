// apps/web/src/routes/auth/logout/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logSecurityEventMock } = vi.hoisted(() => ({ logSecurityEventMock: vi.fn() }));

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$lib/server/route-error', () => ({
	logRouteError: vi.fn(),
	routeErrorResponse: vi.fn()
}));
vi.mock('$lib/server/security-event-logger', () => ({
	getSecurityEventLogOptions: vi.fn(() => ({})),
	getSecurityRequestContext: vi.fn(() => ({})),
	logSecurityEvent: logSecurityEventMock
}));

import { GET, POST } from './+server';

function makeEvent(method: 'GET' | 'POST') {
	const signOut = vi.fn(async () => ({ error: null }));
	const url = new URL('https://build-os.com/auth/logout?redirect=%2Fauth%2Flogin');
	return {
		signOut,
		event: {
			url,
			request: new Request(url, { method }),
			platform: undefined,
			cookies: { getAll: () => [], delete: vi.fn(), set: vi.fn() },
			locals: {
				supabase: { auth: { signOut } },
				safeGetSession: async () => ({ user: { id: 'user-1' } })
			}
		}
	};
}

describe('/auth/logout', () => {
	beforeEach(() => vi.clearAllMocks());

	it('redirects after a normal logout without recording a logout error', async () => {
		const { event, signOut } = makeEvent('POST');

		await expect(POST(event as any)).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
		expect(logSecurityEventMock).not.toHaveBeenCalledWith(
			expect.objectContaining({ eventType: 'auth.logout.error' }),
			expect.anything()
		);
	});

	it('only ends the current browser session on GET', async () => {
		const { event, signOut } = makeEvent('GET');

		await expect(GET(event as any)).rejects.toMatchObject({ status: 303 });
		expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
	});
});
