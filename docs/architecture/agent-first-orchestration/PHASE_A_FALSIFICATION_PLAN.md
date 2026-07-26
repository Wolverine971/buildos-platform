<!-- docs/architecture/agent-first-orchestration/PHASE_A_FALSIFICATION_PLAN.md -->

# Phase A: Falsification Plan

**Status:** **CLOSED 2026-07-26 — routing gate recorded as instrument-limited; decision in
[PHASE_A_RESULTS.md](./PHASE_A_RESULTS.md).** Final scored state: A0 complete; A1 routing
mitigation v2 = **Change** (61/72 frozen routes; cold holdout 15/15 on the fast path only); A2
built but never scored. See Amendment 5 below.
**Date:** 2026-07-25 (amended after [Phase A Audit](./PHASE_A_AUDIT_2026-07-25.md); closed 2026-07-26)
**Depends on:** [README](./README.md), [V0 Architecture Plan](./V0_ARCHITECTURE_PLAN.md),
[Audit 2026-07-24](./AUDIT_2026-07-24.md), [Phase A Audit](./PHASE_A_AUDIT_2026-07-25.md)
**Runbook for the next iteration:** [NEXT_ITERATION.md](./NEXT_ITERATION.md)
**Duration target:** 1–2 weeks
**Gate:** Phase B (the durable kernel) starts only on a recorded **go** from this phase.

## Purpose

Test the product hypothesis before building any durable infrastructure:

> A small orchestrator with a limited world model, plus bounded specialists, beats one
> context-heavy agent on complex work — without making simple work unacceptably slow.

This is a claim about **model behavior**. It needs no database, no queue, no leases, no RLS, and
no UI to measure. Phase A measures it with in-process code and real scenarios, against the real
production chat path as the control.

Phase A code is allowed to be disposable — **except the contracts**, which live in
`packages/agent-orchestrator/src/contracts` from day one and carry forward into Phase B.

## What Phase A produces

1. **Route accuracy** — can the CEO route mode, given only a lightweight world card, correctly
   pick `direct | workflow | clarify | capability_gap` on labeled real requests?
2. **Quality delta on complex work** — does the specialist workflow lane beat the existing v2
   chat path in blind comparison on multi-source/synthesis scenarios?
3. **True cost and latency multiples** — what does the team approach actually cost relative to
   the control, per scenario class?
4. A recorded **go / change / stop** decision in `PHASE_A_RESULTS.md`, scored against the
   pre-registered rule below.

## Pre-registered decision rule — frozen at DJ gate 3

These numbers were derived from the A0 baseline and approved by DJ on 2026-07-24, before A1
prompt work or any A2 comparison run. Prompts, labels, checks, model pins, and thresholds are now
frozen for the first scored pass.

### A0 measured anchors

The canonical report is
[`control-baseline-v1.json`](../../../packages/agent-orchestrator/src/testing/harness/results/control-baseline-v1.json).
It contains the 12 intended runs. C07's real bounded-timeout failure remains in the aggregates;
only an accidental framework-level retry was removed. Timing is measured by the client from the
real v2 SSE stream, and cost comes from stream-correlated `llm_usage_logs`.

| Control cohort                            | Runs | Clean |  TTFT p50 |  TTFT p95 | Total p50 |  Total p95 | Mean cost/run |
| ----------------------------------------- | ---: | ----: | --------: | --------: | --------: | ---------: | ------------: |
| Simple read (C01/C02, 3× each)            |    6 |     6 |  8,860 ms |  9,849 ms | 50,000 ms | 105,803 ms |     $0.004740 |
| Status summary (C04)                      |    1 |     1 |  7,973 ms |  7,973 ms | 39,464 ms |  39,464 ms |     $0.003193 |
| Complex workflow candidates (C06/C07/C08) |    3 |     2 | 10,026 ms | 12,461 ms | 96,662 ms | 148,869 ms |     $0.007493 |
| Entire frozen corpus                      |   12 |    11 |  8,860 ms | 12,461 ms | 50,000 ms | 148,869 ms |     $0.005232 |

The control used `deepseek/deepseek-v4-flash` with smart-llm's `balanced` profile. It passed all
required machine checks in 5/12 runs. That acceptance rate is a diagnostic baseline, not a
substitute for the pre-registered blind preference result.

### Amendment 1 — 2026-07-25, after the Phase A audit

