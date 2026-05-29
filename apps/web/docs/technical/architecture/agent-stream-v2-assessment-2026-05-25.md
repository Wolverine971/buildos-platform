<!-- apps/web/docs/technical/architecture/agent-stream-v2-assessment-2026-05-25.md -->

# Agent Stream V2 Route — File Assessment

**File:** `apps/web/src/routes/api/agent/v2/stream/+server.ts`
**Date:** 2026-05-25
**Scope:** Read-only assessment of file length and complexity. No code changes proposed beyond a refactor sketch.

---

## The numbers

- **5,961 lines total** in one route file
- **GET handler:** 15 lines (a warmup ping — fine)
- **Helpers:** ~80 functions across lines 286–2940 (~2,650 lines)
- **POST handler:** lines 2941–5960 (~3,020 lines, single async scope)

---

## What it's actually doing

The POST handler is the entire orchestration spine for one agentic streaming chat turn. It coordinates roughly 25 concerns in sequence:

1. Request parse + attachment normalization + per-turn image limits
2. Live-vision (multimodal) image plumbing — `onto_asset` vs `temporary_file` paths, signed-URL generation
3. SSE setup, turn `AbortController` with timeout, Supabase-polling cancel watcher
4. Access checks (project RPC with fail-closed fallback, daily-brief lookup)
5. Session resolve via `sessionService`
6. **Active-turn singleton enforcement** — find a running turn, deny if fresh, cancel if stale
7. **Supervisor checkpoint recovery** — restore stale "resuming" checkpoints, load active checkpoint, mark-resuming, inject a resume system message into history
8. Domain sensing + prior domain-state merge + research-backlog tracking
9. **Four-source context cache resolution:** `prepared_prompt` → `session_cache` → `request_prewarm` → `fresh_load` (with shift-hint bypass)
10. Lite prompt envelope build
11. History compose (lookback → compress → tail strategy)
12. Tool selection + surface-profile resolution
13. `chat_turn_runs` row insert with unique-running-turn constraint handling
14. User-message persistence + attachment linking
15. `chat_prompt_snapshots` insert for observability
16. `streamFastChat` orchestrator call with `onDelta` / `onToolCall` / `onToolResult` callbacks (~500 lines of inline callback handlers)
17. `chat_turn_events` inserts for every phase event
18. **Cancelled-path finalize:** interrupted assistant message, partial tool executions, `last_turn_context`, `timing`, `done`, turn-run final state, checkpoint restore
19. **Success-path finalize:** essentially the same 8 steps with different metadata
20. **Error-path finalize:** mostly the same 8 steps again
21. Background `agent_state` reconciliation
22. `timing_metrics` insert
23. Stream close in `finally`

The helpers cover: env parsing, cancel-reason resolution (3 channels), access checks, attachment validation + storage verification, live-vision signed URLs + media-event logging, project-id injection for tool args, context cache key/freshness/bypass logic, prepared-prompt cache consumption, agent-state UUID sanitization, daily-brief entity counting (~130 lines), last-turn entity extraction (~150 lines), tool-trace builder/classifier/summarizer (~150 lines), prompt cost breakdown plumbing, and turn-supervisor glue.

---

## Does it deserve its length?

**The work is real, but the file is not.** Maybe 1,200–1,800 lines of this is genuinely necessary; the rest is accidental complexity that comes from doing everything in one scope.

### What's genuinely justified

- The four-source cache precedence chain — that's real product logic
- Live-vision signed-URL flow with eligibility checks and media-event audit trail
- Supervisor checkpoint resume + active-turn singleton + stale-recovery (concurrency correctness for streaming + retries)
- Three-channel cancel-reason resolution (transient hint / session metadata / polling) with retry delay
- Stream-detached vs request-aborted vs timeout distinction
- Detached background persistence so SSE can close before all writes finish

### What's accidental and worth fixing

1. **~1,800 lines of pure helpers don't belong in a route file.**
   `buildContextToolSummary`, `buildLastTurnContext`, `buildPersistedToolTrace`, `sanitizeAgentStateForPrompt`, `loadValidatedChatAttachments`, `createLiveVisionSignedImages`, `recordAgentChatMediaEvent`, `consumePreparedPrompt`, the cancel-reason resolvers, the access checks — most have sibling modules under `$lib/services/agentic-chat-v2/*` where they'd naturally fit. They were almost certainly co-located so closures could capture `logFastChatError`, but that's solvable by passing it in.

2. **The cancelled / success / error finalize branches are ~90% duplicates.**
   Lines 5324–5502, 5504–5803, and 5804–5936. All three persist an assistant message, persist tool executions, emit `last_turn_context`, emit `timing`, emit `done`, write `chat_turn_runs` final state, and handle the supervisor checkpoint. Differences are: status string, metadata keys, idempotency suffix, fallback content. One `finalizeTurn({ status, reason, content })` helper would erase ~400 lines.

3. **The emit-error-then-done-then-close triplet repeats 5+ times.**
   Brief-id missing, brief-access denied, project-access denied, active-turn conflict, turn-run insert failed. Each is ~30 lines of two `sendTimedMessage` calls plus an `agentStream.close()`. One `denyAndClose(reason, message)` helper kills ~120 lines.

4. **The `sendTimedMessage` call sites carry a ton of repeated metadata.**
   `{ sessionId, contextType, entityId, projectId }` over and over. A closure-captured logger that already knows the turn context would remove a lot of the noise.

5. **The `streamFastChat` callback object is doing real coordination but reads as one ~480-line blob.**
   Roughly lines 4750–5230. The `onToolResult` handler alone is several screens of side-effects: recording events, persisting tool executions, emitting context shifts, noting first-help / first-skill / first-canonical-op, updating `chat_turn_runs`.

---

## A reasonable end state

- **Helpers** → split into `$lib/services/agentic-chat-v2/{access-checks, attachments, live-vision, context-cache-resolver, prepared-prompt-consumer, tool-trace, last-turn-builder, context-tool-summary, agent-state-sanitization}.ts`
- **POST proper** extracts five phases:
    - `resolveTurnContext`
    - `composeTurnHistory`
    - `openTurnRun`
    - `runStreamingTurn`
    - `finalizeTurn` (with status variant)
- POST handler shrinks from ~3,000 lines to **~500–700** lines of orchestration
- Whole file lands around **1,200–1,800** lines, mostly orchestration + the streaming-callback wiring that's genuinely hard to pull apart

**Bottom line:** the system deserves the lines, the file does not. Nothing here is gratuitous, but the route is currently doing the work of about 12 modules.
