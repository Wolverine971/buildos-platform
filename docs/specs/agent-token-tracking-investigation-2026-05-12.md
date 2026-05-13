<!-- docs/specs/agent-token-tracking-investigation-2026-05-12.md -->

# Agent Token Tracking Investigation

Date: 2026-05-12
Status: Findings — pending decisions
Author: Claude
Related: [agent-context-saturation-and-payload-hygiene-2026-05-12.md](./agent-context-saturation-and-payload-hygiene-2026-05-12.md)

## Why this exists

While reviewing the context-saturation spec, the question came up: is `contextUsageSnapshot` updating with every tool round? Short answer: no. The longer answer is that the codebase has two parallel LLM-usage paths with inconsistent capture, the orchestrator silently sums per-pass `prompt_tokens` into a number that gets persisted as if it were a single measurement, and several OpenRouter-reported fields with dedicated DB columns are never populated by the agentic-chat path.

This doc maps what we actually capture, where the bugs are, and what to change.

## TL;DR

1. **`contextUsageSnapshot` is frozen at turn start.** Computed once before `streamFastChat`, never refreshed as tool results accumulate. Used to lower `maxToolRounds` once at boundary, then ignored.
2. **`chat_messages.prompt_tokens` is a misleading sum, not a measurement.** The orchestrator sums per-pass `prompt_tokens` across all LLM passes within a turn into the returned `usage` object. For tool-heavy turns this is **not** the model's peak context-window load; it's cumulative billing tokens. Per-pass detail exists in `LLMStreamPassMetadata.promptTokens` but is not persisted to the DB.
3. **Two parallel writers to `llm_usage_logs` with inconsistent column coverage.** `SmartLLMService` (used by agentic-chat-v2) writes most columns but **never populates** `cached_prompt_tokens`, `cache_write_tokens`, `reasoning_tokens`, `openrouter_usage_cost_usd`, `openrouter_upstream_inference_cost_usd`, `openrouter_byok`. `OpenRouterV2Service` (used by other paths) does populate them.
4. **OpenRouter's reported cost is read and then discarded by SmartLLMService.** Cost is recomputed from a local model-pricing config, ignoring `usage.cost` and `usage.cost_details.upstream_inference_cost` that OpenRouter already provides.
5. **Cache hit detail is downgraded to a string.** `prompt_tokens_details.cached_tokens` is read but only used to produce a status string like `"65.4% cache hit"` stored in `openrouter_cache_status`. The raw count is lost.
6. **Tool-definition tokens are counted in cost-breakdown snapshots but not in the budget gate.** The 8k budget that lowers `maxToolRounds` only includes `systemPrompt + history + userMessage`.
7. **The UI badge's 8k token budget conflates two concerns** that should be separate: "your chat is getting long, consider compressing" vs. "the agent is hitting the model's context ceiling, stop tool-looping."

## Code map

### Layer 1: Estimators (char-length based)

`apps/web/src/lib/services/agentic-chat-v2/context-usage.ts:6`

- `estimateTokensFromText(text)` returns `Math.ceil(text.length / 4)`. Naive char heuristic, no tokenizer.

Callers:

- `context-usage.ts:18-23` — `buildFastContextUsageSnapshot()` sums system + history + user message. **Single-shot, turn-start only.** Feeds `ContextUsageSnapshot` and gates `maxToolRounds`.
- `tool-surface-size-report.ts:55,66` — per-tool and total tool-definition estimates. Reported in prompt snapshots for analytics.
- `prompt-cost-breakdown.ts:22` — sections for system, history, tools, provider payload. Persisted to `chat_prompt_snapshots.prompt_sections` as analytics data.
- `prompt-observability.ts:150` — logs approx prompt tokens for observability.

### Layer 2: Provider-reported counts (ground truth)

`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:528-569`

- Reads `event.usage.prompt_tokens`, `completion_tokens`, `total_tokens`, `completion_tokens_details.reasoning_tokens` from each LLM pass's `done` event.
- **Two storage targets:**
    - `usage` (the running aggregate returned by `streamFastChat`): **sums** across all passes in the turn.
    - `llmPassMeta.promptTokens` (per-pass record in `llmStreamPasses[]`): the actual per-pass value.

