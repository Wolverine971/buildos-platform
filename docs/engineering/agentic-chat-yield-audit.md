<!-- docs/engineering/agentic-chat-yield-audit.md -->

# Agentic Chat Responsiveness & Yield Audit (BuildOS)

Date: 2026-02-05
Auditor: Initial audit
Verified: 2026-02-05 (all issues confirmed via code review)
Scope: Agentic chat streaming and orchestration paths (planner, executors, SSE handling) with focus on event-loop starvation, UI freeze, and backpressure.

## Executive Summary

The highest-risk areas are hot loops that parse/emit streaming chunks without cooperative yields (client SSE parsing, server SSE parsing, planner loop), plus UI-side per-token updates that re-render large message arrays. Additional risk comes from unbounded concurrency in plan execution and executor spawning, and synchronous heavy parsing for large payloads (tool results and web page parsing). The fixes below are designed to be low behavioral change: introduce yield helpers, batch/flush events, and cap concurrency.

**Verification Status:** All 10 hotspots verified via code review. Line numbers adjusted where needed.

## Implemented Fixes (2026-02-05)

- Client token batching: buffered assistant text and flushed on `requestAnimationFrame`, with flush before non-text events and on completion/cancel. (`apps/web/src/lib/components/agent/AgentChatModal.svelte`)
- Client SSE yielding: added cooperative yields every ~64 lines / 16ms in `SSEProcessor.processStreamChunks`. (`apps/web/src/lib/utils/sse-processor.ts`)
- Server SSE yielding: added cooperative yields every ~64 lines / 16ms in `SmartLLMService` streaming parse loop. (`apps/web/src/lib/services/smart-llm-service.ts`)
- Server SSE batching: buffered SSE messages and flushed on a short timer or on terminal events, with a final flush before close. (`apps/web/src/routes/api/agent/stream/services/stream-handler.ts`)
- Planner loop yields: added cooperative yields during high-frequency planner streaming and tool stream event emission. (`apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`)
- Plan step concurrency cap: replaced unbounded `Promise.all` with a small worker pool. (`apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`)

## Top 10 High-Risk Hotspots (with evidence)

1. Client token render thrash ✅ VERIFIED

- File: `apps/web/src/lib/components/agent/AgentChatModal.svelte:3072-3111`
- Function: `addOrUpdateAssistantMessage`
- Risk: per-token updates clone/replace `messages` array and concatenate strings; with rapid SSE token flow this can monopolize the UI thread.
- Evidence:
    - Line 3078: `const nextMessages = [...messages]` creates new array on every token
    - Line 3080-3082: Spreads existing message object and concatenates content
    - Lines 3090-3096: Falls back to `.map()` over all messages if index cache miss
    - **Impact:** For a 500-token response, creates 500 new arrays and triggers 500 Svelte reactivity cycles
- Severity: **HIGH** - directly affects perceived responsiveness

2. Client SSE parsing without yields ✅ VERIFIED

- File: `apps/web/src/lib/utils/sse-processor.ts:156-213`
- Function: `processStreamChunks` (private static method)
- Risk: tight loop over lines, JSON.parse per line; large chunks can block UI thread.
- Evidence:
    - Line 168: `while (!isDone)` outer loop
    - Line 178: `buffer.split('\n')` creates array
    - Line 181: `for (const line of lines)` inner loop with no yield
    - Line 193: `JSON.parse(data)` on every data line
    - **Key issue:** If network delivers 100+ lines in one chunk (buffered network), all are processed synchronously
- Severity: **MEDIUM-HIGH** - can cause 50-100ms blocks on large chunks

3. Server LLM SSE parsing without yields ✅ VERIFIED

- File: `apps/web/src/lib/services/smart-llm-service.ts:1543-1762`
- Function: streaming SSE parse loop inside `streamText` async generator
- Risk: event-loop starvation during large chunks; inner `for (const line of lines)` heavy parse and tool_call assembly.
- Evidence:
    - Line 1543: `while (true)` outer loop
    - Line 1548: `buffer.split('\n')` on each read
    - Line 1551: `for (const line of lines)` inner loop with no yield
    - Line 1645: `JSON.parse(data)` per line
    - Lines 1684-1734: Complex tool_call delta assembly logic per chunk
    - **Additional concern:** `pendingToolCalls` Map operations add overhead
