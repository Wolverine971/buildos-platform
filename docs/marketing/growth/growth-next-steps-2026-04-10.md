<!-- docs/marketing/growth/growth-next-steps-2026-04-10.md -->

# BuildOS Growth Next Steps & Implementation Checklist — April 2026

> **Date:** 2026-04-10
> **Companion to:** `docs/marketing/growth/growth-audit-2026-04-09.md`
> **Purpose:** Turn the audit into a concrete implementation sequence for the next 14 days

---

## What This Doc Is For

This is the execution layer for the growth audit.

Use it to decide:

- what gets worked on first
- which files need to change
- how to verify each fix actually worked
- what not to work on yet

This is intentionally narrower than the audit. It is a shipping checklist, not another diagnosis.

---

## Research Findings That Change Execution

These findings came from the codebase and matter for sequencing:

1. **Welcome-sequence start logic already exists in both signup paths.**
    - Password registration starts the sequence in `apps/web/src/routes/api/auth/register/+server.ts`.
    - Google OAuth registration starts the sequence in `apps/web/src/lib/utils/google-oauth.ts`.
    - This means the likely failure is not "feature missing." It is probably schema drift, runtime failure, or downstream delivery failure.

2. **Cron schedules already exist in production config.**
    - `vercel.json` schedules `/api/cron/welcome-sequence` hourly and `/api/cron/trial-reminders` daily.
    - The checklist should focus on verification, secrets, and runtime behavior, not on adding missing cron entries.

3. **The current onboarding Step 2 still allows unconditional progress.**
    - `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` still renders a bare `Continue` / `Skip for now` button.
    - `apps/web/src/routes/api/onboarding/+server.ts` still accepts `projectsCreated >= 0` for every intent.
    - The front end and server are both permitting false activation.

4. **Trial reminders are still in-app only.**
    - `apps/web/src/routes/api/cron/trial-reminders/+server.ts` contains a comment placeholder where real email delivery should be.
    - It currently inserts `trial_reminders` rows and creates tracked in-app notifications, but does not send multi-channel reminders.

5. **No generic product-event stream is visible in the repo.**
    - There is no obvious `user_events` or equivalent generic funnel-event table in the codebase.
    - If BuildOS wants durable onboarding instrumentation, that needs to be added explicitly or replaced with another explicit event surface.

6. **Trial expiry enforcement does not appear to exist yet.**
    - Trial config and banners exist.
    - Reminder logic exists.
    - I did not find a scheduled path that consistently moves trialing users into grace or read-only when the trial actually ends.

7. **Welcome-sequence schema compatibility is already a known issue.**
    - `apps/web/src/lib/server/welcome-sequence.service.ts` contains fallback logic for missing `last_evaluated_at` and `updated_at`.
    - Relevant migrations exist in `supabase/migrations/20260428000007_add_welcome_email_sequences.sql`, `supabase/migrations/20260428000009_backfill_welcome_sequence_last_evaluated_at.sql`, and `supabase/migrations/20260428000017_fix_welcome_sequence_legacy_schema.sql`.
    - Part of the checklist should be verifying production schema state before changing app logic.

---

## Working Rules

- Freeze non-core feature work for this pass.
- Limit work in progress to two tracks:
    - `Track A`: activation + instrumentation
    - `Track B`: lifecycle delivery + trial integrity
- Narrow manual lead campaigns are allowed in parallel if they are founder-led, segment-specific, and measured against conversations, qualified visits, and activation proxies rather than raw traffic.
- Do not record demo assets until the onboarding and welcome flow reflect the fixed product.
- Do not start broader growth experiments until the ship gates below are met.

---

## Ship Gates

Do not push harder on broad distribution until all of these are true:

- New users cannot complete onboarding Step 2 without a real first project unless intent is `explore`.
- Every new signup creates a `welcome_email_sequences` row.
- At least one end-to-end test user successfully receives Welcome Email 1.
- Trial reminders produce observable delivery attempts beyond in-app notification creation.
- Trial/grace/read-only transitions behave consistently for expired users.
- The team has a current demo bank recorded from the repaired flow.

Narrow manual lead campaigns and user-research outreach can still run in parallel, but they should stay constrained and learning-oriented until these gates are met.

---

## 14-Day Implementation Sequence

### Phase 0: Baseline and Reproduction

**Goal:** Confirm the breakpoints before changing code.

- [ ] Save a baseline snapshot for:
    - onboarding completion rate
    - welcome sequence row creation rate
    - welcome email send/fail counts
    - trial reminder sends
    - read-only / restricted user counts
- [ ] Verify current cron schedule definitions in `vercel.json`.
- [ ] Verify the production schema state for `welcome_email_sequences`:
    - `last_evaluated_at`
    - `updated_at`
    - relevant indexes
    - trigger on update
- [ ] Create one fresh password-signup test user and one fresh Google-signup test user.
- [ ] Reproduce the current false-positive activation path:
    - enter onboarding
    - advance through Step 2 without creating a project
    - confirm `complete_v3` still accepts `projectsCreated: 0`
- [ ] Reproduce the welcome-sequence failure:
    - confirm whether row creation fails
    - confirm whether row creation succeeds but send fails
    - confirm whether Email 1 send is logged to `email_logs`
- [ ] Reproduce the trial-reminder path:
    - confirm `trial_reminders` rows get inserted
    - confirm no email delivery path is triggered today

**Primary files**

