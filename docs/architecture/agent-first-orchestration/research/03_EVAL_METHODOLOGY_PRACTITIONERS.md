<!-- docs/architecture/agent-first-orchestration/research/03_EVAL_METHODOLOGY_PRACTITIONERS.md -->

# Eval Methodology as Practiced by Experts

**Chapter 03 of the agent-first orchestration research dossier**
**Researched:** 2026-07-25
**System under review:** `00_SYSTEM_UNDER_REVIEW.md` (Phase A falsification harness)

---

## Scope

This chapter covers how expert practitioners actually build and validate LLM evals — the
prescribed workflow, LLM-as-judge validation, judge bias, and statistical adequacy. It draws on
the applied-practitioner canon (Hamel Husain, Shreya Shankar, Eugene Yan) and the academic
literature on judge reliability and eval statistics (MT-Bench, Anthropic's error-bars paper,
Chatbot Arena, the alt-test, judge-panel correlation work).

It does **not** cover multi-agent orchestration architecture, agent-specific benchmarks
(τ-bench, SWE-bench), or safety evals — those belong to sibling chapters.

The chapter's core deliverable is Section 4: an exact, worked statistical analysis of the
BuildOS Phase A decision rule. That analysis is the reason this chapter exists.

---

## Key sources

| Source                                                                                                | What it is                                                   | URL                                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Hamel Husain, _Your AI Product Needs Evals_ (2024)                                                    | The origin post of the applied-evals doctrine                | https://hamel.dev/blog/posts/evals/index.html                                     |
| Hamel Husain, _Creating a LLM-as-a-Judge That Drives Business Results_ (Oct 2024)                     | The 7-step judge workflow; "Critique Shadowing"              | https://hamel.dev/blog/posts/llm-judge/index.html                                 |
| Hamel Husain, _A Field Guide to Rapidly Improving AI Products_ (2025)                                 | Error analysis, data viewers, anti-patterns                  | https://hamel.dev/blog/posts/field-guide/index.html                               |
| Husain & Shankar, _LLM Evals: Everything You Need to Know_ (FAQ, updated 2026-01)                     | The most concrete numeric guidance in the practitioner canon | https://hamel.dev/blog/posts/evals-faq/                                           |
| Husain & Shankar, _AI Evals for Engineers & PMs_ (Maven course)                                       | The course the FAQ is distilled from                         | https://maven.com/parlance-labs/evals                                             |
| Shankar et al., _Who Validates the Validators?_ (UIST '24, arXiv 2404.12272)                          | Criteria drift; EvalGen                                      | https://arxiv.org/abs/2404.12272                                                  |
| Shankar, _Data Flywheels for LLM Applications_                                                        | Judge alignment must be continually reassessed               | https://www.sh-reya.com/blog/ai-engineering-flywheel/                             |
| Shankar (Lenny's Newsletter), _Building eval systems that improve your AI product_                    | Open/axial coding, train/dev/test split, TPR/TNR             | https://www.lennysnewsletter.com/p/building-eval-systems-that-improve             |
| Eugene Yan, _Evaluating the Effectiveness of LLM-Evaluators_ (Aug 2024)                               | Survey of ~2 dozen papers; measured bias sizes               | https://eugeneyan.com/writing/llm-evaluators/                                     |
| Eugene Yan, _AlignEval_                                                                               | Working judge-alignment app; dev/test splits, κ              | https://eugeneyan.com/writing/aligneval/                                          |
| Eugene Yan, _An LLM-as-Judge Won't Save The Product — Fixing Your Process Will_                       | Process over tooling                                         | https://eugeneyan.com/writing/eval-process/                                       |
| Zheng et al., _Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena_ (2023)                         | The canonical measured bias numbers                          | https://arxiv.org/abs/2306.05685                                                  |
| Panickssery, Bowman & Feng, _LLM Evaluators Recognize and Favor Their Own Generations_ (NeurIPS 2024) | Self-preference is causally linked to self-recognition       | https://arxiv.org/abs/2404.13076                                                  |
| Evan Miller (Anthropic), _Adding Error Bars to Evals_ (Nov 2024, arXiv 2411.00640)                    | The statistical reference for eval design                    | https://arxiv.org/abs/2411.00640                                                  |
| Chiang et al., _Chatbot Arena_ (arXiv 2403.04132) + LMSYS methodology post                            | Bradley-Terry + bootstrap CIs on pairwise preference         | https://arxiv.org/abs/2403.04132 · https://lmsys.org/blog/2023-12-07-leaderboard/ |
| Verga et al. (Cohere), _Replacing Judges with Juries_ (arXiv 2404.18796)                              | Panel of small judges beats one big judge                    | https://arxiv.org/abs/2404.18796                                                  |
| Kohli (Apple), _Nine Judges, Two Effective Votes_ (arXiv 2605.29800, May 2026)                        | Judge panels have ~2 independent votes; n_eff diagnostic     | https://arxiv.org/html/2605.29800                                                 |
| Calderon, Reichart & Dror, _The Alternative Annotator Test_ (arXiv 2501.10970)                        | Statistical test for "may an LLM replace humans here?"       | https://arxiv.org/abs/2501.10970                                                  |
| Lee et al., _How to Correctly Report LLM-as-a-Judge Evaluations_ (arXiv 2511.21140, ICML 2026)        | Bias correction for imperfect judge sensitivity/specificity  | https://arxiv.org/abs/2511.21140                                                  |

---

## Findings

### F1. The doctrine is "look at your data," and error analysis comes before metrics

The single most consistent claim across all three practitioner sources is that error analysis —
reading actual traces — is the highest-ROI activity, and that choosing metrics before doing it is
the defining beginner mistake. Husain's Field Guide is blunt: "Generic metrics are worse than
useless – they actively impede progress," creating a "false sense of measurement"
([Field Guide](https://hamel.dev/blog/posts/field-guide/index.html)). Shankar's version: "The most
common mistake is to start by measuring ready-made, fashionable metrics like 'hallucination' or
'toxicity'"
([Lenny's](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve)).

The prescribed method is borrowed from qualitative social science:

1. **Open coding** — a domain expert writes free-form critique on anything wrong, plus a binary
   pass/fail. "The critique should be detailed enough for a brand-new employee at your company to
   understand it."
2. **Axial coding** — group the notes into failure categories. Target "a manageable set of under
   10 primary failure modes." Over-automating this step with an LLM is called out as a trap.
3. **Count** — map each trace to a category and count. In the Field Guide's NurtureBoss case,
   "just three issues accounted for over 60% of all problems."
4. **Only then** write metrics/judges against the categories that actually dominate.

**How many traces?** The FAQ is the most specific source in the canon:

> "you should aim to review at least 100 traces. My rough heuristic is if ~20 traces don't turn up
> a new category, you can stop (but review at least 100 to start)."
> — [Evals FAQ](https://hamel.dev/blog/posts/evals-faq/)

This is _theoretical saturation_, not a power calculation. The FAQ also prescribes 20–50 outputs
reviewed whenever you make a significant change, 10–20 traces weekly between major analyses, and
60–80% of development time spent on error analysis and evaluation. Shankar's number is "around 100
user interactions" to start, then targeted sampling on negative feedback, outliers in conversation
length, tool count, and latency. Yan adds a sampling constraint: annotate toward "a 50:50 split of
passes and fails that spans the distribution of inputs"
([eval-process](https://eugeneyan.com/writing/eval-process/)).

### F2. Binary pass/fail, not Likert — with a live disagreement about pairwise

There is near-unanimity among the applied practitioners against 1–5 scales:

- Husain: "Tracking a bunch of scores on a 1-5 scale is often a sign of a bad eval process." His
  reasons are (a) a 3-vs-4 distinction is not actionable, and (b) "domain expert judgments ...
  tend not to correlate with these kind of metrics"
  ([llm-judge](https://hamel.dev/blog/posts/llm-judge/index.html)).
- Shankar: "Many teams are tempted to use a 1-to-5 Likert scale, believing it captures more
  nuance. This is a trap. The distinction between a '3' and a '4' is subjective and inconsistent.
  Binary decisions force clarity."
- Yan: binary means "we only have to make a binary decision—pass or fail," yielding faster
  annotation and lower cognitive load ([AlignEval](https://eugeneyan.com/writing/aligneval/)).
- The FAQ adds an explicitly statistical objection: detecting differences on a Likert scale
  requires larger sample sizes, and annotators default to middle values.

**The disagreement:** Yan's survey does _not_ say binary-everywhere. He splits by task type —
direct scoring for "objective assessments such as measuring faithfulness to a source text or
detecting policy violations," and **pairwise comparison** for "subjective evals such as
persuasiveness, tone, coherence," citing that "pairwise comparisons lead to more stable results
and smaller differences between LLM judgments and human annotations"
([llm-evaluators](https://eugeneyan.com/writing/llm-evaluators/)). Chatbot Arena's entire design
is pairwise for exactly this reason.

So the consensus is really: **avoid ordinal scales**; binary for objective criteria, pairwise for
subjective quality. Husain is binary-first because his context is per-output pass/fail; Yan is
pairwise-friendly because his is model comparison. BuildOS's task ("is the workflow lane's answer
better?") is a model comparison, so pairwise is the correct family — a point in its favor.

### F3. Rubric design: few dimensions, and prefer one decision

Husain's stated most-common judge mistakes are "Too many metrics • Complex scoring systems •
Ignoring domain experts • Unvalidated measurements"
([announcement thread](https://x.com/HamelHusain/status/1851645681150382103); the guide elaborates
each). The Field Guide's framing: "when everything is important, nothing is." Shankar's
axial-coding cap is under 10 failure modes. Neither prescribes multi-dimensional rubric scoring;
both prescribe _one_ judgment plus a written critique, with specialized judges built later and only
for failure modes error analysis proved dominant (Husain's Step 7). The judge-prompt mistakes he
names: no critiques in the few-shot examples, terse critiques, missing external context, and
non-diverse examples.

### F4. Validating a judge: what statistic, what target, what split

This is where the canon is most operational.

**Sample and split.** Shankar's prescription for the labeled ground-truth set:

> Train set 10%–20% (a small set of clear examples), Dev set 40%–45% (used to iteratively refine),
> Test set 40%–45% (held out, untouched during development).
> — [Lenny's](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve)

The FAQ says build LLM-as-judge evaluators with "100+ labeled examples." AlignEval's product
defaults are concrete: 20 labels minimum to unlock eval mode, 50 minimum to unlock optimization,
"aiming for 50-100 before writing criteria and running evals," then a dev/test split — and Yan
explicitly warns that at ~25 per split the metrics diverge unreliably.

**Statistic.** Practitioners split here too:

- Husain's judge post reports **raw agreement** and treats >90% as the bar: the Honeycomb example
  reached "> 90% agreement between the LLM and Phillip" in "only three iterations." He adds the
  correct caveat: "You should calculate the error on unseen data only."
- The FAQ, for _human-to-human_ agreement, says to use "a chance-corrected metric like Cohen's
  Kappa."
- The FAQ, for _judge-to-human_, says: "Focus on achieving high True Positive Rate (TPR) and True
  Negative Rate (TNR) with your judge on a held out labeled test set" — because raw accuracy is
  gameable under class imbalance. Shankar's version: a judge that is "99% accurate" by "always
  predicting 'pass'" catches zero failures.
- AlignEval reports "sample size, recall, precision, F1, Cohen's κ, and counts for true and false
  positives/negatives" — i.e., all of the above.
- The academic answer is the **alt-test** (Calderon, Reichart & Dror): rather than asking "is
  agreement high enough?", ask whether the LLM is at least as good a substitute for a human
  annotator as another human would be. It "involves comparing the LLM to a small group of human
  annotators (at least three) on a modest subset of examples (between 50 and 100)."

No source in the canon gives a numeric κ target. MT-Bench supplies the empirical reference points:
GPT-4-vs-human agreement was **85%** in setup S2 (ties excluded) against a **human-human agreement
of 81%**; with ties included (S1) the numbers are 70% and 63%
([MT-Bench](https://arxiv.org/abs/2306.05685)). Yan's survey collects the rest: κ of 0.84 (gpt-4)
and 0.79 (llama-3-70b) on reference-based QA against human-human κ of 0.97; κ of 0.3–0.5 on search
relevance; Spearman ρ of 0.55–0.67 on QA correctness/faithfulness. His sharpest caution: on
summarization, "the correlation between the averaged scores of all human experts and any human
expert (0.8–0.9) was higher than the correlation the LLM-evaluator had with humans (0.3–0.6)."

**Re-validation cadence.** Husain: "I conduct this human review at regular intervals and whenever
something material changes" — no fixed number. Shankar: "Alignment has to be continually reassessed
as production data drifts over time." Nobody publishes a cadence. Treat "before every decision that
depends on the judge" as the operational reading.

**Bias correction.** The most recent formal treatment (Lee et al., ICML 2026) makes the point the
practitioner canon skips: "imperfect sensitivity and specificity of the LLM judges induce bias in
naive evaluation scores." Their plug-in framework corrects the reported score using human-labeled
calibration data and produces CIs that account for uncertainty in _both_ the test set and the
calibration set. If you know your judge's TPR/TNR, you should be reporting a corrected rate, not
the raw judge tally.

### F5. Judge biases are large, measured, and mostly unfixed by prompting

Canonical numbers from [MT-Bench](https://arxiv.org/abs/2306.05685) (Table 2/3, Figure 2), a
frequently mis-cited paper, so exact figures matter:

| Bias                 | Measurement                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Position**         | Consistency when the two responses are swapped: GPT-4 **65.0%**, GPT-3.5 **46.2%**, Claude-v1 **23.8%**. Claude-v1 favored the first position 75% of the time. |
| **Verbosity**        | The "repetitive list" attack (a longer, no-new-information restatement) succeeded **91.3%** against Claude-v1 and GPT-3.5, **8.7%** against GPT-4.             |
| **Self-enhancement** | GPT-4 favored itself with ~**10%** higher win rate; Claude-v1 ~**25%**.                                                                                        |

Panickssery, Bowman & Feng later established the mechanism: LLM evaluators score their own outputs
higher while humans rate them equal, and there is "a linear correlation between self-recognition
capability and the strength of self-preference bias"
([arXiv 2404.13076](https://arxiv.org/abs/2404.13076)).

The standard mitigation is full order-swap: run each pair in both orders and only count judgments
that survive the swap (MT-Bench's own protocol). Partial or structural counterbalancing reduces
_aggregate_ position effect but does not identify which individual judgments were position-driven,
and at small n the residual is not averaged out.

### F6. Judge panels buy far less independence than the vote count suggests

Cohere's PoLL result is the optimistic side: a panel of smaller models from disjoint families
"outperforms a single large judge, exhibits less intra-model bias ... and does so while being over
seven times less expensive" ([arXiv 2404.18796](https://arxiv.org/abs/2404.18796)).

The 2026 follow-up is the pessimistic side and is directly relevant to any 3-judge majority vote.
Kohli (Apple) measures the effective number of independent votes in a nine-judge, seven-family
panel at **n_eff = 2.18 [95% CI 2.07–2.31]**, an independence ratio of 24.2%, with mean pairwise
error correlation **φ̄ = 0.391**. Human annotators on the same data reach n*eff ≈ 4.0–5.8. Crucially,
family diversity does not fix it: "Cross-family pairs ... can be as correlated as same-family
pairs," and selecting one judge per family \_lowered* n_eff to 1.93. Their recommendation: "compute
n_eff as a standard panel diagnostic: if n_eff/k < 0.5, results should be treated with caution"
([arXiv 2605.29800](https://arxiv.org/html/2605.29800)).

Applying the Kish design-effect formula they use, `n_eff = k / (1 + (k−1)·φ̄)`, at k = 3 and
φ̄ = 0.391 gives **n_eff ≈ 1.68** — a three-judge cross-family panel is worth slightly under two
independent judges. It reduces variance somewhat; it does not make the panel a proxy for
independent replication.

### F7. Assertions vs judges: code first, judges only where code can't reach

Husain's eval hierarchy is Level 1 unit tests / assertions, Level 2 human + model eval, Level 3
production A/B ([FAQ hub](https://hamel.dev/blog/posts/evals-faq/what-are-llm-evals.html)). The
doctrine across the Field Guide and FAQ is that most effort should go to "understanding failures
(i.e. looking at data) rather than building automated checks," and that anything mechanically
checkable — format, citation resolution, forbidden tool calls, required fields — belongs in code,
where it is free, deterministic, and immune to judge bias. Judges take the residual: subjective
quality that resists a regex. Shankar's EvalGen implements exactly this split, generating _both_
Python functions and LLM grader prompts as candidate assertions and asking the human to pick
([arXiv 2404.12272](https://arxiv.org/abs/2404.12272)).

### F8. Dataset curation, contamination, and the impossibility of fixing criteria up front

**Size and diversity.** The FAQ's guidance is diversity-over-volume: "ensure your 100 traces cover
diverse combinations across your dimensions — this variety will reveal more failure modes rather
than generating thousands of similar queries." Husain's judge post starts "with around 30 examples
and keep[s] going until I do not see any new failure modes." Datasets are built along three axes:
features × scenarios × personas. Synthetic data rules: "Write 20 tuples by hand" first, generate
_user inputs_ not outputs (to avoid inheriting model bias), and encode real system constraints.

**Contamination from prompt iteration** is the finding of Shankar's UIST paper, and it is stronger
than a warning about overfitting. She names the phenomenon **criteria drift**: "users need criteria
to grade outputs, but grading outputs helps users define criteria." Participants who graded first
still revised criteria on further grading, "sometimes changing previous grades." Some criteria are
"dependent on the specific LLM outputs observed," which raises "serious questions for approaches
that assume the independence of evaluation from observation of model outputs." Iterating prompts
against a fixed corpus does not merely contaminate the _score_ — it contaminates the _definition of
correctness_. The only remedy is a genuinely held-out set scored once.

**Saturation.** The canon's only stopping rule is theoretical saturation (~20 consecutive traces
with no new failure category). There is no published rule for "your eval set is now large enough to
decide something." That gap is what Section 4 addresses.

**Pass-rate sanity check.** From the FAQ: "If you're passing 100% of your evals, you're likely not
challenging your system enough"; a ~70% pass rate is described as more meaningful. This is the
practitioner test that would have flagged BuildOS's 72/72 routing score _before_ the training-set
diagnosis.

### F9. Statistical adequacy: the reference doctrine

Evan Miller's Anthropic paper is the closest thing the field has to a standard. Its five
recommendations, verbatim:

> 1. Computing standard errors of the mean using the Central Limit Theorem
> 2. When questions are drawn in related groups, computing clustered standard errors
> 3. Reducing variance by resampling answers and by analyzing next-token probabilities
> 4. When two models are being compared, conducting statistical inference on the question-level
>    paired differences, rather than the population-level summary statistics
> 5. Using power analysis to determine whether an eval (or a random subsample) is capable of
>    testing a hypothesis of interest
>    — [arXiv 2411.00640](https://arxiv.org/abs/2411.00640)

Three of its specifics are load-bearing for BuildOS:

- **Report SEM with every score**, and `CI_95 = s̄ ± 1.96 × SE`. For binary outcomes,
  `SE = √(s̄(1−s̄)/n)`.
- **Clustered SEs when questions come in groups.** Repeated draws on the same item are a cluster.
- **The sample-size formula** `n = (z_{α/2} + z_β)²(ω² + σ²_A/K_A + σ²_B/K_B)/δ²`, where `n` is the
  number of _independent questions_, `K` is the number of repeated answers per question, `ω²` is
  the between-question variance of the paired difference, and `σ²` the within-question (run-to-run)
  variance. Miller's worked example: at n = 198, increasing K from 1 to 10 "reduces the Minimum
  Detectable Effect from 13.2% to 7.5%." **K shrinks only the σ²/K terms; it never touches ω².**
  His headline conclusion: "new evals should contain at least 1,000 questions in order to have good
  signaling ability."

Chatbot Arena is the pairwise-preference reference implementation: fit a Bradley-Terry model by MLE
over the full history of pairwise votes, then "bootstrap the MLE Bradley-Terry scores to obtain the
confidence intervals of model ratings," and publish those intervals alongside the point estimates
([LMSYS](https://lmsys.org/blog/2023-12-07-leaderboard/);
[arXiv 2403.04132](https://arxiv.org/abs/2403.04132), 240K+ votes). Models with few votes get
visibly wide intervals — which is the entire point.

### F10. The mistake list, consolidated

Across all sources, the named mistakes are: starting with fashionable/generic metrics; tracking too
many metrics; 1–5 Likert scoring; using an unvalidated judge; buying tooling before looking at
data; over-automating failure categorization; creating too many failure categories; terse or
context-free judge critiques; reporting judge accuracy on class-imbalanced data instead of TPR/TNR;
measuring judge error on data the judge prompt was tuned on; and — from the academic side —
ignoring position/verbosity/self-preference bias, and reporting point estimates without error bars.

---

## Statistical adequacy of the BuildOS harness

All arithmetic below is exact (`math.comb`, no approximations unless labeled). Working script is
reproducible from the formulas given.

### (a) False-positive rate of the "≥6 of 9" Go threshold

Under H₀: the two lanes are equally good, each blind pair is a fair coin, X ~ Binomial(9, 0.5).

```
C(9,6)=84  C(9,7)=36  C(9,8)=9  C(9,9)=1     →  130 outcomes out of 2⁹ = 512
P(X ≥ 6) = 130/512 = 0.25390625
```

| k     | P(X = k)   | P(X ≥ k)   |
| ----- | ---------- | ---------- |
| 5     | 0.2461     | 0.5000     |
| **6** | **0.1641** | **0.2539** |
| 7     | 0.0703     | 0.0898     |
| 8     | 0.0176     | 0.0195     |
| 9     | 0.0020     | 0.0020     |

**The Go threshold carries a 25.4% false-positive rate.** One run in four of a system that is
exactly as good as the control clears the bar. The conventional α = 0.05 would require **≥8 of 9**
(α = 0.0195); ≥7 of 9 gives α = 0.0898, still nearly double conventional.

Two riders:

1. **The C06+C08 sub-rule is logically redundant at the Go boundary.** C07 contributes at most 3
   wins, so any total ≥6 forces C06+C08 ≥ 3. Enumerating all 512 outcomes, the joint rule
   (≥6/9 **and** ≥3/6 on C06+C08) fires on exactly the same 130 outcomes — 0.2539. The guard adds
   nothing on the Go side. It only binds on the Stop side.
2. **The threshold sits on the fattest part of the distribution.** Under H₀, P(X = 5 or 6) = 0.410;
   at a true win rate of 0.65 it is 0.491. Roughly half the time, a single pair flipping — one
   judge tie-break, one transient timeout — reverses the architecture decision.

A Bayesian read gives the same verdict without null-hypothesis machinery: with a 50/50 prior
between "coin flip" and "70% win rate," observing exactly 6/9 yields a Bayes factor of **1.63** and
a posterior of 0.62 for the better hypothesis. That is not evidence; it is a nudge. (Observing 9/9
gives BF = 20.7, posterior 0.95 — which is why 9/9 would be genuinely informative.)

### (b) Power at a true 70% win rate

X ~ Binomial(9, 0.7):

```
P(X ≥ 6) = 0.7297
```

| True win rate | Power at ≥6/9 |
| ------------- | ------------- |
| 0.55          | 0.3614        |
| 0.60          | 0.4826        |
| 0.65          | 0.6089        |
| **0.70**      | **0.7297**    |
| 0.75          | 0.8343        |
| 0.80          | 0.9144        |
| 0.90          | 0.9917        |

**Power at a true 70% win rate is 73.0%.** The harness has a **27.0% chance of a false Stop** on an
architecture that genuinely wins 7 times in 10 — and the pre-registered rule says "a marginal
result is a stop, not a go," so that 27% converts directly into abandoning a working design.

This is the design's real asymmetry: it is simultaneously too permissive (25% false Go) and too
strict (27% false Stop). Both errors are large because n = 9 cannot separate 50% from 70%. The
harness does not have a threshold problem; it has a sample-size problem.

### (c) N required for 80% power

Exact binomial design, one-sided, α ≤ 0.05, H₀: p = 0.5:

| True win rate (MDE) | Required n | Critical value | Actual α  | Power     |
| ------------------- | ---------- | -------------- | --------- | --------- |
| 0.60 (+10 pp)       | **158**    | ≥90            | 0.047     | 0.806     |
| 0.65 (+15 pp)       | **69**     | ≥42            | 0.046     | 0.802     |
| **0.70 (+20 pp)**   | **37**     | **≥24**        | **0.049** | **0.807** |
| 0.75 (+25 pp)       | **23**     | ≥16            | 0.047     | 0.804     |
| 0.80 (+30 pp)       | **18**     | ≥13            | 0.048     | 0.867     |

Normal-approximation sanity check, `n = (z_α√0.25 + z_β√(p(1−p)))² / (p−0.5)²` with
z₀.₀₅ = 1.645, z₀.₂ = 0.842: 152.5 / 66.6 / 36.5 / 22.5 / 14.9 — consistent with the exact table.

**The honest headline: 37 distinct pairs, not 9, and the fix is cheap.** Using the harness's own
measured figures — control mean model cost $0.00749/run, workflow cost cap $0.022479/run — 37 pairs
costs about **$1.11 in model spend**. At the p50 durations in the pre-registration (control 96.7 s,
workflow bound 193.3 s), 37 serial pairs is roughly **3 hours of wall clock**, and the lanes
parallelize. The binding constraint is human labeling: 37 blind pairs at 3–5 minutes each is 2–3
hours of DJ's time. For a decision that determines the platform's execution architecture, that is
not a real cost.

Note also that these n's assume _distinct_ items. That is the subject of (d).

### (d) The routing gate: is 72 a legitimate denominator?

**No.** The routing gate is 9 repeated calls on each of **8 distinct scenarios**. Under Miller's
framework this is exactly the `n` vs `K` distinction: n = 8 independent questions, K = 9 resampled
answers per question. His formula is
`n = (z_{α/2}+z_β)²(ω² + σ²_A/K_A + σ²_B/K_B)/δ²` — **K only divides the conditional-variance
terms σ²; it never divides ω², the between-question variance.** Repeating a call nine times tells
you how stable the router is on _those eight requests_. It tells you nothing additional about how
the router behaves on the ninth request you never wrote. Miller's own worked example bounds the
benefit: at n = 198, going from K = 1 to K = 10 moved the MDE from 13.2% to only 7.5%.

His recommendation #2 — clustered standard errors "when questions are drawn in related groups" — is
precisely this case. Nine calls on one scenario are a cluster.

**Effective sample size.** With the Kish design effect `deff = 1 + (m−1)·ICC`, m = 9:

| ICC                                  | deff | n_eff |
| ------------------------------------ | ---- | ----- |
| 0.0 (all variance run-to-run)        | 1.00 | 72.0  |
| 0.2                                  | 2.60 | 27.7  |
| 0.5                                  | 5.00 | 14.4  |
| 0.8                                  | 7.40 | 9.7   |
| 1.0 (all variance between scenarios) | 9.00 | 8.0   |

At temperature 0.1, with a fast-first router where code compiles the route and a regex handles the
URL case, nearly all remaining variance is _between_ scenarios, not between reps. **n_eff is close
to 8, not 72.**

**The threshold is unreachable by design.** With 8 items × 9 reps, a perfectly deterministic router
can only score a multiple of 9: 0, 9, 18, …, 63, 72. The gate is ≥65. A router that gets **7 of 8
scenarios right, every single time, scores 63 and fails.** Only a router that is perfect on all 8
scenarios, or perfect on 7 plus ≥2/9 lucky flips on the eighth, passes. So above ~87.5% item
accuracy, the gate is no longer measuring routing accuracy at all — it is measuring run-to-run
consistency and rewarding _instability_ on the one item you get wrong.

**What the observed 58/72 actually says.** 58/9 = 6.44 "item-equivalents" out of 8. Reported as if
n = 72: 80.6%, Wilson 95% CI [0.700, 0.881], Clopper-Pearson [0.695, 0.889]. Reported honestly at
the item level, n = 8:

| Item score | Rate  | Wilson 95% CI  |
| ---------- | ----- | -------------- |
| 6/8        | 0.750 | [0.409, 0.929] |
| 7/8        | 0.875 | [0.529, 0.978] |
| 8/8        | 1.000 | [0.676, 1.000] |

Eight items cannot distinguish 87.5% from 100% at any conventional confidence. The pre-registered
90.3% bound is inside the CI of essentially every attainable score. Against Miller's "at least
1,000 questions," and against the practitioner floor of ~100 traces for error analysis alone, a
corpus of 8 routing scenarios is one to two orders of magnitude short.

**The same clustering afflicts the comparison lane, and it is worse there.** The 9 blind pairs are
**3 scenarios × 3 runs**, not 9 items. Design effect with m = 3:

| ICC | deff | n_eff |
| --- | ---- | ----- |
| 0.0 | 1.00 | 9.00  |
| 0.4 | 1.80 | 5.00  |
| 0.8 | 2.60 | 3.46  |
| 1.0 | 3.00 | 3.00  |

If a scenario's outcome is largely determined by the scenario (which is likely — C07's control lane
crashed on _all three_ runs, an ICC of 1.0 on that scenario by observation), the correct null is
three scenario-level coin flips, and:

```
P(≥6 of 9 pairs)  ==  P(≥2 of 3 scenarios)  =  3·(1/8) + 1/8  =  0.500
```

**The false-positive rate of the Go rule is therefore bounded between 25.4% (fully independent
pairs) and 50.0% (fully clustered by scenario). The truth is somewhere in between, and the C07
evidence pushes it toward the high end.** A decision rule with a coin-flip false-positive rate is
not a falsification test; it is a ceremony.

### (e) Two further gates worth checking

**Panel-vs-human validation (≥7/9 agreement).** Under a 50% chance-agreement null,
P(X ≥ 7 | n = 9, p = 0.5) = **0.0898** — the validation gate itself passes ~9% of the time by
chance. Raw 7/9 = 77.8% agreement is also _below_ MT-Bench's human-human baseline of 81% (S2, ties
excluded), and below Husain's >90% working target. Chance-correcting: if both DJ and the panel skew
2:1 toward the same lane, expected chance agreement is 0.556 and Cohen's **κ = 0.50** — "moderate,"
not the near-human alignment the gate implies. At marginals of 0.75, κ falls to 0.41.

**Judge panel independence.** Three cross-family judges at the measured φ̄ = 0.391 give
`n_eff = 3/(1 + 2×0.391) =` **1.68** effective votes. The panel is worth slightly under two
independent judges, and Kohli's diagnostic (`n_eff/k = 0.56`) sits barely above his
treat-with-caution line of 0.5.

### Verdict

**The BuildOS Phase A decision rule is not statistically capable of deciding what it was built to
decide.** The comparison gate has a false-positive rate between 25.4% and 50.0% depending on how
much of the variance is scenario-level, and only 73.0% power against a genuinely strong (70%)
effect. The routing gate treats 72 clustered calls as 72 independent observations when the
effective sample size is close to 8, and sets a threshold that a perfectly consistent 7-of-8 router
cannot reach.

**But the fix is small.** The corpus needs to grow along the _item_ axis, not the replicate axis:
roughly 37 distinct complex scenarios for 80% power at a +20 pp effect (23 if you only care about a
+25 pp effect), and enough routing scenarios that the gate is not quantized into multiples of 9.
The estimated model cost is on the order of a dollar. The replicates already collected are not
wasted — they are the right way to estimate σ² for Miller's formula and to report run-to-run
stability as a _separate_ metric from accuracy. What they cannot do is stand in for items.

The most defensible immediate move is to stop reporting 58/72 and 6/9 as scores and start reporting
them as **point estimates with intervals** — 58/72 → 80.6% [69.5, 88.9] naively, ~6.4/8 items
honestly — and to recognize that "Change" was the correct call on routing not because 58 < 65, but
because the harness cannot yet tell 58 from 65.

---

## Direct comparison to BuildOS

| Practice (source)                                                                                                                                                                                                | What BuildOS does                                                                                                                                                                                   | Verdict                                                                                                                                                                                             | Cost to fix                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Error analysis / open + axial coding on ≥100 traces _before_ choosing metrics ([FAQ](https://hamel.dev/blog/posts/evals-faq/), [Lenny's](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve)) | Corpus drawn from real production transcripts (good), but `acceptance_checks` were designed a priori, not derived from an open-coding pass over observed failures                                   | **behind**                                                                                                                                                                                          | 1 day: read 100 real chat traces, open-code, axial-code to <10 failure modes, regenerate checks   |
| Sample ≥100 traces for saturation; diversity over volume                                                                                                                                                         | 8 routing scenarios, 3 comparison scenarios, 5 held-out (unscored)                                                                                                                                  | **behind**                                                                                                                                                                                          | 2–3 days to extract + hand-label ~40 more scenarios from existing `chat_turn_runs`                |
| Binary pass/fail over Likert (Husain, Shankar, Yan)                                                                                                                                                              | Judges score 5 dimensions 0–4, _then_ pick A/B/tie. Only the pairwise pick decides                                                                                                                  | **matched** (deciding output is pairwise, which is correct for model comparison per [Yan](https://eugeneyan.com/writing/llm-evaluators/)); Likert dimensions are a reporting-only risk of anchoring | Free: move dimension scores after the winner pick, or drop them                                   |
| Pairwise for subjective quality ([Yan](https://eugeneyan.com/writing/llm-evaluators/), [Chatbot Arena](https://arxiv.org/abs/2403.04132))                                                                        | Blind pairwise A/B                                                                                                                                                                                  | **matched**                                                                                                                                                                                         | —                                                                                                 |
| Validate the judge against human labels on a held-out set ([Husain](https://hamel.dev/blog/posts/llm-judge/index.html), [alt-test](https://arxiv.org/abs/2501.10970))                                            | Human scores all 9 pairs blind _before_ the panel runs; ≥7/9 agreement required                                                                                                                     | **ahead on ordering, behind on n**. Human-first-then-panel is exactly right and rarer than it should be; 9 pairs is far below the alt-test's 50–100                                                 | Free (ordering already right); n fixed by the corpus expansion above                              |
| Chance-corrected agreement (Cohen's κ) rather than raw ([FAQ](https://hamel.dev/blog/posts/evals-faq/), [AlignEval](https://eugeneyan.com/writing/aligneval/))                                                   | Raw ≥7/9                                                                                                                                                                                            | **behind** — 7/9 raw is κ ≈ 0.50 under plausible marginals                                                                                                                                          | Free: compute κ alongside raw agreement                                                           |
| Report TPR/TNR, not accuracy, on imbalanced judge data ([FAQ](https://hamel.dev/blog/posts/evals-faq/))                                                                                                          | Not computed                                                                                                                                                                                        | **behind**                                                                                                                                                                                          | Free: it is a confusion matrix over data already collected                                        |
| Alt-test: ≥3 human annotators, 50–100 examples ([arXiv 2501.10970](https://arxiv.org/abs/2501.10970))                                                                                                            | 1 human annotator (DJ), 9 examples                                                                                                                                                                  | **behind** — though "single benevolent-dictator domain expert" is explicitly Husain's default, so this is a defensible deviation for a solo founder                                                 | Low priority; note the limitation in the writeup                                                  |
| Full order-swap to neutralize position bias ([MT-Bench](https://arxiv.org/abs/2306.05685): GPT-4 only 65.0% swap-consistent)                                                                                     | Structural counterbalancing via hash-pinned mapping; every scenario splits 2:1 or 1:2                                                                                                               | **behind** on rigor, **novel** on mechanism. Counterbalancing without swapping leaves position confounded with item at n = 9                                                                        | ~2× judge cost: run every pair in both orders, count only swap-consistent verdicts                |
| Diverse judge panel ([PoLL](https://arxiv.org/abs/2404.18796))                                                                                                                                                   | 3 judges, 3 disjoint families                                                                                                                                                                       | **matched**                                                                                                                                                                                         | —                                                                                                 |
| Compute panel n_eff; caution if n_eff/k < 0.5 ([arXiv 2605.29800](https://arxiv.org/html/2605.29800))                                                                                                            | Not computed; majority-of-3 treated as robust                                                                                                                                                       | **behind** — implied n_eff ≈ 1.68                                                                                                                                                                   | Free: measure pairwise judge disagreement across the runs already collected                       |
| Code assertions before LLM judges ([FAQ](https://hamel.dev/blog/posts/evals-faq/), [EvalGen](https://arxiv.org/abs/2404.12272))                                                                                  | Machine-checkable `acceptance_checks` with a required flag; a required-check failure **vetoes** a workflow win regardless of judge preference; a separate non-deciding line reports judge-only wins | **novel — and good.** No source in the canon describes a code-veto-over-judge with a parallel non-deciding judge-only report. This is the strongest single element of the design                    | — (keep)                                                                                          |
| Held-out set, untouched during development; 10-20/40-45/40-45 split ([Lenny's](https://www.lennysnewsletter.com/p/building-eval-systems-that-improve))                                                           | Held-out 5-case route corpus frozen after contamination was recognized; not yet scored                                                                                                              | **matched in intent, behind in size** — 5 cases certifies nothing                                                                                                                                   | Fold into the corpus expansion; target ≥20 held-out routing cases                                 |
| Recognize criteria drift / contamination from prompt iteration ([UIST '24](https://arxiv.org/abs/2404.12272))                                                                                                    | 4 prompt passes reached 72/72; recognized as a training-set score; fifth pass forbidden; held-out set created                                                                                       | **ahead.** Most teams never diagnose this. The 100% pass rate is exactly the tell the FAQ names                                                                                                     | — (keep)                                                                                          |
| Report SEM / CIs with every score (Miller rec 1)                                                                                                                                                                 | Point estimates only (58/72, 6/9)                                                                                                                                                                   | **behind**                                                                                                                                                                                          | Free: two lines of arithmetic                                                                     |
| Clustered standard errors for grouped questions (Miller rec 2)                                                                                                                                                   | 72 treated as n; 9 pairs treated as n                                                                                                                                                               | **behind** — the central flaw                                                                                                                                                                       | Free to report; requires more items to actually fix                                               |
| Question-level _paired_ inference when comparing two models (Miller rec 4)                                                                                                                                       | Blind A/B pairs each lane against the other on the same scenario + same snapshot                                                                                                                    | **ahead.** The design is natively paired, which Miller notes is a "free" variance reduction                                                                                                         | — (keep)                                                                                          |
| Power analysis before committing to an eval (Miller rec 5)                                                                                                                                                       | Bounds derived from measured baseline _magnitudes_, never from _detectability_                                                                                                                      | **behind** — the omission that produced the 9-pair design                                                                                                                                           | Free (one afternoon) — and should gate any Phase B decision rule                                  |
| Bootstrap CIs on pairwise preference ([LMSYS](https://lmsys.org/blog/2023-12-07-leaderboard/))                                                                                                                   | None                                                                                                                                                                                                | **behind**                                                                                                                                                                                          | Free once n > ~20                                                                                 |
| Correct reported rates for judge sensitivity/specificity ([arXiv 2511.21140](https://arxiv.org/abs/2511.21140))                                                                                                  | Not done                                                                                                                                                                                            | **behind** (but this is frontier practice, not table stakes)                                                                                                                                        | Requires human-labeled calibration set; defer                                                     |
| Pre-register the decision rule before scoring                                                                                                                                                                    | Bounds, thresholds, run-validity rules and safety gates all frozen and hash-pinned before any scoring                                                                                               | **ahead — significantly.** Neither the practitioner canon nor most published agent papers pre-register                                                                                              | — (keep)                                                                                          |
| Reproducibility: hash-pinned prompts, models, corpus, blind mapping; per-role model verification                                                                                                                 | Full                                                                                                                                                                                                | **ahead**                                                                                                                                                                                           | — (keep)                                                                                          |
| Report the crashed control lane separately rather than discarding                                                                                                                                                | C07 reported separately with an added ≥3/6 guard on C06+C08                                                                                                                                         | **ahead on honesty, behind on statistics** — the guard is redundant at the Go boundary (see 4a), and excluding C07 leaves 2 distinct scenarios                                                      | Replace the redundant guard with a per-scenario reporting requirement                             |
| Infrastructure-invalid vs valid-outcome taxonomy                                                                                                                                                                 | Model mismatch / pre-inference transport failure / harness failure = replaced once; timeouts, tool failures and bad outputs stay in the denominator                                                 | **novel — unproven.** The distinction is principled; the risk is that "harness failure" is adjudicated post hoc, which is a garden-of-forking-paths                                                 | Free: require the invalidity reason to be classifiable from logs by a rule written before the run |
| Detect rubber-stamp decision points                                                                                                                                                                              | `forcedTransitions` counted where policy left one legal action; `reason_code`-as-execution-plan caught and removed                                                                                  | **novel — and good.** This is an eval of the eval's construct validity, which nothing in the canon prescribes                                                                                       | — (keep)                                                                                          |

---

## Open questions

1. **Does asking the judge for five 0–4 dimension scores before the A/B pick anchor the pick?**
   No source measures this. It is cheap to test with the runs already collected: re-run the panel
   with winner-first ordering and compare verdicts.
2. **What is the actual ICC of scenario outcomes in this harness?** The whole (d) analysis brackets
   the answer between 25.4% and 50.0% false-positive rate. The existing 3 runs per scenario are
   sufficient to estimate it. This should be computed before any further interpretation of 6/9.
3. **What is the measured pairwise error correlation among the three pinned judges** on BuildOS's
   own data? Kohli's φ̄ = 0.391 is from his datasets; BuildOS can measure its own and report n_eff.
4. **Is a "win" against a control lane that crashed (C07: 73–173 characters returned) meaningful at
   all?** Separate reporting is honest, but a pair where one side produced no answer measures
   availability, not quality. Practitioners have no guidance here; it may warrant a distinct
   outcome class rather than a pair.
5. **How should a pre-registered rule handle criteria drift** when Shankar's finding is that the
   criteria themselves cannot be fixed before observing outputs? Pre-registration and criteria
   drift are in genuine tension, and neither literature resolves it. A plausible synthesis:
   pre-register the _decision rule and the sample size_, allow the _rubric_ to be revised only on a
   discovery set, and score the held-out set once with the frozen rubric.
6. **Should the routing metric be item accuracy or majority-vote-over-K accuracy?** These are
   different constructs. The harness currently scores every call individually and calls the result
   accuracy; majority-vote scoring at n = 8 items would measure something cleaner but with even
   less resolution. Both should be reported, distinctly.
7. **UNVERIFIED:** search summaries attribute to Husain/Shankar the claim that "you can make
   decisions based on 42 traces." I could not confirm this in the primary sources fetched, and it
   is directionally in tension with the "at least 100 traces" heuristic in the FAQ. Do not cite it.

---

## Confidence

**High confidence:**

- All arithmetic in Section 4. Computed exactly from binomial PMFs; the normal approximation and
  the two independent CI methods (Wilson, Clopper-Pearson) agree; the Kish n_eff at k = 9,
  φ̄ = 0.391 reproduces Kohli's published 2.18 to two decimals, which validates the formula's use.
- Miller's five recommendations, the sample-size formula, the K-vs-n distinction, and the
  "at least 1,000 questions" line — read directly from the paper PDF.
- MT-Bench bias numbers and agreement figures — read from the paper's HTML.
- Husain's 7-step judge workflow, binary-not-Likert doctrine, ">90% agreement" target, "at least
  100 traces / ~20 with no new category" heuristic — read from the primary posts.
- Shankar's criteria-drift finding and the 10-20/40-45/40-45 train/dev/test split.

**Medium confidence:**

- The Kohli _Nine Judges, Two Effective Votes_ numbers. Recent preprint (arXiv 2605.29800, May
  2026), single-author, fetched once; the internal consistency of n_eff, φ̄ and the Kish formula
  checks out, but it has not had time to accumulate replication.
- Shankar quotes sourced from the Lenny's Newsletter interview rather than a paper — attributed
  faithfully to the fetched article, but it is a secondary venue.
- The claim that BuildOS's routing ICC is near 1.0. Inferred from temperature 0.1 + code-heavy
  routing + the C07 all-three-runs-crashed observation, not measured. This is open question #2.

**Low confidence / explicitly not established:**

- Any numeric κ target for judge validation. No source in the canon publishes one; the MT-Bench
  human-human figures are the best available anchor, not a standard.
- Re-validation cadence for judges. Nobody publishes one.
- Whether Likert-before-pairwise anchors the judge's verdict (open question #1).
- The "42 traces" claim (open question #7) — UNVERIFIED, do not use.
