<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_GRACEFUL_ERROR_HANDLING_AUDIT_2026-07-07.md -->

# Agentic Chat — Graceful Error Handling Audit — 2026-07-07

**Companion to:** `AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md` (and its predecessor). Those docs asked _"does this produce wrong data / can it be exploited?"_ and covered the correctness/data-loss/security surface deeply. **This doc asks a different question:** _when something goes wrong mid-conversation, does the system anticipate it, degrade gracefully, tell the user something useful, stay diagnosable, and recover?_ Graceful error handling is a distinct property from correctness — a turn can lose no data and leak nothing and still leave the user staring at a spinner for five minutes, then retype their message.

**Method:** Five parallel deep-dive passes over current source (the code has moved since 2026-07-01 — notably `smart-llm` was refactored `openrouter-v2-service.ts` → `smart-llm-service.ts`, so several prior-audit line refs are stale and are re-cited here): (1) client/SSE failure UX, (2) tool/turn error message quality & taxonomy, (3) LLM provider-failure degradation, (4) context/dependency-failure graceful degradation, (5) error observability & conversation recovery. Every finding is `file:line` and marked **CONFIRMED** (code path traced) or **SUSPECTED**. The two load-bearing claims (G1, G7) were independently re-verified by hand while writing this doc.

**Relationship to the prior fix waves:** the 2026-07-01 doc's Waves 1–2 shipped (data integrity, cancellation-on-write, crash-recovery scaffolding) and Wave 3 (security) is queued. This audit's findings are largely **orthogonal** to those — they sit in a proposed **Wave E (Graceful Errors)** that can run alongside Wave 3. One prior finding regressed and reappears here (G7 = D11).

---

## The headline — two root patterns

Almost every gap below is an instance of one of two patterns. Fixing the patterns is worth more than fixing the individual findings.

### Pattern 1 — Failure information is computed at the point of failure, then flattened or discarded before it reaches the layer that must act on it.

The system _knows_ what went wrong at the moment it happens, and then throws that knowledge away:

- The 285s watchdog knows the turn **timed out** (`turnAbortReason = 'timeout'`) — but the classifier reduces it to `signal.aborted`, so a timeout is recorded as a **user cancel** (G1).
- The tool-execution layer computes a precise `errorType` (`'timeout' | 'validation_error' | 'cancelled' | …`) — but the `ChatToolResult` boundary has no field for it, so the model gets a bare English string and downstream code **re-guesses the class by substring-matching prose** (G4/G5).
- The stream reader sees a mid-stream provider `error` frame / `finish_reason:'error'` — but yields it as a normal `done`, so a **truncated answer ships as success** (G7).
- Context assembly knows the load **threw** (`context_build_failed`) — but renders the same "no context loaded" string a genuinely empty project produces, so the model can't tell **"empty" from "broken"** (G6).

Graceful handling requires that the _cause_ survive — as a typed value, not reconstructed from a message — all the way to the four decision points that need it: **the model** (retry vs ask vs give up), **the user** (what happened, what to do), **the recovery logic** (retryable? preserve partial?), and **the operator** (queryable, alertable).

### Pattern 2 — Cancel is the one well-handled non-happy path. Everything that _isn't quite_ a cancel inherits its cosmetics but not its care.

The user-cancel path is genuinely good: it preserves the partial answer, tags it "Response interrupted," persists it server-side, and rolls back optimistic UI. But:

- A **timeout** gets cancel's _classification_ (`status='cancelled'`) but not cancel's _partial-text preservation_ and not an honest "it stalled, retry" — it's the worst of both (G1 + G3).
- A **mid-stream error** gets neither: the error path persists a `failed` turn-run row but **does not persist the streamed assistant text** the cancel path preserves — so an errored turn's partial output vanishes on reload while a committed round-1 write stays, inviting a duplicate on retry (G3).

The fix theme: **generalize the cancel path's care (preserve partial, honest terminal frame, clean rollback) to timeouts and errors, while giving each its own honest classification.**

---

## Severity summary

