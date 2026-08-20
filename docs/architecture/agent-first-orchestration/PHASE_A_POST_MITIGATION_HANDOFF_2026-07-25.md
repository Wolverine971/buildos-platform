<!-- docs/architecture/agent-first-orchestration/PHASE_A_POST_MITIGATION_HANDOFF_2026-07-25.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase A post-mitigation handoff — independent review requested

**Date:** 2026-07-25
**Audience:** a fresh agent evaluating the Agent-First Orchestration experiment
**Decision state:** A1 is **Change**, A2 is blocked, Phase B is not authorized
**Primary question:** should missing project scope move from model classification to a bounded,
evidence-bearing preflight, or has Phase A gathered enough evidence to stop?

## Your assignment

Independently evaluate the current evidence and recommend the next legitimate step. Do not assume
the recommendation in this handoff is correct merely because it is written here.

Your review should answer four questions:

1. Does the canonical evidence support the recorded A1 `Change` and the decision to keep A2
   blocked?
2. Is C09 primarily a prompt/model problem, an information-availability problem, a route-contract
   problem, or some combination?
3. Is the proposed evidence-bearing scope preflight the smallest principled next experiment?
4. If not, should Phase A stop, repin the classifier under a fresh protocol, or revise the route
   contract under a new versioned experiment?

Produce a short review memo with an explicit `agree`, `agree with changes`, or `disagree`
disposition. Separate what the artifacts prove from your architectural judgment.

## Hard stop and authority boundary

This handoff authorizes inspection and analysis only. It does **not** authorize:

- running the A2 workflow cohort or blind judges;
- starting Phase B or building durable orchestration infrastructure;
- another paid model call;
- tuning against the frozen or held-out route corpora;
- changing a frozen label, threshold, report, or canonical result;
- production writes, migrations, queues, UI work, or a rollout;
- staging or committing the dirty worktree.

If you recommend a new paid evaluation, specify its fresh corpus, model pins, sample size, bounds,
and stop rule before requesting authorization to run it.

## What this project and feature are

The broader project asks whether BuildOS should build an independent agent-first runtime beside
the existing context-heavy Agentic Chat path. The proposed system uses a lightweight CEO router,
bounded specialists, typed artifacts, deterministic permissions and transitions, and durable
workflow state.

Phase A is deliberately disposable falsification work. It asks whether the model-behavior premise
is good enough to justify durable engineering. It does not build the production runtime.

The feature under review is the A1 route mode:

```text
lightweight world card + request
                |
                v
      direct | workflow | clarify | capability_gap
                |
                v
 deterministic decision/workflow compiler
```

Simple reads must stay fast. Complex research must select the right workflow. Missing user scope
must produce a clarification instead of invented work. Unavailable capabilities must fail
honestly.

## Current state in one page

- A0 contracts, corpus, project fixture, baselines, model pins, and decision thresholds are built.
- A1 has run multiple model and policy experiments. The current recorded result is `Change`.
- Workflow topology is now selected by code from observable request features, not a model reason
  label.
- A2's disposable workflow lane, fresh control cohort, blind machinery, and evaluation-only
  non-ZDR transport are implemented, but **zero workflow outputs are scored**.
- The A2 comparison is blocked because A1 did not reach the frozen route bound.
- No Phase B durability, queue, database, permission-at-execution, or UI claim has been tested.
- Nothing from this work is committed. The repository contains unrelated staged and unstaged
  changes; use explicit pathspecs if DJ later requests a commit.

## Frozen decision rule relevant to this review

The A1 top-level route gate is unchanged:

| Result band   | Correct routes |
| ------------- | -------------: |
| Go candidate  |         ≥65/72 |
| Change        |       54–64/72 |
| Stop/diagnose |         <54/72 |

Every call is scored independently; there is no majority smoothing. Model-matched timeouts,
schema failures, tool failures, and empty outputs are valid product outcomes. Only provider
failure before inference, exact-model mismatch, or harness failure is infrastructure-invalid and
eligible for one replacement.

Reason-code agreement is now diagnostic because reason labels no longer select workflow topology.
The direct projected-TTFT bounds remain 11,100 ms p50 and 14,800 ms p95.

## Latest policy under test

`phase-a-route-review-v2` keeps Gemini 3.1 Flash Lite as the fast primary and uses GLM 5.2 only
for research-scope resolution or a primary schema failure.

The intended control split is:

1. A primary capability gap stays on the fast path.
2. A supplied URL is observable in code and compiles directly to single-source workflow.
3. An uncontested direct or clarify decision stays on the fast path.
4. A research workflow, or direct/clarify result conflicting with explicit research intent, calls
   a narrow GLM scope classifier.
