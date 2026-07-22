<!-- apps/web/docs/technical/audits/DEEP_RESEARCH_V01_AUDIT_2026-07-20.md -->

# Deep Research V0.1 — Implementation & Plan Audit

**Date:** 2026-07-20 (updated 2026-07-22)
**Scope:** `DEEP_RESEARCH_ARCHITECTURE_2026-07-19.md`, tasker/29–33, and the implementation
committed across `d78acab2..7444fdc3` (~21k lines: 5 migrations, orchestrator, cost ledger,
reconciler, web dispatch, safe-fetch, tests).
**Method:** four parallel adversarial code reviews (migrations/DB, orchestrator state machine,
cost ledger + smart-llm spend path, web dispatch + SSRF), a full test-suite verification run, and
live production probes of the RPC privilege surface. The migrations reviewer stood up a scratch
PostgreSQL 16, applied the real migrations, and reproduced every `[verified]` finding live.

## Live $2 bake-off + smoke (2026-07-20 evening)

Ran four real deep-research runs against production Supabase using a **local scoped worker** built
from HEAD + the uncommitted fix waves (Railway paused to avoid a claim race; worker registered
`agent_run` only). Two questions × two modes; each capped at `$0.50`. **Total actual spend: $0.23.**

| Run                     | Result        | Cost   | Tokens | Time | Ledger rows | Note                                                            |
| ----------------------- | ------------- | ------ | ------ | ---- | ----------- | --------------------------------------------------------------- |
| Q1 fan-out (2 children) | partial       | $0.015 | 28.7k  | 62s  | 0           | children hit Exa 429 / Brave 404 and gave up                    |
| Q1 single deep run      | **completed** | $0.073 | 64.0k  | 148s | 0           | all pricing cited; **adapted** — pulled Exa via Wayback Machine |
| Q2 fan-out              | partial       | $0.062 | 72.8k  | —    | 2           | planner + synthesis both 404'd on `max_price`                   |
| Q2 single deep run      | partial       | $0.077 | 84.6k  | 299s | 0           | exhausted the 12-tool-call budget before finishing              |

### Findings (from live evidence, not code inference)

1. **Cost is a non-issue.** Four full runs = 23 cents. The `$0.50`/run budget is 3–30× over
   the actual `$0.015–0.077` spend. Budget is not the binding constraint; reliability and source
   reachability are.
