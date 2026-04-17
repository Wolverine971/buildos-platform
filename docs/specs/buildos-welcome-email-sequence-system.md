<!-- docs/specs/buildos-welcome-email-sequence-system.md -->

# BuildOS Welcome Email Sequence System

**Status:** Draft implementation spec  
**Author:** DJ + Codex  
**Date:** 2026-04-17  
**Scope:** `apps/web/`, `supabase/migrations/`, shared email tables  
**Related docs:**

- `docs/marketing/strategy/buildos-welcome-sequence.md`
- `docs/marketing/growth/growth-audit-2026-04-09.md`
- `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`
- Source architecture from 9takes: [`/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md`](/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md)

This spec adapts the 9takes welcome-sequence architecture to BuildOS. The target system is a production-grade, queue-driven lifecycle sequence that enrolls every new BuildOS signup, sends the first email immediately, schedules the remaining emails by timestamp, branches off current product state, tracks delivery and engagement, and avoids duplicate sends under cron concurrency.

BuildOS already has a useful first version of the welcome sequence:

- Password signup starts the sequence from `apps/web/src/routes/api/auth/register/+server.ts`.
- Google OAuth registration starts it from `apps/web/src/lib/utils/google-oauth.ts`.
- State is stored in `public.welcome_email_sequences`.
- Copy and branch logic live in `apps/web/src/lib/server/welcome-sequence.logic.ts`.
- Orchestration lives in `apps/web/src/lib/server/welcome-sequence.service.ts`.
- The cron endpoint is `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`.
- Delivery goes through `apps/web/src/lib/services/email-service.ts`.

The current design is good as a product sequence, but it is not yet the robust queue system we want. The target architecture below keeps the BuildOS-specific copy and branching, but moves the scheduling and state machine toward the 9takes pattern: `claim -> process -> complete`, with `FOR UPDATE SKIP LOCKED`, per-send retries, suppression at send time, and admin preview/metrics.

---

## 0. Source Context From 9takes

This document should be read as a BuildOS-specific port of the production welcome sequence documented in:

```text
/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md
```

The 9takes spec is the source pattern. BuildOS should copy the durable architecture and adapt only the project-specific pieces: product-state inputs, email copy, recipient table names, current email delivery service, and activation goals.

### What The 9takes System Proved

The 9takes implementation solved the parts most lifecycle email systems get wrong:

- **Atomic claiming:** due rows are claimed with `FOR UPDATE SKIP LOCKED`, so overlapping crons cannot double-send.
- **Explicit processing state:** rows move through `active -> processing -> active/completed/exited/errored`, which makes retries and crash recovery understandable.
- **Immediate first send:** signup claims and processes Email 1 immediately instead of waiting for the next cron tick.
- **Suppression at send time:** unsubscribe/suppression is checked right before sending, not only when the user enrolls.
- **Code-managed copy override:** DB content exists as a seed/fallback, but source-controlled code copy wins in production.
- **Per-enrollment exit reasons:** the sequence records why it stopped, instead of only having "sent" timestamps.
- **Tracked sends:** each outbound email has a durable send record with tracking IDs for opens, clicks, unsubscribe, and analytics.
- **Admin preview/test tools:** every step can be rendered with tokens and sent as a test without polluting production analytics.

### Cross-Project Mapping

| 9takes concept                            | BuildOS target                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `email_sequences`                         | Same concept. Seed a sequence with `key = 'buildos_welcome'`.                                                                                          |
| `email_sequence_steps`                    | Same concept. Use BuildOS steps 1-5 and branches from the marketing welcome-sequence doc.                                                              |
| `email_sequence_enrollments`              | Same concept. This becomes the BuildOS queue and replaces the flat `welcome_email_sequences` table over time.                                          |
| `email_sends`                             | Use BuildOS' existing `emails`, `email_recipients`, `email_tracking_events`, and `email_logs` tables instead of adding a parallel `email_sends` table. |
| Gmail sender in `src/lib/email/sender.ts` | Use current BuildOS `EmailService` and `email-config.ts` first. Provider swap can happen later.                                                        |
| 9takes token renderer                     | Port the pattern, but use BuildOS tokens such as `{{latest_project_url}}`, `{{daily_brief_url}}`, and `{{onboarding_intent_hook}}`.                    |
| Exit on question/comment actions          | Adapt to BuildOS actions: first project, onboarding completion, follow-through setup, suppression, admin exit, or activation-complete.                 |
| `/admin/welcome-sequence`                 | Same target route name for BuildOS admin UI.                                                                                                           |
| 15-minute Vercel cron                     | Prefer the same cadence after the queue model lands. Current BuildOS cron is hourly.                                                                   |

### 9takes Files To Inspect During Implementation

These paths live in the other project and should be used as implementation references, not copied blindly:

- [`/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md`](/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md) - full source spec.
- `/Users/djwayne/9takes/src/lib/email/welcome-sequence-content.ts` - code-managed content override pattern.
- `/Users/djwayne/9takes/src/lib/email/sequences.ts` - token rendering and effective content resolution.
- `/Users/djwayne/9takes/src/lib/server/emailSequences.ts` - processing orchestration and state transitions.
- `/Users/djwayne/9takes/src/lib/server/welcomeSequenceGuards.ts` - safe signup/exit wrappers.
- `/Users/djwayne/9takes/src/routes/api/cron/process-sequences/+server.ts` - cron endpoint.
- `/Users/djwayne/9takes/src/routes/admin/welcome-sequence/+page.svelte` - admin preview and queue UI.
- `/Users/djwayne/9takes/supabase/migrations/20260316_welcome_email_sequence.sql` - tables and claim/complete/retry/exit RPCs.
- `/Users/djwayne/9takes/supabase/migrations/20260406_claim_specific_sequence_send.sql` - immediate-send claim RPC.

