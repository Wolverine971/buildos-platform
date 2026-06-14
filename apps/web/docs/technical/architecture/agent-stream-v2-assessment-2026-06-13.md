<!-- apps/web/docs/technical/architecture/agent-stream-v2-assessment-2026-06-13.md -->

# Agent Stream V2 Route — Progress Check & Remaining-Work Assessment

**File:** `apps/web/src/routes/api/agent/v2/stream/+server.ts`
**Date:** 2026-06-13
**Companion to:** `agent-stream-v2-assessment-2026-05-25.md` (original) and `agent-stream-v2-concern-map-2026-05-29.md` (plan)
**Scope:** Status check after the Layer E + Layer B cleanup work. Read-only — no code changed for this doc. Answers one question: _is the next part worth doing?_

---

## Where we are

- **Route file: 5,212 lines** (down from **5,985** at the start — **−773**, ~13%).
- Split today:
    - Imports + helpers: lines `1–2313` (~2,313)
    - **`POST` handler: lines `2314–5212` (~2,899) — still one single async scope.**
    - `GET` warmup: unchanged, ~15 lines.

### What shipped (all merged to `main`, tree clean)

**Layer E (collapse/cut):**

- Deleted dead `_emitContextOperations` + orphaned `emitOperation`/`OPERATION_ENTITY_TYPES`/`isOperationEntityType`.
- Extracted `emitErrorThenDone` (collapsed 5 deny-path triplets).

**Layer B (pure-helper extraction into `$lib/services/agentic-chat-v2/*`), each with unit tests:**

- `agent-state-sanitization.ts` (8 tests)
- `tool-trace.ts` (16 tests)
- `tool-project-id.ts` (11 tests)
- `access-checks.ts` (12 tests)

**Also appeared (other work, while away):** `attachments.ts`, `context-cache.ts`, `context-loader.ts`, `prepared-prompt-cache.ts` now exist as sibling modules.

**Adjacent fixes landed:** the `tool-surface-size-report` budget fix, and three rescued bugfixes (admin chat failure counting, `domain_load` id normalization, calendar month identity).

---

## The honest read: two very different jobs remain

### Job 1 — Remaining pure-helper extractions (~900 lines, LOW risk)

Still inline in the route, mechanical to pull, test-protected:

| Helper                                                      | Lines (approx)     | Target module                                      |
| ----------------------------------------------------------- | ------------------ | -------------------------------------------------- |
| `loadValidatedChatAttachments`                              | ~180 (`524–703`)   | `attachments.ts` (exists — move into it)           |
| `createLiveVisionSignedImages`                              | ~121 (`746–866`)   | `live-vision.ts` (new)                             |
| `recordAgentChatMediaEvent`                                 | ~37 (`709–745`)    | `live-vision.ts`                                   |
| `buildContextToolSummary`                                   | ~190 (`1107–1296`) | `context-tool-summary.ts` (new)                    |
| `collectLastTurnEntitiesFromValue` + `buildLastTurnContext` | ~200 (`1700–1979`) | `last-turn-builder.ts` (new)                       |
| `consumePreparedPrompt`                                     | ~106 (`942–1047`)  | `prepared-prompt-cache.ts` (exists — move into it) |
| `buildToolResultSummaries`                                  | ~54 (`2020–2073`)  | `context-tool-summary.ts`                          |

Extracting all of these takes the route to **roughly ~4,300 lines**. It's the same safe pattern as the four shipped modules.

**But: diminishing returns.** The legibility win of "pure logic lives in tested modules" is already substantially banked. Another 900 lines of shaving makes the _top_ of the file shorter without touching the part that's actually hard to work in.

### Job 2 — The 2,899-line POST handler (HIGH value, HIGH risk)

This is the real bloat the **original** 2026-05-25 assessment named, and **none of the Layer B work has touched it.** It's a single async scope that runs the entire turn. Its internal phases (current line anchors):

