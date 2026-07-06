<!-- apps/worker/docs/features/daily-briefs/DAILY_BRIEF_GENERATION_END_TO_END.md -->

# Daily Brief Generation — End-to-End Technical Reference

> **Purpose:** A complete, hand-off-ready map of how a BuildOS daily brief is triggered, generated, persisted, delivered, and displayed — with concrete `file:line` references so an agent can act on any stage without re-deriving the flow. Researched and verified 2026-07-06 against the live code.

## TL;DR (the one-paragraph version)

An hourly cron in the **worker** (`apps/worker/src/scheduler.ts`) scans active `user_brief_preferences`, computes each user's next brief time in their timezone, and (2 minutes early) enqueues a `generate_daily_brief` job into the Supabase `queue_jobs` table. The **web** app can also ensure today's brief on dashboard open via `POST /api/daily-briefs/ensure-today`, or trigger one explicitly from a Generate/Regenerate action; both web paths ultimately forward to the worker's `POST /queue/brief` endpoint and enqueue the same job when generation is needed. The worker (`briefWorker.ts`) claims the job, validates timezone/date, skips stale dates, then calls `generateOntologyDailyBrief(...)`. That function loads the user's entire ontology (projects, tasks, goals, plans, milestones, risks, documents, calendar, activity) from Supabase, buckets tasks by date window, calls the LLM (via OpenRouter) once per high-signal project plus a few global synthesis passes, and writes the result to **`ontology_daily_briefs`** (+ one **`ontology_project_briefs`** row per project). It then (a) enqueues `generate_brief_audio` if narration is enabled, and (b) fires `emit_notification_event('brief.completed')`, a Postgres RPC that fans out to email / SMS / push / in-app **only for users who both subscribed and enabled that channel**. Email goes worker → web webhook → Gmail; SMS goes worker → `sms_messages` → Twilio. The web app watches Supabase Realtime on `queue_jobs` + `ontology_daily_briefs` for live progress and renders the finished brief.

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Key files index](#2-key-files-index)
3. [Data model / tables reference](#3-data-model--tables-reference)
4. [Stage 1 — Triggering (cron scheduler, engagement backoff, app-open, on-demand)](#4-stage-1--triggering)
5. [Stage 2 — Queue & job routing](#5-stage-2--queue--job-routing)
6. [Stage 3 — Brief worker orchestration (`briefWorker.ts`)](#6-stage-3--brief-worker-orchestration)
7. [Stage 4 — Data loading (what the brief plugs into)](#7-stage-4--data-loading)
8. [Stage 5 — Generation & LLM](#8-stage-5--generation--llm)
9. [Stage 6 — Persistence (DB writes)](#9-stage-6--persistence)
10. [Stage 7 — Delivery (notifications → email / SMS / push / in-app)](#10-stage-7--delivery)
11. [Stage 8 — Audio narration](#11-stage-8--audio-narration)
12. [Web app integration (app-open, on-demand, realtime progress, display)](#12-web-app-integration)
13. [Environment flags reference](#13-environment-flags-reference)
14. [Gotchas & caveats (read before you change anything)](#14-gotchas--caveats)
15. [Tests](#15-tests)

---

## 1. Architecture at a glance

```
                          ┌─────────────────────────────────────────────┐
                          │  WORKER (Railway)                            │
   ┌──────────────┐       │                                             │
   │ Hourly cron  │──────►│  scheduler.ts                               │
   │ 0 * * * *    │       │  • scan user_brief_preferences (is_active)  │
   └──────────────┘       │  • next-run in user tz − 2min buffer        │
                          │  • engagement backoff (opt-in)              │
   ┌──────────────┐       │  • queue.add('generate_daily_brief')        │
   │ WEB app-open │──────►│  POST /queue/brief  (index.ts)              │
   │ /on-demand   │       │        │                                    │
   └──────────────┘       │        ▼   add_queue_job RPC                │
                          │  ┌──────────────┐                           │
                          │  │  queue_jobs  │  (Supabase, FOR UPDATE    │
                          │  └──────┬───────┘   SKIP LOCKED claim)      │
                          │         ▼                                    │
                          │  worker.ts routes 'generate_daily_brief'    │
                          │         ▼                                    │
                          │  briefWorker.ts  (validate tz/date, stale)  │
                          │         ▼                                    │
                          │  generateOntologyDailyBrief()               │
                          │    1. ontologyBriefDataLoader  ── reads ───┐ │
                          │    2. prepareBriefData / bucket tasks      │ │
                          │    3. per-project LLM briefs (concurrency 3)│ │
                          │    4. executive summary + analysis LLM      │ │
                          │    5. assemble markdown                     │ │
                          │    6. write ontology_daily_briefs (+project)│ │
                          │         │                                   │ │
                          │         ├──► enqueueBriefAudioIfEnabled ──► generate_brief_audio job ──► TTS ──► brief-audio bucket
                          │         │                                   │ │
                          │         └──► emit_notification_event('brief.completed')  (Postgres RPC)
                          └───────────────────────────────────────────┼─┘
                                                                       │
   Reads from Supabase (no live Google API call at gen time):         │
   onto_projects, onto_tasks, onto_goals, onto_plans,  ◄──────────────┘
   onto_milestones, onto_risks, onto_documents, onto_edges,
   onto_events (+onto_event_sync), task_calendar_events,
   onto_project_logs, onto_actors, users
                                                                       │
                          ┌────────────────────────────────────────────▼─┐
                          │  emit_notification_event fan-out (SQL):        │
                          │  gate = active notification_subscriptions      │
                          │       + user_notification_preferences          │
                          │  → notification_deliveries + send_notification │
                          │    queue_jobs (per enabled channel)            │
                          └───────┬────────────┬───────────┬──────────────┘
                                  ▼            ▼           ▼
                        notificationWorker routes each channel:
                        email → emailAdapter → web webhook → Gmail (EmailService)
                        sms   → smsAdapter → sms_messages → smsWorker → Twilio
                        push  → web-push / VAPID
                        in_app→ insert user_notifications

   WEB progress/display: Supabase Realtime on queue_jobs + ontology_daily_briefs
   → unifiedBriefGeneration store → UI; GET /api/daily-briefs renders the brief.
```

**Two important framing facts:**

- **The system is ontology-only.** `useOntology = true` is hard-coded (`briefWorker.ts:112`). The canonical tables are `ontology_daily_briefs` / `ontology_project_briefs`. The legacy `daily_briefs` / `project_daily_briefs` path is **not** the active worker path — do not write new behavior against it.
- **The generation worker no longer sends notifications itself.** It only writes the brief and emits an event. All email/SMS/push/in-app delivery is done by the separate notification pipeline (Stage 7).

---

## 2. Key files index

### Worker — scheduling & queue

| File                                            | Role                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/worker/src/scheduler.ts`                  | Hourly cron; scans preferences; computes next-run; enqueues jobs.                                   |
| `apps/worker/src/lib/briefBackoffCalculator.ts` | Engagement-backoff decision engine (opt-in).                                                        |
| `apps/worker/src/index.ts`                      | `POST /queue/brief` on-demand endpoint (Railway HTTP).                                              |
| `apps/worker/src/worker.ts`                     | Registers `generate_daily_brief` → `processBrief` and `generate_brief_audio` → `processBriefAudio`. |
| `apps/worker/src/lib/supabaseQueue.ts`          | `SupabaseQueue.add()` → `add_queue_job` RPC; brief-job cancellation helpers.                        |
| `apps/worker/src/workers/shared/queueUtils.ts`  | `BriefJobData` payload type; `validateBriefJobData`.                                                |
| `apps/worker/src/config/queueConfig.ts`         | Queue/env config (poll interval, batch size, retention).                                            |

### Worker — brief generation

| File                                                       | Role                                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/worker/src/workers/brief/briefWorker.ts`             | Job entry: validate → generate → enqueue audio → emit notification.                                |
| `apps/worker/src/workers/brief/briefDateGuard.ts`          | Stale-date skip logic + brief-date resolution.                                                     |
| `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`  | **Orchestrator** — `generateOntologyDailyBrief`, per-project + main brief, LLM calls, DB writes.   |
| `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` | **Data loader** — every Supabase read; task bucketing; calendar load.                              |
| `apps/worker/src/workers/brief/ontologyPrompts.ts`         | All LLM system/user prompts.                                                                       |
| `apps/worker/src/workers/brief/ontologyBriefTypes.ts`      | Data shapes (`OntoProjectWithRelations`, `OntologyBriefData`, `OntologyBriefMetadata`, row types). |
| `apps/worker/src/workers/brief/calendarBriefFormatting.ts` | Renders the calendar section (formatting only, no loading).                                        |
| `apps/worker/src/lib/services/smart-llm-service.ts`        | Worker LLM wrapper (injects OpenRouter key, `enforceUserId`).                                      |
| `packages/smart-llm/src/model-config.ts`                   | Model constants & routing profiles.                                                                |

### Worker — delivery & audio

| File                                                             | Role                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/worker/src/workers/notification/notificationWorker.ts`     | Claims `send_notification` jobs; routes to channel adapters. |
| `apps/worker/src/workers/notification/emailAdapter.ts`           | Builds & sends the brief email (→ web webhook).              |
| `apps/worker/src/workers/notification/smsAdapter.ts`             | Builds SMS text; enqueues via `queue_sms_message`.           |
| `apps/worker/src/workers/notification/preferenceChecker.ts`      | Per-channel preference gate (fail-closed).                   |
| `apps/worker/src/workers/smsWorker.ts`                           | Actual Twilio send for `send_sms` jobs.                      |
| `apps/worker/src/workers/briefAudio/enqueueBriefAudio.ts`        | Gates + enqueues `generate_brief_audio`.                     |
| `apps/worker/src/workers/briefAudio/briefAudioWorker.ts`         | Claims audio job; synthesizes; uploads; persists.            |
| `apps/worker/src/workers/briefAudio/briefAudioSynthesis.ts`      | Provider selection (OpenRouter → Kokoro fallback).           |
| `apps/worker/src/lib/tts/{openrouter,kokoro,mp3,textCleanup}.ts` | TTS engines + narration text prep.                           |
| `apps/worker/src/lib/storage/briefAudio.ts`                      | `brief-audio` bucket upload + path builder.                  |

### Postgres

| File                                                                  | Role                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/shared-types/src/functions/emit_notification_event.sql`     | Event insert + subscription/preference gate + per-channel fan-out. |
| `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql` | Opt-in enforcement version.                                        |

### Web — trigger, progress, display

| File                                                                                              | Role                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/web/src/routes/api/daily-briefs/ensure-today/+server.ts`                                    | App-open ensure endpoint; completed/in-flight/project gates before queueing. |
| `apps/web/src/routes/api/daily-briefs/generate/+server.ts`                                        | On-demand `POST` → forwards to worker `/queue/brief`.                        |
| `apps/web/src/routes/api/brief-jobs/queue/+server.ts`                                             | Alt queue endpoint (browser path).                                           |
| `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`                               | Dashboard brief card; app-open ensure call + display.                        |
| `apps/web/src/lib/services/briefClient.service.ts`                                                | Client orchestration (queue + poll + realtime).                              |
| `apps/web/src/lib/services/realtimeBrief.service.ts`                                              | Supabase Realtime subscription (progress).                                   |
| `apps/web/src/lib/services/railwayWorker.service.ts`                                              | Talks to the Railway worker.                                                 |
| `apps/web/src/lib/stores/unifiedBriefGeneration.store.ts`                                         | Merges progress from SSE/railway/realtime/manual.                            |
| `apps/web/src/lib/types/daily-brief.ts`                                                           | `DailyBrief` UI type (incl. `audio_*`).                                      |
| `apps/web/src/routes/api/daily-briefs/+server.ts`                                                 | Read latest brief for a date.                                                |
| `apps/web/src/lib/components/ontology/ProjectBriefsPanel.svelte`                                  | Per-project brief display.                                                   |
| `apps/web/src/routes/api/daily-briefs/[id]/audio-request/+server.ts` + `.../audio-url/+server.ts` | Request audio / get 1-hour signed URL.                                       |
| `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts`                             | Receives the worker's email send + does final Gmail send.                    |

---

## 3. Data model / tables reference

**Canonical brief storage**

- **`ontology_daily_briefs`** — one row per user per day (`UNIQUE(user_id, brief_date)`). Key columns: `id, user_id, actor_id, brief_date, executive_summary` (holds the **full brief markdown**), `llm_analysis, priority_actions (string[]), metadata (jsonb), generation_status` (`processing|completed|failed`), `generation_error, generation_started_at, generation_completed_at`, and audio columns `audio_status, audio_storage_path, audio_voice, audio_model, audio_duration_ms, audio_generation_ms, audio_requested_at, audio_generation_started_at, audio_generated_at, audio_error`. Row type: `ontologyBriefTypes.ts:481`.
- **`ontology_project_briefs`** — one row per project per daily brief (`UNIQUE(daily_brief_id, project_id)`). Columns: `id, daily_brief_id, project_id, brief_content (markdown), metadata (jsonb), updated_at`. Row type: `ontologyBriefTypes.ts:498`.
- **`ontology_brief_entities`** — analytics rows `{daily_brief_id, project_id, entity_kind, entity_id, role}` (best-effort, non-blocking).

**Preferences / scheduling**

- **`user_brief_preferences`** — `is_active, user_id, frequency ('daily'|'weekly'|'custom'), time_of_day (HH:MM:SS), day_of_week (0–6)`. **No timezone column** (timezone comes from `users.timezone`).
- **`users`** — `timezone` (source of truth), `name, email, last_visit`, `is_admin, voice_narration_enabled`.
- **`queue_jobs`** — the queue itself (`job_type, user_id, status, scheduled_for, metadata, priority, dedup_key, attempts, max_attempts`).

**Ontology (read at generation time)** — `onto_projects, onto_tasks, onto_goals, onto_plans, onto_milestones, onto_risks, onto_requirements, onto_documents, onto_edges, onto_events (+onto_event_sync), onto_project_logs, onto_project_members, onto_actors`, plus legacy `task_calendar_events`.

**Notification pipeline** — `notification_events, notification_subscriptions, notification_deliveries, user_notification_preferences, user_sms_preferences, push_subscriptions, user_notifications`.

**Email / SMS** — `emails, email_recipients, sms_templates, sms_messages`.

---

## 4. Stage 1 — Triggering

There are **three** ways a `generate_daily_brief` job can be reached: scheduled cron, app-open ensure, and explicit on-demand generation. The two web paths both forward to the worker queue endpoint when a job is actually needed.

### 4.1 Cron scheduler (`scheduler.ts`)

- **Cadence:** `startScheduler()` (`scheduler.ts:175`) registers `cron.schedule('0 * * * *', checkAndScheduleBriefs)` — **every hour on the hour** (`scheduler.ts:179-182`). Plus a one-time run ~5s after boot (`scheduler.ts:280-282`).
- **Scan:** `checkAndScheduleBriefs()` (`scheduler.ts:589`) loads **all** `user_brief_preferences WHERE is_active = true` (`scheduler.ts:595-598`), then batch-loads `users.{timezone,name,email}` for those users (`scheduler.ts:613-631`).
- **Next-run computation:** `calculateNextRunTime(preference, now, userTimezone)` (`scheduler.ts:878`) parses `time_of_day` and, per `frequency`, computes the next occurrence **in the user's timezone** (`toZonedTime`/`fromZonedTime`, daily calc `scheduler.ts:957-980`, weekly `scheduler.ts:985-1017`). `custom` is currently treated as `daily` (`scheduler.ts:937-940`).
- **2-minute pre-generation buffer:** `GENERATION_BUFFER_MS = 2*60*1000` (`scheduler.ts:43`). The queued job's `scheduledFor` = **notification time − 2 min** (`scheduler.ts:767-768`); the true user time is carried separately as `notificationScheduledFor`.
- **Window filter:** only preferences whose next-run falls **within the next 60 minutes** are queued (`isAfter(next, now) && isBefore(next, oneHourFromNow)`, `scheduler.ts:771`).
- **Timezone source of truth:** `users.timezone` → `'UTC'` fallback. Re-fetched per user right before enqueue (`scheduler.ts:76-86`).

### 4.2 Engagement backoff (opt-in — `briefBackoffCalculator.ts`)

Gated by `ENGAGEMENT_BACKOFF_ENABLED === 'true'` (`scheduler.ts:41`), **default off**. When on, the scheduler batch-computes a send/skip decision per user (`shouldSendDailyBriefBatch`, `scheduler.ts:652`) and **skips** users whose decision is `shouldSend=false` (`scheduler.ts:729-735`). Signals come from existing tables only:

- Days since last login = `users.last_visit`.
- Days since last brief = latest `ontology_daily_briefs` row (`generation_completed_at || brief_date`); `999` if none ever.

**Decision tiers** (`calculateBackoffDecision`, `briefBackoffCalculator.ts:265-393`; constants `:35-41`):

| Days since login | Extra condition      | Result             | stage        |
| ---------------- | -------------------- | ------------------ | ------------ |
| ≤ 2              | —                    | **send**           | standard     |
| 3 (>2, <4)       | —                    | skip (cooling off) | —            |
| = 4              | last brief ≥ 2d ago  | **send**           | reengagement |
| >4, <14          | —                    | skip               | —            |
| = 14             | last brief ≥ 10d ago | **send**           | reengagement |
| >14, <60         | —                    | skip               | —            |
| ≥ 60             | last brief ≥ 90d ago | **send**           | dormant      |
| ≥ 60             | last brief < 90d     | skip               | —            |

The chosen `{isReengagement, daysSinceLastLogin, engagementStage}` is folded into the job's `options` and later steers a **different LLM prompt** (Stage 5). Backoff queries **fail open** — on error, default to sending (`briefBackoffCalculator.ts:169-175`). Known gap: 4-day/14-day gates are exact-day (`=== 4`, `=== 14`), so a missed cron run drops the user into a skip band until dormant (~day 104). See `daily-brief-exponential-backoff-spec.md`.

### 4.3 App-open ensure endpoint (`POST /api/daily-briefs/ensure-today`)

Called by `DashboardBriefWidget.initializeWidget()` after the widget fails to find a completed brief for today.

- Authenticated web route; covered by the consumption-billing AI-compute mutation guard.
- Resolves `today` from `users.timezone` (not browser timezone).
- Reads `ontology_daily_briefs` for `(user_id, today)`: `completed` returns the mapped brief immediately; a fresh `processing` row or active processing queue job returns an in-flight job reference.
- Skips without queueing if the user has no existing `onto_actors` row or no visible ontology projects (`onto_project_members` membership or `onto_projects.created_by`).
- Otherwise POSTs worker `/queue/brief` with `forceRegenerate:false`, `forceImmediate:true`, `briefDate:today`, `timezone`, and `options.useOntology:true`.
- Pending jobs intentionally do **not** short-circuit in the web route. They are posted back through `/queue/brief` so the worker/RPC dedup path can return the existing job and, for future scheduled hits, promote it to run now.

### 4.4 On-demand endpoint (`POST /queue/brief`, `index.ts:165`)

Called by the web app (below). Body: `{ userId, scheduledFor?, briefDate?, timezone?, forceImmediate?, forceRegenerate?, options? }`.

- Validates the user, resolves timezone (`requested || users.timezone || 'UTC'`).
- `forceRegenerate` → atomically cancels existing jobs for that date via `queue.cancelBriefJobsForDate` (`index.ts:216`) and uses a unique dedup key.
- For immediate non-forced requests, computes `notificationScheduledFor` from `user_brief_preferences.time_of_day` + `users.timezone` when the preferred send time is still in the future.
- Enqueues `generate_daily_brief` with `priority: forceImmediate ? 1 : 10`, `dedupKey: brief-<user>-<date>` (or unique if regenerating) (`index.ts:245-266`).
- If a non-forced immediate request dedups onto a future pending job, promotes that job to `scheduled_for=now()` while preserving/merging notification metadata.

---

## 5. Stage 2 — Queue & job routing

- **Queue:** Redis-free. `SupabaseQueue.add()` (`supabaseQueue.ts:75`) calls the **`add_queue_job`** Postgres RPC for an atomic dedup insert into `queue_jobs`. Dedup key from scheduler/app-open/manual generate = `brief-<userId>-<briefDate>`; forced regenerate uses a unique key so it can bypass dedup intentionally. The scheduler also scans for an existing active same-date job before queueing as a cheap duplicate guard.
- **Claim:** workers claim rows via `claim_pending_jobs` (`FOR UPDATE SKIP LOCKED`), default `pollInterval=5s`, `batchSize=5`, `stalledTimeout=5min`.
- **Routing:** `worker.ts:396` registers `queue.process('generate_daily_brief', processBrief)`. `processBrief` (`worker.ts:70`) wraps the job in a legacy adapter and calls `processBriefJob(legacyJob)` (`worker.ts:83`). Audio: `worker.ts:417` registers `generate_brief_audio` → `processBriefAudio`.

**Job payload — `BriefJobData`** (`queueUtils.ts:11`):

```ts
{
  userId: string;
  briefDate?: string;              // YYYY-MM-DD, user-local (worker has fallback)
  timezone?: string;               // IANA (worker has fallback)
  notificationScheduledFor?: string; // ISO — user's preferred delivery time
  options?: {
    forceRegenerate?, includeProjects?, excludeProjects?, customTemplate?,
    requestedBriefDate?, useOntology?,               // useOntology defaults true
    isReengagement?, daysSinceLastLogin?, engagementStage?  // from backoff
  }
}
```

---

## 6. Stage 3 — Brief worker orchestration

`processBriefJob(job)` in `briefWorker.ts:35`:

1. `validateBriefJobData` (`briefWorker.ts:40`); mark job `processing`.
2. **Resolve timezone** from `users.timezone` (centralized), falling back to job data → `'UTC'`; validate it (`briefWorker.ts:44-65`).
3. **Resolve `briefDate`** — if absent, "today" in the user's tz (`briefWorker.ts:68-73`).
4. **Stale-date skip** — `getStaleBriefJobDecision({briefDate, timezone, options})` (`briefDateGuard.ts:35`). If `briefDate < today-local` and it isn't an explicit/forced request, the job is **completed without generating** (`briefWorker.ts:84-100`). This prevents backfilled/late jobs from producing yesterday's brief.
5. **Generate** — `generateOntologyDailyBrief(userId, validatedBriefDate, options, timezone, jobId)` (`briefWorker.ts:114`). Only `ontologyBrief.id` is used downstream.
6. **Enqueue audio** — `enqueueBriefAudioIfEnabled({briefId, userId})` (`briefWorker.ts:124`), best-effort.
7. **Read notification prefs** (`should_email_daily_brief`, `should_sms_daily_brief`) for logging + SMS eligibility checks (`briefWorker.ts:135-201`). **Note: it no longer sends anything here** — delivery is via the event below.
8. Mark job `completed`; PostHog `brief_generated`.
9. **Emit `brief.completed`** — reads back per-project counts from `ontology_project_briefs.metadata` and aggregate counts from `ontology_daily_briefs.metadata`, builds the payload, and calls `emit_notification_event` with `p_scheduled_for = notificationScheduledFor` (`briefWorker.ts:205-334`).
10. On any failure: mark job `failed`, broadcast `brief_failed`, and emit `brief.failed` (`briefWorker.ts:347-380`).

**Count mapping in the notification payload** (`briefWorker.ts:225-330`):

- `todays_task_count` = Σ per-project `metadata.todaysTaskCount`
- `upcoming_task_count` = `next_seven_days_task_count` = Σ per-project `metadata.thisWeekTaskCount`
- `blocked_task_count` = Σ per-project `metadata.blockedTaskCount`
- `overdue_task_count` = `ontology_daily_briefs.metadata.overdueCount`
- `recently_completed_count` = `ontology_daily_briefs.metadata.recentUpdatesCount` _(note: recent-updates is mapped onto the "recently completed" field — see §14)_
- `project_count` = number of `ontology_project_briefs` rows

---

## 7. Stage 4 — Data loading

All reads live in `ontologyBriefDataLoader.ts` (class `OntologyBriefDataLoader`, `:1567`). **No live Google Calendar API call happens at generation time** — calendar data is read from internal Supabase rows. There is **no caching layer**; every run re-queries.

### 7.1 Load sequence (called from the generator)

```
getActorIdForUser(userId)                     // :2315 resolves/creates onto_actors id
loadUserOntologyData(userId, actorId, date, tz) // :1573 → OntoProjectWithRelations[]
loadRecentlyPausedProjects(userId, actorId)   // :2038 → pause notices
loadCalendarBriefData(...)                    // :2138 → CalendarBriefSection (runs after tasks)
prepareBriefData(...)                         // :2439 in-memory: bucket tasks, cap, group calendar
calculateMetadata(...)                        // :2694 in-memory: counts for metadata
```

### 7.2 Tables queried (grouped)

**Access / identity:** `onto_project_members` (membership, `:1582`), `onto_actors` (`ensure_actor_for_user` RPC + fallback, `:2316`), `users`. Project access filter tolerates migration data: `created_by = actorId OR created_by = userId OR id IN memberProjectIds` (`:1091`).

**Projects:** `onto_projects` where `state_key IN ('planning','active')`, not deleted/archived (`:1611`). Paused projects loaded separately (`state_key='paused'`, `:2065`). `next_step_short/long` become the project's "next steps."

**Tasks:** `onto_tasks` for all project IDs in one query (`:1824`), filtered per project in memory.

**Ontology graph (one parallel `Promise.all` batch, `:1813`):** `onto_goals`, `onto_plans`, `onto_milestones` (excludes `completed`/`missed`), `onto_risks`, `onto_requirements`, `onto_documents` (metadata), `onto_documents` where `type_key='document.context.project'` (**the per-project "START HERE" doc**, content truncated to ~1200 chars, `:1873`), and **`onto_edges`** (the relationship graph).

**Edges drive the graph relationships** — `supports_goal` (task→goal, goal progress), `depends_on` (task→task, blocking/unblocking), `has_task` (plan→task, plan progress). Maps built in `:1987-1995`.

**Activity:** `onto_project_logs` — meaningful actions in the last 24h, `limit 200`, capped to 8/project (`:1675`).

**Calendar (`loadCalendarBriefData`, `:2138`):**

- `onto_events` × 3 (project-owned, actor-owned, standalone) each with nested `onto_event_sync` join, `limit 80`, in an **8-day window** (`getCalendarBriefWindow`, `:134`). Caps `CALENDAR_BRIEF_CAPS` (`:67`): `TODAY=8, UPCOMING=5, UPCOMING_DAYS=7`.
- Legacy `task_calendar_events` (`:2271`).
- **Synthetic** items derived from tasks' `start_at`/`due_at` for tasks without an explicit event (`buildSyntheticTaskCalendarItems`, `:762`).
- Source classification (Google / legacy / sync-issue / internal) + freshness from `onto_event_sync.last_synced_at` (stale after 360 min). Dedup + partition into `today`/`upcoming`.

### 7.3 Task bucketing (`categorizeTasks`, `:875`)

Anchored on `briefDate` (user-local) with windows `cutoff24h` (recently completed), `cutoff7d` (recently updated), `weekEnd = briefDate + 7` (computed at **noon local** to dodge DST). All date comparisons use local `yyyy-MM-dd` strings.

- **overdueTasks** — not done, `due < today`.
- **todaysTasks** — not done, `due == today OR start == today`.
- **upcomingTasks** — in `(today, weekEnd]`, not blocked.
- **blockedTasks** — `state == 'blocked'`.
- **recentlyUpdated** — `updated_at ≥ cutoff7d`, not done/blocked.
- **recentlyCompleted** — done AND `completed_at ≥ cutoff24h` when present; old rows fall back to `updated_at`.
- **Work-mode buckets** — by `type_key` prefix → execute/create/refine/research/review/coordinate/admin/plan.

Per-project `thisWeekTasks = todaysTasks + upcoming` (uncapped, not deduped). Entity caps applied in `prepareBriefData` (`ENTITY_CAPS`, `:23`: 5 each for goals/risks/requirements/documents/milestones/plans; 10 recent tasks, 5 upcoming).

---

## 8. Stage 5 — Generation & LLM

`generateOntologyDailyBrief(userId, briefDate, options, timezone, jobId?)` — `ontologyBriefGenerator.ts:1029`. Returns `OntologyDailyBriefResult` (only `.id` used downstream).

### 8.1 Flow

1. Resolve actor + timezone + `briefDateObj`.
2. **Upsert the brief row** into `ontology_daily_briefs` with `generation_status='processing'` (conflict on `user_id,brief_date`) — the returned `id` anchors everything (`:1069-1090`).
3. **Load data** (Stage 4) — throws if no actor / no projects.
4. **Prepare** → `briefData` + `metadata`.
5. **Per-project briefs** — `mapWithConcurrency(projects, 3, generateOntologyProjectBrief)` (`:1146`, `PROJECT_BRIEF_GENERATION_CONCURRENCY=3`). Per-project failures are logged, not fatal.
6. **Select prompt subset** — top 5 projects by a weighted signal score feed the global LLM passes.
7. **Executive summary LLM** (text) → embedded under `## Executive Brief`.
8. **Full analysis LLM** (text) — standard _or_ re-engagement variant.
9. **Assemble main markdown** (`generateMainBriefMarkdown`, `:687`) + `extractPriorityActions` (≤5).
10. **Persist final** — update the row: `executive_summary = full markdown`, `llm_analysis`, `priority_actions`, `metadata`, `generation_status='completed'` (`:1403`).
11. **Record entities** (best-effort, 5s timeout).

Progress is written to `ontology_daily_briefs.updated_at` and `queue_jobs.metadata.generation_progress` at each step (`loading_ontology_data 10% → preparing 25% → project_briefs 40% → exec_summary 60% → llm_analysis 75% → finalizing 90% → completed 100%`).

### 8.2 Per-project brief (`generateOntologyProjectBrief`, `:498`)

- **LLM gate** — `getProjectLlmBriefDecision` (`:202`) scores signals (today's tasks ×4, calendar ×4, blocked ×3, unblocking ×3, goals-at-risk ×3, upcoming ×2…). If score has no reasons → **skip the LLM**, use deterministic markdown (`llmSkippedReason='low_signal_project'`).
- **LLM call** (JSON) → `ProjectBriefLLMResponse` with `briefMarkdown, statusLine, recentChangeSummary, calendarSummary, nextStepShort (≤120), nextStepLong (≤600)`.
- **Inline next-step write** (the live path): if `nextStepShort` present, **UPDATE `onto_projects`** setting `next_step_short/long`, `next_step_source='ai'`, `next_step_updated_at` (guarded to `planning|active`, not deleted/archived) (`:583-597`).
- **Write** one `ontology_project_briefs` row (upsert on `daily_brief_id,project_id`) with rich `metadata` (all the per-project counts + LLM diagnostics). See §9.

### 8.3 Main brief markdown structure (`generateMainBriefMarkdown`, `:687`)

`# <date>` → optional holiday → `## Executive Brief` (LLM summary) → **Day Hook** one-liner → `## Start Here` (top-3 priority actions) → `## Calendar` → `## Recently Paused` → `## Strategic Alignment / Goal Progress` → `## Attention Required` (Overdue / Blocked / Risks / Requirements) → `## Today's Focus by Work Mode` → `## ✅ Recent Wins` → `## Recent Activity` → `## Project Details` (all per-project briefs concatenated).

### 8.4 LLM calls (all via OpenRouter through `smart-llm`)

Service: `new SmartLLMService({ appName: 'BuildOS Ontology Brief Worker' })`, `enforceUserId: true`. Model constants (`packages/smart-llm/src/model-config.ts`): `ACTIVE_EXPERIMENT_MODEL = 'qwen/qwen3.7-plus'`, `DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash'`.

| Call                          | Method            | Profile / model                                                                                                       | Temp | Max tokens     | Prompt                                                  |
| ----------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---- | -------------- | ------------------------------------------------------- |
| Per-project brief             | `getJSONResponse` | `PROJECT_BRIEF_MODELS = [deepseek-v4-flash, qwen3.7-plus]` — primary = `deepseek/deepseek-v4-flash`, qwen is fallback | 0.25 | (default 8192) | `OntologyProjectBriefPrompt` (`ontologyPrompts.ts:572`) |
| Executive summary             | `generateText`    | `quality`                                                                                                             | 0.7  | 600            | `OntologyExecutiveSummaryPrompt` (`:406`)               |
| Full analysis (standard)      | `generateText`    | `quality`                                                                                                             | 0.4  | 2000           | `OntologyAnalysisPrompt` (`:140`)                       |
| Full analysis (re-engagement) | `generateText`    | `quality`                                                                                                             | 0.7  | 1200           | `OntologyReengagementPrompt` (`:765`)                   |

All calls are **non-streaming**. Project-brief JSON uses `retryOnParseError`, `maxRetries: 1`, `allowTruncatedJsonRecovery: true`. Cost/model captured per project via `onUsage` → stored in project-brief metadata.

### 8.5 Error handling

- Per-project LLM failure → deterministic fallback markdown (`generationMode='deterministic_fallback'`).
- Executive/analysis LLM failure → deterministic fallback strings built from counts.
- `onto_projects` next-step write failure → warn-only.
- Fatal (no actor / no projects / core DB write throws) → outer catch marks row `failed`, re-throws to worker.

---

## 9. Stage 6 — Persistence

| Table                     | Op                             | Key columns                                                                                                          | Conflict / dedup                     |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------- |
| `ontology_daily_briefs`   | upsert (init) → update (final) | `executive_summary` (full markdown), `llm_analysis`, `priority_actions`, `metadata`, `generation_status`, timestamps | `UNIQUE(user_id, brief_date)`        |
| `ontology_project_briefs` | upsert                         | `brief_content`, `metadata` (counts + LLM diag)                                                                      | `UNIQUE(daily_brief_id, project_id)` |
| `onto_projects`           | update (side effect)           | `next_step_short/long`, `next_step_source='ai'`, `next_step_updated_at`                                              | filtered to `planning                | active` |
| `ontology_brief_entities` | insert (best-effort)           | `{daily_brief_id, project_id, entity_kind, entity_id, role}`                                                         | in-memory dedup                      |
| `queue_jobs`              | update                         | `metadata.generation_progress`                                                                                       | by job id                            |

**Project-brief `metadata` keys** (source for notification counts): `todaysTaskCount, thisWeekTaskCount, blockedTaskCount, activeGoalsCount, requirementsCount, hasNextMilestone, activePlanId, calendarTodayCount, calendarUpcomingCount, recentChangeCount, documentCount, planCount, generationMode, llmModelUsed, llmCost, llmSkippedReason, llmDecision, nextStepPersisted, …`.

**Daily-brief `metadata` keys**: `totalProjects, totalTasks, totalGoals, totalMilestones, activeRisksCount, recentUpdatesCount, recentlyPausedProjectCount, blockedCount, overdueCount, goalsAtRisk, milestonesThisWeek, totalEdges, dependencyChains, calendar*Count, generatedVia, timezone, isReengagement, daysSinceLastLogin, engagementStage`.

---

## 10. Stage 7 — Delivery

The generation worker fires **`emit_notification_event('brief.completed', …)`** (`briefWorker.ts:306`). Everything after is the shared notification pipeline.

### 10.1 SQL fan-out (`emit_notification_event.sql`)

1. **Idempotency** — brief events take a `pg_advisory_xact_lock` on `notification:<event>:<user>:<brief_id>` and short-circuit if the event already exists (prevents dupes on stalled-job recovery).
2. Insert into **`notification_events`** with a `correlation_id`.
3. **Subscription gate** — only users with an **active `notification_subscriptions` row for that event type** proceed. No row → **nothing delivered.**
4. Load the user's single **`user_notification_preferences`** row. **Missing = fail closed (skip).**
5. Per enabled channel, insert a **`notification_deliveries`** row (`pending`) **and** a `send_notification` **`queue_jobs`** row (`scheduled_for = notificationScheduledFor` when set):
    - **email** — gated by `should_email_daily_brief` (brief events).
    - **sms** — gated by `should_sms_daily_brief` **and** `user_sms_preferences.phone_verified = true AND opted_out = false AND phone_number IS NOT NULL`.
    - **push** — `push_enabled` + per active `push_subscriptions.endpoint`.
    - **in_app** — `in_app_enabled`.

### 10.2 Notification worker (`notificationWorker.ts`)

`processNotificationJobs()` (`:1090`) claims up to 10 `send_notification` jobs. `processNotification()` (`:647`) loads the delivery, enriches payload (`transformEventPayload`), suppresses stale briefs, **re-checks preferences** (`preferenceChecker.ts` — fail-closed, disallowed → `cancelled`), applies push quiet-hours, then routes via `sendNotification()` switch to the channel adapter and writes back `sent`/`failed` with optimistic locking.

### 10.3 Email (`emailAdapter.ts`)

- Re-checks prefs, loads `users.email/name`, generates a `trackingId`.
- **Fetches the full brief** from `ontology_daily_briefs` (`executive_summary, llm_analysis, brief_date, metadata`).
- **Engagement-aware content/subject**: standard → `executive_summary`, `"BuildOS Daily Brief - <date>"`; reengagement/dormant prefer `llm_analysis` with softer subjects.
- Renders markdown→HTML (Inkprint template), rewrites links for click tracking (`/api/email-tracking/<id>/click`), injects a 1×1 tracking pixel, adds unsubscribe URL.
- Persists an **`emails`** row (`category='daily_brief'`, `tracking_id`) + **`email_recipients`** row, then POSTs to the web webhook `${PUBLIC_APP_URL}/api/webhooks/send-notification-email` (bearer `PRIVATE_BUILDOS_WEBHOOK_SECRET`).
- The **web webhook** does a final preference triple-check and sends via `EmailService` (Gmail), preserving the tracking id.

### 10.4 SMS (`smsAdapter.ts`) — no LLM

- Prefs + E.164 + safety checks (`smsPreferenceChecks.ts`: verification, quiet hours, rate limits).
- Formats from **`sms_templates`** (`notif_brief_completed` etc., 5-min cache) with `{{var}}` rendering, or hardcoded fallback (`"Your BuildOS brief is ready! Today: N | Overdue: N | Upcoming: N…"`). A freshness guard re-queries brief metadata if counts look wrong.
- Shortens URLs (`create_tracking_link` → `/l/<code>`), then enqueues via **`queue_sms_message`** RPC (the single owner of `sms_messages`). Does **not** call Twilio directly.
- **`smsWorker.ts`** processes the resulting `send_sms` job and sends via **Twilio** (`PRIVATE_TWILIO_*`), updating `sms_messages` with `twilio_sid`/`sent_at`.

---

## 11. Stage 8 — Audio narration

Optional MP3 narration, gated to **admins with `voice_narration_enabled`**.

- **Enqueue** (`enqueueBriefAudio.ts:75`): eligibility = `users.is_admin && users.voice_narration_enabled`. If enabled, sets `ontology_daily_briefs.audio_status='pending'`, precomputes `audio_storage_path=<userId>/<briefId>.mp3`, and enqueues `generate_brief_audio` (`priority 20`, `dedup 'brief-audio-<briefId>'`, `max_attempts 1` — no retries).
- **Worker** (`briefAudioWorker.ts:331`): serializes audio jobs (one at a time), 60s heartbeat. Re-checks eligibility, atomically claims via `audio_status='generating'`, builds narration text (`textCleanup.buildBriefNarrationText` — prefers `llm_analysis`, strips markdown/emoji, prepends `"Daily brief for <date>."`, truncates ~1800 chars), synthesizes, uploads, and persists `audio_status='ready'` + metadata (voice/model/duration).
- **TTS provider** (`briefAudioSynthesis.ts`): **OpenRouter if `PRIVATE_OPENROUTER_API_KEY`/`OPENROUTER_API_KEY` present** (model `openai/gpt-audio-mini`, voice `alloy`), else **Kokoro** local (`onnx-community/Kokoro-82M-v1.0-ONNX`, voice `am_onyx`, runs in child process, MP3 via lamejs). OpenRouter failure falls back to Kokoro (45s cap).
- **Storage** (`storage/briefAudio.ts`): bucket **`brief-audio`**, path `<userId>/<briefId>.mp3`, `audio/mpeg`, `upsert:true`.
- **Playback** (web): `POST /api/daily-briefs/[id]/audio-request` (admin-gated, enqueues the same job) → `GET /api/daily-briefs/[id]/audio-url` returns a **1-hour signed URL** once `audio_status='ready'`.

---

## 12. Web app integration

### 12.1 App-open trigger

`POST /api/daily-briefs/ensure-today` (`ensure-today/+server.ts`) is called by `DashboardBriefWidget.svelte` after `fetchTodaysBrief()` returns no completed brief. It returns `{ state, briefDate, timezone, queued, brief?, job? }`, where `state` is one of `completed`, `in_flight`, `queued`, `skipped_no_actor`, or `skipped_no_projects`. The widget renders completed results immediately, or calls `BriefClientService.monitorQueuedGeneration()` to attach polling/realtime progress to the returned job. Automatic failures are logged quietly so the manual Generate CTA remains available.

### 12.2 On-demand trigger

`POST /api/daily-briefs/generate` (`generate/+server.ts`) requires auth; returns 503 if `PUBLIC_RAILWAY_WORKER_URL` unset (local generation is deprecated). Otherwise it forwards to the worker `POST ${PUBLIC_RAILWAY_WORKER_URL}/queue/brief` with `{ userId, briefDate, timezone, forceRegenerate, options:{ includeProjects, excludeProjects, useOntology:true } }` (bearer `PRIVATE_RAILWAY_WORKER_TOKEN`) → enqueues the same `generate_daily_brief` job. Returns `{ jobId, status:'processing', queued:true }`. The legacy `GET` SSE handler only emits an error now — **inline/SSE generation is removed.**

### 12.3 Progress (Realtime primary, polling backstop)

`realtimeBrief.service.ts` subscribes to a Supabase channel `user-brief-notifications:<userId>` with `postgres_changes` on **`queue_jobs`** and **`ontology_daily_briefs`** (both filtered by `user_id`), plus broadcast events. `handleJobUpdate` computes % from `metadata.generation_progress` and drives the `unifiedBriefGeneration` store (priority merge `sse > railway > realtime > manual`). `briefClient.service.ts` also polls `/api/brief-jobs/{jobId}` and `/api/daily-briefs/status` as a backstop.

### 12.4 Display

- `GET /api/daily-briefs?date=` reads the latest `ontology_daily_briefs` row and maps it (`mapOntologyDailyBriefRow`) into the UI `DailyBrief` type (`apps/web/src/lib/types/daily-brief.ts`, incl. `audio_*`).
- `ProjectBriefsPanel.svelte` lazy-loads per-project briefs via `/api/onto/projects/{id}/briefs` and renders `brief_content` markdown.
- Related read endpoints: `/api/daily-briefs/[id]`, `/status`, `/progress`, `/history`, `/search`, `/stats`.

---

## 13. Environment flags reference

| Flag                                                                                                                | Effect                                                                              | Default                |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| `ENGAGEMENT_BACKOFF_ENABLED`                                                                                        | Enables the engagement-backoff send/skip gate in the scheduler.                     | off                    |
| `PUBLIC_RAILWAY_WORKER_URL`                                                                                         | Web → worker base URL for app-open/on-demand queueing. Unset ⇒ web generation 503s. | —                      |
| `PRIVATE_RAILWAY_WORKER_TOKEN`                                                                                      | Bearer auth for web → worker `/queue/brief`.                                        | —                      |
| `PUBLIC_APP_URL`                                                                                                    | Base URL for email links/pixels + email webhook target.                             | `https://build-os.com` |
| `PRIVATE_BUILDOS_WEBHOOK_SECRET`                                                                                    | Auth for worker → web email webhook.                                                | —                      |
| `PRIVATE_OPENROUTER_API_KEY` / `OPENROUTER_API_KEY`                                                                 | LLM (brief text) + TTS provider selection (present ⇒ OpenRouter TTS, else Kokoro).  | required for LLM       |
| `PRIVATE_TWILIO_ACCOUNT_SID/AUTH_TOKEN/MESSAGING_SERVICE_SID/STATUS_CALLBACK_URL`                                   | SMS send. Missing ⇒ SMS disabled.                                                   | —                      |
| `users.voice_narration_enabled` + `users.is_admin`                                                                  | Gate for audio narration (DB flags, not env).                                       | off                    |
| Queue: `QUEUE_POLL_INTERVAL`, `QUEUE_BATCH_SIZE`, `QUEUE_STALLED_TIMEOUT`, `QUEUE_MAX_RETRIES`, `QUEUE_RETENTION_*` | Queue throughput/retention (`queueConfig.ts`).                                      | 5000/5/300000/3/…      |
| `PROJECT_LOOPS_ENABLED`                                                                                             | Gates unrelated project-loop crons in the same scheduler.                           | off                    |

---

## 14. Gotchas & caveats

Read these before modifying anything — they are the non-obvious traps.

1. **Ontology-only.** Do not add worker behavior to `daily_briefs` / `project_daily_briefs`. Canonical = `ontology_daily_briefs` / `ontology_project_briefs`.
2. **The full brief markdown lives in `ontology_daily_briefs.executive_summary`**, not a `content`/`markdown` column. The short LLM summary is embedded inside it under `## Executive Brief`; the raw analysis is separately in `llm_analysis`.
3. **Per-project model order is explicit.** `PROJECT_BRIEF_MODELS = [deepseek-v4-flash, qwen3.7-plus]`; the primary project-brief model is `deepseek/deepseek-v4-flash`, with qwen as the fallback.
4. **`recently_completed_count` is actually recent-updates.** The `brief.completed` payload maps `metadata.recentUpdatesCount` onto `recently_completed_count` (`briefWorker.ts:272-275`). If a downstream consumer treats it as "tasks completed," that's a mismatch.
5. **Delivery requires BOTH a subscription and a preference.** A user with `should_email_daily_brief=true` but **no active `notification_subscriptions` row** (or **no `user_notification_preferences` row at all**) gets **nothing** — `emit_notification_event` fails closed and skips silently. This is the #1 "why didn't my brief email send" cause.
6. **No live Google Calendar read at generation time.** Calendar data comes from stored `onto_events` (+`onto_event_sync`) and legacy `task_calendar_events`, plus synthetic items derived from task dates. Freshness/staleness is inferred from `last_synced_at`. If calendar data looks stale, the fix is upstream (calendar sync), not the brief.
7. **Stale-date skip fires twice.** `briefWorker.ts` skips generating a brief for a past local date (unless forced), and `notificationWorker.ts` independently cancels delivery of stale briefs. Backfilling old dates requires `forceRegenerate`/explicit `requestedBriefDate`.
8. **Engagement backoff exact-day gates.** `=== 4` / `=== 14` day checks mean a missed hourly run can skip a user's re-engagement window entirely until dormant (~day 104). See `daily-brief-exponential-backoff-spec.md`.
9. **Audio is single-attempt, admin-only.** `generate_brief_audio` runs with `max_attempts=1` (no retry) and only for `is_admin && voice_narration_enabled` users. A transient TTS failure means no audio for that brief unless re-requested from the UI.
10. **Redundant loader work.** `loadRecentlyPausedProjects` re-runs the membership query + access filter that `loadUserOntologyData` already did; and there's a self-healing `onto_project_members` **upsert inside the read path** (`:1642`). Worth knowing if you're profiling or making the loader read-only.

---

## 15. Tests

- `apps/worker/tests/briefBackoffCalculator.test.ts` — backoff tiers.
- `apps/worker/tests/briefDateGuard.test.ts` — stale-date / date resolution.
- `apps/worker/tests/briefWorker.stale.test.ts` — stale skip in the worker.
- `apps/worker/tests/ontologyBriefDataLoader.test.ts` — data loading + bucketing.
- `apps/worker/tests/ontologyPrompts.test.ts` — prompt construction.
- `apps/worker/tests/calendarBriefFormatting.test.ts` — calendar rendering.
- `apps/worker/tests/briefAudioSynthesis.test.ts` — TTS provider selection/fallback.
- `apps/web/src/routes/api/daily-briefs/ensure-today/server.test.ts` — app-open ensure endpoint behavior.

Run worker tests with `cd apps/worker && pnpm test:run` (all) or `pnpm test path/to/file.test.ts` (single). Run the web app-open route test with `pnpm --filter @buildos/web test:run src/routes/api/daily-briefs/ensure-today/server.test.ts`.

---

## Related documentation

- `apps/worker/docs/features/daily-briefs/README.md` — feature overview + active-flow summary.
- `apps/worker/docs/features/daily-briefs/daily-brief-exponential-backoff-spec.md` — backoff behavior + known gaps.
- `apps/worker/docs/features/daily-briefs/calendar-section-plan.md` + `calendar-recommendations-research.md` — calendar section design.
- `apps/worker/docs/WORKER_JOBS_AND_FLOWS.md` — all worker job types.
- `docs/specs/daily-brief-voice-narration-2026-05-13.md` — voice narration spec.
- `apps/web/docs/technical/api/endpoints/daily-briefs.md` — web API (⚠️ still describes legacy tables/SSE; ontology + Railway-queue path supersede it).
