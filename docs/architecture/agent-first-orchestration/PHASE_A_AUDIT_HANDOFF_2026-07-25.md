<!-- docs/architecture/agent-first-orchestration/PHASE_A_AUDIT_HANDOFF_2026-07-25.md -->

# Phase A audit handoff — work completed through 2026-07-25

> **Superseded 2026-07-25.** This document is the pre-audit state of the world and is retained as
> the record the audit was performed against. The audit is
> [`PHASE_A_AUDIT_2026-07-25.md`](./PHASE_A_AUDIT_2026-07-25.md); the current plan of work is
> [`NEXT_ITERATION.md`](./NEXT_ITERATION.md).
>
> Three claims below did not survive the audit and are corrected there:
>
> 1. "A single GLM 5.2 router could become accurate" — the 72/72 was measured on the same eight
>    scenarios the prompt was tuned against, and the reason codes that A2 compiles its plan from
>    were correct 11/27 on the comparison scenarios.
> 2. "All three C07 runs ended with a model-matched production timeout" — the artifact records a
>    stream error after skill loading, not a timeout.
> 3. "The route compiler fans out C07 into two focused research steps" — observed 2/9 of the time,
>    and those two hardcoded foci restated C07's own acceptance sections.

**Purpose:** Give a new agent enough context to independently inspect the Agent-First
Orchestration Phase A work, reproduce the reasoning from canonical artifacts, identify flaws,
and continue without silently changing the experiment.

**Current state:** A0 and A1 are complete. The A2 implementation and fresh control cohort are
complete. The workflow cohort has no scored outputs yet. DJ approved non-zero-data-retention
provider handling for the anonymized Phase A inputs, but explicitly asked that no transport
change or additional test be run until this audit summary was prepared.

**Important:** Phase A has not produced an overall Go/Change/Stop decision. Phase B is not
authorized by these results.

## Executive summary

Phase A tests one narrow product hypothesis before durable orchestration infrastructure is built:

> A small orchestrator with a lightweight world model and bounded specialists can beat the
> existing context-heavy chat agent on complex read-only work without making simple work too slow.

The work so far established four things:

1. The contracts, frozen corpus, acceptance checks, control baseline, and decision thresholds
   exist and were approved before the scored model work.
2. A single GLM 5.2 router could become accurate but was too slow. A fast-first hybrid—Gemini 3.1
   Flash Lite with a narrowly triggered GLM 5.2 review—passed all 72 route calls and both direct
   latency projections.
3. A disposable in-process workflow lane now exists with a deterministic librarian, bounded
   researcher, concurrent stages, typed artifacts, transition/synthesis calls, budgets, and a
   read-only safety ceiling. Its local package suite last passed 95/95 tests.
4. The fresh production control performed poorly on the frozen complex machine checks. The first
   workflow attempt could not be scored because OpenRouter rejected the DeepSeek V4 Pro researcher
   under the repository's zero-data-retention policy. The invalid-run rule worked as intended.

DJ has now approved proceeding without ZDR for the anonymized Phase A provider payloads. The next
implementation should make that a narrow, explicit evaluation-only opt-in while leaving all
production/default SmartLLM behavior unchanged.

## Scope and non-goals

Phase A is a model-behavior falsification build, not a production orchestration build. It includes
in-process and harness code only. It deliberately excludes:

- database migrations, orchestration tables, RLS, queues, leases, fencing, and reconciliation;
- UI, realtime projections, pause/cancel, and production rollout;
- mutation scenarios or autonomous BuildOS writes;
- imports from the existing cognition, agent-run, deep-research, or tree-agent implementations;
- production fallback policy.

Everything outside `packages/agent-orchestrator/src/contracts/` may be replaced after the
experiment. The contracts are intended to survive into Phase B.

## Approval and freeze log

| Gate or decision          | Recorded outcome                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DJ gate 1 — corpus        | Eight anonymized scenarios and their top-level route labels approved and frozen.                                                                              |
| DJ gate 2 — contracts     | Leaf contracts and bounds approved.                                                                                                                           |
| External-data approval    | DJ approved sending the anonymized Phase A corpus and fixture to hosted Supabase, OpenRouter/model providers, and public research sources.                    |
| DJ gate 3 — thresholds    | Absolute Go/Change/Stop thresholds approved before A1 prompt work and A2 comparisons.                                                                         |
| DJ gate 4 — blind scoring | Exactly nine pairs, deterministic A/B assignment, three pinned judges, DJ scoring all nine first, 7/9 validation, and scenario-inversion protection approved. |
| Data-policy decision      | On 2026-07-25 DJ approved non-ZDR provider handling for the anonymized Phase A inputs. No call was made after that approval.                                  |

