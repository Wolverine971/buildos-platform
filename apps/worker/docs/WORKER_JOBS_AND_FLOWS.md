<!-- apps/worker/docs/WORKER_JOBS_AND_FLOWS.md -->

# BuildOS Worker - Job Types, Data Flows & API Reference

## Job Type Matrix

### Quick Reference Table

| Job Type               | Processor File                       | Priority | Triggered By       | Entry Point              | Status            |
| ---------------------- | ------------------------------------ | -------- | ------------------ | ------------------------ | ----------------- |
| `generate_daily_brief` | `brief/briefWorker.ts`               | 1-10     | Scheduler / API    | POST `/queue/brief`      | Active            |
| `generate_brief_email` | `brief/emailWorker.ts`               | 5        | Brief completion   | Internal queuing         | Phase 2           |
| `generate_phases`      | `phases/phasesWorker.ts`             | 5        | On-demand API      | POST `/queue/phases`     | Active            |
| `onboarding_analysis`  | `onboarding/onboardingWorker.ts`     | 1        | On-demand API      | POST `/queue/onboarding` | Active            |
| `send_sms`             | `smsWorker.ts`                       | 5-10     | On-demand API      | Internal queuing         | Optional (Twilio) |
| `schedule_daily_sms`   | `dailySmsWorker.ts`                  | 5        | Scheduler midnight | Automatic                | Active            |
| `send_notification`    | `notification/notificationWorker.ts` | 5        | On-demand API      | Internal queuing         | Active            |

---

## Detailed Data Flows

### 1. DAILY BRIEF GENERATION FLOW

#### Trigger Points

A. **Scheduler** (Automatic - hourly at top of hour)

```
Cron: 0 * * * * (every hour)
  ↓
checkAndScheduleBriefs()
  ↓
Load all active user preferences
  ↓
Batch fetch user timezones (CENTRALIZED SOURCE OF TRUTH)
  ↓
[OPTIONAL] Check engagement status for each user
  ↓
Calculate next run time per user (timezone-aware)
  ↓
Filter users needing briefs in next hour
  ↓
Batch check for existing jobs (30-min tolerance)
  ↓
Queue briefs in parallel with 2-minute pre-generation buffer
```

B. **API** (On-demand - immediate or scheduled)

```
POST /queue/brief
{
  userId: string,
  scheduledFor?: ISO datetime,
  briefDate?: YYYY-MM-DD,
  timezone?: IANA timezone,
  forceImmediate?: boolean,
  forceRegenerate?: boolean
}
  ↓
Validate user exists
  ↓
Resolve timezone (from request, user preferences, or UTC)
  ↓
[IF forceRegenerate] Cancel existing brief jobs for date
  ↓
Queue job with priority 1 (immediate) or 10 (scheduled)
  ↓
Return job ID and scheduled time
```

#### Processing Pipeline

```
processBrief(ProcessingJob)
  ↓
PHASE 1: Data Fetching (parallel)
  ├─ Fetch user's projects (active only)
  ├─ Fetch all tasks for those projects
  ├─ Fetch all notes for those projects
  ├─ Fetch calendar events for brief date
  └─ Fetch user's latest activity
  ↓
PHASE 2: Per-Project Brief Generation
  For each project:
    ├─ Categorize tasks:
    │   ├─ Today's tasks (due today)
    │   ├─ Overdue tasks (past due)
    │   ├─ Upcoming tasks (due in 1-7 days)
    │   └─ Completed tasks (finished in last 24h)
    ├─ Include project notes and context
    └─ Generate per-project markdown brief
  ↓
PHASE 3: Main Brief Consolidation
  ├─ Combine all project briefs
  ├─ Add calendar events summary
  ├─ Detect holidays (if applicable)
  ├─ Generate executive summary
  └─ Format as markdown
  ↓
PHASE 4: LLM Analysis
  ├─ Call SmartLLMService with consolidated brief
  ├─ Provider chain: DeepSeek → GPT-4o → Claude 3.5
  ├─ Generate AI insights & recommendations
  └─ Store analysis in daily_briefs table
  ↓
PHASE 5: Email Queuing (non-blocking)
  ├─ Create email record with tracking ID
  ├─ Queue generate_brief_email job
  └─ Continue (don't wait for email)
  ↓
PHASE 6: Real-time Notification
  ├─ Publish brief to Supabase Realtime channel
  ├─ Update progress with final status
  └─ Client receives instant update
```

