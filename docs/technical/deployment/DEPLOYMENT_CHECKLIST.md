# Build OS - Production Deployment Checklist

**Target**: Vercel Production Deployment
**Database**: Supabase
**Payment Processing**: Stripe (Optional)
**Status**: Ready for Production 🚀

## 🔧 Pre-Deployment Setup

### 1. Environment Variables Configuration

#### Required for Basic Operation

```env
# Supabase Configuration
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your_anon_key
PRIVATE_SUPABASE_SERVICE_KEY=your_service_role_key

# Google OAuth (for authentication)
PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Application Security
PRIVATE_CRON_SECRET=generate_random_32_char_string

# Optional AI Features
OPENAI_API_KEY=sk-your_openai_key (optional)
```

#### Stripe Configuration (When Ready)

```env
# Stripe Payment Processing
ENABLE_STRIPE=false  # Set to true when ready to accept payments
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
```

### 2. Generate Required Secrets

```bash
# Generate CRON_SECRET
openssl rand -base64 32

# Example output: 8kF2mN9pQ7vR1sL4tX6wE3zY0uI5oA8c
```

## 🗄️ Database Setup

### 1. Run Migrations in Order

Execute these SQL files in Supabase SQL Editor:

```sql
-- 1. Core Stripe tables (safe to run even if Stripe disabled)
-- File: supabase/migrations/20241218_stripe_integration.sql

-- 2. Revenue tracking functions
-- File: supabase/migrations/20241218_subscription_analytics.sql

-- 3. Payment failure handling
-- File: supabase/migrations/20241219_dunning_system.sql

-- 4. Trial system implementation
-- File: supabase/migrations/20241220_trial_system.sql
```

### 2. Verify Migration Success

```sql
-- Check that all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'subscription_plans',
  'customer_subscriptions',
  'trial_reminders',
  'failed_payments'
);

-- Should return 4 rows
```

### 3. Create Initial Data

```sql
-- Insert basic subscription plan
INSERT INTO subscription_plans (
  name,
  stripe_price_id,
  price_cents,
  billing_interval,
  features
) VALUES (
  'Pro',
  'price_your_stripe_price_id', -- Update when Stripe enabled
  2000, -- $20.00
  'month',
  '["unlimited_projects", "ai_features", "calendar_sync", "priority_support"]'::jsonb
);
```

## 🚀 Vercel Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Link Project

```bash
# In your project directory
vercel link

# Follow prompts to link to existing project or create new one
```

### 3. Set Environment Variables

```bash
# Set each environment variable
vercel env add PUBLIC_SUPABASE_URL
vercel env add PUBLIC_SUPABASE_ANON_KEY
vercel env add PRIVATE_SUPABASE_SERVICE_KEY
vercel env add PUBLIC_GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add PRIVATE_CRON_SECRET

# Optional: Add Stripe variables (even if disabled)
vercel env add ENABLE_STRIPE
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add PUBLIC_STRIPE_PUBLISHABLE_KEY

# Optional: Add AI features
vercel env add OPENAI_API_KEY
```

### 4. Deploy to Production

```bash
# Deploy to production
vercel --prod

# Your app will be available at: https://your-app.vercel.app
```

## 🔗 External Service Configuration

### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Enable Google+ API and Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
    ```
    https://your-project.supabase.co/auth/v1/callback
    https://your-app.vercel.app/auth/google/callback
    https://your-app.vercel.app/auth/google/register-callback
    ```

### 2. Supabase Configuration

1. **Auth Settings**:
    - Enable Google OAuth provider
    - Add Google Client ID and Secret
    - Set site URL: `https://your-app.vercel.app`
    - Add redirect URLs for auth flows

2. **Database Settings**:
    - Ensure Row Level Security is enabled
    - Verify connection pooling is configured
    - Check that all functions have proper permissions

### 3. Stripe Setup (When Enabling Payments)

1. **Create Products and Prices**:

    ```bash
    # Create product
    stripe products create --name "Build OS Pro" --description "Personal productivity operating system"

    # Create price
    stripe prices create --unit-amount 2000 --currency usd --product prod_XXXXXX --recurring-interval month
    ```

2. **Configure Webhooks**:
    - Endpoint: `https://your-app.vercel.app/api/stripe/webhook`
    - Events to track:
        - `invoice.payment_failed`
        - `invoice.payment_succeeded`
        - `customer.subscription.updated`
        - `customer.subscription.deleted`
        - `customer.subscription.created`

