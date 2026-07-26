<!-- docs/architecture/agent-first-orchestration/research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md -->

# Agent Benchmarks and Harness Design

**Chapter 04 of the agent-first orchestration research dossier**
**Date:** 2026-07-25
**Author:** independent researcher (external read)

---

## Scope

This chapter covers how rigorous, published agent benchmarks are **constructed, run, and scored**, and
what BuildOS's in-house Phase A falsification harness should borrow. It is deliberately narrow: it is
about **evaluation methodology**, not about orchestration architecture. Where the two collide — most
importantly, whether BuildOS's comparison can identify an architecture effect at all — this chapter
takes a position.

Seven questions drive it: variance and repeated trials; cost as a first-class axis; task-set size and
diversity; scoring (programmatic vs judge, partial credit, reward hacking, crashed baselines); harness
reproducibility; held-out sets and overfitting detection; and what these authors say about ad-hoc
internal evals.

Everything substantive is cited. Where I could not verify a number from a primary or near-primary
source, it is marked `UNVERIFIED` or omitted.

---

## Key sources

| Source                                                                                                    | What it establishes                                                                                                                                | URL                                                                              |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Kapoor, Stroebl, Siegel, Nadgir, Narayanan — _AI Agents That Matter_ (Princeton, 2024)                    | Cost-controlled evaluation; accuracy/cost Pareto frontier; simple baselines beat complex agents; inadequate holdout sets; reproducibility failures | https://arxiv.org/abs/2407.01502 · https://ar5iv.labs.arxiv.org/html/2407.01502  |
| Kapoor, Stroebl, Kirgis, Nadgir, Siegel et al. — _Holistic Agent Leaderboard (HAL)_ (Princeton, Oct 2025) | Standardized third-party harness; 21,730 rollouts / 9 models / 9 benchmarks / ~$40k; cost-controlled leaderboard; log-level behavior analysis      | https://arxiv.org/abs/2510.11977 · https://hal.cs.princeton.edu/                 |
| Yao, Shinn, Razavi, Narasimhan — _τ-bench_ (Sierra, 2024)                                                 | `pass^k` reliability metric; LLM user simulator; database-state scoring                                                                            | https://arxiv.org/abs/2406.12045 · https://sierra.ai/blog/benchmarking-ai-agents |
| Sierra — _τ²-bench_ (2025)                                                                                | Dual-control environment; user simulator coupled to environment state to remove simulation noise; compositional task generation                    | https://arxiv.org/abs/2506.07982 · https://github.com/sierra-research/tau2-bench |
| OpenAI — _Introducing SWE-bench Verified_ (2024)                                                          | Why a human-validated subset was needed; underspecified issues and unfair tests                                                                    | https://openai.com/index/introducing-swe-bench-verified/                         |
| Epoch AI — SWE-bench Verified evaluation notes                                                            | Containerization, network isolation, token caps, dropped-sample policy, residual 5–10% error rate                                                  | https://epoch.ai/benchmarks/swe-bench-verified                                   |
| Zhou et al. — _WebArena_ (2023)                                                                           | 812 tasks from 241 templates; Docker-containerized reproducible sites; programmatic functional-correctness validators                              | https://arxiv.org/pdf/2307.13854                                                 |
| Wei et al. — _BrowseComp_ (OpenAI, 2025)                                                                  | 1,266 questions; inverted construction so answers are hard to find but trivial to verify; trainer-validated difficulty                             | https://arxiv.org/html/2504.12516v1                                              |
| Chan et al. — _MLE-bench_ (OpenAI, 2024)                                                                  | 75 Kaggle competitions; medal-threshold grading; pass@1 16.9% → pass@8 34.1%                                                                       | https://arxiv.org/pdf/2410.07095 · https://openai.com/index/mle-bench/           |
| Terminal-Bench 2.0 / Harbor harness                                                                       | 89 containerized terminal tasks across 16 categories; official harness distributed with the benchmark                                              | https://github.com/harbor-framework/terminal-bench                               |
| Miller (Anthropic) — _Adding Error Bars to Evals_ (2024)                                                  | Paired differences, clustered standard errors, resampling, power analysis, minimum detectable effect                                               | https://arxiv.org/html/2411.00640v1                                              |
| Rabanser, Kapoor, Kirgis, Liu, Utpala, Narayanan — _Towards a Science of AI Agent Reliability_ (Jun 2026) | 12 reliability metrics across consistency/robustness/predictability/safety; 14 models; capability gains ≠ reliability gains                        | https://arxiv.org/pdf/2602.16666                                                 |
| Mustahsan, Lim, Anand, Jain, McCann — _Stochasticity in Agentic Evaluations_ (Dec 2025)                   | Intraclass correlation for run-to-run inconsistency; single runs fail to discriminate                                                              | https://arxiv.org/pdf/2512.06710                                                 |
| Starace — _Scaffold Effects on GAIA: A Controlled Comparison_ (Jun 2026)                                  | Holds the model constant across scaffolds to separate architecture effects from model effects                                                      | https://arxiv.org/pdf/2606.08529                                                 |
| Nadgir, Kapoor et al. — _Life After Benchmark Saturation: CORE-Bench_ (Jun 2026)                          | Building an out-of-distribution suite once a benchmark saturates                                                                                   | https://arxiv.org/pdf/2606.26158                                                 |
| Bercovich, Segal, Zhang, Saxena, Raghunathan, Zhong — _Terminal Wrench_ (Apr 2026)                        | 331 reward-hackable environments, 3,632 exploit trajectories                                                                                       | https://arxiv.org/pdf/2604.17596                                                 |
| Sengupta & Wang — _HARBOR: Automated Harness Optimization_ (Apr 2026)                                     | "Harness sensitivity": the harness itself moves measured performance                                                                               | https://arxiv.org/pdf/2604.20938                                                 |
| Norman, Rivera, Hughes — _Reliability without Validity_ (Jun 2026)                                        | LLM judges: internal consistency ≠ validity; validate against humans; prefer panels                                                                | https://arxiv.org/abs/2606.19544                                                 |
| Zhang, Wang, Lei — _Catching One in Five_ (Jun 2026)                                                      | LLM judges catch ~1 in 5 real failures in production multi-turn transaction agents; recommends state-aware judging                                 | https://arxiv.org/pdf/2606.10315                                                 |

