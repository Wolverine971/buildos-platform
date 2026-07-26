<!-- docs/architecture/agent-first-orchestration/NEXT_ITERATION.md -->

# Phase A — next iteration runbook

**Date:** 2026-07-25
**Reason this exists:** the [Phase A audit](./PHASE_A_AUDIT_2026-07-25.md) found four conditions
that would have made a scored A2 cohort uninterpretable. DJ authorized the recommended changes.
The audit fixes are done; this file now records the outcome of the paid gate and the resulting
architectural change.

**State right now:** routing mitigation v2 also returned **Change**: 61/72 frozen routes against
the unchanged 65/72 Go bound. The cold holdout scored 15/15, but all 15 used only the fast Gemini
path and did not exercise the new scope classifier. C09 remained 0/9. Both reports are canonical
and hashed; there was no edit between their one-shot runs and no tuning follows. A2 remains
blocked and has zero scored workflow outputs. See
[`A1_ROUTE_MITIGATION_V2.md`](./A1_ROUTE_MITIGATION_V2.md). **Nothing is
committed** — the repo carries unrelated staged and unstaged work, so any commit needs explicit
pathspecs.

Runbook commands are now first-class scripts: `pnpm test:agentic:phase-a-route-mitigation-v2`,
`pnpm test:agentic:phase-a-route-holdout` (both in `apps/web`), and `pnpm test:phase-a-workflow`
(in `apps/worker`).

> **STOP — read before running anything paid (updated 2026-07-25, evening).**
>
> 1. **`pnpm test:agentic:phase-a-route-v5` no longer exists.** It had become byte-identical to
>    `test:agentic:phase-a-route-mitigation-v2` apart from its output path — it ran review policy
>    v2, not the v1 policy that produced `route-eval-v5.json`. It was removed rather than left as a
>    misleading name. `route-eval-v5.json` is not reproducible from the current tree.
> 2. **Both paid runs this file calls pending have already executed** (2026-07-25 16:15). Results
>    are on disk; see §Step 1A. Do not re-run them expecting a first read.
> 3. **Tier 0 harness fixes have landed** (falsification-plan amendment 4). They change how future
>    runs are scored — truncated calls are now infrastructure-invalid, C07 is out of the primary
>    denominator, and both paid harnesses are typechecked. Nothing already measured was altered.
> 4. **The blocker is not a model problem.** Route error is concentrated in one scenario on one
>    boundary; read [`research/10_ROUTING_FAILURE_FORENSICS.md`](./research/10_ROUTING_FAILURE_FORENSICS.md)
>    and [`research/SYNTHESIS.md`](./research/SYNTHESIS.md) before spending anything.
> 5. **The next authorized work is Tier 1**, specified end to end in
>    [`TIER_1_CONTROL_HANDOFF_2026-07-25.md`](./TIER_1_CONTROL_HANDOFF_2026-07-25.md). It makes the
>    workflow-vs-control comparison interpretable by pinning both lanes to the same model. **Do not
>    run the workflow cohort or score any blind pair before it lands** — the two lanes currently use
>    different models, so any result would be unattributable.

## Step 1A — results of the two runs this runbook called pending

| Report                          | Corpus                 | Result    | `routeAccuracyDecision` |
| ------------------------------- | ---------------------- | --------- | ----------------------- |
| `route-eval-mitigation-v2.json` | frozen eight, 72 calls | **61/72** | change                  |
| `route-eval-holdout-v1.json`    | holdout five, 15 calls | **15/15** | go_candidate            |

Neither clears the 65/72 bound, and the holdout number does **not** demonstrate generalization: its
five scenarios are 4× `direct` + 1× `capability_gap`, containing zero `workflow` and zero `clarify`
cases — none of the classes carrying 100% of observed routing error. `reviewed` is `false` on all
15 runs, so the bounded reviewer that resolves workflow-vs-clarify never fired. It also samples
3 runs/scenario against the frozen set's 9. Rebuild the held-out set before citing it.

Item-level view of the same data (`pnpm --filter @buildos/agent-orchestrator reanalyze:routes`):
item accuracy **7/8**, `pass^k` **5/8**, mean self-consistency **93.1%**, one systematically failing
scenario (`a0-c09-missing-content-scope`, 0/9). Because a systematic failure costs a full block of
9 calls against a 7-error budget, the maximum score still reachable was **63/72 — below the bound**
before the run began.