3. **Update Database**:
    ```sql
    UPDATE subscription_plans
    SET stripe_price_id = 'price_XXXXXX'
    WHERE name = 'Pro';
    ```

## ✅ Post-Deployment Verification

### 1. Basic Functionality Tests

- [ ] Homepage loads correctly
- [ ] User registration works
- [ ] Google OAuth login functions
- [ ] Trial assignment happens automatically
- [ ] Dashboard displays user data
- [ ] Project creation works
- [ ] Brain dump feature operational

### 2. Trial System Tests

- [ ] New user gets 14-day trial
- [ ] Trial banner displays correctly
- [ ] Trial countdown works
- [ ] Pricing page shows trial status
- [ ] Read-only mode enforces restrictions

### 3. Cron Job Verification

```bash
# Test dunning cron endpoint
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/dunning

# Test trial reminders
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-app.vercel.app/api/cron/trial-reminders
```

### 4. Database Health Check

```sql
-- Verify RLS is working
SELECT * FROM projects; -- Should only show your projects

-- Check trial system
SELECT count(*) FROM users WHERE subscription_status = 'trialing';

-- Verify indexes exist
\d+ projects; -- Should show indexes
```

## 📊 Monitoring Setup

### 1. Add Error Tracking (Recommended)

```bash
npm install @sentry/sveltekit
```

```typescript
// src/hooks.client.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: 'YOUR_SENTRY_DSN',
	integrations: [new Sentry.BrowserTracing()],
	tracesSampleRate: 0.1 // 10% sampling for performance
});
```

### 2. Analytics Setup (Optional)

```html
<!-- In app.html -->
<script defer data-domain="your-domain.com" src="https://plausible.io/js/script.js"></script>
```

### 3. Vercel Analytics

Enable in Vercel dashboard:

- Web Analytics for page views
- Speed Insights for performance
- Function logs for debugging

## 🔒 Security Checklist

### Application Security

- [ ] All environment variables are set to production values
- [ ] No development API keys in production
- [ ] HTTPS enforced (automatic with Vercel)
- [ ] Supabase RLS policies enabled
- [ ] Authentication required for protected routes

### Database Security

- [ ] Service role key is secure and not exposed
- [ ] Row Level Security enabled on all tables
- [ ] No public access to sensitive data
- [ ] Backup strategy configured in Supabase

### Payment Security (When Enabled)

- [ ] Stripe webhook signature verification implemented
- [ ] Live API keys configured (not test keys)
- [ ] PCI compliance considerations addressed
- [ ] Payment data never stored locally

## 🚨 Rollback Plan

### If Deployment Issues Occur

1. **Quick rollback**:

    ```bash
    vercel rollback
    ```

2. **Database rollback** (if needed):

    ```sql
    -- Only if catastrophic issues
    -- Backup data first, then rollback migrations
    ```

3. **Disable new features**:
    ```bash
    vercel env add ENABLE_STRIPE false
    vercel --prod
    ```

## 📞 Support Information

### Monitoring Endpoints

- **Health Check**: `https://your-app.vercel.app/api/health`
- **Cron Status**: Check Vercel function logs
- **Database Status**: Supabase dashboard

### Key Metrics to Watch

- User registration rate
- Trial conversion rate
- Error rate in Sentry
- Database connection count
- Function execution time

### Emergency Contacts

- **Database Issues**: Supabase support
- **Payment Issues**: Stripe support
- **Hosting Issues**: Vercel support
- **Domain Issues**: Your domain provider

---

## 🎉 Launch Checklist

### Pre-Launch (Final 24 Hours)

- [ ] All environment variables verified
- [ ] Database migrations successful
- [ ] Trial system tested end-to-end
- [ ] Monitoring and alerts configured
- [ ] Backup strategy verified
- [ ] SSL certificate valid

### Launch Day

- [ ] Deploy to production
- [ ] Verify all core functionality
- [ ] Monitor error rates
- [ ] Test user registration flow
- [ ] Confirm cron jobs running
- [ ] Share with beta users

### Post-Launch (First Week)

- [ ] Monitor user feedback
- [ ] Track conversion metrics
- [ ] Optimize performance issues
- [ ] Plan next feature releases
- [ ] Document lessons learned

**Ready for launch! 🚀**
