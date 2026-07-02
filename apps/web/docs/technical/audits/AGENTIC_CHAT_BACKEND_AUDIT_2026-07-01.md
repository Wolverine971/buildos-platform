<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01.md -->

# Agentic Chat Backend Audit — 2026-07-01

**Scope:** Backend only. Entry points: `apps/web/src/lib/components/agent/AgentChatModal.svelte` (frontend trigger) → `apps/web/src/routes/api/agent/v2/stream/+server.ts` (4,358 lines, the main streaming endpoint) and everything it calls into.

**Method:** Five parallel research passes, each reading the actual source (not relying on prior audit docs, though prior findings were used as a starting hypothesis to verify against current code): (1) streaming protocol & lifecycle, (2) turn-loop / tool-round harness, (3) pre-warm flow, (4) context assembly across context types, (5) tools & skills registry. All findings below are cited `file:line` against the code as of this session.

**Status:** Pure audit — nothing has been fixed yet. This doc is the fix backlog.

---

## Top findings, ranked by impact

### 1. Tool calls within a single round run sequentially, not in parallel

`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:1353`

```
for (const { original, executable } of toolCallsToExecute) { await params.toolExecutor(...) }
```

A round with 4 independent read calls (a common "gather context" pattern) pays 4× tool latency instead of `max(latency)`. Nothing about tool independence prevents `Promise.all`/`allSettled` here. **This is the single largest addressable latency win in the harness.**

**Fix:** Parallelize independent tool calls in the round loop, guarding only true read/write-ordering dependencies (if any exist).

### 2. Entity-scoped chat never narrows context

`apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2632` (`loadEntityContextData`)

Always calls `loadProjectContextData` for the **entire project** first (all tasks/goals/milestones/plans/documents/members/logs), then adds the focus entity + linked entities on top. This is true in both the RPC path (`buildEntityContextFromRpc`, `context-loader.ts:2046-2076`, spreads `...projectContext` wholesale) and the fallback path. Chatting about one task in a 200-task project pays the same token/latency cost as chatting about the whole project, plus extra queries — zero scoping benefit from the "entity" context type as implemented today.

**Fix:** Scope entity-focused context to the focus entity + its linked entities + a minimal project header, instead of spreading the full project bundle. Also: the three fetches inside `loadEntityContextData` (project context, focus entity, linked entities) run sequentially even though the latter two don't depend on the first — parallelize with `Promise.all`.

### 3. Pre-warm: infra is real, but effectiveness is unverified — and the code admits it

Two caches, both correctly Postgres-persisted (not in-memory, so they survive Vercel lambda recycling):

- **Context cache** — `agentic-chat-v2/context-cache.ts`. Written to `chat_sessions.agent_metadata.fastchat_context_cache`. Key = `contextType|projectId|focusType|focusEntityId` (`context-cache.ts:36-42`). TTL = 2 min (`context-cache.ts:6`), no invalidation on underlying writes — purely time-based.
- **Prepared prompt cache** — `agentic-chat-v2/prepared-prompt-cache.ts`. Full rendered system prompt + tools + envelope, in Postgres table `agentic_chat_prepared_prompts`. Key = single-use nonce token, TTL 90s (`prepared-prompt-cache.ts:16`), consumed via `consumed_at` (`stream/+server.ts:715-757`).

The stream endpoint **genuinely consumes it and skips real work on a hit** — `stream/+server.ts:2680-2697` takes `system_prompt`/`sections`/`context_inventory`/`tools_summary` straight from the cached row on a prepared-prompt hit, skipping both `loadFastChatPromptContext()` and `buildLitePromptEnvelope()`. Cache-source fallback chain: prepared-prompt cache → session context cache (`:2698-2707`) → client-supplied prewarm (`:2708-2725`) → fresh load (`:2726-2776`).

**The catch:** `prepared-prompt-cache.ts:90-94` contains a team comment:

> "telemetry showed 0 hits / 60 misses (all `missing_key`) because the flag had never been enabled... keep default-on until live `prepared_prompt_hit` + `time_to_first_response` by `cache_source` are reviewed."

The enable flag (`FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED`) was flipped true 2026-06-11; the promised review (2026-06-22) never happened. Per-turn hit/miss telemetry IS captured (`turn-observability-writer.ts:201,349,426`, `stream/+server.ts:3010-3012`) but there is **no admin dashboard** reading it (`apps/web/src/routes/admin` has nothing for `prepared_prompt`/`turn_observability`). Nobody currently knows the real hit rate.

**Client trigger:** `agent-chat-prewarm.svelte.ts:170-195`, wired via `AgentChatModal.svelte:1073`. For an existing session it fires as soon as the modal opens. For a new/draft chat it's gated on `shouldPrewarmDraftContext` (`:180-184`) — only fires once the user starts typing/recording, not on modal-open — racing the 90s TTL for fast typists.

**Fix, ranked:**