- Severity: **HIGH** - server-side event loop starvation affects all concurrent requests

4. Per-event SSE emission without batching ✅ VERIFIED

- File: `apps/web/src/routes/api/agent/stream/services/stream-handler.ts:561-656`
- Function: `createEventHandler` returns callback invoked per event
- Risk: each event triggers a write; token-level events can create event storms.
- Evidence:
    - Line 561: Returns async callback function
    - Lines 566-606: Per-event timing metric updates (non-blocking but adds latency)
    - Line 651-653: `mapPlannerEventToSSE(event)` + `await agentStream.sendMessage(sseMessage)` on **every** event
    - **Impact:** For streaming text, every token is a separate SSE write → high syscall overhead
    - **Missing:** No batching, no coalescing, no backpressure detection
- Severity: **MEDIUM-HIGH** - creates network overhead and potential client-side event storm

5. Planner loop emits without yield/batching ✅ VERIFIED

- File: `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts:798-1019`
- Function: `runPlannerLoop` async generator
- Risk: continuous `yield` of text/tool events, plus tool stream events emission, without explicit yielding or batching; can starve other tasks.
- Evidence:
    - Line 798: `while (continueLoop)` outer loop
    - Lines 840-879: `for await (const chunk of this.enhancedLLM.streamText(...))` - yields per chunk
    - Lines 986-990: `for (const event of result.streamEvents) { yield event; }` - synchronous loop yields
    - **Key issue:** The `for await` yields naturally but the inner synchronous loops don't
    - **Abort handling present:** Lines 799-800, 858-860, 886-888 check abort signal (good!)
- Severity: **MEDIUM** - has abort checks but could benefit from batching stream events

6. Plan step fan-out uses Promise.all ✅ VERIFIED

- File: `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts:641-685`
- Function: `executePlan` async generator (step execution section)
- Risk: unbounded concurrency for group steps; can saturate CPU/memory and starve event loop.
- Evidence:
    - Line 641: `const stepOutcomes = await Promise.all(`
    - Line 642: `runnableSteps.map(async (step) => { ... })`
    - Lines 648-654: Each step executes `this.executeStep(...)` potentially with multiple tool calls
    - **No concurrency limit:** If plan has 10 runnable steps, all 10 execute simultaneously
    - **Compounding:** Each step may spawn its own parallel tool calls (see hotspot 7)
- Severity: **HIGH** - can cause memory spikes and request timeouts under load

7. Step event buffering increases memory and delays feedback ✅ VERIFIED

- File: `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts:1483-1631`
- Function: `executeStep` private method
- Risk: `emittedEvents` accumulates tool events (including tool stream events) before emitting; can become huge and delay user-visible updates.
- Evidence:
    - Sequential path (lines 1484-1551):
        - Line 1517: `emittedEvents.push(callEvent)`
        - Line 1529: `emittedEvents.push(resultEvent)`
        - Lines 1532-1534: `for (const event of toolResult.streamEvents) { emittedEvents.push(event); }`
    - Parallel path (lines 1552-1626):
        - Line 1582: `emittedEvents.push({ type: 'tool_call', toolCall })`
        - Line 1599: `emittedEvents.push({ type: 'tool_result', result: toolResult })`
        - Lines 1601-1604: Pushes all stream events
    - Line 1631: Returns `{ result: resultPayload, events: emittedEvents }` - entire batch at once
    - **Impact:** User sees no feedback until all step tools complete; events emitted in burst
- Severity: **MEDIUM** - delays perceived progress, memory grows linearly with step complexity

8. Executor concurrency is not enforced ✅ VERIFIED

- File: `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts:48-129`
- Function: `spawnExecutor` and `ExecutorCoordinatorOptions` interface
- Risk: documented `maxConcurrency` not enforced; multiple executor tasks can flood resources.
- Evidence:
    - Lines 48-52: Option definition with explicit comment: "(not currently enforced – reserved for future enhancements)"
    - Line 63: `private activeExecutors = new Map<string, Promise<ExecutorResult>>()` tracks executors
    - Lines 74-128: `spawnExecutor` adds to map without checking `this.options.maxConcurrency`
    - **Dead code path:** `maxConcurrency` is accepted but never read or enforced