`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:574-597`

- Reads OpenRouter-specific fields from the same `done` event: `model`, `provider`, `request_id`, `system_fingerprint`, `cache_status`, `reasoning_tokens`. Stored in `llmPassMeta`.

### Layer 3: Persistence

`chat_messages` table (`session-service.ts:556-558`):

- `prompt_tokens`, `completion_tokens`, `total_tokens` — populated from the **summed** aggregate, not per-pass. Schema doesn't distinguish.

`chat_prompt_snapshots` table (migration `20260428000015_add_chat_turn_observability_phase1.sql:72-92`):

- `approx_prompt_tokens` — estimator-based.
- `prompt_sections` jsonb — contains cost breakdown including tool definitions.

`llm_usage_logs` table (migration `20260429000006_add_openrouter_usage_accounting.sql:4-10`):

- `prompt_tokens`, `completion_tokens`, `total_tokens` — populated.
- `reasoning_tokens`, `cached_prompt_tokens`, `cache_write_tokens` — **columns exist; SmartLLMService never populates them.**
- `openrouter_usage_cost_usd`, `openrouter_upstream_inference_cost_usd`, `openrouter_byok` — **columns exist; SmartLLMService never populates them.**
- `openrouter_cache_status` — populated with a string like `"65.4% cache hit"` or `"no cache"`, not a number.

### Layer 4: SSE emission to UI

`apps/web/src/routes/api/agent/v2/stream/+server.ts:1203, 3660`

- `emitContextUsage(stream, snapshot)` fires **once per turn**, immediately after context is loaded and before LLM streaming starts.
- Frontend `AgentChatModal.svelte:259` recomputes a live snapshot from visible messages + draft + server overhead, but cannot see tool payloads or injected system messages.

## Bugs and architectural issues

### Bug 1: `chat_messages.prompt_tokens` is a sum masquerading as a measurement

**Where:** `stream-orchestrator/index.ts:528-545`

```ts
if (event.usage.prompt_tokens !== undefined) {
	usage.prompt_tokens = (usage.prompt_tokens ?? 0) + (event.usage.prompt_tokens ?? 0);
}
```

The orchestrator adds `prompt_tokens` from every LLM pass into a running total. That total is what gets returned to the API route and persisted to `chat_messages.prompt_tokens`.

For single-pass turns this happens to equal the prompt size. For tool-using turns (the only ones where this matters), it does not. Rod's turn shows `prompt_tokens: 163950` in the message record across 9 LLM passes — the actual peak prompt size was likely ~25k, not 164k. The number is correct as a _billing_ total but wrong as a _context-window-load_ signal.

**Consequence:** Anyone using this column to diagnose "how full was the context window" will be off by a factor of N (number of passes). This is the source of the misleading impression that Rod's turn had a 164k-token prompt — actually it had nine prompts that summed to 164k.

**Fix:** Persist per-pass detail (a new `llm_pass_metadata` row per pass, or a `peak_prompt_tokens` column on `chat_messages`). The cumulative-sum column is fine for billing if renamed (`total_prompt_tokens_consumed`) but shouldn't be the only number we keep.

### Bug 2: `contextUsageSnapshot` is computed once, never refreshed

Confirmed in `+server.ts:3654` (computed) and `+server.ts:3815-3822` (consumed once). The orchestrator does not import `buildFastContextUsageSnapshot`. The 8k budget gate flips at turn start or not at all.

**Consequence:** Saturation logic in the proposed ledger cannot rely on this signal as currently wired. The orchestrator's only ground truth for context size mid-turn is the per-pass `event.usage.prompt_tokens` it captures but does not feed back into any decision.

**Fix:** Recompute snapshot status after every `done` event using `event.usage.prompt_tokens` as the live `estimatedTokens`. Two budgets needed (see "UI badge rework" below).

