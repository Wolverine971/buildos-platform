<!-- apps/worker/docs/QUICK_REFERENCE.md -->

# Worker Quick Reference

Last verified against code on 2026-07-06.

## Identity

- Package: `@buildos/worker`
- Process entrypoint: `apps/worker/src/index.ts`
- Local port: `3001` unless `PORT` is set
- Production platform: Railway
- Queue store: Supabase/Postgres `queue_jobs`
- Active job registration source: `apps/worker/src/worker.ts`

## Commands

From the monorepo root:

```bash
pnpm --filter @buildos/worker dev
pnpm --filter @buildos/worker worker
pnpm --filter @buildos/worker scheduler
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker test:scheduler
pnpm --filter @buildos/worker test:integration
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/worker build
```

## Required Env

The worker exits at startup if these are missing:

```bash
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_RAILWAY_WORKER_TOKEN=
```

Common conditional env:

```bash
PUBLIC_APP_URL=https://build-os.com
PRIVATE_BUILDOS_WEBHOOK_SECRET=

PRIVATE_TWILIO_ACCOUNT_SID=
PRIVATE_TWILIO_AUTH_TOKEN=
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@build-os.com
```

## API Routes

`/health` and `/api/email-tracking/:trackingId` are public. All other routes
require `Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN`.

| Method | Route                             | Purpose                                          |
| ------ | --------------------------------- | ------------------------------------------------ |
| GET    | `/health`                         | Service health                                   |
| POST   | `/classify/ontology`              | Synchronous create-modal ontology classification |
| POST   | `/queue/brief`                    | Enqueue `generate_daily_brief`                   |
| POST   | `/queue/onboarding`               | Enqueue `onboarding_analysis`                    |
| POST   | `/queue/chat/classify`            | Enqueue `classify_chat_session`                  |
| POST   | `/queue/braindump/process`        | Enqueue `process_onto_braindump`                 |
| GET    | `/jobs/:jobId`                    | Fetch one queue job                              |
| GET    | `/users/:userId/jobs`             | List user jobs with optional filters             |
| GET    | `/queue/stats`                    | Queue stats view                                 |
| GET    | `/queue/stale-stats`              | Cleanup eligibility report                       |
| POST   | `/queue/cleanup`                  | Manual queue cleanup                             |
| GET    | `/api/email-tracking/:trackingId` | Open tracking pixel                              |
| GET    | `/sms/scheduled/user/:userId`     | List scheduled SMS messages                      |
| POST   | `/sms/scheduled/:id/cancel`       | Cancel a scheduled SMS and pending queue job     |
| PATCH  | `/sms/scheduled/:id/update`       | Update scheduled SMS row timing                  |
| POST   | `/sms/scheduled/:id/regenerate`   | Regenerate scheduled SMS content                 |

## Active Jobs

| Job type                         | Trigger                                             |
| -------------------------------- | --------------------------------------------------- |
| `generate_daily_brief`           | Scheduler or `POST /queue/brief`                    |
| `generate_brief_audio`           | Brief worker or web audio request                   |
| `onboarding_analysis`            | `POST /queue/onboarding`                            |
| `send_notification`              | `emit_notification_event` fanout                    |
| `project_activity_batch_flush`   | Project activity batching                           |
| `schedule_daily_sms`             | Scheduler                                           |
| `send_sms`                       | SMS scheduler and notification SMS adapter          |
| `classify_chat_session`          | `POST /queue/chat/classify`                         |
| `process_onto_braindump`         | `POST /queue/braindump/process`                     |
| `transcribe_voice_note`          | Voice note upload flow                              |
| `extract_onto_asset_ocr`         | Ontology asset flow                                 |
| `agent_run`                      | Chat/manual/scheduled Operatives                    |
| `build_project_context_snapshot` | Web project context snapshot service                |
| `generate_project_icon`          | Project icon generation service and snapshot worker |
| `buildos_project_loop`           | Project loop services and scheduler                 |
| `sync_calendar`                  | Calendar projection services                        |

Retired or compatibility-only values include `generate_phases`,
`generate_brief_email`, `send_email`, `update_recurring_tasks`,
`cleanup_old_data`, and `other`.

## Scheduler

| Cadence                                           | Work                                  |
| ------------------------------------------------- | ------------------------------------- |
| Hourly                                            | Daily brief scheduling                |
| Midnight UTC                                      | Daily SMS reminder scheduling         |
| Hourly                                            | SMS alert checks                      |
| 03:17 UTC                                         | Public page 30-day view count refresh |
| Hourly, flag-gated                                | End-of-day project loops              |
| 04:00 UTC, flag-gated                             | Scheduled project audits              |
| Every 30 minutes, flag-gated                      | Project-loop reclaim/finalization     |
| Every 5 minutes                                   | Scheduled Operatives to `agent_run`   |
| `QUEUE_RETENTION_CLEANUP_CRON`, default 03:30 UTC | Queue retention cleanup               |

## Queue Config

Defined by `apps/worker/src/config/queueConfig.ts`.

| Env var                           | Default      | Notes                     |
| --------------------------------- | ------------ | ------------------------- |
| `QUEUE_POLL_INTERVAL`             | `5000`       | Min 1000 ms               |
| `QUEUE_BATCH_SIZE`                | `5`          | Clamped to 1-20           |
| `QUEUE_STALLED_TIMEOUT`           | `300000`     | Min 30000 ms              |
| `QUEUE_MAX_RETRIES`               | `3`          | Clamped to 0-10           |
| `QUEUE_WORKER_TIMEOUT`            | `600000`     | Per-job timeout           |
| `QUEUE_DRAIN_TIMEOUT_MS`          | `25000`      | Shutdown drain window     |
| `QUEUE_RETENTION_CLEANUP_ENABLED` | `true`       | Enables scheduled cleanup |
| `QUEUE_RETENTION_CLEANUP_CRON`    | `30 3 * * *` | Cron expression           |
| `QUEUE_COMPLETED_RETENTION_DAYS`  | `30`         | Completed job deletion    |

Note: `getEnvironmentConfig()` applies development and production profiles
after reading env values, so profile defaults can override some core queue envs.

## Email Path

The active notification email path is:

```text
briefWorker -> emit_notification_event -> send_notification job
  -> workers/notification/emailAdapter.ts
  -> POST {PUBLIC_APP_URL}/api/webhooks/send-notification-email
  -> web app sends the provider email
```

The worker creates `emails`, `email_recipients`, and tracking metadata before
calling the web webhook. It does not use Nodemailer directly.

## Debug Queries

```sql
SELECT job_type, status, COUNT(*)
FROM queue_jobs
GROUP BY job_type, status
ORDER BY job_type, status;

SELECT queue_job_id, job_type, status, attempts, error_message, updated_at
FROM queue_jobs
WHERE status IN ('failed', 'processing')
ORDER BY updated_at DESC
LIMIT 20;
```
