<!-- docs/architecture/agent-first-orchestration/A1_ROUTE_RESULTS.md -->

# Slice A1 route evaluation

**Status:** **A1 routing mitigation v2 = Change** — 61/72 correct frozen routes, below the 65/72
bound. The first cold holdout scored 15/15 but exercised only the fast path. Direct latency passed;
A2 remains blocked. See [`A1_ROUTE_MITIGATION_V2.md`](./A1_ROUTE_MITIGATION_V2.md).
**Mitigation-v2 run completed:** 2026-07-25T16:15:27.371Z
**Holdout run completed:** 2026-07-25T16:15:59.337Z
**Prompt-v5 run completed:** 2026-07-25T15:03:09.666Z
**Final v4 run completed:** 2026-07-25T03:54:24.920Z
**Corpus:** `phase-a-frozen-v1`
**Route strategy:** Gemini 3.1 Flash Lite `fast` → bounded GLM 5.2 `powerful` review

> **Reopened, and why.** Two audit findings apply to everything below.
>
> 1. **The 72/72 is a training-set score.** Prompt v4 carried three numbered scope rules that
>    paraphrase C01, C08, and C09 — one near-verbatim — after four tuning passes against these same
>    eight labeled scenarios, with no held-out set anywhere in Phase A. The _latency_ result is
>    unaffected and real: 0 of 27 direct-expected calls invoked GLM, at 898/1,310 ms p50/p95.
> 2. **Reason codes were treated as diagnostic, but A2 compiles the execution plan from them.**
>    In the run below C06 selected its labeled reason code 2/9 times and C07 **0/9**, so the
>    workflow lane would have executed a different plan per run and the wrong plan for two of the
>    three comparison scenarios.
>
> Prompt v5 replaces the corpus-shaped rules with general referent tests and an ordered
> reason-code procedure. See [`PHASE_A_AUDIT_2026-07-25.md`](./PHASE_A_AUDIT_2026-07-25.md) B1/B4.

## First scored pass

The pinned CEO router selected the correct top-level route in **54/72 calls (75.0%)**. The
pre-registered Go threshold is **65/72**. This result is exactly the lower edge of the Change
band, so A2 remains blocked while A1 is revised and rerun.

| Measure                         | Result                         |
| ------------------------------- | ------------------------------ |
| Scored route calls              | 72/72                          |
| Correct top-level route         | 54/72 (75.0%)                  |
| Exact reason-code agreement     | 24/72 (33.3%, diagnostic only) |
| Repairs                         | 4                              |
| Final schema failures           | 2                              |
| Infrastructure-invalid runs     | 0                              |
| Route latency p50 / p95         | 2,592 ms / 10,855 ms           |
| Mean / total route cost         | $0.001094 / $0.078734          |
| Providers observed              | CoreWeave, Decart, Fireworks   |
| Mutation or write calls         | 0                              |
| Pre-registered routing decision | **Change**                     |

The canonical report is
[`route-eval-v1.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-v1.json),
SHA-256 `3f75d91718406443921c6717b4a09d3d61ae20133c81ad8aead94680a3df49ed`.

## What failed

Six of the eight scenarios selected the correct top-level route in all nine calls. The two misses
were consistent and explainable:

1. **Project-local referent:** C01 asks what “this in sync score” means. Seven calls chose
   `clarify`, and two ended in schema failure after the one permitted repair. The v1 prompt
   treated a referent absent from the lightweight world card as missing, even though
   `project.read` can resolve it from project records.
2. **Mismatched project scope:** C09 asks for unspecified content-production planning while the
   current snapshot is a response-speed training project. All nine calls chose `workflow`. The v1
   prompt over-weighted “Please research this” and did not require the research target to match or
   be recoverable from the current project identity.

Reason-code agreement was low even when the top-level mode was correct. That exposes overlap in
the diagnostic taxonomy (`simple_read` versus `status_summary`, and the four workflow reasons),
but it does not change the architecture gate: DJ approved top-level mode selection as the frozen
routing metric before the run.

## Second scored pass

Prompt v2 fixed C01 completely but still returned **Change** at **59/72 correct routes (81.9%)**.
It also exposed an invocation problem: the longer decision policy caused GLM 5.2 to consume the
900-token route output budget on reasoning for several long or conflicted requests, requiring 13
repairs and leaving three C07 calls without final JSON.

| Measure                     | Second-pass result             |
| --------------------------- | ------------------------------ |
| Correct top-level route     | 59/72 (81.9%)                  |
| Exact reason-code agreement | 46/72 (63.9%, diagnostic only) |
| Repairs / final failures    | 13 / 3                         |
| Route latency p50 / p95     | 3,140 ms / 24,307 ms           |
| Mean / total route cost     | $0.002248 / $0.161854          |
| Direct route p50 / p95      | 2,315 ms / 4,791 ms            |
| Projected direct p50 / p95  | 11,175 ms / 14,640 ms          |
| Pre-registered decision     | **Change**                     |

C01 improved from 0/9 to 9/9. C09 remained 0/9, splitting between direct and workflow instead of
clarify. C06 lost one route call to clarify, and C07 scored 6/9 because three calls exhausted the
JSON budget after repair. The p95 direct bound passed; p50 missed by about 75 ms.

Canonical second-pass report:
[`route-eval-v2.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-v2.json),
SHA-256 `381ffa915ff1de6e606f7294d4c0dc4e417a4fb9f14f036a32c026f366ce2953`.

