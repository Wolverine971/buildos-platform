// apps/web/src/routes/api/auth/handoff/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), admin: {} }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => mocks.admin }));
vi.mock('$lib/server/auth-handoff.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/auth-handoff.service')>()),
	createHandoffCode: mocks.create
}));
vi.mock('$lib/server/error-tracking', () => ({
	getClientIpFromHeaders: () => '203.0.113.9',
	getUserAgentFromHeaders: () => 'BuildOS/0.1 iOS'
}));

import { POST } from './+server';

function post(
	body: unknown,
	authSource: 'bearer' | 'cookie' | undefined = 'bearer',
	user: object | null = { id: 'user-1' }
) {
	const url = new URL('https://build-os.com/api/auth/handoff');
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	return POST({
		request,
		url,
		locals: { authSource, safeGetSession: async () => ({ user, session: user ? {} : null }) }
	} as any);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.create.mockResolvedValue({ code: 'F'.repeat(43), expiresAt: '2026-10-28T17:01:00.000Z' });
});

describe('POST /api/auth/handoff', () => {
	it('returns a one-time URL for a bearer session', async () => {
		const response = await post({ next: '/billing?plan=pro' });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data).toEqual({
			url: `https://build-os.com/auth/handoff?code=${'F'.repeat(43)}`,
			expires_at: '2026-10-28T17:01:00.000Z',
			ttl_seconds: 60
		});
		expect(mocks.create).toHaveBeenCalledWith(mocks.admin, {
			userId: 'user-1',
			nextPath: '/billing?plan=pro',
			ip: '203.0.113.9',
			userAgent: 'BuildOS/0.1 iOS'
		});
	});

	it('accepts an empty body and no next page', async () => {
		expect((await post(undefined)).status).toBe(200);
		expect(mocks.create).toHaveBeenCalledWith(
			mocks.admin,
			expect.objectContaining({ nextPath: null })
		);
	});

	it('refuses cookie sessions and signed-out callers', async () => {
		expect((await post({}, 'cookie')).status).toBe(403);
		expect((await post({}, 'bearer', null)).status).toBe(401);
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it.each(['https://evil.example/', '//evil.example', 42])(
		'rejects an unsafe next value (%s)',
		async (next) => {
			const response = await post({ next });
			expect(response.status).toBe(400);
			expect(mocks.create).not.toHaveBeenCalled();
		}
	);
});