### Bug 3: OpenRouter cost is fetched and discarded by SmartLLMService

`smart-llm-service.ts:2294-2301`:

```ts
const inputCost = modelConfig ? ((usage.prompt_tokens || 0) / 1_000_000) * modelConfig.cost : 0;
const outputCost = modelConfig
	? ((usage.completion_tokens || 0) / 1_000_000) * modelConfig.outputCost
	: 0;
```

`usage.cost` and `usage.cost_details.upstream_inference_cost` come back from OpenRouter when `stream_options: { include_usage: true }` is sent (verified at `smart-llm-service.ts:1918`). They are ignored. Cost is recomputed from a hard-coded local pricing table.

**Consequence:** If OpenRouter changes pricing, applies discounts, applies BYOK savings, routes via a different provider with a different rate, or charges a different number than our local config thinks — we record the wrong cost. The cost columns in `llm_usage_logs` are our estimate, not OpenRouter's actual charge.

By contrast, `openrouter-v2-service.ts:935-940, 980` does read `usage.cost` and writes it to `openrouter_usage_cost_usd`. So we have _both_ approaches in the same DB, applied by different writers, against the same table. Comparing rows is non-obvious.

**Fix:** Either standardize on OpenRouter's reported cost (preferred — it's the actual billed number) or always populate both columns side-by-side (`our_estimate_usd`, `openrouter_reported_usd`) so we can detect drift.

### Bug 4: Cache hit detail downgraded to a string

`smart-llm-service.ts:1483-1506` reads `usage.prompt_tokens_details.cached_tokens`, computes a hit-rate percentage, formats a string. That string goes into `llm_usage_logs.openrouter_cache_status`. The number is discarded.

**Consequence:** We cannot aggregate "how many cached tokens did we save this month?" or "which operation types have low cache hit rates?" without parsing the string. The migration created `cached_prompt_tokens` as a dedicated numeric column. It is never populated by the streaming agentic-chat path.

**Fix:** In `smart-llm-service.ts:2311-2358` (and the parallel call sites), pass the raw `cachedTokens`, `cacheWriteTokens`, and `reasoningTokens` into `logUsageToDatabase`. The usage-logger already supports those columns — see `packages/smart-llm/src/usage-logger.ts:154-158`.

### Bug 5: `cache_write_tokens`, `openrouter_byok`, `openrouter_upstream_inference_cost_usd` never populated by streaming path

Same root cause as Bug 4: the streaming `logUsageToDatabase` call sites in `smart-llm-service.ts` (lines 2311, 2631) only pass `inputCost`, `outputCost`, `totalCost`, plus tokens and cache status string. The other columns sit unused.

`openrouter-v2-service.ts:977-987` populates all of them. So depending on which service made the call, the row is partial or complete. This breaks any analytics query that does `SELECT cached_prompt_tokens FROM llm_usage_logs` — half the rows will be NULL for no reason other than "different writer."

**Fix:** Consolidate usage-logging into a single helper that takes a raw OpenRouter `usage` object and writes all fields uniformly. Both services call it. Don't let each service decide which columns are worth keeping.

### Issue 6: Tool-definition tokens excluded from budget gate

`context-usage.ts:18-23` includes `systemPrompt + history + userMessage`. The materialized tool JSON schemas are not part of the snapshot used for `gatewayRoundCap` selection.

**Consequence:** Gateway-mode turns can load 20+ tool definitions (~3-5k chars each) into the prompt, and the snapshot doesn't know. The `near_limit` threshold is calibrated against a smaller real prompt than the model receives.

**Fix:** Add `estimateTokensFromText(JSON.stringify(tools))` to the snapshot when `tools` is provided. `prompt-cost-breakdown.ts` already measures this — just feed it into the snapshot too.

### Issue 7: Per-pass detail exists in memory but isn't persisted

`stream-orchestrator/index.ts` builds `llmStreamPasses[]` with per-pass `model`, `provider`, `requestId`, `promptTokens`, `completionTokens`, `reasoningTokens`, `cacheStatus`, `finishedReason`. This array is returned from `streamFastChat`. The API route uses some of it but does not persist the per-pass breakdown to its own table.

