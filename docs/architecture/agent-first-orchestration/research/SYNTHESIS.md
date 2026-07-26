<!-- docs/architecture/agent-first-orchestration/research/SYNTHESIS.md -->

# Synthesis — how BuildOS's agent-first experiment compares to outside practice

**Date:** 2026-07-25
**Inputs:** nine independent research chapters (01–10 in this folder), ~150 primary sources,
plus a code-level ground-truth audit of `packages/agent-orchestrator`.
**Status:** analysis only. Nothing here has been approved, and no code or corpus has been changed.

---

## 1. Bottom line

The **architecture** is in better shape than the **experiment measuring it**.

Almost every specific design choice — bounded specialists, typed artifacts instead of transcripts, a
deterministic context builder, code-enforced citations, moving decisions out of the model and into
code — is independently corroborated by Anthropic, Cognition, Manus, Meta, CaMeL, and ClawBench.
Several are ahead of published practice.

The evaluation, as currently specified, **cannot return a trustworthy verdict on that architecture**
for three independent reasons, any one of which is sufficient:

1. **The two lanes run different models.** The workflow lane ends with GLM 5.2 `powerful` writing
   the text a judge reads; the control is `deepseek-v4-flash` `balanced`. The measured contrast is
   "multi-agent + better writer + web tools" vs "single agent + cheap writer." Flagged independently
   by chapters 02, 04, and 06.
2. **The decision rule clears on chance.** P(≥6 of 9 | no real difference) = 130/512 ≈ **25.4%**;
   under scenario clustering it rises to **50%**; with C07's crashed control handing over three free
   wins it is **65.6%**. The C06+C08 guard adds _zero_ constraint — any total ≥6 mathematically
   forces C06+C08 ≥3.
3. **The routing gate is near-unreachable by construction.** 8 items × 9 near-deterministic
   replicates puts achievable scores near multiples of 9; seven perfect items = 63, which fails a
   ≥65 bound. The "90% gate" behaves as an 8-of-8 gate — and 8/8 is exactly the 72/72 the burned
   corpus already produced.

None of this is an integrity problem. The pre-registration, the hash pinning, the recorded failure,
the self-diagnosed training-set contamination, and the decision to _stop_ prompt tuning at v5 are
all better than standard practice — several chapters said no frontier lab publishes an equivalent.
The problem is that a carefully pre-registered rule was built on an instrument with unmeasured
resolution. **"Change" was the right call on routing — but not for the stated reason. It was right
because the harness cannot distinguish 58 from 65.**

The good news: the three blockers are cheap. Roughly **$15 of model spend and 2–3 days of work**
converts this from an uninterpretable experiment into a decidable one.

---

## 2. The five findings that should change what you do

### 2.1 Kill the model confound before scoring anything

