<!-- apps/worker/docs/deployment/RAILWAY_DEPLOYMENT.md -->

# Railway Deployment - Worker Service

Last verified against repo-root config on 2026-07-06.

The worker deploys from the monorepo root. Do not set Railway root directory to
`apps/worker`.

## Railway Service Settings

- Root directory: `/`
- Build config: repo-root `railway.toml` and `nixpacks.toml`
- Start command: `node apps/worker/dist/index.js`
- Healthcheck path: `/health`
- Healthcheck timeout: `30`
- Restart policy: `ON_FAILURE`, max retries `3`

Current repo-root config:

```bash
pnpm install --prod=false --no-frozen-lockfile
pnpm turbo build --filter=@buildos/worker
node apps/worker/dist/index.js
```

`nixpacks.toml` currently provisions `nodejs_22` and `pnpm-9_x`. The repository
package manager is pnpm 11, so keep Railway build output under review if
Nixpacks changes pnpm resolution behavior.

## Watch Paths

Use the root `railway.toml` watch patterns:

```text
apps/worker/**
packages/**
turbo.json
package.json
pnpm-lock.yaml
```

## Required Variables

Set these in the Railway worker service:

```bash
NODE_ENV=production
PORT=${{PORT}}
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_RAILWAY_WORKER_TOKEN=
PUBLIC_APP_URL=https://build-os.com
PRIVATE_BUILDOS_WEBHOOK_SECRET=
```

Notes:

- The worker code validates `PUBLIC_SUPABASE_URL`, not `SUPABASE_URL`.
- `PRIVATE_RAILWAY_WORKER_TOKEN` must match the token used by the web app when
  calling the worker.
- `PRIVATE_BUILDOS_WEBHOOK_SECRET` must match the web app value because worker
  callbacks use it.

## Optional Variables

Queue tuning:

```bash
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10
QUEUE_MAX_RETRIES=3
QUEUE_ENABLE_HEALTH_CHECKS=true
QUEUE_WORKER_TIMEOUT=600000
QUEUE_STALLED_TIMEOUT=600000
QUEUE_STATS_UPDATE_INTERVAL=300000
QUEUE_RETENTION_CLEANUP_ENABLED=true
QUEUE_RETENTION_CLEANUP_CRON="30 3 * * *"
QUEUE_COMPLETED_RETENTION_DAYS=30
QUEUE_DRAIN_TIMEOUT_MS=25000
```

SMS:

```bash
PRIVATE_TWILIO_ACCOUNT_SID=
PRIVATE_TWILIO_AUTH_TOKEN=
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=
PRIVATE_TWILIO_STATUS_CALLBACK_URL=
```

Push:

```bash
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@build-os.com
```

Calendar:

```bash
PRIVATE_GOOGLE_CLIENT_ID=
PRIVATE_GOOGLE_CLIENT_SECRET=
PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY=
```

## Web App Variables

The web app needs the Railway worker URL and matching token:

```bash
PUBLIC_RAILWAY_WORKER_URL=https://<worker-service>.up.railway.app
PRIVATE_RAILWAY_WORKER_TOKEN=<same value as Railway>
PRIVATE_BUILDOS_WEBHOOK_SECRET=<same value as Railway>
```

## Verification

After deploy:

```bash
curl https://<worker-service>.up.railway.app/health
```

Authenticated checks:

```bash
curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  https://<worker-service>.up.railway.app/queue/stats

curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  "https://<worker-service>.up.railway.app/queue/stale-stats?thresholdHours=24"
```

Expected startup logs include:

- queue configuration profile
- registered processors
- queue processor started
- scheduler started
- API server running on the Railway port

## Troubleshooting

### Missing Supabase env

Use `PUBLIC_SUPABASE_URL` and `PRIVATE_SUPABASE_SERVICE_KEY`. Do not rename the
URL variable to `SUPABASE_URL`; the worker validates the public-prefixed name.

### Shared package build failures

Confirm Railway root directory is `/` and the root config is active. Building
from `apps/worker` skips workspace dependencies.

### Worker API returns 401

Confirm the caller sends:

```http
Authorization: Bearer <PRIVATE_RAILWAY_WORKER_TOKEN>
```

Only `/health` and `/api/email-tracking/:trackingId` are public.

### Notification email fails

Check:

- `PUBLIC_APP_URL` points to the web app origin
- `PRIVATE_BUILDOS_WEBHOOK_SECRET` exists in both Railway and web app env
- the web route `/api/webhooks/send-notification-email` is deployed

### Jobs stay pending

Check:

```sql
SELECT job_type, status, COUNT(*)
FROM queue_jobs
GROUP BY job_type, status;
```

Then check Railway logs for registered job types and queue claim errors.