---

## What changed since the handoff

| Audit item  | Change                                                                                                                                      | Where                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| B1          | Route prompt v5: corpus-shaped scope rules replaced with general referent tests; ordered first-match procedure for the workflow reason code | `application/route-mode/prompts.ts`                                       |
| B1          | Reason codes gated at ≥25/27 for C06/C07/C08 and asserted by the paid route test                                                            | `testing/harness/route-eval-report.ts`, `phase-a/route-mode-eval.test.ts` |
| B2          | C07 reported separately; a Go additionally needs ≥3/6 on C06+C08                                                                            | `PHASE_A_FALSIFICATION_PLAN.md` amendment 1.3                             |
| B3          | Cost bound evaluated on model spend only; all-in reported beside it                                                                         | `testing/harness/workflow-eval-report.ts`                                 |
| B4          | Held-out route corpus schema + `PHASE_A_ROUTE_CORPUS` selector                                                                              | `testing/harness/corpus-schema.ts`, `phase-a/fixtures.ts`                 |
| S1          | One-legal-action gates decided in code; only branching gates call GLM                                                                       | `workflow-engine/{workflow-engine,transition}.ts`                         |
| S2          | Researcher visit budget and citation floor derived from the assignment; generic fan-out foci                                                | `agents/researcher/researcher.ts`, `route-mode/route-mode.ts`             |
| S3          | Counterbalanced blind mapping `phase-a-a2-blind-v2`, hash `ba2602e8…774d2`                                                                  | `testing/harness/blind-judge.ts`                                          |
| S4          | Per-role pin verification; untagged usage is invalid                                                                                        | both paid harnesses                                                       |
| S5          | Secondary non-deciding reporting line pre-registered                                                                                        | `PHASE_A_FALSIFICATION_PLAN.md` amendment 1.4                             |
| N5          | `null` instead of `false` when a bound has no sample                                                                                        | `testing/harness/workflow-eval-report.ts`                                 |
| N6          | `reviewed` / `reviewReason` recorded per route call                                                                                         | `testing/harness/route-eval-report.ts`                                    |
| B1 fallback | Workflow topology selected from observable request features; reason labels are diagnostic                                                   | `application/route-mode/workflow-plan.ts`                                 |

---

## Step 1 — A1 rerun under prompt v5 (complete — Change)

This was the gate. A2 remains blocked because top-level route accuracy missed its frozen bound.

```bash
# HISTORICAL — this script has been REMOVED. It no longer ran prompt v5 under review policy v1;
# it had drifted to be byte-identical to test:agentic:phase-a-route-mitigation-v2.
# cd apps/web && pnpm test:agentic:phase-a-route-v5
```

`route-eval-v5.json` remains canonical for what it measured, but it is **not reproducible from the
current tree**: the review policy constant is now `phase-a-route-review-v2` and the strategy code
has been rewritten. The nearest current equivalent is
`pnpm test:agentic:phase-a-route-mitigation-v2`, which is a different policy and produced 61/72.

The script pins the frozen fast-first strategy (Gemini primary → bounded GLM reviewer) and
`--retry=0`, so nothing about the run depends on remembering seven environment variables.

Recorded result from `summary.overall`:

| Field                          | Bound                          | Meaning                                  |
| ------------------------------ | ------------------------------ | ---------------------------------------- |
| `routeMatchCount`              | ≥65/72                         | unchanged frozen bound                   |
| `planCriticalReasonMatchCount` | ≥25/27                         | then-applicable reason-driven-plan gate  |
| `reviewedCount`                | reported                       | how often the bounded GLM reviewer fired |
| direct-expected p50/p95        | ≤11,100 / ≤14,800 ms projected | unchanged latency bound                  |

| Measure                         | Result            | Status |
| ------------------------------- | ----------------- | ------ |
| Correct top-level route         | 58/72 (80.6%)     | Fail   |
| Comparison reason-code accuracy | 22/27 (81.5%)     | Fail   |
| Direct route p50 / p95          | 1,016 / 1,174 ms  | Pass   |
| Projected direct TTFT p50 / p95 | 9,876 / 11,023 ms | Pass   |
| Reviewed calls                  | 19                | —      |
| Infrastructure-invalid calls    | 0                 | Pass   |
| Total model cost                | $0.084033         | —      |
| Pre-registered decision         | **Change**        | —      |

