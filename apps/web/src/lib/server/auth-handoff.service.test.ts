// apps/web/src/lib/server/auth-handoff.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildHandoffUrl,
	consumeHandoffCode,
	createHandoffCode,
	hashHandoffCode,
	isHandoffCodeShaped,
	mintCookieSessionForUser,
	withAppMode
} from './auth-handoff.service';

function adminFixture(
	updateResult: { data: unknown; error: unknown } = { data: null, error: null }
) {
	const inserted: unknown[] = [];
	const deletes: unknown[] = [];
	const filters: Array<[string, ...unknown[]]> = [];
	const chain: Record<string, any> = {};
	for (const name of ['update', 'eq', 'is', 'gt', 'select']) {
		chain[name] = vi.fn((...args: unknown[]) => {
			filters.push([name, ...args]);
			return chain;
		});
	}
	chain.maybeSingle = vi.fn(async () => updateResult);
	chain.delete = vi.fn(() => ({
		eq: vi.fn(async (...args: unknown[]) => {
			deletes.push(args);
			return { error: null };
		})
	}));
	chain.insert = vi.fn(async (row: unknown) => {
		inserted.push(row);
		return { error: null };
	});
	const admin = { from: vi.fn(() => chain) } as any;
	return { admin, chain, inserted, deletes, filters };
}

describe('createHandoffCode', () => {
	it('stores only a hash, with a 60 second life, after retiring older codes', async () => {
		const f = adminFixture();
		const now = new Date('2026-10-28T17:00:00Z');
		const result = await createHandoffCode(f.admin, {
			userId: 'user-1',
			nextPath: '/billing',
			ip: '203.0.113.9',
			userAgent: 'BuildOS/0.1 iOS',
			now
		});
		expect(isHandoffCodeShaped(result.code)).toBe(true);
		expect(result.expiresAt).toBe('2026-10-28T17:01:00.000Z');
		expect(f.deletes).toEqual([['user_id', 'user-1']]);
		expect(f.inserted).toEqual([
			{
				user_id: 'user-1',
				code_hash: hashHandoffCode(result.code),
				next_path: '/billing',
				expires_at: '2026-10-28T17:01:00.000Z',
				created_ip: '203.0.113.9',
				user_agent: 'BuildOS/0.1 iOS'
			}
		]);
		expect(JSON.stringify(f.inserted)).not.toContain(result.code);
	});

	it('issues a different code every time', async () => {
		const f = adminFixture();
		const a = await createHandoffCode(f.admin, { userId: 'u', nextPath: null });
		const b = await createHandoffCode(f.admin, { userId: 'u', nextPath: null });
		expect(a.code).not.toBe(b.code);
	});
});

describe('consumeHandoffCode', () => {
	const code = 'A'.repeat(43);

	it('marks the row used in the same statement that reads it', async () => {
		const now = new Date('2026-10-28T17:00:30Z');
		const f = adminFixture({ data: { user_id: 'user-1', next_path: '/profile' }, error: null });
		expect(await consumeHandoffCode(f.admin, code, now)).toEqual({
			userId: 'user-1',
			nextPath: '/profile'
		});
		expect(f.filters).toEqual([
			['update', { consumed_at: now.toISOString() }],
			['eq', 'code_hash', hashHandoffCode(code)],
			['is', 'consumed_at', null],
			['gt', 'expires_at', now.toISOString()],
			['select', 'user_id, next_path']
		]);
	});

	it('returns null for a used, expired or unknown code', async () => {
		const f = adminFixture({ data: null, error: null });
		expect(await consumeHandoffCode(f.admin, code)).toBeNull();
	});

	it('refuses malformed codes before touching the database', async () => {
		const f = adminFixture();
		expect(await consumeHandoffCode(f.admin, 'short')).toBeNull();
		expect(await consumeHandoffCode(f.admin, `${code}; drop`)).toBeNull();
		expect(f.admin.from).not.toHaveBeenCalled();
	});
});

describe('mintCookieSessionForUser', () => {
	function authFixture(
		overrides: Partial<Record<'getUserById' | 'generateLink' | 'verifyOtp', any>> = {}
	) {
		const getUserById = vi.fn(async () => ({
			data: { user: { id: 'user-1', email: 'dj@example.test' } },
			error: null
		}));
		const generateLink = vi.fn(async () => ({
			data: { properties: { hashed_token: 'hashed-magic' } },
			error: null
		}));
		const verifyOtp = vi.fn(async () => ({ error: null }));
		const admin = { auth: { admin: { getUserById, generateLink } } } as any;
		const userClient = { auth: { verifyOtp } } as any;
		Object.assign(admin.auth.admin, overrides);
		if (overrides.verifyOtp) userClient.auth.verifyOtp = overrides.verifyOtp;
		return { admin, userClient, getUserById, generateLink, verifyOtp };
	}

	it('mints a magic link on the server and verifies it on the cookie client', async () => {
		const f = authFixture();
		expect(await mintCookieSessionForUser(f.admin, f.userClient, 'user-1')).toBe(true);
		expect(f.generateLink).toHaveBeenCalledWith({
			type: 'magiclink',
			email: 'dj@example.test'
		});
		expect(f.userClient.auth.verifyOtp).toHaveBeenCalledWith({
			token_hash: 'hashed-magic',
			type: 'magiclink'
		});
	});

	it('fails closed when the account has no email or verification fails', async () => {
		const noEmail = authFixture({
			getUserById: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))
		});
		expect(await mintCookieSessionForUser(noEmail.admin, noEmail.userClient, 'user-1')).toBe(
			false
		);
		expect(noEmail.generateLink).not.toHaveBeenCalled();

		const badVerify = authFixture({
			verifyOtp: vi.fn(async () => ({ error: new Error('nope') }))
		});
		expect(
			await mintCookieSessionForUser(badVerify.admin, badVerify.userClient, 'user-1')
		).toBe(false);
	});
});

describe('url helpers', () => {
	it('builds the handoff URL and switches app mode on for the destination', () => {
		expect(buildHandoffUrl('https://build-os.com', 'abc')).toBe(
			'https://build-os.com/auth/handoff?code=abc'
		);
		expect(withAppMode('/profile')).toBe('/profile?app=1');
		expect(withAppMode('/billing?plan=pro#top')).toBe('/billing?plan=pro&app=1#top');
	});
});
