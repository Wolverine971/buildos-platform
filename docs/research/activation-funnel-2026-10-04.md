<!-- docs/research/activation-funnel-2026-10-04.md -->

# Activation funnel refresh and PostHog trust check — 2026-10-04

Research date: 2026-10-04. Scope: read-only SELECTs against production Supabase, the web and worker code, environment variable **names** in Vercel and Railway, and one public read of the production JS bundle. No accounts were created, no paid tests were run, no code was changed.

Owner tracker: `tasker/38-live-verification-debt.md` §4 (PostHog ingestion, fresh-account branches, funnel snapshot rerun) and the 78 residual it absorbed (fresh-account smoke).

**Labels.** **VERIFIED** means seen in a production query, the production bundle, an env-name listing, or the code. **INFERRED** means a judgement from that evidence.

All numbers are aggregates. This repo is public, so there are no emails, names or user IDs in this doc.

---

## TL;DR

- **PostHog in production: configured, but ingestion is not verified.** The key is set in Vercel and compiled into the live bundle, the token resolves to a live PostHog project, and server-side captures have logged zero failures. Nobody has looked at the events in PostHog yet. Even if ingestion works, PostHog **cannot show the activation funnel as it's built today**. The details are in §1, and the 2-minute check is in §1.4.
- **The 10-03 data point is correct.** In 2026 there were 47 signups after exclusions (48 under the 10-03 exclusions). 15 of them created a project: 14 on the UTC signup day, and the 15th about 7 hours after a late-evening signup, so the same night locally. Only 2 did anything on two or more days, and both were working on projects they don't own (DJ-adjacent accounts).
- **Last 12 weeks** (Jul 13 – Oct 4, 14 real signups): **7 created a project**, 8 sent a first message, **0 did anything on a later day**, 2 loaded a page on a later day, and **0 did anything in week 2**. There have been no signups since Sep 24.
- **The biggest leaks:** (1) nothing brings people back on day 2, and the day-1/3/6/9 welcome emails have **never been sent** because their cron isn't deployed; (2) half of signups never type anything; (3) "onboarding completed" is no longer an activation signal: 1 of 14 finished it, while 7 of 14 got a project.

---

## 1. PostHog: is production ingesting?

### 1.1 How it's wired (VERIFIED, code)

| Runtime                  | File                                                 | Key source                                                         | Consent-gated?                                                                                                                                                        | Events                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser                  | `apps/web/src/lib/services/posthog.ts`               | `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` (static, compiled in) | **Yes. Opt-in.** Nothing is sent until the visitor ticks Analytics or clicks "Accept all" on the privacy banner. Dropped events are not queued. GPC/DNT force it off. | `$pageview`/`$pageleave`, `onboarding_started`, `intent_selected`, `first_capture_started/submitted/skipped`, `first_structure_generated`, `first_project_created/reviewed/opened`, `brief_viewed`, the `loop_*` events on Today, `start_here_opened`, `memory_snapshot_shown`, `memory_update_started`, and the agentic-chat timing events |
| Web server (Vercel)      | `apps/web/src/lib/server/posthog.ts`                 | `PUBLIC_POSTHOG_KEY` (dynamic env)                                 | No                                                                                                                                                                    | `signup` (email register, Google register-callback), `onboarding_completed`, `brain_dump_created`, `task_completed`, `task_moved`, `email_opened/clicked`, and the document-proposal, project-audit and suggestion events                                                                                                                   |
| Shared ops (any runtime) | `packages/shared-agent-ops/src/analytics/posthog.ts` | `process.env.PUBLIC_POSTHOG_KEY`                                   | No                                                                                                                                                                    | `project_created`, the one funnel point every creation path passes through (`instantiation.service.ts:1097`)                                                                                                                                                                                                                                |
| Worker (Railway)         | `apps/worker/src/lib/posthog.ts`                     | `process.env.PUBLIC_POSTHOG_KEY`                                   | No                                                                                                                                                                    | `brief_generated` and the project-loop events                                                                                                                                                                                                                                                                                               |

The host defaults to `https://us.i.posthog.com`. Autocapture and session recording are off. URLs are scrubbed to origin and path, and page titles are dropped.

### 1.2 What I could verify (no PostHog read access)

No PostHog personal API key exists in any local env file. One does exist in Vercel (`PRIVATE_POSTHOG_PERSONAL_API_KEY`, added about 10 days ago for person deletion), but I only listed names, never values, so I could not query events.

