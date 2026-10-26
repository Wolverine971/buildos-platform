// apps/web/src/routes/api/stripe/webhook/server.test.ts
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), enabled: true, secret: 'whsec_local_fixture' }));
vi.mock('$env/dynamic/private', () => ({ env: { STRIPE_SECRET_KEY: 'sk_test_local_fixture' } }));
vi.mock('$env/static/private', () => ({
	get STRIPE_WEBHOOK_SECRET() {
		return mocks.secret;
	}
}));
vi.mock('$env/static/public', () => ({ PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_local_fixture' }));
vi.mock('$lib/server/stripe-config', () => ({ isStripeEnabled: () => mocks.enabled }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: mocks.admin }));
vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: class {
		static getInstance() {
			return {};
		}
	}
}));

import { StripeService } from '$lib/services/stripe-service';
import { POST } from './+server';

const stripe = new Stripe('sk_test_local_fixture');
const payload = JSON.stringify({
	id: 'evt_fixture',
	type: 'customer.subscription.updated',
	data: { object: { id: 'sub_fixture' } }
});
function request(body = payload, signature?: string) {
	return {
		request: new Request('http://localhost/api/stripe/webhook', {
			method: 'POST',
			body,
			headers: signature ? { 'stripe-signature': signature } : {}
		})
	} as Parameters<typeof POST>[0];
}
function sign(body = payload, timestamp = Math.floor(Date.now() / 1000)) {
	return stripe.webhooks.generateTestHeaderString({
		payload: body,
		secret: mocks.secret,
		timestamp
	});
}
const handle = vi.spyOn(StripeService.prototype, 'handleWebhookEvent');
beforeEach(() => {
	vi.clearAllMocks();
	mocks.enabled = true;
	mocks.secret = 'whsec_local_fixture';
	mocks.admin.mockReturnValue({});
	handle.mockResolvedValue(undefined);
});

describe('Stripe webhook HTTP boundary (real SDK signature verification, no network)', () => {
	it('accepts a signed raw payload and acknowledges only after processing', async () => {
		const response = await POST(request(payload, sign()));
		expect(response.status).toBe(200);
		expect(handle).toHaveBeenCalledWith(JSON.parse(payload));
		expect(mocks.admin).toHaveBeenCalledOnce();
	});
	it.each(['missing', 'tampered', 'expired', 'wrong-secret'])(
		'rejects a %s signature before creating a privileged client',
		async (kind) => {
			const signature =
				kind === 'missing'
					? undefined
					: kind === 'expired'
						? sign(payload, Math.floor(Date.now() / 1000) - 600)
						: kind === 'wrong-secret'
							? stripe.webhooks.generateTestHeaderString({
									payload,
									secret: 'whsec_other'
								})
							: sign();
			const body =
				kind === 'tampered' ? payload.replace('sub_fixture', 'sub_attacker') : payload;
			expect((await POST(request(body, signature))).status).toBe(400);
			expect(mocks.admin).not.toHaveBeenCalled();
			expect(handle).not.toHaveBeenCalled();
		}
	);
	it('fails closed without a signing secret', async () => {
		const signature = sign();
		mocks.secret = '';
		expect((await POST(request(payload, signature))).status).toBe(401);
		expect(handle).not.toHaveBeenCalled();
	});
	it('returns a retryable failure when processing cannot persist, then accepts redelivery', async () => {
		handle.mockRejectedValueOnce(new Error('database unavailable'));
		expect((await POST(request(payload, sign()))).status).toBe(500);
		expect((await POST(request(payload, sign()))).status).toBe(200);
		expect(handle).toHaveBeenCalledTimes(2);
	});
	it('does not process when payments are disabled', async () => {
		mocks.enabled = false;
		expect((await POST(request(payload, sign()))).status).toBe(400);
		expect(handle).not.toHaveBeenCalled();
	});
});
