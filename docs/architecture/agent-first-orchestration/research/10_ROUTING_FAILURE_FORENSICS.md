<!-- docs/architecture/agent-first-orchestration/research/10_ROUTING_FAILURE_FORENSICS.md -->

# Routing failure forensics — what 58/72 actually is

**Date:** 2026-07-25
**Author:** primary analysis (not delegated)
**Source data:** `packages/agent-orchestrator/src/testing/harness/results/route-eval-v5.json`,
`corpus/phase-a.json`, `fixtures/project-alpha.snapshot.json`,
`application/route-mode/{world-card,prompts,route-mode-with-review}.ts`

This chapter exists because the aggregate number — 58/72, 80.6%, "Change" — hides its own
structure. The per-scenario breakdown changes the diagnosis completely.

---

## 1. The failure is not diffuse. It is one scenario.

| Scenario                          | Class                           | Expected       | Correct | Routes actually returned |
| --------------------------------- | ------------------------------- | -------------- | ------- | ------------------------ |
| a0-c01-in-sync-explanation        | simple_read                     | direct         | **9/9** | direct ×9                |
| a0-c02-next-actions               | simple_read                     | direct         | **9/9** | direct ×9                |
| a0-c04-five-bullet-status         | status_summary                  | direct         | **9/9** | direct ×9                |
| a0-c06-single-source-article      | single_source_lookup            | workflow       | **9/9** | workflow ×9              |
| a0-c07-campaign-workflow-research | multi_source_research           | workflow       | 7/9     | workflow ×7, clarify ×2  |
| a0-c08-context-app-recommendation | context_research_recommendation | workflow       | 6/9     | workflow ×6, clarify ×3  |
| **a0-c09-missing-content-scope**  | **ambiguous**                   | **clarify**    | **0/9** | **workflow ×9**          |
| a0-c12-email-capability-gap       | unsupported_capability          | capability_gap | **9/9** | capability_gap ×9        |

**Six of eight scenarios are perfect. One is perfect-inverse.**

Error budget accounting:

- Total errors: 14.
- C09 alone: **9 errors — 64% of all failure.**
- C08: 3. C07: 2.
- Every error in the run is on a single confusable boundary: **workflow ↔ clarify.** No other
  confusion appears anywhere in 72 calls. `direct` is never confused with anything.
  `capability_gap` is never confused with anything.

The router does not have a general routing problem. It has one boundary problem, and 64% of the
observed damage is one item.

---

## 2. The arithmetic of the gate makes a single bad item fatal

The pre-registered bound is **≥65/72**, i.e. **at most 7 errors permitted**.

The corpus is 8 items × 9 repeats. The repeats are near-deterministic — six scenarios returned the
identical route 9/9, and C09 returned the identical _wrong_ route 9/9.

Therefore:

> **Any single scenario that fails systematically costs 9 errors against a 7-error budget.**
> One systematically-wrong item is an automatic, unrecoverable failure of the gate.

The rule reads as "90% accuracy." It behaves as **"zero scenarios may be systematically wrong."**
The nine repeats do not buy nine items of error tolerance — they multiply one item's verdict by
nine while the budget stays fixed at 7. The gate cannot absorb a single contested label.

And the converse: **if C09 alone flipped, the score would be 67/72 = 93.1% — a pass.** The entire
Phase A program, and the Phase B build decision behind it, currently turns on the label of one
scenario.

That is a fragile gate, independent of who is right about C09.

---

## 3. Effective sample size is 8, not 72

The falsification plan treats 72 as the denominator and derives a discrete threshold from it
("smallest discrete result at or above 90%"). But the nine calls per scenario are not nine
independent observations of routing skill. Six scenarios show zero variance across their nine
calls; C09 shows zero variance too. What the repeats measure is **run-to-run consistency**, which
is high. What they do not measure is **accuracy across the space of user requests**, which is
sampled at n = 8.