2. **Single deep run > 2-child fan-out (early signal).** Only 1 of 4 runs `completed`, and it was
   a single deep run. Fan-out went `partial` every time. On Q1 the single agent kept one context
   and _pivoted_ (Wayback when Exa 429'd); the two children each got a narrow slice, hit a wall,
   and quit at confidence 0.35. Parallelism did not buy quality here and added a fragile synthesis
   hop. This is the first tasker/33 WP-4 data point: **fan-out does not yet earn its complexity at
   a `$0.50` ceiling.**
3. **BLOCKER — `max_price` breaks the powerful lane.** Q2 fan-out's ledger shows the reserve→settle
   lifecycle working correctly (planner + synthesis both reserved on `z-ai/glm-5.2`, then settled
   `reconciliation_required` on failure), but **both powerful-lane calls failed with OpenRouter
   `404 — No endpoints found that satisfy the max price`.** `planJSONRequestSpend`
   (`packages/smart-llm/src/spend-guard.ts`) sets `max_price` to the model's **catalog** rate, which
   for `z-ai/glm-5.2` is below its real OpenRouter endpoint price, so every endpoint is rejected.
   Planner and synthesis both run on the powerful lane, so **every fan-out run's synthesis fails**.
4. **Silent degradation hides it.** Two distinct failure modes both collapse to `partial` with no
   surfaced reason: (a) `planJSONRequestSpend` _throws_ `LLMSpendLimitError` when a stage budget
   can't fit a priced model — uncaught at `smart-llm-service.ts:580`, then swallowed by the
   orchestrator planner/synthesis `catch` into `fallbackWorkstreams`/`aggregateWithoutSynthesis`;
   (b) the `max_price` 404 is likewise swallowed. This is why Q1 fan-out (throw path, 0 ledger rows)
   and Q2 fan-out (plan-built-then-404, 2 rows) present identically as `partial`.
5. **Ledger coverage is partial live.** Only the coordinator's planner/synthesis ever reserved, and
   only when the plan built. **Child and single-run turn calls produced zero ledger rows** in every
   run despite carrying budgets and the per-call `$0.04` cap wiring — so the tasker/31 WP-2 goal
   ("one reserved→settled lifecycle per paid call") is NOT met live. Needs a focused code pass to
   determine whether child budgets reach the DB row / whether the `$0.04` per-call cap + large
   accumulated child prompts push `planJSONRequestSpend` into a throw. (A parallel diagnosis pass
   attributed the zero-ledger symptom to a Railway deploy-lag; that is a valid _separate_
   operational check but does NOT explain this bake-off, which ran on a local HEAD worker.)

### Fix list (ordered) — status 2026-07-21

- ✅ **(1) `max_price` calibration — FIXED.** Direct OpenRouter probe confirmed `z-ai/glm-5.2`'s
  real price is ~1.5× its catalog rate; `max_price` was set to the raw catalog rate (zero headroom),
  so every endpoint was rejected. Fix (`packages/smart-llm/src/spend-guard.ts`): `max_price` now uses
  the reservation's safety multiplier (raised 1.25→2.0), so accepted endpoints keep actual ≤ reserved.
  Verified live that 2× clears the 404. Test added.
- ✅ **(2) Loud failures — FIXED.** `deepResearchOrchestrator.ts` planner/synthesis catches now emit
  categorized `planner_failed`/`synthesis_failed` narrations (`reservation_infeasible` /
  `provider_price_rejected` / `model_error`) and rethrow genuine ledger errors. Test added.
- ✅ **(3) Child/single-run ledger gap — FIXED (real bug found).** Root cause: `agentRunWorker.ts`
  `parseBudgets` used strict `typeof === 'number'`, but Supabase returns JSONB `max_cost_usd` as a
  numeric **string** (`"0.156"`) for child runs → `undefined` budget → unreserved paid calls. The
  coordinator was immune because its root budget defaults to `0.5`. Fix: coerce numeric strings AND
  fail closed (`cost_budget_required`) when no numeric budget resolves. (`planJSONRequestSpend` was
  exonerated — it never throws for the cheap child lane.)
- ✅ **(4) Live-wiring smoke — ADDED.** New `apps/worker/tests/integration/agentRunCostWiring.test.ts`
  drives the full deployed path (getJSONResponse → onSpendReservation → real `reserve_agent_run_cost`
  RPC) and asserts a durable `agent_run_cost_entries` row is written; plus a unit repro. Both fail on
  pre-fix code.
- ⏳ **(5) Operational** — still open: confirm the Railway worker image is ≥ `7444fdc3`.

Verification after fixes: worker 454 unit + 31 integration, smart-llm 66, shared-agent-ops 27,
typechecks + lint clean. **At this 2026-07-21 checkpoint, a re-run was still needed**; its result and
the next remediation wave are recorded below.

## Second capped smoke (2026-07-22)

The same four cases were rerun after the 2026-07-21 fix wave, again through the scoped local worker
with Railway paused. The session stayed comfortably inside its guard: **`$0.17764437` known actual
spend; `$0.21764436` conservative exposure** including one unresolved `$0.04` reservation.

| Run                     | Result  | Conservative cost | Tokens | Tool calls | Live outcome                                                      |
| ----------------------- | ------- | ----------------: | -----: | ---------: | ----------------------------------------------------------------- |
| Q1 fan-out (2 children) | partial |     `$0.06018084` | 49,707 |          7 | both children reached the token target before evidence submission |
| Q1 single deep run      | failed  |     `$0.07952669` | 43,162 |          2 | primary route returned ZDR/no-endpoint 404                        |
| Q2 fan-out (2 children) | partial |      `$0.0770357` | 54,025 |          7 | both children reached the token target before evidence submission |
| Q2 single deep run      | failed  |     `$0.00090113` |    916 |          0 | OpenRouter returned `200` with null content                       |

### What the rerun proved

1. **Paid-attempt coverage is now complete.** The batch created 35 ledger rows; 34 settled. Root,
   child, and paid-search attempts were represented, closing the first smoke's wiring gap.
2. **The remaining unresolved row was false-conservative, not a missing charge.** The Q1 single
   primary call was rejected before generation with a 404 and no generation id, but the worker kept
   the full `$0.04` reservation as `reconciliation_required`.
3. **The typed evidence gate failed safely.** No fan-out child supplied an unvalidated prose packet.
   Both fan-out roots returned partial because all four children exhausted their 20,000-token target
   before `submit_result`; this is correct integrity behavior but unusable product behavior.
4. **Provider failure handling was too brittle.** A definitive route rejection and a null-content
   success each ended a single run instead of taking one bounded alternative route.
5. **Queue ownership needed a heartbeat.** One slow provider call crossed the 120-second stalled-job
   threshold and was reclaimed while its original worker was still executing.
6. **Successful-tool telemetry could still be lost.** One successful web visit failed the Supabase
   insert with `Empty or invalid json`. The exact offending scalar was not retained, so a NUL or
   another JSON-hostile value is a hypothesis, not a proven root cause.
7. **There is still no valid fan-out-vs-single quality result.** The modes failed for different
   runtime/provider reasons. The first smoke's apparent single-run win must remain provisional.

### Local remediation after the rerun (2026-07-22)

- Deep-research child `max_tokens=20,000` is now a target with a modest 22,000 hard ceiling. The
  worker projects one more research turn plus a compact final evidence turn and forces submission
  while that final turn still fits. Normal research output is capped at 2,048 tokens and final
  evidence output at 4,096.
- Finalization replays bounded, durably recorded observations rather than every large tool response.
  Successful tool output is normalized to PostgreSQL-safe JSON before persistence, and evidence
  provenance is derived from exactly that persisted value. A failed insert makes the result
  explicitly non-citable.
- Deep/evidence runs may make at most one caller-level provider fallback for empty content,
  transient failure, or model unavailability. It has a distinct attempt key and a fresh durable
  reservation; this does not weaken SmartLLM's no-unreserved-retry rule.
- Definitive pre-generation 404/410 route rejection without a generation id now releases its
  reservation. Timeouts, 5xx responses, missing usage, and accepted/lost responses remain
  `reconciliation_required`.
- The shared queue heartbeats processing jobs at one-third of the stalled timeout, bounded to
  5–60 seconds, and fences the update by the exact processing token.

Verification after the final local remediation: worker **502/502**, SmartLLM **68/68**, shared
agent ops **27/27**, disposable-PostgreSQL deep-research integration **31/31**, worker + SmartLLM
builds/typechecks, worker lint with zero errors, and `git diff --check`.

## Third capped remediation smoke (2026-07-22)

### Environment correction

The first Q2 attempt in this wave exposed an operational mistake in the smoke setup: the local
dispatch server had been started through repo-wide Turbo `pnpm dev`, which also launched the normal
worker. That full worker raced the scoped worker and claimed coordinator/single jobs with a stale
module instance. Those hybrid artifacts were preserved under `*-competing-worker` labels and are
not used as the final comparison. The environment was corrected to:

- `pnpm --filter @buildos/web dev` (web only);
- exactly one `bakeoffAgentRunWorker.ts` process;
- zero `tsx watch src/index.ts` full workers;
- Railway still paused and health-confirmed by its edge 404.

The runbook now makes this process audit explicit.

### Clean final batch

| Run        | Result    |           Cost | Tokens | Tool calls | End-to-end | Quality outcome                                     |
| ---------- | --------- | -------------: | -----: | ---------: | ---------: | --------------------------------------------------- |
| Q1 fan-out | partial   | `$0.073876935` | 35,924 |          8 |      ~112s | typed child packets; synthesis returned `...`       |
| Q1 single  | completed | `$0.060169079` | 52,976 |          5 |       ~92s | polished, but cites search candidates never visited |
| Q2 fan-out | partial   | `$0.071425954` | 39,912 |          8 |      ~275s | cautious sourced report; incomplete packet coverage |
| Q2 single  | completed | `$0.062322631` | 54,560 |          6 |      ~122s | falsely says OpenRouter `max_price` is unavailable  |

Clean-batch exposure was **`$0.267794599`**. Its **55** paid rows were all terminal: **50 settled,
5 released, 0 unresolved**. The complete session retained every diagnostic/retry run in its budget
set and closed at **`$1.0041 / $2`**.

### What passed

1. Children completed their evidence turn below the 20,000-token target and 22,000 hard ceiling.
   Direct deep runs stayed below their 62,500 hard ceiling.
2. Typed packets were produced live. Invalid/incomplete packets downgraded child/root completion
   instead of leaking unvalidated prose.
3. Every clean-batch paid attempt reached `settled` or `released`; definitive pre-generation ZDR
   route 404s released before the separately reserved fallback.
4. Calls lasting longer than the old 120-second reclaim threshold stayed owned; no duplicate paid
   attempt appeared.
5. The OpenRouter limits visit followed its 308 redirect and returned the large destination page;
   the previous per-hop dispatcher-close hang is gone.

### What failed the quality gate

1. **Root synthesis accepted placeholder content.** Q1 fan-out persisted `answer: "..."`,
   `summary: "..."`, and `open_questions: ["..."]`. Local remediation now requires a substantive
   report body and returns the typed evidence-only fallback plus `synthesis_invalid` narration.
2. **Direct single is not provenance-bound.** Q1 visited only Tavily and Exa pricing pages but cited
   Brave and several third-party candidate URLs from search results. Q2 visited the limits and
   parameters pages but cited authentication/management/FAQ candidates it never opened.
3. **Completion did not imply correctness.** Q2 single confidently concluded that OpenRouter has no
   `max_price`; the runtime's live probe and production request path already prove that provider
   routing control exists. Q2 fan-out was more cautious but also failed to find it.
4. **The head-to-head has no winner.** Single was cheaper and more complete, but not trustworthy;
   fan-out was provenance-constrained, but incomplete and synthesis-fragile. Runtime readiness and
   research quality are separate gates.

### Additional defects fixed during recovery

- `safe-fetch.ts` awaited `dispatcher.close()` before consuming a redirect response; a 308 with a
  large unread body could hang indefinitely. Per-hop cleanup now uses `destroy()`. The exact
  OpenRouter limits URL went from an outer 20-second timeout to a 692,346-byte response in 442ms.
- A queue retry could reclaim a job at attempt 1 while the Agent Run row still said `running`, then
  skip it and complete the queue job. Genuine retry ordinals can now reclaim `running`, and resume
  reconstructs observed tokens, uncertain exposure, cost breakdown, and Tavily credits from the
  durable ledger.
- Budget/cancel fallbacks no longer publish the last raw tool transcript as the user-facing answer;
  research fallbacks list only durably visited URLs.

### Revised next step

Do **not** run another ad-hoc four-case batch. Build task-33 WP-1/WP-2 first: a versioned corpus,
visited-source citation scoring for both modes, known-fact coverage checks, and a pinned model route.
Then rerun the architecture comparison. In parallel, deploy the safety/runtime fixes and finish
task-31 operational proof; report persistence and chat UX remain gated on the quality result.

1. **Fix `max_price` calibration (P0, unblocks fan-out).** Either add headroom to the guard's
   `providerMaxPrice` (e.g. `catalog_rate × 1.5–2`, keeping a real ceiling while tolerating provider
   price spread) or update the powerful-lane catalog prices to current OpenRouter endpoint prices.
   Re-run the smoke and confirm synthesis completes. Note this also informs the audit's open
   question — **pin a specific model for research** rather than routing the powerful lane, for
   reproducibility and a known price.
2. **Make reservation-infeasible loud, not silent (P0).** Catch `LLMSpendLimitError` distinctly in
   the orchestrator planner/synthesis handlers and emit a `reservation_infeasible` signal +
   terminal reason instead of a generic `partial`; surface the `max_price` 404 as a distinct
   failure too.
3. **Close the child/single-run ledger gap (P1).** Determine why child + single-run turn calls
   reserve nothing and fix so budget enforcement actually covers them.
4. **Add a live-wiring smoke to CI/boot (P1).** A budgeted `getJSONResponse` against the live
   `MODEL_CATALOG` must insert an `agent_run_cost_entries` row — the 24 disposable-Postgres tests
   pass but never exercised the deployed worker path.
5. **Operational (P1):** confirm the Railway worker image is ≥ `7444fdc3` and all cost migrations
   applied before relying on production deep research.

The state machine, DB triggers, synthesis wakeup, honest partial-on-failure, and evidence quality
all worked well end-to-end; the blockers are the `max_price` miscalibration and the silent
degradation that hid it.

## Remediation status (updated 2026-07-20, same day)

Fix waves executed after this audit:

- **Deployed to production** — `20260720010000_deep_research_hardening.sql`: revokes
  `queue_deep_research_synthesis` from anon/authenticated (blocker 2, re-probed live → 42501);
  fails the synthesis stage-guard closed + writes the checkpoint (blocker 5); rounds ledger
  idempotency comparisons to column scale (blocker 6); preserves recorded overrun actuals; FK
  `ON DELETE RESTRICT` (blocker 9); removes both reproduced lock-order deadlocks (blocker 11).
  Also confirmed live that `20260719050000` **was already deployed** (correcting the docs).
- **Worker liveness one-liners** — empty `orchestration_state` on a running coordinator is treated
  as `planning` (un-strands the pre-checkpoint crash); `finalize()` throws on a failed terminal
  update so the job retries instead of stranding.
- **Cost bridge (Wave 1)** — `usage: {include: true}` on OpenRouter requests; 200-with-missing-usage
  on a budgeted call settles `reconciliation_required` not `$0`; settled Tavily charges write
  `llm_usage_logs` (`agent_run_web_search`). (Corrects strategic finding 3.)
- **Web security (Wave 3)** — API budget clamps + default standard-run cost ceiling (blocker 8);
  synthesis-prompt untrusted-evidence fencing; transcript cap 10k→12.5k. DNS-rebind pinning
  (blocker 3), canonical-URL cache keying (blocker 4), and the quadratic HTML-strip fix are in the
  same wave.
- **Liveness sweep (Wave 4)** — a scheduled stranded-run reconciler (blocker 1 P0) plus retry
  attempt-key ordinals so a job retry no longer self-kills.
- **CI** — the 24-case disposable-Postgres integration suite is now wired into `ci.yml` (blocker 10),
  with fixture fidelity fixes (Supabase default-privilege tripwire, prod dedup semantics, prod FK).

Updated 2026-07-22: two live provider batches have now run under the scoped-worker procedure. A
**passing** smoke and a fair fan-out-vs-single bakeoff remain open after the latest local remediation.
Strategic items (per-user daily quota before the chat tool, report persistence) remain sequenced as
below.

## Verdict

The architecture direction is right and the engineering quality is genuinely high — but the
release-blocker list in the docs is wrong in both directions. The documented blocker (RPC
privilege hardening) is **already deployed and verified closed**, while the real blockers are
undocumented: a stranded-run liveness cluster that can permanently lock a user out of all agent
runs, one SECURITY DEFINER function the hardening migration missed (verified anon-callable in
production), a DNS-rebinding SSRF bypass, and a cross-user web-visit cache-poisoning vector.

Strategically, the effort is inverted: ~21k lines of control/cost plane, zero evidence yet that
the research output is good. The plan's own open question — whether 2 fan-out children beat a
single deep run at a $0.50 budget — should be answered _before_ more orchestration hardening.

## Verified state (live probes + test runs, 2026-07-20)

- **All suites green:** worker unit 83/83 (9 files), disposable-Postgres integration 17/17,
  smart-llm 62/62, web dispatch budget 4/4, shared-types validation 5/5, worker typecheck clean.
  The doc's "44 worker tests" figure is stale (suite grew).
- **`20260719050000_agent_run_cost_rpc_privileges.sql` IS deployed to production**, contrary to
  the architecture doc and tasker/29+31. Anon probes: `reserve_agent_run_cost` → 42501,
  `claim_agent_run_cost_reconciliation` → 42501, `agent_run_cost_entries` read → 42501.
  Service role: claim RPC reaches validation, table read 200. Docs must be corrected; the
  "deploy migration 5" blocker is done.
- **`queue_deep_research_synthesis(p_parent_run_id)` is anon-callable in production** (HTTP 200
  with an anon key). The 050000 migration revokes the five cost RPCs but omits this function
  (`20260719020000:354-355` only revokes PUBLIC). Verified live. See P1-DB-1.

---

## Blockers before any rollout (ranked)

### 1. Stranded-run liveness cluster — P0 (orchestrator)

Worker death mid-child (deploy, OOM; graceful drain is only 25s vs 5-min child runtime) leaves
the child `running` forever: `isClaimableStatus` (`agentRunWorker.ts:153-171`) never re-claims a
`running` child, and the stall-reclaimed redelivery returns `status:'skipped'` **completing the
queue job permanently** (`agentRunWorker.ts:686-694`). The synthesis trigger then never fires,
the root stays `running` at `researching`, and the capacity trigger
(`20260719020000:183-258`) **rejects every future agent run for that user**. User cancel cannot
rescue it — cancel only inserts a signal, and signals are only drained by claimed jobs. Only
operator SQL recovers. Related stranding paths:

- Crash between coordinator claim and first checkpoint: `orchestration_state={}` parses to null
  → redelivery skips → stranded root (`agentRunWorker.ts:696-706`,
  `deepResearchOrchestrator.ts:195-217`). One-line fix: treat empty state on a running
  coordinator as `planning`.
- `finalize()` never checks the terminal-status update error (`agentRunWorker.ts:986-996`) — a
  transient DB error leaves the run `running` while the job completes.
- Child/synthesis queue job exhausting `max_attempts` (3) with the run row still `running`.

**Fix:** the tasker/31 WP-3 stranded-run reconciliation sweep must be pulled forward to _before_
rollout, not after. It also subsumes the two app-level `queueParent` backstops (one of which can
kill a healthy run — see P2 list) and simplifies the wake-path story from three mechanisms to
two.

### 2. `queue_deep_research_synthesis` privilege gap — P1, verified live (DB)

Any anon/authenticated PostgREST caller can invoke this SECURITY DEFINER function against
arbitrary run UUIDs. Internal guards bound the damage (requires running deep-research root,
stage `researching`, two settled children), but it takes `FOR UPDATE` locks on other users' rows
and can insert `queue_jobs` — and it compounds with the fail-open stage guard (blocker 5).
One-line follow-up migration. Also verified: `CREATE OR REPLACE` does _not_ re-grant, so the
050000 revokes are durable for the functions it covers.

### 3. DNS-rebinding TOCTOU in shared `safe-fetch` — P1 (web/worker)

`packages/shared-agent-ops/src/web/safe-fetch.ts:182-188` resolves + vets the hostname, then
`:263` calls `fetch()` which does its **own second DNS resolution**. A TTL≈0 attacker domain
answers public for the check and `127.0.0.1`/`10.x` for the fetch — bypassing every IP check,
per redirect hop. Research children visit attacker-influenceable URLs by design; the worker's
localhost Express API and Railway-private services are reachable. Fix: pin the connection to
the vetted address (undici `Agent` with custom `connect.lookup`). The IP blocklists themselves
are excellent (hex/dotted v4-mapped v6, CGNAT, ULA, fail-closed parsing — experimentally
verified), which makes this the one hole in an otherwise strong fence. `safe-fetch.test.ts` has
only 3 tests; add rebinding/redirect-hop coverage.

### 4. Cross-user web-visit cache poisoning via `<link rel=canonical>` — P1 (web)

`external-executor.ts:467-468` persists visits keyed by the **page's own** canonical URL with no
same-origin check (`webvisit/parser.ts:383-393`); `web_page_visits` is a global cache with no
`user_id`. Any user (or injected model) visiting `evil.com/x` that declares
`<link rel="canonical" href="https://www.nytimes.com/article">` poisons that URL for **every**
user's later `web_visit`. Fix: honor canonical only on the same registrable domain as
`final_url`, or key strictly by `final_url`.

### 5. Fail-open synthesis guard + unrepairable stage — P1, verified (DB)

`20260719020000:285`: with `stage` absent from `orchestration_state`, the NULL comparison makes
the early-return _not_ fire (three-valued logic inverts fail-closed to fail-open), and
`jsonb_set(..., create_missing => FALSE)` at :318-324 silently never writes the checkpoint.
Reproduced: a root with `{}` state + two settled children enqueues synthesis on every wake;
production `add_queue_job` dedup only spans `pending`/`processing`, so once the first synthesis
job completes, the next wake enqueues **another**. Fix: `IS DISTINCT FROM` semantics +
`create_missing => TRUE`, and add stage shape to the root CHECK.

### 6. Ledger idempotency broken by NUMERIC rounding — P1, independently found twice, verified (DB + cost)

`20260719030000:222` compares the 8-dp-rounded stored `reserved_cost_usd` against the unrounded
retry parameter; token-level pricing routinely carries >8-dp float noise, so a byte-identical
retried reservation raises `AGENT_RUN_COST_IDEMPOTENCY_CONFLICT` instead of returning
`idempotent: TRUE`. Same class in settle (:401-419) and reconcile replay. Fail-closed, but the
"duplicate equal calls OK" guarantee is false. Fix: round parameters to column scale before
comparing.

### 7. Same-job retry kills the run instead of adopting prior exposure — P1 (cost + orchestrator)

Every reservation passes `requireNewAttempt: true`; queue retries reuse the same `job.id` →
same attempt key → `duplicate_attempt` → planning rethrows → `finalize('failed')`
(`agentRunWorker.ts:1206,1223-1231`, `deepResearchOrchestrator.ts:803`). The doc's "retry
inspects existing exposure instead of paying for a duplicate" is **not implemented** — retry is
simply refused, the run dies, and the orphan reservation becomes permanent operator-needed
exposure. Synthesis-stage crash degrades to `partial` (paid synthesis output discarded). Fix:
an adoption path (`requireNewAttempt: false` + treat settled/reserved prior attempt as already
paid) — which also requires blocker 6's rounding fix.

### 8. Unbounded budgets for standard-effort runs via `POST /api/agent-runs` — P1 (web)

`normalizeAgentRunBudgets` (`dispatch.ts:82-104`) caps only `max_cost_usd`; `wall_clock_ms`,
`max_tool_calls`, `max_tokens` accept any finite value, and standard effort gets no defaults.
With `max_cost_usd` omitted there is **no LLM spend ceiling at all** (`agentRunCostPolicy.ts:16-17`
returns undefined → `accounting = null` → unreserved, price-uncapped LLM calls — also noted as
P2-5 in the cost review). An authenticated user can POST `max_tool_calls: 1e6, wall_clock_ms:
10 days`. The chat path is tighter than the raw API path. Fix: clamp all four fields
server-side and require/derive a cost budget for every run.

### 9. Run deletion cascades away the money ledger — P1 (DB)

Ledger FKs are `ON DELETE CASCADE` (`20260719030000:11-12`) and the direct-write guard doesn't
cover DELETE. Production `agent_runs.parent_run_id` is `ON DELETE SET NULL`, so deleting a root
orphans children, erases the tree's cost entries, and a subsequent reserve makes each orphan
**its own root with a fresh budget**. The integration test codifies the cascade as desired.
Fix: `ON DELETE RESTRICT` + block deletion with unresolved entries.

### 10. Integration suite never runs in CI — P1 (DB)

`vitest.config.ts` excludes `tests/integration/**`; `test:deep-research:integration` is wired
into neither turbo nor `.github/workflows/ci.yml`. The DB guarantees are only verified when
someone remembers to run the script. Graceful skip on missing `initdb` already exists — wiring
is cheap. Also fix fixture fidelity: no `ALTER DEFAULT PRIVILEGES` in the fixture means the
privileges test passes **without 050000 applied** (it cannot detect the exact production failure
mode it exists for — which is how blocker 2 was missed); the fixture's global-unique dedup key
masks the double-enqueue in blocker 5; the fixture FK differs from production's `SET NULL`.

### 11. Lock-order deadlocks — P1/P2, verified (DB)

`reserve_agent_run_cost` locks root→leaf; the child-settle wake trigger locks child→root.
Deadlock reproduced live (40P01) — triggered by a cancel/reaper settling a child while that
child's worker is mid-reserve. Note the wake trigger fires for **every** parented run, not just
deep research. Second inversion: capacity trigger (row lock → advisory lock) vs child insert
(advisory → row). Both fail closed but will surface as flaky cancels/reserves. Fix: cheap
non-locking template pre-check in the wake trigger; hoist the capacity early-return above the
advisory lock.

---

## Notable P2s (fix soon, not blocking)

- **Settle can wipe recorded overrun actuals** (`030000:386-430`): a later NULL-actual
  `reconciliation_required` settle overwrites a recorded 0.03 actual with NULL → exposure
  shrinks below already-spent money. `COALESCE`-protect actuals. _(verified)_
- **200-with-missing-usage settles at $0** (`smart-llm-service.ts:838-855`) — the one silent
  release hole; should become `reconciliation_required`.
- **`usage: {include: true}` is never sent to OpenRouter**, so the `provider_reported` settle
  path is dead in production and everything settles as catalog estimate. Adding it makes
  settlement authoritative and shrinks reconciler traffic. Cheap win.
- **`X-Generation-Id` header capture unverified against live API** — if OpenRouter doesn't send
  it, lost-body rows silently degrade to operator-needed instead of auto-reconciling. Needs the
  live smoke.
- **Quadratic HTML-strip regexes** (`webResearchPort.ts:361-370`, `webvisit/parser.ts:69-70`):
  35s measured synchronous CPU on a 2.2MB adversarial page — stalls the worker's job loop
  (wall-clock budget can't preempt synchronous work). Let `sanitize-html` do the stripping.
- **Synthesis prompt lacks untrusted-evidence delimiting** (flagged independently by two
  reviewers): child packets splice raw into the synthesis user prompt
  (`deepResearchOrchestrator.ts:937-947`); the child layer's injection hardening is good, the
  reduce step is the unguarded hop.
- **Stalled reclaim can double-execute a live coordinator** (no heartbeat during processing;
  5-min `reset_stalled_jobs` vs 120s LLM timeout makes it low-probability, high-impact): second
  planner is paid, loser hits the two-child DB cap → `finalize('failed')` clobbers a healthy run.
  A processing heartbeat or lease token fixes it.
- **Unguarded redundant `queueParent` backstop can kill a healthy run**
  (`deepResearchOrchestrator.ts:869` unwrapped vs the correctly wrapped child-side backstop).
  Wrap or delete (the reconciliation sweep makes it deletable).
- **Thrown dispatch errors treated as permanent** — the retry-safe `dispatching` checkpoint is
  only exercised on process death, never on exceptions (`agentRunWorker.ts:1233-1242`).
- **Deep-research template flip bypasses the two-child cap** (verified: an `agent` root with 3
  children flipped to `deep_research` successfully). Forbid the transition.
- **Reconciled overruns can exceed root `max_cost_usd` with no run-level flag** — surface
  `SUM(exposure) > max_cost_usd` in the operator report.
- **`delegateTask` duplicates `dispatchAgentRun`** and has already drifted (clamp-vs-error on
  tool calls, $1-vs-$10 standard cap, token/wall-clock defaults). Consolidate on
  `dispatchAgentRun`.
- **Worker transcript cap (10k) truncates max-size web visits (12k)** — a max visit always
  loses its tail before the model sees it.
- **Cancel observed only at coordinator entry** — a cancel during planning still dispatches and
  spends child budget; during synthesis it finalizes `completed`.
- Moonshot-direct routing bypasses `max_price`; three-active-run cap has a count-then-insert
  race for non-deep runs; chat-side Tavily spend is unmetered; no port allowlist beyond
  undici's defaults; `claim` batch slots consumed by exhausted NULL-token rows.

## What is genuinely solid (verified, not assumed)

- Reserve-before-fetch is structural and honestly tested at both seams; no path dispatches
  before a committed reservation; no dispatch path ever releases a possibly-billed reservation.
- Root-first lock ordering makes tree exposure sums race-safe; the two headline race claims
  (concurrent two-child cap, concurrent over-budget reservations) hold under real parallel
  psql sessions.
- Idempotent fan-out with stable checkpointed child IDs; transactional exactly-once synthesis
  wakeup on the normal path incl. the fast-child race; parent-cancel signal-consumption race
  closed (`agentRunPolicy.ts:24-34`).
- Child fencing is three-layered (catalog, per-call allowlist, DB shape trigger); no delegation
  op exists in the child op surface at all.
- Budget math conservative in the right direction everywhere (floors, 35% synthesis reserve,
  `GREATEST(reserved, actual)` exposure, Tavily floor price un-lowerable via env).
- SSRF blocklists comprehensive and fail-closed (modulo the rebinding TOCTOU); safe-fetch
  consolidation across web/worker is real (url-client is now a 16-line wrapper).
- Lease machinery complete: SKIP LOCKED claims, token fencing under row lock, completed-token
  replay, attempts-at-claim bounding, crashed-final-lease operator routing.
- API authz correct: cross-user project runs blocked at membership RPC on both paths; agent_runs
  RLS is SELECT-only for users; $100 budget rejected.
- Documentation honesty and tasker hygiene are far above baseline.

## Strategic findings (plan level)

1. **Answer the fan-out-vs-single-run question now, not in Slice D.** The sequential baseline
   (one deep-effort run, ~12 tool calls — Slice A already ships it) may match 2×5-call children
   at $0.50, in which case V1 UX can ride the simpler, already-working path while fan-out waits
   for bigger budgets. Ten fixed questions run both ways ≈ $10. This reorders tasker/33 WP-4
   ahead of further orchestration hardening and is the cheapest way to de-risk the whole plan.
2. **Quality is now the critical path.** Everything built so far is control plane. Tasker/30
   (evidence contracts, report persistence) is the highest product-value open item: a $0.50,
   10-minute run currently produces one ephemeral chat message.
3. **Two disconnected cost-accounting systems.** Worker research spend never reaches
   `llm_usage_logs` (only the web OpenRouter service writes there), so admin LLM analytics and
   any future user-facing consumption accounting are blind to research spend. Decide the bridge
   (ledger as source of truth + admin view) before GA.
4. **Ordering constraint:** per-user daily quota (29 WP-3) must land before the dedicated chat
   tool (32 WP-1) broadens access — otherwise a user can chain $1 runs all day.
5. **No staging environment exists** — the plan says "staging" throughout, but every probe and
   deploy targets production. Either create a staging Supabase project or codify the
   capped-production-smoke procedure explicitly.
6. **Docs are stale on deployment state** (migration 5 deployed; "44 tests" now 83;
   `database.types.ts` still blocked on `SUPABASE_ACCESS_TOKEN`). Update
   `DEEP_RESEARCH_ARCHITECTURE_2026-07-19.md` and tasker/29+31, and swap the release-blocker
   list to the items above.
7. **Simplifications endorsed by reviewers:** one reconciliation sweep replaces the two
   app-level wake backstops; collapse `synthesis_queued`/`synthesizing`; consolidate the two
   HTML→text pipelines into shared-agent-ops; `delegateTask` → `dispatchAgentRun`. The cost
   ledger itself earns its keep (provider-side caps cannot give atomic per-tree budgets); freeze
   its scope — do not build Moonshot/Tavily lookup paths now, conservative retention is fine.

## Suggested order of operations

1. Follow-up migration: revoke `queue_deep_research_synthesis` (blocker 2) + stage-guard NULL
   fix (5) + rounding (6) + `COALESCE` actuals (P2) + FK RESTRICT (9) + wake-trigger pre-check
   (11). One migration, all verified defects, mostly one-liners.
2. Liveness: stranded-run sweep + `finalize()` error check + empty-state-as-planning (1).
3. Web fixes: DNS-rebind pinning (3), canonical-URL cache keying (4), API budget clamps (8),
   regex strip → sanitize-html (P2).
4. CI: wire the integration suite + fixture fidelity (10); attempt-adoption path (7).
5. Then the smoke (tasker/31 WP-2, needs worker Tavily credential) and the fan-out-vs-single
   bake-off (tasker/33 WP-4 slice) before building 30/32 UX on top.