The frozen blind-mechanic SHA-256 is
`720a42ef192d961c77068c49aceec24c027cbf633259ddf0b91b73271619f4d8`.

## Frozen decision rule

All of the following are required for a Phase A **Go**:

| Measure                            |  Pass bound |
| ---------------------------------- | ----------: |
| Correct top-level routes           |      ≥65/72 |
| Workflow blind wins                |        ≥6/9 |
| Workflow mean cost per complex run |  ≤$0.022479 |
| Workflow total-duration p50        | ≤193,325 ms |
| Workflow total-duration p95        | ≤297,738 ms |
| Projected direct TTFT p50          |  ≤11,100 ms |
| Projected direct TTFT p95          |  ≤14,800 ms |
| Mutation/write calls               |           0 |

A tie, error, empty output, or required machine-check failure cannot count as a workflow win.
Provider failure before inference, exact-model mismatch, or harness failure is
infrastructure-invalid: retain operational spend, exclude it from scoring, and replace it once.
Model-matched timeouts, tool failures, and poor outputs are valid scored outcomes.

## What was built

### A0 — contracts, corpus, and measurement foundations

- Scaffolded `packages/agent-orchestrator` with dependency-direction fitness coverage.
- Defined bounded Zod contracts for routes, workflow stages and steps, agent results, artifacts,
  state digests, transition decisions, and usage records.
- Froze `phase-a-frozen-v1`: eight anonymized scenarios based on production transcripts plus a
  deterministic project fixture. Labels and machine acceptance checks were frozen before prompt
  tuning.
- Extended the existing web agentic harness to report client-observed TTFT, total duration,
  correlated model usage/cost, machine-check results, errors, and mutation calls.
- Captured the original 12-run production-control baseline and used it to set Gate 3.
- Recorded exact evaluation model pins in ADR 0001.

### A1 — lightweight route mode

- Built a deterministic, bounded world card describing the BuildOS object model, project
  identity, direct capabilities, available specialists, workflow grammar, and permission ceiling.
- Built a validated route call with one bounded schema-repair attempt.
- Built a deterministic compiler from `RouteDecision` into direct/clarify/capability-gap/workflow
  behavior.
- After four full GLM prompt passes and two fast-model pilots, froze
  `phase-a-route-review-v1`: Gemini Flash Lite is primary; GLM reviews only a primary failure or a
  `direct`/`clarify` answer that conflicts with explicit research intent.

Final route roles:

| Role                   | Pin and policy                              |
| ---------------------- | ------------------------------------------- |
| Route primary          | `google/gemini-3.1-flash-lite`, JSON `fast` |
| Bounded route reviewer | `z-ai/glm-5.2`, JSON `powerful`             |
| Transition             | `z-ai/glm-5.2`, JSON `powerful`             |
| Synthesis              | `z-ai/glm-5.2`, text `quality`              |
| Researcher             | `deepseek/deepseek-v4-pro`, text `quality`  |
| Librarian              | Deterministic code; no model                |

### A2 — disposable workflow lane and comparison machinery

- `deterministic-librarian.ts` constructs a bounded `ContextPacket` from the frozen snapshot. For
  C08 it resolves the project-relative word “this” to the iPhone PVT-baseline task and selects
  both measurement and broad-transfer caveat context.
- `researcher.ts` uses a pure `WebResearchPort`, visits candidate sources, calls the pinned model,
  and validates citations in code. Only URLs actually visited can survive; missing required URLs
  or too few citations make the result partial.
- `workflow-engine.ts` executes ready steps concurrently with `Promise.all`, validates and stores
  typed artifact envelopes, builds a bounded digest, invokes transition, supports the sequential
  C08 librarian→research path, and synthesizes a final answer.
- The engine enforces a maximum of five stages, two replans, wall-clock and USD budgets, read-only
  permission, and a hard stop on any write tool call.
- The route compiler fans out C07 into two focused research steps and supports both
  multi-source-research and multi-step-synthesis workflow reasons.