| #       | Finding                                                                                                        | Severity | Status                  |
| ------- | -------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| **G1**  | Server timeout (285s watchdog) misclassified as user cancel → `status='cancelled'`, no error log, no honest UX | **HIGH** | CONFIRMED (re-verified) |
| **G2**  | No inter-chunk idle / first-token / client-side stall watchdog → stalled provider = ~285s spinner              | **HIGH** | CONFIRMED               |
| **G3**  | Partial assistant text discarded on the error path (preserved on cancel) → lost output + duplicate-on-retry    | **HIGH** | CONFIRMED (×2 passes)   |
| **G4**  | Authoritative `errorType` discarded at `ChatToolResult`; `retryable`/`userRecoverable` are dead metadata       | **HIGH** | CONFIRMED               |
| **G5**  | Permission→`not_found` misclass; executor "X is required"→permanent `execution` → wrong retry/give-up          | **HIGH** | CONFIRMED               |
| **G6**  | Context-build failure served as an empty project — model can't tell "empty" from "broken"                      | **HIGH** | CONFIRMED               |
| **G7**  | **Regression of D11**: mid-stream `chunk.error` / `finish_reason:'error'` shipped as clean success             | **HIGH** | CONFIRMED (re-verified) |
| **G8**  | Generic "An error occurred while streaming." + no retry button + composer text lost on in-band error           | **HIGH** | CONFIRMED               |
| **G9**  | Dangling tool-call spinner survives turn finalize → "N actions" stuck spinning forever                         | MEDIUM   | CONFIRMED               |
| **G10** | No `error_type` on `chat_turn_runs`; error detail is fire-and-forget, uncorrelated, heuristic-typed            | MEDIUM   | CONFIRMED               |
| **G11** | No cross-session stale-turn sweeper + no user "reset stuck turn" + cancel can't unwedge a dead process         | **HIGH** | CONFIRMED               |
| **G12** | No chat failure-rate alerting — outage/broken-migration invisible until users complain                         | MEDIUM   | CONFIRMED               |
| **G13** | `web_search` (Tavily) has no timeout / no abort signal; streaming connect-timeout parity gap                   | MEDIUM   | CONFIRMED               |
| **G14** | No backoff/jitter/`Retry-After` on 429; account-scoped vs model-scoped 429 not distinguished                   | MEDIUM   | CONFIRMED               |
| **G15** | Best-effort observability writes swallow their own failures (terminal-status write can be silently dropped)    | MEDIUM   | CONFIRMED               |
| **G16** | Pre-stream terminal HTTP-error failure unlogged — the failure-logging block is dead code                       | MEDIUM   | CONFIRMED               |
| **G17** | `last_progress_at` heartbeat only fires on tool exec → LLM-bound stall never advances it                       | LOW/MED  | CONFIRMED               |
| **G18** | `sharedToolExecutor` throws away a tool's structured failure payload (only the string survives)                | LOW      | CONFIRMED               |

---

## Part 1 — The keystone chain (G1 + G2 + G3): a stalled provider is the worst real-world experience, and all three compose

This is the single highest-leverage area. Trace what happens today when OpenRouter (or a tool host) accepts the connection and then stalls with no bytes and no socket close — a common outage shape:

1. **The hang (G2).** There is no inter-chunk idle timeout in the stream reader (`smart-llm-service.ts:1987-1992` passes only `options.signal` to `fetch` — no `AbortSignal.timeout`), no first-token watchdog, and the client explicitly _disables_ its inactivity timer (`agent-chat-stream-controller.svelte.ts:652` sets `timeout: 0`; `sse-processor.ts:96-117`). The supervisor heartbeat (`index.ts:851-874`) only _observes_ every 12–15s — it checks `supervisorStopRequested` between passes, it cannot interrupt a blocked `reader.read()`. So the only thing that eventually fires is the **285s turn watchdog** (`+server.ts:258-261`, armed at `:2267-2269`). **The user watches a spinner for ~4m45s** with no progress and no error.