- `apps/web/src/routes/onboarding/+page.svelte`
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/routes/api/onboarding/+server.ts`
- `apps/web/src/routes/api/auth/register/+server.ts`
- `apps/web/src/lib/utils/google-oauth.ts`
- `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`
- `apps/web/src/routes/api/cron/trial-reminders/+server.ts`
- `vercel.json`

**Done when**

- The exact failure mode is written down for onboarding, welcome delivery, and trial reminders.

---

### Phase 1: Rebuild Activation Around a Real First Artifact

**Goal:** Make onboarding Step 2 create value, not just describe it.

#### Product/UI checklist

- [ ] Replace the tutorial-heavy Step 2 layout in `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` with the flow described in `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`.
- [ ] Remove the unconditional bottom `Continue` button for non-`explore` users.
- [ ] Require a successful first project creation before `onNext()` can fire for non-`explore` users.
- [ ] Keep skip behavior only for `intent === 'explore'`.
- [ ] Move calendar connection to a follow-up action after project creation, not a replacement for it.
- [ ] Preserve onboarding substep state across calendar OAuth redirects.
- [ ] Replace broken onboarding assets or remove them from the Step 2 path entirely.

#### Backend checklist

- [ ] Change `apps/web/src/routes/api/onboarding/+server.ts` so `complete_v3` rejects `projectsCreated: 0` for non-`explore` intents.
- [ ] Add the same rule in `apps/web/src/lib/server/onboarding.service.ts` or equivalent server-side completion logic so validation is not only in the route layer.
- [ ] Confirm the onboarding page only advances after a valid project-creation result is captured.

#### Instrumentation checklist

- [ ] Add the minimum onboarding events:
    - `onboarding_started`
    - `brain_dump_submitted`
    - `first_project_created`
    - `onboarding_completed`
- [ ] If no generic event sink exists, add a minimal `user_events` table or equivalent server-side event log.
- [ ] Record enough metadata to answer:
    - intent
    - signup method
    - whether Step 2 was skipped
    - project count created during onboarding
    - time-to-first-project

#### Test checklist

- [ ] Update `apps/web/src/routes/api/onboarding/server.test.ts`:
    - reject zero projects for non-`explore`
    - allow zero projects for `explore`
    - accept valid payloads with `projectsCreated >= 1`
- [ ] Add or update UI/manual QA coverage for:
    - non-`explore` user cannot continue without a project
    - `explore` user can skip
    - calendar OAuth round trip does not wipe the created-project state

**Done when**

- Step 2 always produces a real artifact for non-`explore` users.
- The server rejects false activation.
- The four core onboarding events exist and can be queried.

---

### Phase 2: Repair Welcome Email Creation and Delivery

**Goal:** Ensure new users actually enter and receive the sequence.

#### Data-path checklist

- [ ] Confirm the `welcome_email_sequences` migrations are applied in the target environment.
- [ ] Inspect whether new users fail before row creation, during row creation, or during email send.
- [ ] Confirm `started_at` seeds from `users.created_at` as expected.
- [ ] Verify `cron_logs` entries are being written for the welcome sequence job.

#### Signup-entry checklist

- [ ] Verify password registration path in `apps/web/src/routes/api/auth/register/+server.ts` creates a sequence row for a fresh signup.
- [ ] Verify Google registration path in `apps/web/src/lib/utils/google-oauth.ts` does the same.
- [ ] If sequence creation fails, log enough detail to distinguish:
    - missing user row
    - schema error
    - duplicate row
    - email-service failure

#### Delivery checklist

- [ ] Verify Welcome Email 1 sends immediately when a valid sequence row exists.
- [ ] Confirm `email_logs` entries for welcome emails include:
    - `campaign: welcome-sequence`
    - `sequence_step`
    - `user_id`
- [ ] Confirm open/click tracking is wired through the existing email service path in `apps/web/src/lib/services/email-service.ts`.
- [ ] Triage the current failure rate by reason from `email_logs` / `email_tracking_events`.
- [ ] Fix the highest-volume failure reason before changing welcome copy.

#### Test checklist

- [ ] Keep `apps/web/src/routes/api/auth/register/server.test.ts` passing.
- [ ] Extend `apps/web/src/lib/server/welcome-sequence.service.test.ts` if the fix changes:
    - row creation assumptions
    - send timing
    - schema fallback behavior
- [ ] Keep `apps/web/src/lib/server/welcome-sequence.logic.test.ts` aligned with real branching behavior.

**Done when**

- Fresh password and Google signups both create a sequence row.
- A fresh test user receives Email 1 through the real delivery stack.
- Welcome-sequence cron runs are visible in `cron_logs` without silent failure.

---

### Phase 3: Make Trial Reminders and Access States Real

**Goal:** Stop pretending the trial system is active when it is mostly not enforced.

#### Trial-reminder checklist

- [ ] Replace the placeholder comment in `apps/web/src/routes/api/cron/trial-reminders/+server.ts` with a real delivery path.
- [ ] Route trial reminders through `emit_notification_event` so opted-in email and in-app delivery can happen from the same source of truth.
- [ ] Preserve durable tracking in `trial_reminders` even when delivery fails.
- [ ] Log delivery outcomes clearly enough to separate:
    - event emitted
    - email attempted
    - email sent
    - in-app created

#### Access-state checklist

- [ ] Define the intended transitions explicitly:
    - `trialing` -> `grace`
    - `grace` -> read-only / restricted
    - paid activation clears restriction
- [ ] Implement a scheduled enforcement path if one does not already exist.
- [ ] Confirm expired users no longer remain indefinitely in `trialing`.
- [ ] Decide whether `subscription_status` needs new values or whether `access_restricted` + dates are sufficient.

#### Read-only value checklist

- [ ] Change `TRIAL_CONFIG.READ_ONLY_FEATURES.canGenerateBriefs` to `true` in `apps/web/src/lib/config/trial.ts`.
- [ ] Confirm the scheduler and worker honor that decision for read-only users.
- [ ] Turn on `ENGAGEMENT_BACKOFF_ENABLED` only after welcome and trial delivery are verified.

#### Validation checklist

- [ ] Test one user in each state:
    - active trial
    - expired but in grace
    - expired beyond grace
    - active paid
- [ ] Verify the correct messaging, access level, and brief behavior for each state.

**Done when**

- Trial reminders are multi-channel and observable.
- Expired users transition out of endless trial state.
- Read-only users still receive enough value to support later conversion.

---

### Phase 4: Clean Up Messaging and Preserve Source Attribution

**Goal:** Remove obvious brand leaks and capture basic acquisition source data.

#### Brand cleanup checklist

- [ ] Remove `AI-powered` framing from:
    - `apps/web/src/routes/pricing/+page.svelte`
    - `apps/web/src/routes/auth/register/+page.svelte`
    - `apps/web/src/routes/beta/+page.svelte`
- [ ] Check adjacent public pages that still leak old framing:
    - `apps/web/src/routes/about/+page.svelte`
    - `apps/web/src/routes/auth/login/+page.svelte`
    - `apps/web/src/routes/contact/+page.svelte`
    - `apps/web/src/routes/docs/+page.svelte`
- [ ] Replace with category-consistent wording:
    - thinking environment
    - turn messy thinking into structured work
    - the project remembers what matters

#### Attribution checklist

- [ ] Capture `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content` on signup.
- [ ] Persist source attribution somewhere queryable against the user record or a signup event record.
- [ ] Add one lightweight admin view or query path for "signups by source."

**Done when**

- Core acquisition pages match the brand strategy.
- New signups retain basic attribution without a heavyweight analytics project.

---

### Phase 5: Build Proof Assets From the Repaired Product

**Goal:** Create the minimum proof bank needed for distribution.

- [ ] Record 4-6 demos from the fixed onboarding and project-creation flow.
- [ ] Capture before/after screenshots from real product states, not mocks.
- [ ] Record one "BuildOS builds BuildOS" walkthrough.
- [ ] Save the assets in one reusable location with clear names by use case:
    - author example
    - YouTuber example
    - founder / operator example
    - generic messy-input-to-structure example

**Done when**

- A reusable proof bank exists and distribution no longer starts from zero each week.

---

### Phase 6: Use Humans for Learning, Not Scale

**Goal:** Turn engaged users and beta signups into feedback, not vanity numbers.

- [ ] Send the Sean Ellis PMF question to the most engaged current users.
- [ ] Contact the approved beta list with a short personal note:
    - what are you trying to build?
    - did you try BuildOS?
    - where did you get stuck?
- [ ] Tag replies by:
    - audience
    - signup source
    - activation status
    - trial status

**Done when**

- There are at least 10 real qualitative replies that can influence the next product pass.

---

## Suggested Implementation Order By Track

### Track A: Activation + Instrumentation

1. Baseline and reproduce
2. Rebuild Step 2
3. Add minimum onboarding events
4. Ship server-side validation
5. Verify conversion from signup to first project

### Track B: Lifecycle Delivery + Trial Integrity

1. Verify welcome-sequence schema state
2. Fix new-signup row creation if broken
3. Fix Welcome Email 1 send path
4. Upgrade trial reminders to multi-channel delivery
5. Implement trial/grace/read-only enforcement
6. Turn on backoff and keep briefs for read-only users

---

## Not In Scope For This Pass

Do not start these until Phases 1-3 are complete:

- calendar boomerang redesign
- public pages push
- podcast expansion
- comparison-post refresh
- broader creator landing-page expansion
- new feature work unrelated to activation, lifecycle delivery, or trial integrity

---

## Immediate Next 5 Tasks

If starting today, do these first:

1. Reproduce the Step 2 false activation path and document it.
2. Verify whether fresh password and Google signups create `welcome_email_sequences` rows.
3. Confirm which welcome-sequence migrations are applied in the target environment.
4. Replace the placeholder trial-reminder delivery comment with a concrete implementation plan using `emit_notification_event`.
5. Draft the minimal onboarding event schema before rebuilding Step 2 so instrumentation ships with the fix.
