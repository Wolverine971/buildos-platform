<!-- docs/specs/agent-context-saturation-and-payload-hygiene-2026-05-12.md -->

# Agent Context Saturation and Payload Hygiene Plan

Date: 2026-05-12
Status: In progress. Compaction, payload hygiene, token-tracking foundations, Phase 0 orchestration guardrails, the initial saturation ledger, and high-priority retrieval cleanup shipped; lower-priority RPC, telemetry, and UI-badge work remain.
Authors: Codex (original spec, retrieval audit), Claude (independent review, token tracking audit, fixes)

Related: [agent-token-tracking-investigation-2026-05-12.md](./agent-token-tracking-investigation-2026-05-12.md)

---

## TL;DR

1. **The Rod meeting-prep failure was caused by two compounding problems**: tool payloads contained too much low-value data (internal `search_vector`, full document bodies, unbounded relation arrays), and the orchestrator had no signal to tell the model when further reading was no longer producing new evidence.
2. **Three layers of fix are required**: (a) payload hygiene and compaction, (b) live context-window tracking, (c) a saturation ledger that injects a stop signal when reads stop paying off. Plus an underlying resource-level fix: agent read tools should use compact agent-specific RPCs, not UI-hydration endpoints.
3. **Shipped 2026-05-12**: payload compaction (Codex), token-tracking foundations (Claude — populated empty OpenRouter columns, persisted per-pass detail, made the orchestration-side context-usage snapshot live), Phase 0 read-loop guardrails (Codex), an initial context-gathering saturation ledger (Codex), and high-priority agent retrieval cleanup for project/document reads.
4. **Remaining work, in order**: lower-priority retrieval-layer RPC migration → broader internal-key stripping → ledger telemetry/calibration → UI badge rework.

## What happened — the Rod turn

From `chat-session-audit-ok-i-am-about-to-meet-with-rod-chamerlain-and-ta-1a4f450d-21aa-47-2026-05-12.md`:

- Turn ended with `finished_reason: "tool_round_limit"`, no tool failures.
- Persisted `prompt_tokens: 163950` — but that is a **cumulative sum across 9 LLM passes**, not the peak prompt size (see Bug 1 below; the true peak was likely ~20-25k per pass).
- 12 tool calls: `search_project` ×6 (broadened/refiltered: "Rod Chamberlin", "Beyond Exit Planning", "Rod Chamberlin compliance", and three variants of "Rod Chamberlin" with different `types` and `limit` filters), `get_onto_project_details` ×1, `tool_search` ×1, `get_onto_document_details` ×4.
- User got the canned "I hit a safety limit while coordinating tools" message instead of the meeting-prep answer.

The model was likely reading the results, but each round looked just-different-enough to dodge identity-based repetition guards. The single fire-once read-loop nudge at round 2 was ignored, and the orchestrator stayed silent for the next 7 rounds until the cap fired.

## Root cause analysis

### 1. Tool responses carried too much

Old ontology API routes use `select('*')` and serialize full UI-hydration shapes (full document content, unbounded relation arrays, internal columns like `search_vector`, embedding fields, internal flags). The model-facing layer replayed all of that into the next LLM pass.

### 2. Loop guards detect repetition, not saturation

The orchestrator already has:

- `maxToolRounds` cap
- `FASTCHAT_GATEWAY_NEAR_LIMIT_MAX_TOOL_ROUNDS` (lowers cap when prompt is already near budget)
- `repeatedReadOpSetCount` (same read-op set N times in a row)
- `repeatedRoundCount` (identical args + results N times in a row)
- `buildReadLoopRepairInstruction` (fire-once nudge after 2 read-only rounds)
- Write-outcome ledger (after every write round)

These detect identical repetition. They do not answer "did this round produce new evidence?" In the Rod case, each round was structurally different — different query strings, different doc IDs — so nothing escalated.

### 3. The model never knew the retrieval inventory

The model sees tool outputs but does not get a compact status of: which queries were tried, which entities were opened, whether the last round added new IDs, how many rounds remain, whether the search surface is exhausted.

### 4. Context-budget signal was frozen at turn start

`contextUsageSnapshot` was computed once before `streamFastChat` (8k token budget, history + system + user only), used once to choose `maxToolRounds`, and never refreshed. By round 5 of the Rod turn the real prompt was ~5× the snapshot's assumed size, but the snapshot still reported the same status.

### 5. Token tracking was inconsistent and partial

