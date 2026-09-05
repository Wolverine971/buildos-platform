<!-- apps/worker/docs/deployment/RAILWAY_DEPLOYMENT.md -->

# Railway deployment — worker services

Last verified against repo-root config and production process ownership on 2026-08-25.

Both worker services deploy from the monorepo root. Do not set either Railway
root directory to `apps/worker`.

## Railway service settings

Use the same build for two physically isolated services:

| Setting             | General background worker                    | Agentic Chat worker                    |
| ------------------- | -------------------------------------------- | -------------------------------------- |
| Root directory      | `/`                                          | `/`                                    |
| Build config        | repo-root `railway.toml` and `nixpacks.toml` | same                                   |
| Start command       | `node apps/worker/dist/index.js`             | `node apps/worker/dist/chat-worker.js` |
| Healthcheck path    | `/health`                                    | `/health`                              |
| Healthcheck timeout | `30`                                         | `30`                                   |
| Restart policy      | `ON_FAILURE`, max retries `3`                | `ON_FAILURE`, max retries `3`          |

The repo-root start command is the general-worker default. Configure the
Agentic Chat service's start-command override explicitly. The general process
does not start the chat consumer and does not serve `/agentic-chat/capacity`.

Current repo-root config:

```bash
npx --yes pnpm@11.7.0 install --prod=false --frozen-lockfile
npx --yes pnpm@11.7.0 exec turbo build --filter=@buildos/worker
node apps/worker/dist/index.js
```

`nixpacks.toml` currently provisions `nodejs_22`, then runs pinned
`pnpm@11.7.0` via `npx` for dependency installation and the worker build. Keep
this in sync with the root `packageManager` and `engines.pnpm` values.

The worker build uses native TypeScript 7 from the worker's `@typescript/native`
development dependency. Keep `--prod=false` in the install command so Railway
installs the compiler and Turbo before the build. The native package locks Linux
x64 and arm64 binaries; the compiled runtime does not depend on either tool.

Turborepo must remain at 2.9.7 or newer for pnpm 11 flat patched-dependency
lockfiles. The repository currently pins Turbo `^2.10.5`.

## Watch Paths

Use the root `railway.toml` watch patterns:

```text
apps/worker/**
packages/**
patches/**
turbo.json
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
railway.toml
nixpacks.toml
```

The app-level `apps/worker/railway.toml` and `apps/worker/nixpacks.toml` are
kept synchronized as fallbacks, but the repo-root files are authoritative.

## Required variables

Set these shared values in both services:

```bash
NODE_ENV=production
PORT=${{PORT}}
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_RAILWAY_WORKER_TOKEN=
```

The general background worker additionally needs its callback configuration:

```bash
PUBLIC_APP_URL=https://build-os.com
PRIVATE_BUILDOS_WEBHOOK_SECRET=
```

The dedicated Agentic Chat service always starts the chat runtime. It requires
an explicit production profile and bounded configuration; there is no separate
enable flag:

```bash
AGENTIC_CHAT_WORKER_PROFILE=production
PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE=false
AGENTIC_CHAT_OPENROUTER_MODEL=<provider/model>
AGENT_CHAT_LIVE_VISION_ENABLED=false
CHAT_CONCURRENCY=2
CHAT_POLL_INTERVAL_MS=1000
CHAT_PROVIDER_BUDGET_MS=270000
CHAT_WORKER_TIMEOUT_MS=360000
CHAT_STALLED_TIMEOUT_MS=420000
CHAT_DRAIN_TIMEOUT_MS=22000
CHAT_PUBLISHER_TURN_PENDING_SOFT_BYTES=262144
CHAT_PUBLISHER_TURN_PENDING_HARD_BYTES=1048576
CHAT_PUBLISHER_WORKER_PENDING_SOFT_BYTES=2097152
CHAT_PUBLISHER_WORKER_PENDING_HARD_BYTES=8388608
CHAT_PUBLISHER_TURN_PENDING_SOFT_EVENTS=32
CHAT_PUBLISHER_TURN_PENDING_HARD_EVENTS=128
CHAT_PUBLISHER_WORKER_PENDING_SOFT_EVENTS=256
CHAT_PUBLISHER_WORKER_PENDING_HARD_EVENTS=1024
```

Notes:

- The worker code validates `PUBLIC_SUPABASE_URL`, not `SUPABASE_URL`.
- `PRIVATE_RAILWAY_WORKER_TOKEN` must match the token used by the web app when
  calling the worker.
- `PRIVATE_BUILDOS_WEBHOOK_SECRET` must match the web app value because worker
  callbacks use it.
- The dedicated service fails startup when its explicit production values are
  absent or invalid. `CHAT_CONCURRENCY` is bounded to 1–2 and the chat drain must
  stay at or below 22 seconds.
- Keep `AGENT_CHAT_LIVE_VISION_ENABLED` identical on Vercel and the dedicated
  service. When it is `false`, image turns use explicit web capability execution.
- `PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE` must match the web service. When
  enabled, the worker re-evaluates `evaluate_user_consumption_gate` after an
  execution starts and before terminal finalization; failure is reported but
  never strands terminal turn truth.
- Mutation provider and adapter capability lists must match the reviewed
  production surface. A provider capability without its adapter fails startup.

## Optional Variables

Queue tuning:

