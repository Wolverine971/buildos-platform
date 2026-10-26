// apps/web/src/hooks.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	createServer: vi.fn(),
	logError: vi.fn(),
	adminRpc: vi.fn(),
	upgrade: vi.fn(),
	billingEnabled: false,
	autoUpgrade: false
}));
// SvelteKit's sequence wrapper requires its HTTP tracing request store. Compose
// the real application hooks here without the framework's tracing infrastructure.
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handlers: Handle[]): Handle =>
		({ event, resolve }) => {
			const run = (index: number, current: RequestEvent): ReturnType<Handle> =>
				index === handlers.length
					? resolve(current)
					: handlers[index]!({
							event: current,
							resolve: async (next) => run(index + 1, next)
						});
			return run(0, event);
		}
}));
vi.mock('$lib/supabase', () => ({ createSupabaseServer: mocks.createServer }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({ rpc: mocks.adminRpc })
}));
vi.mock('$lib/services/stripe-service', () => ({
	StripeService: class {
		maybeAutoUpgradeToPowerTier = mocks.upgrade;
	}
}));
vi.mock('$lib/server/stripe-config', () => ({ isStripeEnabled: () => true }));
vi.mock('$lib/server/calendar-token-crypto', () => ({
	buildEncryptedCalendarTokenPatch: vi.fn(),
	decodeStoredCalendarTokens: vi.fn()
}));
vi.mock('$lib/server/consumption-billing', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/consumption-billing')>()),
	get CONSUMPTION_BILLING_GUARD_ENABLED() {
		return mocks.billingEnabled;
	},
	get CONSUMPTION_AUTO_POWER_UPGRADE_ENABLED() {
		return mocks.autoUpgrade;
	}
}));
vi.mock('$lib/server/error-tracking', () => ({
	logServerError: mocks.logError,
	getClientIpFromHeaders: () => null,
	getRequestIdFromHeaders: () => null,
	getUserAgentFromHeaders: () => null
}));

import { handle } from './hooks.server';

function fixture(path = '/today', method = 'GET') {
	const profile = {
		id: 'verified-user',
		email: 'profile@example.test',
		is_admin: false,
		deletion_status: null
	};
	const auth = {
		getSession: vi.fn().mockResolvedValue({
			data: {
				session: {
					access_token: 'verified-token',
					user: { id: 'forged-user', is_admin: true }
				}
			},
			error: null
		}),
		getClaims: vi.fn().mockResolvedValue({
			data: {
				claims: {
					sub: profile.id,
					email: 'signed@example.test',
					aud: 'authenticated',
					role: 'authenticated'
				}
			},
			error: null
		}),
		getUser: vi.fn().mockResolvedValue({ data: { user: { id: profile.id } }, error: null }),
		signOut: vi.fn().mockResolvedValue({ error: null })
	};
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: profile, error: null })
	};
	const from = vi.fn().mockReturnValue(query);
	mocks.createServer.mockReturnValue({ auth, from });
	const url = new URL(path, 'https://build-os.com');
	const event = {
		url,
		request: new Request(url, { method }),
		locals: {},
		route: { id: path },
		params: {},
		cookies: { getAll: () => [], set: vi.fn() }
	} as unknown as RequestEvent;
	return { event, profile, auth, query, from };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.billingEnabled = false;
	mocks.autoUpgrade = false;
	mocks.adminRpc.mockReset();
	mocks.upgrade.mockResolvedValue({ upgraded: false });
	mocks.logError.mockResolvedValue(undefined);
});