2. **The misclassification (G1 — CONFIRMED, re-verified).** The watchdog calls `abortTurn('timeout')`, which sets `turnAbortReason='timeout'` **and** fires `turnAbortController.abort()` (`+server.ts:2262-2269`). Now `signal.aborted === true`. The orchestrator's `isUserCancellation()` (`index.ts:369-374`) returns `true` **purely because the signal fired** — its own comment states "a user cancellation is defined solely by the abort signal firing." It cannot distinguish _our own timeout_ from _the user pressing Stop_. Result: `finishedReason='cancelled'`, the route persists `status='cancelled'` (`+server.ts:4370-4374, 4857-4882`), the abort branch logs only `logger.info('Agent V2 stream cancelled')` and **never writes an `error_logs` row**.

3. **The lost output + duplicate risk (G3 — CONFIRMED, ×2 passes).** The non-cancel error `catch` persists a `failed` `chat_turn_runs` row but **does not `persistMessage` the streamed assistant text** — only the _cancel_ branch does that (`+server.ts:4379-4424` cancel preserves; `:4850-4968` error does not). If round 1 already committed a write (`create_onto_task`, persisted incrementally by the D4 fix at `:3902-3909`) and round 2 stalls, the user sees a generic failure with **no indication a task was already created**, the "I created X…" prose is gone on reload, and retrying **creates a duplicate**.

**The user-visible net:** wait 5 minutes → see either a soft "cancelled"-looking stop or a partial answer that looks complete → assume it failed → retry → duplicate. **The operator-visible net:** a provider outage appears as a wall of `status='cancelled'` rows (looks like "users kept cancelling") with zero `error_logs` entries — **invisible**.

**Fix (one coordinated change):**

- **Classify the abort reason, don't collapse it.** Thread `turnAbortReason` into `finishedReason` and the persisted `chat_turn_runs.status`: a `'timeout'` abort is a **failure class** (`status='failed'` or a dedicated `'timed_out'`), not a cancel; write an `error_logs` row with `error_type='llm_timeout'`. Reserve the cancel path for `signal.aborted && turnAbortReason` is a genuine user reason.
- **Fail fast, not at 285s.** Add a first-token watchdog (~20–30s) and an inter-chunk idle timeout (~45–90s, reset on every `reader.read()` resolve) inside the stream reader; on fire, abort the reader and yield `{type:'error', error:'response stalled', retryable:true}`. Give the streaming `fetch` a bounded connect/headers timeout too (parity with non-streaming `openrouter-client.ts:62-68`).
- **Re-add a client stall watchdog.** Replace `timeout: 0` with a true _inactivity_ timeout (reset per event) that triggers the existing `startTurnReconciliation('transport_error')` path instead of hanging forever.
- **Preserve partial on error.** In the error catch, persist the accumulated assistant buffer with `interrupted:true, finished_reason:'error'` exactly like the cancel branch, and when committed writes exist, append a deterministic "Some changes were already applied (…); refresh before retrying" note.

---

## Part 2 — Tool-level error taxonomy is computed then discarded (G4, G5, G18)

There are **three uncoordinated error taxonomies**, and the most precise one never reaches the model:

1. `ToolExecutionResult.errorType` — the source-of-truth class (`'cancelled' | 'timeout' | 'execution_error' | 'tool_not_loaded' | 'validation_error'`) set _where the cause is known_ (`execution/tool-execution-service.ts:517,570,617,703`).
2. `ToolFailure.kind` — **re-derived by substring-matching the error prose** after the fact (`stream-orchestrator/tool-failure.ts`).
3. `errorClass` in `turn-supervisor/digest.ts:107` — a third string derived from #2.

**G4 — the authoritative class is dropped at the boundary (HIGH, CONFIRMED).** `ChatToolResult` (`packages/shared-types/src/chat.types.ts:295`) has only `error?: string` — no `error_type`. So `buildToolPayloadForModel` emits `{ error: "Tool execution timeout after 30000ms" }` with no class, no `retryable`, no `user_action`. Worse, `ToolFailure.retryable` / `userRecoverable` **are set on every failure and read _nowhere_ in production** (grep finds only the test file) — the taxonomy _looks_ rich but nothing branches on it. Retry-stopping is driven entirely by repeated-failure-key counting (`deterministic-supervisor.ts:176-184,300-309`), which a permanent failure with _slightly different args each retry_ evades → it burns the round budget and ends in a generic apology.

**G5 — the substring re-guessing mis-buckets the two classes that matter most (HIGH, CONFIRMED):**

