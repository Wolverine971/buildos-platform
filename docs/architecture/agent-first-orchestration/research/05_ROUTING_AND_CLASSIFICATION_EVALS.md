<!-- docs/architecture/agent-first-orchestration/research/05_ROUTING_AND_CLASSIFICATION_EVALS.md -->

# Routing & Classification Evals — external practice vs. the BuildOS CEO router

**Date:** 2026-07-25
**Chapter of:** agent-first orchestration research dossier
**Author:** independent researcher (chapter 05)

---

## Scope

This chapter covers how production systems build, evaluate, and improve LLM routers and
classifiers, and asks whether the pre-registered `≥65/72` (90.3%) route-accuracy gate that is
currently blocking BuildOS Phase A is the right architectural requirement.

In scope: LLM routing/cascade research; production intent-classification measurement practice;
label quality and inter-annotator agreement as a ceiling on achievable accuracy; calibration,
abstention and selective prediction; automated prompt optimization (DSPy/MIPROv2/GEPA);
non-prompt alternatives (embeddings + trained head, fine-tuning, uncertainty routing);
structured-output reliability; and architectures that make router error recoverable.

Out of scope: the workflow-vs-control comparison lane, judge-panel design, and everything in the
Phase A "explicitly out of scope" list. This chapter takes the system description in
`00_SYSTEM_UNDER_REVIEW.md` as given and does not modify it.

---

## Key sources

