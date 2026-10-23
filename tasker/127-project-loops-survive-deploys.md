<!-- tasker/127-project-loops-survive-deploys.md -->

# 127 — Project loops and audits survive deploys

**Status:** CHECKED by Claude 2026-10-18 — passed · **Priority:** P1 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

Project loops and audits that a deploy or timeout interrupts resume instead of sitting "running" for an hour (5 such runs seen in prod). "Already running" stops blocking manual runs. Failed-run counts stop being inflated by duplicate runs. One pathological project can no longer spend 4x the loop cost cap.

## Files you own

- `apps/worker/src/workers/project-loop/projectLoopWorker.ts`
- `apps/worker/src/workers/project-loop/generators.ts`
- `apps/worker/src/workers/project-loop/enqueue.ts`
- `apps/worker/src/lib/queue.ts`
- `apps/web/src/lib/server/project-loops.service.ts`
- the test files next to these (apps/worker/tests/projectLoop\*.test.ts, apps/web/src/lib/server/project-loops.service.test.ts)

## Work, in this order

1. [x] **Interrupted project-loop runs never resume; retry silently skips**
    - Size M · now at `apps/worker/src/workers/project-loop/projectLoopWorker.ts:3116`
    - What goes wrong: Deploy SIGTERM (22 s drain) or 10-min worker timeout aborts a running loop -> queue retries the job -> claim requires status='queued' but the run is 'running' -> returns success 'not claimed' -> run stays 'running' until reclaim cron fails it at 1 h+ (enqueue.ts:754), and meanwhile enqueueProjectLoop returns 'already_running' for manual/burst triggers. Prod: 5 runs started 04:00 and were reclaimed at 05:30 (09-23, 4 on 10-04). Fix: fence on queue row (store queue_job_id/claim token on the run and allow re-claim of 'running' by the same queue row on retry), or reset to 'queued' in the abort path.
    - Fix: On abort, set the run back to 'queued' before rethrowing and give the general queue (lib/queue.ts) a few seconds of abortGraceMs; backstop: let the claim take a 'running' run with the same queue_job_id older than the worker timeout. Add a stale check to the web trigger (project-loops.service.ts) so a stuck run stops answering 'already_running'.
    - Regression test: `apps/worker/tests/projectLoopDegradedRun.test.ts`
2. [x] **Complete Project Audit has the same non-resumable claim**
    - Size M · now at `apps/worker/src/workers/project-loop/projectLoopWorker.ts:2719`
    - What goes wrong: Audit aborted mid-synthesis -> retry finds project_audits.status='running' -> calls failQueuedRun (no-op on a running run) and returns skipped -> audit + run stuck until reclaimStalledProjectLoopRuns fails them.
    - Fix: Pass job.signal into synthesis; on abort put the audit and its run back to 'queued'; same backstop claim as the light loop.
    - Regression test: `apps/worker/tests/projectLoopWorkerCompleteAuditClaim.test.ts`
3. [x] **Check-then-insert race creates failed duplicate runs and throwaway chat sessions (partly fixed already)**
    - Size S · now at `apps/web/src/lib/server/project-loops.service.ts:170`
    - What goes wrong: Two triggers (e.g. burst + end_of_day, or web + worker) both pass the active-run check, both create a chat session + run row; add_queue_job dedups the second onto the first job and the second run is marked failed 'Deduplicated onto active project loop job'. 8 of 14 failed runs in 30d are this, inflating failure metrics.
    - Fix: Worker path already deletes the losing run (e2ffeac9c). The web path (manual + burst) still marks it 'failed'; make it delete the unqueued run like the worker does. Optional: create the run before the chat session.
    - Regression test: `apps/web/src/lib/server/project-loops.service.test.ts`
4. [x] **Project-loop cost cap does not bound the parallel detectors**
    - Size S · now at `apps/worker/src/workers/project-loop/projectLoopWorker.ts:3223`
    - What goes wrong: runGenerator checks totalCost >= $0.35 before each detector (line 3223), but all four start together under Promise.all while totalCost is 0, so the cap only ever gates the roll-up call. A pathological project can spend 4x one detector's worst case.
    - Fix: onUsage trips a run-wide abort signal once totalCost crosses the cap, passed to every detector; set max_tokens per call.
    - Regression test: `apps/worker/tests/projectLoopDegradedRun.test.ts`

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

