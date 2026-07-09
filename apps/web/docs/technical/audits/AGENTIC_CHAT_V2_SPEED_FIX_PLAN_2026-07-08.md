<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_V2_SPEED_FIX_PLAN_2026-07-08.md -->

# Agentic Chat V2 — Speed & Capability Fix Plan

**Date:** 2026-07-08 (updated 2026-07-09)
**Source audit:** `AGENTIC_CHAT_V2_SPEED_CAPABILITY_AUDIT_2026-07-08.md` (read that first — it has the telemetry, file:line evidence, and the "what NOT to do" list)
**Cost model being attacked:** turn time ≈ LLM passes × ~7s/pass. LLM = 87% of wall clock. Every work package below reduces one of the two factors or makes them measurable.

## Status board

| WP    | Item                                                                                                                                      | Status                                                                                                                                                                               | Effort          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| WP-1  | Enable model tiering in prod                                                                                                              | 🟡 **PARTIAL** — DJ set `FASTCHAT_INITIAL_PLAN_MODEL_TIERING=ab` (deterministic 50/50 A/B) 2026-07-09. **Verify the var is set in Vercel env (not just local `.env`) + redeployed.** | XS              |
| WP-2  | Per-pass duration + TTFT telemetry                                                                                                        | ✅ **DONE 2026-07-09**                                                                                                                                                               | S               |
| WP-3  | Fix `get_calendar_event_details` (100% failure)                                                                                           | ✅ **DONE 2026-07-09**                                                                                                                                                               | S               |
| WP-4  | Cache affinity — **CORRECTED: keys were never missing on the live path; the provider doesn't cache.** Env-gated provider steering shipped | 🟡 **RE-SCOPED + SHIPPED 2026-07-09** — DJ must set `PRIVATE_OPENROUTER_PROVIDER_ORDER` to activate (see section)                                                                    | S               |
| WP-5  | Append-only tool list within a turn                                                                                                       | ✅ **CLOSED 2026-07-09 — verified, no change needed** (see section)                                                                                                                  | —               |
| WP-6  | Diff-audit the smart-llm refactor                                                                                                         | ✅ **DONE 2026-07-09** — 8 gaps in the dormant base `streamText`; live path is the GOOD one; warning comment added; migration direction = DJ decision (see section)                  | S               |
| WP-7  | Skill-gate preload inversion                                                                                                              | ✅ **DONE 2026-07-09** (code + tests; live verification on a real cold-email turn pending)                                                                                           | M               |
| WP-8  | Loaded-skill ledger durability + skip outcome_card_load pass-through                                                                      | ✅ **DONE 2026-07-09** (code + tests)                                                                                                                                                | S               |
| WP-9  | Model experiment upward (stronger tool-caller A/B)                                                                                        | ⬜ open — needs WP-2 data to read results                                                                                                                                            | S code / M eval |
| WP-10 | First-token affordance on first tool_call                                                                                                 | ✅ **ALREADY SHIPPED 2026-07-08** (commit `99e47640`; the ⬜ here was stale)                                                                                                         | S               |
| WP-11 | Total-prompt-size budget test + hot-section trim                                                                                          | 🟡 **budget test DONE 2026-07-09**; trim deferred until WP-4 cache data lands                                                                                                        | S–M             |
| WP-12 | Within-turn read memoization + `create_onto_project` profiling + parallel pre-LLM DB steps                                                | 🟡 **read memoization DONE 2026-07-09**; profiling + DB parallelization still open                                                                                                   | S               |

---

## WP-1 — Enable model tiering in prod 🟡

**What:** `FASTCHAT_INITIAL_PLAN_MODEL_TIERING` env var, read at `apps/web/src/routes/api/agent/v2/stream/+server.ts:301-309`, parsed by `parseFastChatModelTieringMode` (`model-tiering.ts:32`).