### What Not To Copy Directly

- Do not copy 9takes URLs, Enneagram-specific tokens, question/comment exit hooks, or `email_sends` schema names directly into BuildOS.
- Do not copy the 9takes admin UI as a monolith unless that is the fastest path. BuildOS already has admin email infrastructure that may be worth extending.
- Do not replace BuildOS' current email tables unless there is a separate migration plan. Reusing the existing tracking tables keeps historical admin email reporting intact.
- Do not pre-schedule all five emails with an email provider. BuildOS branch decisions must be made from fresh product state.

### BuildOS Context This Spec Assumes

The BuildOS implementation should be grounded in the current repository state:

- Auth/profile creation is centered on `public.users`.
- Password registration already calls `WelcomeSequenceService.startSequenceForUser()` from `apps/web/src/routes/api/auth/register/+server.ts`.
- Google OAuth registration already calls the same service from `apps/web/src/lib/utils/google-oauth.ts`.
- Current welcome-state storage is `public.welcome_email_sequences`.
- Existing welcome copy and branch rules live in `apps/web/src/lib/server/welcome-sequence.logic.ts`.
- Existing send orchestration lives in `apps/web/src/lib/server/welcome-sequence.service.ts`.
- Current cron route is `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`.
- Existing delivery goes through `apps/web/src/lib/services/email-service.ts`.
- Existing tracking routes are `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts` and `apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts`.
- Current sender is `dj@build-os.com` via `PRIVATE_DJ_GMAIL_APP_PASSWORD`.

Everything below assumes those facts unless a later implementation explicitly replaces them.

---

## 1. TL;DR

- Enroll every new BuildOS user in `buildos_welcome` when their `public.users` row is created by password registration or first-time Google OAuth.
- Create one enrollment row with `next_step_number = 1` and `next_send_at = NOW()`.
- Send Email 1 immediately by claiming that exact enrollment in the signup flow. This is best-effort and must never block account creation.
- Process later due steps from `/api/cron/welcome-sequence`, ideally every 15 minutes. The cron claims rows atomically with `FOR UPDATE SKIP LOCKED`, flips them from `active` to `processing`, and returns a bounded batch.
- Before each send, load fresh product state: onboarding intent, onboarding completion, project count, latest project, daily brief email status, SMS readiness, calendar connection, and return-session signal.
- Decide whether the step should send, skip, wait, or exit. Skips are recorded as first-class sequence events.
- Send through the existing `EmailService`, so `emails`, `email_recipients`, `email_tracking_events`, and `email_logs` stay the canonical delivery/tracking tables.
- Suppression is checked at send time, not enrollment time.
- Content is code-managed by default, with DB seed rows as a fallback. Code copy wins over DB copy.
- Admins can preview each step/branch with real token rendering, send test emails, inspect the live queue, and see funnel metrics.

---

## 2. Goals

### Product Goals

The welcome sequence should help a new signup do five things:

1. Start a first brain dump.
2. Create or reopen a first project.
3. Finish onboarding enough that BuildOS has useful context.
4. Enable one follow-through channel: daily brief email, SMS, or calendar.
5. Return for a second session before the trial reminder sequence begins.

Day 11+ belongs to a separate trial reminder or conversion sequence. This sequence should not become a trial-expiration campaign.

### Engineering Goals

- No duplicate sends when cron jobs overlap.
- No signup failures caused by the email provider.
- No "select rows where sent is null" race windows.
- Fresh branching decisions at send time.
- Clear observability: due, claimed, sent, skipped, failed, exited, completed.
- Copy that is reviewable in source control.
- Delivery that uses the existing BuildOS email tracking tables.
- A migration path from the current `welcome_email_sequences` implementation.

### Non-Goals

- Do not rebuild the whole notification system.
- Do not send all five steps as pre-scheduled provider emails at signup. Product-state branching needs to be evaluated fresh before each step.
- Do not make welcome emails depend on the general `queue_jobs` worker unless delayed scheduling and idempotent claims are already proven there. The enrollment table is the domain queue.
- Do not block registration if enrollment or Email 1 fails.

---

## 3. Current BuildOS Baseline

### What Exists

| Area           | Current implementation                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Signup trigger | `WelcomeSequenceService.startSequenceForUser()` is called from password registration and first-time Google OAuth registration.           |
| State table    | `public.welcome_email_sequences`, one row per user.                                                                                      |
| Step tracking  | Per-column timestamps: `email_1_sent_at`, `email_1_skipped_at`, etc.                                                                     |
| Scheduling     | Step day offsets in code: day 0, 1, 3, 6, 9. Cron runs hourly.                                                                           |
| Branching      | `determineNextWelcomeAction()` in `welcome-sequence.logic.ts`.                                                                           |
| Copy           | Code-managed in `welcome-sequence.logic.ts`.                                                                                             |
| Delivery       | `EmailService.sendEmail()` with Gmail app password for `dj@build-os.com`.                                                                |
| Tracking       | `emails`, `email_recipients`, `email_tracking_events`, `email_logs`; open and click endpoints under `/api/email-tracking/[tracking_id]`. |
| Cron auth      | `CRON_SECRET` and `PRIVATE_CRON_SECRET` via `isAuthorizedCronRequest()`.                                                                 |
| Tests          | `welcome-sequence.logic.test.ts`, `welcome-sequence.service.test.ts`, register tests.                                                    |

