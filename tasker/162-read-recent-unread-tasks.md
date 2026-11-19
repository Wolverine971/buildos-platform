<!-- tasker/162-read-recent-unread-tasks.md -->

# 162 — Read recent tasks the people reader never saw (active accounts only)

**Status:** OPEN · **Opened:** 2026-11-17 · **Parent:** 160
**DJ (2026-11-17):** only look at recent tasks created within the past few months, for active
accounts. "I don't want to just try to enrich a bunch of data that doesn't mean anything."

## Facts (2026-11-17)

- DJ: 631 tasks; 289 read by the people reader (`onto_task_entity_state`), 342 never read.
- Free dry run: `pnpm exec tsx apps/worker/scripts/task-entities-run.ts --user-email <email>`
  listed 624 tasks, "estimated ≤ $0.312" (an upper bound; already-read text is skipped without a
  model call). Last measured real cost ≈ $0.00015/task (236 tasks = $0.0365), fast profile
  (DeepSeek V4 Flash first).
- New tasks are already read on write (trigger → `extract_task_entities`), and that job now
  syncs people/orgs into the knowledge graph. So this is a one-time catch-up.

## Work

1. **Define "active account"** from real data and write it down here: suggested = signed in
   or created/updated a project, task, doc or chat in the last 30 days. Count how many users that is.
2. **Define "recent":** task `created_at` within the last 3 months (flag `--created-since`).
   Count tasks per active user that are never read, or read by an older extractor version.
3. **Script filters:** add `--active-only` and `--created-since` to
   `apps/worker/scripts/task-entities-run.ts` (it already has `--all`, `--updated-since`,
   `--max-usd`, `--concurrency`). Dry run prints users, task count, and a realistic estimate
   (count × measured per-task cost), not only the cap.
4. **Paid run needs DJ's explicit OK each time** (AGENTS.md). First DJ only, then all active
   accounts, each with `--max-usd`. Then confirm the knowledge entries appear (the extract job syncs them).

## Done when

- Dry run numbers reported to DJ; DJ approves; live run done under the cap; spend reported from
  `llm_usage` (task_entity_extraction); new knowledge entries counted.

## 2026-11-17 PM: active accounts defined, filters built, dry runs (free)

**Active account** (`apps/worker/src/lib/active-accounts.ts`, shared with tasker 165): in the last
30 days the user opened BuildOS signed in (`users.last_visit`, written at most every 6 h), signed
in (auth `last_sign_in_at`, covers the phone app), sent a chat message
(`chat_sessions.last_message_at`), or created a project, task or document. Accounts pending
deletion or restricted never count. Record `updated_at` is not a signal on purpose: outline,
digest and next-step jobs rewrite rows of people who have not been back in months.

Production today: 130 users; 7 visited in the last 30 days (14 in 60, 19 in 90); all signals
together = 8, minus 1 pending deletion = **7 active accounts**. Only 2 of them created tasks in
the last 3 months (DJ + one other).

**Script:** `task-entities-run.ts` now takes `--active-only` and `--created-since <ISO|3mo|90d>`.
Either flag = catch-up mode: every matching task (no default `--limit`), archived skipped, only
text the current extractor (v5) has not read kept (never read / text changed / older version /
failed), per-user counts, realistic estimate (× $0.00015 measured) next to the upper bound and cap.

| Dry run (free)                                        | Recent tasks            | To read                                   | Realistic | Upper bound |
| ----------------------------------------------------- | ----------------------- | ----------------------------------------- | --------- | ----------- |
| `--all --active-only --created-since 3mo`             | DJ 195, other account 7 | **3** (DJ: 1 old version, 2 failed)       | ≈ $0.0005 | $0.002      |
| `--user-email <DJ> --active-only --created-since 3mo` | 195                     | 3                                         | ≈ $0.0005 | $0.002      |
| for scale: `--all --active-only --created-since 6mo`  | DJ 350, other 18        | 122 (75 never, 45 old version, 2 failed)  | ≈ $0.018  | $0.061      |
| for scale: DJ, all time                               | 624                     | 382 (335 never, 45 old version, 2 failed) | ≈ $0.057  | $0.191      |

Finding: the trigger has read every task written since 2026-10-07, so the 342 never-read tasks
are almost all older than 3 months. Under DJ's 3-month rule this tracker is a ~$0.0005 run.
Fork for DJ: 3 months (3 tasks) vs 6 months (122 tasks, ≈ $0.02) vs all time (382, ≈ $0.06).

Next (needs DJ's OK, paid):
`TASK_ENTITIES_LIVE=1 pnpm exec tsx scripts/task-entities-run.ts --all --active-only --created-since 3mo --live --max-usd 0.05`

## 2026-11-17 evening: LIVE (DJ approved 6 months)

`--all --active-only --created-since 6mo --live --max-usd 0.10`: 122 tasks, $0.0121 (≈ $0.0001/task,
DeepSeek V4 Flash). Done.