**Done so far:** DJ set `=true` in local `apps/web/.env`. `true` parses to `fast_initial_plan` — every turn's first tool-capable pass uses the speed route (`tencent/hy3`, `xiaomi/mimo-v2.5`, `poolside/laguna-xs-2.1`, `deepseek-v4-flash`); all later passes stay `balanced`.

**Remaining:**

1. Set the same var in **Vercel project env** (production) and redeploy — local `.env` does nothing for prod.
2. Decision: `true`/`fast_initial_plan` (100% on, fastest UX now) vs `ab` (50/50 deterministic split, measurable comparison). Recommendation: run `ab` for ~2 weeks so WP-2's per-pass data can prove the win, then flip to `fast_initial_plan`.
3. Watch-item: with tiering on, pass 1 and pass 2+ run different models — a guaranteed provider-cache miss on the pass-1→2 transition (see WP-4). Expected to still net-win; verify with data.

**Accept when:** `llm_pass_completed` events in prod show `model_tiering_variant` ≠ `off` and pass-1 `requested_models` includes the fast candidates.

## WP-2 — Per-pass duration + TTFT telemetry ✅ DONE 2026-07-09

**Why:** pass count × pass time is the entire cost model; pass time wasn't recorded anywhere (had to be inferred via `llm_usage_logs` joins).

**Shipped:**

- `LLMStreamPassMetadata` (`stream-orchestrator/shared.ts`) gains `startedAtMs`, `firstTokenAtMs`, `durationMs`, `timeToFirstTokenMs`.
- Populated in `runLlmStreamPass` (`llm-pass-runner.ts`) — duration spans all retry attempts; first-token resets per attempt so a recovered retry reports its own stream's first token.
- `llm_pass_completed` turn event (`+server.ts`) now carries `duration_ms`, `time_to_first_token_ms`, `started_at_ms`.
- `buildLLMPassSummary` (`turn-persistence.ts`) adds `total_llm_duration_ms` + `max_pass_duration_ms` aggregates.

**Use it:** per-pass p50/p95 by `pass_role` and `model_tiering_variant` is now one query over `chat_turn_events`. This is the readout for WP-1, WP-4, WP-7, WP-9.

## WP-3 — Fix `get_calendar_event_details` ✅ DONE 2026-07-09