**Consequence:** When debugging a multi-pass turn, you can see the _summed_ tokens in `chat_messages` and the _summed_ tokens again in the `llm_usage_logs` row — but no record of the per-pass shape. Was pass 3 the big one? Pass 7? Unknown.

**Fix:** Add a `llm_passes` table keyed by `(turn_run_id, pass_number)` with per-pass tokens, model, provider, request_id, cache_status, finished_reason. Optional but high-value for debugging. Today the cheapest version is JSON-stringifying `llmStreamPasses[]` into a `passes` jsonb column on the existing turn-run record.

## OpenRouter capabilities we are not using

| Field                                              | Provided by OR        | We capture           | We persist                 | Notes                   |
| -------------------------------------------------- | --------------------- | -------------------- | -------------------------- | ----------------------- |
| `usage.prompt_tokens`                              | Yes                   | Yes (per-pass + sum) | Sum only                   | Per-pass detail lost    |
| `usage.completion_tokens`                          | Yes                   | Yes (per-pass + sum) | Sum only                   |                         |
| `usage.total_tokens`                               | Yes                   | Yes                  | Yes                        |                         |
| `usage.cost`                                       | Yes                   | Read but ignored     | No (SmartLLM); Yes (OR-v2) | Bug 3                   |
| `usage.cost_details.upstream_inference_cost`       | Yes                   | Ignored              | No (SmartLLM); Yes (OR-v2) | Bug 5                   |
| `usage.completion_tokens_details.reasoning_tokens` | Yes (when applicable) | Yes (per-pass)       | No (SmartLLM); Yes (OR-v2) | Bug 5                   |
| `usage.prompt_tokens_details.cached_tokens`        | Yes                   | Yes (as % string)    | String only                | Bug 4                   |
| `usage.prompt_tokens_details.cache_write_tokens`   | Yes                   | No                   | No (SmartLLM); Yes (OR-v2) | Bug 5                   |
| `usage.is_byok`                                    | Yes                   | No                   | No (SmartLLM); Yes (OR-v2) | Bug 5                   |
| `cache_status` (header-style)                      | Yes                   | Yes                  | As string                  |                         |
| `request_id`                                       | Yes                   | Yes (per-pass)       | Per-pass only              | Not in `llm_usage_logs` |
| `system_fingerprint`                               | Yes                   | Yes (per-pass)       | Per-pass only              |                         |

We already send `stream_options: { include_usage: true }` (verified `smart-llm-service.ts:1918,1929` and `openrouter-v2-service.ts:1499`), so the data is available on the wire. The gap is post-receipt: we don't propagate it into the DB write.

## Recommended changes

### A. The orchestration budget question (live context tracking)

Should the orchestration budget include tool-definition tokens? **Yes.** Tool definitions are part of every prompt; pretending they aren't means the budget is wrong by a fixed amount per turn.

**Concrete proposal:**