DJ authorized the audit's recommended changes on 2026-07-25, **before any workflow output was
scored and before any blind pair was generated**. Nothing already measured is invalidated; the
A1 route confirmation is superseded and must be rerun. The five rule changes are:

1. **Reason codes are gated for the three comparison scenarios.** `compileWorkflowStage` selects
   the execution plan from `reason_code`, so for C06/C07/C08 the reason code is not diagnostic —
   it _is_ the plan. Bound: **≥25/27 plan-critical reason codes** (smallest discrete result at or
   above 90%, derived exactly as the 65/72 route bound was). Reason codes for the other five
   scenarios remain diagnostic.
2. **The cost bound is evaluated on model spend only.** The $0.022479 bound is 3× a control mean
   taken from `llm_usage_logs`, which contains no tool spend. Charging the workflow lane for
   Tavily while the control's baseline excludes it is not a comparison. All-in cost (model +
   tool) is reported alongside for both lanes and is the honest headline number.
3. **C07 is reported separately, and a Go additionally requires ≥3/6 wins on C06+C08.** All three
   C07 control runs terminated with a stream error after skill loading and produced 73–173
   characters, so those three pairs are near-certain workflow wins that say nothing about the
   architecture. Six of nine remains the overall bound.
4. **A secondary, non-deciding reporting line is pre-registered:** panel wins ignoring the
   machine-check gate, and required-check pass rate per lane. The frozen rule still decides. This
   exists so `PHASE_A_RESULTS.md` can distinguish "the workflow lost on quality" from "the
   workflow lost on literal substring matching."
5. **Route accuracy is additionally scored on a held-out set.** The frozen eight were used across
   four prompt passes and two model pilots, so 72/72 on them is a training-set score. A held-out
   route corpus is scored once, cold, against the already-frozen prompt. It is reported and is
   not a gate for the first pass; a large gap between the two numbers is itself the finding.

### Amendment 2 — 2026-07-25, after the prompt-v5 Change result

The prompt-v5 rerun completed before any workflow output was scored. It reached 58/72 correct
top-level routes and 22/27 comparison-scenario reason codes, so A1 remains Change and A2 remains
blocked. The pre-registered fallback for amendment 1.1 is now active:

1. **Workflow topology is selected from observable request features.** A supplied URL selects a
   one-researcher stage, a project referent selects librarian-then-research, and a self-contained
   brief selects two-way parallel research. The model reason label no longer selects the plan.
2. **Reason-code agreement returns to diagnostic status prospectively.** The historical 25/27
   bound is retained in the v5 report as the trigger for this change, but it is not a gate after
   the causal dependency was removed. This amendment does not relax the 65/72 top-level route
   bound; the recorded 58/72 still blocks the cohort.
3. **No fifth prompt tuning pass is permitted against the frozen eight.** The v5 miss is reported
   as observed. The held-out score and workflow cohort do not run while the Step 1 gate is Change.

### Amendment 3 — 2026-07-25, routing mitigation v2 pre-registration

DJ authorized continuing with the next legitimate mitigation after the v5 Change. The new policy
does not alter prompt v5. It limits the second model to a strict semantic-scope fact and compiles
the route, reason, question, and plan in code; a supplied URL is handled entirely in code. The
policy, exact hashes, models, full 72-run confirmation, 15-run cold holdout, and unchanged
Go/Change/Stop rule were frozen before model output in
[`A1_ROUTE_MITIGATION_V2.md`](./A1_ROUTE_MITIGATION_V2.md). No edits are allowed between its two
paid runs. A2 remains blocked unless that confirmation returns a Go candidate.

The confirmation is now complete. It returned Change at 61/72; the cold holdout returned 15/15
with no reviewer calls. The canonical report hashes are `07b78b69…bdd3` and `32c0f21f…5b87`. No
further corpus-driven tuning or A2 run follows.

### Amendment 4 — 2026-07-25 (evening), harness-integrity fixes before any scored cohort

DJ authorized the Tier 0 fixes from
[`research/SYNTHESIS.md`](./research/SYNTHESIS.md) §6. All of them were applied **before any
workflow output was scored and before any blind pair was generated**; no measured result is
reinterpreted or repaired by them. Four touch the frozen rule and are recorded here.

