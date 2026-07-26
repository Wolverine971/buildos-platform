<!-- docs/architecture/agent-first-orchestration/research/01_FRONTIER_LAB_DOCTRINE.md -->

# Frontier Lab Doctrine — Orchestrator + Subagent Architectures and How to Evaluate Them

**Researcher chapter 01** · Compiled 2026-07-25 · Compared against `00_SYSTEM_UNDER_REVIEW.md`

---

## Scope

**Covered.** Primary published material from Anthropic, OpenAI, and Google on (a) single-agent
vs. orchestrator+subagent architecture decisions, (b) the delegation contract, (c) result-return
mechanics, (d) parallelism and effort scaling, (e) reported cost multiples, (f) agent evaluation
methodology, and (g) production failure modes and deployment. Nine primary sources, all fetched and
read directly — not summarized from memory. Publication dates span Dec 2024 → Jan 2026.

**Deliberately not covered.** Academic multi-agent literature (arXiv), agent frameworks from
non-labs (LangGraph, CrewAI, AutoGen), observability vendors (Braintrust, LangSmith, Confident AI),
and benchmark papers (SWE-bench, GAIA, τ-bench). Those belong in other chapters. I also did not
cover Anthropic's Agent Skills material or MCP specification, which bear on tool packaging rather
than orchestration topology.

**Not found / omitted.** I could not locate a _primary_ frontier-lab document that prescribes how to
evaluate a **multi-agent** system as distinct from a single agent. Anthropic's own eval post says so
explicitly (see Findings §6.7). Any claim below about multi-agent eval methodology is therefore an
extrapolation, and is labeled as such.

---

## Key sources

| Source                                                | Org       | Date                  | Why it matters                                                                                                                 | URL                                                                                                                 |
| ----------------------------------------------------- | --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Building effective agents                             | Anthropic | 2024-12-19            | Canonical workflow-vs-agent taxonomy; "simplest solution possible" doctrine                                                    | https://www.anthropic.com/engineering/building-effective-agents                                                     |
| How we built our multi-agent research system          | Anthropic | 2025-06-13            | The most specific published prescription for orchestrator→subagent delegation, effort scaling, and agent eval                  | https://www.anthropic.com/engineering/multi-agent-research-system                                                   |
| Writing effective tools for AI agents—using AI agents | Anthropic | 2025-09-11            | Concrete eval-harness mechanics (agentic loops, verifiable responses, metrics)                                                 | https://www.anthropic.com/engineering/writing-tools-for-agents                                                      |
| Effective context engineering for AI agents           | Anthropic | 2025-09-29            | Sub-agent architecture as a _context_ strategy; just-in-time vs pre-loaded retrieval                                           | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents                                   |
| Demystifying evals for AI agents                      | Anthropic | 2026-01-09            | The single most directly relevant source: sample sizes, outcome-vs-transcript, pass@k/pass^k, judge calibration, anti-patterns | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents                                              |
| When to use multi-agent systems (and when not to)     | Anthropic | 2026-01-23            | Revised, more conservative multi-agent doctrine + updated token multiples                                                      | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them                                       |
| Create custom subagents (Claude Code docs)            | Anthropic | live docs             | What a shipped subagent contract actually looks like in production                                                             | https://code.claude.com/docs/en/sub-agents                                                                          |
| Develop test cases (Claude platform docs)             | Anthropic | live docs             | "Prioritize volume over quality" eval design principle                                                                         | https://platform.claude.com/docs/en/test-and-evaluate/develop-tests                                                 |
| A practical guide to building agents (PDF, 34pp)      | OpenAI    | 2025 (undated in doc) | Manager vs decentralized patterns; agent-splitting heuristics; guardrails; near-silence on evals                               | https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf                       |
| Orchestrating multiple agents (Agents SDK docs)       | OpenAI    | live docs             | "Orchestrating via code makes tasks more deterministic and predictable"                                                        | https://openai.github.io/openai-agents-python/multi_agent/                                                          |
| Graders / Trace grading (API docs)                    | OpenAI    | live docs             | Grader taxonomy; trace grading definition                                                                                      | https://developers.openai.com/api/docs/guides/graders · https://developers.openai.com/api/docs/guides/trace-grading |
| Evaluate Gen AI agents (Vertex/Gemini Enterprise)     | Google    | live docs             | Ships _trajectory_ metrics as first-class — the main lab disagreement                                                          | https://docs.cloud.google.com/gemini-enterprise-agent-platform/optimize/evaluation/agent-evaluation                 |
| Workflows (ADK 2.0 docs)                              | Google    | live docs             | Graph / dynamic / collaborative / template workflow taxonomy                                                                   | https://adk.dev/workflows/                                                                                          |