- **Permission → `not_found`.** `tool-failure.ts:95` (`not found | missing`) is tested _before_ `:107` (`permission | unauthorized`), and the executor strings are `'Project not found or access denied'` / `'Entity not found or access denied'` (`base-executor.ts:313,370`). The `'not found'` substring wins → `kind:'not_found'`, `retryable:true`. A hard permission wall is labeled a transient missing-entity condition; the model may tell the user the task doesn't exist, or retry a call that can never succeed.
- **Executor validation → permanent `execution`.** Executors throw human prose like `'project_id is required for move_document_in_tree'` (`ontology-write-executor.ts:1132`), `'No updates provided for ontology task'` (`:1418`), `'create_onto_project requires entities'` (`:807`). The classifier looks for the literal `'Missing required parameter: X'` and `'no update fields provided'` — none match → falls through to `kind:'execution', retryable:false, userRecoverable:false`. The **most user-fixable** errors (a missing field the model can fill) are tagged as **permanent system failures**, so the supervisor's ask-user-for-missing-field path (`deterministic-supervisor.ts:337-383`) never fires.

**G18 — structured failure payloads are flattened to a string (LOW, CONFIRMED).** `sharedToolExecutor` does `throw new Error(result.error || …)` (`stream/+server.ts:3148-3150`), dropping any structured `result` guidance a `success:false` tool returned.

**Fix:** add `error_type` (+ `retryable`, `requires_user_action`) to `ChatToolResult`; thread `ToolExecutionResult.errorType` through unchanged; make `classifyToolFailure` a mapper _from the typed class_, not a prose matcher; gate the repair loop on `retryable` (permanent → skip retry, go straight to honest disclosure or ask-user). Add a single `describeFailureForModel(failure)` that maps class → a clean, path-free human sentence, so the model stops improvising over leaked route strings like `API POST /api/onto/documents failed: …`.

> **Related honesty gap — timeout ≠ failure (part of G1 at the tool level).** A tool timeout ("the PATCH may have committed but the response was slow") is currently rendered by `buildMutationFailureMessage` (`repair-instructions.ts:1046-1059`) as the false-certain _"I was unable to complete that update … Nothing changed yet."_ For a timeout the honest message is **"the request timed out; I'm not sure whether it applied — let me verify,"** and the supervisor should trigger a **read-back**, not a retry. Grep for `may have / not sure / uncertain` across the orchestrator/supervisor returns **zero hits** — there is no "outcome uncertain" concept anywhere.

**Already done well (keep):** `enforceMutationOutcomeIntegrity` + `appendWriteFailureDisclosure` (`repair-instructions.ts:198-264`) genuinely rewrite over-optimistic prose into honest per-op disclosure with a real `hasLaterSuccessfulRetry` check; validation repair prose _for gateway-validated errors_ is field-level and self-correctable. The taxonomy exists at the right place (`errorType`) — it just isn't propagated.

---

## Part 3 — Degraded context served as if complete (G6, HIGH, CONFIRMED)

`loadFastChatPromptContext` (`context-loader.ts:2855-3004`) has **no top-level try/catch**. Its per-query `if (error)` guards handle _returned_ Supabase errors gracefully (this part is well-built — every sub-fetch falls back to `?? []`), but a real connection failure (DNS, socket reset, pool exhaustion, `fetch failed`) makes `supabase.rpc(...)` / the fallback `Promise.all` **reject**, not return `{error}`. The reject is caught at `stream/+server.ts:3610-3624`, which sets `contextCacheSource='context_build_failed'`, logs, and **does not re-throw**. `systemPrompt` stays `undefined`; the orchestrator falls back to a minimal prompt built from only `{contextType, entityId, message}` (`index.ts:230-236`), and `serializeLoadedContext(null)` renders **the exact same string a genuinely empty project produces** ("no structured context payload was loaded for this seed"). The `context_usage` SSE event (emitted _after_ the throw point at `:3451`) never fires.

**Impact:** on a transient DB blip the model answers with **zero project context and no signal that context is missing** — indistinguishable from an empty project. It may confidently assert the project has no tasks/docs, or hallucinate.

