<!-- apps/worker/docs/features/daily-briefs/DAILY_BRIEF_CLEANUP_PLAN_2026-07-06.md -->

# Daily Brief Cleanup Plan — 2026-07-06

> **Source audit:** `DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md` (finding IDs B1–B8, Q1–Q16, E1–E8 referenced throughout).
> **End state:** codebase is clean and idempotent so DJ can build the app-open auto-generation feature (Phase 3) on solid ground.
> **Product constraint (DJ, 2026-07-06):** frontend regeneration is a feature, not a bug. The explicit **Regenerate** button must keep working exactly as today (cancel in-flight + force a fresh brief). Only _implicit_ generations stop forcing.

---

## Verdict: one unified plan, three phases, parallel only after the foundation

**Why not independent workstreams from the start:** all three goals converge on the same load-bearing files (`briefWorker.ts`, `/queue/brief` in `apps/worker/src/index.ts`, `emailAdapter.ts`, the web brief-client chain). Quality and email work done before the idempotency fixes would be built on a system that can run two generations concurrently and double-send emails — every test you write would be verifying racy behavior.

**Why not one giant serial effort:** after Phase 1, the quality workstream (worker prompt/loader/generator files) and the email workstream (adapter/notification/web-admin files) are almost entirely disjoint. Running them as two parallel agent tracks is safe and halves the calendar time.

```
Phase 1 (serial-ish, land first)      Phase 2 (parallel tracks)         Phase 3 (DJ)
WP-1 worker idempotency  ──┐
WP-2 web force-flag fix  ──┼──►  WP-5..7  Quality track (worker)  ──┐
WP-3 /queue/brief upgrade ─┤     WP-8..11 Email track (worker+web) ─┼──► WP-12 app-open feature
WP-4 queue DDL migration ──┘                                        ┘
```

Rules of engagement for agents:

- One WP = one agent session = one commit (or small commit series). Don't mix WPs in a commit — several touch the same files across phases.
- Every WP ends with: `pnpm typecheck`, relevant `pnpm test:run` in `apps/worker` and/or `apps/web`, plus the WP's own acceptance checks.
- The repo has substantial unrelated uncommitted work (project-loops, admin chat-users). Agents must not stage/commit files outside their WP's file list.
- Prod DB queries in acceptance checks are **read-only**.

---

## Phase 1 — Single-flight foundation (fixes B1–B8; blocks everything else)

### Progress update — 2026-07-06

**Status:** Phase 1 is code-complete in the working tree and has passed focused local verification. It has **not** yet been validated against a fresh shadow DB or live queue acceptance scenario.

What was fixed:

- **WP-1 worker idempotency:** `briefWorker.ts` now checks `ontology_daily_briefs` after the stale-date guard. Non-forced jobs skip when a `(user, brief_date)` brief is already `completed`, or when a `processing` row has a fresh `<10 min` heartbeat. Skipped jobs are completed with `skipReason` metadata and return before `brief.completed` can be emitted again. Forced regeneration still bypasses the skip.
- **WP-2 web force semantics:** `railwayWorker.service.ts` no longer hardcodes `forceRegenerate: true`. `briefClient.service.ts` threads the caller's flag into Railway queueing, and `isBriefGenerating` now matches `pending` or `processing` jobs by `metadata.briefDate` instead of `scheduled_for` UTC date.
- **WP-3 queue scheduling:** `/queue/brief` now normalizes `forceImmediate`/`forceRegenerate`, computes `notificationScheduledFor` from `user_brief_preferences.time_of_day` + `users.timezone` for non-forced immediate requests, and promotes future pending dedup hits to run now while preserving the notification schedule.
- **WP-4 queue DDL/RPC:** added `supabase/migrations/20260706000000_codify_queue_job_dedup.sql` to codify the active `dedup_key` partial unique index and updated `add_queue_job` to retry once if the conflict row disappears between insert and fallback select. Mirrored the RPC body in `packages/shared-types/src/functions/add_queue_job.sql`.
- **Hardening from review:** preferred-send-time conversion now uses an explicit local timestamp before `fromZonedTime`, so it is independent of the Node process timezone. Worker booleans are strict `=== true`, so stringy `"false"` cannot force regeneration or immediate promotion.

Verification run:

- `pnpm --filter @buildos/worker test:run tests/briefNotificationSchedule.test.ts tests/briefDateGuard.test.ts tests/briefWorker.stale.test.ts`
- `TZ=UTC pnpm --filter @buildos/worker test:run tests/briefNotificationSchedule.test.ts`
- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/web typecheck`
- `git diff --check`

Still to verify before calling Phase 1 fully landed:

- Apply the new migration on a fresh shadow DB.
- Run `pnpm gen:all` after isolating this work from unrelated generated/doc changes already present in the worktree.
- Run live queue acceptance: duplicate non-forced generate requests should coalesce to one `generate_daily_brief` job and one `brief.completed`; forced regenerate should still cancel/recreate and produce a fresh brief.
- Verify on-demand generate before preferred send time creates a notification scheduled for the preferred time, while after preferred time sends immediately.

**Current position:** the codebase is ready for Phase 1 DB/queue acceptance. Once that passes, Phase 2A quality work and Phase 2B email work can start in parallel; Phase 3 app-open auto-generation can then build on the single-flight behavior.

### Review pass — 2026-07-06 (PM)

Three adversarial review agents + prod data checks ran over commits `3a728402`/`a98218b1`/`d0b417d4`. All verified defects were fixed in the working tree the same day:

**Fixed (worker):**

- Fresh-processing skip could permanently swallow a retry of a dead generation (timeout/stall → retry sees zombie heartbeat → skipped → brief stuck `processing`, job terminally completed). Retries (`attemptsMade > 0`) now bypass the fresh-processing skip; completed briefs still skip but the skip path now **re-emits `brief.completed`** (dedup-safe via the event-level lock) so a brief persisted by a dead attempt still notifies.
- `mergeQueueMetadata` let explicitly-`undefined` request keys erase a pending job's `notificationScheduledFor`/options on promote-on-dedup — undefined-valued keys are now stripped before merge.
- Unset `notificationScheduledFor` meant "notify immediately," contradicting the WP-12 decision for `is_active=false` users — `/queue/brief` now sets `options.suppressNotification` for them; `briefWorker` skips `brief.completed`/`brief.failed` emission when set.
- `20260706000000` index-detection now asserts a single-column index on exactly `(dedup_key)` (a multi-column index with a matching predicate would have passed the text check and broken `ON CONFLICT` at runtime).
- Email adapter/webhook idempotency lookups switched from unindexed `.contains(template_data)` to `template_data->>delivery_id` (expression index added in `20260706020000`).
- Standard + fallback email content now strips `## Project Details` (stop-gap until WP-11's real digest; prevents Gmail 102KB clipping that hides the unsubscribe link/pixel).

**Fixed (web):**

- **SECURITY:** `daily_brief_engagement_weekly_metrics` was granted to `authenticated` AND readable via the **anon** key through PostgREST (verified live). `20260706020000` revokes anon/authenticated → service_role only; the admin endpoint now reads via `createAdminSupabaseClient()`. ⚠️ The revoke must be applied to prod immediately (see below).
- 7-day reactivation metric was computed from mutable `users.last_visit` (decays over time). Rewritten to append-only signals (`chat_sessions`, `user_activity_logs`) + `last_visit` as additive fallback, with a 400-day floor.
- `ensure-today` project gate didn't match the generator's criteria (`planning|active`, not deleted/archived, actor OR user OR membership access) — users with only done/archived projects would have churned failed jobs on every app open. Also added a 30-min cooldown before auto-retrying a `failed` brief (`skipped_recent_failure` state).
- Non-forced Generate on `/briefs` could attach to a future-parked cron job and poll to timeout — `briefClient` now falls through to the worker POST (which dedup-hits and promotes) when the existing job is pending >60s in the future.
- Widget adopts the server-resolved timezone from the ensure response so `todayDate` can't drift from the ensured brief when `users.timezone` is null.
- Webhook: dropped `.strict()` (deploy-order 422s between Railway/Vercel), added an atomic claim (`status='sending'` conditional UPDATE, 5-min reclaim, `failed` reset on send error) closing the concurrent double-send window.
- Tracking pixel/click endpoints: PostHog captures are now collected and flushed concurrently before the response instead of one awaited round-trip per recipient.
- Tests: retry-bypass + suppress + re-emit cases (worker); tz day-boundary, failure-cooldown, webhook positive/claim-conflict paths, click allowed-path (web). All green; both apps typecheck.

**Still open (not defects — unimplemented plan scope):** WP-7 (project-details cap in the stored brief, LLM-judged priority actions, prompt rewrite), WP-10 (backoff window gates + reachability gate + auto-suppress), WP-11 real digest email ("View full brief" at top), E8 onboarding opt-in fix, WP-2's `isBriefGenerating` still can't see jobs whose metadata lacks `briefDate` (legacy rows only).

**Prod actions required (DJ):**

1. **Now:** run `supabase/migrations/20260706020000_secure_daily_brief_engagement_metrics.sql` against prod (dashboard SQL editor or `supabase db push`) — the metrics view is currently readable by anyone with the anon key.
2. Apply `20260706000000`'s updated detection only matters for fresh/shadow DBs (prod already has the index + RPC).
3. Verify the live queue acceptance list above (unchanged).

---

## Follow-ups — canonical list as of 2026-07-06 EOD

### P0 — do first (DJ-only actions)

- [ ] **Apply `20260706020000_secure_daily_brief_engagement_metrics.sql` to prod.** The engagement view is live and anon-readable RIGHT NOW (verified via anon-key read). Dashboard SQL editor or `supabase db push`. Everything in the file is safe to run on a DB that already has the 010000 view.
- [ ] **Commit + deploy the review-fix working tree** (worker + web + 1 migration + tests; all brief/email-scoped). Deploy order no longer matters (webhook `.strict()` removed), but both Vercel and Railway need the new code. Watch the first Railway build — `d0b417d4` also switched nixpacks to node 22 / pnpm 11.
- [ ] **Set `PRIVATE_POSTAL_ADDRESS` in Vercel + Railway env.** The CAN-SPAM footer renders empty until it's set (code ships fine without it).