### Gaps To Close

| Gap                                                               | Why it matters                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No generic `email_sequences` / `steps` / `enrollments` model      | Harder to reuse for trial reminders, onboarding variants, reactivation, or paid-user onboarding.                    |
| No `next_send_at` queue key                                       | Cron has to load active rows and decide due-ness in app code.                                                       |
| App-code claim window instead of Postgres row locks               | Better than nothing, but weaker than `FOR UPDATE SKIP LOCKED` under concurrent workers.                             |
| No `processing` / retry / `errored` state                         | Failures are visible, but not modeled as a durable state machine.                                                   |
| No `last_email_id` pointer on the sequence row                    | Harder to reconcile sends, clicks, and completion.                                                                  |
| No suppression table or one-click unsubscribe for lifecycle email | BuildOS can respect daily brief preferences, but lifecycle opt-out needs a dedicated path.                          |
| No admin welcome-sequence page                                    | No first-class queue, preview, test-send, or step/branch funnel view.                                               |
| Email provider has no request idempotency                         | Gmail/Nodemailer cannot prevent duplicate delivery if the app crashes after provider send but before DB completion. |

---

## 4. Target Architecture

```
Password / Google signup
creates public.users row
        |
        | best-effort, never blocks auth
        v
enroll_user_in_sequence
key='buildos_welcome'
        |
        | inserts enrollment
        v
email_sequence_enrollments
status='active', next_step_number=1, next_send_at=NOW()
        |
        | signup flow claims this exact row
        v
claim_specific_sequence_send for Email 1
        |
        v
load product state
render branch content
send through EmailService
        |
        v
complete_sequence_send
schedules next step
        |
        v
future next_send_at


Every 15 minutes:

/api/cron/welcome-sequence
CRON_SECRET guarded
        |
        v
claim_pending_sequence_sends(limit)
FOR UPDATE SKIP LOCKED
        |
        v
suppression + fresh state
send / skip / exit / retry
```

The enrollment table is the queue. It stores the next due step and the next timestamp. The app only handles rows that Postgres has atomically claimed.

---

## 5. Data Model

### 5.1 `email_sequences`

Named containers for lifecycle sequences.

| Column         | Type        | Notes                                                                         |
| -------------- | ----------- | ----------------------------------------------------------------------------- |
| `id`           | UUID PK     |                                                                               |
| `key`          | TEXT UNIQUE | Stable code identifier. For this sequence: `buildos_welcome`.                 |
| `display_name` | TEXT        | Admin label.                                                                  |
| `description`  | TEXT        |                                                                               |
| `trigger_type` | TEXT        | `user_registration`, `manual`, later `trial_started`, `subscription_started`. |
| `status`       | TEXT        | `draft`, `active`, `paused`, `archived`. Only `active` enrolls/sends.         |
| timestamps     |             | `created_at`, `updated_at`.                                                   |

### 5.2 `email_sequence_steps`

Ordered steps for a sequence. These rows are seed/fallback content and admin metadata. Production copy should be code-managed.

| Column                             | Type    | Notes                                                                                 |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `id`                               | UUID PK |                                                                                       |
| `sequence_id`                      | UUID FK | `ON DELETE CASCADE`.                                                                  |
| `step_number`                      | INT     | Unique per sequence.                                                                  |
| `step_key`                         | TEXT    | `email_1`, `email_2`, etc.                                                            |
| `delay_days_after_previous`        | INT     | 0 for step 1, then 1/2/3/etc if using relative delays.                                |
| `absolute_day_offset`              | INT     | BuildOS current offsets: 0, 1, 3, 6, 9. Useful for direct reasoning from signup time. |
| `send_window_start_hour`           | INT     | Default 9 local time for non-immediate steps.                                         |
| `send_window_end_hour`             | INT     | Default 17 local time.                                                                |
| `subject`                          | TEXT    | DB fallback subject.                                                                  |
| `html_content`                     | TEXT    | DB fallback HTML/template.                                                            |
| `plain_text`                       | TEXT    | DB fallback plain text.                                                               |
| `status`                           | TEXT    | `active`, `paused`.                                                                   |
| `UNIQUE(sequence_id, step_number)` |         |                                                                                       |

### 5.3 `email_sequence_enrollments`

The actual queue. One row per user per sequence.

