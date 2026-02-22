<!-- apps/worker/docs/WORKER_STRUCTURE_OVERVIEW.md -->

# BuildOS Worker App - Comprehensive Structure Overview

## Overview

The BuildOS Worker is a background job processing service built with **Node.js + Express** that handles asynchronous tasks like daily brief generation, SMS scheduling, email delivery, and notifications. It uses a **Supabase-based queue system** (no Redis) with cron-based scheduling.

**Total Lines of Code:** ~14,677 TypeScript lines

---

## Directory Structure

```
/apps/worker/
├── src/                                # Source code
│   ├── index.ts                       # Express API server & entry point
│   ├── worker.ts                      # Queue worker & job processors
│   ├── scheduler.ts                   # Cron-based scheduler (daily/weekly briefs, SMS)
│   ├── config/
│   │   └── queueConfig.ts            # Queue configuration management
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client initialization
│   │   ├── supabaseQueue.ts          # Core queue implementation (atomic job claiming)
│   │   ├── progressTracker.ts        # Job progress tracking via Supabase
│   │   ├── briefBackoffCalculator.ts # Engagement-based backoff logic
│   │   ├── database.types.ts         # Database type definitions (generated)
│   │   ├── config/
│   │   │   └── llm-config.ts        # LLM model configuration
│   │   ├── types/
│   │   │   └── llm.ts               # LLM type definitions
│   │   ├── services/                # Business logic services
│   │   │   ├── smart-llm-service.ts # LLM analysis (DeepSeek, OpenAI, Claude)
│   │   │   ├── llm-pool.ts          # LLM provider connection pooling
│   │   │   ├── email-service.ts     # Email configuration & setup
│   │   │   ├── email-sender.ts      # Email sending (webhook & SMTP)
│   │   │   ├── gmail-transporter.ts # Gmail configuration
│   │   │   ├── webhook-email-service.ts # Webhook-based email delivery
│   │   │   ├── smsMessageGenerator.ts  # SMS message template generation
│   │   │   ├── smsAlerts.service.ts    # SMS alert threshold management
│   │   │   └── smsMetrics.service.ts   # SMS metrics tracking
│   │   └── utils/                   # Utility functions
│   │       ├── markdown.ts          # Markdown parsing & conversion
│   │       ├── emailTemplate.ts     # Email HTML template generation
│   │       ├── holiday-finder.ts    # Holiday detection utility
│   │       ├── llm-utils.ts         # LLM utility functions
│   │       ├── activityLogger.ts    # Activity logging for audit trail
│   │       ├── smsPreferenceChecks.ts # SMS quiet hours & opt-out validation
│   │       └── queueCleanup.ts      # Stale job cleanup utilities
│   ├── workers/                    # Job processors (one per job type)
│   │   ├── brief/
│   │   │   ├── briefWorker.ts      # Main brief generation processor
│   │   │   ├── briefGenerator.ts   # Brief generation logic
│   │   │   ├── emailWorker.ts      # Email-specific brief processor (Phase 2)
│   │   │   └── prompts.ts          # LLM prompts for brief analysis
│   │   ├── sms/
│   │   │   └── prompts.ts          # SMS message LLM prompts
│   │   ├── notification/
│   │   │   ├── notificationWorker.ts      # Multi-channel notification processor
│   │   │   ├── emailAdapter.ts            # Email delivery adapter
│   │   │   ├── smsAdapter.ts              # SMS delivery adapter
│   │   │   └── preferenceChecker.ts       # User preference validation
│   │   ├── onboarding/
│   │   │   ├── onboardingWorker.ts        # Onboarding analysis processor
│   │   │   ├── onboardingAnalysisService.ts # Onboarding logic
│   │   │   └── prompts.ts                 # LLM prompts for onboarding
│   │   ├── phases/
│   │   │   └── phasesWorker.ts    # Project phases generation processor
│   │   ├── dailySmsWorker.ts      # Daily SMS event reminder scheduler
│   │   └── shared/
│   │       ├── jobAdapter.ts      # Job type adapter for legacy compatibility
│   │       └── queueUtils.ts      # Queue utilities & validation
│   ├── routes/                    # API endpoints
│   │   ├── email-tracking.ts      # Email open/click tracking routes
│   │   ├── sms/
│   │   │   └── scheduled.ts       # SMS schedule management routes
│   │   └── webhooks/
│   │       └── daily-brief-email/ # Webhook handlers
│   └── [Generated dist/]          # Compiled TypeScript (ignored in git)
│
├── tests/                         # Test files
│   ├── scheduler.test.ts          # Scheduler logic tests
│   ├── briefBackoffCalculator.test.ts # Backoff calculation tests
│   ├── scheduler-parallel.test.ts # Parallel scheduling tests
│   ├── email-sender.test.ts       # Email sending tests
│   └── test-url-transform.ts      # URL transformation tests
│
├── docs/                          # Documentation
│   ├── features/                  # Feature documentation
│   ├── operations/                # Operational guides
│   └── technical/                 # Technical architecture
│
├── scripts/                       # Utility scripts
├── migrations/                    # Database migrations
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
├── vitest.config.ts              # Test configuration
└── .env.example                   # Environment variables template
```

