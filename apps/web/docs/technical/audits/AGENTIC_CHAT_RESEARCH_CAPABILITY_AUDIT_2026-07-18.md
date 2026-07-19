<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_RESEARCH_CAPABILITY_AUDIT_2026-07-18.md -->

# Agentic Chat — Research Capability & Model Escalation Audit (2026-07-18)

**Scope:** model catalog + escalation reality, web_search/web_visit quality (code review + live tests), deep-research readiness, internal parallelism.
**Method:** 4-agent parallel code exploration + direct Tavily API smoke test + 2 live turns through the real `POST /api/agent/v2/stream` endpoint (dev server, e2e test user) + parser benchmark on real-world HTML.

---

## TL;DR

| Question                                                   | Verdict                                                                                                                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do we switch to smarter models when the task calls for it? | **No.** Model choice is fixed at turn start: `balanced` profile → `deepseek-v4-flash` primary. No difficulty-based escalation exists anywhere.                                                                        |
| Does web_search work?                                      | **Yes — Tavily works well** (2.9s, relevant results), but the tool throws away ~80% of what Tavily returns (400-char snippet cap).                                                                                    |
| Does web_visit work?                                       | **Unreliable.** Failed twice live on a mainstream page (zapier.com) via 60s tool timeout. Root cause: LLM-based HTML→markdown conversion. The deterministic parser handles the same page in **11ms**.                 |
| Can it do research and report back?                        | **Shallow research only.** Live test produced a structured, honestly-cited report — but entirely from search snippets (0 page visits), sourced from SEO-affiliate blogs, with formatting glitches.                    |
| Deep research?                                             | **Not today.** No research skill/prompt guidance, no persistence bridge, anti-research loop tuning, sub-agents can't touch the web.                                                                                   |
| Parallelism?                                               | **Partial.** Adjacent pure reads (incl. web tools) batch at concurrency 3 — observed live. Writes sequential. `delegate_task` fans out ≤3 background runs, but those runs are one-op-per-LLM-iteration and web-blind. |

---

## 1. Models: what exists vs. what the chat can actually use

Catalog (`packages/smart-llm/src/model-config.ts`): 15 models from Nex-N2-Mini ($0.025/M in) to Kimi K3 ($3/$15). Profiles: `fast/balanced/powerful/maximum` (JSON), `speed/balanced/quality/creative/maximum` (text).

**What the chat actually uses:**

- Lane is picked purely from message shape (`openrouter-v2-service.ts:1589` — tools present → `tool_calling`), never from task difficulty. The config itself documents this (`model-config.ts:687-691`).
- Every pass runs profile `balanced` → tool lane order puts **deepseek-v4-flash first**. The `quality` lane (GLM 5.2, DeepSeek V4 Pro, GPT-5.6 Luna, Grok 4.5) is reachable only on a _retry of a failed forced-synthesis pass_ (`model-tiering.ts:150-152`). The `maximum` lane (Kimi K3) is **unreachable from chat entirely**.
- `FASTCHAT_INITIAL_PLAN_MODEL_TIERING` (shipped 7/08, still dark) is a **downgrade** lever (speed models for pass 1), not smart-escalation.
- Error fallbacks go sideways/down (`EMERGENCY_TEXT_FALLBACKS` is cheap-first). The only "accidental upgrade" is provider-outage failover to direct Moonshot `kimi-k2.6`.
- The worker `agent_run` loop is `getJSONResponse({profile:'balanced'})` every iteration (`agentRunWorker.ts:904-915`); its one real tier bump is the JSON parse-error retry → `powerful` (`smart-llm-service.ts:679-740`) — which interactive chat never uses.
- **No agent-callable "use a smarter model" tool exists.** `delegate_task` doesn't accept a model parameter either.

**Net:** the platform _has_ frontier-class models configured and priced, and a per-pass routing seam (`resolveFastChatPassModelRouting`) where escalation could plug in — but no code path ever decides "this needs a smarter model."

## 2. web_search (Tavily) — works, but self-throttled