---

## Findings

### 1. All three labs say: start with one agent. Multi-agent is a last resort, not a default.

Anthropic's December 2024 framing is the root of the doctrine: _"When building applications with
LLMs, we recommend finding the simplest solution possible, and only increasing complexity when
needed"_ and _"you should consider adding complexity only when it demonstrably improves outcomes"_
([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).

By January 2026 Anthropic had sharpened this into a warning: _"Teams invest months building
elaborate multi-agent architectures only to discover that improved prompting on a single agent
achieved equivalent results"_, and _"Outside these situations, the coordination costs typically
exceed the benefits"_
([When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).

The three stated conditions where multi-agent _consistently_ outperforms: **context protection**
(subtask output pollutes downstream context), **parallelization** (genuinely independent pieces), and
**specialization** (different tool sets / system prompts). Concrete outgrowth signals given:
approaching context limits, and an agent carrying **15–20+ tools**.

OpenAI is directionally identical but gives different thresholds: _"Our general recommendation is to
maximize a single agent's capabilities first."_ Split on **complex logic** (_"When prompts contain
many conditional statements (multiple if-then-else branches)"_) or **tool overload** — but with the
caveat _"The issue isn't solely the number of tools, but their similarity or overlap. Some
implementations successfully manage more than 15 well-defined, distinct tools while others struggle
with fewer than 10 overlapping tools"_
([A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf), p.16).

**Where multi-agent is explicitly wrong** (Anthropic, June 2025): _"domains that require all agents
to share the same context or involve many dependencies between agents"_, and _"most coding tasks
involve fewer truly parallelizable tasks."_ The Jan 2026 post names the failure mode: _"Each handoff
loses context"_ — the "telephone game problem," where _"agents spend more tokens on coordination
than on actual work."_ Its prescribed decomposition rule is **context-centric**: _"an agent handling
a feature should also handle its tests, because it already possesses the necessary context."_

### 2. The delegation contract is four fields, and it is the most-cited prescription in the corpus

Anthropic's multi-agent post is unambiguous: _"Each subagent needs an objective, an output format,
guidance on the tools and sources to use, and clear task boundaries."_ The failure mode is named:
without this, _"subagents duplicate work, leave gaps, or fail to find necessary information."_

They also flag emergent coupling: _"Small changes to the lead agent can unpredictably change how
subagents behave,"_ and therefore _"the best prompts for these agents are not just strict
instructions, but frameworks for collaboration."_

OpenAI has two shapes rather than one contract. **Manager (agents-as-tools)** — _"ideal for
workflows where you only want one agent to control workflow execution and have access to the
user."_ **Decentralized (handoffs)** — _"Handoffs are a one way transfer… we immediately start
execution on that new agent that was handed off to while also transferring the latest conversation
state."_ Note that the OpenAI handoff transfers **full conversation state**, which is the opposite
of Anthropic's bounded-assignment model. The SDK docs draw the line by ownership: agents-as-tools
_"when a specialist should help with a bounded subtask but should not take over the user-facing
conversation"_; handoffs _"when routing itself is part of the workflow."_

### 3. Results come back as a distilled summary — never a transcript

This is the most consistent finding across sources. Anthropic's context-engineering post gives a
number: _"Each subagent might explore extensively, using tens of thousands of tokens or more, but
returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)."_ The purpose is
_"a clear separation of concerns—the detailed search context remains isolated within sub-agents,
while the lead agent focuses on synthesizing and analyzing the results."_

Claude Code's shipped implementation matches: _"the subagent does that work in its own context and
returns only the summary"_; with nesting enabled, _"Only the top-level subagent's summary returns to
you."_ Subagents start clean — _"It doesn't see your conversation history, the skills you've already
invoked, or the files Claude has already read."_ The Jan 2026 post generalizes it as a rule: _"Inject
compact summary, not full context."_

Google ADK is the exception in mechanism, not spirit: sub-agent output is written to shared session
state under an `output_key` and read by the next agent, i.e. structured hand-off rather than prose.

### 4. Effort scales to complexity, and the labs publish actual numbers

Anthropic embeds explicit scaling rules **in the orchestrator prompt**:

> "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4
> subagents with 10-15 calls each, and complex research might use more than 10 subagents with
> clearly divided responsibilities."

Fan-out width: _"the lead agent spins up 3-5 subagents in parallel rather than serially"_ and
_"the subagents use 3+ tools in parallel"_ — two levels of parallelism, credited with cutting
research time _"by up to 90% for complex queries."_ A stated limitation remains: _"Our lead agents
execute subagents synchronously, waiting for each set of subagents to complete before proceeding.
This simplifies coordination, but creates bottlenecks."_

Claude Code enforces width in code rather than prompt: nesting is **off by default**
(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), plus a session-wide subagent cap.

### 5. Cost multiples — and the labs contradict each other

| Claim                                                                           | Source                             | Date    |
| ------------------------------------------------------------------------------- | ---------------------------------- | ------- |
| Agents use ~**4×** more tokens than chat                                        | Anthropic multi-agent post         | 2025-06 |
| Multi-agent uses ~**15×** more tokens than chat                                 | Anthropic multi-agent post         | 2025-06 |
| Multi-agent uses **3–10×** more tokens than _single-agent_ for equivalent tasks | Anthropic, when-to-use-multi-agent | 2026-01 |

These are not the same denominator (chat vs single-agent), but they are also not reconcilable into
one number: 15×-vs-chat ÷ 4×-vs-chat ≈ 3.75× vs single-agent, which sits at the _bottom_ of the
later 3–10× band. Treat **3–10× vs a single agent** as the current published expectation, with ~4×
as an optimistic floor achieved on a heavily-tuned research workload.

On latency the Jan 2026 post corrects a common assumption: _"While parallelism helps reduce total
execution time compared to running all that work sequentially, multi-agent systems often take longer
overall than single-agent systems because of the sheer increase in total computation."_

The performance claim on the other side of the ledger: _"Multi-agent system with Claude Opus 4 as
the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2%"_ on
their internal research eval. Note this compares a **stronger-model orchestrator + cheaper
subagents** against a single instance of the strong model — a configuration difference, not a pure
architecture difference.

### 6. Evaluation doctrine

**6.1 Sample size.** Anthropic's eval post: _"20-50 simple tasks drawn from real failures is a great
start."_ The multi-agent post used _"a set of about 20 queries representing real usage patterns."_
The rationale for small n early: _"in early agent development, each change to the system often has a
clear, noticeable impact, and this large effect size means small sample sizes suffice."_ The platform
docs push the other way for mature evals: _"Prioritize volume over quality: More questions with
slightly lower signal automated grading is better than fewer questions with high-quality human
hand-graded evals."_

**6.2 Start immediately.** _"Start with small-scale testing right away with a few examples, rather
than delaying until you can build more thorough evals"_ (multi-agent post). _"Evals get harder to
build the longer you wait"_ (eval post).

**6.3 Grade the outcome, not the path.** This is Anthropic's strongest and most repeated eval claim:

> "There is a common instinct to check that agents followed very specific steps like a sequence of
> tool calls in the right order. We've found this approach too rigid and results in overly brittle
> tests, as agents regularly find valid approaches that eval designers didn't anticipate. So as not
> to unnecessarily punish creativity, it's often better to grade what the agent produced, not the
> path it took."

And from the multi-agent post: _"Even with identical starting points, agents might take completely
different valid paths… we usually can't just check if agents followed the 'correct' steps we
prescribed in advance."_

**Google disagrees.** Vertex/Gemini Enterprise ships trajectory metrics as first-class — exact
match, in-order match, any-order match, precision, recall, single-tool-use — alongside final-response
metrics, plus default `latency` and `failure`. Reference-based trajectory metrics require a
ground-truth reference trajectory per case. This is a genuine methodological split: Google
operationalizes path-matching; Anthropic warns it produces brittle tests. Google's own docs also
support reference-free autoraters, so the two are reconcilable in practice as "trajectory metrics
are diagnostic, not the pass gate."

**6.4 Judges.** The multi-agent post found _"a single LLM call with a single prompt outputting
scores from 0.0-1.0 and a pass-fail grade was the most consistent"_, rubric criteria: **factual
accuracy, citation accuracy, completeness, source quality, tool efficiency**. The Jan 2026 eval post
refines this toward _decomposition_: use _"clear, structured rubrics to grade each dimension of a
task"_ with **isolated LLM judges per dimension** rather than one judge grading everything, and
_"LLM-as-judge graders should be closely calibrated with human experts."_ Anthropic's platform docs
add: _"Generally best practice to use a different model to evaluate than the model used to generate
the evaluated output."_ OpenAI's grader taxonomy (string check, text similarity, score model, Python,
multigrader) frames the same split — programmatic for deterministic criteria, model-graded _"for
rich, open-ended answers"_ — with an explicit warning about **reward hacking** against weak graders.

