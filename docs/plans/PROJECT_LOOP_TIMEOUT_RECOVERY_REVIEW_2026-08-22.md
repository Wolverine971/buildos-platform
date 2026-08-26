<!-- docs/plans/PROJECT_LOOP_TIMEOUT_RECOVERY_REVIEW_2026-08-22.md -->
<!-- doc-status: point-in-time -->

# Project Loop Timeout Recovery — Independent Review

**Date:** 2026-08-22
**Reviews:** [`PROJECT_LOOP_TIMEOUT_RECOVERY_ASSESSMENT_2026-08-22.md`](./PROJECT_LOOP_TIMEOUT_RECOVERY_ASSESSMENT_2026-08-22.md)
**Source verified at:** HEAD `489aff88c` (no diff vs the assessment's `32c08d2` on any referenced file; working tree clean on those files)
**Method:** line-by-line source trace of every cited location; independent re-derivation of every production number from `llm_usage_logs`, `project_loop_runs`, `queue_jobs`, `error_logs`; OpenRouter generation lookups for all 22 timeout rows; OpenRouter endpoint/pricing metadata; four live routing probes (~$0.0004 total); empirical Node `fetch` abort-semantics test.
**Production state:** The review itself changed nothing. PR 1 is now implemented locally but has not been deployed.

> **Status 2026-08-23: PR 1 implementation is complete and locally verified. The focused acceptance battery and full package regressions are green; see §11. No deployment or post-deploy smoke has been performed, so §10.5 remains open.**

---

## 0. Verdict

**Agree with changes.** Every root-cause link RC-1 → RC-7 is confirmed against source and production data. The remediation direction (detector-level degradation first, no blind retry after an accepted generation) is correct.

Two things the assessment misses change the shape of the fix:

1. **There is an upstream cause it did not find (RC-0).** The 120-second boundary is being hit because OpenRouter's price-weighted routing, constrained by `zdr: true`, is landing Project Loop calls on slow hosts — overwhelmingly **DigitalOcean** (10 of the 15 retrievable timeout generations; ~18 tok/s median, ~7.5 tok/s p10 on loop-sized outputs). Its share of loop traffic has risen from 0% (mid-July) to 36% (this week). Degradation alone treats the symptom; provider steering removes most of the cause, cheaply, with repo precedent.
2. **Four implementation landmines** that would turn the proposed P0 into a user-visible regression if an implementer follows the assessment literally (§4 below). The most important: a degraded detector must still feed `skippedKinds`, or the run will rotate out every pending suggestion of that kind older than 72h.

Several factual claims are also slightly off or already true today (§2).

---

## 1. What was independently confirmed

| Claim in assessment                                                                     | Verified | Notes                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 120s default applied because `callGenerator` passes no `timeoutMs`                      | ✅       | `generators.ts:543-566`; `openrouter-client.ts:66` (doc says L65 — trivial). Worker wrapper passes no `openrouter.timeoutMs` either.                                                                                 |
| DeepSeek V4 Flash first in balanced JSON route                                          | ✅       | `model-config.ts:565`. Loop sends `models: [flash, mimo-v2.5, nex-n2-mini]` (cap of 3 fallbacks, `openrouter-request.ts`).                                                                                           |
| Generation ID attached on body-read failure                                             | ✅       | `openrouter-client.ts:142-156`. All 22 timeout rows carry one.                                                                                                                                                       |
| `hasOpenRouterGenerationId` suppresses local fallback                                   | ✅       | `smart-llm-service.ts:1005-1009`, `errors.ts:187`.                                                                                                                                                                   |
| `runGenerator` only handles cost cap                                                    | ✅       | `projectLoopWorker.ts:3028-3043`.                                                                                                                                                                                    |
| Outer catch marks `failed` then rethrows; queue classifies transient; retry can't claim | ✅       | `projectLoopWorker.ts:3350-3397`, `queueErrors.ts:52`, `supabaseQueue.ts:633-651`, claim fence `projectLoopWorker.ts:2938-2951`. All 13 timeout-failed runs' queue rows end `completed / attempts=1 / skipped=true`. |
| `Failed to generate valid JSON:` wrapper on every terminal failure                      | ✅       | `smart-llm-service.ts:1210`. Only one other string consumer in repo (`openrouter-v2-service.ts:1409`, its own message) — safe to change.                                                                             |
| `job.signal` not threaded into generators                                               | ✅       | Precedent exists: `agentRunWorker.ts:1938`, `questionTreeWorker.ts:214`.                                                                                                                                             |
| Manager brief / audit synthesis already degrade                                         | ✅       | `generators.ts:1416`, `projectLoopWorker.ts:2338,2699`. Daily-brief project brief too (`ontologyBriefGenerator.ts:585`). **The four detectors are the only uncaught LLM consumers in the worker's loop family.**     |
| 30-day: 142 runs / 42 failed / 13 timeout / 29 dedup                                    | ✅       | I get 141 / 42 / 13 / 28+1 (window edge).                                                                                                                                                                            |
| Per-detector timeout rates                                                              | ✅       | Exact match (drift 7/108, brief 5/106, doc-org 3/55, conflicts 2/82, outdated 1/109).                                                                                                                                |
| Successful p95 latencies                                                                | ≈        | doc-org I measure 105.8s (doc: 96.9s); conflicts 62.0s (doc: 60.4s); others match. Window drift.                                                                                                                     |
| Incident generation: DigitalOcean, 1,037/1,242 tokens, 119,775ms, cancelled, $0.000279  | ✅       | Re-fetched from OpenRouter.                                                                                                                                                                                          |
| "Two eventually reported `finish_reason = stop`"                                        | ✅       | drift 08-04 (Morph, 119.4s) and drift 08-07 (DigitalOcean, 125.2s). Plus an `other` row on Morph: 143 tokens in 129.9s = **1.1 tok/s** — a stall, not a long output.                                                 |

---

## 2. Corrections to the assessment

### 2.1 The error is a `TimeoutError`, not an `AbortError` — and the client's timeout branch is dead code

`AbortSignal.timeout()` rejects `fetch` / body reads with a `DOMException` named **`TimeoutError`** (message `The operation was aborted due to timeout`). Verified empirically on Node 24 against a stalling local server; undici semantics are the same on the worker's Node 22. Consequences:

- `openrouter-client.ts:201` checks `error.name === 'AbortError'` → **never matches** for the timeout signal. The `callOpenRouter_timeout` error-log entry and the `Request timeout for model X` message never fire. The raw DOMException propagates.
- The usage row is classified `status: 'timeout'` only because `smart-llm-service.ts:1178` does `lastError.message.includes('timeout')` on undici's message. That heuristic is the _only_ thing currently labelling these correctly.
- Production confirms: every one of the 22 rows has `error_message = 'The operation was aborted due to timeout'` and `error_logs` shows two entries per incident (`getJSONResponse / llm_api_request_failure` raw, then the wrapped run-level one).

**Implication for the taxonomy fix (doc P1):** classify on `error.name === 'TimeoutError'` / a typed cause, not on message substrings. Fix the `AbortError` branch to handle both names.

### 2.2 `billing_disposition = 'uncertain'` is already persisted

Doc P2 step 1 ("Persist `billing_disposition = uncertain`") is already done — `smart-llm-service.ts:1101-1106` computes it and all 22 timeout rows carry `metadata.billingDisposition: 'uncertain'` plus the generation ID. The _only_ missing piece is a reconciler that reads it back. Note also that **7 of the 22 generation IDs already return 404** from OpenRouter — reconciliation must run on a schedule inside the retention window, not ad hoc. Unaccounted cost for the 15 still retrievable: **$0.0104** — the dollars are irrelevant, the telemetry honesty is the point.

### 2.3 Cost-cap undercount

On the failure path `onUsage` fires only for strict-budget (`spendPlan`) calls (`smart-llm-service.ts:1107`). Project Loop has none, so a timed-out call contributes $0 to `totalCost`, and the `$0.35` cap check undercounts. Minor; fold into the reconciliation/taxonomy work.

### 2.4 The rotation semantics of `skippedGenerators` are load-bearing (see §4.1)

The doc says "do not reuse the existing `skippedGenerators` string list unchanged" because of the `after cost cap` summary text. Correct for the _text_ — but that list is also what feeds `skippedKinds` → `rotateUnconfirmedPendingSuggestions` (`projectLoopWorker.ts:3137-3142, 3209-3215, 715`). Replacing it without preserving that path is a regression.

---

## 3. RC-0 — The upstream cause: price-weighted routing under ZDR lands on slow hosts

### Evidence

**All 22 DS-Flash timeouts in 30 days, by provider (OpenRouter generation records):**

| Provider                  | Timeouts | Loop-call throughput (≥300 output tokens) p50 / p10 |
| ------------------------- | -------: | --------------------------------------------------- |
| DigitalOcean              |   **10** | 17.8 / 7.5 tok/s                                    |
| Morph                     |        3 | 43.7 / 12.9                                         |
| Phala                     |        1 | 6.0 / 6.0                                           |
| Mancer 2                  |        1 | 39.1 / 17.4                                         |
| (7 records expired / 404) |        7 | —                                                   |

Compare the providers that _also_ serve loop calls under the same request: Novita 92 / 74 tok/s, Venice 91 / 33, Parasail 66 / 33, SiliconFlow 58 / 33, CoreWeave 52 / 23, DeepInfra 44 / 22.

**DigitalOcean's share of loop traffic is rising** (5-day buckets, non-streaming DS-Flash): 0% (Jul 11) → 8% → 13% → 14% → 0% → 6% → 11% → 20% → 35% → **36%** (Aug 21). Reconciliation calls, which historically landed on DeepInfra 75–90%, are landing on DigitalOcean today too. This is drift in OpenRouter's cheapest-eligible provider, and it is getting worse.

### Mechanism (confirmed by docs + live probes)

OpenRouter's default routing: filter by request constraints, then "select one weighted by inverse square of the price" among stable providers. With `zdr: true` (our `OPENROUTER_PRIVATE_PROVIDER`, `openrouter-request.ts:38`), the three cheapest DS-Flash endpoints — StreamLake, Baidu, GMICloud ($0.109–0.118/M out) — are ineligible and never appear in any loop row or probe. **DigitalOcean ($0.168/M) becomes the cheapest eligible host and wins the weighting.** Its 30-minute throughput p50 is 27 tok/s per OpenRouter's own endpoint stats; latency p99 is 22s.

Live probes (nonce'd prompts, interleaved, N=12 per arm): DigitalOcean was plurality in every default-routing arm; `sort: 'throughput'` routed 12/12 to Novita.

### Hypotheses tested and refuted (so nobody re-chases them)

| Hypothesis                                                                                        | Test                                    | Result                                                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `max_tokens: 8192` steers routing (8192-bucket has 16% DeepInfra vs 79–88% for 2000–2400 buckets) | A/B 2400 vs 8192, N=10 each             | No difference. DeepInfra's cap is 65,536 anyway.                                                                |
| The `models` fallback array changes provider selection                                            | A/B none / [3] / [self], N=12 each      | No difference.                                                                                                  |
| Web vs worker API key / account settings                                                          | `GET /api/v1/key` + `/credits` for both | **Same key, same account.**                                                                                     |
| Time of day (loop runs in a 04:00 UTC burst)                                                      | Per-hour provider share                 | Reconciliation at 03–05 UTC still got DeepInfra 90% in the window; the difference was temporal drift, not hour. |

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

Three layers currently decide "is this a timeout" by `message.includes('timeout')`: usage-row status (`:1178`), error-log `isTimeout` (`:1133`), and retryability (`errors.ts:134`). A worker-timeout abort, a provider timeout, and an OpenRouter `504 upstream timeout` all satisfy that substring. Introduce one typed error (`LLMRequestTimeoutError { timeoutMs, requestedModel, generationId }`) thrown from `openrouter-client.ts` on `name ∈ {TimeoutError, AbortError}` when the caller signal is _not_ aborted, and a distinct `LLMRequestCancelledError` when it is. Everything above consumes the type.

### 4.6 Raising the per-call deadline needs a run budget — and is probably unnecessary after steering

Five sequential calls × 180s = 900s > the 600s default worker timeout (`queueConfig.ts:49`). Stall detection is fine either way (generic heartbeat every ≤60s, `supabaseQueue.ts:80`), but the worker timeout is not. With steering to 50–90 tok/s hosts, a 5,000-token output finishes in 55–100s — inside 120s. Measure before raising.

---

## 5. Ranked plan (changes vs the assessment marked ▲)

### P0-A — Detector isolation with structured skip reasons (assessment P0, amended)

As proposed, plus: skip reason feeds `skippedKinds` (§4.1); classifier checks `job.signal.aborted` first (§4.2); skipped lenses passed to synthesis (§4.3); user-facing summary wording (§4.4); recoverable set = typed timeout + typed provider 5xx/429 only — parse failures, empty content, DB, invariant, and auth errors still fail the run.

### ▲ P0-B — Provider steering for Project Loop JSON calls (new)

Add a `providerRouting` option to `getJSONResponse` (today only `providerMaxPrice` reaches the `provider` object, `smart-llm-service.ts:499-505`) and set it from `callGenerator`/`callBriefGenerator`. Repo precedent: `phase3Config.ts:32-41` (`order` + `allow_fallbacks`) and `openrouter-v2-service.ts:129-145` (per-model default order with `PRIVATE_OPENROUTER_PROVIDER_ORDER` env kill switch — copy the kill switch verbatim).

Three viable shapes — **decision for DJ**:

| Shape                                                                                 | Effect                                             | Risk                                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `ignore: [digitalocean, phala, morph, mancer, openinference, ionet]`                  | Keeps price load-balancing among the rest          | Blocklist rots; DigitalOcean-class hosts reappear under new names                                       |
| `order: [novita, parasail, siliconflow, venice, coreweave]` + `allow_fallbacks: true` | Deterministic; matches existing repo pattern       | Allowlist rots (the web's July list already reflects a different landscape); disables load balancing    |
| `sort: 'throughput'`                                                                  | Self-maintaining; 12/12 probes → Novita (92 tok/s) | 100% concentration on one host; no price ceiling within ZDR; uptime of that one host becomes our uptime |

Recommendation: `order` list (second row) with the env kill switch, re-validated monthly from the per-provider throughput query (§7). Expected effect: median loop throughput ~18 → 60–90 tok/s on the hosts that currently time out; provider-shape timeouts → ~0. Cost per token rises from $0.168 → $0.28/M output on most of the list; at current volume that is cents per month.

### P1 — Signal propagation (assessment P0 #2 → P1)

Thread `job.signal` through generator params into every `getJSONResponse`. Not needed to stop the incident class; needed for ownership correctness. Land with P0-A because the classifier depends on it (§4.2).

### P1 — Error taxonomy (assessment P1, amended per §4.5)

### P1 — Queue/domain retry coherence (assessment P1, agree)

For recoverable detector failures: no throw, no retry. For anything else: throw `PermanentQueueError` **unless** the failure is a known-transient infra class _and_ no durable child output exists, in which case atomically restore `status = 'queued'` (`.eq('status','running')`) before rethrowing. Add the test "every scheduled retry has a claimable domain state". `SUGGESTION_SUPPRESSION_STATUSES` excludes `superseded`, so a genuine whole-run retry after `supersedePendingSuggestionsForFailedRun` re-surfaces those items rather than duplicating them — acceptable.

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
6. **Whole-run retry after inserts?** Only phase-aware. Today's `supersedePendingSuggestionsForFailedRun` + suppression-status exclusion makes a naive retry _safe_ (no duplicates) but wasteful; keep it out of P0.
7. **Guard scope?** Keep it global. A generation ID means paid work; that is true regardless of budget mode. What changes is the _caller's_ response to the guard (degrade), not the guard.
8. **Where does reconciliation live?** `packages/smart-llm` should own the lookup + the "uncertain → settled" state machine; the worker scheduler owns _when_. The agent-run reconciler becomes one caller.

---

## 7. Minimum tests and production smoke

**Before merge — complete 2026-08-23 (evidence in §11)**

- Project Loop: drift typed-timeout → `[]`, `skippedKinds` contains `drift`, conflicts still run, rotation leaves 80h-old pending drift items untouched, brief input lists `drift` as unchecked, summary is user-facing, run `completed`, no queue retry scheduled.
- Project Loop: `job.signal` aborted mid-detector → no further detectors, no suggestion inserts, no terminal write, run left for the sweeper/next owner.
- Project Loop: DB error / invariant error in a detector → run `failed`, `PermanentQueueError` (or restored to `queued` if classified transient), and the scheduled retry (if any) can claim.
- Smart-llm: `TimeoutError` during body read with `x-generation-id` → typed timeout error carrying the ID, no second model attempt, usage row `timeout` + `uncertain`; same without generation ID → fails over to next model (current behaviour, keep).
- Smart-llm: caller abort with Error reason → typed cancelled error, no further attempts, not labelled timeout.
- Smart-llm: `providerRouting` reaches the request body merged over `OPENROUTER_PRIVATE_PROVIDER`; env kill switch removes it.
- Existing: `charges the reservation when a strict-budget response is lost` still passes unchanged.

**After deploy — pending**

- One injected detector timeout (fixture) on a staging project → degraded `completed` run, one queue execution, pending items intact.
- Telemetry query (below) at +7 days: loop timeouts ≈ 0; DigitalOcean/Phala/Morph share of loop calls ≈ 0; per-detector p95 wall time down ≥50%.

**Standing telemetry** (the scripts used for this review are in the session scratchpad; worth committing under `apps/worker/scripts/project-loop-telemetry/`): per-provider `completion_tokens / response_time_ms` p50/p10 for `operation_type LIKE 'project_loop%'`, weekly; timeout rows joined to OpenRouter generation lookups while IDs are still retrievable.

---

## 8. One-paragraph version for the implementer

The incident is a provider-throughput problem wearing a JSON-error costume. OpenRouter's price routing under ZDR is increasingly sending Project Loop's four detector calls to DigitalOcean (~18 tok/s), so 1–5K-token outputs blow the 120s deadline; the client correctly refuses a second paid attempt because a generation ID exists; the loop then treats one lost lens as a dead run; the queue retries into a run it can't claim. Fix it in one PR: steer loop JSON calls to fast ZDR hosts (`order` list + env kill switch), make each detector's typed timeout/provider failure degrade to `[]` **while still marking its kind as skipped for rotation and telling the brief the lens was unchecked**, thread `job.signal` and check it before classifying, and replace the three `includes('timeout')` checks with one typed error. Then reconcile uncertain generations on a schedule, and only revisit the 120s deadline with data.

---

## 9. Decisions (locked 2026-08-22)

| #   | Question                                    | Decision                                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | ZDR                                         | **Keep `zdr: true` as a hard requirement.** No non-ZDR fallback tier.                                                                                                                              | ZDR shipped with the legal/consent work (`8379e5050`, 2026-07-16) — it is a privacy commitment, not a tuning knob. OpenRouter has no "prefer ZDR" mode (`zdr` is a hard filter; account-level ZDR ORs with it). ZDR is not the cause; ZDR **plus price-weighting** is. Steering fixes it with ZDR intact. |
| D2  | Provider steering shape                     | **`order` list of verified fast ZDR hosts + `allow_fallbacks: true` + env kill switch.** Not `sort: 'throughput'` (100% concentration on one host), not `ignore` (blocklist rots).                 | Repo precedent (`phase3Config.ts`, `openrouter-v2-service.ts`). Falls back to OpenRouter's normal ZDR routing if every preferred host is down — "reliably falls back" without ever leaving ZDR.                                                                                                           |
| D3  | Steering scope in PR 1                      | **Project Loop JSON calls only** (4 detectors + manager brief). Promote to a smart-llm per-model default in a follow-up after a week of data.                                                      | Bounded blast radius. `daily_brief_project_brief` and `project_audit_synthesis` have the same shape and would benefit, but they already degrade; they go in the follow-up.                                                                                                                                |
| D4  | Detector failure                            | **Degrade, don't fail.** Typed timeout / retryable provider error → `[]` + structured skip reason; everything else still fails the run.                                                            | Every sibling LLM consumer in the loop family already does this; the four detectors are the outlier.                                                                                                                                                                                                      |
| D5  | `skippedKinds`                              | **Required.** The degraded path writes the same "lens not checked" note the cost-cap path writes.                                                                                                  | Without it a drift timeout retires every pending drift suggestion older than 72h from the user's inbox (§4.1).                                                                                                                                                                                            |
| D6  | Degraded coverage visibility                | **User-facing.** Run summary says the lens didn't finish; the brief is told which lenses were unchecked so it never claims "tidy" for an area it didn't look at. Structured reasons stay internal. | §4.3, §4.4.                                                                                                                                                                                                                                                                                               |
| D7  | Per-call deadline                           | **Stays 120s.** Revisit only if post-deploy telemetry still shows a tail after D2.                                                                                                                 | Raising it without a run budget can exceed the 600s worker timeout (§4.6); steering should make it moot.                                                                                                                                                                                                  |
| D8  | Output budget                               | **Not in PR 1.** Measure per-detector completion tokens for a week after D2, then decide (follow-up F2).                                                                                           | Changes what users see; needs data first.                                                                                                                                                                                                                                                                 |
| D9  | Queue retry after a non-recoverable failure | **Throw `PermanentQueueError`** after `failRun` so the queue stops scheduling a retry that can only skip. Restore-to-`queued` for transient infra errors is a follow-up (F4).                      | Matches today's reality; removes the `completed`-but-`failed` contradiction.                                                                                                                                                                                                                              |
| D10 | Accepted-generation cost reconciliation     | **Follow-up (F3), scheduled daily.**                                                                                                                                                               | IDs expire within days (7 of 22 already 404). Not needed for reliability.                                                                                                                                                                                                                                 |

---

## 10. Implementation handoff (PR 1)

Scope: one PR, worker + smart-llm, no schema change, no web change. Everything below was verified against HEAD `489aff88c` on 2026-08-22; line numbers are anchors, not contracts — re-grep before editing.

### 10.1 Provider steering (D1–D3)

**Verified provider slugs** (probe: `order: [slug]`, `allow_fallbacks: false`, `zdr: true`, `response_format: json_object` — each returned from that provider):

```ts
// apps/worker/src/config/projectLoops.ts  (new export; file currently only holds PROJECT_LOOPS_ENABLED)
export const PROJECT_LOOP_JSON_PROVIDER_ORDER = [
	'novita',
	'parasail',
	'siliconflow',
	'coreweave'
] as const;
```

Measured on loop-sized outputs (≥300 tokens, 30d): Novita 92 tok/s p50 / 74 p10; Parasail 66 / 33; SiliconFlow 58 / 33; CoreWeave 52 / 23. Excluded after probing: **Venice** (rejects `response_format` when it can't fall back — `400 Invalid request param`), **AtlasCloud** (no DS-V4-Flash endpoint any more), **DigitalOcean / Phala / Morph / Mancer 2** (the timeout hosts), **DeepInfra** (fine but only 44 / 22 — leave it to the fallback pool).

**Kill switch** — mirror [`apps/web/src/lib/services/openrouter-v2-service.ts:129-145`](../../apps/web/src/lib/services/openrouter-v2-service.ts#L129): env `PRIVATE_PROJECT_LOOP_PROVIDER_ORDER` — comma-separated slugs override the constant; `off` / `none` / `default` disables steering. Resolve once in `projectLoops.ts`; add to `apps/worker/.env.example` with a one-line comment pointing at this doc.

**smart-llm change** — `getJSONResponse` currently has no way to pass provider routing; only `providerMaxPrice` reaches the `provider` object ([`smart-llm-service.ts:499-505`](../../packages/smart-llm/src/smart-llm-service.ts#L499)).

1. Add to `JSONRequestOptions` ([`packages/smart-llm/src/types.ts` ~L75-81](../../packages/smart-llm/src/types.ts#L75), next to `timeoutMs` / `signal`):
    ```ts
    /** OpenRouter provider steering. `zdr` and `data_collection` are owned by the service policy and cannot be overridden here. */
    providerRouting?: { order?: string[]; ignore?: string[]; allow_fallbacks?: boolean };
    ```
2. Thread it `performJSONGeneration` → `callChatCompletions` (params at [`:448-460`](../../packages/smart-llm/src/smart-llm-service.ts#L448)) and merge at [`:499-505`](../../packages/smart-llm/src/smart-llm-service.ts#L499) as `{ ...providerRouting, ...this.openRouterProviderPolicy, ...(max_price) }` — **policy spreads last** so a caller can never drop `zdr`/`data_collection`. Strip those two keys from `providerRouting` defensively.
3. Also thread it into the validation-retry call at [`:785`](../../packages/smart-llm/src/smart-llm-service.ts#L785) so the repair attempt is steered too.
4. Moonshot branch ([`:469-488`](../../packages/smart-llm/src/smart-llm-service.ts#L469)) ignores it — fine.

**Worker call sites** — `callGenerator` ([`generators.ts:543-566`](../../apps/worker/src/workers/project-loop/generators.ts#L543)) and `callBriefGenerator` ([`:568-596`](../../apps/worker/src/workers/project-loop/generators.ts#L568)): pass `providerRouting: { order: resolvedOrder, allow_fallbacks: true }` when the resolved order is non-empty. Log the resolved order once at worker start (next to `logQueueConfiguration()` in [`apps/worker/src/index.ts:52`](../../apps/worker/src/index.ts#L52)).

### 10.2 Typed LLM failures (§2.1, §4.5)

`packages/smart-llm/src/errors.ts`:

```ts
export class LLMRequestTimeoutError extends Error {
	override name = 'LLMRequestTimeoutError';
	constructor(
		public readonly timeoutMs: number,
		public readonly requestedModel: string,
		public openrouter?: { generationId: string | null }
	) {
		super(`LLM request timed out after ${timeoutMs}ms (${requestedModel})`);
	}
}
export class LLMRequestCancelledError extends Error {
	override name = 'LLMRequestCancelledError';
	constructor(public readonly reason: string) {
		super(`LLM request cancelled: ${reason}`);
	}
}
```

`openrouter-client.ts` catch ([`:200-216`](../../packages/smart-llm/src/openrouter-client.ts#L200)) — today it only matches `name === 'AbortError'`, which `AbortSignal.timeout()` never produces (it throws a `DOMException` named **`TimeoutError`**; verified on Node 24, same undici semantics on the worker's Node 22). Replace with:

```ts
const abortLike =
	error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
if (abortLike) {
	if (params.signal?.aborted)
		throw new LLMRequestCancelledError(reasonMessage(params.signal.reason));
	const generationId =
		(error as { openrouter?: { generationId?: string | null } }).openrouter?.generationId ??
		null; // set by the body-read enrichment at :147-156 — keep that block
	const err = new LLMRequestTimeoutError(timeoutMs, params.model, { generationId });
	(err as Error & { cause?: unknown }).cause = error;
	throw err;
}
```

Also guard the _caller-abort_ case where the abort reason is a plain `Error` (the queue aborts with `new Error('Worker timeout after …')`, [`supabaseQueue.ts:749`](../../apps/worker/src/lib/supabaseQueue.ts#L749)): with `AbortSignal.any`, `fetch` rejects with **that Error**, name `Error`. So check `params.signal?.aborted` _before_ the `abortLike` test, not only inside it.

`smart-llm-service.ts` consumers of the substring heuristic — replace all three:

| Line                                                                                                                       | Today                         | Change to                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`:1005-1009`](../../packages/smart-llm/src/smart-llm-service.ts#L1005) `shouldRetry`                                      | genId guard + retryable check | add `&& !(error instanceof LLMRequestCancelledError)`; keep the genId guard (a timeout error with a generation ID must not retry; one without — pre-header — should fail over, as today) |
| [`:1133`](../../packages/smart-llm/src/smart-llm-service.ts#L1133) `isTimeout: lastError.message.includes('timeout')`      | substring                     | `lastError instanceof LLMRequestTimeoutError`                                                                                                                                            |
| [`:1178`](../../packages/smart-llm/src/smart-llm-service.ts#L1178) `status: … includes('timeout') ? 'timeout' : 'failure'` | substring                     | same instanceof; cancelled → `'failure'` with the cancel message                                                                                                                         |
| [`:1210`](../../packages/smart-llm/src/smart-llm-service.ts#L1210) `Failed to generate valid JSON: …` wrapper              | wraps everything              | rethrow `LLMRequestTimeoutError` / `LLMRequestCancelledError` unwrapped (attach `attemptedModels` as a property); keep the wrapper for parse/empty/provider failures                     |

`errors.ts` `isRetryableOpenRouterError` ([`:98-165`](../../packages/smart-llm/src/errors.ts#L98)): add `error instanceof LLMRequestTimeoutError → true`, `LLMRequestCancelledError → false`, and add `name === 'TimeoutError'` beside the existing `AbortError` check. Export both classes from the package index.

Only one place outside smart-llm string-matches the wrapper: [`apps/web/src/lib/services/openrouter-v2-service.ts:1409`](../../apps/web/src/lib/services/openrouter-v2-service.ts#L1409) (its own message, unaffected). `apps/worker/tests/agentRunAttemptKeys.test.ts:74` uses the string as fixture data only.

### 10.3 Detector degradation + signal (D4–D6, §4.1–§4.4)

All in [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts) unless noted.

**Classifier** — new pure module `apps/worker/src/workers/project-loop/detectorFailure.ts`:

```ts
export type DetectorSkipReason = 'cost_cap' | 'provider_timeout' | 'provider_error';
export type SkippedLens = {
	label: string;
	kind: string | null;
	reason: DetectorSkipReason;
	detail?: string;
	providerRequestId?: string | null;
};
export function classifyDetectorFailure(error: unknown): DetectorSkipReason | null; // null = not recoverable
```

Recoverable = `LLMRequestTimeoutError` (→ `provider_timeout`), or an OpenRouter HTTP error with status 408/429/5xx or `isOpenRouterProviderError` (→ `provider_error`). **Never** recoverable: `LLMRequestCancelledError`, `SyntaxError`, `OpenRouterEmptyContentError`, the `Failed to generate valid JSON` wrapper (parse failures), anything without an LLM pedigree. Unit-test this module directly.

**`runGenerator`** ([`:3027-3043`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3027)) — replace `skippedGenerators: string[]` with `skippedLenses: SkippedLens[]`:

```ts
const runGenerator = async (label, generator) => {
  const kind = GENERATOR_LABEL_TO_KIND[label] ?? null;
  if (totalCost >= PROJECT_LOOP_COST_CAP_USD) { skippedLenses.push({ label, kind, reason: 'cost_cap' }); …log…; return []; }
  await heartbeat(`Generating ${label}`);
  try { return await generator(); }
  catch (error) {
    if (job.signal.aborted) throw error;                 // ownership lost — never degrade (§4.2)
    const reason = classifyDetectorFailure(error);
    if (!reason) throw error;                             // DB / invariant / parse → run fails as today
    skippedLenses.push({ label, kind, reason, detail: message, providerRequestId: (error as any)?.openrouter?.generationId ?? null });
    await job.log(`Skipping ${label}: ${reason} (${message})`);
    return [];
  }
};
```

**Keep the three downstream consumers wired** — this is the whole point of D5:

- `skippedKinds` ([`:3137-3142`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3137)) ← `skippedLenses.map(l => l.kind).filter(Boolean)` (all reasons). Consumed by `rotateUnconfirmedPendingSuggestions` at [`:715`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L715).
- Manager brief: add `uncheckedLenses: string[]` to `generateProjectManagerBrief` params ([`generators.ts:1359`](../../apps/worker/src/workers/project-loop/generators.ts#L1359)) and `buildHeuristicProjectManagerBrief` ([`:1022`](../../apps/worker/src/workers/project-loop/generators.ts#L1022)). In the LLM user prompt ([`:1394-1402`](../../apps/worker/src/workers/project-loop/generators.ts#L1394)) add a block: `Lenses NOT checked this pass (do not describe these areas as clean or unchanged): drift`. In the heuristic, when `attention_level` would be `none` and lenses were unchecked, set `no_attention_reason` to say which checks didn't finish. The cost-cap brief skip at [`:3222-3229`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3222) becomes `skippedLenses.push({ label: 'project manager brief', kind: null, reason: 'cost_cap' })`.
- Summary ([`:3272-3274`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3272)) — user-facing (it feeds the activity timeline, [`activity-timeline.service.ts:412`](../../apps/web/src/lib/server/activity-timeline.service.ts#L412)). Suggested mapping: cost*cap → keep today's sentence; provider*\* → `"The <lens> check didn't finish this pass."` with lens names `document organization / outdated documents / drift / task conflicts`. No millisecond values, no provider names.
- `captureWorkerEvent` ([`:3340`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3340)): keep `skipped_generators` (labels) for dashboard continuity and add `skipped_lenses: skippedLenses`.

**Signal threading** — add `signal?: AbortSignal` to the param types of `generateDocOrganization` / `generateOutdatedDocs` / `generateDrift` / `generateTaskConflicts` / `generateProjectManagerBrief` ([`generators.ts:1492,1581,1676,1754,1359`](../../apps/worker/src/workers/project-loop/generators.ts#L1492)) and to `callGenerator` / `callBriefGenerator`, forwarding as `getJSONResponse({ …, signal })` (already accepted: [`smart-llm-service.ts:678`](../../packages/smart-llm/src/smart-llm-service.ts#L678)). Worker passes `signal: job.signal` at the five call sites ([`:3045-3084`, `:3232`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3045)). Precedent: [`agentRunWorker.ts:1938`](../../apps/worker/src/workers/agent-run/agentRunWorker.ts#L1938).

**Outer catch** ([`:3350-3397`](../../apps/worker/src/workers/project-loop/projectLoopWorker.ts#L3350)):

```ts
} catch (error) {
  if (job.signal.aborted) { await job.log(`Project loop lost ownership: ${message}`); throw error; }  // no failRun / supersede — another execution may own the run
  …existing failRun / supersedePendingSuggestionsForFailedRun / logWorkerError…
  throw new PermanentQueueError('project_loop_run_failed', message);   // from apps/worker/src/lib/queueErrors.ts
}
```

Note the queue will then also write a `queue_job_terminal_failure` error-log row ([`supabaseQueue.ts:659-678`](../../apps/worker/src/lib/supabaseQueue.ts#L659)) — a second row per failure is acceptable; do not suppress the worker's richer one.

### 10.4 Tests (minimum, before merge)

`packages/smart-llm/src/openrouter-client.test.ts` (extend the existing `preserves the generation id when the response body is lost` at `:16`):

- body read rejects with `DOMException('…', 'TimeoutError')` + `x-generation-id` header → `LLMRequestTimeoutError` with `openrouter.generationId` set, `cause` = the DOMException.
- pre-header `TimeoutError` → `LLMRequestTimeoutError` with `generationId: null`.
- caller signal aborted with `new Error('Worker timeout …')` → `LLMRequestCancelledError`, not a timeout.

`packages/smart-llm/src/smart-llm-service.test.ts`:

- timeout with generation ID → exactly one fetch, usage row `status: 'timeout'`, `billingDisposition: 'uncertain'`, thrown error `instanceof LLMRequestTimeoutError` (not the JSON wrapper).
- timeout without generation ID → fails over to the next model (today's behaviour, now asserted).
- cancelled → no second fetch, thrown `LLMRequestCancelledError`.
- `providerRouting.order` appears in the request body's `provider` with `zdr: true` and `data_collection: 'deny'` still present even if the caller tries to pass `zdr: false`.
- existing `charges the reservation when a strict-budget response is lost` (`:931`) unchanged and green.

`apps/worker/tests/projectLoopDetectorFailure.test.ts` (new, pure): the classifier table above, including the three never-recoverable classes.

`apps/worker/tests/projectLoopDegradedRun.test.ts` (new; mock pattern from [`projectLoopCancellation.test.ts`](../../apps/worker/tests/projectLoopCancellation.test.ts)):

- drift throws `LLMRequestTimeoutError` → run `completed`, task-conflicts generator still called, suggestion insert still happens, `rotateUnconfirmedPendingSuggestions` receives `skippedKinds ⊇ {'drift'}`, brief called with `uncheckedLenses: ['drift']`, summary contains "didn't finish", no rethrow.
- drift throws a DB-shaped error → `failRun` called, thrown error `instanceof PermanentQueueError`.
- `job.signal` aborted + generator throws → no `failRun`, no supersede, no insert, error rethrown.

### 10.5 Verification after deploy

1. Worker boot log shows the resolved provider order.
2. Trigger one Project Review on a staging/demo project; confirm `llm_usage_logs.provider` for the five calls is one of the four steered hosts.
3. Inject one detector timeout (easiest: temporarily set `timeoutMs: 1` via a test-only env in `callGenerator`, or point `PRIVATE_PROJECT_LOOP_PROVIDER_ORDER` at `phala` for one run) → run ends `completed`, queue row `attempts = 1`, pending items of that kind intact, brief mentions the unchecked lens.
4. After 7 days run both telemetry scripts; success criteria: loop timeouts ≈ 0, DigitalOcean/Phala/Morph share of loop calls ≈ 0, detector p95 wall time down ≥50%, degraded-run rate tracked separately in PostHog (`skipped_lenses`).
    ```
    node apps/worker/scripts/project-loop-provider-throughput.mjs --days 7
    node apps/worker/scripts/project-loop-timeout-generations.mjs --days 7
    ```
    Both are read-only and read `apps/worker/.env`. They are the exact queries this review was built from.

### 10.6 Follow-ups (not PR 1)

- **F1 — Promote steering to a smart-llm per-model default** (`DEFAULT_PROVIDER_ORDER_BY_MODEL`-style table keyed by model, same kill switch) so `daily_brief_project_brief`, `project_audit_synthesis`, and braindump JSON calls benefit. Re-validate the slug list first with the probe pattern in §10.1; provider landscapes drift monthly (the web's July list already reflects a different one).
- **F2 — Output budget experiment** (D8): per-detector completion-token distributions for a week post-D2; then either prompt-level item caps ("at most 5") or `maxTokens: 4096` + `allowTruncatedJsonRecovery`, measured for suggestion-envelope completeness.
- **F3 — Scheduled accepted-generation reconciliation** (D10): generalize [`lookupOpenRouterGenerationCost`](../../apps/worker/src/workers/agent-run/agentRunCostReconciler.ts#L113) into `packages/smart-llm`; select `llm_usage_logs` where `metadata->>billingDisposition = 'uncertain'` and a generation ID exists; daily on the scheduler; also fold the timed-out call's reconciled cost into the run's `cost_usd` (§2.3).
- **F4 — Restore-to-`queued` for transient infra failures** before any durable child output, with the "every scheduled retry has a claimable domain state" regression test.
- **F5 — Deadline revisit** only if telemetry after F1/F2 still shows a tail; must come with a run-level budget (§4.6).

---

## 11. Implementation and verification result (2026-08-23)

### 11.1 Implemented scope

PR 1 is complete on the local implementation tree:

- Project Loop JSON calls use the fast-provider order with `allow_fallbacks: true`, retain the immutable ZDR/data-collection policy, and support the documented environment kill switch.
- SmartLLM exposes typed timeout and caller-cancellation errors, preserves accepted generation IDs, avoids retrying paid accepted generations, and applies provider steering to validation-repair calls.
- Each detector degrades only for the narrow typed timeout/transient-provider set. Database, invariant, parse, empty-content, authentication, and ownership-cancellation failures remain terminal.
- Degraded detector kinds feed rotation protection, partial coverage reaches both manager synthesis paths, and the user-facing run summary does not claim an unchecked lens is clean.
- Caller cancellation is checked at detector, persistence, rotation, synthesis, and terminal-write boundaries. Lost ownership does not trigger failure/supersede/terminal writes.
- Non-recoverable runs are marked failed and throw `PermanentQueueError`, preventing an unclaimable queue retry.

The second-pass review also fixed three coupled edge cases beyond the original minimum handoff:

1. A validation-repair timeout now records the repair model and accepted generation ID instead of attributing the failure to the preceding malformed response.
2. That preceding response's usage can no longer mark the repair timeout as settled. The terminal attempt records zero unverified tokens and `billingDisposition: 'uncertain'`, so the follow-up reconciler can find it.
3. Ownership loss is detected even when a detector or manager call resolves normally after its signal was aborted, not only when the call throws.

### 11.2 Focused acceptance battery

Run on 2026-08-23 against the final implementation tree:

| Scope                                                                                                                    | Command                                                                                                                                                                                                 | Result                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SmartLLM typed errors, OpenRouter timeout/cancellation semantics, JSON recovery, provider policy, and repair attribution | `pnpm --filter @buildos/smart-llm exec vitest run src/errors.test.ts src/openrouter-client.test.ts src/smart-llm-service.test.ts`                                                                       | **3 files passed; 38 tests passed** |
| Project Loop classifier, degraded-run integration, generator routing/coverage, and stall/terminal behavior               | `pnpm --filter @buildos/worker exec vitest run tests/projectLoopDetectorFailure.test.ts tests/projectLoopDegradedRun.test.ts tests/projectLoopGenerators.test.ts tests/projectLoopStallReclaim.test.ts` | **4 files passed; 38 tests passed** |

The focused battery explicitly verifies:

- drift typed-timeout → later conflict detector still runs, old drift findings are not rotated out, partial coverage reaches the brief and summary, and the run completes without a retry;
- database-shaped detector failure → failed run plus `PermanentQueueError`;
- ownership abort while a detector throws → no later detector, insert, or terminal write;
- ownership abort while a detector resolves normally → no later detector, insert, or terminal write;
- ownership abort while manager synthesis resolves normally → no run finalization, inbox sync, or generated-event telemetry;
- accepted validation-repair timeout → correct repair model/generation, `timeout` status, zero unverified terminal tokens, and `uncertain` billing.

### 11.3 Full regression and static verification

| Check                                                             | Result                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@buildos/smart-llm` full tests                                   | **9 files passed; 84 tests passed**                                          |
| `@buildos/worker` full tests                                      | **124 files passed, 1 intentionally skipped; 1,150 tests passed, 1 skipped** |
| SmartLLM and worker typechecks                                    | **Passed**                                                                   |
| SmartLLM and worker production builds                             | **Passed**                                                                   |
| Worker lint and HTTP module-size guard                            | **Passed with 0 errors; existing warning baseline only**                     |
| Focused Prettier check and staged/unstaged diff whitespace checks | **Passed**                                                                   |

### 11.4 Remaining gates

- [x] PR 1 implementation complete.
- [x] Minimum before-merge tests complete.
- [x] Full package tests, typechecks, builds, lint, formatting, and diff checks complete.
- [ ] Deploy to staging/production.
- [ ] Run the §10.5 injected-timeout smoke against a deployed worker.
- [ ] Run the two read-only telemetry reports after seven days and compare against the §10.5 success criteria.

**Current disposition:** ready for code review/merge and then the deployment smoke. Do not mark the incident fully closed until the deployed smoke and seven-day telemetry gates pass.

---

## 12. Post-implementation review (2026-08-23, independent)

Commit `00c65a509` re-read against §10; all gates re-run locally, not taken from §11: smart-llm 84/84, worker full suite 1,150/1,150 (1 skipped, pre-existing), typecheck clean on smart-llm, worker **and web** (web consumes smart-llm; §11 did not run it).

**Verdict: done well — one regression and two minor follow-ups found; all three fixed (§12.5). Nothing outstanding in code; remaining gates are deploy-time.**

What landed correctly, checked line by line: provider order + kill switch + boot log; `providerRouting` reaches both the primary and the validation-repair call with `zdr`/`data_collection` un-overridable (tested at `smart-llm-service.test.ts:727-787`); typed `LLMRequestTimeoutError` / `LLMRequestCancelledError` with generation ID preserved and the dead `AbortError` branch replaced; caller-abort checked before `error.name`; detector classifier narrow and unit-tested (12 cases); `skippedLenses` feeds `skippedKinds` (rotation), `uncheckedLenses` (both brief paths), and a user-facing summary; ownership checks before every durable write; `PermanentQueueError` on non-recoverable failures. The implementer also caught two real edge cases beyond the handoff (repair-call timeout attribution; ownership loss on a _resolved_ call) — both sound.

### 12.1 Regression — text-generation timeouts are now logged as `failure` (fix before deploy)

`performTextGeneration` (`smart-llm-service.ts:1340`) goes through the same `callChatCompletions` → `callOpenRouter` path, so it now receives `LLMRequestTimeoutError`, whose message is `LLM request timed out after …`. Its two classification sites were not updated and still substring-match `'timeout'`:

- [`smart-llm-service.ts:1592`](../../packages/smart-llm/src/smart-llm-service.ts#L1592) `isTimeout: (error as Error).message.includes('timeout')`
- [`smart-llm-service.ts:1627`](../../packages/smart-llm/src/smart-llm-service.ts#L1627) `status: (error as Error).message.includes('timeout') ? 'timeout' : 'failure'`

Before this change the raw undici message (`…aborted due to timeout`) matched; now `timed out` does not. Every `generateText` timeout (daily-brief executive summary / analysis, SMS generator, etc.) will be recorded as `status: 'failure'`, which silently breaks the §10.5 telemetry and the `project-loop-provider-throughput.mjs` timeout counts for any text-profile caller. **Fix:** both sites → `error instanceof LLMRequestTimeoutError`. Add one test: text-path body-read `TimeoutError` → usage row `status: 'timeout'`. The streaming path (`:2342`) uses its own `fetchImpl` and still sees the raw DOMException — unchanged, leave it.

Same family, lower priority: [`moonshot-client.ts:160`](../../packages/smart-llm/src/moonshot-client.ts#L160) still throws a plain `Error('Request timeout for model …')`, so Kimi-direct timeouts (only when `PRIVATE_MOONSHOT_ROUTE_KIMI_DIRECT=true`) now log as `failure` in the JSON path. Throw `LLMRequestTimeoutError` there too.

### 12.2 Minor — error-log volume per timeout went up, including for runs that now succeed

The client-level `errorLogger.logAPIError(… 'callOpenRouter_timeout' …)` was dead code before (never matched `TimeoutError`) and now fires. A single detector timeout therefore writes **three** `error_logs` rows (client, service outer catch, and — only if the run fails — the worker run-level row). For a _degraded-but-completed_ run that is two error-severity rows for a run the user sees as successful. Recommend deleting the client-level call (the service-level row carries strictly more context: profile, attempts, models, generation ID) or downgrading it to a warning. Not a correctness issue.

### 12.3 Minor — two worker substring classifiers no longer match the new message

[`apps/worker/src/lib/errorLogger.ts:112`](../../apps/worker/src/lib/errorLogger.ts#L112) (`inferErrorType` → `api_error`) and [`apps/worker/src/lib/progressTracker.ts:266`](../../apps/worker/src/lib/progressTracker.ts#L266) (`isTemporaryError`) match `'timeout'` but not `'timed out'`. Effects are cosmetic (`error_type: 'unknown'` when a caller does not pass one; one retry heuristic) — add `'timed out'` alongside when touching those files. Web-side consumers (`execution-runner.ts`, `llm-pass-runner.ts`) already match both forms.

### 12.4 Housekeeping

Commit `00c65a509` also carries unrelated agentic-chat work (`readOnlyProvider.ts` +295, `agenticChatReadOnlyProvider.test.ts` +665 — semantic reviewer wiring). It is not part of this change and was not reviewed here; it rode along because everything was committed as one `updates`. Worth knowing when bisecting.

### 12.5 Updated gates

- [x] PR 1 implemented and independently verified (tests, typecheck incl. web).
- [x] **§12.1 fixed 2026-08-23** (committed in `5e2ad1bda`): `performTextGeneration` now classifies on `instanceof LLMRequestTimeoutError` at both sites; `moonshot-client.ts` throws the same typed error (and now matches `TimeoutError`, the name `AbortSignal.timeout()` actually produces); regression test `records a text-path accepted timeout with status timeout, not failure` added to `smart-llm-service.test.ts`.
- [x] **§12.2 fixed 2026-08-24** (uncommitted): client-level timeout `logAPIError` removed from `openrouter-client.ts` and `moonshot-client.ts`. Justification confirmed three ways before removing — (a) prod has **0** `callOpenRouter_timeout` rows in 30 days, i.e. the branch was dead before §12.1 activated it, so removal restores the pre-change baseline exactly; (b) `callOpenRouter` has exactly one caller (`callChatCompletions`) and all three of its callers end in a service-level catch that logs terminal failures with strictly more context; (c) the only external constructor (`questionTreeModelAdapter.ts:169`) passes no `errorLogger`, so nothing loses telemetry. It also restored the repo's own convention — logging at that layer creates actionable incidents for requests that later recover via model failover, the same reason the parse-retry path defers to its outer catch. Net effect: a degraded-but-completed Project Loop run now writes **one** error row, not two. The `errorLogger` constructor option is retained (exported API; other error paths in those clients still log nothing) and annotated.
- [x] **§12.3 fixed 2026-08-24** (uncommitted): `'timed out'` added alongside `'timeout'` in `errorLogger.ts` `inferErrorType` and `progressTracker.ts` `isTemporaryError`.
- [ ] Deploy; run the §10.5 injected-timeout smoke; seven-day telemetry check.
