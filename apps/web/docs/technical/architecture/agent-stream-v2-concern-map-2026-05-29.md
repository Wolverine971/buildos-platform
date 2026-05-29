<!-- apps/web/docs/technical/architecture/agent-stream-v2-concern-map-2026-05-29.md -->

# Agent Stream V2 Route — Concern Map & Refactor Plan

**File:** `apps/web/src/routes/api/agent/v2/stream/+server.ts`
**Date:** 2026-05-29
**Companion to:** `agent-stream-v2-assessment-2026-05-25.md`
**Scope:** Decision-level map of every concern in the route — essential vs optional vs cut — with line anchors, plus a staged refactor plan. This is the agreed scope document before code changes begin.

---

## Current shape

- **5,985 lines total** in one route file.
- Imports `1–158` · `GET` warmup `165–180` · env consts `159–271` · ~80 helpers `275–2953` · **`POST` `2955–5985`** (a single ~3,030-line async scope).
- The streaming + tool loop itself is already extracted into `streamFastChat` (`$lib/services/agentic-chat-v2/stream-orchestrator/`); the route's job is orchestration and wiring callbacks. The bloat is route-level, not streaming-layer.

### Legend

- **KEEP-CORE** — part of the irreducible agentic loop; must exist in any version.
- **KEEP-EXTRACT** — real and necessary, but belongs in a module, not the route.
- **KEEP-OPTIONAL** — a feature/perf layer that should be opt-in behind a flag/seam, not inlined.
- **DEFER** — keep, but riskiest to touch; isolate last.
- **CUT** — dead or collapsible.

---

## A. The irreducible spine (KEEP-CORE)

The "just an agentic loop + assemble context" core. ~600–800 lines of genuine orchestration.

| #   | Concern                                        | Lines                                      | Verdict   | Notes                                                                  |
| --- | ---------------------------------------------- | ------------------------------------------ | --------- | ---------------------------------------------------------------------- |
| 1   | Auth + parse + message/attachment validation   | `2960–3034`, `parseRequest 353`            | KEEP-CORE | Trivial.                                                               |
| 2   | Assemble context → lite prompt envelope        | `~4446–4469`                               | KEEP-CORE | "Assemble some contexts." Builder lives in `agentic-chat-lite/prompt`. |
| 3   | History composition (lookback→compress→tail)   | `3887–3948`; consts `182–201`              | KEEP-CORE | Delegable to `history-composer`.                                       |
| 4   | Tool selection + surface profile               | `selectFastChatTools ~3880`                | KEEP-CORE | The tool surface.                                                      |
| 5   | **The agentic loop** (`streamFastChat`)        | call `4775`; callbacks `4866–5255`         | KEEP-CORE | The product. Orchestrator already extracted.                           |
| 6   | SSE emit + text deltas                         | `emit* 1665–1892`, `onDelta 5232`          | KEEP-CORE | Reuse `SSEResponse` + orchestrator; do not hand-roll.                  |
| 7   | Open turn: persist user msg + create turn run  | `3980–4182`                                | KEEP-CORE | Non-negotiable for multi-turn.                                         |
| 8   | Finalize: persist assistant msg + done + close | `5256–5527` (success), `finally 5961–5982` | KEEP-CORE |                                                                        |

---

## B. Pure helpers that should leave the route (KEEP-EXTRACT)

Real logic, wrong location. ~1,800 lines. Each maps to a sibling module under `$lib/services/agentic-chat-v2/*`. These were inlined to capture the `logFastChatError` closure — pass the logger in and they lift out cleanly.

| Concern                                         | Lines                    | → target module                 |
| ----------------------------------------------- | ------------------------ | ------------------------------- |
| Access checks (project RPC fail-closed + brief) | `487–640`                | `access-checks.ts`              |
| Attachment validation + storage verify          | `642–833`                | `attachments.ts`                |
| Tool project-id injection                       | `1022–1084`              | `tool-project-id.ts`            |
| Last-turn context + entity collection           | `1894–2346` (~450 lines) | `last-turn-builder.ts`          |
| Context tool summary (incl. brief counting)     | `1416–1622`              | `context-tool-summary.ts`       |
| Tool trace build/classify/summarize             | `2348–2599`              | `tool-trace.ts`                 |
| Tool-execution persistence                      | `2656–2782`              | `tool-execution-persistence.ts` |
| Agent-state sanitization                        | `1345–1414`              | `agent-state-sanitization.ts`   |
| Prepared-prompt consume                         | `1199–1302`              | `prepared-prompt-consumer.ts`   |
| Context-cache resolve/normalize                 | `1086–1154`, `1304–1343` | `context-cache-resolver.ts`     |

---

## C. Necessary-but-concentrated correctness (KEEP-EXTRACT / DEFER)

The part a naive rewrite silently drops. Preserve it.

| Concern                                 | Lines                                                           | Verdict      | Why                                                             |
| --------------------------------------- | --------------------------------------------------------------- | ------------ | --------------------------------------------------------------- |
| 3-channel cancel resolution + watcher   | `363–485`                                                       | KEEP-EXTRACT | hint → metadata → poll, with retry delay. One module.           |
| Active-turn singleton + stale recovery  | `3677–3799`                                                     | DEFER        | Concurrency correctness for double-submit / refresh-mid-stream. |
| **Checkpoint resume (turn supervisor)** | `3478–3512`, `3801–3820`, `4087–4150`, `5120–5231`, `5790–5827` | DEFER        | Biggest complexity multiplier. Touch last, behind its own seam. |
| Stream-detached vs aborted vs timeout   | `3100–3176`, `5828–5860`                                        | KEEP-CORE    | Distinct finalize semantics; must survive.                      |
| Detached background persistence         | `detachFastChatTask 2783`                                       | KEEP-CORE    | Lets SSE close before writes finish.                            |