**Fix:** give `loadFastChatPromptContext` its own top-level try/catch that returns `{…baseContext, data:null, contextLoadFailed:true}` so **"empty" and "failed" stay distinct** into the prompt; when `context_build_failed`, inject a degraded-mode system note ("Context failed to load this turn — do NOT assume the project is empty; tell the user context is temporarily unavailable and/or re-fetch via a read tool before answering") and emit a user-visible `degraded:true` notice.

**Already done well (keep):** RPC→fallback chaining, `asArray()`/null guards on malformed payloads, empty-state anticipation for new users, MCP client (`AbortController` timeout + structured `{status:'error'|'auth_required'|'ok'}`), calendar partial-degrade (returns ontology events + `warnings[]` on Google failure), prewarm prepared-prompt build isolation. The context layer is _mostly_ graceful — the one hole is that a hard throw degrades **silently** instead of **honestly**.

---

## Part 4 — Provider-failure degradation (G7, G13, G14, G16)

**G7 — Regression of D11 (HIGH, CONFIRMED, re-verified).** The prior audit marked D11 FIXED against `openrouter-v2-service.ts:1876-1913`; the `smart-llm` refactor into `smart-llm-service.ts` **lost the fix.** The current read loop (`:2494-2506`) has **no `chunk.error` branch** — a top-level `{"error":{…}}` SSE frame (how OpenRouter reports an upstream provider dying mid-stream) has no `choices` and falls through every `if`, silently ignored. `choice.finish_reason === 'error'` is captured into `terminalFinishReason` (`:2506`) and then **yielded as a normal `{type:'done', finished_reason:'error'}`** (`:2439`); the orchestrator's `done` handler never inspects it and takes the final-answer path. **A provider dying 40% into a synthesis ships mid-sentence text as a complete, successful answer.** Add: `chunk.error` detection + `finish_reason:'error'` → yield an error frame (or fail over if no text emitted yet), plus a regression test with a mid-stream `{error}` frame. _(Silver lining from the same refactor: the prior L-LLM2 "cleanup removes the abort listener after headers" bug is **gone** — cancel now propagates to `reader.read()`.)_

**G13 — sub-tool timeouts (MEDIUM, CONFIRMED).** `web_search` (Tavily) calls `fetcher(TAVILY_SEARCH_URL, …)` with **no `AbortSignal` and no timeout** (`tools/websearch/tavily-client.ts:24`) — contrast the MCP client and `web_visit`, which both use `AbortController + setTimeout`. A hung Tavily request ties up the tool round to the 300s cap and won't abort on user cancel. Also the streaming `fetch` lacks the connect/headers timeout the non-streaming path has (parity gap). Add an `AbortController` + timeout and thread `context.abortSignal` into `performWebSearch`/`performWebVisit`.

**G14 — 429 handling (MEDIUM, CONFIRMED).** The failover loop (`smart-llm-service.ts:1917-2046`) replays across all `preferredModels` **with zero delay and no `Retry-After`**; an account-scoped 429 (shared API key) fails _every_ lane instantly and burns N requests that can't succeed, while a model-scoped 429 (where switching _does_ help) is handled identically. Add jittered backoff, parse `Retry-After`, and distinguish account- vs model-scoped 429. _(Good property: failover is strictly pre-first-byte, so no double-emission / duplicate tool exec.)_

**G16 — pre-stream terminal failure unlogged (MEDIUM, CONFIRMED).** The failover `for` loop can only exit by `break` (ok) or an in-loop `return` at `:2045` that yields the error with **no `usageLogger`/`errorLogger` call**; the rich failure-logging block at `:2048-2131` is therefore **unreachable dead code**. Provider outages returning HTTP error _statuses_ on the streaming path leave **no `llm_usage_logs` failure row** — chat provider outages are invisible in usage telemetry. Move the logging into the terminal `yield` path.

**Already done well (keep):** model-not-available fails over cleanly (`isOpenRouterModelAvailabilityError`, `errors.ts:162-184`); double fallback (client lane loop + server-side `models` array); JSON path is more resilient than streaming (retry-with-stronger-model, `repairTruncatedJSONResponse`); 285s < 300s teardown margin with a 5s detached-flush budget; the whole turn runs in a detached IIFE whose outer catch always emits an SSE error+done pair and closes the stream (never 500s, never orphans the lambda).

