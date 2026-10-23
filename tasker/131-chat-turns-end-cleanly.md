<!-- tasker/131-chat-turns-end-cleanly.md -->

# 131 — Chat turns end cleanly

**Status:** CHECKED by Claude 2026-10-18 — items 1–4 pass; item 5 skipped (optional) · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

A failed turn ends right away instead of waiting for the stall sweeper. An abandoned model request stops running (and billing) after its turn ends. A hung database socket can no longer stall dead-turn recovery on a worker for minutes. A Gmail search that timed out once can be retried in the same turn.

## Files you own

- `apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts`
- `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`
- `apps/worker/src/workers/agentic-chat/provider/forced-synthesis.ts`
- `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`
- `apps/worker/src/workers/agentic-chat/provider/jev-tool-selector.ts`
- `apps/worker/src/workers/agentic-chat/turn/execution-control.ts` (DJ authorized scope expansion on 2026-10-18)
- `apps/worker/src/workers/agentic-chat/workflow/workflow-store.ts` (same authorization)
- the test files next to these

DJ's follow-up after the blocked report authorized the remaining adapter work ("do whatever you need to do next"). The added scope also covers the focused execution-control, workflow-store, and workflow-recovery tests. Other chats' edits remain untouched.

## Work, in this order

1. [x] **A failed turn with a null timing draft still sends publicError, which execution-control rejects before any RPC** — DONE
    - Size S · now at `apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts:519`
    - What goes wrong: The runtime timing tracker becomes unhealthy (clock or causal check), buildTimingDraft returns null, includesFailureEventPair is still true, finalize() throws 'failed terminal events require … timing', the retry is skipped because timingDraft is already null, and the result is recovery_required: the user waits for the stalled sweeper.
    - Fix: Send publicError / errorTransitionId only when timingDraft !== null.
    - Regression test: `apps/worker/tests/agenticChatTurnExecutor.test.ts`
    - 2026-10-18: both error fields now require a non-null timing draft. Observed the regression fail with the unexpected error pair, then pass; partial text remains reconnectable and `done` is published.
2. [x] **The opening request started by startProviderPass is never closed if the executor abandons at the 'Working from' step** — DONE
    - Size S · now at `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:433`
    - What goes wrong: publishSemantic for context_selection throws, the generator closes at 'yield found.step', and the wrapper generator was never started, so pass.return() never runs. combined.dispose() does not abort, so the request runs to completion (p50 2.7 s, up to 90 s), gets billed, and logs usage after the turn ends.
    - Fix: Give the opening pass its own AbortController joined with request.signal; abort it in the turn-provider finally if the pass was never consumed.
    - Regression test: `apps/worker/tests/agenticChatTurnProvider.test.ts`
    - 2026-10-18: the eager pass has a local abort controller joined to the turn signal; the provider aborts an unconsumed pass and disposes the signal listeners in `finally`. Observed the publication-failure regression fail before the fix and pass after; normal consumption is also covered.
