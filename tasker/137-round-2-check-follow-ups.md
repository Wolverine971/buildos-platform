<!-- tasker/137-round-2-check-follow-ups.md -->

# 137 — Round 2 check follow-ups

**Status:** CHECKED by Claude 2026-10-18 — passes · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~half a day  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

Source: Claude's light check of trackers 126–135 on 2026-10-18, which used 4 read-only reviewers and a full verify run. The small fixes from that check are gathered here. The larger ones went back to 130 and 132. Run this alongside the 130 and 132 follow-ups; the files don't overlap.

## What users get

Chat replies from models that "think out loud" no longer time out for lack of visible progress. One stuck background job can no longer hold its queue slot forever. Dead-turn recovery can no longer spend 11 minutes on one sweep. Deleted items no longer leave stray search chunks behind. Two worker tests stop failing on purpose-built new defaults.

## Files you own

- `apps/worker/tests/agenticChatBootstrap.test.ts`, `apps/worker/tests/agenticChatConsumer.test.ts`
- `apps/worker/src/workers/agentic-chat/host/composition-root.ts`
- `packages/shared-agent-ops/src/ontology/instantiation.service.ts`, plus the files tracker 129 item 3 lists
- `apps/worker/src/workers/project-loop/reviewRollup.ts`, `packages/agentic-chat-runtime/src/context-finder/packets.ts` (comments only)
- `apps/worker/src/lib/supabaseQueue.ts` and its tests (`apps/worker/tests/supabaseQueue*.test.ts`)
- `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`, `apps/worker/tests/agenticChatStalledRecovery.test.ts`
- `apps/worker/src/workers/embeddings/embedEntityWorker.ts` and its test
- `packages/smart-llm/src/response-parsing.ts` and its test, `apps/worker/src/workers/agentic-chat/provider/openrouter/sse.ts`, `apps/worker/tests/agenticChatOpenRouterClient.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts` (item 7, optional)

## Work, in this order

1. [x] **Two worker tests expect the old defaults** (from 129)
    - `tests/agenticChatBootstrap.test.ts` ("reports the models and switches…") and `tests/agenticChatConsumer.test.ts` ("parses an independently bounded two-slot queue policy") expect `directWriteReceiptText`, `directWriteReceiptTextEnabled` and `liveTextPreviewEnabled` to be `false`. Tracker 129 flipped those defaults to `true` on purpose (production runs both on). Update the expectations.
    - In `composition-root.ts`, lines 223 and 225 still say "Default off" and line 405 uses `?? false`. Make sure that path really gets the new `true` default, then fix the comments.
2. [x] **Unblock and finish tracker 129 item 3** (the FSM chain delete)
    - The blocker was one unused import: `type FSMDef` at `packages/shared-agent-ops/src/ontology/instantiation.service.ts:8`. Remove it, then do 129 item 3 as that tracker describes, and tick it there.
3. [x] **A timed-out job that ignores its abort holds its slot forever** (from 128, medium)
    - Now: `apps/worker/src/lib/supabaseQueue.ts:888-893`. After a timeout, `await promise.catch(...)` waits with no limit, and the heartbeat keeps running. The row stays "processing" and stalled recovery never reclaims it. Enough of these (batch size 5–10) stop all claiming.
    - Fix: race the settle against a bounded grace period (3 minutes). When it expires, log an error, stop the heartbeat and release the slot. Stalled recovery then reclaims the row, because the heartbeat stopped.
    - Regression test: a processor that ignores abort and never settles → after the grace period, the slot is free and the heartbeat has stopped (use fake timers).
4. [x] **One recovery sweep can run for about 11 minutes** (from 131, low)
    - Now: `stalled-recovery.ts` (~499). Each converge step has a 10 s deadline, but after a timeout the loop runs again: 4 steps × 10 s × 16 handoffs.
    - Fix: after the first timeout, stop converging for this sweep and leave the rest for the next sweep.
    - Regression test: every step hangs → the sweep returns after one deadline.
5. [x] **Deleting an item mid-embedding leaves stray search chunks** (from 134, low)
    - Now: `embedEntityWorker.ts` (~136). An embed job that is already running when the entity is deleted writes its chunks after the inline delete trigger has run. Search filters on `deleted_at`, so users don't see them; they just pile up.
    - Fix: after the upsert, re-read the entity. If it's deleted, remove the chunks this job just wrote.
    - Regression test: the entity is deleted between the read and the upsert → no chunks remain.
