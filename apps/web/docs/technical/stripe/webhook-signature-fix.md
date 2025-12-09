<!-- apps/web/docs/technical/stripe/webhook-signature-fix.md -->

# Stripe Webhook Signature Verification Fix

## Problem

Getting error: `No signatures found matching the expected signature for payload`

## Root Causes & Solutions

### 1. **Using Wrong Webhook Secret (Most Common)**

#### For Local Development with Stripe CLI:

When testing locally, you must use the webhook secret from Stripe CLI, NOT from your Stripe Dashboard.

**Steps:**

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:5173/api/stripe/webhook
```

4. **IMPORTANT**: Copy the webhook signing secret shown (starts with `whsec_`)
5. Update your `.env` file:

```env
STRIPE_WEBHOOK_SECRET=whsec_[the_secret_from_stripe_cli]
```

#### For Production/Deployed Environment:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click on your webhook endpoint
3. Click "Reveal" under "Signing secret"
4. Copy the secret (starts with `whsec_`)
5. Update your environment variable

### 2. **Test Mode vs Live Mode Mismatch**

Make sure you're using:

- **Test mode** webhook secret with **test mode** API keys
- **Live mode** webhook secret with **live mode** API keys

Check your Stripe Dashboard mode toggle (Test/Live) matches your environment.

### 3. **The Code is Correct**

Your webhook handler code is correct:

```typescript
const body = await request.text(); // ✅ Correct - gets raw body
const signature = request.headers.get('stripe-signature'); // ✅ Correct
```

This is the proper way to handle Stripe webhooks in SvelteKit.

## How to Debug

I've added debug logging to your webhook handler. When a webhook comes in, check your console for:

- Webhook secret prefix (should start with `whsec_`)
- Body length and content
- Signature header presence

## Quick Troubleshooting Steps

1. **Verify your webhook secret**:
    - For local dev: Use secret from `stripe listen` command
    - For production: Use secret from Stripe Dashboard webhook endpoint

2. **Check environment variables are loaded**:

```bash
# In your terminal where you run the dev server
echo $STRIPE_WEBHOOK_SECRET
```

If empty, make sure your `.env` file is properly loaded.

3. **Restart your dev server** after changing `.env`:

```bash
pkill -f node
pnpm dev
```

4. **For local testing with Stripe CLI**:

```bash
# Terminal 1 - Start your app
pnpm dev

# Terminal 2 - Forward webhooks
stripe listen --forward-to localhost:5173/api/stripe/webhook

# Copy the webhook secret shown and update .env
# Then restart your dev server
```

5. **Test with Stripe CLI**:

```bash
# Trigger a test event
stripe trigger checkout.session.completed
```

## Common Mistakes to Avoid

❌ **DON'T** use your API secret key as webhook secret
❌ **DON'T** use Dashboard webhook secret when testing with Stripe CLI
❌ **DON'T** modify the request body before signature verification
❌ **DON'T** use JSON.parse() on the body before verification

✅ **DO** use the exact webhook secret from Stripe CLI when testing locally
✅ **DO** use request.text() to get the raw body
✅ **DO** restart your server after changing environment variables

## Environment Variable Setup

Your `.env` file should have:

```env
# For local development with Stripe CLI
STRIPE_WEBHOOK_SECRET=whsec_[secret_from_stripe_cli]

# For production (from Stripe Dashboard)
# STRIPE_WEBHOOK_SECRET=whsec_[secret_from_dashboard_webhook_endpoint]
```

## Testing Webhooks Locally

### Option 1: Stripe CLI (Recommended)

```bash
stripe listen --forward-to localhost:5173/api/stripe/webhook
```

### Option 2: ngrok

```bash
ngrok http 5173
# Use the ngrok URL as your webhook endpoint in Stripe Dashboard
```

## Removing Debug Logs

Once fixed, remove the debug logs from `/src/routes/api/stripe/webhook/+server.ts`:

- Lines 30-35: Debug logging
- Line 43-44: Extra error logging

## References

- [Stripe Webhook Documentation](https://stripe.com/docs/webhooks/signatures)
- [SvelteKit Request Handling](https://kit.svelte.dev/docs/web-standards#fetch-apis-request)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
