<!-- tasker/125-chat-window-truth-and-finish.md -->

# 125 — Chat window tells the truth and always finishes

**Status:** CHECKED by Claude 2026-10-18 — code passes; 2-minute browser check still pending (needs DJ OK: one real send) · **Priority:** P1 · **Opened:** 2026-10-18 · **Size:** ~1 day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

Turns stop hanging on "Thinking…" or "connection lost". The worker's real error shows instead of a generic one. Nothing from the last chat leaks into the next.

## Files you own

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`
- apps/web/src/lib/components/agent/agent-chat-thinking-state.ts (only if you extract the focus guard)
- apps/web/src/lib/components/agent/capture-receipt.ts (only if you extract the receipts subscription)
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts`
- the test files next to these

## Work, in this order

1. [x] **Generic failure copy overwrites the worker's specific error**
    - Size S · now at `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:365`
    - What goes wrong: The durable error event sets the worker's public message ('Nothing was changed. Try again.'); the following done(failed) unconditionally sets 'BuildOS could not finish this response.'
    - Fix: In the failed branch, write the generic line only when no error is set yet (or it's still the connection-lost banner).
    - Regression test: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`
2. [x] **Changing focus with no turn running creates a phantom spinning thinking block**
    - Size S · now at `apps/web/src/lib/components/agent/AgentChatModal.svelte:2564`
    - What goes wrong: logFocusActivity → addActivityToThinkingBlock → ensureThinkingBlock creates an active block holding only a hidden context_shift row; it shows 'Thinking…' with a timer and is never finalized.
    - Fix: logFocusActivity appends only when a turn is active and a thinking block exists; clear currentThinkingBlockId in clearMessages.
    - Regression test: apps/web/src/lib/components/agent/agent-chat-thinking-state.test.ts (extract the guard)
3. [x] **Previous session's capture receipts / brain-dump context leak into the next chat**
    - Size S · now at `apps/web/src/lib/components/agent/AgentChatModal.svelte:550`
    - What goes wrong: Receipt apply checks the closure's old sid and the brain-dump fetch (:1559-1579) has no current-session guard, so rows from chat A render in chat B after a quick switch.
    - Fix: Disposed flag in the receipts effect cleanup checked by apply(); after the brain-dump await, assign only if the session is still current.
    - Regression test: apps/web/src/lib/components/agent/capture-receipt.test.ts (if extracted)
4. [x] **One unparseable event wedges the turn**
    - Size S · now at `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts:502`
    - What goes wrong: The adapter throws, the inbox re-buffers and re-requests reconcile, and the same event fails again forever. A worker deployed ahead of web with a new workflow step value freezes review turns behind 'connection lost'.
    - Fix: When normalization fails, report it, mark the event applied and skip it so reconciliation reaches the terminal.
    - Regression test: `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.test.ts`
5. [x] **Turn released by session discovery never gets its terminal**
    - Size M · now at `apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.ts:133`
    - What goes wrong: New chat, send, Stop during a slow (cold) discovery: the turn is released as not_active and only stream.releaseWorkerTurn runs; the thinking block stays on Stopping…/Thinking… and created-entity cards never appear.
    - Fix: For a tracked turn missing from the active list, request reconciliation and let the terminal arrive through the observer instead of releasing it silently.
    - Regression test: `apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.test.ts`
6. [x] **First-turn admission with unknown outcome has no recovery**
    - Size M · now at `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts:848`
    - What goes wrong: New chat (no session) and both admission attempts time out: workerAdmissionSessionId stays null so no discovery runs. If the RPC committed, the answer lands in an orphan session; a retry creates a second session.
    - Fix: For a sessionless unknown outcome, run one delayed byte-identical replay (admission is idempotent on clientTurnId) and adopt the committed session.
    - Regression test: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`
7. [x] **Delete the legacy assistant-text path (~190 lines, unreachable)**
    - The worker UI adapter never forwards `text`/`text_delta` events (adapter ~:259, ~:302-318, ~:650; worker never emits `template_*`). Remove: AgentChatModal `bufferAssistantText`, `flushAssistantText`, `addOrUpdateAssistantMessage`, `markAssistantCompletion`; the sse-handler `text`/`text_delta`/`template_*` cases and their degraded finalization; ui-adapter ~:737-742.
    - First prove no worker path emits text through the handler (grep the worker publisher and the adapter). Do this last, after the bug fixes.

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

- `pnpm --filter web exec vitest run src/lib/components/agent/ src/lib/services/agentic-chat-v2/worker-turn-adoption.test.ts src/lib/services/agentic-chat-v2/worker-transport-client.test.ts`
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
4. Anything DJ must do: A 2-minute browser check on local dev (Claude can do it in the light check): open document chat, close, reopen, send; switch chats while one is loading; change focus with no turn running. This also covers two round-1 modal fixes that were never browser-tested.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Blocked

- Second-review `pnpm --filter web run check` was stopped under heavy machine memory pressure after more than 10 minutes without diagnostics (15% system-wide free memory; approximately 38 GB swap in use). It is **pending, not passing** for the second-review changes. The initial implementation's earlier check passed with 0 errors/warnings. Only this task's Svelte-check process was stopped; Vite's config mtime was touched to restore dev proxy types.
- The last completed `pnpm --filter web run typecheck:tests` was blocked by **5 errors in other agents' files**. Task 125's files had no diagnostics in that run. It was not repeated after the second review because of memory pressure. Under the shared-checkout ownership rule, these were not edited:
    - `apps/web/src/lib/utils/pwa-launch-sw.test.ts:119`: TS2345, `string | undefined` passed to `new Function`.
    - `apps/web/src/routes/api/chat/sessions/[id]/server.audit.test.ts:71-72`: four TS2339 errors; the `Row | Row[]` result is not narrowed before accessing session properties.
- DJ/Claude's two-minute browser check remains pending. No live send was performed.

## Log

- 2026-10-18: created from the code triage (Claude).
- 2026-10-18: Codex completed all seven items after reproducing all six bugs in tests. Required suite: 795 tests passed; web check: 0 errors/warnings. Final test typecheck has 5 errors outside owned files. Awaiting those owners' fixes and Claude's browser/light check; no commit or production changes.
- 2026-10-18: At DJ's request, Codex reviewed again and fixed stale-send races, admission-body timeout/cancellation, and close/unmount admission cleanup. Ten additional regression assertions were observed failing before fixes; all pass afterward. The 806-test sweep passed 804 assertions and exposed the two new teardown failures, then the final 18-test targeted/integration rerun passed after the teardown fix. Static revalidation remains pending because the laptop was under heavy memory pressure; no paid calls, commits, or production changes.
- 2026-10-18 (Claude light check, commit `ac26e2011`): diff reviewed (error copy, run-id guards, adoption reconcile, 2 s sessionless replay, body read inside the deadline, legacy text path gone). Web `check` 0 errors; `typecheck:tests` 0 after Claude fixed the 5 type-only errors in the two other-agent test files (uncommitted); the 125 focused suite (807 tests) passes. Still pending: the browser check (doc chat close/reopen/send, switch chats mid-load, focus with no turn). It needs one real send, which is a paid model call plus a production write.

## Implementation report — 2026-10-18

1. **DONE — worker error copy:** failed terminals preserve the worker's specific public error; the generic line still replaces an absent error or the connection-lost banner.
2. **DONE — idle focus:** focus logging requires a busy turn and an existing thinking-block identity. Router message clearing also clears that identity.
3. **DONE — session isolation:** receipt callbacks check both disposal and the current session. Brain-dump hydration checks the current session after the response body resolves. Tests execute the modal's actual callbacks without mounting unrelated panels.
4. **DONE — unsupported workflow events:** report normalization failures once, mark their durable event identities applied, and keep replay moving to terminal truth. Both live and reconciled delivery are covered.
5. **DONE — discovery terminal delivery:** a tracked turn absent from active discovery remains registered and requests reconciliation. Its observer delivers the terminal before unregistering. The runtime accepts the existing coordinator and runtime-wrapper callers.
6. **DONE — first-send recovery:** sessionless admission gets one final replay after a 2-second delay when the initial two attempts remain uncertain. The transport reuses its original serialized body and abort signal; the controller stays busy and adopts the returned session. Known-session admission remains capped at two attempts.
7. **DONE — legacy removal:** removed the modal text buffer/flush/append path, its unused index, SSE text/template cases, degraded finalization, and the adapter's unreachable text normalization. Worker text still uses direct snapshot/delta callbacks; screen-reader completion announcements remain.

### Evidence and edge cases

- All six reported bugs were confirmed in the current code and their regression assertions were observed failing before their fixes. Positive controls already passed.
- Failure-first runs: error-copy regression **1 failed / 75 passed**; modal lifecycle regressions **6 failed / 2 passed**; unsupported-event regressions **2 failed / 34 passed**; adoption regressions **2 failed / 36 passed**; controller recovery regression **1 failed / 87 passed**; transport recovery regressions **2 failed / 22 passed**. An initial modal-test harness parsing issue was corrected before the six meaningful failures were recorded.
- Extra edges checked: connection loss is replaced by a real terminal failure; active focus still logs; both late load and queued realtime receipt callbacks are ignored after disposal; same-session brain dumps still hydrate; repeated malformed events report once; another session's turns remain registered; reset cancels delayed admission recovery; mutable drafts cannot change replay bytes; recovery stops after three attempts.
- Legacy-path proof: worker `stream-publisher.ts` publishes text as `text_delta` and rejects text in the semantic publisher. The adapter appends live deltas directly, skips text in reconciled semantic delivery, and rejects text in semantic projections. No `template_*` producer exists under `apps/worker/src/workers/agentic-chat`.
- No new language-classification regex, paid/model calls, migrations, production writes, deploys, or commits.

### Files changed

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/agent-chat-modal-lifecycle.test.ts` (new)
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts` and `.svelte.test.ts`
- `apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts` and `.test.ts`
- `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts` and `.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-adoption.ts` and `.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts` and `.test.ts`
- This tasker. Other agents' files and staging were left alone.

### Validation

All heavy validation ran serially through `test-gate` with its worker caps.

- Required Vitest command from **Checks**: **60 files / 795 tests passed**, zero failures.
- Focused controller + transport + adoption + composed worker-flow run: **4 files / 113 tests passed**, zero failures (before legacy removal; the final component suite rechecked the changed components afterward).
- Svelte MCP autofixer: **0 issues** in both edited Svelte files. Existing advisory suggestions concern the modal's wider effect/state structure and were left outside this task's scope.
- `pnpm --filter web run check`: **passed, 0 errors / 0 warnings**. A local Vite server was detected; `apps/web/vite.config.ts` was touched after checks that regenerate types (mtime only, no content change).
- `pnpm --filter web run typecheck:tests`: **failed, 5 errors outside owned files**, listed under **Blocked**. The first run had 6 errors; the one owned stale SSE-test call was fixed and the rerun confirmed only the 5 unrelated diagnostics remain.
- Final narrow rerun after fixing the stale SSE test call: `pnpm --filter web exec vitest run src/lib/components/agent/agent-chat-sse-handler.test.ts` — **1 file / 68 tests passed**, zero failures.
- Review: full production/test diffs reread; owned-file whitespace check passed.

Browser validation remains for DJ/Claude: open document chat, close/reopen, send; switch chats while loading; change focus with no turn running. No live send was performed by this agent.

### Second review — 2026-10-18

DJ requested another skeptical review and an explanation of the user-visible improvements. The review found additional lifecycle gaps around item 6:

- An old send could continue after a prepared-prompt wait, adopt a late response, publish a late error, or clear a newer send's busy flag after reset. The controller now checks its run identity after async boundaries and before cleanup. The modal's fallback admission-snapshot read also checks that identity, including a new empty chat in the same project. Regression run: **5 failed / 87 passed** before the fix; **92 passed** afterward.
- Admission's timeout and cancellation originally ended when response headers arrived. A stalled success body or unknown-outcome error body could therefore hang recovery. Both body reads now remain inside the deadline and abort boundary. Regression run: **3 failed / 24 passed** before the fix; the combined rerun passed the **27 transport tests** afterward.
- Close/unmount teardown now resets the stream controller, cancelling a sessionless admission even when there is no registered session to release. The close/destroy regression assertions both failed before this change and pass afterward. The sent-message flag is preserved for the existing mutation summary.

Second-review validation:

- Required component/adoption/transport sweep: **60 files / 806 tests**, **804 passed / 2 failed**. The only failures were the newly added close/destroy regressions, observed before the teardown fix.
- Final targeted rerun after that fix: modal lifecycle, modal craft, and `worker-phase2d-composed-flow.test.ts` — **3 files / 18 tests passed**, including both teardown regressions. The other 804 assertions passed in the sweep; no additional production changes followed apart from the two-line teardown fix.
- Svelte autofixer after the final modal change: **0 issues** (existing advisory suggestions unchanged).
- Formatting and owned-file whitespace checks passed. The second-review Svelte check was stopped for machine health, and test typechecking was not repeated; see **Blocked**. The earlier static results do not certify the additional second-review changes.

Expected improvements: terminal results finish the visible turn, the worker's useful error survives, idle focus changes do not start a spinner, old receipts/context/admission results stay out of a new chat, and a lost first-send response can recover the original session with the same idempotency key. This changes lifecycle reliability, not model answer quality. Recovery is bounded and cannot guarantee success during a persistent outage.