- The worker paid harness adapts the existing web research implementation into the pure port and
  records exact-model/provider usage, stages, artifacts, tool calls, acceptance, cost, and timing.
- The web paid harness has a fresh A2 control mode for exactly C06/C07/C08 × three, disables
  Vitest retries, permits one infrastructure replacement, and retains model-matched failures.
- Blind-packet code removes lane/model/provider/latency/cost/tool-trace metadata and keeps the
  deterministic A/B mapping separate.
- Blind-judge code freezes the prompt, exact user packet, strict schema, models, aggregation,
  workflow-win eligibility, and DJ validation logic.

## What was tested and measured

No test was rerun while preparing this handoff. The entries below are the last recorded results.

### Local verification

| Area                                               | Last result                              |
| -------------------------------------------------- | ---------------------------------------- |
| `@buildos/agent-orchestrator` Vitest               | 13 files, 95/95 tests green              |
| `@buildos/agent-orchestrator` TypeScript           | Green                                    |
| Worker paid workflow harness standalone TypeScript | Green                                    |
| Relevant web baseline-report tests                 | 3 tests green                            |
| Paid control harness compile/collection            | Green as part of the completed fresh run |
| Diff whitespace check before this handoff          | Green                                    |

The package tests cover contracts and bounds, dependency direction, corpus validity, acceptance
checks, world-card budgets, route parsing/repair/compilation/review triggers, deterministic
librarian retrieval, researcher citation enforcement, workflow waves/budgets/write safety,
report aggregation, A/B packet construction, judge aggregation, and panel validation.

### A0 control baseline

Canonical artifact: `control-baseline-v1.json`.

- 12 intended production-lane runs; 11 clean; one retained C07 bounded timeout.
- Required machine checks passed 5/12.
- Complex C06/C07/C08 control anchors: 96,662/148,869 ms total-duration p50/p95 and
  $0.007493 mean cost.
- Entire cohort: 8,860/12,461 ms TTFT p50/p95 and $0.005232 mean cost.
- Zero mutation calls and hosted test data cleaned up.
- SHA-256: `fc300f90b7376980424c9b4a8a8e4dc83f9d747a773b0585a019ffff41071768`.

### A1 route experiments

| Run                     | Correct routes | Key result                                         | Canonical SHA-256                                                  |
| ----------------------- | -------------: | -------------------------------------------------- | ------------------------------------------------------------------ |
| GLM prompt v1           |          54/72 | Change; C01 and C09 failed                         | `3f75d91718406443921c6717b4a09d3d61ae20133c81ad8aead94680a3df49ed` |
| GLM prompt v2           |          59/72 | Change; more repairs and long-tail failures        | `381ffa915ff1de6e606f7294d4c0dc4e417a4fb9f14f036a32c026f366ce2953` |
| GLM prompt v3           |          61/72 | Change; low reasoning made latency worse           | `22f58e6f234a15a382177a0f933bdd9cb2b313176ef663c0e3f9ddc9067fa59e` |
| GLM prompt v4           |          70/72 | Accuracy passed, both direct latency bounds failed | `4fcf67e2d15309d14d0faf53035896543b26062a8b322083e90429d6863a9f31` |
| Final fast-first hybrid |          72/72 | A1 Go; all route/direct-latency bounds passed      | `ab886492a6a788eede2bc64c3c8692bc9fd362ef492ecab69930d217eb78d378` |

The final hybrid measured 898/1,310 ms direct route p50/p95, projecting to 9,758/11,159 ms
end-to-end direct TTFT. Mean/total route cost was $0.001102/$0.079365. Exact reason-code agreement
was only 38/72 and remains diagnostic, not gated.

The separately labeled 24-call pilots rejected Gemini Flash Lite alone at 19/24 and DeepSeek V4
Flash alone at 17/24. The hybrid pilot was 24/24 before the full confirmation.

### A2 fresh control cohort

Canonical artifact: `control-a2-v1.json`.

| Measure                                   |              Result |
| ----------------------------------------- | ------------------: |
| Runs scored                               |                 9/9 |
| Infrastructure-invalid / replacement runs |               0 / 0 |
| Clean completions                         |                 6/9 |
| Required machine-check passes             |                 0/9 |
| TTFT p50/p95                              |     6,556/14,744 ms |
| Total-duration p50/p95                    |  105,109/198,425 ms |
| Mean/total cost                           | $0.007787/$0.070084 |
| Mutation calls                            |                   0 |

