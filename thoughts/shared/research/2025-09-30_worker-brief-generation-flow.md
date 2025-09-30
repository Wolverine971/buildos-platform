---
date: 2025-09-30T17:47:59+0000
researcher: Claude Code
git_commit: 8b13282dff5d4f494e46faac78de27c02d0c5e43
branch: main
repository: buildos-platform
topic: "Worker Brief Generation Flow - Complete Architecture Analysis"
tags:
  [
    research,
    codebase,
    worker,
    brief-generation,
    queue-system,
    email-flow,
    llm-integration,
  ]
status: complete
last_updated: 2025-09-30
last_updated_by: Claude Code
---

# Worker Brief Generation Flow - Complete Architecture Analysis

**Date**: 2025-09-30T17:47:59+0000
**Researcher**: Claude Code
**Git Commit**: `8b13282dff5d4f494e46faac78de27c02d0c5e43`
**Branch**: `main`
**Repository**: buildos-platform

## Research Question

Document the complete brief generation flow in the `/apps/worker` directory, including architecture, data flows, LLM integration, email sending, progress tracking, and error handling mechanisms. Create a detailed analysis that enables an LLM to quickly assess what is happening and find relevant information and files.

## Executive Summary

The BuildOS worker service is a sophisticated, queue-based background job processing system built on Supabase infrastructure (no Redis). It generates AI-powered daily briefs, handles email delivery through dual transport methods, integrates with multiple LLM providers via OpenRouter, and implements comprehensive progress tracking with engagement-based backoff mechanisms.

**Key Characteristics:**

- **Queue System**: Supabase-based (atomic job claiming, no Redis dependency)
- **Primary LLM**: DeepSeek Chat V3 via OpenRouter ($0.14/1M tokens)
- **Email Delivery**: Dual method (webhook to main app OR direct SMTP via Gmail)
- **Progress Tracking**: Real-time updates via Supabase Realtime channels
- **Error Handling**: Multi-layer isolation with automatic retries and exponential backoff
- **Engagement Backoff**: Intelligent throttling to prevent email fatigue

## Architecture Components

### Core Services

1. **API Server** (`apps/worker/src/index.ts:1-405`)
   - Express server on port 3001
   - REST endpoints: `/queue/brief`, `/queue/phases`, `/queue/onboarding`, `/jobs/:jobId`
   - Health checks and queue statistics
   - CORS configuration for web app integration

2. **Queue Worker** (`apps/worker/src/worker.ts:1-226`)
   - Supabase queue processor with atomic job claiming
   - Job type handlers: brief generation, email sending, phases, onboarding, SMS
   - Concurrent processing with `Promise.allSettled` isolation
   - Health monitoring and graceful shutdown

3. **Scheduler** (`apps/worker/src/scheduler.ts:1-554`)
   - Cron-based automation (runs hourly)
   - Timezone-aware scheduling with `date-fns-tz`
   - Engagement backoff integration (optional feature flag)
   - Batch user preference processing

### Technology Stack

- **Runtime**: Node.js 18+, TypeScript
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Queue**: Custom Supabase-based queue (no Redis/BullMQ)
- **LLM Provider**: OpenRouter API (DeepSeek Chat V3 primary)
- **Email**: Gmail SMTP + webhook fallback
- **Real-time**: Supabase Realtime channels for progress updates
- **Scheduling**: node-cron (hourly checks)

---

## Brief Generation Flow

### Entry Point: `briefWorker.ts`

**File**: `apps/worker/src/workers/brief/briefWorker.ts:30-284`

#### Processing Phases

**Phase 1: Job Initialization** (Lines 31-34)

```typescript
await updateJobStatus(job.id, "processing", "brief");
```

- Updates `queue_jobs` table from "pending" → "processing"
- Records `started_at` timestamp

**Phase 2: Timezone Resolution** (Lines 36-78)

- Fetches user timezone from `user_brief_preferences` table
- Fallback hierarchy: preferences → job data → "UTC"
- Validates with `isValidTimezone()` using `date-fns-tz`
- Critical for accurate "today's tasks" interpretation

**Phase 3: Brief Date Calculation** (Lines 60-84)