**6.5 Non-determinism.** Anthropic prescribes running **multiple trials** and reporting both
**pass@k** (_"likelihood that an agent gets at least one correct solution in k attempts"_) and
**pass^k** (_"probability that all k trials succeed"_). Use pass^k when _"consistency is
essential"_ for customer-facing agents. Their chart shows the two diverging sharply by k=10.

**6.6 Environment isolation.** _"Each trial should be 'isolated' by starting from a clean
environment. Unnecessary shared state between runs (leftover files, cached data, resource
exhaustion) can cause correlated failures."_ With a real leak example: _"we observed Claude gaining
an unfair advantage on some tasks by examining the git history from previous trials."_

**6.7 Capability vs regression suites.** Capability evals _"should start at a low pass rate,
targeting tasks the agent struggles with."_ Regression evals _"should have a nearly 100% pass rate."_
Passing capability tasks _"graduate"_ into the regression suite.

**6.8 Anti-patterns Anthropic names.** (a) _"One-sided evals create one-sided optimization"_ —
class-imbalanced sets produce agents that over- or under-trigger. (b) _"With frontier models, a 0%
pass rate across many trials… is most often a signal of a broken task, not an incapable agent."_
(c) _"As a rule, we do not take eval scores at face value until someone digs into the details of the
eval and reads some transcripts."_ (d) Graders must be _"resistant to bypasses or hacks."_ They cite
Opus 4.5 scoring 42% on CORE-Bench purely from grading bugs, jumping to 95% after fixes.