6. [x] **Hidden inline reasoning doesn't count as stream progress** (from 126, low; an old gap)
    - Now: `sse.ts:103`. Text dropped inside a leading `<think>` block adds to neither `generatedBytes` nor `reasoningBytes`. If a model "thinks out loud" for more than 15 s, the first-progress watchdog aborts the pass, and slow-stream hedging can request a backup.
    - Fix: have `normalizeStreamingContent` report how many characters it dropped (a new field; existing callers ignore it), and add those bytes to `state.reasoningBytes` in `sse.ts`.
    - Regression test: a stream that opens with a long inline reasoning block counts as progress.
7. [x] **Optional: make the prompt-surface parity test check production** (from 133, low)
    - `worker-prompt-surface.test.ts` compares the runner's tools with the runner's own calls. Build the expected side through `resolveFastChatTurnPreparation`, the production path used in `worker-turn-preparation.server.ts:520`, the way that file's image test already does.
8. [x] **Optional, last: stale mentions of deleted code**
    - Comments in `reviewRollup.ts:12` and `packets.ts:4`. Worker and web docs that mention `generate_project_icon` (find them with `rg -n "generate_project_icon" docs apps --glob "*.md"`). Leave `docs/privacy/DATA_INVENTORY.md` alone; it has another session's edits, and its `question_tree_*` lines change after DJ applies the drop.

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

- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatBootstrap.test.ts tests/agenticChatConsumer.test.ts tests/supabaseQueueRefill.test.ts tests/supabaseQueueDrain.test.ts tests/agenticChatShutdownDrain.test.ts tests/agenticChatStalledRecovery.test.ts tests/agenticChatOpenRouterClient.test.ts`
- The embed worker's test file, plus `pnpm --filter @buildos/smart-llm exec vitest run src/response-parsing.test.ts` and `pnpm --filter @buildos/smart-llm build`
- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/ontology/` and the checks tracker 129 lists for item 3
- `pnpm --filter @buildos/worker run typecheck` and `pnpm --filter @buildos/worker run typecheck:tests`

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

None. All applicable checks passed; no migration was needed or applied.

## Log

- 2026-10-18: created from Claude's light check of 126–135.
- 2026-10-18 (Codex, assignment C): completed items 1–8 in order, including both optional items and the delegated Tasker 129 item 3. Required bugs reproduced with failing-then-passing regressions; self-review also caught and fixed synchronous wrapped aborts bypassing the sweep deadline. Final focused total 451 tests passed; all applicable builds, typechecks, web check and strict doc-health pass. Runtime build waited for Tasker 132 item 9 and used the unchanged heap limit. No paid calls, production changes, migrations or commit. DONE — awaiting Claude check.
- 2026-10-18 (Claude check of the follow-ups): items 1–8 pass.
    - Item 1 switched the composition-root default to on, which broke `tests/agenticChatDirectWriteReceipt.test.ts` ("is plumbed from the composition root"). Claude updated it: the default and explicit on make 1 model call, explicit off makes 2.
    - Bounded 3-minute grace, sweep stops at its first timeout, embedding re-check, and inline-reasoning progress count are all reviewed.

## Completed agent report — 2026-10-18

### 1. Work items

1. **DONE:** Corrected both stale worker expectations; the composition receipt fallback now
   defaults to `true`, and comments reflect the production defaults. Traced bootstrap passing
   both loaded config values into composition. Explicit receipt `false` remains supported.
2. **DONE:** Finished only tracker 129 item 3. Removed its unused `FSMDef` import and 250 lines
   of the externally unused FSM/template chain. Retained `FacetDefaults` and every entity,
   state, facet, ProjectSpec and document-tree schema. Updated item 3's current disposition
   and follow-up in tracker 129; other checked work was preserved.
3. **DONE:** A timed-out processor gets a three-minute settlement grace. Expiration logs an
   error, releases its slot and stops its heartbeat, leaving the processing row for fenced
   stalled recovery. It does not immediately fail/requeue the still-running processor.
4. **DONE:** The first recovery deadline ends convergence for the entire sweep, including later
   handoffs and batches. Ordinary non-timeout retries remain. Rejecting the deadline before
   aborting the client ensures synchronous wrapped abort errors cannot bypass that stop.
5. **DONE:** After upsert, re-read the entity's deletion state; soft or hard deletion removes
   its late chunks. Read and cleanup failures are surfaced for retry; unrelated entities'
   chunks are preserved.
6. **DONE:** `normalizeStreamingContent` reports discarded character and UTF-8 byte counts.
   SSE includes them in hidden reasoning progress, with no visible leakage. Split prefixes
   aren't counted before recognition and retained tails aren't counted twice.
7. **DONE (optional):** Offline parity expectations now use production
   `resolveFastChatTurnPreparation` → email mount → worker tool admission, including the
   unavailable-tool assertion. The LLM boundary remains fully mocked.
