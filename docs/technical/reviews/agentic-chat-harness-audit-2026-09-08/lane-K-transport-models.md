<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-K-transport-models.md -->

<!-- doc-status: point-in-time -->

# Lane K — Transport, models, routing, caching, cost

Audit of the OpenRouter client and model configuration behind the agentic chat worker. Working
tree at HEAD `6d70b36e1` plus uncommitted changes, read 2026-09-09T02Z. Every line reference is
to the working tree. Production numbers are a read-only pull of `llm_usage_logs` and
`chat_turn_events` for the window since the one-engine deploy (2026-09-04T17:14Z to
2026-09-09T02Z): 292 provider calls, 55 turns, 1 user (DJ plus the 09-04 browser battery). Pull
scripts and raw output are in `evidence/lane-K-*`.

## 0. Verdict

The transport is correct and hard to kill: bounded SSE, budget-derived timeouts, idempotent usage
receipts with provider-reported cost, an atomic buffered pass. What is wrong sits one layer up, in
the **routing policy the client applies per turn**, and it is measurable:

- **26 of 55 turns carry at least one failed provider attempt** (27 pre-stream failures). 18 are
  `404 No endpoints found` — every one of them the pass after Alibaba served the previous pass,
  where the client sent `order:['alibaba'], allow_fallbacks:false`. 9 are `429` on a pinned
  DeepInfra. The code comment at `openrouter-client.ts:893-897` describes this exact mechanism and
  chose "retryable" over "fix". The retry lands on a different provider with a **4% median cache
  hit instead of 80%**.
- **The pin captures the provider's model string, not the requested id.** 37 of 292 requests asked
  OpenRouter for `deepseek/deepseek-v4-flash-20260423`; 11 of those were routed to Azure
  (p50 21.5 s per pass vs 5–8 s elsewhere, $0.21/$0.56 per M vs $0.09/$0.18), and 2 more 404'd.
- **Two of the four preferred providers do not exist for this model** (`deepseek`, `cloudflare`),
  DeepInfra (first) served 12% because it rate-limits, so the effective policy is "Alibaba, then
  whatever". Cheaper healthy endpoints (StreamLake $0.089, GMICloud $0.091) are never used.
- **Cross-turn prompt caching is 4.7% (768 tokens) on pass 1** and, at these prices, worth about
  $0.001 per turn. The cache that matters is within-turn (80% when the provider holds), which K1
  and K2 break in 47% of turns.
- **The reviewer is 26% of spend and ~28% of a write turn's provider wall time**: p50 10.3 s per
  call (3.6 s on 09-02), 1.65 calls per write turn, ~430 hidden reasoning tokens per call at the
  model's default effort; its `temperature: 0` is silently dropped for Luna.
- **Cost math**: today's blended cost is **$0.0076/turn** ($9/month at 4 users × 10 turns/day;
  $1.1–2.3k/month at 1,000 users). Luna as the acting model with no reviewer would be
  $0.0092/turn (+20%) with two fewer passes per write turn. The cheap-model constraint saves
  ~$4/month today and ~$0.5–1.1k/month at 1,000 users. The provider-routing fix (K1–K3) saves 25%
  for free.

Proportionality of the client: 2,315 lines, of which ~1,100 are load-bearing transport and
receipts. About 900 lines are removable or consolidatable (§9). A 500-line client is not the right
target — it would drop the durable attempt receipts and cost attribution this audit itself relies
on — but ~1,300 is.

## 1. Subsystem map

A turn's provider passes all go through one path. `turn-provider.ts:1105-1120 providerPass()`
counts the pass and calls `streamBufferedProviderPass` (`provider-pass.ts:31-124`), which buffers
a whole pass behind an atomic boundary and retries once on a retryable error. It calls
`AgenticChatOpenRouterClient.stream()` (`openrouter-client.ts:315-822`), which: validates the tool
surface against the production allowlist (`:1947-1973`); builds the request body through
`@buildos/smart-llm`'s `buildOpenRouterChatCompletionBody` (`:1075-1123`; `openrouter-request.ts:133-175`);
applies the per-turn route health (pin, failed providers, model reordering, `:954-1073`); writes a
`provider_attempt_started` receipt by RPC (`:469-477`, adapter `executionObservation.ts:67-96`);
opens the fetch with a budget-bounded timeout (`:824-832`, `:834-953`); parses SSE lines into
`text`/`tool_call`/`reasoning` events (`:1255-1348`) while a name-level shadow accumulator mirrors
the consumer's tool-call assembly (`:1349-1476`); classifies truncation against `max_tokens` and
finish reason (`:604-664`); writes `provider_attempt_ended` and an idempotent `llm_usage_logs`
upsert (`:348-450`, `AgenticChatLlmUsageObserver :1199-1253`, `usage-logger.ts:82-230`); then
yields `done`. Two client instances exist: acting (`bootstrap.ts:362-365`) and semantic reviewer
(`bootstrap.ts:366-375`; temperature 0, 4,000 max tokens, 45 s timeout, routes cloned by
`buildAgenticChatSemanticReviewerRoutes :435-508`). Configuration comes from env via
`config.ts:256-308` (one OpenRouter route, provider order `deepinfra, deepseek, alibaba, cloudflare`
at `:34-43`). `providerCapacity.ts` is a concurrency lease plus a per-turn "degradation latch";
`capacity.ts` projects worker capacity to the web admission check. `promptDump.ts` writes local
request/response dumps only when `NODE_ENV=development` and no Railway env is present
(`:27-38`). The chat uses `@buildos/smart-llm` only for the body builder, model catalog/pricing,
the usage logger and thinking-block stripping; smart-llm's own `OpenRouterClient` is
request/response (`smart-llm/openrouter-client.ts:41-56`) and cannot stream tool calls, which is why
a second client exists.