Canonical report:

```bash
cd /Users/djwayne/buildos-platform
cp /tmp/buildos-phase-a-route-eval-v5.json \
   packages/agent-orchestrator/src/testing/harness/results/route-eval-v5.json
shasum -a 256 packages/agent-orchestrator/src/testing/harness/results/route-eval-v5.json
```

Record the hash in `results/README.md` and `A1_ROUTE_RESULTS.md`.

SHA-256: `f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20`.

The `<25` trigger fired. Prompt tuning stopped rather than making a fifth pass against the same
eight scenarios. The audit's option (b) was applied: `compileWorkflowStage` now selects the plan
from observable request features rather than a model-chosen label.

That architectural change is now implemented as `observable-request-features-v1`: a supplied URL
selects one-source research, a project referent selects librarian-then-research, and a
self-contained brief selects parallel research. Reason codes remain reported but no longer select
the plan. This removes plan variance; it does not reinterpret or repair the failed 58/72 route
score.

Because the same paid run also missed the top-level route bound, this original runbook did not
authorize a post-change paid rerun. DJ subsequently authorized the next step. Amendment 3 and
`A1_ROUTE_MITIGATION_V2.md` now govern the new confirmation and cold held-out score; the workflow
cohort remains blocked because their recorded confirmation result is Change.

## Step 1b — fact-classification/code-decision mitigation (complete — Change)

The 72-run confirmation and 15-run holdout ran once with no edit between them. The frozen score
improved to 61/72 but still missed the unchanged 65/72 Go bound. The holdout scored 15/15, with
zero scope-review calls, so it establishes fast-path non-regression but not scope-classifier
generalization. Direct projected TTFT remained inside both bounds. Canonical report hashes:

- `route-eval-mitigation-v2.json`:
  `07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3`.
- `route-eval-holdout-v1.json`:
  `32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87`.

C09 was still 0/9: six direct-status results, one context-research result, and two valid
model-matched no-output failures. No additional corpus-driven tuning or paid rerun is authorized.
A2 remains blocked.

Independent-review handoff:
[`PHASE_A_POST_MITIGATION_HANDOFF_2026-07-25.md`](./PHASE_A_POST_MITIGATION_HANDOFF_2026-07-25.md).
It asks the next agent to verify the evidence and challenge whether an evidence-bearing
project-scope preflight is the last legitimate bounded experiment or whether Phase A should stop.

## Step 2 — Held-out route score (complete — 15/15, fast path only)

The production read and pre-output labeling are complete. The five-case corpus is frozen at
`corpus/phase-a-holdout.json`, SHA-256 `7d791e002c1843e39608d6f53399cc71ce309241f394755b10a95638030d6343`.

1. Pull the three previously-labeled candidates (C03 `direct/status_summary`, C05
   `direct/simple_read`, C10 `direct/status_summary`) plus 2–3 fresh completed chat requests
   never seen during prompt work, from `chat_sessions` / `chat_turn_runs`.
2. Anonymize them the same way as the frozen eight; keep one-way 12-character `turn_ref_hash`
   values and drop raw ids.
3. Label routes and reason codes **before** looking at any model output.
4. Write them to
   `packages/agent-orchestrator/src/testing/harness/corpus/phase-a-holdout.json` matching
   `HoldoutCorpusSchema` (`status: "holdout"`, `corpus_version: "phase-a-holdout-v1"`,
   `scored_against_prompt_version: "phase-a-route-prompt-v5"`, 3–8 scenarios).
5. Scored once, cold:

```bash
cd apps/web && pnpm test:agentic:phase-a-route-holdout
# writes /tmp/buildos-phase-a-route-holdout-v1.json
```

Result: 15/15 routes and reasons, zero reviewer calls, 938/1,572 ms p50/p95, $0.008147 total model
cost, and zero infrastructure-invalid calls. It did not gate the first pass. Never tune the prompt
against this set — the moment you do, it stops being held out and a v2 set is needed.

## Step 3 — Evaluation-only non-ZDR transport opt-in (complete, no paid call)

