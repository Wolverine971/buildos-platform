<!-- docs/plans/PROJECT_LOOP_TIMEOUT_RECOVERY_REVIEW_2026-08-22.md -->

# Project Loop Timeout Recovery — Independent Review

**Date:** 2026-08-22
**Reviews:** [`PROJECT_LOOP_TIMEOUT_RECOVERY_ASSESSMENT_2026-08-22.md`](./PROJECT_LOOP_TIMEOUT_RECOVERY_ASSESSMENT_2026-08-22.md)
**Source verified at:** HEAD `489aff88c` (no diff vs the assessment's `32c08d2` on any referenced file; working tree clean on those files)
**Method:** line-by-line source trace of every cited location; independent re-derivation of every production number from `llm_usage_logs`, `project_loop_runs`, `queue_jobs`, `error_logs`; OpenRouter generation lookups for all 22 timeout rows; OpenRouter endpoint/pricing metadata; four live routing probes (~$0.0004 total); empirical Node `fetch` abort-semantics test.
**Nothing in production was changed.**

---

## 0. Verdict

**Agree with changes.** Every root-cause link RC-1 → RC-7 is confirmed against source and production data. The remediation direction (detector-level degradation first, no blind retry after an accepted generation) is correct.

Two things the assessment misses change the shape of the fix:

1. **There is an upstream cause it did not find (RC-0).** The 120-second boundary is being hit because OpenRouter's price-weighted routing, constrained by `zdr: true`, is landing Project Loop calls on slow hosts — overwhelmingly **DigitalOcean** (10 of the 15 retrievable timeout generations; ~18 tok/s median, ~7.5 tok/s p10 on loop-sized outputs). Its share of loop traffic has risen from 0% (mid-July) to 36% (this week). Degradation alone treats the symptom; provider steering removes most of the cause, cheaply, with repo precedent.
2. **Four implementation landmines** that would turn the proposed P0 into a user-visible regression if an implementer follows the assessment literally (§4 below). The most important: a degraded detector must still feed `skippedKinds`, or the run will rotate out every pending suggestion of that kind older than 72h.

Several factual claims are also slightly off or already true today (§2).

---

## 1. What was independently confirmed

| Claim in assessment | Verified | Notes |
| --- | --- | --- |
| 120s default applied because `callGenerator` passes no `timeoutMs` | ✅ | `generators.ts:543-566`; `openrouter-client.ts:66` (doc says L65 — trivial). Worker wrapper passes no `openrouter.timeoutMs` either. |
| DeepSeek V4 Flash first in balanced JSON route | ✅ | `model-config.ts:565`. Loop sends `models: [flash, mimo-v2.5, nex-n2-mini]` (cap of 3 fallbacks, `openrouter-request.ts`). |
| Generation ID attached on body-read failure | ✅ | `openrouter-client.ts:142-156`. All 22 timeout rows carry one. |
| `hasOpenRouterGenerationId` suppresses local fallback | ✅ | `smart-llm-service.ts:1005-1009`, `errors.ts:187`. |
| `runGenerator` only handles cost cap | ✅ | `projectLoopWorker.ts:3028-3043`. |
| Outer catch marks `failed` then rethrows; queue classifies transient; retry can't claim | ✅ | `projectLoopWorker.ts:3350-3397`, `queueErrors.ts:52`, `supabaseQueue.ts:633-651`, claim fence `projectLoopWorker.ts:2938-2951`. All 13 timeout-failed runs' queue rows end `completed / attempts=1 / skipped=true`. |
| `Failed to generate valid JSON:` wrapper on every terminal failure | ✅ | `smart-llm-service.ts:1210`. Only one other string consumer in repo (`openrouter-v2-service.ts:1409`, its own message) — safe to change. |
| `job.signal` not threaded into generators | ✅ | Precedent exists: `agentRunWorker.ts:1938`, `questionTreeWorker.ts:214`. |
| Manager brief / audit synthesis already degrade | ✅ | `generators.ts:1416`, `projectLoopWorker.ts:2338,2699`. Daily-brief project brief too (`ontologyBriefGenerator.ts:585`). **The four detectors are the only uncaught LLM consumers in the worker's loop family.** |
| 30-day: 142 runs / 42 failed / 13 timeout / 29 dedup | ✅ | I get 141 / 42 / 13 / 28+1 (window edge). |
| Per-detector timeout rates | ✅ | Exact match (drift 7/108, brief 5/106, doc-org 3/55, conflicts 2/82, outdated 1/109). |
| Successful p95 latencies | ≈ | doc-org I measure 105.8s (doc: 96.9s); conflicts 62.0s (doc: 60.4s); others match. Window drift. |
| Incident generation: DigitalOcean, 1,037/1,242 tokens, 119,775ms, cancelled, $0.000279 | ✅ | Re-fetched from OpenRouter. |
| "Two eventually reported `finish_reason = stop`" | ✅ | drift 08-04 (Morph, 119.4s) and drift 08-07 (DigitalOcean, 125.2s). Plus an `other` row on Morph: 143 tokens in 129.9s = **1.1 tok/s** — a stall, not a long output. |

---

## 2. Corrections to the assessment

### 2.1 The error is a `TimeoutError`, not an `AbortError` — and the client's timeout branch is dead code

`AbortSignal.timeout()` rejects `fetch` / body reads with a `DOMException` named **`TimeoutError`** (message `The operation was aborted due to timeout`). Verified empirically on Node 24 against a stalling local server; undici semantics are the same on the worker's Node 22. Consequences:

- `openrouter-client.ts:201` checks `error.name === 'AbortError'` → **never matches** for the timeout signal. The `callOpenRouter_timeout` error-log entry and the `Request timeout for model X` message never fire. The raw DOMException propagates.
- The usage row is classified `status: 'timeout'` only because `smart-llm-service.ts:1178` does `lastError.message.includes('timeout')` on undici's message. That heuristic is the *only* thing currently labelling these correctly.
- Production confirms: every one of the 22 rows has `error_message = 'The operation was aborted due to timeout'` and `error_logs` shows two entries per incident (`getJSONResponse / llm_api_request_failure` raw, then the wrapped run-level one).

**Implication for the taxonomy fix (doc P1):** classify on `error.name === 'TimeoutError'` / a typed cause, not on message substrings. Fix the `AbortError` branch to handle both names.

### 2.2 `billing_disposition = 'uncertain'` is already persisted

Doc P2 step 1 ("Persist `billing_disposition = uncertain`") is already done — `smart-llm-service.ts:1101-1106` computes it and all 22 timeout rows carry `metadata.billingDisposition: 'uncertain'` plus the generation ID. The *only* missing piece is a reconciler that reads it back. Note also that **7 of the 22 generation IDs already return 404** from OpenRouter — reconciliation must run on a schedule inside the retention window, not ad hoc. Unaccounted cost for the 15 still retrievable: **$0.0104** — the dollars are irrelevant, the telemetry honesty is the point.

### 2.3 Cost-cap undercount

On the failure path `onUsage` fires only for strict-budget (`spendPlan`) calls (`smart-llm-service.ts:1107`). Project Loop has none, so a timed-out call contributes $0 to `totalCost`, and the `$0.35` cap check undercounts. Minor; fold into the reconciliation/taxonomy work.

### 2.4 The rotation semantics of `skippedGenerators` are load-bearing (see §4.1)

The doc says "do not reuse the existing `skippedGenerators` string list unchanged" because of the `after cost cap` summary text. Correct for the *text* — but that list is also what feeds `skippedKinds` → `rotateUnconfirmedPendingSuggestions` (`projectLoopWorker.ts:3137-3142, 3209-3215, 715`). Replacing it without preserving that path is a regression.

---

## 3. RC-0 — The upstream cause: price-weighted routing under ZDR lands on slow hosts

### Evidence

**All 22 DS-Flash timeouts in 30 days, by provider (OpenRouter generation records):**

| Provider | Timeouts | Loop-call throughput (≥300 output tokens) p50 / p10 |
| --- | ---: | --- |
| DigitalOcean | **10** | 17.8 / 7.5 tok/s |
| Morph | 3 | 43.7 / 12.9 |
| Phala | 1 | 6.0 / 6.0 |
| Mancer 2 | 1 | 39.1 / 17.4 |
| (7 records expired / 404) | 7 | — |

Compare the providers that *also* serve loop calls under the same request: Novita 92 / 74 tok/s, Venice 91 / 33, Parasail 66 / 33, SiliconFlow 58 / 33, CoreWeave 52 / 23, DeepInfra 44 / 22.

**DigitalOcean's share of loop traffic is rising** (5-day buckets, non-streaming DS-Flash): 0% (Jul 11) → 8% → 13% → 14% → 0% → 6% → 11% → 20% → 35% → **36%** (Aug 21). Reconciliation calls, which historically landed on DeepInfra 75–90%, are landing on DigitalOcean today too. This is drift in OpenRouter's cheapest-eligible provider, and it is getting worse.

### Mechanism (confirmed by docs + live probes)

OpenRouter's default routing: filter by request constraints, then "select one weighted by inverse square of the price" among stable providers. With `zdr: true` (our `OPENROUTER_PRIVATE_PROVIDER`, `openrouter-request.ts:38`), the three cheapest DS-Flash endpoints — StreamLake, Baidu, GMICloud ($0.109–0.118/M out) — are ineligible and never appear in any loop row or probe. **DigitalOcean ($0.168/M) becomes the cheapest eligible host and wins the weighting.** Its 30-minute throughput p50 is 27 tok/s per OpenRouter's own endpoint stats; latency p99 is 22s.

Live probes (nonce'd prompts, interleaved, N=12 per arm): DigitalOcean was plurality in every default-routing arm; `sort: 'throughput'` routed 12/12 to Novita.

### Hypotheses tested and refuted (so nobody re-chases them)

| Hypothesis | Test | Result |
| --- | --- | --- |
| `max_tokens: 8192` steers routing (8192-bucket has 16% DeepInfra vs 79–88% for 2000–2400 buckets) | A/B 2400 vs 8192, N=10 each | No difference. DeepInfra's cap is 65,536 anyway. |
| The `models` fallback array changes provider selection | A/B none / [3] / [self], N=12 each | No difference. |
| Web vs worker API key / account settings | `GET /api/v1/key` + `/credits` for both | **Same key, same account.** |
| Time of day (loop runs in a 04:00 UTC burst) | Per-hour provider share | Reconciliation at 03–05 UTC still got DeepInfra 90% in the window; the difference was temporal drift, not hour. |

### Second failure shape: output length

Not every timeout is a slow host. `project_loop_doc_organization` on Mancer 2 produced **5,897 tokens at 49 tok/s** and still hit 120s. Drift's successful p95 output is **5,286 tokens**; doc-org 3,648; outdated 3,384 (p50s are 450–1,050). `MAX_SUGGESTIONS = 25` at the worker, and only the drift prompt says "Prefer 0-3 high-signal items". Two multiplicative factors: **provider throughput × output length**. Steering fixes the first; only an output budget or a longer deadline fixes the second.

---

## 4. Implementation landmines the assessment does not call out

### 4.1 Rotation: a degraded detector MUST feed `skippedKinds`

`rotateUnconfirmedPendingSuggestions` supersedes any pending suggestion older than 72h whose kind was not re-emitted this run — **unless** the kind is in `skippedKinds` (`projectLoopWorker.ts:715`). The cost-cap path gets this right via `GENERATOR_LABEL_TO_KIND`. If the new degraded path returns `[]` for drift without adding `'drift'` to `skippedKinds`, the run will **rotate out every pending drift suggestion older than 72h** — the user's inbox items vanish after a provider hiccup. The doc's "return `[]` and continue" is incomplete without this.

### 4.2 Cancellation classification must check `job.signal.aborted`, not error text

When the queue's worker timeout fires it calls `controller.abort(new Error('Worker timeout after 600000ms for buildos_project_loop'))` (`supabaseQueue.ts:749`). Verified: with `AbortSignal.any`, `fetch` rejects with **that Error** (name `Error`), whose message contains `timeout`. A substring classifier would label it a recoverable provider timeout, return `[]`, and **keep writing suggestions after ownership was lost** — exactly the duplicate-execution case the status fence exists to prevent. Smart-llm will also treat it as retryable (`errors.ts:134`), loop once, then throw `LLM request aborted: …` from its loop-top abort check (`smart-llm-service.ts:642`) — so the final message differs between the two paths anyway. Check the signal first; classify the error second.

### 4.3 The manager brief must know coverage was partial

Synthesis loads current candidates from the DB (`loadProjectReviewSynthesisCandidates`) with no knowledge of which lenses ran. After a drift timeout, the LLM brief or the heuristic fallback can honestly produce `attention_level: 'none'` / "project looks tidy" when drift was never assessed. Pass skipped lenses into the synthesis input (and/or `no_attention_reason`) so the brief says "drift not checked this pass" rather than "no drift".

### 4.4 `project_loop_runs.summary` is user-facing

`activity-timeline.service.ts:412` selects `summary` into the user's feed. Whatever the degraded-coverage sentence is, write it for the user, not the operator ("Checked docs and task conflicts; drift check didn't finish this pass" — not "drift timed out after 120000ms").

### 4.5 Typed errors, not strings, or the queue/taxonomy fixes will fight each other

Three layers currently decide "is this a timeout" by `message.includes('timeout')`: usage-row status (`:1178`), error-log `isTimeout` (`:1133`), and retryability (`errors.ts:134`). A worker-timeout abort, a provider timeout, and an OpenRouter `504 upstream timeout` all satisfy that substring. Introduce one typed error (`LLMRequestTimeoutError { timeoutMs, requestedModel, generationId }`) thrown from `openrouter-client.ts` on `name ∈ {TimeoutError, AbortError}` when the caller signal is *not* aborted, and a distinct `LLMRequestCancelledError` when it is. Everything above consumes the type.

### 4.6 Raising the per-call deadline needs a run budget — and is probably unnecessary after steering

Five sequential calls × 180s = 900s > the 600s default worker timeout (`queueConfig.ts:49`). Stall detection is fine either way (generic heartbeat every ≤60s, `supabaseQueue.ts:80`), but the worker timeout is not. With steering to 50–90 tok/s hosts, a 5,000-token output finishes in 55–100s — inside 120s. Measure before raising.

---

## 5. Ranked plan (changes vs the assessment marked ▲)

### P0-A — Detector isolation with structured skip reasons (assessment P0, amended)

As proposed, plus: skip reason feeds `skippedKinds` (§4.1); classifier checks `job.signal.aborted` first (§4.2); skipped lenses passed to synthesis (§4.3); user-facing summary wording (§4.4); recoverable set = typed timeout + typed provider 5xx/429 only — parse failures, empty content, DB, invariant, and auth errors still fail the run.

### ▲ P0-B — Provider steering for Project Loop JSON calls (new)

Add a `providerRouting` option to `getJSONResponse` (today only `providerMaxPrice` reaches the `provider` object, `smart-llm-service.ts:499-505`) and set it from `callGenerator`/`callBriefGenerator`. Repo precedent: `phase3Config.ts:32-41` (`order` + `allow_fallbacks`) and `openrouter-v2-service.ts:129-145` (per-model default order with `PRIVATE_OPENROUTER_PROVIDER_ORDER` env kill switch — copy the kill switch verbatim).

Three viable shapes — **decision for DJ**:

| Shape | Effect | Risk |
| --- | --- | --- |
| `ignore: [digitalocean, phala, morph, mancer, openinference, ionet]` | Keeps price load-balancing among the rest | Blocklist rots; DigitalOcean-class hosts reappear under new names |
| `order: [novita, parasail, siliconflow, venice, coreweave]` + `allow_fallbacks: true` | Deterministic; matches existing repo pattern | Allowlist rots (the web's July list already reflects a different landscape); disables load balancing |
| `sort: 'throughput'` | Self-maintaining; 12/12 probes → Novita (92 tok/s) | 100% concentration on one host; no price ceiling within ZDR; uptime of that one host becomes our uptime |

Recommendation: `order` list (second row) with the env kill switch, re-validated monthly from the per-provider throughput query (§7). Expected effect: median loop throughput ~18 → 60–90 tok/s on the hosts that currently time out; provider-shape timeouts → ~0. Cost per token rises from $0.168 → $0.28/M output on most of the list; at current volume that is cents per month.

### P1 — Signal propagation (assessment P0 #2 → P1)

Thread `job.signal` through generator params into every `getJSONResponse`. Not needed to stop the incident class; needed for ownership correctness. Land with P0-A because the classifier depends on it (§4.2).

### P1 — Error taxonomy (assessment P1, amended per §4.5)

### P1 — Queue/domain retry coherence (assessment P1, agree)

For recoverable detector failures: no throw, no retry. For anything else: throw `PermanentQueueError` **unless** the failure is a known-transient infra class *and* no durable child output exists, in which case atomically restore `status = 'queued'` (`.eq('status','running')`) before rethrowing. Add the test "every scheduled retry has a claimable domain state". `SUGGESTION_SUPPRESSION_STATUSES` excludes `superseded`, so a genuine whole-run retry after `supersedePendingSuggestionsForFailedRun` re-surfaces those items rather than duplicating them — acceptable.

### ▲ P1 — Output budget experiment (new; was folded into the doc's "model/deadline experiment")

Drift p95 = 5.3K output tokens is the second timeout shape. Options: explicit per-detector item caps in prompts ("at most 5"), `maxTokens: 4096` with `allowTruncatedJsonRecovery`, or both. **Decision for DJ** — this changes what users see (fewer, higher-signal items per pass). Measure completion-token distribution per detector before/after.

### P2 — Per-call deadline change — only if P0-B + output budget leave a measurable tail. Requires a run-level budget (§4.6).

### P2 — Accepted-generation cost reconciliation (assessment P2, amended per §2.2)

Generalize `lookupOpenRouterGenerationCost` from `agentRunCostReconciler.ts:113`; select on `metadata->>billingDisposition = 'uncertain'` with a generation ID; run on the scheduler daily (retention window is days — 7/22 already gone); also fix the cost-cap undercount (§2.3).

---

## 6. Answers to the reviewer questions (§11 of the assessment)

1. **Mandatory detectors?** None. All four are independent lenses and every sibling generator already degrades. Mandatory = the manager brief (already has a heuristic fallback) and candidate persistence.
2. **Boundary narrow enough?** Only if typed (§4.5). A substring boundary is not narrow enough — it admits worker-timeout aborts and OpenRouter 504s indiscriminately.
3. **Degraded coverage user-facing?** Yes, in the summary and in the brief (§4.3, §4.4) — the alternative is a brief that claims tidiness it didn't verify. Keep the structured reasons internal.
4. **New status?** No. `completed` + structured `skipped_lenses` in the `brief` JSON / summary text is sufficient; a new status costs schema + every status switch in web.
5. **Timeout vs model vs degradation first?** Degradation (P0-A) and steering (P0-B) together, same PR. Not a longer timeout; not a different model — the model is fine on fast hosts.
6. **Whole-run retry after inserts?** Only phase-aware. Today's `supersedePendingSuggestionsForFailedRun` + suppression-status exclusion makes a naive retry *safe* (no duplicates) but wasteful; keep it out of P0.
7. **Guard scope?** Keep it global. A generation ID means paid work; that is true regardless of budget mode. What changes is the *caller's* response to the guard (degrade), not the guard.
8. **Where does reconciliation live?** `packages/smart-llm` should own the lookup + the "uncertain → settled" state machine; the worker scheduler owns *when*. The agent-run reconciler becomes one caller.

---

## 7. Minimum tests and production smoke

**Before merge**

- Project Loop: drift typed-timeout → `[]`, `skippedKinds` contains `drift`, conflicts still run, rotation leaves 80h-old pending drift items untouched, brief input lists `drift` as unchecked, summary is user-facing, run `completed`, no queue retry scheduled.
- Project Loop: `job.signal` aborted mid-detector → no further detectors, no suggestion inserts, no terminal write, run left for the sweeper/next owner.
- Project Loop: DB error / invariant error in a detector → run `failed`, `PermanentQueueError` (or restored to `queued` if classified transient), and the scheduled retry (if any) can claim.
- Smart-llm: `TimeoutError` during body read with `x-generation-id` → typed timeout error carrying the ID, no second model attempt, usage row `timeout` + `uncertain`; same without generation ID → fails over to next model (current behaviour, keep).
- Smart-llm: caller abort with Error reason → typed cancelled error, no further attempts, not labelled timeout.
- Smart-llm: `providerRouting` reaches the request body merged over `OPENROUTER_PRIVATE_PROVIDER`; env kill switch removes it.
- Existing: `charges the reservation when a strict-budget response is lost` still passes unchanged.

**After deploy**

- One injected detector timeout (fixture) on a staging project → degraded `completed` run, one queue execution, pending items intact.
- Telemetry query (below) at +7 days: loop timeouts ≈ 0; DigitalOcean/Phala/Morph share of loop calls ≈ 0; per-detector p95 wall time down ≥50%.

**Standing telemetry** (the scripts used for this review are in the session scratchpad; worth committing under `apps/worker/scripts/project-loop-telemetry/`): per-provider `completion_tokens / response_time_ms` p50/p10 for `operation_type LIKE 'project_loop%'`, weekly; timeout rows joined to OpenRouter generation lookups while IDs are still retrievable.

---

## 8. One-paragraph version for the implementer

The incident is a provider-throughput problem wearing a JSON-error costume. OpenRouter's price routing under ZDR is increasingly sending Project Loop's four detector calls to DigitalOcean (~18 tok/s), so 1–5K-token outputs blow the 120s deadline; the client correctly refuses a second paid attempt because a generation ID exists; the loop then treats one lost lens as a dead run; the queue retries into a run it can't claim. Fix it in one PR: steer loop JSON calls to fast ZDR hosts (`order` list + env kill switch), make each detector's typed timeout/provider failure degrade to `[]` **while still marking its kind as skipped for rotation and telling the brief the lens was unchecked**, thread `job.signal` and check it before classifying, and replace the three `includes('timeout')` checks with one typed error. Then reconcile uncertain generations on a schedule, and only revisit the 120s deadline with data.