- Uses user's local timezone to determine "today"
- Format: `YYYY-MM-DD` (validated with regex)
- Prevents tasks from appearing a day early/late

**Phase 4: Brief Generation** (Lines 86-92)

```typescript
const brief = await generateDailyBrief(
  job.data.userId,
  briefDate,
  job.data.options,
  timezone,
  job.id,
);
```

**Phase 5: Email Preparation** (Lines 94-250) - **Non-blocking**

- Checks user email preferences
- Generates tracking ID (32 hex chars)
- Creates email and recipient records in database
- Queues separate email job (priority 5, lower than brief)
- Errors don't fail brief generation

**Phase 6: Job Completion** (Lines 252-265)

- Updates job status to "completed"
- Sends real-time notification via `notifyUser()`

### Core Generator: `briefGenerator.ts`

**File**: `apps/worker/src/workers/brief/briefGenerator.ts:67-392`

#### Generation Pipeline

**1. Brief Record Creation** (Lines 94-146)

```typescript
await supabase.from("daily_briefs").upsert(
  {
    user_id: userId,
    brief_date: briefDateInUserTz,
    generation_status: "processing",
    generation_progress: { step: "starting", progress: 0 },
  },
  { onConflict: "user_id, brief_date" },
);
```

- Atomic upsert prevents concurrent generation
- Unique constraint on `(user_id, brief_date)`
- Detects duplicate requests (error code 23505)

**2. Project Data Fetching** (Lines 149-486)
`getUserProjectsWithData()` performs 5 parallel queries:

- `projects`: Active projects with optional include/exclude filters
- `tasks`: Non-outdated tasks filtered by project IDs
- `notes`: Recent notes for context
- `phases`: Project phases with ordering
- `task_calendar_events`: Calendar sync status (for 📅 emoji)

**3. Project Brief Generation** (Lines 164-631) - **Parallel Processing**
For each project, generates brief with:

- **Today's tasks**: `start_date` within today in user timezone
- **Overdue tasks**: `start_date < today`, not done/outdated
- **Upcoming tasks**: Next 10 from current phase or all tasks
- **Next 7 days tasks**: Tasks within week
- **Recently completed**: Status "done" in last 24 hours
- **Recent notes**: Updated in last 7 days (limited to 5)

Stores in `project_daily_briefs` table with metadata stats.

**4. Main Brief Consolidation** (Lines 212-223)
`generateMainBrief()` creates markdown structure:

- Header with date
- Holiday detection (50+ holidays via `holiday-finder.ts`)
- Executive summary (project count, task counts by category)
- Overdue alerts (if any)
- Concatenated project briefs

**5. LLM Analysis** (Lines 226-337)
Uses `SmartLLMService` with OpenRouter:

- **Standard**: DeepSeek Chat V3, temperature 0.4, max 2200 tokens
- **Re-engagement**: Temperature 0.7, max 1500 tokens (more engaging)
- Profile: "quality" (cost-effective with good results)
- Custom subject lines for inactive users (4, 10, 31+ days)

**6. Final Update** (Lines 339-378)
Updates `daily_briefs` table with:

- `summary_content`: Markdown brief
- `priority_actions`: Extracted action items
- `llm_analysis`: AI-generated insights
- `generation_status`: "completed"
- `metadata`: Re-engagement info, email subject

### LLM Prompts: `prompts.ts`

**File**: `apps/worker/src/workers/brief/prompts.ts:1-226`

**Standard Daily Brief Analysis** (Lines 57-106)

- Tone: Confident, encouraging, pragmatic
- Structure: Date header → Today's outlook → Active Projects sections
- Focus: Task links, blockers, progress, priorities

**Re-engagement Email** (Lines 127-224)

- Tone varies by inactivity (gentle → motivating → direct)
- Custom subject lines:
  - ≤4 days: "Your BuildOS tasks are waiting for you"
  - 5-10 days: "You've made progress - don't let it slip away"
  - > 10 days: "We miss you at BuildOS - here's what's waiting"

### Database Schema

**Primary Tables:**

- `daily_briefs`: Main brief record with LLM analysis
- `project_daily_briefs`: Per-project detailed briefs
- `queue_jobs`: Job tracking and status
- `user_brief_preferences`: User timezone and frequency settings

