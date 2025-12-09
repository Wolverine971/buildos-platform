<!-- docs/integrations/stripe/implementation-checklist.md -->

# Stripe Implementation Checklist

## Phase 1: Initial Setup ✅

### Database Preparation

- [x] Create Stripe integration migration file
- [x] Add subscription_plans table
- [x] Add customer_subscriptions table
- [x] Add payment_methods table
- [x] Add invoices table
- [x] Add failed_payments table
- [x] Add webhook_events table
- [x] Add user_notifications table
- [x] Add email_logs table
- [x] Extend users table with Stripe fields
- [x] Create revenue analytics functions
- [x] Add all necessary indexes

### Code Implementation

- [x] Create StripeService class
- [x] Implement webhook handlers
- [x] Create checkout session endpoint
- [x] Create customer portal endpoint
- [x] Build invoice download endpoint
- [x] Implement dunning service
- [x] Create email service placeholder
- [x] Add payment warning UI component
- [x] Build revenue recognition admin page
- [x] Add invoice display to user profile
- [x] Create dunning cron endpoint

### Configuration Files

- [x] Create stripe-invoice.ts config
- [x] Create dunning.ts config
- [x] Update .env.example with Stripe vars
- [x] Add PRIVATE_PRIVATE_CRON_SECRET to environment

## Phase 2: Stripe Dashboard Setup 🚧

### Account Configuration

- [ ] Create Stripe account (if not exists)
- [ ] Complete business profile
- [ ] Set up tax settings
- [ ] Configure invoice settings
- [ ] Set business name and address
- [ ] Upload business logo

### Product Setup

- [ ] Create "Build OS Pro" product
- [ ] Set up monthly price ($20/month)
- [ ] Set up annual price (if offering)
- [ ] Configure trial period (if any)
- [ ] Set up tax rates

### Webhook Configuration

- [ ] Add webhook endpoint URL: `https://[your-domain]/api/stripe/webhook`
- [ ] Select events to listen for:
    - [ ] checkout.session.completed
    - [ ] customer.subscription.created
    - [ ] customer.subscription.updated
    - [ ] customer.subscription.deleted
    - [ ] invoice.payment_succeeded
    - [ ] invoice.payment_failed
    - [ ] invoice.created
    - [ ] invoice.finalized
- [ ] Copy webhook signing secret

### Payment Methods

- [ ] Enable card payments
- [ ] Configure payment method settings
- [ ] Set up fraud prevention rules
- [ ] Configure 3D Secure settings

## Phase 3: Environment Configuration 📝

### Development Environment

- [ ] Set ENABLE_STRIPE=true
- [ ] Add STRIPE_SECRET_KEY (test key)
- [ ] Add PUBLIC_STRIPE_PUBLISHABLE_KEY (test key)
- [ ] Add STRIPE_WEBHOOK_SECRET
- [ ] Generate and add PRIVATE_PRIVATE_CRON_SECRET
- [ ] Configure PUBLIC_APP_URL

### Production Environment

- [ ] Set ENABLE_STRIPE=false (initially)
- [ ] Add STRIPE_SECRET_KEY (live key)
- [ ] Add PUBLIC_STRIPE_PUBLISHABLE_KEY (live key)
- [ ] Add STRIPE_WEBHOOK_SECRET (live endpoint)
- [ ] Generate secure PRIVATE_PRIVATE_CRON_SECRET
- [ ] Set correct PUBLIC_APP_URL

## Phase 4: Database Updates 📊

### Update Subscription Plans

```sql
-- Replace placeholder with actual Stripe price ID
UPDATE subscription_plans
SET stripe_price_id = 'price_XXXXXXXXXXXXXX'
WHERE stripe_price_id = 'price_placeholder';
```

### Create Discount Codes (Optional)

```sql
-- Example: 20% off for beta users
INSERT INTO discount_codes (
  code, stripe_coupon_id, description,
  percent_off, valid_until, max_redemptions
) VALUES (
  'BETA20', 'coupon_XXXXX', 'Beta user discount',
  20, '2024-12-31', 100
);
```

## Phase 5: Email Service Setup 📧

### Choose Email Provider