---

## Entry Points

### 1. **API Server** (`src/index.ts`)

- **Port:** 3001 (configurable via `PORT` env var)
- **Framework:** Express + CORS
- **Endpoints:**
    - `POST /queue/brief` - Queue daily brief generation
    - `POST /queue/phases` - Queue project phases generation
    - `POST /queue/onboarding` - Queue onboarding analysis
    - `POST /queue/cleanup` - Manual queue cleanup (admin)
    - `GET /health` - Health check
    - `GET /queue/stats` - Queue statistics
    - `GET /queue/stale-stats` - Stale job statistics
    - `GET /jobs/:jobId` - Get job status
    - `GET /users/:userId/jobs` - Get user's jobs
    - `POST /email/track` - Email tracking webhook (from email service)
    - `GET/POST /sms/scheduled` - SMS schedule management

### 2. **Worker Processor** (`src/worker.ts`)

- Starts Supabase queue and registers job processors
- Performs startup cleanup of stale jobs (24+ hours old)
- Handles graceful shutdown on SIGTERM/SIGINT
- Key job types registered:
    - `generate_daily_brief` → `processBrief()`
    - `generate_brief_email` → `processEmailBrief()`
    - `generate_phases` → `processPhases()`
    - `onboarding_analysis` → `processOnboarding()`
    - `send_notification` → `processNotificationWrapper()`
    - `send_sms` → `processSMS()`
    - `schedule_daily_sms` → `processScheduleDailySMS()`

### 3. **Scheduler** (`src/scheduler.ts`)

- **Cron Jobs:**
    - `0 * * * *` - Hourly: Check & schedule daily briefs
    - `0 0 * * *` - Midnight: Schedule daily SMS reminders
    - `0 * * * *` - Hourly: Check SMS alert thresholds
    - Runs initial check 5 seconds after startup
