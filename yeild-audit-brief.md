<!-- yeild-audit-brief.md -->

## Agentic Chat Responsiveness & Yield Audit Brief (BuildOS)

### Goal

Scan the codebase for **UI-freeze / event-loop starvation / “no-yield” patterns** during long-running agentic operations (LLM calls, tool calls, subagent planning/execution, streaming + event emission). Identify:

- places that can **block the event loop**
- loops that run “too long” without yielding
- patterns that **starve timers / renders / IO**
- safe opportunities to add **cooperative yields**, **chunking**, and **backpressure**

Deliver:

1. A list of high-risk code paths with file/line references
2. Recommended fixes with minimal behavioral change
3. Trade-offs and perf implications
4. A “yield policy” proposal: consistent helpers + conventions

---

## 1) Key Concept: What “yield” means in Node/JS systems

A “yield” is a deliberate pause that allows:

- timers (UI throttles, scheduled renders, heartbeat)
- IO callbacks (websocket flush, stream reads)
- abort/cancel checks
- other queued tasks

Typical yields:

- **Macro-task yield:** `await new Promise(r => setTimeout(r, 0))` (adds small real delay)
- **check-phase yield:** `await new Promise(r => setImmediate(r))` (very fast, can still starve other work)
- **microtask yield:** `await Promise.resolve()` (often insufficient for UI/IO breathing room)

For “responsive UI + streaming” systems, prefer:

- `setTimeout(0)` (or occasionally `setTimeout(1..5ms)`) when you need “breathing room”
- yields integrated with **abort checks**
- yields batched to avoid huge overhead

---

## 2) Where to look: The “Starvation Hotspots” checklist

### A) Long-running loops (the #1 source)

Search for:

- `while (true)`, `for(;;)`, `while (...)` in agent runtime
- loops consuming async iterators / streams
- loops over message chunks / tool events / token streams

Red flags:

- loop body does significant work
- no `await` in the loop body (or `await` only on already-resolved promises)
- `continue` branches that bypass the only `await`
- nested loops: e.g. `for messages -> for blocks -> for content pieces`

What to do:

- add a yield in the loop (or every N iterations)
- ensure yields also occur on `continue` paths

**Heuristic:** any loop that can run > ~16ms continuously is a candidate.

---

### B) “Heavy sync work” inside async flows

Even if the function is `async`, you can still block if you do sync CPU work.

Search for heavy operations inside agent loop paths:

- `JSON.stringify` on large objects (or repeated)
- `JSON.parse` on large payloads
- deep cloning: `structuredClone`, `_.cloneDeep`, `immer` on big objects
- large object spreads: `{...bigObj}`, `array.map` + object allocations
- regex on huge strings, markdown parsing, AST parsing
- crypto/compression: `zlib` sync variants, hashing large buffers
- sorting large arrays repeatedly
- O(n²) patterns (nested loops, repeated `shift()`/`unshift()`)

What to do:

- move heavy work **off the critical event loop path**
- chunk it and yield between chunks
- precompute once, memoize, or stream/serialize incrementally
- use async variants (where applicable)

---

### C) “Callback storms” / event emission storms

You mentioned “emitting events back to the front-end.” That’s a classic place to lock up:

- tight loops calling `emit(...)` repeatedly
- per-token/per-chunk emitting without throttling
- many nested subagents all emitting concurrently

Search for:

- `emit`, `publish`, `send`, `dispatch`, `observer.next`
- websocket writes, SSE `res.write`, stream `controller.enqueue`
- event bus patterns

Red flags:

- emission inside nested loops
- emission per token with no batching/throttling
- building huge payloads repeatedly
- no backpressure handling (`write()` return value ignored, queue grows unbounded)

What to do:

- batch events (e.g., accumulate for 16–50ms then flush)
- coalesce updates: “latest state wins”
- apply backpressure: if queue is large, drop low-priority updates or compress
- yield between emission batches

---

### D) Tool calls & subagent orchestration

Subagents create fan-out + nested loops.

Search for:

- recursive agent spawning
- parallel `Promise.all` of many tasks without concurrency limit
- nested streaming pipelines that multiplex outputs

Red flags:

- no concurrency cap (can saturate CPU and memory)
- subagents sharing a single hot event channel with no throttling
- parent agent doing expensive merges of subagent outputs frequently

What to do:

- concurrency limits (p-limit style)
- per-subagent buffers + periodic flush
- define “priority”: UI responsiveness > background completion

---

### E) Abort/cancel is missing or checked too rarely

If you yield but never check abort, cancellation feels “stuck.”

Search for:

- abort controllers, `signal.aborted`, `throwIfAborted()`
- request disconnect detection
- SSE/websocket close detection