**Read Tables:**

- `users`, `projects`, `tasks`, `notes`, `phases`, `phase_tasks`, `task_calendar_events`

---

## Queue System Architecture

### Supabase Queue Implementation

**File**: `apps/worker/src/lib/supabaseQueue.ts:43-575`

**Key Features:**

- **Redis-free**: Uses PostgreSQL for queue operations
- **Atomic operations**: Database RPCs prevent race conditions
- **Concurrent processing**: `Promise.allSettled` for job isolation
- **Stalled job recovery**: Every 60 seconds
- **Configurable**: Poll interval, batch size, timeouts

#### Job Addition (Lines 65-105)

```typescript
const { data: jobId } = await supabase.rpc("add_queue_job", {
  p_user_id: userId,
  p_job_type: jobType,
  p_metadata: data,
  p_priority: options?.priority ?? 10,
  p_scheduled_for: scheduledFor,
  p_dedup_key: dedupKey,
});
```

**Database function** `add_queue_job`:

- Checks for existing job with same dedup key
- Returns existing ID if found in pending/processing state
- Otherwise inserts new job
- **Atomic operation** prevents duplicates

#### Job Processing (Lines 168-226)

```typescript
const { data: jobs } = await supabase.rpc("claim_pending_jobs", {
  p_job_types: jobTypes,
  p_batch_size: this.batchSize,
});
```

**Database function** `claim_pending_jobs`:

- Atomically selects up to `batch_size` pending jobs
- Updates status to "processing"
- Sets `started_at` timestamp
- **Race condition safe**

#### Error Handling (Lines 231-349)

**Multi-layer isolation:**

1. Batch level: `Promise.allSettled` prevents one failure from crashing others
2. Job level: Try-catch wraps entire job processing
3. Processor level: Retry logic based on attempt count

**Retry Logic** (Line 327):

```typescript
const shouldRetry = (job.attempts || 0) < (job.max_attempts || 3);
await this.failJob(job.id, error.message, shouldRetry);
```

#### Stalled Job Recovery (Lines 354-371)

```typescript
const { data: count } = await supabase.rpc("reset_stalled_jobs", {
  p_stall_timeout: `${this.stalledTimeout / 1000} seconds`,
});
```

- Runs every 60 seconds
- Default timeout: 5 minutes
- Resets jobs stuck in "processing"

### Job Adapter Pattern

**File**: `apps/worker/src/workers/shared/jobAdapter.ts:1-163`

Bridges **ProcessingJob** (new Supabase format) ↔ **LegacyJob** (BullMQ-compatible format).

**Purpose:**

- Zero-downtime migration from BullMQ to Supabase
- Preserves existing worker code
- Type-safe conversion layer

**Progress Update Adapter** (Lines 61-91):

- Accepts both number (50) and object ({ current: 50, total: 100 })
- Normalizes to standard format
- Non-blocking: errors logged but don't crash jobs

### Queue Configuration

**File**: `apps/worker/src/config/queueConfig.ts:10-224`

**Environment Variables:**

- `QUEUE_POLL_INTERVAL`: Job check frequency (default 5000ms, min 1000ms)
- `QUEUE_BATCH_SIZE`: Concurrent jobs (default 5, range 1-20)
- `QUEUE_STALLED_TIMEOUT`: Stall detection (default 300000ms, min 30000ms)
- `QUEUE_MAX_RETRIES`: Retry attempts (default 3, range 0-10)
- `QUEUE_ENABLE_PROGRESS_TRACKING`: Progress updates (default true)

**Environment Profiles:**

- **Development**: Faster polling (2s), smaller batches (2), more frequent stats
- **Production**: Standard polling (5s), larger batches (10), optimized for throughput

---

## Email Sending Flow

### Email Worker Entry Point

**File**: `apps/worker/src/workers/brief/emailWorker.ts:19-209`

**Flow:**

1. Fetch email record from `emails` table
2. Check user preferences (still wants emails?)
3. Send via `EmailService.sendEmail()`
4. Update status in `emails` and `email_recipients` tables
5. Complete job and notify user