While investigating Bug 4, found broader token-tracking issues (full detail in [agent-token-tracking-investigation-2026-05-12.md](./agent-token-tracking-investigation-2026-05-12.md)):

- The orchestrator sums `prompt_tokens` across LLM passes into the returned `usage` aggregate, so `chat_messages.prompt_tokens` is cumulative spend, not peak prompt size — misleading when diagnosing context-window load.
- Two parallel writers to `llm_usage_logs` (SmartLLMService and OpenRouterV2Service) populated different columns. SmartLLMService omitted `cached_prompt_tokens`, `cache_write_tokens`, `reasoning_tokens`, `openrouter_usage_cost_usd`, `openrouter_byok`, `openrouter_upstream_inference_cost_usd` — all columns the schema supports.
- OpenRouter's reported `usage.cost` was read in memory but discarded by SmartLLMService; cost was recomputed from a local model-pricing table.
- Cache hit detail was downgraded to a status string (`"65.4% cache hit"`); the numeric `cached_tokens` count was lost.

---

## Shipped 2026-05-12

### A. Payload hygiene and compaction (Codex)

Files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts`
    - Recursively strips `INTERNAL_PAYLOAD_KEYS` (currently just `search_vector`).
    - Tool-specific compactors for `search_project`, `search_all_projects`, `search_ontology`, `get_onto_document_details`, `get_onto_project_details`, plus pre-existing coverage for `get_document_tree`, `web_visit`, `list_onto_documents`, `search_onto_documents`.
    - Bounded `content_preview` (3,500 chars), bounded relation lists, top-level size guard at 6,000 chars per payload.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
    - Recursive `search_vector` strip on legacy ontology detail results.
- Tests: `tool-payload-compaction.test.ts`, `ontology-read-executor.payload.test.ts`. 5 tests passing.

### B. Token-tracking foundations (Claude)

Three fixes that unblock the saturation ledger and resolve unrelated arch debt found during investigation.

**Fix 1 — Populate empty OpenRouter columns.** `packages/smart-llm/src/smart-llm-service.ts`

- Added `extractOpenRouterUsageFields()` helper that pulls `reasoning_tokens`, `cached_tokens`, `cache_write_tokens`, `usage.cost`, `is_byok`, and `cost_details.upstream_inference_cost` from the upstream `usage` object.
- Wired into three `logUsageToDatabase` call sites (streaming success, generateJSON success, generateJSON retry success).
- `llm_usage_logs.cached_prompt_tokens`, `cache_write_tokens`, `reasoning_tokens`, `openrouter_usage_cost_usd`, `openrouter_byok`, `openrouter_upstream_inference_cost_usd` now populated for new SmartLLMService rows. Brings SmartLLMService to parity with OpenRouterV2Service.

**Fix 2 — Persist per-pass detail to `chat_messages.metadata`.** `apps/web/src/routes/api/agent/v2/stream/+server.ts`

- New `buildLLMPassSummary(llmPasses)` helper produces a compact per-pass record: `{ pass, model, provider, prompt_tokens, completion_tokens, reasoning_tokens, cache_status, finished_reason, request_id }`.
- Computes `peak_prompt_tokens = max(passes.promptTokens)`.
- Both `persistMessage` call sites (success + interrupted) write `metadata.llm_passes`, `metadata.llm_pass_count`, `metadata.peak_prompt_tokens` into the existing jsonb `metadata` column. No DB migration.
- The misleading cumulative `chat_messages.prompt_tokens` column is left untouched for billing continuity. Use `metadata.peak_prompt_tokens` to diagnose context-window load.

**Fix 3 — Live `contextUsageSnapshot`.** `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts` + `stream-orchestrator/index.ts`

- Two distinct budgets now defined and env-overridable:
    - `FASTCHAT_TOKEN_BUDGETS.UI = 15000` (bumped from 8k per user direction; for chat-header pill)
    - `FASTCHAT_TOKEN_BUDGETS.ORCHESTRATION = 80000` (new; for stop-the-loop decisions)
- New `buildLiveSnapshotFromTokens({ estimatedTokens, tokenBudget })` helper produces a `ContextUsageSnapshot` from a known token count.
- Inside `streamFastChat`, a `liveContextUsage` snapshot is maintained: after every LLM `done` event, `event.usage.prompt_tokens` (provider ground truth) is fed into `updateLiveContextUsage()`. Tracks `peakPromptTokens` and the latest status.
- New optional `onContextUsageUpdate` callback in `StreamFastChatParams` so consumers can subscribe to live updates. **Currently wired to `undefined`** because the UI badge uses a different budget — see "UI badge rework" in Remaining Work.
- `streamFastChat` return signature now exposes `peakPromptTokens` and `finalContextUsage`. `+server.ts` persists both into `chat_messages.metadata` (`peak_prompt_tokens`, `final_context_usage`).

UI-side `DEFAULT_AGENT_CHAT_TOKEN_BUDGET` in `agent-chat-formatters.ts` also bumped to 15,000 to match the server default. Existing tests pass (5/5 for chat formatters, 44/44 for stream orchestrator).

### C. Phase 0 orchestration guardrails (Codex)

Files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
    - Replaced the one-shot `readLoopRepairInjected` boolean with ranked escalation state.
    - Read-only loops now get escalating system guidance: nudge after 2 read rounds, stop-and-answer after 4, and hard-stop synthesis at 6 read rounds or when only 1 tool round remains.
    - Hard-stop synthesis removes tools from the next LLM pass entirely, so the model can produce a final answer from gathered context before the round cap fires.
    - Pure read repetition (`repeatedReadOpSetCount >= 3`) now routes into hard-stop synthesis instead of immediately returning the canned `tool_repetition_limit` message.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts`
    - `buildReadLoopRepairInstruction` now accepts `level` and `roundsRemaining`, producing distinct re-injectable instructions for nudge, escalation, and hard stop.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts`
    - `buildRoundToolPattern` now uses registry `kind` before name heuristics. This fixes an important blind spot where registered searches like `search_project` mapped to `x.search.project` and were not counted as read operations.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/shared.ts` and `apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - Final forced-synthesis passes are marked with `forcedNoToolSynthesis` and persisted as `forced_no_tool_synthesis` in compact per-pass metadata.
- Tests: targeted stream-orchestrator, read-loop, and read-op classification coverage added. `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts` passes (21/21).

### D. Phase 0 polish (Claude)

Two follow-ups identified in the post-Phase-0 assessment:

- **Extract `selectReadLoopRepairEscalation` to its own module** at `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/read-loop-escalation.ts`. Pure function, easy to unit-test in isolation, removes ~25 lines from `index.ts`. Type and rank constant exported alongside.
- **Exclude pure gateway-discovery tools from read-loop counting.** `tool_search`, `tool_schema`, `skill_load` previously incremented `readOnlyRoundCount` even though they only resolve which tools exist (no evidence gathered). Added `isDiscoveryToolName()` helper in `round-analysis.ts` and applied the filter inside `buildRoundToolPattern`. `web_visit` intentionally NOT excluded — it fetches real content. Mixed rounds (discovery + real reads) still count the real reads.
- New tests: `read-loop-escalation.test.ts` (8 tests covering thresholds 0/1/2/3/4/5/6+, the `roundsRemaining ≤ 1` shortcut, rank monotonicity, and a Rod-style 9-round simulation). Two additions to `round-analysis.test.ts` covering pure-discovery exclusion and mixed-round behavior.
- Full orchestrator test suite: 55/55 passing (was 45/45 before polish).

### E. Initial context-gathering saturation ledger (Codex)

Files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/context-gathering-ledger.ts`
    - New per-turn ledger tracks read rounds, write rounds, model-facing tool payload chars, normalized search attempts, seen entity IDs, low-novelty rounds, and repeated search rounds.
    - Emits compact context-gathering status messages only on status transitions: `narrowing`, `saturated`, `must_synthesize`.
    - Uses live orchestration context usage: `liveContextUsage.status === 'over_budget'` immediately produces `must_synthesize`.
    - Treats repeated reads with no new entity IDs as low novelty; three consecutive low-novelty read rounds force synthesis.
    - Counts the first detail open for a search result as new evidence, even when the entity ID already appeared in search. Search discovery and detail reading are separate evidence events.
    - Uses raw tool results before model-facing compaction for entity ID extraction.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
    - Observes the ledger after each real read round.
    - Injects the ledger transition message as a system message.
    - Routes `must_synthesize` through the existing hard-stop path, so the next LLM pass receives no tool definitions instead of allowing another read round.
    - Tracks model-facing payload chars from the exact JSON tool payloads pushed into the message transcript.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
    - Removed derived rollup fields (`task_count`, `goal_count`, `plan_count`, `document_count`) from the compact `get_onto_project_details` table projection after the 2026-05-12 rerun showed `Tool 'get_onto_project_details' failed: Failed to load project`. Counts are already computed from the bounded related-entity queries.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts`
    - Added sanitizer coverage for read-loop and ID-repair instruction leaks after the same rerun surfaced `If a required ID is still missing...` in the user-facing answer.
- Tests:
    - `context-gathering-ledger.test.ts` covers `open → narrowing → saturated → must_synthesize` and live over-budget synthesis.
    - `stream-orchestrator.test.ts` covers the integrated low-novelty read loop: alternating read tools keep dodging simple repeated-op detection, the ledger detects saturation, and the next pass is forced to synthesize.
    - `ontology-read-executor.payload.test.ts` covers compact project/document projections, rejects date fields plus derived rollup count fields, and prevents full document bodies in list/search results.
    - `assistant-text-sanitization.test.ts` rejects leaked read-loop and missing-ID repair instructions before final text reaches the user.
    - Targeted command passing: `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/context-gathering-ledger.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/read-loop-escalation.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.payload.test.ts` (50/50).

---

## Remaining work, prioritized

### Phase 0 — Cheap orchestration wins (mostly shipped)

1. **Done — make `buildReadLoopRepairInstruction` re-injectable with escalation.** Landed as Phase 0 orchestration guardrails above.
2. **Done — hard-stop synthesize at the last allowed round.** Landed as Phase 0 orchestration guardrails above.
3. **Done — extract escalation logic to its own module and unit-test it.** Landed as Phase 0 polish above.
4. **Done — exclude pure gateway-discovery tools from read-loop counting.** Landed as Phase 0 polish above.
5. **Expand `INTERNAL_PAYLOAD_KEYS` beyond `search_vector`.** Audit `select('*')` ontology paths for additional internal columns to strip: `tsv`, `embedding`, internal flag columns, internal timestamps. Free defense-in-depth.
6. **Include tool definitions in `buildFastContextUsageSnapshot`.** Materialized gateway tools add several thousand chars. The initial UI snapshot currently misses that overhead.

### Phase 1 — Tie the live snapshot into orchestration decisions

The ledger now consumes `liveContextUsage` for `over_budget → must_synthesize`. Remaining:

1. **Done — feed `liveContextUsage` into the saturation ledger.** `over_budget` now hard-stops into synthesis.
2. **Lower `maxToolRounds` dynamically outside ledger-only paths.** Today `gatewayRoundCap` is still chosen once from the turn-start snapshot. The cheap remaining version is to reduce the remaining round budget when `liveContextUsage.status` becomes `near_limit`, even for non-ledger paths.

### Phase 2 — Context-gathering ledger (initial implementation shipped)

A per-turn ledger inside `streamFastChat` now tracks what has actually been gathered and tells the model to stop when reads stop paying off.

**Design constraints learned from the review:**

- **Partially done — subsume existing counters.** The ledger is currently a sidecar to `readOnlyRoundCount`, `repeatedReadOpSetCount`, `repeatedRoundCount`, and gateway-required-field counters. It should eventually become the single source of truth for "is this read round novel?"
- **Done — read pre-compaction data for ID extraction.** The ledger reads raw `toolExecutions[].result.result`, before `buildToolPayloadForModel` compacts the model-facing payload.
- **Done — exclude pure gateway-discovery tools from saturation scoring.** `tool_search`, `tool_schema`, and `skill_load` are filtered by `buildRoundToolPattern`; `web_visit` remains counted because it fetches real content.
- **Done — use `liveContextUsage` (orchestration budget) for the "over budget" signal**, not the frozen turn-start snapshot or the UI budget.

**Conceptual shape:**

```ts
type ContextGatheringLedger = {
	roundsUsed: number;
	maxToolRounds: number;
	readRounds: number;
	writeRounds: number;
	totalModelPayloadChars: number;
	searches: Map<string, SearchAttempt>;
	openedEntities: Map<string, OpenedEntity>;
	newEntityIdsByRound: string[][];
	lowNoveltyRounds: number;
	repeatedSearchRounds: number;
	lastStatus?: ContextSaturationStatus;
};

