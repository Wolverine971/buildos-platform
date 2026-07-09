<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_V2_SPEED_CAPABILITY_AUDIT_2026-07-08.md -->

# Agentic Chat V2 — Speed & Capability Audit (Round 2)

**Date:** 2026-07-08
**Predecessor:** `AGENTIC_CHAT_V2_HARNESS_AUDIT_2026-07-07.md` (harness robustness; its P1/P2 fixes shipped 2026-07-08)
**Method:** Fresh production telemetry (30 days: ~170 turns, 333 chat LLM calls, per-pass cache accounting, tool-execution timing) + four parallel code audits of the turn lifecycle, discovery architecture, prompt/caching layer, and observability/tiering reach.
**Trigger:** Concern that chat is "getting slower," plus an external assessment claiming multi-pass hops are the dominant cost.

---

## TL;DR

**The chat is not meaningfully regressing — but it is structurally slow, and the reasons are now precisely measurable.** TTFT p50 has been flat at ~8–12s for a month. What changed recently: prompt tokens spiked ~20% in late June (p50 18.8k in the 6/26 window vs ~15k baseline) and pass counts p90 crept from 4 → 6–7 before settling. The _feel_ of slowness is real, though — it comes from the multiplication, not a regression:

> **turn time ≈ (LLM passes) × (~7s per pass)** — LLM time is **87%** of turn duration; tools are 5%; harness overhead ~2s/turn.

The external assessment's direction is correct ("too many model/tool hops per answer") but it missed the four most actionable specifics:

1. **Provider prompt caching is completely unsteered — and this is a REGRESSION, not missing work.** The cache-affinity fix (backend-audit finding D9) shipped in commit `734b291a` on 2026-07-02: `buildOpenRouterChatCompletionBody` accepts `session_id`/`prompt_cache_key` (`openrouter-request.ts:19-23,61-66`, with a comment citing OpenRouter's prompt-caching guide). But the refactor from `openrouter-v2-service.ts` into `smart-llm-service.ts` dropped the wiring at the live `streamText` call site (`smart-llm-service.ts:1962-1974` passes neither field; only the moonshot branch sets `prompt_cache_key` at `:1986-1990`) — **the same refactor that regressed mid-stream error handling (G7/D11 in the graceful-error audit)**. Production evidence: **pass 2 of the same turn gets a median 8% cache hit, pass 3 gets 0%**; only 20.5% of 5.3M prompt tokens hit cache over 21 days; 177/333 calls got zero. Cached passes measurably run **~1.4s faster** (5.6s vs 7.0s p50 on passes 2+). Restoring the wiring is the cheapest large win in the codebase.
2. **Model tiering is built, tested, A/B-instrumented — and OFF in prod.** `FASTCHAT_INITIAL_PLAN_MODEL_TIERING` is unset everywhere (not even in `.env.example`). The 2026-07-08 fix #10 has never actually run.
3. **The discovery architecture pays a full LLM pass per hop for information the server already has.** Domain sensing computes the ranked top-3 skill candidates and recommended load format _server-side, before pass 1_ — then renders them as prose and asks the model to go call `skill_load` itself (and repairs with _another_ pass if it doesn't). The preload pattern already exists for exactly one case (`project_create` injects the full workflow and says "don't call skill_load" — `build-lite-prompt.ts:102,276,418,796`). Discovery-using turns run **5 passes / 40.6s p50 vs 2 passes / 24.3s** without.
4. **You are massively over-optimizing for cost.** Total chat LLM spend over 21 days: **$0.47**. The product problem is latency and capability; the budget headroom to buy both is ~30–50× current spend before it's even noticeable.

Also: `get_calendar_event_details` failed **5/5 times** in 21 days, and the model blindly retried it 4× in one turn — a straight capability bug creating churn passes.

**Architecture verdict: no rewrite needed.** The loop, supervisor, and repair machinery are sound (last audit's conclusion stands). The one architectural _inversion_ worth making: discovery should be **server-pushed when sensing is confident, model-pulled only as fallback**.

---

## Fresh production telemetry

### Trend — is it getting slower? (5-day buckets)

| Bucket | n   | TTFT p50/p90  | Duration p50/p90 | Passes p50/p90 | Prompt tok p50/p90  | Per-call resp p50 |
| ------ | --- | ------------- | ---------------- | -------------- | ------------------- | ----------------- |
| 06-06  | 14  | 12.0s / 33.2s | 55.2s / 111.6s   | 2 / 4          | 14,667 / 22,907     | 12.6s             |
| 06-11  | 24  | 9.8s / 12.7s  | 27.4s / 62.4s    | 2 / 4          | 15,732 / 21,584     | 8.9s              |
| 06-16  | 51  | 9.7s / 27.1s  | 21.4s / 67.1s    | 2 / 4          | 13,987 / 16,280     | 6.2s              |
| 06-21  | 29  | 8.2s / 14.5s  | 22.2s / 43.5s    | 3 / 6          | 15,278 / 21,976     | 6.3s              |
| 06-26  | 26  | 8.6s / 25.2s  | 29.2s / 78.8s    | 3 / 7          | **18,788 / 27,149** | 8.6s              |
| 07-01  | 15  | 12.2s / 26.3s | 29.5s / 44.0s    | 2 / 3          | 16,294 / 19,939     | 8.4s              |
| 07-06  | 9   | 8.4s / 24.6s  | 24.3s / 36.9s    | 2 / 3          | 15,505 / 18,698     | 9.1s              |

Read: no monotonic regression. The 6/26 window is the "it feels slower" window — prompt bloat + pass creep together. The model switched fully to `deepseek-v4-flash` ~6/21; per-call response p50 improved initially (6.3s) then drifted back to ~9s.

### Where a turn's time goes (last 60 finished turns)

- **LLM share p50: 87%.** Tool share p50: 5%. Non-LLM-non-tool: ~2.1s p50 / 2.6s p90 per turn.
- Tool-less answer turns: 1 pass, **12.5s p50** — this is the latency _floor_ (model + 15k prompt), before any orchestration.
- Discovery-tool turns: n=19, **5 passes / 40.6s p50**. Tool turns without discovery: n=109, **2 passes / 24.3s p50**. Write turns: 2 passes / 22.9s p50.

### Provider cache reality (21 days, 333 calls)

| Pass # in stream | n   | Cache-hit % p50 | Zero-cache calls | Resp p50 |
| ---------------- | --- | --------------- | ---------------- | -------- |
| 1                | 119 | 0%              | 80               | 6.6s     |
| 2                | 103 | **8%**          | 47               | 5.8s     |
| 3                | 52  | **0%**          | 29               | 6.7s     |
| 4                | 27  | 14%             | 12               | 8.8s     |
| 5                | 15  | 34%             | 1                | 8.6s     |
| 6+               | 17  | 7%              | 8                | 7.9s     |

- Providers are stable within a stream (93/103 multi-pass streams on one provider; GMICloud served 294/333 calls) — **provider bouncing is NOT the cause**. The cause is that nothing steers the cache and the request shape churns (tool list mutation, no cache key).
- Passes 2+ with >50% cache hit: **5,573ms p50** (n=39) vs ≤50%: **7,045ms** (n=175). ~1.4s per pass on the table.

### Tool health (21 days)

Reads are fast (get_document_outline 245ms p50, read_document_section 218ms). Writes are 1–2s; `create_onto_project` is the outlier at **5.9s p50 / 7.6s p90**. Two pathologies:

- **`get_calendar_event_details`: 5 calls, 5 failures (100%)** — and one turn shows it called 4× consecutively (model retry churn).
- Repeat-call churn on 3+ pass turns: `get_document_outline ×3`, `search_all_projects ×4` in single turns — repetition fingerprinting exists but these sequences got through.

### Cost

**$0.47 total for 21 days of chat LLM usage.** (deepseek-v4-flash: 309 calls; hy3-preview: 24.)

---

## Assessment of the external agent's claims

| Claim                                            | Verdict                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple LM passes = largest latency multiplier  | **Confirmed, quantified.** 87% LLM share; ~7s/pass; discovery turns 5 passes vs 2.                                                                                                                                                                                                    |
| Discovery chains force a pass per hop            | **Confirmed structurally.** Every discovery payload is a routing pointer (`materialized_tools` only mounts the _next_ hop's tool). But sensing already collapses the front of the chain when it fires; the residual mandatory hop is `skill_load`.                                    |
| Skill-gate repair adds a full extra pass         | **Confirmed, worse than stated.** A violation costs up to 3 passes (wasted synthesis + forced load + redraft). Fires at most once/turn (`skillGateStopRepairInjected`, `stream-orchestrator/index.ts:1104`). But it's rare — the gate itself is rare (skills loaded on ~7% of turns). |
| Prompt size slows every pass                     | **Confirmed.** 15.3k p50 prompt tokens + 2.4–5.1k tool-schema tokens re-sent per pass, no within-turn pruning. Missed the bigger finding: none of it is provider-cached.                                                                                                              |
| Local prompt dumps slow prod                     | **Overstated.** Dev-gated (`shouldWriteLocalPromptDump`, `prompt-dump-files.ts:57-88`); prod requires an explicit `FASTCHAT_LOCAL_PROMPT_DUMPS=true` override. Non-issue.                                                                                                             |
| Observability tail extends turns                 | **Overstated.** Events buffer in memory; turn-run/timing writes are detached; the snapshot insert defers to after first delta (`+server.ts:2467-2575`); final flush is budget-bounded at 5s. The only first-token-blocking write is the admission INSERT (`+server.ts:1586`).         |
| Model tiering has limited reach                  | **Confirmed — and it's actually OFF.** Env var unset anywhere; even when on, only pass 1 gets the fast tier (`model-tiering.ts:129-140`).                                                                                                                                             |
| Tool execution/persistence adds latency          | **Mostly wrong.** Tools are 5% of turn time; reads batch (concurrency 3, `+server.ts:2772-2778`); only mutation rows are awaited mid-turn (`+server.ts:2906-2911`).                                                                                                                   |
| Domain sensing is cheap; its consequences aren't | **Confirmed.** Sensing is ~1ms synchronous keyword matching. The cost is that its output is _advisory prose_ instead of a preloaded payload.                                                                                                                                          |

---

## Findings (ranked)

### F1 — Provider prompt caching is unsteered (regressed fix D9); ~1.4s/pass and ~80% of input cost left on the table

**Where:** `packages/smart-llm/src/smart-llm-service.ts:1962-1974` (streaming body: no `session_id`, no `prompt_cache_key`), `openrouter-request.ts:19-23,61-66` (support added by fix D9, commit `734b291a` 2026-07-02, now unused on the live path), `stream-orchestrator/index.ts:447-460` + `:912-919` (tool list mutates between passes).

**This regressed in the `openrouter-v2-service.ts` → `smart-llm-service.ts` refactor** — the same refactor the graceful-error audit caught dropping mid-stream error handling (G7, regression of D11). Two confirmed casualties from one refactor suggests a diff-audit of that refactor for other lost fixes is warranted.

The prompt is already ordered cache-optimally (static sections first — `build-lite-prompt.ts:66-82`; the volatile budget message is appended _last_, `index.ts:935-948`). The message array is append-only within a turn. Prefix caching _should_ work — the measured 0–8% hit rate on passes 2–3 says it doesn't, because:

1. No cache-affinity hint is sent, so the upstream provider's LB has no reason to route pass 2 to the node holding pass 1's KV prefix.
2. The `tools` payload changes mid-turn: `materializeDirectTools` grows it on demand, and write-intent passes _shrink_ it to a filtered subset then restore — since tool schemas serialize at the front of the provider prompt, each change busts the entire prefix.
3. When tiering is enabled, pass 1 runs a different model than pass 2+ — a guaranteed full miss on the most valuable transition.

**Fix (S–M):** (a) pass `session_id` + a stable per-turn `prompt_cache_key` through `streamText` → `buildOpenRouterChatCompletionBody`; (b) make the within-turn tool list append-only — drop the write-intent pass's tool-list _filtering_ in favor of its existing instruction message, or accept one bust at materialization but never shrink/restore; (c) keep pass-1 tiering cache-loss in mind when evaluating the A/B (fast pass-1 + cached balanced pass-2+ may still win). Measure with the already-logged `openrouter_cache_status` per pass.

### F2 — Discovery inversion: sensing knows the answer and asks the model to fetch it

**Where:** `+server.ts:1724-1730` (sensing before pass 1), `domain-sensing.ts:583-648` (ranked top-3 + formats computed server-side), `build-lite-prompt.ts:665-666,728` (prompt says "call skill_load"), `finalization-runner.ts:208-225` + `index.ts:1098-1116` (post-hoc repair), precedent at `build-lite-prompt.ts:102,276,418,796` (project_create preloads and forbids skill_load).

Sequence today for a skill-covered turn: sense (1ms) → tell model to load → model loads (**+1 pass, ~7s**) or ignores → repair (**+1 pass**) → forced load (**+1 pass**) → redraft. Measured: discovery turns 5 passes/40.6s vs 2/24.3s.

**Fix (M) — the one architecture change worth making:** when `skill_load_required === true` and there's a confident top-1 candidate, the server calls `loadSkill(topCandidate, { format: 'short' })` during prompt build, injects workflow + `output_contract` as a prompt section, and pre-materializes its `materialized_tools` via `materializeGatewayTools` (`gateway-surface.ts:305`). Short format ≈ a few hundred tokens (full markdown would be 3.5k–8k — don't default to it). The gate repair path stays as fallback for sensing misses. Expected: skill-covered turns drop 1–3 passes; the "model only loaded a skill on 4/58 turns" adoption problem disappears because there's nothing left to adopt.

Corollaries, same theme:

- **`outcome_card_load` is a pure pass-through** (`materialized_tools:['skill_load']`, `outcome-card-load.ts:76`) — when sensing already ranked the card's `default_skill_id`, that hop is a pass that mounts nothing executable. Skip it.
- **The loaded-skill ledger dies with history compression.** `extractLoadedSkillIdsFromHistory` (`+server.ts:2678-2680`) only sees skills whose `skill_load` payload survived in `historyForModel`; compression (threshold 8, tail 4) evicts it, and the same session re-pays the hop. The new `used_domains` signal (`domain-used-signals.ts`) already records what was loaded but is write-only — wire it into the gate's ledger so it survives compression.

### F3 — Model tiering shipped but never enabled; model strategy is inverted relative to the problem

**Where:** `+server.ts:301-309` (env-gated, default `off`); env var absent from every `.env`/`.env.example`. Cost data: $0.47/21d.

Two separate points:

1. **Flip the switch.** `FASTCHAT_INITIAL_PLAN_MODEL_TIERING=ab` in Vercel. It's deterministic per-turn, telemetry is wired (`pass_role`, `model_tiering_variant` on `llm_pass_completed`). Zero code.
2. **Run a real model experiment upward, not just sideways.** Every candidate in the balanced/tool routes is a budget open model (`model-config.ts:403-470`). At $0.47/21d, a model that's 30× the cost is ~$14/21d — irrelevant. A stronger tool-caller cuts _passes_ (better read batching, no spurious re-probes, correct one-shot writes) which is worth more than per-token speed, and raises capability, which is the other half of this audit's mandate. Concretely: add one strong-tool-calling mid-tier model as `ACTIVE_EXPERIMENT_MODEL` in the tool route and A/B pass-count + duration + validation-failure rate against deepseek-v4-flash. The per-pass telemetry (F5) is a prerequisite for reading the result.

### F4 — Capability bugs creating churn passes

- **`get_calendar_event_details`: 100% failure rate (5/5), retried ×4 in one turn.** Every failed call risks another round. Root-cause and fix; also confirm failures surface to the model as actionable errors, not silent empties.
- **Repeat-call churn:** `get_document_outline ×3`, `search_all_projects ×4` within single turns. The repetition fingerprint (consecutive + windowed) exists but these got through — likely arg-variation defeating the fingerprint. Consider server-side within-turn memoization of identical pure-read calls: return the cached result instantly with a nudge, spending 0 passes instead of burning a round.
- **`create_onto_project` at 5.9s p50** blocks its round; profile it (likely serial inserts) — it's the single slowest tool by far.

### F5 — You can't see pass duration, so every fix above is unmeasurable

**Where:** `LLMStreamPassMetadata` (`stream-orchestrator/shared.ts:31-58`) records tokens/model/finish per pass but **no start/end/duration, no per-pass TTFT**.

Everything in this audit reduces to `passes × pass-time`, and neither factor is directly queryable today (pass count is; pass time must be inferred from `llm_usage_logs.response_time_ms` joins). Add `startedAtMs`/`firstTokenAtMs`/`durationMs` to the pass metadata and the `llm_pass_completed` event. Small patch, prerequisite for evaluating F1–F3. While there: aggregate `cache_status` per pass into the turn run so cache-hit-rate is one query, not a log join.

### F6 — Prompt diet: worth doing, but _after_ caching

15.3k p50 prompt tokens (+2.4–5.1k tool schemas). The biggest static chunks (skill catalog table, Operating Strategy, Safety) become nearly free once prefix caching works — so **cache first, then trim what's still hot**: the per-turn sections (project digest, knowledge map, timeline, loaded-context index) and the tool schemas (already char-budgeted per surface; `create_onto_project` alone is 5.8k chars). The late-June token spike (+20% p50) shows prompt size drifts upward silently — the existing `tool-surface-size-report` test guards tool schemas, but nothing guards _total assembled prompt_ size; add a budget assertion on `buildPromptCostBreakdown` output for a canonical project turn.

### F7 — Perceived latency: the silent grind is the worst UX in the system

Worst turn: 192s duration, **TTFT 191.6s** — ten passes of silent tool work before any text. Even healthy write turns (`project_create`: 2 passes, 1 call) show 21–26s TTFT. The 2026-07-07 audit's fix #6 (visible planning cue on first tool_call rather than waiting for a buffered complete sentence) is still open and is the cheapest perceived-latency win. The SSE heartbeat (shipped) keeps the connection alive but shows the user nothing.

### F8 — Pre-LLM serial DB chain (minor, tail-latency only)

~7–8 sequential awaited DB round-trips before the first LLM call on a cold turn (`+server.ts:1404-2171`: access checks → session resolve → active-turn lookup → admission insert → checkpoint recover ×2 → prepared-prompt consume → history load → context load). Independent pairs (project access ‖ session resolve; checkpoint ops ‖ each other; history ‖ context on miss) could be `Promise.all`'d. Context build p95 is 458ms so this is worth at most a few hundred ms — do it opportunistically, not as a priority.

---

## What NOT to do (build-less guardrails)

- **No architecture rewrite.** The orchestrator spine, supervisor, repair machinery, and crash-recovery persistence are sound and battle-tested. Every fix above is a flag flip, a small patch, or one contained inversion (F2).
- **Don't build embedding-based sensing yet.** Keyword sensing is 1ms and its recall gaps are cheaper to fix by alias maintenance until preloading (F2) proves out; an embedding fallback is a Tier-3 idea at best.
- **Don't relax `stale_harness`.** The strict fingerprint is correct; the new hash-level diagnostics (2026-07-09) will show whether residual misses are surface drift or tool churn — read that data before touching tolerance.
- **Don't chase the observability tail or prompt dumps.** Measured non-issues.
- **Don't preload full skill markdown by default.** Short format only (hundreds of tokens); full format re-creates the prompt-bloat problem F6 is trying to shrink.
- **Prewarm (28% → ~44% hit rate trend) is already instrumented and mitigated** — let the 07-08/07-09 fixes accumulate data before more work. Its wall-clock win is modest anyway (context build is 2ms on session-cache hits).

---

## Prioritized fix list

| #   | Fix                                                                                                                                                                                                                                                                                                  | Effort          | Expected impact                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| 1   | **Restore regressed cache-affinity fix (D9)**: re-wire `prompt_cache_key` + `session_id` into the `streamText` OpenRouter body; append-only tool list within a turn (stop shrink/restore on write-intent passes); diff-audit the `openrouter-v2` → `smart-llm-service` refactor for other lost fixes | S–M             | High — ~1.4s/pass on passes 2+, compounding on 3–10-pass turns; ~80% input-cost cut     |
| 2   | **Enable `FASTCHAT_INITIAL_PLAN_MODEL_TIERING=ab`** in prod                                                                                                                                                                                                                                          | XS              | Medium — first-token latency on pass 1; it's built, flip it                             |
| 3   | **Per-pass duration + TTFT telemetry** in `LLMStreamPassMetadata` / `llm_pass_completed`                                                                                                                                                                                                             | S               | Enabler — makes #1/#2/#5 measurable                                                     |
| 4   | **Fix `get_calendar_event_details`** (100% failure) + within-turn memoization of identical pure-read repeats                                                                                                                                                                                         | S               | Medium — kills churn passes                                                             |
| 5   | **Skill-gate preload inversion**: server-side `loadSkill(top-1, short)` + pre-materialize its ops when `skill_load_required`; keep repair as fallback                                                                                                                                                | M               | High — 1–3 passes off skill-covered turns; fixes skill adoption                         |
| 6   | **Ledger durability**: wire `used_domains` into the loaded-skill ledger so it survives history compression; skip the `outcome_card_load` pass-through                                                                                                                                                | S               | Medium — stops repeat hops in long sessions                                             |
| 7   | **Model experiment upward**: one strong tool-calling model in the tool route as `ACTIVE_EXPERIMENT_MODEL`, A/B on pass count + duration + validation failures                                                                                                                                        | S code / M eval | High if it lands — fewer passes _and_ more capability; cost is a non-issue at $0.47/21d |
| 8   | **First-token affordance** on first tool_call (carry-over: 07-07 fix #6)                                                                                                                                                                                                                             | S               | Medium — perceived latency; kills the silent grind                                      |
| 9   | **Prompt-size budget test** on total assembled prompt; trim hot per-turn sections after caching lands                                                                                                                                                                                                | S–M             | Medium — guards against the next silent +20% drift                                      |
| 10  | Parallelize independent pre-LLM DB steps; profile `create_onto_project` (5.9s)                                                                                                                                                                                                                       | S               | Low–medium — few hundred ms tail                                                        |

**Sequencing:** 2+3+4 this week (hours each). 1 next (it multiplies everything). Then 5+6 as one work package (the discovery inversion). 7 runs as an experiment alongside. 8–10 opportunistic.

---

## Answers to the questions asked

**"Do I need to adjust the architecture?"** No rewrite. One inversion: discovery becomes server-pushed when sensing is confident (F2), model-pulled as fallback. Everything else is flags, plumbing, and small patches on a sound spine.

**"Do I need to clean up domain sensing?"** Sensing itself is fine — 1ms, deterministic, already computes ranked candidates and formats. The cleanup is downstream: stop rendering its conclusions as advice and start acting on them (preload), and make its cross-turn memory (`used_domains`, ledger) actually feed the next turn instead of being write-only telemetry.

**"How do I make everything better?"** The compound move: **cache the prompt (F1) × cut the passes (F2/F4) × upgrade the model (F3/F7)**. Each attacks a different factor of `passes × pass-time`; together a p50 project turn goes from ~2–3 passes × 7s ≈ 24s toward ~2 passes × 4–5s ≈ 9–10s, with the discovery-turn tail (40s) collapsing toward the normal-turn baseline — while capability goes _up_, because the model always has the right skill in-context and a stronger brain when the experiment lands.
