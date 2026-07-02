<!-- docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md -->

# Environment Variable Checklist for Deployment

## 🔴 IMPORTANT: Variables You MUST Add/Update

### For Vercel (Web App)

**NEW Variables to ADD:**

```bash
PUBLIC_RAILWAY_WORKER_URL=https://buildos-worker.up.railway.app  # After you get Railway URL
PUBLIC_BRIEF_POLLING_INTERVAL=5000
PUBLIC_BRIEF_MAX_POLLING_TIME=300000
PRIVATE_BUILDOS_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>
```

**ADD if Using OpenRouter (Primary AI):**

```bash
PRIVATE_OPENROUTER_API_KEY=sk-or-YOUR_KEY
```

**PostHog Product Analytics (added 2026-07-01):**

```bash
# Project API key from PostHog Settings → Project (public write-only key).
# All capture code no-ops if these are unset.
PUBLIC_POSTHOG_KEY=phc_YOUR_PROJECT_KEY
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### For Railway (Worker)

**ALL Variables Need to be Added (Different Names!):**

```bash
# These are SAME values but DIFFERENT names
PUBLIC_SUPABASE_URL=<copy from PUBLIC_SUPABASE_URL in Vercel>
PRIVATE_SUPABASE_SERVICE_KEY=<copy from PRIVATE_SUPABASE_SERVICE_KEY in Vercel>

# Required once worker Agent Runs can use Google Calendar
PRIVATE_GOOGLE_CLIENT_ID=<copy from PRIVATE_GOOGLE_CLIENT_ID in Vercel>
PRIVATE_GOOGLE_CLIENT_SECRET=<copy from PRIVATE_GOOGLE_CLIENT_SECRET in Vercel>
PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY=<copy from Vercel; must match for existing encrypted tokens>

# Railway specific
NODE_ENV=production
PORT=${{PORT}}  # Railway auto-provides

# Webhook config (for emails)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://YOUR-VERCEL-URL.vercel.app/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=<same as PRIVATE_BUILDOS_WEBHOOK_SECRET in Vercel>
WEBHOOK_TIMEOUT=30000

# Optional queue settings (can skip - uses defaults)
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10

# PostHog product analytics (same values as Vercel; worker fires brief_generated etc.)
PUBLIC_POSTHOG_KEY=<same as PUBLIC_POSTHOG_KEY in Vercel>
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## ✅ Variables That Should Already Exist (No Change)

### In Vercel - Keep These As-Is:

```bash
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
PUBLIC_SUPABASE_PROJECT_ID
PRIVATE_SUPABASE_SERVICE_KEY
PUBLIC_GOOGLE_CLIENT_ID
PRIVATE_GOOGLE_CLIENT_ID
PRIVATE_GOOGLE_CLIENT_SECRET
GOOGLE_CLIENT_SECRET
PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY
PRIVATE_DJ_GMAIL_APP_PASSWORD
PRIVATE_CRON_SECRET
PUBLIC_APP_URL
PRIVATE_OPENAI_API_KEY  # Keep as fallback
```

## 🔄 Order of Operations

1. **First: Deploy to Railway**
    - Get the generated URL (like `buildos-worker.up.railway.app`)

2. **Second: Update Vercel**
    - Add `PUBLIC_RAILWAY_WORKER_URL` with Railway URL
    - Add other new variables

3. **Third: Update Railway**
    - Add `BUILDOS_WEBHOOK_URL` with your Vercel URL

## 🔑 Generate Shared Secret

Generate ONE secret to use in both places:

```bash
openssl rand -hex 32
```

Use this value for:

- `PRIVATE_BUILDOS_WEBHOOK_SECRET` in Vercel
- `PRIVATE_BUILDOS_WEBHOOK_SECRET` in Railway

## ⚠️ Common Mistakes to Avoid

3. **DON'T forget** to set the webhook secret to the SAME value in both places
4. **DON'T skip** adding `PUBLIC_RAILWAY_WORKER_URL` to Vercel

## 🧪 Quick Test After Deployment

1. **Test Railway Health**:

    ```bash
    curl https://buildos-worker.up.railway.app/health
    ```

2. **Test Vercel is Running**:
    - Visit your Vercel URL
    - Check browser console for errors

3. **Test Integration**:
    - Go to `/briefs` page on your web app
    - Try generating a brief
    - Check Railway logs for activity

---

**Summary**: You need to ADD about 4-5 new variables to Vercel and set up ALL variables in Railway (with different names). Most of your existing Vercel variables stay the same.
