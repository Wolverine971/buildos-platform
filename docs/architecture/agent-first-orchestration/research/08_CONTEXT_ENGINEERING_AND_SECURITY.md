<!-- docs/architecture/agent-first-orchestration/research/08_CONTEXT_ENGINEERING_AND_SECURITY.md -->

# 08 — Context Engineering for Agent Handoff, and Multi-Agent Security

**Author:** independent research contribution
**Date:** 2026-07-25
**Chapter scope:** one topic of a multi-chapter dossier. Reviews external practice only, then compares
to the system described in `00_SYSTEM_UNDER_REVIEW.md`.

---

## Scope

This chapter covers two coupled questions:

1. **Context engineering for handoff** — what an orchestrator should send _down_ to a subagent, what a
   subagent should send _back up_, and what happens to decision quality as that channel gets wider,
   longer, or lossier.
2. **The security boundary delegation creates** — untrusted content entering through a subagent's
   tools, and what trust an orchestrator may place in a subagent's output.

Out of scope here: eval methodology, routing accuracy, cost/latency economics, agent catalog design.
Those belong to sibling chapters.

Every substantive claim carries a URL. Where a number could not be verified from a primary source it
is marked **UNVERIFIED** or omitted.

---

## Key sources

| Source                                                                                 | What it is                              | Date                         | URL                                                                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| Manus — _Context Engineering for AI Agents_ (Yichao 'Peak' Ji)                         | Production postmortem, six lessons      | 2025-07-18                   | https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus |
| Anthropic — _Effective context engineering for AI agents_                              | Compaction / note-taking / sub-agents   | 2025-09-29                   | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents   |
| Anthropic — _How we built our multi-agent research system_                             | Orchestrator-worker, measured           | 2025-06-13                   | https://www.anthropic.com/engineering/multi-agent-research-system                   |
| Anthropic — _When to use multi-agent systems (and when not to)_                        | Revised 2026 guidance                   | 2026-01-23                   | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them       |
| Anthropic — _Managing context on the Claude Developer Platform_                        | Memory tool + context editing, measured | 2025-09-29                   | https://claude.com/blog/context-management                                          |
| Cognition — _Don't Build Multi-Agents_ (Walden Yan)                                    | The counter-position                    | 2025-06-12                   | https://cognition.com/blog/dont-build-multi-agents                                  |
| Chroma — _Context Rot_ (Hong, Troynikov, Huber)                                        | 18-model degradation study              | 2025-07-14                   | https://www.trychroma.com/research/context-rot                                      |
| Liu et al. — _Lost in the Middle_ (TACL)                                               | Positional degradation                  | 2023-07-06                   | https://arxiv.org/abs/2307.03172                                                    |
| Chen, Pan, Dai, Netravali — _Slipstream_                                               | Compaction-loss validation              | 2026-05                      | https://arxiv.org/abs/2605.08580                                                    |
| Zeng, Huang, He — _LOCA-bench_                                                         | Agents under extreme context growth     | 2026-02-10                   | https://arxiv.org/abs/2602.07962                                                    |
| Xia, Wang, Huang, Liu — _Diagnosing and Mitigating Context Rot in Long-horizon Search_ | 2026 follow-up                          | 2026-06-30                   | https://arxiv.org/abs/2606.29718                                                    |
| Simon Willison — _The lethal trifecta_                                                 | Threat model                            | 2025-06-16                   | https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/                          |
| Debenedetti et al. — _CaMeL: Defeating Prompt Injections by Design_                    | Design-level defense                    | 2025-03-24 (v2 2025-06-24)   | https://arxiv.org/abs/2503.18813                                                    |
| Beurer-Kellner et al. — _Design Patterns for Securing LLM Agents_                      | Six patterns                            | 2025-06                      | https://arxiv.org/abs/2506.08837                                                    |
| Meta — _Agents Rule of Two_                                                            | Deployment constraint                   | 2025-10-31                   | https://ai.meta.com/blog/practical-ai-agent-security/                               |
| Nasr, Carlini, Tramèr et al. — _The Attacker Moves Second_                             | Adaptive attacks vs 12 defenses         | 2025-10-10                   | https://arxiv.org/abs/2510.09023                                                    |
| OWASP GenAI — _Top 10 for Agentic Applications 2026_                                   | ASI01–ASI10                             | 2025-12-09                   | https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/    |
| Schroeder de Witt et al. — _Open Challenges in Multi-Agent Security_                   | Survey                                  | 2025-05-04 (rev. 2026-04-29) | https://arxiv.org/abs/2505.02077                                                    |