## Third scored pass

Prompt v3 plus low reasoning effort returned **61/72 correct routes (84.7%)**, still Change. C09
improved to 9/9 and long-request final JSON failures fell to zero, but project-relative behavior
regressed: C01 fell to 5/9 and C08 to 2/9. The invocation was also slower rather than faster.

| Measure                     | Third-pass result              |
| --------------------------- | ------------------------------ |
| Correct top-level route     | 61/72 (84.7%)                  |
| Exact reason-code agreement | 28/72 (38.9%, diagnostic only) |
| Repairs / final failures    | 4 / 0                          |
| Route latency p50 / p95     | 6,728 ms / 20,934 ms           |
| Mean / total route cost     | $0.001955 / $0.140776          |
| Direct route p50 / p95      | 4,234 ms / 18,070 ms           |
| Projected direct p50 / p95  | 13,094 ms / 27,919 ms          |
| Pre-registered decision     | **Change**                     |

Canonical third-pass report:
[`route-eval-v3.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-v3.json),
SHA-256 `22f58e6f234a15a382177a0f933bdd9cb2b313176ef663c0e3f9ddc9067fa59e`.

## Fourth single-model pass

The consolidated v4 prompt solved GLM's classification problem at **70/72 correct routes
(97.2%)**, but the single-model path remained too slow. Direct route latency was 3,972 ms p50 and
5,842 ms p95, projecting to 12,832 ms and 15,691 ms after the control anchors. Both frozen direct
bounds failed. Two workflow calls also exhausted both 60-second attempts.

The result was therefore **Change**, despite passing route accuracy. Canonical report:
[`route-eval-v4.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-v4.json),
SHA-256 `4fcf67e2d15309d14d0faf53035896543b26062a8b322083e90429d6863a9f31`.

## Route-strategy change

Prompt tuning stopped after v4. Two 24-call fast-model pilots then tested the concrete latency
mitigation:

| Candidate                         | Correct routes |  Direct p50 / p95 | Result                      |
| --------------------------------- | -------------: | ----------------: | --------------------------- |
| Gemini 3.1 Flash Lite alone       |  19/24 (79.2%) |  1,044 / 1,260 ms | Reject: accuracy            |
| DeepSeek V4 Flash alone           |  17/24 (70.8%) | 1,406 / 12,304 ms | Reject: accuracy and tail   |
| Gemini → bounded GLM review pilot |   24/24 (100%) |    929 / 1,200 ms | Full confirmation candidate |

The hybrid reviewer runs only when the fast primary exhausts its bounded repair or returns
`direct`/`clarify` despite explicit research intent. Routine direct requests never call GLM. The
policy and amended pins were frozen in ADR 0001 before the full confirmation.

## Final A1 confirmation

The full 72-call hybrid run passed every A1 routing and direct-latency bound.

| Measure                         | Final result                   | Bound                          | Status |
| ------------------------------- | ------------------------------ | ------------------------------ | ------ |
| Correct top-level route         | 72/72 (100%)                   | ≥65/72                         | Pass   |
| Direct route p50 / p95          | 898 / 1,310 ms                 | route budget ≈2,240 / 4,950 ms | Pass   |
| Projected direct TTFT p50 / p95 | 9,758 / 11,159 ms              | ≤11,100 / 14,800 ms            | Pass   |
| Exact reason-code agreement     | 38/72 (52.8%, diagnostic only) | Not gated                      | —      |
| Overall route latency p50 / p95 | 1,014 / 6,891 ms               | Not gated                      | —      |
| Mean / total route cost         | $0.001102 / $0.079365          | Not gated                      | —      |
| Infrastructure-invalid runs     | 0                              | 0 expected                     | Pass   |
| Mutation or write calls         | 0                              | 0 required                     | Pass   |