```bash
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10
QUEUE_MAX_RETRIES=3
QUEUE_ENABLE_HEALTH_CHECKS=true
QUEUE_WORKER_TIMEOUT=600000
QUEUE_STALLED_TIMEOUT=600000
# Alert-check cadence; cumulative queue stats are queried on demand, not logged.
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

## Calendar credentials on the Agentic Chat worker

Agentic chat calendar reads and writes execute on the dedicated
`agentic-chat-worker` service, so that service needs the calendar credentials
too. They are **not** inherited from the general worker or from Vercel:

```bash
PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1=
PRIVATE_GOOGLE_CALENDAR_CLIENT_ID=
PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET=
PRIVATE_GOOGLE_CLIENT_ID=
PRIVATE_GOOGLE_CLIENT_SECRET=
```

Every value must be byte-identical to Vercel production: the stored OAuth tokens
are encrypted with `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1`, so key drift
shows up as calendar reads reporting `credentials_unreadable`, and a missing key
or client pair shows up as `credentials_not_configured`.

Set them with placeholders replaced by the real Vercel production values:

```bash
railway variables --service agentic-chat-worker \
  --set "PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1=<same value as Vercel>" \
  --set "PRIVATE_GOOGLE_CALENDAR_CLIENT_ID=<same value as Vercel>" \
  --set "PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET=<same value as Vercel>" \
  --set "PRIVATE_GOOGLE_CLIENT_ID=<same value as Vercel>" \
  --set "PRIVATE_GOOGLE_CLIENT_SECRET=<same value as Vercel>"
```

Startup does not fail without them. The service logs one
`agentic_chat_calendar_credentials_missing` warning naming the missing variables
(names only, never values), and `/health` reports
`agenticChat.calendarCredentials` as `configured` or `missing:<NAMES>`.

For an existing production service, inspect that names-only field before changing
variables:

```bash
curl -fsS https://agentic-chat-worker-production.up.railway.app/health \
  | jq -r '.agenticChat.calendarCredentials'
```

Configure missing values on Railway project `queue-worker`, environment
`production`. Keep the three source-aware Calendar variables identical across
Vercel `build-os` Production, `agentic-chat-worker`, and `daily-brief-worker`.
Presence alone does not establish equality or valid Google credentials.

Vercel sensitive values are non-readable after creation. Blank values from
`vercel env pull` or `vercel env run` do **not** establish that a sensitive value
is empty at runtime. Use runtime configuration checks and an authenticated Calendar
read to validate the deployed app. Copy a known, verified source value without
printing it in logs or command output.

Vercel CLI 50.4.9 can fail to update a sensitive variable with
`You cannot change the key of a Sensitive Environment Variable`. Use the documented
Vercel API `PATCH /v9/projects/{projectId}/env/{envId}` with only `{ "value": ... }`
to update the existing Production entry, preserving its name and sensitivity.
Authenticate through the operator's existing Vercel credentials and never log the
request or secret-bearing response. Redeploy after a successful update.

If a runtime check proves `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` is missing or
the configured key cannot decrypt stored tokens, recover the original from the
approved secret manager. If it is irrecoverable, treat a new key as a credential
rotation: set the same new value on every service before reconnecting or explicitly
re-encrypting every stored source-aware Calendar grant. Follow
`docs/integrations/google-calendar/setup.md`; a newly generated key cannot decrypt
existing credential rows.

After Railway deploys the variable change, the same command must print
`configured`. That proves presence, not correctness. Finish with a real
`list_calendar_events` canary: complete coverage with every configured source
successful proves the worker can decrypt the stored grants and reach Google.
Interpret any remaining structured failure before taking another action:

- `credentials_not_configured`: a required value is still missing or blank on the
  Agentic Chat service.
- `credentials_unreadable`: the versioned encryption-key value does not match the
  value that encrypted the stored grants.
- `reconnect_required`: server configuration is now available, but the individual
  Google grant is expired, revoked, or otherwise invalid.

Decrypt failures can leave a connection marked `active`, which hides its Reconnect
button in Calendar settings. After verifying the affected rows and synchronizing
the servers, an operator can mark only those connections `reconnect_required`.
Reauthorize the same Google accounts to replace their tokens under the current key;
keep their existing connection IDs and calendar source mappings. Complete the
Google consent flow before expecting the Calendar canary to succeed.

## Web app variables

The web app needs distinct service origins and the matching token:

```bash
PUBLIC_RAILWAY_WORKER_URL=https://<general-worker-service>.up.railway.app
PRIVATE_AGENTIC_CHAT_WORKER_URL=https://<agentic-chat-worker-service>.up.railway.app
PRIVATE_RAILWAY_WORKER_TOKEN=<same value as Railway>
PRIVATE_BUILDOS_WEBHOOK_SECRET=<same value as Railway>
AGENTIC_CHAT_TRANSPORT_LEASE_SECRET=<at-least-32-random-bytes>
```

Compatible new turns always select worker transport. Gmail, Calendar, browser
OAuth handoff, and worker-disabled image turns reach synchronous web execution
only after explicit capability renegotiation. There is no global routing flag
and no Agentic Chat health/capacity fallback to the general worker.

## Verification

After deploying both services:

```bash
curl https://<general-worker-service>.up.railway.app/health
curl https://<agentic-chat-worker-service>.up.railway.app/health
```

The general response reports only general queue health. The dedicated response
must report service `agentic-chat-worker`, a running/healthy chat runtime,
Realtime health, active turns, recovery health, and the expected mutation
capability summary.

Authenticated general-worker checks:

```bash
curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  https://<worker-service>.up.railway.app/queue/stats

curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  "https://<worker-service>.up.railway.app/queue/stale-stats?thresholdHours=24"
```

Authenticated dedicated-worker capacity check:

```bash
curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  https://<agentic-chat-worker-service>.up.railway.app/agentic-chat/capacity
```

Expected startup logs include:

- General service: queue configuration, registered processors, queue processor,
  scheduler, and API server startup.
- Agentic Chat service: mutation capability summary, chat consumer startup,
  Realtime/recovery initialization, and dedicated HTTP service startup.

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