`tools/websearch/index.ts` → `tavily-client.ts`. Advanced depth forced, `include_answer:true`, default 5 / max 10 results, 60s tool timeout, no caching, no per-user cost caps.

- **Direct API test:** 2.9s round-trip, relevant ranked results, useful synthesized answer. Tavily returns **~1,900–2,400 chars of content per result**.
- **The tool truncates each snippet to 400 chars** (`index.ts:26-30`) before the model sees it. We pay for advanced-depth extraction and discard ~80%.
- `include_raw_content` is hard-coded `false`; `published_date` is requested but Tavily rarely returns it outside news topic — recency judgment is weak.

## 3. web_visit — good security, broken conversion pipeline

`tools/webvisit/` + `external-executor.ts:126-300`.

**Good:** genuinely strong SSRF defense (DNS-resolves + blocks private CIDRs, re-checks every redirect hop); global `web_page_visits` URL cache; graceful text fallback design.

**Broken:** the default `markdown` output path sends up to 40KB of trimmed HTML through `SmartLLMService.generateTextDetailed` — non-streaming, `balanced` lane, 25s timeout **per model attempt**, up to 6 attempts (`performTextGeneration` walks the lane, `smart-llm-service.ts:1032-1082`), output capped at 4,096 tokens — all inside a 60s outer tool timeout.

**Live evidence:** two `web_visit` calls on `zapier.com/blog/best-ai-project-management-tools` both died with `Tool execution timeout after 60000ms`; no `Text Generation Success` log ever appeared. Meanwhile: curl with the tool's own UA fetches the page in **0.28s** (1MB), and `parseHtmlToText`/`prepareHtmlForMarkdown` on that exact HTML run in **11ms / 10ms** (benchmarked). The LLM conversion is the only slow, flaky, costly stage — and it's the default.

Also: plain `fetch` means JS-rendered SPAs return shell HTML; `User-Agent: BuildOS-AgenticChat/1.0` will be bot-walled on some sites (Zapier happened not to).

## 4. Live research behavior (2 turns, real endpoint, real weak model)

**Turn 1 — open research question** ("research AI productivity tools 2026, 4+ competitors, pricing, sources"):

- ~41s to first tool call (dev-server caveat; includes context load + first pass).
- Web tools were NOT on the launch surface → model spent a round on 2× `tool_search` discovery before its first `web_search`.
- **6 web_searches, 0 web_visits.** Searches batched 2–3 at a time (the concurrency-3 read batch works live).
- Report: structured, per-product pricing + positioning, 14 cited URLs, honest "Correction: I did not create a document link." **But** all claims rest on 400-char snippets; sources are SEO-affiliate blogs (whichisbest.ai, checkthat.ai, syncdate.app…) not primary pricing pages; comparison table markdown broken; one price truncated ("~$13.").
- Grade: **B− for a shallow sweep, D for trustworthiness of specific facts.**

**Turn 2 — targeted page read** ("fetch this Zapier article, quote it"):

- `web_visit` failed (60s timeout) → model fell back to `web_search` → retried `web_visit` with `mode:'reader'` → failed again → gave an honest partial answer with a real quote from a search snippet, clearly flagged what it couldn't verify. 176s total, 26k prompt tokens, **$0.0009**.
- Grade: **model behavior A− (graceful, honest), tool reliability F.**

Cost is a non-issue across the board (the 7/11 audit measured $0.47 over 21 days). The constraints are latency, tool reliability, and orchestration quality — not money.

## 5. Deep-research readiness — the gaps