A 90% bound computed on n = 8 distinct items has a granularity of 12.5% per item. There is no
resolution between "89%" and "93%" — there are only eight discrete outcomes. Reporting 80.6% to
three significant figures implies a precision the design does not have.

Two separate metrics are being conflated and should be split:

- **Item accuracy** — how many of the 8 scenarios get the right route (majority of runs). Currently
  7/8.
- **Consistency** — how often repeated calls agree with themselves. Currently near-perfect, which
  is genuinely good news the aggregate hides.

---

## 4. Is C09 even answerable? The label conflicts with the prompt.

The request (`a0-c09-missing-content-scope`):

> "I need to batch some content production for today or this week. Are there any tasks or
> information on what I have planned, or what I should have planned? Please research this and let
> me know."

Label: `clarify / missing_required_context`. Corpus note: _"Tests whether the router notices that
the resolved project scope does not match the requested work."_

The frozen project is **"Project Alpha — Response-Speed Training"** — a personal training program
(hardware / software / pressure-feedback layers). Its 11 tasks are things like "Start the caffeine
protocol", "Enroll in a full improv class series", "Complete the weekly telemetry review". There is
genuinely no content-production work in it.

So the intended reasoning is: _this project is about reaction-time training; the user is asking
about content production; the scope doesn't match; ask which project they mean._

Three problems:

**(a) The router cannot see the tasks.** `buildPhaseAWorldCard` puts only `entity_counts` in the
card — `{goals: 1, plans: 3, tasks: 11, documents: 5, relationships: N}`. No task titles, no
document titles, no goal names. The only semantic content about the project is its name,
description, stage, and next*step. The model is asked to conclude something about \_the contents of
11 tasks it cannot see*. It can infer from the name/description — which is a real signal — but it
is being asked to assert an **absence** from an admittedly-lossy summary.

**(b) The prompt explicitly tells the model not to do that.** `ROUTE_SYSTEM_PROMPT` states:

> "project.read **may retrieve records and bodies omitted from the lightweight card**, so an
> unresolved referent naming a project-local field, metric, score, task, or document is still
> direct."

C09 literally names tasks ("Are there any **tasks** or information on what I have planned"). By the
prompt's own written rule, that is `direct`. The label says `clarify`. **The rubric and the
instructions point at different answers on this item.** A model following the prompt correctly
should route this away from clarify — which is exactly what it did nine times out of nine.

**(c) A third reading is defensible.** The project description mentions "executive communication."
A user batching content production while running a communication-training program is not obviously
out of scope. And a perfectly good product response is `direct`: read the 11 tasks, answer "here's
what you have planned this week; none of it is content production." That answers the user's literal
question ("Are there any tasks…") without asking them anything.

**Assessment:** C09 is not a clean label. It is a three-way boundary item where the prompt says
`direct`, the label says `clarify`, and the model says `workflow`. Scoring it 0/9 is at least as
much an indictment of the item as of the router.

This is the highest-value thing to resolve, and it is resolvable cheaply — see §6.

---

## 5. The C07/C08 leakage is the same boundary, in the other direction

C07 and C08 are labeled `workflow` and occasionally return `clarify` (2/9 and 3/9). C09 is labeled
`clarify` and always returns `workflow`. This is one decision boundary being crossed in both
directions — the router has no stable notion of _"do I have enough scope to research, or must I
ask?"_

That is a genuine, real finding and it should survive any relabeling of C09. But note its size
without C09: **5 errors across 63 calls (92.1%)** — which passes the 90% bar. The reported failure
and the real weakness are not the same thing.

Note also that C08 ("I have an iPhone. Can you research which app I should download for **this**?")
is the canonical unresolved-referent case, and the router resolves it correctly 6/9. The 3 clarify
answers are arguably _reasonable_ — "this" is genuinely underspecified without reading the project.
The label is defensible, but so is the model's minority answer.

---

## 5A. Two newer runs exist that the docs still describe as blocked