8. **DONE (optional):** Updated both stale source comments and removed retired project-icon
   jobs/endpoints from seven operational docs. Historical brainstorm/triage mentions remain
   as historical evidence. `docs/privacy/DATA_INVENTORY.md` was not touched.

### 2. Files changed

- `apps/worker/src/workers/agentic-chat/host/composition-root.ts`
- `apps/worker/tests/agenticChatBootstrap.test.ts`
- `apps/worker/tests/agenticChatConsumer.test.ts`
- `packages/shared-agent-ops/src/ontology/instantiation.service.ts`
- `packages/shared-agent-ops/src/ontology/onto.ts`
- `packages/shared-agent-ops/src/ontology/onto-api.ts`
- `apps/worker/src/lib/supabaseQueue.ts`
- `apps/worker/tests/supabaseQueueRefill.test.ts`
- `apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts`
- `apps/worker/tests/agenticChatStalledRecovery.test.ts`
- `apps/worker/src/workers/embeddings/embedEntityWorker.ts`
- `apps/worker/tests/embedEntityWorker.test.ts` (new)
- `packages/smart-llm/src/response-parsing.ts`
- `packages/smart-llm/src/response-parsing.test.ts`
- `apps/worker/src/workers/agentic-chat/provider/openrouter/sse.ts`
- `apps/worker/tests/agenticChatOpenRouterClient.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts`
- `apps/worker/src/workers/project-loop/reviewRollup.ts` (comment only)
- `packages/agentic-chat-runtime/src/context-finder/packets.ts` (comment only)
- `apps/worker/README.md`
- `apps/worker/src/workers/README.md`
- `apps/worker/docs/QUICK_REFERENCE.md`
- `apps/worker/docs/README.md`
- `apps/worker/docs/WORKER_JOBS_AND_FLOWS.md`
- `apps/web/docs/features/ontology/API_ENDPOINTS.md`
- `docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md`
- `tasker/129-delete-round-2-and-chores.md` (delegated item 3 disposition)
- This tracker.
- Touched `apps/web/vite.config.ts` after the SvelteKit checks to restart the local dev server; no content diff.

### 3. Commands and regression-first evidence

All model/provider calls in these tests were mocked. Heavy commands used `test-gate run` and
its worker caps. The first worker baseline ran sandboxed and gate's macOS memory probe was
unavailable there; subsequent heavy checks ran outside the sandbox so the real memory checks
worked. Queued checks acquired slots without a refusal; no refused check was repeatedly run.
The runtime build was deferred until chat 132 reported item 9 fixed, then passed without any
heap-limit override. Build logs are in `/tmp/tasker137/`.