### 2. EMAIL BRIEF DELIVERY FLOW (PHASE 2)

#### Entry Point

```
Internal queue job: generate_brief_email
{
  userId: string,
  emailId: string,
  briefId: string
}
```

#### Processing

```
processEmailBrief(ProcessingJob)
  ↓
STEP 1: Fetch Pre-Generated Brief
  ├─ Query daily_briefs table
  └─ Verify brief exists and is complete
  ↓
STEP 2: Convert Markdown to HTML
  ├─ Parse markdown with marked()
  ├─ Sanitize HTML with sanitize-html
  └─ Apply BuildOS email template styling
  ↓
STEP 3: Inject Tracking Links
  ├─ Generate tracking ID for opens
  ├─ Generate tracking pixel (1x1 gif)
  ├─ Generate click-tracking wrapper for all links
  └─ Update email_recipients table
  ↓
STEP 4: Send Email
  ├─ [IF USE_WEBHOOK_EMAIL=true]
  │   ├─ HMAC-sign with BUILDOS_WEBHOOK_SECRET
  │   ├─ POST to BUILDOS_WEBHOOK_URL
  │   └─ 30-second timeout + 3 retries
  │
  └─ [IF USE_WEBHOOK_EMAIL=false]
      ├─ Use Gmail transporter (configured via app password)
      ├─ Send direct SMTP to recipient
      └─ Log message ID in email_logs
  ↓
STEP 5: Update Status
  ├─ Mark email as sent in emails table
  ├─ Store message ID (for tracking)
  └─ Log delivery in email_logs
```

### 3. SMS EVENT REMINDER FLOW

#### Scheduler Trigger

```
Cron: 0 0 * * * (daily at midnight UTC)
  ↓
checkAndScheduleDailySMS()
  ↓
Query user_sms_preferences where:
  - event_reminders_enabled = true
  - phone_verified = true
  - opted_out = false
  ↓
Batch fetch user timezones
  ↓
For each user:
  ├─ Calculate today's date in user timezone
  ├─ Queue schedule_daily_sms job
  └─ Include reminder lead time (default 15 min)
```

#### SMS Scheduling Job

```
processDailySMS(ProcessingJob)
  ├─ userId: string
  ├─ date: YYYY-MM-DD
  ├─ timezone: IANA timezone
  └─ leadTimeMinutes: number (15 default)
  ↓
STEP 1: Fetch Calendar Events for Today
  ├─ Query calendar_events for specified date
  ├─ Filter by: start_time between 00:00-23:59 (user tz)
  └─ Calculate reminder times (event time - lead time)
  ↓
STEP 2: Generate SMS Messages
  For each event:
    ├─ Create message text with event details
    ├─ Check quiet hours (from user_sms_preferences)
    ├─ Verify user hasn't opted out
    └─ Generate message via smsMessageGenerator
  ↓
STEP 3: Queue Individual SMS Jobs
  ├─ Create send_sms job for each event
  ├─ Set scheduledFor = event reminder time
  └─ Use dedup key to prevent duplicates
  ↓
STEP 4: Update Metrics
  ├─ Log scheduled_count to activity_log
  ├─ Update sms_metrics materialized view
  └─ Return summary (count, failures, etc.)
```

#### Individual SMS Sending

```
processSMSJob(ProcessingJob)
  ├─ phone_number: string (E.164 format)
  ├─ message: string
  └─ [metadata: object]
  ↓
STEP 1: Validate Preferences
  ├─ Check user hasn't opted out (user_sms_preferences)
  ├─ Check quiet hours (begin_quiet_hour to end_quiet_hour)
  ├─ Verify phone is still verified
  └─ Return error if any check fails
  ↓
STEP 2: Send via Twilio
  [IF Twilio configured]
    ├─ Initialize TwilioClient
    ├─ Send message via messagingServiceSid
    ├─ Include statusCallbackUrl (webhook for delivery updates)
    └─ Store message SID for tracking
  [IF NOT configured]
    └─ Fail gracefully with "SMS not configured" error
  ↓
STEP 3: Update Delivery Status
  ├─ Create sms_delivery record
  ├─ Store Twilio message SID
  ├─ Update sms_metrics (increments sent count)
  └─ Log in activity_log
```