3. [x] **A failed mailbox provenance review stays cached for the turn (web reviews evict failures at :743)** — DONE
    - Size S · now at `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts:929`
    - What goes wrong: The Jev provenance call times out or is aborted by a sibling's deadline, the rejected promise stays under 'mailbox:<query>', and every retry of that Gmail search this turn is refused.
    - Fix: Cache only real verdicts: delete the key when probability === null or the promise rejects (the judge resolves a fail-closed denial, so .catch alone won't fix it).
    - Regression test: `apps/worker/tests/agenticChatToolExecutionAdapter.test.ts`
    - 2026-10-18: evict null-probability decisions and rejected promises only if the cache still holds that promise. Both failure regressions failed first and now pass; real approvals and denials remain cached.
4. [x] **Workflow handoff converge calls recover/finalize without a deadline** — DONE
    - Size S · now at `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts:499`
    - What goes wrong: A pooler stall during converge (the worker Supabase client has no fetch timeout, so undici waits ~300 s) leaves the sweep's inFlight pending, and every later sweep on that replica returns the same hung promise. Dead-turn recovery stops for minutes.
    - Fix: Put each converge step under the rpcTimeoutMs abort-and-race recoverBatch already uses. Smaller impact than reported (web cron still recovers dead turns every minute).
    - Regression test: `apps/worker/tests/agenticChatStalledRecovery.test.ts`
    - 2026-10-18 follow-up: shared the existing abort-and-race deadline across batch recovery, handoff recovery, workflow reads, and finalization. Added optional signals to the control and workflow-store adapters. Every workflow read, including nested specialist snapshots and saved evidence, receives the signal; expired loads cannot initiate further reads. Eight new regression cases failed before implementation and pass after it. Existing finalization/cancellation assertions now verify the additional signal argument.
5. [x] **Simplification, last and optional: one TurnScope, one Jev client** — SKIPPED (optional)
    - In `execution-adapter.ts`, move the five copy-pasted per-turn Map+TTL caches into one `TurnScope` so `completeTurnSecurityState` can't forget one. Move `JevToolSelector` onto the shared `JevClient` (~150 lines of hand-rolled HTTP, validation and usage logging go away, and its ~403 calls per 30 days gain the Jev hedge). Behavior must not change; existing tests are the guard.
    - 2026-10-18: reviewed the five cache lifetimes and custom selector transport; deferred the optional broad refactor to keep this change focused on the confirmed failure paths and avoid mixing transport/usage changes with cleanup fixes.

**Not in this tracker:** The web-search regex bug (`web-egress-policy.ts`) waits on DJ's lean-vs-ambitious pick; see `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md`. Don't touch `web-egress-policy.ts`.

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

- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnExecutor.test.ts tests/agenticChatTurnProvider.test.ts tests/agenticChatStalledRecovery.test.ts tests/agenticChatToolExecutionAdapter.test.ts`
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`

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

### Implementation report — 2026-10-18

1. **DONE:** omit the public-error pair when timing is unavailable, so a failed turn can use base terminal finalization.
2. **DONE:** abort the eager opening model request when context-selection publication abandons it; detach the joined signal listeners afterward.
3. **DONE:** evict unsuccessful mailbox provenance reviews (null probability or rejected promise), preserving actual approval/denial caching.
4. **DONE:** each convergence operation now has an abort-and-race deadline, with signals propagated through the execution-control and workflow-store adapters. DJ's follow-up resolved the ownership blocker; timeout regressions and final validation pass.
5. **SKIPPED (optional):** defer cache consolidation and shared Jev transport migration to avoid broad refactoring in this failure-path patch.

Files changed by this chat:

- `apps/worker/src/workers/agentic-chat/turn/turn-finalizer.ts`
- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts`
- `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts`
- `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`
- `apps/worker/src/workers/agentic-chat/turn/execution-control.ts`
- `apps/worker/src/workers/agentic-chat/workflow/workflow-store.ts`
- `apps/worker/tests/agenticChatTurnExecutor.test.ts`
- `apps/worker/tests/agenticChatTurnProvider.test.ts`
- `apps/worker/tests/agenticChatToolExecutionAdapter.test.ts`
- `apps/worker/tests/agenticChatStalledRecovery.test.ts`
- `apps/worker/tests/agenticChatExecutionControl.test.ts`
- `apps/worker/tests/agenticChatWorkflowStore.test.ts` (new)
- `apps/worker/tests/agenticChatWorkflowRecovery.test.ts`
- `tasker/131-chat-turns-end-cleanly.md`

Validation (all heavy runs sequential in this chat, through `test-gate`; inherited worker cap 2, no paid/live calls):

| Exact command                                                                                                                                                                                                                       | Result                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnExecutor.test.ts -t "finalizes a failed turn without the error pair"'`                                                                           | Test-first: two initial fixture-setup failures (1 failed / 148 skipped each), then **1 intended regression failure / 148 skipped** with publicError and errorTransitionId unexpectedly non-null. After fix: **1 passed / 148 skipped**.                            |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnProvider.test.ts -t "aborts the opening request"'`                                                                                               | Before fix: **1 failed / 154 skipped** (client signal remained live). After fix: **1 passed / 154 skipped**.                                                                                                                                                       |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatToolExecutionAdapter.test.ts -t "Gmail provenance"'`                                                                                                 | Before fix: **2 failed / 2 passed / 52 skipped** (retry still refused for null-probability and rejection cases). After fix: **4 passed / 52 skipped**.                                                                                                             |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatStalledRecovery.test.ts tests/agenticChatExecutionControl.test.ts -t "bounds a hung workflow handoff\|forwards the handoff deadline"'`               | Before item 4 fix: **5 intended regression failures / 41 skipped** across 2 files. Hung operations never settled and RPC signals were missing.                                                                                                                     |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatWorkflowStore.test.ts'`                                                                                                                              | Before item 4 adapter fix: **3 intended regression failures**. Read signals were missing, pre-aborted loads started reads, and late responses started subsequent reads.                                                                                            |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatStalledRecovery.test.ts tests/agenticChatExecutionControl.test.ts tests/agenticChatWorkflowStore.test.ts'`                                           | First run after item 4 fixes: **47 passed / 2 failed**. All 8 new regressions passed; 2 existing assertions needed the added signal argument. Updated those assertions.                                                                                            |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatStalledRecovery.test.ts tests/agenticChatExecutionControl.test.ts tests/agenticChatWorkflowStore.test.ts tests/agenticChatWorkflowRecovery.test.ts'` | Final adapter/workflow coverage **PASS: 4 files, 66 passed / 0 failed**. Includes cancellation, durable partial-answer recovery, and all 8 item 4 regressions.                                                                                                     |
| `test-gate run 'pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnExecutor.test.ts tests/agenticChatTurnProvider.test.ts tests/agenticChatStalledRecovery.test.ts tests/agenticChatToolExecutionAdapter.test.ts'`  | Initial two runs **PASS: 4 files, 382 passed / 0 failed**. Final run after item 4: **PASS: 4 files, 385 passed / 0 failed**. Together with the adapter/workflow group, **427 unique tests across 7 files** pass (24 stalled-recovery tests appear in both groups). |
| `test-gate run 'pnpm --filter @buildos/worker run typecheck'`                                                                                                                                                                       | Initial and final follow-up runs **PASS**, exit 0, no diagnostics.                                                                                                                                                                                                 |
| `test-gate run 'pnpm --filter @buildos/worker run typecheck:tests'`                                                                                                                                                                 | Initial run: **FAIL**, 1 new TS2322 in the normal-consumption test fixture (`usage: null` is not a client-event field value). Corrected to omit usage; rerun **PASS**, exit 0, **0/0 errors**. Final follow-up after item 4 also **PASS**, exit 0, **0/0 errors**. |

Self-review:

- Read the full implementation/test diff skeptically. All touched files match this tracker's ownership/test allowance; `git status --porcelain` includes other chats' changes, which were left untouched. Scoped `git diff --check` passed.
- Item 1 edge: a failed turn with partial text still publishes `done`, reconciles its queue, and retains the reconnect-safe text when timing is unhealthy; healthy-timing and rejected-timing-fallback cases remain covered by the full executor suite.
- Item 2 edge: normal eager-pass consumption still yields context selection before the answer, performs one model call, releases capacity, and does not abort the caller or completed request. The failure test also observes the client generator close without aborting its parent.
- Item 3 edge: actual denials stay cached and never reach Gmail; successful retry verdicts are reused. Promise-identity checks prevent an old completion from evicting a replacement.
- Item 4 edge: clients that ignore abort still release the sweep at the deadline; subsequent reconciliation gets a fresh signal, timers are cleared, and another sweep can run. Late workflow responses cannot begin further reads or update caches after abort. A timeout does not prove a database write rolled back; the existing fenced recovery loop reconciles uncertain finalization, with cancellation and ownership behavior covered by the passing workflow tests.
- All 12 newly added bug-regression cases (4 for items 1–3 and 8 for item 4) were observed failing for their intended reason before their fixes and now pass. The two additional supporting cases (normal eager consumption and cached real denial) pass as well. Database-builder tests use mocked fetch and make no network calls.
- Every command under "Checks" has a passing final run. The additional adapter/workflow suite passes as well; 427 unique tests pass across the two final groups.
- No new language regex/keyword classification, paid/model calls, migrations, production writes, deployments, commits, or edits outside owned files.

DJ follow-up: none required. All four fixes and validation are complete; awaiting Claude's light check. No commit or deployment was performed.

## Blocked

- None. The earlier item 4 blocker was resolved by DJ's 2026-10-18 follow-up authorizing the additional adapter/test changes. Its initial blocked disposition is retained in the Log.

## Log

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Codex confirmed and fixed items 1–3 with four observed red-to-green regression cases, added two edge-case checks, and self-reviewed the complete owned diff. Final focused suite: 382/382 passed; worker typecheck clean; test typecheck 0/0 errors after correcting one fixture field. Item 4 is blocked by the unowned control/workflow adapters' missing abort-signal support; item 5 explicitly skipped as optional. Updated dispositions, report, and Blocked details. No commit, paid/live call, migration, deployment, or out-of-scope edit. Overall DONE is withheld pending item 4.
- 2026-10-18 follow-up: DJ authorized the necessary adapter/test scope expansion. Completed item 4 with eight observed red-to-green regressions; final required suite 385/385 and adapter/workflow suite 66/66 pass (427 unique tests). Worker typecheck passed without diagnostics; test typecheck passed with 0/0 errors. Reviewed the complete owned diff, preserved other chats' changes, and marked DONE — awaiting Claude check. Item 5 remains explicitly skipped. No paid/live calls, migrations, commits, or deployments.
- 2026-10-18 (Claude light check of 126–135): items 1–4 OK. Item 5 was skipped (optional), even though its box was ticked. The low "whole sweep has no deadline" follow-up moved to tracker 137 item 4.
