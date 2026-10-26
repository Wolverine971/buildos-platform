// apps/web/src/routes/api/stripe/billing-routes.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	checkout: vi.fn(),
	portal: vi.fn(),
	admin: vi.fn(),
	enabled: true
}));
vi.mock('$lib/services/stripe-service', () => ({
	StripeService: class {
		static isEnabled = () => mocks.enabled;
		createCheckoutSession = mocks.checkout;
		createPortalSession = mocks.portal;
	}
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: mocks.admin }));
vi.mock('$env/static/private', () => ({ STRIPE_PRICE_ID: 'price_pro' }));
vi.mock('$env/static/public', () => ({ PUBLIC_APP_URL: 'https://app.example.test' }));
import { POST as checkout } from './checkout/+server';
import { POST as portal } from './portal/+server';
function fixture(payload: Record<string, unknown> = {}, signedIn = true) {
	const query = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({
			data: { email: 'owner@example.test', stripe_customer_id: 'cus_owner' },
			error: null
		})
	};
	const event = {
		request: new Request('https://app.example.test/api/stripe/checkout', {
			method: 'POST',
			body: JSON.stringify(payload)
		}),
		url: new URL('https://app.example.test/api/stripe/checkout'),
		locals: {
			supabase: { from: vi.fn(() => query) },
			safeGetSession: vi.fn().mockResolvedValue({ user: signedIn ? { id: 'owner' } : null })
		}
	} as unknown as Parameters<typeof checkout>[0];
	return { event, query };
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.enabled = true;
	mocks.checkout.mockResolvedValue('https://checkout.stripe.test/session');
	mocks.portal.mockResolvedValue('https://billing.stripe.test/session');
});
describe('billing route ownership and redirect boundaries', () => {
	it.each([checkout, portal])(
		'requires a verified session before loading billing data',
		async (handler) => {
			const f = fixture({}, false);
			expect((await handler(f.event)).status).toBe(401);
			expect(f.query.select).not.toHaveBeenCalled();
			expect(mocks.checkout).not.toHaveBeenCalled();
			expect(mocks.portal).not.toHaveBeenCalled();
			expect(mocks.admin).not.toHaveBeenCalled();
		}
	);
	it('uses session ownership and server price despite forged checkout fields', async () => {
		const f = fixture({
			userId: 'victim',
			userEmail: 'victim@example.test',
			priceId: 'price_free',
			metadata: { user_id: 'victim' },
			successPath: '/today?welcome=1',
			cancelPath: '/billing/activate'
		});
		expect((await checkout(f.event)).status).toBe(200);
		expect(f.query.eq).toHaveBeenCalledWith('id', 'owner');
		expect(mocks.checkout).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'owner',
				userEmail: 'owner@example.test',
				priceId: 'price_pro',
				successUrl: 'https://app.example.test/today?welcome=1',
				cancelUrl: 'https://app.example.test/billing/activate'
			})
		);
	});
	it('uses the stored customer for the verified user, ignoring supplied customer and return URL', async () => {
		const f = fixture({ customerId: 'cus_victim', returnUrl: 'https://attacker.test' });
		expect((await portal(f.event)).status).toBe(200);
		expect(f.query.eq).toHaveBeenCalledWith('id', 'owner');
		expect(mocks.portal).toHaveBeenCalledWith({
			customerId: 'cus_owner',
			returnUrl: 'https://app.example.test/profile?tab=billing'
		});
	});
	it.each(['https://attacker.test', '//attacker.test', '/\\attacker.test', '/\n/attacker.test'])(
		'keeps return navigation on the application origin: %j',
		async (path) => {
			const f = fixture({ successPath: path, cancelPath: path });
			await checkout(f.event);
			expect(mocks.checkout).toHaveBeenCalledWith(
				expect.objectContaining({
					successUrl: 'https://app.example.test/projects?payment=success',
					cancelUrl: 'https://app.example.test/pricing?payment=cancelled'
				})
			);
		}
	);
	it.each([checkout, portal])(
		'does not create a session after a profile lookup failure',
		async (handler) => {
			const f = fixture();
			f.query.single.mockResolvedValue({ data: null, error: new Error('unavailable') });
			expect((await handler(f.event)).status).toBe(400);
			expect(mocks.checkout).not.toHaveBeenCalled();
			expect(mocks.portal).not.toHaveBeenCalled();
		}
	);
	it.each([checkout, portal])('honors the payments feature gate', async (handler) => {
		mocks.enabled = false;
		const f = fixture();
		expect((await handler(f.event)).status).toBe(400);
		expect(f.query.eq).not.toHaveBeenCalled();
	});
});