| Column                         | Type        | Notes                                                                                            |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------ |
| `id`                           | UUID PK     |                                                                                                  |
| `sequence_id`                  | UUID FK     |                                                                                                  |
| `user_id`                      | UUID FK     | BuildOS `public.users.id`. Nullable only if future lead sequences support non-user recipients.   |
| `recipient_email`              | TEXT        | Snapshot at enrollment. Re-read from user before send if present, but keep snapshot for audit.   |
| `recipient_source`             | TEXT        | `users` for this sequence. Future: `beta_signups`, `retargeting_cohort_members`, etc.            |
| `recipient_source_id`          | TEXT        | Usually `user_id`.                                                                               |
| `status`                       | TEXT        | `active`, `processing`, `paused`, `completed`, `exited`, `errored`, `cancelled`.                 |
| `current_step_number`          | INT         | Last finalized step, whether sent or skipped. Starts at 0.                                       |
| `next_step_number`             | INT         | Step to evaluate next. Null after completion/exit/error.                                         |
| `next_send_at`                 | TIMESTAMPTZ | Queue key. Indexed.                                                                              |
| `last_sent_at`                 | TIMESTAMPTZ | Last successful email send.                                                                      |
| `last_email_id`                | UUID        | FK to `emails.id`, not `email_logs.id`.                                                          |
| `processing_started_at`        | TIMESTAMPTZ | Set by claim RPC. Reaped after 2 hours.                                                          |
| `failure_count`                | INT         | Reset after successful send or skip.                                                             |
| `exit_reason`                  | TEXT        | `completed`, `activated`, `unsubscribed`, `suppressed`, `user_deleted`, `manual`, `hard_bounce`. |
| `last_error`                   | TEXT        | Last failure, truncated to 1000 chars.                                                           |
| `metadata`                     | JSONB       | Signup method, trigger source, variant assignment, UTM snapshot.                                 |
| timestamps                     |             | `created_at`, `updated_at`.                                                                      |
| `UNIQUE(sequence_id, user_id)` |             | Prevents duplicate enrollment for registered users.                                              |

Critical index:

```sql
CREATE INDEX idx_email_sequence_enrollments_due
  ON public.email_sequence_enrollments(next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;
```

### 5.4 `email_sequence_events`

BuildOS has branches and skips. Store decisions explicitly instead of inferring from sent/skipped columns.

| Column          | Type        | Notes                                                                                               |
| --------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `id`            | UUID PK     |                                                                                                     |
| `enrollment_id` | UUID FK     |                                                                                                     |
| `sequence_id`   | UUID FK     |                                                                                                     |
| `user_id`       | UUID FK     |                                                                                                     |
| `step_number`   | INT         |                                                                                                     |
| `step_key`      | TEXT        |                                                                                                     |
| `event_type`    | TEXT        | `enrolled`, `claimed`, `sent`, `skipped`, `failed`, `retried`, `exited`, `completed`, `suppressed`. |
| `branch_key`    | TEXT        | `welcome`, `no_project`, `finish_setup`, etc.                                                       |
| `reason`        | TEXT        | `initial_welcome`, `project_already_created`, `outside_send_window`, etc.                           |
| `email_id`      | UUID        | FK to `emails.id` when applicable.                                                                  |
| `metadata`      | JSONB       | Product-state snapshot and send result.                                                             |
| `created_at`    | TIMESTAMPTZ |                                                                                                     |

This table is not the source of truth for the queue. The enrollment row is. Events are the audit log.

### 5.5 Existing Delivery Tables

Keep using the current rich email tables:

- `emails`: canonical email record, subject/content/sender/tracking ID/category/template data.
- `email_recipients`: per-recipient state, open/click timestamps, status.
- `email_tracking_events`: open/click event stream.
- `email_logs`: legacy/simple send log used by current services and fallback hydration.

For welcome sends, require this metadata on both `emails.template_data` and `email_logs.metadata`:

```json
{
	"category": "welcome_sequence",
	"campaign": "welcome-sequence",
	"campaign_type": "lifecycle",
	"sequence_key": "buildos_welcome",
	"sequence_name": "buildos-welcome-sequence",
	"sequence_version": "2026-04-17",
	"enrollment_id": "...",
	"sequence_step": "email_3",
	"step_number": 3,
	"branch_key": "reopen_project",
	"cta_label": "Re-open your project",
	"cta_url": "https://build-os.com/projects/...",
	"signup_method": "google_oauth"
}
```

---

## 6. Postgres RPCs

Use RPCs for queue transitions so concurrency is handled in the database, not in app loops.

| RPC                                                                                                                          | Purpose                                                                 | Safety                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `enroll_user_in_email_sequence(p_user_id, p_sequence_key, p_recipient_email, p_signup_method, p_trigger_source, p_metadata)` | Idempotently creates an enrollment row for an active sequence.          | `SECURITY DEFINER`. Returns existing enrollment if already enrolled.             |
| `claim_pending_email_sequence_sends(p_sequence_key, p_limit)`                                                                | Claims due active enrollments and returns rows for processing.          | Reaps stale `processing` rows older than 2 hours. Uses `FOR UPDATE SKIP LOCKED`. |
| `claim_specific_email_sequence_send(p_enrollment_id)`                                                                        | Claims one exact enrollment, used for signup-time Email 1.              | Same transition guard as the batch claim.                                        |
| `complete_email_sequence_send(p_enrollment_id, p_email_id, p_branch_key, p_metadata)`                                        | Marks current step sent, stores `last_email_id`, advances or completes. | Only transitions from `processing`.                                              |
| `skip_email_sequence_step(p_enrollment_id, p_branch_key, p_reason, p_metadata)`                                              | Finalizes a due step without sending and advances to next step.         | Only transitions from `processing`.                                              |
| `retry_or_fail_email_sequence_send(p_enrollment_id, p_error)`                                                                | Requeues transient failures or marks `errored`.                         | Retry 3 times with 30-minute backoff.                                            |
| `exit_user_from_email_sequence(p_user_id, p_sequence_key, p_reason)`                                                         | Exits active/processing/paused enrollments for a user.                  | Idempotent.                                                                      |
| `exit_email_from_email_sequence(p_email, p_sequence_key, p_reason)`                                                          | Exits by normalized email for suppression and unsubscribe.              | Idempotent.                                                                      |