---

## D. Feature/perf layers — make opt-in, not inline (KEEP-OPTIONAL)

Should sit behind a flag and a clean function boundary so the spine reads clean with them removed.

| Concern                                                 | Lines                                     | Flag                                              | Verdict                           |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- | --------------------------------- |
| 4-source context cache (prepared→session→prewarm→fresh) | `1086–1343`, `consumePreparedPrompt 1199` | prepared-prompt prewarm                           | KEEP-OPTIONAL                     |
| Live vision (signed images + media events)              | `835–996`, `4523–4564`                    | `AGENT_CHAT_LIVE_VISION_ENABLED` (off by default) | KEEP-OPTIONAL                     |
| Domain sensing + session-state merge                    | `3828–3839`, `4459–4468`                  | —                                                 | KEEP-OPTIONAL                     |
| Observability (snapshots/timing/cost/skill activity)    | `3111–3304`, `4604–4731`                  | —                                                 | KEEP-EXTRACT — behind one emitter |
| Agent-state reconciliation (background)                 | `5685–5727`                               | —                                                 | KEEP-OPTIONAL — already detached  |

---

## E. Collapse / cut (CUT) — the first PR

| Concern                                                                              | Lines                                                                   | Action                                        | Saves      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| **3 near-duplicate finalize branches** (cancelled / success / error)                 | `5349–5527` / `5527–5790` / `5828–5961`                                 | One `finalizeTurn({status, reason, content})` | ~400 lines |
| **emit-error→done→close triplet ×5**                                                 | brief-missing, brief-denied, project-denied, turn conflict, insert-fail | One `denyAndClose(reason, msg)`               | ~120 lines |
| Repeated `sendTimedMessage` metadata `{sessionId, contextType, entityId, projectId}` | call sites throughout                                                   | Context-bound logger closure                  | noise      |
| **`_emitContextOperations` — DEAD** (1 ref = its own definition)                     | `2841–2953`                                                             | Delete                                        | ~110 lines |

---

## Line budget (rough)

- **~700 lines** — true spine (A).
- **~1,800 lines** — real logic in the wrong file (B), mechanical extraction.
- **~600 lines** — correctness to preserve (C); the rewrite trap.
- **~500 lines** — opt-in layers (D); should be removable from the spine's view.
- **~630 lines** — pure collapse/dead (E); free wins.

A from-scratch spine can own **A + the seams for D**, but it must _call into_ B and C rather than re-deriving them. `djtryserver.ts` looked clean only because it implemented one-third of A and none of C.

---

## Staged plan

1. **Layer E (this PR):** delete dead `_emitContextOperations`; collapse 3 finalize branches into `finalizeTurn`; collapse 5 deny triplets into `denyAndClose`; context-bound logger. Target ~5,985 → ~3,000 lines, **tests green, zero behavior change.**
2. **Reassess** after E: re-map line ranges, decide extraction order.
3. **Layer B:** lift pure helpers into `$lib/services/agentic-chat-v2/*` modules (pass logger in).
4. **Layer D:** put feature/perf layers behind clean seams/flags.
5. **Layer C (last):** isolate active-turn singleton + checkpoint resume behind their own modules.

---

## Progress log

### 2026-05-29 — Layer E (partial), branch `refactor/agent-stream-v2-layer-e`

Two safe, behavior-preserving cuts landed; the finalize collapse was deferred after the code turned out to be already partially refactored.

- **`623680e2` — Remove dead `_emitContextOperations` + orphans.** Deleted the never-called `_emitContextOperations` (~113 lines) and the helpers it transitively kept alive (`emitOperation`, `OPERATION_ENTITY_TYPES`, `isOperationEntityType`) plus the now-unused `OperationEventPayload` import. **5985 → 5834.**
- **`d46e4787` — Extract `emitErrorThenDone`.** Collapsed the repeated emit-error → mark-done → emit-done core across 5 early-exit paths (brief-missing, brief-denied, project-denied, active-turn-running, turn-run-insert-failed). Each caller keeps its own distinct tail (stream close / cancel-watcher teardown / timing metric). **5834 → 5773.**

Verification after both: route tests **6/6 green**, `svelte-check` **0 errors / 0 warnings**. Net so far: **5985 → 5773 (−212 lines)**, zero behavior change.

#### Finalize collapse — DEFERRED (premise stale)

The 2026-05-25 assessment described "3 inline finalize branches, ~90% duplicate, ~400 lines." That is **no longer accurate** — the code has already been refactored since then:

- The cancelled/interrupted path is **already** its own closure, `finalizeInterruption` (~5334–5480).
- The shared sub-steps are **already** extracted helpers: `persistToolExecutionRows`, `buildLastTurnContext`, `persistTurnRunFinalState`, `queueTimingMetric`, `restoreResumingSupervisorCheckpoint`.
- What remains is three branches (interrupted / success `else` / error `catch`) that orchestrate those shared helpers with **genuinely different** metadata builders (`interruptedMetadata` vs `buildAssistantMessageMetadata` vs error metadata), `interrupted: true` flags, `finished_reason`s, checkpoint semantics (restore vs resumed vs restore), and reconciliation-var capture.

Collapsing them into one parameterized `finalizeTurn({status, …})` would now save only **~60–100 lines, not 400**, and would push all those real divergences into conditional branches inside one function — which risks _reducing_ clarity on the hottest code path (every turn's persistence + checkpoint + timing). **Recommendation:** do it as its own focused PR with fresh analysis, or skip in favor of higher-value Layer B extraction. Not worth bundling into the safe Layer E cuts.

**Status:** Layer E safe cuts shipped (`623680e2`, `d46e4787`). Finalize collapse deferred. Next decision: Layer B extraction vs. revisit finalize.