- [ ] SendGrid
- [ ] Resend
- [ ] AWS SES
- [ ] Postmark

### Configure Provider

- [ ] Create account
- [ ] Get API credentials
- [ ] Add to environment variables
- [ ] Update EmailService implementation
- [ ] Verify domain for sending
- [ ] Set up email templates

### Test Email Flows

- [ ] Payment success notification
- [ ] Payment failure series
- [ ] Subscription confirmation
- [ ] Cancellation confirmation

## Phase 6: Cron Job Setup ⏰

### Dunning Process

- [ ] Set up daily cron job for `/api/cron/dunning`
- [ ] Configure authentication with PRIVATE_PRIVATE_CRON_SECRET
- [ ] Set up monitoring/alerts
- [ ] Test cron execution

### Options for Cron

- [ ] Vercel Cron (if using Vercel)
- [ ] GitHub Actions
- [ ] External service (EasyCron, Cron-job.org)
- [ ] Self-hosted cron

## Phase 7: Testing 🧪

### Local Testing

- [ ] Run through complete test plan
- [ ] Test all user flows
- [ ] Verify webhook handling
- [ ] Test payment failures
- [ ] Check dunning process
- [ ] Validate revenue reporting

### Staging Testing

- [ ] Deploy to staging environment
- [ ] Use Stripe test mode
- [ ] Run full test suite
- [ ] Load test webhooks
- [ ] Test with team members

## Phase 8: Monitoring Setup 📊

### Application Monitoring

- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure webhook failure alerts
- [ ] Set up payment failure alerts
- [ ] Monitor dunning success rate
- [ ] Track checkout conversion

### Business Metrics

- [ ] Set up revenue dashboards
- [ ] Configure churn alerts
- [ ] Track MRR growth
- [ ] Monitor failed payment rate
- [ ] Set up daily revenue reports

## Phase 9: Documentation 📚

### Internal Documentation

- [ ] API endpoint documentation
- [ ] Webhook event handling guide
- [ ] Troubleshooting guide
- [ ] Revenue calculation methodology
- [ ] Database schema documentation

### Customer Documentation

- [ ] Billing FAQ
- [ ] How to update payment method
- [ ] How to cancel subscription
- [ ] How to download invoices
- [ ] Refund policy

## Phase 10: Launch Preparation 🚀

### Pre-Launch Checklist

- [ ] All tests passing
- [ ] Backup systems in place
- [ ] Support team trained
- [ ] Rollback plan documented
- [ ] Legal/compliance review complete

### Soft Launch

- [ ] Enable for internal team only
- [ ] Test with real payments (small amounts)
- [ ] Monitor all systems for 48 hours
- [ ] Fix any issues discovered
- [ ] Document lessons learned

### Full Launch

- [ ] Update subscription_plans with production price IDs
- [ ] Set ENABLE_STRIPE=true in production
- [ ] Announce to existing users
- [ ] Monitor closely for first week
- [ ] Celebrate! 🎉

## Phase 11: Post-Launch Tasks 📈

### Immediate (First Week)

- [ ] Daily revenue reconciliation
- [ ] Monitor webhook success rate
- [ ] Check for any failed payments
- [ ] Review customer support tickets
- [ ] Optimize based on user feedback

### Ongoing (Monthly)

- [ ] Review dunning effectiveness
- [ ] Analyze churn patterns
- [ ] Optimize checkout conversion
- [ ] Update pricing if needed
- [ ] Security audit

## Emergency Procedures 🚨

### If Payments Fail

1. Check Stripe dashboard for API errors
2. Verify webhook endpoint is accessible
3. Check database connectivity
4. Review error logs
5. Contact Stripe support if needed

### If Need to Disable

1. Set ENABLE_STRIPE=false
2. Deploy immediately
3. Communicate with affected users
4. Fix issues in test environment
5. Re-enable when resolved

## Contact Information 📞

### Key Contacts

- Stripe Support: support.stripe.com
- Your Payment Lead: [Name/Email]
- Your Tech Lead: [Name/Email]
- On-call Engineer: [Phone]

### Escalation Path

1. Check monitoring alerts
2. Review error logs
3. Contact on-call engineer
4. Escalate to tech lead
5. Contact Stripe support if needed
