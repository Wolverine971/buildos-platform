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

### For Railway (Worker)

**ALL Variables Need to be Added (Different Names!):**
```bash
# These are SAME values but DIFFERENT names
SUPABASE_URL=<copy from PUBLIC_SUPABASE_URL in Vercel>
SUPABASE_SERVICE_ROLE_KEY=<copy from PRIVATE_SUPABASE_SERVICE_KEY in Vercel>

# Railway specific
NODE_ENV=production
PORT=${{PORT}}  # Railway auto-provides

# Webhook config (for emails)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://YOUR-VERCEL-URL.vercel.app/webhooks/daily-brief-email
BUILDOS_WEBHOOK_SECRET=<same as PRIVATE_BUILDOS_WEBHOOK_SECRET in Vercel>
WEBHOOK_TIMEOUT=30000

# Optional queue settings (can skip - uses defaults)
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10
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
PRIVATE_DJ_GMAIL_APP_PASSWORD
PRIVATE_ZACH_GMAIL_APP_PASSWORD
PRIVATE_CRON_SECRET
PUBLIC_APP_URL
PRIVATE_OPENAI_API_KEY  # Keep as fallback
PRIVATE_ANTHROPIC_API_KEY  # Keep as fallback if you have it
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
- `BUILDOS_WEBHOOK_SECRET` in Railway

## ⚠️ Common Mistakes to Avoid

1. **DON'T use `PUBLIC_SUPABASE_URL` in Railway** - use `SUPABASE_URL`
2. **DON'T use `PRIVATE_SUPABASE_SERVICE_KEY` in Railway** - use `SUPABASE_SERVICE_ROLE_KEY`
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