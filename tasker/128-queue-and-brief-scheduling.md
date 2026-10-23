<!-- tasker/128-queue-and-brief-scheduling.md -->

# 128 — Queue and brief scheduling hardening

**Status:** CHECKED by Claude 2026-10-18 — passes; bounded-grace follow-up moved to tracker 137 · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

A hung database call can no longer freeze all job claiming for 5 minutes. A timed-out job can no longer run twice at once. Daily briefs can no longer be generated twice for the same day. Logs say whether a brief was immediate or scheduled.

## Files you own

- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/src/scheduler.ts`
- apps/worker/src/worker.ts (the brief label only; tasker 134 edits it later)
- apps/worker/src/workers/chat/checkpoint/\* (only to pass `job.signal` into the LLM calls)
- apps/worker/eslint.config.mjs, apps/worker/tests/setup.ts, apps/worker/tests/generalWorkerApp.test.ts (lint chore only)
- the test files next to these

## Work, in this order

1. [x] **No request timeout on worker Supabase client; hung claim wedges all claiming**
    - Size S · now at `apps/worker/src/lib/supabaseQueue.ts:507`
    - What goes wrong: A claim_pending_jobs fetch that hangs keeps isClaiming=true (supabaseQueue.ts:483), so no job types are claimed until undici's 300 s default timeout; /health reports poll_loop_stalled but Railway's healthcheck is deploy-time only, so nothing restarts it.
    - Fix: Add .abortSignal(AbortSignal.timeout(30_000)) to the claim, heartbeat and complete RPCs; no global fetch timeout.
    - Regression test: `apps/worker/tests/supabaseQueueRefill.test.ts`
2. [x] **Worker timeout frees the slot while signal-ignoring processors keep running**
    - Size M · now at `apps/worker/src/lib/supabaseQueue.ts:852`
    - What goes wrong: withWorkerTimeout rejects and fail_queue_job requeues, but processors that never read job.signal (checkpoint capture, notification, snapshot, embeddings, OCR, classification) keep executing; the retry runs concurrently -> duplicate side effects and >batchSize real concurrency. Checkpoint capture (multi-LLM) is the realistic case; its updated_at conflict check mitigates START HERE double-writes.
    - Fix: Keep the slot occupied until the original processor settles (or a bounded grace), and pass job.signal into checkpoint-capture LLM calls.
    - Regression test: `apps/worker/tests/supabaseQueueRefill.test.ts`
3. [x] **Brief backfill uses timestamped dedup keys and checkAndScheduleBriefs has no in-flight guard**
    - Size S · now at `apps/worker/src/scheduler.ts:274`
    - What goes wrong: Missed-run backfills compute delay<60s -> 'immediate' path -> cancelBriefJobsForDate + dedupKey with Date.now(); startup kick (line 483) overlapping the hourly cron (or 2 replicas) can enqueue two generations for the same date; only the worker's fresh-processing skip prevents double LLM spend.
    - Fix: In-flight promise guard on checkAndScheduleBriefs; stable brief-${userId}-${briefDate} dedup key for scheduler briefs and no cancelBriefJobsForDate. Note: the 'immediate' path also fires daily for prefs set 1-3 min past the hour.
    - Regression test: `apps/worker/tests/briefScheduleIdempotency.test.ts`
4. [x] **IMMEDIATE/SCHEDULED brief log label is always SCHEDULED**
    - Size S · now at `apps/worker/src/worker.ts:87`
    - What goes wrong: Reads job.data.priority, which no producer sets (priority lives on the queue row), so immediate briefs are logged as scheduled; misleads debugging.
    - Fix: Pass the claimed row's priority through ProcessingJob and read job.priority.
    - Regression test: none (log only)
5. [x] **Worker test lint debt (chore)**
    - `apps/worker/tests/generalWorkerApp.test.ts:100` has `RequestInit` no-undef, and `apps/worker/tests/setup.ts` is outside the eslint TS project (parsing error). Fix both so `pnpm --filter @buildos/worker exec eslint tests/generalWorkerApp.test.ts tests/setup.ts` is clean. The worker `lint` script itself only covers `src`; don't widen it.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each bug, confirm it still happens in the current code (line numbers drift). If it doesn't, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Route meaning through a structured channel: a tool argument, a Jev or turn-contract field, a `type_key`, a UI action.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql`, and **do not apply**. DJ applies.
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueRefill.test.ts tests/briefScheduleIdempotency.test.ts tests/generalWorkerApp.test.ts tests/queueContracts.test.ts`
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter @buildos/worker run lint`

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test next to one. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each fix, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text. No paid calls. No migration applied.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. Files changed.
3. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
4. Anything DJ must do (none expected).

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

