<!-- docs/specs/buildos-welcome-email-sequence-system.md -->

# BuildOS Welcome Email Sequence System

**Status:** Draft implementation spec
**Author:** DJ + Codex
**Date:** 2026-04-17
**Scope:** `apps/web/`, `supabase/migrations/`, shared email tables
**Related docs:**

- `docs/marketing/strategy/buildos-welcome-sequence.md` (source of truth for copy and tone)
- `docs/marketing/brand/brand-guide-1-pager.md` (voice, visual)
- `docs/marketing/growth/growth-audit-2026-04-09.md` (production emergency context)
- `docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md`
- Source architecture from 9takes: [`/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md`](/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md)

This spec adapts the 9takes welcome-sequence architecture to BuildOS. The target is a production-grade, queue-driven lifecycle sequence that enrolls every **new** BuildOS signup, sends the first email immediately, schedules the remaining emails by timestamp, branches off fresh product state, tracks delivery and engagement, and avoids duplicate sends under cron concurrency.

**Scope note: this spec is for new signups only.**

- **In scope:** any user whose `public.users` row is created _after_ this welcome system deploys to production.
- **Out of scope:** every user who already has a `public.users` row at deploy time — including the ~94 existing users that the current broken pipeline never successfully emailed. They are not "missed welcomes." They are reactivation candidates and receive **zero** emails from this sequence.
- Existing users are addressed by a separate **Reactivation Campaign** (see §22), which is a distinct sequence with different copy, intent, and ethics. That campaign will reuse the infrastructure this spec builds, but is written under its own spec.
- This means the guard is firm: _before_ Phase 0's delivery fix goes live, the existing `welcome_email_sequences` rows for all pre-deploy users must be terminated so the fixed pipeline does not back-send Email 1 to them (see §19 Phase 0).

The current BuildOS implementation is a useful v0:

- Password signup starts the sequence from `apps/web/src/routes/api/auth/register/+server.ts`.
- Google OAuth registration starts it from `apps/web/src/lib/utils/google-oauth.ts`.
- State is stored in `public.welcome_email_sequences`.
- Copy and branch logic live in `apps/web/src/lib/server/welcome-sequence.logic.ts`.
- Orchestration lives in `apps/web/src/lib/server/welcome-sequence.service.ts`.
- The cron endpoint is `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`.
- Delivery goes through `apps/web/src/lib/services/email-service.ts`.

The current design is fine as a product sequence, but it has two open problems:

1. **Delivery is broken.** Per the 2026-04-09 growth audit, **0 of 94 users** have received a welcome email and the email pipeline has a **~55% failure rate**. Any queue work on top of this is wasted until Email 1 reliably lands.
2. **The queue model is not safe.** The current design uses per-column timestamps and app-code claim windows. It works under single-cron sequential load. It does not safely handle concurrent cron runs, crash recovery, or per-send retries.

This spec keeps the BuildOS copy and branching, and moves scheduling and state to the 9takes pattern: `claim -> process -> complete`, with `FOR UPDATE SKIP LOCKED`, per-send retries, suppression at send time, and admin preview/metrics.

---

## 0. Source Context From 9takes

Read this spec as a BuildOS-specific port of:

```text
/Users/djwayne/9takes/docs/specs/email-welcome-sequence-system.md
```

Copy the durable architecture. Adapt only project-specific pieces: product-state inputs, email copy, recipient table names, current delivery service, and activation goals.

### What The 9takes System Proved

- **Atomic claiming:** `FOR UPDATE SKIP LOCKED` prevents overlapping crons from double-sending.
- **Explicit processing state:** `active -> processing -> active/completed/exited/errored` makes retries and crash recovery understandable.
- **Immediate first send:** signup claims and processes Email 1 in-request instead of waiting for cron.
- **Suppression at send time:** unsubscribe/suppression is checked right before sending, not at enrollment.
- **Code-managed copy:** source-controlled local copy wins in production; Supabase does not store subject/body/HTML.
- **Per-enrollment exit reasons:** the sequence records why it stopped, not just when it sent.
- **Tracked sends:** each outbound email has a durable send record with tracking IDs.
- **Admin preview/test tools:** every step can be rendered with tokens and test-sent without polluting analytics.

### Cross-Project Mapping

| 9takes concept               | BuildOS target                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `email_sequences`            | Same. Seed a sequence with `key = 'buildos_welcome'`.                                                                       |
| `email_sequence_steps`       | Same. BuildOS steps 1-5 with the branches defined in the marketing welcome-sequence doc.                                    |
| `email_sequence_enrollments` | Same. Becomes the BuildOS queue and replaces the flat `welcome_email_sequences` table.                                      |
| `email_sends`                | Use BuildOS' existing `emails`, `email_recipients`, `email_tracking_events`, and `email_logs` tables. No parallel table.    |
| Gmail sender                 | Use current `EmailService` and `email-config.ts` for v1. Provider upgrade to Resend/Postmark is Phase 6 and fully expected. |
| 9takes token renderer        | Port the pattern. Use BuildOS tokens like `{{latest_project_url}}`, `{{daily_brief_url}}`, `{{onboarding_intent_hook}}`.    |
| Exit on question/comment     | Adapt to BuildOS exits: first project, onboarding completion, follow-through setup, suppression, admin exit, activation.    |
| `/admin/welcome-sequence`    | Same admin route name for BuildOS.                                                                                          |
| 15-minute Vercel cron        | Same cadence after the queue model lands. Current BuildOS cron is hourly.                                                   |

### What Not To Copy Directly

- Do not copy 9takes URLs, Enneagram tokens, question/comment exit hooks, or `email_sends` schema names.
- Do not copy the 9takes admin UI as a monolith unless that is the fastest path.
- Do not replace BuildOS' current email tables. Reusing them keeps historical email reporting intact.
- Do not pre-schedule all five emails with an email provider. Branch decisions must be made from fresh product state.
- Do not copy the 9takes polymorphic `recipient_source` concept into v1. BuildOS v1 is `users` only. (See §5.)

---

## 1. Brand Voice & Voice Guardrails

The welcome sequence is **the first real interaction** between BuildOS and a new user. Copy discipline is not a style nit — it's activation.

### Read Before Writing Or Editing Copy

- `docs/marketing/strategy/buildos-welcome-sequence.md` (source of truth for drafts, branches, tone)
- `docs/marketing/brand/brand-guide-1-pager.md` (voice, visual)
- `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md` (do not lead with AI)

### Voice

- Direct.
- Practical.
- Builder-first.
- Calm and useful.
- Focused on relief, structure, and momentum.

### Do

- Say "brain dump", "what you're building", "messy version", "start from zero", "one clear next move", "keep building on it".
- Sign emails `DJ`.
- Keep one CTA per email.
- Write in the second person to a real builder.
- Use `{{first_name}}` with fallback. Never send "Hi null,".

### Do Not