## 2. Measurements

| Measure                                            | Value                                                                                                                                                                           | Source                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Window                                             | 2026-09-04T17:14Z → 09-09T02Z; 292 calls, 55 turns, 1 user                                                                                                                      | `evidence/lane-K-usage-report.json`                       |
| Client size                                        | 2,315 lines; 49 tests / 2,554 test lines                                                                                                                                        | `wc -l`; `tests/agenticChatOpenRouterClient.test.ts`      |
| Calls per turn                                     | p50 5, p90 9, max 12                                                                                                                                                            | usage report `perTurn`                                    |
| Acting prompt tokens per call                      | p50 15,197, p90 19,829                                                                                                                                                          | usage report `byRole.acting`                              |
| Prompt tokens per turn                             | p50 61,451, p90 127,680, max 206,568                                                                                                                                            | usage report `perTurn`                                    |
| Acting cache rate (all passes)                     | 44% of prompt tokens                                                                                                                                                            | usage report                                              |
| Pass-1 cross-turn cache                            | median 4.7% = 768 tokens of 14,492; 31/55 turns any hit                                                                                                                         | `lane-K-pin-snapshot-cache.mjs`                           |
| Continuation cache, same provider vs switched      | median 80% (n=131) vs 4% (n=32)                                                                                                                                                 | same                                                      |
| Turns whose acting passes touched >1 provider      | 26 of 55 (21 two, 5 three+)                                                                                                                                                     | same                                                      |
| Failed provider attempts                           | 27 in 26 turns: 18×404 (all after Alibaba), 9×429 (7 after DeepInfra)                                                                                                           | `lane-K-pin-trace.mjs`                                    |
| Requests sent with the `-20260423` snapshot id     | 37 (35 ok, 2×404); 11 went to Azure                                                                                                                                             | `lane-K-pin-snapshot-cache.mjs`                           |
| Provider share of successful DeepSeek calls        | Alibaba 51%, NextBit 26%, DeepInfra 12%, Azure 7%, Phala 3%, StreamLake 2%                                                                                                      | usage report `byModelUsed`                                |
| Per-pass latency by provider (acting p50/p90)      | Alibaba 5.3/12.0 s; DeepInfra 5.3/20.8 s; NextBit 7.8/18.1 s; Azure 21.5/31.1 s                                                                                                 | usage report `byProvider`                                 |
| Reviewer                                           | 43 calls (40 contract, 3 research), 0 failures, p50 10.3 s / p90 17.3 s, cache 23%, $0.00266/call                                                                               | usage report                                              |
| Reasoning tokens                                   | acting 37,408 of 93,484 completion (40%); reviewer 18,539 of 35,894 (52%)                                                                                                       | usage report `reasoning`                                  |
| Completion at the 4,000 cap                        | 0 calls; max 2,616 acting, 3,023 repair                                                                                                                                         | usage report                                              |
| Turn wall time (timing event)                      | total p50 45.1 s / p90 99.1 s; first response p50 15.8 s                                                                                                                        | `lane-K-timing.mjs`                                       |
| Non-model time inside the provider loop            | p50 6.0 s / p90 14.5 s (model share 82%)                                                                                                                                        | same                                                      |
| Read-only turn (29)                                | 4 calls, 50.4k prompt (45% cached), $0.0047, 25.5 s provider time                                                                                                               | `lane-K-turn-classes.json`                                |
| Reviewed write turn (26)                           | 4 acting + 2 reviewer calls, 63.4k + 14.0k prompt, $0.0110 (reviewer $0.0044), 60.7 s                                                                                           | same                                                      |
| Spend in window                                    | $0.446 total; acting $0.306; reviewer $0.1145 (26%)                                                                                                                             | usage report                                              |
| Tool surface bytes (catalog, pre worker narrowing) | global 28 tools / 39,615 chars; project 35 / 41,643; project_create 7 / 16,443                                                                                                  | `lane-K-surface-bytes.json`                               |
| Reviewer static prefix                             | system prompt 9,672 chars (~2.4k tokens); approve tool 1,630; revision 6,442                                                                                                    | compiled `dist/.../review/*.js`                           |
| Request bytes before the first per-turn byte       | 78 (JSON preamble) + ~5,231 (static system sections) ≈ 5.3 KB of a ~60 KB opening request (8.8%)                                                                                | node one-liner; lane A 09-02                              |
| Cheap-model prices (OpenRouter endpoints, live)    | DeepInfra 0.090/0.018/0.180; StreamLake 0.089; GMICloud 0.091; Alibaba 0.134/0.027/0.268; NextBit 0.150/0.035/0.350; Azure 0.210/0.031/0.560 ($/M prompt / cached / completion) | `GET /api/v1/models/deepseek/deepseek-v4-flash/endpoints` |