### Claim Pattern

The important bit is the claim query:

```sql
WITH due AS (
  SELECT e.id
  FROM public.email_sequence_enrollments e
  JOIN public.email_sequences s ON s.id = e.sequence_id
  WHERE s.key = p_sequence_key
    AND s.status = 'active'
    AND e.status = 'active'
    AND e.next_send_at <= NOW()
  ORDER BY e.next_send_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED
)
UPDATE public.email_sequence_enrollments e
SET status = 'processing',
    processing_started_at = NOW(),
    updated_at = NOW()
FROM due
WHERE e.id = due.id
RETURNING e.*;
```

This is the difference between "probably fine" and "safe under concurrent cron runs." Two workers can run at the same time and cannot claim the same enrollment.

---

## 7. Sequence State Machine

### Enrollment

1. Signup creates or resolves `public.users`.
2. App calls `enroll_user_in_email_sequence(...)`.
3. RPC inserts:
    - `status = 'active'`
    - `current_step_number = 0`
    - `next_step_number = 1`
    - `next_send_at = NOW()`
4. App immediately calls `processSequenceEnrollmentNow(enrollmentId)` for Email 1.
5. If anything fails, log it and return a successful signup response.

### Processing

For each claimed enrollment:

1. Check lifecycle suppression.
2. Load current BuildOS product state.
3. Determine action:
    - `send`
    - `skip`
    - `wait` (rare after claim; used if local send window changed)
    - `exit`
4. If suppressed, call `exit_email_from_email_sequence(..., 'suppressed')`.
5. If skipped, call `skip_email_sequence_step`.
6. If sendable, render content and call `EmailService.sendEmail`.
7. If send succeeds, call `complete_email_sequence_send`.
8. If send fails, call `retry_or_fail_email_sequence_send`.

### Completion

The sequence completes when:

- Email 5 is sent or skipped and no later steps exist.
- The user hits the configured activation-complete rule and the product chooses not to send the final check-in.
- An admin manually completes/exits the enrollment.

Default BuildOS activation-complete rule:

```text
project_count > 0
AND onboarding_completed = true
AND has_follow_through_channel = true
AND returned_for_second_session = true
```

Product decision: Email 5 can still be sent as a founder-style check-in after activation, but Emails 2-4 should never nag for work the user has already done.

---

## 8. Welcome Sequence Steps

The source copy lives in `docs/marketing/strategy/buildos-welcome-sequence.md`. The implementation copy should live in code so it can be reviewed, tested, and grepped.

| Step    | Due         | Branches                                                              | Goal                                      | Primary CTA                                    |
| ------- | ----------- | --------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| Email 1 | Immediately | `welcome`                                                             | Get the user to start one brain dump.     | Start your first brain dump                    |
| Email 2 | Day 1       | `no_project`; skip `already_created_project`                          | Remove blank-page anxiety.                | Open BuildOS                                   |
| Email 3 | Day 3       | `no_project`, `finish_setup`, `reopen_project`                        | Explain context that carries forward.     | Open BuildOS, finish setup, or reopen project  |
| Email 4 | Day 6       | `finish_setup`, `follow_through_missing`; skip `follow_through_ready` | Move from capture to follow-through.      | Set up daily brief, notifications, or calendar |
| Email 5 | Day 9       | `returning_check_in`, `general_check_in`                              | Personal check-in and use-case relevance. | Open BuildOS or reply                          |

### Product State Inputs

Load fresh before every step:

- `user.id`
- `user.email`
- `user.name`
- `user.created_at`
- `user.timezone`
- `user.onboarding_intent`
- `user.onboarding_completed_at`
- project count from `onto_projects`
- latest project id
- daily brief preference from `user_brief_preferences` and `user_notification_preferences`
- SMS readiness from `user_sms_preferences`
- calendar connection from `user_calendar_tokens`
- return signal from `users.last_visit` until a better session-count table exists

### Branching Rules

Email 2:

- Send `no_project` if `project_count = 0`.
- Skip `already_created_project` if `project_count > 0`.

Email 3:

- `no_project` if `project_count = 0`.
- `finish_setup` if project exists but onboarding is incomplete.
- `reopen_project` if onboarding is complete or near-complete.

Email 4:

- `finish_setup` if onboarding is incomplete.
- `follow_through_missing` if onboarding is complete but no daily brief email, SMS, or calendar channel is configured.
- Skip `follow_through_ready` if at least one follow-through channel exists.

Email 5:

- `returning_check_in` if `last_visit - started_at >= 12 hours`.
- `general_check_in` otherwise.

---

## 9. Content Management

### Target File Split

The current `welcome-sequence.logic.ts` mixes copy, branching, rendering helpers, and scheduling logic. Split it when implementing the queue upgrade:

| File                                                  | Responsibility                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/src/lib/server/welcome-sequence.content.ts` | Step/branch copy, subject lines, CTAs, plain text, HTML templates.    |
| `apps/web/src/lib/server/welcome-sequence.logic.ts`   | Pure state-machine decisions: send/skip/wait/exit.                    |
| `apps/web/src/lib/server/welcome-sequence.service.ts` | DB claims, state loading, send orchestration, completion/retry calls. |
| `apps/web/src/lib/server/email-sequence-rpcs.ts`      | Thin typed wrappers around Supabase RPCs.                             |

### Code Override Wins

DB rows are fallback content and admin metadata. Code content wins in production:

```ts
const managedContent = getManagedSequenceContent(sequenceKey, stepNumber, branchKey);
const subjectTemplate = managedContent?.subject ?? dbStep.subject;
const htmlTemplate = managedContent?.htmlContent ?? dbStep.html_content;
const plainTextTemplate = managedContent?.plainText ?? dbStep.plain_text;
```

Why preserve this pattern:

- Production copy is reviewed in PRs.
- DB seeds provide disaster recovery and admin previews.
- Admins can experiment with DB rows, then promote winning copy into code.
- Tests can snapshot token rendering and branch selection.

### Tokens

Use `{{token_name}}`, case-insensitive, spaces allowed.

Required tokens:

- `{{first_name}}`
- `{{email}}`
- `{{app_url}}`
- `{{onboarding_url}}`
- `{{projects_url}}`
- `{{latest_project_url}}`
- `{{daily_brief_url}}`
- `{{calendar_url}}`
- `{{notifications_url}}`
- `{{onboarding_intent_hook}}`

HTML token values must be escaped. Plain-text values should not be HTML-escaped. Unknown tokens should remain visible in QA instead of being silently stripped.

---

## 10. Signup Triggers

### Password Registration

Current call site:

```text
apps/web/src/routes/api/auth/register/+server.ts
```

Target behavior:

1. `ensureUserProfileForRegistration(...)` creates or resolves `public.users`.
2. Call `startWelcomeSequenceForUser({ userId, signupMethod: 'email' })`.
3. Wrapper creates enrollment and best-effort sends Email 1.
4. Catch errors, log through `ErrorLoggerService`, and continue registration.

### Google OAuth Registration

Current call site:

```text
apps/web/src/lib/utils/google-oauth.ts
```

Target behavior:

1. Only enroll when `config.isRegistration && authResult.isNewUser`.
2. Use `signupMethod: 'google_oauth'`.
3. Same best-effort behavior as password registration.

### Backfill

The growth audit found that welcome rows can be missing. Add an admin/backfill script or RPC:

```text
backfill_welcome_sequence_enrollments(created_after, dry_run)
```

It should enroll users who:

- have a `public.users` row,
- have a valid email,
- are not already enrolled in `buildos_welcome`,
- are not suppressed,
- and are not deleted/cancelled.

Backfill should not blindly send Email 1 to old users. It should either set `next_send_at` to now with a special `trigger_source = 'backfill'`, or create rows paused for admin review.

---

## 11. Cron

Reuse the current endpoint unless there is a strong reason to rename it:

```text
apps/web/src/routes/api/cron/welcome-sequence/+server.ts
```

Target behavior:

- Accept `GET` for Vercel cron and `POST` for manual/admin triggering.
- Guard with `CRON_SECRET` and `PRIVATE_CRON_SECRET`.
- Default batch size: 50.
- Run every 15 minutes in `vercel.json`:

```json
{
	"path": "/api/cron/welcome-sequence",
	"schedule": "*/15 * * * *"
}
```

- Insert a `cron_logs` row every run with:
    - `evaluated`
    - `claimed`
    - `sent`
    - `skipped`
    - `completed`
    - `exited`
    - `retried`
    - `errored`
    - summarized errors

Non-immediate steps should respect the user's local 9am-5pm send window. If a claimed row is outside the window, requeue it to the next valid local send-window start instead of burning a retry.

---

## 12. Sender, Tracking, Suppression

### Sender

Current sender:

- `dj@build-os.com`
- configured through `PRIVATE_DJ_GMAIL_APP_PASSWORD`
- implemented by `apps/web/src/lib/utils/email-config.ts`
- sent by `EmailService`

Keep this path for the first implementation. If moving to Resend later, use Resend idempotency keys in the format:

```text
welcome-sequence/{enrollment_id}/{step_number}
```

With Gmail/Nodemailer, delivery is not provider-idempotent. The DB state machine must carry the idempotency burden:

- one enrollment can only be claimed by one worker,
- one step can only complete once,
- sent records include `enrollment_id` and `step_number`,
- recovery can hydrate from `email_logs` if the app sent email but failed before updating the enrollment.

### Tracking

Keep using:

- `GET /api/email-tracking/[tracking_id]` for opens.
- `GET /api/email-tracking/[tracking_id]/click?url=...` for clicks.

`EmailService` already appends a tracking pixel and rewrites links when `trackingEnabled` is true. Welcome emails should use tracking unless the user has opted out of lifecycle tracking or a deliverability issue forces it off.

### Required Email Headers

Add these headers in `EmailService` for lifecycle emails:

- `Reply-To: dj@build-os.com`
- `List-ID: BuildOS <emails.build-os.com>`
- `List-Unsubscribe: <https://build-os.com/api/email-tracking/{tracking_id}/unsubscribe>, <mailto:dj@build-os.com?subject=unsubscribe>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