### Completion report — 2026-10-18

1. Work items (each confirmed in current code before its fix):
    - **DONE — request deadlines:** claim, heartbeat update, and every completion attempt now use `AbortSignal.timeout(30_000)`, with no global fetch timeout.
    - **DONE — timeout ownership:** abort at the worker deadline, retain the slot and heartbeat until the original processor settles, then apply failure/retry handling. Late resolution and rejection cannot overlap a retry. Both checkpoint LLM operations receive `job.signal` through the existing ports.
    - **DONE — brief admission:** overlapping scheduler checks share one in-flight promise; every automatic brief uses `brief-${userId}-${briefDate}` and never cancels another brief job.
    - **DONE — brief label:** claimed queue-row priority reaches `ProcessingJob` and the brief log reads `job.priority`. Nullable row priorities remain supported; legacy manually constructed jobs may omit priority.
    - **DONE — test lint:** setup uses the existing syntax-only test lint configuration, and the HTTP test derives its request options type from `fetch`. The worker lint script still covers only `src`.

2. Files changed (all within owned runtime/config files, their tests, and this required tracker):
    - `apps/worker/src/lib/supabaseQueue.ts`
    - `apps/worker/src/scheduler.ts`
    - `apps/worker/src/worker.ts` — brief label only
    - `apps/worker/src/workers/chat/checkpoint/checkpointJob.ts`
    - `apps/worker/src/workers/chat/checkpoint/checkpointLlm.ts`
    - `apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts`
    - `apps/worker/eslint.config.mjs`
    - `apps/worker/tests/supabaseQueueRefill.test.ts`
    - `apps/worker/tests/briefScheduleIdempotency.test.ts`
    - `apps/worker/tests/generalWorkerApp.test.ts`
    - `apps/worker/tests/supabaseQueueDrain.test.ts` — abortable RPC mock compatibility
    - `apps/worker/tests/supabaseQueueErrorClassification.test.ts` — abortable RPC mock compatibility
    - `apps/worker/tests/queueHealthAndAlerts.test.ts` — abortable RPC mock compatibility
    - `apps/worker/tests/agenticChatSafetyPolling.test.ts` — abortable RPC mock compatibility
    - `apps/worker/tests/agenticChatConsumer.test.ts` — abortable RPC mock compatibility
    - `tasker/128-queue-and-brief-scheduling.md`