---

## Part 5 — Client-side failure UX (G8, G9)

**G8 — generic copy, no retry, lost input (HIGH/MEDIUM, CONFIRMED).** Every server-side failure renders as the fixed string **"An error occurred while streaming."** (`+server.ts` terminal catch → `AgentChatModal.svelte:2351-2359`), with no cause, no severity, no correlation id. There is **no retry button anywhere on the streaming path** — the only "Try again" in the surface is for _session-load_ failure. And the composer text is cleared at send and only restored inside the _pre-response_ transport catch (`agent-chat-stream-controller.svelte.ts:703-710`) — an **in-band `{type:'error'}` frame** (genuine error, `active_turn_running`, access-denied) flows through `onProgress → handleError` and **does not restore the composer**, so the user must retype. Add: a "Retry" button that re-sends the last turn deduped by the existing `client_turn_id`; restore composer text on any error terminal; append a correlation id to the copy.

Two related client gaps confirmed by the same pass:

- **Abrupt close rendered as success.** `onComplete` fires on every reader close and decides terminal state from only `this.error ? 'error' : 'completed'` (`agent-chat-stream-controller.svelte.ts:632-648`) — it tracks `doneEventAtMs` but **never consults whether a `done` frame actually arrived.** A connection dropped after streaming text but before `done` is finalized as a normal completed message. Track `receivedDoneFrame`; treat events-but-no-done as a retryable truncation.
- **Errored partial gets no "interrupted" marker.** The "Response interrupted" badge only renders when `metadata.interrupted` is set, which `handleError` never does — so a partial answer left by a server error has no _inline_ incompleteness signal, only a separate banner a scrolled-up user may miss.

**G9 — dangling tool-call spinner (MEDIUM, CONFIRMED).** `finalizeThinkingBlock` (`AgentChatModal.svelte:1584-1605`) sets the block's overall status but **never reconciles child activity statuses**; a `tool_call` frame with no matching `tool_result` (the prior audit's O12 orphan, or any mid-turn abort between call and result) leaves an activity at `status:'pending'` rendering a **permanent spinning Loader** (`ThinkingBlock.svelte:230-234`) even after the turn finalizes, and the collapsed header still counts it among "N actions." Map any remaining `pending` activities to a terminal `failed`/`interrupted` state at finalize.

**Already done well (keep):** optimistic rollback on pre-response failure (removes the user bubble, restores input + image drafts); reconcile-from-server on hard transport drop (`startTurnReconciliation`/`reconcileTurnFromSession` with bounded retries and "Restoring latest response…"); empty-response guard; strong user-cancel UX; stale/duplicate event guarding by `stream_run_id`/`client_turn_id`/`event_id`; the 285s self-abort margin. The hard-failure paths are handled — the gaps are all in the **silent/partial-failure** middle.

---

## Part 6 — Observability & conversation recovery (G10, G11, G12, G15, G17)

The system is **not** blind — `chat_turn_runs` (status + finished_reason), `error_logs` (typed, with request_id/user_id/project_id), `chat_turn_events`, and `timing_metrics` all exist, plus pull-based admin surfaces (`/admin/errors`, `/admin/chat`, `/admin/chat/timing`) and a duplicate-running guard. The gaps are in **classification, cross-session recovery, and push alerting.**

**G11 — a wedged turn is unrecoverable except by waiting 285s on the same session (HIGH, CONFIRMED).** The only reclaimer of a stuck `running` turn is the **inline** sweep in the _next POST for the same session_ (`+server.ts:2649-2725`). Migration `20260702000000` added `last_progress_at` + a partial index _explicitly for a future sweeper_ — **that sweeper does not exist** (no chat cron in `vercel.json`; `grep chat_turn_runs apps/worker` is empty). Consequences: (a) a session the user never revisits stays `running` forever and pollutes any "active turns" metric; (b) the user is **locked out of that session for up to 285s** even when the owning process is already dead (`activeTurnAgeMs < 285s → emitErrorThenDone('still finishing the previous response…')`); (c) the resume UI shows a passive "will refresh shortly" note that **never refreshes if the process is dead, with no button to clear it**. And the Stop endpoint is **cooperative-only** — it writes a cancel _hint_ into `agent_metadata` and never touches `chat_turn_runs.status` (`stream/cancel/+server.ts:118-149`), so it's inert against exactly the dead-process turn it most needs to unwedge. **Fix:** ship the already-scaffolded sweeper as a short-interval cron (`status='running' AND COALESCE(last_progress_at, started_at) < now()-N`) **and** add a user-triggered "Reset stuck turn" affordance that force-transitions the session's `running` turn to `cancelled/finished_reason='user_forced_reset'`.

