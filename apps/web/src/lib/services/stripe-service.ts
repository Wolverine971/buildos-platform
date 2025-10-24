// apps/web/src/lib/services/stripe-service.ts
import Stripe from 'stripe';
import { PRIVATE_STRIPE_SECRET_KEY, PRIVATE_ENABLE_STRIPE } from '$env/static/private';
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
import type { SupabaseClient } from '@supabase/supabase-js';
import { INVOICE_CONFIG } from '$lib/config/stripe-invoice';
import { ErrorLoggerService } from './errorLogger.service';

// Initialize Stripe only if enabled
const stripeClient =
	PRIVATE_ENABLE_STRIPE === 'true' && PRIVATE_STRIPE_SECRET_KEY
		? new Stripe(PRIVATE_STRIPE_SECRET_KEY, {
				typescript: true
			})
		: null;

export interface CreateCheckoutSessionOptions {
	userId: string;
	userEmail: string;
	priceId: string;
	successUrl: string;
	cancelUrl: string;
	discountCode?: string;
	metadata?: Record<string, string>;
}

export interface CustomerPortalOptions {
	customerId: string;
	returnUrl: string;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
	const subscription = (
		invoice as Stripe.Invoice & {
			subscription?: string | Stripe.Subscription | null;
		}
	).subscription;

	if (!subscription) return null;
	return typeof subscription === 'string' ? subscription : subscription.id;
}

function getInvoiceCustomerId(invoice: Stripe.Invoice): string | null {
	const customer = invoice.customer;
	if (!customer) return null;
	return typeof customer === 'string' ? customer : customer.id;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription): string | null {
	const customer = subscription.customer;
	if (!customer) return null;
	return typeof customer === 'string' ? customer : customer.id;
}

export class StripeService {
	private supabase: SupabaseClient;
	private errorLogger: ErrorLoggerService;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	/**
	 * Check if Stripe is enabled
	 */
	static isEnabled(): boolean {
		return PRIVATE_ENABLE_STRIPE === 'true' && !!stripeClient;
	}

	/**
	 * Get publishable key for client
	 */
	static getPublishableKey(): string | null {
		return StripeService.isEnabled() ? PUBLIC_STRIPE_PUBLISHABLE_KEY : null;
	}

	/**
	 * Get configured Stripe instance
	 */
	static getClient(): Stripe {
		if (!stripeClient) {
			throw new Error('Stripe is not enabled');
		}

		return stripeClient;
	}

	/**
	 * Create or get Stripe customer
	 */
	async getOrCreateCustomer(userId: string, email: string): Promise<string> {
		const stripe = StripeService.getClient();

		// Check if user already has a Stripe customer ID
		const { data: user } = await this.supabase
			.from('users')
			.select('stripe_customer_id')
			.eq('id', userId)
			.single();

		if (user?.stripe_customer_id) {
			return user.stripe_customer_id;
		}

		// Create new Stripe customer
		const customer = await stripe.customers.create({
			email,
			metadata: {
				user_id: userId
			}
		});

		// Save customer ID to database
		await this.supabase
			.from('users')
			.update({
				stripe_customer_id: customer.id,
				updated_at: new Date().toISOString()
			})
			.eq('id', userId);

		return customer.id;
	}

	/**
	 * Create checkout session for subscription
	 */
	async createCheckoutSession(options: CreateCheckoutSessionOptions): Promise<string> {
		const stripe = StripeService.getClient();

		// Check for existing active subscription
		const { data: existingSub } = await this.supabase
			.from('customer_subscriptions')
			.select('id, status')
			.eq('user_id', options.userId)
			.in('status', ['active', 'trialing'])
			.single();

		if (existingSub) {
			throw new Error('You already have an active subscription');
		}

		const customerId = await this.getOrCreateCustomer(options.userId, options.userEmail);

		// Check for discount code
		let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
		if (options.discountCode) {
			const { data: discountData } = await this.supabase
				.from('discount_codes')
				.select('stripe_coupon_id')
				.eq('code', options.discountCode)
				.eq('is_active', true)
				.single();

			if (discountData?.stripe_coupon_id) {
				discounts = [{ coupon: discountData.stripe_coupon_id }];
			}
		}

		const session = await stripe.checkout.sessions.create({
			customer: customerId,
			payment_method_types: ['card'],
			line_items: [
				{
					price: options.priceId,
					quantity: 1
				}
			],
			mode: 'subscription',
			success_url: options.successUrl,
			cancel_url: options.cancelUrl,
			discounts,
			subscription_data: {
				metadata: {
					user_id: options.userId,
					...options.metadata
				},
				description: INVOICE_CONFIG.memoTemplates.subscription
			},
			customer_update: {
				address: 'auto',
				name: 'auto'
			},
			metadata: {
				user_id: options.userId,
				...options.metadata
			}
		});

		return session.url || '';
	}