### Suppression

Add a lifecycle suppression table if one does not already exist:

| Column       | Type        | Notes                                                |
| ------------ | ----------- | ---------------------------------------------------- |
| `id`         | UUID PK     |                                                      |
| `email`      | TEXT        | Normalized lowercase email.                          |
| `scope`      | TEXT        | `lifecycle`, `marketing`, `all`.                     |
| `reason`     | TEXT        | `unsubscribe`, `hard_bounce`, `manual`, `complaint`. |
| `source`     | TEXT        | `email_link`, `admin`, `provider_webhook`.           |
| `created_at` | TIMESTAMPTZ |                                                      |

At send time:

1. Normalize recipient email.
2. Check suppressions where scope is `lifecycle` or `all`.
3. Check user notification preferences if a global email opt-out exists.
4. If suppressed, exit enrollment with `exit_reason = 'suppressed'`.
5. Do not retry suppressed sends.

Do not check only at enrollment. A user may unsubscribe after Email 1 and before Email 2.

---

## 13. Admin UI

Create or extend an admin route:

```text
apps/web/src/routes/admin/welcome-sequence/
```

Capabilities:

- Step list with every branch.
- "Copy managed in code" badge when code content overrides DB content.
- Effective subject/plain-text/HTML preview.
- Token preview with selectable sample users.
- Send test email for one step/branch.
- Send the whole test sequence to a specified address with `[TEST]` subject prefix.
- Live queue table:
    - recipient email
    - status
    - next step
    - next send time
    - branch preview
    - failure count
    - last error
- Funnel metrics:
    - enrolled
    - step 1 sent
    - step 2 sent/skipped
    - step 3 branch split
    - step 4 sent/skipped
    - step 5 sent
    - completed/exited/errored
- Engagement metrics:
    - opens
    - clicks
    - reply indicator if manually tracked
    - first project after email
    - onboarding completion after email
    - return visit after email
- Admin actions:
    - pause enrollment
    - resume enrollment
    - exit enrollment
    - retry errored enrollment
    - send next step now

Test sends must not pollute production analytics. Either disable tracking or mark metadata with:

```json
{
	"test_send": true,
	"campaign": "welcome-sequence-test"
}
```

---

## 14. Observability

### Cron Logs

Every cron run writes `cron_logs` with a human-readable summary and structured metadata.

Example message:

```text
Claimed 42 welcome enrollments, sent 31, skipped 7, exited 2, retried 2, errored 0
```

### Error Logs

Log per-user processing failures through `ErrorLoggerService` with:

- endpoint: `/api/cron/welcome-sequence`
- operation type: `welcome_sequence_process_user`
- user id
- enrollment id
- step number
- branch key when known

### Metrics To Track

- New signup to enrollment row creation rate.
- Enrollment to Email 1 sent rate.
- Email 1 delivery failure rate.
- Step due-to-sent lag.
- Suppression exits.
- Retry count and terminal error rate.
- Open/click by step and branch.
- First project creation after Email 1 or Email 2.
- Onboarding completion after Email 3 or Email 4.
- Return session after Email 3 or Email 5.

---

## 15. Tests

### Unit Tests

Keep and extend:

- `apps/web/src/lib/server/welcome-sequence.logic.test.ts`
- `apps/web/src/lib/server/welcome-sequence.service.test.ts`
- `apps/web/src/routes/api/auth/register/server.test.ts`

Required coverage:

- Email 1 sends immediately.
- Email 2 sends only if no project exists.
- Email 2 skips if project exists.
- Email 3 selects `no_project`, `finish_setup`, or `reopen_project`.
- Email 4 skips if follow-through is ready.
- Email 5 detects returning users.
- Send-window logic respects user timezone.
- HTML token values are escaped.
- Unknown tokens remain visible.
- Suppressed email exits instead of sending.
- Provider failure retries and then errors.
- Existing sent logs can hydrate step state after a partial failure.

### SQL Tests

Add SQL-level tests or migration verification for:

- enrollment idempotency,
- `FOR UPDATE SKIP LOCKED` claim behavior,
- stale `processing` reaper,
- partial due index existence,
- status transition guards,
- unique `(sequence_id, user_id)`.

### Manual Verification

1. Create a new password signup.
2. Confirm enrollment row exists.
3. Confirm Email 1 sends within seconds.
4. Confirm `emails`, `email_recipients`, and `email_logs` contain welcome metadata.
5. Open the email and confirm `email_tracking_events` records an open.
6. Click the CTA and confirm click tracking redirects correctly.
7. Force `next_send_at` for Email 2 and run cron.
8. Create a project and confirm Email 2 skips.
9. Configure daily brief email and confirm Email 4 skips.
10. Trigger unsubscribe and confirm later steps exit without send.

---

## 16. Environment Variables

| Variable                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `PUBLIC_APP_URL`                | Base URL for CTA, tracking, unsubscribe links.           |
| `PRIVATE_DJ_GMAIL_APP_PASSWORD` | Gmail app password for `dj@build-os.com`.                |
| `CRON_SECRET`                   | Runtime cron bearer secret.                              |
| `PRIVATE_CRON_SECRET`           | Static private cron bearer secret.                       |
| Supabase service role env       | Required wherever `createAdminSupabaseClient()` runs.    |
| Future `RESEND_API_KEY`         | Only if moving delivery from Gmail/Nodemailer to Resend. |

