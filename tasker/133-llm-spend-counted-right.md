<!-- tasker/133-llm-spend-counted-right.md -->

# 133 — LLM spend counted right

**Status:** CHECKED by Claude 2026-10-18 — passes · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~1 day
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

Brief, consolidation and loop costs stop being under-counted. One provider glitch (an empty response) stops failing a whole call. A repair step stops re-sending to a model that already failed. Paid model bake-offs test the prompt production actually sends.

## Files you own

- `packages/smart-llm/src/smart-llm-service.ts`
- `apps/web/src/lib/tests/llm/helpers/lite-turn-runner.ts`
- `apps/web/src/lib/tests/llm/__tests__/model-bakeoff-live.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` and its focused tests (DJ authorized the ownership expansion on 2026-10-18)
- the test files next to these

## Work, in this order

1. [x] **JSON path: empty choices never fail over; retries re-call failed models; usage under-counted**
    - Size M · now at `packages/smart-llm/src/smart-llm-service.ts:693`
    - What goes wrong: A plain Error('empty choices array') doesn't match failover rules, so one provider glitch fails the whole call. Repair steps re-send to models that already failed (brief: 5 paid calls, DeepSeek twice). onUsage (:888) reports only the final attempt, so brief, consolidation and loop costs under-count.
    - Fix: Typed retryable error for empty choices (text path :1380 too); pick the repair model from models not yet tried; report each billed superseded attempt to onUsage (check checkpointLlm and extractTaskEntitiesWorker add usage up, not overwrite).
    - Regression test: `packages/smart-llm/src/smart-llm-service.test.ts`
2. [x] **Paid model bake-offs and the admin preview test a prompt production never sends (partly fixed already)**
    - Size S · now at `apps/web/src/lib/tests/llm/helpers/lite-turn-runner.ts:129`
    - What goes wrong: The runner and preview build with dynamic skill tools, web_compound project-create and unfiltered tools (the retired web lane), so eval results don't reflect worker prompts.
    - Fix: Admin-preview half deleted in 9735aa719. Runner half remains: build the runner's envelope and tools with the worker helpers (buildWorkerPromptScaffold, resolveWorkerPromptTools, 'reviewed_shell').
    - Regression test: apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts (free parity check)

**Not in this tracker:** Deleting `OpenRouterV2Service` and the smart-llm `streamText` path (~5.7k lines) needs one small paid check (three web features move LLM clients), so it waits on DJ. Don't start it here. Never run the live bake-off or any paid test.

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

- `pnpm --filter @buildos/smart-llm exec vitest run src/smart-llm-service.test.ts` and `pnpm --filter @buildos/smart-llm run typecheck`
- `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts` (free parity check; not the live bake-off)
- Packages are consumed through `dist`: after changing `@buildos/smart-llm`, run `pnpm --filter <pkg> build` before typechecking or testing an app that imports it. If two agents build the same package at once and the build fails strangely, rerun it.
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

None. DJ's ownership expansion allowed the brief caller fix. The coordinator's shared web check and this follow-up's web test typecheck both passed; the earlier capacity block is resolved. Historical blocked/failed attempts remain documented below.

## Log

- 2026-10-18 (Codex authorized follow-up): DJ expanded ownership to `ontologyBriefGenerator.ts` and focused tests. Confirmed the cost overwrite, then added three mocked persistence regressions covering repair success, a final free success, and deterministic fallback after billed failures. The first run exposed one failure; tightening the assertion to eight decimal places exposed all three (**1 pass / 3 fail**) before the one-line accumulation fix. All focused brief suites then passed (**9/9**); final-model reporting and null usage metadata are preserved. Remaining static checks in progress.

