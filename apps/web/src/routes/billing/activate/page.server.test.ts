// apps/web/src/routes/billing/activate/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/stripe-service', () => ({
	StripeService: { isEnabled: vi.fn(() => true) }
}));
vi.mock('$lib/server/billing-context', () => ({ fetchBillingContext: vi.fn() }));
vi.mock('$lib/utils/subscription', () => ({ checkUserSubscription: vi.fn() }));

import { load } from './+page.server';

describe('/billing/activate load', () => {
	it('sends signed-out users to login with the redirect param login actually reads', async () => {
		const result = load({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null }),
				supabase: {}
			},
			url: new URL('http://localhost/billing/activate')
		} as any);

		await expect(result).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=%2Fbilling%2Factivate'
		});
	});
});
