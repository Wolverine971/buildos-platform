<!-- apps/worker/docs/README.md -->

# Worker Service Documentation

Last verified against code on 2026-07-06.

This is the documentation hub for `apps/worker`, the Railway service that runs
the worker API, Supabase queue consumer, and scheduler in one Node.js process.

For web app docs, see `apps/web/docs/`. For shared architecture and operations
docs, see `docs/`.

## What Runs Here

`apps/worker/src/index.ts` starts three subsystems:

- Express API server on `PORT` (default `3001`)
- Supabase-backed queue processor from `apps/worker/src/worker.ts`
- Cron scheduler from `apps/worker/src/scheduler.ts`

The queue is PostgreSQL/Supabase based. Redis, BullMQ, `generate_phases`, and
`generate_brief_email` are not active worker paths in this checkout.

## Current Stack

- Runtime: Node.js and TypeScript
- HTTP: Express 4 with bearer-token auth
- Queue: `queue_jobs` plus Supabase RPCs such as `add_queue_job`,
  `claim_pending_jobs`, `complete_queue_job`, and `fail_queue_job`
- Scheduler: `node-cron`
- LLM access: `@buildos/smart-llm` and worker adapters
- Email: worker creates email records and calls the web app webhook; the worker
  does not send SMTP directly
- SMS: `@buildos/twilio-service`
- Push: `web-push` with VAPID keys
- Analytics: `posthog-node`
- Deployment: Railway using the repo-root `railway.toml` and `nixpacks.toml`

## Start Here

| Document                                                             | Use it for                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md)                             | Commands, env vars, route summary, and operational checks      |
| [WORKER_JOBS_AND_FLOWS.md](WORKER_JOBS_AND_FLOWS.md)                 | Active job type matrix, producers, processors, and major flows |
| [WORKER_STRUCTURE_OVERVIEW.md](WORKER_STRUCTURE_OVERVIEW.md)         | Source layout and subsystem responsibilities                   |
| [deployment/RAILWAY_DEPLOYMENT.md](deployment/RAILWAY_DEPLOYMENT.md) | Railway setup and production verification                      |
| [features/daily-briefs/README.md](features/daily-briefs/README.md)   | Daily brief generation, backoff, calendar, and audio notes     |
| [features/EMAIL_TRACKING.md](features/EMAIL_TRACKING.md)             | Worker email tracking pixel behavior                           |

The old standalone navigation index was removed because it duplicated this hub
and had fallen out of date.

## Quick Development Commands

From the monorepo root:

```bash
pnpm --filter @buildos/worker dev
pnpm --filter @buildos/worker worker
pnpm --filter @buildos/worker scheduler
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/worker lint
pnpm --filter @buildos/worker build
```

From `apps/worker/`, the same scripts are available without `--filter`.

## Required Environment

Validated at worker startup by `apps/worker/src/config/queueConfig.ts`:

```bash
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_OPENROUTER_API_KEY=
PRIVATE_RAILWAY_WORKER_TOKEN=
```

Important conditional variables:

- `PRIVATE_BUILDOS_WEBHOOK_SECRET` for notification email and calendar-sync
  callbacks to the web app
- `PUBLIC_APP_URL` for worker-generated links, defaulting to
  `https://build-os.com`
- `PRIVATE_TWILIO_ACCOUNT_SID`, `PRIVATE_TWILIO_AUTH_TOKEN`, and
  `PRIVATE_TWILIO_MESSAGING_SERVICE_SID` together for SMS
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` together for push notifications
- Google OAuth/calendar encryption variables when calendar sync or agent
  calendar operations are enabled

See `apps/worker/.env.example` for the expanded local template.

## Auth Model

`/health` and `/api/email-tracking/:trackingId` are public. Other worker API
routes require `Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN`.

Worker-to-web callbacks use `PRIVATE_BUILDOS_WEBHOOK_SECRET`.

## Active Queue Job Types

The live source of truth is `queue.process(...)` registrations in
`apps/worker/src/worker.ts`.

| Job type                         | Processor                                             |
| -------------------------------- | ----------------------------------------------------- |
| `generate_daily_brief`           | `workers/brief/briefWorker.ts`                        |
| `generate_brief_audio`           | `workers/briefAudio/briefAudioWorker.ts`              |
| `onboarding_analysis`            | `workers/onboarding/onboardingWorker.ts`              |
| `send_notification`              | `workers/notification/notificationWorker.ts`          |
| `project_activity_batch_flush`   | `workers/notification/projectActivityBatchWorker.ts`  |
| `schedule_daily_sms`             | `workers/dailySmsWorker.ts`                           |
| `send_sms`                       | `workers/smsWorker.ts`                                |
| `classify_chat_session`          | `workers/chat/chatSessionClassifier.ts`               |
| `process_onto_braindump`         | `workers/braindump/braindumpProcessor.ts`             |
| `transcribe_voice_note`          | `workers/voice-notes/voiceNoteTranscriptionWorker.ts` |
| `extract_onto_asset_ocr`         | `workers/assets/assetOcrWorker.ts`                    |
| `agent_run`                      | `workers/agent-run/agentRunWorker.ts`                 |
| `build_project_context_snapshot` | `workers/ontology/projectContextSnapshotWorker.ts`    |
| `generate_project_icon`          | `workers/project-icon/projectIconWorker.ts`           |
| `buildos_project_loop`           | `workers/project-loop/projectLoopWorker.ts`           |
| `sync_calendar`                  | `workers/calendar/calendarSyncWorker.ts`              |

Some DB enum/shared-type values remain for compatibility with old rows. Do not
document a job as active unless it is registered in `worker.ts`.

## Scheduler Cadence

Defined in `apps/worker/src/scheduler.ts`:

- `0 * * * *`: schedule daily briefs for users due in the next hour
- `0 0 * * *`: schedule daily SMS reminders
- `0 * * * *`: check SMS alert thresholds
- `17 3 * * *`: refresh public page 30-day view counts
- `0 * * * *`: enqueue project loops when `ENABLE_PROJECT_LOOPS` is on
- `0 4 * * *`: enqueue scheduled project audits when project loops are on
- `*/30 * * * *`: reclaim stalled project-loop runs when project loops are on
- `*/5 * * * *`: schedule due Operatives as `agent_run` jobs
- `QUEUE_RETENTION_CLEANUP_CRON` (default `30 3 * * *`): queue retention cleanup
- Startup checks after 5 seconds for briefs and after 8 seconds for Operatives

## Useful Production Checks

```sql
SELECT job_type, status, COUNT(*)
FROM queue_jobs
GROUP BY job_type, status
ORDER BY job_type, status;

SELECT id, queue_job_id, job_type, error_message, updated_at
FROM queue_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;
```

```bash
curl https://<worker-host>/health
curl -H "Authorization: Bearer $PRIVATE_RAILWAY_WORKER_TOKEN" \
  https://<worker-host>/queue/stats
```