	/**
	 * Create customer portal session
	 */
	async createPortalSession(options: CustomerPortalOptions): Promise<string> {
		const stripe = StripeService.getClient();

		const session = await stripe.billingPortal.sessions.create({
			customer: options.customerId,
			return_url: options.returnUrl
		});

		return session.url;
	}

	/**
	 * Cancel subscription
	 */
	async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
		const stripe = StripeService.getClient();

		if (immediately) {
			await stripe.subscriptions.cancel(subscriptionId);
		} else {
			await stripe.subscriptions.update(subscriptionId, {
				cancel_at_period_end: true
			});
		}
	}

	/**
	 * Handle webhook events
	 */
	async handleWebhookEvent(event: Stripe.Event): Promise<void> {
		// Check if we've already processed this event
		const { data: existingEvent } = await this.supabase
			.from('webhook_events')
			.select('id, status, attempts')
			.eq('event_id', event.id)
			.single();

		if (existingEvent?.status === 'processed') {
			console.log(`Event ${event.id} already processed, skipping`);
			return;
		}

		// Log webhook event
		await this.supabase.from('webhook_events').upsert(
			{
				event_id: event.id,
				event_type: event.type,
				status: 'processing',
				payload: event,
				attempts: existingEvent ? (existingEvent.attempts || 1) + 1 : 1
			},
			{
				onConflict: 'event_id'
			}
		);

		try {
			switch (event.type) {
				case 'checkout.session.completed':
					await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
					break;

				case 'customer.subscription.created':
				case 'customer.subscription.updated':
					await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
					break;

				case 'customer.subscription.deleted':
					await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
					break;

				case 'invoice.payment_succeeded':
					await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
					break;

				case 'invoice.payment_failed':
					await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
					break;

				default:
					console.log(`Unhandled webhook event type: ${event.type}`);
			}

			// Mark as processed
			await this.supabase
				.from('webhook_events')
				.update({
					status: 'processed',
					processed_at: new Date().toISOString()
				})
				.eq('event_id', event.id);
		} catch (error) {
			console.error(`Error processing webhook event ${event.id}:`, error);

			// Log to error tracking system
			const subscription = event.data.object as any;
			const userId = subscription?.metadata?.user_id;
			const stripeCustomerId =
				typeof subscription?.customer === 'string'
					? subscription.customer
					: subscription?.customer?.id;

			await this.errorLogger.logAPIError(error, '/api/webhooks/stripe', 'POST', userId, {
				operation: 'handleWebhookEvent',
				errorType: 'stripe_webhook_processing_error',
				eventId: event.id,
				eventType: event.type,
				stripeCustomerId,
				stripeSubscriptionId: subscription?.id,
				webhookAttempts: existingEvent ? (existingEvent.attempts || 1) + 1 : 1
			});

			// Mark as failed
			await this.supabase
				.from('webhook_events')
				.update({
					status: 'failed',
					error_message: error instanceof Error ? error.message : 'Unknown error'
				})
				.eq('event_id', event.id);

			throw error;
		}
	}

	/**
	 * Handle successful checkout
	 */
	private async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
		const userId = session.metadata?.user_id;
		if (!userId) return;

		// Session will have subscription ID if it was a subscription checkout
		if (session.subscription) {
			const stripe = StripeService.getClient();
			const subscription = await stripe.subscriptions.retrieve(
				session.subscription as string
			);
			await this.handleSubscriptionUpdate(subscription);
		}
	}

	/**
	 * Handle subscription updates
	 */
	private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
		const userId = subscription.metadata?.user_id;
		if (!userId) {
			console.warn(`Subscription ${subscription.id} has no user_id in metadata`);
			return;
		}

		const priceId = subscription.items.data[0]?.price?.id;
		if (!priceId) {
			console.error(`Subscription ${subscription.id} has no price ID`);
			return;
		}

		const primaryItem = subscription.items.data[0] as
			| (Stripe.SubscriptionItem & {
					current_period_start?: number | null;
					current_period_end?: number | null;
			  })
			| undefined;

		const currentPeriodStart = primaryItem?.current_period_start
			? new Date(primaryItem.current_period_start * 1000).toISOString()
			: null;
		const currentPeriodEnd = primaryItem?.current_period_end
			? new Date(primaryItem.current_period_end * 1000).toISOString()
			: null;

		// Get plan details
		const { data: plan } = await this.supabase
			.from('subscription_plans')
			.select('id')
			.eq('stripe_price_id', priceId)
			.single();

		// Upsert subscription record
		const customerId = getSubscriptionCustomerId(subscription);
		if (!customerId) {
			console.warn(`Subscription ${subscription.id} is missing customer reference`);
			return;
		}

		await this.supabase.from('customer_subscriptions').upsert(
			{
				user_id: userId,
				stripe_customer_id: customerId,
				stripe_subscription_id: subscription.id,
				stripe_price_id: priceId,
				plan_id: plan?.id,
				status: subscription.status,
				current_period_start: currentPeriodStart,
				current_period_end: currentPeriodEnd,
				cancel_at: subscription.cancel_at
					? new Date(subscription.cancel_at * 1000).toISOString()
					: null,
				canceled_at: subscription.canceled_at
					? new Date(subscription.canceled_at * 1000).toISOString()
					: null,
				trial_start: subscription.trial_start
					? new Date(subscription.trial_start * 1000).toISOString()
					: null,
				trial_end: subscription.trial_end
					? new Date(subscription.trial_end * 1000).toISOString()
					: null
			},
			{
				onConflict: 'stripe_subscription_id'
			}
		);

		// Update user subscription status
		await this.supabase
			.from('users')
			.update({
				subscription_status: subscription.status,
				subscription_plan_id: plan?.id
			})
			.eq('id', userId);
	}

	/**
	 * Handle subscription deletion
	 */
	private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
		let userId = subscription.metadata?.user_id;

		if (!userId) {
			const { data: existingSubscription } = await this.supabase
				.from('customer_subscriptions')
				.select('user_id')
				.eq('stripe_subscription_id', subscription.id)
				.single();

			userId = existingSubscription?.user_id ?? undefined;
		}

		if (!userId) return;

		// Update subscription record
		await this.supabase
			.from('customer_subscriptions')
			.update({
				status: 'canceled',
				canceled_at: new Date().toISOString()
			})
			.eq('stripe_subscription_id', subscription.id);

		// Update user to free tier
		await this.supabase
			.from('users')
			.update({
				subscription_status: 'free',
				subscription_plan_id: null
			})
			.eq('id', userId);
	}

	/**
	 * Handle successful invoice payment
	 */
	private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
		const subscriptionId = getInvoiceSubscriptionId(invoice);
		const customerId = getInvoiceCustomerId(invoice);
		if (!subscriptionId || !customerId) return;

		const stripe = StripeService.getClient();

		const { data: existingSubscription } = await this.supabase
			.from('customer_subscriptions')
			.select('id, user_id, status')
			.eq('stripe_subscription_id', subscriptionId)
			.single();

		let userId = existingSubscription?.user_id ?? undefined;
		let customerSubscriptionId = existingSubscription?.id ?? undefined;

		if (!userId) {
			const { data: userByCustomer } = await this.supabase
				.from('users')
				.select('id')
				.eq('stripe_customer_id', customerId)
				.single();

			userId = userByCustomer?.id ?? undefined;
		}

		if (!userId) {
			console.warn(
				`Unable to resolve user for invoice ${invoice.id} (customer ${customerId})`
			);
			return;
		}

		// Record invoice (idempotent)
		await this.supabase.from('invoices').upsert(
			{
				user_id: userId,
				stripe_invoice_id: invoice.id,
				stripe_customer_id: customerId,
				subscription_id: customerSubscriptionId,
				amount_paid: invoice.amount_paid,
				amount_due: invoice.amount_due,
				currency: invoice.currency,
				status: invoice.status || 'paid',
				invoice_pdf: invoice.invoice_pdf,
				hosted_invoice_url: invoice.hosted_invoice_url
			},
			{ onConflict: 'stripe_invoice_id' }
		);

		// Sync subscription state from Stripe to capture the latest status changes
		try {
			const latestSubscription = await stripe.subscriptions.retrieve(subscriptionId);
			await this.handleSubscriptionUpdate(latestSubscription);
		} catch (error) {
			console.error(`Failed to refresh subscription ${subscriptionId}:`, error);
		}

		if (!existingSubscription) return;

		// If subscription was past_due, resolve any failed payments
		if (existingSubscription.status === 'past_due') {
			const { DunningService } = await import('./dunning-service');
			const dunningService = new DunningService(this.supabase);

			await dunningService.resolveFailedPayment(invoice.id, 'paid');

			// Update subscription status back to active
			await this.supabase
				.from('customer_subscriptions')
				.update({
					status: 'active'
				})
				.eq('id', existingSubscription.id);

			// Update user status
			await this.supabase
				.from('users')
				.update({
					subscription_status: 'active',
					access_restricted: false,
					access_restricted_at: null
				})
				.eq('id', existingSubscription.user_id);
		}
	}

	/**
	 * Handle failed invoice payment
	 */
	private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
		const subscriptionId = getInvoiceSubscriptionId(invoice);
		const customerId = getInvoiceCustomerId(invoice);
		if (!subscriptionId || !customerId) return;

		const { data: subscription } = await this.supabase
			.from('customer_subscriptions')
			.select('id, user_id')
			.eq('stripe_subscription_id', subscriptionId)
			.single();

		if (!subscription) return;

		// Record the failed payment
		const { DunningService } = await import('./dunning-service');
		const dunningService = new DunningService(this.supabase);

		await dunningService.recordFailedPayment({
			userId: subscription.user_id,
			subscriptionId: subscription.id,
			invoiceId: invoice.id,
			amountDue: invoice.amount_due
		});

		// Update subscription status
		await this.supabase
			.from('customer_subscriptions')
			.update({
				status: 'past_due'
			})
			.eq('id', subscription.id);

		// Update user status
		await this.supabase
			.from('users')
			.update({
				subscription_status: 'past_due'
			})
			.eq('id', subscription.user_id);

		console.error('Invoice payment failed:', invoice.id);
	}

	/**
	 * Verify webhook signature
	 */
	static verifyWebhookSignature(
		payload: string | Buffer,
		signature: string,
		secret: string
	): Stripe.Event {
		const stripe = StripeService.getClient();
		return stripe.webhooks.constructEvent(payload, signature, secret);
	}

	/**
	 * Apply discount code to user
	 */
	async applyDiscountCode(userId: string, code: string): Promise<boolean> {
		const { data: discount } = await this.supabase
			.from('discount_codes')
			.select('*')
			.eq('code', code)
			.eq('is_active', true)
			.single();

		if (!discount) return false;

		// Check if already applied
		const { data: existing } = await this.supabase
			.from('user_discounts')
			.select('id')
			.eq('user_id', userId)
			.eq('discount_code_id', discount.id)
			.single();

		if (existing) return false;

		// Apply discount
		await this.supabase.from('user_discounts').insert({
			user_id: userId,
			discount_code_id: discount.id
		});

		// Increment usage
		await this.supabase
			.from('discount_codes')
			.update({
				times_redeemed: discount.times_redeemed + 1,
				updated_at: new Date().toISOString()
			})
			.eq('id', discount.id);

		return true;
	}
}