## 3. Client inventory (`openrouter-client.ts`)

| Responsibility                                           | Lines (approx.)                                | Necessary?              | Duplicated?                                                                            | Verdict                           |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| Types, constants, docs                                   | 1–243 (243)                                    | yes                     | —                                                                                      | keep, trim after deletions        |
| Constructor + option bounds                              | 254–305 (52)                                   | yes                     | —                                                                                      | keep                              |
| `stream()` route loop, SSE read, done/error/finally      | 315–822 (509)                                  | yes                     | retry-once is in `provider-pass.ts`; route loop over 1–4 routes is unused (1 route)    | simplify: single route            |
| `account()` usage closure                                | 348–450 (103)                                  | yes                     | —                                                                                      | keep                              |
| Truncation classification + `tool_choice=none` violation | 604–735 (130)                                  | yes                     | truncation re-detected in `provider-pass.ts:97-107` over the same events               | keep in client, drop the copy     |
| Budget-bounded attempt timeout, abort race               | 824–832, 1707–1802 (110)                       | yes                     | —                                                                                      | keep (09-02 F14)                  |
| `openRoute` (fetch, headers, status→retryable)           | 834–953 (120)                                  | yes                     | `pinnedEndpointUnavailable` special case exists only because of K1                     | keep minus K1 branch              |
| Per-turn route health: pin, failed slugs, model reorder  | 954–1073, 306–314, 1974–1986, 2096–2112 (~210) | no (net-negative today) | web `model-tiering.ts` carried the same idea (now dead)                                | rewrite as soft pin (K1, K2)      |
| Request body + cache keys                                | 1075–1123 (49)                                 | yes                     | —                                                                                      | keep                              |
| Attempt observations (2 RPCs/pass)                       | 1125–1197 (73)                                 | yes                     | —                                                                                      | make `started` non-blocking (K11) |
| `llm_usage_logs` adapter                                 | 1199–1253 (55)                                 | yes                     | —                                                                                      | keep                              |
| SSE line parser                                          | 1255–1348 (94)                                 | yes                     | `smart-llm/response-parsing.ts` parses non-stream bodies (different job)               | keep                              |
| Shadow tool-call accumulator + rejected-name receipt     | 1349–1476 (128)                                | partly                  | third copy: `stream-tool-calls.ts` (consumer), `provider-pass.ts:45-49,88-94` (shadow) | consolidate (K8)                  |
| Reasoning extraction                                     | 1478–1505 (28)                                 | no                      | every consumer drops `reasoning` events                                                | delete (K13)                      |
| Usage normalization, cost resolution, cache status       | 1506–1691 (186)                                | yes                     | —                                                                                      | keep                              |
| Route/provider-routing/header validation                 | 1803–1926 (124)                                | partly                  | config.ts already validates; `openai_compatible` and `headers` have no config path     | delete ~90 (K9)                   |
| Tool-surface validation                                  | 1927–2049 (123)                                | yes                     | —                                                                                      | keep                              |
| Error-body parsing, retryability, canonical helpers      | 2050–2315 (266)                                | yes                     | —                                                                                      | keep                              |

## 4. Model configuration for a cheap acting model

**max_tokens 4,000** (`:58`). Correct for what the window shows: 0 acting calls at the cap, max
2,616. But the cap is shared with hidden reasoning (`reasoning: { exclude: true }` at `:1101`
hides tokens, does not stop them: 40% of acting completion tokens are reasoning) and there is no
`maxLength` on `create_onto_document`/`update_onto_document` content (checked in the compiled
catalog). A 2,000-word document is ~2,700 tokens of content plus JSON escaping plus ~40% reasoning
overhead — over the cap. When the cap is hit the guard at `:604-664` classifies the pass as
truncated and `provider-pass.ts:56-66` retries once **on another provider with the same cap**, a
deterministic re-failure at 2× cost. See K6.

**Reasoning** is excluded from the stream but billed and paid in latency: acting ~295 reasoning
tokens per call when present (127/183 calls), reviewer ~430 per call. No `effort` is sent for
either lane (`:1101`; `openrouter-request.ts:74-76` has only `temperature: 'omit'` for Luna). See
K4 and K14.

**Temperature 0.7** for acting (`:59`) is never A/B'd (K14). The reviewer's `temperature: 0`
(`bootstrap.ts:372`) is dropped by `openrouter-request.ts:143-145` because Luna's policy says
`omit` — harmless for Luna (reasoning models ignore it) but the deterministic-reviewer intent is
not enforced on any fallback model because the policy is keyed on the primary model.

