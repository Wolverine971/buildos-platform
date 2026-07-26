<!-- docs/architecture/agent-first-orchestration/A1_ROUTE_MITIGATION_V2.md -->

# A1 routing mitigation v2 — pre-registration

**Frozen:** 2026-07-25, before any v2 model output
**Purpose:** remediate the prompt-v5 A1 `Change` without a fifth prompt pass against the frozen
eight. This document freezes the policy, inputs, models, sample sizes, and decision rule for one
confirmation run plus one cold holdout score.

## Hypothesis

The prompt-v5 failure came from asking a reviewer to emit another complete route proposal. That
left two model outputs able to choose control flow and skipped review entirely when the primary
already chose `workflow`—the exact C09 failure mode.

Mitigation v2 separates semantic uncertainty from control flow:

1. Gemini remains the fast primary classifier.
2. A primary `capability_gap` stays on the fast path.
3. A supplied URL is an observable code fact and compiles to
   `workflow/single_source_research` without a reviewer.
4. An otherwise uncontested direct or clarify result stays on the fast path.
5. Every research workflow proposal, and every direct/clarify proposal that conflicts with
   explicit research intent, invokes GLM with a separate strict prompt. A non-research
   `multi_step_synthesis` proposal stays on the primary path because the Phase A scope classifier
   is deliberately research-only. GLM may return only
   `schema_version`, one semantic `classification`, and `confidence`. It cannot return a route,
   reason code, question, agent, objective, or workflow plan.
6. Code maps the semantic class to the route and reason, emits the clarification question when
   scope is missing, and derives workflow topology from observable request features.
7. A primary schema failure retains the existing one-invocation full-route GLM fallback. Both the
   primary route call and narrow scope call retain one bounded schema repair.

The deterministic mapping is frozen as follows:

| Semantic classification           | Compiled route / reason                      |
| --------------------------------- | -------------------------------------------- |
| `bounded_project_read`            | `direct / simple_read`                       |
| `project_status_or_priority_read` | `direct / status_summary`                    |
| `self_contained_research`         | `workflow / multi_source_research`           |
| `current_project_then_research`   | `workflow / context_research_recommendation` |
| `missing_required_scope`          | `clarify / missing_required_context`         |
| supplied URL (observed by code)   | `workflow / single_source_research`          |

Reason-code agreement remains diagnostic because `observable-request-features-v1`, not a reason
label, selects workflow topology.

## Frozen artifacts

| Artifact                 | Version / SHA-256                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Primary prompt           | `phase-a-route-prompt-v5` / `fb5ac267d57d02c2a5783747b1dd1e917b4f7881017b3a6d50976f2d3275f2f8`   |
| Review policy            | `phase-a-route-review-v2`                                                                        |
| Narrow scope prompt      | `phase-a-workflow-scope-v1` / `05e23f0f48f51aaf6c68e8083bb240ee892e57fd11e51108bb1f7242529cfe12` |
| Review policy source     | `721a2f0fa332bef73571e5a5a95f765db876053c9c6c278967e825d192684793`                               |
| Scope-classifier source  | `4650813d586755d7ca18d3a4e602c6534667f4074bcc9f1ff8f3348a4696fb3c`                               |
| Frozen route corpus      | unchanged `phase-a-frozen-v1`                                                                    |
| Held-out corpus          | `phase-a-holdout-v1` / `7d791e002c1843e39608d6f53399cc71ce309241f394755b10a95638030d6343`        |
| Shared project snapshot  | `be9feaeade4134285f891f857ca02aad0a74cd1c890ba774c2b9ea1fa398af6c`                               |
| Workflow topology policy | `observable-request-features-v1`                                                                 |

The held-out corpus contains five anonymized production-derived requests, labeled before any v2
model output: the previously labeled C03, C05, and C10 alternatives plus two fresh completed
requests captured on 2026-07-23. Only one-way 12-character turn hashes are retained. No raw user,
session, project, entity, or message IDs are stored.

## Models and transport

- Primary: `google/gemini-3.1-flash-lite`, SmartLLM `fast` profile.
- Scope reviewer and primary-failure fallback: `z-ai/glm-5.2`, `powerful` profile.
- OpenRouter provider data collection remains denied. The route evaluation does not use the
  evaluation-only non-ZDR exception reserved for the A2 DeepSeek researcher.
- Per-role model pins, usage events, provider-pre-inference rejection detection, and the one
  infrastructure replacement rule are unchanged.

## One-shot evaluation and decision

There may be no code, prompt, label, corpus, snapshot, model-pin, or threshold edit between these
two commands:

```bash
cd apps/web
pnpm test:agentic:phase-a-route-mitigation-v2
pnpm test:agentic:phase-a-route-holdout
```

1. Frozen confirmation: eight scenarios × nine independent calls = 72 scored logical runs.
2. Cold holdout: five scenarios × three independent calls = 15 scored logical runs.
3. No majority smoothing. Infrastructure-invalid calls get one replacement; their spend remains.
4. Frozen decision rule is unchanged: **Go candidate at ≥65/72 routes; Change at 54–64/72; Stop
   below 54/72.** Comparison reason accuracy is diagnostic.
5. The holdout is reported separately and does not gate its first pass, as pre-registered in
   amendment 1.5. Its exact score is evidence and may not trigger tuning against this corpus.
6. The prior direct projected-TTFT bounds remain reported: p50 ≤11,100 ms and p95 ≤14,800 ms.
7. A2 remains blocked unless the frozen confirmation is a Go candidate, both reports are retained
   unchanged, no pin or infrastructure invariant is violated, and no mutation occurs.

The expected incremental model spend is approximately $0.10–$0.16. This estimate is not a gate.

## Recorded result — Change

Both one-shot runs completed on 2026-07-25 with no edit between them.

| Measure                              |   Frozen confirmation |          Cold holdout |
| ------------------------------------ | --------------------: | --------------------: |
| Scored logical runs                  |                 72/72 |                 15/15 |
| Correct top-level route              |         61/72 (84.7%) |          15/15 (100%) |
| Exact reason code                    |         61/72 (84.7%) |          15/15 (100%) |
| Comparison-scenario reason code      |         25/27 (92.6%) |                     — |
| Reviewed calls                       |                    23 |                     0 |
| Model-matched output/schema failures |                     2 |                     0 |
| Infrastructure-invalid calls         |                     0 |                     0 |
| Latency p50 / p95                    |     1,221 / 21,269 ms |        938 / 1,572 ms |
| Mean / total model cost              | $0.001150 / $0.082816 | $0.000543 / $0.008147 |
| Recorded decision                    |            **Change** |         reported only |

The frozen result missed the unchanged 65/72 Go bound. Direct-expected route latency was
1,057/1,880 ms p50/p95; adding the frozen control anchors projects to 9,917/11,729 ms, inside both
bounds.

C01, C02, C04, C06, and C12 were 9/9. C07 and C08 were each 8/9. C09 remained 0/9: six calls
compiled `direct/status_summary`, one compiled `workflow/context_research_recommendation`, and two
scope-review calls exhausted the model's output budget and produced no decision. Those two calls
are model-matched failures and remain scored under the frozen rule; neither is infrastructure
invalid.

The holdout result is genuine but narrow. All 15 calls stayed on the Gemini fast path and no scope
reviewer ran. It demonstrates no regression on held-out direct/status and capability-gap requests;
it does not provide held-out evidence for the v2 scope classifier. No tuning or rerun follows from
either corpus. A2 remains blocked.

Canonical reports:

- `route-eval-mitigation-v2.json`, SHA-256
  `07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3`.
- `route-eval-holdout-v1.json`, SHA-256
  `32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87`.
