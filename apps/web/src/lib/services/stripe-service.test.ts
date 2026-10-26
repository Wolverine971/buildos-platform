// apps/web/src/lib/services/stripe-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	subscriptions: { retrieve: vi.fn(), update: vi.fn(), cancel: vi.fn() },
	invoices: { retrieve: vi.fn() },
	customers: { create: vi.fn() },
	checkout: { sessions: { create: vi.fn() } },
	billingPortal: { sessions: { create: vi.fn() } },
	resolveFailedPayment: vi.fn(),
	recordFailedPayment: vi.fn(),
	invalidate: vi.fn()
}));
vi.mock('$env/dynamic/private', () => ({
	env: {
		PRIVATE_ENABLE_STRIPE: 'true',
		PRIVATE_STRIPE_SECRET_KEY: 'sk_test_unit',
		PRIVATE_STRIPE_PRO_PRICE_ID: 'price_pro',
		PRIVATE_STRIPE_POWER_PRICE_ID: 'price_power'
	}
}));
vi.mock('$env/static/public', () => ({ PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_unit' }));
vi.mock('stripe', () => ({
	default: vi.fn(function () {
		return mocks;
	})
}));
vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: { getInstance: () => ({ logAPIError: vi.fn() }) }
}));
vi.mock('$lib/server/billing-context-cache', () => ({
	invalidateBillingContextCache: mocks.invalidate
}));
vi.mock('./dunning-service', () => ({
	DunningService: vi.fn(function () {
		return {
			resolveFailedPayment: mocks.resolveFailedPayment,
			recordFailedPayment: mocks.recordFailedPayment
		};
	})
}));
import { StripeService } from './stripe-service';

type Row = Record<string, any>;
// Stateful transport fake: retries observe prior writes; failures happen before persistence.
// Stripe SDK calls above never reach the network.
function database(seed: Record<string, Row[]> = {}) {
	const tables: Record<string, Row[]> = {
		users: [
			{
				id: 'user-1',
				stripe_customer_id: 'cus_1',
				subscription_status: 'past_due',
				access_restricted: true
			}
		],
		customer_subscriptions: [
			{
				id: 'cs-1',
				user_id: 'user-1',
				stripe_subscription_id: 'sub_1',
				stripe_price_id: 'price_pro',
				status: 'past_due',
				current_period_start: '2026-10-01T00:00:00Z',
				current_period_end: '2026-11-01T00:00:00Z'
			}
		],
		subscription_plans: [
			{
				id: 'plan-pro',
				stripe_price_id: 'price_pro',
				name: 'Pro',
				price_cents: 2000,
				billing_interval: 'month',
				interval_count: 1
			}
		],
		...structuredClone(seed)
	};
	const failures = new Map<string, string>();
	const ops: { table: string; action: string }[] = [];
	const rpc = vi.fn().mockResolvedValue({ data: [{ total_tokens: 100_000 }], error: null });
	const from = (table: string) => {
		let action = 'select',
			payload: Row = {},
			conflict = 'id',
			single = false;
		const filters: ((row: Row) => boolean)[] = [];
		const query: any = {
			select: () => query,
			order: () => query,
			limit: () => query,
			eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), query),
			neq: (key: string, value: unknown) => (
				filters.push((row) => row[key] !== value),
				query
			),
			is: (key: string, value: unknown) => (filters.push((row) => row[key] === value), query),
			in: (key: string, values: unknown[]) => (
				filters.push((row) => values.includes(row[key])),
				query
			),
			update: (data: Row) => ((action = 'update'), (payload = data), query),
			upsert: (data: Row, options?: { onConflict: string }) => (
				(action = 'upsert'),
				(payload = data),
				(conflict = options?.onConflict ?? 'id'),
				query
			),
			single: () => ((single = true), query),
			maybeSingle: () => ((single = true), query),
			then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
				ops.push({ table, action });
				const failure = failures.get(`${table}:${action}`);
				failures.delete(`${table}:${action}`);
				if (failure)
					return Promise.resolve({ data: null, error: { message: failure } }).then(
						resolve,
						reject
					);
				const rows = (tables[table] ??= []);
				let selected = rows.filter((row) => filters.every((f) => f(row)));
				if (action === 'update') selected.forEach((row) => Object.assign(row, payload));
				if (action === 'upsert') {
					let row = rows.find((row) => row[conflict] === payload[conflict]);
					if (row) Object.assign(row, payload);
					else {
						row = { id: `${table}-${rows.length}`, ...payload };
						rows.push(row);
					}
					selected = [row];
				}
				return Promise.resolve({
					data: single ? (selected[0] ?? null) : selected,
					error: null
				}).then(resolve, reject);
			}
		};
		return query;
	};
	return { tables, failures, ops, rpc, client: { from, rpc } as any };
}
function subscription(overrides: Row = {}): any {
	return {
		id: 'sub_1',
		status: 'active',
		customer: 'cus_1',
		metadata: { user_id: 'user-1' },
		items: {
			data: [
				{
					id: 'si_1',
					quantity: 1,
					price: { id: 'price_pro', unit_amount: 2000, recurring: { interval: 'month' } },
					current_period_start: 1790812800,
					current_period_end: 1793491200
				}
			]
		},
		...overrides
	};
}
function invoice(overrides: Row = {}): any {
	return {
		id: 'in_1',
		customer: 'cus_1',
		parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1' } },
		amount_paid: 2000,
		amount_due: 2000,
		currency: 'usd',
		status: 'paid',
		...overrides
	};
}
function event(type = 'customer.subscription.updated', object = subscription(), id = 'evt_1'): any {
	return { id, type, data: { object } };
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.subscriptions.retrieve.mockResolvedValue(subscription());
	mocks.invoices.retrieve.mockResolvedValue(invoice());
	mocks.customers.create.mockResolvedValue({ id: 'cus_new' });
	mocks.checkout.sessions.create.mockResolvedValue({
		url: 'https://checkout.stripe.test/session'
	});
	mocks.billingPortal.sessions.create.mockResolvedValue({
		url: 'https://billing.stripe.test/portal'
	});
});