Deliverability prerequisites:

- SPF, DKIM, and DMARC configured for `build-os.com`.
- Links use `https://build-os.com` or the production app domain.
- Plain text and HTML bodies are always sent.
- Reply address is real.
- Transactional tracking is kept modest; avoid heavy click wrapping if deliverability suffers.

---

## 17. Migration Plan

### Phase 1: Stabilize Current System

- Verify password and Google signups both call `startSequenceForUser`.
- Verify current `welcome_email_sequences` row creation in production.
- Verify `PRIVATE_DJ_GMAIL_APP_PASSWORD` works.
- Verify `/api/cron/welcome-sequence` runs and writes `cron_logs`.
- Fix any current delivery failures before adding new tables.

### Phase 2: Add Queue Tables And RPCs

- Add `email_sequences`.
- Add `email_sequence_steps`.
- Add `email_sequence_enrollments`.
- Add `email_sequence_events`.
- Seed `buildos_welcome`.
- Add claim/complete/skip/retry/exit RPCs.
- Add migration to backfill active `welcome_email_sequences` rows into the new enrollment model.

### Phase 3: Refactor Service

- Keep public class name `WelcomeSequenceService` if that minimizes call-site churn.
- Replace per-column timestamp logic with enrollment/step queue logic.
- Preserve current branch behavior.
- Preserve current metadata shape and add `enrollment_id`.
- Send Email 1 through `claim_specific_email_sequence_send`.
- Cron uses `claim_pending_email_sequence_sends`.

### Phase 4: Content Split And Admin UI

- Move copy to `welcome-sequence.content.ts`.
- Keep `welcome-sequence.logic.ts` pure.
- Build `/admin/welcome-sequence`.
- Add test-send and preview flows.

### Phase 5: Suppression And Unsubscribe

- Add suppression table/RPC.
- Add one-click unsubscribe route.
- Add `List-Unsubscribe` headers.
- Check suppression inside sequence processing.

### Phase 6: Retire Legacy Table

Once the new system is verified:

- Stop writing `welcome_email_sequences`.
- Keep read-only migration diagnostics for one release.
- Remove legacy hydration fallback once all active users have migrated.

---

## 18. Design Decisions Worth Preserving

1. **Claim in Postgres, not in app code.** The database can lock due rows atomically. App loops cannot do this safely under concurrency.
2. **The enrollment row is the queue.** This keeps delayed scheduling, branch state, retries, and exit reasons in one domain-specific place.
3. **Email 1 is immediate but best-effort.** Users should get the welcome email quickly, but signup must not depend on Gmail uptime.
4. **Branch decisions happen at send time.** BuildOS product state changes quickly during onboarding. Do not precompute all five sends at signup.
5. **Skips are first-class events.** A skipped Email 2 because the user created a project is a success, not missing data.
6. **Suppression is checked at send time.** Enrollment-time checks are stale by Email 2.
7. **Code-managed copy wins.** Version control beats mystery production copy for lifecycle messages.
8. **Use existing email tables.** BuildOS already has tracking and admin email infrastructure. Do not invent a parallel `email_sends` table unless there is a separate migration plan.
9. **Keep the sequence respectful.** Once a user has done the thing a nudge asks for, skip that nudge.
10. **Log enough to debug one user.** The admin UI should answer: why did this user get or not get this email?

---

## 19. Known Sharp Edges

- Gmail/Nodemailer has no provider-level idempotency key. If exact-once provider delivery matters, move lifecycle email to Resend/Postmark/SES with idempotent send semantics.
- `users.last_visit` is only an approximation for second-session detection. A real session or meaningful-action event would be better.
- Subject-line changes can fragment historical metrics unless step/branch metadata is used as the metric key.
- If email confirmation is required, decide whether Email 1 should send immediately after signup or after first confirmed session. The current behavior sends after the `public.users` row exists.
- Local send windows need careful timezone handling when a user has no timezone. Default to UTC or the app default, and record the choice in event metadata.
- Backfilling old users can feel odd if they receive "Welcome" late. Backfill should use a dedicated branch or pause rows for review.
- Admin test sends can pollute analytics if not explicitly marked.
- If the cron stops, stuck `processing` rows only recover on the next claim run.

---

## 20. Implementation Checklist

- [ ] Confirm production email delivery works with `dj@build-os.com`.
- [ ] Add queue tables and indexes.
- [ ] Add RPCs for enroll, claim, complete, skip, retry, exit.
- [ ] Seed `buildos_welcome` and five steps.
- [ ] Refactor `WelcomeSequenceService` to use queue RPCs.
- [ ] Keep signup call sites best-effort.
- [ ] Update Vercel cron to every 15 minutes if volume warrants it.
- [ ] Add suppression table and unsubscribe endpoint.
- [ ] Add lifecycle email headers.
- [ ] Split content from logic.
- [ ] Build admin preview/test/queue page.
- [ ] Backfill or migrate legacy `welcome_email_sequences`.
- [ ] Add tests for claims, branching, retries, suppression, and tracking metadata.
- [ ] Run one fresh password-signup and one fresh Google-signup manual test.