`NEXT_ITERATION.md` (written 12:08) says the mitigation-v2 confirmation and the held-out score are
frozen and pending. Both were in fact executed at **16:15 today** and their reports are on disk:

| Report                          | Corpus                 | Result    | Recorded decision |
| ------------------------------- | ---------------------- | --------- | ----------------- |
| `route-eval-mitigation-v2.json` | frozen eight, 72 calls | **61/72** | change            |
| `route-eval-holdout-v1.json`    | holdout five, 15 calls | **15/15** | go_candidate      |

The docs are stale against the results directory. Anyone reading the runbook would believe the gate
is still unrun. Both findings below come from those two files.

### 5A.1 Mitigation v2 confirms the C09 diagnosis in §4

C09 under mitigation v2 returns **`direct` six times** (plus one `workflow`, two nulls) — where
under v5 it returned `workflow` nine times. As the code took over more of the decision, the model's
answer migrated to exactly what `ROUTE_SYSTEM_PROMPT` literally instructs for a request naming
tasks: _direct_. The label still says `clarify`.

This is close to a controlled demonstration that the item's label conflicts with the prompt's
written rule, rather than that the model is failing to reason. C09 remains 0/9 across both runs and
across three different answers — the router has now given all three plausible routes and been
marked wrong every time.

### 5A.2 Four errors are token-cap truncations, not routing mistakes

Four of the eleven mitigation-v2 errors have `actualRoute: null` with an identical cause:

> `OpenRouter returned empty content (cause=null_content, finish_reason=length, model=z-ai/glm-5.2, provider=DeepInfra)`

`finish_reason=length` against `ROUTE_MODEL_MAX_TOKENS = 900`. GLM 5.2 is a reasoning model; it
spends tokens thinking before emitting JSON, and the cap truncated it before any output existed.

All four are recorded as `scored: true`, `infrastructureInvalidReason: null`, and the report's
`infrastructureInvalidCount` is **0**. They are being counted as wrong routing decisions.

The falsification plan's own rule says a "harness failure" is infrastructure-invalid and gets one
replacement. A max-tokens setting that truncates the model before it can answer is a harness
configuration failure, not a model judgment. Under a defensible reading of the plan's own rule,
these four should have been replaced rather than scored.

Impact: two of the four are on scenarios the router otherwise gets right 8/9 (C07, C08), so they
would most likely have resolved correctly — moving 61/72 to roughly 63/72. That still misses the
65/72 bound, so this does **not** by itself rescue the gate. But a paid architecture decision
should not be partly determined by a `max_tokens` value, and this needs to be fixed and disclosed
before any further run.

### 5A.3 The holdout cannot test the thing that is failing

The five held-out scenarios are:

| Scenario                    | Class                  | Expected route |
| --------------------------- | ---------------------- | -------------- |
| a0-c03-project-status       | status_summary         | direct         |
| a0-c05-single-document-read | simple_read            | direct         |
| a0-c10-week-planning-stress | route_stress           | direct         |
| h1-t01-today-focus          | status_summary         | direct         |
| h1-t02-email-connection     | unsupported_capability | capability_gap |

**Four `direct`, one `capability_gap`. Zero `workflow`. Zero `clarify`.**

Every observed routing error in this program — all 14 in v5, all 11 in mitigation v2 — lives on the
`workflow ↔ clarify` boundary. The held-out set contains neither class. It samples only the two
route classes the router already answers perfectly.

Confirming this structurally: `reviewed` is `false` on **all 15 holdout runs**, and the only model
that appears in the report is `google/gemini-3.1-flash-lite`. The bounded GLM reviewer — the
component that exists specifically to resolve workflow-vs-clarify scope — **never fired once**. The
holdout exercises roughly half the router and none of the failure mode.

It also uses 3 runs per scenario against the frozen set's 9, so the two numbers are not sampled
comparably.