describe('webhook persistence and retry contracts', () => {
	it('does not repeat an already processed event', async () => {
		const db = database({
			webhook_events: [{ event_id: 'evt_1', status: 'processed', attempts: 1 }]
		});
		await new StripeService(db.client).handleWebhookEvent(event());
		expect(mocks.subscriptions.retrieve).not.toHaveBeenCalled();
		expect(db.ops.every((op) => op.action === 'select')).toBe(true);
	});
	it('retries a partial write without treating the failed attempt as processed', async () => {
		const db = database();
		db.failures.set('users:update', 'database unavailable');
		const service = new StripeService(db.client);
		await expect(service.handleWebhookEvent(event())).rejects.toThrow('database unavailable');
		expect(db.tables.webhook_events![0]).toMatchObject({ status: 'failed', attempts: 1 });
		await service.handleWebhookEvent(event());
		expect(db.tables.webhook_events![0]).toMatchObject({ status: 'processed', attempts: 2 });
		expect(db.tables.customer_subscriptions).toHaveLength(1);
		expect(db.tables.users![0]!.subscription_status).toBe('active');
	});
	it.each([
		'webhook_events:select',
		'webhook_events:upsert',
		'webhook_events:update',
		'customer_subscriptions:upsert',
		'subscription_plans:select',
		'billing_accounts:upsert'
	])('does not acknowledge a failed %s', async (failure) => {
		const db = database();
		db.failures.set(failure, 'write unavailable');
		await expect(new StripeService(db.client).handleWebhookEvent(event())).rejects.toThrow();
		expect(db.tables.webhook_events?.[0]?.status).not.toBe('processed');
	});
	it('retries when the current Stripe subscription cannot be fetched', async () => {
		mocks.subscriptions.retrieve.mockRejectedValue(new Error('Stripe unavailable'));
		const db = database();
		await expect(new StripeService(db.client).handleWebhookEvent(event())).rejects.toThrow(
			'Stripe unavailable'
		);
		expect(db.tables.webhook_events![0]!.status).toBe('failed');
	});
	it('does not let a delayed active event reactivate a canceled subscription', async () => {
		mocks.subscriptions.retrieve.mockResolvedValue(subscription({ status: 'canceled' }));
		const db = database();
		await new StripeService(db.client).handleWebhookEvent(event());
		expect(db.tables.customer_subscriptions![0]!.status).toBe('canceled');
		expect(db.tables.users![0]!.subscription_status).toBe('free');
	});
	it('does not downgrade a replacement subscription when the old one is deleted', async () => {
		const db = database();
		db.tables.customer_subscriptions!.push({
			id: 'cs-new',
			user_id: 'user-1',
			stripe_subscription_id: 'sub_new',
			status: 'active'
		});
		db.tables.users![0]!.subscription_status = 'active';
		mocks.subscriptions.retrieve.mockResolvedValue(subscription({ status: 'canceled' }));
		await new StripeService(db.client).handleWebhookEvent(
			event('customer.subscription.deleted')
		);
		expect(db.tables.users![0]!.subscription_status).toBe('active');
		expect(db.tables.customer_subscriptions![0]!.status).toBe('canceled');
	});
	it.each([false, true])(
		'records paid invoices and stops dunning (legacy payload: %s)',
		async (legacy) => {
			const paid = legacy ? invoice({ parent: undefined, subscription: 'sub_1' }) : invoice();
			mocks.invoices.retrieve.mockResolvedValue(paid);
			const db = database();
			await new StripeService(db.client).handleWebhookEvent(
				event('invoice.payment_succeeded', paid)
			);
			expect(db.tables.invoices![0]).toMatchObject({
				stripe_invoice_id: 'in_1',
				status: 'paid'
			});
			expect(mocks.resolveFailedPayment).toHaveBeenCalledWith('in_1', 'paid');
			expect(db.tables.users![0]).toMatchObject({
				subscription_status: 'active',
				access_restricted: false
			});
		}
	);
	it.each(['invoice.payment_succeeded', 'invoice.payment_failed'])(
		'retries %s when its subscription lookup fails',
		async (type) => {
			const db = database();
			db.failures.set('customer_subscriptions:select', 'read unavailable');
			mocks.invoices.retrieve.mockResolvedValue(
				invoice({ status: type === 'invoice.payment_failed' ? 'open' : 'paid' })
			);
			await expect(
				new StripeService(db.client).handleWebhookEvent(event(type, invoice()))
			).rejects.toThrow('read unavailable');
			expect(db.tables.webhook_events![0]!.status).toBe('failed');
		}
	);
	it('retries cancellation when a legacy subscription owner cannot be read', async () => {
		const db = database();
		db.failures.set('customer_subscriptions:select', 'read unavailable');
		mocks.subscriptions.retrieve.mockResolvedValue(
			subscription({ status: 'canceled', metadata: {} })
		);
		await expect(
			new StripeService(db.client).handleWebhookEvent(event('customer.subscription.deleted'))
		).rejects.toThrow('read unavailable');
		expect(db.tables.webhook_events![0]!.status).toBe('failed');
	});
	it('resolves dunning even if a subscription update already restored active status', async () => {
		const db = database();
		db.tables.customer_subscriptions![0]!.status = 'active';
		await new StripeService(db.client).handleWebhookEvent(
			event('invoice.payment_succeeded', invoice())
		);
		expect(mocks.resolveFailedPayment).toHaveBeenCalledWith('in_1', 'paid');
	});
	it('does not reopen dunning for a delayed failure after the invoice was paid', async () => {
		const db = database();
		await new StripeService(db.client).handleWebhookEvent(
			event('invoice.payment_failed', invoice({ status: 'open' }))
		);
		expect(mocks.recordFailedPayment).not.toHaveBeenCalled();
		expect(db.tables.users![0]!.subscription_status).toBe('active');
	});
	it('records a current failed invoice and synchronizes past-due status', async () => {
		mocks.invoices.retrieve.mockResolvedValue(invoice({ status: 'open', amount_paid: 0 }));
		mocks.subscriptions.retrieve.mockResolvedValue(subscription({ status: 'past_due' }));
		const db = database();
		await new StripeService(db.client).handleWebhookEvent(
			event('invoice.payment_failed', invoice())
		);
		expect(mocks.recordFailedPayment).toHaveBeenCalledWith({
			userId: 'user-1',
			subscriptionId: 'cs-1',
			invoiceId: 'in_1',
			amountDue: 2000
		});
		expect(db.tables.users![0]!.subscription_status).toBe('past_due');
	});
	it('does not restore access from an old paid invoice after cancellation', async () => {
		mocks.subscriptions.retrieve.mockResolvedValue(subscription({ status: 'canceled' }));
		const db = database();
		await new StripeService(db.client).handleWebhookEvent(
			event('invoice.payment_succeeded', invoice())
		);
		expect(db.tables.users![0]!.subscription_status).toBe('free');
		expect(db.tables.customer_subscriptions![0]!.status).toBe('canceled');
	});
});