- **Features:**
    - Timezone-aware scheduling (uses user's timezone from `users` table)
    - Engagement backoff (if enabled) to prevent over-emailing
    - Batch processing with max 20 concurrent DB queries
    - Pre-generation buffer (2 minutes before notification time)
    - Duplicate job detection (30-minute tolerance window)

---

## Job Types & Workers

### 1. **Daily Brief Generation** (`generate_daily_brief`)

- **Processor:** `workers/brief/briefWorker.ts`
- **Flow:**
    1. Validate job data (userId, briefDate, timezone)
    2. Fetch user's projects, tasks, notes, calendar events in parallel
    3. Generate per-project briefs with task categorization
    4. Consolidate into main brief with markdown formatting
    5. Run LLM analysis via SmartLLMService (DeepSeek → Claude fallback)
    6. Queue email sending job (non-blocking)
    7. Send real-time notification via Supabase Realtime
- **Entry Points:**
    - Scheduler (automated hourly)
    - API POST `/queue/brief` (on-demand)
    - Force regenerate flag (cancels existing jobs for same date)

### 2. **Email Brief Delivery** (`generate_brief_email`)

- **Processor:** `workers/brief/emailWorker.ts`
- **Purpose:** Phase 2 - Decouple email from brief generation
- **Features:**
    - Fetches pre-generated brief from database
    - Converts markdown to HTML
    - Generates tracking links (opens, clicks)
    - Sends via webhook or SMTP based on configuration
    - Logs delivery status

### 3. **Project Phases Generation** (`generate_phases`)

- **Processor:** `workers/phases/phasesWorker.ts`
- **Purpose:** Generate AI-suggested project phases for better task organization
- **Triggered:** On-demand via API `/queue/phases`
- **Features:**
    - Analyzes project tasks and structure
    - Uses LLM to suggest logical phases
    - Prevents duplicate/conflicting phase generation with dedup key

### 4. **Onboarding Analysis** (`onboarding_analysis`)

- **Processor:** `workers/onboarding/onboardingWorker.ts`
- **Purpose:** Analyze user onboarding context and generate insights
- **Entry Points:**
    - API POST `/queue/onboarding`
    - High priority (1) for immediate processing
- **Features:**
    - Validates onboarding data
    - Uses LLM for context analysis
    - Prevents duplicate jobs unless force regenerate
    - Stores analysis results for onboarding flow

### 5. **SMS Sending** (`send_sms`)

- **Processor:** `workers/smsWorker.ts`
- **Purpose:** Send individual SMS messages via Twilio
- **Requires:** Twilio credentials (optional, fails gracefully if not configured)
- **Features:**
    - Validates SMS preferences and quiet hours
    - Tracks SMS metrics
    - Handles delivery failures with retry logic
    - Updates SMS delivery status in database

### 6. **Daily SMS Scheduling** (`schedule_daily_sms`)

- **Processor:** `workers/dailySmsWorker.ts`
- **Purpose:** Schedule SMS reminders for calendar events
- **Triggered:** Scheduler at midnight (00:00) daily
- **Features:**
    - Fetches user's calendar events for the day
    - Generates event reminders with lead time
    - Respects quiet hours (from user preferences)
    - Batches SMS sending for efficiency
    - Tracks scheduled count per user

### 7. **Multi-Channel Notifications** (`send_notification`)

- **Processor:** `workers/notification/notificationWorker.ts`
- **Purpose:** Send notifications via multiple channels
- **Supported Channels:**
    - Browser push notifications (via web-push + VAPID keys)
    - In-app notifications (Supabase Realtime)
    - Email (via emailAdapter)
    - SMS (via smsAdapter - future)
- **Features:**
    - Channel-specific adapters for extensibility
    - User preference checking (email/SMS opt-out)
    - Event payload transformation & validation
    - Correlation tracking for debugging
    - Exponential backoff on push notification retry

---

## Core Services

### **Queue Service** (`lib/supabaseQueue.ts`)

- **Type:** Supabase RPC-based queue (no Redis)
- **Key Features:**
    - Atomic job claiming with `claim_pending_jobs()` RPC
    - Deduplication via `dedupKey` parameter
    - Job status tracking (pending → processing → completed/failed)
    - Progress tracking via `updateProgress()` method
    - Stalled job recovery (>5 min without heartbeat)
    - Configurable poll interval & batch size

### **LLM Service** (`lib/services/smart-llm-service.ts`)

- **Primary:** DeepSeek Chat V3 ($0.14/1M input tokens)
- **Fallback 1:** GPT-4o via OpenAI API
- **Fallback 2:** Claude 3.5 Sonnet via Anthropic
- **Features:**
    - Model fallback chain on rate limits/failures
    - Token counting for cost tracking
    - Stream processing for large responses
    - Error isolation per prompt
    - LLM pool for connection reuse

### **Email Service** (`lib/services/email-service.ts`)

- **Dual Transport:**
    1. **Webhook Mode:** HMAC-signed POST to main app (preferred, low latency)
    2. **SMTP Mode:** Direct Gmail connection (fallback)
- **Features:**
    - Configuration validation at startup
    - Logging of transport method used
    - Template generation with HTML sanitization
    - Email tracking link injection
    - Retry logic for failed sends

### **Notification Service** (`workers/notification/notificationWorker.ts`)

- **Channels:** Push, In-app, Email, SMS (extensible)
- **Features:**
    - Channel-specific adapters
    - User preference checking
    - Payload validation & transformation
    - Correlation ID tracking
    - Fallback to in-app if push fails

### **Progress Tracker** (`lib/progressTracker.ts`)

- **Purpose:** Real-time job progress updates
- **Transport:** Supabase Realtime channel
- **Features:**
    - Updates progress without blocking main job
    - Exponential backoff on failure
    - Configurable retry attempts
    - Non-blocking (errors don't fail job)

### **Engagement Backoff** (`lib/briefBackoffCalculator.ts`)

- **Purpose:** Prevent email fatigue for inactive users
- **Feature Flag:** `ENGAGEMENT_BACKOFF_ENABLED` (default: false)
- **Logic:**
    - Tracks last_login timestamp
    - Calculates days since last login
    - Implements 4 emails in first week, then throttles to ~60/month for inactive users
    - Enables re-engagement campaigns for dormant accounts

---

## Queue Configuration

### Configuration File

**Location:** `src/config/queueConfig.ts`

### Configuration Options

```typescript
interface QueueConfiguration {
	// Core
	pollInterval: 5000; // Job polling interval (min 1000ms)
	batchSize: 5; // Max concurrent jobs (1-20)
	stalledTimeout: 300000; // Stalled timeout (min 30000ms)

	// Retry
	maxRetries: 3; // Max retry attempts (0-10)
	retryBackoffBase: 1000; // Exponential backoff base (ms)

	// Progress
	enableProgressTracking: true;
	progressUpdateRetries: 3;

	// Health
	statsUpdateInterval: 60000; // Stats logging (min 10000ms)
	enableHealthChecks: true;

	// Performance
	workerTimeout: 600000; // Job timeout (min 10000ms)
	enableConcurrentProcessing: true;
}
```

### Environment Profiles

- **Development:** Poll 2s, batch 2, stats 30s (faster feedback)
- **Production:** Poll 5s, batch 10, stats 5min (optimized throughput)

### Environment Variables

```bash
# Core Queue
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
QUEUE_STALLED_TIMEOUT=300000

# Retry
QUEUE_MAX_RETRIES=3
QUEUE_RETRY_BACKOFF_BASE=1000

# Progress
QUEUE_ENABLE_PROGRESS_TRACKING=true
QUEUE_PROGRESS_UPDATE_RETRIES=3

# Health
QUEUE_ENABLE_HEALTH_CHECKS=true
QUEUE_STATS_UPDATE_INTERVAL=60000

# Performance
QUEUE_WORKER_TIMEOUT=600000
QUEUE_ENABLE_CONCURRENT_PROCESSING=true
```

---

## Database Tables & RPCs

### Core Tables Used

1. **queue_jobs** - Job tracking with status, attempts, metadata
2. **daily_briefs** - Generated briefs with LLM analysis
3. **project_daily_briefs** - Per-project brief details
4. **user_brief_preferences** - User schedule & timezone
5. **users** - User data (timezone, email, last_visit)
6. **projects** - User projects
7. **tasks** - Project tasks
8. **notes** - Project notes
9. **phases** - Project phases
10. **emails** - Email records with tracking
11. **email_recipients** - Per-recipient tracking
12. **email_logs** - SMTP send logs

### Database RPCs (Atomic Operations)

- `add_queue_job()` - Insert job with dedup
- `claim_pending_jobs()` - Batch claim jobs (atomic)
- `complete_queue_job()` - Mark job completed
- `fail_queue_job()` - Mark job failed with retry
- `reset_stalled_jobs()` - Recover stuck jobs
- `cancel_brief_jobs_for_date()` - Atomic cancellation

---

## Utilities & Helpers

### Utility Files

1. **markdown.ts** - Parse & convert markdown
2. **emailTemplate.ts** - Generate email HTML
3. **holiday-finder.ts** - Detect holidays for briefing
4. **activityLogger.ts** - Audit trail logging
5. **smsPreferenceChecks.ts** - Validate SMS sending (quiet hours, opt-out)
6. **queueCleanup.ts** - Find & cleanup stale jobs
7. **llm-utils.ts** - LLM utility functions

### Shared Utilities

1. **jobAdapter.ts** - Adapt ProcessingJob to legacy format
2. **queueUtils.ts** - Job validation & status updates

---

## Key Architecture Patterns

### 1. **Atomic Job Claiming**

- Uses Supabase RPC `claim_pending_jobs()` for atomic batch claiming
- No Redis needed - all state in PostgreSQL
- Prevents double-processing with database-level locking

### 2. **Job Adapter Pattern**

- `ProcessingJob` → `LegacyJob` adapter for backward compatibility
- Zero-downtime migration from BullMQ to Supabase
- Maintains interface compatibility with existing code

### 3. **Timezone-Aware Scheduling**

- Centralized timezone source: `users.timezone` column
- Uses `date-fns-tz` for correct timezone handling
- Validates timezone at runtime with `Intl.DateTimeFormat`
- Fallback to UTC for invalid timezones

### 4. **Error Isolation**

- `Promise.allSettled()` for parallel operations
- Per-job error handling doesn't crash worker
- Retry logic with exponential backoff
- Multi-layer error handlers (uncaughtException, unhandledRejection)

### 5. **Dual Email Transport**

- Primary: Webhook to main app (HMAC-signed, low latency)
- Fallback: Direct SMTP via Gmail
- Configuration-driven selection
- Both support tracking link injection

### 6. **LLM Model Fallback Chain**

- Primary: DeepSeek (cheapest, 95% cost reduction)
- Fallback 1: GPT-4o (higher quality if needed)
- Fallback 2: Claude 3.5 Sonnet (premium)
- Automatic retry on rate limits

### 7. **Real-time Progress Tracking**

- Non-blocking progress updates via Supabase Realtime
- Exponential backoff on channel subscription failures
- Updates don't block job processing

---

## Testing

### Test Files

- **scheduler.test.ts** - Scheduler logic & timezone handling
- **briefBackoffCalculator.test.ts** - Engagement backoff calculations
- **scheduler-parallel.test.ts** - Parallel scheduling behavior
- **email-sender.test.ts** - Email sending integration
- **test-url-transform.ts** - URL transformation tests

### Test Runner

- **Framework:** Vitest
- **Commands:**
    - `pnpm test` - Watch mode
    - `pnpm test:run` - Run once
    - `pnpm test:scheduler` - Scheduler tests only
    - `pnpm test:coverage` - Coverage report

---

## Deployment

### Platform

- **Hosting:** Railway.app
- **Builder:** Nixpacks
- **Runtime:** Node.js 18+
- **Build Output:** `dist/` directory (TypeScript compiled)

### Required Migrations

Database migrations must be run before deployment (see `/migrations` directory)

### Health Checks

- Endpoint: `GET /health`
- Response includes queue stats and service status
- Used by Railway for automatic restarts

### Graceful Shutdown

- Responds to SIGTERM/SIGINT
- Stops queue processing before exit
- Allows in-flight jobs to complete (timeout-based)

---

## Environment Variables (Required)

```bash
# Supabase (REQUIRED)
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PRIVATE_SUPABASE_SERVICE_KEY=eyJhbGc...

# LLM (REQUIRED)
PRIVATE_OPENROUTER_API_KEY=sk-or-...

# Email (Choose one method)
# Webhook method (preferred)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://build-os.com/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=your_secret

# OR SMTP method
GMAIL_USER=noreply@build-os.com
GMAIL_APP_PASSWORD=your_app_password

# SMS (Optional)
PRIVATE_TWILIO_ACCOUNT_SID=ACxxxxxxxx
PRIVATE_TWILIO_AUTH_TOKEN=your_token
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx

# Push Notifications (Optional)
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key

# Server
PORT=3001
NODE_ENV=production
```

---

## Performance Metrics

### Code Size

- **Total TypeScript:** ~14,677 lines
- **Workers:** ~40-150 lines each (modular)
- **Services:** 100-400 lines each

### Queue Performance

- **Default Poll Interval:** 5 seconds
- **Default Batch Size:** 5 concurrent jobs
- **Stalled Job Timeout:** 5 minutes
- **Job Retry Backoff:** Exponential (1s, 2s, 4s, etc.)

### LLM Performance (DeepSeek)

- **Cost:** $0.14 per 1M input tokens (~95% cheaper than Anthropic)
- **Response Time:** 2-10 seconds depending on brief complexity
- **Fallback Chain:** OpenAI GPT-4o → Claude 3.5 Sonnet

---

## Summary Table

| Component           | Type            | Location                            | Purpose                                      |
| ------------------- | --------------- | ----------------------------------- | -------------------------------------------- |
| API Server          | Express         | `src/index.ts`                      | REST endpoints for job queueing & management |
| Worker              | Queue Processor | `src/worker.ts`                     | Main job processing loop                     |
| Scheduler           | Cron            | `src/scheduler.ts`                  | Automated daily/weekly scheduling            |
| Queue               | Supabase RPC    | `src/lib/supabaseQueue.ts`          | Job storage & atomic claiming                |
| LLM Service         | Integration     | `lib/services/smart-llm-service.ts` | AI analysis (DeepSeek primary)               |
| Email Service       | Integration     | `lib/services/email-service.ts`     | Webhook & SMTP transport                     |
| Brief Worker        | Processor       | `workers/brief/briefWorker.ts`      | Daily brief generation                       |
| Email Worker        | Processor       | `workers/brief/emailWorker.ts`      | Email delivery (Phase 2)                     |
| SMS Worker          | Processor       | `workers/smsWorker.ts`              | Twilio SMS sending                           |
| Daily SMS Worker    | Processor       | `workers/dailySmsWorker.ts`         | Event reminder scheduling                    |
| Notification Worker | Processor       | `workers/notification/`             | Multi-channel notifications                  |
| Phases Worker       | Processor       | `workers/phases/phasesWorker.ts`    | Project phase generation                     |
| Onboarding Worker   | Processor       | `workers/onboarding/`               | Onboarding analysis                          |
| Progress Tracker    | Utility         | `lib/progressTracker.ts`            | Real-time progress updates                   |
| Engagement Backoff  | Utility         | `lib/briefBackoffCalculator.ts`     | Email fatigue prevention                     |