3. Commands and results (final checks ran serially through `test-gate`; no gate refusal):

    | Command                                                                                                                                                                                                                                     | Result                                                                                                                                                                                                                                     |
    | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
    | `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueRefill.test.ts`                                                                                                                                                           | Request regression: **3 failed / 4 passed**, then **7 passed**. Timeout/signal regression: **3 failed / 7 passed**, then **10 passed**. Priority propagation assertion: **1 failed / 9 passed**, then passed in the required combined run. |
    | `pnpm --filter @buildos/worker exec vitest run tests/briefScheduleIdempotency.test.ts`                                                                                                                                                      | **6 failed / 14 passed** before the fix, then **20 passed**.                                                                                                                                                                               |
    | `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueRefill.test.ts tests/briefScheduleIdempotency.test.ts tests/generalWorkerApp.test.ts tests/queueContracts.test.ts`                                                        | **61 passed, 0 failed; 4 files passed.** Initial sandbox run: 57 passed / 4 failed because localhost listen returned EPERM; approved unsandboxed rerun passed.                                                                             |
    | `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueDrain.test.ts tests/supabaseQueueErrorClassification.test.ts tests/queueHealthAndAlerts.test.ts tests/agenticChatSafetyPolling.test.ts tests/agenticChatConsumer.test.ts` | **54 passed, 0 failed; 5 files passed.**                                                                                                                                                                                                   |
    | `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                               | **PASS, 0 errors.** Initial run caught the nullable queue-row priority; corrected before rerunning.                                                                                                                                        |
    | `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                         | **PASS, 0/0 errors at baseline.** Initial run caught the same nullable priority and passed after correction.                                                                                                                               |
    | `pnpm --filter @buildos/worker run lint`                                                                                                                                                                                                    | **PASS, 0 errors, 1 existing `sort-imports` warning in `src/workers/agentic-chat/turn/turn-executor.ts`; HTTP module guard passed with 0 violations.** That unowned file was left alone.                                                   |
    | `pnpm --filter @buildos/worker exec eslint tests/generalWorkerApp.test.ts tests/setup.ts`                                                                                                                                                   | **2 errors / 0 warnings** before the chore; **PASS, 0 errors / 0 warnings** afterward.                                                                                                                                                     |
    | `git diff --check -- <owned changed files>`                                                                                                                                                                                                 | **PASS.**                                                                                                                                                                                                                                  |
    | `git status --porcelain` and full owned-diff review                                                                                                                                                                                         | **PASS.** Other agents' changes were left untouched; branch remains `main`.                                                                                                                                                                |

    I saw every bug-regression test/assertion fail before its corresponding fix and pass afterward. The future scheduled-brief and failed-scan recovery cases are additional preservation checks and already passed before the scheduler fix.

    Skeptical review / additional edge cases:
    - **Request deadlines:** all three completion attempts get a fresh deadline; exhausted completion RPCs do not requeue already-successful processor work. Heartbeat abort clears its in-flight guard, and a later successful claim restores queue health. Covered by fake-time tests.
    - **Timeout ownership:** late rejection is consumed, the original timeout remains the reported failure, heartbeat continues during settlement, and measured processor concurrency stays at one across retry. Existing shutdown/drain and processor-managed lifecycle tests pass. Deliberate tradeoff: a processor that never settles continues occupying its slot until process shutdown; no grace expiry requeues work that is still executing.
    - **Brief admission:** checks cover the 1–3 minute past-hour window, the 60-second priority boundary, generation before local midnight, stale preflight reads, and releasing the in-flight guard after a database failure. Existing terminal/recovery idempotency tests still pass.
    - **Brief label:** priority comes from the row even without a metadata priority; null/omitted priority takes the scheduled branch (reviewed), and row-priority propagation is tested.
    - **Lint:** setup still participates in `typecheck:tests`; syntax-only lint does not remove type validation or widen the source lint command.

4. DJ action: **none**. Ready for Claude's light check. No paid or live model calls, no production database writes, no migrations created/applied, no deployments, no new language regex/keyword matching, and no commit.

## Blocked

- (none yet)

## Log

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Codex completed all five items with failing-first regressions, 61 required tests and 54 queue compatibility tests passing, both typechecks clean, targeted test lint clean, and worker lint passing with one pre-existing warning. Self-check and full owned-diff review complete; awaiting Claude check.
- 2026-10-18 (Claude, during the 125–127 check): the new `.abortSignal(...)` on queue RPCs broke `apps/worker/tests/agenticChatShutdownDrain.test.ts` (2 tests timed out: its `rpc` mock had no `.abortSignal`). Claude applied the same mock wrapper used in `supabaseQueueDrain.test.ts`; 9 worker files (97 tests) pass. The 128 light check itself has not been done yet.
- 2026-10-18 (Claude light check of 126–135): items 1 and 3–5 OK. Item 2 waits with no limit after a timeout; the bounded grace moved to tracker 137 item 3. Every queue test mock now supports `.abortSignal`.