### 4. MULTI-CHANNEL NOTIFICATION FLOW

#### API Entry Point

```
POST /queue/notification
{
  userId: string,
  channel: 'push' | 'email' | 'in-app' | 'sms',
  eventType: EventType,
  payload: NotificationPayload,
  [metadata]: object
}
```

#### Processing Pipeline

```
processNotificationWrapper(ProcessingJob)
  ↓
STEP 1: Validate Payload
  ├─ Verify event type is recognized
  ├─ Validate payload structure
  ├─ Transform event payload (add context, etc.)
  └─ Generate correlation ID for tracking
  ↓
STEP 2: Check User Preferences
  ├─ Fetch user notification preferences
  ├─ Check if channel is enabled (push, email, in-app)
  ├─ Check notification do-not-disturb settings
  └─ Skip notification if user opted out
  ↓
STEP 3: Route to Channel Adapter
  ├─ [IF channel = 'push']
  │   └─ sendPushNotification(user, payload)
  │       ├─ Fetch user's push subscriptions
  │       ├─ For each subscription:
  │       │   ├─ Send via web-push library
  │       │   ├─ Handle 410 Gone (expired)
  │       │   └─ Retry with exponential backoff
  │       └─ Fall back to in-app if all push fails
  │
  ├─ [IF channel = 'email']
  │   └─ sendEmailNotification(user, payload)
  │       ├─ Template email based on event type
  │       ├─ Queue send_notification_email job
  │       └─ Return immediately
  │
  ├─ [IF channel = 'in-app']
  │   └─ Post to Supabase Realtime
  │       ├─ Publish to user's notifications channel
  │       └─ Browser receives instant update
  │
  └─ [IF channel = 'sms'] (future)
      └─ sendSMSNotification(user, payload)
          ├─ Queue send_sms job
          └─ Return immediately
  ↓
STEP 4: Update Delivery Log
  ├─ Create notification_delivery record
  ├─ Store delivery status (sent, failed, skipped)
  ├─ Log timestamp and channel
  └─ Link to correlation ID for debugging
```

### 5. PROJECT PHASES GENERATION FLOW

#### API Entry Point

```
POST /queue/phases
{
  userId: string,
  projectId: string,
  [options]: object
}
```

#### Processing

```
processPhasesJob(ProcessingJob)
  ↓
STEP 1: Validation
  ├─ Verify user owns project
  ├─ Check no existing processing jobs
  └─ Validate project has tasks
  ↓
STEP 2: Data Collection
  ├─ Fetch project details
  ├─ Fetch all tasks with descriptions
  ├─ Fetch task relationships (dependencies)
  └─ Fetch existing phases (if any)
  ↓
STEP 3: LLM Analysis
  ├─ Send project structure to SmartLLMService
  ├─ Prompt: "Suggest logical phases for these tasks"
  ├─ LLM analyzes task dependencies and structure
  └─ Returns suggested phases with ordering
  ↓
STEP 4: Store Results
  ├─ Create phase records in phases table
  ├─ Link tasks to phases (via phase_tasks)
  ├─ Update project status (phases_generated = true)
  └─ Store LLM metadata for transparency
  ↓
STEP 5: Notify User
  ├─ Queue send_notification job
  ├─ Notify user that phases are ready
  └─ Include link to review phases UI
```

### 6. ONBOARDING ANALYSIS FLOW

#### API Entry Point

```
POST /queue/onboarding
{
  userId: string,
  userContext: {
    name?: string,
    description?: string,
    [goals]: string[],
    [challenges]: string[]
  },
  [options]: { forceRegenerate?: boolean }
}
```

#### Processing