**Root cause (from prod `chat_tool_executions`):** all 5 failures were the model passing the Google Calendar event id (26-char base32 from `list_calendar_events`' `external_event_id` field) as `onto_event_id`, which hard-failed UUID validation (`Invalid onto_event_id: expected UUID`) — then the model blindly retried ×4. The old schema even said `onto_event_id` was "preferred if available," steering the model into the trap.

**Shipped (`calendar-executor.ts`, `definitions/calendar.ts`):**

- **Read** (`getCalendarEventDetails`): a non-UUID `onto_event_id` can't reference an ontology event — it now routes to the Google lookup instead of throwing. Explicit `event_id` still wins if both are present.
- **Writes** (`updateCalendarEvent`/`deleteCalendarEvent`): stay strict (silent Google-path fallback on a synced event would orphan the onto row) but now throw a corrective error telling the model exactly which field to use.
- **Schema descriptions** for all three tools now say where each id comes from (`onto_event_id` = UUID from list results; `event_id` = `external_event_id` value).
- Tests: `calendar-executor.event-id-routing.test.ts` (6 tests) + existing edge-integrity + tool-surface size budgets all green.

## WP-4 — Cache affinity 🟡 RE-SCOPED + SHIPPED 2026-07-09 (needs env var to activate)

**CORRECTION (2026-07-09, via WP-6 diff-audit):** the original "regressed D9 wiring" narrative was wrong. The live chat stream constructs `OpenRouterV2Service` (`+server.ts:1752`), whose own `streamText` override **has sent `session_id` + `prompt_cache_key` since commit `734b291a` (2026-07-01)** (`openrouter-v2-service.ts:1593-1594`). The base `packages/smart-llm` `streamText` never had the keys because it's a **parallel, dormant implementation** the chat path doesn't use (see WP-6).

**The real finding:** affinity keys have been live for a week and cache hits are still terrible — **post-7/02 passes 2+ sit at 6% median cache hit.** Split by provider, the cause is unambiguous:

| Provider (deepseek-v4-flash, 30d)           | Share | Cache hit p50 (passes 2+) | Resp p50                | ms/output-token |
| ------------------------------------------- | ----- | ------------------------- | ----------------------- | --------------- |
| GMICloud                                    | ~86%  | **6%**                    | 6,749ms                 | 21.0            |
| Baidu                                       | ~4%   | **47%**                   | **3,977ms**             | **15.8**        |
| SiliconFlow (mostly served older hy3 model) | —     | 50% (hy3-era)             | 36.7s on deepseek (n=2) | 87              |

OpenRouter's default (price) routing lands ~86% of chat traffic on **GMICloud, whose prompt-prefix caching barely works**. Baidu caches ~half the prompt AND is ~41% faster at p50 with faster decode — but n=13, too thin to hard-pin blindly.

**Shipped (both changes):**

1. **Env-gated provider steering** (`openrouter-v2-service.ts` — the LIVE path): `PRIVATE_OPENROUTER_PROVIDER_ORDER` (comma-separated, e.g. `Baidu,GMICloud`) adds an `order` preference to the OpenRouter `provider` config on all lanes; `allow_fallbacks: true` keeps default routing as the safety net. Unset = unchanged behavior. Test added (24/24 green). Documented in `.env.example`.
2. **Base-package parity** (`packages/smart-llm/src/smart-llm-service.ts`): `session_id`/`prompt_cache_key` added to the base `streamText` OpenRouter body + tests (43/43) — dormant for chat today, but correct for any consumer of the base service and required if the WP-6 migration ever completes.

**To activate:** set `PRIVATE_OPENROUTER_PROVIDER_ORDER=Baidu,GMICloud` in Vercel (and local `.env`), redeploy, then watch for ~1 week: cache hit % on passes 2+ (expect 6% → 40%+), per-pass `duration_ms` (WP-2), and Baidu error/failover rates. If Baidu degrades under real volume, unset the var — instant revert, no deploy.

## WP-5 — Append-only tool list within a turn ✅ CLOSED 2026-07-09 (verified, no change)

Code verification found the payload is already cache-stable on the common path:

- `materializeGatewayTools` (`gateway-surface.ts:305-335`) is strictly append-only with stable ordering (`[...currentTools, ...addedTools]`, deduped, never sorts). One inherent prefix bust per materialization — the price of lean discovery, acceptable.
- `normalizeToolsForRequest` (`smart-llm-service.ts:3017+`) is a deterministic, order-preserving map. No serialization instability.
- The only shrink is the **near-budget write-intent rescue pass** (`index.ts:908-922`, built at `:462-498`): fires at most once per turn (`writeIntentCarveOutUsed`), only when a write was identified but hasn't succeeded and the budget is nearly gone. It exists to stop a wandering model from burning the last rounds on reads instead of the write. Neutering that to save ~2 cache busts on rare rescue turns is a bad trade — validation runs against the pass's tool subset, so keeping the full payload would either let reads execute (defeating the rescue) or convert them into validation-repair passes (worse than the busts).
- The per-pass runtime-budget message is the **last** message, so it only sacrifices ~50 tokens of cacheable prefix.

**Known, accepted cache-miss sources:** one bust per materialization; two on rare write-intent rescues; pass-1→2 model switch on the tiering `ab` treatment arm (inherent to the experiment). If post-WP-4 telemetry shows passes 2+ still under ~50% cache hit, revisit — but expect the affinity keys to be the fix, not tool churn.

## WP-6 — Diff-audit the smart-llm refactor ✅ DONE 2026-07-09

**Headline structural finding:** the `openrouter-v2 → smart-llm` streaming migration was **abandoned mid-flight**. The live chat path runs `OpenRouterV2Service.streamText` (a full override, `apps/web/.../openrouter-v2-service.ts:1498`); the base `SmartLLMService.streamText` (`packages/smart-llm`) is a parallel implementation **no production stream-path caller uses** — dead-but-drifting. The live override is the GOOD one; the base is missing (all CONFIRMED with file:line in the audit agent's report):

1. **G7/D11** mid-stream error-frame handling — base has no `chunk.error` branch and yields `finish_reason:'error'` as a normal done. Fixed in the live override only.
2. No terminal `done` (and no usage log) when a stream closes without `[DONE]`.
3. Aborted turns log **no** usage row (billing undercount); live path logs a failure row with a char/4 estimate.
4. Failure-path usage rows log zeros and omit reasoning/cache/BYOK detail fields.
5. No `provider` routing preferences sent (live path sends `allow_fallbacks`/`require_parameters` — and now the WP-4 `order` steering).
6. Failover is OpenRouter-models-only — no direct Moonshot/OpenAI tier, no multimodal→text lane fallback.
7. Reasoning deltas only from `delta.reasoning`/`reasoning_details` — misses `reasoning_content`/`thinking` channels.
8. Truncated tool-call drops are silent (no warn), though the base's assembler is otherwise stronger on argument dedup.

**Actions taken:** warning comment added to the base `streamText` doc-block pointing here, so nobody re-points the orchestrator at it without porting the fixes. Base also got the affinity keys (WP-4 item 2) so it drifts less.

**Open decision for DJ:** pick a direction — (a) complete the migration properly (port items 1-8 into the base, then switch the orchestrator and delete the override), or (b) declare `OpenRouterV2Service` the permanent streaming implementation and strip the base `streamText` to prevent divergence. Either is fine; the current two-implementations state is the only wrong answer long-term. Not urgent — the live path is healthy.

## WP-7 — Skill-gate preload inversion ✅ DONE 2026-07-09 (code + tests; live verify pending)

**Why:** sensing already computes the ranked top-3 skill candidates before pass 1, then asks the model to call `skill_load` (+1 pass) and post-hoc repairs if it doesn't (up to +3 passes). Discovery-using turns: 5 passes/40.6s p50 vs 2/24.3s without. Precedent: `project_create` preloads its workflow and forbids `skill_load`.

**Shipped:**

- **New `skill-gate-preload.ts`** (`agentic-chat/tools/domains/`): `resolveSkillGatePreload(sensing, { alreadyLoadedSkillIds })` — when the gate is active, loads the top-1 candidate via `loadSkill(short format)` (synchronous, catalog-only) and renders a compact prompt block: workflow, guardrails, output contract, child-skill pointers, plus "call skill_load format 'full' for the deeper playbook" and the alternate candidates. Returns null when the gate is off, the candidate is missing, or the skill is already loaded in history.
- **Renderer** (`domain-sensing.ts`): the Active Domain Signals gate directive now renders `Skill-load gate: SATISFIED BY PRELOAD.` + the skill block instead of the "call skill_load" demand when a preload is supplied.
- **Prompt plumbing** (`build-lite-prompt.ts`, `prompt/types.ts`): `LitePromptInput.skillGatePreload` threaded through `buildActiveDomainSignalsSection` and `applyActiveDomainSignalsOverlay` — one injection point covering both fresh-build and prepared-prompt paths.
- **Server wiring** (`+server.ts`): preload resolves after history composition (skip when the skill already survives in `historyForModel`) and **after `consumePreparedPrompt`** — deliberately, so the prepared-surface hash check still compares launch tools and preload never inflates `stale_harness` misses. The skill's `materialized_tools` are pre-mounted onto the turn's tool surface (`tools` const→let + `materializeGatewayTools`). The preloaded id is appended to `skillGate.historyLoadedSkillIds`, so `shouldRepairSkillGateNoLoad` can't fire for it — the repair machinery survives untouched as the fallback for sensing misses.
- **Telemetry:** `domain_sensing_applied` gains `skill_preloaded_id` + `skill_preload_materialized_tools`; `skill_gate_evaluated` gains `skill_preloaded_id`. Preload-vs-hop cohorts are one query.
- **Tests:** new `skill-gate-preload.test.ts` (6), renderer preload tests, an overlay end-to-end test asserting the assembled system prompt carries the block and not the ACTIVE directive. Full affected sweep 162/162; svelte-check 0 errors.

**Cost note:** short format only (~hundreds of tokens, no markdown body) — full-format preload remains explicitly out of scope.

**Verify live:** run a real cold-email turn; expect ≤2-3 passes, no `skill_load` call, `skill_gate_evaluated.skill_preloaded_id` set, and `violationRepairInjected` at ~zero over the following week.

## WP-8 — Ledger durability + skip the outcome-card pass-through ✅ DONE 2026-07-09

**Shipped:**

1. **Ledger survives history compression:** new `getLoadedSkillIdsFromUsedDomains` (`domain-session-state.ts`) reads skill ids back from the durable `used_domains` session ledger (`skill_load`/`skill_loaded_event` sources only — card/resource loads don't put skill content in front of the model). `+server.ts` unions them into `skillGateHistoryLoadedSkillIds`, so the gate/repair machinery treats a previously loaded skill as loaded even after compression evicts the history ledger. **Deliberately NOT unioned into the preload skip** (`alreadyLoadedSkillIds`): when compression evicted the skill content, WP-7's preload must re-inject it rather than the gate passing on a skill the model can no longer see. Telemetry: `skill_gate_evaluated` gains `used_domain_ledger_skill_ids`.
2. **Contradictory gate directive fixed + outcome-card pass-through steered off:** WP-7's renderer left `Next step: <GATED_NEXT_STEP>` in place on preloaded turns — the block said "SATISFIED BY PRELOAD" at the top and "call skill_load" at the bottom (untested gap: the old assertion only checked the differently-worded header line). New `PRELOADED_NEXT_STEP` (`domain-sensing.ts`) replaces it: apply the preloaded workflow, don't call skill_load again, and don't call `outcome_card_load` for the listed cards — a pure pass-through (`materialized_tools:['skill_load']`) once the default skill is in-context.
3. **Tests:** `getLoadedSkillIdsFromUsedDomains` unit tests, renderer next-step swap test, gated-path next-step assertion. Full agentic-chat sweep 926/926; svelte-check 0 errors.

**Note for the Tier-2/expertise-session follow-up:** this stays minimal by design — expertise sessions persisting the loaded tree in session state supersede the ledger patch.

## WP-9 — Model experiment upward ⬜

**Why:** total chat LLM cost is $0.47/21d — cost is a non-factor. A stronger tool-caller reduces _pass count_ (better read batching, no spurious probes, correct one-shot writes) and raises capability. Every current route candidate is a budget open model (`model-config.ts:403-470`).

**Do:** put one genuinely strong tool-calling model in as `ACTIVE_EXPERIMENT_MODEL` (it's already first-loser in `OPENROUTER_TOOL_ROUTE` after deepseek). A/B against `deepseek-v4-flash` on: passes/turn, turn duration, validation failures, skill adoption, finalization-guard rate. Needs WP-2 data to read. Budget guardrail: alert if daily chat spend exceeds ~$1/day (still 40× current).

## WP-10 — First-token affordance ✅ ALREADY SHIPPED 2026-07-08 (status was stale)

Landed in commit `99e47640` with the 07-07 harness-audit fix wave, before this plan was drafted — both the 07-08 audit's F7 and this plan's ⬜ were stale. `onToolCall` in `+server.ts` emits an `agent_state: thinking` cue (`'Planning the first step...'`, `activity_visibility: 'activity_log'`) on the turn's **first tool_call**, with `first_tool_call_planning_cue_emitted` telemetry. Nothing left to build; worth one visual check in prod that the cue renders where expected.

## WP-11 — Prompt-size budget 🟡 budget test DONE 2026-07-09; trim deferred (after WP-4)

**Shipped:** `prompt-size-budget.test.ts` (`agentic-chat-lite/prompt/`) builds a canonical project turn (project + Start Here + knowledge map + tasks/goal/milestone/plan) plus the project tool surface, and asserts via `buildPromptCostBreakdown`: system prompt ≤ 30k chars (measured 27,169 / ~6,793 est tokens), provider payload ≤ 41.5k chars / ≤ 10.4k est tokens (measured 37,797 / 9,450). The next silent +20% drift now fails CI.

**Measured hot spot:** the skill catalog is the largest static section at **8,451 chars** — direct evidence for the Tier-0 domain diet in the follow-up section below.

**Deferred:** trimming hot per-turn sections (project digest, knowledge map, timeline) waits for WP-4 cache data, because caching makes the _static_ sections nearly free and changes what's worth trimming; the always-on domain overlay trim belongs to the Tier-0 diet.

## WP-12 — Opportunistic 🟡 (read memoization DONE 2026-07-09)

- ✅ **Within-turn read memoization (2026-07-09):** new `read-memo.ts` (`stream-orchestrator/`) — identical pure-read repeats are served from an in-turn cache with a `repeat_read_notice` nudge injected into the payload: zero execution cost, and the model is told it is looping. Guards: `isPureReadToolName` only (no writes, no discovery/materializing tools), successful results only (`requires_user_action` excluded), exact-argument keys via stable stringify (key-order-insensitive, array-order-sensitive), and the memo clears whenever an execution reaches the write executor so post-write re-reads hit the source. Served executions persist with `result->>'served_from_turn_memo' = true` — memo-hit rate is one query over `chat_tool_executions`. Harness tests updated (the two prior repeat-read tests now assert memo serves + intact loop-breaking: repetition fingerprint and read-loop escalation still fire — memoization makes loops cheap, not invisible) + a new write-invalidation test. Full sweep 935/935; svelte-check 0 errors.
- ⬜ **`create_onto_project` at 5.9s p50** — profile (likely serial inserts).
- ⬜ **Parallel pre-LLM DB steps:** independent awaited round-trips run serially (`+server.ts:1404-2171`: access checks ‖ session resolve; checkpoint ops ‖ each other; history ‖ context on miss). Worth a few hundred ms of tail.

---

## FOLLOW-UP (post-stabilization) — Domain repositioning: the three-tier expertise model

**Status:** ⬜ deferred by DJ 2026-07-09 until WP-1..12 are stable and measured. Do NOT start before the current wickets land and 2+ weeks of WP-2 telemetry confirm the pass/cache wins.

**DJ's insight (2026-07-09):** loading domains at the start of every chat is the wrong default. Most turns are BuildOS-native (referencing tasks/docs/projects — no domain machinery needed). Craft work (content creation, cold email) needs _deep_ expertise, and a chat turn structurally can't deliver it (a 31k-char skill vs a 15k-token prompt and a 12-round budget). Expertise should be a **deliberate door the agent walks through**, not ambient seasoning on every turn.

**Target architecture — three tiers:**

- **Tier 0 — BuildOS-native (most turns):** no domain machinery at all. No Active Domain Signals overlay, no root-skill catalog table in the prompt, no gate. This is a prompt-size win on the majority of turns.
- **Tier 1 — light craft touch:** "draft a quick cold email." Confident sensing → server-side short-format skill preload (WP-7's mechanism, unchanged). Cheap, invisible, no ceremony. One-shot deliverables stay fast.
- **Tier 2 — explicit expertise engagement:** a new `engage_expertise`-style tool the model calls (or user requests) when work is campaign/pipeline-scale. It flags the chat/workflow as expertise-requiring, loads the full skill stack (full markdown + references + linked skills), and either (a) shifts the session into a persistent **expertise session** mode or (b) dispatches an **Agent Run** (`delegate_task` — substrate already shipped) so depth happens in the background, not on inline chat passes.

**Key design decisions locked during the 2026-07-09 discussion:**

1. **Sensing survives as the criteria engine.** `senseDomains` (1ms keyword matching) already answers "does this need domain expertise?" — its _output_ changes: trigger Tier-1 preload automatically; _offer_ Tier-2 ("this looks like campaign-level cold outreach — want the full playbook?") rather than force it. Tier heuristic: one-shot deliverable → Tier 1; multi-step campaign/pipeline → offer Tier 2. Outcome cards are a decent proxy for that split.
2. **Deep mode = delegation, not a longer chat.** More inline passes is the cost center the whole plan attacks. Agent Runs + AI Inbox are the vehicle for deep skill-tree work.
3. **Expertise sessions persist the loaded tree in session state** (chat-level flag) — which also solves the ledger-dies-with-history-compression problem (WP-8) more naturally than ledger patching.
4. **`domain_research_queue` + the sensed-vs-used signal split** (`domain-used-signals.ts`, spec 2026-07-09) become the feedback loop for "let me see what I got": used-demand data decides which domains deserve deeper skill trees.

**Execution plan when picked up:**

1. **Spec first** (short doc, ~1 day): `engage_expertise` tool contract, expertise-session chat flag + session-state shape, sensing→offer prompt surface, Agent Run dispatch criteria, and the Tier-0 prompt diet (what leaves the prompt on non-craft turns).
2. **Tier-0 diet:** strip domain overlay + catalog table from turns where sensing returns null. Measure prompt-token drop (expect meaningful — the catalog table is one of the largest static sections).
3. **Tier-2 tool + session mode:** `engage_expertise` materializes the full skill stack, sets the session flag, persists the tree in `fastchat_domain_state`.
4. **Agent Run path:** deep engagements route through `delegate_task` with the skill stack in the run's context; results land in AI Inbox / chat bridge.
5. **Retire the skill-gate repair pass** once Tier 1 (preload) + Tier 2 (explicit) cover the cases — it becomes dead weight.
6. **Sequencing dependency:** WP-7/WP-8 land first (Tier 1 is WP-7's preload; WP-8's ledger work gets superseded by expertise sessions — keep WP-8 minimal knowing this).

**Interaction with current plan:** WP-7 proceeds unchanged (it IS Tier 1). WP-8 stays minimal. The always-on overlay trim moves here (Tier-0 diet) rather than WP-11.

---

## What NOT to do (carried from the audit)

No harness rewrite. No embedding-based sensing yet. Don't relax `stale_harness` (read the new hash diagnostics first). Don't preload full skill markdown. Don't touch the observability tail or prompt dumps (measured non-issues). Prewarm: let the 07-08/07-09 mitigations accumulate data before more work.

## Measurement loop

After each WP lands, the readout is the same three queries (now cheap thanks to WP-2):

1. Per-pass duration p50/p95 by `pass_role` × `model_tiering_variant` (`chat_turn_events` → `llm_pass_completed`).
2. Cache-hit % by pass position (`llm_usage_logs.cached_prompt_tokens/prompt_tokens` by `stream_run_id` order).
3. Passes/turn + duration by turn class (discovery vs plain tool vs write vs tool-less) (`chat_turn_runs` × `chat_tool_executions`).

Targets: p50 project turn 24s → ~10-12s (2 passes × ~5s cached); discovery-turn tail 40s → ~25s; TTFT p50 9s → ~5-6s (tiering + affordance).