1. **No research playbook.** `capability-catalog.ts:210-227` literally says `web_research … 'No dedicated skill exists yet'` with `skillIds: []`. The 2,313-line system prompt contains **zero** guidance on web research, when to visit vs. search, or citing sources.
2. **Anti-research loop tuning.** Read-loop escalation (`read-loop-escalation.ts`) nudges at 3 read-only rounds, forces "stop and answer" at 6, forces synthesis at 8. Deep research _is_ a long read-only loop; the chat is tuned to kill it. The context-gathering saturation ledger pushes the same direction.
3. **Context never narrows (still open per 7/07 harness audit)** — full project snapshot rebuilt per tool execution; no within-turn eviction of old tool results; a long research turn accretes context with only per-payload caps (6k chars/tool).
4. **No persistence bridge.** Findings are ephemeral. `web_page_visits` is a global URL cache with no user/project link. No `source` entities are created; no citation instruction exists for saved documents. "Research → project knowledge" requires the model to spontaneously call `create_onto_document`.
5. **Sub-agents are web-blind.** `delegate_task` agent runs get ontology+calendar ops only (`op-execution.ts:108` catalog) — web_search/web_visit are chat-only. So research cannot be backgrounded or parallelized at all today.
6. **Zero test coverage.** 0 of 5 e2e scenarios and 0 LLM prompt tests touch web tools.
7. **Security ordering constraint.** Web content is untrusted input; the platform audit's open S1 (chat writes commit with no confirmation/policy gate) means more web research = more prompt-injection surface driving same-turn mutations. Scale research _after or with_ Wave 3 / ChangeSet staging.

## 6. Parallelism — current state

- **Within a turn:** multi-tool-call messages allowed (`tool_choice:'auto'`, provider-default parallel calls). Adjacent **pure reads** (category `read`/`search` — web tools qualify) batch via `batchExecuteTools` at concurrency 3, results re-serialized in order for SSE. **Writes and mixed rounds are strictly sequential.** Budgets: 40 calls / 16 rounds / 60s per LLM pass.
- **Cross-unit:** `delegate_task` → ≤3 concurrent background runs per user, results injected back as `agent_run_summary`. Worker queue runs jobs concurrently (batch 5 dev / 10 prod), no per-user serialization; per-run claim prevents double-processing. Parent/depth linkage fields exist but recursion is disabled ("You cannot delegate to other agents").
- **The worker agent-run loop is the bottleneck:** one op per LLM iteration, non-streaming JSON — no read batching, no fan-out. There is no map-reduce/orchestrator primitive anywhere.

## 7. What it would take (ranked)

**Tier 1 — days, high leverage, no architecture change:**

1. `web_visit`: default to deterministic HTML→markdown (turndown/readability path already exists and benchmarks at ~10ms); keep LLM conversion as opt-in `mode:'llm_clean'`. Kills the timeout class entirely.
2. `web_search`: raise snippet cap 400 → ~1,500–2,000 chars; consider `include_raw_content` for top-N; surface Tavily's score+domain so the model can prefer primary sources.
3. Prompt: add a web-research section (search→visit primary sources→quote→cite; prefer vendor/primary domains; always include source URLs in saved docs).
4. Loop tuning: exempt web-research turns from read-loop escalation (or raise thresholds when web intent detected); web tools are already on-demand — consider adding them to launch surface for global context to skip the discovery round.

**Tier 2 — ~a week, model intelligence:** 5. Escalation seam: `resolveFastChatPassModelRouting` already routes per-pass — add (a) intent-based bump (research/analysis intent → `quality` lane), and/or (b) an agent-callable `request_deep_reasoning` tool that re-runs the pass on the quality lane. Cost impact is cents. 6. `delegate_task`: accept an optional `effort: 'standard'|'deep'` mapping to `balanced`/`powerful` in the worker.

**Tier 3 — weeks, the actual deep-research feature:** 7. Add web ops to the worker agent-run op catalog (behind `scope_mode` read-only default) so research can run as a durable background Agent Run. 8. A `deep_research` skill/run-template: plan → fan out ≤3 parallel sub-runs (cap already exists) on sub-questions → each returns structured findings with sources → parent synthesizes → **persists a report document with a Sources section** (and optionally `source` entities). Batch the worker loop's reads while at it. 9. Per-user web budget (calls/day) before exposing this broadly.

**Tier 4 — harness:** add a research e2e scenario (fixed-domain query + judge rubric scoring citations/claim-support) so regressions are visible.

---

## ADDENDUM 2026-07-18 (same day): Tier 1 SHIPPED + live-verified

All four Tier-1 fixes were built, tested, and live-verified the same day (uncommitted):