1. **A truncated completion is infrastructure-invalid, not a wrong route.** Four calls in
   `route-eval-mitigation-v2.json` returned `finish_reason=length` with empty content from
   `z-ai/glm-5.2` against a 900-token cap: the model was cut off before emitting any decision.
   These were scored as wrong routing decisions while `infrastructureInvalidCount` read 0. A
   max-tokens value that truncates a reasoning model is a harness failure, which the existing
   invalid-run rule already covers. The harness now classifies it as such, and
   `ROUTE_MODEL_MAX_TOKENS` is raised 900 → 2,400. The per-call $0.02 spend cap is unchanged and
   remains the real cost control.

    **This does not repair the recorded 61/72.** That report stands as measured. The change applies
    to future runs only, and any future run must disclose how many calls it voided this way.

2. **C07 is excluded from the primary blind-win denominator.** All three C07 control runs
   terminated with a stream error after skill loading and produced 73–173 characters. The frozen
   validity rule already classes a harness failure as infrastructure-invalid — it was applied to
   the workflow lane's ZDR failures but not to the control lane's crash, and both asymmetries
   favored the workflow lane. C07 is reported separately and can never count as a workflow win
   until its control arm is re-run successfully. Encoded in
   `testing/harness/comparison-eligibility.ts`.

    **This reduces power and is not a fix on its own.** The primary denominator falls from 9 pairs
    to 6. Under a coin-flip null, ≥4 of 6 occurs 34.4% of the time, ≥5 of 6 occurs 10.9%, and 6 of 6
    occurs 1.6%; none of the achievable thresholds is a 5% test. **No Go may be declared on a
    6-pair denominator.** The comparison corpus must grow before the blind result can decide
    anything — see Tier 1/2 of the synthesis. `binomialTailProbability` is now computed and reported
    beside any win count so a threshold is never mistaken for a significance test.

3. **`decision` in the route report is renamed `routeAccuracyDecision`.** It was always computed
   from route accuracy alone, so `route-eval-v4.json` carried `go_candidate` while the docs
   correctly recorded Change on latency, and `route-eval-holdout-v1.json` carries `go_candidate`
   for an explicitly non-gating set. The field never was the pre-registered decision; it is now
   named so a reader of the JSON alone cannot mistake it for one.

4. **Route accuracy is additionally reported at item level.** `routeAccuracy` micro-averages
   8 scenarios × 9 replicates and hides whether a miss is broad mediocrity or one systematically
   failing item. Item accuracy, `pass@k`, `pass^k`, self-consistency, and a 4×4 confusion matrix
   are now derived from the same data by
   `pnpm --filter @buildos/agent-orchestrator reanalyze:routes`, which reads the hashed artifacts
   and writes `results/analysis/ROUTE_REANALYSIS.md` without modifying them. **The 65/72 bound is
   unchanged by this amendment**; the additional reporting exists so the next decision about that
   bound is made on the right statistic. See
   [`research/10_ROUTING_FAILURE_FORENSICS.md`](./research/10_ROUTING_FAILURE_FORENSICS.md).

Non-rule fixes applied in the same pass, recorded for completeness: both paid harnesses are now
typechecked (`pnpm typecheck:phase-a` in `apps/web` and `apps/worker`) and two real type errors are
fixed; the three corpus validators that returned `passed: false` in the workflow lane are
implemented and both lanes now score through one module; an unimplemented validator id throws
instead of failing a check; agents self-report against the criterion ids their step declares;
`control-a2-v1.json` and `workflow-eval-invalid-zdr-v1.json` were restored to their exact original
bytes so their recorded SHA-256 values reproduce again; the results, corpus, and fixture
directories are in `.prettierignore`; and `results-manifest.test.ts` now fails if any recorded hash
stops reproducing.

### Amendment 5 — 2026-07-26, CLOSURE: routing gate recorded as instrument-limited

DJ closed the routing-gate track on 2026-07-26 after the A1 human-label exercise
([`A1_HUMAN_LABEL_PACKET.md`](./A1_HUMAN_LABEL_PACKET.md), agent-labeled at DJ's direction with
labels locked before the frozen corpus was opened). The full recorded decision is in
[`PHASE_A_RESULTS.md`](./PHASE_A_RESULTS.md); the rule-relevant facts:

1. **The 65/72 gate was never cleanly reachable.** The label exercise found **3 of 13 items
   contested** (C09, C10 week-planning, C01 in-sync score). By this plan's own arithmetic, two
   genuinely 50/50 items cap the achievable score at 63/72 — below the gate with a perfect
   router. The reanalysis independently showed max reachable = 63/72 with C09 counted as an
   error. The gate's unreachability is a property of the instrument that was true before any
   scoring, so closing on it is legitimate and is not outcome-driven gate-shopping.

2. **Two frozen labels depend on post-route knowledge.** C09=`clarify` and C01=`direct` are each
   justified by snapshot contents the router cannot see from the world card (entity counts only).
   Scoring a router against answers that require having already looked measures priors, not
   routing. Carried forward as a design requirement: peek-then-decide, or an explicit
   `context-then-decide` route.

3. **The taxonomy cannot hold context → recommendation.** "Help me plan this week" fits neither
   `direct` nor `workflow` as defined; both fence votes in the label exercise came from exactly
   this hole.

4. **No further routing cohorts are authorized.** The recorded scored state stands as measured
   (mitigation v2 = Change, 61/72; holdout 15/15 fast-path only). The quality half of the Phase A
   hypothesis (A2, never scored) moves to the open-brief instrument
   ([`OPEN_BRIEF_EVAL_METHODOLOGY.md`](./OPEN_BRIEF_EVAL_METHODOLOGY.md)), which also carries
   DJ's captured acceptance bar. Phase B remains unauthorized.

### Scored sample and invalid-run rule

- **Routing:** exactly nine independent route calls per frozen scenario: 72 calls total. No
  majority-vote smoothing; every call is scored. The threshold applies to the top-level
  `direct | workflow | clarify | capability_gap` route. Exact reason-code agreement is reported
  separately as a diagnostic. C06/C07/C08 were gated in the v5 run that triggered amendment 2;
  after feature-derived plan selection, their reason codes no longer affect execution.
- **Complex comparison:** three workflow and three fresh control outputs for each of C06, C07,
  and C08, paired by scenario/run index: nine blind pairs. A tie, error, empty output, or required
  acceptance-check failure cannot count as a workflow win.
- An actual-model mismatch, provider transport failure before inference, or harness failure is an
  infrastructure-invalid run. Its spend remains in operational accounting, but it is replaced
  once and excluded from the score. Model-matched timeouts, tool failures, and bad outputs are
  valid outcomes and stay in every denominator.
- Any mutation/write tool call is a safety violation and an immediate **stop** for the run set.

### Absolute bounds

| Measure                               |     Pass bound | Derivation                                                            |
| ------------------------------------- | -------------: | --------------------------------------------------------------------- |
| Route accuracy                        | ≥65/72 (90.3%) | Discrete threshold at or above the 90% architecture target            |
| Comparison reason codes (C06/C07/C08) |       Reported | Diagnostic after amendment 2; no longer selects the workflow plan     |
| Workflow blind wins                   |   ≥6/9 (66.7%) | Smallest discrete result satisfying the 60% target; ties are non-wins |
| Workflow blind wins on C06+C08 only   |   ≥3/6 (50.0%) | The C07 control is a crashed turn; a Go may not rest on it            |
| Workflow mean **model** cost per run  |     ≤$0.022479 | 3 × the measured $0.00749296 complex-control mean (model-only)        |
| Workflow total-duration p50           |    ≤193,325 ms | 2 × the measured 96,662.320 ms complex-control p50                    |
| Workflow total-duration p95           |    ≤297,738 ms | 2 × the measured 148,868.782 ms complex-control p95                   |
| Projected direct-path TTFT p50        |     ≤11,100 ms | Measured 8,860.336 ms simple p50 plus a 25% routing-overhead budget   |
| Projected direct-path TTFT p95        |     ≤14,800 ms | Measured 9,848.823 ms simple p95 plus a 50% tail budget               |

Because the CEO-direct response lane is deferred, A1 projects direct-path TTFT as the measured
simple-control TTFT plus route-call duration. The bounds therefore give the router approximately
2,240 ms p50 and 4,950 ms p95. A2 must measure the real combined path if it implements one.

### Go / change / stop

- **Go:** all absolute bounds pass, the workflow wins at least 6/9 blind pairs **and at least 3/6
  on C06+C08**, route accuracy is at least 65/72, and no safety violation occurs.
- **Change:** the workflow reaches 6/9 wins but violates a cost or latency bound; or routing lands
  at 54–64/72 (75.0–88.9%). Revise the architecture or a concrete latency mitigation, then rerun
  the entire affected slice before considering Phase B.
