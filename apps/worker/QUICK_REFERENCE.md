<!-- apps/worker/QUICK_REFERENCE.md -->

# Worker App - Quick Reference Guide

## Overview

The BuildOS Worker is a background job processing service that runs on Railway. It processes jobs for daily brief generation, SMS scheduling, email delivery, and notifications using a **Supabase-based queue** (no Redis).

- **Port:** 3001
- **Language:** TypeScript
- **Queue:** Supabase (PostgreSQL-backed)
- **Scheduler:** node-cron (hourly & daily)
- **Framework:** Express.js
- **Deployment:** Railway (Nixpacks)

---

## Key Files

### Entry Points

| File               | Purpose                        |
| ------------------ | ------------------------------ |
| `src/index.ts`     | Express API server (port 3001) |
| `src/worker.ts`    | Queue processor startup        |
| `src/scheduler.ts` | Cron job scheduler             |

### Core Services

| Service  | File                                  | Purpose                       |
| -------- | ------------------------------------- | ----------------------------- |
| Queue    | `lib/supabaseQueue.ts`                | Job storage & atomic claiming |
| LLM      | `lib/services/smart-llm-service.ts`   | DeepSeek/GPT-4o/Claude AI     |
| Email    | `lib/services/email-service.ts`       | Webhook/SMTP transport        |
| Progress | `lib/progressTracker.ts`              | Real-time job updates         |
| SMS      | `lib/services/smsMessageGenerator.ts` | SMS message templates         |

### Job Processors

| Job Type               | File                                         | Entry Point              |
| ---------------------- | -------------------------------------------- | ------------------------ |
| `generate_daily_brief` | `workers/brief/briefWorker.ts`               | POST `/queue/brief`      |
| `generate_brief_email` | `workers/brief/emailWorker.ts`               | Internal (Phase 2)       |
| `generate_phases`      | `workers/phases/phasesWorker.ts`             | POST `/queue/phases`     |
| `onboarding_analysis`  | `workers/onboarding/onboardingWorker.ts`     | POST `/queue/onboarding` |
| `send_sms`             | `workers/smsWorker.ts`                       | Internal queuing         |
| `schedule_daily_sms`   | `workers/dailySmsWorker.ts`                  | Cron midnight            |
| `send_notification`    | `workers/notification/notificationWorker.ts` | Internal queuing         |

---

## Critical Environment Variables

```bash
# REQUIRED
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PRIVATE_SUPABASE_SERVICE_KEY=eyJhbGc...
PRIVATE_OPENROUTER_API_KEY=sk-or-...

# Email (choose one)
USE_WEBHOOK_EMAIL=true                    # Preferred
BUILDOS_WEBHOOK_URL=https://...
PRIVATE_BUILDOS_WEBHOOK_SECRET=...
# OR
GMAIL_USER=noreply@build-os.com
GMAIL_APP_PASSWORD=...

# Optional but important
ENGAGEMENT_BACKOFF_ENABLED=true           # Prevent email fatigue
QUEUE_BATCH_SIZE=5                        # Concurrent jobs
QUEUE_POLL_INTERVAL=5000                  # Job polling (ms)
```

---

## Critical Cron Schedules

```
0 * * * *  = Every hour: Queue daily briefs (timezone-aware)
0 0 * * *  = Daily at midnight: Queue SMS event reminders
0 * * * *  = Every hour: Check SMS alert thresholds
```

Each cron triggers scheduler functions that read from `queue_jobs` table and create new jobs.

---

## API Endpoints (Express Server)

### Brief Management

- `POST /queue/brief` - Queue brief generation
- `GET /jobs/{jobId}` - Get job status
- `GET /users/{userId}/jobs` - List user's jobs

### Project Management

- `POST /queue/phases` - Queue phases generation

### Onboarding

- `POST /queue/onboarding` - Queue onboarding analysis

### Queue Management

- `GET /health` - Health check
- `GET /queue/stats` - Queue statistics
- `GET /queue/stale-stats` - Stale job report
- `POST /queue/cleanup` - Manual job cleanup

### Email Tracking

- `GET /email/track/open/{id}` - Track opens
- `GET /email/track/click/{id}` - Track clicks

### SMS

- `GET /sms/scheduled` - Get SMS schedule
- `POST /sms/scheduled` - Update SMS schedule

---

## Data Flow: Brief Generation

```
API /queue/brief or Scheduler
           ↓
Queue job: generate_daily_brief
           ↓
processBrief(job)
           ├─ PHASE 1: Fetch projects, tasks, notes, events
           ├─ PHASE 2: Generate per-project briefs
           ├─ PHASE 3: Consolidate & add holiday detection
           ├─ PHASE 4: LLM analysis (DeepSeek → Claude)
           ├─ PHASE 5: Queue email job (non-blocking)
           └─ PHASE 6: Real-time notification
```

## Database RPCs (Atomic Operations)

- `add_queue_job()` - Insert with dedup
- `claim_pending_jobs()` - Atomic batch claim
- `complete_queue_job()` - Mark complete
- `fail_queue_job()` - Mark failed with retry
- `reset_stalled_jobs()` - Recover stuck jobs
- `cancel_brief_jobs_for_date()` - Cancel briefs

---

## Queue Configuration

**Config File:** `src/config/queueConfig.ts`

