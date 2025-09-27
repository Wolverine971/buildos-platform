// src/lib/config/stripe-invoice.ts
export const INVOICE_CONFIG = {
	// Business details
	businessName: 'BuildOS',
	businessAddress: {
		line1: '123 Productivity Lane',
		city: 'San Francisco',
		state: 'CA',
		postal_code: '94105',
		country: 'US'
	},
	businessEmail: 'billing@build-os.com',
	businessPhone: '+1 (555) 123-4567',
	taxId: 'EIN: 12-3456789', // Replace with actual tax ID

	// Invoice settings
	invoicePrefix: 'BLDOS',
	startingInvoiceNumber: 1000,

	// Footer text
	footerText: 'Thank you for choosing BuildOS! For support, contact support@build-os.com',

	// Memo text templates
	memoTemplates: {
		subscription: 'Subscription to BuildOS Pro Plan',
		trial: 'Trial period for BuildOS Pro Plan',
		refund: 'Refund processed for BuildOS subscription',
		failed: 'Payment failed - please update your payment method'
	},

	// Payment terms
	paymentTerms: 'Payment due upon receipt. Subscription will auto-renew unless cancelled.',

	// Late payment terms
	latePaymentTerms:
		'A grace period of 7 days is provided for failed payments before service suspension.'
};