**6.9 Eval harness mechanics.** From the tools post: run evals _"programmatically with direct LLM API
calls. Use simple agentic loops (`while`-loops wrapping alternating LLM API and tool calls): one loop
for each evaluation task."_ Collect _"top-level accuracy," "total runtime," "total number of tool
calls," "total token consumption,"_ and _"tool errors."_ Each prompt _"should be paired with a
verifiable response or outcome,"_ while avoiding _"overly strict verifiers that reject correct
responses due to spurious differences like formatting."_

**6.10 A gap worth naming.** OpenAI's 34-page flagship agent guide contains essentially no
evaluation methodology — one line, _"Set up evals to establish a performance baseline"_ (p.8). Its
substantive reliability content is **guardrails** (relevance/safety classifiers, PII filter,
moderation, rules-based, tool risk ratings low/medium/high, output validation) and **human
intervention** on two triggers: _"Exceeding failure thresholds"_ and _"High-risk actions."_ Anthropic
has no comparably systematic guardrail taxonomy; OpenAI has no comparable eval methodology. The two
corpora are complements, not competitors.

### 7. Production failure modes

Anthropic's multi-agent post is the only primary source that reports what actually broke:

- **Error compounding.** _"One step failing can cause agents to explore entirely different
  trajectories, leading to unpredictable outcomes."_
