<!-- apps/worker/CLAUDE.md -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a background worker service for generating automated daily briefs. It processes asynchronous jobs using a Supabase-based queue system and integrates with a SvelteKit + Supabase application.

## Essential Commands

### Development

```bash
# Install dependencies (uses PNPM)
pnpm install

# Run in development mode with hot reload
pnpm dev

# Run specific components in watch mode
pnpm worker      # Worker only
pnpm scheduler   # Scheduler only
```

### Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run

# Generate coverage report
pnpm test:coverage

# Run scheduler-specific tests
pnpm test:scheduler
```

### Build & Production

```bash
# Build TypeScript to dist/
pnpm build

# Run production build
pnpm start

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Architecture Overview

**📄 Comprehensive Documentation**: See [Worker Brief Generation Flow Analysis](/thoughts/shared/research/2025-09-30_worker-brief-generation-flow.md) for complete technical details, data flows, and architectural decisions.

### Core Components

1. **API Server** (`src/index.ts`): Express server providing REST endpoints for brief generation and job status
2. **Worker** (`src/worker.ts`): Supabase queue worker that processes brief generation jobs with progress tracking
3. **Scheduler** (`src/scheduler.ts`): Cron-based scheduler for automated daily/weekly brief generation with engagement backoff
4. **Queue** (`src/lib/supabaseQueue.ts`): Supabase-based queue management with atomic job claiming (no Redis)

### Brief Generation Pipeline

