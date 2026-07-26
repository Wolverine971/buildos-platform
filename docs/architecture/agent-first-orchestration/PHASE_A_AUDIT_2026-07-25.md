<!-- docs/architecture/agent-first-orchestration/PHASE_A_AUDIT_2026-07-25.md -->

# Phase A independent audit — 2026-07-25

**Auditor:** Claude (independent pass, no prior involvement in A0/A1/A2)
**Inputs audited:** `README.md`, `V0_ARCHITECTURE_PLAN.md`, `AUDIT_2026-07-24.md`,
`PHASE_A_FALSIFICATION_PLAN.md`, `A0_CORPUS_REVIEW.md`, `A0_CONTRACT_REVIEW.md`,
`adr/0001`, `A1_ROUTE_RESULTS.md`, `A2_BLIND_SCORING_PROPOSAL.md`, `A2_PROGRESS.md`,
`PHASE_A_AUDIT_HANDOFF_2026-07-25.md`, all of `packages/agent-orchestrator/src/`, the paid
harnesses in `apps/worker/tests/phase-a/` and `apps/web/src/lib/tests/agentic-e2e/phase-a/`,
and every canonical result artifact.

**No paid call was made and no experiment state was changed by this audit.**

> **Disposition, 2026-07-25.** DJ authorized the recommended changes the same day. Every code fix
> below is implemented (100/100 package tests, typecheck green across the package, `apps/worker`,
> and `apps/web`); the decision rule is amended in
> [`PHASE_A_FALSIFICATION_PLAN.md`](./PHASE_A_FALSIFICATION_PLAN.md); the remaining paid work is
> sequenced in [`NEXT_ITERATION.md`](./NEXT_ITERATION.md). Per-item status is in the
> [Disposition table](#disposition) at the end.

## Verdict

**Direction: right. Method: unusually disciplined. Current A2 configuration: not ready to
spend money on.**

Falsify-before-build is the correct sequencing and it is genuinely being honored — no
migrations, no tables, no UI, no kernel. The provenance discipline is real: all eight canonical
report SHA-256 values reproduce byte-exactly, the snapshot SHA matches the corpus review, and
the package suite is green (13 files / 95 tests, verified in this session). The invalid-run rule
did its job when the ZDR block hit.

But if the workflow cohort is run as currently configured, **the result will not be
interpretable as evidence about the architecture.** Four issues (B1–B4) each independently
break the causal link between "workflow lane wins/loses" and "agent-first orchestration
works/doesn't." B1 is the serious one and was not visible from the handoff document.

---

## Blockers — fix before generating the scored workflow cohort

### B1. `reason_code` was declared "diagnostic only," but A2 makes it the execution plan

Gate 3 froze top-level route as the scored metric and explicitly demoted reason codes to
"diagnostic, not gated" (`PHASE_A_FALSIFICATION_PLAN.md`, "Scored sample"). A1 then reported
38/72 reason agreement as a non-issue.

A2 silently promoted it. `compileWorkflowStage()` in
`packages/agent-orchestrator/src/application/route-mode/route-mode.ts:66` branches **entirely**
on `reason_code`:

- `context_research_recommendation` → librarian-only stage, research appended later
- `multi_source_research` / `multi_step_synthesis` → two hardcoded parallel researcher steps
- anything else → one researcher step

The frozen A1 report (`route-eval-fast-review-v1.json`) shows what that produces for the three
comparison scenarios:

| Scenario | Labeled reason                    | Actual reason distribution across 9 calls                                        |
| -------- | --------------------------------- | -------------------------------------------------------------------------------- |
| C06      | `single_source_research`          | 5× `context_research_recommendation`, 2× `multi_source_research`, **2× correct** |
| C07      | `multi_source_research`           | 7× `context_research_recommendation`, 2× `multi_step_synthesis`, **0× correct**  |
| C08      | `context_research_recommendation` | 9× correct                                                                       |

Three consequences:

1. **The three runs per scenario are not replicates.** C06 run 1 may be a librarian→research
   chain; run 2 may be a two-researcher fan-out; run 3 the intended single-source read. The
   design intent ("≥3 runs per lane so quality deltas can be separated from model variance")
   is defeated — the variance being measured is plan variance, not model variance.
2. **C07 executes the librarian-first plan 7/9 of the time.** C07 is a cold-email/UX product
   question; the frozen snapshot is a response-speed training project. The librarian will
   inject PVT-task and training-equipment facts, and `searchQuery()` in
   `agents/researcher/researcher.ts:130` splices up to 800 characters of those facts into the
   Tavily query. Predicted result: irrelevant sources and a degraded C07 memo — caused by eval
   wiring, not by the architecture.
3. **The claimed C07 fan-out mostly does not happen.** `PHASE_A_AUDIT_HANDOFF_2026-07-25.md`
   states "The route compiler fans out C07 into two focused research steps." Observed rate:
   2/9.

**Fix:** either (a) gate `reason_code` for the three comparison scenarios and re-run A1's
confirmation until the plan is stable, or (b) decouple plan selection from `reason_code` (e.g.
derive the plan from observable request features — supplied URL present, project referent
present — rather than from a diagnostic label the rule says isn't trustworthy). (a) is honest
and cheap (~$0.08 of route calls); (b) is the better architecture but is a change, not a rerun.
Do not run the cohort until one of them is done.

### B2. C07's control is a broken production turn, not a weak answer

`control-a2-v1.json` C07, all three runs:

- `finishedReason: "error"`, `errors: ["An error occurred while streaming."]`
- Tool traces contain **only** `skill_load` / `skill_reference_load` — no research, no reads
- Assistant text: 89, 173, and 73 characters, all of the form _"Let me load the full playbooks
  for both lenses…"_

`A2_PROGRESS.md` and the results README describe these as "the production lane's model-matched
timeout after its internal retry." The artifact does not show a timeout; it shows a stream error
after skill loading — the previously diagnosed turn-budget/finalization pattern
(`project_chat_unfinished_turn_bug`). The characterization in the docs is stronger than the
evidence.

Either way, **3 of the 9 blind pairs are a real answer versus a one-sentence preamble.** They
are near-certain workflow wins. With the threshold at 6/9, the architecture is effectively being
tested on the 6 remaining pairs and needs 50% of them. One-third of the Phase A decision is
carried by a known control-side defect.

**Fix:** keep C07 (it is honest production behavior) but pre-register that its three pairs are
reported separately and that a Go requires ≥3/6 wins on C06+C08 as well. Do not let a Go be
narratable as "the new architecture beat a crashed turn."

### B3. The cost bound compares different things

- Workflow `totalCostUsd` = model cost **+ Tavily charges** (`phaseAWorkflowEval.test.ts:513`).
- Control `usage.totalCostUsd` = `sum(llm_usage_logs.total_cost_usd)` only
  (`agentic-e2e/harness/telemetry.ts:228`). Tavily spend is not an LLM usage row.

The control is not search-free: C08 run 1 made 4 `web_search` + 2 `web_visit` calls, run 2 made
2 + 2. At the harness's own ~$0.008/search reservation that is roughly $0.024–0.032 of
uncounted control spend per C08 run — larger than the control's entire measured model cost.
The frozen bound ($0.022479 = 3× the control's model-only mean) is therefore applied against a
number that includes a cost category the baseline excluded.

Separately, the invalid C06 attempts give a cost floor: **$0.01397 and $0.00985 with the
researcher contributing $0 tokens.** Route + transition + synthesis alone is ~$0.010–0.014.
Adding a real DeepSeek researcher, and Tavily on C07/C08, makes a mean at or above $0.0225
likely. As configured, the cost bound is closer to a coin flip than a measurement — and the
engine's own budget (`PHASE_A_DEFAULT_MAX_USD = 0.05`) is 2.2× the pass bound, so nothing stops
a run from blowing through it.

**Fix:** compute both lanes the same way. Report a model-only figure against the frozen bound
(that is how the bound was derived) and an all-in figure including tool spend for both lanes as
the honest number. Instrument the control's tool spend from its tool receipts.

### B4. 72/72 route accuracy is a training-set score

`prompts.ts` v4 contains a "Resolve project-relative scope" section with three numbered rules
that paraphrase three specific corpus items:

- Rule 1 ("explain a named project-local field, metric, score…is direct") → C01
- Rule 2 ("external recommendation is workflow when current_project makes 'this' concrete") → C08
- Rule 3 ("planned tasks for a work domain absent from current_project…clarify. This remains
  clarify when the request also says 'research'") → C09, near-verbatim

Four prompt passes plus two model pilots were fit against the same 8 labeled scenarios, and the
review trigger (`route-mode-with-review.ts:21`) fires only on `direct`/`clarify` + a
research-intent regex — the exact error shape observed in v1/v3. Labels never drifted, which the
plan correctly protects; **the prompt drifted toward the labels instead.** There is no held-out
set anywhere in Phase A.

100% on the set you tuned against is not a generalization estimate. This does not invalidate
A1's latency finding (the fast-first mitigation is real and the 27 direct calls never touched
GLM — 898/1,310 ms p50/p95 verified), but it does invalidate the accuracy claim as evidence.

**Fix (cheap, ~$0.03):** C03, C05, and C10 were labeled in the corpus review and deliberately
excluded from the frozen eight; they were never used in prompt tuning. Score the frozen prompt
on them cold, plus 2–3 fresh unlabeled production transcripts. Report that number as the route
accuracy. If it holds near 90%, A1's Go stands on real ground.

---

## Serious — fix, all cheap

### S1. The transition call is a rubber stamp

`transitionPolicy()` (`workflow-engine.ts:159`) computes the allowed proposal actions
deterministically from artifact types present, and in every non-failure path offers the model
**exactly one** option: `['append_research']` when a context packet exists without research, or
`['complete']` when research exists. `compileTransitionDecision()` then writes a fully
hardcoded next stage. The GLM call cannot change control flow.

So the "CEO decision gate / receding-horizon replanning" capability that the README treats as
the core architectural bet is **not tested by A2 at all**. What A2 actually measures is a fixed
pipeline: route → librarian and/or researcher → synthesis. That is still a worthwhile thing to
measure — but it should be named accurately, and the call costs ~$0.0016–0.0033 and seconds per
run for zero decision content, directly working against B3's cost bound.

**Fix:** delete the transition call for Phase A and say plainly that decision gates are a Phase B
claim, or give it genuine choices (e.g. `append_research` vs `complete` vs `complete_partial`
whenever a context packet exists) so a wrong choice is observable. Recommend deleting it —
cheaper, faster, and more honest about what Phase A proves.

### S2. The workflow lane gets operator help the control does not

Three places where scenario knowledge leaks into the lane under test:

- `route-mode.ts:98-111` — the two hardcoded research foci are "domain workflow, operational
  constraints, deliverables, and validation" and "interface states, UI/UX risks, accessibility,
  usability, and user testing." C07's frozen acceptance checks require the sections
  `workflow / interface / risks / testing` and the terms `accessibility` and `user testing`.
  That is the answer key restated as step definitions.
- `phaseAWorkflowEval.test.ts:325` — `minimumCitations: 2` when `scenarioId === C08`, matching
  C08's `minimum_citations: 2` check.
- `phaseAWorkflowEval.test.ts:327` — `maxVisits: 1` when `scenarioId === C06`, which guarantees
  the supplied URL is the only source visited, satisfying C06's `include_url` check.

Each is defensible as "a real system would derive this from the assignment," but none of them
is derived — they are switched on scenario ID. A win produced this way is partly the operator's.

**Fix:** derive both knobs from the request (`suppliedUrls.length > 0 → visit supplied first`;
`minimumCitations` from a count of comparison targets in the objective) and replace the two
hardcoded foci with a single generic decomposition, or drop the fan-out entirely and note it as
untested. Then record in `PHASE_A_RESULTS.md` exactly what remains scenario-conditional.

### S3. Blind A/B sides are not counterbalanced

The frozen mapping is deterministic over `(policy_version, corpus_version, scenario_id,
run_index)`. Computed for the actual corpus:

|         | r1    | r2    | r3    |
| ------- | ----- | ----- | ----- |
| C06     | B     | B     | A     |
| **C07** | **A** | **A** | **A** |
| C08     | A     | A     | B     |

Workflow is side A in 6/9 pairs and in **all three C07 pairs**. Any position bias in the three
judges or in DJ correlates directly with lane inside the scenario that already has the weakest
control (B2). The mechanic is hashed and frozen — but nothing has been scored against it yet, so
changing it now with a recorded rationale and a new hash costs nothing and invalidates nothing.
After the first scored output it is locked.

**Fix now:** force balance — e.g. workflow side = `A` for odd `run_index`, `B` for even, or
derive from the digest but reject mappings that put all three of a scenario on one side.

### S4. Model-pin verification is role-blind

`infrastructureInvalidReason()` (`phaseAWorkflowEval.test.ts:380`) builds one flat set of all
five pins and accepts a usage event if its model matches **any** of them. If the researcher
silently resolved to GLM 5.2 (already a pin for transition and synthesis), the run would still
be `scored: true`.

ADR 0001 promises the opposite: "A scored run whose actual model differs from the pin is an
infrastructure-invalid run… Provider failure is never converted into a scored fallback-model
result." That promise is not enforced. It matters more now than before, because the next change
is a per-call transport option on exactly one role.

**Fix:** tag each `ModelUsageEvent` with its role at the port boundary (`metadata.role` is
already being passed to SmartLLM) and assert `event.model === MODEL_PINS[event.role]`.

_(Checked and cleared:_ the "released + 0 tokens" heuristic is safe. `billingDisposition:
'released'` requires `isOpenRouterDefinitivePreGenerationRejection` — HTTP 404/410, no
generation ID, route-rejected message. A model-matched timeout yields `'uncertain'` with
reserved tokens, so timeouts will **not** be laundered into infrastructure-invalid replacements.
That was the failure mode I expected to find and it is not present.)\*

### S5. The required-check gate is asymmetric and brittle — pre-register a second reporting line

The frozen rule gives the control a free pass: it need not satisfy any acceptance check to
"win," while the workflow must pass every required check _and_ win the panel. The control
passed **0/9** in `control-a2-v1.json`. So today a control run can be a 73-character error stub
and still deny the workflow a win if the workflow's prose says "usability testing" instead of
"user testing", or renders `1-10` instead of `1–10` (en dash, C01), or writes "team composition"
instead of "team structure" (C06).

The asymmetry is intentional ("burden of proof on the new architecture") and I am not proposing
to remove it. The risk is interpretive: **a Stop produced by literal-substring matching is not
evidence against the architecture**, and there is currently no way to tell the two apart in the
final write-up.

**Fix:** pre-register, before generation, a secondary reported line — "panel wins ignoring the
machine gate" and "required-check pass rate per lane" — so `PHASE_A_RESULTS.md` can distinguish
"the workflow lost on quality" from "the workflow lost on string matching." The decision still
uses the frozen rule.

---

## Notable — record, do not necessarily fix now

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                | Where                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| N1  | The librarian reads the snapshot JSON in-process while the control queries a real seeded Supabase project. Phase A's librarian latency and retrieval quality do not transfer to Phase B, where it must do real reads under RLS over a full project. Record this as a known non-transfer.                                                                                                                               | `phaseAWorkflowEval.test.ts:295` vs `phase-a/fixtures.ts:188` |
| N2  | Two independent implementations of the acceptance validators (control lane vs package harness). Behaviourally equivalent today for C06–C08; they will drift, and drift silently biases the comparison.                                                                                                                                                                                                                 | `phase-a/acceptance.ts` and `harness/acceptance-eval.ts`      |
| N3  | One shared snapshot backs eight requests drawn from different real projects. It is _irrelevant_ to C06 and C07 — which is the whole point of C09 but an accident for the other two. It also makes the C07/C09 labels hard to distinguish on principle (both ask about a domain absent from the project; C07 is labeled `workflow`, C09 `clarify`, and the only real difference is that C07 supplies its own material). | `corpus/phase-a.json`                                         |
| N4  | `workflow-engine.ts` is 486 lines, past the README's own 400-line split-review trigger, with no recorded exception.                                                                                                                                                                                                                                                                                                    | `application/workflow-engine/workflow-engine.ts`              |
| N5  | `latencyP50BoundPassed` is `false` when there are zero scored samples — "no data" and "failed" are the same value. This already caused a confusion the handoff had to explain away. Use `null`.                                                                                                                                                                                                                        | `workflow-eval-report.ts:135`                                 |
| N6  | The route eval report records `modelCallCount` but not `reviewed` / `reviewReason`, so reviewer trigger rate is only inferable. It was 24/72 (0/27 on direct-expected calls — the latency claim holds).                                                                                                                                                                                                                | `route-eval-report.ts`                                        |
| N7  | The passing A1 run contains a **79,990 ms** route call (C06 r5, 3 model calls, repaired). p95 hides it. That tail lands inside A2 total durations.                                                                                                                                                                                                                                                                     | `route-eval-fast-review-v1.json`                              |
| N8  | Engine budget `PHASE_A_DEFAULT_MAX_USD = 0.05` is 2.2× the pass bound, so the engine never protects the bound. Intentional for measurement, but worth stating.                                                                                                                                                                                                                                                         | `workflow-engine.ts:46`                                       |

---

## What is genuinely well done — do not regress it

1. **All eight canonical SHA-256 values reproduce byte-exactly**, and the snapshot SHA matches
   `A0_CORPUS_REVIEW.md`. Package suite verified green in this session: 13 files, 95/95.
2. **Pre-registration is real.** Thresholds were derived from a measured baseline and frozen
   before A1 prompt work and before any A2 comparison. Failed passes (v1–v4, both rejected
   pilots, the low-reasoning experiment) are all retained with their own hashed reports rather
   than deleted. The scoring-assertion correction in A1 is disclosed rather than buried.
3. **The invalid-run rule worked under pressure.** The ZDR block could easily have become
   "workflow produced a bad answer"; it was correctly classified, its spend retained, and the
   cohort held.
4. **Citation validation lives in code, not in a prompt.** `researcher.ts:280-298` only lets a
   URL survive if it was actually visited, and marks the result partial otherwise. This is the
   clearest genuine architectural advantage in the build and the control demonstrably lacks it
   (0/3 C06 runs cited the supplied article; 2 of those 3 had actually visited it).
5. **Architecture fitness tests actually enforce the boundary** — forbidden cognition imports,
   layer direction, and contracts-depend-only-on-zod are all executable, not aspirational.
6. **Nothing durable was built.** No migration, no table, no queue job, no UI. The README's own
   sequencing is being honored, which is exactly what the 2026-07-24 audit asked for.

---

## Recommended order of work

Nothing below requires a decision beyond the two forks noted in the covering summary.

1. **Do not start the workflow cohort yet.** (B1–B4 all change what the cohort measures.)
2. Fix B1 — stabilize the plan. Recommend gating `reason_code` for C06/C07/C08 and re-running
   the A1 confirmation (~$0.08) to record the stable distribution.
3. Fix S3 — rebalance the blind side mapping and re-hash. Free, and only free until the first
   scored output exists.
4. Fix S1 — delete the transition call (or give it real choices). Recovers ~10–15% of run cost
   and several seconds.
5. Fix S2 and S4 — de-scenario-ize the two researcher knobs and the fan-out foci; make the pin
   check role-aware.
6. Fix B3 — instrument the control's tool spend; report model-only against the frozen bound and
   all-in alongside.
7. Run B4's held-out route check on C03/C05/C10 plus 2–3 fresh transcripts (~$0.03).
8. Pre-register S5's secondary reporting line.
9. _Then_ implement the evaluation-only non-ZDR opt-in exactly as `A2_PROGRESS.md` describes
   (explicit, researcher-only, default unchanged, both paths tested), and generate the cohort.
10. Add an explicit "what Phase A did and did not test" section to `PHASE_A_RESULTS.md`.
    As built, Phase A tests **bounded specialists + code-enforced citations + deterministic
    context retrieval versus a context-heavy agent.** It does not test decision gates, replanning,
    parallel scheduling under contention, joins, durability, or permissions-at-execution — those
    remain entirely Phase B claims.

## Disposition

Recorded 2026-07-25 after DJ authorized the recommended changes.

| #      | Status                                   | What was done                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1     | **Rerun = Change; fallback implemented** | Prompt v5 scored 58/72 routes and 22/27 comparison-scenario reasons. No fifth prompt pass was made. The authorized architectural fallback now selects workflow topology from observable request features, so model reason labels cannot vary the plan between replicates. A2 remains blocked by the failed top-level route score. |
| B2     | **Fixed**                                | Decision rule amended: C07's three pairs are reported separately and a Go additionally requires ≥3/6 wins on C06+C08. The "model-matched timeout" characterization is corrected in `A2_PROGRESS.md`.                                                                                                                              |
| B3     | **Fixed**                                | The frozen bound is now evaluated against model-only spend, matching how the control baseline was derived; all-in (model + tool) cost is reported beside it for both lanes.                                                                                                                                                       |
| B4     | **Fixed, extraction pending**            | `HoldoutCorpusSchema` and the `PHASE_A_ROUTE_CORPUS` selector let a held-out set be scored cold against the frozen prompt. The set itself needs a production read — runbook step 2.                                                                                                                                               |
| S1     | **Fixed**                                | Gates with one legal action are decided in code; only branching gates reach GLM 5.2. `transitionModelCalls` / `forcedTransitions` are recorded per run, and a regression test asserts a partial stage still reaches the model.                                                                                                    |
| S2     | **Fixed**                                | `runResearcher` derives its visit budget and citation floor from whether the request supplied its own sources; both scenario-id knobs are gone from the harness; the fan-out foci are domain-neutral.                                                                                                                             |
| S3     | **Fixed**                                | Counterbalanced mapping `phase-a-a2-blind-v2`, hash `ba2602e8…774d2`, amended before any pair was generated. A regression test asserts within-scenario balance, a 4:5 or 5:4 overall split, and no run-index/lane correlation.                                                                                                    |
| S4     | **Fixed**                                | Every `ModelUsageEvent` carries its role; an untagged event is infrastructure-invalid; each observed model is checked against that role's pin in both paid harnesses.                                                                                                                                                             |
| S5     | **Fixed**                                | The secondary non-deciding reporting line is pre-registered in the plan and required in `PHASE_A_RESULTS.md`.                                                                                                                                                                                                                     |
| N1, N3 | **Recorded**                             | Both are non-transfer risks required in the `PHASE_A_RESULTS.md` "what Phase A did and did not test" section.                                                                                                                                                                                                                     |
| N2, N4 | **Open, deliberate**                     | Duplicate validators and the 486-line engine are real but change nothing about the pending measurement. Address when the engine is rewritten for Phase B.                                                                                                                                                                         |
| N5, N6 | **Fixed**                                | `null` instead of `false` for unsampled bounds; `reviewed` / `reviewReason` recorded per route call.                                                                                                                                                                                                                              |
| N7, N8 | **Recorded**                             | The 80 s route tail and the $0.05 engine budget are reported, not changed — the budget deliberately exceeds the bound so measurement is not truncated.                                                                                                                                                                            |

## Answer to the handoff's own auditor questions

| Question                                                                                          | Finding                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are corpus labels and acceptance criteria frozen and unchanged across all reports?                | Yes. Single source of truth, read by both lanes; snapshot SHA matches.                                                                                                                                               |
| Does the hybrid review trigger match the frozen policy and avoid reviewing ordinary direct calls? | Yes. 0/27 direct-expected calls invoked GLM; 24/72 overall.                                                                                                                                                          |
| Can any runtime path exceed five stages, two replans, the USD/time budget, or read-only?          | No. Checked; loop guards, budget checks, and `assertReadOnlyPermission` are all enforced before and after each stage. Note replans only increment on non-completed stages, so `max_replans` is effectively untested. |
| Can an unvisited or model-invented URL enter a scored research artifact?                          | No. Only URLs in the observed set survive into `citations`.                                                                                                                                                          |
| Are actual model/provider identities checked before `scored: true`?                               | **Partially — this is S4.** The check is role-blind; a cross-role fallback would pass.                                                                                                                               |
| Are invalid replacements bounded to one, and model-matched failures still scored?                 | Yes on both. The `released`+0-token heuristic is correctly narrow and will not swallow timeouts.                                                                                                                     |
| Can lane identity leak into the blind packet or judge prompt?                                     | No leak. But side assignment is unbalanced — S3.                                                                                                                                                                     |
| Does a workflow machine-check failure become a non-win regardless of panel preference?            | Yes — and that gate is brittle and one-sided. See S5.                                                                                                                                                                |
| Is panel validation performed only after DJ has scored all nine?                                  | Enforced by code shape; validation requires nine DJ labels as input. Note the mapping is publicly derivable, so DJ's blinding is honour-based.                                                                       |
| Does the non-ZDR opt-in remain impossible for production/default SmartLLM calls?                  | Not yet implementable-or-auditable — it does not exist yet. Re-audit after it lands.                                                                                                                                 |