**Consequence:** a 15/15 "go_candidate" on this set is not evidence of generalization and must not
be reported as held-out validation of routing. Reported side by side with 61/72 it will read as
"we're fine on unseen data, the frozen set is just hard" — the opposite of what the data supports.
The holdout needs `workflow` and `clarify` cases before it means anything.

---

## 6. What this implies for the next move

Ordered by value per dollar. None of these require a paid rerun to start.

0. **Rebuild the holdout before trusting it.** Add `workflow` and `clarify` cases — the set is
   currently blind to 100% of observed errors — and sample it at the same 9 runs/scenario as the
   frozen eight. Until then, do not report 15/15 as held-out validation. (§5A.3)
   0b. **Fix `ROUTE_MODEL_MAX_TOKENS` and reclassify truncations.** Raise the cap for the reasoning
   model, and treat `finish_reason=length` as infrastructure-invalid under the plan's existing
   rule. Disclose the four affected calls in whatever gets written up. (§5A.2)
1. **Establish the human ceiling before re-running anything.** Have 2–3 people independently label
   all 8 scenarios (and the 5 holdout cases) cold, with only the world card the router sees — not
   the full snapshot. Measure agreement. If humans disagree on C09, the 90% target was never
   reachable and the bound is measuring label noise. This costs an hour and no model spend.
2. **Split the metric.** Report item accuracy (7/8) and consistency (near-perfect) separately.
   Never report a 72-denominator as if it were 72 independent samples.
3. **Re-derive the bound from the real item count.** A threshold on n = 8 must be expressed in
   items, and must state explicitly how many systematically-failing items it tolerates. The current
   rule tolerates zero, which was almost certainly not the intent.
4. **Fix the prompt/label contradiction.** Either the "still direct" rule needs an explicit
   scope-mismatch exception, or C09's label is wrong. Both are one-line changes; picking which is a
   product decision, not a tuning pass. This is not "a fifth prompt pass against the frozen eight" —
   it is repairing an internal inconsistency the corpus and prompt disagree on.
5. **Build a confusion matrix into the report.** The harness computes `routeMatchCount` but not a
   4×4 confusion matrix. One matrix would have surfaced the single-boundary diagnosis immediately
   instead of after a paid run and a Change verdict.
6. **Reconsider whether misroutes must be fatal at all.** The README already contemplates "a direct
   request may be promoted into a workflow if new complexity appears." If clarify↔workflow errors
   are recoverable at runtime — ask a question mid-workflow, or promote a direct read — then route
   accuracy is a soft quality metric, not a hard architectural gate. A design that needs 90%
   first-shot routing is a design with no recovery path. That is an architecture question, not an
   eval question.

---

## 7. What is genuinely good here and should not be lost

- Route labels were frozen before prompt work. That discipline is real and rare.
- The failed result was recorded, hashed, and left canonical rather than re-run until green. That is
  the single strongest signal of integrity in this whole program.
- Prompt tuning was **stopped** at v5 rather than continued against a burned corpus, and a holdout
  was created. Correct call.
- Near-zero run-to-run variance at temperature 0.1 means the harness itself is not noisy — the
  measurement instrument works. That is a real asset for everything downstream.
- The migration of decisions from model to code (URL detection, reason compilation, topology
  selection, forced transitions) is convergent with how production routers actually get built.

---

## 8. Confidence

- **High:** the per-scenario breakdown, the error concentration in C09, the "one systematic failure
  exceeds the error budget" arithmetic, the world card containing only entity counts.
- **High:** the prompt's "still direct" rule and C09's `clarify` label are in tension; both texts
  are quoted above.
- **Medium:** the claim that C09 is _mislabeled_. It is defensibly labeled if one accepts inference
  from the project name alone. What is not defensible is that it is treated as a clean item whose
  9/9 failure should sink a program gate.
- **Not assessed here:** whether the workflow lane would have won its comparison. Nothing in this
  chapter speaks to that; A2 has zero scored outputs.