All three C07 runs ended with a model-matched production timeout after the production lane's
internal single retry. They are valid control outcomes. C06 completed but omitted the supplied
URL/citations. C08 completed but missed the two-citation requirement. SHA-256:
`735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338`.

### A2 workflow attempts — invalid, not scored

Canonical diagnostic artifact: `workflow-eval-invalid-zdr-v1.json`.

- The first C06 logical attempt and its one permitted replacement reached the pinned researcher.
- OpenRouter returned 404 because no DeepSeek V4 Pro endpoint matched `zdr: true`.
- The DeepSeek requests produced zero prompt/completion tokens and released their reservations.
- Both attempts are correctly marked infrastructure-invalid; scored workflow runs remain 0.
- Earlier GLM/route/transition work produced $0.023824 of operational spend, retained in the
  diagnostic report.
- A later logical attempt had begun and was deliberately interrupted during diagnosis. It has no
  completed report and is excluded; an auditor should verify that it never enters later pairing.
- SHA-256: `25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca`.

The `false` latency-bound fields in this diagnostic report are caused by having zero scored
duration samples. They are not evidence that the workflow exceeded a latency bound.

## What we learned

1. **The routing idea is viable, but not as one expensive classifier.** GLM became accurate after
   prompt work but did not fit the direct-path latency budget. A cheap primary plus a deterministic
   review trigger preserved accuracy and removed routine GLM latency.
2. **Reason-code taxonomies overlap more than route modes.** Exact reason agreement stayed low
   even when top-level behavior was perfect. Mode selection is currently reliable; diagnostic
   reason codes should not be treated as a semantic ground truth without redesign.
3. **Project-relative requests need deterministic context policy.** C01 and C08 showed that “this”
   should first be resolved through available project reads rather than treated as automatically
   ambiguous. The librarian encodes that lesson without using a model.
4. **The existing control is weak on these complex cases.** The fresh cohort had zero required
   check passes and timed out consistently on C07. This does not itself prove the workflow wins;
   blind comparison and the workflow's own machine eligibility still decide that.
5. **Citations must be enforced outside the model.** The control often produced plausible prose
   without the required sources. The researcher therefore validates that every cited URL was
   actually visited and marks incomplete evidence partial.
6. **Provider policy is part of reproducibility.** An exact model pin is not enough; availability
   also depends on provider data policy. The invalid-run classification prevented a transport
   incompatibility from becoming a misleading quality loss or fallback-model score.
7. **Timeouts must not be sanitized away.** A model-matched timeout is product behavior and stays
   in the denominator. Only failures before inference or harness/model mismatches get one
   replacement.
8. **Safety remained intact so far.** Every measured cohort and diagnostic attempt recorded zero
   mutation calls. Phase A has no authorized write-capable scenarios.

## Audit map

Start with these documents:

1. `PHASE_A_FALSIFICATION_PLAN.md` — hypothesis, frozen rules, lanes, and completion criteria.
2. `A0_CORPUS_REVIEW.md` and `A0_CONTRACT_REVIEW.md` — the first two DJ gates.
3. `adr/0001-phase-a-evaluation-model-pins.md` — exact role/model policy and non-ZDR approval.
4. `A1_ROUTE_RESULTS.md` — every A1 pass and why the hybrid was chosen.
5. `A2_BLIND_SCORING_PROPOSAL.md` — the approved/frozen judging mechanic.
6. `A2_PROGRESS.md` — current A2 state and provider-policy incident.
7. `packages/agent-orchestrator/src/testing/harness/results/README.md` — canonical result index.

Inspect implementation by responsibility:

- Contracts: `packages/agent-orchestrator/src/contracts/`
- Runtime state and stored artifacts: `packages/agent-orchestrator/src/domain/`
- Route mode: `packages/agent-orchestrator/src/application/route-mode/`
- Workflow engine: `packages/agent-orchestrator/src/application/workflow-engine/`
- Librarian and researcher: `packages/agent-orchestrator/src/agents/`
- Pure external boundaries: `packages/agent-orchestrator/src/ports/`
- Corpus, acceptance, reports, blind packet, and judge:
  `packages/agent-orchestrator/src/testing/harness/`