- Severity: **MEDIUM** - can cause resource exhaustion when many executors spawn concurrently

9. Deep recursive entity extraction on large tool results ✅ VERIFIED

- File: `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:901-947`
- Function: `extractEntitiesFromResult` (public method)
- Risk: synchronous recursive traversal; large payloads block event loop.
- Evidence:
    - Line 905: `const findIds = (obj: any, depth = 0): void => {`
    - Line 906: `if (depth > 10 || !obj) return;` - depth limit only, no size/time budget
    - Lines 908-909: Array iteration with recursive call per element
    - Lines 917-918: `Object.keys(obj).filter(...)` on every object
    - Lines 937-940: `for (const value of Object.values(obj)) { ... findIds(value, depth + 1) }`
    - **Worst case:** Object with 1000 keys at depth 1, each with 10 nested objects → ~10k recursive calls
    - **Missing guards:** No check for circular references (could infinite loop despite depth limit), no size cap
- Severity: **MEDIUM** - blocks event loop for large tool results like project graphs

10. Web visit HTML parsing is sync and regex-heavy ✅ VERIFIED (Lower severity than initially assessed)

- File: `apps/web/src/lib/services/agentic-chat/tools/webvisit/parser.ts:55-89`
- Functions: `stripTagBlocks`, `extractLargestBlock`, `extractLinks`, `parseHtmlToText`
- Risk: regex-heavy parsing on full HTML can block event loop for large pages.
- Evidence:
    - Lines 55-62: `stripTagBlocks` - loop over tags array, regex replace per tag
    - Lines 64-76: `extractLargestBlock` - `while ((match = regex.exec(html)))` loop
    - Lines 240-279: `extractLinks` - regex exec loop over entire HTML
    - Lines 281-316: `parseHtmlToText` - multiple passes: stripTagBlocks, extractMainHtml, htmlToText
    - **Mitigating factors:**
        - Uses `sanitize-html` library which is reasonably optimized
        - `maxLinks` cap (default 20) limits link extraction loop
        - `extractLargestBlock` short-circuits after finding largest match
    - **Real risk:** Pages > 500KB could cause 100ms+ blocking
- Severity: **LOW-MEDIUM** - less severe than initially thought due to caps, but still sync

## Recommended Fixes (minimal behavioral change)

### A) Cooperative yields and batching

- Add a yield helper (server and client):
    - `yieldWithAbortCheck({ signal, mode })`
    - mode `"breath"` = `setTimeout(0)` (UI/stream paths)
    - mode `"fast"` = `setImmediate` (backend throughput)
    - mode `"micro"` = `Promise.resolve()`
- Insert yields in:
    - `SSEProcessor.processStreamChunks` every 32-64 lines or 10-20ms.
    - `SmartLLMService` stream parse loop every 32-64 lines or 10-20ms.
    - `AgentChatOrchestrator.runPlannerLoop` every N chunks and when iterating `result.streamEvents`.

### B) Event batching/backpressure

- Stream handler (`createEventHandler`) should batch text events and flush every 16-50ms.
- Coalesce low-priority events (debug/telemetry) when queue is large.
- For UI: buffer tokens and flush on `requestAnimationFrame` to avoid per-token array rebuild.

### C) Concurrency limits

- Replace `Promise.all` in `executePlan` with a small pool (p-limit style, 2-4 concurrent).
- Enforce `ExecutorCoordinatorOptions.maxConcurrency` before launching new executors.

### D) Size guardrails for heavy sync work

- Cap entity extraction and HTML parsing by size/time:
    - Skip or truncate `extractEntitiesFromResult` if payload is above size threshold.
    - For webvisit, early return with a warning if HTML length exceeds threshold; consider parsing in a worker for large pages.

## Trade-offs and Performance Implications

- Yields: better responsiveness and cancelability, slightly slower wall-clock and more interleavings.
- Batching: smoother UI and lower overhead, slightly increased latency for individual updates.
- Concurrency limits: stability and predictable load at the cost of throughput for large plans.
- Payload caps: prevents freezes but may reduce data fidelity in edge cases.

## Proposed Yield Policy (conventions + helper)

### Helper