| Check                                                  | Result                                                                                                                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` in Vercel | **VERIFIED** set for Production and Preview (added about 95 days ago). `PRIVATE_POSTHOG_PROJECT_ID` is Production only.                                                                                                                    |
| Key compiled into the live production bundle           | **VERIFIED.** A `phc_` key and `us.i.posthog.com` were found in the build-os.com JS chunks, and the key matches the one in `apps/web/.env` (compared by hash).                                                                             |
| Token resolves to a live PostHog project               | **VERIFIED.** The public remote-config endpoint returns 200 for the token and 404 for a bogus one.                                                                                                                                         |
| Server capture failures                                | **VERIFIED: 0 rows ever** in `error_logs` with `operation_type = 'posthog_capture'`. The web server writes one there whenever a funnel capture throws.                                                                                     |
| Railway `daily-brief-worker` has the PostHog vars      | **VERIFIED** (2 of 2 names present).                                                                                                                                                                                                       |
| Railway **`agentic-chat-worker`** has the PostHog vars | **VERIFIED: missing (0 of 2).** That service runs chat turns (first `worker_realtime` turn on 08-05; every new-user turn since September), so **`project_created` from chat-made projects is silently skipped** (logged as `missing_key`). |

**Verdict: UNKNOWN, leaning yes for server events.** The pipe is connected and nothing on the sending side is failing, but nobody has confirmed that events land in the project.

> **Verified 2026-10-08.** The §1.4 query was run in PostHog (project 494127): `signup` 3 / 1, `brief_generated` 64 / 13 and `$pageview` 183 / 54 over 30 / 7 days match the DB read taken at the same time, so web-server, worker and opted-in browser ingestion all work. `project_created` reads 66 / 3 against 20 / 8 projects: 60 of the 66 came from one person on 09-24/25 (harness runs whose projects were purged), and the 7-day shortfall is the chat-worker gap. The chat worker got `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` on Railway the same morning. Details in tasker 38 §4.

### 1.3 Why PostHog can't show the activation funnel even if ingestion works

The "BuildOS Activation" dashboard funnel (built 07-02) is `signup → onboarding_completed → brain_dump_created → project_created`. Every step after `signup` is structurally broken:

1. **`onboarding_completed`** fires only when someone clicks the last onboarding button. That happened for 1 of 14 real signups in 12 weeks, while 7 of 14 got a project (§2).
2. **`brain_dump_created`** is dead. `onto_braindumps` has had **0 rows since May 2026**, because onboarding capture now goes through chat (`project_create` context).
3. **`project_created`** is missing for chat-made projects. The Railway chat worker has no key (above).
4. **`signup` is undercounted.** Google sign-in from `/auth/login` with a new Google account creates the account silently, with no `signup` event, no legal acceptance and no welcome email (`google-oauth.ts` login-callback). **3 of the 14** recent signups match that signature: Google provider, no legal-acceptance row, no welcome-sequence row.
5. **Every browser-side event is opt-in.** The privacy banner defaults to analytics off. The `first_*` onboarding events and `$pageview` exist only for visitors who opted in.

Tasker 38 says to set `PUBLIC_POSTHOG_CAPTURE_DEV=true` for local checks. The code reads **`VITE_POSTHOG_CAPTURE_DEV`** (`posthog.ts:85`).

### 1.4 The 2-minute check for DJ

1. Open PostHog (US), choose the BuildOS project, then **SQL** (or Data management → Events).
2. Run:

    ```sql
    select event,
           count() as events_30d,
           countIf(timestamp > now() - interval 7 day) as events_7d,
           count(distinct person_id) as people_30d
    from events
    where timestamp > now() - interval 30 day
    group by event
    order by events_30d desc
    ```

3. Compare with the database (all accounts, DJ included, as of 2026-10-04 21:40 UTC):

    | Event                  | DB truth, 30d / 7d                                      | If PostHog shows…                                                                         |
    | ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
    | `signup`               | 3 / 0 signups (all 3 via a path that fires the event)   | about 3 / 0: server ingestion works. 0: broken.                                           |
    | `brief_generated`      | 65 / 11 completed daily briefs                          | about 65 / 11: worker ingestion works.                                                    |
    | `onboarding_completed` | 0 / 0                                                   | 0 is expected.                                                                            |
    | `project_created`      | 22 / 11 projects created (9 / 9 via API, 9 / 1 via MCP) | Clearly below 22: confirms the chat-worker gap.                                           |
    | `$pageview`            | n/a                                                     | Any non-zero count means browser ingestion works for opted-in visitors. Expect mostly DJ. |

4. Paste the result into tasker 38 §4, box 3. If you would rather Claude ran it, approve pulling `PRIVATE_POSTHOG_PERSONAL_API_KEY` from Vercel into a scratch file (never the repo) for one read-only HogQL query.

---

## 2. Funnel rerun from Supabase

### 2.1 Method

- **Source:** production Postgres through `supabase db query --linked`, SELECT only, run 2026-10-04 at about 21:40 UTC.
- **How the July snapshot worked:** `apps/web/scripts/activation-funnel-snapshot.mjs` (rerun in §2.5) had **no exclusions**. Its last-90-day numbers include internal accounts. This doc follows the 10-03 note's exclusions instead.
- **Exclusions (9 of 125 accounts):**
    - 2 admin accounts
    - 3 BuildOS-domain accounts, including a demo author
    - 1 agentic e2e harness account (example.com)
    - 1 disposable-inbox test persona
    - 2 founder alternate accounts
    - 1 account on the founder's other company domain

    Inside the 12-week window this removes 2 accounts (the demo author and the test persona). The harness account was created the day before the window. Matching rule: `is_admin`, plus an email-domain list, plus a founder-alt local-part pattern. The pattern is kept out of this public repo; ask DJ for it.

- **Cohort:** the ISO week (Monday start, UTC) of `users.created_at`. The window is **12 weeks: Mon 2026-07-13 → Sun 2026-10-04**.
- **Step definitions:**

    | Step                                    | Definition                                                                                                                                                                                                                                         | Source                                                               | Measured from DB?                                                                                                                                                                                               |
    | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Signup                                  | Row in `users`                                                                                                                                                                                                                                     | `users.created_at`                                                   | **DB, complete**                                                                                                                                                                                                |
    | Created a first project                 | Any `onto_projects` row whose `created_by` actor maps to the user                                                                                                                                                                                  | `onto_projects` → `onto_actors.user_id`                              | **DB, complete**                                                                                                                                                                                                |
    | Did something meaningful                | Sent at least 1 chat message, or made a capture                                                                                                                                                                                                    | `chat_messages` (role user), `chat_turn_runs`, `onto_braindumps`     | **DB, complete.** In today's product the first project is made through a chat turn, so this step usually comes **before** the project step. The table counts each step on its own.                              |
    | Came back on a later day: did something | A chat message, project change, project creation or agent call on a later UTC calendar day than signup                                                                                                                                             | the above plus `onto_project_logs.changed_by`, `agent_call_sessions` | **DB, complete for writes.** Read-only visits are invisible.                                                                                                                                                    |
    | Came back on a later day: page load     | `users.last_visit` falls on a later UTC day                                                                                                                                                                                                        | `users.last_visit`                                                   | **DB, lower bound.** Only the latest visit is kept, with a 6-hour write throttle. Since 08-15 every signed-in page load writes it. Before 08-15 it was written only for visitors who had opted in to analytics. |
    | Active in week 2                        | Any of the above between signup + 7 days and signup + 14 days                                                                                                                                                                                      | same                                                                 | Same caveats. Cohorts whose week 2 hasn't ended are marked pending.                                                                                                                                             |
    | Not in DB, needs PostHog                | Visit → signup conversion, acquisition source (UTM is stored only after consent), capture started but abandoned (`first_capture_started`), privacy-banner choices, read-only return visits (`project_opened`, `start_here_opened`, `brief_viewed`) | PostHog                                                              | **PostHog only, and opt-in only**, so it is a partial view even when it works.                                                                                                                                  |

### 2.2 Weekly cohorts, last 12 weeks (VERIFIED)

| Week of (Mon) | Signups | Finished onboarding | Created first project | Sent first message or capture | Later day: page load | Later day: did something | Week 2: any / did something |
| ------------- | ------: | ------------------: | --------------------: | ----------------------------: | -------------------: | -----------------------: | --------------------------: |
| 2026-07-13    |       2 |                   1 |                     1 |                             2 |                    0 |                        0 |                       0 / 0 |
| 2026-07-20    |       2 |                   0 |                     1 |                             1 |                    0 |                        0 |                       0 / 0 |
| 2026-07-27    |       1 |                   0 |                     0 |                             0 |                    0 |                        0 |                       0 / 0 |
| 2026-08-03    |       0 |                   — |                     — |                             — |                    — |                        — |                           — |
| 2026-08-10    |       3 |                   0 |                     1 |                             1 |                    0 |                        0 |                       0 / 0 |
| 2026-08-17    |       3 |                   0 |                     2 |                             2 |                    2 |                        0 |                       1 / 0 |
| 2026-08-24    |       0 |                   — |                     — |                             — |                    — |                        — |                           — |
| 2026-08-31    |       0 |                   — |                     — |                             — |                    — |                        — |                           — |
| 2026-09-07    |       2 |                   0 |                     1 |                             1 |                    0 |                        0 |                       0 / 0 |
| 2026-09-14    |       0 |                   — |                     — |                             — |                    — |                        — |                           — |
| 2026-09-21    |       1 |                   0 |                     1 |                             1 |                    0 |                        0 |      pending (0 / 0 so far) |
| 2026-09-28    |       0 |                   — |                     — |                             — |                    — |                        — |                           — |
| **Total**     |  **14** |          **1 (7%)** |           **7 (50%)** |                   **8 (57%)** |          **2 (14%)** |               **0 (0%)** |           **1 / 0** (of 13) |

Supporting detail (VERIFIED):

- **Signup method.** 9 Google, 5 email. Production requires email confirmation: confirmed accounts confirmed 25–100 s after signup, and **1 of 5 email signups never confirmed** (it never signed in).
- **Time to first project.** For the 7 creators the median was **about 2.5 minutes**. One outlier took 80 minutes because their first turn failed (next bullet).
- **First replies.** Every user who sent a message got a reply, though one only after re-sending. Reply time ranged from 5 s to about 1 min 45 s.
    - One user sent a 1.5k-character capture, got nothing back, and **re-sent the identical text 75 minutes later**. The second try worked.
    - One user typed a half-sentence, got a reply with two clarifying questions, and **left without a project**.
- **Depth.** 3 of 14 went past the first exchange (follow-up turns in their project). All of it happened on signup day. One of them came back 8.5 hours later the same day for a second session.
- **Where onboarding stopped (`users.onboarding_step`).**
    - 7 at step 0: never chose an intent. 3 of these still made a project, outside onboarding.
    - 6 at step 1: chose an intent, then stopped at the capture box or the receipt. 3 of these made a project and never clicked on.
    - 1 completed.
- **Return triggers that reached them.**
    - 11 of 14 got welcome email 1, and 6 opened it.
    - **0 got emails 2–5** (see observation 4).
    - Daily briefs were generated for only 2 of 14.

### 2.3 Context: 2026 by signup month (VERIFIED, same exclusions)

| Month | Signups | Created project | Finished onboarding |                                                                                             Did something on a later day |
| ----- | ------: | --------------: | ------------------: | -----------------------------------------------------------------------------------------------------------------------: |
| Jan   |       3 |               0 |                   0 | 2 (one DJ-adjacent collaborator, on a project they don't own; one is a single evening session that crossed UTC midnight) |
| Feb   |       7 |               0 |                   1 |                                                                        1 (DJ-client domain, on a project they don't own) |
| Mar   |       7 |               2 |                   0 |                                                                                                                        0 |
| Apr   |       6 |               4 |                   1 |                                                                                                                        0 |
| May   |       2 |               0 |                   0 |                                                                                                                        0 |
| Jun   |       8 |               2 |                   2 |                              1 (crossed UTC midnight: project made about 7 h after a late-evening signup; nothing after) |
| Jul   |       5 |               2 |                   1 |                                                                                                                        0 |
| Aug   |       6 |               3 |                   0 |                                                                                                                        0 |
| Sep   |       3 |               2 |                   0 |                                                                                                                        0 |
| Oct   |       0 |               0 |                   0 |                                                                                                                        0 |

**10-03 data point: VERIFIED, with one nuance.**

- "48 signups in 2026 → 15 created a project → 2 came back" holds: 47 under this doc's slightly stricter exclusions, 15 projects, 2 active on 2 or more days, 1 on 3 or more.
- Nuance: 14 of the 15 projects were made on the UTC signup day. The 15th came about 7 hours after a late-evening signup, so it's the same night locally.
- Both multi-day accounts made changes only on projects they don't own. The other later-UTC-day actions in the monthly table are single evening sessions that crossed UTC midnight. **No independent new user has come back on a later local day to do anything in 2026.**

### 2.4 Observations

1. **Day one works better than the dashboard says.** Half of recent signups made a project, typically within 3 minutes, and everyone who sent a message got a reply. The value moment is reachable. Measurement is what makes it look broken (§1.3).
2. **Nobody comes back.** 0 of 14 did anything on a second day, and 0 of 13 did anything in week 2. Only 2 even loaded a page on a later day, and one of those never had a project. This is the leak, and it isn't new: the same holds for all of 2026.
3. **Half never type anything.** 6 of 14 never sent a single message: 1 was stuck at email confirmation, and 5 landed and left. One more got two questions back instead of a project and left. What a new user sees right after signup isn't pulling them into the first input.
4. **The follow-up emails were never deployed.**
    - The 5-step welcome sequence is meant to send on days 0, 1, 3, 6 and 9. Steps 2–5 have **never sent or skipped for anyone** since it launched in March: 25 enrollments, 22 email-1 sends, 0 later steps, and **0 `welcome_sequence` rows in `cron_logs`, ever**.
    - Root cause (VERIFIED): the Vercel project builds from `apps/web` (`rootDirectory: apps/web`), so Vercel reads **`apps/web/vercel.json`**. That file lists 6 crons. `/api/cron/welcome-sequence` is only in the **repo-root `vercel.json`**, which Vercel ignores. So are `reactivation-sequence`, `trial-reminders`, `dunning` and `billing-ops-monitoring`.
    - Proof: `gmail_relevance_retention` runs at :30 every hour. That matches `apps/web/vercel.json`; the root file says :15.
    - The only nudge a new user gets is the signup-day email.
5. **"Onboarding completed" no longer measures activation.** 1 of 14 finished it, while 7 got a project.
    - 3 creators never entered onboarding: email and Google register both land on `/projects` with a dismissible Welcome modal, not on `/onboarding`.
    - 3 got their project and stopped before the notifications and finish steps.
    - The July "false-positive" metric (finished onboarding with 0 projects) is now 0%, but on a base of 1.

### 2.5 July snapshot rerun (tasker 38 §4, box 4)

`node apps/web/scripts/activation-funnel-snapshot.mjs` (read-only, no exclusions):

| Window       | Signups | Finished onboarding | Finished with 0 projects ("false-positive") | Reopen-within-7d proxy |
| ------------ | ------: | ------------------: | ------------------------------------------: | ---------------------: |
| All-time     |     125 |          32 (25.6%) |          12 (**37.5%**; baseline was 41.4%) |                      0 |
| Last 90 days |      17 |           3 (17.6%) |                                      0 (0%) |                      0 |
| Last 30 days |       3 |                   0 |                                         n/a |                      0 |

The last-90-day completions include 2 internal accounts. Excluding them leaves 1 real completion, with a project. The gate removed false positives by making completion rare.

---

## 3. First-run paths (code as of `main` HEAD `df81f97dc`; the latest production deploy was Ready about 1 h before this check, and its commit was not verified)

| #   | Entry                                                               | Route sequence                                                                                                                                                                                     | Lands on                                                                  | First thing they see                                                                                                                     | Landmines                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Email** from `/`: hero "Start with one project"                   | `/auth/register` → `POST /api/auth/register` → "Check your email!" → confirmation link                                                                                                             | Committed code: if a session exists, `/projects?onboarding=true`          | "No projects yet / Create first project" with a **"Welcome to BuildOS!"** modal ("Start Setup" → `/onboarding`, or "I'll do this later") | **Confirmation is on in prod.** With no redirect, committed code omits `emailRedirectTo`, so Supabase falls back to its Site URL, likely a **signed-out marketing page** (INFERRED; the walk confirms it). **A parallel session has an uncommitted fix** in the working tree: confirmation always goes through `/auth/confirm`, and the default landing becomes `/today`, which gates into `/onboarding`. 1 of 5 recent email signups never confirmed. |
| 2   | **Google** from `/auth/register`                                    | Google → `auth/google/register-callback` → legal acceptance + `signup` event + welcome sequence                                                                                                    | `/projects?new_user=true&onboarding=true`                                 | Same Welcome modal                                                                                                                       | If the Google account already has an account: signed out, sent to `/auth/login?notice=account_exists`, and any skill or invite redirect is lost.                                                                                                                                                                                                                                                                                                       |
| 2b  | **Google from `/auth/login` with a brand-new account**              | `login-callback` creates the account silently                                                                                                                                                      | `/today` → `/onboarding`                                                  | Onboarding intent question                                                                                                               | **No legal acceptance, no `signup` event, no welcome email.** 3 of 14 recent signups came this way.                                                                                                                                                                                                                                                                                                                                                    |
| 3   | **"Try in BuildOS"** skill link (tracker 115), `/skills/try/<slug>` | Signed out → `/auth/register?redirect=/?open=agent-chat&skill=…&prompt=…` → after signup `/today?open=agent-chat…` (sets a 1-hour onboarding-grace cookie)                                         | `/today` with global chat open, the skill attached and the prompt drafted | The chat drawer over the Today first-run hero ("Get it out of your head"), plus the "A few quick steps… Start setup" strip               | Email confirmation keeps the launch only via `/auth/confirm?next=` (needs the Supabase redirect allow-list). Redirects over 4096 characters are dropped. Login-page Google doesn't trim the draft, so a long one could overflow the OAuth state (INFERRED). If the chat makes a project, onboarding never runs and the setup strip stays forever.                                                                                                      |
| 4   | **Project invite**, `/invites/<token>`                              | Project, inviter and role card → "Create account" → `/auth/register?redirect=/invites/<token>` → Accept → push prompt                                                                              | `/projects/<id>?message=Invite accepted`                                  | The shared project                                                                                                                       | Signing up with a different email than the invite leaves only "Switch account". Membership counts as having a project, so onboarding never runs.                                                                                                                                                                                                                                                                                                       |
| 5   | **Connector (ChatGPT / Claude MCP)**, `/oauth/authorize` signed out | `/auth/login?redirect=…` → "create account" keeps the redirect → consent screen → back to the AI client                                                                                            | The AI client                                                             | The OAuth consent screen                                                                                                                 | Never sees onboarding or the app. Activation happens elsewhere, if at all.                                                                                                                                                                                                                                                                                                                                                                             |
| 6   | Others                                                              | `/pricing` → plain `/auth/register` (same as 1). `/beta` is a waitlist form with no account. Public project pages link "Made with BuildOS" → `/` with UTM tags. Legacy `/login` drops `?redirect`. | —                                                                         | —                                                                                                                                        | Signed-in users hitting `/auth/register` or `/auth/login` go to `/today` and the `redirect` is ignored.                                                                                                                                                                                                                                                                                                                                                |

**Onboarding itself.** The live version is the v3 shell with the v2 capture step (`routes/onboarding/+page.svelte`):

1. **Intent**, then **stakes**.
    - Asks "What brings you to BuildOS?" (organize / plan / unstuck / explore).
    - Fires `onboarding_started` and `intent_selected`, and writes `onboarding_step = 1`.
2. **Capture**: "Tell BuildOS what you're working on."
    - "Shape my first project" opens chat in `project_create` mode, then shows the receipt "Your project is ready", an optional calendar connect, and Continue.
    - **Zero projects, non-explore intent:** no Continue and no Skip. The composer is the only way forward, and `/today` bounces back here.
    - **Explore intent:** "Skip for now — start with an empty workspace" fires `first_capture_skipped`.
3. **Notifications**: "Want daily check-ins?" Email and SMS are optional.
4. **Ready**: "Finish setup and start today" is the **only** thing that writes `onboarding_completed_at`. It lands on `/today?activated_project=<id>`.

The **privacy banner** shows on the first visit to any page. Analytics and marketing default to unchecked. The buttons are "Use necessary only", "Save choices" and "Accept all", with no close button.

---

## 4. The 10-minute fresh-account walk (do this once account deletion works)

**Setup:** two fresh inboxes you control (plus-addresses work), one never-used Google account, an incognito window per walk, and PostHog **Activity → Live events** open in a second tab. Note the clock time you start.

**Walk A: email signup, non-explore branch (about 4 min)**

1. Incognito → `build-os.com`. On the privacy banner click **Accept all**, so your browser events reach PostHog. Real users mostly won't, so this tests the pipe, not coverage.
2. Click **Start with one project** and register with inbox 1. Expect "Check your email!". Click the link. **Record where you land and whether you're signed in.** Expected landings:
    - signed-in `/projects` with the Welcome modal (committed code)
    - or `/today` → `/onboarding` (if the parallel fix has shipped)
    - a **signed-out marketing page means landmine 1 is live**
3. Get into onboarding (Welcome modal → **Start Setup**, or the `/today` bounce). Pick **Organize** and any stakes.
4. On the capture step, **confirm there is no Continue or Skip**. Type `/today` in the address bar and confirm it bounces you back to `/onboarding`. _(tasker 38 §4 box 1)_
5. Type two plain sentences about a real project → **Shape my first project**. **Time the first reply** (target under 30 s) and confirm a project appears with the "Your project is ready" receipt.
6. Continue → skip calendar → notifications → **Finish setup and start today**. Confirm you land on `/today?activated_project=…`.

**Walk B: Google signup, explore branch (about 3 min)**

7. New incognito → `/auth/register` → **Continue with Google** with the never-used Google account. Expect `/projects?new_user=true&onboarding=true` and the Welcome modal. Start Setup → pick **Explore** → **Skip for now — start with an empty workspace**. Finish → confirm `/today` shows an empty first-run state, not an error. _(tasker 38 §4 box 2)_

**Walk C: Try in BuildOS (about 2 min)**

8. New incognito → `/skills` → any skill → **Try in BuildOS** → register with inbox 2 (email). After confirming, **expect `/today` with the chat drawer open and the skill's prompt drafted**, and no onboarding interruption. Send it and record the reply time. Note whether the "Start setup" strip shows.

**Check (about 1 min)**

9. In PostHog Live events, filtered from your start time, expect:

    | Event                                                                                                                                  | Expected count                                                                                                |
    | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
    | `signup` (server, one per account)                                                                                                     | 3                                                                                                             |
    | `onboarding_started`, `intent_selected`, `first_capture_started`, `first_capture_submitted`, `first_project_created` (browser, walk A) | 1 each                                                                                                        |
    | `first_capture_skipped` (walk B)                                                                                                       | 1                                                                                                             |
    | `onboarding_completed` (server)                                                                                                        | 2                                                                                                             |
    | `$pageview`                                                                                                                            | several                                                                                                       |
    | **`project_created`**                                                                                                                  | **expected missing** for walks A and C (the chat worker has no PostHog key). If it appears, the gap is fixed. |

    Record green or red per row in tasker 38 §4 box 3.

**Cleanup**

10. Delete all three accounts from Settings. Confirm the `users` rows are gone (one SELECT) and that the PostHog persons are deleted.

**Optional extras:**

- **Silent Google path (2b):** a fresh Google account via `/auth/login`. Expect no `signup` event and no welcome email.
- **Invite path (4):** invite inbox 1 to a scratch project before deleting it.

---

## 5. What this changes (for DJ to decide; nothing was built)

- **Ship the missing crons, highest leverage and smallest change.** Move `welcome-sequence` (and decide about `reactivation-sequence`) into `apps/web/vercel.json`, or have one file import the other. This is the only scheduled day-1/3/6/9 touch new users have. First check what steps 2–5 say: about 22 enrolled users would become eligible for the backlog unless the sequence skips stale enrollments.
- **Make the funnel measurable without consent.**
    - Add `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` to the Railway `agentic-chat-worker`.
    - Rebuild the PostHog dashboard on server-side events that exist: `signup → project_created → (any server event on day ≥ 1)`.
    - Fire `signup` from the Google login-callback create path.
    - Or keep this SQL as the source of truth.
- **Re-define "activated"** as "has a project **and** returned on a later day". By that definition, the number for the last 12 weeks is **0 of 14**.

## Reproduce

The SQL lives in the session scratchpad and isn't committed, because the exclusion pattern contains account identifiers. The shape is:

- a `u` CTE: `users`, minus `is_admin`, minus the internal-domain list, minus the founder-alt pattern
- an `act` union: `chat_messages` (role user, via `chat_sessions.user_id`), `chat_turn_runs`, `onto_braindumps`, `onto_projects` → `onto_actors`, `onto_project_logs.changed_by`, `agent_call_sessions.started_at`, `users.last_visit`
- per-user flags, aggregated by `date_trunc('week', users.created_at)`

The return-trigger checks read `welcome_email_sequences`, `email_sequence_events`, `email_recipients`, `ontology_daily_briefs` and `cron_logs`.