- `pnpm --filter @buildos/worker exec vitest run tests/projectLoopDegradedRun.test.ts tests/projectLoopWorkerCompleteAuditClaim.test.ts tests/projectLoopEnqueueGate.test.ts tests/projectLoopStallReclaim.test.ts tests/projectLoopCancellation.test.ts`
- `pnpm --filter web exec vitest run src/lib/server/project-loops.service.test.ts`
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`

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

## Blocked

- RESOLVED 2026-10-18 by Claude (type-only fixes in the two test files; `typecheck:tests` now 0 errors). Original note: required `pnpm --filter web run typecheck:tests` is blocked by 5 errors in shared-checkout files outside this task's ownership: `apps/web/src/lib/utils/pwa-launch-sw.test.ts:119` (TS2345, 1 error), and `apps/web/src/routes/api/chat/sessions/[id]/server.audit.test.ts:71-72` (TS2339, 4 errors). Those files already had other agents' changes at the start and were left untouched. All four implementation items are complete; the full validation checklist is not green until these errors are resolved.

## Log

- 2026-10-18: created from the code triage (Claude).

- 2026-10-18 (Codex): completed all four items and reviewed the entire owned diff. All 78 focused tests pass; worker production/test typechecks pass; web application check passes with 0 errors and 0 warnings. Web test typechecking reports 5 errors outside the owned files (see Blocked). No commit, paid/model calls, production writes, migrations, or deployment changes. Refreshed the active Vite server with the explicitly prescribed `touch apps/web/vite.config.ts` (mtime only; no content change).
- 2026-10-18 (Claude light check, commit `ac26e2011`): diff reviewed — the claim fence (queued, or running on the same queue job past the worker timeout) is sound, the abort grace fits inside the 22 s shutdown budget, and dedup deletes only the losing unassigned run. 127 worker tests (71) and web tests (7) pass, and the full worker suite has no 127 failures. The 2 `agenticChatShutdownDrain` failures seen during the check came from tracker 128 (an `.abortSignal` mock gap), not 127.

### Completion report — 2026-10-18

1. **DONE — interrupted light loops:** abort cleanup requeues only the matching queue job and invocation start time; stale running claims can resume on the same queue job after the configured worker timeout. The general queue reserves 3 seconds of abort grace inside its existing 22-second shutdown budget. Web manual/burst triggers reclaim stale runs and exclude that reclaim from cooldown.
2. **DONE — complete audits:** synthesis receives the queue abort signal; cancellation requeues the audit and paired run with claim fences. Stale retries resume through the paired run's queue identity. Duplicate audit claims cannot fail another invocation's queued run. A durable ready audit can finish its interrupted paired run without another model call, and survives completion-write/inbox errors.
3. **DONE — duplicate enqueue cleanup:** web dedup deletes the losing queued, unassigned run and archives its temporary session instead of inventing a failed run. Missing queue metadata does not return the deleted run ID. The existing worker deletion path was already correct and was left unchanged.
4. **DONE — parallel cost control:** reported usage at or above $0.35 aborts the shared generation signal passed to all detectors, evidence/finder stages, and roll-up; stopped lenses are recorded as unchecked. Generator and brief calls have a 4,096 output-token limit. Budget exhaustion uses the heuristic roll-up; queue cancellation still requeues the run. Already-incurred provider spend can overshoot before usage is reported; this is cancellation on reported usage, not a prepaid hard dollar reservation.

**Files changed (content):**

- `apps/worker/src/workers/project-loop/projectLoopWorker.ts`
- `apps/worker/src/workers/project-loop/generators.ts`
- `apps/worker/src/lib/queue.ts`
- `apps/web/src/lib/server/project-loops.service.ts`
- `apps/worker/tests/projectLoopDegradedRun.test.ts`
- `apps/worker/tests/projectLoopWorkerCompleteAuditClaim.test.ts`
- `apps/worker/tests/projectLoopGenerators.test.ts`
- `apps/worker/tests/projectLoopQueueAbortGrace.test.ts` (new)
- `apps/web/src/lib/server/project-loops.service.test.ts`
- `tasker/127-project-loops-survive-deploys.md`

**Final checks:**

| Command                                                                                                                                                                                                                                                 | Result                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm --filter @buildos/worker exec vitest run tests/projectLoopDegradedRun.test.ts tests/projectLoopWorkerCompleteAuditClaim.test.ts tests/projectLoopEnqueueGate.test.ts tests/projectLoopStallReclaim.test.ts tests/projectLoopCancellation.test.ts` | PASS: 5 files, 52 tests, 0 failures                                           |
| `pnpm --filter web exec vitest run src/lib/server/project-loops.service.test.ts`                                                                                                                                                                        | PASS: 1 file, 7 tests, 0 failures                                             |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                                           | PASS: 0 errors                                                                |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                                     | PASS: 0 errors, baseline 0                                                    |
| `pnpm --filter web run check`                                                                                                                                                                                                                           | PASS: 0 errors, 0 warnings; run once at the end                               |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                                                                                 | FAIL: 5 errors, baseline 0; all outside owned files (see Blocked)             |
| `pnpm --filter @buildos/worker exec vitest run tests/projectLoopGenerators.test.ts tests/projectLoopQueueAbortGrace.test.ts`                                                                                                                            | PASS: 2 files, 19 tests, 0 failures                                           |
| `git diff --check -- <owned tracked paths>`                                                                                                                                                                                                             | PASS: no whitespace errors                                                    |
| `git status --porcelain` and whole owned diff review                                                                                                                                                                                                    | PASS: only owned content plus this tracker edited; shared changes left intact |

