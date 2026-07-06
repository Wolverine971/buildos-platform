<!-- apps/worker/docs/WORKER_STRUCTURE_OVERVIEW.md -->

# Worker Structure Overview

Last verified against code on 2026-07-06.

## Process Layout

`apps/worker/src/index.ts` is the production entrypoint. It:

1. Loads environment variables.
2. Builds the Express app and auth middleware.
3. Registers email tracking and SMS management routes.
4. Starts the queue worker through `startWorker()`.
5. Starts scheduler cron jobs through `startScheduler()`.
6. Starts the HTTP server.
7. Handles SIGTERM/SIGINT by closing HTTP, draining queue work, and flushing
   PostHog before exit.

## Source Tree

```text
apps/worker/
  src/
    index.ts
    worker.ts
    scheduler.ts
    config/
      queueConfig.ts
      projectLoops.ts
    http/
      auth.ts
      errors.ts
      timezone.ts
    lib/
      supabase.ts
      supabaseQueue.ts
      progressTracker.ts
      briefBackoffCalculator.ts
      posthog.ts
      errorLogger.ts
      services/
      storage/
      tts/
      utils/
    middleware/
      jsonError.ts
    routes/
      email-tracking.ts
      sms/scheduled.ts
    scripts/
      backfillStartHereDocuments.ts
    workers/
      agent-run/
      assets/
      braindump/
      brief/
      briefAudio/
      calendar/
      chat/
      notification/
      onboarding/
      ontology/
      project-icon/
      project-loop/
      sms/
      voice-notes/
      shared/
  tests/
  docs/
  package.json
  .env.example
```

Generated `dist/`, local `node_modules/`, `.turbo/`, and `coverage/` may exist
locally but are not source documentation targets.

## Main Subsystems

### HTTP API

Files:

- `apps/worker/src/index.ts`
- `apps/worker/src/http/auth.ts`
- `apps/worker/src/middleware/jsonError.ts`
- `apps/worker/src/routes/email-tracking.ts`
- `apps/worker/src/routes/sms/scheduled.ts`

Only `/health` and `/api/email-tracking/:trackingId` are public. Everything
else uses the worker bearer token.

### Queue

Files:

- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/config/queueConfig.ts`
- `apps/worker/src/workers/shared/jobAdapter.ts`
- `apps/worker/src/workers/shared/queueUtils.ts`

The queue persists jobs in Supabase and uses RPCs for atomic add, claim,
complete, fail, cancel, and stalled-job recovery. `JobAdapter` still exists
because several processors expect the older BullMQ-shaped job interface, but
BullMQ itself is not used.

### Worker Registration

`apps/worker/src/worker.ts` imports processors and registers them with
`queue.process(jobType, handler)`. This file is the active job-type source of
truth.

### Scheduler

`apps/worker/src/scheduler.ts` owns recurring work:

- Daily brief scheduling
- Daily SMS reminder scheduling
- SMS alert checks
- Public page view-count refresh
- Project-loop scheduling and reclaim when enabled
- Scheduled Operatives to `agent_run`
- Queue retention cleanup

### Notifications

Files:

- `apps/worker/src/workers/notification/notificationWorker.ts`
- `apps/worker/src/workers/notification/emailAdapter.ts`
- `apps/worker/src/workers/notification/smsAdapter.ts`
- `apps/worker/src/workers/notification/preferenceChecker.ts`
- `apps/worker/src/workers/notification/projectActivityBatchWorker.ts`

The notification worker routes delivery rows to push, email, in-app, and SMS
adapters. Email delivery goes through the web app webhook; the worker does not
own direct SMTP.

### Daily Briefs

Files:

- `apps/worker/src/workers/brief/briefWorker.ts`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- `apps/worker/src/workers/brief/ontologyPrompts.ts`
- `apps/worker/src/workers/brief/calendarBriefFormatting.ts`
- `apps/worker/src/workers/briefAudio/*`

Current canonical storage is `ontology_daily_briefs` and
`ontology_project_briefs`. Legacy `daily_briefs` / `project_daily_briefs`
language should not be used for new worker docs unless explicitly discussing
old data.

### Agent and Project Automation

Files:

- `apps/worker/src/workers/agent-run/agentRunWorker.ts`
- `apps/worker/src/workers/project-loop/*`
- `apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts`
- `apps/worker/src/workers/project-icon/projectIconWorker.ts`
- `apps/worker/src/workers/calendar/calendarSyncWorker.ts`

These processors handle detached agent runs, scheduled Operatives, project loop
audits, project context snapshots, icon generation, and calendar projection
sync jobs.

## Config and Env

`queueConfig.ts` validates required startup env:

```bash
PUBLIC_SUPABASE_URL
PRIVATE_SUPABASE_SERVICE_KEY
PRIVATE_OPENROUTER_API_KEY
PRIVATE_RAILWAY_WORKER_TOKEN
```

It also validates:

- `PUBLIC_APP_URL` URL format, defaulting to `https://build-os.com`
- webhook email env when `USE_WEBHOOK_EMAIL=true`
- all-or-nothing Twilio credentials
- paired VAPID keys
- queue bounds for poll interval and batch size

## Deployment Files

The Railway service should use repo-root config:

- `railway.toml`
- `nixpacks.toml`

The app-level `apps/worker/railway.toml` and `apps/worker/nixpacks.toml` are
not the documented deployment source when Railway root directory is `/`.

## Tests

Worker tests live in `apps/worker/tests/`. Common suites:

```bash
pnpm --filter @buildos/worker test:run
pnpm --filter @buildos/worker test:scheduler
pnpm --filter @buildos/worker test:integration
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/worker lint
```
