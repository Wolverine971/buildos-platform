<!-- apps/worker/docs/features/daily-briefs/DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md -->

# Daily Brief Flow Audit — 2026-07-06

> **Scope:** (1) auto-generate the brief when a user opens BuildOS on a new day, with single-flight guarantees; (2) brief content quality (data + prompts); (3) email delivery correctness + re-engagement effectiveness.
> **Method:** three parallel code audits (trigger/dedup, content/prompts, email/re-engagement) cross-checked against live prod data (Supabase, read-only queries run 2026-07-06).
> Companion reference: `DAILY_BRIEF_GENERATION_END_TO_END.md`.

---

## 0. TL;DR

1. **There is no app-open trigger today**, and the two dedup layers that would make one safe are both currently defeated: the web client hardcodes `forceRegenerate: true` on every UI generation (bypassing the queue's dedup key), and the worker has **no "already generated today" guard** — any second job silently re-runs the full LLM pipeline over a completed brief.
2. **The brief is a 39KB wall** (real sample: DJ's 2026-07-06 brief, 27 projects concatenated) with self-contradicting sections, and that entire wall **is the email body** for standard sends. The prompts are structurally self-defeating (220-word cap ÷ 7 mandatory sections; exec summary sees only 3 of 27 projects with the Next Steps tail truncated off; a 2,000-token daily analysis call that is rendered nowhere).
3. **Re-engagement IS running in prod** (contrary to repo config, which never mentions the flag) — but it is generating briefs for dormant users **who have no reachable channel**: email defaults to opt-out (migration `20260205_001`), SMS has never sent a single message (195 rows, all `queued`/`pending`), and in-app notifications require logging in. Net effect over the last 30 days: **every daily-brief email went to exactly one user (DJ)**. LLM money is being spent on briefs nobody can receive.
4. Prod data shows **same-brief emails created on consecutive days** (Jun 24/25, 26/27, 28/29, Jul 5/6) and a latent subject-date timezone bug — the retry path has no idempotency key and can genuinely double-send.
5. There is **zero measurement**: no per-stage open/click/reactivation readout anywhere. "Is it working" is currently unanswerable without hand-written SQL.

---

## 1. Prod data snapshot (2026-07-06)

| Metric                                     | Value                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Users total                                | 108                                                                                                                         |
| Users active ≤2d / dormant >60d            | 1 / 94                                                                                                                      |
| Active `user_brief_preferences`            | 19                                                                                                                          |
| Users with `should_email_daily_brief=true` | 59                                                                                                                          |
| Active `brief.completed` subscriptions     | 77 (pref-true-without-sub drift: **0** — the 20260426 backfill worked)                                                      |
| Briefs generated, last 30d                 | 49 (47 completed, 2 failed) across 17 users                                                                                 |
| … flagged `isReengagement`                 | 14 (12 on 2026-06-11 alone — dormant wave, users 227–326 days away)                                                         |
| Daily-brief emails, last 60d               | 17 — **all to djwayne35@gmail.com**                                                                                         |
| Email open rate (n=17)                     | 59% (10/17); click events: **0**                                                                                            |
| `brief.completed` deliveries, last 30d     | in_app 47 sent · sms 30 "sent" · email 16 opened + 14 sent + 2 failed (webhook 504 / `[object Object]`)                     |
| SMS ever actually sent via Twilio          | **0** (195 `sms_messages`: 169 queued, 26 pending — worker send is parked, yet `notification_deliveries` marks them "sent") |
| DJ's 2026-07-06 brief                      | `executive_summary` = **39,278 chars**; metadata: 27 projects, 449 tasks, **50 overdue**, 0 today                           |

Observed anomalies in `emails`:

- **Duplicate/day-late sends:** same-subject emails created on consecutive days at the same clock time (Jun 20→"Jun 19", Jun 21→"Jun 20", Jun 22→"Jun 21", pairs on Jun 24/25, 26/27, 28/29, Jul 5/6 — e.g. an email created 2026-07-06T15:00 with subject "Sunday, July 5, 2026" while the 07-06 brief event fired at 15:03). Consistent with the no-idempotency retry path (§4.1) and/or stale-brief suppression gaps. Needs a targeted trace after the idempotency fix.
- `emails.category` changed from `notification` to `daily_brief` around Jun 16–20 (queries filtering on category undercount June).
- `emails.status` stays `scheduled` even after successful send (bookkeeping only).

---

## 2. Goal 1 — Generate on app open, single-flight

### 2.1 What exists today

- **No auto-trigger anywhere.** `DashboardBriefWidget.svelte:97-113` only fetches; generation is button-only (`generateBrief()` :192). Same on `/briefs` (`+page.svelte:353-430`).
- **The queue dedup primitive is sound:** `add_queue_job` uses a partial unique index `ON dedup_key WHERE status IN ('pending','processing')` with `ON CONFLICT … DO NOTHING` returning the existing job id (definition extracted from live DB — **not in any repo migration**, see §2.4). Completed/failed/cancelled jobs do **not** block re-insertion.

### 2.2 Bugs that defeat single-flight (fix before building the trigger)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                 | Where                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| B1  | **Web client hardcodes `forceRegenerate: true`** for every UI generation; the widget's `forceRegenerate: false` is never forwarded. Every click cancels in-flight work and enqueues with a unique dedup key (`brief-<user>-<date>-<Date.now()>`), defeating the RPC dedup. Two tabs → two concurrent full LLM generations upserting the same brief row. | `apps/web/src/lib/services/railwayWorker.service.ts:106`; `briefClient.service.ts:230-254`            |
| B2  | **No completed-brief guard in the worker.** `briefWorker.ts` only has the stale-_date_ skip; `generateOntologyDailyBrief` unconditionally upserts `processing` and regenerates. Cron at 9am happily re-runs the pipeline over a brief generated at 6am.                                                                                                 | `briefWorker.ts:84-100`; `ontologyBriefGenerator.ts:1069-1084`                                        |
| B3  | **Dedup-hit discards the new request's `scheduled_for`/metadata.** An immediate request that collides with a pending 8:58am cron job returns that job unchanged — the user waits until 8:58 with no feedback.                                                                                                                                           | `add_queue_job.sql` (`DO NOTHING`)                                                                    |
| B4  | `isBriefGenerating` client pre-check is nearly useless: matches only `processing` (never `pending`) and compares the **UTC date** of `scheduled_for` to a local brief date.                                                                                                                                                                             | `railwayWorker.service.ts:265-293`                                                                    |
| B5  | Scheduler ±30min guard ignores completed jobs, has **no briefDate filter** (a different-date job within ±30min falsely blocks; same-date >30min away doesn't), and misses force-keyed jobs.                                                                                                                                                             | `scheduler.ts:786-824`                                                                                |
| B6  | Stalled-job recovery (5-min timeout) re-queues while the original worker is usually still alive → two concurrent generations; completion is token-fenced but the double LLM spend and last-writer-wins content are not.                                                                                                                                 | `supabase/migrations/20260502000001` :171-228                                                         |
| B7  | **On-demand path never sets `notificationScheduledFor`** → email/push fire at generation time (`COALESCE(p_scheduled_for, NOW())`), and the event-level dedup (keyed on stable `brief_id`) then **swallows the later properly-scheduled cron emission for the whole day**. On-demand generation permanently pre-empts the preferred-time email.         | `apps/worker/src/index.ts:165-297`; `briefWorker.ts:283-334`; `emit_notification_event.sql:53-70,151` |
| B8  | Minor: RPC TOCTOU — if the conflicting job completes between INSERT and fallback SELECT, the RPC raises a spurious error.                                                                                                                                                                                                                               | `add_queue_job.sql`                                                                                   |

### 2.3 Recommended design

**Server-side "ensure today" trigger** — new `POST /api/daily-briefs/ensure-today` (or fire-and-forget in `apps/web/src/routes/+page.server.ts` load), called from `DashboardBriefWidget.initializeWidget()`:

1. Resolve `today` from **`users.timezone`** (never browser tz).
2. `SELECT generation_status FROM ontology_daily_briefs WHERE user_id=? AND brief_date=today`:
    - `completed` → done (this is the guard the queue can't provide);
    - `processing` fresh (<10min) → done (in flight, realtime will paint it);
    - else → POST worker `/queue/brief` with explicit `briefDate`, `forceRegenerate: false`, `forceImmediate: true`, **plus `notificationScheduledFor`** computed from `user_brief_preferences.time_of_day` when that time is still in the future (fixes B7 — early generation, email still at preferred time).
3. Gate on `hasAnyProjects()` (already computed in `+page.server.ts:14-48`) — the generator throws `'No ontology projects found'` and retries `max_attempts` times otherwise.

**Prerequisite plumbing fixes:**

- Kill the `forceRegenerate: true` hardcode; thread the real flag through `startRailwayGeneration` (B1). With a plain `brief-<user>-<date>` key, the RPC then genuinely coalesces double-tabs.
- **Completed-brief skip in `briefWorker.ts`** (right after the stale-date guard): if today's brief is `completed` and `options.forceRegenerate !== true`, mark the job completed and return. One change makes the entire system idempotent per (user, date): the later cron job becomes a free no-op, stalled retries stop double-spending, B5's blind spots stop mattering.
- In `/queue/brief`: when `add_queue_job` returns an existing future-scheduled job and the request was immediate, **promote it** (`UPDATE queue_jobs SET scheduled_for=now() WHERE id=? AND status='pending'`) and merge `notificationScheduledFor` into its metadata (B3).
- Codify the `queue_jobs` dedup partial unique index + `add_queue_job` in a repo migration (currently prod-only, unreproducible).

**Explicit decisions needed (DJ):**

- Should app-open generation respect `user_brief_preferences.is_active=false`? Recommendation: still generate (the user is present and looking), but never schedule notifications for them.
- `forceRegenerate` stays the only path that bypasses the completed-brief skip (regenerate button keeps working, cancel-first + unique key semantics unchanged).

---

## 3. Goal 2 — Brief quality (data + prompts)

Corroborated against DJ's real 2026-07-06 brief: exec brief says _"hard 7:29 PM deadline… start with IG Post 5 (Charli XCX)"_ while the Day Hook says _"📭 Clear day — no tasks scheduled"_ and `## Start Here` lists three different tasks; "Overdue Tasks (50)" shows 5 names; a goal dated Dec 2024 surfaces as "552 days overdue" and the heuristic turns it into priority action #4 ("Address goal: …").

**Factual correction to the E2E doc:** per-project primary model is `deepseek/deepseek-v4-flash` (qwen3.7-plus is fallback) — `PROJECT_BRIEF_MODELS`, `ontologyBriefGenerator.ts:63`. The `model_policy: 'active_experiment_only'` metadata label (:555) is stale.

### 3.1 Structural findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q1  | **`executive_summary` column stores the entire assembled markdown** (all sections + every project brief). Email and dashboard consume the wall. 15–25 projects ⇒ 3,500–6,000 words.                                                                                                                                                                                                                                               | `ontologyBriefGenerator.ts:1405`; `:971-976`                                                       |
| Q2  | **Two competing "Start Here"s:** the exec-summary LLM produces its own start-here verdict; `extractPriorityActions` (:981-1023) separately emits a title-sort heuristic (no verb, no why; emits "Address goal: X" filler). They disagree in the live sample.                                                                                                                                                                      | `ontologyBriefGenerator.ts:731-743, 981-1023`                                                      |
| Q3  | **Exec summary sees 3 of N projects**, each truncated to 2,000 chars — and since `### Next Steps` is last in the project template, truncation preferentially amputates the next actions. Calendar context capped at 2+2 items.                                                                                                                                                                                                    | `ontologyPrompts.ts:520, 542-548, 86-87`                                                           |
| Q4  | **Prompt-inclusion score ignores overdue, goals-at-risk, and calendar** (`today×3 + blocked×2 + upcoming + recentlyUpdated`) — duplicated in two places that can drift. A project with 5 overdue tasks and a goal due in 3 days can be excluded from all global passes.                                                                                                                                                           | `ontologyBriefGenerator.ts:1184-1196`; `ontologyPrompts.ts:334-347`                                |
| Q5  | **`llm_analysis` (2,000-token daily 'quality' call) is rendered nowhere** — not in assembly, not in standard email, mapped-but-unused in the dashboard widget. Its prompt also says "don't repeat the executive summary" — which it is never shown.                                                                                                                                                                               | `ontologyBriefGenerator.ts:1325-1331`; `ontologyPrompts.ts:170`; `DashboardBriefWidget.svelte:160` |
| Q6  | **Project prompt is self-defeating:** "under 220 words" + a mandatory 7-heading skeleton; zero anti-filler rules (the exec prompt has them; the N-times-a-day cheap-model prompt doesn't); demands a per-project `### Calendar` that duplicates the global calendar section; instructs staleness judgment on a next-step whose timestamp it never receives; prints a bare `## This Week (N tasks)` header with no tasks under it. | `ontologyPrompts.ts:572-594, 674, 735-741`                                                         |
| Q7  | **No task in any prompt carries a date or description.** `formatTaskForPrompt` emits title+priority+work-mode only; the `onto_tasks` select omits `description`. Models reason over bare titles; "Overdue" has no how-overdue.                                                                                                                                                                                                    | `ontologyPrompts.ts:52-58`; `ontologyBriefDataLoader.ts:1824-1831`                                 |
| Q8  | **Zero day-to-day continuity:** yesterday's brief / `priority_actions` are never loaded. No "you said you'd do X — still open."                                                                                                                                                                                                                                                                                                   | (missing query)                                                                                    |
| Q9  | One task can appear in **5 places** (Start Here, Calendar synthetic, Attention Required, Work Mode, Project Details).                                                                                                                                                                                                                                                                                                             | assembly                                                                                           |

### 3.2 Correctness bugs

| #   | Bug                                                                                                                                                                                                                                                                                                                                            | Where                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Q10 | **Cancelled tasks nag as Overdue forever** — task query filters only `deleted_at`/`archived_at`; `categorizeTasks` branches only on done/blocked.                                                                                                                                                                                              | `ontologyBriefDataLoader.ts:1829-1831, 938`                         |
| Q11 | Blocked task due today double-buckets into `todaysTasks`/`overdueTasks` AND `blockedTasks` (upcoming branch excludes blocked; the today/overdue branches don't).                                                                                                                                                                               | `ontologyBriefDataLoader.ts:938-968`                                |
| Q12 | **Milestone due date dropped** (`nextMilestone?.title` only) — the deadline the feature exists for never renders.                                                                                                                                                                                                                              | `ontologyBriefDataLoader.ts:2657`                                   |
| Q13 | `recentlyCompleted` keys on `updated_at` — an old done task edited yesterday shows as a "Recent Win."                                                                                                                                                                                                                                          | `ontologyBriefDataLoader.ts:938-941`                                |
| Q14 | Dateless in-progress tasks vanish from every surface after 7 quiet days (only reachable via `recentlyUpdated`); the computed `inProgressTasks` bucket is discarded.                                                                                                                                                                            | `ontologyBriefDataLoader.ts:1046`                                   |
| Q15 | Goal task-progress (`calculateGoalProgress`) computed then discarded — "3/7 tasks done toward X" never appears. Also unused: `calculatePlanProgress`, `tasksByPlan`, `taskDependencies` (count only), risks' probability/content, requirements' priority, goals' description. **`projectNextStepGenerator.ts` is dead code** (self-test only). | `ontologyBriefDataLoader.ts:1170, 1250, 1987-1995`                  |
| Q16 | Exec summary temp 0.7 is too hot for a factual verdict (this is where cheerleading enters); its user prompt opens with a 12-line Quick Stats block that contradicts the system prompt's "lead with the verdict, not the data."                                                                                                                 | `ontologyBriefGenerator.ts` call site; `ontologyPrompts.ts:462-473` |

### 3.3 Ranked quality recommendations

1. **Cap `## Project Details` to the top-5 signal projects** (reuse the selection list); one status line + link each for the rest. (Q1 — biggest single win, ~20 LOC.)
2. **Make priority actions LLM-judged:** extend the exec call to JSON `{summary, priorityActions:[{action, project, why}]}`, keep the heuristic as fallback. Kills the dueling Start Heres. (Q2)
3. **Add dates/overdue-age + description to task serialization.** (Q7)
4. **Load yesterday's `priority_actions` + completion status** → "Yesterday's plan: X — done / still open" block in the exec prompt. One indexed query. (Q8)
5. **Fix bucketing:** exclude `cancelled`; dedupe blocked out of today/overdue; surface `in_progress` (+ "stale in flight ≥7d") as its own section. (Q10, Q11, Q14)
6. Milestone dates: `"${title} — due ${date} (${n}d)"`. (Q12)
7. **Fix the inclusion score** (add overdue×3, goalsAtRisk×3, calendarToday×2; unify the two copies) and raise the exec slice 3→5. (Q3, Q4)
8. **Rewrite the project prompt:** 3 sections max (Status verdict / What changed / Do this next + time estimate), anti-filler rules, no calendar restating, Next Steps FIRST so truncation can't eat it. (Q6)
9. **Merge exec-summary + analysis into one JSON call** (halves global spend, fixes the unfollowable rule) and actually render the analysis (email insight block or widget) — or stop paying for it. (Q5)
10. Exec temp 0.7 → ~0.4; replace the Quick Stats block with named overdue/blocked tasks + day's calendar shape. (Q16) Plus: delete dead code from Q15.

---

## 4. Goal 3 — Email correctness + re-engagement

### 4.1 Correctness

| #   | Finding                                                                                                                                                                                                                                                                            | Where                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E1  | **Retry can double-send:** adapter creates a fresh `emails` row + tracking ID per attempt; webhook has no idempotency key — if attempt 1 delivered but the response was lost, attempt 2 re-sends. Code comments admit it. Prod data shows consecutive-day same-subject sends (§1). | `emailAdapter.ts:503-544`; `notificationWorker.ts:972-1021`; webhook `+server.ts:134` |
| E2  | **Subject-date latent off-by-one:** `new Date('yyyy-MM-dd').toLocaleDateString(...)` — UTC-midnight parse formatted in _server_ tz with no `timeZone` option. Fix: `timeZone:'UTC'`.                                                                                               | `emailAdapter.ts:337-344, 432-437`                                                    |
| E3  | **Gmail clip risk:** full-brief emails (39KB markdown → larger HTML) exceed Gmail's ~102KB clip → tracking pixel and unsubscribe/footer links (bottom) get clipped for exactly the heaviest users; no "view in app" link at top.                                                   | `emailAdapter.ts:353-367`                                                             |
| E4  | **Open redirect:** click-tracking endpoint 302s to any unvalidated `?url=`. Also: all in-brief relative links only work _because_ tracking rewrites them through build-os.com.                                                                                                     | `email-tracking/[tracking_id]/click/+server.ts:198`                                   |
| E5  | CAN-SPAM: no physical postal address in any footer. Unsubscribe itself is genuinely good (RFC 8058 one-click; kills email+SMS+generation; writes `email_suppressions` — which the brief path never reads, FYI).                                                                    | `email-service.ts:490-517`; `unsubscribe/+server.ts:90-196`                           |
| E6  | `emails.from_email` recorded as `noreply@build-os.com`; actual sends are `dj@build-os.com`. Footer `?briefDate=` fallback drops a raw un-encoded ISO timestamp.                                                                                                                    | `emailAdapter.ts:507, 283-286, 361`                                                   |
| E7  | **SMS pipeline dead but lying:** `notification_deliveries` marks sms "sent" while all 195 `sms_messages` ever are `queued`/`pending` (Twilio send parked). Either fix the send or stop creating sms deliveries + stop marking sent.                                                | `smsWorker.ts` / prod data                                                            |
| E8  | Onboarding email opt-in **silently fails**: `NotificationsStepV3.svelte` PUT can 400 (brief-prefs row not yet created) and the error is swallowed — users who checked "email me" were never subscribed, never told. The mirror-image of annoyance: zero emails.                    | `NotificationsStepV3.svelte:41-48`; `notification-preferences/+server.ts:132-151`     |

### 4.2 Annoyance

- With backoff **off**, an inactive opted-in user gets the full wall daily forever — nothing detects non-opens or bounces (no bounce webhook at all). With backoff **on** (current prod), frequency is handled, but the content is still the full wall.
- New-user defaults are safely opt-in for delivery (`20260205_001`), **but generation defaults on** — `api/brief-preferences` GET lazily creates `is_active: true, 09:00`. Combined with re-engagement generation, this is why LLM spend continues for users who receive nothing.
- **Missing the one real annoyance guard:** auto-suppress after N consecutive unopened sends (data already in `email_recipients.opened_at`).

### 4.3 Re-engagement — why "idk if it's working" is currently unanswerable, and what the data says anyway

- **It IS enabled in prod** (repo config never mentions `ENGAGEMENT_BACKOFF_ENABLED`; it must be hand-set in Railway — add it to `.env.example` + docs). Evidence: 14 `isReengagement` briefs in 30 days; only ~1 standard brief/day (backoff correctly skipping dormant users).
- **But it cannot work as deployed**, because generation ≠ delivery:
    - The Jun-11 dormant wave generated 12 briefs for users 227–326 days away → their email prefs are opt-out-default false → **near-zero emails**; SMS never sends (E7); in-app requires the login they're not doing. **LLM cost with no reachable channel.**
    - All 17 emails in 60 days were standard-stage to DJ. The re-engagement copy (which is decent — coach-tone reengagement, plain dormant "return or turn off" with no guilt-trip) has effectively **never reached a real user**.
- **Exact-day gates confirmed** (`=== 4`, `=== 14` at `briefBackoffCalculator.ts:292-349`): one missed evaluation (downtime, deploy, weekly-frequency user) forfeits the touch; first contact can slip to ~day 92–104.
- **Content risks when it does fire:** reengagement prompt has no user name ("Hey there!" slop risk), no no-heading rule, no don't-invent-links rule (dormant variant has one); dormant prompt injects raw ISO timestamps; LLM-failure fallback emails generic metric bullets; empty `llm_analysis` falls back to the full-wall `executive_summary` — the exact email the tier was designed to avoid. `emailAdapter.ts:43-55`; `ontologyPrompts.ts:764-825`.
- **No measurement loop:** nothing joins "reengagement email sent" → "user returned within N days." Admin analytics show channel-level open rate only; no stage breakdown; no PostHog events on open/click.

### 4.4 Recommended sequence (measure → fix gates → reach → redesign)

1. **[MEASURE] Build the readout first.** One SQL view + card on `/admin/notifications`: sends, open rate, click rate, and **7-day reactivation** (`users.last_visit > email.sent_at + <7d`) grouped by `engagement_stage`. Add PostHog `email_opened`/`email_clicked` in the tracking endpoints.
2. **[BUG] Window gates:** `>= 4 && lastBrief >= 2`, `>= 14 && lastBrief >= 10`; dormant recurrence ~45–60d instead of 90.
3. **[GAP] Reachability gate before generating:** skip re-engagement generation for users with no deliverable channel (email pref off AND no verified SMS). Stops the pure-waste LLM spend immediately.
4. **[BUG] E1 idempotency** (pass `deliveryId` as key; webhook checks before Gmail) + E2 `timeZone:'UTC'` + E5 postal address + E4 redirect validation + E6 bookkeeping.
5. **[DESIGN] Digest email:** exec summary + Start Here + counts, "View full brief →" at top; never the `## Project Details` dump. (Also fixes E3.)
6. **[GAP] Auto-suppress** after 3 consecutive unopened daily sends; warm-up on engagement (opened last touch → allow the next sooner).
7. **[BUG] E8 onboarding opt-in** — auto-create the brief-prefs row in the PUT path and surface failures. Every lost opt-in is a lost retention channel.
8. **[DESIGN] Then redesign the curve from data** — proposed: day ≥4 "what moved while you were gone" delta email; ≥10 one open loop (single project, single next step); ≥25 value-reminder; ≥60 the existing dormant choice email. Only worth doing after #1 exists.

---

## 5. Unified roadmap

**Tier 1 — Correctness + the app-open trigger (unblocks Goal 1, stops active waste):**

1. Completed-brief skip in `briefWorker.ts` (§2.3) — makes everything idempotent.
2. Remove the `forceRegenerate: true` hardcode + thread the flag (B1).
3. `/queue/brief`: promote future-scheduled dedup hits; accept `notificationScheduledFor` (B3/B7).
4. New `ensure-today` endpoint + widget call, gated on projects + `users.timezone` (§2.3).
5. Email idempotency (E1) + subject tz fix (E2).
6. Reachability gate on re-engagement generation (§4.4-3).

**Tier 2 — Brief quality (Goal 2):** items 1–8 of §3.3 (cap project details; LLM priority actions; task dates/descriptions; yesterday-continuity; bucketing fixes; milestone dates; inclusion score; project-prompt rewrite).

**Tier 3 — Email/re-engagement (Goal 3):** measurement readout; window gates; digest email; auto-suppress; onboarding opt-in fix; compliance trio; then the new curve.

**Housekeeping:** codify `add_queue_job` + dedup index in a migration; delete `projectNextStepGenerator.ts` and unused loader computations; fix stale `model_policy` label and the E2E doc's model claim; decide SMS's fate (E7); add `ENGAGEMENT_BACKOFF_ENABLED` to `.env.example`.

---

## 6. Appendix — race matrix (current behavior)

| Scenario                                          | Today's behavior                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-open 6am + cron 9am same date                 | Cron re-enqueues (completed job invisible to both guards) → **full LLM regeneration** at 9am; email already fired at 6am (B7); 9am emission swallowed by event dedup → no dup email, wrong send time.                                                    |
| Two tabs double-click                             | Both take the force path (B1) → unique keys → **two concurrent generations**, last writer wins on the brief row; email deduped at event level.                                                                                                           |
| App-open while cron job pending for 8:58am        | Plain-key request coalesces onto the 8:58 job with `scheduled_for` unchanged (B3) → user waits, no feedback. Current force-path client instead cancels the cron job → loses `notificationScheduledFor` → immediate email (B7).                           |
| Stalled-job retry (>5min between progress writes) | Job reset to pending while original worker still runs → **two concurrent generations**; completion token-fenced; cost/content race not.                                                                                                                  |
| Midnight boundary                                 | Explicit `briefDate` jobs are safe; a date-less job claimed after local midnight is **silently completed without generating** (`briefWorker.ts:90-100`). Widget computes "today" with browser-tz fallback → can disagree with worker's `users.timezone`. |

_Full agent findings preserved in this audit's source conversation; prod queries were read-only._