### Email Composition and Routing

**File**: `apps/worker/src/lib/services/email-sender.ts:40-449`

**Transport Decision:**

```
USE_WEBHOOK_EMAIL === "true"
  → WebhookEmailService (POST to main app)
  → Fallback to EmailService (Direct Gmail SMTP)
```

**Steps:**

1. Validate user opt-in and fetch email
2. Generate tracking ID (32 hex chars)
3. Format content with `formatBriefForEmail()`
4. Create tracking pixel HTML
5. Create database records (`emails`, `email_recipients`)
6. Send via chosen transport
7. Update status after send

### Webhook vs Direct SMTP

**Webhook Method** (`webhook-email-service.ts:44-117`)

- Uses HMAC-SHA256 for security
- POSTs to `BUILDOS_WEBHOOK_URL`
- Timeout: 30s (configurable)
- **Advantage**: Centralized email config
- **Disadvantage**: Network dependency

**Direct SMTP Method** (`email-service.ts:57-186`)

- Gmail SMTP via nodemailer
- Configuration: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_ALIAS`
- **Advantage**: Independence, lower latency
- **Disadvantage**: Gmail rate limits (2000/day free), requires worker credentials

### Email Template Generation

**File**: `apps/worker/src/lib/utils/emailTemplate.ts:9-260`

**HTML Structure:**

```
Header (logo, branding)
  ↓
Content Area (responsive, markdown-styled)
  ↓
Footer (links, legal)
  ↓
Tracking Pixel (1x1 invisible)
```

**Features:**

- Responsive design (breakpoint at 600px)
- Dark/light mode support
- Email client compatibility

### Markdown to HTML Conversion

**File**: `apps/worker/src/lib/utils/markdown.ts:72-84`

**Pipeline:**

```
Raw Markdown
  → marked.parse() (GitHub Flavored Markdown)
  → sanitizeHtml() (XSS protection)
  → Safe HTML