5. That classifier may return only one semantic classification and confidence. Code owns the
   route, reason, question, and workflow topology.
6. Genuine non-research `multi_step_synthesis` remains outside this research-only classifier.

The scope classifications are:

- `bounded_project_read`
- `project_status_or_priority_read`
- `self_contained_research`
- `current_project_then_research`
- `missing_required_scope`

This is materially narrower than the v1 reviewer, but the latest score shows that narrowing the
output contract did not make the underlying missing-scope judgment reliable.

## Canonical evidence

Do not edit or reformat these JSON files; their exact bytes are hashed.

| Artifact                        | Purpose                                       | SHA-256                                                            |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `route-eval-v5.json`            | Audited prompt-v5 confirmation                | `f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20` |
| `route-eval-mitigation-v2.json` | Full 72-run fact/code mitigation confirmation | `07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3` |
| `route-eval-holdout-v1.json`    | One-shot five-case cold holdout               | `32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87` |
| `phase-a-holdout.json`          | Pre-output holdout requests and labels        | `7d791e002c1843e39608d6f53399cc71ce309241f394755b10a95638030d6343` |
| `project-alpha.snapshot.json`   | Shared anonymized project fixture             | `be9feaeade4134285f891f857ca02aad0a74cd1c890ba774c2b9ea1fa398af6c` |

Latest results:

| Measure                         | Prompt v5         | Mitigation v2     | Cold holdout        |
| ------------------------------- | ----------------- | ----------------- | ------------------- |
| Correct top-level route         | 58/72 (80.6%)     | 61/72 (84.7%)     | 15/15 (100%)        |
| Comparison reason agreement     | 22/27 (81.5%)     | 25/27 (92.6%)     | —                   |
| Direct route p50 / p95          | 1,016 / 1,174 ms  | 1,057 / 1,880 ms  | —                   |
| Projected direct TTFT p50 / p95 | 9,876 / 11,023 ms | 9,917 / 11,729 ms | —                   |
| Overall latency p50 / p95       | —                 | 1,221 / 21,269 ms | 938 / 1,572 ms      |
| Reviewed results                | 19                | 23                | 0                   |
| Infrastructure-invalid calls    | 0                 | 0                 | 0                   |
| Total model cost                | $0.084033         | $0.082816         | $0.008147           |
| Decision                        | **Change**        | **Change**        | reported, not gated |

The v2 confirmation and holdout ran once with no code, prompt, corpus, label, pin, or threshold
edit between them.

## The decisive failure: C09

C09 asks to find planned content-production work and says, “Please research this,” while the
current fixture is a response-speed training project with no content-production scope. Its frozen
label is `clarify/missing_required_context`.

Observed behavior:

- Prompt v5: 0/9. The primary consistently selected a context-research workflow, and the old
  review trigger did not inspect workflow decisions.
- Mitigation v2: 0/9. Six calls compiled `direct/status_summary`, one compiled
  `workflow/context_research_recommendation`, and two GLM scope calls exhausted their output budget
  and produced no decision.

The two no-output calls expose a secondary 300-token/reasoning-model budget problem. Raising that
budget would not address the primary failure: six valid model responses confidently chose project
status instead of missing scope.

This matters because the incorrect category changed after the policy change, but correctness did
not. The system moved from “research the wrong project” to mostly “summarize the wrong project.”
That is evidence that the unresolved variable is not merely output schema or route vocabulary.

## What the holdout does and does not establish

The five-case holdout scored 15/15, which is useful evidence. It includes three previously labeled
alternatives and two fresh production-derived requests, with labels frozen before output.

However, all 15 calls stayed on Gemini's fast path. The scope reviewer ran zero times. Therefore:

- it supports fast-path non-regression for direct/status and capability-gap requests;
- it does not independently validate the v2 scope classifier;
- it cannot override the failed 61/72 frozen gate;
- it must not be used for another tuning pass.

Treat “15/15 holdout” without that qualification as an overclaim.

## What the evidence supports

The current evidence supports these claims:

1. The fast Gemini path is cheap, low latency, and strong on bounded direct/status and known
   capability-gap requests.
2. Supplied-source routing can be owned by code without a second model.
3. Feature-derived workflow topology removes reason-label plan variance.
4. A narrow semantic classifier improves comparison-scenario reason stability.
5. The current world-card/classifier combination does not reliably identify a requested domain
   that is absent from the current project.
6. A2 and Phase B should remain blocked under the approved rules.

The evidence does **not** establish that:

- the scope classifier generalizes to fresh ambiguous requests;
- another prompt pass or larger output budget would meet the route gate;
- the A2 workflow lane beats the control;
- durable scheduling, replanning, joins, leases, permissions-at-execution, or recovery work;
- the 15/15 holdout turns the overall A1 result into a Go.

## Recommended next legitimate step

My recommendation is a **design-only scope-availability preflight spike**, followed—only if the
design survives review—by a new versioned ambiguity-focused experiment.

Do not begin by changing the prompt or swapping the model. First decide whether the router should
be asked to infer project coverage from a lightweight summary at all.

The proposed preflight would make project-scope availability an evidence-bearing runtime fact:

```text
request with project-relative or research scope uncertainty
                         |
                         v
      bounded deterministic project-scope probe
      - searches allowed project records only
      - returns matched entity/artifact references
      - returns present | absent | unknown
      - carries no mutation or external-web authority
                         |
                         v
             code-owned route decision
      present + external evidence needed -> workflow
      present + bounded read             -> direct
      absent or safely unknown           -> clarify
```

This could reuse the deterministic librarian/retrieval boundary, but it needs its own explicit
contract. A possible draft is:

```text
ScopeAvailability {
  schema_version
  requested_scope_terms
  coverage: present | absent | unknown
  matched_project_entity_ids
  evidence_refs
  confidence_basis
}
```

The exact shape is not approved. The receiving agent should determine whether it can be bounded,
deterministic, and corpus-independent without smuggling C09-specific terms into code.

### Why I think this is the best next step

1. **It addresses the repeated root failure.** C09 has failed every relevant confirmation. The
   model changes which wrong route it selects because it lacks a reliable project-coverage fact.
2. **It moves an invariant into code.** “Do not research or summarize an unrelated project” is a
   safety/usefulness rule, not a prose-style preference. Evidence and control flow are easier to
   audit than another model label.
3. **It preserves the good fast path.** The holdout and direct latency results argue against
   burdening every request. The probe should run only on bounded scope uncertainty.
4. **It aligns with the agent-first design.** The architecture already has a deterministic
   librarian and typed provenance. Reusing that boundary is more coherent than adding another
   unconstrained classifier.
5. **It is scientifically cleaner.** The frozen eight and current holdout are exhausted for
   tuning. A new mechanism can be evaluated on a fresh ambiguity-focused corpus frozen before
   implementation/output.
6. **It is cheap to falsify.** A contract/design spike and deterministic tests can show whether
   the idea is coherent before another paid run or any durable engineering.

## Required protocol if the recommendation survives review

The next agent should propose, but not execute without approval, this sequence:

1. Write a short ADR defining whether scope availability is a route input, a preflight operation,
   or a first workflow gate. State how it affects the existing top-level route contract.
2. Define the minimum typed result and exact evidence sources. Keep the permission ceiling
   project-read-only and token/record bounded.
3. Freeze a **new** ambiguity-focused corpus before implementation or model output. It should
   contain both matched and mismatched project domains, with and without words such as “research,”
   plus global/project contexts. Do not reuse C09 as the scored development target.
4. Pre-register new sample counts, route/latency bounds, invalid-run handling, and stop conditions.
5. Implement the smallest throwaway preflight and deterministic tests.
6. Request explicit approval before any paid score.
7. Only discuss unblocking A2 if the new versioned route gate passes and the relationship between
   the new gate and the original 65/72 rule is explicitly resolved.

### Suggested stop rule

If a bounded scope probe cannot distinguish `absent` from `unknown` without a broad model call,
full project-context load, or corpus-shaped keyword rules, recommend **Stop** for the current Phase
A architecture rather than another prompt cycle.

## Alternatives to evaluate—and why they are not my recommendation

### Run A2 now

Reject under the current protocol. The pre-registered A1 gate failed, and A2 has zero scored
workflow outputs. Running it would convert a falsification gate into an optional suggestion.

### Lower the 65/72 bound or relabel C09

Reject. Both would be post-result changes to approved ground truth. If the route contract itself
is wrong, version it openly and create a new corpus; do not rewrite this result.

### Increase the GLM scope output budget

It may remove the two no-output failures, but six other C09 calls returned valid wrong decisions.
This is a secondary reliability fix, not a sufficient route mitigation.

### Repin or prompt-tune the scope classifier

Possible only under a fresh, pre-registered experiment. It is not the preferred first move because
the current defect concerns what project evidence exists, and repeated model/prompt changes have
already produced unstable categories on the same request.

### Add a C09-specific regex or domain blacklist

Reject. It would encode the answer key and reproduce the audit's earlier corpus-shaped prompting
problem in code.

### Stop Phase A now