1. Add an admin dashboard panel over `chat_turn_runs`/`timing_metrics` for `prepared_prompt_hit` rate and `cache_source` distribution — this directly answers "is it working," and should exist before any further prewarm investment.
2. Log `cache_source`/`preparedPromptHit` via `logger.info` on every turn (currently DB-only) so hit rate is visible without a query — `stream/+server.ts:~2935-2947`.
3. Trigger prewarm on modal-open for new/draft chats too, not just once typing starts — `agent-chat-prewarm.svelte.ts:180-184`.
4. Re-run the outstanding 2026-06-22 review once the dashboard exists.

### 4. No SSE heartbeat; cancellation is DB-polled, not transport-driven

Protocol is a custom single-field SSE (`data: {json}\n\n`, no `event:` lines) served from a `TransformStream` opened immediately, with the actual turn running detached in a `void (async () => {...})()` IIFE (`stream/+server.ts:1741-1913, 1913-4355`) — deliberate, so agent work survives a closed modal or dropped read, not an oversight.

- **No heartbeat/keepalive frames anywhere** — during long silent tool-call rounds, idle SSE connections risk being killed by intermediary proxies even though `maxDuration: 300` lets the function keep running server-side. Client sees a dead stream with no signal why.
- **Cancellation is polled, not push-driven**: the client calls a separate `POST /api/agent/v2/stream/cancel` which writes a hint into session metadata; the server polls it every 750ms via `startFastChatCancelWatcher` (`stream/+server.ts:536-589`, `264-267`). A real network drop or tab crash (no explicit `/cancel` call) is invisible to the server — the turn keeps running until `FASTCHAT_DETACHED_TURN_MAX_DURATION_MS` (285s, `:256-259`) hits. Every active stream also issues a Supabase read every 750ms for its full duration — an avoidable, linearly-scaling DB tax under concurrent load.
- On modal `onDestroy` (`AgentChatModal.svelte:2066`), `disposeActiveStream()` → `detachActiveStream()` (`agent-chat-stream-controller.svelte.ts:605-629`) only aborts the client fetch — it never calls `reportStreamCancellationReason`, so closing the modal (not navigating away) leaves the server turn running for the full detached window with no cost signal.

**Fix, ranked:**

1. Add a periodic heartbeat frame (~15s) from the detached IIFE, keyed off the same interval as the cancel watcher.
2. Have `detachActiveStream()` fire `reportStreamCancellationReason('user_cancelled', ...)` on modal close, same as `stopGeneration` already does.
3. Replace/augment the 750ms DB-poll cancel watcher with Supabase Realtime or `LISTEN/NOTIFY` to cut per-turn query volume as concurrency grows.

### 5. Tool-surface size budget raised repeatedly instead of trimmed

`agentic-chat-v2/tool-surface-size-report.ts` + `.test.ts`. Current state: `project_basic` = 18 tools / 15,482 chars vs 16,000 budget (96.8% full); `project_write` = 22 tools / 23,710 vs 25,000 (97.6% full). The budget has been bumped 5 times to match actual size rather than the surface being trimmed — the guard is trending decorative; the next legitimate always-on tool addition just triggers another bump.

**Fix:** Stop raising the budget; trim the always-on surface instead — e.g. move `list_corsair_mcp_tools`/`call_corsair_mcp_tool` behind discovery (`gateway-surface.ts:91-110`).

### 6. `+server.ts`'s POST handler is ~2,770 lines, mixing many concerns

The turn/tool-round loop itself is well-isolated in `stream-orchestrator/index.ts` (1,856 lines, single-purpose — good separation). `+server.ts`, however, is not just setup plumbing: its `POST` handler (`:1589` to EOF) mixes auth, rate limiting, context/prompt assembly, SSE-emission closures, the `streamFastChat` call, and post-turn persistence/telemetry all in one scope. 4,358 lines in one file is a real maintainability risk — any edit anywhere shares one closure's variable soup.

**Fix:** Extract request-setup, SSE-emission helpers, and persistence into separate modules, leaving `+server.ts` as a thin handler.

---

## Confirmed dead code — safe to delete

- **`apps/web/src/routes/api/agent/v2/stream/djtryserver.ts`** — 474 lines. Doesn't match SvelteKit's `+server.ts` routing convention, so it's never wired into any route. Zero references anywhere in `apps/web/src` (confirmed via grep — only its own header comment matches).
- **`buildFastSystemPrompt`** — `agentic-chat-v2/prompt-builder.ts:23`, re-exported from `agentic-chat-v2/index.ts:2`. Zero non-test importers; the live path uses `buildLitePromptEnvelope` from `agentic-chat-lite/prompt` (`stream/+server.ts:110`). Confirms a prior audit's BUG-5 finding is still accurate.

---

## Confirmed fixed (verified live, not just committed-to-branch)

The 2026-06-24 "searches a lot but never delivers" turn-budget bug fixes are all present and correct in current code:

- `incomplete_mutation_after_reads` finalization reason — `finalization-guard.ts:13, 91-100`, distinct from `empty_after_reads` (`:484-486`).
- `turnHadUnfulfilledMutationIntent` / `looksLikeExplicitMutationRequest` gating — `stream-orchestrator/index.ts:1769-1782`.
- Auto-execute a materialized write tool in the same round (no more "now loaded, retry" round tax), with a re-validation guard against provider-schema bypass — `index.ts:1398-1466`.
- Round budget 8→12, near-limit 6→9 — `stream/+server.ts:236-242`, applied at `:3090-3098`.

**One latent gotcha:** a second, independent default pair lives in `agentic-chat-v2/limits.ts:2-19` (`MAX_TOOL_ROUNDS=16`, `MAX_TOOL_CALLS=40`) that only applies if a caller of `streamFastChat` omits `maxToolRounds`. `+server.ts` always passes it explicitly today, so there's no live bug — but it's a double-source-of-truth trap for any future caller.

---

## Other findings (lower priority)

- **No mid-turn transcript compaction** — `messages` only grows every round (`index.ts:1126, 1547-1551`); only per-payload char caps exist (6000/20000 chars, `tool-payload-compaction.ts:7-8`). A long multi-round turn can approach the model's context ceiling before the round budget is exhausted, even though prompt caching (`prompt_cache_key: chatSessionId`) mitigates cost.
- **A single non-abort error mid-turn kills the whole turn** — `index.ts:1757` (`throw error` in the catch) means a transient LLM-stream error is not retried at the orchestrator level; completed tool work is only recoverable via the outer `+server.ts` error path, forcing the user to resend. Model-lane fallback retries exist one layer down in `openrouter-v2-service.ts`, but not for a mid-stream error inside an already-selected lane.
- **`search_ontology` isn't hidden from chat discovery like its 4 legacy-search siblings.** `search_onto_goals/plans/milestones/risks` are `chatDiscovery: 'hidden'` (`tool-metadata.ts:60,67,130,137`); `search_ontology` only has a text nudge (`ontology-read.ts:719-721`) — a weak model doing `tool_search` can still surface and pick it over the smart `search_all_projects`/`search_project`.
- **Three colliding "capability" vocabularies**: tool-search's `capability` filter (`registry/capability-catalog.ts`), the gateway's `work_capability_search`/`work_capability_load` (explicitly labeled "Legacy alias for outcome_card_search," `gateway.ts:96-144`), and the actual outcome-card concept underneath — reconciled only by ad-hoc `if` branches (`gateway-surface.ts:175-179`, `tool-execution-service.ts:846,861`), not at the schema/type level.
- **Generic execution errors bottom out thin.** `normalizeExecutionError`/`normalizeToolError` only special-case literal `'401'`/`'404'` substrings; raw Postgres/Supabase constraint errors pass through unfiltered to the model (`tool-execution-service.ts:1973-1979`), unlike the well-crafted validation errors elsewhere in the same file.
- **Context cache TTL is 2 minutes** (`context-cache.ts:6`) — any gap over 2 min between turns (common in real conversation) forces a full fresh reload, so session-level caching mostly only helps rapid-fire turns.
- **START HERE doc is always a bolt-on extra query** — `attachProjectStartHere` (`context-loader.ts:2148-2157`) fires after every project/entity load, including on the RPC fast path, instead of being folded into the `load_fastchat_context` RPC itself.

---

## Tools & skills registry — current shape

- **86 direct/materializable tools** (`tools/core/definitions/index.ts:37-42`) + **16 gateway/discovery meta-tools** (`tools/core/definitions/gateway.ts:11-414`).
- **51 skills, 14 domains, 12 capabilities, 11 outcome cards** (`skills/registry.ts:66-119`, `domains/catalog.ts`, `registry/capability-catalog.ts:37-243`, `outcome-cards/catalog.ts`).
- Lean discovery (`FASTCHAT_LEAN_DISCOVERY`): only `skill_search`+`domain_search` preload when on; otherwise all 9 `GATEWAY_DISCOVERY_TOOL_NAMES` preload (`gateway-surface.ts:15-33`).
- **Strengths:** orphan-skill guard is real and enforced by test (`skill-discoverability.test.ts`); `## Output` contract markdown parsing works correctly (`markdown-skill.ts:203-315`); legacy ILIKE search tools are actively steered away (not silent traps) via `chatDiscovery: 'hidden'`; tool-not-found errors return a distinct `errorType: 'tool_not_loaded'` so the orchestrator re-materializes instead of failing outright.

---

## Suggested priority order

1. Parallelize tool-round execution (`stream-orchestrator/index.ts:1353`) — clearest latency win, no design ambiguity.
2. Scope entity context down instead of spreading the full project bundle (`context-loader.ts:2632, 2046-2076`).
3. Build the pre-warm hit-rate dashboard, then re-measure before investing further in prewarm.
4. SSE heartbeat + modal-close cancellation signal.
5. Delete `djtryserver.ts` and dead `buildFastSystemPrompt` (trivial, zero risk).
6. Stop bumping the tool-surface budget; trim instead.
7. `+server.ts` decomposition (largest effort, do last / opportunistically).