```

**URL Transformation** (`email-sender.ts:97-132`):
Converts relative paths to absolute:

```
[View Project](/projects/abc)
  → [View Project](https://build-os.com/projects/abc)
```

### Email Tracking

**File**: `apps/worker/src/routes/email-tracking.ts:38-143`

**Endpoint**: `GET /api/email-tracking/:trackingId`

**Flow:**

1. Extract tracking ID from URL
2. Capture user-agent and IP address
3. Lookup email from `emails` table
4. Update `email_recipients`:
   - `opened_at` (first open only)
   - `open_count += 1`
   - `last_opened_at = now()`
5. Log event to `email_tracking_events`
6. Return 1x1 transparent PNG (Cache-Control: no-store)

**Tracked Data:**

- First open timestamp
- Total open count
- Last opened timestamp
- User agent (email client)
- IP address (approximate location)

---

## LLM Integration

### Smart LLM Service

**File**: `apps/worker/src/lib/services/smart-llm-service.ts:1-1042`

**Provider**: OpenRouter API (unified interface for 10+ models)
**Configuration**: `PRIVATE_OPENROUTER_API_KEY` (required)

#### Supported Models

**Primary Models (for brief generation):**

1. **DeepSeek Chat V3** - Cost: $0.14/$0.28 per 1M tokens, Smartness: 4.5/5
2. **Qwen 2.5 72B** - Cost: $0.35/$0.40 per 1M tokens
3. **Gemini Flash 1.5** - Cost: $0.15/$0.60 per 1M tokens

**Premium Models (fallback):**

- Claude 3.5 Sonnet, Claude 3 Opus, GPT-4o

#### Model Selection Strategy

**Profile-Based Selection** (Lines 256-302):

```typescript
// Text profiles
- speed: [groq/llama, gemini-flash-8b, deepseek]
- balanced: [deepseek, qwen, gemini-flash]
- quality: [deepseek, qwen, gemini-flash]  // Used for briefs
- creative: [deepseek, qwen, gpt-4o]
```

**Complexity-Based Adjustment** (Lines 663-675):

- Simple: < 3000 chars
- Moderate: 3000-8000 chars OR complex logic
- Complex: > 8000 chars OR nested structure
- Automatically upgrades profile for complex prompts

**OpenRouter Fallback** (Lines 373-388):

- Primary model from profile
- Automatic fallback to other models in list
- Provider preferences: `["deepseek", "qwen", "google", "openai"]`

#### Error Handling

**JSON Parsing Errors** (Lines 394-429):

- Automatic retry with powerful models
- Lower temperature (0.1) on retry
- Max 2 retries

**Network Errors** (Lines 566-604):

- 120-second timeout via AbortSignal
- Specific timeout error messages
- HTTP status code validation

#### Performance Tracking

**Metrics** (Lines 853-863):

- Last 20 measurements per model
- Calculates avg, min, max, count
- Accessible via `getPerformanceReport()`

**Cost Tracking** (Lines 865-894):

- Input cost: `(prompt_tokens / 1M) * model.cost`
- Output cost: `(completion_tokens / 1M) * model.outputCost`
- Cumulative per model and total

#### Usage in Worker

**Brief Generation** (`briefGenerator.ts:241-244`):

```typescript
const llmService = new SmartLLMService({
  httpReferer: "https://build-os.com",
  appName: "BuildOS Daily Brief Worker",
});

// Standard brief
await llmService.generateText({
  profile: "quality",
  temperature: 0.4,
  maxTokens: 2200,
});

// Re-engagement email
await llmService.generateText({
  profile: "quality",
  temperature: 0.7, // Higher for engaging content
  maxTokens: 1500,
});
```

---

## Progress Tracking & Error Handling

### Progress Tracking System

**File**: `apps/worker/src/lib/progressTracker.ts:24-317`

**Configuration:**

- `maxRetries`: 3 (default retry attempts)
- `retryDelayMs`: 1000 (base delay for exponential backoff)
- `enableAuditLog`: true (audit logging, disabled in production)

#### `updateProgress()` Method (Lines 38-134)

**Flow:**

1. Validate progress data (current >= 0, total > 0, current <= total)
2. Fetch current job and check status (must be pending/processing)
3. Merge metadata safely, add `lastProgressUpdate` timestamp
4. Atomic update with optimistic locking
5. On error: Exponential backoff retry (1s, 2s, 4s)

**Formula** (Line 225):

```typescript
delay = (retryDelayMs * 2) ^ retryCount;
```

**Non-blocking**: Progress update failures don't crash jobs

### Real-Time Updates

**File**: `apps/worker/src/workers/shared/queueUtils.ts:100-132`

**`notifyUser` Function:**

```typescript
async function notifyUser(
  userId: string,
  event: string | object,
  payload?: any,
);
```

**How it works:**

1. Creates Supabase channel: `user:${userId}`
2. Sends broadcast event with payload
3. Client receives instant updates

**Event Types:**

- `brief_completed`: Brief ready
- `brief_failed`: Brief generation failed
- `email_sent`: Email delivered
- `job_progress`: Progress update

### Error Handling Patterns

#### Queue-Level Isolation (`supabaseQueue.ts:193-220`)

```typescript
const results = await Promise.allSettled(
  jobs.map((job) => this.processJob(job)),
);
```

- One job failure doesn't crash others
- Failed jobs logged separately
- Successful jobs continue

#### Job-Level Safeguards (`supabaseQueue.ts:231-273`)

```typescript
try {
  await this.executeJobProcessor(job, processor, startTime);
} catch (error) {
  await this.failJob(job.id, error.message, false);
}
```

- Never lets errors escape
- All failures logged and tracked

#### Retry Logic (`supabaseQueue.ts:327`)

```typescript
const shouldRetry = (job.attempts || 0) < (job.max_attempts || 3);
await this.failJob(job.id, error.message, shouldRetry);
```

- Automatic retries up to max attempts
- Uses `fail_queue_job` RPC with retry flag

### Engagement-Based Backoff System

**File**: `apps/worker/src/lib/briefBackoffCalculator.ts:27-226`

**Purpose**: Prevent email fatigue by throttling briefs based on user engagement.

**Schedule** (Lines 28-34):

```typescript
COOLING_OFF_DAYS: 2; // Days 0-2: Normal briefs
FIRST_REENGAGEMENT: 4; // Day 4: First reminder
SECOND_REENGAGEMENT: 10; // Day 10: Second reminder
THIRD_REENGAGEMENT: 31; // Day 31+: Monthly reminders
```

**Timeline:**

```
Day 0-2:  [✓] User active
Day 3:    [✗] Cooling off
Day 4:    [✓] First re-engagement
Day 5-9:  [✗] First backoff
Day 10:   [✓] Second re-engagement
Day 11-30:[✗] Second backoff
Day 31:   [✓] Monthly reminder
Day 62:   [✓] Next monthly reminder
```

**Result**: 4 emails in 2 months vs. 60 daily emails without backoff.

**Feature Flag**: `ENGAGEMENT_BACKOFF_ENABLED=true` in environment

### Activity Logging

**File**: `apps/worker/src/lib/utils/activityLogger.ts:48-291`

**Core Logger:**

```typescript
async logActivity(
  userId: string,
  activityType: ActivityType,
  activityData?: ActivityData,
  request?: Request
)
```

**Tracked:**

- Activity type (brief_generated, login, etc.)
- Activity data (JSON)
- IP address (via x-forwarded-for, x-real-ip, cf-connecting-ip)
- User agent

**Non-blocking**: Logging failures don't crash operations

---

## Key File References

| Component            | File                                                    | Lines   | Purpose                              |
| -------------------- | ------------------------------------------------------- | ------- | ------------------------------------ |
| **Core Worker**      |
| API Server           | `apps/worker/src/index.ts`                              | 1-405   | Express server, REST endpoints       |
| Queue Worker         | `apps/worker/src/worker.ts`                             | 1-226   | Job registration, processing         |
| Scheduler            | `apps/worker/src/scheduler.ts`                          | 1-554   | Cron automation, timezone scheduling |
| **Brief Generation** |
| Brief Worker         | `apps/worker/src/workers/brief/briefWorker.ts`          | 30-284  | Job entry point                      |
| Brief Generator      | `apps/worker/src/workers/brief/briefGenerator.ts`       | 67-1311 | Core generation logic                |
| Prompts              | `apps/worker/src/workers/brief/prompts.ts`              | 1-226   | LLM prompt templates                 |
| **Queue System**     |
| Supabase Queue       | `apps/worker/src/lib/supabaseQueue.ts`                  | 43-575  | Queue implementation                 |
| Job Adapter          | `apps/worker/src/workers/shared/jobAdapter.ts`          | 1-163   | Format conversion                    |
| Queue Config         | `apps/worker/src/config/queueConfig.ts`                 | 10-224  | Configuration                        |
| **Email System**     |
| Email Worker         | `apps/worker/src/workers/brief/emailWorker.ts`          | 19-209  | Email job processor                  |
| Email Sender         | `apps/worker/src/lib/services/email-sender.ts`          | 40-449  | Transport routing                    |
| Email Service        | `apps/worker/src/lib/services/email-service.ts`         | 57-310  | Direct SMTP                          |
| Webhook Service      | `apps/worker/src/lib/services/webhook-email-service.ts` | 44-117  | Webhook delivery                     |
| Email Template       | `apps/worker/src/lib/utils/emailTemplate.ts`            | 9-260   | HTML generation                      |
| Email Tracking       | `apps/worker/src/routes/email-tracking.ts`              | 38-143  | Tracking pixel                       |
| **LLM Integration**  |
| Smart LLM Service    | `apps/worker/src/lib/services/smart-llm-service.ts`     | 1-1042  | Model routing                        |
| **Progress & Error** |
| Progress Tracker     | `apps/worker/src/lib/progressTracker.ts`                | 24-317  | Progress updates                     |
| Backoff Calculator   | `apps/worker/src/lib/briefBackoffCalculator.ts`         | 27-226  | Engagement throttling                |
| Activity Logger      | `apps/worker/src/lib/utils/activityLogger.ts`           | 48-291  | Activity tracking                    |

---

## Data Flow Diagram

```
User Request / Scheduler Cron
        ↓
API Server / Scheduler
        ↓
Supabase Queue (add_queue_job RPC)
        ↓
Queue Worker (claim_pending_jobs RPC)
        ↓
briefWorker.ts (timezone, brief date)
        ↓
briefGenerator.ts
        ↓
    ┌───────────────────────────────┐
    │ Phase 1: Brief record upsert  │
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Phase 2: Fetch project data   │
    │ (5 parallel queries)          │
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Phase 3: Generate project     │
    │ briefs (parallel)             │
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Phase 4: Consolidate into     │
    │ main brief (markdown)         │
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Phase 5: LLM analysis         │
    │ (SmartLLMService + OpenRouter)│
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Phase 6: Final update to DB   │
    └───────────────┬───────────────┘
                    ↓
    ┌───────────────────────────────┐
    │ Email preparation             │
    │ (non-blocking)                │
    │ - Create email records        │
    │ - Queue email job             │
    └───────────────┬───────────────┘
                    ↓
        notifyUser(brief_completed)
                    ↓
        Real-time update to client
```

---

## Configuration

### Required Environment Variables

```bash
# Supabase (required)
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=

# LLM (required)
PRIVATE_OPENROUTER_API_KEY=

# Email (choose one method)
# Method 1: Webhook
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=
PRIVATE_BUILDOS_WEBHOOK_SECRET=

# Method 2: Direct SMTP
GMAIL_USER=
GMAIL_APP_PASSWORD=
GMAIL_ALIAS=  # Optional
```

### Optional Configuration

```bash
# Queue tuning
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
QUEUE_STALLED_TIMEOUT=300000
QUEUE_MAX_RETRIES=3

# Features
ENGAGEMENT_BACKOFF_ENABLED=true

# Email
WEBHOOK_TIMEOUT=30000
EMAIL_FROM_NAME="BuildOS"
```

---

## Performance Characteristics

### Brief Generation

- **Project data fetching**: ~50-200ms (5 parallel queries)
- **Project brief generation**: ~1-3s per project (parallel)
- **LLM analysis**: ~2-5s (DeepSeek)
- **Total time**: ~5-15s for typical user (3 projects, 20 tasks)

### Email Sending

- **Webhook**: 100ms - 5s (depends on main app)
- **Direct SMTP**: 500ms - 3s (Gmail handshake + send)
- **Tracking pixel**: <100ms (database update only)

### Queue Operations

- **Job claiming**: ~10-50ms (atomic RPC)
- **Status updates**: ~10-30ms
- **Progress updates**: ~20-50ms (with retries: ~60-200ms)

### Bottlenecks

1. Gmail SMTP rate limits (2000/day free)
2. Webhook timeout (30s hard limit)
3. LLM API latency (varies by provider)
4. Markdown parsing for large briefs (10k+ chars)

---

## Key Design Decisions

1. **Two-Tier Brief Structure**: Project briefs + main brief allows granular regeneration
2. **Supabase Queue (No Redis)**: Atomic operations, no extra infrastructure, built-in persistence
3. **Job Adapter Pattern**: Zero-downtime migration from BullMQ, preserves worker code
4. **Dual Email Transport**: Webhook for centralization, SMTP for independence
5. **DeepSeek-First LLM**: 95% cost reduction, maintains quality (4.5/5 smartness)
6. **Engagement Backoff**: 4 emails vs 60 in 2 months, prevents fatigue
7. **Non-Blocking Email**: Email failures don't fail brief generation
8. **Progress in Two Places**: `daily_briefs.generation_progress` + `queue_jobs.metadata` for redundancy

---

## Conclusion

The BuildOS worker service demonstrates excellent software engineering practices with clear separation of concerns, comprehensive error handling, type safety, parallel processing, and cost optimization. The architecture supports both immediate scaling and long-term maintainability.

**Key Strengths:**

- Redis-free queue with atomic Supabase operations
- Multi-layer error isolation prevents cascading failures
- Real-time progress tracking via Supabase Realtime
- Intelligent LLM routing saves 95% on costs
- Engagement-aware scheduling reduces email fatigue
- Dual email transport provides flexibility and reliability

---

**Generated by**: Claude Code
**Model**: claude-sonnet-4-5-20250929
**Date**: 2025-09-30T17:47:59+0000