describe('server hook session verification', () => {
	it('uses the signed identity for the profile query and memoizes checks within a request', async () => {
		const f = fixture();
		await handle({
			event: f.event,
			resolve: async (event) => {
				const [first, second] = await Promise.all([
					event.locals.safeGetSession(),
					event.locals.safeGetSession()
				]);
				expect(first).toBe(second);
				expect(first.user).toBe(f.profile);
				expect(first.session?.user).toEqual({
					id: f.profile.id,
					email: 'signed@example.test'
				});
				return new Response('ok');
			}
		});
		expect(f.auth.getClaims).toHaveBeenCalledTimes(1);
		expect(f.auth.getUser).not.toHaveBeenCalled();
		expect(f.query.eq).toHaveBeenCalledWith('id', f.profile.id);
		expect(f.query.single).toHaveBeenCalledTimes(1);
	});

	it('does not load application data when token verification fails', async () => {
		const f = fixture();
		f.auth.getClaims.mockResolvedValue({ data: null, error: new Error('Invalid signature') });
		await handle({
			event: f.event,
			resolve: async (event) => {
				expect(event.locals.user).toBeNull();
				expect(await event.locals.safeGetSession()).toEqual({ user: null, session: null });
				return new Response('ok');
			}
		});
		expect(f.from).not.toHaveBeenCalled();
	});

	it('fails closed when the SDK throws for an expired or malformed token', async () => {
		const f = fixture();
		f.auth.getClaims.mockRejectedValue(new Error('JWT has expired'));
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await handle({
				event: f.event,
				resolve: async (event) => {
					expect(await event.locals.safeGetSession()).toEqual({
						user: null,
						session: null
					});
					return new Response('ok');
				}
			});
			expect(f.from).not.toHaveBeenCalled();
		} finally {
			errorLog.mockRestore();
		}
	});

	it.each(['pending', 'processing'])('keeps %s account deletions signed out', async (status) => {
		const f = fixture();
		f.query.single.mockResolvedValue({
			data: { ...f.profile, deletion_status: status },
			error: null
		});
		await handle({
			event: f.event,
			resolve: async (event) => {
				expect(event.locals.user).toBeNull();
				expect(event.locals._explicitlyCleared).toBe(true);
				return new Response('ok');
			}
		});
		expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
	});

	it('retains the fresh Auth check on writes', async () => {
		const f = fixture('/api/onto/projects/id', 'PATCH');
		await handle({ event: f.event, resolve: async () => new Response('ok') });
		expect(f.auth.getUser).toHaveBeenCalledWith('verified-token');
		expect(f.auth.getClaims).not.toHaveBeenCalled();
	});

	it('uses the resolved route for live checks even when URL segments are encoded', async () => {
		const f = fixture('/api/%61dmin/users');
		f.event.route.id = '/api/admin/users';
		await handle({ event: f.event, resolve: async () => new Response('ok') });
		expect(f.auth.getUser).toHaveBeenCalledWith('verified-token');
		expect(f.auth.getClaims).not.toHaveBeenCalled();
	});

	// SvelteKit strips `/__data.json` (and its `x-sveltekit-invalidated` param) before the
	// hook runs, so a client-side admin data load arrives as the page URL plus `isDataRequest`.
	function adminDataRequest() {
		const f = fixture('/admin/users?x=1');
		Object.assign(f.event, { isDataRequest: true, route: { id: '/admin/users' } });
		return f;
	}

	it('checks live Auth and database admin status on SvelteKit admin data requests', async () => {
		const f = adminDataRequest();
		const resolve = vi.fn();
		await expect(handle({ event: f.event, resolve })).rejects.toMatchObject({
			status: 303,
			location: '/today'
		});
		expect(f.auth.getUser).toHaveBeenCalledWith('verified-token');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('does not fall back to claims after live Auth rejects a sensitive request', async () => {
		const f = adminDataRequest();
		f.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Revoked') });
		await expect(handle({ event: f.event, resolve: vi.fn() })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=%2Fadmin%2Fusers%3Fx%3D1'
		});
		expect(f.auth.getClaims).not.toHaveBeenCalled();
		expect(f.from).not.toHaveBeenCalled();
	});
});

describe('consumption billing through the real server hook', () => {
	beforeEach(() => {
		mocks.billingEnabled = true;
	});
	it.each([
		['/api/onto/tasks/task-1', 'workspace_write'],
		['/api/agent/v2/stream', 'ai_compute']
	])('blocks frozen mutation %s before the handler runs', async (path, capability) => {
		mocks.adminRpc.mockResolvedValue({
			data: [{ is_frozen: true, billing_tier: 'explorer' }],
			error: null
		});
		const f = fixture(path, 'POST');
		const resolve = vi.fn(async () => new Response('should not run'));
		const response = await handle({ event: f.event, resolve });
		expect(response.status).toBe(402);
		expect(await response.json()).toMatchObject({
			code: 'UPGRADE_REQUIRED',
			blocked_capability: capability,
			read_only: true,
			activation_path: '/billing/activate'
		});
		expect(resolve).not.toHaveBeenCalled();
		expect(mocks.adminRpc).toHaveBeenCalledWith(
			'evaluate_user_consumption_gate',
			expect.objectContaining({ p_user_id: 'verified-user' })
		);
	});
	it.each([
		['/api/onto/tasks/task-1', 'GET'],
		['/api/stripe/checkout', 'POST'],
		['/api/stripe/portal', 'POST'],
		['/api/account/delete', 'POST'],
		['/api/auth/logout', 'POST']
	])('preserves read or recovery access at %s %s', async (path, method) => {
		const f = fixture(path, method);
		const resolve = vi.fn(async () => new Response('allowed'));
		expect((await handle({ event: f.event, resolve })).status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect(mocks.adminRpc).not.toHaveBeenCalled();
	});
	it('does not run billing when its rollout flag is off', async () => {
		mocks.billingEnabled = false;
		expect(
			(
				await handle({
					event: fixture('/api/onto/tasks/task-1', 'PATCH').event,
					resolve: async () => new Response('ok')
				})
			).status
		).toBe(200);
		expect(mocks.adminRpc).not.toHaveBeenCalled();
	});
	it.each([false, true])(
		'only checks an automatic tier upgrade when separately enabled (%s)',
		async (enabled) => {
			mocks.autoUpgrade = enabled;
			mocks.adminRpc.mockResolvedValue({
				data: [{ is_frozen: false, billing_tier: 'pro', lifetime_credits_used: 1_000_000 }],
				error: null
			});
			await handle({
				event: fixture('/api/agent/v2/stream', 'POST').event,
				resolve: async () => new Response('ok')
			});
			expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
			expect(mocks.upgrade).toHaveBeenCalledTimes(enabled ? 1 : 0);
			if (enabled)
				expect(mocks.upgrade).toHaveBeenCalledWith('verified-user', expect.any(Object));
		}
	);
	it('does not upgrade after a failed mutation', async () => {
		mocks.autoUpgrade = true;
		mocks.adminRpc.mockResolvedValue({
			data: [{ is_frozen: false, billing_tier: 'pro', lifetime_credits_used: 1_000_000 }],
			error: null
		});
		await handle({
			event: fixture('/api/agent/v2/stream', 'POST').event,
			resolve: async () => new Response('failed', { status: 500 })
		});
		expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
		expect(mocks.upgrade).not.toHaveBeenCalled();
	});
});