- Lead with "AI-powered productivity" or any AI-forward opener.
- Use "cognitive sovereignty", "citizens", "empire builders", manifesto language, or movement framing.
- Invent founder stories, fake app-failure counts, diagnoses, or social proof.
- Ask the user to learn the whole product before they get value.
- Send trial urgency, pricing pressure, or discount language inside this sequence. (That lives in the trial-reminder sequence.)
- Use more than one CTA per email.

### Voice Regression Checklist

Any copy PR that touches `welcome-sequence.content.ts` must include in the description:

- [ ] No AI-forward openers.
- [ ] No manifesto vocabulary ("cognitive sovereignty", "citizens", "empire", "movement").
- [ ] No fabricated stats, testimonials, or founder backstory.
- [ ] One CTA per email.
- [ ] No trial urgency.
- [ ] Fallback copy specified for every null input (name, onboarding_intent, latest_project).

Voice regressions are worse than scheduling bugs — a broken cron is visible, bad copy rots trust silently.

---

## 2. Goals

### Product Goals (aligned to marketing doc — three, not five)

The welcome sequence helps a new signup do three things:

1. Start a first brain dump and create or reopen a first project.
2. Finish onboarding enough that BuildOS has useful context, and enable one follow-through channel (daily brief, SMS, or calendar).
3. Come back for a second session before the trial-reminder sequence begins.

Day 11+ belongs to the trial-reminder sequence (see §15 Handoff). This sequence does not become a trial-expiration campaign.

### Engineering Goals

- No duplicate sends under cron concurrency.
- No signup failures caused by the email provider.
- No "select rows where sent is null" race windows.
- Fresh branching decisions at send time.
- Clear observability: due, claimed, sent, skipped, failed, exited, completed.
- Copy reviewable in source control.
- Delivery through the existing BuildOS email tracking tables.
- A safe migration path from the current `welcome_email_sequences` implementation.
- Email 1 delivery rate ≥ 95% over any rolling 24h window.

### Non-Goals

- Not rebuilding the general notification system.
- Not pre-scheduling all five steps with an email provider.
- Not backfilling existing users. Existing-user reactivation is a separate campaign (§22).
- Not coupling to the generic `queue_jobs` worker unless delayed scheduling and idempotent claims are proven there. The enrollment table is the domain queue.
- Not blocking registration if enrollment or Email 1 fails.

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

### Production Emergency (2026-04-09 growth audit)

- **0 of 94 users** have received a welcome email.
- **~55% of attempted email sends fail.**
- The welcome sequence code path runs, but deliveries do not land.

This is the highest-priority problem in the spec. Phase 0 below is dedicated to diagnosing and fixing it. Every other phase is blocked until Email 1 lands ≥ 95% of the time for new signups.

### Gaps To Close

| Gap                                                          | Why it matters                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Gmail/Nodemailer delivery is unreliable                      | Root cause of the 0-welcome-emails-sent number. Blocks everything.                                                  |
| No lifecycle unsubscribe endpoint                            | Gmail/Yahoo bulk-sender policy (Feb 2024) requires `List-Unsubscribe: One-Click`. Missing = reputation damage.      |
| No `email_suppressions` table                                | No durable opt-out record. Any re-send to an opt-out is a legal + reputational risk.                                |
| No generic `email_sequences` / `steps` / `enrollments` model | Harder to reuse for trial reminders or reactivation.                                                                |
| No `next_send_at` queue key                                  | Cron has to load active rows and decide due-ness in app code.                                                       |
| App-code claim window instead of Postgres row locks          | Weaker than `FOR UPDATE SKIP LOCKED` under concurrent workers.                                                      |
| No `processing` / retry / `errored` state                    | Failures are visible but not modeled as a durable state machine.                                                    |
| No `last_email_id` pointer on the sequence row               | Harder to reconcile sends, clicks, and completion.                                                                  |
| No admin welcome-sequence page                               | No first-class queue, preview, test-send, or step/branch funnel view.                                               |
| Email provider has no request idempotency                    | Gmail/Nodemailer cannot prevent duplicate delivery if the app crashes after provider send but before DB completion. |

---

## 4. Target Architecture

```
Password / Google signup
creates public.users row
        |
        | best-effort, never blocks auth
        v
enroll_user_in_email_sequence
key='buildos_welcome'
        |
        | inserts enrollment
        v
email_sequence_enrollments
status='active', next_step_number=1, next_send_at=NOW()
        |
        | signup flow claims this exact row
        v
claim_specific_email_sequence_send for Email 1
        |
        v
suppression check
load product state
render branch content
send through EmailService
        |
        v
complete_email_sequence_send
schedules next step
        |
        v
future next_send_at


Every 15 minutes:

/api/cron/welcome-sequence
CRON_SECRET guarded
        |
        v
claim_pending_email_sequence_sends(limit)
FOR UPDATE SKIP LOCKED
        |
        v
suppression + fresh state + send window
send / skip / wait / exit / retry
```

The enrollment table is the queue. It stores the next due step and the next timestamp. The app only processes rows Postgres has atomically claimed.

---

## 5. Data Model

### 5.1 `email_sequences`

Named containers for lifecycle sequences.

| Column         | Type        | Notes                                                                              |
| -------------- | ----------- | ---------------------------------------------------------------------------------- |
| `id`           | UUID PK     |                                                                                    |
| `key`          | TEXT UNIQUE | Stable code identifier. For this sequence: `buildos_welcome`.                      |
| `display_name` | TEXT        | Admin label.                                                                       |
| `description`  | TEXT        |                                                                                    |
| `trigger_type` | TEXT        | `user_registration` (v1). Future: `trial_started`, `reactivation`, `subscription`. |
| `status`       | TEXT        | `draft`, `active`, `paused`, `archived`. Only `active` enrolls/sends.              |
| timestamps     |             | `created_at`, `updated_at`.                                                        |

### 5.2 `email_sequence_steps`

Ordered steps per sequence. Schedule/admin metadata only.

**Important:** email subjects, plain text, and HTML are **not** stored in Supabase. Production copy lives in local source-controlled app files so it can be edited, reviewed, and fixed without treating the database as a CMS.

| Column                             | Type    | Notes                                                               |
| ---------------------------------- | ------- | ------------------------------------------------------------------- |
| `id`                               | UUID PK |                                                                     |
| `sequence_id`                      | UUID FK | `ON DELETE CASCADE`.                                                |
| `step_number`                      | INT     | Unique per sequence.                                                |
| `step_key`                         | TEXT    | `email_1`, `email_2`, etc.                                          |
| `delay_days_after_previous`        | INT     | 0 for step 1, then 1/2/3/etc.                                       |
| `absolute_day_offset`              | INT     | BuildOS offsets: 0, 1, 3, 6, 9.                                     |
| `send_window_start_hour`           | INT     | Default 9 local time for non-immediate steps.                       |
| `send_window_end_hour`             | INT     | Default 17 local time.                                              |
| `send_on_weekends`                 | BOOL    | Default FALSE. Steps due Saturday/Sunday shift to Monday 9am local. |
| `status`                           | TEXT    | `active`, `paused`.                                                 |
| `UNIQUE(sequence_id, step_number)` |         |                                                                     |