**G10 — the primary failure record has no taxonomy and is weakly correlated (MEDIUM, CONFIRMED).** `chat_turn_runs` has `status` + free-text `finished_reason` but **no `error_type`/`error_message` column** — all detail lives in `error_logs`, written via `void errorLogger.logError(...)` (`+server.ts:2144`) that is **not awaited and not in the `flushWithBudget` detached set**, so on a serverless freeze right after the response returns the insert can be **silently dropped**. Correlation is timestamp-guessing: the top-level catch passes `{contextType, entityId, sessionId}` with **no `stream_run_id`/`turn_run_id`** (`:4884-4889`), and `error_type` itself is heuristic keyword-matching (`determineErrorType`, `errorLogger.service.ts:385-439`) — an LLM failure whose message lacks "llm/openai/token" is bucketed `'unknown'`. **Fix:** add `error_type` + `error_message` (+ `error_at`) columns to `chat_turn_runs` set in `persistFinalState`; thread `stream_run_id` + `turn_run_id` into every `logFastChatError`; pass an explicit `error_type` from the call sites.

**G15 — best-effort observability writes swallow their own failures (MEDIUM, CONFIRMED).** `persistFinalState` awaits the terminal-status update but on error only `logger.warn` + fire-and-forget `logError`, then returns (`turn-observability-writer.ts:212-240`); the turn-run heartbeat, `chat_turn_events` batch, and `timing_metrics` inserts are detached/catch-and-warn. **The class of failure where the DB itself is broken is exactly the class that produces the least evidence** — and a failed terminal-status write directly manufactures a wedged `running` turn (feeding G11). On terminal-status write failure, emit a distinct high-severity `error_logs` entry and consider a bounded retry; make the terminal-status write the _last_ thing that can be skipped, not a best-effort detached task.

**G17 — the heartbeat can't see an LLM-bound stall (LOW/MED, CONFIRMED).** `queueTurnRunUpdate({last_progress_at})` is inside the per-tool-execution loop (`+server.ts:3902-3909`), so a turn that hangs on the **first/only LLM call** — the most common outage shape — never advances `last_progress_at` past `null`. Any future sweeper keying on `last_progress_at` alone can't tell a fresh LLM-bound turn from a dead one. Heartbeat on LLM-pass boundaries too, and key any sweep on `COALESCE(last_progress_at, started_at)`.

**G12 — no alerting (MEDIUM, CONFIRMED).** Every consumer of `error_logs`/`chat_turn_runs` is a _pull-based_ dashboard; there is no cron computing a chat failure-rate or paging on a spike (billing has `billing-ops-monitoring`; chat has nothing equivalent). A migration that breaks `chat_turn_runs` inserts (→ every turn returns "BuildOS could not start this response") or a provider outage (per G1, invisible as `cancelled`) is discovered only when a user emails. Add a low-frequency monitoring cron computing rolling failure rate (`status='failed'` + `finished_reason='timeout'` + turn-run-insert-failed) that alerts past a threshold.

---

## The unifying recommendation — a typed failure that survives to every decision point

Rather than N point fixes, introduce **one typed failure value threaded end-to-end**, replacing the three prose-matched taxonomies and the discarded flags:

```
type ChatFailure = {
  class: 'timeout' | 'cancelled' | 'rate_limited' | 'provider_error'
       | 'validation' | 'permission' | 'not_found' | 'conflict'
       | 'context_unavailable' | 'transport' | 'unknown';
  retryable: boolean;              // drives the repair loop's retry-vs-giveup
  outcome_certain: boolean;        // false for timeouts → "may have applied", read-back not retry
  user_message: string;           // clean, path-free, human — what the user sees
  model_note: string;             // what the model is told (class + guidance)
  correlation: { stream_run_id; turn_run_id; tool_call_id? };
}
```

