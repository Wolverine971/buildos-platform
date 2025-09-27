# Vercel Deployment Instructions - Updating to Monorepo

## Step-by-Step Instructions

### 1. Go to Your Vercel Dashboard

Navigate to: https://vercel.com/dashboard

### 2. Find Your Existing BuildOS Project

Click on your existing BuildOS web app project

### 3. Update Git Repository

1. Go to **Settings** tab
2. Scroll to **Git** section
3. Click **Disconnect** next to your current repository
4. Click **Connect Git Repository**
5. Select `Wolverine971/buildos-platform` (your new monorepo)
6. Click **Import**

### 4. Update Build & Output Settings

Go to **Settings** → **General** and update:

```
Framework Preset: SvelteKit
Root Directory: ./  (leave empty or set to ./)
```

### 5. Update Build Commands

Still in **Settings** → **General**, scroll to **Build & Development Settings**:

**IMPORTANT:** Either disable the "Override" toggles OR update these settings:

```
Build Command: pnpm turbo build --filter=@buildos/web
Output Directory: apps/web/.vercel/output
Install Command: pnpm install --frozen-lockfile
```

⚠️ **CRITICAL:** The Output Directory MUST be `apps/web/.vercel/output` (not `.svelte-kit`)
This is where the SvelteKit Vercel adapter outputs the final deployment files.

### 6. Environment Variables to ADD/UPDATE

Go to **Settings** → **Environment Variables**

**NEW Variables You Might Need to Add:**

<!-- PUBLIC_RAILWAY_WORKER_URL=http://localhost:3001
# PUBLIC_RAILWAY_WORKER_URL=https://daily-brief-worker-production.up.railway.app
PUBLIC_RAILWAY_WORKER_URL_PRODUCTION=https://daily-brief-worker-production.up.railway.app -->

```bash
# If not already present: already added
PUBLIC_RAILWAY_WORKER_URL=https://buildos-worker.up.railway.app
PUBLIC_BRIEF_POLLING_INTERVAL=5000
PUBLIC_BRIEF_MAX_POLLING_TIME=300000
PRIVATE_BUILDOS_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>

# If using OpenRouter as primary:
PRIVATE_OPENROUTER_API_KEY=sk-or-YOUR_KEY_HERE
```

**Variables That Should Already Exist (No Change Needed):**

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
```

**Optional Stripe Variables (If Using Payments):**

```bash
ENABLE_STRIPE
STRIPE_SECRET_KEY
PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
```

### 7. Ignored Build Step

In **Settings** → **Git**, update the **Ignored Build Step**:

```bash
git diff HEAD^ HEAD --quiet -- apps/web packages turbo.json package.json pnpm-lock.yaml
```

This prevents rebuilds when only the worker changes.

### 8. Node.js Version

In **Settings** → **General**, ensure Node.js version is set to:

```
20.x
```

### 9. Redeploy

1. Go back to the **Overview** tab
2. Click on the latest deployment
3. Click the **...** menu → **Redeploy**
4. Or trigger a new deployment by pushing a commit

## Verification Steps

After deployment:

1. Check build logs for any errors
2. Visit your site URL
3. Check browser console for any missing environment variables
4. Test login functionality
5. Verify worker communication at `/briefs` page

## Troubleshooting

### If Build Succeeds But Deployment Hangs:

**This is likely caused by incorrect Output Directory settings!**

1. **In Vercel Dashboard:**
    - Go to Settings → General → Build & Development Settings
    - Check if "Override" is enabled for Output Directory
    - If yes, either:
      a. **Disable the Override toggle** to use vercel.json settings
      b. **Update Output Directory** to `apps/web/.vercel/output`

2. **The hanging happens because:**
    - Build creates files in `/vercel/output`
    - But Vercel looks for them in wrong location (e.g., `.svelte-kit`)
    - No files found = deployment hangs forever

3. **Quick Fix:**
    - In Vercel UI, change Output Directory to: `apps/web/.vercel/output`
    - Redeploy

### If Build Fails:

1. **Error: "Cannot find package '@buildos/shared-types'"**
    - Make sure Install Command is `pnpm install --frozen-lockfile`
    - Ensure Root Directory is set to `./`

2. **Error: "Module '$env/static/private' has no exported member"**
    - You're missing an environment variable
    - Add the missing variable in Settings → Environment Variables

3. **Error: "pnpm: command not found"**
    - Vercel should auto-detect pnpm from package.json
    - If not, contact Vercel support

### If Site Loads But Features Don't Work:

1. **Calendar/OAuth not working:**
    - Verify Google OAuth variables are set
    - Update authorized redirect URIs in Google Console

2. **Worker communication failing:**
    - Check PUBLIC_RAILWAY_WORKER_URL is set correctly
    - Verify worker is deployed and running

3. **Email not sending:**
    - Check email app passwords are set
    - Verify Gmail app passwords are valid

## Important Notes

- The monorepo uses `pnpm` workspaces, so Vercel needs to install from root
- The `vercel.json` in root has the correct settings
- Build output is in `apps/web/.vercel/output` (NOT `.svelte-kit`)
- The SvelteKit Vercel adapter v5+ outputs to `.vercel/output` directory
- All PUBLIC* variables are available in browser, PRIVATE* are server-only

---

Last Updated: 2025-09-27
After updating these settings, your Vercel deployment will use the new monorepo structure.