Red flags:

- abort only checked at the end of big operations
- subagents ignore abort
- abort isn’t propagated into tools

What to do:

- build a standard helper: `yieldWithAbortCheck()`
- check abort at key boundaries: per batch, before heavy ops, after yields

---

### F) Timers vs immediates: “yield that’s too fast”

Even if you yield, `setImmediate` can be so fast that your loop resumes and still starves timer-based systems (including render throttles, heartbeat timers, etc.).

Search for:

- yield implementations using `setImmediate`, `process.nextTick`, microtasks

Heuristic:

- If your UI/render/event flushing is timer-based, consider `setTimeout(0)` for yields in heavy loops.

---

## 3) Concrete “Yield Policy” to implement

### A) Standard helper: yield + abort check

Look for repeated ad-hoc yields and propose centralization.

Recommended pattern:

- `yieldWithAbortCheck({ mode, signal })`
- “mode” could be: `"breath"` (setTimeout 0), `"fast"` (setImmediate), `"micro"` (Promise.resolve)

Use `"breath"` inside heavy loops.

### B) Batch yields

Do not yield on every iteration if it’s a hot loop.
Recommend:

- yield every **N items** (e.g., 16/32/64)
- or yield every **T ms** (e.g., every 10–20ms)

### C) Yield boundaries (where to place yields)

Add yields:

- before/after heavy sync steps
- after processing each streamed chunk batch
- before sending big UI updates
- on “continue” branches that otherwise skip yields
- between subagent result merges

---

## 4) Backpressure & event delivery: what “nice” looks like

### A) Define event classes

- **High priority:** “user visible” progress, token stream, cancellations, errors
- **Low priority:** debug logs, internal traces, intermediate states

Policy:

- if under pressure, drop or coalesce low priority first

### B) Event batching strategy

- buffer events for a short interval (e.g., 16–50ms)
- flush them together
- ensure a final flush on completion

### C) Payload hygiene

- avoid shipping huge objects repeatedly
- send diffs or summarized forms
- cap arrays and histories (ring buffers)

---

## 5) Performance traps to explicitly search for (quick grep list)

Have the agent search for these keywords and inspect the surrounding code:

- `while (` / `for (` / `forEach(` / `map(` in hot paths
- `continue;` inside loops
- `JSON.stringify` / `JSON.parse`
- `structuredClone` / `cloneDeep`
- `shift(` / `unshift(`
- `sort(` inside loops
- `emit(` / `send(` / `dispatch(` / `res.write` / `enqueue(`
- `Promise.all(` without limits
- `setImmediate(` / `process.nextTick(` / `queueMicrotask(`
- `AbortController` / `.aborted` / `signal`
- `on("data")` stream handlers that do heavy sync work
- log spam in loops

---

## 6) Trade-offs to communicate in recommendations

### Yielding trade-offs

- **Pros:** UI responsiveness, cancelability, less perceived “freeze”
- **Cons:** slower total wall-clock, more scheduling overhead, more interleavings (race risk)

Mitigations:

- batch yields
- coalesce UI events
- avoid shared mutable state across yields (prefer snapshots / copies)

### setTimeout(0) vs setImmediate

- `setImmediate`: faster resume, good when you just want to let IO proceed
- `setTimeout(0)`: forces minimum delay, better for “breathing room” for timer-based scheduling (UI/flush/heartbeat)

Rule of thumb:

- if you want UI to feel alive, use `setTimeout(0)` in heavy loops
- if you want throughput and you’re not starving timers, `setImmediate` can be fine

### Immutability vs performance

- copying large structures helps correctness across async boundaries
- but can be expensive; use shallow copies + structural sharing where possible
- send snapshots to UI, avoid mutating after emission

---

## 7) Required output format from the audit agent

Ask the agent to produce:

1. **Top 10 high-risk hotspots**

- file path
- function name
- why it’s risky
- evidence (loop, heavy op, no yields, emission storm)

2. **Recommended patch**

- minimal change
- where to insert yields/batches
- whether to use `setTimeout(0)` or `setImmediate`
- abort propagation notes

3. **Quick wins vs deeper refactors**

- quick wins: yield helper, batch yields, throttle emission
- deeper refactors: streaming serialization, concurrency controls, backpressure architecture

4. **Yield policy + conventions**

- one helper
- consistent naming
- “no-heavy-sync in stream handlers” rule

---

## 8) Optional: instrumentation suggestions (if you want measurable proof)

If the codebase allows, propose adding:

- event loop lag monitor (measure delay vs expected)
- counters: yields per minute, max loop iteration without yield
- telemetry: “time between UI events”, “max synchronous block duration”
- “heartbeat render” event every 250ms; if missed → report starvation