### P1 — post-deploy validation (agent-runnable, ~1 session)

- [ ] Live queue acceptance: (a) two rapid non-forced Generates coalesce to ONE `generate_daily_brief` job; (b) Regenerate button still cancels + recreates; (c) on-demand generate before preferred send time → `send_notification` job `scheduled_for` = preferred time, email arrives once at that time; (d) a second same-day job for the same brief date (cron or manual, non-forced) completes with `skipped_existing_brief`, its re-emit dedupes, and no second email is delivered.
- [ ] Confirm the consecutive-day duplicate emails stop: re-run the audit §1 email query after ~5–7 days (same-subject emails on adjacent days should no longer appear).
- [ ] App-open flow in prod: open dashboard on a fresh day → brief generates once, widget attaches; check `queue_jobs.metadata` for `skipped_*` reasons distribution and confirm no failed-job churn from projectless/archived-only users.
- [ ] Fresh shadow-DB apply of `20260706000000` + `20260706020000`, then `pnpm gen:all` (the new view will enter generated types; the admin endpoint's `as any` casts can then be removed).
- [ ] Check the new `/admin/notifications` daily-brief engagement card once ~a week of data exists, and confirm PostHog `email_opened`/`email_clicked` events are flowing (fold into the existing PostHog check-back due 2026-07-08→15).

### P2 — remaining plan scope (dispatch as WPs)

- [ ] **WP-7 (quality, biggest lever):** the stored brief is still the 39KB wall. Cap `## Project Details` to top-5 signal projects, LLM-judged priority actions (kills the dueling Start Heres), merge exec+analysis into one JSON call, project-prompt rewrite (3 sections, Next Steps first, anti-filler). Data prerequisites (WP-5/6) are already shipped.
- [ ] **WP-10 (re-engagement repair):** window gates (`>=4 && lastBrief>=2`, `>=14 && lastBrief>=10`, dormant ~45–60d), **reachability gate** before generating for dormant users (no deliverable channel → skip generation entirely), auto-suppress after 3 consecutive unopened sends, add `ENGAGEMENT_BACKOFF_ENABLED` to `apps/worker/.env.example` + flags table (it is ON in prod, hand-set in Railway).
- [ ] **WP-11 (digest email):** proper digest (exec summary + Start Here + counts + "View full brief →" AT THE TOP). Current stop-gap only strips `## Project Details` from the email body. Best done after WP-7 so it can consume structured priority actions.
- [ ] **E8 (onboarding opt-in):** `NotificationsStepV3.svelte` swallows the 400 when the brief-prefs row doesn't exist yet — auto-create the row in the `notification-preferences` PUT and surface failures. Every silently-lost opt-in is a lost retention channel.
- [ ] **SMS honesty:** decide — stop creating `sms` `notification_deliveries` for brief events while the Twilio send is parked (they're currently marked "sent" while all 195 `sms_messages` ever sit queued/pending), or revive the SMS worker (see worker-flow-audit 2026-07-01).

### P3 — small deferred items (batch into any nearby session)

- [ ] `isBriefGenerating` can't see legacy queue jobs whose `metadata` lacks `briefDate` (all new paths set it; only pre-deploy rows affected — self-ages out).
- [ ] Pin the fresh-window invariant: non-prod `stalledTimeout` (120s) < `FRESH_PROCESSING_BRIEF_WINDOW_MS` (10min) — retry-bypass now defuses the swallow, but add a test/derivation (`freshWindow ≈ stalledTimeout + margin`) so the constants can't drift dangerously in prod.
- [ ] Data hygiene: orphaned `emails` rows with `status='scheduled'` from pre-fix retry attempts (harmless; optional cleanup query). Also `emails.status` on some legacy sent rows still says `scheduled`.
- [ ] Docs refresh: `DAILY_BRIEF_GENERATION_END_TO_END.md` still carries stale claims in places (qwen-primary model note in §8.4/§14.3, "backoff default off" framing, §14.4 dead-code note now that `projectNextStepGenerator` is deleted) — sweep it against the shipped code.
- [ ] Deferred review nits: emailAdapter webhook `fetch` has no timeout/AbortSignal (slow Vercel response holds the notification job toward the 5-min stall window); view join casts (`::TEXT`) prevent index use on `chat_sessions.user_id` — fine at current scale.

### Later — from the original audit, unscheduled

- [ ] Re-engagement content polish when WP-10 lands: reengagement prompt gets user first name, no-heading + no-invented-links rules; dormant prompt formats raw ISO dates before injection.
- [ ] Quality backlog beyond WP-7: yesterday-continuity is shipped (WP-6) but §3.3 items 9–10 (render or drop `llm_analysis`; exec temp 0.4; In-Flight/stale-task section rendering in assembly) remain.
- [ ] Re-engagement curve redesign (§4.4-8) — only after the measurement card has real data.

### WP-1: Completed-brief skip in the worker (B2) — **do this first**

**Goal:** generation becomes idempotent per (user, brief_date). This one change neutralizes the 6am/9am cron regeneration, stalled-retry double-spend, and most scheduler-guard blind spots (B5, B6).

- `apps/worker/src/workers/brief/briefWorker.ts` (~after the stale-date guard at :84-100): if `ontology_daily_briefs` has `generation_status='completed'` for (userId, validatedBriefDate) **and** `options.forceRegenerate !== true` → mark the queue job completed with a `skipped_existing_brief` metadata reason, do **not** emit `brief.completed` again, return.
- Also treat a `processing` row with fresh heartbeat (`updated_at` < ~10 min old) as in-flight → skip the same way; a stale `processing` row (>10 min) proceeds (recovers crashed generations).
- Extend `briefDateGuard.ts` or add a sibling helper so the decision is unit-testable like `getStaleBriefJobDecision`.
- **Tests:** new cases alongside `apps/worker/tests/briefWorker.stale.test.ts` — completed→skip, completed+force→generate, fresh-processing→skip, stale-processing→generate.
- **Acceptance:** enqueue two jobs for the same (user, date) with the second non-forced → exactly one generation, one `brief.completed` emission; forced second job regenerates.
- Suggested agent: worker-side implementer. No dependencies.

### WP-2: Make `forceRegenerate` honest in the web client (B1, B4)

**Goal:** Regenerate button keeps force semantics; every other UI path stops forcing so the queue dedup key does its job.

- `apps/web/src/lib/services/railwayWorker.service.ts:106` — delete the hardcoded `forceRegenerate: true`; accept it as a real parameter.
- `apps/web/src/lib/services/briefClient.service.ts` (`startStreamingGeneration` → `startRailwayGeneration` :230-254) — thread the caller's flag end-to-end.
- Callers to verify/set explicitly:
    - `DashboardBriefWidget.svelte` `generateBrief()` (:192) → `false` (first-time generate CTA);
    - `/briefs/+page.svelte` `generateDailyBrief()` (:430) → `false` for "Generate", `true` only for an explicit regenerate affordance;
    - `DailyBriefModal.svelte` (:341) → keeps `true` (this IS the regenerate feature).
- Fix `isBriefGenerating` (`railwayWorker.service.ts:265-293`): include `pending` jobs, and compare the job's `metadata.briefDate` (not the UTC date of `scheduled_for`) to the requested date. This makes the "resume existing generation" path in `briefClient.service.ts:124-145` actually engage.
- UX note: when a non-forced request coalesces onto an existing job, the API returns the existing job id — the widget should attach to it (realtime progress), not show an error.
- **Acceptance:** two rapid clicks / two tabs on "Generate" → one `generate_daily_brief` job in `queue_jobs` (dedup key `brief-<user>-<date>`), both tabs show progress. Regenerate button → cancels in-flight and produces a fresh brief (unchanged behavior).
- Depends on: WP-1 (so the coalesced/second path is provably safe). Parallel-safe with WP-3 (different app).

### WP-3: `/queue/brief` scheduling semantics (B3, B7)

**Goal:** on-demand generation stops hijacking the day's notification schedule, and immediate requests aren't silently parked behind a future-scheduled job.

- `apps/worker/src/index.ts:165-297`:
    1. **Promote-on-dedup:** when `queue.add` returns an existing job (dedup hit) whose `scheduled_for` is in the future and the request has `forceImmediate: true` → `UPDATE queue_jobs SET scheduled_for = now() WHERE id = ? AND status = 'pending'`, merging request metadata (esp. `notificationScheduledFor`) into the job's metadata.
    2. **Compute `notificationScheduledFor` on the on-demand path:** read `user_brief_preferences.time_of_day` + `users.timezone`; if the user's preferred send time for `briefDate` is still in the future, pass it through to the job payload (same field the scheduler sets at `scheduler.ts:116`). If it's already past (or prefs `is_active=false`), leave it unset → immediate delivery, as today.
- `apps/worker/src/workers/brief/briefWorker.ts:283-334` already honors `notificationScheduledFor` — verify, no change expected.
- Note the event-dedup interplay (`emit_notification_event.sql:53-70`): with WP-1's "skip without re-emitting," a completed on-demand brief at 6am now emits once **scheduled for 9am** — the cron no-op doesn't emit at all. This is the desired end state: early generation, on-time email.
- **Tests:** unit-test the preferred-time computation (timezone-sensitive; reuse patterns from `scheduler.ts` tests if present).
- **Acceptance:** on-demand generate at T with pref time T+3h → `send_notification` job `scheduled_for ≈ T+3h`. On-demand generate after pref time → immediate. Immediate request colliding with a pending 8:58am job → job runs now.
- Depends on: WP-1 conceptually; parallel-safe with WP-2.

### WP-4: Codify queue DDL in the repo (housekeeping from §2.4)

- Dump `add_queue_job` + the `queue_jobs` partial unique index (`dedup_key WHERE status IN ('pending','processing')`) from prod; add as a no-op-in-prod migration in `supabase/migrations/` and mirror in `packages/shared-types/src/functions/add_queue_job.sql`.
- Optional (small): fix the RPC TOCTOU (B8) — on the NULL/NULL race, retry the insert once instead of raising.
- **Acceptance:** migration applies cleanly on a fresh shadow DB; `pnpm gen:all` clean.
- No dependencies; can run any time. Good `fast-executor` task.

---

## Phase 2A — Quality track (worker only; parallel with 2B)

Ordered so data fixes land before the prompts that consume them.

### Progress update — 2026-07-06

**Status:** WP-5 and WP-6 are code-complete in the working tree and passed focused local verification. WP-7 is still pending and should remain a separate focused pass because it changes prompt contracts, JSON assembly, and rendered brief shape.

What was fixed:

- **WP-5 bucketing/data cleanup:** `categorizeTasks` now treats `done`, `cancelled`, and `archived` as terminal for active scheduling buckets; cancelled/archived tasks are filtered at the task query; blocked tasks are kept out of today/overdue/upcoming/work-mode buckets; `recentlyCompleted` prefers `completed_at` with `updated_at` fallback; `inProgressTasks` and `staleInProgressTasks` are surfaced in `briefData`; project milestones render with due date + day distance; `projectNextStepGenerator.ts`, its self-test, `calculatePlanProgress`, `tasksByPlan`, and `goalAlignedTasks` were removed.
- **WP-5 doc/model cleanup:** project brief metadata now records `model_policy: 'project_brief_model_order'` plus the primary model, and `DAILY_BRIEF_GENERATION_END_TO_END.md` now states `deepseek/deepseek-v4-flash` is primary with qwen as fallback.
- **WP-6 richer prompt inputs:** task prompt lines now include due/start dates, overdue age, work mode, priority, project context, and a one-line description snippet; `onto_tasks` selects `description` and `completed_at`; goal formatting now includes task progress like `3/7 tasks done`.
- **WP-6 continuity and ranking:** yesterday's `priority_actions` are loaded for `(user, brief_date - 1)`, matched best-effort against current task titles, and passed into the executive prompt as done/still-open/unknown continuity; project prompt inclusion score is centralized and now weights overdue tasks, goals at risk, and today's calendar; executive/global prompt context now uses the top 5 scored project briefs and full visible today calendar + 5 upcoming items.

Verification run:

- `pnpm --filter @buildos/worker test:run tests/ontologyPrompts.test.ts tests/ontologyBriefDataLoader.test.ts tests/ontologyBriefGeneratorDecision.test.ts`
- `pnpm --filter @buildos/worker typecheck`
- `git diff --check` on the touched Phase 2A files

Second-pass review notes:

- No code bugs were found in the follow-up review pass.
- Remaining risk is output quality, not type safety: WP-7 still needs the prompt/assembly rewrite and ideally 2–3 forced regeneration spot checks before Phase 2A is called complete.

### WP-5: Bucketing + data correctness (Q10–Q14, Q15 cleanup)

- Exclude `cancelled` (and any other terminal `state_key`s — align with `isTaskCompleteOrCancelled` at `ontologyBriefDataLoader.ts:427`) from overdue/today/upcoming buckets (`:938-968`, or filter at the query `:1829-1831`).
- Dedupe blocked tasks out of `todaysTasks`/`overdueTasks` (keep them only in `blockedTasks`).
- Milestone: carry `due_at` through — render `"<title> — due <date> (<n>d)"` (`:2657`).
- `recentlyCompleted`: use `completed_at` if the column exists, else keep `updated_at` but label honestly ("recently touched wins").
- Surface `inProgressTasks` (`:1046`) into `briefData` + a "stale in flight ≥7 days" derivation.
- Delete dead code: `projectNextStepGenerator.ts` + its test, `calculatePlanProgress`, unused `tasksByPlan`/`goalAlignedTasks`; fix stale `model_policy: 'active_experiment_only'` label (`ontologyBriefGenerator.ts:555`); correct the model claim in `DAILY_BRIEF_GENERATION_END_TO_END.md` §8.4/§14.3 (primary = deepseek-v4-flash).
- **Tests:** extend `apps/worker/tests/ontologyBriefDataLoader.test.ts` for every bucket change.
- Depends on: Phase 1 landed (idempotent reruns make verification sane).

### WP-6: Richer prompt inputs (Q3, Q4, Q7, Q8)

- `formatTaskForPrompt` (`ontologyPrompts.ts:52-58`): append due/start with overdue-age (`(due Jul 3 — 3d overdue)`), include a 1-line description snippet; add `description` to the `onto_tasks` select (`ontologyBriefDataLoader.ts:1824-1831`).
- **Yesterday continuity:** load prior `ontology_daily_briefs.priority_actions` for (user, date−1); check which referenced tasks are now done; feed exec prompt a `Yesterday's plan:` block. One indexed query.
- Fix the prompt-inclusion score: add `overdue×3 + goalsAtRisk×3 + calendarToday×2`; **unify the duplicated implementations** (`ontologyBriefGenerator.ts:1184-1196` and `ontologyPrompts.ts:334-347`) into one exported function.
- Exec summary: slice 3→5 project briefs (`ontologyPrompts.ts:520, :542`); raise per-brief truncation sensibly; calendar context 2+2 → today's full list + 5 upcoming.
- Wire goal task-progress (`calculateGoalProgress`, loader `:1170`) into `formatGoalProgress` ("3/7 tasks done").
- **Tests:** `apps/worker/tests/ontologyPrompts.test.ts`.
- Depends on: WP-5 (buckets it serializes).

### WP-7: Prompt rewrite + assembly (Q1, Q2, Q5, Q6, Q9, Q16)

The judgment-heavy WP — use the strongest agent; consider `pnpm test:llm` spot checks.

- **Project prompt** (`ontologyPrompts.ts:572-594, 731-745`): 3 sections max (Status verdict / What changed / Do this next + rough time estimate), Next Steps FIRST in the template (truncation-proof), anti-filler rules ported from the exec prompt, drop the per-project `### Calendar` requirement (global section owns calendar), remove the bare `## This Week (N)` header bug (`:674`), drop the unfollowable staleness instruction or pass `next_step_updated_at`.
- **Merge exec-summary + analysis into one JSON 'quality' call** returning `{summary, dayHook, priorityActions:[{action, project, why}], analysis}` (`ontologyBriefGenerator.ts:1237-1341`). Temp ~0.4. Keep `extractPriorityActions` as deterministic fallback. Kills the dueling Start Heres (Q2) and the never-rendered spend (Q5). Replace the Quick Stats block (`ontologyPrompts.ts:462-473`) with named overdue/blocked tasks + calendar shape.
- **Assembly** (`generateMainBriefMarkdown`, `:687`): cap `## Project Details` to the top-5 signal projects (one status line + link for the rest); each task appears in at most 2 sections; suppress the repeated `📭 No active tasks` fallback padding (`:367`).
- Reengagement prompt polish (feeds 2B's email work): pass user first name, add no-heading + no-invented-links rules, format dates before injection (`ontologyPrompts.ts:764-825, :876`).
- **Acceptance:** regenerate DJ's brief (force path) → total markdown for a 27-project account lands well under ~8K chars; one Start Here; no self-contradiction between exec brief and day hook (spot-check 2–3 generations).
- Depends on: WP-6.

---

## Phase 2B — Email track (worker + web; parallel with 2A)

### Progress update — 2026-07-06

**Status:** WP-8 and WP-9 are code-complete in the working tree and passed focused local verification. WP-10 and WP-11 remain separate follow-up passes because they change scheduler/backoff behavior, SMS delivery truthfulness, onboarding preference writes, and the standard daily-brief email shape.

What was fixed:

- **WP-8 send-path correctness:** `emailAdapter.ts` now looks up an existing `emails` row by `template_data.delivery_id`, reuses that row and tracking id across retry attempts, and returns success without calling the webhook again when the delivery already has a sent/delivered/opened/clicked email. The web notification-email webhook now performs the same sent-row check before Gmail, so a timeout-after-send retry should not double-send.
- **WP-8 email bookkeeping/compliance:** daily brief subject date formatting now uses `timeZone: 'UTC'`; click redirects are limited to relative app paths or the configured `PUBLIC_APP_URL` origin; daily brief fallback links URL-encode `briefDate`; notification emails record the real sender (`dj@build-os.com` / `DJ from BuildOS`); and worker/web email footers read `PRIVATE_POSTAL_ADDRESS` so the required physical-address value can be supplied without blocking code.
- **WP-8 click route correction:** the click tracking route no longer selects or updates `email_recipients.clicked_at` because that column does not exist in the current schema. It determines first-click status from prior `email_tracking_events` rows and still updates `notification_deliveries.clicked_at`, which does exist.
- **WP-9 measurement readout:** added `supabase/migrations/20260706010000_daily_brief_engagement_metrics.sql`, which creates `daily_brief_engagement_weekly_metrics` with weekly sends, opens, clicks, open/click rates, and 7-day reactivation by `engagement_stage`.
- **WP-9 admin surface:** `/api/admin/notifications/analytics/daily-brief-engagement` reads the new view, `notification-analytics.service.ts` exposes it, and `/admin/notifications` now shows a Daily Brief Engagement card/table for the selected timeframe.
- **WP-9 instrumentation/dimensions:** open and click tracking endpoints now emit server-side PostHog `email_opened` / `email_clicked` events. The worker persists `engagement_stage` into `notification_deliveries.payload`, and passes `brief_id`, `brief_date`, and `engagement_stage` through the webhook so `emails.template_data` keeps the reporting dimension after the web send update.

Verification run:

- `pnpm --filter @buildos/web test:run src/lib/services/email-service.test.ts src/routes/api/webhooks/send-notification-email/server.test.ts 'src/routes/api/email-tracking/[tracking_id]/click/server.test.ts'`
- `pnpm --filter @buildos/worker test:run tests/queueContracts.test.ts`
- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/web typecheck`
- `git diff --check` on the touched Phase 2B files
- Static check for the migration regression: no remaining `er.clicked_at` / `recipient.clicked_at` references in the daily-brief metrics migration or click endpoint; recipient-level clicks are derived from `email_tracking_events`.

Still to verify before calling WP-8/WP-9 fully landed:

- Apply `20260706010000_daily_brief_engagement_metrics.sql` against a fresh/shadow DB and prod. The first attempt failed on `er.clicked_at`; the migration has since been corrected to use `email_tracking_events` plus `notification_deliveries.clicked_at`.
- Run `pnpm gen:all` after the migration is applied and after isolating unrelated generated-file churn already present in the worktree.
- Live webhook acceptance: simulate a Gmail-success/webhook-timeout retry and confirm the retry returns the existing sent email without a second Gmail send.
- Prod readout acceptance: query the new view for the last 60 days and confirm standard-stage sends/open/click numbers are sane against the audit baseline.
- Configure the real `PRIVATE_POSTAL_ADDRESS` value in web + worker environments; the code currently ships an env stub, not the final business address.

**Current position:** the email track has the corrected send-path foundation and measurement loop needed before changing the re-engagement curve. The next Phase 2B work should be WP-10 (backoff windows, reachability, unopened suppression, SMS honesty, env/docs flag cleanup) followed by WP-11 (digest email and onboarding opt-in fix).

### WP-8: Send-path correctness (E1, E2, E4, E5, E6)

- **Idempotency (E1):** pass `deliveryId` from `emailAdapter.ts` to the webhook; webhook (`/api/webhooks/send-notification-email/+server.ts`) checks for an existing **sent** email for that delivery before calling Gmail; adapter reuses (not recreates) its `emails` row across retry attempts (`emailAdapter.ts:503-544`).
- Subject dates: `timeZone: 'UTC'` in both `toLocaleDateString` calls (`emailAdapter.ts:337-344, 432-437`).
- Validate click-redirect destination — relative paths or `PUBLIC_APP_URL` origin only (`email-tracking/[tracking_id]/click/+server.ts:198`).
- Physical postal address in footers (`emailAdapter.ts:353-367`; `email-service.ts:490-517`). **[DJ input: which address — registered agent / PO box?]** Stub with a `PRIVATE_POSTAL_ADDRESS` env so code can land first.
- Bookkeeping: record the real from-address (`emailAdapter.ts:507`); URL-encode the `?briefDate=` fallback (`:283-286`).
- **Acceptance:** simulate webhook timeout-after-send → retry does **not** produce a second Gmail send; then re-run the §1 prod query pattern for a week to confirm consecutive-day duplicates stop.
- Depends on: nothing in 2A. Start immediately after Phase 1.

### WP-9: Measurement readout (the "is it working" answer)

- SQL view (migration): per `engagement_stage` — sends, open rate, click rate, **7-day reactivation** (`users.last_visit > email sent_at` within 7d), by week.
- Admin card on `/admin/notifications` reading the view (channel analytics endpoint pattern: `api/admin/notifications/analytics/overview/+server.ts:70-84`).
- PostHog `email_opened` / `email_clicked` capture in the two tracking endpoints.
- Persist `engagement_stage` consistently into `emails.template_data` + `notification_deliveries.payload` so the view has its dimension (adapter `:521` writes it — verify it survives to prod rows; recent prod rows lack the key).
- **Acceptance:** view returns sane numbers against prod for the last 60 days (17 standard emails, ~59% open, 0 clicks).
- No dependencies. Ships the highest-value item for goal 3.

### WP-10: Backoff repair + reachability (fixes the void-shouting)

- Window gates (`briefBackoffCalculator.ts:292-349`): `>= 4 && lastBrief >= 2` (reengagement-1), `>= 14 && lastBrief >= 10` (reengagement-2), dormant `>= 60 && lastBrief >= 45`. Update `apps/worker/tests/briefBackoffCalculator.test.ts` tiers + spec doc.
- **Reachability gate:** in the scheduler's backoff batch (`scheduler.ts:652`) — before enqueuing a re-engagement/dormant generation, require at least one deliverable channel: (`should_email_daily_brief` && active `brief.completed` subscription) OR (verified, opted-in SMS **once SMS actually sends**). No channel → skip generation entirely (log a `no_reachable_channel` counter). Stops the pure-waste LLM spend.
- Auto-suppress: skip email delivery after 3 consecutive unopened daily-brief sends (data: `email_recipients.opened_at`); reset on any open/click/login. Implement as a check in the backoff/scheduler layer, not deep in the adapter.
- Add `ENGAGEMENT_BACKOFF_ENABLED` to `apps/worker/.env.example` + flags table in the E2E doc, noting it is **ON in prod** (hand-set in Railway).
- **SMS honesty (E7) — decision default:** stop creating `sms` `notification_deliveries` for brief events while the Twilio send is parked (config flag), so deliveries stop lying. Re-enable when the SMS worker is revived (separate effort; see worker-flow-audit).
- Depends on: WP-9 ideally first (measure before changing the curve), but code-wise independent.

### WP-11: Digest email + opt-in fix (E3, E8, part of Q1's payoff)

- **Digest email:** standard brief email = exec summary + Start Here (priority actions) + counts row + **"View full brief →" link at the top**; never `## Project Details`. Reengagement/dormant keep `llm_analysis` — but fix the fallback chain (`emailAdapter.ts:43-55`) so an empty `llm_analysis` falls back to the digest, never the full wall.
- Works with today's fields; gets better automatically when WP-7's JSON priority actions land. If WP-7 has landed, consume its structured output directly.
- **Onboarding opt-in (E8):** `notification-preferences` PUT auto-creates the `user_brief_preferences` row if missing (`+server.ts:132-151`); `NotificationsStepV3.svelte:41-48` surfaces failure instead of swallowing it.
- **Acceptance:** standard email HTML < 50KB for a 27-project account; unsubscribe + pixel never clipped; fresh-user onboarding with "email me" checked → prefs row + subscription row + next brief emails.
- Depends on: WP-8 (same adapter file — sequence within the email track to avoid conflicts).

---

## Phase 3 — The feature: auto-generate on app open (DJ builds this)

Everything below is now safe because Phase 1 made generation idempotent and non-force by default.

### Progress update — 2026-07-06

**Status:** WP-12 is code-complete locally for the dashboard entry point and has passed focused web verification. It has not yet been validated against a live worker/queue acceptance scenario.

What was implemented:

- Added authenticated `POST /api/daily-briefs/ensure-today` in the web app. It resolves `today` from `users.timezone`, returns a completed brief immediately, reuses a running processing job, skips accounts with no existing ontology actor or no visible projects, and otherwise queues the worker with `{ briefDate, forceRegenerate: false, forceImmediate: true, options: { useOntology: true } }`.
- Added `/api/daily-briefs/ensure-today` to the consumption-billing AI-compute guard list so frozen-account handling applies before an implicit app-open generation can spend compute.
- Wired `DashboardBriefWidget.initializeWidget()` to call `ensure-today` only after `fetchTodaysBrief()` finds no completed brief. Returned queued/processing jobs are attached through `BriefClientService.monitorQueuedGeneration()` without changing the explicit Generate/Regenerate paths.
- Preserved WP-3's promotion behavior: pending jobs are posted back through worker `/queue/brief` so future scheduled dedup hits can be promoted to run now; only completed briefs and processing jobs short-circuit in the web route.

Verification run:

- `pnpm --filter @buildos/web test:run src/routes/api/daily-briefs/ensure-today/server.test.ts`
- `pnpm --filter @buildos/web typecheck`
- `git diff --check`

Still to verify before calling Phase 3 fully landed:

- Live app-open acceptance: first dashboard open on a new user-local day queues exactly one `generate_daily_brief` job and the widget shows progress.
- Refresh/open a second tab mid-generation attaches to the existing job and does not restart generation.
- App-open when a future cron job is already pending promotes that job to run now while preserving the worker-computed `notificationScheduledFor`.
- App-open after cron already completed returns the completed brief without queueing.
- Explicit Regenerate still cancels/recreates and forces a fresh brief.
- Scheduled email still arrives once at the preferred time for early app-open generation.

**Spec (WP-12):**

- New `POST /api/daily-briefs/ensure-today` (web, authenticated; consumption-billing guard applies):
    1. `today` from `users.timezone` (never browser tz).
    2. Look up `ontology_daily_briefs` for (user, today): `completed` → return it; `processing` fresh → return job ref; else →
    3. Skip if user has no projects (reuse `hasAnyProjects()` from `+page.server.ts:14-48`) or no ontology actor.
    4. POST worker `/queue/brief` `{ briefDate: today, forceRegenerate: false, forceImmediate: true }` — WP-3 makes the worker compute `notificationScheduledFor`, so the scheduled email still arrives at the preferred time even though generation ran early.
- Call site: `DashboardBriefWidget.initializeWidget()` (`:102`) after `fetchTodaysBrief()` returns null → call ensure-today, attach realtime progress to the returned job. Optionally also from `/briefs` page load.
- Decision (default): generate even when `user_brief_preferences.is_active=false` (user is present, looking at the widget), but such users get no scheduled notifications (already true — the scheduler ignores them and `notificationScheduledFor` stays unset only if prefs inactive).
- Duplicate-safety recap: dashboard open in two tabs → ensure-today races → both POST → RPC dedup coalesces (plain key) → WP-1 guard backstops even a completed-vs-inflight race. Cron later that day → no-op.
- **Acceptance:** open app on a new day → brief generates once, widget shows live progress; refresh mid-generation → attaches, doesn't restart; open after cron already generated → instant render, no job; Regenerate button still forces a fresh one; email arrives at preferred time, once.

---

## Suggested tasking order

| Day   | Run                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------- |
| 1     | WP-1 (first), then WP-2 ∥ WP-3 ∥ WP-4                                                          |
| 2     | Kick both tracks: WP-5 (quality) ∥ WP-8 (email) ∥ WP-9 (measurement — independent, high value) |
| 3+    | WP-6 → WP-7 (quality) ∥ WP-10 → WP-11 (email)                                                  |
| after | WP-12 (DJ) — the app-open feature                                                              |

Agent-type guidance: WP-4, WP-5 mechanics, E6 bookkeeping → fast/mechanical agents. WP-7 (prompt rewrite) and WP-10 (curve/reachability) → strongest agent, they're judgment-heavy. Everything else → standard implementer.

**Open DJ decisions (defaults chosen so no WP is blocked):** postal address value (WP-8, env-stubbed); SMS deliveries paused vs SMS worker revived (WP-10, default pause); regenerate affordance on `/briefs` page vs modal-only (WP-2, default: modal keeps it, page "Generate" is non-force).