- 2026-10-18 (coordinator inspection): Confirmed the brief callback still assigns rather than accumulates `llmCost`; task-entity extraction already sums costs and checkpoint forwarding preserves each event. Shared `test-gate run 'pnpm --filter web run check'` passed (exit 0, **0 errors and 0 warnings**), log `/tmp/tasker-131-135-review-web-check.log`. This supersedes only the original report's pending web-check result; caller ownership/fix and web test typecheck remain outstanding. No implementation files changed.

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18 (Codex): rechecked prerequisite 126 (DONE awaiting Claude check; leading-reasoning state/flush implementation present). Confirmed both defects, observed 12 smart-LLM regression failures (62 existing passes), implemented recovery/accounting fixes, then observed 74/74 pass. Five offline worker-prompt parity regressions also failed first (4 existing passes). Remaining validation and final self-review in progress; downstream brief cost overwrite recorded as out-of-scope blocker. No paid calls, migration, deployment, or commit.
- 2026-10-18 (Codex final self-check): reviewed the full owned diff and added failing-first regressions for empty custom routes and unavailable custom evaluation tools. Final suites pass **75 smart-LLM + 11 offline parity tests**, with package build/typecheck and both worker typechecks passing. Web check was blocked twice by occupied test-gate slots (60-second wait before retry); web test types were not run. Item 2 is complete; item 1's shared-client work is complete but its brief caller remains outside ownership. Status stays BLOCKED, not DONE. No other agents' changes were altered; no commit.

- 2026-10-18 (Codex completion): completed the authorized brief aggregation follow-up. Final focused suites: **75 smart-LLM + 11 offline prompt parity + 9 brief tests = 95 passed / 0 failed**. The shared package build/typecheck, worker production and test typechecks, coordinator's web check (0 errors / 0 warnings), and web test typecheck (0/0 errors) all pass. Fixed one missing-fields error in the new test fixture and reran its typecheck and tests. Re-read the complete owned diff and checked scope/status; refreshed running Vite after web test sync with an mtime-only config touch. Both work items are checked; no blocker remains. No paid calls, production writes, deployments, migrations, or commit.
- 2026-10-18 (Claude light check of 126–135): items 1–2 OK; every `onUsage` caller checked. The optional parity-test improvement moved to tracker 137 item 7.

## Implementation report — 2026-10-18

| Item            | Disposition                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1               | DONE                                              | Empty choices use the existing retryable empty-content error on JSON, repair, and text paths. Repair/failover exclude requested and actual models already attempted, stop on exhausted routes, and preserve one last-resort attempt for an initially empty route. Each billed superseded JSON response reaches `onUsage` exactly once before another dispatch; terminal billed failures also report usage, including provider cost without token counts. The brief caller now accumulates every callback's cost while retaining the latest model name. |
| 1 caller checks | NOT A BUG for checkpoint/task-entity/loop callers | `checkpointLlm.ts:32–34` forwards each event. `extractTaskEntitiesWorker.ts:254–256` and the project-loop accumulator already add costs. These callers were inspected and left unchanged.                                                                                                                                                                                                                                                                                                                                                              |
| 2               | DONE; admin-preview portion ALREADY FIXED         | Fixtures use `buildWorkerPromptScaffold`, the configured scaffold variant, worker-filtered gateway tools, and `reviewed_shell`. Explicit tool lists are filtered and unavailable tools rejected before constructing a live client. The bake-off no longer overrides worker tools with `[]`. The deleted admin preview/shadow directories and endpoints are absent.                                                                                                                                                                                     |

