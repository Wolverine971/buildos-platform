// apps/web/src/routes/layout.server.test.ts
//
// The root layout's server load is on the path of every client navigation. SvelteKit re-runs a
// server load whenever something it read about the request changes, so what this load reads
// decides how often every signed-in visitor asks the server for the same account data again.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchBillingContext: vi.fn(), stripeEnabled: true }));

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/stripe-config', () => ({ isStripeEnabled: () => mocks.stripeEnabled }));
vi.mock('$lib/server/billing-context', () => ({ fetchBillingContext: mocks.fetchBillingContext }));
vi.mock('$lib/server/billing-context-cache', () => ({
	getCachedBillingContext: () => null,
	setCachedBillingContext: vi.fn()
}));
vi.mock('$lib/server/authenticated-user-activity', () => ({
	recordAuthenticatedUserActivity: vi.fn(async () => undefined)
}));
vi.mock('$lib/server/gmail-relevance/config', () => ({
	isGmailRelevancePhaseAReviewUserAllowed: () => false
}));

import { load } from './+layout.server';

/** URL properties SvelteKit tracks as "the address": reading one re-runs the load on any change. */
const TRACKED_URL_PROPERTIES = ['href', 'pathname', 'search', 'toString', 'toJSON'];
/** Query reads SvelteKit tracks per parameter instead. */
const PER_PARAMETER_READS = ['get', 'getAll', 'has'];

function eventFor(address: string, routeId: string | null, userId = 'user-1') {
	const real = new URL(address, 'https://buildos.test');
	const addressReads: string[] = [];
	const parametersRead: string[] = [];
	const routeReads: string[] = [];
	const searchParams = new Proxy(real.searchParams, {
		get(target, key) {
			if (typeof key === 'string' && PER_PARAMETER_READS.includes(key)) {
				return (name: string) => {
					parametersRead.push(name);
					return (target[key as 'get'] as (name: string) => unknown).call(target, name);
				};
			}
			if (typeof key === 'string') addressReads.push(`searchParams.${key}`);
			const value = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
	const url = new Proxy(real, {
		get(target, key) {
			if (key === 'searchParams') return searchParams;
			if (typeof key === 'string' && TRACKED_URL_PROPERTIES.includes(key))
				addressReads.push(key);
			const value = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});

	// Any query the load builds answers "nothing found".
	const query: Record<string, unknown> = {};
	const chain = new Proxy(query, {
		get(_target, key) {
			if (key === 'then') {
				return (resolve: (value: unknown) => unknown) =>
					Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
			}
			return () => chain;
		}
	});

	return {
		addressReads,
		parametersRead,
		routeReads,
		event: {
			locals: {
				safeGetSession: vi.fn(async () => ({
					user: {
						id: userId,
						email: 'person@example.com',
						is_admin: false,
						onboarding_completed_at: '2026-01-01T00:00:00.000Z',
						onboarding_step: null,
						onboarding_intent: null,
						onboarding_stakes: null
					}
				})),
				supabase: {
					rpc: vi.fn(async () => ({ data: [], error: null })),
					from: vi.fn(() => chain)
				},
				serverTiming: undefined
			},
			url,
			route: new Proxy(
				{ id: routeId },
				{
					get(target, key) {
						if (typeof key === 'string') routeReads.push(key);
						return Reflect.get(target, key);
					}
				}
			),
			cookies: { get: vi.fn(() => undefined), set: vi.fn(), delete: vi.fn() },
			depends: vi.fn()
		}
	};
}

describe('root layout server load', () => {
	beforeEach(() => {
		mocks.fetchBillingContext.mockReset();
		mocks.fetchBillingContext.mockResolvedValue(null);
		mocks.stripeEnabled = true;
	});

	// A Settings tab click, a History search and a filter change only the query string. If this
	// load read the address, each of them would send a request for account data nobody changed.
	it('reads nothing that makes it re-run when only the query string changes', async () => {
		const { event, addressReads, parametersRead } = eventFor(
			'/profile?tab=notifications',
			'/profile'
		);

		const data = await load(event as never);

		expect(data?.user?.id).toBe('user-1');
		expect(addressReads).toEqual([]);
		// `?app=1` (the iPhone app's flag) is the one parameter it depends on.
		expect(parametersRead).toEqual(['app']);
	});

	// Reading the route is what makes SvelteKit re-run this load when the visitor changes
	// page, which keeps the invite badge, trial banner and last-visit time fresh. With Stripe
	// off (local dev, self-hosting) nothing else in the load needs the route.
	it.each([true, false])('reads the route, Stripe enabled: %s', async (stripeEnabled) => {
		mocks.stripeEnabled = stripeEnabled;
		const { event, routeReads } = eventFor('/history', '/history');

		await load(event as never);

		expect(routeReads).toContain('id');
	});

	it('loads billing on app pages and skips it on the sign-in pages', async () => {
		await load(eventFor('/profile', '/profile', 'user-app').event as never);
		expect(mocks.fetchBillingContext).toHaveBeenCalledTimes(1);

		mocks.fetchBillingContext.mockClear();
		await load(eventFor('/auth/login', '/auth/login', 'user-auth').event as never);
		expect(mocks.fetchBillingContext).not.toHaveBeenCalled();
	});

	it('still loads billing on an address that matches no route', async () => {
		await load(eventFor('/no-such-page', null, 'user-404').event as never);
		expect(mocks.fetchBillingContext).toHaveBeenCalledTimes(1);
	});
});