Legitimate. If the proposed preflight cannot be defined cleanly, the honest conclusion is that the
tested lightweight-router architecture did not clear its route gate. The handoff's recommendation
is one bounded design review before making that call, not an unlimited remediation loop.

## Independent audit checklist

- [ ] Recompute SHA-256 for the canonical route reports and holdout fixture.
- [ ] Confirm 72/72 and 15/15 scored logical-run counts and zero infrastructure-invalid calls.
- [ ] Recompute the 61/72 route score and per-scenario breakdown.
- [ ] Inspect all nine C09 records, including the two model-matched no-output failures.
- [ ] Confirm the holdout has `reviewedCount === 0`.
- [ ] Confirm prompt v5, review v2, and scope-prompt hashes match the pre-registration.
- [ ] Confirm no **scored** A2 workflow result, blind packet, or judge result exists; retain the
      earlier ZDR-invalid diagnostic as non-scored evidence.
- [ ] Inspect whether the current world card contains enough semantic evidence to justify an
      `absent` scope judgment.
- [ ] Challenge whether the proposed preflight preserves the direct latency boundary.
- [ ] State whether another experiment is warranted or Phase A should stop.

Useful read-only commands:

```bash
cd /Users/djwayne/buildos-platform

shasum -a 256 \
  packages/agent-orchestrator/src/testing/harness/results/route-eval-mitigation-v2.json \
  packages/agent-orchestrator/src/testing/harness/results/route-eval-holdout-v1.json \
  packages/agent-orchestrator/src/testing/harness/corpus/phase-a-holdout.json

jq '.summary' \
  packages/agent-orchestrator/src/testing/harness/results/route-eval-mitigation-v2.json

jq '[.runs[] | select(.scenarioId == "a0-c09-missing-content-scope") |
  {runIndex, actualRoute, actualReasonCode, reviewed, repaired, error}]' \
  packages/agent-orchestrator/src/testing/harness/results/route-eval-mitigation-v2.json

jq '.summary.overall.reviewedCount' \
  packages/agent-orchestrator/src/testing/harness/results/route-eval-holdout-v1.json

pnpm --filter @buildos/agent-orchestrator test:run
pnpm --filter @buildos/agent-orchestrator typecheck
```

Do not run either paid route command while auditing.

## Reading order

1. [`README.md`](./README.md) — high-level product and architecture thesis.
2. [`PHASE_A_FALSIFICATION_PLAN.md`](./PHASE_A_FALSIFICATION_PLAN.md) — frozen experiment and
   amendments.
3. [`PHASE_A_AUDIT_2026-07-25.md`](./PHASE_A_AUDIT_2026-07-25.md) — why the original route Go was
   reopened.
4. [`A1_ROUTE_MITIGATION_V2.md`](./A1_ROUTE_MITIGATION_V2.md) — v2 pre-registration and result.
5. [`A1_ROUTE_RESULTS.md`](./A1_ROUTE_RESULTS.md) — route experiment history.
6. [`NEXT_ITERATION.md`](./NEXT_ITERATION.md) — current operational stop.
7. [`A2_PROGRESS.md`](./A2_PROGRESS.md) — built-but-blocked workflow state.
8. [`results/README.md`](../../../packages/agent-orchestrator/src/testing/harness/results/README.md)
   — canonical result index.

Implementation surfaces:

- Route policy:
  `packages/agent-orchestrator/src/application/route-mode/route-mode-with-review.ts`
- Narrow scope classifier:
  `packages/agent-orchestrator/src/application/route-mode/workflow-scope.ts`
- Code-derived workflow topology:
  `packages/agent-orchestrator/src/application/route-mode/workflow-plan.ts`
- World card:
  `packages/agent-orchestrator/src/application/route-mode/world-card.ts`
- Route evaluation harness:
  `apps/web/src/lib/tests/agentic-e2e/phase-a/route-mode-eval.test.ts`
- Corpus and report schemas:
  `packages/agent-orchestrator/src/testing/harness/{corpus-schema,route-eval-report}.ts`

## Expected review deliverable

Return a memo containing:

1. **Evidence verdict:** whether the canonical reports and recorded Change are internally valid.
2. **Root-cause judgment:** classifier, missing evidence, route contract, or mixed.
3. **Recommendation:** preflight spike, fresh classifier experiment, contract revision, or Stop.
4. **Why:** concrete evidence and tradeoffs, including what would falsify the recommendation.
5. **Protocol:** the smallest next artifact/corpus/test needed, with explicit actions that remain
   unauthorized.

Do not merely summarize the existing docs. The value of this handoff is an independent decision
about whether one more bounded experiment is warranted.
