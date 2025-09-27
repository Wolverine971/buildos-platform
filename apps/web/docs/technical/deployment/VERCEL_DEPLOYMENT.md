# Vercel Deployment Guide

## Environment Variables

Add these environment variables in your Vercel project settings:

### Required Variables

```
# Supabase
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
PRIVATE_SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Google OAuth (if using Google sign-in)
PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Stripe (when ready to enable)
ENABLE_STRIPE=false
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

# Cron Jobs
CRON_SECRET=generate_a_random_secret_here

# Optional
OPENAI_API_KEY=your_openai_api_key
```

### Generate CRON_SECRET

```bash
openssl rand -base64 32
```

## Cron Jobs Setup

The `vercel.json` file configures two cron jobs:

1. **Dunning Process** - Runs daily at 9 AM UTC
    - Processes failed payments
    - Sends payment retry notifications
    - Updates subscription statuses

2. **Trial Reminders** - Runs daily at 10 AM UTC
    - Sends trial expiration warnings
    - Creates in-app notifications
    - Tracks reminder history

### Vercel Cron Limitations

- **Hobby Plan**:
    - Maximum 2 cron jobs
    - Runs once per day only
    - Perfect for this setup

- **Pro Plan**:
    - Unlimited cron jobs
    - Minimum 1-hour interval
    - Can add more frequent checks

## Deployment Steps

1. **Install Vercel CLI**

    ```bash
    npm i -g vercel
    ```

2. **Link your project**

    ```bash
    vercel link
    ```

3. **Set environment variables**

    ```bash
    vercel env add PRIVATE_CRON_SECRET
    vercel env add STRIPE_SECRET_KEY
    # Add all other variables...
    ```

4. **Deploy**
    ```bash
    vercel --prod
    ```

## Testing Cron Jobs Locally

You can test cron endpoints locally:

```bash
# Test dunning cron
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:5173/api/cron/dunning

# Test trial reminders
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:5173/api/cron/trial-reminders
```

## Monitoring

1. **Vercel Dashboard**
    - View cron execution logs
    - Check function invocations
    - Monitor errors

2. **Database Logs**
    - Check `cron_logs` table for execution history
    - Monitor `trial_reminders` for sent notifications
    - Track `failed_payments` for dunning process

## Stripe Webhooks on Vercel

When you enable Stripe:

1. Set webhook endpoint in Stripe Dashboard:

    ```
    https://your-app.vercel.app/api/stripe/webhook
    ```

2. Configure webhook to listen for:
    - `invoice.payment_failed`
    - `invoice.payment_succeeded`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`

3. Add webhook secret to Vercel env:
    ```bash
    vercel env add STRIPE_WEBHOOK_SECRET
    ```

## Important Notes

- Vercel cron jobs have a 10-second timeout by default
- Functions have a 10-second timeout on Hobby, 60 seconds on Pro
- Consider using Vercel KV or Upstash for rate limiting if needed
- Monitor your Supabase connection pool limits

## Alternative: External Cron Services

If you need more control over cron timing:

1. **Cron-job.org** (free)
2. **EasyCron** (free tier available)
3. **Upstash QStash** (serverless cron)
4. **GitHub Actions** (scheduled workflows)

These can call your Vercel endpoints with the proper authorization header.