| Phase                                                      | Lines (approx)     | What it does                                                                               |
| ---------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Setup / timing / SSE closures / `persistTurnRunFinalState` | `2314–2818`        | Request parse, abort controller, timed-emit helpers, turn-run finalizer closure            |
| Main turn IIFE opens                                       | `2819`             | `void (async () => { … })()` — everything below is one closure                             |
| Session resolve + active-turn singleton                    | `2980–3120`        | resolve session, detect/cancel stale running turns                                         |
| Tool select + history compose                              | `3184–3283`        | `selectFastChatTools`, `composeFastChatHistory`                                            |
| Turn-run insert                                            | `3284–3415`        | `chat_turn_runs` row + unique-running-turn handling                                        |
| Prompt context + lite envelope                             | `3613–3946`        | `loadFastChatPromptContext`, `buildLitePromptEnvelope`, domain sensing, live vision        |
| **`streamFastChat` call + callbacks**                      | `4004–4472` (~470) | `onToolCall` / `onToolResult` / `onSupervisorDecision` / `onDelta` — the coordination blob |
| Cancelled-path finalize                                    | `4566–4722`        | interrupted message, partial executions, last_turn/timing/done, checkpoint restore         |
| Success-path finalize                                      | `4723–5038`        | assistant message, executions, last_turn/timing/done, reconciliation, checkpoint resumed   |
| Error-path finalize (`catch`)                              | `5055–end`         | error/done, checkpoint restore                                                             |

The original target was a **~500–700 line orchestration spine** with phases extracted as named functions (`resolveTurnContext` → `composeTurnHistory` → `openTurnRun` → `runStreamingTurn` → `finalizeTurn`).

**Why it's risky:** this scope holds the hard-won concurrency correctness — active-turn singleton, supervisor checkpoint resume, three-channel cancel resolution, stream-detached-vs-aborted-vs-timeout, detached background persistence. Pulling phases out means threading ~30 closure-captured variables (timing marks, `streamDetached`, `turnAbortController`, checkpoint refs, `doneEmittedAtMs`, the `sendTimedMessage`/`recordTurnEvent` closures) through explicit parameters or a context object. Easy to introduce a subtle behavior change (e.g. a timing mark set at the wrong moment, or a finalize path that skips checkpoint restore). The existing `server.test.ts` (6 tests) covers the supervisor/checkpoint happy paths but is **not** broad enough to catch every finalize-path regression — it would need expansion _first_.

---

## Recommendation

**The "safe shaving" phase is at a reasonable stopping point.** 5,985 → 5,212 with four tested modules extracted is real, shippable progress, and the tree is clean.

Decide based on the actual pain:

1. **If working in this file is no longer painful** → **stop.** The remaining helper extractions are tidy-for-tidy's-sake. Bank the win.
2. **If the file still feels unworkable** → the thing worth doing is **Job 2 (the POST-handler phase split)**, NOT more helper shaving. But treat it as its own deliberate project:
    - First, **broaden `server.test.ts`** to cover all three finalize paths (cancelled / success / error) and the active-turn-conflict path — so the refactor has a safety net.
    - Then extract phases behind a single `TurnContext` object (carry the closures + mutable marks), one phase at a time, test-green between each.
    - Expect this to be a multi-session effort with a draft/review cycle, given the concurrency correctness involved.
3. **Helper shaving (Job 1)** is the middle option: low-risk, steady, but won't fix the core problem. Reasonable only if you want the import section tidy before tackling Job 2.

**Bottom line:** you do _not_ need to do the next part for correctness or stability — everything is green and shipped. The only reason to continue is if the 2,899-line POST handler is actively slowing you down, and if so, the helper-shaving is the wrong tool — go after the handler with a test net first.

---

## Status snapshot

- Tests: route `server.test.ts` 6/6; the four extracted modules 47 unit tests total — all green at last run.
- `svelte-check`: 0 errors / 0 warnings at last run.
- Branch: `main`, level with `origin/main`, clean working tree (code paths).
- Layer B: **4 of ~9** candidate modules extracted; ~900 lines of helpers + the POST handler remain.
