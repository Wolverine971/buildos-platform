<!-- docs/architecture/agent-first-orchestration/research/02_MULTI_AGENT_SKEPTICS_AND_FAILURE_MODES.md -->

# The Case Against Multi-Agent — Skeptics, Failure Modes, and a Falsification Lens for BuildOS

**Date:** 2026-07-25
**Chapter role:** Adversarial. This is the sharpest available counter-case to the agent-first bet, assembled to arm a falsification effort. It is not a recommendation to abandon multi-agent.

---

## Scope

Covers: (1) the strongest published arguments against multi-agent LLM architectures and their reasoning chains; (2) a taxonomy of empirically documented failure modes with measured frequencies; (3) the boundary conditions separating task shapes where fan-out wins from where it loses; (4) what proponents concede; (5) what evidence would distinguish "agent-first is better" from "agent-first is a more expensive way to lose," applied concretely to the Phase A harness described in `00_SYSTEM_UNDER_REVIEW.md`.

Out of scope: general LLM-as-judge methodology, prompt engineering, and the durability/permissions questions Phase B owns. Sources are 2025-06 through 2026-06. Every substantive claim carries a URL; unverifiable items are marked.

---

## Key sources

| Source                                                                                                       | Who                                                                                                             | Date                                              | Why it matters                                                                          | URL                                                                           |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| _Don't Build Multi-Agents_                                                                                   | Walden Yan, Cognition                                                                                           | 2025-06-12                                        | The canonical skeptic post; two principles that indict distributed decision-making      | https://cognition.com/blog/dont-build-multi-agents                            |
| _Multi-Agents: What's Actually Working_                                                                      | Walden Yan, Cognition                                                                                           | 2026-04-22                                        | The same author's revision — the narrow class that works, and why                       | https://cognition.com/blog/multi-agents-working                               |
| _Why Do Multi-Agent LLM Systems Fail?_ (MAST)                                                                | Cemri, Pan, Yang, Agrawal, Chopra, Tiwari, Keutzer, Parameswaran, Klein, Ramchandran, Zaharia, Gonzalez, Stoica | arXiv 2025-03-17, v3 2025-10-26; NeurIPS 2025 D&B | 14-mode taxonomy, 1,600+ traces, κ=0.88, per-mode frequencies                           | https://arxiv.org/abs/2503.13657                                              |
| _How Much Coordination Gain Is Real? A Paired Noise-Floor Protocol_                                          | Kaliyev, Maryanskyy (UT Austin)                                                                                 | 2026-06-15                                        | Establishes an empirical noise floor; 7/10 recent architectures report gains below it   | https://arxiv.org/abs/2606.20695                                              |
| _Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets_ | Dat Tran, Douwe Kiela (Stanford)                                                                                | 2026-04-02                                        | Information-theoretic (DPI) argument + matched-budget experiments                       | https://arxiv.org/abs/2604.02460                                              |
| _Multi-LLM-Agents Debate — Performance, Efficiency, and Scaling Challenges_                                  | ICLR Blogposts 2025                                                                                             | 2025-04-28                                        | 5 MAD frameworks vs CoT/self-consistency across 9 benchmarks                            | https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/            |
| _How we built our multi-agent research system_                                                               | Anthropic Engineering                                                                                           | 2025-06                                           | The strongest pro-fan-out claim (+90.2%) _and_ its stated limits                        | https://www.anthropic.com/engineering/multi-agent-research-system             |
| _When to use multi-agent systems (and when not to)_                                                          | Cara Phillips et al., Anthropic                                                                                 | 2026-01-23                                        | Official decision heuristics, incl. 3–10× token multiplier and the "telephone game"     | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them |
| _When Errors Become Narratives: Silent Failures in a Production LLM Agent Runtime_                           | Wei Wu                                                                                                          | 2026-06-12                                        | 8-week production longitudinal; "fail-plausible" class; 0% ex-ante prevention by audits | https://arxiv.org/abs/2606.14589                                              |
| _How Coding Agents Fail Their Users_                                                                         | Tang, Chen, Xu, Shi, Huang, McMillan, Dong, Li                                                                  | 2026-05-28                                        | 20,574 real sessions; misalignment forms and costs                                      | https://arxiv.org/abs/2605.29442                                              |
| _In-Context Prompting Obsoletes Agent Orchestration for Procedural Tasks_                                    | Dennis, Diamond, Patil, Shabahang, Guo                                                                          | arXiv v2 2026-05-07                               | Orchestration measured as net-negative on procedural tasks                              | https://arxiv.org/abs/2604.27891                                              |
| _Multi-Agent Reasoning Improves Compute Efficiency_                                                          | Wunderlich, Kaesberg, Wahle, Ruas, Gipp                                                                         | 2026-05-02                                        | Counter-evidence: debate/MoA beat self-consistency at equal compute (small margins)     | https://arxiv.org/abs/2605.01566                                              |
| _Self-Manager: Parallel Agent Loop for Long-form Deep Research_                                              | Xu, Zheng, Long, Cai, Wang                                                                                      | 2026-01-25                                        | Counter-evidence: parallel threads beat single-agent loops on DeepResearch Bench        | https://arxiv.org/abs/2601.17879                                              |
| _WideSeek: Advancing Wide Research via Multi-Agent Scaling_                                                  | Huang, Ren, Yuan, Wang, Jiang, Xu, He, Zhao, Liu                                                                | 2026-02                                           | Counter-evidence with an explicit failure boundary (negation / set-difference)          | https://arxiv.org/abs/2602.02636                                              |

