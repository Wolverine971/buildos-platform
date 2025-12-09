<!-- apps/web/docs/technical/stripe/invoice-creation-fix.md -->

# Stripe Invoice Creation Fix - Complete Solution

## Issues Fixed

**Date:** 2025-10-22
**Errors:**

1. `StripeInvalidRequestError: You can only enable invoice creation when mode is set to payment`
2. `StripeInvalidRequestError: Received unknown parameters: custom_fields, footer`

## Problem Analysis

### Error 1: invoice_creation with subscription mode

The Stripe checkout session creation was incorrectly using the `invoice_creation` parameter with `mode: 'subscription'`. According to Stripe documentation:

- `invoice_creation` can only be used when `mode` is set to `'payment'`
- Invoices are automatically created when `mode` is `'subscription'`
- The parameter is unsupported when mode is `'setup'`

### Error 2: Invalid invoice_settings parameters

The `subscription_data.invoice_settings` does NOT support `custom_fields` and `footer` parameters. These are not valid fields for subscription invoice settings in checkout sessions.

## Complete Solution

Removed all invalid invoice parameters. For subscription mode, invoices are created automatically by Stripe, and customization must be done differently.

### Before (Incorrect - Multiple Issues)

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  subscription_data: {
    metadata: { ... },
    description: ...
  },
  invoice_creation: {  // ❌ Error 1: Can't use with subscription mode
    enabled: true,
    invoice_data: { ... }
  }
});

// Then attempted fix (still incorrect):
subscription_data: {
  invoice_settings: {
    custom_fields: [...],  // ❌ Error 2: Not valid parameters
    footer: '...'          // ❌ Error 2: Not valid parameters
  }
}
```

### After (Fully Fixed)

```typescript
const session = await stripe.checkout.sessions.create({
	mode: 'subscription',
	subscription_data: {
		metadata: {
			user_id: options.userId,
			...options.metadata
		},
		description: INVOICE_CONFIG.memoTemplates.subscription
		// No invoice_settings with invalid params
	}
	// ... other valid parameters
});
```

## Important Notes

### What Works for Subscription Invoices

1. **Metadata**: Can be added to `subscription_data.metadata`
2. **Description**: Can be set in `subscription_data.description`
3. **Invoice customization**: Must be done through:
    - Stripe Dashboard invoice settings
    - Webhook handlers after invoice creation
    - Customer object updates
    - Direct invoice API calls after creation

### What Doesn't Work

1. **invoice_creation parameter**: Only for `mode: 'payment'`
2. **custom_fields in invoice_settings**: Not supported in checkout session
3. **footer in invoice_settings**: Not supported in checkout session

## Alternative Solutions for Invoice Customization

If you need custom fields or footer on subscription invoices:

1. **Use Webhooks**: Listen for `invoice.created` events and update the invoice:

```typescript
// In webhook handler
if (event.type === 'invoice.created') {
	const invoice = event.data.object;
	await stripe.invoices.update(invoice.id, {
		custom_fields: [{ name: 'Customer ID', value: userId }],
		footer: 'Custom footer text'
	});
}
```

2. **Configure in Stripe Dashboard**: Set default invoice settings for all subscriptions

3. **Use Invoice Finalization Webhook**: Update invoices before they're finalized

## Files Modified

- `/src/lib/services/stripe-service.ts` - Fixed `createCheckoutSession` method
    - Removed invalid `invoice_creation` parameter
    - Removed invalid `invoice_settings.custom_fields` and `invoice_settings.footer`
    - Kept only valid `subscription_data` parameters

## Testing

After this fix:

1. Checkout sessions with subscription mode should create successfully
2. No more `StripeInvalidRequestError` for invoice creation
3. No more `unknown parameters` errors
4. Invoices will still be created automatically by Stripe for subscriptions

## Important for Future Development

If invoice customization is required for subscriptions, implement it via:

1. Webhook handlers for `invoice.created` or `invoice.finalization_failed` events
2. Stripe Dashboard configuration for default invoice settings
3. Customer metadata that can be referenced in invoices

## References

- [Stripe Checkout Sessions API](https://stripe.com/docs/api/checkout/sessions/create)
- [Stripe Subscription Invoice Settings](https://stripe.com/docs/api/checkout/sessions/create#create_checkout_session-subscription_data)
- [Stripe Invoice Customization](https://stripe.com/docs/invoicing/customize)
- [Stripe Checkout Post-Payment Invoices](https://stripe.com/docs/payments/checkout/post-payment-invoices)