- **Stop:** workflow wins 5/9 or fewer; workflow wins fewer than 3/6 on C06+C08; routing lands at
  53/72 or fewer; a mutation/write tool is called; or the direct-path latency bound fails with no
  concrete mitigation. A marginal or mixed result is not rounded up to a go.

## Lanes

| Lane     | What runs                                                                                                                                                            | Status        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Control  | Existing agentic-chat v2 stream path via the `pnpm test:agentic` harness (`apps/web/src/lib/tests/agentic-e2e/`), which drives the real endpoint with scenario files | Already built |
| Workflow | In-process harness: route → stages → `Promise.all` specialists → digest → transition → synthesis                                                                     | Built in A2   |

CEO-direct and sequential-baseline lanes are deferred to Phase B Slice B5 — two lanes are enough
for the first read, and four lanes triples the work.

## Corpus (Slice A0)

~8 scenarios, drawn from **real production chat sessions** (`chat_sessions` / `chat_turn_runs`)
wherever possible, anonymized as needed, plus a frozen project snapshot (precedent:
`tests/integration/fixtures/deep-research-base.sql`). Target mix:

| #   | Class                                                 | Expected route                                          |
| --- | ----------------------------------------------------- | ------------------------------------------------------- |
| 1–2 | Simple project question / entity read                 | `direct`                                                |
| 3   | Project status summary                                | `direct` (borderline — this is the routing stress test) |
| 4   | Single-source external lookup                         | `workflow` (1 researcher)                               |
| 5   | Multi-source parallel research + synthesis            | `workflow` (fan-out)                                    |
| 6   | BuildOS context gathering → research → recommendation | `workflow` (sequential stages)                          |
| 7   | Ambiguous request                                     | `clarify`                                               |
| 8   | Unsupported capability (e.g. send an email)           | `capability_gap`                                        |

Each scenario gets: the request text, project snapshot reference, a hand-labeled expected route,
and machine-checkable acceptance checks (facts that must appear, citations that must resolve,
claims that must not appear). Route labeling happens before any prompt work, so labels can't
drift toward what the router does.

Every comparison scenario runs ≥3 times per lane; route accuracy is scored over ≥3 runs per
scenario (~72+ route calls — cheap).

## Work breakdown

### Slice A0 — Corpus, baselines, contracts (~2–3 days)

- [x] Scaffold `packages/agent-orchestrator` (package.json, tsconfig, vitest; no app imports —
      dependency direction enforced from day one).
- [x] Define contracts as zod schemas + inferred types: `RouteDecision` (with the closed
      `reason_code` union), `StepSpec`, `WorkflowStageSpec`, `AgentResult`, `ArtifactEnvelope`,
      `WorkflowStateDigest`, `TransitionDecision`. Contract tests: valid/invalid/oversized.
- [x] Extract 8 scenarios from real transcripts; freeze the project snapshot; hand-label routes
      and acceptance checks. Store under `packages/agent-orchestrator/src/testing/harness/corpus/`.
- [x] Measure control-lane baselines (TTFT p50/p95, cost) by running the corpus once through
      `pnpm test:agentic`.
- [x] Pin the CEO model (§18 Q5) and record it.
- [x] Finalize the decision rule with real baseline numbers; commit it before A2 runs.

**Done when:** corpus is frozen and labeled, baselines are recorded, decision rule is committed.

### Slice A1 — Route mode (~2 days)

- [x] World card v0: BuildOS object model summary, project identity, direct-capability cards,
      agent-catalog cards (librarian, researcher), workflow grammar, permission ceiling. Built by
      deterministic code from the snapshot; hard token budget.
- [x] Route function: world card + request → validated `RouteDecision` (one bounded repair
      attempt on schema failure, matching §14).
- [x] Score route accuracy, per-call latency, and cost across repeated runs. Log every
      `reason_code`.
- [x] Prompt v5: replace the three corpus-shaped scope rules with general
      referent/self-contained/out-of-scope tests, and add an ordered first-match procedure for
      selecting the workflow reason code.
- [x] **Rerun the 72-call confirmation under prompt v5** and record comparison-scenario reason
      accuracy alongside route accuracy. Result: Change at 58/72 routes and 22/27 reasons.
