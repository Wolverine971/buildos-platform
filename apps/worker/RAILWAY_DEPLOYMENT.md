# Railway Deployment Instructions - Worker Service

## Option A: Creating New Railway Project (Recommended)

### 1. Go to Railway Dashboard

Navigate to: https://railway.app/dashboard

### 2. Create New Project

1. Click **New Project**
2. Select **Deploy from GitHub repo**
3. Choose `Wolverine971/buildos-platform`
4. Click **Deploy Now**

### 3. Configure Service Settings

Once deployed, click on the service card, then go to **Settings**:

#### Service Name

```
buildos-worker
```

#### Root Directory

```
/
```

**IMPORTANT**: Set the root directory to `/` (repository root) - NOT `/apps/worker`. This is required for the monorepo build process to access all packages.

Railway will find and use the `railway.toml` or `nixpacks.toml` configuration files in the repository root. These files are configured specifically for building the worker service with all its dependencies.

**DO NOT manually override the build/start commands** unless absolutely necessary. The configuration files handle:

- Building shared packages (`@buildos/shared-types`, `@buildos/supabase-client`)
- Installing dependencies from the monorepo root
- Using Turbo to orchestrate the build process

If you need to verify the commands being used:

- **Build Command** (from config): `pnpm install --frozen-lockfile && pnpm turbo build --filter=@buildos/worker`
- **Start Command** (from config): `node apps/worker/dist/index.js`

#### Watch Paths (for auto-redeploy)

```
apps/worker/**
packages/**
turbo.json
package.json
pnpm-lock.yaml
```

### 4. Environment Variables

Go to **Variables** tab and add:

**REQUIRED Variables (Different Names from Vercel!):**

```bash
# Supabase (DIFFERENT NAMES than web app!)
SUPABASE_URL=YOUR_SUPABASE_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_KEY_HERE

# Node Environment
NODE_ENV=production
PORT=${{PORT}}  # Railway provides this automatically

# Webhook Configuration (for sending emails via web app)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://YOUR-VERCEL-APP.vercel.app/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE  # Must match the same variable in Vercel
WEBHOOK_TIMEOUT=30000
```

**OPTIONAL Queue Configuration (uses defaults if not set):**

```bash
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10
QUEUE_MAX_RETRIES=3
QUEUE_ENABLE_PROGRESS_TRACKING=true
QUEUE_ENABLE_HEALTH_CHECKS=true
QUEUE_WORKER_TIMEOUT=600000
QUEUE_STALLED_TIMEOUT=600000
QUEUE_STATS_UPDATE_INTERVAL=60000
```

### 5. Generate Public URL

1. Go to **Settings** tab
2. Under **Networking**, click **Generate Domain**
3. Copy the generated URL (should be like: `buildos-worker.up.railway.app`)
4. Add this URL to Vercel as `PUBLIC_RAILWAY_WORKER_URL`

### 6. Health Check Configuration

In **Settings** → **Deploy**:

```
Health Check Path: /health
Health Check Timeout: 30
```

### 7. Deploy

Click **Deploy** button to trigger first deployment

---

## Option B: Updating Existing Railway Project

If you already have a Railway project for the worker:

### 1. Go to Your Existing Project

### 2. Update GitHub Repository

1. Go to **Settings** → **General**
2. Under **Service**, find **Source**
3. Click **Change** next to repository
4. Select `Wolverine971/buildos-platform`

### 3. Update Build Settings

In **Settings** → **Deploy**:

**IMPORTANT**: The project includes `railway.toml` and `nixpacks.toml` configuration files that contain the correct build commands. Railway should automatically use these.

**Verify the Root Directory is set to**: `/` (repository root, NOT `/apps/worker`)

**DO NOT manually override** the build/start commands unless the automatic configuration isn't working. The configuration files ensure dependencies are built correctly.

### 4. Update Environment Variables