| #   | Source                                                                                     | What it establishes                                                                                                                                                                                                                                      | URL                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ong et al., _RouteLLM: Learning to Route LLMs with Preference Data_ (LMSYS)                | Routers as a tunable cost-quality knob, not a correctness gate; four router families; augmentation with LLM-judge labels                                                                                                                                 | https://arxiv.org/abs/2406.18665 · https://www.lmsys.org/blog/2024-07-01-routellm/                                                                               |
| 2   | Chen, Zaharia, Zou, _FrugalGPT_                                                            | LLM cascades: start cheap, escalate on low score; matches GPT-4 with up to 98% cost reduction                                                                                                                                                            | https://arxiv.org/abs/2305.05176                                                                                                                                 |
| 3   | Anthropic, _Building Effective AI Agents_                                                  | Routing pattern definition and its precondition: "where classification can be handled accurately"                                                                                                                                                        | https://www.anthropic.com/engineering/building-effective-agents                                                                                                  |
| 4   | Anthropic/Claude, _When to use multi-agent systems_                                        | 3–10× token cost for multi-agent; "start with the simplest approach that works"                                                                                                                                                                          | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them                                                                                    |
| 5   | Meta Engineering, _Privacy-Aware Infrastructure in the AI-Native Era_ (2026-06)            | Production hybrid: ~85% deterministic rules, ~15% LLM fallback (~400× compute), human escalation on low confidence / judge disagreement                                                                                                                  | https://engineering.fb.com/2026/06/25/security/privacy-aware-infrastructure-in-the-ai-native-era-an-asset-classification-case-study/                             |
| 6   | Jung, Brahman, Choi, _Trust or Escalate_ (ICLR 2025)                                       | Selective evaluation with a provable ≥80% human-agreement guarantee at ~80% coverage using a 7B budget model                                                                                                                                             | https://arxiv.org/abs/2407.18370                                                                                                                                 |
| 7   | Arora, Jain, Merugu (Amazon), _Intent Detection in the Age of LLMs_                        | Uncertainty-based routing between SetFit encoder and LLM: within 2% of native LLM accuracy at 50% less latency                                                                                                                                           | https://arxiv.org/abs/2410.01627                                                                                                                                 |
| 8   | Kokkodis et al., _Beyond the Hype: Embeddings vs. Prompting for Multiclass Classification_ | Embeddings + trained head beat prompting: +49.5% accuracy, 81× faster on text, up to 10× cheaper, and _well-calibrated_ probabilities where prompting scores are "overly uninformative"                                                                  | https://arxiv.org/abs/2504.04277                                                                                                                                 |
| 9   | Agrawal et al., _GEPA: Reflective Prompt Evolution_ (ICLR 2026 Oral)                       | Automated reflective prompt evolution beats MIPROv2 by >10% and GRPO by ~6% avg (up to 20%) with 35× fewer rollouts                                                                                                                                      | https://arxiv.org/abs/2507.19457                                                                                                                                 |
| 10  | DSPy optimizer docs                                                                        | Optimizer selection by dataset size: ~10 → BootstrapFewShot; 50+ → BootstrapFewShotWithRandomSearch; **200+ "to prevent overfitting" before MIPROv2**                                                                                                    | https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md                                                                         |
| 11  | Miller (Anthropic), _Adding Error Bars to Evals_                                           | Report SEM; **cluster standard errors on the randomization unit** (clustered SEs can be >3× naive); resample within question; power-analyze the item count                                                                                               | https://arxiv.org/abs/2411.00640 · https://www.anthropic.com/research/statistical-approach-to-model-evals                                                        |
| 12  | Husain & Shankar, _LLM Evals FAQ_                                                          | ≥100 traces for error analysis; theoretical saturation (~20 traces with no new category → stop); binary over Likert; 100+ labeled examples to validate a judge; "if you're passing 100% of your evals, you're likely not challenging your system enough" | https://hamel.dev/blog/posts/evals-faq/                                                                                                                          |
| 13  | Pavlick & Kwiatkowski, _Inherent Disagreements in Human Textual Inferences_ (TACL 2019)    | Human disagreement on semantic labels is **not** annotation noise; it persists as more ratings are collected                                                                                                                                             | https://aclanthology.org/Q19-1043/                                                                                                                               |
| 14  | Landis & Koch benchmarks (via Stata `kappa` manual)                                        | κ 0.61–0.80 = "substantial"; 0.81–1.00 = "almost perfect"                                                                                                                                                                                                | https://www.stata.com/manuals/rkappa.pdf                                                                                                                         |
| 15  | Krippendorff's α practitioner guidance                                                     | α > 0.80 strong; 0.67–0.80 acceptable; model can be scored as an extra annotator against the human-human ceiling                                                                                                                                         | https://encord.com/blog/interrater-reliability-krippendorffs-alpha/ · https://labelstud.io/blog/how-to-use-krippendorff-s-alpha-to-measure-annotation-agreement/ |
| 16  | Zheng et al., _Judging LLM-as-a-Judge_ (MT-Bench)                                          | GPT-4 reaches >80% agreement with humans — "the same level of agreement between humans"                                                                                                                                                                  | https://arxiv.org/abs/2306.05685                                                                                                                                 |
| 17  | Commey, _When "Better" Prompts Hurt_ (2026-01)                                             | Prompt iteration overfits; recommends 50–200 test cases, ~20% edge cases, ~400–600 per condition to detect a 5% difference at 95%/80% power                                                                                                              | https://arxiv.org/html/2601.22025v1                                                                                                                              |
| 18  | OpenAI, _Introducing GPT-5_ / GPT-5 System Card                                            | A production 2-way router whose errors are recoverable by the user ("think hard about this") and which is "continuously trained on real signals, including when users switch models"                                                                     | https://openai.com/index/introducing-gpt-5/ · https://openai.com/index/gpt-5-system-card/                                                                        |
| 19  | Aurelio Labs, _Semantic Router_                                                            | Deterministic decision layer in front of the LLM; explicit routes without "performance deterioration due to LLM hallucinations"                                                                                                                          | https://github.com/aurelio-labs/semantic-router · https://www.aurelio.ai/semantic-router                                                                         |
| 20  | Structured Output Benchmark (2026)                                                         | Every model >84% JSON pass rate but none >80.4% _value_ accuracy — schema compliance ≠ semantic correctness                                                                                                                                              | https://arxiv.org/pdf/2604.25359                                                                                                                                 |

---

## Findings

### 1. Nobody in production treats a router as a correctness gate