- Paid workflow adapter: `apps/worker/tests/phase-a/phaseAWorkflowEval.test.ts`
- Paid control/route adapters: `apps/web/src/lib/tests/agentic-e2e/phase-a/`

## Known limitations and audit risks

- There are **no scored workflow outputs**. Do not infer workflow quality, cost, latency, or a
  Phase A decision from the invalid diagnostic attempts.
- The non-ZDR approval is recorded but not implemented. SmartLLM still defaults to
  `data_collection: deny` and `zdr: true` at this handoff.
- The future opt-in must not silently weaken production calls or unrelated tests. Audit its call
  path, default value, logging, and scope.
- Verify DeepSeek's returned exact model and provider after non-ZDR is enabled. A fallback model
  is still infrastructure-invalid even though non-ZDR is approved.
- The researcher uses live public sources; source drift and network variability should remain
  visible rather than being normalized away.
- Required machine checks are deliberately strict eligibility gates. A control answer can read
  well while remaining ineligible to produce a workflow win if it omits a required citation.
- The three blind judges have not been called, and DJ has not received or scored a blind packet.
- `PHASE_A_RESULTS.md` does not exist yet because the comparison is incomplete.
- The repository has a mixed dirty index/worktree with unrelated user changes. Do not reset,
  restore, stage, or commit broad paths. Inspect both `git diff` and `git diff --cached`, and use
  explicit pathspecs if DJ later asks for a commit.
- The verification numbers above are historical evidence from this work session. They were not
  rerun while preparing this document, per DJ's instruction.

## Planned next steps

Do not execute these until DJ asks to resume testing.

1. Audit the current changes and this handoff against the frozen corpus, ADR, thresholds, and
   invalid-run rules.
2. Add an explicit evaluation-only SmartLLM transport option permitting non-ZDR for the
   anonymized Phase A researcher call. Keep the default `deny`/ZDR behavior unchanged and cover
   both default-safe and opt-in paths with focused tests.
3. Confirm the worker harness enables that option only for the pinned DeepSeek researcher and
   still rejects actual-model mismatches or fallback substitution.
4. Start a clean workflow cohort: exactly C06/C07/C08 × three. Do not reuse either ZDR-invalid
   attempt as a scored run. Apply the one-replacement infrastructure rule independently and retain
   all model-matched timeouts, tool failures, partial outputs, and operational spend.
5. Canonicalize and hash the nine scored workflow results. Verify zero mutation calls and apply
   the frozen cost and latency bounds.
6. Generate exactly nine A/B pairs using the frozen mapping. Store the lane mapping separately.
7. Give DJ the blinded packet to score all nine before revealing or running the panel result.
8. Run the three exact-pinned judges, aggregate by majority, and validate ≥7/9 agreement with DJ
   plus the no-complete-scenario-inversion rule.
9. Count workflow wins only where machine eligibility permits. Apply every frozen threshold and
   write `PHASE_A_RESULTS.md` with the final Go/Change/Stop decision and surprises.

## Suggested auditor questions

- Are corpus labels and acceptance criteria actually frozen and unchanged across all reports?
- Does the hybrid route-review trigger match the frozen policy exactly and avoid reviewing
  ordinary direct calls?
- Can any runtime path exceed five stages, two replans, the USD/time budget, or the read-only
  ceiling?
- Can an unvisited or model-invented URL enter a scored research artifact?
- Are actual model/provider identities checked before `scored: true`?
- Are invalid replacements bounded to one, while model-matched failures remain scored?
- Can lane identity leak into the blind packet or judge prompt?
- Does a workflow machine-check failure become a non-win regardless of panel preference?
- Is panel validation performed only after DJ has independently scored all nine pairs?
- Does the non-ZDR opt-in remain impossible for production/default SmartLLM calls?

## Canonical references

- Task record: `tasker/37-agent-first-orchestration-phase-a.md`
- Architecture rationale: `README.md`
- Architecture plan: `V0_ARCHITECTURE_PLAN.md`
- Pre-build audit: `AUDIT_2026-07-24.md`
- Frozen experiment: `PHASE_A_FALSIFICATION_PLAN.md`
- Result artifacts: `packages/agent-orchestrator/src/testing/harness/results/`

No commit was created as part of this handoff.