The canonical A1 report is
[`route-eval-fast-review-v1.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-fast-review-v1.json),
SHA-256 `ab886492a6a788eede2bc64c3c8692bc9fd362ef492ecab69930d217eb78d378`.

This passed every bound that was gated at the time. It is **not** an A1 exit: under the 2026-07-25
amendment a route-slice Go also requires ≥25/27 plan-critical reason codes, which this run does not
meet. Observed reason codes on the three comparison scenarios were:

| Scenario | Labeled reason                    | Observed across 9 calls                                                      |
| -------- | --------------------------------- | ---------------------------------------------------------------------------- |
| C06      | `single_source_research`          | 5× `context_research_recommendation`, 2× `multi_source_research`, 2× correct |
| C07      | `multi_source_research`           | 7× `context_research_recommendation`, 2× `multi_step_synthesis`, 0× correct  |
| C08      | `context_research_recommendation` | 9× correct                                                                   |

Plan-critical total: **11/27**, against a 25/27 bound.

## First-pass direct-path latency projection

Across the 27 calls whose expected route was direct, route latency was 2,478 ms p50 and 14,891 ms
p95. Added to the frozen simple-control anchors, the projected path was:

| Measure | Projection |     Bound | Result           |
| ------- | ---------: | --------: | ---------------- |
| p50     |  11,338 ms | 11,100 ms | Miss by 238 ms   |
| p95     |  24,740 ms | 14,800 ms | Miss by 9,940 ms |

The C01 repair calls and schema failures accounted for the first-pass tail. Later sections record
the prompt revisions and the final fast-first mitigation.

## Scoring correction

The first harness process wrote all 72 complete raw results but exited nonzero because its test
assertion accidentally used exact route-plus-reason agreement. The pre-registered rule applies to
the top-level route. Before the result was made canonical, the report decision and assertion were
corrected to use `routeAccuracy`; the raw calls, labels, costs, timings, and outputs were not
changed. Under the frozen rule the result is **Change**, not Stop.

## Next gate

DJ approved [`A2_BLIND_SCORING_PROPOSAL.md`](./A2_BLIND_SCORING_PROPOSAL.md) on 2026-07-25; its
mapping was amended to `phase-a-a2-blind-v2` the same day, before any output was generated.

The v5 rerun is the one authorized prompt change, and it is authorized because the reason-code
taxonomy — not the labels — was the defect. If v5 still misses the plan-critical bound, the fix is
architectural (select the plan from observable request features instead of a model-chosen label),
not a fifth tuning pass against the same eight scenarios. See
[`NEXT_ITERATION.md`](./NEXT_ITERATION.md).

## Prompt-v5 audited rerun

The frozen 72-call rerun completed on 2026-07-25 and returned **Change**. It missed both the route
bound and the then-applicable plan-critical reason bound; direct-path latency remained comfortably
inside its frozen limits.

| Measure                         | Result                | Bound              | Status |
| ------------------------------- | --------------------- | ------------------ | ------ |
| Correct top-level route         | 58/72 (80.6%)         | ≥65/72             | Fail   |
| Plan-critical reason codes      | 22/27 (81.5%)         | ≥25/27             | Fail   |
| Direct route p50 / p95          | 1,016 / 1,174 ms      | ≈2,240 / 4,950 ms  | Pass   |
| Projected direct TTFT p50 / p95 | 9,876 / 11,023 ms     | 11,100 / 14,800 ms | Pass   |
| Reviewed calls                  | 19                    | Reported           | —      |
| Repairs                         | 17                    | Reported           | —      |
| Infrastructure-invalid calls    | 0                     | 0 expected         | Pass   |
| Mean / total model cost         | $0.001167 / $0.084033 | Reported           | —      |

C06 was correct 9/9. C07 was 7/9, with two reviewer decisions changing the request to clarify.
C08 was 6/9, with three reviewer decisions changing it to clarify. C09 was 0/9: the fast primary
consistently chose a context-first workflow for an out-of-scope content-planning request and the
review policy did not review workflow decisions. No infrastructure failure explains the misses.

The canonical report is
[`route-eval-v5.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-v5.json),
SHA-256 `f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20`.

Per the pre-registered fallback, prompt tuning stopped. Workflow plan selection is now decoupled
from the model reason label under `observable-request-features-v1`. This makes the plan stable for
repeated workflow runs, but it does not erase the route failure: A1 remains Change and A2 remains
blocked.

## Routing mitigation v2 and cold holdout

The separately pre-registered fact-classification/code-decision mitigation improved the frozen
score from 58/72 to 61/72, but still missed the unchanged 65/72 Go bound. It therefore records
another **Change**, not a Go.

| Measure                         | Frozen v2             | Holdout v1            |
| ------------------------------- | --------------------- | --------------------- |
| Correct top-level route         | 61/72 (84.7%)         | 15/15 (100%)          |
| Exact reason-code agreement     | 61/72 (84.7%)         | 15/15 (100%)          |
| Comparison reasons              | 25/27 (92.6%)         | —                     |
| Reviewed calls                  | 23                    | 0                     |
| Direct route p50 / p95          | 1,057 / 1,880 ms      | —                     |
| Projected direct TTFT p50 / p95 | 9,917 / 11,729 ms     | —                     |
| Overall latency p50 / p95       | 1,221 / 21,269 ms     | 938 / 1,572 ms        |
| Mean / total model cost         | $0.001150 / $0.082816 | $0.000543 / $0.008147 |
| Infrastructure-invalid calls    | 0                     | 0                     |

C09 remained 0/9 and accounts for nine of the eleven route misses. The scope classifier returned
project status six times and context research once; two model-matched reviewer calls exhausted
their output budget. The held-out set had no reviewer calls, so its 15/15 result establishes
fast-path non-regression only. Both reports remain unchanged and no follow-up prompt/policy tuning
was performed.

Canonical reports and hashes:

- [`route-eval-mitigation-v2.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-mitigation-v2.json):
  `07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3`.
- [`route-eval-holdout-v1.json`](../../../packages/agent-orchestrator/src/testing/harness/results/route-eval-holdout-v1.json):
  `32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87`.