**IMPORTANT: Variable names are DIFFERENT from your old setup!**

| Old Variable Name           | New Variable Name |
| --------------------------- | ----------------- |
| `SUPABASE_URL`              | Keep the same     |
| `SUPABASE_SERVICE_ROLE_KEY` | Keep the same     |

**Add these NEW variables:**

```bash
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://YOUR-VERCEL-APP.vercel.app/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=<same value as in Vercel>
```

### 5. Trigger Redeploy

Click **Redeploy** from the latest deployment

---

## Environment Variable Mapping

**CRITICAL: Railway uses DIFFERENT variable names than Vercel!**

| Vercel (Web)                     | Railway (Worker)                 | Value      |
| -------------------------------- | -------------------------------- | ---------- |
| `PUBLIC_SUPABASE_URL`            | `SUPABASE_URL`                   | Same value |
| `PRIVATE_SUPABASE_SERVICE_KEY`   | `SUPABASE_SERVICE_ROLE_KEY`      | Same value |
| `PRIVATE_BUILDOS_WEBHOOK_SECRET` | `PRIVATE_BUILDOS_WEBHOOK_SECRET` | Same value |

## Verification Steps

After deployment:

1. **Check Logs**: Go to **Logs** tab
   - Should see: "Worker started on port XXXX"
   - Should see: "Queue worker initialized"

2. **Test Health Endpoint**:

   ```bash
   curl https://buildos-worker.up.railway.app/health
   ```

   Should return: `{"status":"healthy","timestamp":"..."}`

3. **Check Queue Status**:

   ```bash
   curl https://buildos-worker.up.railway.app/queue/stats
   ```

4. **Test from Web App**:
   - Go to your Vercel app
   - Navigate to `/briefs` page
   - Try generating a brief

## Troubleshooting

### Build Failures

**Error: "pnpm: not found"**

- Railway should auto-detect pnpm from package.json
- Try adding nixpacks.toml configuration

**Error: "Cannot find module @buildos/shared-types" or similar**

- This means the shared packages weren't built before the worker
- Ensure Railway is using the configuration files (`railway.toml` or `nixpacks.toml`)
- **Ensure Root Directory is set to `/` (repository root)**
- The build command must run from the monorepo root and use Turbo
- Correct build command: `pnpm install --frozen-lockfile && pnpm turbo build --filter=@buildos/worker`
- DO NOT use: `cd apps/worker && pnpm build` (this skips dependency building)

### Runtime Failures

**Error: "Missing Supabase environment variables"**

- Remember: Use `SUPABASE_URL` not `PUBLIC_SUPABASE_URL`
- Use `SUPABASE_SERVICE_ROLE_KEY` not `PRIVATE_SUPABASE_SERVICE_KEY`

**Error: "Cannot connect to Supabase"**

- Verify your service role key is correct
- Check Supabase project is not paused

**Error: "Webhook email failed"**

- Verify `BUILDOS_WEBHOOK_URL` points to your Vercel app
- Ensure webhook secrets match between Railway and Vercel
- Check Vercel logs for webhook endpoint errors

### Worker Not Processing Jobs

1. Check queue_jobs table in Supabase
2. Look for stuck jobs with status='processing'
3. Check worker logs for errors
4. Verify queue polling is working

## Important Notes

- Railway uses different environment variable names than Vercel
- The worker connects to the same Supabase instance as the web app
- Email is sent via webhook to the main app (not directly from worker)
- Health checks help Railway know when to restart the service
- The `railway.toml` and `nixpacks.toml` in apps/worker configure the build

## Generating Webhook Secret

If you need to generate a new webhook secret:

```bash
openssl rand -hex 32
```

Use this value for:

- `PRIVATE_BUILDOS_WEBHOOK_SECRET` in both Vercel and Railway

---

Last Updated: 2025-09-27
After following these steps, your worker will be deployed on Railway and connected to your Vercel web app.