Files changed (original ownership plus DJ's explicitly authorized brief caller and focused test):

- `packages/smart-llm/src/smart-llm-service.ts`
- `packages/smart-llm/src/smart-llm-service.test.ts`
- `apps/web/src/lib/tests/llm/helpers/lite-turn-runner.ts`
- `apps/web/src/lib/tests/llm/__tests__/model-bakeoff-live.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
- `apps/worker/tests/ontologyBriefGenerator.usage.test.ts`
- `tasker/133-llm-spend-counted-right.md`

`apps/web/vite.config.ts` received only the instructed mtime refresh after web test typechecking ran SvelteKit sync; its contents were not edited.

All heavy commands ran through `test-gate run '<command>'` with worker caps retained. The original web-check attempts timed out waiting for slots (exit 75 twice, with a 60-second wait before retry). The coordinator later completed that check; this follow-up preserved that evidence and did not repeat it. No paid/live bake-off ran: the new parity and brief suites fully mock model calls, and the brief suite also mocks persistence.

| Exact command inside the gate                                                                                                                                                            | Result                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/smart-llm exec vitest run src/smart-llm-service.test.ts`                                                                                                         | Initial: **62 pass / 12 fail**. First fixes: **74/0**. Self-review empty-route regression: **74/1**. Final: **75/0**. All regression failures observed before their fixes.                                                                                             |
| `pnpm --filter @buildos/smart-llm run typecheck`                                                                                                                                         | **PASS**, exit 0 / 0 errors, twice.                                                                                                                                                                                                                                    |
| `pnpm --filter @buildos/smart-llm build`                                                                                                                                                 | **PASS** twice; CJS, ESM, and declarations. Final build preceded final web parity and app checks.                                                                                                                                                                      |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts`                                                                                       | Initial: **4 pass / 5 fail**. First fixes: **9/0**. Unavailable custom-tool regression: **10/1**. Final: **11/0**. All six regressions failed before their fixes; the empty-tool compatibility case passed on introduction.                                            |
| `pnpm --filter @buildos/worker exec vitest run tests/ontologyBriefGenerator.usage.test.ts`                                                                                               | Before the fix: **3 pass / 1 fail** with default numeric tolerance, then **1 pass / 3 fail** after tightening assertions to eight decimal places. All three accounting regressions failed at the saved cost assertion before changing the callback.                    |
| `pnpm --filter @buildos/worker exec vitest run tests/ontologyBriefGenerator.usage.test.ts tests/ontologyBriefGeneratorDecision.test.ts tests/ontologyBriefGenerator.projectless.test.ts` | **9 pass / 0 fail**, three files, after the fix and again after completing the fixture types. Includes the no-usage/null-metadata compatibility case.                                                                                                                  |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                            | **PASS**, exit 0 / 0 errors, original work and authorized follow-up.                                                                                                                                                                                                   |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                      | Original: **0/0 errors**. Follow-up first found **1 error** in the new partial project fixture; replaced it with a fully typed row. Final: **0/0 errors**, exit 0.                                                                                                     |
| `pnpm --filter web run check`                                                                                                                                                            | **PASS** via coordinator, exit 0, **0 errors / 0 warnings**. Verified `/tmp/tasker-131-135-review-web-check.log`. Coordinator refreshed Vite afterward. Original blocked attempts remain in `/tmp/tasker-133-web-check.log` and `/tmp/tasker-133-web-check-retry.log`. |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                  | **PASS**, **0/0 errors**, exit 0. Follow-up log: `/tmp/tasker-133-followup-web-test-types.log`. Refreshed running Vite with `touch apps/web/vite.config.ts` afterward.                                                                                                 |

Self-review completed:

- Re-read the full owned diff and the new brief test; scoped `git diff --check` is clean. Checked `git status --porcelain`; this chat edited only the eight content files above and the instructed config mtime. Other agents' edits remain untouched. Package `dist` outputs were rebuilt as required.
- Item 1 extra edges: intermediate usage can cancel a repair; free-only routes never escape to paid models or repeat; exhausted routes stop; initially empty routes retain a last-resort attempt; cost-only failures retain provider spend. Existing timeout/reservation tests pass. The brief tests verify repaired success, a zero-cost final success, deterministic fallback after billed failures, latest-model reporting, and null metadata when no usage arrives.
- Item 2 extra edges: explicit retired tools are filtered, unavailable custom tools are rejected before a model call, and explicit empty tool lists remain supported.
- All regression tests failed first and pass now. All required validation has passing evidence; earlier failed/blocked attempts are retained above. No new regex or keyword classification of user/model meaning, paid calls, production writes, migrations, deployments, additional agents, or commits.

DJ follow-up: Claude's light check only. No remaining implementation or validation action is required.
