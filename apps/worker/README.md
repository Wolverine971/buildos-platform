<!-- apps/worker/README.md -->

# @buildos/worker

Node.js + Express background worker for BuildOS. Deployed to Railway.

This service runs three things in the same process:

1. **API server** (`src/index.ts`) — REST endpoints for queueing, inspecting, and cleaning jobs.
2. **Worker** (`src/worker.ts`) — long-running consumer that pulls jobs off the Supabase-backed queue and dispatches them to per-domain processors.
3. **Scheduler** (`src/scheduler.ts`) — cron-driven scheduling of recurring work (timezone-aware daily briefs with engagement backoff, daily SMS windows, ontology/chat maintenance, etc.).

> For the monorepo overview, see the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md).

## Tech Stack

- **Runtime** — Node.js ≥ 20 (Railway Nixpacks uses `nodejs_20`)
- **Web** — Express 4
- **Queue** — Supabase-backed (no Redis). Atomic claiming via PostgreSQL RPCs (`add_queue_job`, `claim_pending_jobs`, `complete_queue_job`, `fail_queue_job`) using `FOR UPDATE SKIP LOCKED`.
- **Scheduler** — `node-cron`
- **Email** — Nodemailer (SMTP) with an optional webhook-based path (`USE_WEBHOOK_EMAIL=true`)
- **LLMs** — `@buildos/smart-llm`
- **SMS** — `@buildos/twilio-service`

## Queue Architecture

```
Web (Vercel)  ──►  POST /queue/*  ──►  Supabase queue_jobs  ──►  Worker loop
                                              ▲                        │
                                              │                        ▼
                                       Scheduler (cron)         Domain processors
                                                                (brief, sms, ontology, ...)
                                                                        │
                                                                        ▼
                                                            Supabase Realtime notifications
```

- Jobs are rows in `queue_jobs` with status `pending | processing | completed | failed`.
- Workers claim jobs via `claim_pending_jobs` (uses `FOR UPDATE SKIP LOCKED`).
- Stalled jobs (stuck in `processing` longer than `stalledTimeout`, default 5 min) are automatically recovered.
- Failures retry with exponential backoff.
- The `JobAdapter` in `src/workers/shared/jobAdapter.ts` bridges the Supabase queue shape to the legacy BullMQ-style processor interface the domain workers still expect.

## Job Types

Registered in `src/worker.ts`:

| Job type                         | Processor                                          |
| -------------------------------- | -------------------------------------------------- |
| `generate_daily_brief`           | `workers/brief/briefWorker`                        |
| `onboarding_analysis`            | `workers/onboarding/onboardingWorker`              |
| `send_notification`              | `workers/notification/notificationWorker`          |
| `project_activity_batch_flush`   | `workers/notification/projectActivityBatchWorker`  |
| `schedule_daily_sms`             | `workers/dailySmsWorker`                           |
| `send_sms`                       | `workers/smsWorker`                                |
| `classify_chat_session`          | `workers/chat/chatSessionClassifier`               |
| `process_onto_braindump`         | `workers/braindump/braindumpProcessor`             |
| `transcribe_voice_note`          | `workers/voice-notes/voiceNoteTranscriptionWorker` |
| `extract_onto_asset_ocr`         | `workers/assets/assetOcrWorker`                    |
| `buildos_homework`               | `workers/homework/homeworkWorker`                  |
| `buildos_tree_agent`             | `workers/tree-agent/treeAgentWorker`               |
| `build_project_context_snapshot` | `workers/ontology/projectContextSnapshotWorker`    |
| `generate_project_icon`          | `workers/project-icon/projectIconWorker`           |
| `sync_calendar`                  | `workers/calendar/calendarSyncWorker`              |

Adding a new job type is documented in [`src/workers/README.md`](./src/workers/README.md).

## HTTP API

Base URL (prod): set via `PUBLIC_RAILWAY_WORKER_URL`. Requests from the web app are authenticated with `PRIVATE_RAILWAY_WORKER_TOKEN`.

