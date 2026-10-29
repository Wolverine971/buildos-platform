// apps/web/src/routes/auth/handoff/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	consume: vi.fn(),
	mint: vi.fn(),
	admin: {}
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: () => mocks.admin }));
vi.mock('$lib/server/auth-handoff.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/auth-handoff.service')>()),
	consumeHandoffCode: mocks.consume,
	mintCookieSessionForUser: mocks.mint
}));

import { GET } from './+server';

async function run(code: string | null) {
	const url = new URL('https://build-os.com/auth/handoff');
	if (code) url.searchParams.set('code', code);
	const supabase = { auth: {} };
	try {
		return await GET({ url, locals: { supabase } } as any);
	} catch (thrown) {
		return thrown;
	}
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /auth/handoff', () => {
	it('signs the browser in and lands on the requested page in app mode', async () => {
		mocks.consume.mockResolvedValue({ userId: 'user-1', nextPath: '/billing' });
		mocks.mint.mockResolvedValue(true);
		const code = 'B'.repeat(43);
		const result = await run(code);
		expect(result).toMatchObject({ status: 303, location: '/billing?app=1' });
		expect(mocks.consume).toHaveBeenCalledWith(mocks.admin, code);
		expect(mocks.mint).toHaveBeenCalledWith(mocks.admin, expect.anything(), 'user-1');
	});

	it('defaults to the profile page', async () => {
		mocks.consume.mockResolvedValue({ userId: 'user-1', nextPath: null });
		mocks.mint.mockResolvedValue(true);
		expect(await run('C'.repeat(43))).toMatchObject({ location: '/profile?app=1' });
	});

	it('sends used or expired codes to sign-in without minting anything', async () => {
		mocks.consume.mockResolvedValue(null);
		expect(await run('D'.repeat(43))).toMatchObject({
			status: 303,
			location: '/auth/login?error=handoff_expired'
		});
		expect(mocks.mint).not.toHaveBeenCalled();
	});

	it('handles a missing code the same way', async () => {
		expect(await run(null)).toMatchObject({ location: '/auth/login?error=handoff_expired' });
		expect(mocks.consume).not.toHaveBeenCalled();
	});

	it('reports a sign-in failure without exposing the code', async () => {
		mocks.consume.mockResolvedValue({ userId: 'user-1', nextPath: '/billing' });
		mocks.mint.mockResolvedValue(false);
		const result = (await run('E'.repeat(43))) as { location: string };
		expect(result.location).toBe('/auth/login?error=handoff_failed');
		expect(result.location).not.toContain('E'.repeat(10));
	});
});