**Provider order and fallbacks** (`config.ts:34-43`): `deepinfra, deepseek, alibaba, cloudflare`
with `allow_fallbacks: true`, `data_collection: 'deny'` (`:1104-1108`). OpenRouter lists 15
endpoints for `deepseek/deepseek-v4-flash`; none is DeepSeek or Cloudflare. DeepInfra served 12%
(7 of 9 pinned 429s were on it). Observed provider mix is therefore a fallback mix, not the
configured preference. See K3.

**Pin and cooldown.** After the first successful pass the client pins
`{ model: state.modelUsed, providerSlug }` (`:1037`, called with `state.modelUsed ?? route.model`
at `:724`) and sends `model: <pinned>` plus `provider.order: [slug], allow_fallbacks: false`
(`:983`, `:991`). Two defects: the hard pin fails when the pinned endpoint cannot take the next
pass (K1), and the pinned _model_ is the provider's reported string, which for Alibaba/NextBit/
Phala is a dated snapshot id (K2). The "cooldown" (`markTemporarilyUnavailable`,
`providerCapacity.ts:79-85`) is dead in effect (K7).

**Prompt cache design.** Body order is `model, messages, …, tools` (`openrouter-request.ts:137-172`);
the first per-turn byte is at ~5.3 KB of a ~60 KB opening request. Acting passes send
`session_id` and `prompt_cache_key = sessionId` (`:1094-1100`, `:1109-1110`); reviewer passes send a
constant key (`REVIEWER_PROMPT_CACHE_KEY`, `:47`). The system prompt is byte-stable only through
its static sections (identity → capabilities → strategy → final-response contract; lane A 09-02
measured 5,231 chars); the tool array is byte-stable per surface but sits behind ~7 KB of dynamic
system prompt, so it never caches across turns. Measured: pass-1 cached tokens median 768 (values
are multiples of 256 — provider block granularity), i.e. 4.7%. Within a turn, when the provider
holds, continuations hit 80%. Conclusion: cross-turn caching is a non-lever at $0.09–0.13/M
prompt (≈$0.001/turn); within-turn provider affinity is the lever, and K1/K2 are what break it.

## 5. Reviewer routing

- Model: `openai/gpt-5.6-luna` by default (`bootstrap.ts:433`, `:449`); provider order
  `['openai','azure']` (`:432`); all 43 calls in the window went to OpenAI.
- Route: acting routes cloned with id `openrouter_semantic_reviewer` (`:490-506`), `models`
  fallback = default candidates minus acting models, sliced to three: computed from the compiled
  catalog as `['google/gemini-3.7-flash', 'z-ai/glm-5.3-flash', 'z-ai/glm-5.2']`. The comment at
  `:443-444` records that GLM 5.3 Flash "approved a dependency correction without declaring its
  endpoints" — it is still the second fallback of the default policy (K5).
- Timeout 45 s (`:424`); observed p90 17.3 s, fine.
- Cache: constant `prompt_cache_key` + static system prompt (9,672 chars ≈ 2.4k tokens) +
  static approval tools. Observed cached tokens per call 1,772–2,767 → the system prompt caches,
  the tools apparently do not (four surface variants at `turn-phase.ts:297-318`). 28/40 calls had
  any hit; 23% of prompt tokens. Since Luna's cached rate is 10% of $0.20, the 84,944 cached tokens
  saved $0.015 in the window. Reviewer cost is 49% uncached input, 38% output.