---

## Findings

### Theme 1 — The structural argument: splitting decisions splits context, and context is the product

Cognition's original post reduces to two principles: _"Share context, and share full agent traces, not just individual messages"_ and _"Actions carry implicit decisions, and conflicting decisions carry bad results."_ The reasoning chain is: every action a subagent takes encodes assumptions it never stated; parallel subagents cannot see each other's assumptions; therefore their outputs conflict in ways no synthesis step can repair, because the synthesizer sees only outputs, not the assumptions that generated them. Yan's illustration is a Flappy Bird clone where one subagent renders a Super Mario Bros. background — the sub-task was satisfied, the product was not ([Cognition, 2025-06-12](https://cognition.com/blog/dont-build-multi-agents)).

Anthropic independently names the same mechanism from the pro side: information degrades at each handoff — the _"telephone game"_ — and work should only be split when _"context can be truly isolated."_ Splitting by problem type rather than by context boundary _"creates constant coordination overhead"_ and fails ([Anthropic, 2026-01-23](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).

Tran & Kiela formalize this. Modeling answer `Y`, full context `C`, and inter-agent messages `M` as a Markov chain `Y ⟷ C ⟷ M`, the Data Processing Inequality gives `I(Y;C) ≥ I(Y;M)`: **no multi-agent topology can increase mutual information with the answer beyond what the original context already carried.** Every text handoff is lossy by construction. Empirically, across Qwen3-30B-A3B, DeepSeek-R1-Distill-Llama-70B and Gemini 2.5 Flash/Pro on FRAMES and MuSiQue-4hop, single-agent matched or exceeded _every_ MAS topology tested (Sequential, Subtask-parallel, Parallel-roles, Debate, Ensemble) under matched thinking-token budgets from 100–10,000 ([arXiv:2604.02460](https://arxiv.org/abs/2604.02460)).

The crucial corollary is the escape hatch, and it is the honest steelman for BuildOS: multi-agent recovers ground **only where single-agent context utilization is already degraded.** In their corruption experiments, Sequential MAS surpassed single-agent only at masking/substitution corruption α=0.7. Multi-agent is a remedy for a context problem, not an intelligence gain.

### Theme 2 — Measured failure: MAST

MAST is the only large, human-validated failure taxonomy. 1,600+ annotated traces across 7 frameworks, taxonomy developed on 150 traces with inter-annotator κ=0.88. Headline empirical result: **41% to 86.7% failure rate across 7 SOTA open-source MAS**, and _"performance gains often remain minimal compared to single-agent frameworks or simple baselines like best-of-N sampling"_ ([arXiv:2503.13657](https://arxiv.org/abs/2503.13657)).

Two findings matter more than the taxonomy itself:

- **Failures are architectural, not model-quality.** The dominant category is system design (44.0%), not model capability. Better models do not obviously fix these.
- **Targeted fixes help but do not close the gap.** Workflow adjustment on ChatDev yielded +9.4% task success; adding a high-level objective-verification step yielded +15.6%. The paper's own verdict: _"Although first step interventions lead to performance gains, not all failure modes are resolved, and task completion rates still remain low."_ And on inter-agent misalignment specifically: _"Solutions focused on context or communication protocols are often insufficient for FC2 failures, which demand deeper 'social reasoning' abilities from agents."_

### Theme 3 — Most reported coordination gains do not clear the noise floor

The sharpest methodological finding in this literature. Kaliyev & Maryanskyy ask what paired disagreement two _configuration-equivalent_ protocols produce on the same model and benchmark — i.e. what a genuinely null architectural difference looks like in measurement. On Claude Haiku 4.5 against τ²-bench retail, the clean null contrast produced **signed paired gaps of +10pp and 0pp across two n=100 seeds**; pooled, +5pp with Wilson CI [-2,+12], not significant. The largest single-seed contrast (+18pp, p_corr=0.012) **did not reproduce at the second seed** (-3pp, p_corr=1.0). The observed envelope of null gaps spans **[-3,+18]pp**, pooled upper Wilson CI ~15pp.

Their conclusion: _"Seven of ten recent multi-agent coordination architectures report headline effects below this local floor."_ ([arXiv:2606.20695](https://arxiv.org/abs/2606.20695))

Read that against the whole pro-multi-agent literature: a large share of published architectural wins may be seed noise. This applies directly and unkindly to any 9-sample comparison.

### Theme 4 — Multi-agent debate specifically does not beat cheap single-agent test-time compute

Five MAD frameworks (MAD, Multi-Persona, Exchange-of-Thoughts, AgentVerse, ChatEval) evaluated against direct prompting, CoT, and self-consistency across MMLU, MMLU-Pro, AGI-Eval, CommonsenseQA, ARC-Challenge, GSM8k, MATH, HumanEval, MBPP. On GPT-4o-mini: GSM8k CoT 93.60%, SC 95.67%, MAD 90.87–94.93%. MMLU: CoT 80.73%, SC 82.13%, MAD 62.80–80.40%. Verdict: _"current MAD frameworks fail to consistently outperform simple single-agent test-time computation strategies,"_ and _"increasing test-time computation does not always improve accuracy"_ ([ICLR Blogposts 2025](https://d2jud02ci9yv69.cloudfront.net/2025-04-28-mad-159/blog/mad/)).

### Theme 5 — The orchestrator is a real bottleneck, and a small orchestrator is a worse one

Anthropic states plainly: _"LLM agents are not yet great at coordinating and delegating to other agents in real time."_ Their synchronous execution creates _"bottlenecks in the information flow between agents"_ — the system blocks on the slowest subagent, and subagents cannot coordinate mid-flight. Delegation quality is the failure surface: with under-specified instructions, _"one subagent explored the 2021 automotive chip crisis while 2 others duplicated work investigating current 2025 supply chains, without an effective division of labor"_ ([Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)).

Cognition's 2026 post supplies the most directly relevant negative result for BuildOS's specific architecture. They tried exactly the "small orchestrator calls big specialist" pattern — a weaker primary model with a stronger model exposed as a "smart friend" tool — and it **failed**: _"SWE 1.5 was not good enough at being the primary model for this setup to really work. The gap between it and Sonnet 4.5 was too wide in exactly the places that mattered."_ They also report manager-child delegation in Devin required substantial refinement because _"managers trained on small-scoped delegation default to being overly prescriptive"_ and child agents _"incorrectly assume shared state"_ ([Cognition, 2026-04-22](https://cognition.com/blog/multi-agents-working)).

And on procedural work, orchestration measures as net-negative: in-context prompting achieved equivalent or better quality at **1.2–1.7× fewer LLM calls** than agent orchestration, with orchestration helping only where sub-agent expertise cannot be captured in a prompt, where explicit retry/error-recovery is needed, or where explicit cross-component state management is required ([arXiv:2604.27891](https://arxiv.org/abs/2604.27891)).

### Theme 6 — Failures in production are silent, plausible, and long-lived

Wu's 8-week longitudinal study of a production agent runtime (≈40 scheduled jobs, 8 LLM providers, 4,286 unit tests, 827 governance checks) documented 22 incidents with root-cause postmortems, where the meta-pattern _"a failure whose error signal never reaches a human in actionable form"_ manifested **at least 28 times**. The five-class taxonomy singles out Class D — chained hallucination and fabrication — as unique to LLM systems and most dangerous: _"the system does not merely fail to report an error — the LLM transforms it into fluent, plausible narrative delivered to the user."_ He terms this **fail-plausible**.

Three findings that should reshape any eval design: **~70% of silent failures were caught by human user-view observation, not tests or audits**; a retrospective audit of 15 incidents found **0% ex-ante prevention but 87% regression blocking** — _"audits are regression engines, not prediction engines"_; and incident latency ranged **13 hours to 60 days**, tracking failure mechanism rather than code complexity, with the longest-lived failures living _"in the seams between components, where no test runs"_ ([arXiv:2606.14589](https://arxiv.org/abs/2606.14589)).

The corroborating field study: across 20,574 coding-agent sessions in 1,639 repositories, 90.50% of misalignment episodes imposed effort/trust costs rather than irreversible damage, yet **91.49% of visible resolutions still required explicit user correction** — and _inaccurate self-reporting_ grew as a share over time even as overall rates declined ([arXiv:2605.29442](https://arxiv.org/abs/2605.29442)).

### Theme 7 — What proponents concede

| Concession                                                                                                                                                                                 | Source                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Multi-agent uses ~15× the tokens of chat; agents alone ~4×                                                                                                                                 | [Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)          |
| **Token usage alone explains 80% of the variance** in BrowseComp performance                                                                                                               | ibid.                                                                                               |
| _"Most coding tasks involve fewer truly parallelizable tasks than research"_                                                                                                               | ibid.                                                                                               |
| Bad fit for tasks _"that require all agents to share the same context or involve many dependencies between agents"_                                                                        | ibid.                                                                                               |
| Multi-agent needs task value high enough to pay for the overhead                                                                                                                           | ibid.                                                                                               |
| Typical implementations use **3–10× more tokens**; start with a single agent — _"a well-designed single agent with appropriate tools can accomplish far more than many developers expect"_ | [Anthropic, 2026-01](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) |
| Teams spent _"months building elaborate multi-agent architectures"_ then found _"improved prompting on a single agent achieved equivalent results"_                                        | ibid.                                                                                               |
| _"Multi-agent systems work best today when writes stay single-threaded and the additional agents contribute intelligence rather than actions"_                                             | [Cognition, 2026-04](https://cognition.com/blog/multi-agents-working)                               |
| Unstructured swarms remain _"mostly a distraction"_; weak-model escalation is _"an open problem"_                                                                                          | ibid.                                                                                               |
| Even in the winning regime, gains at equal compute are small: debate **+1.3pp**, mixture-of-agents **+2.7pp** over self-consistency                                                        | [arXiv:2605.01566](https://arxiv.org/abs/2605.01566)                                                |

Note the shape of the concession set: the pro-multi-agent camp and the anti camp now agree on the boundary. They disagree only about how much territory sits inside it.

### Theme 8 — Where fan-out genuinely wins (the steelman)

- **Breadth-first, read-only research over information exceeding one context window.** Anthropic's lead-Opus-4 + Sonnet-4 subagent system beat single-agent Opus 4 by **90.2%** on an internal research eval (S&P 500 IT board members), and parallelization cut research time up to 90% ([Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system)). Caveat: the post does not decompose how much of the 90.2% is architecture versus the ~15× token budget, while stating token budget explains 80% of variance elsewhere.
- **Long-form deep research with isolated per-thread context.** Self-Manager's parallel agent loop _"consistently outperforms existing single-agent loop baselines across all metrics"_ on DeepResearch Bench ([arXiv:2601.17879](https://arxiv.org/abs/2601.17879)).
- **"Wide research" — systematic retrieval across expansive search spaces.** WideSeek reports Item F1 12.87% (+5.50 over base Qwen3-8B) on WideSeekBench and 26.42% (+12.20) on BrowseComp-Plus, with sub-agents scaling 6.36× — but explicitly degrades on negation-heavy and set-difference constraints ([arXiv:2602.02636](https://arxiv.org/abs/2602.02636)).
- **Context protection, parallelization, specialization** — Anthropic's three named conditions, with the heuristic that a subagent is warranted when a subtask generates >1000 tokens _most of which is irrelevant to the main task_ ([Anthropic, 2026-01](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).
- **Clean-context review as a second opinion.** Devin Review catches _"an average of 2 bugs per PR, of which roughly 58% are severe (logic errors, missing edge cases, security vulnerabilities)"_ ([Cognition, 2026-04](https://cognition.com/blog/multi-agents-working)).

---

## Failure mode taxonomy

MAST's 14 modes with measured frequencies from the annotated corpus, plus four production-observed modes that MAST's benchmark framing does not cover. This table is scoreable per run.

| ID                  | Failure mode                                                                    | Category                 | Measured freq.           | Observable in final output alone?       | Source                                      |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------ | ------------------------ | --------------------------------------- | ------------------------------------------- |
| FM-1.1              | Disobey task specification                                                      | System design            | 11.8%                    | Partly                                  | [MAST](https://arxiv.org/abs/2503.13657)    |
| FM-1.2              | Disobey role specification                                                      | System design            | 1.5%                     | No                                      | MAST                                        |
| FM-1.3              | **Step repetition / duplicated work**                                           | System design            | **15.7%**                | No (cost/trace only)                    | MAST                                        |
| FM-1.4              | Loss of conversation history                                                    | System design            | 2.8%                     | Partly                                  | MAST                                        |
| FM-1.5              | Unaware of termination conditions                                               | System design            | 12.4%                    | No                                      | MAST                                        |
| FM-2.1              | Conversation reset                                                              | Inter-agent misalignment | 2.2%                     | No                                      | MAST                                        |
| FM-2.2              | Fail to ask for clarification                                                   | Inter-agent misalignment | 6.8%                     | Partly                                  | MAST                                        |
| FM-2.3              | Task derailment                                                                 | Inter-agent misalignment | 7.4%                     | Partly                                  | MAST                                        |
| FM-2.4              | Information withholding                                                         | Inter-agent misalignment | 0.85%                    | No                                      | MAST                                        |
| FM-2.5              | Ignored other agent's input                                                     | Inter-agent misalignment | 1.9%                     | No                                      | MAST                                        |
| FM-2.6              | **Reasoning–action mismatch**                                                   | Inter-agent misalignment | **13.2%**                | No                                      | MAST                                        |
| FM-3.1              | Premature termination                                                           | Task verification        | 6.2%                     | Partly                                  | MAST                                        |
| FM-3.2              | No / incomplete verification                                                    | Task verification        | 8.2%                     | No                                      | MAST                                        |
| FM-3.3              | Incorrect verification                                                          | Task verification        | 9.1%                     | No                                      | MAST                                        |
| **Category totals** | System design 44.0% · Inter-agent misalignment 32.35% · Task verification 23.5% |                          |                          |                                         | MAST v3                                     |
| P-A                 | Environment / platform quirks                                                   | Production silent        | 22 incidents / 8 wks     | No                                      | [Wu 2026](https://arxiv.org/abs/2606.14589) |
| P-B                 | Design-assumption mismatch                                                      | Production silent        | ibid.                    | No                                      | ibid.                                       |
| P-C                 | Error swallowing / dilution                                                     | Production silent        | ibid.                    | No                                      | ibid.                                       |
| P-D                 | **Chained hallucination → fail-plausible**                                      | Production silent        | ibid.; meta-pattern ≥28× | **No — output looks better, not worse** | ibid.                                       |
| P-E                 | Operational omission / forensic blind spot                                      | Production silent        | ibid.; latency 13h–60d   | No                                      | ibid.                                       |

Nine of the 14 MAST modes are **invisible in final output**, and they account for roughly 60% of observed failures by frequency. Class P-D is worse than invisible: it makes output score _higher_.

---

## Direct comparison to BuildOS

Phase A scores final output quality on 9 blind pairs across 3 read-only research scenarios, plus route accuracy over 72 calls, plus cost/latency bounds and hard safety gates.

**What Phase A would catch:**

| Mode                             | How                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------- |
| FM-1.1 disobey task spec         | `acceptance_checks` (required validators) + judge `constraint_adherence`         |
| FM-3.1 premature termination     | Judge `completeness`; required-check failures                                    |
| Unresolvable / invalid citations | Code-enforced citation validation (a real strength — most systems don't do this) |
| Gross safety breaches            | Hard gates: cross-project access, mutation tools, receipt coverage               |
| Cost/latency blowup              | Pre-registered 3× cost and 2× duration bounds                                    |

**What Phase A would NOT catch:**

| Mode                                                    | Why it escapes                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FM-1.3 duplicated work (15.7%)**                      | Two researchers covering the same ground still produce a good synthesis. Only the 3× cost bound would notice, and it is loose enough to absorb substantial duplication. This is precisely Anthropic's 2021-chip-crisis failure.                                                                                                  |
| **FM-2.6 reasoning–action mismatch (13.2%)**            | Requires trace-level scoring. Phase A scores no traces.                                                                                                                                                                                                                                                                          |
| **FM-1.5 termination-condition unawareness (12.4%)**    | Bounded budgets mask it; a truncated-but-fluent report scores fine.                                                                                                                                                                                                                                                              |
| FM-3.2 / 3.3 verification failures (17.3%)              | Judges score whether the answer _reads_ verified, not whether it _was_.                                                                                                                                                                                                                                                          |
| FM-2.2 fail to ask for clarification                    | One `ambiguous` scenario exists, but in the routing lane only — the workflow lane never tests mid-run clarification.                                                                                                                                                                                                             |
| **P-D fail-plausible fabrication**                      | Citation validation checks _resolvability_, not _support_. A fluent synthesis citing real URLs that don't support its claims wins blind pairs. Judges reward the exact surface this failure produces.                                                                                                                            |
| **Everything write-heavy**                              | This is the structural gap. Cognition, Anthropic, and Claude's own guidance all converge on: multi-agent is safe when writes stay single-threaded and subagents are read-only. Phase A tests _only_ that regime. A Phase A "Go" carries near-zero information about the write-heavy staged-mutation work BuildOS actually wants. |
| Error compounding over long horizons                    | Receding-horizon planning over ≤2 stages; no long-run degradation measured.                                                                                                                                                                                                                                                      |
| Contention, joins, replanning, permissions-at-execution | Explicitly out of Phase A scope, and these are where MAST's system-design category (44%) concentrates.                                                                                                                                                                                                                           |
| Orchestrator capability gap                             | Route accuracy is measured, but _delegation quality_ — whether the CEO writes good assignments — is never scored. Cognition's SWE-1.5 failure is exactly this.                                                                                                                                                                   |

**The statistical threat, stated numerically.** Under a null of no architectural difference and no ties, the probability that 9 fair coin flips yield ≥6 wins is 130/512 ≈ **25%**. The secondary gate (≥3/6 on C06+C08) passes under the same null at 42/64 ≈ **66%**. Ties push these down somewhat, and DJ-vs-panel agreement adds a validity check — but the primary decision rule is one that pure chance clears roughly one run in four. Meanwhile Kaliyev & Maryanskyy needed **two n=100 seeds** and still could not separate a +18pp single-seed effect from noise. Phase A's effective sample is 3 scenarios × 3 correlated repetitions, one of which (C07) has a crashed control lane. The doc's own instinct — _"a marginal result is a stop, not a go"_ — is correct and should be enforced harder than the written bounds enforce it.

**The confound.** Control runs `deepseek-v4-flash` on the `balanced` profile. The workflow lane runs DeepSeek V4 Pro researchers plus GLM 5.2 synthesis on `powerful`, at up to 3× the cost. If the workflow wins, the parsimonious explanation is **model tier and token budget, not architecture** — the exact confound Anthropic flags when it says token usage explains 80% of BrowseComp variance, and the exact one Tran & Kiela control for when single-agent then matches or beats every topology. The deferred lanes (sequential single-agent baseline, CEO fast-lane) are the controls that make the experiment interpretable. Deferring them to Phase B means Phase A cannot answer its own question.

---

## A falsification lens for BuildOS

**Add before scoring anything:**

1. **A null lane.** Run workflow-vs-workflow blind pairs with identical config. Whatever spread that produces is your local noise floor. Any workflow-vs-control margin inside it is not a result. This is the Kaliyev/Maryanskyy protocol and it is cheap.
2. **A matched-compute single-agent arm.** Same models, same token budget, one agent, sequential. Undefer it. If the workflow lane does not beat this, the architecture contributed nothing.
3. **A prompt-only arm.** Single agent, Librarian's deterministic context packet pasted inline, no orchestration. Per Dennis et al., this ties orchestration on procedural work at 1.2–1.7× fewer calls. If it ties here, the value is the Librarian, and the CEO is overhead.

**Add to measurement:**

4. **Score traces against the MAST table above**, not just outputs. Minimum: FM-1.3 (do researcher outputs overlap?), FM-2.6, FM-3.2/3.3, FM-1.5.
5. **Citation _support_, not resolvability.** Sample N claims per report; verify the cited source actually supports the claim. This is the only instrument that detects P-D fail-plausible.
6. **Report cost-normalized quality.** Win rate at matched token spend, not win rate at 3× spend.
7. **Score the held-out 5 before anything else.** The frozen eight are a burned corpus; 58/72 on burned data is the optimistic estimate.
8. **Publish `forcedTransitions` as a headline number.** If nearly all transitions are code-forced, the honest claim is "a deterministic workflow engine helps," which is a good and different result from "an agent-first orchestrator helps."

**What would mean the bet is wrong — in the order it will show up:**

| Rank | Signal                                                                            | Reading                                                                                    |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1    | Cost or latency bound fails while quality is a wash                               | The 3–10× multiplier is real and there's no offsetting gain                                |
| 2    | Held-out route accuracy < frozen-corpus accuracy                                  | The router generalizes worse than measured; every downstream number is gated on a bad root |
| 3    | Null lane (workflow-vs-workflow) spread ≥ workflow-vs-control margin              | The headline is noise                                                                      |
| 4    | Workflow ties matched-compute single agent                                        | Architecture contributes nothing; the win was model tier                                   |
| 5    | Workflow ties the prompt-only Librarian arm                                       | Deterministic retrieval is the value; drop the orchestrator, keep the Librarian            |
| 6    | Panel-vs-DJ agreement < 7/9                                                       | The quality signal itself is unstable — no verdict is available at this n                  |
| 7    | Trace scoring shows FM-1.3 / FM-2.6 above ~10% while judges still prefer workflow | Judges are scoring prose, not work                                                         |
| 8    | Citation-support sampling finds fabricated support                                | P-D is live; the system is optimizing for fail-plausible output                            |

**A "Go" that should still be treated as a Stop:** ≥6/9 wins, achieved at 2.5× cost, on read-only scenarios, without a matched-compute baseline, on a burned route corpus. That result is consistent with "we bought a better model."

---

## Open questions this research could not answer

1. **No evidence exists for BuildOS's actual domain.** Every measured comparison found is coding, math, multi-hop QA, or web research. Nothing measures multi-agent vs single-agent on personal project-context / productivity work over a user's own structured data.
2. **How much of Anthropic's 90.2% is architecture vs budget** is not decomposed anywhere public. Their own BrowseComp variance finding makes this the central unknown in the strongest pro-multi-agent datapoint.
3. **MAST's frequencies are from 2024–25-era frameworks** (ChatDev, AG2, HyperAgent) and models (GPT-4, Claude 3, Qwen2.5, CodeLlama). How much survives at frontier is untested. Secondary sources report the category split as 42/37/21; arXiv v3 reports 44.0/32.35/23.5 — I could not reconcile which the NeurIPS camera-ready carries.
4. **Self-Manager's margin over baselines** is not quantified in its abstract; "outperforms across all metrics" is unverified as to size.
5. **No controlled study of orchestrator model size vs delegation quality** exists. Cognition's SWE-1.5 report is a single uncontrolled anecdote — and it is the closest thing to a direct test of BuildOS's "small CEO" premise.
6. **No source measures whether code-enforced citation validation reduces fail-plausible rates.** BuildOS may be doing something genuinely ahead of the literature here, which also means it is unvalidated.

---

## Confidence

**High confidence (multiple independent primary sources, measured):**

- Multi-agent costs 3–15× single-agent tokens.
- Most MAS failures are system-design/coordination, not model quality; 41–86.7% failure rates on open-source MAS; targeted fixes are partial.
- Under matched compute, single-agent matches or beats multi-agent on multi-hop reasoning and on debate-style ensembling; where multi-agent wins at equal compute the margins are 1.3–2.7pp.
- Breadth-first, read-only, context-exceeding research is a genuine multi-agent win regime.
- Write-heavy and dependency-heavy work is the losing regime; both camps agree.
- Most MAST failure modes are invisible in final output.

**Medium confidence:**

- The specific noise-floor envelope [-3,+18]pp generalizes beyond Claude Haiku 4.5 / τ²-bench retail. The _methodological point_ (establish a null lane) is high confidence; the _specific magnitude_ is one paper on one model.
- Dennis et al.'s 1.2–1.7× orchestration overhead figure — extracted from a partially-parsed PDF; directionally corroborated by Anthropic's guidance but the exact numbers warrant a re-read of the source.
- The MAST per-mode percentages as they appear in the final camera-ready.

**Low confidence / explicitly unverified:**

- Any claim about how these findings transfer to BuildOS's ontology-over-user-project-data domain.
- Whether frontier-model improvements since early 2025 have materially shrunk MAST's failure rates.