---

## Findings

### 1. Variance and repeated trials

The field's consensus is that a single run is not an observation, it is an anecdote.

**τ-bench introduced `pass^k` precisely to expose what averages hide.** Unlike `pass@k` ("at least one
of k attempts succeeded"), `pass^k` is the fraction of scenarios an agent solves on **all** k
independent rollouts, so it _falls_ as k rises. The launch result is the canonical demonstration: GPT-4o
resolves under 50% of τ-bench tasks at `pass^1` but **below 25% at `pass^8` in retail**
([arXiv:2406.12045](https://arxiv.org/abs/2406.12045);
[Sierra](https://sierra.ai/blog/benchmarking-ai-agents)). A system that reads as a 50–60% performer is,
measured for consistency, closer to one in four. τ-bench ships 165 tasks (115 retail, 50 airline) and
reports `pass^k` at k = 1, 2, 4, 8.

**Anthropic's statistics paper gives the mechanics.** Miller recommends reporting standard errors via
the CLT, **clustered** standard errors when questions come in related groups (clustered SEs can be
_over 3× larger_ than naive ones), **resampling** each question K times to shrink within-question
variance, and **paired differences** at the question level when comparing two systems — a free variance
reduction because scores are positively correlated across systems on the same items
([arXiv:2411.00640](https://arxiv.org/html/2411.00640v1)).

**Two 2026 papers push further.** _Stochasticity in Agentic Evaluations_ applies intraclass correlation
to quantify run-to-run inconsistency and argues single evaluations "frequently fail to reliably
discriminate between agent performance levels" ([arXiv:2512.06710](https://arxiv.org/pdf/2512.06710)).
_Towards a Science of AI Agent Reliability_ proposes 12 metrics across consistency, robustness,
predictability, and safety, and finds across 14 agentic models that recent capability gains have
yielded only small reliability improvements ([arXiv:2602.16666](https://arxiv.org/pdf/2602.16666)).

**Where designers disagree:** τ-bench treats reliability as the headline metric; MLE-bench reports
`pass@k` and celebrates the _gain_ from multiple attempts (o1-preview + AIDE: 16.9% at pass@1 → 34.1%
at pass@8, [arXiv:2410.07095](https://arxiv.org/pdf/2410.07095)). Not contradictory — they answer "can
I ship this unattended?" vs "can a human-in-the-loop get value?" — but a harness must declare which one
it is measuring.

### 2. Cost as a first-class axis

_AI Agents That Matter_ is the load-bearing source. Its argument: because the models underneath agents
are stochastic, **any agent can buy accuracy by calling the model more times**, so an accuracy-only
leaderboard rewards expense rather than insight. Their conclusion is blunt: "useful agent evaluations
must control for cost — even if we ultimately don't care about cost and only about identifying
innovative agent designs" ([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)).

The demonstration is the part that should worry any team claiming an architecture win. On 164 HumanEval
problems, run **five times each**, three trivial baselines — retry, warming (temperature ramp), and
escalation (switch to a costlier model on failure) — matched or beat the published complex agents:

| Agent                 | Accuracy | Cost (USD) |
| --------------------- | -------- | ---------- |
| Warming (GPT-4)       | 93.2     | 2.45       |
| Retry (GPT-4)         | 92.0     | 2.51       |
| LDB (GPT-4 + GPT-3.5) | 91.0     | 2.19       |
| LATS (GPT-4)          | 88.0     | 134.50     |
| Reflexion (GPT-4)     | 87.8     | 3.90       |
| Escalation            | 85.0     | 0.27       |

(figures as reported in the paper's HumanEval table, [ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502))

The authors attribute the field's confusion to inadequate baselines: researchers "have not adequately
tested simple baselines," producing "widespread beliefs in the community that complex ideas like
planning, reflection, and debugging are responsible for accuracy gains."

**Pareto framing, not a single ratio.** "Visualizing the cost and accuracy of agents as a Pareto
frontier opens up a new space for agent design: jointly optimizing cost and accuracy." They implement
this on HotPotQA via a DSPy modification and report **53% lower variable cost at similar accuracy**
(GPT-3.5) and **41% lower** (Llama-3-70B). HAL operationalizes the same idea as infrastructure:
accuracy-vs-dollars plots by default, with the framing that "agents can be 100× more expensive while
only being 1% better" ([hal.cs.princeton.edu](https://hal.cs.princeton.edu/)).

The methodological point a fixed multiplier misses: a "≤3× control cost" bound answers _is it cheap
enough_. The frontier answers _is there a cheaper configuration that gets the same quality_ — which is
the question that killed LATS and Reflexion.

### 3. Task-set size and diversity

Credible agent benchmarks cluster in the high tens to low thousands:

| Benchmark          | Tasks                                                                | Structure                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BrowseComp         | 1,266                                                                | inverted-construction, short verifiable answers ([link](https://arxiv.org/html/2504.12516v1))                                                                      |
| WebArena           | 812 (from 241 templates, ~3.3 instantiations each)                   | 4 self-hosted sites ([link](https://arxiv.org/pdf/2307.13854))                                                                                                     |
| SWE-bench Verified | 500 (Epoch runs 484)                                                 | human-validated subset ([link](https://epoch.ai/benchmarks/swe-bench-verified))                                                                                    |
| GAIA               | 466 (public validation ~165, private test ~300), 3 difficulty levels | secondary sources: [Klu](https://klu.ai/glossary/gaia-benchmark-eval), [TDS](https://towardsdatascience.com/gaia-the-llm-agent-benchmark-everyones-talking-about/) |
| τ-bench            | 165 (115 retail / 50 airline)                                        | ([link](https://arxiv.org/abs/2406.12045))                                                                                                                         |
| Terminal-Bench 2.0 | 89 across 16 categories                                              | ([link](https://github.com/harbor-framework/terminal-bench))                                                                                                       |
| MLE-bench          | 75 Kaggle competitions                                               | ([link](https://arxiv.org/pdf/2410.07095))                                                                                                                         |

Miller's power analysis explains why the floor sits where it does: to detect a **3 percentage-point**
absolute difference at 80% power and α = 0.05 on a "typical" eval requires roughly **969 questions**,
and he recommends new evals contain at least 1,000. With 198 questions, raising resampling from K = 1 to
K = 10 lowers the minimum detectable effect from **13.2% to 7.5%** — i.e. resampling buys power, but it
cannot rescue a tiny item set ([arXiv:2411.00640](https://arxiv.org/html/2411.00640v1)).

The consequence for very small sets is not "noisier conclusions." It is that the decision rule stops
being a test. A threshold that a coin flip clears is a ceremony, not a gate.

### 4. Scoring

**Programmatic verification is the default; judges are the fallback.** SWE-bench runs unit tests.
WebArena uses annotated programs that validate functional correctness via database queries or JavaScript
(with LLM fuzzy-match reserved for free-text sub-checks), scored binary 0/1 per task
([link](https://arxiv.org/pdf/2307.13854)). τ-bench compares the **database state at the end of the
conversation with an annotated goal state**, plus required output information
([link](https://arxiv.org/abs/2406.12045)). BrowseComp deliberately _inverted_ question construction —
start from a known fact, add qualifiers until it is uniquely determined — specifically so that answers
are "hard to solve, easy to verify," reducing grading to short-answer equivalence
([link](https://arxiv.org/html/2504.12516v1)).

**Partial credit is used sparingly and structurally.** MLE-bench grades against Kaggle medal thresholds
normalized by participant count, so a medal means a comparable achievement level across competitions —
graded credit anchored to an external human distribution rather than a rubric
([link](https://arxiv.org/pdf/2410.07095)). GAIA stratifies by difficulty level instead of awarding
partial credit within a task.

**Judges are under active attack in 2026.** _Catching One in Five_ finds LLM judges detect roughly one
in five real failures in production multi-turn transaction agents and argues for state-aware judging
([arXiv:2606.10315](https://arxiv.org/pdf/2606.10315)). _Reliability without Validity_ shows judges can
be highly self-consistent while remaining invalid, and recommends validating against human annotators
and using panels rather than single judges
([arXiv:2606.19544](https://arxiv.org/abs/2606.19544)). Known biases — position, verbosity,
self-preference — are standardly mitigated by running **both orderings** of a pairwise comparison and
averaging.

**Reward hacking is now a first-class harness concern.** _Terminal Wrench_ catalogs **331
reward-hackable environments and 3,632 exploit trajectories**, documenting agents that manipulate tests,
special-case for the checker, or exit early
([arXiv:2604.17596](https://arxiv.org/pdf/2604.17596)). HAL's log inspection found agents "searching for
the benchmark on HuggingFace instead of solving a task, or misusing credit cards in flight booking
tasks" ([arXiv:2510.11977](https://arxiv.org/abs/2510.11977)). The defense is the same in both: verify
end state, not narration; read logs, don't just read scores.

**Crashed or errored baseline runs.** The strong norm is _exclude and disclose_, not _score as zero_.
Epoch drops 16 of 500 SWE-bench Verified samples that "do not reliably run in our infrastructure" and
says so ([link](https://epoch.ai/benchmarks/swe-bench-verified)). A baseline that crashed in your
harness is a harness fact, not a capability fact; counting it as a loss for the baseline inflates the
challenger.

### 5. Harness reproducibility

Containerization is table stakes. WebArena ships its four websites as Docker containers with state
reset, "guaranteeing identical starting conditions, something impossible with live web scraping"
([link](https://arxiv.org/pdf/2307.13854)). Epoch runs SWE-bench Verified in a barebones Linux Docker
container with **network access disabled** to prevent cheating and **git history removed** after the
issue so the model cannot read the human fix, plus a 2M uncached / 20M cached-read token cap
([link](https://epoch.ai/benchmarks/swe-bench-verified)). Terminal-Bench 2.0 runs isolated Docker tasks
under the official Harbor harness ([link](https://github.com/harbor-framework/terminal-bench)).
HAL orchestrates parallel rollouts across hundreds of VMs with conda/Docker/Azure isolation and
publishes all 2.5B tokens of agent logs — **encrypted**, to prevent the traces themselves becoming
training contamination ([arXiv:2510.11977](https://arxiv.org/abs/2510.11977),
[hal.cs.princeton.edu](https://hal.cs.princeton.edu/)).

_AI Agents That Matter_ found reproducibility failures across the board: missing HumanEval test cases,
papers silently adding or removing problems, and WebArena rate-limit assumptions that broke task
independence. Their diagnosis of the tooling gap is explicit: "evaluation frameworks like HELM and LM
Evaluation Harness address these shortcomings for model evaluations… But as we have seen, these
frameworks don't suffice for evaluating AI agents," and "developing an agent evaluation framework is a
ripe area for future work" ([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)).

**The harness is itself a treatment.** _HARBOR_ names this "harness sensitivity" — harness design
choices alone materially move measured performance, so harness configuration must be reported as part
of the result ([arXiv:2604.20938](https://arxiv.org/pdf/2604.20938)). τ²-bench makes the same move in
the user simulator: it couples the simulator to environment state so it cannot invent device settings or
contradict itself, explicitly to "disentangle agent mistakes from simulation noise"
([arXiv:2506.07982](https://arxiv.org/abs/2506.07982)). Community τ-bench submissions that vary the
simulator model create "a comparability hazard" — a τ-bench score depends on the simulator as well as
the agent ([benchmarkingagents](https://benchmarkingagents.com/tau-bench/)). Even task fixes break
comparability: the τ-bench repo now warns its tasks are frozen and points users to τ³-bench
([link](https://github.com/sierra-research/tau-bench)).

### 6. Held-out sets and overfitting

_AI Agents That Matter_: "surprisingly, we find that many agent benchmarks do not include held-out test
sets." They define four levels of agent generality — distribution-specific, task-specific,
domain-general, fully general — each requiring a different kind of holdout, and score the field:
**1/1, 3/6, 1/8, and 0/2** benchmarks respectively have appropriate holdouts. Their concrete overfitting
example is the STeP agent on WebArena, which hardcodes site-specific policies (e.g. appending
`/user/username` to URLs) to reach 35.8% and would not survive distribution shift
([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)).

Detection methods in current use: **held-out / OOD suites** (the Princeton group's response to
CORE-Bench saturation was to build _CORE-Bench OOD_,
[arXiv:2606.26158](https://arxiv.org/pdf/2606.26158)); **canary strings** embedded in benchmark files
(BIG-bench's approach, described in
[benchmarkingagents](https://benchmarkingagents.com/benchmark-contamination/)); **time-based
partitions**; and **rephrased-sample performance gaps**. OpenAI has publicly retired SWE-bench Verified
as a frontier measure ("Why SWE-bench Verified no longer measures frontier coding capabilities,"
https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ — page returned HTTP 403 to
automated fetch; the specific flawed-test percentage circulating in secondary coverage is
**UNVERIFIED** here).

The operative rule: **a set you tuned against is a training set, permanently.** No amount of later
discipline converts it back.

### 7. What these authors say about ad-hoc internal evals

Four charges recur, all directly applicable to a small internal harness:

1. **Accuracy-only comparison with an unconstrained cost budget** rewards spend, not design
   ([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)).
2. **Baselines are not seriously tried**, so architecture gets credit that belongs to sampling, retries,
   or a better model (ibid.).
3. **No error bars, no power.** Miller's paper exists because the field reports point estimates on item
   sets too small to support them ([arXiv:2411.00640](https://arxiv.org/html/2411.00640v1)).
4. **Conflating audiences.** _AI Agents That Matter_: "the benchmarking needs of model and downstream
   developers have been conflated." A downstream builder's question ("which configuration should I ship
   for my users, at what cost?") is a _procurement_ question and needs a cost-controlled Pareto answer,
   not a leaderboard rank.

---

## What BuildOS's harness would look like if built to benchmark standards

Concretely, and scaled to a one-person team — this is a floor, not an aspiration.

**Task set.** **40–60 scenarios minimum**, stratified across the existing classes (simple_read,
status_summary, single_source_lookup, multi_source_research, context_research_recommendation, ambiguous,
unsupported_capability) with **≥8 per class** in the classes that carry the architecture claim. The
smallest credible published agent benchmarks sit at 75–89 tasks (MLE-bench, Terminal-Bench 2.0). Below
~40 the harness cannot distinguish "the workflow is better" from "C06 happened to suit it." **30% held
out**, generated before any prompt work and never inspected; scored exactly once, at the decision.

**Trials.** **k = 5 per scenario per lane** as the working minimum, k = 8 for the complex scenarios that
decide the gate. Report both `pass^1` (mean required-check pass rate) and **`pass^k`** (fraction of
scenarios where _every_ trial passed all required checks). `pass^k` is the metric that matters for a
production orchestrator and it is computable today from the existing `acceptance_checks`
([τ-bench](https://arxiv.org/abs/2406.12045)).

**Metrics reported, in priority order.**

1. **Required-acceptance-check pass rate** (programmatic, primary).
2. **`pass^k`** on required checks — the reliability number.
3. **Paired difference** between lanes at the scenario level, with **clustered** standard errors by
   scenario and a 90% CI. State the minimum detectable effect _before_ running
   ([Miller](https://arxiv.org/html/2411.00640v1)).
4. **Judge preference** as a secondary quality signal only, with each pair scored in **both orderings**
   (A/B and B/A) to cancel position bias, and human agreement reported as a validity check on the panel
   ([Reliability without Validity](https://arxiv.org/abs/2606.19544)).
5. **Full cost per run** — model + web-research tool calls + retries — not model cost alone.
6. **p50/p95 latency** per lane and per route class.
7. **Invalid-run ledger**: count and reason for every excluded run, published with the result
   ([Epoch practice](https://epoch.ai/benchmarks/swe-bench-verified)).

**How cost enters the decision rule.** Replace the single "≤3× control model cost" bound with a
**Pareto frontier over at least six configurations**:

| Arm                                                  | Purpose                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Control @ `deepseek-v4-flash` balanced               | current baseline                                                              |
| Control @ GLM 5.2 `powerful`                         | **isolates the model effect** — same architecture, workflow's synthesis model |
| Control @ flash, best-of-3 sampling + self-select    | the _AI Agents That Matter_ retry baseline, priced to match the workflow      |
| Workflow, default pins                               | current challenger                                                            |
| Workflow, cheap synthesis (flash instead of GLM 5.2) | isolates the synthesis-model contribution                                     |
| Workflow, budget-capped (halved token/step budget)   | second point on the workflow's own frontier                                   |

**Decision rule:** the workflow lane goes forward only if it is **Pareto-dominant or Pareto-improving**
against the best control arm at comparable cost — not merely "under 3×." If control-on-powerful matches
the workflow, the architecture claim is dead, and that is a legitimate, valuable Stop.

**Reproducibility mechanics to add** (most already exist): per-role model pin verification (exists),
prompt/world-card/corpus SHA-256 (exists), plus a **published harness configuration block** with every
result (HARBOR's harness-sensitivity point), and a fixed **judge prompt version + ordering seed**.

---

## Direct comparison to BuildOS

| Practice                                              | What BuildOS does                                                                                                                                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Cost to fix                                                                                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Model held constant across compared architectures** | Control = `deepseek/deepseek-v4-flash` on `balanced`. Workflow = Gemini router + DeepSeek V4 Pro researcher + **GLM 5.2 on `powerful`** for the synthesis a judge actually reads.            | **behind** — this is a confound, and it makes the architecture claim _unidentifiable at any sample size_. The measured contrast is "multi-agent + better writer + web tools" vs "single agent + cheap writer." Controlled-comparison practice holds the model fixed and varies only the scaffold ([Starace, GAIA](https://arxiv.org/pdf/2606.08529)); HAL runs a 9-model × 9-benchmark grid for the same reason ([HAL](https://arxiv.org/abs/2510.11977)).                                                                                                           | **Low — one extra control arm.** Re-run the existing control lane on GLM 5.2 `powerful`. ~1 day, ~9 runs. This single arm is the difference between a publishable result and an uninterpretable one. |
| **Statistical power of the comparison**               | 3 complex scenarios × 3 pairs = 9 blind pairs; Go bar ≥6/9 (66.7%).                                                                                                                          | **behind.** Under a fair-coin null, P(≥6 of 9) = **130/512 ≈ 25.4%**. You would need **8/9** for a one-sided p < 0.05 (10/512 ≈ 1.9%). Worse: the 9 pairs cluster in 3 scenarios, so effective n ≈ 3, and clustered SEs run >3× naive ([Miller](https://arxiv.org/html/2411.00640v1)). Miller's benchmark for a 3pp effect is ~969 items.                                                                                                                                                                                                                            | **Medium.** Trials are cheap; scenarios are not. Going to 12 complex scenarios × 5 trials = 60 pairs is a corpus-authoring problem (~2–3 days), not a compute problem.                               |
| **Interaction of the crashed control with the gate**  | All 3 C07 control runs errored (73–173 chars). C07 stays in the 9 and is "reported separately"; Go additionally requires ≥3/6 on C06+C08.                                                    | **behind — the two gates collapse into one.** A crashed control hands the workflow ~3 free wins, so reaching 6/9 requires exactly 3 of the 6 C06+C08 pairs — identical to the secondary gate. **P(≥3 of 6 under a coin flip) = 42/64 ≈ 65.6%.** The pre-registered bar is cleared by chance about two times in three. Standard practice excludes infra-broken samples from the denominator and discloses them ([Epoch](https://epoch.ai/benchmarks/swe-bench-verified)) — and BuildOS's own validity rule already classes harness failure as infrastructure-invalid. | **Zero.** Drop C07 from the primary denominator, restate the bar over C06+C08 (or fix the control and re-run C07). Do this before scoring.                                                           |
| **Cost framing**                                      | Fixed bound: workflow mean model cost ≤ $0.022479 (3× control).                                                                                                                              | **behind.** A single multiplier cannot answer "is there a cheaper configuration at equal quality" — the exact question that showed retry/warming beating LATS at 1/55th the cost ([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)). The 3× number is also anchored to a control priced by _its cheaper model_, so cost and quality co-vary with the same confound.                                                                                                                                                                                             | **Low.** Same six-arm sweep as above; plot accuracy vs dollars.                                                                                                                                      |
| **Baselines seriously tried**                         | Two lanes only; a sequential single-agent baseline and the CEO fast-lane are deferred to Phase B. No sampling/retry baseline.                                                                | **behind.** The single most-cited failure mode in the literature. A flash-model best-of-3 baseline at matched cost is the cheapest possible falsification of the architecture claim.                                                                                                                                                                                                                                                                                                                                                                                 | **Low.** One additional lane, reuses the existing control harness.                                                                                                                                   |
| **Reliability metric (`pass^k`)**                     | 3 runs per lane/scenario, but scored as blind pairwise wins; no all-k-succeed statistic.                                                                                                     | **behind.** The data already exists — `pass^3` over required acceptance checks is a query, not an experiment ([τ-bench](https://arxiv.org/abs/2406.12045)).                                                                                                                                                                                                                                                                                                                                                                                                          | **Zero.** Compute from existing result JSON.                                                                                                                                                         |
| **Programmatic verification**                         | `acceptance_checks` (validator id + config, required/optional), and a **required-check failure vetoes a workflow win regardless of judge preference**.                                       | **matched, arguably ahead** on structure. The veto correctly subordinates narrative judgment to machine verification, which is what τ-bench/WebArena/SWE-bench do. But the _deciding_ metric is still judge preference; benchmarks make the programmatic score primary and never let a rubric outrank state.                                                                                                                                                                                                                                                         | **Zero–low.** Swap the reporting hierarchy: required-check pass rate primary, judge win-rate secondary.                                                                                              |
| **Judge design**                                      | 3 pinned heterogeneous judges, 5 dimensions 0–4, majority vote; prompt-injection framing; **human scores all 9 pairs before the panel**; panel invalid unless ≥7/9 human agreement.          | **ahead of typical internal practice.** Panel + prior human anchoring is exactly what _Reliability without Validity_ recommends ([link](https://arxiv.org/abs/2606.19544)). Two gaps: (a) each pair is judged in one ordering only — structural counterbalancing across pairs is weaker than running both orderings and averaging; (b) validating a panel on 9 items is itself underpowered.                                                                                                                                                                         | **Low.** Run both orderings (18 judgments/judge, ~2× judge cost). Expand human-anchored validation to ≥30 pairs over time.                                                                           |
| **Judges catching real failures**                     | Judges score prose quality; no state-diff verification of what the lanes actually did.                                                                                                       | **behind** relative to 2026 findings that judges catch ~1 in 5 real failures in multi-turn agent transcripts ([link](https://arxiv.org/pdf/2606.10315)). Mitigated (not solved) by the acceptance-check veto.                                                                                                                                                                                                                                                                                                                                                        | **Medium.** Extend acceptance checks toward state-aware assertions per scenario.                                                                                                                     |
| **Held-out set**                                      | 5-case held-out route corpus frozen _after_ four prompt passes + two model pilots hit 72/72 on the original eight; not yet scored. Fifth tuning pass forbidden.                              | **matched on diagnosis, behind on execution.** Recognizing the corpus had become a training set is the right call and rare. But 5 cases cannot support a 90.3% threshold, and the 58/72 "Change" verdict is a _training-set_ number. Field practice: build an OOD suite sized to decide ([CORE-Bench OOD](https://arxiv.org/pdf/2606.26158)); only 8/17 surveyed benchmarks had adequate holdouts at all ([ar5iv](https://ar5iv.labs.arxiv.org/html/2407.01502)).                                                                                                    | **Medium.** Grow the held-out route corpus to ~25–30 cases before it decides anything.                                                                                                               |
| **Task-set size**                                     | 8 scenarios total; 3 decide the architecture claim.                                                                                                                                          | **behind.** One to two orders of magnitude below the smallest credible published agent benchmarks (75–89).                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Medium** — corpus authoring, and production transcripts are the raw material, so it is bounded work.                                                                                               |
| **Pre-registration of the decision rule**             | Go/Change/Stop bounds frozen before scoring, derived from measured A0 baselines; "a marginal result is a stop, not a go."                                                                    | **ahead — genuinely.** Pre-registration is essentially absent from published agent-benchmark work. Keep this. The bounds are miscalibrated (above), not the practice.                                                                                                                                                                                                                                                                                                                                                                                                | n/a                                                                                                                                                                                                  |
| **Run-validity taxonomy**                             | Infra-invalid (model mismatch, pre-inference transport failure, harness failure) replaced once and excluded; model-matched timeouts/tool failures/bad outputs stay in every denominator.     | **ahead / novel — unproven.** Cleaner than most published harnesses, which mostly say nothing. Two risks: "replaced once" without publishing the replacement count is an unaudited degree of freedom, and it is applied inconsistently (C07's control crash is a harness failure by this rule, yet stays in).                                                                                                                                                                                                                                                        | **Zero.** Publish the invalid-run ledger; apply the rule symmetrically to both lanes.                                                                                                                |
| **Reproducibility mechanics**                         | SHA-256 on prompts, world card, corpus, snapshot, blind mapping; per-role model pin verification with untagged usage invalid; temp 0.1; capped max tokens; result JSON hashed and committed. | **matched, locally ahead.** Per-role pin verification is stronger than most harnesses and directly addresses HARBOR's harness-sensitivity concern ([link](https://arxiv.org/pdf/2604.20938)). Missing vs. containerized benchmarks: no environment isolation (in-process), and no fixed seed/ordering for judges.                                                                                                                                                                                                                                                    | **Low.** Publish a harness-config block with each result.                                                                                                                                            |
| **Contamination risk**                                | Corpus derived from private production transcripts, anonymized, hash-pinned.                                                                                                                 | **ahead by construction.** No public-web leakage path; mirrors HAL's encrypted-trace policy ([link](https://hal.cs.princeton.edu/)).                                                                                                                                                                                                                                                                                                                                                                                                                                 | n/a                                                                                                                                                                                                  |
| **Reward-hacking defenses**                           | Hard safety gates (no cross-project execution, receipts for every tool op, no unresolved citations, no unapproved staged applies); code-validated citations.                                 | **matched.** Receipts + code-side citation validation are real defenses against the narration-vs-reality gap that _Terminal Wrench_ documents ([link](https://arxiv.org/pdf/2604.17596)). Untested against an adversarial agent, since Phase A has no mutations.                                                                                                                                                                                                                                                                                                     | n/a for Phase A                                                                                                                                                                                      |
| **Cost accounting completeness**                      | Model cost only, from stream-correlated usage logs.                                                                                                                                          | **behind (minor).** Excludes web-research tool spend and orchestration overhead, which is where a multi-agent workflow's real cost lives.                                                                                                                                                                                                                                                                                                                                                                                                                            | **Zero–low.**                                                                                                                                                                                        |

---

## Open questions

1. **Is a same-model comparison even runnable?** The workflow lane's researcher needs a web-research
   port and the control lane may not support the same model class through the same profile. If not,
   the fallback is to run _both_ lanes across the same 2–3 models and report the interaction, HAL-style.
2. **What is the right primary metric for BuildOS?** τ-bench-style `pass^k` on required checks assumes
   the checks capture what users care about. If the real product claim is "better answers," a judge
   panel is unavoidable and the honest move is to inflate the sample rather than the rigor of the rubric.
3. **How many production transcripts can be safely anonymized into scenarios?** The corpus ceiling is
   privacy and labeling effort, not compute. This determines whether 40 scenarios is achievable this
   quarter.
4. **Does the routing gate deserve a separate held-out threshold?** A 5-case held-out set cannot test a
   90.3% bound; either the threshold or the set size must move, and it is not obvious which.
5. **Is the C07 control crash reproducible or transient?** If reproducible, it is a real product finding
   about the control lane and should be reported as such — separately from the architecture experiment.
6. **UNVERIFIED:** the exact percentage of SWE-bench Verified problems OpenAI found to have flawed tests
   when it retired the benchmark. The retirement itself is public
   (https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/); the figure circulating in
   secondary coverage was not confirmable from a primary source in this pass.

---

## Confidence

**High confidence:**

- The model confound is real and fatal to the architecture claim as currently designed. This follows
  from the design description alone, and the controlled-comparison literature is unambiguous about the fix.
- The binomial arithmetic (25.4% for ≥6/9; 65.6% for ≥3/6) is exact, not an estimate.
- The gate collapse caused by the crashed C07 control follows deterministically from the stated rules.
- Field norms on task-set size, containerization, programmatic verification, and Pareto cost framing
  are well sourced and consistent across independent groups.

**Medium confidence:**

- The specific HumanEval accuracy/cost table from _AI Agents That Matter_ was extracted from the ar5iv
  rendering rather than read from the typeset PDF; the ordering and the ~55× LATS-vs-warming cost gap
  are the paper's central, widely-repeated result, but treat individual decimals as approximate.
- τ-bench task counts (115 retail / 50 airline) come from a secondary aggregator; the pass^1/pass^8
  gap is primary.
- GAIA's exact validation/test split comes from secondary sources.
- The recommended 40–60 scenario floor is my extrapolation from published benchmark sizes and Miller's
  power analysis, scaled for a solo team — it is a judgment call, not a cited threshold.

**Low confidence / not established:**

- Whether BuildOS's `pass^3` on required checks would actually separate the lanes. No scored workflow
  outputs exist yet, so every quality claim in either direction is currently unsupported by data.
- Whether the deferred sequential single-agent baseline would change the verdict. That is precisely
  what the literature says you cannot know without running it.