| Command inside test-gate                                                                                                                                                                                                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatBootstrap.test.ts tests/agenticChatConsumer.test.ts`                                                                                                                                                                                                                              | Original expectations: **2 failed / 52 passed**. Added composition-default regression: **3 failed / 54 passed**. Fixed: **57 passed**.                                                                                                                                                                                                 |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/ontology/`                                                                                                                                                                                                                                                                           | **134 passed**, 12 files, before and after deletion.                                                                                                                                                                                                                                                                                   |
| `pnpm --filter @buildos/shared-agent-ops run typecheck`                                                                                                                                                                                                                                                                                           | PASS, 0 errors.                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/shared-agent-ops build`                                                                                                                                                                                                                                                                                                   | PASS, JS and declarations; rebuilt before final consumer checks.                                                                                                                                                                                                                                                                       |
| `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueRefill.test.ts`                                                                                                                                                                                                                                                                 | New grace regressions: **2 failed / 10 passed**, both stuck at one active slot before the fix.                                                                                                                                                                                                                                         |
| `pnpm --filter @buildos/worker exec vitest run tests/supabaseQueueRefill.test.ts tests/supabaseQueueDrain.test.ts tests/agenticChatShutdownDrain.test.ts`                                                                                                                                                                                         | **28 passed** after the queue fix.                                                                                                                                                                                                                                                                                                     |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatStalledRecovery.test.ts`                                                                                                                                                                                                                                                          | First deadline regressions: **5 failed / 22 passed**, then **27 passed**. Self-review added wrapped-abort variants: **2 failed / 28 passed**; both pass in the final run below.                                                                                                                                                        |
| `pnpm --filter @buildos/worker exec vitest run tests/embedEntityWorker.test.ts`                                                                                                                                                                                                                                                                   | **4 failed / 1 passed** before the fix; **5 passed** after.                                                                                                                                                                                                                                                                            |
| `pnpm --filter @buildos/smart-llm exec vitest run src/response-parsing.test.ts`                                                                                                                                                                                                                                                                   | **3 failed / 31 passed** before the fix; **34 passed** after.                                                                                                                                                                                                                                                                          |
| `pnpm --filter @buildos/smart-llm build`                                                                                                                                                                                                                                                                                                          | PASS, JS and declarations.                                                                                                                                                                                                                                                                                                             |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatOpenRouterClient.test.ts`                                                                                                                                                                                                                                                         | Watchdog regression: **1 failed / 109 passed**. Adding the hedge case first exposed a test-constructor mistake (**2 failed / 109 passed**, including the existing watchdog failure); after correcting the harness, both regressions failed for the intended timeout/hedge behavior (**2 failed / 109 passed**). Fixed: **111 passed**. |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/worker-prompt-surface.test.ts`                                                                                                                                                                                                                                                | **11 passed** before and after strengthening the expected side.                                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/context/`                                                                                                                                                                                                                                                                        | **41 passed**, 5 files.                                                                                                                                                                                                                                                                                                                |
| `pnpm --filter @buildos/agentic-chat-runtime run typecheck`                                                                                                                                                                                                                                                                                       | PASS, 0 errors.                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/agentic-chat-runtime build`                                                                                                                                                                                                                                                                                               | PASS, JS and declarations, unchanged configured heap limit.                                                                                                                                                                                                                                                                            |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatBootstrap.test.ts tests/agenticChatConsumer.test.ts tests/supabaseQueueRefill.test.ts tests/supabaseQueueDrain.test.ts tests/agenticChatShutdownDrain.test.ts tests/agenticChatStalledRecovery.test.ts tests/agenticChatOpenRouterClient.test.ts tests/embedEntityWorker.test.ts` | Final **231 passed**, 8 files; includes the synchronous-abort fix.                                                                                                                                                                                                                                                                     |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                                                                                                                                     | PASS, 0 errors.                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                                                                                                                               | PASS, test type debt **0/0**.                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                                                                                                                                                                           | PASS, test type debt **0/0**.                                                                                                                                                                                                                                                                                                          |
| `pnpm --filter web run check`                                                                                                                                                                                                                                                                                                                     | PASS, **0 errors / 0 warnings**, run once.                                                                                                                                                                                                                                                                                             |

Additional checks: `pnpm check:doc-health:strict` passed with **0 dead-schema / 0 dead-path /
0 unstamped findings** across 1,736 tracked Markdown files. Scoped `git diff --check` passed.
No migration was needed, so migration rehearsal is not applicable to this assignment; no
unrelated Tasker 129 migration, config-default fix, or doc stamping was rerun or changed.

Final focused test total: **451 passed, 0 failed** across the five suites above (worker 231,
shared ontology 134, runtime context 41, parser 34, web parity 11); repeated runs are not added.
Every required bug has regression coverage observed failing before its fix and passing after.
Additional positive controls and edge variants are included in the final counts. The deletion, optional
parity-test strengthening and documentation edits are not claimed as behavioral red/green fixes.
The literal-prefix zero-count parser test also failed first because the result fields were absent.

### Self-check

- Reviewed the full owned diff and `git status --porcelain`, including comparison against
  pre-edit snapshots for files with pre-existing edits. Changes stay in the authorized files,
  adjacent tests, explicit documentation follow-up and tracker updates. Staged/concurrent
  edits were preserved; no calendar or gateway file was edited.
- Defaults: explicit `false` remains honored, and bootstrap forwards both true production
  defaults. The optional preview parameter's production default is documented at bootstrap.
- FSM chain: a global source-reference search found no remaining consumers of the removed
  exports; used facet types stay. Byte comparisons confirm state/facet, ProjectSpec, document-tree and
  entity schema bodies are unchanged.
- Queue: resolve/reject within grace retains the original retry semantics; late resolve/reject
  after grace cannot complete/fail the relinquished row. Fake timers prove heartbeats stop.
- Recovery: all three hang points stop at one deadline with 16 handoffs and another batch
  available; synchronous abort wrapping is covered, the next sweep runs, timers are cleared,
  and existing ordinary-error convergence tests pass.
- Embeddings: soft/hard deletion, live entities, unrelated chunks and read/delete failures are
  covered with an in-memory database double and mocked embeddings.
- Stream: multibyte characters, every two-chunk tag split, a long unclosed block, literal
  prefixes, 20 seconds of hidden generation, false hedges and first-progress deadlines are
  covered. No hidden text is emitted or retained beyond the existing bounded tag tail.
- Optional parity: the expected surface is built through production preparation and admission;
  all model calls remain intercepted by the test mock.
- Docs: operational references were removed; dated historical material and the privacy
  inventory were left alone.
- No new semantic regex or keyword classification, paid/live model call, production write,
  migration application, deployment, commit, stash, reset, revert, checkout or spawned agent.

### 4. DJ follow-up

No action expected for this assignment beyond Claude's light review. The migrations authored
by other trackers retain their own independent review/application instructions.