1. **web_visit deterministic markdown** — new `webvisit/markdown.ts` (Turndown + GFM); `output_format:'markdown'` now converts deterministically (~15ms), the old LLM path survives as explicit `output_format:'llm_markdown'`; cache serves both. The Zapier page that failed 2× at 60s now fetches+converts in **5.3s live**, and the model quoted the article accurately.
2. **web_search snippet cap 400→1,600** + payload-compaction upgrades: new `compactWebSearchPayload` with budget-aware snippet sizing, web tools get a 12,000-char model-payload budget (vs 6,000), `web_visit` content preview raised 3,500→adaptive ≤8,000.
3. **Prompt guidance** — two Operating Strategy bullets: search→visit primary sources→verify claims→cite URLs; web calls parallelize.
4. **Read-loop escalation exemption** — `buildRoundToolPattern` routes web tools into a new `researchOps` lane; research-only rounds no longer advance the nudge→must_synthesize ladder or the repeated-read-set guard; a near-cap synthesis warning fires at ≤2 rounds remaining. Hard budgets (40 calls/16 rounds) unchanged.

**Live before/after (open research question, same prompt):** 0→6 web_visits (batched concurrently), 6→2 searches (deeper), tool phase 144s→68s, answer went from snippet-collage to page-grounded report with a cited market-size source. A 7-round read-only research turn ran to completion without forced synthesis (Fix 4 verified live).

**Adversarial review round (same day):** a 19-agent multi-lens review workflow (correctness/regression/security/behavior, each finding adversarially verified) confirmed 9 findings of 15; all were fixed:

- `llm_markdown` escape hatch no longer serves the cached Turndown markdown it exists to escape (cache gate narrowed to `markdown` only).
- Turndown output strips `<img>` to alt text — untrusted pages can no longer deliver remote-image markdown (would have worsened open S2).
- Markdown post-processing is fence-aware: fenced code blocks (diffs, YAML) stay byte-identical; the list-marker regex can no longer splice lines across newlines.
- Payload compaction is measured, not estimated (`fitPayloadToBudget` shrinks against real serialized length — JSON escaping of newline-dense markdown was defeating char-count budgets); URLs capped at 300 chars (SafeLinks-style 1,200-char tracking URLs were sinking the budget); metadata blocks drop before the payload ever degrades to a JSON-string blob.
- Research budget hardened: mixed research+ontology rounds ride the research budget instead of the stuck-read ladder; a 60k-char cumulative web-payload brake backstops context growth; windowed round-repetition abort exempts research rounds (parity with gateway reads); the forced-synthesis message uses research framing ("budget reached, cite sources") instead of "read-loop hard stop", which weak models were expected to echo.
- **Incident:** the review left a temporary always-failing probe test in the worktree, which DJ's `9a9340b5` "updates" snapshot commit swept onto pushed `main`, breaking CI. Repaired same-hour by `83f1bd53` (surgical deletion commit, pushed).

**Verification:** full web suite 2,605 tests / 420 files green; typecheck clean; three live turns through the real stream endpoint — including a final smoke where the model researched Linear's pricing by going straight to `linear.app/pricing` and citing only pages it actually read, in an 81s turn.

## ADDENDUM 2026-07-18: Worker Agent Run web operations implemented

Tier-3 item 7 is now implemented in code (not yet live-tested in a deployed worker):

- Default Agent Runs can receive worker-only `util.web.visit`; `util.web.search` is also advertised when `PRIVATE_TAVILY_API_KEY` is configured in the worker environment.
- Explicit `allowed_ops` lists remain hard capability fences. The shared OAuth/public-agent default operation policy was not broadened.
- Chat and worker page visits now use the same SSRF-safe fetcher: HTTP(S)-only, credential rejection, DNS/private-CIDR checks, redirect-hop revalidation, timeouts, redirect limits, and streamed body-size limits.
- Worker results carry an untrusted-content notice, and the Agent Run system prompt tells the model never to follow instructions found in web evidence. It also directs search → primary-source visit → URL citation.
- Web result transcript windows are raised from 4,000 to 10,000 characters without changing non-web operation history.

