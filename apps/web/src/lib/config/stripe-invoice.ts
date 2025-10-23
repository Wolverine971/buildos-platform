// apps/web/src/lib/config/stripe-invoice.ts

/**
 * Stripe Invoice & Branding Configuration
 *
 * This configuration is used for:
 * 1. Invoice customization (when generating invoices)
 * 2. Reference for Stripe Dashboard branding setup
 *
 * To apply branding in Stripe:
 * 1. Go to Stripe Dashboard > Settings > Branding
 * 2. Upload the assets and colors defined below
 * 3. Configure customer portal and checkout appearance
 */
export const INVOICE_CONFIG = {
	// ============================================================
	// STRIPE BRANDING CONFIGURATION
	// Configure these in: Stripe Dashboard > Settings > Branding
	// ============================================================

	stripeBranding: {
		// Brand Icon (Favicon)
		// Upload in: Settings > Branding > Icon
		// Requirements: Square image, recommended 32x32 or 64x64 pixels
		// Format: PNG or SVG recommended
		icon: {
			path: '/favicon-32x32.png', // TODO: Upload your icon file
			description: 'BuildOS icon for browser tabs and small displays'
		},

		// Brand Logo
		// Upload in: Settings > Branding > Logo
		// Requirements: Recommended 280x80 pixels (or maintain similar aspect ratio)
		// Format: PNG or SVG, transparent background recommended
		// Used in: Checkout, invoices, customer portal, email receipts
		logo: {
			path: '/s-brain-bolt.png', // TODO: Upload your logo file
			description: 'BuildOS logo for checkout and invoices',
			darkModePath: '/s-brain-bolt.png' // Optional: logo for dark backgrounds
		},

		// Brand Colors
		// Configure in: Settings > Branding > Colors
		colors: {
			// Primary brand color
			// Used for: Buttons, links, and primary actions in checkout
			brandColor: '#525f7f', // TODO: Replace with your brand color (hex)

			// Accent color
			// Used for: Secondary elements, hover states, and highlights
			accentColor: '#0074d4', // TODO: Replace with your accent color (hex)

			// Additional color suggestions for consistency
			success: '#10b981', // For success states
			warning: '#f59e0b', // For warning states
			error: '#ef4444', // For error states
			info: '#3b82f6' // For info states
		},

		// Custom Domain
		// Configure in: Settings > Branding > Domains
		// Allows checkout and payment links to use your domain
		customDomain: {
			enabled: false, // TODO: Set to true when ready
			domain: 'pay.build-os.com' // TODO: Your custom subdomain
			// Setup steps:
			// 1. Add CNAME record pointing to 'checkout.stripe.com'
			// 2. Verify domain in Stripe Dashboard
			// 3. Enable for checkout and payment links
		}
	},

	// ============================================================
	// BUSINESS DETAILS (for invoices and receipts)
	// ============================================================

	// Business details
	businessName: 'BuildOS',
	businessAddress: {
		line1: '7928 Darien Drive', // TODO: Update with real address
		city: 'Glen Burnie',
		state: 'MD',
		postal_code: '21061',
		country: 'US'
	},
	businessEmail: 'dj@build-os.com',
	businessPhone: '+1 (410) 980-0852', // TODO: Update with real phone
	taxId: 'EIN: 12-3456789', // TODO: Replace with actual tax ID

	// Optional: Additional business details
	businessWebsite: 'https://build-os.com',
	supportEmail: 'support@build-os.com',
	supportUrl: 'https://build-os.com/support',

	// ============================================================
	// INVOICE CUSTOMIZATION
	// ============================================================

	// Invoice settings
	invoicePrefix: 'BLDOS',
	startingInvoiceNumber: 1000,

	// Footer text for invoices and receipts
	footerText: 'Thank you for choosing BuildOS! For support, contact support@build-os.com',

	// Additional footer sections (optional)
	footerSections: {
		legal: 'BuildOS is a registered trademark. All rights reserved.',
		refundPolicy: 'Full refund within 14 days of purchase. See terms for details.',
		privacyNotice:
			'Your privacy is important to us. View our privacy policy at build-os.com/privacy'
	},

	// ============================================================
	// COMMUNICATION TEMPLATES
	// ============================================================

	// Memo text templates for different transaction types
	memoTemplates: {
		subscription: 'Subscription to BuildOS Pro Plan',
		trial: 'Trial period for BuildOS Pro Plan',
		refund: 'Refund processed for BuildOS subscription',
		failed: 'Payment failed - please update your payment method',
		upgrade: 'Upgrade to BuildOS Pro Plan',
		downgrade: 'Plan change for BuildOS subscription',
		renewal: 'Renewal of BuildOS Pro Plan subscription'
	},

	// Email subject lines (for custom email integration)
	emailSubjects: {
		welcome: 'Welcome to BuildOS Pro!',
		paymentSuccess: 'Payment Confirmation - BuildOS',
		paymentFailed: 'Payment Failed - Action Required',
		trialExpiring: 'Your BuildOS Trial is Ending Soon',
		subscriptionCancelled: "Subscription Cancelled - We'll Miss You",
		invoiceReady: 'Your BuildOS Invoice is Ready'
	},

	// ============================================================
	// TERMS & POLICIES
	// ============================================================

	// Payment terms
	paymentTerms: 'Payment due upon receipt. Subscription will auto-renew unless cancelled.',

	// Late payment terms
	latePaymentTerms:
		'A grace period of 7 days is provided for failed payments before service suspension.',

	// Cancellation policy
	cancellationPolicy: 'Cancel anytime. Access continues until the end of your billing period.',

	// Refund policy
	refundPolicy:
		'Full refund if cancelled within 14 days of initial purchase. No refunds for renewals.'
};