```
async function yieldWithAbortCheck({ signal, mode = 'breath' }: { signal?: AbortSignal; mode?: 'breath' | 'fast' | 'micro' }) {
  if (signal?.aborted) throw new Error('aborted');
  if (mode === 'micro') {
    await Promise.resolve();
  } else if (mode === 'fast') {
    await new Promise<void>((resolve) => setImmediate(resolve));
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw new Error('aborted');
}
```

### Conventions

- Yield every 32-64 iterations or every 10-20ms in hot loops.
- Always check abort before and after yields.
- Batch event emissions (text, tool results, telemetry) on a short timer (16-50ms).
- Avoid heavy sync work in streaming callbacks; if unavoidable, chunk + yield.

## Quick Wins vs Deeper Refactors

### Quick Wins

- Add yields in SSE parsing loops (client + server).
- Buffer tokens client-side (RAF flush) before touching `messages`.
- Add small concurrency caps for plan steps and executors.
- Cap entity extraction + HTML parsing by size.

### Deeper Refactors

- Centralized event queue with priority + backpressure.
- Stream events directly from `executeStep` instead of buffering.
- Move heavy parsing to worker threads.

## Optional Instrumentation (if desired)

- Event loop lag monitor (server + client) with alerts when lag > 50ms.
- Metrics: max iteration count without yield, time between UI events, queue sizes.
- Heartbeat event every 250ms; missing heartbeat implies starvation.

---

## Prioritized Action Items (Post-Verification)

Based on code review verification, here are prioritized fixes ordered by impact and effort:

### P0 - Critical (Fix First)

| Issue                         | File                            | Effort | Impact                     |
| ----------------------------- | ------------------------------- | ------ | -------------------------- |
| #1 Client token render thrash | AgentChatModal.svelte:3072-3111 | Medium | HIGH - Direct UX impact    |
| #3 Server SSE parsing         | smart-llm-service.ts:1543-1762  | Low    | HIGH - Affects all users   |
| #6 Promise.all unbounded      | plan-orchestrator.ts:641-685    | Low    | HIGH - Resource exhaustion |

### P1 - High Priority

| Issue                   | File                           | Effort | Impact      |
| ----------------------- | ------------------------------ | ------ | ----------- |
| #2 Client SSE parsing   | sse-processor.ts:156-213       | Low    | MEDIUM-HIGH |
| #4 Per-event emission   | stream-handler.ts:561-656      | Medium | MEDIUM-HIGH |
| #8 Executor concurrency | executor-coordinator.ts:48-129 | Low    | MEDIUM      |

### P2 - Medium Priority

| Issue                    | File                                | Effort | Impact |
| ------------------------ | ----------------------------------- | ------ | ------ |
| #5 Planner loop batching | agent-chat-orchestrator.ts:798-1019 | Medium | MEDIUM |
| #7 Step event buffering  | plan-orchestrator.ts:1483-1631      | High   | MEDIUM |
| #9 Entity extraction     | tool-execution-service.ts:901-947   | Low    | MEDIUM |

### P3 - Lower Priority

| Issue                 | File                     | Effort | Impact     |
| --------------------- | ------------------------ | ------ | ---------- |
| #10 Web visit parsing | webvisit/parser.ts:55-89 | Medium | LOW-MEDIUM |

### Suggested Implementation Order

1. **Create yield helper** (`$lib/utils/yield.ts`) - enables all other fixes
2. **Fix #6** - Add p-limit (2-4 concurrent) to plan step execution
3. **Fix #8** - Actually enforce `maxConcurrency` in executor coordinator
4. **Fix #3** - Add yield every 32-64 lines in server SSE parsing
5. **Fix #2** - Add yield every 32-64 lines in client SSE parsing
6. **Fix #1** - Buffer tokens with RAF flush before updating messages array
7. **Fix #4** - Batch SSE emissions on 16-50ms timer
8. **Fix #9** - Add size cap (100KB) to entity extraction, skip large payloads

### Notes from Verification

- Abort signal handling is **good** in planner loop (issue #5) - already checks at key boundaries
- The executor concurrency option exists but is explicitly marked as unimplemented (issue #8)
- Web visit parser (#10) has some built-in caps that reduce severity
- Entity extraction (#9) has depth limit but no size limit - could still cause issues with wide objects