**Regression-first evidence:** I saw the regressions fail against unfixed behavior and pass after the fixes. Additional guard tests intentionally cover behavior that was already correct.

- Item 1: `pnpm --filter @buildos/worker exec vitest run tests/projectLoopDegradedRun.test.ts tests/projectLoopQueueAbortGrace.test.ts` initially had 3 failures / 11 passes (abort left the run running, stale retry skipped, grace missing), then 14 passes. The shutdown-budget regression also failed at 25,000 ms before reserving grace within 22,000 ms. Web service tests initially had 2 failures / 4 passes for stale manual/burst triggers, then 6 passes.
- Item 2: `pnpm --filter @buildos/worker exec vitest run tests/projectLoopWorkerCompleteAuditClaim.test.ts` against the original audit functions had 5 failures / 4 passes, then passed with the fixes. Further ready-audit/fresh-run edge regressions failed 2 / passed 9 before their fix; completion-write/inbox-failure regressions failed 2 / passed 11 before their fix. The final audit suite has 13 passing tests.
- Item 3: web service tests had 2 failures / 5 passes for dedup deletion and missing-metadata cleanup, then 7 passes.
- Item 4: `pnpm --filter @buildos/worker exec vitest run tests/projectLoopDegradedRun.test.ts tests/projectLoopGenerators.test.ts` had 3 failures / 29 passes (peer abort, roll-up budget fallback, output limit), then 32 passes.

**Skeptical review — one extra edge per fix:**

- Loop retry: a delayed aborted invocation cannot reset a newer claim; covered by the changed start-time test. Fresh, terminal, and different-queue runs are not reclaimed.
- Audit retry: abort after the packet is already ready recovers the paired run without repeating synthesis; ready data also survives a transient completion-write failure. Covered by regressions.
- Dedup: malformed queue metadata deletes only the queued/unassigned loser, archives its session, and does not expose its deleted ID. Covered by regression.
- Cost cap: the roll-up itself can consume the remaining budget; it falls back to the heuristic and completes, while existing queue-cancellation tests still requeue rather than finalize.

**DJ action:** no migration, deployment, or approval is needed for these changes. The owners of the two unrelated web test files need to resolve their 5 type errors before rerunning `pnpm --filter web run typecheck:tests` to make every required check green. Claude's light review remains pending.