### Default Values

```
Development: poll 2s, batch 2, stats 30s
Production: poll 5s, batch 10, stats 5min
```

### Validation Constraints

- `pollInterval`: min 1000ms, max no limit
- `batchSize`: min 1, max 20
- `stalledTimeout`: min 30000ms (5 min)
- `maxRetries`: min 0, max 10

---

## Job Status Flow

```
pending → processing → completed
              ↓
          (error) → queued_for_retry
                         ↓
                      pending (retry)

Failed after all retries → failed (terminal)
Cancelled by user → cancelled (terminal)
```

---

## Development Commands

```bash
# Install & build
pnpm install
pnpm build

# Development (all components)
pnpm dev

# Specific components
pnpm worker      # Worker only
pnpm scheduler   # Scheduler only

# Testing
pnpm test                # Watch mode
pnpm test:run           # Run once
pnpm test:scheduler     # Scheduler tests
pnpm test:coverage      # Coverage report

# Linting
pnpm lint               # Check
pnpm lint:fix          # Auto-fix
pnpm typecheck         # Type check
pnpm pre-push          # Full validation
```

---

## Production Deployment

### Platform: Railway

1. **Build:** `pnpm build` (TypeScript → dist/)
2. **Start:** `node dist/index.js`
3. **Health Check:** `GET /health` endpoint (auto-restart on failure)
4. **Database:** Requires migrations (see `/migrations`)

### Required Environment Variables

All 3 categories must be set:

1. Supabase credentials
2. LLM API key
3. Email transport (webhook OR SMTP)

### Graceful Shutdown

- Responds to SIGTERM/SIGINT
- Stops accepting new jobs
- Allows in-flight jobs to complete (timeout-based)

---

## Monitoring & Debugging

### Health Check Endpoint

```bash
curl http://localhost:3001/health
```

### Queue Statistics

```bash
curl http://localhost:3001/queue/stats
```

### Manual Cleanup (Admin)

```bash
curl -X POST http://localhost:3001/queue/cleanup \
  -H "Content-Type: application/json" \
  -d '{"staleThresholdHours": 24, "dryRun": true}'
```

### Database Queries

```sql
-- View pending jobs
SELECT * FROM queue_jobs
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;

-- View stalled jobs (>5 min)
SELECT * FROM queue_jobs
WHERE status = 'processing'
AND started_at < NOW() - INTERVAL '5 minutes'
LIMIT 10;

-- View job history
SELECT job_type, status, COUNT(*) as count
FROM queue_jobs
GROUP BY job_type, status
ORDER BY count DESC;
```

---

## LLM Service (SmartLLMService)

**Primary:** DeepSeek Chat V3 ($0.14/1M tokens)
**Fallback 1:** GPT-4o (OpenAI)
**Fallback 2:** Claude 3.5 Sonnet (Anthropic)

Automatic fallback on:

- Rate limits (429)
- Model unavailability
- Token limit exceeded

---

## Email Transport

### Webhook Mode (Preferred)

- HMAC-signed POST to web app
- Low latency
- Handles tracking & delivery

### SMTP Mode (Fallback)

- Direct Gmail connection
- Configured via app password
- Logs message ID for tracking

Set via `USE_WEBHOOK_EMAIL` environment variable.

---

## Common Issues & Solutions

### Jobs stuck in "processing" (>5 min)

1. Check logs for errors
2. Verify database connection
3. Run manual cleanup: `POST /queue/cleanup`
4. Check stalled timeout config

### High memory usage

1. Check batch size (reduce from default 5)
2. Monitor concurrent jobs
3. Review LLM response sizes
4. Check email template size

### Missing briefs

1. Verify scheduler is running (cron logs)
2. Check user_brief_preferences (is_active = true)
3. Verify user timezone is valid
4. Check engagement backoff (if enabled)

### Email not sending

1. Check `USE_WEBHOOK_EMAIL` value
2. Verify SMTP credentials (if using Gmail)
3. Check webhook URL is accessible
4. Review email_logs table for errors

---

## Documentation Files

| File                           | Purpose                                 |
| ------------------------------ | --------------------------------------- |
| `CLAUDE.md`                    | Development guide & architecture        |
| `WORKER_STRUCTURE_OVERVIEW.md` | Complete directory & component overview |
| `WORKER_JOBS_AND_FLOWS.md`     | Job types, data flows & API reference   |
| `QUICK_REFERENCE.md`           | This file                               |

---

## Important Notes

- **No Redis:** Uses Supabase PostgreSQL-backed queue (atomic job claiming)
- **Timezone-Aware:** All scheduling respects user timezone (centralized in `users` table)
- **Non-blocking Email:** Brief generation doesn't wait for email to send
- **Real-time Progress:** Updates via Supabase Realtime for instant UI feedback
- **Engagement-Based:** Optional feature flag to prevent over-emailing inactive users
- **Cost-Optimized:** DeepSeek is 95% cheaper than Anthropic models

---

## Related Documentation

- **Web App Documentation:** `/apps/web/docs/`
- **Database Schema:** Supabase console → SQL Editor
- **Deployment Topology:** `/docs/DEPLOYMENT_TOPOLOGY.md`
- **Architecture Diagrams:** `/docs/architecture/diagrams/`