RouteLLM does not report "route accuracy." It reports a _frontier_: quality retained vs. fraction
of calls sent to the expensive model, and lets the operator pick a point on it. Its headline result
is "cost reductions of over 85% on MT Bench, 45% on MMLU, and 35% on GSM8K … while still achieving
95% of GPT-4's performance" — a quality-preservation claim, not a classification-accuracy claim
([LMSYS](https://www.lmsys.org/blog/2024-07-01-routellm/)). FrugalGPT is the same shape: the
cascade's job is to be cheap, and a "wrong" early route costs one extra call, not a wrong answer
([arXiv 2305.05176](https://arxiv.org/abs/2305.05176)).

GPT-5 ships the most-used router in the world and handles misroutes socially and statistically
rather than by demanding accuracy: the user can force escalation by typing "think hard about this,"
and the router "is continuously trained on real signals, including when users switch models,
preference rates for responses, and measured correctness"
([OpenAI](https://openai.com/index/introducing-gpt-5/)). The design assumption is that the router
_will_ be wrong and the system must survive it.

Anthropic's own framing states the precondition BuildOS is currently failing: routing "works well
for complex tasks where there are distinct categories that are better handled separately, and where
classification can be handled accurately"
([Anthropic](https://www.anthropic.com/engineering/building-effective-agents)). Read as a decision
rule, that sentence says: if classification _cannot_ be handled accurately, the answer is to change
the categories or the recovery model — not to keep tuning the prompt.

### 2. Model accuracy is bounded by label agreement, and BuildOS has never measured its ceiling

The doctrine is well established: on semantically interpretive labels, human disagreement is not
noise to be cleaned up. Pavlick & Kwiatkowski showed disagreement on textual-inference labels
"persist[s] as more ratings are collected," i.e. it is a property of the task, not the annotators
([TACL 2019](https://aclanthology.org/Q19-1043/)). The practical corollary in every annotation
guide: score the model as an additional annotator and compare model-human agreement to human-human
agreement ([Encord](https://encord.com/blog/interrater-reliability-krippendorffs-alpha/),
[Label Studio](https://labelstud.io/blog/how-to-use-krippendorff-s-alpha-to-measure-annotation-agreement/)).
Zheng et al. anchor the empirical level: a frontier judge hits >80% agreement with humans, "the
same level of agreement between humans" ([arXiv 2306.05685](https://arxiv.org/abs/2306.05685)).

Now the arithmetic that matters for BuildOS. For a 4-class problem with a realistic route
distribution (say direct 0.40, workflow 0.30, clarify 0.20, capability_gap 0.10), chance agreement
is `A_e = 0.16+0.09+0.04+0.01 = 0.30`. Cohen's κ relates raw agreement to chance by
`A_o = κ(1−A_e) + A_e`. So:

- κ = 0.70 ("substantial") → raw human-human agreement ≈ **79%**
- κ = 0.80 (top of "substantial") → ≈ **86%**
- raw agreement of **90%** → κ ≈ **0.857**, inside Landis & Koch's "almost perfect" band
  ([Stata kappa manual](https://www.stata.com/manuals/rkappa.pdf))

**A 90% route-accuracy gate against a single un-replicated annotator's labels is a demand for
almost-perfect agreement with one person's opinion.** BuildOS's own corpus flags `status_summary`
as "borderline — this is the routing stress test," which is direct evidence that at least one label
is contested. That is an admission that the ceiling is below 100% and has never been quantified.

### 3. The `≥65/72` bound is statistically unreachable by construction

This is the most concrete finding in the chapter, and it is arithmetic, not opinion.

72 calls = **8 scenarios × 9 replicates at temperature 0.1**. The 72 calls are not 72 independent
draws from the request distribution; they are 9 near-deterministic replicates of 8 items. This is
precisely the clustered-sampling case Miller warns about: cluster standard errors on the
randomization unit, because "clustered standard errors on popular evals can be over three times as
large as naive standard errors" ([arXiv 2411.00640](https://arxiv.org/abs/2411.00640)). The
effective sample size here is **8**, not 72.

Three consequences:

**(a) The threshold sits in a dead zone.** `≥65/72` permits at most 7 errors. A single scenario
contributes up to 9 calls. At temperature 0.1 a router is near-deterministic per item, so
scenario-level scores pile up at 9/9 or 0/9 and attainable totals cluster near multiples of 9:
…, 54, 63, **72**. There is no natural outcome at 65. A near-deterministic router that gets 7 of 8
items right scores 63 and fails; the only realistic passing score is **72/72** — which is exactly
the number produced by the four tuning passes that were later recognized as a training-set score.
The pre-registered "90%" gate is, mechanically, a disguised **8/8 items** gate.

**(b) One contested label ends it.** If `status_summary` is genuinely 50/50 between two reasonable
humans and the router reproduces that distribution, its expected contribution is 4.5/9. Ceiling
with everything else flawless: 63 + 4.5 = **67.5/72** — passes, but only if all seven other items
are perfect. **Two** contested items cap the ceiling at 54 + 9 = **63/72**, below the bound, with a
perfect router. The gate tolerates at most one ambiguous item in the entire corpus.

**(c) The observed 58/72 is a per-class failure, not an 81% system.** Under near-determinism, 58
decomposes as roughly six items solid and two items contested or wrong. The right reading is
"2 of 8 route classes are not learned," which is a confusion-matrix finding, not an accuracy
finding. Standard intent-classification practice is exactly this: report per-class precision/recall
and the confusion matrix, because "a macro F1 of 0.80 across five classes can hide one class at
0.40" ([FutureAGI](https://futureagi.com/blog/f1-score-evaluating-classifiers-2025/)). A single
micro-accuracy number over 72 calls actively hides the only signal in the run.

For calibration: the naive Wilson 95% CI on 58/72 is roughly **[70.0%, 88.1%]** — it excludes 90%,
so the miss is real _if_ you pretend n=72. With effective n=8, even a perfect 8/8 gives a
Clopper-Pearson lower bound around 63%. **The corpus is too small to certify a 90% bound in either
direction.** Detecting 0.90 vs 0.80 in a one-sided test at 80% power needs on the order of 80
independent items; Commey's power figures for a 5-point difference land at 400–600 per condition
([arXiv 2601.22025](https://arxiv.org/html/2601.22025v1)).

### 4. Abstention and calibration are how real systems avoid needing 90%

_Trust or Escalate_ is the cleanest demonstration: a Mistral-7B judge with a calibrated abstention
policy achieves a **provable >80% human-agreement guarantee at ~80% coverage**, on a benchmark
where GPT-4 alone "almost never achieves 80% human agreement"
([arXiv 2407.18370](https://arxiv.org/abs/2407.18370)). The trick is not a better classifier — it
is refusing to classify the hard 20%.

Amazon's intent-detection work does the same thing operationally: uncertainty-based routing between
a cheap SetFit encoder and an LLM lands "within 2% of native LLM accuracy with 50% less latency"
([arXiv 2410.01627](https://arxiv.org/abs/2410.01627)). Meta's production asset classifier gates
human escalation on "low calibrated confidence below auto-accept thresholds" and "judge-panel
disagreement" ([Meta Engineering](https://engineering.fb.com/2026/06/25/security/privacy-aware-infrastructure-in-the-ai-native-era-an-asset-classification-case-study/)).

BuildOS already owns the perfect abstention target: **`clarify` is a safe default.** A router that
cannot decide between `direct` and `workflow` on a status summary can ask. That converts a scored
error into a one-turn cost. Nothing in the current design exploits this.

The classical framing is cost-sensitive thresholding: choose the decision threshold to minimize
expected cost, `T = C_FP / (C_FP + C_FN)`, not to maximize accuracy
([mlr](https://mlr.mlr-org.com/articles/tutorial/cost_sensitive_classif.html)). BuildOS's four
routes have wildly asymmetric error costs — `capability_gap` when the system _could_ have acted is
a false refusal (worst); `workflow` when `direct` sufficed is merely slow and expensive;
`direct` when `workflow` was needed is a shallow answer. Plain accuracy weights all of these
identically, which is the wrong objective function for this system.

### 5. Moving decisions from the model into code is the dominant production pattern, not an anti-pattern

Meta states it flatly: "The LLM does not make the production decision in the common case,
deterministic rules do." Their split is ~85% deterministic (single-digit ms) / ~15% LLM fallback
(seconds, ~400× compute cost), and they note a separate enforcement team independently chose the
same pattern over end-to-end LLM approaches because it was "more consistent, debuggable, and
auditable." Semantic Router is built on the same premise — a deterministic decision layer that
avoids "performance deterioration due to LLM hallucinations"
([Aurelio](https://www.aurelio.ai/semantic-router)). Anthropic's advice reduces to the same thing:
"finding the simplest solution possible, and only increasing complexity when needed."

So BuildOS's drift — regex for supplied URLs, code-compiled reason codes, topology derived from
observable request features, forced transitions counted rather than asked — **is convergence on the
mainstream pattern, and the audit that removed `reason_code` from the execution path was correct.**

One caveat, and it is sharp: those rules were induced by a human staring at the same eight
scenarios that are being scored. Overfitting does not care what substrate it lives in. Moving a
decision from prompt to regex does not reset the training-set contamination; it just makes it
invisible to prompt-version hashing. The held-out corpus must therefore score the _whole compiled
path_ — code plus model — and the code must be version-hashed alongside the prompt.

### 6. If prompting has plateaued, stop prompting

Five hand-written prompt versions is well past the point where the literature says switch methods.

- **Automated optimization.** GEPA beats MIPROv2 by >10% and GRPO by ~6% on average (up to 20%)
  using 35× fewer rollouts, by reflecting on execution traces in natural language rather than on a
  scalar reward ([arXiv 2507.19457](https://arxiv.org/abs/2507.19457)). But DSPy's own docs gate
  MIPROv2 on "200 examples or more to prevent overfitting"
  ([DSPy](https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md)).
  With 8 examples the honest recommendation is `BootstrapFewShot` ("very few examples (around 10)"),
  which mainly buys automated few-shot selection, not a new capability.
- **Embeddings + a trained head.** On a real multiclass production task, embeddings beat prompting
  by 49.5% on accuracy, ran 81× faster on text, cost up to 10× less, and — critically — "yield
  well-calibrated probabilities, which can be used as confidence signals, whereas prompting scores
  are overly uninformative" ([arXiv 2504.04277](https://arxiv.org/abs/2504.04277)). Calibrated
  probabilities are the missing ingredient for every abstention design above.
- **Structured output ≠ correctness.** Constrained decoding buys schema validity, not semantic
  accuracy: models exceed 84% JSON pass rates while none exceeds 80.4% value accuracy
  ([arXiv 2604.25359](https://arxiv.org/pdf/2604.25359)). If BuildOS is already getting valid
  route enums, structured outputs have nothing further to give here.

### 7. Split discipline: BuildOS's corpus is 1–2 orders of magnitude too small

Standard practice is train/dev/test with the test set touched once. Concretely from the sources:
50–200 test cases with ~20% edge cases and 25–50 human-labeled calibration examples
([Commey](https://arxiv.org/html/2601.22025v1)); ≥100 traces for error analysis with a saturation
heuristic of "if ~20 traces don't turn up a new category, you can stop"; 100+ labeled examples to
validate an automated judge ([Husain & Shankar](https://hamel.dev/blog/posts/evals-faq/)).

BuildOS has **8 train (burned) + 5 holdout**. A 5-case holdout at 5/5 has a 95% Wilson interval of
roughly **[57%, 100%]** — it cannot distinguish a 90% router from a 60% router. Recognizing the
contamination and freezing a holdout was the right instinct; the holdout is simply too small to
carry a go/no-go decision. Husain's warning applies to the 72/72 that preceded it: "if you're
passing 100% of your evals, you're likely not challenging your system enough."

---

## Is the 90% gate the right requirement?

**The case for keeping it.** Pre-registration is genuinely good science, and moving a bound after
seeing the result is the classic way evaluation programs lie to themselves. There is also a real
architectural argument: if a misroute is _unrecoverable_ — a `direct` answer ships to the user
before anyone notices the request needed research — then routing accuracy really is a correctness
property, and 90% is not obviously too high. Anthropic's routing precondition ("where
classification can be handled accurately") supports gating on it.

**The case against, which I find decisive.**

1. **The bound is unmeasurable with this instrument.** Effective n = 8. The threshold falls in a
   dead zone between the only two attainable near-deterministic outcomes (63 and 72). The gate is
   secretly 8/8, and 8/8 was already achieved once by overfitting. A bound that can only be cleared
   by a perfect score on an 8-item corpus is not a 90% bound.
2. **The bound may exceed the human ceiling.** 90% raw agreement on this 4-class problem implies
   κ ≈ 0.86 against a single annotator. The corpus itself declares one class contested. Nobody has
   measured what two humans agree on. Setting a model target above an unmeasured label ceiling is a
   category error, and it is the specific error the annotation literature exists to prevent.
3. **It optimizes the wrong quantity.** Route errors have asymmetric costs; accuracy treats them as
   equal. `capability_gap` false positives and `direct`-instead-of-`workflow` are not the same
   failure and should not trade off 1:1.
4. **It is a symptom of an unrecoverable design.** Every production system surveyed here — GPT-5,
   FrugalGPT, Meta PAI, Trust-or-Escalate, Amazon's intent router — makes misroutes cheap instead
   of rare. BuildOS's own docs already contain the idea ("promote direct → workflow if new
   complexity appears"). That is the real fix, and it is exactly what the field does. A high
   accuracy gate is what you need _only if_ you refuse to build the promotion path.

**Verdict:** the 90% gate should not stand as written. It should be _replaced_ — before any
rescoring, and with the replacement pre-registered the same way — by a bound stated in units the
system can actually measure and that reflect real cost. Replacing it after seeing 58/72 is
defensible **only** if the replacement is justified by the properties of the instrument (clustering,
effective n, contested labels), all of which were true before the run and none of which depend on
the observed score. Loosening the number to 54/72 to squeak through would be the illegitimate move.

---

## A recommended routing eval + improvement loop for BuildOS

Ordered. Effort is engineer-days for one person.

1. **Measure the label ceiling before anything else. (0.5 day)** Get a second and third competent
   labeler (a colleague, or two frontier models given only the routing policy doc and no
   BuildOS-specific coaching) to independently label all 13 existing scenarios. Compute Cohen's κ /
   Krippendorff's α pairwise. If human-human raw agreement is 85%, the model target cannot be 90%.
   Publish the ceiling number in the decision doc. This is the single highest-value hour in the
   whole program.
2. **Restate the bound in scenario units with error bars. (0.5 day)** Score per _scenario_ (majority
   of 9), report per-route recall and a 4×4 confusion matrix, and report a clustered SEM per
   Miller's Recommendation #2. Re-express the go/no-go as "≥X of N scenarios correct, and no route
   class below Y% recall." Pre-register X and Y _relative to the measured human ceiling_.
3. **Add `clarify` as a calibrated abstention route. (1–2 days)** Have the router emit a confidence
   or a top-2 route set. Below threshold, take `clarify`. Then score two numbers the way
   _Trust or Escalate_ does: **accuracy-on-answered** and **coverage**. A router at 95% on 80%
   coverage is a shippable system; a router at 81% on 100% coverage is not.
4. **Build the promotion path so misroutes are recoverable. (3–5 days)** Implement `direct →
workflow` promotion when the direct step's own output trips a code-checked condition (empty
   retrieval, citation validator failure, digest below a length/grounding floor). Then measure
   **post-recovery task success**, and demote route accuracy to a diagnostic. This is the change
   that dissolves the blocker rather than negotiating with it.
5. **Grow the corpus to 60–100 labeled requests. (2–3 days)** Sample fresh from
   `chat_sessions`/`chat_turn_runs`, stratified so every route has ≥15 items, ~20% deliberate edge
   cases. Split 40 train / 20 dev / 40 test, test touched once. This is the minimum that makes any
   accuracy statement meaningful, and it is a sampling job, not a research job.
6. **Replace hand-tuning with an optimizer. (1–2 days)** With ≥50 train items, run
   `BootstrapFewShotWithRandomSearch`; at 200+, MIPROv2 or GEPA. Report optimizer results on dev,
   and touch test once. Manual prompt version #6 is not on the list.
7. **Baseline a non-LLM router in parallel. (1 day)** Embed the request text, fit multinomial
   logistic regression on the train split, report accuracy, latency, cost, and — the real prize —
   calibrated probabilities to drive step 3. If it is within a few points of the LLM at ~1ms, the
   routing problem is solved and the CEO model's job shrinks to the residual.
8. **Version-hash the compiled path, not just the prompt. (0.5 day)** The regex, the topology
   derivation, and the reason-code compiler are now part of the classifier. They must be hashed and
   frozen with the prompt, or the held-out corpus is not held out.

Total: roughly **10–15 engineer-days**, of which the first two items (1 day) are enough to decide
whether the current Change verdict is even meaningful.

---

## Direct comparison to BuildOS

| Practice                                                  | What BuildOS does                                                                      | Verdict                                             | Cost to fix         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- |
| Measure human label ceiling before setting a model target | Single hand-labeler; one class self-declared "borderline"; ceiling never measured      | **Gap — this invalidates the gate**                 | 0.5 day             |
| Report per-class recall + confusion matrix                | Single micro-accuracy over 72 calls                                                    | **Gap** — hides that ~2 of 8 classes fail           | 0.5 day             |
| Cluster standard errors on the sampling unit              | 9 replicates of 8 items treated as 72 independent trials                               | **Gap** — effective n = 8                           | 0.5 day             |
| Power-analyze the eval size                               | Not done; bound falls in an unattainable dead zone (63 vs 72)                          | **Gap**                                             | included above      |
| Adequate train/dev/test sizes (50–200+)                   | 8 train (burned) + 5 holdout                                                           | **Gap** — holdout CI ≈ [57%,100%]                   | 2–3 days            |
| Freeze a holdout after contamination                      | Done, and self-diagnosed                                                               | **Strong — keep**                                   | —                   |
| Abstention / selective prediction with coverage reported  | `clarify` exists as a label but not as a calibrated safe default; no confidence signal | **Gap — biggest single lever**                      | 1–2 days            |
| Recoverable misroutes (promote/demote mid-flight)         | Idea noted in docs; not built; route treated as terminal                               | **Gap — this is why 90% feels necessary**           | 3–5 days            |
| Cost-sensitive treatment of route errors                  | All four routes weighted equally                                                       | **Gap**                                             | 0.5 day (weighting) |
| Deterministic code for objectively-checkable features     | URL regex, code-compiled topology and reason codes, forced transitions counted         | **Strong — matches Meta/Anthropic/Semantic Router** | —                   |
| Version-hash the full decision path                       | Prompt + world card + model pins hashed; compiled code path not                        | **Gap** — contamination can hide in code            | 0.5 day             |
| Automated prompt optimization instead of hand-tuning      | 5 manual passes, 2 model pilots                                                        | **Gap** (blocked on corpus size)                    | 1–2 days after (5)  |
| Non-LLM baseline (embeddings + head)                      | None                                                                                   | **Gap** — no evidence the LLM is needed             | 1 day               |
| Structured output for the route enum                      | Present (narrow classification, low temp)                                              | **Adequate** — no further gain available            | —                   |
| Pre-registration of the decision rule                     | Done thoroughly, before scoring                                                        | **Strong — genuinely above field norm**             | —                   |

---

## Open questions

1. **What is the actual human-human agreement on the four routes?** Everything downstream depends
   on this and it is a one-hour experiment. Until it exists, "58/72" cannot be interpreted.
2. **How do the 14 errors distribute across the 8 scenarios and 4 routes?** If 9 of them are one
   scenario, the finding is "one contested label," not "an 81% router." I could not verify this
   from the brief.
3. **Is `status_summary` even a route question?** If a status summary is legitimately servable
   either way, the correct fix may be to merge or redefine the route boundary rather than to teach
   the model a contested distinction. Redefining categories is a standard response to persistent
   confusion-matrix off-diagonals.
4. **What does a misroute actually cost a BuildOS user in seconds and dollars?** Without that, the
   cost-sensitive threshold cannot be set and 90% remains an arbitrary number.
5. **Does the router expose usable log-probabilities through OpenRouter for the pinned models?** If
   not, the abstention design needs either an embeddings head or a self-consistency proxy
   (disagreement across the existing 9 samples is already a free confidence signal — and it is
   currently being thrown away by scoring each call independently).
6. **Would promoting `direct → workflow` mid-flight break the pre-registered latency bounds?**
   Recovery costs a second pass; the TTFT bound may need restating as time-to-_correct_-answer.

---

## Confidence

**High confidence:**

- The `≥65/72` bound is statistically unreachable in a meaningful way given 8 items × 9
  near-deterministic replicates; it is a disguised 8/8 gate. This is arithmetic on the stated
  design, not inference.
- Effective sample size is 8, not 72, and standard errors must be clustered (Miller, direct).
- Production routers are designed for recoverable error, not high accuracy (RouteLLM, FrugalGPT,
  GPT-5, Meta PAI, Trust-or-Escalate — five independent sources, consistent).
- Moving deterministic decisions into code is mainstream, not an anti-pattern (Meta states it
  explicitly; Anthropic and Semantic Router concur).
- 8 train + 5 holdout is far below every documented split recommendation.

**Medium confidence:**

- The specific κ→raw-agreement figures (79% at κ=0.70, 90% ⇒ κ≈0.857). The formula is exact; the
  chance-agreement term `A_e = 0.30` is my assumed route distribution and will move the numbers a
  few points either way.
- That `status_summary` is the dominant error cluster. Strongly suggested by the corpus note and
  the 58-vs-63-vs-72 structure, but I could not verify the per-scenario breakdown.
- That an embeddings + logistic-regression router would be competitive here. The +49.5% result is
  from a different domain with a large proprietary training set; BuildOS has 13 examples.

**Low confidence / unverified:**

- Whether OpenRouter exposes token logprobs for the pinned Gemini-family and GLM router models.
  **UNVERIFIED.**
- Whether GEPA/MIPROv2 would help at BuildOS's corpus size. DSPy's own docs say MIPROv2 wants 200+
  examples to avoid overfitting, so I expect little benefit before step 5 of the loop.
- Any claim about what the five held-out cases would score. Not run, not predictable.
