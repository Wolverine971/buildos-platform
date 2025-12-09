<!-- docs/integrations/stripe/testing-plan.md -->

# Stripe Integration Testing Plan

## Overview

This document outlines the comprehensive testing plan for the Build OS Stripe integration. All tests should be performed in Stripe Test Mode before switching to production.

## Prerequisites

- [ ] Stripe Test Mode account created
- [ ] Test API keys configured in `.env`
- [ ] Stripe CLI installed for webhook testing
- [ ] Test credit cards ready (use Stripe's test card numbers)

## 1. Basic Configuration Tests

### 1.1 Environment Variable Validation

- [ ] Set `ENABLE_STRIPE=true`
- [ ] Verify all Stripe endpoints return proper errors when keys are missing
- [ ] Add test API keys and verify endpoints become active
- [ ] Test with invalid keys and verify error handling

### 1.2 Database Migration Tests

- [ ] Run all migrations on a fresh database
- [ ] Verify all tables created successfully
- [ ] Run migrations again to ensure idempotency
- [ ] Check all foreign key relationships work

## 2. User Flow Tests

### 2.1 New User Registration

- [ ] Register new user with Stripe disabled - verify "free" status
- [ ] Enable Stripe - verify user still has "free" status
- [ ] Verify no payment walls block core functionality

### 2.2 Subscription Purchase Flow

1. **Checkout Process**
    - [ ] Click upgrade button as free user
    - [ ] Verify checkout session creates successfully
    - [ ] Test with card number `4242 4242 4242 4242`
    - [ ] Complete purchase and verify redirect
    - [ ] Check subscription status updates to "active"

2. **Edge Cases**
    - [ ] Test with insufficient funds card: `4000 0000 0000 9995`
    - [ ] Test with declined card: `4000 0000 0000 0002`
    - [ ] Test canceling checkout midway
    - [ ] Test browser back button during checkout

### 2.3 Customer Portal Tests

- [ ] Access billing portal as subscribed user
- [ ] Update payment method
- [ ] Download invoices
- [ ] Cancel subscription
- [ ] Reactivate canceled subscription

## 3. Webhook Integration Tests

### 3.1 Setup

```bash
# Start webhook forwarding
stripe listen --forward-to localhost:5173/api/stripe/webhook
```

### 3.2 Event Handling Tests

- [ ] `checkout.session.completed` - Verify subscription activation
- [ ] `customer.subscription.updated` - Verify status changes
- [ ] `customer.subscription.deleted` - Verify cancellation handling
- [ ] `invoice.payment_succeeded` - Verify invoice recording
- [ ] `invoice.payment_failed` - Verify dunning process starts

### 3.3 Webhook Security

- [ ] Test with invalid signature - should reject
- [ ] Test replay attacks - should handle idempotently
- [ ] Test out-of-order events - should process correctly

## 4. Payment Failure & Dunning Tests

### 4.1 Failed Payment Simulation

1. Use card `4000 0000 0000 0341` (fails after attachment)
2. Create subscription
3. Wait for next billing cycle
4. Verify:
    - [ ] Failed payment recorded in database
    - [ ] User status changes to "past_due"
    - [ ] Payment warning appears in UI
    - [ ] Email notification sent (check logs)

### 4.2 Dunning Process Timeline

- [ ] Day 0: Initial failure email sent
- [ ] Day 3: First reminder sent
- [ ] Day 7: Warning email + UI warnings
- [ ] Day 10: Access restricted
- [ ] Day 14: Final notice sent
- [ ] Day 21: Subscription canceled

### 4.3 Recovery Tests

- [ ] Update payment method while in dunning
- [ ] Verify access restored immediately
- [ ] Check failed payment marked as resolved
- [ ] Verify warning notifications cleared

## 5. Revenue & Analytics Tests

### 5.1 Revenue Recognition

- [ ] Create multiple test subscriptions
- [ ] Verify MRR calculations correct
- [ ] Test with annual subscriptions - verify monthly allocation
- [ ] Process refunds - verify negative revenue recorded
- [ ] Test proration on plan changes

### 5.2 Admin Dashboard

- [ ] Access `/admin/revenue` as admin user
- [ ] Verify all metrics calculate correctly
- [ ] Test period filters (month/quarter/year)
- [ ] Export revenue report CSV
- [ ] Verify deferred revenue calculations

### 5.3 Invoice Management

- [ ] View invoice history in user profile
- [ ] Download PDF invoices
- [ ] Verify invoice numbering sequence
- [ ] Check business details display correctly

## 6. Security Tests

### 6.1 Access Control

- [ ] Non-admin cannot access revenue pages
- [ ] Users cannot view other users' invoices
- [ ] Webhook endpoint rejects unauthorized requests
- [ ] Customer portal access requires authentication

### 6.2 Data Validation

- [ ] SQL injection attempts in webhook data
- [ ] XSS attempts in invoice metadata
- [ ] Invalid price IDs rejected
- [ ] Duplicate webhook events handled safely

## 7. Performance Tests

### 7.1 Load Testing

- [ ] Create 100 concurrent checkout sessions
- [ ] Process 1000 webhook events rapidly
- [ ] Load revenue page with 10,000 invoices
- [ ] Test dunning process with 500 failed payments

### 7.2 Error Recovery

- [ ] Database connection lost during checkout
- [ ] Stripe API timeout during webhook processing
- [ ] Email service down during dunning
- [ ] Partial webhook processing failure

## 8. Integration Tests

### 8.1 Email Notifications

- [ ] Payment success email
- [ ] Payment failure email series
- [ ] Subscription cancellation email
- [ ] Invoice ready email

### 8.2 Calendar Integration

- [ ] Subscription renewal dates in calendar
- [ ] Payment retry dates during dunning

## 9. Rollback Tests

### 9.1 Feature Toggle

- [ ] Disable Stripe after subscriptions exist
- [ ] Verify app continues to function
- [ ] Re-enable and verify data intact
- [ ] Test partial rollout scenarios

## 10. Production Readiness Checklist

### Pre-Launch

- [ ] All test scenarios pass
- [ ] Error tracking configured
- [ ] Monitoring alerts set up
- [ ] Backup payment recording system
- [ ] Customer support docs ready

### Launch Day

- [ ] Switch to production keys
- [ ] Test with real card (small amount)
- [ ] Monitor webhook success rate
- [ ] Check error logs frequently
- [ ] Have rollback plan ready

### Post-Launch

- [ ] Daily revenue reconciliation
- [ ] Weekly dunning process review
- [ ] Monthly churn analysis
- [ ] Quarterly security audit

## Test Data Cleanup

```sql
-- Clean test data (TEST MODE ONLY!)
DELETE FROM invoices WHERE created_at < NOW() - INTERVAL '30 days';
DELETE FROM failed_payments WHERE resolved_at IS NOT NULL;
DELETE FROM webhook_events WHERE status = 'processed';
```

## Troubleshooting Guide

### Common Issues

1. **Webhook signature validation fails**
    - Verify STRIPE_WEBHOOK_SECRET matches dashboard
    - Check for extra whitespace in env var

2. **Checkout session won't create**
    - Ensure price_id exists in Stripe
    - Verify customer email is valid
    - Check Stripe API version compatibility

3. **Dunning emails not sending**
    - Verify email service credentials
    - Check email_logs table for errors
    - Ensure cron job is running

## Success Metrics

Track these KPIs during testing:

- Checkout conversion rate > 80%
- Webhook success rate > 99%
- Payment retry success rate > 50%
- Dunning recovery rate > 30%
- Zero security vulnerabilities
- Page load time < 2s for revenue dashboard
