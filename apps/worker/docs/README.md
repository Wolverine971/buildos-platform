<!-- apps/worker/docs/README.md -->

# Worker Service Documentation

## ⚙️ Deployment Target: Railway

This is **worker service-specific** documentation (`/apps/worker`).

**For web app docs**, see `/apps/web/docs/`  
**For shared concerns**, see `/docs/`

## What This Service Does

- Background job processing (BullMQ with Supabase queue)
- Daily brief generation and email delivery
- Scheduled tasks via cron jobs
- Asynchronous operations offloaded from web app

## Tech Stack

- **Framework:** Node.js + Express
- **Queue:** BullMQ (Supabase-based, no Redis)
- **Database:** Supabase (via `@buildos/supabase-client`)
- **Email:** Nodemailer
- **SMS:** Twilio (via `@buildos/twilio-service`)
- **Scheduler:** node-cron
- **Deployment:** Railway
- **Shared Packages:** `@buildos/shared-types`, `@buildos/supabase-client`, `@buildos/twilio-service`

## Documentation Structure

| Document / Folder                                                    | Contents                               |
| -------------------------------------------------------------------- | -------------------------------------- |
| **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)**                 | Complete navigation guide (start here) |
| **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)**                         | Quick reference (8-min read)           |
| **[WORKER_STRUCTURE_OVERVIEW.md](WORKER_STRUCTURE_OVERVIEW.md)**     | Full architecture deep dive            |
| **[WORKER_JOBS_AND_FLOWS.md](WORKER_JOBS_AND_FLOWS.md)**             | Job types, data flows & API ref        |
| **[SCHEDULER_ANALYSIS_AND_BUGS.md](SCHEDULER_ANALYSIS_AND_BUGS.md)** | Scheduler analysis & known bugs        |
| `/features/`                                                         | Feature docs (daily-briefs, email)     |
| `/deployment/`                                                       | Deployment guides (Railway)            |

## Quick Start for LLM Agents

### Understanding Worker Jobs

1. Read feature spec: `/features/[job-type]/README.md`
2. Check handler: `/apps/worker/src/jobs/[job].ts`
3. Review queue config: `/apps/worker/src/services/queue/`
4. Check scheduler: `/apps/worker/src/scheduler/`

### Adding a Background Job

1. Define job type: `/packages/shared-types/src/queue.ts`
2. Create handler: `/apps/worker/src/jobs/[new-job].ts`
3. Register in queue processor: `/apps/worker/src/services/queue/processor.ts`
4. Document: `/features/[new-job]/README.md`
5. Test: Create tests in `/apps/worker/src/__tests__/`

### Debugging Jobs

1. Check Railway logs
2. Review runbook: `/operations/runbooks/`
3. Check queue status in Supabase: `SELECT * FROM queue_jobs WHERE status = 'failed'`
4. Review job-specific logs

## Key Features

### Daily Brief Generation

**Location:** `/features/daily-briefs/`

Scheduled generation and delivery of daily email briefs:

- Cron-based scheduling (configurable per user timezone)
- AI-powered brief generation via OpenAI
- Email delivery via Nodemailer
- Retry logic with exponential backoff
- Job status tracking

### Queue System

**Location:** `/features/queue-system/`

Supabase-based job queue (no Redis required):

- Atomic job claiming
- Concurrent job processing
- Job status tracking
- Failed job retry
- Stalled job recovery

### Scheduler

**Location:** `/features/scheduler/`

Cron-based task scheduling:

- Daily brief scheduling
- Weekly summary generation
- Cleanup tasks
- Job health monitoring

### Email Delivery

**Location:** `/integrations/email/`

Email sending infrastructure:

- SMTP configuration
- Template rendering
- Delivery tracking
- Bounce handling

## Development Commands

```bash
# Development
pnpm dev               # Start worker in development mode

# Testing
pnpm test              # Run all tests
pnpm test:scheduler    # Test scheduler specifically
pnpm test:watch        # Watch mode

# Code Quality
pnpm typecheck         # Type checking
pnpm lint              # Lint code
pnpm lint:fix          # Auto-fix linting issues

# Building
pnpm build             # Production build
cd ../.. && pnpm build --filter=worker  # Build from monorepo root
```

## Environment Variables

See [Deployment Environment Checklist](/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) for complete list.

**Essential variables:**

```bash
# Database
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=

# Email
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=

# AI
OPENAI_API_KEY=

# Optional: SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

## Deployment

See **[deployment/RAILWAY_DEPLOYMENT.md](deployment/RAILWAY_DEPLOYMENT.md)** for complete Railway deployment instructions.

Deployment happens automatically via Railway's GitHub integration:

1. Push to main branch
2. Railway automatically deploys

## Queue Job Types

Defined in `/packages/shared-types/src/queue.ts`:

- **`daily_brief_generation`** - Generate and send daily brief email
- **`weekly_summary`** - Generate weekly summary (future)
- **`calendar_sync`** - Sync calendar events (future)

## Cron Schedules

Defined in `/apps/worker/src/scheduler/`:

- **Daily Briefs:** Runs hourly, processes users based on timezone
- **Cleanup:** Runs daily at midnight UTC

## Monitoring

### Queue Health

Check queue status:

```sql
-- Active jobs
SELECT * FROM queue_jobs WHERE status = 'processing';

-- Failed jobs
SELECT * FROM queue_jobs WHERE status = 'failed';

-- Job counts by status
SELECT status, COUNT(*) FROM queue_jobs GROUP BY status;
```

### Railway Logs

Access logs via Railway dashboard:

- Application logs
- Error logs
- Performance metrics

## Troubleshooting

### Jobs Not Processing

1. Check Railway logs for errors
2. Verify Supabase connection
3. Check `queue_jobs` table for stalled jobs
4. Restart worker service

### Email Delivery Failures

1. Check SMTP credentials in environment variables
2. Review Railway logs for SMTP errors
3. Verify email templates are rendering correctly
4. Check Nodemailer configuration

### Cron Jobs Not Running

1. Check scheduler logs
2. Verify cron expressions are correct
3. Ensure timezone configuration is correct
4. Check Railway service is running

## Related Documentation

- **System-wide**: `/docs/architecture/`
- **Web app**: `/apps/web/docs/`
- **Shared types**: `/packages/shared-types/`
- **Deployment Topology**: `/docs/DEPLOYMENT_TOPOLOGY.md`
- **Task Index**: `/docs/TASK_INDEX.md`