```
processOnboardingAnalysisJob(ProcessingJob)
  ↓
STEP 1: Validation & Dedup Check
  ├─ Validate user and context
  ├─ [IF NOT forceRegenerate]
  │   ├─ Check for existing processing jobs
  │   └─ Reject if already processing
  │
  └─ [IF forceRegenerate]
      ├─ Cancel any existing jobs
      └─ Continue with force flag
  ↓
STEP 2: Analyze Context
  ├─ Send user context to SmartLLMService
  ├─ Prompt: Analyze user goals, challenges, and needs
  ├─ LLM generates:
  │   ├─ Key insights about user
  │   ├─ Suggested workflow optimizations
  │   ├─ Recommended features to try
  │   └─ Best practices for ADHD productivity
  └─ Store analysis in database
  ↓
STEP 3: Store Results
  ├─ Create onboarding_analysis record
  ├─ Store LLM insights and recommendations
  ├─ Mark onboarding as analyzed
  └─ Set completion timestamp
  ↓
STEP 4: Frontend Integration
  ├─ Update user onboarding status
  ├─ Provide insights to UI for personalization
  └─ Enable feature recommendations
```

---

## API Endpoints Reference

### Brief Management

#### Queue Brief

```
POST /queue/brief
Content-Type: application/json

Request:
{
  "userId": "user-123",
  "scheduledFor": "2024-10-23T09:00:00Z",      // optional
  "briefDate": "2024-10-23",                    // optional, YYYY-MM-DD
  "timezone": "America/New_York",               // optional, defaults to user preference
  "forceImmediate": false,                      // optional, queue immediately
  "forceRegenerate": false                      // optional, cancel existing jobs
}

Response:
{
  "success": true,
  "jobId": "job-abc123",
  "scheduledFor": "2024-10-23T09:00:00Z",
  "briefDate": "2024-10-23"
}
```

#### Get Job Status

```
GET /jobs/{jobId}

Response:
{
  "id": "job-abc123",
  "user_id": "user-123",
  "job_type": "generate_daily_brief",
  "status": "processing",           // pending, processing, completed, failed
  "priority": 10,
  "attempts": 1,
  "scheduled_for": "2024-10-23T09:00:00Z",
  "started_at": "2024-10-23T09:02:15Z",
  "completed_at": null,
  "metadata": { briefDate: "2024-10-23" },
  "result": null,
  "error": null,
  "progress": {
    "current": 75,
    "total": 100,
    "message": "Generating LLM analysis..."
  }
}
```

#### Get User Jobs

```
GET /users/{userId}/jobs?type=generate_daily_brief&status=completed&limit=10

Response:
{
  "jobs": [
    { /* job object */ },
    { /* job object */ }
  ]
}
```

### Project Management

#### Queue Phases

```
POST /queue/phases
Content-Type: application/json

Request:
{
  "userId": "user-123",
  "projectId": "proj-456",
  "options": {}                 // optional
}

Response:
{
  "success": true,
  "jobId": "job-def789"
}
```

### Onboarding

#### Queue Onboarding Analysis

```
POST /queue/onboarding
Content-Type: application/json

Request:
{
  "userId": "user-123",
  "userContext": {
    "name": "John",
    "description": "Startup founder with ADHD",
    "goals": [
      "Build SaaS product",
      "Manage team"
    ],
    "challenges": [
      "Time management",
      "Context switching"
    ]
  },
  "options": {
    "forceRegenerate": false
  }
}

Response:
{
  "success": true,
  "jobId": "job-ghi321"
}
```

### Queue Management

#### Health Check

```
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2024-10-23T10:30:45Z",
  "service": "daily-brief-worker",
  "queue": "supabase",
  "stats": [
    {
      "job_type": "generate_daily_brief",
      "status": "pending",
      "count": 5
    },
    {
      "job_type": "generate_daily_brief",
      "status": "processing",
      "count": 2
    }
  ]
}
```

#### Queue Statistics

```
GET /queue/stats

Response:
{
  "stats": [
    {
      "job_type": "generate_daily_brief",
      "status": "pending",
      "count": 12
    },
    {
      "job_type": "generate_daily_brief",
      "status": "processing",
      "count": 3
    },
    {
      "job_type": "generate_daily_brief",
      "status": "completed",
      "count": 247
    },
    {
      "job_type": "send_sms",
      "status": "failed",
      "count": 1
    }
  ]
}
```

#### Stale Job Statistics

```
GET /queue/stale-stats?thresholdHours=24

Response:
{
  "thresholdHours": 24,
  "staleCount": 3,
  "staleJobs": [
    {
      "id": "job-old1",
      "job_type": "generate_daily_brief",
      "status": "processing",
      "created_at": "2024-10-21T10:00:00Z",
      "age_hours": 48
    }
  ],
  "oldFailedCount": 5,
  "message": "Found 3 stale job(s) that can be cleaned up"
}
```

