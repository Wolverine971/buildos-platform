<!-- apps/worker/docs/WORKER_JOBS_AND_FLOWS.md -->

# Worker Jobs and Flows

Last verified against code on 2026-07-06.

This file documents active worker jobs. The source of truth is
`apps/worker/src/worker.ts`; DB enum values that are not registered there are
legacy compatibility values, not active processors.

## Job Matrix

| Job type                         | Processor                                             | Producer                                      |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `generate_daily_brief`           | `workers/brief/briefWorker.ts`                        | Scheduler, `POST /queue/brief`                |
| `generate_brief_audio`           | `workers/briefAudio/briefAudioWorker.ts`              | Brief worker, web audio request               |
| `onboarding_analysis`            | `workers/onboarding/onboardingWorker.ts`              | `POST /queue/onboarding`                      |
| `send_notification`              | `workers/notification/notificationWorker.ts`          | Notification fanout RPC                       |
| `project_activity_batch_flush`   | `workers/notification/projectActivityBatchWorker.ts`  | Project activity batching                     |
| `schedule_daily_sms`             | `workers/dailySmsWorker.ts`                           | Scheduler                                     |
| `send_sms`                       | `workers/smsWorker.ts`                                | Daily SMS scheduler, SMS notification adapter |
| `classify_chat_session`          | `workers/chat/chatSessionClassifier.ts`               | `POST /queue/chat/classify`                   |
| `process_onto_braindump`         | `workers/braindump/braindumpProcessor.ts`             | `POST /queue/braindump/process`               |
| `transcribe_voice_note`          | `workers/voice-notes/voiceNoteTranscriptionWorker.ts` | Voice note flow                               |
| `extract_onto_asset_ocr`         | `workers/assets/assetOcrWorker.ts`                    | Ontology asset flow                           |
| `agent_run`                      | `workers/agent-run/agentRunWorker.ts`                 | Chat, manual agent runs, scheduled Operatives |
| `build_project_context_snapshot` | `workers/ontology/projectContextSnapshotWorker.ts`    | Web project context snapshot service          |
| `generate_project_icon`          | `workers/project-icon/projectIconWorker.ts`           | Web project icon service, snapshot worker     |
| `buildos_project_loop`           | `workers/project-loop/projectLoopWorker.ts`           | Web project-loop services, scheduler          |
| `sync_calendar`                  | `workers/calendar/calendarSyncWorker.ts`              | Calendar projection services                  |

Removed from active docs: `generate_phases`, `generate_brief_email`,
`send_email`, `update_recurring_tasks`, `cleanup_old_data`, and `other`.

## Queue Lifecycle

```text
producer
  -> SupabaseQueue.add(...)
  -> add_queue_job RPC inserts or dedups queue_jobs row
  -> worker polls claim_pending_jobs for registered job types
  -> processor receives ProcessingJob metadata
  -> complete_queue_job or fail_queue_job RPC updates the row
```

`SupabaseQueue` processes claimed batches concurrently, tracks an in-flight
batch for graceful shutdown, recovers stalled jobs once per minute, and uses a
per-job timeout from `QUEUE_WORKER_TIMEOUT`.

## Daily Brief Flow

```text
scheduler hourly or POST /queue/brief
  -> generate_daily_brief
  -> briefWorker validates date/timezone and skips stale scheduled briefs
  -> ontologyBriefGenerator loads ontology, calendar, and activity data
  -> writes ontology_daily_briefs and ontology_project_briefs
  -> optional generate_brief_audio
  -> emit_notification_event('brief.completed')
  -> send_notification fanout handles email, SMS, push, and in-app delivery
```

Key files:

- `apps/worker/src/scheduler.ts`
- `apps/worker/src/workers/brief/briefWorker.ts`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
- `apps/worker/src/workers/briefAudio/enqueueBriefAudio.ts`
- `apps/worker/src/workers/notification/notificationWorker.ts`

## Notification Email Flow

