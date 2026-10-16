// apps/web/src/lib/server/session-verification.test.ts
import { createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getVerifiedSession, requiresLiveAuthCheck } from './session-verification';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'ES256', use: 'sig' };
const userId = '11111111-1111-4111-8111-111111111111';
const liveUser: User = {
	id: userId,
	email: 'current@example.test',
	aud: 'authenticated',
	app_metadata: {},
	user_metadata: {},
	created_at: '2026-01-01T00:00:00Z'
};

function makeToken(overrides: Record<string, unknown> = {}, algorithm = 'ES256') {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const input = `${encode({ alg: algorithm, kid: 'test-key', typ: 'JWT' })}.${encode({
		sub: userId,
		aud: 'authenticated',
		role: 'authenticated',
		email: 'signed@example.test',
		exp: Math.floor(Date.now() / 1000) + 3600,
		...overrides
	})}`;
	const signature =
		algorithm === 'HS256'
			? createHmac('sha256', 'offline-test-secret').update(input).digest()
			: sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
	return `${input}.${signature.toString('base64url')}`;
}

function setup(token = makeToken(), url = `https://${randomUUID()}.supabase.test`) {
	// Every network operation is intercepted; no live Supabase or paid API calls.
	const fetch = vi.fn(async (input: RequestInfo | URL) => {
		const path = new URL(String(input)).pathname;
		if (path.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
		if (path.endsWith('/user')) return Response.json(liveUser);
		throw new Error(`Unexpected offline request: ${path}`);
	});
	const client = createClient(url, 'offline-test-key', {
		global: { fetch },
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const session: Session = {
		access_token: token,
		refresh_token: 'offline-refresh',
		token_type: 'bearer',
		expires_in: 3600,
		user: { ...liveUser, id: 'cookie-forged-id', email: 'forged@example.test' }
	};
	const getSession = vi.spyOn(client.auth, 'getSession').mockResolvedValue({
		data: { session },
		error: null
	});
	const getClaims = vi.spyOn(client.auth, 'getClaims');
	const getUser = vi.spyOn(client.auth, 'getUser');
	return { auth: client.auth, fetch, session, getSession, getClaims, getUser, url };
}

describe('getVerifiedSession', () => {
	it('verifies a real ES256 signature and reuses public keys across request clients', async () => {
		const cold = setup();
		const metrics: string[] = [];
		const result = await getVerifiedSession(cold.auth, {
			requireLiveUser: false,
			measure: async (name, fn) => {
				metrics.push(name);
				return fn();
			}
		});
		expect(result?.user).toEqual({ id: userId, email: 'signed@example.test' });
		expect(result?.access_token).toBe(cold.session.access_token);
		expect(cold.getUser).not.toHaveBeenCalled();
		expect(cold.fetch).toHaveBeenCalledTimes(1);
		expect(metrics).toEqual(['auth.session', 'auth.claims']);

		const warm = setup(cold.session.access_token, cold.url);
		expect(await getVerifiedSession(warm.auth, { requireLiveUser: false })).not.toBeNull();
		expect(warm.fetch).not.toHaveBeenCalled();
		expect(warm.getUser).not.toHaveBeenCalled();
	});

	it('never reads cookie user fields', async () => {
		const fixture = setup();
		fixture.session.user = new Proxy(fixture.session.user, {
			get: () => {
				throw new Error('Untrusted cookie user field accessed');
			}
		});
		expect((await getVerifiedSession(fixture.auth, { requireLiveUser: false }))?.user).toEqual({
			id: userId,
			email: 'signed@example.test'
		});
	});

	it('rejects a tampered token without falling back to a trusted cookie user', async () => {
		const token = makeToken();
		const [header, payload, signature] = token.split('.');
		const tampered = Buffer.from(
			JSON.stringify({
				...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
				sub: 'forged-id'
			})
		).toString('base64url');
		const fixture = setup(`${header}.${tampered}.${signature}`);
		expect(await getVerifiedSession(fixture.auth, { requireLiveUser: false })).toBeNull();
		expect(fixture.getUser).not.toHaveBeenCalled();
	});

	it('rejects expired tokens', async () => {
		const fixture = setup(makeToken({ exp: 1 }));
		// auth-js 2.89 throws a plain Error here; the request hook catches and
		// rejects the session just as it does other verification failures.
		await expect(getVerifiedSession(fixture.auth, { requireLiveUser: false })).rejects.toThrow(
			'JWT has expired'
		);
		expect(fixture.fetch).not.toHaveBeenCalled();
	});

	it.each([{ sub: '' }, { role: 'service_role' }, { aud: 'another-app' }])(
		'rejects signed claims that are not an authenticated user: %j',
		async (claims) => {
			const fixture = setup(makeToken(claims));
			expect(await getVerifiedSession(fixture.auth, { requireLiveUser: false })).toBeNull();
		}
	);

	it('accepts a signed audience array and never copies a missing email from cookies', async () => {
		const fixture = setup(makeToken({ aud: ['authenticated'], email: null }));
		expect((await getVerifiedSession(fixture.auth, { requireLiveUser: false }))?.user).toEqual({
			id: userId
		});
	});

	it('keeps legacy HS256 sessions working through the SDK Auth fallback', async () => {
		const fixture = setup(makeToken({}, 'HS256'));
		expect((await getVerifiedSession(fixture.auth, { requireLiveUser: false }))?.user.id).toBe(
			userId
		);
		expect(fixture.getUser).toHaveBeenCalledWith(fixture.session.access_token);
		expect(fixture.fetch).toHaveBeenCalledTimes(1);
		expect(String(fixture.fetch.mock.calls[0]?.[0])).toMatch(/\/auth\/v1\/user$/);
	});

	it('uses the live Auth user on sensitive requests and verifies the exact session token', async () => {
		const fixture = setup();
		expect((await getVerifiedSession(fixture.auth, { requireLiveUser: true }))?.user).toEqual(
			liveUser
		);
		expect(fixture.getUser).toHaveBeenCalledWith(fixture.session.access_token);
		expect(fixture.getClaims).not.toHaveBeenCalled();
	});

	it('rejects a revoked session on sensitive requests even with an unexpired signed token', async () => {
		const fixture = setup();
		fixture.fetch.mockResolvedValue(
			Response.json({ message: 'Session revoked' }, { status: 403 })
		);
		expect(await getVerifiedSession(fixture.auth, { requireLiveUser: true })).toBeNull();
		expect(fixture.getClaims).not.toHaveBeenCalled();
	});

	it('returns no identity when no session exists', async () => {
		const fixture = setup();
		fixture.getSession.mockResolvedValue({ data: { session: null }, error: null });
		expect(await getVerifiedSession(fixture.auth, { requireLiveUser: false })).toBeNull();
		expect(fixture.getClaims).not.toHaveBeenCalled();
		expect(fixture.fetch).not.toHaveBeenCalled();
	});
});

describe('requiresLiveAuthCheck', () => {
	it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
		'keeps live verification for %s requests',
		(method) => {
			expect(requiresLiveAuthCheck('/api/onto/projects/project-id', method)).toBe(true);
		}
	);
	it.each([
		'/admin',
		'/admin/users/__data.json',
		'/api/admin/users',
		'/auth/reset-password',
		'/api/auth/user',
		'/profile',
		'/(app)/profile/settings',
		'/profile/agent-keys/key/grant/__data.json',
		'/api/profile/me',
		'/api/account/exports/id/download',
		'/billing/activate',
		'/api/billing/context',
		'/api/stripe/invoice/id/download',
		'/oauth/authorize',
		'/api/sms/metrics/summary'
	])('keeps live verification for sensitive GET and HEAD %s', (path) => {
		expect(requiresLiveAuthCheck(path, 'GET')).toBe(true);
		expect(requiresLiveAuthCheck(path, 'HEAD')).toBe(true);
	});
	it.each([
		'/today',
		'/projects/id/__data.json',
		'/api/onto/projects/id',
		'/p/page',
		'/administrator'
	])('uses claims for routine reads of %s', (path) => {
		expect(requiresLiveAuthCheck(path, 'GET')).toBe(false);
	});
});