Three chapters reached this independently. Anthropic reports token budget alone explains ~80% of
variance on BrowseComp; controlled-comparison practice (GAIA, HAL's 9-model × 9-benchmark grid)
holds the model fixed and varies only the scaffold.

**Fix:** re-run the existing control lane on GLM 5.2 `powerful`. ~9 runs, ~1 day. Until that exists,
a workflow win is most parsimoniously explained as "we bought a better writer."

Two chapters also want a **matched-compute single-agent arm** and a **prompt-only arm** (Librarian
packet inlined, no orchestration). Anthropic published in Jan 2026 specifically because _"teams
invest months building elaborate multi-agent architectures only to discover that improved prompting
on a single agent achieved equivalent results."_ That is the rival most likely to win, and it is
currently deferred to Phase B — i.e. Phase A cannot answer its own question.

### 2.2 The comparison needs ~37 pairs, and that costs about a dollar

At 9 pairs the rule is simultaneously too permissive (25–66% false-positive) and too strict (73%
power against a true 70% win rate — a 27% chance of killing a design that really wins 7 in 10).

**37 distinct pairs** gives 80% power at +20pp; 23 pairs at +25pp. At the harness's own measured
costs that is **~$1.11 of model spend and ~3 hours serial wall clock**. The binding constraint is
2–3 hours of your blind labeling time, not money.

Corpus size context: 8 scenarios against Anthropic's stated 20–50 floor, τ-bench's 165, SWE-bench
Verified's 500, WebArena's 812.

### 2.3 The routing blocker is one contested item, and the gate can't express that

C09 alone is 64% of all routing error, and every error in 72 calls sits on one boundary
(`workflow ↔ clarify`). Six of eight scenarios are perfect.

C09 is 0/9 across two runs while giving **three different answers** — `workflow` ×9 under v5,
`direct` ×6 under mitigation-v2. Anthropic's own heuristic: _"a 0% pass rate across many trials is
most often a signal of a broken task, not an incapable agent."_ And the prompt's written rule ("an
unresolved referent naming a … task … is still direct") points at a different answer than the label
(`clarify`). The item is contested; the router is being scored against a rubric that disagrees with
its own instructions.

Arithmetic that matters: **one genuinely 50/50 item caps the achievable score at 67.5/72; two cap it
at 63/72 — below the bound with a perfect router.** The human label ceiling was never measured.

**Fix, in order:** (a) 2–3 people independently label all 13 scenarios cold, seeing only the world
card the router sees — one hour, $0; (b) restate the bound in _scenario_ units with per-route recall
and a 4×4 confusion matrix; (c) treat `clarify` as a calibrated abstention and report
accuracy-on-answered plus coverage.

Nobody in production gates on router accuracy. RouteLLM reports a cost-quality frontier; GPT-5's
router is user-recoverable and retrains on switch signals; Trust-or-Escalate gets _provable_ ≥80%
human agreement at ~80% coverage from a 7B model by abstaining. **The universal pattern is to make
misroutes cheap, not rare.** A design that needs 90% first-shot routing is a design with no recovery
path — that is an architecture question, not an eval question.

### 2.4 The harness would corrupt a run if executed today

From the code audit, in priority order:

- **The machine gate can falsely veto workflow wins.** Three corpus validators
  (`answer.bullet_count`, `route.asks_question`, `route.reports_gap`) exist only in the control-lane
  copy; the package harness returns `passed: false`. Since a required-check failure vetoes a
  workflow win _regardless of judge preference_, this can silently zero the workflow lane.
  `acceptance_criteria` are also authored then ignored, and the researcher hardcodes a criterion ID
  that doesn't match what the fan-out steps declare.
- **`pnpm test:agentic:phase-a-route-v5` no longer runs v5** — byte-identical to the mitigation-v2
  script apart from the output path. The runbook and project memory both still name it.
- **Neither paid harness is typechecked**, and two real TS errors are hiding there.
- **Four routing errors are `finish_reason=length` truncations** against a 900-token cap on a
  reasoning model — scored as wrong routing decisions with `infrastructureInvalidCount: 0`, though
  the plan's own rule classes harness failure as invalid.
- **C07 is applied asymmetrically.** Workflow-lane ZDR failures were replaced as infra-invalid; the
  control lane's 3/3 crash was kept as a valid outcome. Both asymmetries favor the workflow lane.
  Dropping C07 from the primary denominator is free and follows the existing rule.
- **Two canonical SHA-256s no longer reproduce** (files re-indented). The audit's "all eight
  reproduce byte-exactly" and `results/README.md`'s "every SHA-256 still reproduces" are now false.
- **The report's `decision` field is not the pre-registered decision** — it is computed from route
  accuracy alone, which is why the holdout self-reports `go_candidate` for a non-gating set.

### 2.5 The holdout can't see the failure mode

The five held-out scenarios are 4× `direct` + 1× `capability_gap`. **Zero `workflow`, zero
`clarify`** — none of the classes carrying 100% of observed error. `reviewed: false` on all 15 runs
means the GLM reviewer that resolves workflow-vs-clarify **never fired once**. It also samples at 3
runs/scenario against the frozen set's 9.

15/15 is not evidence of generalization. Reported beside 61/72 it will read as "we're fine on unseen
data" — the opposite of what the data supports.

---

## 3. What outside practice validates — keep these

| Design choice                       | Corroboration                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifacts over transcripts          | Anthropic: subagents "store their work in external systems, then pass lightweight references back"; 1–2k-token returns. Context isolation named the _primary_ reason to go multi-agent (Jan 2026).        |
| Bounded context / small world card  | _Lost in the Middle_: GPT-3.5 20-doc QA scored 53.8% mid-context vs a **56.1% closed-book baseline** — mid-context retrieval was worse than no documents. Chroma: a single distractor degrades 18 models. |
| Deterministic context builder       | Structurally the **P-LLM boundary from CaMeL** / Plan-Then-Execute. Also buys free KV-cache prefix stability (Manus: $0.30 vs $3.00/MTok).                                                                |
| Moving decisions from model to code | Meta's 2026 production classifier: ~85% deterministic rules / ~15% LLM fallback; "the LLM does not make the production decision in the common case."                                                      |
| Machine gate before LLM judge       | ClawBench independently: 40% deterministic completion / 30% trajectory / 20% behavior / **10% judge, gated behind deterministic completion >99.99%**.                                                     |
| Code-enforced citation validation   | No published equivalent found. The one architectural claim Phase A genuinely tests.                                                                                                                       |
| Grading output over path            | Anthropic: _"often better to grade what the agent produced, not the path it took."_ (Contested — see §5.)                                                                                                 |

## 4. What is genuinely novel — this is your IP

Several chapters searched for precedent and found none:

- **Pre-registered Go/Change/Stop bounds for an architecture decision.** "Nearly absent from
  published agent work." No frontier lab publishes a multi-agent eval methodology at all — Anthropic
  explicitly calls it future work.
- **Human scores blind _before_ the panel runs.** Stronger calibration ordering than anything found
  in the literature.
- **Required machine checks vetoing judge preference**, with a parallel non-deciding judge-only
  line. Called "novel, unnamed anywhere in the canon" — and independently arrived at by ClawBench,
  which is validation rather than refutation.
- **The infra-invalid vs valid-bad-outcome taxonomy** and per-role model pin verification.
- **Self-diagnosing its own 72/72 as a training-set score** and freezing a holdout in response.

There is a real story here for the FDE narrative: this is audit → falsification harness →
pre-registered decision rule → recorded failure → architectural fix, run by one person. The failure
modes found above are the ordinary cost of doing it; the discipline is the unusual part.

---

## 5. One genuine disagreement, adjudicated

**Trajectory evaluation.** Google/Vertex/LangSmith/ADK ship path matching (`EXACT` / `IN_ORDER` /
`ANY_ORDER`, plus tool-call precision-recall) as a first-class primitive; ClawBench weights
trajectory at 30%. Anthropic says grade the output, not the path.

**Both are right in different domains, and BuildOS is in the second.** Anthropic's advice targets
_product_ evals — did the agent do the job. Phase A is an _architecture attribution_ experiment: did
bounded specialization cause the win. Scoring only final text makes a win unattributable — you
cannot separate specialization from the better synthesis model. A workflow that called the
Researcher three times unnecessarily or skipped the Librarian shows up only as cost, never as a
labeled path failure.

Given the thesis is about _how work gets decomposed_, the harness currently cannot see decomposition
quality at all. Recommend adopting ADK-style trajectory assertions for the comparison lane only.

---

## 6. Recommended plan

### Tier 0 — before any further spend (hours, $0)

1. Fix the three broken validators and the criterion-ID mismatch.
2. Typecheck both paid harnesses; fix the two TS errors.
3. Fix or rename the v5 script; correct the runbook and project memory.
4. Recompute `pass@k` / `pass^k` and a 4×4 route confusion matrix from existing JSON.
5. Re-hash the two re-indented result files; correct the false reproducibility claims.
6. Rename the report's `decision` field to `routeAccuracyDecision`.
7. Raise `ROUTE_MODEL_MAX_TOKENS`; reclassify `finish_reason=length` as infrastructure-invalid.
8. Drop C07 from the primary denominator, per the existing rule, _before_ scoring.

### Tier 1 — the experiments that decide everything (~2 days, ~$15)

> **Executable handoff:** [`../TIER_1_CONTROL_HANDOFF_2026-07-25.md`](../TIER_1_CONTROL_HANDOFF_2026-07-25.md)
> — self-contained, hand it to a fresh agent. Note that `OPEN_BRIEF_EVAL_METHODOLOGY.md` §3 also
> uses the name "Tier 1" for unrelated work; the handoff disambiguates in its §0.

9. Re-run the control lane on GLM 5.2 `powerful`.
10. Add a matched-compute single-agent arm and a prompt-only Librarian arm.
11. Measure the human label ceiling: 2–3 independent labelers, cold, world-card-only.
12. Add a workflow-vs-workflow **null lane** to establish the noise floor empirically.

### Tier 2 — make the comparison decidable (~1 week)

13. Grow the comparison to ~37 pairs; grow the route corpus toward 60–100.
14. Rebuild the holdout with `workflow` and `clarify` cases at 9 runs/scenario.
15. Judge every pair in both orderings (~2× judge cost, ≈$0.05 → $0.10).
16. Add trajectory scoring for the comparison lane.
17. Report intervals, not point scores. Report cost as a Pareto frontier, not a 3× threshold.

### Tier 3 — architecture changes worth making regardless

18. Add `decisions[]` and `rejected_alternatives[]` to `AgentResult` (you already have
    `assumptions`, `open_questions`, `residual_risks`). This is the specific gap Cognition's
    critique identifies.
19. Build the `direct → workflow` promotion path so misroutes are recoverable; then route accuracy
    becomes a soft quality metric rather than a hard gate.
20. Quarantine fetched web content from planner context; add per-route trifecta accounting.
    "Read-only" does **not** close the lethal trifecta — Meta's Rule of Two counts "communicate
    externally" as the dangerous property, and the Researcher's web fetches qualify.
21. Consider not having the CEO rewrite specialist output. LangChain's τ-bench study — the only
    _measured_ multi-agent architecture comparison found — closed ~50% of the supervisor-vs-swarm
    gap with three fixes, one being "let the specialist's words reach the user unrewritten."

---

## 7. Decisions that need you

These change the shape of the work; the rest is execution.

1. **Reframe the routing gate?** It currently measures an unreachable target. Restating it in
   scenario units with a measured label ceiling is defensible _only_ because the justification rests
   on properties of the instrument that were true before scoring. Simply loosening 65 → 54 after
   seeing 58 would not be. That distinction is worth writing into the results doc.
2. **Spend ~$15 and ~1 day to kill the model confound before any scored cohort?** Without it, a Go
   is uninterpretable.
3. **Fund ~37 pairs — i.e. 2–3 hours of your blind labeling?** Below that the comparison cannot
   decide anything.
4. **Reclassify the 3× cost and 2× latency bounds as product constraints rather than hypotheses?**
   Anthropic reports multi-agent at 3–10× single-agent tokens; the bound may be measuring itself.
5. **Is Phase A's read-only scope worth a Go at all?** Cognition: multi-agent works "when writes stay
   single-threaded and additional agents contribute intelligence rather than actions." Phase A tests
   only the regime where multi-agent already has consensus support, so a read-only Go says little
   about the staged-mutation work you actually want.

---

## 8. What this research could not answer

- **Zero published comparisons exist in BuildOS's actual domain** — agent work over a user's own
  structured project data. All external evidence is coding, math, multi-hop QA, or web research.
- No frontier lab publishes a multi-agent _evaluation_ methodology, so the ≥6/9 framing has no
  external benchmark to be measured against.
- Whether code-enforced citation validation actually reduces "fail-plausible" rates — an unvalidated
  lead, not a solved problem.
- Whether the workflow lane would have won. **A2 still has zero scored outputs**; nothing in this
  dossier speaks to that.

---

## 9. Chapter index

| #   | Chapter                                        | Focus                                                           |
| --- | ---------------------------------------------- | --------------------------------------------------------------- |
| 00  | `00_SYSTEM_UNDER_REVIEW.md`                    | The brief all external chapters were written against (+ errata) |
| 01  | `01_FRONTIER_LAB_DOCTRINE.md`                  | Anthropic / OpenAI / Google prescriptions                       |
| 02  | `02_MULTI_AGENT_SKEPTICS_AND_FAILURE_MODES.md` | The case against, MAST taxonomy, falsification lens             |
| 03  | `03_EVAL_METHODOLOGY_PRACTITIONERS.md`         | Judge validation, error analysis, worked statistics             |
| 04  | `04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md`    | Benchmark standards, cost-controlled evaluation                 |
| 05  | `05_ROUTING_AND_CLASSIFICATION_EVALS.md`       | Routers, abstention, label ceilings                             |
| 06  | `06_OSS_HARNESSES_OPENCLAW_HERMES.md`          | OpenClaw, Hermes, 16-system comparative survey                  |
| 07  | `07_EVAL_OPS_AND_OBSERVABILITY.md`             | Tracing, trajectory metrics, build-vs-buy                       |
| 08  | `08_CONTEXT_ENGINEERING_AND_SECURITY.md`       | Handoff payloads, context rot, injection                        |
| 09  | `09_INTERNAL_GROUND_TRUTH_MAP.md`              | Code-level audit; docs-vs-code discrepancies                    |
| 10  | `10_ROUTING_FAILURE_FORENSICS.md`              | What 58/72 and 61/72 actually are                               |