- [x] **Score the held-out route corpus once, cold**, against the frozen v5 prompt under the
      pre-registered mitigation-v2 no-edit sequence. Result: 15/15, with zero scope-review calls.

**Done when:** route accuracy number exists with per-scenario breakdown. If accuracy is already
<75% here, stop and diagnose before building A2 — the architecture depends on routing.

After four single-model passes and two rejected fast-model pilots, the frozen fast-first strategy
(Gemini primary plus bounded GLM review) scored 72/72 correct routes. Direct route overhead was
898/1,310 ms p50/p95, projecting to 9,758/11,159 ms; both bounds pass. Full evidence is in
[`A1_ROUTE_RESULTS.md`](./A1_ROUTE_RESULTS.md).

**A1 was reopened and rerun on 2026-07-25.** Prompt v5 returned Change at 58/72 routes and 22/27
comparison-scenario reason codes. Direct latency still passed. Per amendment 2, A2 now compiles
its workflow topology from observable request features rather than the reason label; this removes
plan variance but does not change the failed route score. A2 remains blocked.

**A1 mitigation v2 completed on 2026-07-25.** Its frozen confirmation improved to 61/72 and its
cold holdout scored 15/15, but the unchanged Go bound is 65/72. The holdout exercised only the
fast path. A1 therefore remains Change and A2 remains blocked; no corpus-driven tuning follows.

### Slice A2 — In-process workflow lane + comparison (~3–4 days)

- [x] Deterministic librarian: code-built `ContextPacket` artifact from the snapshot (no LLM).
- [x] Researcher: single LLM specialist over the existing `WebResearchPort` implementation,
      returning `AgentResult` with research-packet artifact drafts; citation validation in code
      (precedent: deep-research evidence normalizer).
- [x] Engine-as-a-function: route → compile stage → `Promise.all` steps → build bounded digest
      (§6.7 rules) → transition call → next stage or synthesis. Artifacts in memory, typed via
      the real codecs. Enforce `max_stages=5`, `max_replans=2`, USD budget accounting in memory.
- [ ] Run the comparison: workflow lane vs. control lane, ≥3 runs each on scenarios 4–6; blind
      A/B of outputs (randomized order, rubric-scored); acceptance checks run in code.
- [ ] Write `PHASE_A_RESULTS.md`: route accuracy, blind-preference results, cost/latency
      multiples, violations, decision (go/change/stop), and what surprised us.

**Done when:** the decision is recorded against the pre-registered rule.

A2 local implementation and the fresh 9-run control cohort are complete. The first workflow pair
and its permitted replacement were infrastructure-invalid because OpenRouter exposes no
Zero-Data-Retention endpoint for the frozen DeepSeek V4 Pro researcher pin. DJ subsequently
approved non-ZDR handling for the anonymized Phase A inputs. See
[`A2_PROGRESS.md`](./A2_PROGRESS.md). No workflow output has entered the score.

The 2026-07-25 audit then found four conditions that would have made a scored cohort
uninterpretable, and the corresponding fixes are now implemented (blind-mapping counterbalance,
plan-critical reason gating, rubber-stamp transition removal, de-scenario-ized researcher bounds,
role-aware pin verification, model-only cost accounting). The cohort is blocked only on the A1
rerun and the non-ZDR transport opt-in. See [`NEXT_ITERATION.md`](./NEXT_ITERATION.md).

## What Phase A deliberately skips

Persistence, queue jobs, leases, fencing, RLS, reconciliation, signals, events tables, realtime
projection, any UI, pause/cancel, per-user caps, and mutation scenarios (all comparison scenarios
are read-only in Phase A; staged-proposal comparability is a Phase B concern). None of these
change what the models do, and all of them have production precedent waiting in the substrate
(§2.9 of the V0 plan).

## Cost estimate

Roughly: ~72 route calls (small), ~36 workflow-lane runs × (1 route + 1–2 specialists + 1–2 CEO
turns + synthesis) + ~36 control runs. At current model pricing this lands in the tens of
dollars, not hundreds. Trivial relative to one week of Phase B engineering.

## Day-1 checklist (the first step)

1. `pnpm` scaffold `packages/agent-orchestrator` with contracts + vitest.
2. Write `RouteDecision` + `StepSpec` zod schemas and their contract tests.
3. Pull 10–12 candidate transcripts from production chat history; pick the 8; label routes.
4. Run the existing `test:agentic` corpus once to capture baseline TTFT/cost.
