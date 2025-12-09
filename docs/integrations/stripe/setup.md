<!-- docs/integrations/stripe/setup.md -->

# Stripe Integration Setup Guide

This guide will help you set up Stripe payments for Build OS, including local testing and production deployment.

## Prerequisites

- Stripe account (sign up at https://stripe.com)
- Build OS development environment set up
- Supabase project configured

## 1. Stripe Dashboard Setup

### Create Your Product and Price

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Products** → **Add Product**
3. Create a product:
    - Name: `Build OS Pro`
    - Description: `Full access to Build OS with unlimited projects and AI features`
4. Add a price:
    - Pricing model: `Standard pricing`
    - Price: `$20.00`
    - Billing period: `Monthly`
5. Save the price ID (starts with `price_`) - you'll need this later

### Set Up Webhooks

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. For local development:
    - Use [Stripe CLI](https://stripe.com/docs/stripe-cli) for webhook forwarding
    - Endpoint URL will be provided by Stripe CLI
4. For production:
    - Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
5. Select events to listen to:
    - `checkout.session.completed`
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_succeeded`
    - `invoice.payment_failed`
6. Save the webhook signing secret

## 2. Environment Configuration

Add these variables to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # Your test/live secret key
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... # Your test/live publishable key
STRIPE_WEBHOOK_SECRET=whsec_... # Your webhook signing secret
STRIPE_PRICE_ID=price_... # The price ID you created
ENABLE_STRIPE=false # Set to true when ready to enable payments

# Optional: Customer Portal
STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_...
```

## 3. Database Setup

Run the Stripe migration:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the migration
psql -h your-db-host -U postgres -d postgres -f supabase/migrations/20241218_stripe_integration.sql
```

Update the subscription plan with your actual Stripe price ID:

```sql
UPDATE subscription_plans
SET stripe_price_id = 'price_YOUR_ACTUAL_PRICE_ID'
WHERE stripe_price_id = 'price_placeholder';
```

## 4. Local Development Setup

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop install stripe

# Or download from https://stripe.com/docs/stripe-cli
```

### Start Webhook Forwarding

```bash
# Login to Stripe CLI
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:5173/api/stripe/webhook

# Copy the webhook signing secret shown and update your .env
```

### Test Card Numbers

Use these test cards for development:

- Success: `4242 4242 4242 4242`
- Requires authentication: `4000 0025 0000 3155`
- Declined: `4000 0000 0000 9995`

## 5. Code Implementation

The Stripe integration includes:

- `/api/stripe/checkout` - Create checkout sessions
- `/api/stripe/webhook` - Handle Stripe events
- `/api/stripe/portal` - Customer portal access
- `/lib/services/stripe-service.ts` - Stripe utility functions

### Feature Toggle

The payment system is controlled by the `ENABLE_STRIPE` environment variable:

```typescript
// In your auth/signup flow
if (process.env.ENABLE_STRIPE === 'true') {
	// Redirect to pricing page after signup
} else {
	// Continue with free access
}
```

## 6. Beta User Discounts

### Creating Discount Codes

```sql
-- Create a beta user discount (50% off forever)
INSERT INTO discount_codes (
    code,
    stripe_coupon_id, -- Create in Stripe Dashboard first
    description,
    discount_type,
    discount_value,
    duration
) VALUES (
    'BETA50',
    'coupon_xxx', -- Your Stripe coupon ID
    'Beta user 50% discount',
    'percentage',
    50,
    'forever'
);

-- Create early bird discount (20% off for 3 months)
INSERT INTO discount_codes (
    code,
    description,
    discount_type,
    discount_value,
    duration,
    duration_in_months
) VALUES (
    'EARLY20',
    'Early bird 20% discount',
    'percentage',
    20,
    'repeating',
    3
);
```

### Applying Discounts

Discounts can be applied:

1. During checkout with a coupon code
2. Automatically for specific user emails
3. Via admin panel (to be implemented)

## 7. Testing Checklist

- [ ] User can view pricing page when Stripe is enabled
- [ ] Checkout session creates successfully
- [ ] Payment processes correctly
- [ ] Subscription is created in database
- [ ] User gains access to pro features
- [ ] Webhook events are received and processed
- [ ] Customer can access billing portal
- [ ] Subscription cancellation works
- [ ] Discount codes apply correctly

## 8. Production Deployment

1. Switch to live Stripe keys in production `.env`
2. Update webhook endpoint in Stripe Dashboard
3. Create production price in Stripe
4. Update database with production price ID
5. Set `ENABLE_STRIPE=true`
6. Configure customer portal in Stripe

## 9. Monitoring

### Stripe Dashboard

- Monitor successful payments
- Check failed payments
- Review subscription metrics

### Application Logs

- Watch for webhook failures
- Monitor checkout session creation
- Track subscription status changes

### Database Queries

```sql
-- Active subscriptions
SELECT COUNT(*) FROM customer_subscriptions
WHERE status = 'active';

-- Revenue this month
SELECT SUM(amount_paid) FROM invoices
WHERE created_at >= date_trunc('month', CURRENT_DATE);

-- Beta users
SELECT u.email, ud.applied_at
FROM user_discounts ud
JOIN users u ON u.id = ud.user_id
JOIN discount_codes dc ON dc.id = ud.discount_code_id
WHERE dc.metadata->>'type' = 'beta_user';
```

## 10. Troubleshooting

### Common Issues

1. **Webhook signature verification fails**
    - Ensure webhook secret is correct
    - Check request body is raw (not parsed)

2. **Checkout session won't create**
    - Verify price ID exists in Stripe
    - Check API keys are correct

3. **Subscription not activating**
    - Check webhook events are being received
    - Verify database triggers are working

### Debug Mode

Set these for detailed logging:

```env
STRIPE_DEBUG=true
LOG_LEVEL=debug
```

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Build OS Issues: https://github.com/yourusername/build-os/issues