---

## Findings — context engineering

### Theme 1: Context is an attention budget, and it is measurably finite

Anthropic states the mechanism plainly: models have an "attention budget" depleted by each token,
because transformer attention produces "n² pairwise relationships for n tokens," and the observed
result is "a performance gradient rather than a hard cliff"
([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

The empirical backing is strong and vendor-independent:

- **Chroma's _Context Rot_** tested **18 frontier models** (Claude 4 family, o3, GPT-4.1/4o/4-Turbo,
  Gemini 2.5, Qwen3) and concluded "LLMs do not maintain consistent performance across input lengths"
  even on trivial retrieval and text-replication tasks
  ([Chroma](https://www.trychroma.com/research/context-rot)). Three findings bite handoff design:
  degradation is faster when needle-question semantic similarity is **low**; "even a single distractor
  reduces performance relative to the baseline"; and — counterintuitively — "models perform worse when
  the haystack preserves a logical flow of ideas" than when sentences are shuffled. Their LongMemEval
  comparison ran 306 prompts at ~113k tokens versus ~300 tokens focused, with significant gaps across
  every model family.
- **_Lost in the Middle_** gives the positional numbers: on 20-document QA, GPT-3.5-Turbo scored
  **75.8%** with the answer first, **53.8%** middle, **63.2%** last — against a **closed-book baseline
  of 56.1%**, meaning mid-context placement performed _worse than supplying no documents at all_.
  Extended context did not help: 4K and 16K variants were "nearly identical" on settings that fit both
  ([Liu et al.](https://arxiv.org/abs/2307.03172)).
- The 2026 literature has not overturned this. **LOCA-bench** benchmarks "language agents under
  controllable and extreme context growth" across Claude Opus 4.5, GPT-5.2 and Gemini variants
  ([Zeng et al.](https://arxiv.org/abs/2602.07962)), and _Diagnosing and Mitigating Context Rot in
  Long-horizon Search_ treats context rot as live and unsolved
  ([Xia et al.](https://arxiv.org/abs/2606.29718)). Neither PDF yielded extractable headline numbers;
  treat their specific figures as **UNVERIFIED** here.

**Design consequence:** a plausible-but-irrelevant sibling artifact hurts more than the same volume of
random text. Filtering what enters a digest matters more than shortening it.

### Theme 2: What belongs in a subagent assignment

The only crisp published list comes from Anthropic's research system: "Each subagent needs an
**objective**, an **output format**, **guidance on the tools and sources to use**, and **clear task
boundaries**" ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). Their
named early failure modes were the absence of exactly this: "agents duplicated work, left gaps" and
"subagents misinterpreted the task or performed the exact same searches as other agents."

The 2026 revision adds a decomposition rule that is arguably more important than the field list:
**decompose by context boundary, not by problem type.** "When agents are split by problem type, they
engage in a 'telephone game,' passing information back and forth with each handoff degrading
fidelity" ([Anthropic, 2026-01-23](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).
Their stated justifications for splitting at all are context protection ("context pollution"),
parallelization, and specialization — and their stated default is still a single agent, since
multi-agent systems "typically use 3-10x more tokens than single-agent approaches for equivalent
tasks." (The 2025 research-system post measured **15×** more tokens than chat for that specific
research workload — the two figures describe different workloads, not a correction.)

What must **not** go down: nothing in the primary literature enumerates this well. The strongest
statements are security-side (below) and the general "minimal viable set of tools" rule — Anthropic's
most common observed failure mode is "bloated tool sets that cover too much functionality or lead to
ambiguous decision points about which tool to use," with the test: "If a human engineer can't
definitively say which tool should be used in a given situation, an AI agent can't be expected to do
better" ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

### Theme 3: Artifacts vs transcripts vs full shared history — a genuine live disagreement

This is the sharpest open dispute in the field, and both sides are specific.

**Anthropic advocates artifacts + references.** Sub-agents "handle focused tasks with clean context
windows"; "the detailed search context remains isolated within sub-agents, while the lead agent
focuses on synthesizing and analyzing the results"; each subagent "returns only a condensed, distilled
summary of its work (often 1,000-2,000 tokens)"
([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
The research-system post goes further and explicitly recommends against routing content through the
orchestrator at all: "subagents call tools to store their work in external systems, then pass
lightweight references back to the coordinator"
([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). The 2026 post
quantifies the target: the orchestrator receives "only the 50-100 tokens it actually needs."

**Cognition advocates the opposite.** Walden Yan's two principles are "**Share context, and share full
agent traces, not just individual messages**" and "**Actions carry implicit decisions, and conflicting
decisions carry bad results**" ([Cognition](https://cognition.com/blog/dont-build-multi-agents)). His
Flappy Bird example is the mechanism: one subagent builds a Super Mario background while another builds
an incompatible bird, because neither saw the other's _implicit_ choices. His recommended default is a
single-threaded linear agent, and where context exceeds the window he proposes a dedicated model
"whose key purpose is to compress a history of actions & conversation into key details, events, and
decisions" — noting this is hard and domain-dependent.

**How to read the disagreement.** They are not arguing about file formats. Yan's objection is that a
payload carrying _outputs_ but not _decisions and their rationale_ reproduces the Flappy Bird failure
whether it is a transcript or a typed struct — and Anthropic's "telephone game" warning is the same
claim. The reconcilable position, and the one 2026 practitioner writing has converged on, is that a
handoff payload should be a structured specification carrying task summary, a pointer to output data,
completed-work facts, outstanding subtasks, constraints and decisions — while excluding full
transcripts, scratchpad reasoning, credentials, and anything outside the callee's role
([OpenLegion](https://www.openlegion.ai/en/learn/agent-handoff-patterns) — secondary; consensus, not
evidence). Blackboard-pattern performance claims in that literature are **UNVERIFIED** and unused here.

### Theme 4: Bounding the digest — published patterns

There is no published _specification_ for a bounded orchestrator digest. What exists:

- **Token targets.** 1,000–2,000 tokens for a subagent's returned summary; 50–100 tokens for what the
  orchestrator actually needs from a retrieval step ([Anthropic, 2025](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [2026](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).
- **Structured note-taking / external memory.** The agent "regularly writes notes persisted to memory
  outside of the context window," pulled back later. Now a platform primitive: memory tool plus context
  editing measured **39% improvement over baseline** on an internal agentic-search eval (context
  editing alone **29%**), and in a **100-turn web search evaluation** context editing "reduc[ed] token
  consumption by **84%**" while completing workflows that otherwise failed on context exhaustion
  ([Anthropic](https://claude.com/blog/context-management)).
- **Recitation.** Manus rewrites `todo.md` and appends it to the _end_ of context to bias attention
  toward the global plan and fight lost-in-the-middle, on tasks averaging "around **50 tool calls**"
  ([Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)).
- **Just-in-time over pre-loading, with a hybrid escape.** Anthropic favors "lightweight identifiers
  (file paths, stored queries, web links)" loaded at runtime, while conceding "runtime exploration is
  slower than retrieving pre-computed data" and that "the most effective agents might employ a hybrid
  strategy."

### Theme 5: Summarization loss — the documented failure mode

Anthropic names it directly: "overly aggressive compaction can result in the loss of subtle but
critical context," with the prescribed method being "maximize recall … then iterate to improve
precision" ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
In Claude Code, compaction retains the summary "plus the five most recently accessed files."

The best formal treatment is **Slipstream**, which states the structural problem precisely: "the
compactor must condense context but is fundamentally unaware of precisely what information the agent
will need later. Further, because post-compaction agent steps are conditioned on the new summary,
targeted validation criteria do not exist and **errors silently propagate through coherent but
incorrect behavior**" ([Chen et al.](https://arxiv.org/abs/2605.08580)). Their fix is the important
part: run compaction **asynchronously, in parallel with continued execution on the original context**,
so summary and next-steps derive independently from the same pre-compaction state — producing "a
validation signal independent of the summary itself," judged on whether the summary preserves "the
agent's forward intent and the key facts and constraints it depends on." Measured: **up to 8.8
percentage points** accuracy on SWE-bench Verified and BrowseComp, **up to 39.7%** latency reduction.

The generalizable lesson: _a summary cannot be validated against itself._ Any digest step needs a
signal produced from the un-summarized state.

Manus contributes two loss modes that structured handoff makes _worse_: **errors must stay in context**
— "when the model sees a failed action … it implicitly updates its internal beliefs" — and **few-shot
ruts**, mitigated by "small amounts of structured variation in actions and observations." A typed
artifact reporting only successful outputs deletes exactly the evidence Manus says prevents repeats.

### Theme 6: Determinism and prefix stability are a cost lever, not just a correctness one

Manus's headline economics: cached input tokens cost **$0.30/MTok** vs **$3/MTok** uncached — "a 10x
difference" — against an average input-to-output ratio "around 100:1," and "even a single-token
difference can invalidate the cache from that token onward." Hence **masking tool logits rather than
removing tools**: removal mutates the prefix and invalidates the KV-cache for all subsequent actions
([Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)).

A system that builds planner context deterministically from a pinned snapshot gets prefix stability
for free. A system that lets an LLM assemble planner context does not.

---

## Findings — multi-agent security

### Theme 7: Prompt injection is unsolved, and detection is not a defense

Willison's position from 2025 has held: "we still don't know how to 100% reliably prevent this from
happening," and on guardrail vendors, "they'll almost always carry confident claims that they capture
'95% of attacks' or similar … but in web application security 95% is very much a failing grade"
([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)).

_The Attacker Moves Second_ is the empirical proof. Against **12 recent defenses** — the majority of
which "originally reported near-zero attack success rates" — adaptive attacks using gradient descent,
RL, random search, and human-guided exploration achieved "attack success rate above **90%** for most"
([Nasr, Carlini, Tramèr et al.](https://arxiv.org/abs/2510.09023)). Willison's summary of the same
paper reports static attacks at 0–62%, automated adaptive at 71–100%, and a 500-participant human
red-team at 100% across all defenses
([Willison](https://simonw.substack.com/p/new-prompt-injection-papers-agents)); the >90% figure and
the count of 12 are confirmed at the primary source, the finer breakdown is secondary.

**Implication:** any BuildOS design that relies on a model being _instructed_ to treat content as
untrusted has, per this evidence, no security value against a motivated attacker. Only structural
constraints count.

### Theme 8: The capability budget — lethal trifecta and Rule of Two

Willison's **lethal trifecta**: (1) access to private data, (2) exposure to untrusted content,
(3) the ability to externally communicate. His mitigation for users is to "avoid that lethal trifecta
combination entirely" ([Willison](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/)).

Meta operationalized this as the **Agents Rule of Two**: agents "must satisfy no more than two of the
following three properties within a session" — **[A]** process untrustworthy inputs, **[B]** access
sensitive systems or private data, **[C]** change state or communicate externally. "If an agent
requires all three without starting a new session (i.e., with a fresh context window), then the agent
should not be permitted to operate autonomously and at a minimum requires supervision — via
human-in-the-loop approval or another reliable means of validation." Meta frames this as necessary
"until robustness research allows us to reliably detect and refuse prompt injection"
([Meta](https://ai.meta.com/blog/practical-ai-agent-security/)).

The critical subtlety for BuildOS: **[C] is "change state _or communicate externally_."** A read-only
agent that can issue attacker-influenced web fetches still holds [C], because the URL and query are an
exfiltration channel.

### Theme 9: Design-level defenses — quarantine, not instruction

**CaMeL** ([Debenedetti et al.](https://arxiv.org/abs/2503.18813)) is the reference architecture. A
**Privileged LLM (P-LLM)** sees only the trusted user query and emits a plan; a **Quarantined LLM
(Q-LLM)** parses untrusted data and has **no tool access**; a custom Python interpreter tracks data
provenance via **capabilities** and enforces security policies before each tool call, so "the untrusted
data retrieved by the LLM can never impact the program flow." Measured on AgentDojo: **77% of tasks
solved with provable security vs 84% undefended** — i.e. a ~7-point utility tax for a structural
guarantee.

**Beurer-Kellner et al.** generalize this into six patterns — Action-Selector, Plan-Then-Execute,
LLM Map-Reduce, Dual LLM, Code-Then-Execute, Context-Minimization — under one principle: "Once an LLM
agent has ingested untrusted input, it must be constrained so that it is impossible for that input to
trigger any consequential actions." They are explicit that this is a trade: the patterns "impose
intentional constraints on agents, explicitly limiting their ability to perform arbitrary tasks," and
general-purpose agents handling untrusted data cannot give "meaningful and reliable safety guarantees"
— only "application-specific agents can be secured through principled system design"
([arXiv:2506.08837](https://arxiv.org/abs/2506.08837)).

### Theme 10: Delegation-specific risk — the orchestrator must not trust its own subagent

**OWASP Top 10 for Agentic Applications 2026** (2025-12-09): ASI01 Agent Goal Hijack, ASI02 Tool Misuse
and Exploitation, ASI03 Identity and Privilege Abuse, ASI04 Agentic Supply Chain Vulnerabilities, ASI05
Unexpected Code Execution, **ASI06 Memory & Context Poisoning**, **ASI07 Insecure Inter-Agent
Communication**, **ASI08 Cascading Failures**, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents
([OWASP](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/); enumerated
list via [Giskard](https://www.giskard.ai/knowledge/owasp-top-10-for-agentic-application-2026) —
secondary). ASI01 cites EchoLeak, where a hidden email payload causes Microsoft 365 Copilot to
"silently execute instructions to exfiltrate confidential emails and chat logs" with no user
interaction. ASI08 names the orchestrator risk directly: "a single fault in one agent can propagate
across the network, amplifying into a system-wide disaster." The academic survey adds that multi-agent
threats "emerge or amplify through interactions," with poisoning that "rapidly spreads"
([Schroeder de Witt et al.](https://arxiv.org/abs/2505.02077)).

**The trust-boundary rule that follows:** a subagent that has read untrusted content is itself
untrusted, and its returned summary is attacker-influenced data, not a colleague's report. A distilled
summary is a _better_ injection carrier than raw HTML — short, high-salience, and arriving with implied
provenance.

---

## Direct comparison to BuildOS

| Practice                                                                         | What BuildOS does                                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Cost to change                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Typed versioned artifacts instead of transcripts**                             | Artifact store carries typed, versioned artifacts; specialists return typed results             | **matched** — Anthropic recommends subagents "store their work in external systems, then pass lightweight references back to the coordinator" ([link](https://www.anthropic.com/engineering/multi-agent-research-system)). Cognition's counter ([link](https://cognition.com/blog/dont-build-multi-agents)) is not about format but _decisions_: outputs without the implicit choices behind them reproduce Flappy Bird                                                                               | **Low.** Add required `decisions[]` / `assumptions[]` / `rejected_alternatives[]` to the result contract                                     |
| **Bounded workflow state digest at gates**                                       | Code builds a bounded digest to wake the CEO at transitions                                     | **matched, trending ahead** — consistent with the 1,000–2,000-token return and 50–100-token orchestrator targets, and nobody has published a digest _schema_                                                                                                                                                                                                                                                                                                                                          | **Low.** Publish and pin the schema; record digest token counts per gate                                                                     |
| **Deterministic code-built world card as the router's only context**             | Librarian is deterministic, no LLM; card is version + SHA-256 pinned                            | **novel — unproven, and under-claimed.** Structurally the P-LLM boundary from CaMeL ([link](https://arxiv.org/abs/2503.18813)) and the Plan-Then-Execute pattern ([link](https://arxiv.org/abs/2506.08837)): planner context built from trusted inputs by code, not assembled by a model over untrusted data. Also buys free KV-cache prefix stability at Manus's 10× price gap. **Caveat:** holds only if the snapshot carries no attacker-influenced text — and project documents are user-supplied | **Zero to keep; medium to claim.** Needs a trust label per world-card field and an eval that plants an injected string in a project document |
| **Subagent assignment contents**                                                 | Manifest defines context, skills, tools, permissions, result contract                           | **matched** — covers Anthropic's four required fields (objective / output format / tool + source guidance / boundaries)                                                                                                                                                                                                                                                                                                                                                                               | **Low.** Confirm output format is explicit per assignment, not implied by type                                                               |
| **Keeping failures visible to the planner**                                      | Not evident; artifacts are typed _results_                                                      | **behind.** Manus: seeing a failed action means "the model … implicitly updates its internal beliefs" ([link](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)); success-only artifacts delete that signal                                                                                                                                                                                                                                                        | **Medium.** Add `failed_attempts[]` to the digest; measure repeat-work reduction                                                             |
| **Validating the digest didn't drop the decisive fact**                          | No validation signal; digest trusted as built                                                   | **behind.** Slipstream: "errors silently propagate through coherent but incorrect behavior"; async validation bought up to **8.8 pp** ([link](https://arxiv.org/abs/2605.08580))                                                                                                                                                                                                                                                                                                                      | **Medium-high.** Cheapest version: on a sample of gates, re-decide on the full pre-digest state and log disagreement rate                    |
| **Recitation of objective per stage**                                            | Receding-horizon planning is adjacent, not the same mechanism                                   | **behind (minor)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Low.** Append objective + open acceptance checks to the end of each stage prompt                                                           |
| **Least privilege; specialists cannot add children, permissions, scope, budget** | Hard pre-registered safety gate                                                                 | **ahead.** Addresses OWASP ASI03/ASI10 structurally rather than by instruction                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                            |
| **Progressive autonomy: read → propose → stage → review → commit**               | Stated principle; Phase A read-only                                                             | **matched.** Consistent with Meta's human-in-the-loop requirement when all three properties are present                                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                            |
| **Code-validated citations**                                                     | Citations validated in code; invalid ones are a hard gate                                       | **ahead.** Deterministic post-validation of model claims is rarer than it should be, and is a partial integrity control on untrusted web content                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                                            |
| **Quarantining fetched web content from the planner**                            | Not evident. Researcher fetches pages; content flows to synthesis and via digest toward the CEO | **behind.** Q-LLM / Dual-LLM / LLM Map-Reduce exist to stop exactly this ([link](https://arxiv.org/abs/2506.08837))                                                                                                                                                                                                                                                                                                                                                                                   | **Medium.** Tag artifact fields `trust: trusted \| untrusted`; forbid untrusted spans in route/transition prompts unquoted                   |
| **Trifecta / Rule-of-Two accounting per route**                                  | Not present                                                                                     | **behind**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Low.** One table: per route, does it hold [A] untrusted input, [B] private data, [C] state change or external comms?                       |

**On the artifact-over-transcript bet:** validated by outside practice, with one named condition.
Anthropic recommends it in production and quantifies the payload size; the 2026 guidance makes context
isolation the _primary_ reason to go multi-agent at all. Cognition's dissent survives as a constraint
on payload _content_ — decisions and rationale must travel with the outputs — not as a reason to ship
transcripts. BuildOS is on the majority side of a real dispute, and the way it can lose is documented
well enough to design against.

**On the deterministic world card:** the strongest idea in the design, and undersold. It is framed as a
retrieval-quality and reproducibility decision. It is also a _security architecture_ — the
trusted-planner-context boundary CaMeL and Plan-Then-Execute were invented to create. Worth adopting
that framing, and worth testing, because the boundary leaks the moment a user-authored project document
flows into the card unlabelled.

---

## What BuildOS's Phase A cannot test

Phase A is read-only, in-process, with no permissions-at-execution, no persistence, and a
non-adversarial corpus of eight anonymized production scenarios. That rules out the following:

1. **The trifecta does not actually close — and Phase A can't show it either way.** "Read-only" removes
   _state change_, not _external communication_. The Researcher fetches web content, and its queries and
   URLs are influenced by content it has already read. Under Meta's framing that is still property [C]
   ([link](https://ai.meta.com/blog/practical-ai-agent-security/)). Phase A therefore cannot claim
   injection safety — only that no mutation tool was called, a much weaker statement.
2. **Permissions-at-execution (ASI03).** Least privilege is asserted in the manifest and never exercised
   against an agent that tries to exceed it. "No specialist can add permissions" is a design claim, not
   a measured one.
3. **Memory and context poisoning (ASI06).** With no persistence, a poisoned document cannot survive
   into a later world card — precisely the attack the deterministic world card is most exposed to.
4. **Cascading failures and inter-agent trust (ASI07/ASI08).** One-shot in-process runs over three
   scenarios cannot produce propagation, and the corpus contains no adversarial subagent output.
5. **Every context-length effect that matters.** Measured degradation regimes are 10k–113k+ token inputs
   and 100-turn horizons ([Chroma](https://www.trychroma.com/research/context-rot),
   [Anthropic](https://claude.com/blog/context-management)). Eight short scenarios with a single digest
   hop will not reproduce context rot, compaction loss, or the distractor effect. A Go here says nothing
   about behavior at production context volumes.
6. **Summarization loss at the gate.** With no independent validation signal, a digest that dropped the
   decisive fact and one that didn't are indistinguishable in the results — Slipstream's "coherent but
   incorrect behavior" ([link](https://arxiv.org/abs/2605.08580)). Judges score final answers, not gate
   fidelity.
7. **The judge panel sits downstream of live untrusted web content.** Judges are instructed to treat both
   responses as untrusted quoted content — good instinct, but per _The Attacker Moves Second_
   ([link](https://arxiv.org/abs/2510.09023)) an instruction-based defense adaptive attackers beat >90%
   of the time. Today's corpus is non-adversarial so real risk is low, but workflow runs fetch live pages
   and the harness has no structural defense.
8. **Whether artifacts lose decisions.** The comparison scores output quality. It does not instrument
   whether a downstream step contradicted an upstream choice — the exact Cognition failure mode. That
   needs a dedicated check, not a preference judgment.

---

## Open questions

1. **Does the world card carry trust labels?** If a user-authored project document can inject text into
   the router's only context, the deterministic-construction guarantee covers _provenance of assembly_,
   not _provenance of content_. Which is it today?
2. **Does anything a subagent's untrusted read produced reach the CEO unquoted?** Highest-value
   security question in the design, and answerable by code inspection today.
3. **What is the digest's measured token budget?** External reference points: 50–100 tokens
   (orchestrator need), 1,000–2,000 (subagent return).
4. **Is there any signal a gate decision would have differed on the full state?** Without one, "bounded
   digest" is an untested compression.
5. **Do artifacts carry rejected alternatives?** Cognition's failure mode is invisible unless they do.
6. **Are failed attempts preserved anywhere?** Manus says they belong in context; typed result
   contracts tend to discard them.
7. **Is read-only enforced at the port layer or by prompt?** Under the adaptive-attack evidence, only
   the former counts.

---

## Confidence

**High** — the context-degradation numbers (Chroma and Liu et al. are primary and specific); the
Anthropic/Cognition disagreement and both positions' exact wording; the consensus that prompt injection
is unsolved and detection-based defenses fail adaptive attacks; the lethal trifecta and Rule of Two;
CaMeL's 77%-vs-84% AgentDojo result; the OWASP 2026 category set.

**Medium** — the claim that BuildOS's deterministic world card is structurally a P-LLM boundary. That
is my inference from `00_SYSTEM_UNDER_REVIEW.md`, not a claim any source makes about BuildOS, and it
depends on snapshot-content facts I could not verify. Same for the digest-bounding recommendations,
which extrapolate token targets published for a different workload.

**Low / explicitly unverified** — the quantitative results of the two 2026 context-rot papers
(LOCA-bench; _Diagnosing and Mitigating Context Rot in Long-horizon Search_). Both papers exist and are
correctly titled and attributed, but their PDFs did not yield extractable numbers, so no figure from
either is used as evidence. Also unverified: practitioner-blog claims about blackboard patterns and
hierarchical memory tiers, cited only as evidence of consensus, never as measurement. The finer
breakdown of _The Attacker Moves Second_ (0–62% static / 71–100% adaptive / 100% human red-team) comes
from Willison's summary, not the paper's abstract; the ">90% for most, across 12 defenses" figure is
primary.