### 5.3 `email_sequence_enrollments`

The queue. One row per user per sequence.

| Column                         | Type        | Notes                                                                                                               |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`                           | UUID PK     |                                                                                                                     |
| `sequence_id`                  | UUID FK     |                                                                                                                     |
| `user_id`                      | UUID FK     | BuildOS `public.users.id`. Required in v1 — no non-user recipients.                                                 |
| `recipient_email`              | TEXT        | Snapshot at enrollment. Re-read from user before send; keep snapshot for audit.                                     |
| `status`                       | TEXT        | `active`, `processing`, `paused`, `completed`, `exited`, `errored`, `cancelled`.                                    |
| `current_step_number`          | INT         | Last finalized step (sent or skipped). Starts at 0.                                                                 |
| `next_step_number`             | INT         | Step to evaluate next. Null after completion/exit/error.                                                            |
| `next_send_at`                 | TIMESTAMPTZ | Queue key. Indexed.                                                                                                 |
| `last_sent_at`                 | TIMESTAMPTZ | Last successful email send.                                                                                         |
| `last_email_id`                | UUID        | FK to `emails.id`.                                                                                                  |
| `processing_started_at`        | TIMESTAMPTZ | Set by claim RPC. Reaped after 2 hours.                                                                             |
| `failure_count`                | INT         | Reset after successful send or skip.                                                                                |
| `exit_reason`                  | TEXT        | `completed`, `activated`, `unsubscribed`, `suppressed`, `user_deleted`, `manual`, `hard_bounce`, `pre_system_user`. |
| `last_error`                   | TEXT        | Last failure, truncated to 1000 chars.                                                                              |
| `metadata`                     | JSONB       | Signup method, trigger source, variant assignment, UTM snapshot.                                                    |
| timestamps                     |             | `created_at`, `updated_at`.                                                                                         |
| `UNIQUE(sequence_id, user_id)` |             | Prevents duplicate enrollment.                                                                                      |

Critical index:

```sql
CREATE INDEX idx_email_sequence_enrollments_due
  ON public.email_sequence_enrollments(next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;
```

**v1 scope note:** we are not adding `recipient_source` / `recipient_source_id` polymorphism. When the reactivation campaign lands (§22), if it needs non-user recipients, add polymorphism then in a targeted migration. Premature polymorphism carries unused complexity.

### 5.4 `email_sequence_events`

Explicit audit log for branch/skip/exit decisions. Consumer: admin UI queue table and funnel metrics in §14.

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

The enrollment row is the source of truth for queue state. Events are the audit log.

### 5.5 `email_suppressions`

Durable lifecycle opt-out. New table. Required for unsubscribe + Gmail/Yahoo bulk-sender compliance.

| Column       | Type        | Notes                                                     |
| ------------ | ----------- | --------------------------------------------------------- |
| `id`         | UUID PK     |                                                           |
| `email`      | TEXT UNIQUE | Normalized lowercase email.                               |
| `scope`      | TEXT        | `lifecycle`, `marketing`, `all`.                          |
| `reason`     | TEXT        | `unsubscribe`, `hard_bounce`, `manual`, `complaint`.      |
| `source`     | TEXT        | `email_link`, `admin`, `provider_webhook`, `list_header`. |
| `created_at` | TIMESTAMPTZ |                                                           |

### 5.6 Existing Delivery Tables

Reuse, don't replace:

- `emails`: canonical email record.
- `email_recipients`: per-recipient state, open/click timestamps, status.
- `email_tracking_events`: open/click event stream.
- `email_logs`: legacy/simple send log used by current services and fallback hydration.

Required metadata on `emails.template_data` and `email_logs.metadata` for welcome sends:

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

RPCs handle queue transitions so concurrency lives in the database, not app loops.

| RPC                                                                                                                          | Purpose                                                             | Safety                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `enroll_user_in_email_sequence(p_user_id, p_sequence_key, p_recipient_email, p_signup_method, p_trigger_source, p_metadata)` | Idempotently create an enrollment row for an active sequence.       | `SECURITY DEFINER`. Returns existing enrollment if already enrolled.        |
| `claim_pending_email_sequence_sends(p_sequence_key, p_limit)`                                                                | Claim due active enrollments; return rows for processing.           | Reaps stale `processing` rows older than 2 hours. `FOR UPDATE SKIP LOCKED`. |
| `claim_specific_email_sequence_send(p_enrollment_id)`                                                                        | Claim one exact enrollment (signup-time Email 1).                   | Same transition guard as batch claim.                                       |
| `complete_email_sequence_send(p_enrollment_id, p_email_id, p_branch_key, p_metadata)`                                        | Mark current step sent, store `last_email_id`, advance or complete. | Only transitions from `processing`.                                         |
| `skip_email_sequence_step(p_enrollment_id, p_branch_key, p_reason, p_metadata)`                                              | Finalize a due step without sending and advance to next step.       | Only transitions from `processing`.                                         |
| `defer_email_sequence_step(p_enrollment_id, p_next_send_at, p_reason)`                                                       | Requeue a claimed step (outside send window, weekend shift).        | Only transitions from `processing` back to `active`.                        |
| `retry_or_fail_email_sequence_send(p_enrollment_id, p_error)`                                                                | Requeue transient failures or mark `errored`.                       | Retry up to 3 times with 30-minute backoff.                                 |
| `exit_user_from_email_sequence(p_user_id, p_sequence_key, p_reason)`                                                         | Exit active/processing/paused enrollments for a user.               | Idempotent.                                                                 |
| `exit_email_from_email_sequence(p_email, p_sequence_key, p_reason)`                                                          | Exit by normalized email (suppression, unsubscribe).                | Idempotent.                                                                 |
| `admin_send_next_step_now(p_enrollment_id)`                                                                                  | Admin action: set `next_send_at = NOW()`.                           | Audit event required. No transition if terminal.                            |

### Claim Pattern

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

This is the difference between "probably fine" and "safe under concurrent cron runs."

---

## 7. Sequence State Machine

### Enrollment (new signups only)

1. Signup creates `public.users`.
2. App calls `enroll_user_in_email_sequence(...)`.
3. RPC inserts:
    - `status = 'active'`
    - `current_step_number = 0`
    - `next_step_number = 1`
    - `next_send_at = NOW()`
4. App immediately calls `processSequenceEnrollmentNow(enrollmentId)` for Email 1.
5. If anything fails, log through `ErrorLoggerService` and return a successful signup response. The next cron tick will retry.

### Processing

For each claimed enrollment:

1. Check `email_suppressions` for lifecycle/all scope on the recipient email.
2. Load fresh BuildOS product state.
3. Check send window (step 1 skips this check — it is immediate). If outside window or weekend-shift applies, `defer_email_sequence_step` to the next valid local send-window start and continue.
4. Determine action:
    - `send`
    - `skip`
    - `exit`
5. If suppressed, call `exit_email_from_email_sequence(..., 'suppressed')`.
6. If skipped, call `skip_email_sequence_step`.
7. If sendable, render content and call `EmailService.sendEmail`.
8. If send succeeds, call `complete_email_sequence_send`.
9. If send fails, call `retry_or_fail_email_sequence_send`.

### Completion

The sequence completes when:

- Email 5 is sent or skipped and no later steps exist.
- The activation rule below is met at Email 4 and Email 5 is queued as a check-in (not a nag).
- An admin manually completes/exits the enrollment.

**BuildOS activation-complete rule (simplified, v1):**

```text
project_count > 0
AND onboarding_completed = true
AND has_follow_through_channel = true
```

Note: we deliberately do **not** gate activation on "returned for second session" in v1. `users.last_visit` is an unreliable signal, and Email 5 should always send — it is a founder-style check-in, not an activation nag. Once session-count tracking exists, revisit.

### Email 5 Behavior

Email 5 is the last step. It always sends (unless suppressed). Branching by "returning user vs general" only controls copy, not whether to send.

---

## 8. Welcome Sequence Steps

Source copy: `docs/marketing/strategy/buildos-welcome-sequence.md`. Implementation copy lives in `welcome-sequence.content.ts` so it's reviewable in PRs.

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
- `user.timezone` (fallback: `America/Los_Angeles`)
- `user.onboarding_intent` (fallback: null-safe copy)
- `user.onboarding_completed_at`
- project count from `onto_projects`
- latest project id
- daily brief email preference from `user_brief_preferences` and `user_notification_preferences`
- SMS readiness from `user_sms_preferences`
- calendar connection from `user_calendar_tokens`
- return signal from `users.last_visit` (approximation only; controls Email 5 copy branch)

### Branching Rules

**Email 2:**

- Send `no_project` if `project_count = 0`.
- Skip `already_created_project` if `project_count > 0`.

**Email 3:**

- `no_project` if `project_count = 0`.
- `finish_setup` if project exists but onboarding incomplete.
- `reopen_project` if onboarding complete or near-complete.

**Email 4:**

- `finish_setup` if onboarding incomplete.
- `follow_through_missing` if onboarding complete but no daily brief email, SMS, or calendar channel.
- Skip `follow_through_ready` if at least one follow-through channel exists.

**Email 5:**

- `returning_check_in` if `last_visit - started_at >= 12 hours`.
- `general_check_in` otherwise.

### Null Input Fallbacks (must be specified in code)

- `name` null → "Hi there,"
- `onboarding_intent` null → use the neutral fallback: "if you want a clearer place for what you're building"
- `latest_project_id` null → fall back to `projects_url`, not a broken link
- `timezone` null/invalid → `America/Los_Angeles`

---

## 9. Content Management

### File Split

| File                                                  | Responsibility                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/src/lib/server/welcome-sequence.content.ts` | Step/branch copy, subject lines, CTAs, plain text, HTML templates.    |
| `apps/web/src/lib/server/welcome-sequence.logic.ts`   | Pure state-machine decisions: send/skip/wait/exit.                    |
| `apps/web/src/lib/server/welcome-sequence.service.ts` | DB claims, state loading, send orchestration, completion/retry calls. |
| `apps/web/src/lib/server/email-sequence-rpcs.ts`      | Thin typed wrappers around Supabase RPCs.                             |

### Local Copy Wins

Supabase stores sequence state, schedule metadata, queue status, and events. It does not store the email copy.

Why: lifecycle copy should be easy to edit in source, reviewed like product code, and kept out of the database so production state cannot silently drift from local intent. The admin page renders previews from the same local code path used for sends.

### Tokens

`{{token_name}}`, case-insensitive, spaces allowed.

Required:

- `{{first_name}}` (fallback "there")
- `{{email}}`
- `{{app_url}}`
- `{{onboarding_url}}`
- `{{projects_url}}`
- `{{latest_project_url}}` (falls back to `projects_url` if null)
- `{{daily_brief_url}}`
- `{{calendar_url}}`
- `{{notifications_url}}`
- `{{onboarding_intent_hook}}` (fallback copy if null)
- `{{unsubscribe_url}}` (per-send tracking id)

HTML values are HTML-escaped. Plain-text values are not. Unknown tokens are left visible (not silently stripped) so QA can catch them.

---

## 10. Signup Triggers

### Password Registration

Call site: `apps/web/src/routes/api/auth/register/+server.ts`.

1. `ensureUserProfileForRegistration(...)` creates or resolves `public.users`.
2. Call `startWelcomeSequenceForUser({ userId, signupMethod: 'email' })`.
3. Wrapper creates enrollment and best-effort sends Email 1.
4. Catch errors, log through `ErrorLoggerService`, and continue registration.
5. On failure, leave `next_send_at = NOW()` so the next cron tick retries within 15 minutes.

### Google OAuth Registration

Call site: `apps/web/src/lib/utils/google-oauth.ts`.

1. Only enroll when `config.isRegistration && authResult.isNewUser`. Never on re-sign-in.
2. Use `signupMethod: 'google_oauth'`.
3. Same best-effort + retry-on-next-cron behavior.

### Email Confirmation

Current behavior: Email 1 sends as soon as `public.users` row exists, regardless of email confirmation status. **This is intentional for v1.** BuildOS does not currently require a confirmation click before access. If that changes, gate Email 1 on `email_confirmed_at` in the enrollment RPC.

### No Backfill For Existing Users

Users who signed up before this system lands do **not** receive a retroactive welcome email — no matter how recent their signup. They are reachable through the **Reactivation Campaign** (§22), which is a separate sequence with different copy, intent, and ethics.

The cutoff is the **deploy timestamp**, not a rolling day offset. Any rolling offset (e.g., "14 days") leaks: a user who signed up 5 days before deploy would otherwise receive Email 1 from this pipeline, which contradicts the scope.

Enforce this in two layers:

1. **Enrollment RPC guard.** `enroll_user_in_email_sequence` must reject any `p_user_id` whose `users.created_at < WELCOME_SYSTEM_DEPLOY_AT`. The cutoff is a single Postgres `TIMESTAMPTZ` constant (stored in the seeded `email_sequences.metadata` or a dedicated settings row) captured at the moment Phase 2 deploys. Record it in code as `WELCOME_SYSTEM_DEPLOY_AT` so both the DB and the app agree.
2. **Pre-deploy cleanup.** Before Phase 0 ships the delivery fix, every row in the legacy `welcome_email_sequences` table must be terminated (see §19 Phase 0) so the current pipeline does not opportunistically back-send Email 1 to pre-deploy users the moment Gmail starts working again.

The enrollment path is only triggered by live signup handlers (§10). There is no migration script that inserts enrollments for existing users under any circumstance.

---

## 11. Cron

Reuse the current endpoint:

```text
apps/web/src/routes/api/cron/welcome-sequence/+server.ts
```

Behavior:

- `GET` for Vercel cron, `POST` for manual/admin triggering.
- Guard with `CRON_SECRET` and `PRIVATE_CRON_SECRET` via `isAuthorizedCronRequest()`.
- Default batch size: 50.
- Every 15 minutes in `vercel.json`:

```json
{
	"path": "/api/cron/welcome-sequence",
	"schedule": "*/15 * * * *"
}
```

Before adding the 15-minute cadence, audit `vercel.json` for collisions with existing crons (dunning, trial reminders, billing-ops, welcome-sequence, security-events). Vercel has plan limits on cron count and concurrency — confirm headroom.

Insert a `cron_logs` row every run with: `evaluated`, `claimed`, `sent`, `skipped`, `deferred`, `completed`, `exited`, `retried`, `errored`, and summarized errors.

### Send Window + Weekend Rules

Non-immediate steps (Email 2–5) respect the user's local 9am–5pm send window.

- Outside window: `defer_email_sequence_step` to next valid local 9am.
- Saturday/Sunday: shift to Monday 9am local.
- User timezone null/invalid: default to `America/Los_Angeles`.

Immediate sends (Email 1 at signup) ignore the window.

---

## 12. Sender, Tracking, Suppression

### Sender

v1: `dj@build-os.com` via `PRIVATE_DJ_GMAIL_APP_PASSWORD` through `EmailService`.

v1 is a bridge, not a destination. **Phase 6 upgrades to Resend or Postmark.** Gmail-via-app-password is not a transactional sender: no idempotency keys, no webhook bounce/complaint handling, rate-limited, reputationally coupled to a personal inbox.

When moving to Resend/Postmark, use idempotency keys:

```text
welcome-sequence/{enrollment_id}/{step_number}
```

### Deliverability Prerequisites (verify before Phase 1 ships)

- SPF configured for `build-os.com`.
- DKIM configured and aligned.
- DMARC policy set (`p=quarantine` or stricter).
- Links use `https://build-os.com` or the production app domain.
- Plain text + HTML sent on every email.
- Reply address resolves.
- Click tracking wrapping is modest; deliverability trumps analytics.

### Tracking

- `GET /api/email-tracking/[tracking_id]` — open pixel.
- `GET /api/email-tracking/[tracking_id]/click?url=...` — click redirect.
- **NEW:** `GET|POST /api/email-tracking/[tracking_id]/unsubscribe` — one-click opt-out (Phase 1).

Welcome emails use tracking unless the user has opted out or a deliverability issue forces it off.

### Required Email Headers (lifecycle)

Add in `EmailService` for lifecycle emails:

- `Reply-To: dj@build-os.com`
- `List-ID: BuildOS <emails.build-os.com>`
- `List-Unsubscribe: <https://build-os.com/api/email-tracking/{tracking_id}/unsubscribe>, <mailto:dj@build-os.com?subject=unsubscribe>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

These are Gmail/Yahoo bulk-sender requirements (Feb 2024). Missing them is a reputation tax.

### Suppression

At send time, every step:

1. Normalize recipient email (lowercase, trim).
2. Query `email_suppressions` where `scope IN ('lifecycle', 'all')`.
3. Check `user_notification_preferences` for a global email opt-out.
4. If suppressed, call `exit_email_from_email_sequence(..., 'suppressed')` and skip send.
5. Do not retry suppressed sends.

Do not rely on enrollment-time checks. A user may unsubscribe after Email 1 and before Email 2.

---

## 13. Admin UI

Create:

```text
apps/web/src/routes/admin/welcome-sequence/
```

Capabilities:

- Step list with every branch.
- "Copy managed in code" badge when code content overrides DB.
- Effective subject/plain-text/HTML preview with selectable sample users.
- Token preview.
- Send test email for one step/branch.
- Send full test sequence to a specified address with `[TEST]` subject prefix.
- Live queue table: recipient, status, next step, next send time, branch preview, failure count, last error.
- Funnel metrics: enrolled, per-step sent/skipped, step 3 branch split, completed/exited/errored.
- Engagement metrics: opens, clicks, reply indicator, first project after email, onboarding completion after email, return visit after email.
- Admin actions: pause, resume, exit, retry errored, send next step now, reset enrollment (with confirm dialog).

**Test sends must not pollute production analytics.** Tracking is disabled for test sends, and metadata is tagged:

```json
{
	"test_send": true,
	"campaign": "welcome-sequence-test"
}
```

Event and funnel queries must filter `metadata.test_send = true` out of production metrics.

---

## 14. Observability

### Cron Logs

Every cron run writes `cron_logs` with structured summary:

```text
Claimed 42 welcome enrollments, sent 31, skipped 7, deferred 2, exited 2, retried 2, errored 0
```

### Error Logs

Log per-user processing failures through `ErrorLoggerService`:

- endpoint: `/api/cron/welcome-sequence`
- operation type: `welcome_sequence_process_user`
- user id, enrollment id, step number, branch key

### Metrics To Track

- Signup → enrollment row creation rate (target 100%).
- Enrollment → Email 1 sent rate (target ≥ 95% within 5 minutes).
- Email 1 delivery failure rate (target < 5% over rolling 24h).
- Step due-to-sent lag (target < 16 minutes p95).
- Suppression exits by source.
- Retry count and terminal error rate.
- Open/click by step and branch.
- First project creation after Email 1 or Email 2.
- Onboarding completion after Email 3 or Email 4.
- Return session after Email 3 or Email 5.

### Alerts (Phase 2+)

- **P1:** Email 1 delivery rate < 90% over 24h → Slack + email to DJ.
- **P1:** Cron has failed 2 consecutive runs.
- **P2:** `errored` enrollments > 10 (lifetime or daily threshold; tune after one week of data).
- **P2:** Any enrollment stuck in `processing` > 2 hours (the reaper should prevent this; if it fires, the reaper failed).
- **P3:** Suppression rate > 10% of sends in 24h (quality signal).

---

## 15. Handoff To Trial Reminder Sequence

Welcome sequence ends at Email 5 (day 9) or earlier via completion/exit. Day 11+ is the trial-reminder sequence's territory.

Handoff rules:

- Welcome sets `status = 'completed'` or `'exited'` with `exit_reason`.
- Trial-reminder sequence reads welcome completion state at enrollment time and skips duplicate "welcome" framing.
- If welcome is still `active` at day 11 (e.g., user signed up but emails are stuck), trial reminder does **not** start. Fix the welcome issue first.

The trial reminder is not in this spec. When it's written, reference this handoff section.

---

## 16. Local Dev & Testing Seam

Engineers need to run this locally without emailing real addresses.

- Dev mode (`import.meta.env.DEV === true`): route all lifecycle emails to a logging sink. Log the rendered subject + HTML + plain text + tokens to stdout. Do not call Gmail.
- Add a `PRIVATE_LIFECYCLE_EMAIL_SINK` env var: `log` (default dev), `smtp` (Mailtrap/Ethereal), `gmail` (production).
- In `gmail` mode in dev, require an explicit allowlist (`PRIVATE_LIFECYCLE_DEV_ALLOWLIST`) of recipient emails.
- Tests use `log` sink and assert on the render output, not the provider.

This prevents a local test accidentally emailing a real user.

---

## 17. Tests

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
- Email 5 detects returning users for branch copy; Email 5 always sends.
- Send-window logic respects user timezone.
- Weekend shift works correctly across DST boundaries.
- Null `name`, `onboarding_intent`, `latest_project_id`, `timezone` all render cleanly.
- HTML token values are escaped; plain-text values are not.
- Unknown tokens remain visible.
- Suppressed email exits instead of sending.
- Provider failure retries and then errors after 3 attempts.
- Existing sent logs can hydrate step state after a partial failure.
- Any user with `created_at < WELCOME_SYSTEM_DEPLOY_AT` is rejected by the enrollment RPC (no-backfill guard).
- Pre-deploy users whose legacy `welcome_email_sequences` rows were terminated in Phase 0 do not receive Email 1 when the delivery fix lands.

### Voice Regression Tests

Snapshot rendered subject + plain text for each (step, branch) pair. Add a lint step that fails the build if the rendered copy contains any banned phrase ("cognitive sovereignty", "citizens", "empire", AI-forward openers). Maintain the banned-phrase list in `welcome-sequence.content.ts` alongside copy.

### SQL Tests

- enrollment idempotency
- `FOR UPDATE SKIP LOCKED` claim behavior
- stale `processing` reaper
- partial due index existence
- status transition guards
- unique `(sequence_id, user_id)`
- no-backfill guard: reject any user whose `created_at` predates `WELCOME_SYSTEM_DEPLOY_AT`

### Manual Verification

1. Create a new password signup.
2. Confirm enrollment row exists with `next_step_number = 1`, `next_send_at = NOW()`.
3. Confirm Email 1 sends within seconds.
4. Confirm `emails`, `email_recipients`, and `email_logs` contain welcome metadata with `enrollment_id`.
5. Open the email — confirm `email_tracking_events` records an open.
6. Click the CTA — confirm click tracking redirects correctly.
7. Click unsubscribe — confirm `email_suppressions` row + later steps exit.
8. Force `next_send_at` for Email 2 and run cron.
9. Create a project — confirm Email 2 skips.
10. Configure daily brief email — confirm Email 4 skips.
11. Sign up a user older than cutoff via SQL — confirm enrollment is rejected.

---

## 18. Environment Variables

| Variable                           | Purpose                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_APP_URL`                   | Base URL for CTA, tracking, unsubscribe links.                                                                                                                                                                                              |
| `PRIVATE_DJ_GMAIL_APP_PASSWORD`    | Gmail app password for `dj@build-os.com` (v1 only).                                                                                                                                                                                         |
| `CRON_SECRET`                      | Runtime cron bearer secret.                                                                                                                                                                                                                 |
| `PRIVATE_CRON_SECRET`              | Static private cron bearer secret.                                                                                                                                                                                                          |
| Supabase service role env          | Required wherever `createAdminSupabaseClient()` runs.                                                                                                                                                                                       |
| `PRIVATE_LIFECYCLE_EMAIL_SINK`     | `log` / `smtp` / `gmail`. Default `log` in dev, `gmail` in prod.                                                                                                                                                                            |
| `PRIVATE_LIFECYCLE_DEV_ALLOWLIST`  | Comma-separated allowlist for dev gmail mode.                                                                                                                                                                                               |
| `PRIVATE_LIFECYCLE_SMTP_*`         | Optional local SMTP sink settings for `smtp` mode (`HOST`, `PORT`, `USER`, `PASS`, `SECURE`, `FROM`).                                                                                                                                       |
| `PRIVATE_RESEND_API_KEY`           | Phase 6: Resend provider key.                                                                                                                                                                                                               |
| `PRIVATE_ALERTS_SLACK_WEBHOOK_URL` | Phase 0: Slack Incoming Webhook URL for `email_delivery_failure` alerts. Free-tier Slack supports Incoming Webhooks — create a Slack App at api.slack.com/apps, enable Incoming Webhooks, install to the workspace, and paste the URL here. |

---

## 19. Phased Implementation Plan

Phase order is governed by one principle: **user-visible value first, then safety, then scale.**

### Phase 0 — Fix Production Email Delivery (BLOCKER)

**Problem:** Per the 2026-04-09 growth audit, 0 of 94 users have received a welcome email. ~55% of email sends fail. No queue work matters until this is fixed.

**Diagnosis finding (2026-04-17):** failures are **not silent**. `EmailService.sendEmail` (`apps/web/src/lib/services/email-service.ts:162-208`) already writes every failure to two places:

- `error_logs` with `error_type = 'email_delivery_failure'`
- `email_logs` with `status = 'failed'` and the Gmail error message

The 0/94 number means **nobody has been looking at these tables**, not that failures vanish. This flips the Phase 0 first action from "add logging" to "query the logs that already exist." The actual fix then depends on what Gmail is actually returning (likely stale app password, rate limit, or DMARC misalignment — but confirm before guessing).

**Operator runbook (what DJ needs to do, in order):**

1. Query production `error_logs` where `error_type = 'email_delivery_failure'` to get the real failure signature. Group by `error_message` to see the pattern.
2. Rotate `PRIVATE_DJ_GMAIL_APP_PASSWORD` defensively.
3. Confirm SPF / DKIM / DMARC on `build-os.com` (mxtoolbox or `dig` checks).
4. Apply the Phase 0 cleanup migration (`supabase/migrations/20260430000005_cancel_pre_welcome_system_rows.sql`) **before** the delivery fix merges to main — otherwise the fixed pipeline back-sends Email 1 to the ~94 pre-deploy users.
5. Wire a Slack Incoming Webhook (free tier works; see §18) that fires when a new `email_delivery_failure` row lands in `error_logs`. This converts the existing passive logging into active alerting.

**Tasks:**

- Reproduce the failure with a test signup against production.
- Check Gmail app password validity. Rotate if expired.
- Verify SPF, DKIM, DMARC on `build-os.com` with an mxtoolbox or equivalent check.
- Inspect `email_logs` for failure reasons (provider 4xx/5xx, rate limit, auth failure).
- Fix the root cause and land a change that makes Email 1 reliably deliver to a fresh test signup.
- Failures are **already** written to `error_logs` (`error_type = 'email_delivery_failure'`) and `email_logs` (`status = 'failed'`) — see `EmailService.sendEmail` at `apps/web/src/lib/services/email-service.ts:162-208`. The real gap is **alerting**, not logging. Wire a Slack webhook (or Sentry alert rule) that fires when a new `email_delivery_failure` row lands in `error_logs`. Diagnosing the 0/94 number starts with a query of that table in production.
- **Terminate every existing `welcome_email_sequences` row before the delivery fix reaches production.** Otherwise the ~94 stuck users will receive a delayed Email 1 the first time Gmail starts working, which violates the "existing users go to reactivation, not welcome" scope.

    **Decision:** mark all existing rows `status = 'cancelled'` with `completed_at = NOW()`. Do **not** delete. Rationale:
    - `cancelled` is already a legal value in the existing `status` CHECK constraint — no schema change.
    - The current cron only processes `status = 'active'` rows, so marking cancelled is an immediate, reliable stop.
    - Row preservation gives the reactivation spec a single clean filter to find this exact cohort (see SQL below).
    - Reversible: if we misfire, we can flip rows back to `active` per user.
    - `welcome_email_sequences` is retired entirely in Phase 7, so the preserved rows cost nothing long-term.

    **Cleanup migration shape (run once, before the delivery fix merges):**

    ```sql
    BEGIN;

    UPDATE public.welcome_email_sequences
    SET status = 'cancelled',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
    WHERE status = 'active';

    -- Sanity check: no active rows should remain
    SELECT COUNT(*) FROM public.welcome_email_sequences WHERE status = 'active';

    COMMIT;
    ```

    **Cohort filter for the reactivation spec:** pre-deploy users who never received a welcome email are

    ```sql
    SELECT wes.user_id
    FROM public.welcome_email_sequences wes
    WHERE wes.status = 'cancelled'
      AND wes.email_1_sent_at IS NULL
      AND wes.started_at < <WELCOME_SYSTEM_DEPLOY_AT>;
    ```

    This filter is stable across Phase 7 retirement — export the user_id list into reactivation seed data before the table is dropped.

- Verify the cleanup step on a staging copy of production data first: confirm zero sends fire for pre-deploy users after the delivery fix is applied.

**Ship criteria:**

- 5 consecutive **new** test signups all receive Email 1 within 60 seconds, delivered to inbox (not spam).
- Zero pre-deploy `public.users` rows receive a welcome email in the 24h after the delivery fix lands.

### Phase 1 — Lifecycle Compliance Floor

**Problem:** No unsubscribe endpoint, no `List-Unsubscribe` header, no `email_suppressions` table. This is the deliverability + legal minimum.

**Tasks:**

- Add `email_suppressions` table (§5.5).
- Build `GET|POST /api/email-tracking/[tracking_id]/unsubscribe` endpoint.
- Add `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers in `EmailService` for lifecycle category.
- Render `{{unsubscribe_url}}` token in all welcome email bodies (visible text link, not just header).
- Wire current `WelcomeSequenceService` to check `email_suppressions` before every send.

**Ship criteria:** Clicking the unsubscribe link in a welcome email writes a suppression row and prevents future welcome sends. Gmail "Show original" shows the `List-Unsubscribe` header.

### Phase 2 — Queue Tables + RPCs (Dual-Write)

**Tasks:**

- Add `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments`, `email_sequence_events`.
- Add all RPCs from §6.
- Seed `buildos_welcome` row and step rows.
- Modify `WelcomeSequenceService` to **dual-write**: every insert/update to `welcome_email_sequences` is mirrored to `email_sequence_enrollments`.
- Cron still reads from the old table. New table is shadow only.
- Add admin diff view (temporary) that compares old vs new state for each user.

**Ship criteria:** Every new signup writes identical state to both tables. Diff view shows zero discrepancies over 48h.

### Phase 3 — Switch Processing To Queue

**Tasks:**

- Cron switches to `claim_pending_email_sequence_sends`.
- Signup calls `claim_specific_email_sequence_send` for Email 1.
- Old table still written for one week as shadow-read fallback (in case we need to roll back).
- Add `defer_email_sequence_step` for send-window handling.
- Add weekend shift logic.
- Add the no-backfill guard (users older than 14 days or older than the sequence deploy timestamp are rejected at enrollment).

**Ship criteria:** Cron runs under the new RPC path for one week with zero duplicate sends and zero lost sends. Compare send counts to the old path — must match.

### Phase 4 — Content / Logic / Service Split

**Tasks:**

- Move copy to `welcome-sequence.content.ts`.
- Extract pure `welcome-sequence.logic.ts`.
- Add token renderer with null-safe fallbacks.
- Add voice regression snapshot tests + banned-phrase lint.
- Add local dev sink.

Pure refactor. No behavior change.

### Phase 5 — Admin UI

**Tasks:**

- Build `/admin/welcome-sequence` with preview, test-send, live queue, funnel, engagement metrics, and admin actions.
- Add alerting for the Phase 2+ alert thresholds.
- Wire `admin_send_next_step_now` RPC.

### Phase 6 — Provider Upgrade (Resend or Postmark)

**Problem:** Gmail-via-app-password cannot support idempotency keys, webhooks, or reliable scale.

**Tasks:**

- Choose Resend or Postmark (Resend is faster to integrate; Postmark has better deliverability history for transactional).
- Implement provider adapter behind the existing `EmailService` interface.
- Add idempotency keys: `welcome-sequence/{enrollment_id}/{step_number}`.
- Wire bounce/complaint webhooks into `email_suppressions`.
- Keep Gmail as fallback for 2 weeks.

### Phase 7 — Retire Legacy Table

**Tasks:**

- Stop dual-writes to `welcome_email_sequences`.
- Keep the table read-only for diagnostics for one release.
- Remove legacy hydration fallback.
- Drop the table in a follow-up migration.

---

## 20. Design Decisions Worth Preserving

1. **Claim in Postgres, not in app code.** The database can lock due rows atomically. App loops cannot do this safely under concurrency.
2. **The enrollment row is the queue.** Delayed scheduling, branch state, retries, and exit reasons live in one domain-specific place.
3. **Email 1 is immediate but best-effort.** Users see the welcome email quickly, but signup does not depend on Gmail uptime. On failure, the next cron tick retries.
4. **Branch decisions happen at send time.** BuildOS product state changes fast during onboarding. No precomputing.
5. **Skips are first-class events.** A skipped Email 2 because the user created a project is a success, not missing data.
6. **Suppression is checked at send time.** Enrollment-time checks are stale by Email 2.
7. **Code-managed copy wins.** Version control beats mystery production copy.
8. **Use existing email tables.** BuildOS already has tracking infrastructure. Don't invent a parallel `email_sends` table.
9. **No backfill.** Existing users are not retroactively welcomed. They belong to the reactivation campaign (§22).
10. **Log enough to debug one user.** The admin UI must answer: why did this user get or not get this email?
11. **Deliverability trumps analytics.** If click wrapping or tracking pixels hurt inbox placement, turn them off.
12. **Voice is enforced by tests.** Banned-phrase lint is as important as SQL tests.

---

## 21. Known Sharp Edges

- Gmail/Nodemailer has no provider-level idempotency. Phase 6 resolves this.
- `users.last_visit` is an approximation. It controls Email 5 branch copy only, not activation state.
- Subject-line changes can fragment historical metrics. Use `step_number + branch_key` as the metric key, not subject.
- Local send windows need careful timezone handling. Default to `America/Los_Angeles` when `users.timezone` is null.
- Admin test sends can pollute analytics if `metadata.test_send` is not set or funnel queries don't filter it out. Both sides are required.
- If the cron stops, stuck `processing` rows recover on the next claim run via the 2-hour reaper. If the cron is stopped for > 2 hours, the reaper will release them on next run.
- `email_logs` hydration fallback covers a narrow race: the app sent email but failed before marking enrollment sent. Safe to remove once provider idempotency lands.

---

## 22. Future: Reactivation Campaign (Out Of Scope For This Spec)

A separate campaign, written in its own spec, reaches **users who signed up before this welcome system deployed and therefore never received a BuildOS welcome email.** This is the primary reactivation audience and the direct counterpart to "new signup = welcome sequence."

A secondary future extension may also cover users who went dormant after receiving welcome (no session in N days), but that is a distinct cohort with distinct copy and is not the reason reactivation exists.

Reactivation is **not a welcome sequence.** It has:

- Different framing ("here's what's new since you last looked" vs "welcome, start with a brain dump").
- Different CTAs (re-open vs first open).
- Different ethics (acknowledge they already know BuildOS exists; do not pretend this is their first touch).
- Different success metrics (return session, not first project).
- Different suppression rules (a higher bar for consent, since these users opted in long ago and may have forgotten).

It will reuse the `email_sequences` / `email_sequence_steps` / `email_sequence_enrollments` infrastructure this spec builds under a new `sequence_key` (e.g., `buildos_reactivation_pre_deploy`). That is the main reason to build the generic framework first.

### When To Write The Reactivation Spec

**After Phase 2 of this spec ships.** Reasons:

- Phase 2 lands the generic `email_sequences` / `email_sequence_steps` / `email_sequence_enrollments` schema and RPCs. The reactivation spec is a direct consumer — writing it earlier invites churn.
- Phase 0's termination migration already preserves the pre-deploy cohort (§19 Phase 0 SQL). That cohort is not at risk; they are safely parked in `welcome_email_sequences` with `status = 'cancelled'`.
- Writing reactivation before Phase 2 risks duplicating infrastructure.
- Waiting past Phase 7 would be too late — the `welcome_email_sequences` table will be dropped, so the pre-deploy cohort must be migrated into a reactivation enrollment list before Phase 7.

**Timing constraint:** the reactivation spec must be written and the pre-deploy cohort exported into its enrollment table **before Phase 7 retires `welcome_email_sequences`.** Phase 7 ship criteria should block on this.

### Inputs The Reactivation Spec Inherits From This Spec

When writing the reactivation spec, this spec provides:

- The exact cohort filter (§19 Phase 0 SQL).
- The generic sequence infrastructure (§5, §6).
- The suppression table + unsubscribe endpoint (§5.5, §12).
- The voice guardrails (§1) — reactivation copy differs, but the "no manifesto, no AI-forward openers, no fabrication" rules carry over.
- The send-time suppression + fresh-state branching pattern (§7, §12).

When the reactivation spec is written, reference this section and the framework it inherits from.

---

## 23. Implementation Checklist

### Phase 0 — Delivery

- [ ] Reproduce current email failure with a test signup.
- [ ] Verify/rotate `PRIVATE_DJ_GMAIL_APP_PASSWORD`.
- [ ] Verify SPF, DKIM, DMARC on `build-os.com`.
- [ ] Query production `error_logs` where `error_type = 'email_delivery_failure'` to identify the actual failure signature (auth / rate limit / network). The data is already captured; nobody is looking at it.
- [ ] Wire an alert (Slack webhook or Sentry rule) on new `email_delivery_failure` rows so future regressions are caught within minutes, not weeks.
- [ ] Apply the Phase 0 cleanup migration `supabase/migrations/20260430000005_cancel_pre_welcome_system_rows.sql` **before** the delivery fix merges to main.
- [ ] Terminate every pre-deploy `welcome_email_sequences` row so the fixed pipeline does not back-send Email 1 to existing users.
- [ ] Confirm 5 consecutive **new** test signups receive Email 1 within 60 seconds.
- [ ] Confirm zero pre-deploy users receive Email 1 in the 24h after delivery is fixed.

### Phase 1 — Compliance

- [ ] Add `email_suppressions` table migration.
- [ ] Build unsubscribe endpoint.
- [ ] Add `List-Unsubscribe` + `List-Unsubscribe-Post` headers.
- [ ] Render `{{unsubscribe_url}}` in all welcome emails.
- [ ] Wire current `WelcomeSequenceService` to check suppression.

### Phase 2 — Queue Tables (Dual-Write)

- [ ] Add `email_sequences`, `email_sequence_steps`, `email_sequence_enrollments`, `email_sequence_events` migrations.
- [ ] Add all RPCs.
- [ ] Seed `buildos_welcome`.
- [ ] Dual-write from `WelcomeSequenceService`.
- [ ] Build admin diff view.
- [ ] Verify zero discrepancies over 48h.

### Phase 3 — Switch Processing

- [ ] Cron uses `claim_pending_email_sequence_sends`.
- [ ] Signup uses `claim_specific_email_sequence_send`.
- [ ] Add `defer_email_sequence_step` + weekend shift.
- [ ] No-backfill guard enforced at enrollment (reject users older than 14 days or with `users.created_at <` deploy timestamp).
- [ ] One-week shadow-read verification.

### Phase 4 — Content Split

- [x] `welcome-sequence.content.ts` with all copy + null fallbacks.
- [x] Pure `welcome-sequence.logic.ts`.
- [x] Voice regression snapshot tests.
- [x] Banned-phrase lint.
- [x] Local dev sink.

### Phase 5 — Admin UI

- [x] `/admin/welcome-sequence` preview, queue, metrics, and test sends.
- [x] Alerting thresholds.
- [x] `admin_send_next_step_now` RPC.

### Phase 6 — Provider Upgrade

- [ ] Resend or Postmark adapter.
- [ ] Idempotency keys.
- [ ] Bounce/complaint webhooks → `email_suppressions`.
- [ ] 2-week Gmail fallback.

### Phase 7 — Retire Legacy

- [ ] Stop dual-write.
- [ ] Read-only diagnostics for one release.
- [ ] **BLOCKER:** reactivation spec must be written and pre-deploy cohort exported into its enrollment list before this phase starts. Filter in §19 Phase 0 SQL.
- [ ] Drop `welcome_email_sequences` in follow-up migration.