Populate `class`/`retryable`/`outcome_certain` **at the point of failure** (where `errorType`, `turnAbortReason`, `chunk.error`, and `context_build_failed` are already known), and make every downstream consumer _read the field_ instead of re-deriving it:

- **Model** ← `model_note` in the tool payload (fixes G4/G5/G18, the timeout-honesty gap).
- **User** ← `user_message` + a retry affordance keyed off `retryable` (fixes G8).
- **Recovery** ← `retryable`/`outcome_certain`/preserve-partial (fixes G1/G3, the timeout read-back).
- **Operator** ← `class` persisted on `chat_turn_runs.error_type` + `correlation` (fixes G10/G12, makes G1 outages visible).

This is the concrete expression of Pattern 1: **stop recomputing the cause; carry it.**

---

## Proposed Wave E — Graceful Errors (runs alongside Wave 3 security)

Sequenced by leverage. Each sub-item is independently shippable.

**E1 — The keystone chain (do first; highest user + operator leverage).**

1. **G1** — classify `turnAbortReason`: timeout → `status='failed'`/`'timed_out'` + `error_logs` row + honest terminal frame; reserve cancel for genuine user aborts.
2. **G2** — first-token watchdog (~25s) + inter-chunk idle timeout (~60s) in the stream reader; streaming connect timeout; re-add a client inactivity watchdog (replace `timeout:0`) that triggers reconciliation.
3. **G3** — preserve partial assistant text on the error path (mirror the cancel branch); surface already-committed writes to prevent duplicate-on-retry.
4. **G7** — restore mid-stream `chunk.error` / `finish_reason:'error'` handling in `smart-llm-service.ts` + regression test (this is a regression of a shipped fix — treat as a bug, not an enhancement).

**E2 — Typed failure + honest messaging.**

- **G4/G5/G18** — add `error_type`/`retryable` to `ChatToolResult`; make `classifyToolFailure` a mapper from the typed class; fix permission-before-not-found ordering and executor-validation classification; add `describeFailureForModel`. The timeout read-back honesty gap ("may have applied" → verify, don't retry).
- **G8/G9** — retry button + composer restore + correlation id in error copy; `receivedDoneFrame` truncation detection; `interrupted` marker on error; finalize sweeps dangling tool-call spinners.

**E3 — Recovery & observability.**

- **G11** — ship the scaffolded stale-turn sweeper cron + user "Reset stuck turn" affordance + make cancel able to force a dead-process turn terminal.
- **G10/G15/G17** — `error_type`/`error_message` on `chat_turn_runs`; correlation ids in `logFastChatError`; high-severity log on terminal-status write failure; heartbeat on LLM-pass boundaries.
- **G12** — chat failure-rate monitoring cron with alerting.

**E4 — Degradation hardening.**

- **G6** — distinguish "empty" from "context load failed"; degraded-mode system note + user notice.
- **G13/G14/G16** — Tavily timeout + abort signal; 429 backoff/jitter/`Retry-After` + account-vs-model distinction; fix the unreachable failure-logging block.

---

## Method notes / confidence

- **Independently re-verified while writing:** G1 (`index.ts:369-374` `isUserCancellation` returns `signal?.aborted` only; `+server.ts:2262-2269` `abortTurn('timeout')` fires that signal) ✅; G7 (`smart-llm-service.ts:2494-2506` has no `chunk.error` branch; `finish_reason:'error'` → yielded as `done` at `:2439`) ✅.
- **Line references** reflect the code as of 2026-07-07; the `smart-llm` refactor moved most LLM-path lines vs the prior audit (which cited `openrouter-v2-service.ts`).
- Findings that overlap the prior audit are cited only where the **graceful-handling angle changes severity or the fix**: G7 is the D11 regression; G1/G3 extend the prior cancellation-cosmetics theme from _the write path_ to _the whole-turn UX and observability_; G11 extends the prior durability theme from _crash mechanics_ to _user/operator recovery affordances_.