- Cost per call $0.00266 (measured); 1.65 calls per write turn; $0.0044 per write turn (40% of a
  write turn's cost).
- Latency: p50 10.3 s — the 09-02 audit measured 3.6 s p50 on OpenAI. Completion p50 767 tokens
  with ~430 reasoning. The mandatory `reference_candidates` enumeration added on 09-02 is the
  likely output growth; default reasoning effort is the other half. Neither was measured for the
  restraint canaries at `effort: 'low'`.
- Could the reviewer be the same cheap family at temperature 0? Cost says yes (scenario C/D in
  §6 saves $0.0025–0.0056 per write turn); the ADR canary the 09-02 audit cites (the three-email-
  task guess after a mechanically correct gate) is the test. The reviewer's schema is already
  tight (`controls.ts:88-115`); what a cheap reviewer needs is the evidence trimmed further and
  `reference_candidates` kept, because that enumeration is the deterministic ambiguity floor
  (`decision-handling.ts`). This is an eval, not a code change: run the 26 reviewed-write turns'
  contracts through DeepSeek v4 flash at temperature 0 and compare decisions with Luna's.

## 6. Cost model

Inputs: measured per-class token profiles (§2), live OpenRouter endpoint prices for DeepSeek v4
flash, catalog prices for the others (`model-config.ts:143-151, 169-177, 423-432`; Gemini 3.7 flash
`:85-86`), cached-input at each provider's listed rate (Luna 10%, others as listed). Mix 53% read /
47% reviewed-write as observed. Script inline in this lane's session; reproducible from the two
JSON evidence files.

| Scenario                                                | Read turn | Write turn | Blended/turn | 4 users × 10/day (month) | 1,000 users × 5/day | 1,000 × 10/day |
| ------------------------------------------------------- | --------: | ---------: | -----------: | -----------------------: | ------------------: | -------------: |
| A. Today: flash (measured provider mix) + Luna reviewer |   $0.0047 |    $0.0109 |      $0.0076 |                    $9.17 |              $1,147 |         $2,293 |
| B. Flash at DeepInfra/StreamLake price + Luna reviewer  |   $0.0032 |    $0.0086 |      $0.0057 |                    $6.88 |                $860 |         $1,719 |
| C. Flash (DeepInfra) acting + flash reviewer            |   $0.0032 |    $0.0054 |      $0.0043 |                    $5.11 |                $638 |         $1,276 |
| D. Today's acting + flash@Alibaba reviewer              |   $0.0047 |    $0.0084 |      $0.0065 |                    $7.76 |                $970 |         $1,939 |
| E. Luna acting + Luna reviewer                          |   $0.0079 |    $0.0150 |      $0.0113 |                   $13.51 |              $1,689 |         $3,378 |
| F. Luna acting, no reviewer                             |   $0.0079 |    $0.0106 |      $0.0092 |                   $11.02 |              $1,377 |         $2,754 |
| G. DeepSeek v4 pro acting + Luna reviewer               |   $0.0155 |    $0.0245 |      $0.0197 |                   $23.67 |              $2,959 |         $5,917 |
| H. Gemini 3.7 flash acting + Luna reviewer              |   $0.0156 |    $0.0249 |      $0.0200 |                   $23.96 |              $2,995 |         $5,989 |
| I. Flash on Azure (the snapshot-pin detour) + Luna      |   $0.0074 |    $0.0141 |      $0.0106 |                   $12.72 |              $1,590 |         $3,179 |

Reading it:

- At 4 users every scenario is under $25/month. The cheap-model constraint saves about $4/month
  versus Luna (E − A). It is not a money decision at this scale; it is a quality-and-latency
  decision, and the last battery scored 27/52.
- At 1,000 users the constraint saves $540–1,085/month versus Luna acting with the reviewer kept.
  Luna acting _without_ the reviewer (F) is +20% over today and removes ~2 passes (~17 s) from
  every write turn — that is the comparison to run, gated on the restraint canaries.
- Fixing provider routing (B) is a 25% cut with no model change; a flash reviewer (C) is a
  further 25%. Together they halve the bill at any scale and are the cheapest thing on this list.
- The token profile itself is the real cost driver: 50–63k acting prompt tokens per turn for 4
  passes, of which ~9.7k tokens per pass is tool schema (lane B). The pass count, not the price
  per token, is what scales.

## 7. Findings

### K1 — Hard route pin fails one pass in 47% of turns (P1, bug / over-engineering)

**Claim.** `applyTurnRouteHealth` sends `provider.order: [pinnedSlug], allow_fallbacks: false`
after the first successful pass (`openrouter-client.ts:991`). When the pinned endpoint cannot serve
the next pass, OpenRouter returns `404 No endpoints found` in ~200–480 ms; the client marks the
attempt retryable (`:898-905`, comment `:893-897`), writes a failed `provider_attempt_ended`, a
failed usage row, bans the slug for the rest of the turn (`:1013`), and `provider-pass.ts:56-66`
retries on another provider. In the window: 18 such 404s, every one the pass after Alibaba; plus
9 `429`s on pinned DeepInfra, which a soft preference would have routed around inside OpenRouter.
26 of 55 turns paid for this. The retry lands cold: median continuation cache 4% when the
provider switched vs 80% when it held. The pin's purpose (keep the warm prefix) is defeated by its
own failure mode in 26/55 turns. Side effect: a pin-caused 404 also adds the _model_ to
`failedModels` (`:1005`), so with fallback models configured the primary model would be demoted for
the rest of the turn on no model evidence.

**Cheap-model impact.** Each failure costs a network round trip, three durable writes, and a cold
prefill of 10–15k tokens on a new provider (seconds of TTFT); the model then continues on a
different endpoint, sometimes a different weight snapshot (K2), mid-turn.

**Fix (simplify, ~15 lines).** Drop `allow_fallbacks: false` at `:991` so the pin is a preference;
delete `pinnedEndpointUnavailable` (`:898-905`) and the `allow_fallbacks === false` attribution
branch (`:2107-2109`); update the three pin tests. Expected: −27 failed attempts per 55 turns, ~0.5
fewer HTTP round trips per turn, same-provider continuation rate up from 53% toward the
provider's own availability. Risk: OpenRouter may still route the `tool_choice: 'required'` gate
pass off Alibaba (cold cache, no failure); the same-provider rate is the canary
(`lane-K-pin-snapshot-cache.mjs`).

### K2 — Pin re-requests the provider's snapshot model id, detouring to Azure (P1, bug)

**Claim.** `observeTurnRouteSuccess` is called with `state.modelUsed ?? active.route.model`
(`:724`) and stores it as the pin's `model` (`:1037`); `applyTurnRouteHealth` then sends it as the
request model (`:983`). Providers report `deepseek/deepseek-v4-flash-20260423`; 37 of 292 requests
asked OpenRouter for that id. OpenRouter resolves the dated id to a different endpoint set: 11 of
those went to Azure (p50 21.5 s / p90 31.1 s per pass; $0.21/$0.56 per M — scenario I), 2 got
`404 No endpoints found for …-20260423`, and 15 turns switched weight snapshots mid-turn.

**Cheap-model impact.** A 4× slower pass mid-turn, and the acting model changes snapshot between
the pass that read the evidence and the pass that writes the tool call.

**Fix (2 lines).** Pin `active.route.model` (the requested canonical id) and keep `modelUsed` for
receipts only. Risk: none beyond a test expectation; `agenticChatOpenRouterClient.test.ts:740`
already asserts the direct-route case.

### K3 — Provider order is half dead and the cheap endpoints are unused (P2, config)

**Claim.** `config.ts:34-39` prefers `deepinfra, deepseek, alibaba, cloudflare`. OpenRouter's live
endpoint list for this model has no DeepSeek and no Cloudflare endpoint. DeepInfra served 12% of
successful calls (it 429s: 7 of 9 pinned 429s). Alibaba (51%, $0.134/M) and NextBit (26%, $0.150/M)
carried most traffic; StreamLake ($0.089) and GMICloud ($0.091, 99.5% uptime) never appear. The
comment at `config.ts:23-25` names Alibaba as long-tail and then prefers it at `:37`. Measured
p50 per-pass latency: Alibaba 5.3 s, DeepInfra 5.3 s, NextBit 7.8 s, StreamLake 7.3 s (n=4),
Azure 21.5 s.

**Fix (config, 1 line).** `order: ['deepinfra', 'streamlake', 'gmicloud', 'alibaba']` and drop
the dead names; keep `allow_fallbacks: true`. Expected: scenario B, −25% prompt cost. Risk: the
08-27 note about StreamLake tail latency — canary the p90 per pass for a day.

### K4 — Reviewer latency tripled; reasoning effort unset (P1, cost)

**Claim.** Reviewer calls are p50 10.3 s / p90 17.3 s (09-02 audit: 3.6 s / 8.1 s on OpenAI),
1.65 per write turn, ≈17 s of a 60.7 s write-turn provider time. Completion p50 767 tokens, 52%
of reviewer completion tokens are hidden reasoning; no `reasoning.effort` is sent
(`openrouter-client.ts:1101`; policy `openrouter-request.ts:74-76`). `temperature: 0` from
`bootstrap.ts:372` is dropped for Luna (`openrouter-request.ts:143-145`).

**Cheap-model impact.** Not the acting model's fault, but every write turn waits on it: time to
first response p50 15.8 s in this window.

**Fix (config + canary).** Send `reasoning: { effort: 'low', exclude: true }` for reviewer pass
roles; keep the schema. Canary: the reviewed-write turns in the 09-04 battery plus the
three-email-task restraint case; require identical approve/revise/clarify decisions. Then decide
scenario C/D (flash reviewer) on the same canary. Estimated effect: −5 to −7 s per reviewer call.

### K5 — Default reviewer fallback chain contains a documented bad reviewer (P2, config)

**Claim.** With no `AGENTIC_CHAT_REVIEWER_MODEL` set, `bootstrap.ts:446-452` builds candidates
from `JSON_PROFILE_MODELS.powerful` + `maximum`; the resulting `models` fallback array is
`[gemini-3.7-flash, glm-5.3-flash, glm-5.2]`. `:443-444` says GLM 5.3 Flash approved a
correction without declaring its endpoints. Fallbacks also lose the request policy (temperature,
reasoning) because `buildOpenRouterChatCompletionBody` keys policy on the primary model only.
Zero fallbacks fired in the window (43/43 on OpenAI), so this is latent.

**Fix (config).** Set `AGENTIC_CHAT_REVIEWER_MODEL` and an explicit, evaluated
`AGENTIC_CHAT_REVIEWER_FALLBACK_MODELS` on the Railway service, or replace the profile pools at
`:450-451` with an explicit list. Risk: none.

### K6 — 4,000-token cap with reasoning inside it bounds document bodies; cap-hit retry is wasted (P2, capability gap)

**Claim.** `AGENTIC_CHAT_ACTING_MAX_TOKENS = 4_000` (`:58`) covers reasoning plus arguments; document
content has no schema `maxLength`. Arithmetic: 2,000 words ≈ 2,700 tokens + JSON escaping + the
observed ~40% reasoning share exceeds the cap. On a cap hit the guard (`:604-664`) yields a
retryable truncation and `provider-pass.ts:56-66` retries on another provider with the same cap;
the second attempt fails identically and the turn dies at 2× cost. Not observed in the window
(max completion 2,616); it is a request class users will make ("write the brief into a document").

**Cheap-model impact.** A weak model already spends more reasoning tokens on long structured
arguments; the cap punishes exactly the turns where it is trying hardest.

**Fix (code, ~10 lines).** Raise the acting cap to 16,000 (unused budget is free; the guard still
fires) or, when `finishedReason === 'length'` was derived from our own cap, retry with a doubled
cap instead of a new provider. Risk: runaway generations cost up to $0.003 at flash output price.

### K7 — Per-turn provider "degradation latch" is dead machinery (P2, over-engineering)

**Claim.** `capacity.acquire(turnRunId)` runs once per turn at prepare time
(`turn-provider.ts:311`). Every `markTemporarilyUnavailable` (`provider-pass.ts:59`,
`turn-provider.ts:1210, 1758`) happens after it, keyed to the same turn, and the retry continues
immediately. The capacity collector calls `getSnapshot()` with no turn id (`capacity.ts:112`), so
`degradedUntilMs` is always null there (`providerCapacity.ts:98-100`). Nothing can observe the
latch. Lines: `providerCapacity.ts:34, 79-90, 95-100, 110`, three call sites, `capacity.ts:162-167`,
the `retryableFailureCooldownMs` constructor arg and its validation (`turn-provider.ts:269-280`),
and their tests.

**Fix (delete ~60 lines + tests).** Keep the concurrency lease; delete the latch.

### K8 — Three tool-call accumulators over the same deltas (P2, over-engineering)

**Claim.** The consumer assembles calls with `stream-tool-calls.ts`; `provider-pass.ts:45-49,
88-94, 97-107` runs a second accumulator to detect truncation before release; the client runs a
third, lenient mirror (`openrouter-client.ts:1349-1476`, 128 lines) so the receipt can name a
rejected tool and the pin can be released before `done`. The client already sees every delta and
already imports from `stream-tool-calls.ts`.

**Fix (simplify, −~150 lines).** Use `createToolCallAccumulator`/`appendToolCallDelta` in the
client inside a try/catch that marks the pass unobservable; delete the provider-pass shadow
(the client's retryable truncation error already triggers the retry). Guard: the six
"names a rejected tool" tests (`agenticChatOpenRouterClient.test.ts:2053-2121`) and the
truncation-retry test at `:2171`.

### K9 — Dead route generality (P3, delete)

**Claim.** `kind: 'openai_compatible'`, per-route `headers`, protected-header checks, multi-route
iteration (1–4 routes), and per-route `fallbackModels` validation exist only in the client and its
tests (`:87-96, 1803-1926, 452-525`); `config.ts:274-282` builds exactly one OpenRouter route and
the reviewer clones it. ~90 lines plus tests.

**Fix.** Delete the direct-route kind and header plumbing; keep a single route. Risk: none in
production; a future direct provider would re-add ~30 lines.

### K10 — `model-tiering.ts` is dead since one-engine (P3, delete)

**Claim.** `apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts` (288 lines) and its test
export FastChat routing (pins, forced-synthesis models, project-create model list, 6,500 max tokens)
that nothing imports except the barrel `index.ts:21`; zero references to any export across
`apps/` and `packages/` outside the file and its test.

**Fix.** Delete file, test, and the barrel line.

### K11 — Three serial DB round trips per pass on the critical path (P2, latency)

**Claim.** `provider_attempt_started` is awaited before the fetch opens (`:469-477`); `ended` and
the usage upsert are awaited before `done` (`:665-735`, `:348-450`). 5.3 passes per turn → ~16
serial RPC/upsert round trips per turn inside the loop; non-model time in the loop is p50 6.0 s.

**Fix (code, ~10 lines).** Fire-and-forget the `started` receipt (it is diagnostic; the executor's
fences are separate); keep `ended` and usage awaited. Expected: −1 RTT per pass (~0.3–0.8 s per
turn depending on Railway→Supabase latency). Risk: a crashed process leaves a pass without a
`started` row; the `ended` row and usage row still identify it.

### K12 — Cross-turn prompt caching is not a lever; do not spend on it (P3, design note)

**Claim.** Pass-1 cache is 768 tokens median (4.7%) because the byte-stable tool array (39–42 KB)
sits behind ~7 KB of dynamic system prompt; moving dynamic context out of the system prompt would
raise the cacheable prefix to ~11k tokens, but at $0.018–0.035/M cached vs $0.09–0.15/M uncached
that is ≈$0.001 per turn and a prompt-architecture change (lanes A/B). Within-turn affinity
(80% hits) is the cache that pays; K1/K2 restore it.

### K13 — Reasoning-event extraction is dead downstream (P3, delete)

**Claim.** `parseSseLine` emits `reasoning` events (`:1321`, helpers `:1478-1505`); every consumer
drops them (`provider-pass.ts:55`, `turn-provider.ts:1196, 1598, 1748`); the request already sends
`reasoning.exclude: true`. Only the dev prompt dump ever records them.

**Fix.** Delete 28 lines and the event variant, or keep only for the dump behind
`localPromptDumpsEnabled()`.

### K14 — Acting temperature and reasoning never evaluated (P2, eval gap)

**Claim.** `DEFAULT_TEMPERATURE = 0.7` (`:59`) and provider-default reasoning for DeepSeek v4
flash have no A/B against the battery; 40% of acting completion tokens are hidden reasoning. A
tool-calling loop on a cheap model usually wants low temperature for argument stability; whether
DeepSeek's reasoning mode improves tool selection is unknown here.

**Fix (eval).** Re-run the 09-04 52-point battery at `temperature 0.2` and at
`reasoning: { effort: 'low' }` (two runs) against the current config; adopt whichever scores ≥
current. Cost of the eval: ~3 × $0.45.

### K15 — The cheap-model constraint is a $4/month decision today (decision for DJ)

See §6. Options in order of cost-per-quality: (1) fix routing (K1–K3), (2) flash reviewer
(scenario C/D) gated on the restraint canary, (3) Luna acting without reviewer (scenario F,
+20%) gated on the same canary and the 52-point battery. None changes the bill by more than
$15/month at 4 users; at 1,000 users the spread is $0.6–3.4k/month.

## 8. What is right and should not be undone

- **Atomic buffered pass** (`provider-pass.ts`): partial output never reaches the user twice;
  tool-free passes release their prose on the last failed attempt.
- **Budget-derived attempt timeouts** (`:824-832`, 09-02 F14) and the abort race on body reads
  (`:1772-1802`): a stalled SSE body cannot outlive the turn budget.
- **Truncation guard** against our own `max_tokens` regardless of the provider's finish reason
  (`:604-612`): zero `tool_arguments_truncated` failures in the window; the Alibaba
  `tool_choice=none` violation is caught the same way (`:665-680`, 2 cases).
- **Idempotent usage receipts** with a stable UUIDv5-style id per (turn, generation, round, role,
  attempt, route) (`:1574-1608`) and provider-reported cost preferred over catalog estimates
  (`:1609-1652`): this audit's numbers exist because of it.
- **Reviewer static prefix + constant cache key** (09-02 F5): 0% → 23% cache; keep the approval
  tools static.
- **`data_collection: 'deny'`** on every request; **bounded SSE buffer**; **bounded error-body
  read**; **X-OpenRouter-Metadata** for per-attempt provider attribution.
- **The dev-only prompt dump** (`promptDump.ts`): zero production cost, exact request bytes.
- **Two clients, not one**: smart-llm's client is request/response for JSON services; the chat
  needs streamed tool calls. Sharing the body builder and catalog is the right amount of sharing.

## 9. Proposed simplifications with line counts

| Change                                                               | Kind     |     Lines | Effect per turn                                                   |
| -------------------------------------------------------------------- | -------- | --------: | ----------------------------------------------------------------- |
| K1 soft pin (drop `allow_fallbacks:false`, delete two special cases) | simplify |       −15 | −0.5 failed attempts, −3 durable writes, warm continuations       |
| K2 pin the requested model id                                        | fix      |         2 | no Azure detours (−16 s on affected passes), no snapshot switches |
| K3 provider order                                                    | config   |         1 | −25% prompt cost                                                  |
| K4 reviewer `reasoning.effort: 'low'`                                | config   |         3 | −5 to −7 s per reviewer call (canary-gated)                       |
| K5 explicit reviewer fallbacks                                       | config   |     2 env | latent-risk removal                                               |
| K6 acting cap 16k or cap-doubling retry                              | code     |       ~10 | long-document writes succeed; no wasted cross-provider retry      |
| K7 delete degradation latch                                          | delete   |       −60 | none (dead)                                                       |
| K8 one accumulator                                                   | simplify |      −150 | none at runtime; one truth for truncation                         |
| K9 delete direct-route generality                                    | delete   |       −90 | none                                                              |
| K10 delete `model-tiering.ts`                                        | delete   | −288+test | none                                                              |
| K11 non-blocking `started` receipt                                   | code     |       ~10 | −1 DB RTT per pass                                                |
| K13 delete reasoning extraction                                      | delete   |       −28 | none                                                              |
| Route-loop over one route (with K9)                                  | simplify |       −60 | none                                                              |

Net: `openrouter-client.ts` ≈ 2,315 → ≈1,900 with K1/K7–K9/K13 and the single-route loop; the
remaining size is receipts, validation and usage accounting that earn their keep.

## 10. Evidence

- `evidence/lane-K-usage-pull.mjs` → `lane-K-usage-report.json` (by role, model, provider,
  failure class, per-turn percentiles).
- `evidence/lane-K-pin-trace.mjs` (per-turn provider sequences around failures; the
  "provider before a 404" table).
- `evidence/lane-K-pin-snapshot-cache.mjs` (snapshot-id requests, same- vs switched-provider
  continuation cache, pass-1 cache).
- `evidence/lane-K-turn-classes.mjs` → `lane-K-turn-classes.json` (read vs reviewed-write token
  and cost profile).
- `evidence/lane-K-timing.mjs` (timing-event phase percentiles; non-model time in the loop).
- `evidence/lane-K-failures-by-day.mjs` (404/429 counts per day: 09-04 10/5, 09-05 8/4, 09-08 1/0).
- `evidence/lane-K-surface-bytes.json` (catalog tool-surface bytes per profile and per tool).
- Live OpenRouter endpoint and provider listings fetched 2026-09-09T02Z
  (`/api/v1/models/deepseek/deepseek-v4-flash/endpoints`, `/api/v1/providers`); unauthenticated.
