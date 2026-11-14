<!-- apps/worker/docs/WORKER_JOBS_AND_FLOWS.md -->

# Worker Jobs and Flows

Last verified against code on 2026-11-14 (worker flow audit; map at
https://claude.ai/artifact/4SNqYoKGyqMNbp9fg3VBhc).

This file documents active worker jobs. The source of truth is
`apps/worker/src/worker.ts`; DB enum values that are not registered there are
legacy compatibility values, not active processors.

## Three Services

The worker code deploys as three Railway services (see
`docs/deployment/RAILWAY_DEPLOYMENT.md`):

| Service        | Entrypoint            | Claims                                                     |
| -------------- | --------------------- | ---------------------------------------------------------- |
| General worker | `src/index.ts`        | Every job type in the matrix below, plus the scheduler     |
| Chat worker    | `src/chat-worker.ts`  | `agentic_chat_turn` only (live chat turns)                 |
| Libri worker   | `src/libri-worker.ts` | The separate `libri` schema queues; idle until Libri is on |

Two gates in `src/config/scheduledWork.ts` keep a laptop from acting on
production, because `apps/worker/.env` points at the production database:

- `WORKER_SCHEDULER_ENABLED`: crons, startup brief scheduling, retention purges
  and queue alerts.
- `WORKER_QUEUE_CONSUMERS_ENABLED`: claiming `queue_jobs` at all (general worker).

Both are on only when Railway's runtime variables are present, `true` opts a
local machine in, and `false` is a kill switch even on Railway. A local
`pnpm dev` worker still serves its HTTP API; the deployed worker runs the jobs.

## Job Matrix

| Job type                         | Processor                                             | Producer                                      |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `generate_daily_brief`           | `workers/brief/briefWorker.ts`                        | Scheduler, `POST /queue/brief`                |
| `generate_brief_audio`           | `workers/briefAudio/briefAudioWorker.ts`              | Brief worker, web audio request               |
| `send_notification`              | `workers/notification/notificationWorker.ts`          | Notification fanout RPC                       |
| `project_activity_batch_flush`   | `workers/notification/projectActivityBatchWorker.ts`  | Project activity batching                     |
| `schedule_daily_sms`             | `workers/dailySmsWorker.ts`                           | Scheduler                                     |
| `send_sms`                       | `workers/smsWorker.ts`                                | Daily SMS scheduler, SMS notification adapter |
| `classify_chat_session`          | `workers/chat/chatSessionClassifier.ts`               | Scheduler sweep, `POST /queue/chat/classify`  |
| `capture_chat_checkpoint`        | `workers/chat/checkpoint/checkpointJob.ts`            | Scheduler sweep, `classify_chat_session`      |
| `transcribe_voice_note`          | `workers/voice-notes/voiceNoteTranscriptionWorker.ts` | Voice note flow                               |
| `extract_onto_asset_ocr`         | `workers/assets/assetOcrWorker.ts`                    | Ontology asset flow                           |
| `embed_onto_entity`              | `workers/embeddings/embedEntityWorker.ts`             | DB triggers on ontology writes                |
| `agent_run`                      | `workers/agent-run/agentRunWorker.ts`                 | Chat, manual agent runs, scheduled Operatives |
| `build_project_context_snapshot` | `workers/ontology/projectContextSnapshotWorker.ts`    | Web project context snapshot service          |
| `buildos_project_loop`           | `workers/project-loop/projectLoopWorker.ts`           | Web project-loop services, scheduler          |
| `sync_calendar`                  | `workers/calendar/calendarSyncWorker.ts`              | Calendar projection services                  |
| `run_cycle`                      | `workers/cycle/cycleWorker.ts`                        | Cycle database functions                      |
| `pick_project_emoji`             | `workers/project-emoji/projectEmojiWorker.ts`         | DB trigger on project insert                  |
| `workspace_suggest`              | `workers/workspace-suggest/workspaceSuggestWorker.ts` | Web workspace service                         |
| `freshness_radar_scan`           | `workers/freshness-radar/signalJob.ts`                | DB trigger on chat turn signals               |
| `consolidation_run`              | `workers/consolidation/consolidationJob.ts`           | Web consolidation service                     |
| `user_data_export`               | `workers/export/userDataExportWorker.ts`              | User data panel (database function)           |
| `table_ai_fill`                  | `workers/tables/tableAiFillWorker.ts`                 | Table AI fill (`shared-agent-ops`)            |
| `extract_task_entities`          | `workers/task-entities/extractTaskEntitiesWorker.ts`  | DB trigger on task writes                     |

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

How the general queue behaves (`src/lib/supabaseQueue.ts`, `src/config/queueConfig.ts`):

- **Claiming:** polls every 5 seconds and refills slot by slot (10 slots), so
  one long job never holds up the rest. Each claim carries a `processing_token`
  that fences completion and failure.
- **Liveness:** a running job heartbeats every 60 seconds; `reset_stalled_jobs`
  reclaims rows with no heartbeat for 10 minutes.
- **Timeouts:** 10 minutes by default, with per-type overrides
  (`QUEUE_WORKER_TIMEOUT_<TYPE>`; `agent_run` 23 minutes, `consolidation_run`
  20 minutes). A timeout aborts the job's `AbortSignal`, then allows 3 minutes
  to wind down before the slot is released.
- **Errors:** `PermanentQueueError` fails the job at once. Anything else is
  transient and retried while attempts remain (default 3). Database errors
  thrown as plain objects keep their real message (`describeQueueError`).
- **Retry spacing** (`fail_queue_job`): about 2 minutes after the first
  failure, 30 minutes after the second, 2 hours after that, each plus up to
  60 seconds of jitter (migration
  `20261114190000_queue_retry_spacing_outlasts_outages.sql`, applied 2026-11-14).
- **Running failed jobs again:** `/admin/jobs` lists failed jobs by type and
  offers Run again only for types that are safe to repeat (embeddings, task
  chips, emoji, chat titles, checkpoints, snapshots, Workspace suggestions,
  brief audio, and today's daily brief). It calls
  `requeue_failed_queue_jobs` (server-only).
- **Deploys:** `railway.toml` sets `drainingSeconds = 30`, which lets the
  worker's own shutdown (drain, then a hard exit at 28 seconds) finish before
  Railway kills the process. A test pins the two values.
- `agentic_chat_turn` is `processor_managed`: the chat worker owns its queue
  row state and recovery.

## Scheduled Work

Registered in `src/scheduler.ts`; all of it sits behind the scheduled-work gate.

| When                | What                                                         | Switch                                         |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Hourly              | Queue daily briefs due in the coming hour                    | always                                         |
| Hourly              | Queue nightly Project Review passes (owner's local midnight) | always (`PROJECT_LOOPS_ENABLED` is a constant) |
| 03:00 UTC           | Queue Complete Project Audits                                | same                                           |
| Every 30 minutes    | Reclaim stalled Project Review runs                          | same                                           |
| 03:17 UTC           | Refresh public page 30-day view counts                       | always                                         |
| Every 5 minutes     | Document summary sweep (model call runs in the scheduler)    | `DOCUMENT_DIGEST_SWEEP_ENABLED`                |
| Every 5 minutes     | Start scheduled agents (Operatives) that are due             | always                                         |
| Every minute        | Chat checkpoint sweep                                        | `CHAT_CHECKPOINT_CAPTURE_ENABLED`              |
| Every 2 minutes     | Chat title and summary sweep                                 | `CHAT_CLASSIFICATION_SWEEP_ENABLED`            |
| Every 2 minutes     | Rescue stranded agent runs                                   | `AGENT_RUN_STRANDED_SWEEP_ENABLED`             |
| 03:30 UTC           | Queue retention cleanup and privacy retention                | `QUEUE_RETENTION_CLEANUP_ENABLED`              |
| Every 5 minutes     | Queue alert check (interval in `worker.ts`)                  | scheduled-work gate                            |
| Midnight UTC/hourly | Daily SMS scheduling and SMS alerts                          | `PRIVATE_SMS_SENDING_ENABLED` (off)            |
| Every minute/hourly | Cycle coordinator and daily-brief Cycle shadow               | `PRIVATE_CYCLE_*` (off)                        |
| Every 5 minutes     | Agent-run cost reconciliation                                | `AGENT_RUN_COST_RECONCILIATION_ENABLED` (off)  |

## Daily Brief Flow

```text
scheduler hourly or POST /queue/brief
  -> generate_daily_brief
  -> briefWorker validates date/timezone and skips stale scheduled briefs
  -> ontologyBriefGenerator loads ontology, calendar, and activity data
  -> per-project write-ups (3 at a time; an unchanged project reuses its last one)
  -> summary and analysis side by side
  -> writes ontology_daily_briefs and ontology_project_briefs
  -> saves mentioned items (ontology_brief_entities)
  -> optional generate_brief_audio
  -> emit_notification_event('brief.completed'), job marked complete
  -> refreshes Today waiting items (same job, after the notification; capped at 45 s)
  -> send_notification fanout handles email, push, and in-app delivery
```

**Unchanged projects.** Each project write-up stores a hash of what it was
written from (`ontology_project_briefs.metadata.inputHash`), leaving out the
date and day counts. When today's hash matches the last write-up, that text is
reused with no model call and the project's next step is left alone
(`generationMode: 'reused'`, `writeupReusedFromDate`). A write-up is reused for
at most 7 days. See `workers/brief/projectWriteupReuse.ts`.

**Engagement backoff** (`lib/briefBackoffCalculator.ts`) counts the later of
the last app visit and the last open or click of a brief email, so someone who
reads the email but never opens the app keeps getting daily briefs.

The scheduler only queues users who pass the eligibility check
(`get_daily_brief_eligible_user_ids`), starts generation 2 minutes before the
chosen time, backfills a run missed within the last hour, and dedups on
`brief-{user}-{date}`. The worker records whether `brief.completed` was
emitted; a brief that finished without emitting gets one recovery pass, and a
re-run of an existing brief re-sends the notification instead of regenerating.

The project write-up and waiting-items calls run with hidden reasoning off and
explicit token and time limits. The "Start Here" list is built before the
summary call and passed into it, so the summary and the list agree.

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
web app owns the final provider send: it claims the email row (`sending`, with
a 5-minute re-claim) before sending and answers 409/503 when another sender
holds it or the send cannot proceed. Do not reintroduce the retired
`generate_brief_email` worker path in new docs.

## SMS Flow

SMS is off in production at two levels: `PRIVATE_SMS_SENDING_ENABLED` (the
crons below are not registered without it) and the database flag in
`private.notification_sms_settings`. The flow when it is on:

```text
scheduler midnight UTC
  -> schedule_daily_sms
  -> dailySmsWorker reads user SMS preferences and calendar events
  -> queues send_sms jobs for eligible reminders
  -> smsWorker checks preferences/quiet hours and sends with Twilio
```

Scheduled SMS management routes live under `/sms/scheduled/*`.

## Freshness Radar

Switched off on 2026-11-14: the `freshness_radar*` user flags are off, so the
chat-turn trigger queues no scans. Turn it back on from `/admin/feature-flags`.

## Chat Title and Summary

Added 2026-11-14. `classify_chat_session` writes a chat's title, topics and
summary, and for a project chat refreshes the project's next step.

- The browser queues it on chat close (`POST /queue/chat/classify`). Most chats
  are never closed (new chat, tab close, phone), so the scheduler also runs
  `sweepChatClassifications` (`workers/chat/classificationSweep.ts`) every
  2 minutes. It queues any chat, of any context type, that has been idle for
  10 minutes and was never classified or has newer messages. It looks back
  30 days and queues at most 5 per run, newest first.
- Both paths share one enqueue helper and the dedup key
  `classify-session-<sessionId>`. The sweep leaves a session alone while a job
  for it is queued or running, and after one that started since the last
  message has finished, so a failing session is not queued again every run.
- A model failure is retried by the queue; only the last attempt saves the
  first-message fallback title and stamps the session.
- The project follow-ups (next step, checkpoint, START HERE snapshot) are
  skipped when the chat ended more than 24 hours ago: an old chat gets its
  title but does not rewrite today's next step.
- The library (Libri) extraction rules are sent only when the Libri hand-off
  is configured; otherwise the model is asked for title, topics and summary.
- The project next step is written only when the chat saved changes (read
  from `chat_tool_executions`), and never over a next step the user wrote.
- At most one forced START HERE snapshot per chat; checkpoint capture comes
  from the every-minute sweep, not from classification.
- Disable the sweep with `CHAT_CLASSIFICATION_SWEEP_ENABLED=false`.

## Agent and Project Automation

- `agent_run` handles detached agent runs from chat, manual starts, and
  scheduled Operatives.
- The scheduler scans due Operatives every 5 minutes and enqueues `agent_run`.
- `buildos_project_loop` runs Project Review passes and Complete Project Audits.
  Since 2026-11-14 the nightly audit scan queues an audit only when the project
  passed the burst-of-change test (`passesBurstThreshold` in
  `shared-agent-ops/src/project-audits.ts`). Every recommendation must name one
  real document, task or goal. Repeats are matched on dimension and target
  record, not title. A failed synthesis is retried, never published as a
  template. Open findings not confirmed for 30 days close as `aged_out`.
- Automatic cleanup re-checks each record against the state it was proposed
  against right before applying, and rolls back (or records an Undo for) a
  change that fails partway.
  The scheduler queues it, and web project-loop services can also queue it. A
  light pass runs the four checks, then carries open findings forward as
  lineages (`reviewRollup.ts`, `reviewRollupStore.ts`). It re-verifies live
  changes and makes one roll-up call (`cleanupSynthesis.ts`). It finishes by
  syncing the project's one `project_cleanup` inbox item. See
  `docs/product/PROJECT_CLEANUP_CHANGE_SET.md` (tasker 112, 2026-09-29).
- `sync_calendar` sends calendar projection jobs back to the web webhook using
  `PRIVATE_BUILDOS_WEBHOOK_SECRET`.

## Chat Checkpoint Capture

Added 2026-09-23 (tasker/95). The full design is in
`apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md` §6.3.

- Every minute, the scheduler runs `sweepChatCheckpoints` over project chats active in the last
  3 days. It enqueues `capture_chat_checkpoint` once the part after the session's watermark
  crosses 1,500 user characters or 4 user turns (after an assistant reply), or after 10 minutes
  idle.
- `classify_chat_session` enqueues the same job with trigger `close`.
- Dedup key: `chat-checkpoint:<sessionId>`. A failure writes a `failed` row in
  `chat_capture_checkpoints` with the real database message, and the sweep skips that session
  until a new message arrives. A session whose project has been deleted records a no-op row
  with no project id.
- The job writes the project's thinking log and START HERE. It stages review proposals as
  `agent_runs`, records a receipt row, and advances `chat_sessions.capture_watermark_at`.
- It also reads the session's `chat_tool_executions` for the same message window. These are the
  write receipts that ground START HERE's Current state; a status line the chat only repeated
  never counts (tasker/96, 2026-09-23, uncommitted). The design doc has the details and the one
  known gap.
- Scripts must not import `supabaseCheckpointPorts.ts`: its `lib/supabase` client loads
  `apps/worker/.env`, which points at production. Pure helpers such as `savedChangesFromExecution`
  live in `capturePrompts.ts` for that reason.
- Disable with `CHAT_CHECKPOINT_CAPTURE_ENABLED=false`. This stops the sweep and makes the job a
  no-op.
- One-time backfill: `pnpm --filter @buildos/worker backfill:chat-checkpoints --user <id>`. It is
  a dry run unless given `--apply --confirm <db-ref>`.

## Worker API Reference

All routes except `/health` require the worker bearer token. (Email open
tracking, `/api/email-tracking/:trackingId`, is a web app route.)

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