- **Statefulness + resumability.** _"We can't just restart from the beginning: restarts are expensive
  and frustrating for users. Instead, we built systems that can resume from where the agent was when
  the errors occurred."_
- **Rainbow deployments.** _"Whenever we deploy updates, agents might be anywhere in their process…
  we use rainbow deployments to avoid disrupting running agents, by gradually shifting traffic from
  old to new versions while keeping both running simultaneously."_
- **Full tracing.** _"Adding full production tracing let us diagnose why agents failed and fix issues
  systematically"_ — while monitoring _"agent decision patterns and interaction structures—all
  without monitoring the contents of individual conversations."_

### 8. Deterministic control flow is the consensus safety valve

OpenAI Agents SDK: _"Orchestrating via code makes tasks more deterministic and predictable, in terms
of speed, cost and performance."_ Anthropic: workflows _"offer predictability and consistency for
well-defined tasks, whereas agents are the better option when flexibility and model-driven
decision-making are needed at scale."_ Google ADK 2.0 ships four workflow shapes — graph, dynamic,
collaborative (LLM coordinator over sub-agents), and template (sequential/loop/parallel) — with
template workflows explicitly for _"more controlled task execution flow."_ Every lab offers a
code-orchestrated escape hatch and recommends it wherever the topology is knowable.

---

## Direct comparison to BuildOS