Completed 2026-07-25 without making a provider request. SmartLLM now has an explicit
`evaluationOnlyAllowNonZdr` option. Its default remains `data_collection: deny` plus `zdr: true`;
the opt-in keeps data collection denied and omits only the ZDR routing constraint. The Phase A
worker enables it only on the pinned DeepSeek researcher adapter. Route, transition, synthesis,
production, and unrelated test calls retain the safe default.

Focused tests cover both policies, the full SmartLLM package is green at 70/70, and SmartLLM plus
worker typechecks pass. The per-role pin check is unchanged and still rejects a fallback: non-ZDR
makes the endpoint reachable; it does not make a substituted model scoreable.

## Step 4 — Workflow cohort (blocked; do not run)

```bash
cd apps/worker && pnpm test:phase-a-workflow
# writes /tmp/buildos-phase-a-workflow-eval.json
```

Exactly C06/C07/C08 × three. Neither ZDR-invalid attempt may be reused as a scored run. Apply the
one-replacement rule independently per logical run. Retain every model-matched timeout, tool
failure, partial output, and all operational spend.

Before pairing anything, check:

- `summary.overall.scoredRunCount === 9`
- `summary.overall.mutationCallCount === 0`
- `summary.costBoundPassed` — model-only, against $0.022479
- `summary.allInCostBoundPassed` — model + tool, reported not gated
- `summary.latencyP50BoundPassed` / `latencyP95BoundPassed` — `null` means no sample, not a failure
- per-run `transitionModelCalls` / `forcedTransitions` — expect mostly forced

**Cost expectation, stated in advance so it is not rationalized afterwards:** the two ZDR-invalid
C06 attempts cost $0.01397 and $0.00985 of model spend with the researcher contributing zero
tokens. Removing the rubber-stamp transition call recovers roughly $0.0016–$0.0033 per gate, but a
full run still adds a DeepSeek researcher and a larger synthesis. A model-only mean at or slightly
above $0.022479 is a plausible outcome. If the cost bound fails while blind wins pass, that is a
**Change**, and the mitigation is a cheaper synthesis model or a smaller synthesis budget — not a
threshold revision.

## Step 5 — Blind packet, DJ scoring, panel (paid for the panel, ~$0.05)

1. Canonicalize and hash the nine scored workflow results.
2. Generate the nine pairs with the counterbalanced `phase-a-a2-blind-v2` mapping. Store the
   lane mapping in a separate file from the comparison packet.
3. `buildDjScoringMarkdown` produces DJ's packet. **DJ scores all nine before the panel runs and
   before seeing any lane identity.** The mapping is deterministic and derivable, so this step is
   honour-based — do not compute it while scoring.
4. Run the three pinned judges, aggregate by majority, then validate ≥7/9 agreement with DJ and no
   complete scenario inversion.
5. Count workflow wins only where machine eligibility permits.

## Step 6 — Write `PHASE_A_RESULTS.md`

Must contain, in addition to the frozen decision:

- Route accuracy on the frozen eight **and** on the held-out set, side by side.
- Plan-critical reason accuracy.
- Blind wins overall **and** C06+C08 alone, with C07 reported separately and labelled as a
  crashed-control comparison.
- Model-only and all-in cost for both lanes.
- The pre-registered secondary line: panel wins ignoring the machine gate, and required-check pass
  rate per lane.
- A **"what Phase A did and did not test"** section. As built, Phase A tests bounded specialists,
  code-enforced citations, and deterministic context retrieval against a context-heavy agent. It
  does **not** test decision gates, replanning, parallel scheduling under contention, joins,
  durability, or permissions-at-execution. Those remain Phase B claims and must not be narrated as
  Phase A evidence.
- What surprised us.

---

## Standing constraints

- Commit with explicit pathspecs. The repo has unrelated staged and unstaged work; never
  `git add -A`, never reset or restore broad paths.
- The frozen corpus, its labels, its acceptance checks, and the snapshot do not change. Any
  correction is a new corpus version with a recorded rationale.
- Once the first workflow output is scored, the blind mechanic is locked. Changing it after that
  point invalidates the comparison.
- Phase B is not authorized by anything in this document.

## Open questions for DJ (none blocking)

1. **If cost fails but quality wins.** The frozen rule calls that Change. The cheapest real
   mitigation is dropping synthesis from GLM 5.2 `powerful` to a cheaper text model — a pin change
   requiring a full cohort rerun. Worth deciding before spending, not after.