1. Inside `streamFastChat`, maintain `currentContextUsage: ContextUsageSnapshot`. Initialize from a per-turn computation that includes:
    - `systemPrompt`
    - `history`
    - `userMessage`
    - `JSON.stringify(tools)` (or just `tools.reduce` over each tool's serialized size)

2. After every LLM `done` event, **replace** `currentContextUsage.estimatedTokens` with `event.usage.prompt_tokens` (the model's ground truth for what it just received). Status is recomputed against the orchestration budget.

3. Two distinct budgets, two distinct types or constants:
    - `UI_TOKEN_BUDGET` — for the chat-header badge. Suggested: 15k (per your note). Calibrated for "the conversation is getting long."
    - `ORCHESTRATION_TOKEN_BUDGET` — for stop-the-loop decisions. Suggested: env-var-overridable constant starting at ~80k. Calibrated for "the model's context window is filling up."

4. Optional: make orchestration budget model-aware. The `done` event carries `model` and `provider`. A small lookup table mapping `model → safe_context_window` (e.g., `deepseek/deepseek-v4-flash` → 100k working budget out of 128k window) keeps this honest as model lineup changes. Otherwise pick a conservative constant.

5. Optional: add `onContextUsageUpdate?(snapshot)` to `StreamFastChatParams` so the API route can re-emit `context_usage` SSE events mid-turn. UI badge would update live instead of freezing at turn start.

### B. The UI badge rework (your tangent)

Your instinct is right: the badge should communicate "your chat is getting long" not "the agent is running out of context." Those are different scales and different audiences.

A length-oriented badge could:

- Count only **user + assistant turns** (visible content), not tool calls or system injections.
- Be calibrated against a "comfortable conversation length" budget, not against the model's window. 15k is reasonable for that.
- Trigger compression / new-chat affordances rather than scaring the user about a number they can't act on.
- Possibly show "X turns" or "X minutes since last compression" instead of a token count — both more legible than a percentage.

The orchestration-side stop-the-loop signal stays internal and never reaches the UI. They are wired separately.

If the UI badge ever wants to show "the agent is hitting context limits this turn," that's a different indicator (transient, per-turn, surfaced as a status pill near the input) — not the same long-running chat-length meter.

### C. Persistence fixes (token-tracking quality)

Order of operations, easiest first:

1. **Populate the columns that already exist** (Bugs 4, 5). Update `smart-llm-service.ts` streaming `logUsageToDatabase` call sites to pass `cachedPromptTokens`, `cacheWriteTokens`, `reasoningTokens`, `openrouterUsageCost`, `openrouterByok`, `openrouterUpstreamInferenceCost`. The usage-logger already supports them. Small diff.

2. **Stop pretending the sum is a measurement** (Bug 1). Either:
    - (a) Add `peak_prompt_tokens` column to `chat_messages` and populate from `Math.max(...llmStreamPasses.map(p => p.promptTokens))`, leaving the existing column as cumulative.
    - (b) Persist `llm_pass_metadata` as a jsonb column on `chat_messages` (or a separate table) so per-pass detail survives.

3. **Decide on the cost source of truth** (Bug 3). Either trust OpenRouter's `usage.cost` (recommended) or populate both `our_estimate_usd` and `openrouter_reported_usd` columns side by side. Standardize across SmartLLMService and OpenRouterV2Service.

4. **Make `contextUsageSnapshot` live** (Bug 2) — see section A.

5. **Include tool definitions in the snapshot** (Issue 6) — small constant addition to the budget computation.

6. (Optional) **Persist per-pass detail** (Issue 7) — for debugging multi-pass turns.

## Open questions

1. Should the orchestration budget be model-aware (lookup table) or a single conservative constant? Both are reasonable; model-aware costs slightly more maintenance but stays honest as models change.
2. Do we want to migrate fully to OpenRouter's reported cost, or keep both (estimate + actual) so we can detect drift? The latter is safer for one release cycle, then drop the estimate.
3. Should `llm_pass_metadata` live on `chat_messages` as jsonb or in its own table? Inline is cheaper; separate table is easier to query.
4. UI badge calibration: 15k seems right for the "chat is getting long" use case. Should it count tool calls / system injections at all, or strictly the conversational content?
5. Are there other call sites of `logUsageToDatabase` outside the streaming path that also need the OpenRouter column updates? The investigation found 7 call sites in SmartLLMService and 2 in OpenRouterV2Service — non-streaming JSON paths may need parallel fixes.

## What this means for the saturation ledger work

The context-saturation spec assumes `contextUsageSnapshot.status` is a useful saturation signal. As wired today, it is not. Before or alongside the ledger work:

- Phase 1 of saturation work should include making the snapshot live (recommendation A above).
- The ledger reads from the live snapshot to decide `must_synthesize`.
- The UI emission can stay once-per-turn for now; mid-turn UI updates are a separate, lower-priority enhancement.

Without the live snapshot, the ledger has to fall back to char-counting `messages` in the orchestrator — workable but less accurate than letting the model tell us what it actually received.
