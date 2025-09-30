// apps/web/src/lib/services/dunning-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { DUNNING_CONFIG, EMAIL_TEMPLATES, type DunningStage } from '$lib/config/dunning';
import { EmailService } from './email-service';
import { StripeService } from './stripe-service';

export interface FailedPayment {
	id: string;
	user_id: string;
	subscription_id: string;
	invoice_id: string;
	amount_due: number;
	failed_at: Date;
	retry_count: number;
	last_retry_at?: Date;
	dunning_stage?: string;
	resolved_at?: Date;
}

export class DunningService {
	private supabase: SupabaseClient;
	private emailService: EmailService;
	private stripeService: StripeService;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.emailService = new EmailService(supabase);
		this.stripeService = new StripeService(supabase);
	}

	/**
	 * Process failed payments and execute dunning stages
	 */
	async processDunningQueue(): Promise<void> {
		// Get all unresolved failed payments
		const { data: failedPayments, error } = await this.supabase
			.from('failed_payments')
			.select(
				`
        *,
        users (
          email,
          full_name,
          stripe_customer_id
        ),
        customer_subscriptions (
          stripe_subscription_id,
          status
        )
      `
			)
			.is('resolved_at', null)
			.order('failed_at', { ascending: true });

		if (error || !failedPayments) {
			console.error('Error fetching failed payments:', error);
			return;
		}

		// Process each failed payment
		for (const payment of failedPayments) {
			await this.processFailedPayment(payment);
		}
	}

	/**
	 * Process a single failed payment through dunning stages
	 */
	private async processFailedPayment(payment: any): Promise<void> {
		const daysSinceFailure = Math.floor(
			(Date.now() - new Date(payment.failed_at).getTime()) / (1000 * 60 * 60 * 24)
		);

		// Find the appropriate dunning stage
		const currentStage = DUNNING_CONFIG.find(
			(stage) => stage.daysAfterFailure <= daysSinceFailure
		);

		if (!currentStage) return;

		// Check if we've already processed this stage
		if (payment.dunning_stage === currentStage.name) {
			return;
		}

		console.log(`Processing dunning stage: ${currentStage.name} for payment ${payment.id}`);

		try {
			// Execute the stage action
			switch (currentStage.action) {
				case 'email':
					await this.sendDunningEmail(payment, currentStage);
					break;
				case 'email_and_warn':
					await this.sendDunningEmail(payment, currentStage);
					await this.addInAppWarning(payment.user_id, currentStage);
					break;
				case 'email_and_restrict':
					await this.sendDunningEmail(payment, currentStage);
					await this.restrictAccess(payment.user_id);
					break;
				case 'cancel':
					await this.sendDunningEmail(payment, currentStage);
					await this.cancelSubscription(payment);
					break;
			}

			// Update dunning stage
			await this.supabase
				.from('failed_payments')
				.update({
					dunning_stage: currentStage.name,
					last_dunning_at: new Date().toISOString()
				})
				.eq('id', payment.id);
		} catch (error) {
			console.error(`Error processing dunning stage ${currentStage.name}:`, error);
		}
	}

	/**
	 * Send dunning email to customer
	 */
	private async sendDunningEmail(payment: any, stage: DunningStage): Promise<void> {
		const template = EMAIL_TEMPLATES[stage.emailTemplate];
		if (!template) return;

		// Use a base URL that can be configured
		const baseUrl = process.env.PUBLIC_APP_URL || 'https://build-os.com';
		const updatePaymentUrl = `${baseUrl}/profile?tab=billing&action=update_payment`;
		const reactivateUrl = `${baseUrl}/pricing`;

		const emailData = {
			to: payment.users.email,
			subject: template.subject,
			body: template.body
				.replace('{{name}}', payment.users.full_name || 'Customer')
				.replace('{{update_payment_link}}', updatePaymentUrl)
				.replace('{{reactivate_link}}', reactivateUrl),
			userId: payment.user_id,
			createdBy: 'dunning-service',
			metadata: {
				stage: stage.name,
				action: stage.action,
				failed_payment_id: payment.id,
				user_id: payment.user_id
			}
		};

		await this.emailService.sendEmail(emailData);
	}

	/**
	 * Add in-app warning for the user
	 */
	private async addInAppWarning(userId: string, stage: DunningStage): Promise<void> {
		await this.supabase.from('user_notifications').insert({
			user_id: userId,
			type: 'payment_warning',
			title: 'Payment Method Required',
			message: `Your subscription payment has failed. Please update your payment method to avoid service interruption.`,
			priority: 'high',
			action_url: '/profile?tab=billing',
			expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
		});
	}

	/**
	 * Restrict user access to premium features
	 */
	private async restrictAccess(userId: string): Promise<void> {
		await this.supabase
			.from('users')
			.update({
				subscription_status: 'past_due',
				access_restricted: true,
				access_restricted_at: new Date().toISOString()
			})
			.eq('id', userId);
	}

	/**
	 * Cancel subscription after grace period
	 */
	private async cancelSubscription(payment: any): Promise<void> {
		if (!payment.customer_subscriptions?.stripe_subscription_id) return;

		try {
			// Cancel in Stripe
			await this.stripeService.cancelSubscription(
				payment.customer_subscriptions.stripe_subscription_id,
				true // immediately
			);

			// Update local records
			await this.supabase
				.from('customer_subscriptions')
				.update({
					status: 'canceled',
					canceled_at: new Date().toISOString(),
					cancellation_reason: 'payment_failed'
				})
				.eq('id', payment.subscription_id);

			// Update user status
			await this.supabase
				.from('users')
				.update({
					subscription_status: 'canceled',
					subscription_plan_id: null
				})
				.eq('id', payment.user_id);

			// Mark payment as resolved (cancelled)
			await this.supabase
				.from('failed_payments')
				.update({
					resolved_at: new Date().toISOString(),
					resolution_type: 'cancelled'
				})
				.eq('id', payment.id);
		} catch (error) {
			console.error('Error cancelling subscription:', error);
		}
	}

	/**
	 * Record a failed payment
	 */
	async recordFailedPayment(data: {
		userId: string;
		subscriptionId: string;
		invoiceId: string;
		amountDue: number;
	}): Promise<void> {
		// Check if we already have this failed payment
		const { data: existing } = await this.supabase
			.from('failed_payments')
			.select('id, retry_count')
			.eq('invoice_id', data.invoiceId)
			.single();

		if (existing) {
			// Update retry count
			await this.supabase
				.from('failed_payments')
				.update({
					retry_count: existing.retry_count + 1,
					last_retry_at: new Date().toISOString()
				})
				.eq('id', existing.id);
		} else {
			// Create new failed payment record
			await this.supabase.from('failed_payments').insert({
				user_id: data.userId,
				subscription_id: data.subscriptionId,
				invoice_id: data.invoiceId,
				amount_due: data.amountDue,
				failed_at: new Date().toISOString(),
				retry_count: 1
			});
		}
	}

	/**
	 * Mark a failed payment as resolved
	 */
	async resolveFailedPayment(
		invoiceId: string,
		resolutionType: 'paid' | 'cancelled'
	): Promise<void> {
		const { data: payment } = await this.supabase
			.from('failed_payments')
			.select('user_id')
			.eq('invoice_id', invoiceId)
			.single();

		if (!payment) return;

		// Update failed payment record
		await this.supabase
			.from('failed_payments')
			.update({
				resolved_at: new Date().toISOString(),
				resolution_type: resolutionType
			})
			.eq('invoice_id', invoiceId);

		// If paid, restore access
		if (resolutionType === 'paid') {
			await this.supabase
				.from('users')
				.update({
					subscription_status: 'active',
					access_restricted: false,
					access_restricted_at: null
				})
				.eq('id', payment.user_id);

			// Remove any payment warnings
			await this.supabase
				.from('user_notifications')
				.delete()
				.eq('user_id', payment.user_id)
				.eq('type', 'payment_warning');
		}
	}

	/**
	 * Get failed payments for a user
	 */
	async getUserFailedPayments(userId: string): Promise<FailedPayment[]> {
		const { data, error } = await this.supabase
			.from('failed_payments')
			.select('*')
			.eq('user_id', userId)
			.order('failed_at', { ascending: false });

		if (error) {
			console.error('Error fetching user failed payments:', error);
			return [];
		}

		return data || [];
	}

	/**
	 * Check if user has active failed payments
	 */
	async hasActiveFailedPayments(userId: string): Promise<boolean> {
		const { data } = await this.supabase
			.from('failed_payments')
			.select('id')
			.eq('user_id', userId)
			.is('resolved_at', null)
			.limit(1);

		return (data?.length ?? 0) > 0;
	}
}