1. **Job Initialization** → Timezone resolution and brief date calculation
2. **Project Data Fetching** → 5 parallel database queries (projects, tasks, notes, phases, calendar events)
3. **Project Brief Generation** → Parallel processing with task categorization (today's, overdue, upcoming, completed)
4. **Main Brief Consolidation** → Markdown generation with holiday detection and executive summary
5. **LLM Analysis** → DeepSeek Chat V3 via OpenRouter ($0.14/1M tokens) generates AI insights
6. **Email Preparation** → Non-blocking email record creation and job queuing

### Data Flow

```
User Request / Scheduler Cron
        ↓
API Server / Scheduler
        ↓
Supabase Queue (atomic job claiming)
        ↓
Worker (ProcessingJob via JobAdapter)
        ↓
briefWorker.ts → briefGenerator.ts
        ↓
Parallel project processing
        ↓
LLM Analysis (SmartLLMService)
        ↓
Email Job Queued (non-blocking)
        ↓
Real-time Notification (Supabase Realtime)
```

### Key Design Patterns

- **Redis-Free Queue**: All queue operations via Supabase RPCs with atomic job claiming
- **Job Adapter Pattern**: Zero-downtime migration from BullMQ to Supabase queues
- **Timezone-aware Scheduling**: Uses date-fns-tz to handle user timezones correctly
- **Real-time Progress**: Supabase Realtime channels for instant updates with exponential backoff retries
- **Multi-project Consolidation**: Single brief aggregates multiple user projects with parallel processing
- **Dual Email Transport**: Webhook (HMAC-secured POST to main app) OR Direct SMTP (Gmail)
- **Engagement Backoff**: Intelligent throttling (4 emails vs 60 in 2 months for inactive users)
- **DeepSeek-First LLM**: 95% cost reduction vs Anthropic models, automatic fallback to premium models
- **Error Isolation**: Multi-layer error handling with `Promise.allSettled` and per-job isolation

## Database Schema

The service expects these Supabase tables:

**Core Tables:**

- `queue_jobs`: Job tracking with status, attempts, metadata, and progress
- `daily_briefs`: Main brief records with LLM analysis and generation status
- `project_daily_briefs`: Per-project detailed briefs with task stats
- `user_brief_preferences`: User timezone, frequency, and email preferences

**Supporting Tables:**

- `users`: User data with email and last_visit timestamp
- `projects`: Active user projects
- `tasks`: Project tasks with start dates and status
- `notes`: Project notes for context
- `phases`: Project phases with ordering
- `phase_tasks`: Phase-task relationships
- `task_calendar_events`: Calendar sync status

**Email Tables:**

- `emails`: Email records with tracking IDs and status
- `email_recipients`: Per-recipient tracking (opens, clicks, status)
- `email_logs`: SMTP send logs with message IDs
- `email_tracking_events`: Granular event tracking (opened, sent, failed)

**Database RPCs** (atomic operations):

- `add_queue_job`: Atomic job insertion with deduplication
- `claim_pending_jobs`: Atomic batch job claiming
- `complete_queue_job`: Mark job as completed with result
- `fail_queue_job`: Mark job as failed with retry logic
- `reset_stalled_jobs`: Recover stuck jobs
- `cancel_brief_jobs_for_date`: Atomic brief cancellation

## Environment Configuration

### Required Variables:

```bash
# Supabase (required)
PUBLIC_SUPABASE_URL=your_supabase_project_url
PRIVATE_SUPABASE_SERVICE_KEY=your_service_role_key

# LLM (required)
PRIVATE_OPENROUTER_API_KEY=your_openrouter_api_key

# Email (choose one method)
# Method 1: Webhook to main app
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://build-os.com/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=your_webhook_secret

# Method 2: Direct SMTP via Gmail
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your_app_password
GMAIL_ALIAS=noreply@build-os.com  # Optional
EMAIL_FROM_NAME=BuildOS  # Optional

# Server (optional)
PORT=3001  # Defaults to 3001
```

### Optional Configuration:

```bash
# Core Queue Settings
QUEUE_POLL_INTERVAL=5000          # Job polling interval (ms), min 1000ms
QUEUE_BATCH_SIZE=5                # Max concurrent jobs (1-20)
QUEUE_STALLED_TIMEOUT=300000      # Job stall timeout (ms), min 30000ms

# Retry & Progress
QUEUE_MAX_RETRIES=3               # Max retry attempts (0-10)
QUEUE_RETRY_BACKOFF_BASE=1000     # Exponential backoff base (ms)
QUEUE_ENABLE_PROGRESS_TRACKING=true # Enable progress updates
QUEUE_PROGRESS_UPDATE_RETRIES=3   # Progress update retry attempts

# Health & Monitoring
QUEUE_ENABLE_HEALTH_CHECKS=true   # Enable health monitoring
QUEUE_STATS_UPDATE_INTERVAL=60000 # Stats logging interval (ms)

# Performance
QUEUE_WORKER_TIMEOUT=600000       # Max job execution time (ms, 10 min default)
QUEUE_ENABLE_CONCURRENT_PROCESSING=true # Concurrent processing

# Features
ENGAGEMENT_BACKOFF_ENABLED=false  # Enable engagement-based throttling
WEBHOOK_TIMEOUT=30000             # Webhook timeout (ms) for email delivery
```

**Environment-Specific Defaults:**

- **Development**: Poll 2s, batch 2, stats 30s (faster feedback, easier debugging)
- **Production**: Poll 5s, batch 10, stats 5min (optimized throughput, less noise)
- **Custom**: Override any setting via environment variables

See `.env.example` for complete configuration options.

## Testing Strategy

- Unit tests focus on scheduler logic and timezone handling
- Use Vitest with TypeScript support
- Test files follow `*.test.ts` pattern
- Manual testing utilities available in `tests/manual-test.ts`

## Deployment Notes

- Deployed on Railway with Nixpacks builder
- Health checks configured at `/health`
- Automatic restarts on failure
- Supabase-based queue (no Redis needed)
- Requires Node.js 18+ runtime
- Database migrations required before deployment

## Common Development Tasks

### Adding New Job Types

1. Define job data interface in `src/workers/shared/queueUtils.ts`
2. Add processor logic in `src/worker.ts`
3. Create API endpoint in `src/index.ts`
4. Register processor with queue.process()

### Modifying Schedule Logic

1. Edit cron patterns in `src/scheduler.ts`
2. Update timezone calculations if needed
3. Add tests in `tests/scheduler.test.ts`

### Debugging Queue Issues

- Monitor job status in `queue_jobs` table
- Check `/queue/stats` endpoint for metrics
- Review worker logs for processing errors
- Use SQL queries to inspect queue state