```text
send_notification
  -> notificationWorker loads delivery rows and checks preferences
  -> emailAdapter renders content, creates email records, tracking id, pixel
  -> POST {PUBLIC_APP_URL}/api/webhooks/send-notification-email
  -> web app performs final preference check and sends provider email
```

The worker email adapter owns email record creation and tracking metadata. The
web app owns the final provider send. Do not reintroduce the retired
`generate_brief_email` worker path in new docs.

## SMS Flow

```text
scheduler midnight UTC
  -> schedule_daily_sms
  -> dailySmsWorker reads user SMS preferences and calendar events
  -> queues send_sms jobs for eligible reminders
  -> smsWorker checks preferences/quiet hours and sends with Twilio
```

Scheduled SMS management routes live under `/sms/scheduled/*`.

## Agent and Project Automation

- `agent_run` handles detached agent runs from chat, manual starts, and
  scheduled Operatives.
- The scheduler scans due Operatives every 5 minutes and enqueues `agent_run`.
- `buildos_project_loop` is flag-gated by `ENABLE_PROJECT_LOOPS` in scheduler
  paths and can also be queued by web project-loop services.
- `build_project_context_snapshot` can enqueue `generate_project_icon` when
  snapshot work requires icon generation.
- `sync_calendar` sends calendar projection jobs back to the web webhook using
  `PRIVATE_BUILDOS_WEBHOOK_SECRET`.

## Worker API Reference

All routes except `/health` and `/api/email-tracking/:trackingId` require the
worker bearer token.

### Queue a Brief

```http
POST /queue/brief
Authorization: Bearer <PRIVATE_RAILWAY_WORKER_TOKEN>
Content-Type: application/json
```

```json
{
	"userId": "user-uuid",
	"scheduledFor": "2026-07-06T13:00:00.000Z",
	"briefDate": "2026-07-06",
	"timezone": "America/New_York",
	"forceImmediate": false,
	"forceRegenerate": false,
	"options": {
		"useOntology": true,
		"includeProjects": ["project-uuid"]
	}
}
```

### Queue Onboarding Analysis

```http
POST /queue/onboarding
Authorization: Bearer <PRIVATE_RAILWAY_WORKER_TOKEN>
Content-Type: application/json
```

```json
{
	"userId": "user-uuid",
	"userContext": {},
	"options": {
		"forceRegenerate": false
	}
}
```

### Queue Chat Classification

```http
POST /queue/chat/classify
Authorization: Bearer <PRIVATE_RAILWAY_WORKER_TOKEN>
Content-Type: application/json
```

```json
{
	"sessionId": "session-uuid",
	"userId": "user-uuid"
}
```

### Queue Braindump Processing

```http
POST /queue/braindump/process
Authorization: Bearer <PRIVATE_RAILWAY_WORKER_TOKEN>
Content-Type: application/json
```

```json
{
	"braindumpId": "braindump-uuid",
	"userId": "user-uuid"
}
```

### Queue Operations

```http
GET /jobs/:jobId
GET /users/:userId/jobs?type=generate_daily_brief&status=completed&limit=10
GET /queue/stats
GET /queue/stale-stats?thresholdHours=24&completedRetentionDays=30
POST /queue/cleanup
```

Manual cleanup accepts:

```json
{
	"staleThresholdHours": 24,
	"oldFailedJobsDays": 0,
	"completedJobsRetentionDays": 30,
	"maxDeletionBatchSize": 500,
	"dryRun": true
}
```

### SMS Operations

```http
GET /sms/scheduled/user/:userId
POST /sms/scheduled/:id/cancel
PATCH /sms/scheduled/:id/update
POST /sms/scheduled/:id/regenerate
```

## Statuses

`QueueJobStatus` comes from the database enum. Live code primarily moves rows
through:

```text
pending -> processing -> completed
pending -> processing -> failed
pending -> processing -> pending (retry via fail_queue_job)
pending|processing -> cancelled
```

`retrying` may exist in the enum and old rows, but current failure retry logic
uses the SQL RPC to reschedule rows back to `pending`.