describe('checkout and automatic tier changes', () => {
	const checkout = {
		userId: 'user-1',
		userEmail: 'owner@example.test',
		priceId: 'price_pro',
		successUrl: 'https://build-os.com/today',
		cancelUrl: 'https://build-os.com/pricing'
	};
	it('rejects checkout when the user already has an active subscription', async () => {
		const db = database();
		db.tables.customer_subscriptions![0]!.status = 'active';
		await expect(new StripeService(db.client).createCheckoutSession(checkout)).rejects.toThrow(
			'active subscription'
		);
		expect(mocks.checkout.sessions.create).not.toHaveBeenCalled();
	});
	it('keeps the checkout owner authoritative over optional metadata', async () => {
		const db = database();
		await new StripeService(db.client).createCheckoutSession({
			...checkout,
			metadata: { user_id: 'other-user' }
		});
		expect(mocks.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: 'cus_1',
				metadata: expect.objectContaining({ user_id: 'user-1' }),
				subscription_data: expect.objectContaining({
					metadata: expect.objectContaining({ user_id: 'user-1' })
				})
			})
		);
	});
	it.each(['users:select', 'users:update'])(
		'fails customer creation on %s errors',
		async (failure) => {
			const db = database({ users: [{ id: 'user-1' }] });
			db.failures.set(failure, 'offline');
			await expect(
				new StripeService(db.client).getOrCreateCustomer('user-1', 'owner@example.test')
			).rejects.toThrow('offline');
		}
	);
	it('uses a stable idempotency key when retrying a failed customer link', async () => {
		const db = database({ users: [{ id: 'user-1' }] });
		db.failures.set('users:update', 'offline');
		const service = new StripeService(db.client);
		await expect(service.getOrCreateCustomer('user-1', 'owner@example.test')).rejects.toThrow();
		await service.getOrCreateCustomer('user-1', 'owner@example.test');
		expect(mocks.customers.create.mock.calls[0]![1]).toEqual(
			mocks.customers.create.mock.calls[1]![1]
		);
		expect(mocks.customers.create.mock.calls[0]![1]).toMatchObject({
			idempotencyKey: expect.any(String)
		});
	});
	it('does not upgrade at the included-credit boundary', async () => {
		const db = database();
		db.tables.customer_subscriptions![0]!.status = 'active';
		expect(
			await new StripeService(db.client).maybeAutoUpgradeToPowerTier('user-1', {
				proIncludedCredits: 100
			})
		).toMatchObject({ upgraded: false, reason: 'below_threshold' });
		expect(mocks.subscriptions.update).not.toHaveBeenCalled();
	});
	it('upgrades only above the boundary and preserves one billable subscription item', async () => {
		const db = database();
		db.tables.customer_subscriptions![0]!.status = 'active';
		db.rpc.mockResolvedValue({ data: [{ total_tokens: 100_001 }], error: null });
		const power = subscription();
		power.items.data[0].price.id = 'price_power';
		mocks.subscriptions.update.mockResolvedValue(power);
		expect(
			await new StripeService(db.client).maybeAutoUpgradeToPowerTier('user-1', {
				proIncludedCredits: 100
			})
		).toMatchObject({ upgraded: true, currentCycleCredits: 101 });
		expect(mocks.subscriptions.update).toHaveBeenCalledWith(
			'sub_1',
			expect.objectContaining({
				items: [{ id: 'si_1', price: 'price_power', quantity: 1 }],
				proration_behavior: 'create_prorations'
			}),
			expect.objectContaining({ idempotencyKey: expect.any(String) })
		);
		expect(db.tables.billing_accounts![0]!.billing_tier).toBe('power');
	});
	it('does not prorate a second time when Stripe upgraded but the local write must be retried', async () => {
		const db = database();
		db.tables.customer_subscriptions![0]!.status = 'active';
		db.rpc.mockResolvedValue({ data: [{ total_tokens: 100_001 }], error: null });
		const power = subscription();
		power.items.data[0].price.id = 'price_power';
		mocks.subscriptions.retrieve.mockResolvedValue(power);
		expect(
			await new StripeService(db.client).maybeAutoUpgradeToPowerTier('user-1', {
				proIncludedCredits: 100
			})
		).toMatchObject({ upgraded: false, reason: 'already_power' });
		expect(mocks.subscriptions.update).not.toHaveBeenCalled();
		expect(db.tables.billing_accounts![0]!.billing_tier).toBe('power');
	});
});