type ContextSaturationStatus = {
	status: 'open' | 'narrowing' | 'saturated' | 'must_synthesize';
	roundsRemaining: number;
	readRounds: number;
	lowNoveltyRounds: number;
	searchedCount: number;
	seenEntityCount: number;
	newEvidenceThisRound: boolean;
	reasons: string[];
};
```

**Novelty signals** (new evidence): new result IDs from search tools, new entity opened, new content in a document preview, new related sections exposed by a project detail.

**Saturation signals**: repeated normalized query/scope, search results contain only seen IDs, detail tools open already-opened entities, two consecutive read rounds add no new IDs, `roundsRemaining ≤ 1`, `liveContextUsage.status` is `near_limit` or `over_budget`, model-facing payload chars growing without new evidence.

**Status injection**: shipped as a short system message after the tool round, **only on status transitions** (open→narrowing, narrowing→saturated, saturated→must_synthesize). Form:

```text
Context gathering: nearing saturation.
- Rounds remaining: 1.
- Searches tried: "Rod Chamberlin", "Beyond compliance".
- Opened: 4 documents, 1 project.
- Last round added no new document IDs.
Unless a specific missing fact remains, answer from the loaded evidence.
```

**Remaining ledger hardening:**

- Replace the older read-loop counters with ledger-derived status where practical.
- Persist compact ledger snapshots into turn metadata for calibration.
- Improve entity ID extraction from known tool shapes instead of relying primarily on recursive `id` discovery.
- Calibrate thresholds against real chat-session audits after a few production traces.

### Phase 3 — Retrieval-layer fixes (high-priority cleanup shipped)

Compaction is a last-mile guardrail. The first-mile fix is making agent read tools use compact agent-specific read models instead of UI-hydration endpoints. The high-priority executor-level cleanup is now shipped for `get_onto_project_details`, `get_onto_document_details`, `list_onto_documents`, and `search_onto_documents`. A dedicated `load_agent_project_context(...)` RPC is still useful, but it is now lower-priority cleanup rather than the immediate blocker.

### Phase 4 — UI badge rework (user-flagged tangent)

Current badge logic emits a `ContextUsageSnapshot` once at turn start, against the 15k UI budget, based on visible content. This is a length-oriented signal ("your conversation is getting long, consider compressing") and should stay that way — not be co-opted for "the model's context window is filling up" which now lives in the orchestration budget.

Open design questions (separate from this spec):

- Should the badge count only user + assistant turns, excluding tool calls and system injections?
- Should it show "X turns since compression" or "X messages" instead of a percentage?
- Should compression be triggered automatically near limit, or just suggested?
- When the orchestration snapshot says the model is hitting context limits this turn, should that surface as a transient status pill near the input (separate indicator)?

These do not block Phases 0-3.

### Phase 5 — Telemetry

Persist ledger snapshots to turn telemetry for sanity-checking trigger calibration:

- `read_rounds`, `low_novelty_rounds`, `opened_entity_count`, `unique_search_count`, `context_saturation_status`, `tool_payload_chars_sent_to_model`.

`peak_prompt_tokens` and `final_context_usage` already flow into `chat_messages.metadata` as of Fix 2/3.

### Outstanding token-tracking items (deferred)

From the token-tracking investigation, not addressed today:

- **Decide cost source of truth.** Standardize on OpenRouter's reported `usage.cost` (preferred — actual billed number) or persist both `our_estimate_usd` and `openrouter_reported_usd` for drift detection. Currently SmartLLMService persists its estimate and OpenRouterV2Service persists OpenRouter's reported cost — same column, different sources, no way to tell which.
- **Surface `peak_prompt_tokens` to analytics queries.** Currently buried in `chat_messages.metadata`. May warrant a generated column or a top-level column on `chat_messages` if it becomes a frequent query target.
- **`stream_options: { include_usage: true }` parity check.** Confirmed sent by SmartLLMService and OpenRouterV2Service. No action needed unless a new LLM call site appears.

---

## Data retrieval audit (Codex, preserved verbatim — informs Phase 3)

The payload compaction patch is necessary, but it is not sufficient by itself. It prevents the model from seeing oversized or internal tool results. It does not prevent the server from doing oversized SQL reads, serializing large API payloads, or moving unnecessary bytes through the executor before compaction.

This section reviews the data retrieval paths behind the audited failure and identifies which paths are already reasonably shaped versus which should be fixed at the query/RPC layer.

### High-level finding

The search path is mostly healthy. The detail and overview paths still overfetch.

The most important architectural correction is:

> Agent-facing read tools should not call browser/page endpoints that were designed to hydrate full UI state. They should call compact, agent-specific SQL/RPC/read-model paths that project only the fields the agent can use.

Compaction should remain as a last-mile guardrail, not the primary resource-control mechanism.

### Retrieval paths reviewed

#### `search_project`, `search_all_projects`, `search_ontology`

Current path:

- `OntologyReadExecutor.runAgenticSearch(...)`
- `POST /api/onto/search`
- `public.onto_search_entities(...)`

Assessment: mostly good.

Why:

- The route calls an RPC instead of loading table rows directly.
- The RPC returns a narrow table: `type`, `id`, `project_id`, `project_name`, `title`, `snippet`, `score`, `state_key`, `type_key`.
- The result is capped at 50.
- `search_vector` is used for ranking but is not returned.

Remaining issue:

- The document search snippet uses `title`, `description`, and `props`, while the search condition can match document `search_vector`, which likely includes content. This can produce a result whose title matches relevance but whose snippet does not show the content phrase that matched. That may encourage extra document-detail calls. This is a relevance/usability issue more than a resource issue.

Recommendation:

- Keep `onto_search_entities` as the canonical search path.
- Consider improving document snippets to headline against a bounded content source when the match comes from content.

#### `get_onto_project_details`

Current path:

- `OntologyReadExecutor.getOntoProjectDetails(...)`
- `GET /api/onto/projects/[id]`

Assessment: high overfetch risk.

Why:

- The route selects `*` from `onto_projects`.
- It then fetches all related entities with `select('*')` across goals, requirements, plans, tasks, documents, assets, sources, milestones, risks, metrics, and context document.
- It returns full documents and full related rows without per-section limits.
- It enriches tasks with assignees and last-changed actors even when the agent may only need a project summary.
- This is a browser/UI hydration shape, not an agent read shape.

This explains part of the Rod failure: one `get_onto_project_details` call can introduce a large amount of irrelevant context and duplicate document data before the agent has established which rows matter.

Recommendation:

- Do not use `/api/onto/projects/[id]` for agent project details.
- Create an agent-specific project context path, preferably an RPC, that returns:
    - project summary fields,
    - counts,
    - bounded active/recent lists,
    - requirements and risks summaries,
    - document metadata only,
    - no raw document bodies except an explicit context document preview if needed,
    - no `search_vector`, internal props, or asset internals.

Candidate implementation:

- Add `public.load_agent_project_context(p_user_id uuid, p_project_id uuid, p_options jsonb default '{}')`.
- Or extend `public.load_fastchat_context(...)` to cover the missing agent-relevant sections, especially requirements and risks, then route `get_onto_project_details` through that compact RPC.

Important distinction:

- `public.get_project_full(...)` is not the right fix for agent reads. It reduces database round trips, but it still uses `to_jsonb(row.*)` and returns full unbounded nested arrays. It is optimized for page hydration, not agent context.

#### `get_onto_document_details`

Current path:

- `OntologyReadExecutor.getOntoDocumentDetails(...)`
- `GET /api/onto/documents/[id]`
- `ensureDocumentAccess(...)`

Assessment: moderate overfetch risk.

Why:

- The document access helper loads the document with `select('*')`.
- For a true document-detail call, loading full `content` is often legitimate.
- But `select('*')` also brings internal fields that are not needed by the agent.
- The same helper is shared by `GET`, `PATCH`, and `DELETE`, which makes narrowing it globally riskier.

Recommendation:

- Add a dedicated read projection for agent GET, separate from write/archive helpers.
- It should select only:
    - `id`, `project_id`, `title`, `description`, `type_key`, `state_key`,
    - `content`, `props` only if required for legacy body fallback,
    - `created_at`, `updated_at`, `archived_at`.
- Do not select `search_vector` or unrelated publishing/versioning/internal fields.
- Keep full content available here because this tool's purpose is explicit document reading. The efficiency gain should come from avoiding internal columns and from context-saturation logic preventing unnecessary repeated document opens.

#### `list_onto_documents` and `search_onto_documents`

Current path:

- Direct Supabase selects in `OntologyReadExecutor`.

Assessment: high overfetch risk for list/search.

Why:

- Both select `content` for up to 50 rows.
- The executor then summarizes each document locally.
- `search_onto_documents` only searches title with `ilike`, yet still fetches full content for matched rows.

Recommendation:

- Prefer `search_project` / `search_ontology` for discovery.
- Rework legacy document list/search to return metadata and short previews only.
- If previews/outlines are needed, implement an RPC that computes bounded preview text in SQL, for example `left(content, 500)` or a stored/generated `content_preview` column.
- Avoid pulling full document bodies until `get_onto_document_details` is explicitly called.

#### `get_project_overview`

Current path:

- `UtilityExecutor.getProjectOverview(...)`
- `loadOverviewProjectData(...)`

Assessment: moderate overfetch risk.

Why:

- It selects narrow columns, which is good.
- But for selected projects it loads all tasks, milestones, plans, risks, and events, then builds a compact overview in TypeScript.
- For large projects, this wastes database and network work even though the final overview only shows bounded lists and counts.

Recommendation:

- Move ranking and limits into SQL.
- Either use `load_fastchat_context` for project overview, or implement per-entity `limit`/`order` queries that mirror the overview priority rules.
- Use count queries for totals instead of loading all rows to count them in application memory.

#### `load_fastchat_context`

Current path:

- FastChat context loader RPC.

Assessment: mostly the best existing shape, with one important gap.

Why it is good:

- It projects selected columns.
- It caps major project arrays in SQL: goals, milestones, plans, tasks, documents, events.
- It returns counts alongside bounded arrays.
- It is already used by the external gateway project snapshot path.

Gaps:

- Project context does not appear to include first-class bounded requirements and risks summaries, even though those are important for compliance-oriented questions.
- Focus entity loading uses `to_jsonb(row)` for several entity types, which can include internal fields. The TypeScript context loader strips a few fields, but not `search_vector`.

Recommendation:

- Extend `load_fastchat_context` or a new agent-specific RPC with bounded requirements and risks.
- Update focus-entity projection to select explicit columns instead of `to_jsonb(*)`.
- Expand prompt-context internal field stripping to include `search_vector` and any embedding/vector fields.

### Proposed resource-level fix sequence

1. Keep the current model-facing compaction patch. It is still valuable as defense in depth.
2. Done — route `get_onto_project_details` away from `/api/onto/projects/[id]` and into a compact explicit agent projection.
3. Add bounded requirements and risks to that compact project RPC so compliance questions do not regress.
4. Done — narrow `get_onto_document_details` to an agent-specific projection while keeping full document content.
5. Done — rework legacy `list_onto_documents` and `search_onto_documents` so they never fetch full `content`.
6. Move `get_project_overview` limits and ranking into SQL or reuse the compact context RPC.
7. Expand context-loader internal field stripping for prompt context, not only tool payloads.

### Lower-priority next implementation (retrieval layer)

The next backend-resource cleanup should be an agent project-context RPC once the executor-level behavior has settled.

Proposed contract:

```sql
public.load_agent_project_context(
  p_user_id uuid,
  p_project_id uuid,
  p_include_document_previews boolean default false,
  p_document_preview_chars integer default 600
) returns jsonb
```

Return shape:

```ts
type AgentProjectContext = {
	project: {
		id: string;
		name: string;
		description: string | null;
		type_key: string | null;
		state_key: string | null;
		next_step_short: string | null;
		next_step_long?: string | null;
		updated_at: string | null;
	};
	counts: {
		goals: number;
		requirements: number;
		plans: number;
		tasks: number;
		documents: number;
		milestones: number;
		risks: number;
	};
	goals: CompactGoal[];
	requirements: CompactRequirement[];
	plans: CompactPlan[];
	tasks: CompactTask[];
	documents: CompactDocumentSummary[];
	milestones: CompactMilestone[];
	risks: CompactRisk[];
	context_document?: CompactDocumentPreview | null;
};
```

This would make the agent's first project-detail read cheap and useful, while preserving the ability to open individual full documents only when necessary.

### Sanity-check question for the retrieval layer

"Are agent read tools using compact agent read models/RPCs, or are they calling UI hydration endpoints and relying on post-hoc compaction to hide the waste?"

### Implementation update after quick retrieval fix

`get_onto_project_details` no longer calls the full UI hydration endpoint (`GET /api/onto/projects/[id]`).

The quick fix implemented in `OntologyReadExecutor` now builds a compact agent project context directly from explicit Supabase projections:

- project summary fields only,
- exact counts for related entity sections,
- bounded lists for goals, requirements, plans, tasks, documents, milestones, and risks,
- document metadata only, not document bodies,
- context document metadata only,
- recursive internal-field stripping as a fallback guard,
- no `select('*')` in the agent project-detail path.

This handles the immediate waste in the audited Rod turn: one project-detail call no longer pulls every related row and full document body through a UI-shaped endpoint before the model has decided which documents matter.

The earlier RPC recommendation is still valid as a later cleanup, but it is no longer the first blocker. A dedicated `load_agent_project_context` RPC would still be cleaner long-term because it would centralize ranking, limits, and counts in SQL. For now, the executor-level fix gives the agent the right shape without requiring a migration.

### Implementation update after high-priority document retrieval fixes

The high-priority document retrieval cleanup is now implemented in `OntologyReadExecutor`:

- `list_onto_documents` and `search_onto_documents` use explicit metadata-only projections and no longer select full `content` for list/search rows.
- The list/search summarizer no longer derives outlines from accidental full-content payloads, so an over-wide upstream result cannot leak document body text back into discovery responses.
- `get_onto_document_details` no longer calls the UI document endpoint. It now uses an explicit agent projection that returns full document content plus useful metadata while omitting internal fields like `search_vector`.
- Regression coverage in `ontology-read-executor.payload.test.ts` verifies:
    - document detail does not call `/api/onto/documents/[id]`,
    - document detail does not use `select('*')`,
    - document list/search projections do not select `content`, `body_markdown`, or `search_vector`,
    - list/search responses do not surface accidental full body content or internal search fields.
- Stability check: the broader agentic-chat suite passes after updating legacy tests to the new document-detail path: `pnpm --filter @buildos/web exec vitest run src/lib/services/agentic-chat src/lib/services/agentic-chat-v2 src/routes/api/agent/v2/stream src/routes/api/agentic-chat src/lib/services/agentic-chat-lite src/lib/components/agent` (70/70 files, 496/496 tests).

Lower-priority retrieval work still worth doing:

1. Consider moving the compact project context query into a proper RPC after behavior settles.
2. Consider a dedicated `load_agent_project_context` RPC to centralize ranking, limits, counts, requirements, and risks in SQL.
3. Revisit whether document list/search should return a bounded SQL-computed preview or stored `content_preview`; today they intentionally return metadata only.

---

## Token tracking — current state after today's fixes

Detail in [agent-token-tracking-investigation-2026-05-12.md](./agent-token-tracking-investigation-2026-05-12.md). Summary of what is now correct and what still isn't:

| Concern                                                             | Before today                                             | After today                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `llm_usage_logs.cached_prompt_tokens` (streaming)                   | Never populated                                          | Populated                                                                            |
| `llm_usage_logs.cache_write_tokens` (streaming)                     | Never populated                                          | Populated                                                                            |
| `llm_usage_logs.reasoning_tokens` (streaming)                       | Metadata only                                            | Populated as column                                                                  |
| `llm_usage_logs.openrouter_usage_cost_usd` (streaming)              | Never populated                                          | Populated                                                                            |
| `llm_usage_logs.openrouter_byok` (streaming)                        | Never populated                                          | Populated                                                                            |
| `llm_usage_logs.openrouter_upstream_inference_cost_usd` (streaming) | Never populated                                          | Populated                                                                            |
| Per-pass detail preserved                                           | Only in memory                                           | Persisted to `chat_messages.metadata.llm_passes`                                     |
| `peak_prompt_tokens` available                                      | No                                                       | Yes, in `chat_messages.metadata.peak_prompt_tokens`                                  |
| `contextUsageSnapshot` updates mid-turn                             | No, frozen at turn start                                 | Yes, `liveContextUsage` updates after every LLM pass                                 |
| UI vs orchestration budget separation                               | One 8k budget for both                                   | 15k UI, 80k orchestration, env-overridable                                           |
| Cost source of truth                                                | SmartLLMService estimates; OpenRouterV2Service trusts OR | Same — deferred decision                                                             |
| UI badge live during turn                                           | Frozen at turn start                                     | Frozen at turn start (orchestration callback not wired to UI because budgets differ) |
| Tool definitions included in budget                                 | No                                                       | No — Phase 0 item                                                                    |

---

## Sanity-check questions

For a reviewing agent:

1. Does the proposed ledger detect semantic retrieval saturation without preventing legitimate document lookup, and is the proposed injection point in the orchestrator the right place to influence the next model pass?
2. Does the ledger get its "over budget" signal from the live `liveContextUsage` snapshot (provider-reported `prompt_tokens`), rather than the frozen turn-start estimate? Does it use the orchestration budget rather than the UI budget?
3. Are agent read tools using compact agent read models/RPCs, or are they calling UI hydration endpoints and relying on post-hoc compaction to hide the waste?
4. Is the user-visible failure mode at the round cap a real (if imperfect) synthesized answer, or the canned "safety limit" string?