| Dimension                                          | What the labs do                                                                                              | What BuildOS does                                                                                                      | Verdict                                                                                                     | Rough cost to change                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Single-agent baseline as control                   | Anthropic: the thing that usually wins is _"improved prompting on a single agent"_                            | Control = existing production context-heavy agent. A **sequential single-agent baseline lane was deferred to Phase B** | **BuildOS behind** — the control the labs name as the real rival isn't in the experiment                    | Medium: one more lane, ~3 runs × 3 scenarios               |
| Delegation contract                                | objective + output format + tool/source guidance + task boundaries                                            | Immutable bounded assignments; manifests define context/skills/tools/permissions/**result contract**                   | **matched → BuildOS ahead** (typed result contract > prose output-format instruction)                       | —                                                          |
| Result return                                      | 1,000–2,000-token distilled summary; only summary reaches parent                                              | Typed, versioned **artifacts**, bounded digest; explicitly "artifacts over transcripts"                                | **BuildOS ahead**                                                                                           | —                                                          |
| Effort scaling                                     | Prompt-level rules: 1 agent / 2–4 subagents / >10                                                             | 4 routes; topology derived in **code** from observable request features                                                | **matched**, mechanism differs (BuildOS more deterministic)                                                 | —                                                          |
| Fan-out cap                                        | 3–5 parallel subagents; Claude Code caps depth + session total in code                                        | `Promise.all` over compiled stage; no stated width cap                                                                 | **BuildOS behind** (minor)                                                                                  | Trivial: one constant + a test                             |
| Cost budget                                        | 3–10× single-agent tokens is _normal_                                                                         | Bound = **≤3× control model cost**                                                                                     | **BuildOS behind** — the bound sits at the extreme optimistic edge of published reality                     | Cheap to change, expensive to be wrong about               |
| Latency budget                                     | _"multi-agent systems often take longer overall"_                                                             | Bound = ≤2× control p50/p95                                                                                            | **BuildOS behind** — same problem                                                                           | Cheap                                                      |
| Eval task count                                    | 20–50 tasks; ~20 queries in the shipped research eval                                                         | **8 scenarios**; comparison lane = **3 scenarios × 3 runs**                                                            | **BuildOS behind** — under half the low end; comparison verdict rests on 3 tasks                            | Medium: corpus extraction is the work already proven in A0 |
| Trials + non-determinism                           | pass@k **and** pass^k; multiple trials per task                                                               | 9 route calls/scenario scored individually; aggregate 58/72 threshold                                                  | **BuildOS behind** on reporting — an aggregate hides per-scenario collapse                                  | Trivial: recompute from existing result JSON               |
| Outcome vs trajectory                              | Anthropic: grade the product, not the path. Google: ships trajectory metrics too                              | Blind A/B on end responses + machine acceptance checks; `forcedTransitions` counted                                    | **matched** (and correctly on Anthropic's side of the split)                                                | —                                                          |
| Judge design                                       | Single call, 0–1 + pass/fail (2025) → **isolated judge per dimension** (2026); different model than generator | 3 pinned judges × 5 dimensions + preference **in one call each**                                                       | **matched-ish, one gap**: multi-dimension-in-one-call is what the Jan 2026 post advises against             | Low: split the judge prompt                                |
| Judge calibration                                  | _"closely calibrated with human experts"_                                                                     | Human scores **all 9 pairs blind, before** the panel; ≥7/9 agreement gate; invalidation rule                           | **BuildOS ahead** — ordering is stronger than anything published                                            | —                                                          |
| Grader hardening                                   | _"resistant to bypasses or hacks"_; programmatic where possible                                               | Required acceptance checks **veto** a workflow win regardless of judge preference                                      | **BuildOS ahead**                                                                                           | —                                                          |
| Held-out set                                       | Not prescribed in any primary source; saturation + leakage warned about                                       | Contamination self-caught after 4 tuning passes; held-out corpus frozen — **unscored**                                 | **BuildOS ahead in design, incomplete in execution**                                                        | Trivial: run it                                            |
| Environment isolation                              | _"Each trial should be 'isolated'… clean environment"_                                                        | SHA-256-pinned frozen snapshot; prompt/world-card/model/corpus/blind-mechanic all hashed                               | **BuildOS ahead**                                                                                           | —                                                          |
| 0%-pass diagnosis                                  | _"a 0% pass rate… is most often a signal of a broken task"_                                                   | C07 control crashed 3/3 → quarantined and reported separately                                                          | **matched, with a caveat** — the doctrine says fix the harness, not partition the score                     | Low                                                        |
| Capability vs regression framing                   | Capability evals start low; regression evals ~100%                                                            | Routing gate is 90.3% — a regression-grade bar on a not-yet-built capability                                           | **novel — unproven** (defensible as a ship gate, mislabeled as a capability eval)                           | Free (relabel)                                             |
| Pre-registered Go/Change/Stop                      | Not published by any lab                                                                                      | Frozen bounds + run-validity rule + "a marginal result is a stop, not a go"                                            | **novel — unproven, and the best thing in the design**                                                      | —                                                          |
| Counterbalanced blind A/B                          | Not published by any lab                                                                                      | Hash-pinned structural mapping; v1 replaced for confounding                                                            | **novel — unproven**                                                                                        | —                                                          |
| Context strategy                                   | _"just in time"_ retrieval + hybrid; light identifiers loaded on demand                                       | Librarian pre-builds a deterministic context packet from a frozen snapshot                                             | **novel — unproven** (opposite of the stated default; defensible as the hybrid's "up front for speed" half) | —                                                          |
| Durability, resumability, rainbow deploys, tracing | All four named as the things that broke in production                                                         | All explicitly out of Phase A scope                                                                                    | **matched as planned** — but see prose below                                                                | High (that's Phase B)                                      |
| Guardrails / risk-tiered tools / HITL              | OpenAI: risk ratings gate high-risk calls; escalate on failure thresholds                                     | Progressive autonomy read→propose→stage→review→commit; least privilege; mutation-call = hard Stop                      | **matched → BuildOS ahead**                                                                                 | —                                                          |

**The three things that matter most.**

_First, the control is the wrong control._ Anthropic's January 2026 post exists specifically because
teams keep beating elaborate multi-agent systems with a better-prompted single agent. BuildOS's
control lane is the incumbent production agent — which answers "is the new thing better than what we
ship today?" but not "is the _architecture_ the reason?" The deferred sequential single-agent
baseline is precisely the lane that would separate architecture from prompt quality, and it is the
one that got cut. A Go verdict without it is a verdict about a pipeline, not about agent-first
orchestration. This is the highest-leverage fix and it is not expensive.

_Second, the cost and latency bounds are set below observed reality._ 3× model cost and 2× latency
are tighter than the 3–10× token range Anthropic reports as typical, against a lab explicitly saying
multi-agent _"often take longer overall."_ A "Change" verdict triggered by a cost bound may be
measuring the bound, not the architecture. That does not mean loosen it — BuildOS may legitimately
need a 3× ceiling to be viable — but the bound should be documented as a **product constraint**, not
as a hypothesis about model behavior, because failing it says nothing about whether the architecture
works.

_Third, n=3 scenarios cannot carry the comparison verdict._ Nine blind pairs is nine, but they are
drawn from three tasks; with C07 quarantined, effectively two. Anthropic's floor is 20–50 tasks.
Scaling the comparison corpus to ~15–20 complex scenarios costs one more A0-style extraction pass and
converts the strongest part of this design — the pre-registered rule and the blind panel — from
suggestive to decisive. Adding per-scenario pass^k reporting from the existing 72 route calls is
nearly free and would immediately reveal whether 58/72 is broad mediocrity or two collapsed scenarios.

---

## Open questions this research could not answer

1. **No lab publishes a multi-agent eval methodology.** Anthropic's eval post states multi-agent
   evaluation is future work: _"As agents take on longer tasks, collaborate in multi-agent systems…
   we will need to adapt our techniques."_ Whether the ≥6/9-wins framing is right is unresolved by
   the literature, not just by me.
2. **How Anthropic's 90.2% research-eval improvement was computed** — the denominator, the judge,
   and whether the model-tier asymmetry (Opus lead + Sonnet subagents vs Opus alone) was controlled
   for. Not published.
3. **What the labs consider an acceptable judge-vs-human agreement rate.** Anthropic says calibrate
   frequently; no threshold is given anywhere I could find. BuildOS's ≥7/9 (78%) is unbenchmarked.
4. **Whether anyone runs blind pairwise A/B with a human anchor for agent architecture decisions.**
   Nothing in the primary corpus does this. It may be common internally and unpublished.
5. **Google's position on trajectory-vs-outcome** — the docs ship both but do not argue for
   trajectory gating; I could not find Google prose that engages Anthropic's brittleness critique.
6. **Cost-per-run economics at BuildOS's scale.** All published multiples are token ratios; none
   address whether a 3× ceiling is achievable with a code-heavy router, which is BuildOS's actual bet.

---

## Confidence

**Verified — read directly from the primary source.** Every quotation in Findings §1–8 and every URL
in Key sources. Publication dates and authors for the five Anthropic engineering posts. The OpenAI
guide was extracted from the PDF locally (`pdftotext`) after the fetch tool failed on it, so its
quotes are from the actual document text, including page numbers. Google's trajectory-metric list
came through a secondary search summary corroborated by the primary Gemini Enterprise evaluation
page, which confirmed the two categories and the default latency/failure metrics but did not render
the six individual metric definitions — **treat the individual Google metric names as
partially verified**.

**Inferred, not stated by any lab.**

- The reconciliation of 15×-vs-chat with 3–10×-vs-single-agent is my arithmetic, not Anthropic's.
- The claim that Google and Anthropic "disagree" on trajectory metrics is my reading of two
  independent documents; neither cites the other.
- Every verdict in the comparison table is my judgment applied to `00_SYSTEM_UNDER_REVIEW.md`. I did
  not read BuildOS code — the description of BuildOS is taken entirely from that brief and I did not
  verify that the harness behaves as documented.
- The "novel — unproven" labels mean _I found no published lab precedent_, not that none exists;
  absence of publication is weak evidence.

**Explicitly not claimed.** I found no primary source prescribing pre-registered decision rules,
counterbalanced blind assignment, human-before-judge scoring order, or machine-check vetoes over
judge preference for agent architecture decisions. I am not asserting BuildOS invented these — only
that the frontier labs have not published them, so BuildOS is operating without external validation
in exactly the places its harness is most rigorous.