| Method | Path                       | Purpose                                       |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/health`                  | Healthcheck + queue/scheduler status          |
| POST   | `/classify/ontology`       | Sync ontology classification (non-queued)     |
| POST   | `/queue/brief`             | Enqueue a daily brief job                     |
| POST   | `/queue/onboarding`        | Enqueue an onboarding analysis job            |
| POST   | `/queue/chat/classify`     | Enqueue chat-session classification           |
| POST   | `/queue/braindump/process` | Enqueue ontology braindump processing         |
| GET    | `/jobs/:jobId`             | Inspect a job                                 |
| GET    | `/users/:userId/jobs`      | List a user's jobs                            |
| GET    | `/queue/stats`             | Queue depth + status counts                   |
| GET    | `/queue/stale-stats`       | Stalled-job statistics                        |
| POST   | `/queue/cleanup`           | Run stale-job cleanup                         |
| —      | `/webhooks/*`              | Provider webhooks (see `src/routes/webhooks`) |
| —      | `/sms/scheduled`           | Scheduled-SMS management endpoints            |
| —      | `/email-tracking/*`        | Open/click tracking pixels + redirects        |

## Quick Start

From the monorepo root:

```bash
pnpm install
pnpm dev --filter=worker     # http://localhost:3001
```

Copy the root `.env.example` to `.env`. Minimum required:

```env
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=
PRIVATE_RAILWAY_WORKER_TOKEN=
PRIVATE_OPENROUTER_API_KEY=
```

Healthcheck once running:

```bash
curl http://localhost:3001/health
```

## Scripts

From `apps/worker/`:

```bash
pnpm dev                # Full process (index.ts): API + worker + scheduler
pnpm worker             # Worker loop only
pnpm scheduler          # Scheduler only
pnpm build              # tsc → dist/
pnpm start              # node dist/index.js (production entry)

pnpm typecheck
pnpm lint | lint:fix
pnpm test | test:run | test:watch
pnpm test:scheduler     # Scheduler-specific suite
pnpm test:integration
```

## Deployment (Railway)

Configured at the repo root via `railway.toml` and `nixpacks.toml`:

- Builder: Nixpacks on `nodejs_20` + `pnpm 9`.
- Build: `pnpm install --prod=false --no-frozen-lockfile && pnpm turbo build --filter=@buildos/worker`.
- Start: `node apps/worker/dist/index.js`.
- Healthcheck: `GET /health` with a 30s timeout.
- Restart policy: `ON_FAILURE`, up to 3 retries.

Set the required env vars in the Railway service dashboard — at minimum, Supabase credentials, LLM API keys, `PRIVATE_RAILWAY_WORKER_TOKEN`, and (if using SMS) Twilio credentials.

## Tuning

`SupabaseQueue` defaults in `src/lib/supabaseQueue.ts`:

- `pollInterval` — 5 000 ms
- `batchSize` — 5 concurrent jobs
- `stalledTimeout` — 300 000 ms (5 min)

Per-environment overrides live in `src/config/queueConfig.ts`.

## Monitoring

Useful SQL for production debugging:

```sql
-- Queue depth by type over the last hour
SELECT job_type, status, COUNT(*)
FROM queue_jobs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY job_type, status;

-- Average processing time per type
SELECT job_type,
       AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_seconds
FROM queue_jobs
WHERE status = 'completed'
GROUP BY job_type;

-- Recent failures
SELECT id, job_type, error_message, created_at
FROM queue_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
```

## Documentation

- [Worker docs hub](./docs/README.md)
- [Worker jobs & flows](./docs/WORKER_JOBS_AND_FLOWS.md)
- [Worker structure overview](./docs/WORKER_STRUCTURE_OVERVIEW.md)
- [Email setup](./docs/EMAIL_SETUP.md)
- [Quick reference](./docs/QUICK_REFERENCE.md)
- [Adding a worker](./src/workers/README.md)
- [Queue system flow (repo root)](../../docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md)
