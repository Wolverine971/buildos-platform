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