#### Manual Cleanup

```
POST /queue/cleanup
Content-Type: application/json

Request:
{
  "staleThresholdHours": 24,        // Jobs stuck for 24+ hours
  "oldFailedJobsDays": 7,           // Failed jobs older than 7 days
  "dryRun": false                   // If true, only report, don't cleanup
}

Response:
{
  "success": true,
  "staleCancelled": 3,
  "oldFailedCancelled": 5,
  "errors": [],
  "message": "Cleanup completed - cancelled 3 stale job(s) and archived 5 old failed job(s)"
}
```

### SMS Management

#### Get SMS Schedule

```
GET /sms/scheduled

Response:
{
  "schedule": [
    {
      "userId": "user-123",
      "phone_number": "+14155552671",
      "enabled": true,
      "lead_time_minutes": 15,
      "quiet_hours_start": "22:00",
      "quiet_hours_end": "08:00"
    }
  ]
}
```

#### Update SMS Schedule

```
POST /sms/scheduled
Content-Type: application/json

Request:
{
  "userId": "user-123",
  "enabled": true,
  "lead_time_minutes": 30
}

Response:
{
  "success": true,
  "updated": true
}
```

### Email Tracking

#### Track Email Open

```
GET /email/track/open/{trackingId}

Response: 1x1 GIF pixel (invisible image)
Side Effect: Updates email_tracking_events with 'opened' event
```

#### Track Email Click

```
GET /email/track/click/{trackingId}?url=...

Response: Redirect to original URL
Side Effect: Updates email_tracking_events with 'clicked' event
```

---

## Database Job Metadata Examples

### Daily Brief Job Metadata

```json
{
	"userId": "user-123",
	"briefDate": "2024-10-23",
	"timezone": "America/New_York",
	"options": {
		"isReengagement": false,
		"daysSinceLastLogin": 0
	},
	"notificationScheduledFor": "2024-10-23T09:00:00Z"
}
```

### Email Brief Job Metadata

```json
{
	"userId": "user-123",
	"emailId": "email-abc123",
	"briefId": "brief-def456",
	"recipientEmail": "user@example.com"
}
```

### SMS Job Metadata

```json
{
	"phone_number": "+14155552671",
	"message": "Reminder: Team standup at 10:00 AM",
	"eventId": "cal-event-789",
	"eventName": "Team standup"
}
```

### Notification Job Metadata

```json
{
	"userId": "user-123",
	"channel": "push",
	"eventType": "task_completed",
	"payload": {
		"taskId": "task-xyz",
		"taskTitle": "Launch new feature",
		"projectId": "proj-123"
	},
	"correlationId": "corr-abc123"
}
```

---

## Job Status State Machine

```
       created
         ↓
      pending  ←─────────────────┐
         ↓                       │
    processing ─→ (error) → queued_for_retry
         ↓                       ↓
      [DONE]                  pending (retry attempt N)
         ├→ completed
         ├→ failed
         └→ cancelled
```

### Status Definitions

| Status             | Meaning                          | Next State                                   |
| ------------------ | -------------------------------- | -------------------------------------------- |
| `pending`          | Job in queue, waiting to process | `processing`                                 |
| `processing`       | Job actively being processed     | `completed`, `failed`, or `queued_for_retry` |
| `completed`        | Job finished successfully        | (Terminal)                                   |
| `failed`           | Job failed after all retries     | (Terminal)                                   |
| `cancelled`        | Job was cancelled by user        | (Terminal)                                   |
| `queued_for_retry` | Job failed but will retry        | `pending`                                    |

---

## Error Handling & Retry Logic

### Exponential Backoff Formula

```
delay = retryBackoffBase * (2 ^ attemptNumber)

Example (base = 1000ms):
- Attempt 1 failure: retry after 2s
- Attempt 2 failure: retry after 4s
- Attempt 3 failure: retry after 8s
- Max retries reached: fail permanently
```

### Retryable Errors

- Network timeouts
- Temporary database issues
- Rate limit errors (429)
- Temporary provider failures

### Non-retryable Errors

- Invalid user ID
- Malformed job data
- Missing required fields
- Authentication failures
