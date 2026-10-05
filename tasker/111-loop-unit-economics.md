<!-- tasker/111-loop-unit-economics.md -->

# Tasker 111: Unit economics of project loops and stewards

> **Audit 2026-10-04 — PARKED.** The free fixes shipped in `bd45c65b8` (09-28); deployed, migration
> applied. All-user spend was $1.43 per 14 days, so the rest saves cents. **Left:** per-lens
> acceptance (112's "Not needed" reasons feed it), 107's audit-timeout check, the snapshot
> double-enqueue, and the digest pass (the pulse reconciler). **Priority:** P3. **Recommend:** park.

**Status:** Rules adopted by DJ 2026-09-28 ("ok yes this is good, do it"). Free fixes DONE: activity migration APPLIED to prod + recorded; worker and client code UNCOMMITTED/undeployed. · **Opened:** 2026-09-27 ·
**Related:** `docs/research/project-pulse-unification-2026-09-27.md`, tasker 108 (activity gate),
tasker 110 (stewards)

**Owner ask (DJ, 2026-09-27):** "I'm very concerned about unit economics … I want to be hella
strategic about when these loops run … I don't want to be wasting API calls checking things a ton of
times, wasting compute, and reanalyzing the same stuff over and over." And on stewards: "the agent
gets updated as a side effect when the project gets updated."

## Measured (production, read-only, 2026-09-27)

**LLM spend, last 14 days, all users (5):** $1.43 total.

| Bucket                                                                                                  | USD             | Share |
| ------------------------------------------------------------------------------------------------------- | --------------- | ----- |
| Chat (worker stream + Jev tool selection + context finder)                                              | ~$0.99          | 69%   |
| Project loops (drift, brief, doc organization, outdated docs, task conflicts, drift finder, task pairs) | $0.173          | 12%   |
| `other` (untagged)                                                                                      | $0.196          | 14%   |
| Daily brief (per project + summary + analysis)                                                          | $0.034          | 2%    |
| Chat capture (START HERE synthesis + Thinking log)                                                      | $0.017          | 1%    |
| Project audit / freshness radar                                                                         | $0.010 / $0.008 | 1%    |

**Re-analysis waste (loop runs whose project had no ledger rows and no user chat messages since
that project's previous run), last 30 days:**

| Window                 | Trigger    | Runs | Unchanged | USD    | USD on unchanged |
| ---------------------- | ---------- | ---- | --------- | ------ | ---------------- |
| Before gate (to 09-25) | end_of_day | 56   | 37 (66%)  | $0.264 | $0.173           |
| After gate (09-26 on)  | end_of_day | 5    | 1         | $0.042 | $0.011           |
| After gate             | scheduled  | 2    | 2         | $0.006 | $0.006           |

The activity gate (tasker 108) removed most of it. What's left:

- **Scheduled runs don't pass the gate.** Their trigger is `scheduled` (`auditEnqueue.ts:611`).
- **The gate reads `updated_at`,** which machine writes also bump. For example, the snapshot job
  does a blind update of START HERE on chat close (`start-here.service.ts:347`). Whether this wakes
  loops is unverified: `updated_at` keeps only the latest value.
- **Each loop run fans out to about 5 separate LLM lens calls over the same changes,** and the
  daily brief makes another per-project call over the same 24 hours. That makes 86 brief calls in
  14 days.
- **`other` is 14% of all spend with no owner.** Tag it before optimizing anything else.

## Stewards cost nothing in the background (checked)

The steward is a side effect of project state, with no job of its own:

- **Live Facts** is computed from records when context loads. There is no LLM involved. The context
  is invalidated by triggers on 12 project tables plus the steward profile, so every change shows up
  on the next message.
- **Narration (START HERE)** is updated by chat capture, which already runs and is already paid for.
- **The charter** changes only through DJ's approve click.

Steward chat costs the same as classic chat. On 9takes the prompt is 22.1K characters, against about
22.5K for the classic prompt. **Drop tasker 110's "step 4" (a narration refresh loop).** A story
refresh happens only when someone chats: pay on read.

The known gap: changes made outside chat (Codex, the app) reach Live Facts right away, but reach the
story only after the next chat. The prompt already flags documents that changed after START HERE.

## Proposed policy (for DJ's veto)

1. **Never analyze an unchanged project.** Gate every loop trigger (end of day, scheduled, burst,
   audit) on meaningful ledger rows since that consumer's last run. Exclude machine writes (snapshot,
   capture, the loop's own writes, steward controls). No `updated_at` heuristics.
2. **Analyze each change once.** One per-project pass produces a digest that the lenses, the daily
   brief, and the audit all reuse, instead of about 6 separate LLM reads of the same rows.
3. **Pay for proactive analysis only when someone will read it.** Skip generating a new review while
   the last one sits unread and nothing new happened. Dormant projects (not opened in 14 days) get at
   most a weekly check.
4. **Deterministic first.** Facts, counts, overdue, and staleness come from code, which is free. The
   LLM is only for judgment.
5. **Measure per active user per month:** spend by tier, runs skipped by gate, and suggestions acted
   on vs dismissed. Value per dollar decides which lenses survive.

## Done 2026-09-28 (free fixes)

- **Activity signal reads the ledger** (`supabase/migrations/20260928000000_project_loop_activity_ledger.sql`,
  APPLIED to prod and recorded; live with no deploy, because the worker already calls the RPC).
    - `project_loop_activity` now counts change-ledger rows (excluding steward control rows) plus user
      chat messages, instead of `updated_at`.
    - On prod data over 30 days: 48 "active" projects → 16. Every one of the 32 dropped was a machine
      write:
        - 31 projects' documents bumped in the same minute (2026-09-04 02:09 UTC);
        - 3 tasks in 3 projects updated in the same microsecond (a batch job);
        - project-row bumps.
    - 36 h and 7 d windows: the new signal flags no project the old one missed.
    - Rehearsal and role probe passed (grants unchanged).
- **Unfrozen projects** (`apps/worker/src/workers/project-loop/enqueue.ts`).
    - The unresolved-brief gate now asks "recorded work since the brief?" via `project_loop_activity`
      instead of `project_review_signals` (1 row ever).
    - 21 projects had a brief waiting; 8 have real changes since. Expect at most about 8 extra reviews,
      then each waits again.
- **Audit no longer doubles the nightly loop.**
    - The scheduled complete-audit scan moved from 04:00 to 03:00 UTC (`apps/worker/src/scheduler.ts`),
      an hour before Eastern midnight, so the light loop sees the audit as its last review.
    - `queueProjectAuditFromWorker` records `skipped_active_run` when a non-stale loop run is queued or
      running (`hasActiveProjectLoopRun`), so an audit never reviews the same changes a loop is
      reviewing. Stuck runs (running over 1 h, queued over 6 h) don't block it.
- **Untagged spend can't recur.**
    - `operation_type = 'other'` was the daily brief's two Gemini calls. They were tagged
      (`daily_brief_executive_summary` / `daily_brief_analysis`) and moved to GPT-6 Luna on 09-25/26; no
      `other` rows since 09-26.
    - One of them had max_tokens 600 with ~576 reasoning tokens, so it paid for ~110-char truncated
      output. Fixed by the same switch (1,500 now).
    - `operationType` is now required in `@buildos/smart-llm` option types and in the web
      `openrouter-v2-service` `generateText` overload. Every existing caller already passed it:
      svelte-check reports 0 errors and the worker typecheck is clean.
- **Checks:**
    - worker project-loop, audit and scheduler tests 184/184, plus a new
      `tests/projectAuditEnqueueActiveRun.test.ts` and updated `projectLoopEnqueueGate.test.ts`;
    - smart-llm 242/242;
    - web openrouter-v2 61/61;
    - worker typecheck clean; web check 0 errors; eslint 0 errors.
- **Not changed:** failed runs (242 all-time). None since 09-24, and they recorded no cost.

## Next (free unless noted)

- [x] Tag the `other` spend (done: already tagged 09-25/26; now required by type).
- [x] Stop the scheduled audit from doubling the nightly loop (active-run check + 03:00 UTC).
- [x] Replace the `updated_at` activity signal with the ledger (migration applied).
- [ ] Commit + deploy worker and web (pathspec; `enqueue.ts` may carry other trackers' hunks, so check `git diff` first).
- [ ] Merge snapshot double-enqueue on chat close (close route + classifier both queue it).
- [ ] Measure suggestion acceptance per lens (which lenses earn their cost).
- [ ] Design the single per-project digest pass (a migration and a paid test; needs DJ's OK).

## Absorbed from 107 — Tasker 107 — Project Loop brief quality (false findings, wrong next action, missed drift) (2026-10-04)

107 was deleted in the 2026-10-04 tasker cleanup. Its audit verdict, including the residual now owned here:

**Audit 2026-10-04 — SUPERSEDED.** Lean `7552426f7` and ambitious `313507777` both shipped and
are deployed. 112 then replaced the manager-brief call with its roll-up and passed acceptance
(`fbc7b79fa`), so the book re-run is moot. **Left:** one free `llm_usage_logs` check that
`project_audit_synthesis` stopped timing out (move to 111). **Priority:** none.
**Recommend:** close & delete.
