// apps/web/src/lib/services/stripe-service.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { PRIVATE_ENABLE_STRIPE: 'true', PRIVATE_STRIPE_SECRET_KEY: 'sk_test_unit' }
}));
vi.mock('$env/static/public', () => ({ PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_unit' }));
vi.mock('stripe', () => ({
	default: vi.fn(function () {
		return {
			subscriptions: {
				retrieve: vi.fn().mockRejectedValue(new Error('offline in unit tests'))
			}
		};
	})
}));
vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: () => ({ logAPIError: vi.fn().mockResolvedValue(undefined) })
	}
}));
vi.mock('$lib/server/billing-context-cache', () => ({
	invalidateBillingContextCache: vi.fn()
}));
vi.mock('./dunning-service', async () => {
	const resolveFailedPayment = vi.fn().mockResolvedValue(undefined);
	return {
		DunningService: vi.fn(function () {
			return { resolveFailedPayment };
		}),
		__resolveFailedPayment: resolveFailedPayment
	};
});

import { StripeService } from './stripe-service';

type Op = { table: string; action: string; payload?: unknown };

function createSupabase(results: Record<string, { data?: unknown; error?: unknown }>) {
	const ops: Op[] = [];
	const from = (table: string) => {
		const op: Op = { table, action: 'select' };
		ops.push(op);
		const result = () => {
			const hit = results[`${table}:${op.action}`] ?? results[table] ?? {};
			return { data: hit.data ?? null, error: hit.error ?? null };
		};
		const builder: any = {
			select: () => builder,
			eq: () => builder,
			is: () => builder,
			insert: (payload: unknown) => ((op.action = 'insert'), (op.payload = payload), builder),
			update: (payload: unknown) => ((op.action = 'update'), (op.payload = payload), builder),
			upsert: (payload: unknown) => ((op.action = 'upsert'), (op.payload = payload), builder),
			single: () => Promise.resolve(result()),
			maybeSingle: () => Promise.resolve(result()),
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(result()).then(resolve, reject)
		};
		return builder;
	};
	return { supabase: { from, rpc: vi.fn().mockResolvedValue({ error: null }) } as any, ops };
}

function subscriptionEvent(): any {
	return {
		id: 'evt_sub_1',
		type: 'customer.subscription.updated',
		data: {
			object: {
				id: 'sub_1',
				status: 'active',
				customer: 'cus_1',
				metadata: { user_id: 'user-1' },
				items: { data: [{ price: { id: 'price_1' } }] },
				cancel_at: null,
				canceled_at: null,
				trial_start: null,
				trial_end: null
			}
		}
	};
}

describe('StripeService webhook writes', () => {
	it('fails the event instead of marking it processed when a write errors', async () => {
		const { supabase, ops } = createSupabase({
			'customer_subscriptions:upsert': { error: { message: 'constraint violation' } }
		});

		await expect(
			new StripeService(supabase).handleWebhookEvent(subscriptionEvent())
		).rejects.toThrow(/customer_subscriptions/);

		const statusUpdates = ops
			.filter((op) => op.table === 'webhook_events' && op.action === 'update')
			.map((op) => (op.payload as { status?: string }).status);
		expect(statusUpdates).not.toContain('processed');
		expect(statusUpdates).toContain('failed');
	});

	it('resolves the failed payment on a paid invoice even when the stored status is already active', async () => {
		const dunning = (await import('./dunning-service')) as any;
		const { supabase } = createSupabase({
			customer_subscriptions: { data: { id: 'cs-1', user_id: 'user-1', status: 'active' } }
		});

		await new StripeService(supabase).handleWebhookEvent({
			id: 'evt_inv_1',
			type: 'invoice.payment_succeeded',
			data: {
				object: {
					id: 'in_1',
					customer: 'cus_1',
					subscription: 'sub_1',
					amount_paid: 2000,
					amount_due: 2000,
					currency: 'usd',
					status: 'paid'
				}
			}
		} as any);

		expect(dunning.__resolveFailedPayment).toHaveBeenCalledWith('in_1', 'paid');
	});
});
