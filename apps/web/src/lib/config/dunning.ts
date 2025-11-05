// apps/web/src/lib/config/dunning.ts

export type EmailTemplateKey =
	| 'payment_failed_initial'
	| 'payment_failed_reminder'
	| 'payment_failed_warning'
	| 'payment_failed_restricted'
	| 'payment_failed_final'
	| 'subscription_cancelled';

export interface DunningStage {
	name: string;
	daysAfterFailure: number;
	emailTemplate: EmailTemplateKey;
	action: 'email' | 'email_and_warn' | 'email_and_restrict' | 'cancel';
	subject: string;
	restrictAccess?: boolean;
}

export const DUNNING_CONFIG: DunningStage[] = [
	{
		name: 'Initial Failure',
		daysAfterFailure: 0,
		emailTemplate: 'payment_failed_initial',
		action: 'email',
		subject: 'Payment Failed - Action Required',
		restrictAccess: false
	},
	{
		name: 'First Reminder',
		daysAfterFailure: 3,
		emailTemplate: 'payment_failed_reminder',
		action: 'email',
		subject: 'Reminder: Update Your Payment Method',
		restrictAccess: false
	},
	{
		name: 'Second Reminder',
		daysAfterFailure: 7,
		emailTemplate: 'payment_failed_warning',
		action: 'email_and_warn',
		subject: 'Warning: Your Access Will Be Restricted Soon',
		restrictAccess: false
	},
	{
		name: 'Access Restriction',
		daysAfterFailure: 10,
		emailTemplate: 'payment_failed_restricted',
		action: 'email_and_restrict',
		subject: 'Access Restricted - Update Payment to Continue',
		restrictAccess: true
	},
	{
		name: 'Final Notice',
		daysAfterFailure: 14,
		emailTemplate: 'payment_failed_final',
		action: 'email',
		subject: 'Final Notice: Subscription Will Be Cancelled',
		restrictAccess: true
	},
	{
		name: 'Cancellation',
		daysAfterFailure: 21,
		emailTemplate: 'subscription_cancelled',
		action: 'cancel',
		subject: 'Subscription Cancelled',
		restrictAccess: true
	}
];

export const GRACE_PERIOD_DAYS = 21; // Total grace period before cancellation

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, { subject: string; body: string }> = {
	payment_failed_initial: {
		subject: 'Payment Failed - Action Required',
		body: `Hi {{name}},

We were unable to process your payment for BuildOS. This can happen for various reasons, such as an expired card or insufficient funds.

To continue enjoying uninterrupted access to BuildOS, please update your payment method:

{{update_payment_link}}

If you need any assistance or have questions about your subscription, please don't hesitate to reach out to our support team.

Best regards,
The BuildOS Team`
	},
	payment_failed_reminder: {
		subject: 'Reminder: Update Your Payment Method',
		body: `Hi {{name}},

This is a friendly reminder that we're still unable to process your payment for BuildOS. 

Your subscription remains active, but we need you to update your payment information to avoid any interruption to your service.

Update your payment method now: {{update_payment_link}}

If you're experiencing any issues or need help, our support team is here to assist you.

Best regards,
The BuildOS Team`
	},
	payment_failed_warning: {
		subject: 'Warning: Your Access Will Be Restricted Soon',
		body: `Hi {{name}},

We've attempted to process your BuildOS payment multiple times without success. 

⚠️ Important: Your access to BuildOS will be restricted in 3 days if payment is not received.

Please update your payment method immediately to avoid any service interruption:

{{update_payment_link}}

If you believe this is an error or need assistance, please contact our support team right away.

Best regards,
The BuildOS Team`
	},
	payment_failed_restricted: {
		subject: 'Access Restricted - Update Payment to Continue',
		body: `Hi {{name}},

Due to payment failure, your access to BuildOS has been restricted. You can still log in to update your payment information, but other features are temporarily unavailable.

To restore full access immediately, please update your payment method:

{{update_payment_link}}

Your data remains safe and will be fully accessible once payment is resolved.

Need help? Contact our support team and we'll assist you right away.

Best regards,
The BuildOS Team`
	},
	payment_failed_final: {
		subject: 'Final Notice: Subscription Will Be Cancelled',
		body: `Hi {{name}},

This is your final notice. Your BuildOS subscription will be permanently cancelled in 7 days if payment is not received.

⚠️ After cancellation:
- You'll lose access to all premium features
- Your data will be retained for 30 days before deletion
- You'll need to create a new subscription to regain access

Update your payment method now to keep your subscription active:

{{update_payment_link}}

We value you as a customer and would hate to see you go. If there's anything we can do to help, please reach out immediately.

Best regards,
The BuildOS Team`
	},
	subscription_cancelled: {
		subject: 'Subscription Cancelled',
		body: `Hi {{name}},

Your BuildOS subscription has been cancelled due to payment failure.

Your data will be retained for 30 days. If you'd like to reactivate your subscription during this period, you can do so by visiting:

{{reactivate_link}}

After 30 days, your data will be permanently deleted in accordance with our data retention policy.

If you have any questions or would like to export your data, please contact our support team.

We're sorry to see you go and hope to welcome you back in the future.

Best regards,
The BuildOS Team`
	}
};