**Verification:** shared safe-fetch tests 2/2; focused worker web/policy tests 31/31; full worker suite 377/377; shared and worker typechecks clean; shared package, worker, and production web builds pass. Worker lint has zero errors (pre-existing warnings remain).

Still open as of this 2026-07-18 checkpoint: a deployed worker smoke test with its Tavily secret,
per-user web call budgets, the deep-research run template/map-reduce orchestration, worker read
batching, and a research e2e harness.

## ADDENDUM 2026-07-19: Bounded deep-research orchestration implemented

The first map/reduce slice is now implemented in code (migration and deployment still pending):

- A depth-0, read-only, high-reasoning coordinator plans exactly two workstreams.
- Deterministic code concurrently dispatches two depth-1 standard researchers with only
  `util.web.search` and `util.web.visit`; children cannot delegate or mutate BuildOS state.
- Stable child IDs, idempotent inserts, queue deduplication, and checkpointed stages make fan-out
  retryable.
- PostgreSQL serializes concurrent child creation on the parent row, rejects a third child, and
  reserves the user's three active Agent Run slots for the root and its pair.
- Root and child cost/tool/token/time envelopes are enforced at both application and database
  boundaries. The default observed LLM ceiling remains `$0.50`, with an absolute deep-run ceiling
  of `$1.00`.
- The final child transition atomically queues one synthesis continuation; an additional trigger
  covers children that settle before the root reaches `researching`.
- The coordinator waits without holding a worker, then performs a high-reasoning synthesis or
  returns partial evidence when cost, token, tool, time, child, or synthesis conditions are
  incomplete.
- Children stop on a live parent cancel signal or the parent's durable terminal state, closing the
  signal-consumption race.

**Focused verification:** 44 worker policy/orchestration/queue tests, 4 web dispatch tests, 5 shared
metadata tests, and 8 disposable-PostgreSQL migration tests pass. The PostgreSQL cases include three
simultaneous child inserts, unsafe permissions/budgets, capacity reservation, coordinator reclaim,
exactly-once synthesis wakeup, and the fast-child race.

Still open: deployed Tavily-backed end-to-end smoke, typed claim/source evidence, report-document
persistence, a durable atomic/provider-reconciled cost ledger, per-user daily limits, stranded-run
reconciliation, worker read batching, and research quality/citation evals.

## ADDENDUM 2026-07-19: Paid-search accounting and in-flight LLM bounds implemented

The first application-level cost hardening pass is now implemented locally:

- Tavily's response `usage.credits` is counted at no less than the current public PAYG price of
  `$0.008/credit`. Missing/malformed usage falls back conservatively to the documented Search
  charge (basic = 1 credit, advanced = 2 credits).
- Search cost is reserved before dispatch. Once dispatched, the reservation is charged even when
  the response times out/fails because response failure is not evidence that Tavily did not bill.
- Child metrics expose paid-tool cost and credits; the coordinator includes each child's total in
  the root's `$0.50` default ceiling.
- Every budgeted Agent Run JSON call is converted to one priced attempt. The shared LLM layer uses
  a conservative prompt reservation, caps `max_tokens` to the per-call remaining envelope, removes
  model fallbacks and parse retries, and adds OpenRouter provider `max_price` filtering.
- Planner and synthesis calls receive stage-specific remaining-budget envelopes; ordinary child
  loop calls may reserve at most `$0.04` each.

This prevents one normal in-flight request or retry chain from spending drastically beyond the
application budget. It is deliberately not described as an absolute provider-billing guarantee:
durable reservations, request-id settlement/reconciliation, daily/global quotas, price-drift
monitoring, and circuit breakers remain in
[tasker 29](../../../../../tasker/29-deep-research-cost-ledger-and-hard-budgets.md).

## Live-test artifacts

- Turn transcripts: scratchpad `research_live_test.py` runs (2026-07-18, dev server :5177, e2e test user).
- Tool-timeout evidence: dev-server log `Tool execution timeout after 60000ms` ×2 for web_visit; error IDs f1aebcb3 / 4b40a08f.
- Parser benchmark: `parseHtmlToText` 11ms / `prepareHtmlForMarkdown` 10ms on the 1MB Zapier page that timed out live.
