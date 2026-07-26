<!-- docs/architecture/agent-first-orchestration/research/06_OSS_HARNESSES_OPENCLAW_HERMES.md -->

# 06 — Open-Source Agent Harnesses: Delegation Architecture and Eval Practice

**Date:** 2026-07-25
**Chapter of:** agent-first orchestration research dossier
**Priority targets:** OpenClaw, Hermes

---

## Scope

This chapter surveys how open-source and independent **agent harnesses** wire an orchestrator to
subagents, and what — if anything — they do to evaluate themselves. "Harness" here means the layer
around the model: the loop, tool wiring, prompt assembly, session/context management, and delegation
primitives. OpenClaw's own docs give the tightest definition: a harness is "the low level executor
for one prepared agent turn," independent of model providers, channels, and tool registries
([docs.openclaw.ai/plugins/sdk-agent-harness](https://docs.openclaw.ai/plugins/sdk-agent-harness)).

For each system I extract seven things: delegation contract, return contract, context isolation,
control flow, parallelism, eval story, and published negative results. Every substantive claim
carries a URL. Where docs are thin or I could not verify, the text says **UNVERIFIED** rather than
filling the gap with plausible architecture.

Out of scope: closed commercial orchestrators, RL training infrastructure except where it doubles as
eval (Nous's Atropos does), and any BuildOS implementation work.

**On length:** roughly half this chapter is tables (sources, comparative survey across 14 systems,
BuildOS comparison). The prose is deliberately dense rather than long. If you read only two things,
read **finding 1b** (the one measured multi-agent architecture comparison) and **finding 16** (the
strongest published argument _against_ investing in scaffolding, from the team that invented it).

---

## Key sources

| Project / source                                                              | What it is                                                                 | Date checked | URL                                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| OpenClaw docs — agent harness plugin SDK                                      | Primary spec of the harness contract                                       | 2026-07-25   | https://docs.openclaw.ai/plugins/sdk-agent-harness                                                                |
| OpenClaw docs — agent runtime                                                 | Embedded loop, sessions, bootstrap files                                   | 2026-07-25   | https://docs.openclaw.ai/concepts/agent                                                                           |
| OpenClaw docs — session tools                                                 | `sessions_spawn` / `sessions_yield` semantics                              | 2026-07-25   | https://docs.openclaw.ai/concepts/session-tool                                                                    |
| OpenClaw repo — `docs/tools/subagents.md`                                     | Subagent parameters, limits, tool stripping                                | 2026-07-25   | https://github.com/openclaw/openclaw/blob/main/docs/tools/subagents.md                                            |
| OpenClaw docs — agents config                                                 | Subagent concurrency/depth defaults                                        | 2026-07-25   | https://docs.openclaw.ai/gateway/config-agents                                                                    |
| OpenClaw docs — ACP agents                                                    | Running external harnesses as subagents                                    | 2026-07-25   | https://docs.openclaw.ai/tools/acp-agents                                                                         |
| OpenClaw docs — agent runtimes                                                | Embedded vs CLI vs external control plane                                  | 2026-07-25   | https://docs.openclaw.ai/concepts/agent-runtimes                                                                  |
| OpenClaw repo README                                                          | License, gateway, star count                                               | 2026-07-25   | https://github.com/openclaw/openclaw                                                                              |
| OpenClaw `AGENTS.md`                                                          | Contributor test/CI gates                                                  | 2026-07-25   | https://github.com/openclaw/openclaw/blob/main/AGENTS.md                                                          |
| Wikipedia — OpenClaw                                                          | Origin, renames, governance, incidents                                     | 2026-07-25   | https://en.wikipedia.org/wiki/OpenClaw                                                                            |
| ClawBench (openclaw org)                                                      | OpenClaw's own full-stack agent benchmark                                  | 2026-07-25   | https://github.com/openclaw/clawbench                                                                             |
| Claw-SWE-Bench (arXiv 2606.12344)                                             | Cross-harness SWE-bench adapter protocol                                   | 2026-07-25   | https://arxiv.org/html/2606.12344v1                                                                               |
| WildClawBench (InternLM)                                                      | 60 tasks × 4 harnesses, same grading                                       | 2026-07-25   | https://github.com/internlm/WildClawBench                                                                         |
| ClawProBench                                                                  | Live-first harness eval, `pass^3`                                          | 2026-07-25   | https://github.com/suyoumo/ClawProBench                                                                           |
| Claw-Eval                                                                     | 300 human-verified tasks, `Pass^3` primary metric                          | 2026-07-25   | https://github.com/claw-eval/claw-eval                                                                            |
| hermes-agent repo                                                             | Nous Research's agent harness                                              | 2026-07-25   | https://github.com/NousResearch/hermes-agent                                                                      |
| hermes-agent delegation doc                                                   | `delegate_task` contract                                                   | 2026-07-25   | https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md             |
| hermes-agent delegation patterns guide                                        | When to / not to delegate                                                  | 2026-07-25   | https://hermes-agent.nousresearch.com/docs/guides/delegation-patterns                                             |
| hermes-agent issue #344                                                       | Stated limits of current multi-agent design                                | 2026-07-25   | https://github.com/NousResearch/hermes-agent/issues/344                                                           |
| DeepWiki — hermes-agent subagent delegation                                   | Code-level delegation detail                                               | 2026-07-25   | https://deepwiki.com/NousResearch/hermes-agent/5.7-subagent-delegation                                            |
| Hermes 4 Technical Report (arXiv 2508.18255)                                  | Nous model family + eval philosophy                                        | 2026-07-25   | https://arxiv.org/abs/2508.18255                                                                                  |
| Anthropic — multi-agent research system                                       | Orchestrator/subagent contract + eval practice                             | 2026-07-25   | https://www.anthropic.com/engineering/multi-agent-research-system                                                 |
| Anthropic/Claude — when to use multi-agent                                    | Explicit anti-patterns and token costs                                     | 2026-07-25   | https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them                                     |
| "Stop Comparing LLM Agents Without Disclosing the Harness" (arXiv 2605.23950) | Harness-disclosure reporting standard                                      | 2026-07-25   | https://arxiv.org/pdf/2605.23950                                                                                  |
| OpenHands SDK — sub-agent delegation                                          | `AgentDelegateAction`, event-sourced delegation                            | 2026-07-25   | https://docs.openhands.dev/sdk/guides/agent-delegation                                                            |
| Roo Code — Boomerang/Orchestrator tasks                                       | `new_task` / `attempt_completion` contract                                 | 2026-07-25   | https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks                                                    |
| Aider benchmark README                                                        | Docker-isolated model benchmark harness                                    | 2026-07-25   | https://github.com/Aider-AI/aider/blob/main/benchmark/README.md                                                   |
| LangChain — benchmarking multi-agent architectures                            | **τ-bench + distractor study; swarm > supervisor; ~50% gain from 3 fixes** | 2026-07-25   | https://www.langchain.com/blog/benchmarking-multi-agent-architectures                                             |
| LangChain — how and when to build multi-agent systems                         | "Reads parallelize, writes don't"; when multi-agent fails                  | 2026-07-25   | https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems                                          |
| LangChain — subagents pattern                                                 | Stateless subagents, task-as-message contract                              | 2026-07-25   | https://docs.langchain.com/oss/python/langchain/multi-agent/subagents                                             |
| langgraph-swarm-py                                                            | `create_handoff_tool` full-history default                                 | 2026-07-25   | https://github.com/langchain-ai/langgraph-swarm-py                                                                |
| LangGraph — graph API                                                         | Reducers, `Send`, Pregel supersteps, `Command`                             | 2026-07-25   | https://docs.langchain.com/oss/python/langgraph/graph-api                                                         |
| LangSmith — evaluate graph agents                                             | Final / single-step / trajectory eval levels                               | 2026-07-25   | https://docs.langchain.com/langsmith/evaluate-graph                                                               |
| AutoGen repo                                                                  | Maintenance-mode notice, layered architecture                              | 2026-07-25   | https://github.com/microsoft/autogen                                                                              |
| AutoGenBench / `agbench`                                                      | Repetition + docker isolation + instrumentation                            | 2026-07-25   | https://microsoft.github.io/autogen/0.2/blog/2024/01/25/AutoGenBench/                                             |
| AutoGen — selector group chat                                                 | Model-driven selection with code overrides                                 | 2026-07-25   | https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html               |
| AG2 handoffs                                                                  | Context-condition-before-LLM-condition ordering                            | 2026-07-25   | https://docs.ag2.ai/latest/docs/user-guide/advanced-concepts/orchestration/group-chat/handoffs/                   |
| AG2 README (v1.0)                                                             | Network hub + four typed channels; Classic split                           | 2026-07-25   | https://raw.githubusercontent.com/ag2ai/ag2/main/README.md                                                        |
| CrewAI — tasks                                                                | Typed task spec, `TaskOutput`, `context=[...]`                             | 2026-07-25   | https://docs.crewai.com/en/concepts/tasks                                                                         |
| CrewAI — testing                                                              | `crewai test`: 2 iterations, gpt-4o-mini, 1–10                             | 2026-07-25   | https://docs.crewai.com/en/concepts/testing                                                                       |
| CrewAI — changelog                                                            | 2026 deprecations and memory-isolation fix                                 | 2026-07-25   | https://docs.crewai.com/en/changelog                                                                              |
| OpenHands SDK paper (arXiv 2511.03690)                                        | Delegation, condenser, 3-tier CI, reliability data                         | 2026-07-25   | https://arxiv.org/abs/2511.03690                                                                                  |
| OpenHands SDK — task tool set                                                 | **Current** delegation doc (`agent-delegation` was renamed)                | 2026-07-25   | https://docs.openhands.dev/sdk/guides/task-tool-set.md                                                            |
| OpenHands SDK — `task/definition.py`                                          | `TaskAction` / `TaskObservation` schemas                                   | 2026-07-25   | https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-tools/openhands/tools/task/definition.py      |
| OpenHands SDK — condenser README                                              | Tombstones, soft/hard triggers, cache reasoning                            | 2026-07-25   | https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/context/condenser/README.md |
| OpenHands — BEHAVIOR_TESTS.md                                                 | Required vs optional test split                                            | 2026-07-25   | https://github.com/OpenHands/software-agent-sdk/blob/main/tests/integration/BEHAVIOR_TESTS.md                     |
| SWE-agent ACI paper (arXiv 2405.15793)                                        | **Table 3 ablations**; abandoned models                                    | 2026-07-25   | https://arxiv.org/abs/2405.15793                                                                                  |
| mini-swe-agent                                                                | ⭐ The ACI walk-back by the same team                                      | 2026-07-25   | https://github.com/SWE-agent/mini-swe-agent                                                                       |
| smolagents `code_agent.yaml`                                                  | Managed-agent signature + 3-section report template                        | 2026-07-25   | https://github.com/huggingface/smolagents/blob/main/src/smolagents/prompts/code_agent.yaml                        |
| HF Open Deep Research blog                                                    | 55.15% GAIA; code→JSON drops to 33%                                        | 2026-07-25   | https://huggingface.co/blog/open-deep-research                                                                    |
| OpenAI Agents SDK — handoffs / tools / multi_agent                            | Two delegation contracts; "orchestrating via code"                         | 2026-07-25   | https://github.com/openai/openai-agents-python/blob/main/docs/multi_agent.md                                      |
| OpenAI Agents SDK — `agent.py`                                                | `as_tool` docstring contrasting handoffs                                   | 2026-07-25   | https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py                                      |
| Google ADK — workflow agents                                                  | "without consulting an AI model for… orchestration"                        | 2026-07-25   | https://github.com/google/adk-docs/blob/main/docs/agents/workflow-agents/index.md                                 |
| Google ADK — evaluation criteria                                              | `tool_trajectory_avg_score` match types; 13 criteria                       | 2026-07-25   | https://github.com/google/adk-docs/blob/main/docs/evaluate/criteria.md                                            |
| Google ADK 2.0                                                                | GA notes + four breaking-change landmines                                  | 2026-07-25   | https://adk.dev/2.0/                                                                                              |
| Why we built ADK 2.0                                                          | ⭐ "traditional code already excels at" orchestration                      | 2026-07-25   | https://developers.googleblog.com/why-we-built-adk-20/                                                            |
| Goose — subagents / recipe reference                                          | `delegate` contract incl. separate `context`; `retry` gate                 | 2026-07-25   | https://goose-docs.ai/docs/guides/context-engineering/subagents                                                   |
| Goose — "Self-Improving Agents Still Need Humans"                             | ⭐ Anti-Goodhart eval philosophy + 2 documented failures                   | 2026-07-25   | https://goose-docs.ai/blog/2026/06/17/self-improving-agents-need-humans                                           |
| Claude Code — sub-agents                                                      | Limits, startup context, forks, output scanning                            | 2026-07-25   | https://code.claude.com/docs/en/sub-agents                                                                        |
| Claude Code — Agent SDK subagents                                             | "only content you pass… is the prompt string"                              | 2026-07-25   | https://code.claude.com/docs/en/agent-sdk/subagents                                                               |
| awesome-harness-engineering                                                   | Community index of harness patterns/evals                                  | 2026-07-25   | https://github.com/ai-boost/awesome-harness-engineering                                                           |
| ACE-Router (arXiv 2601.08276)                                                 | Agent Route Benchmark, routing accuracy                                    | 2026-07-25   | https://arxiv.org/pdf/2601.08276                                                                                  |
| orq.ai — LLM juries in practice                                               | Panel-vs-single-judge argument                                             | 2026-07-25   | https://orq.ai/blog/llm-juries-in-practice                                                                        |

---

## OpenClaw

### What it actually is

OpenClaw is a **local-first, MIT-licensed personal agent gateway** — not a coding-agent framework and
not a library. It was created by Peter Steinberger, first released November 2025, renamed twice
(trademark pressure from Anthropic drove one rename), and is now stewarded by a non-profit OpenClaw
Foundation after Steinberger joined OpenAI in February 2026
([Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)). The repo README currently shows ~384k stars
under MIT ([github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)); Wikipedia records
247k as of 2026-03-02, so growth is ongoing and any star figure is time-stamped, not stable.

The architectural center is the **Gateway**: a single long-lived process that is the "single control
plane for sessions, channels, tools, and events"
([README](https://github.com/openclaw/openclaw)). Everything — 25+ messaging channels, plugins, cron,
subagents — routes through it. Sessions persist in per-agent SQLite at
`~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`
([docs.openclaw.ai/concepts/agent](https://docs.openclaw.ai/concepts/agent)).

### The harness contract (the interesting part)

OpenClaw formalizes "harness" as a _plugin interface_, which is unusual. A harness receives prepared
attempt params — `params.prompt`, `params.tools`, `params.images`, `params.onPartialReply`,
`params.onAgentEvent` — plus a `runtimePlan` bundle carrying tool-schema normalization, transcript
policy, delivery rules, and outcome classification. It returns an `AgentHarnessAttemptResult`
containing the reply, tool results with terminal outcomes, media URLs, usage metrics, and session
binding data ([sdk-agent-harness](https://docs.openclaw.ai/plugins/sdk-agent-harness)).

Two constraints matter for orchestration design:

1. **The harness has a deliberately restricted capability surface.** It gets "no direct access to
   agents, skills, memory, scheduling, extensions, or remote control — these remain host-controlled."
2. **Mirroring is mandatory.** A harness may keep its own native session ID, but must mirror all
   user-visible output into the OpenClaw transcript so the host stays "the compatibility layer for
   channel-visible session history, transcript search and indexing," and so a later turn can switch
   back to the built-in harness (same source).

That is: _the executor is swappable; the record of truth is not._

### Delegation

Subagents are spawned with `sessions_spawn`, which is **non-blocking** and returns
`{ status: "accepted", runId, childSessionKey }` immediately
([session-tool](https://docs.openclaw.ai/concepts/session-tool)). Parameters include `task`,
`taskName`, `context` (`"isolated"` default = fresh transcript, or `"fork"` = branch the requester's
transcript), `runtime` (`"subagent"` native or `"acp"` external), `thread`, `model`, and `thinking`
([subagents.md](https://github.com/openclaw/openclaw/blob/main/docs/tools/subagents.md)).

The parent is told **not to poll**: it calls `sessions_yield` to end its turn and receive completion
events as the next inbound message ("instead of building poll loops")
([session-tool](https://docs.openclaw.ai/concepts/session-tool)).

Tools are stripped by capability tier. Subagents lose `gateway`, `agents_list`, `session_status`, and
`cron`; _leaf_ subagents additionally lose `subagents`, `sessions_list`, `sessions_history`, and
`sessions_spawn`; `message` is always disabled at spawn
([subagents.md](https://github.com/openclaw/openclaw/blob/main/docs/tools/subagents.md)).

Defaults: `maxSpawnDepth: 1` (no nesting), `maxConcurrent: 8` globally, `maxChildrenPerAgent: 5`,
`archiveAfterMinutes: 60`, `allowAgents` restricted to the same agent
([config-agents](https://docs.openclaw.ai/gateway/config-agents)). Sandbox inheritance is enforced:
a sandboxed requester cannot spawn an unsandboxed target (same source).

### The genuinely novel bit: protocol-level delegation

`sessions_spawn({ runtime: "acp" })` spawns a subagent that is **an entirely different harness** —
Claude Code, Cursor, Copilot, Gemini CLI, OpenCode, Codex ACP, Factory Droid, Qwen and others, 15+
targets ([acp-agents](https://docs.openclaw.ai/tools/acp-agents)). The stated boundary: "OpenClaw
owns routing, background-task state, delivery, bindings, and policy; the harness owns its provider
login, model catalog, filesystem behavior, and native tools" (same source). A documented security
consequence: ACP runs on the host, **not** inside OpenClaw's sandbox.

This is the strongest architectural idea in OpenClaw: the delegation boundary is a _protocol_, so a
specialist is not a prompt-configured persona but a separately-governed process that could be a
different vendor's agent entirely.

### Eval story

OpenClaw's _contributor_ gate is conventional software testing, not agent evaluation: Vitest via
`node scripts/run-vitest.mjs`, `pnpm test:e2e` gateway smoke tests, mandatory automated review
before merge, and an explicit anti-inflation rule — "Tests prove behavior/regressions, not every
internal branch" ([AGENTS.md](https://github.com/openclaw/openclaw/blob/main/AGENTS.md)). The README
does not describe a benchmark suite ([README](https://github.com/openclaw/openclaw)).

The agent-quality evaluation lives in a **separate ecosystem**, and it is unusually mature:

- **ClawBench** (openclaw org, MIT) scores "the full stack — harness, config, and model — not just
  the LLM." Composite: 40% completion via deterministic verifiers (pytest, exit codes, file
  equality), 30% trajectory (read-before-write, self-verification, error recovery), 20% behavior
  (safety, communication), and **10% LLM judge that only contributes when deterministic completion
  exceeds 99.99%**. Reliability uses `pass^k`, Taguchi signal-to-noise, and bootstrap CIs. Core v1 is
  19 tasks distilled from a 40-task pool by signal-to-noise elimination
  ([github.com/openclaw/clawbench](https://github.com/openclaw/clawbench)).
- **Claw-SWE-Bench** (arXiv 2606.12344) defines a five-method adapter protocol (`create_agent`,
  `send_task`, `backup_session`, `delete_agent`, `get_docker_args`) and holds prompt, workspace,
  3600s budget, patch extraction, and evaluator fixed across five harnesses (OpenClaw, hermes-agent,
  ZeroClaw, Nanobot, GenericAgent). 350 instances, 8 languages, 43 repos; reports Pass@1 _plus_ USD
  cost, wall-clock, tokens, cache-hit rate, and a Pareto frontier
  ([arxiv.org/html/2606.12344v1](https://arxiv.org/html/2606.12344v1)).
- **WildClawBench** runs 60 tasks across OpenClaw, Claude Code, Codex CLI, and Hermes Agent in
  identical Docker containers, injecting ground truth and grading scripts only _after_ the agent
  finishes, explicitly "to separate model capability from harness scaffolding"
  ([internlm/WildClawBench](https://github.com/internlm/WildClawBench)).
- **ClawProBench** (102 scenarios) and **Claw-Eval** (300 human-verified tasks, 2,159 rubrics) make
  repeated-trial reliability the headline metric: ClawProBench's `FinalScore` blends `pass^3`,
  `pass@3`, and mean quality; Claw-Eval's primary metric is `Pass^3` — credit only if all three
  independent runs succeed ([ClawProBench](https://github.com/suyoumo/ClawProBench),
  [Claw-Eval](https://github.com/claw-eval/claw-eval)).

### Published negative results

Claw-SWE-Bench reports the sharpest one: a "bare adapter" minimal integration scored **19.1% Pass@1
with 69.1% Apply-Failed**, while the full adapter — which required the agent to _edit files_ rather
than emit a diff — reached **73.4%** on the same model and tasks. Stated limitations include
single-run aggregates with no multi-seed variance and too few harness×model cells for a clean
decomposition ([arxiv.org/html/2606.12344v1](https://arxiv.org/html/2606.12344v1)).

Security-side negatives are well documented: Cisco researchers found a third-party skill performing
data exfiltration and prompt injection without user awareness, and the skill registry's only
publishing barrier was a GitHub account older than one week
([Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)).

---

## Hermes

**"Hermes" is genuinely ambiguous, and both readings are real.** Nous Research ships _both_:

### (a) Hermes 4 — the model family

A family of hybrid reasoning models evaluated across mathematical reasoning, coding, knowledge,
comprehension, and alignment benchmarks, with weights released publicly
([arXiv 2508.18255](https://arxiv.org/abs/2508.18255)). The eval philosophy is the transferable part:
Nous treats **an RL environment as an implementation of an evaluation** and exploits that duality to
implement benchmarks inside **Atropos**, their RL environment manager. Each evaluation is a
_self-contained Python script_ holding core logic, scoring, and config defaults — accepting
duplication in exchange for transparency and modifiability, so a researcher can read and adapt one
eval without navigating a large codebase. Design principles include single-file evals, sample-level
logging of parsing and grading behavior, overlapped inference and scoring, a minimal OpenAI client to
reduce artifacts, and explicit error semantics
([Hermes 4 Technical Report](https://nousresearch.com/wp-content/uploads/2025/08/Hermes_4_Technical_Report.pdf)).

### (b) Hermes Agent — the harness

`NousResearch/hermes-agent`, "the agent that grows with you," is a self-improving agent harness with
40+ tools, six terminal backends (local, Docker, SSH, Singularity, Modal, Daytona), persistent
memory, FTS5 session search with LLM summarization, and a skills system framed as procedural memory
that the agent writes and improves from experience
([github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)).

The New Stack frames the OpenClaw/Hermes contrast as: OpenClaw bets on the **gateway** (breadth of
channels), Hermes bets on **memory** (learning a developer's work), and the contest is over the
control layer, not the model
([thenewstack.io](https://thenewstack.io/openclaw-hermes-agent-harness/)) — I could only retrieve
this framing via search snippet; the full article body did not render, so treat the detail as
**UNVERIFIED** beyond that thesis.

### Delegation

`delegate_task` takes `goal` (required), `context` (everything the child needs, because it starts
from a completely fresh conversation), `tasks` (array for parallel batch), `role` (`"leaf"` default =
cannot delegate further, or `"orchestrator"`), and `max_iterations` (default 50)
([delegation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md)).

Delegation is **process-level, not function-level**: each child gets its own conversation, its own
terminal session, and its own Python RPC. Only the final summary enters the parent's context — what
it did, what it found, files modified, issues hit. Live transcripts are written separately to
`~/.hermes/cache/delegation/live/<delegation_id>/task-<n>.log` for monitoring (same source), i.e.
**observability without context cost**.

Isolation is total: "Subagents start with a completely fresh conversation… They know only what
appears in `goal` and `context`." Children cannot call `delegate_task`, `clarify`, `memory`, or
`send_message` — blocking recursion, user-interaction deadlock, and concurrent memory writes
([DeepWiki](https://deepwiki.com/NousResearch/hermes-agent/5.7-subagent-delegation)).

Parallelism: 3 concurrent by default (`delegation.max_concurrent_children`), `max_spawn_depth: 1`
flat by default, with an explicit cost warning that depth 3 × 3 workers reaches 27 concurrent agents.
Over-sized batches return tool errors rather than silently queueing. Async mode (`background=true`)
returns a `delegation_id` immediately and surfaces completion as a new user turn; the full lifecycle
is spawn / check / steer / collect / cancel / list
([delegation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md),
[MarkTechPost, 2026-06-16](https://www.marktechpost.com/2026/06/16/hermes-agent-adds-asynchronous-subagents-so-delegated-work-no-longer-blocks-the-parent-chat/)).

### Published negative results — unusually candid

Hermes's own delegation guide names **anti-patterns**: do not delegate single tool calls, sequential
multi-step work that needs logic between steps, tasks needing user interaction (subagents have no
`clarify`), quick file edits, or long-running work needing session persistence
([delegation-patterns](https://hermes-agent.nousresearch.com/docs/guides/delegation-patterns)).

Issue #344 is a self-audit of the current architecture's limits: "Children work alone, can't talk to
each other, can't share state, and return a summary to the parent"; no dependency awareness (parallel
tasks all fire at once regardless of sequencing); shallow hierarchies; **no recovery — "if a child
fails, work is lost"**; no health monitoring; no result synthesis. The proposed fix is a **workflow
DAG engine with dependency tracking and topological execution**, checkpointing and retry, specialized
roles, and inter-agent cooperation
([issue #344](https://github.com/NousResearch/hermes-agent/issues/344)). Durability is also weak
today: background completions survive restart only if they finished before the crash; mid-flight
children become `unknown`
([delegation.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md)).

### Eval story

Hermes Agent ships a benchmark subsystem wired to Atropos with three tracks: **TBLite** (100-task
difficulty-calibrated CLI subset used as a fast proxy), **Terminal-Bench 2.0** (89 manually verified
tasks, Docker images on DockerHub for reproducible local eval), and **YC-Bench** (long-horizon CEO
simulation over a simulated one-year, hundreds of decision turns, starting from $200k capital).
Metrics go to Prometheus and Weights & Biases; the guidance recommends TBLite for iteration and a
**minimum of 3 seeds** for statistical reliability
([hermes-agent benchmark guide](https://trust.armalo.ai/blog/hermes-agent-benchmark-the-complete-guide)
— secondary source, so treat exact CLI command names as **UNVERIFIED**;
[hermes-agent repo](https://github.com/NousResearch/hermes-agent)).

Separately, `hermes-agent-self-evolution` applies DSPy + **GEPA** (Genetic-Pareto prompt evolution)
to optimize skills, prompts, and code, reading execution traces to understand _why_ something failed
rather than only _that_ it failed
([github.com/NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution)).
This is the one system in this survey with a closed loop from eval → automated prompt mutation →
re-eval.

---

## Comparative survey

| System                                                | Delegation contract (what goes down)                                                                                                                                                                                                                                                                                                                | Return contract (what comes up)                                                                                                                                                                                                                                | Context isolation                                                                                                                                                                                       | Control flow                                                                                                                                                                                                                                                  | Parallelism                                                                                                                                                                                                                                                                                            | Eval story                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenClaw**                                          | `sessions_spawn({task, taskName, context, runtime, model, thinking, thread})` — a task string plus runtime selection; `context: "isolated"` (fresh) or `"fork"` (branch parent transcript)                                                                                                                                                          | Non-blocking `{status, runId, childSessionKey}`; completion arrives as an event to a `sessions_yield`-ed parent turn; harness plugins return a typed `AgentHarnessAttemptResult`                                                                               | Caller decides per-spawn (`isolated` default). Tools stripped by tier; leaf subagents lose all session tools                                                                                            | Model-driven loop inside an embedded runtime; Gateway owns routing/policy/lifecycle deterministically                                                                                                                                                         | Yes. Defaults: 8 global concurrent, 5 children/session, depth 1. Sandbox inheritance enforced                                                                                                                                                                                                          | None in-repo beyond Vitest/e2e. Rich _external_ ecosystem: ClawBench, Claw-SWE-Bench, WildClawBench, ClawProBench, Claw-Eval                                                                                                                              |
| **Hermes Agent**                                      | `delegate_task({goal, context, tasks[], role, max_iterations})` — structured spec; `context` must carry everything because the child sees nothing else                                                                                                                                                                                              | Final summary text only (did / found / files modified / issues). Live transcript to a log file, not into parent context. Async returns `delegation_id`                                                                                                         | Absolute. Zero parent history. Parent decides what to include; child cannot ask (no `clarify`)                                                                                                          | Model-driven loop per agent; delegation is process-level (own conversation, terminal, RPC). No DAG today                                                                                                                                                      | Yes, 3 concurrent default, flat depth 1, ThreadPoolExecutor (sync) or daemon pool (async). Explicit 27-agent blowup warning                                                                                                                                                                            | Built-in benchmark subsystem: TBLite (100), Terminal-Bench 2.0 (89), YC-Bench (long-horizon). ≥3 seeds recommended. GEPA self-evolution loop                                                                                                              |
| **Anthropic research system / Claude Code subagents** | Objective + output format + tool/source guidance + explicit task boundaries. Vague briefs are documented as a failure                                                                                                                                                                                                                               | Findings returned to lead; large outputs go to an **artifact store** referenced by handle rather than passed through conversation                                                                                                                              | Separate context window per subagent; lead decomposes                                                                                                                                                   | Lead agent plans, records plan to memory, then spawns; model-driven                                                                                                                                                                                           | 3–5 subagents in parallel, each using 3+ tools in parallel; up to 90% research-time reduction claimed. Async deliberately avoided                                                                                                                                                                      | LLM-judge rubric (factual accuracy, citation accuracy, completeness, source quality, tool efficiency), 0.0–1.0 + pass/fail; ~20 seed queries; human eval retained                                                                                         |
| **OpenHands SDK (V1)**                                | `TaskAction`: `prompt: str` + `subagent_type` + `description` + optional `resume`. Nothing else crosses — a fresh conversation seeded only by `send_message(prompt)`. **Shared filesystem** (`workspace = parent working_dir`); LLM inherited by `model_copy`. (V0's `AgentDelegateAction` passed a structured `inputs: dict`; removed from `main`) | `TaskObservation` — final assistant text + `task_id`/`status`; a non-`FINISHED` terminal state returns a structured stop reason **plus partial output** so the parent isn't left with nothing                                                                  | Total for history, **shared for workspace** — the filesystem, not the transcript, is the medium                                                                                                         | Event-sourced: immutable append-only `EventLog`; agent = function from event history → next event. Condenser replaces the _first half_ of events with a summary using Cassandra-style tombstones, with soft (size) vs hard (context-window) triggers          | `tool_concurrency_limit` **defaults to 1**, with a candid warning that concurrent tools "share the conversation object, filesystem, and working directory, so mutations to shared state may race." `TaskToolSet` is sequential-blocking; the undocumented `DelegateTool` threads with `max_children=5` | **Best in survey.** Three-tier CI with cost budgets ($0.5–3/run LLM tests; $100–1000 benchmark runs); 26 named scenario tests incl. condenser + API-compliance; **required (`t*.py`) vs optional (`b*.py`) split**; dedicated `OpenHands/benchmarks` repo |
| **SWE-agent**                                         | **No delegation primitive** (code search for `subagent` returns 0 hits). Instead `RetryAgentConfig` runs N independent attempts and a reviewer/chooser LLM picks                                                                                                                                                                                    | A git patch (`preds.json`)                                                                                                                                                                                                                                     | Each attempt is a fresh trajectory; the chooser sees formatted trajectories. **Budget is shared across attempts**                                                                                       | Model-driven ReAct inside an attempt; the retry/chooser loop is **deterministic code**                                                                                                                                                                        | Batch-level only (`--num_workers`, staggered container startup)                                                                                                                                                                                                                                        | Excellent — they _are_ the benchmark (sb-cli, `--evaluate`), and publish **the field's best ablation table**                                                                                                                                              |
| **smolagents**                                        | `task: str` + `additional_args: dict`, injected into the code sandbox **as a Python function signature**. The prompt deliberately claims "this team member is a real human" to elicit verbose briefs                                                                                                                                                | A **string**, prompt-forced into 3 sections, with the warning "everything that you do not pass as an argument to final_answer will be lost." `provide_run_summary=True` appends a truncated memory dump                                                        | Complete by default; only `task` + `additional_args` cross                                                                                                                                              | Model-driven; `CodeAgent` writes Python that calls managed agents as functions                                                                                                                                                                                | `ToolCallingAgent` parallelizes via `ThreadPoolExecutor` (managed agents _are_ tools there); `CodeAgent` is sequential within a code block                                                                                                                                                             | A real harness (`run.py` + `score.ipynb`) on a **gated** dataset, but **no benchmark job in CI**                                                                                                                                                          |
| **OpenAI Agents SDK**                                 | **Two opposite contracts.** Handoff: "the new agent **receives the conversation history**" and **takes over the run**. `Agent.as_tool()`: "receives generated input" (a string, or Pydantic via `parameters=`), run as a nested `Runner.run()`                                                                                                      | Handoff: nothing — the handed-to agent finishes the run (`final_output` is typed `Any` because "handoffs can change which agent finishes"). as_tool: last message as `str`, or `custom_output_extractor`                                                       | Enforced **only** at the `as_tool` boundary. Handoffs hand over everything unless you write an `input_filter`. ⚠️ guardrails apply only to the first and last agent — middle specialists are ungoverned | Model-driven; `DEFAULT_MAX_TURNS = 10`. Deterministic escapes: `tool_use_behavior`, `StopAtTools`, `reset_tool_choice`                                                                                                                                        | **BYO `asyncio.gather`** — no scheduler, no global cap, no backpressure                                                                                                                                                                                                                                | **Essentially nothing.** Tracing is first-class; the only file named `eval` is 2.8 KB of hard-coded `raise ValueError` against one scripted demo. Zero published accuracy/latency/cost numbers                                                            |
| **Google ADK**                                        | `sub_agents` transfer passes **the literal same `InvocationContext`** (same session, state, history, `temp:` scope). `AgentTool` passes `{"request": "..."}` plus a **copy** of parent state under a separate `Runner`/session — and is now explicitly **"discouraged"** in favor of `mode='single_turn'` sub-agents                                | No typed return channel between workflow steps: **session state is the data bus** (`output_key` writes, `{templating}` reads; a missing key throws). `AgentTool` merges a `state_delta` back                                                                   | Branches isolate **history, not state** (`branch` is an event-history filter; `model_copy` is shallow so `session` is shared). The docs contradict themselves here; source resolves it                  | ⭐ **The clearest model/code split in the field.** Workflow agents determine sequence "**without consulting an AI model for assistance with the orchestration**," giving "deterministic and predictable execution patterns," while leaves may still be models | `ParallelAgent` runs concurrently but warns you must "manage concurrent access… using locks"; result order non-deterministic. ⚠️ Sequential/Parallel/Loop are all `@deprecated` in ADK 2.0 in favor of `Workflow`                                                                                      | ⭐ **Second best.** `adk eval` + evalsets; **`tool_trajectory_avg_score` with `EXACT`/`IN_ORDER`/`ANY_ORDER`**; ROUGE-1 response match; 13 criteria; **`NUM_RUNS = 2` by default**; **`adk conformance` record/replay** gating PRs                        |
| **Goose (AAIF)**                                      | `delegate` takes `instructions` and/or `source`+`parameters`, **plus a separate `context` field** for "background information, file contents, or constraints… that aren't part of the task instructions" — the only system that separates brief from background                                                                                     | Result directly, or a task id → `load()` (with `peek`/`cancel`); aggregate carries `execution_summary`. ⭐ Recipes add `response.json_schema` with a **forced-correction loop** — invalid output returns errors and the agent must fix it                      | Hard: "Delegates know only instructions + source content. **Delegates cannot coordinate. Same-file work = conflicts**"                                                                                  | Model-driven, with real deterministic gates: recipe `retry` + shell `success_check` (exit 0), which **resets message history to initial state** per attempt; plus per-turn turn-budget injection                                                              | Sequential by default; parallel **triggered by natural-language keywords** ("parallel", "simultaneously"). Caps: 10 subrecipe workers, 5 background delegates; subagents cannot spawn subagents                                                                                                        | **Thin.** The old `goose-bench` was **deleted as unused** ("I don't think we use it"); the current harness is ~4 files wrapping Harbor over Terminal-Bench 2, `runs/` gitignored. But ⭐ **the best-articulated eval philosophy** in the survey           |
| **Claude Code subagents**                             | ⭐ "**The only content you pass from parent to subagent is the Agent tool's prompt string**." Startup context = own system prompt + task message + CLAUDE.md hierarchy + git status + preloaded skills + sibling roster. Never: parent history, parent tool results, parent system prompt                                                           | Final message as the Agent tool result — **after an instruction-pattern scan** that neutralizes `<system-reminder>`-shaped text and `Human:`/`Assistant:` markers, because "a subagent may have read files, web pages, or command output you never reviewed"   | Fresh by default. **Forks** are the deliberate escape hatch: inherit the whole conversation, share the parent's prompt cache (cheaper), lose input isolation                                            | Model-driven. Above "a few delegated tasks per turn," docs redirect to a `Workflow` tool that "moves the orchestration into a script the runtime executes outside the conversation context"                                                                   | ⭐ **The most precisely specified limits anywhere**: 20 concurrent (default), 200 per session, **nesting off by default**. A v2.1.172–216 window shipped 5-deep nesting by default and it was **walked back**                                                                                          | **Nothing published** for subagents. Rigorous on contracts, silent on measurement                                                                                                                                                                         |
| **Roo Code (Boomerang / Orchestrator)**               | `new_task({message, mode})` — full instructions plus a mode selection; "must include all necessary context from the parent task"                                                                                                                                                                                                                    | `attempt_completion` result: "a concise yet thorough summary," explicitly "the source of truth" for parent tracking                                                                                                                                            | Complete isolation, own conversation history, no automatic inheritance                                                                                                                                  | Model-driven; Orchestrator mode deliberately lacks file read/write, MCP, and command execution to prevent context pollution                                                                                                                                   | Docs describe sequential delegate-and-resume; parallel **UNVERIFIED**                                                                                                                                                                                                                                  | Essentially nothing published as a harness benchmark                                                                                                                                                                                                      |
| **AutoGen (Microsoft)**                               | Shared broadcast message context. In `RoundRobinGroupChat` "all agents share the same context"; a Core handoff publishes a `UserTask` carrying the complete chat history                                                                                                                                                                            | `TaskResult` = _all_ messages produced by the team + token usage + termination reason                                                                                                                                                                          | **None by default**, and context persists across tasks until `reset()` is called                                                                                                                        | Spectrum: deterministic `RoundRobinGroupChat` vs LLM-driven `SelectorGroupChat`, with `selector_func`/`candidate_func` as code overrides. Magentic-One adds Task/Progress Ledgers                                                                             | Teams are turn-taking (serial); async actor runtime lives at the Core layer                                                                                                                                                                                                                            | **Real**: `agbench` — Docker isolation by default, `--repeat N`, `tabulate`, "designed to log everything." Evaluates _configurations_, not models                                                                                                         |
| **AG2**                                               | Message history + shared `ContextVariables`. Sequential Chat is the exception: a _summary carryover_ into the next chat                                                                                                                                                                                                                             | Chat result + mutated context variables + last agent; tools return `ReplyResult` naming the next target                                                                                                                                                        | Full history by default; Nested Chat and v1.0's `consulting` channel are the bounded cases                                                                                                              | Patterns (Default / Auto / RoundRobin / Random / Manual). Two declared transition types: LLM-judged `OnCondition` and **`OnContextCondition`, which fires on context-variable expressions with no LLM call**; relative evaluation order UNVERIFIED            | UNVERIFIED — no parallel fan-out primitive found; channels are turn-based                                                                                                                                                                                                                              | **Essentially nothing** shipped. AgentEval (Critic/Quantifier/Verifier, 2024) is the only artifact; no regression suite                                                                                                                                   |
| **LangGraph / LangChain**                             | **Two incompatible defaults ship in the same ecosystem.** Subagent-as-tool: "the task description is passed as a human message"; subagents are stateless. `langgraph-supervisor` / `-swarm` `create_handoff_tool`: "full message history … up to this point"                                                                                        | Subagent → final message as tool result (or a `Command` carrying extra state). Supervisor `output_mode`: `full_history` vs `last_message`; `create_forward_message_tool()` passes a worker's answer through verbatim. Send workers write to a shared state key | Explicit and configurable; subgraphs give true schema-level isolation ("none of these keys are shared with the parent graph state"). Developer decides                                                  | Drawn explicitly: "Workflows have predetermined code paths"; "Agents are dynamic and define their own processes." `Command` (`update`/`goto`/`graph`/`resume`) unifies both                                                                                   | **First-class.** Pregel supersteps; `Send` API for dynamic map-reduce when "subtasks cannot be predefined." Concurrent writes require reducers                                                                                                                                                         | **Strongest.** LangSmith datasets + evaluators, and three eval levels for graphs: final response, single step, and full trajectory via the `Run` object; plus single-node evaluation                                                                      |
| **CrewAI**                                            | **Most structured at the task layer, least at the delegation layer.** `Task` = `description` + `expected_output` + `context=[other_tasks]` + tools + `output_pydantic`/`output_json` + guardrail. But agent→agent delegation is three free-text strings: `Delegate work to coworker(task, context, coworker)`                                       | `TaskOutput` with `raw` / `pydantic` / `json_dict` / `summary`; artifacts via `output_file`; guardrails validate before proceeding                                                                                                                             | Task-graph scoped: a task sees only what its `context=[...]` supplies. Developer decides at authoring time, not the orchestrator at runtime                                                             | **Split by product**: Crews are model-driven (manager allocates); Flows are code-scheduled (`@start`/`@listen`/`@router`, `or_`/`and_`). Only `sequential` and `hierarchical` processes exist                                                                 | `async_execution=True` per task; parallel `@start()` methods; `akickoff()` native async; `akickoff_for_each()`; `asyncio.gather()` across crews. Warns about infinite delegation loops                                                                                                                 | **Essentially nothing**: `crewai test` runs _2 iterations by default_ against `gpt-4o-mini` and prints 1–10 per-task scores. No dataset abstraction, no reference outputs, no pass/fail gate                                                              |
| **Aider**                                             | N/A — single agent, no delegation primitive documented                                                                                                                                                                                                                                                                                              | N/A                                                                                                                                                                                                                                                            | N/A                                                                                                                                                                                                     | Model-driven edit loop                                                                                                                                                                                                                                        | N/A                                                                                                                                                                                                                                                                                                    | Strong _model_ benchmark (polyglot, 225 Exercism exercises, 2 attempts with test feedback, Docker-isolated), but the README says it is not a harness regression suite                                                                                     |

**Verification note:** every row above was checked against official docs, repo source, or the
project's own paper. Where a doc and its source code disagreed (ADK branch isolation; OpenHands V0
vs V1) the source was treated as authoritative and the disagreement is stated.

---

## Findings

**1. The field splits cleanly into two tiers with _opposite_ delegation defaults — and the tier that
measured itself switched sides.**

- **Prompt-string tier** (OpenClaw, Hermes Agent, Roo Code, OpenHands SDK V1, smolagents, Goose,
  Claude Code, Anthropic's research system, and LangChain's current `subagents` guidance): fresh
  context + explicit brief + summary-only return. Claude Code states it most plainly — "the only
  content you pass from parent to subagent is the Agent tool's prompt string." **Nine independent
  systems.** OpenHands V1 and Claude Code converged on the _same four field names_
  (`description`/`prompt`/`subagent_type`/resume-or-model) **and** the same Markdown-plus-YAML
  agent-definition format — convergence, not copying in one direction.
- **Shared-context tier** (AutoGen, AG2, `langgraph-supervisor`, `langgraph-swarm`, OpenAI handoffs,
  ADK `sub_agents` transfer): the child gets the full history or the literal same context object.
  AutoGen's teams share one broadcast context and _persist it across tasks_ until `reset()`;
  `create_handoff_tool` passes "full message history … up to this point"
  ([langgraph-swarm](https://github.com/langchain-ai/langgraph-swarm-py)); ADK's transfer hands over
  the same `InvocationContext`.

**Crucially, every system in the second tier publishes a caveat about it** — OpenAI: guardrails
don't follow the handoff chain; ADK: one-way-transfer lock-in, plus `AgentTool` now "discouraged";
LangChain: the supervisor "game of telephone" (finding 1b). Nobody in the first tier publishes an
equivalent regret. Two systems make the shared medium something other than the transcript: OpenHands
shares the **filesystem**, ADK shares **session state**.

LangChain ships both and has moved: its current recommended subagent pattern passes only "the task
description … as a human message" and describes subagents as **stateless**, with "all conversation
memory maintained by the main agent"
([subagents](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents)). BuildOS's
manifest-bounded assignment sits on the side that the measured evidence favors — see finding 2.

**1b. The single most transferable result in this survey.** LangChain benchmarked supervisor vs swarm
vs single-agent on a modified τ-bench (retail, 100 examples) plus **six synthetic distractor domains
of 19 tools each**. Findings: the single agent "falls off sharply when there are two or more
distractor domains" and burns more tokens as distractors grow; swarm slightly _beats_ supervisor on
both accuracy and tokens; and the supervisor's core defect is a translation layer — "the sub agents
cannot respond to the user directly in the supervisor architecture," a "game of telephone" that loses
and paraphrases information. Three fixes produced "nearly 50% increase in performance": **(1) remove
handoff messages from context, (2) provide a `forward_message` passthrough tool, (3) change tool
naming conventions**
([langchain.com/blog/benchmarking-multi-agent-architectures](https://www.langchain.com/blog/benchmarking-multi-agent-architectures)).
Two of the three wins are _subtractive_, and the third is "let the specialist's words reach the user
unrewritten." That is a direct warning for any CEO/orchestrator that synthesizes over specialist
output — which BuildOS's does.

**2. The brief is the documented failure point, not the loop.** Anthropic states that "research the
semiconductor shortage" was too vague and caused subagents to duplicate each other's searches; the
fix was mandates specifying search strategies, source types, and coordination protocols
([anthropic.com/engineering](https://www.anthropic.com/engineering/multi-agent-research-system)).
Hermes says the same thing structurally — "the parent must pass all necessary details explicitly."
Roo Code says the same. Three independent projects landing on identical guidance is a strong signal.

**3. Capability stripping and depth-1 defaults are universal.** Leaf subagents lose recursion, user
interaction, and memory/state writes, everywhere: OpenClaw strips `gateway`/`cron`/session tools;
Hermes blocks `delegate_task`/`clarify`/`memory`/`send_message`; Goose subagents "cannot spawn further
subagents… to prevent infinite recursion"; Claude Code withholds the `Agent` tool from subagents
entirely while nesting is off. **Every system defaults to depth 1** and warns about blowup above it —
and Claude Code is the cautionary tale, having shipped 5-deep nesting by default for ~44 versions
before walking it back.

**4. Non-blocking delegation with event-driven resumption is the 2026 convergence point.** OpenClaw's
`sessions_spawn` + `sessions_yield` ("instead of building poll loops"), Hermes's June-2026 async
subagents, Goose's `delegate(async)` → `load()`/`peek`, and Claude Code's background-by-default are
four independent arrivals at the same design. Anthropic's research system is the outlier and says
why: async "adds challenges in result coordination, state consistency, and error propagation."

**5. The harness tier is entirely model-driven; the framework tier is where deterministic control
lives.** OpenClaw and Hermes both let the model decide when and what to delegate, and deterministic
scheduling appears only as _roadmap_ (Hermes issue #344 proposes exactly a "workflow DAG engine with
dependency tracking and topological execution"). The frameworks draw the line explicitly — LangGraph:
"Workflows have predetermined code paths… Agents are dynamic and define their own processes"
([workflows-agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)); CrewAI splits
it by product (Crews model-driven, Flows code-scheduled); AutoGen offers
`selector_func`/`candidate_func` as code overrides on model-driven selection. The cheapest idea worth
stealing is **AG2's two condition types**: `OnCondition` is LLM-judged (the agent "uses the LLM to
evaluate each condition prompt against the messages"), while `OnContextCondition` transitions on
context-variable expressions "without requiring an LLM call" — plus `set_after_work()` as the
fallback when neither fires
([AG2 handoffs](https://docs.ag2.ai/latest/docs/user-guide/advanced-concepts/orchestration/group-chat/handoffs/)).
The docs do **not** state which type is evaluated first, so read this as _two declared tiers of
transition condition_, not a guaranteed cheap-before-expensive ladder (**ordering UNVERIFIED**).
BuildOS arrived at a similar shape ad hoc — the router handles a supplied URL in regex before any
model call — without declaring it as a typed condition tier.

**6. Self-evaluation is nearly absent at every tier; harness _comparison_ is a thriving third-party
industry.** Neither OpenClaw's nor Hermes's repo runs an agent-quality regression suite on its own
merges. AG2 ships essentially nothing. CrewAI's `crewai test` runs **2 iterations by default against
`gpt-4o-mini`** and prints 1–10 scores with no dataset abstraction, reference outputs, or pass/fail
gate ([crewai testing](https://docs.crewai.com/en/concepts/testing)) — a smoke test, not an eval
harness. Only **`agbench`** and **LangSmith** clear the bar, while five independent benchmarks exist
purely to compare harnesses. Two standards worth adopting: `agbench`'s three principles — **repetition**
(variance is itself the metric: "LLMs are stochastic, and in many cases, so too is the code they
write"), **isolation** ("isolates each task in its own Docker container… ensures that all runs start
with the same initial conditions," preventing ordering effects), and **instrumentation** ("designed
to log everything, and to compute metrics from those logs") — plus the framing that it evaluates
"_specific_ end-to-end configurations of agents (as opposed to evaluating a model or cognitive
framework more generally)"
([AutoGenBench](https://microsoft.github.io/autogen/0.2/blog/2024/01/25/AutoGenBench/)); and
LangSmith's three eval levels for graph agents — end-to-end final output, **intermediate steps**
("it is valuable to evaluate not only the final output of an agent but also the intermediate steps it
has taken"), and evaluating a single node directly "to save time and costs"
([evaluate-graph](https://docs.langchain.com/langsmith/evaluate-graph); the page does not itself use
the word "trajectory"). BuildOS clears repetition and instrumentation, and scores only the final
response.

**7. Repeated-trial reliability has replaced single-run accuracy as the headline metric.** Claw-Eval's
primary metric is `Pass^3` (all three runs must succeed); ClawProBench blends `pass^3`, `pass@3`, and
mean quality; ClawBench adds Taguchi S/N and bootstrap CIs; ADK hard-codes `NUM_RUNS = 2`; Hermes
recommends ≥3 seeds; `agbench` treats variance as itself a metric. Single-run reporting — which
Claw-SWE-Bench does and names as a limitation — is now recognized as a defect.

**8. Trajectory scoring is rising and the LLM judge is being demoted.** ClawBench allocates 40%
completion / 30% trajectory / 20% behavior / \*\*10% judge, gated behind deterministic completion

> 99.99%\*\* — the strongest published statement of "machine gate first, judge second." ADK gives the
> best-designed trajectory metric: `tool_trajectory_avg_score` with `EXACT` / `IN_ORDER` / `ANY_ORDER`
> strictness, defaulting to 1.0 (perfect match) with a 0.8 ROUGE-1 response-match floor, and its own
> CI guidance recommends exactly these two "because they are fast, predictable, and suitable for
> frequent automated checks."

**9. On judges, the field disagrees with itself.** Anthropic reports that "a single LLM call with a
single prompt… was the most consistent and aligned with human judgements," having found multiple
specialized judges worse — and separately advises starting with "about 20 queries representing real
usage patterns" rather than waiting for hundreds. The broader 2026 literature pushes the other way:
panels to break self-preference bias, with human-agreement thresholds (Krippendorff's α ≥ 0.80) as
the ship gate ([orq.ai](https://orq.ai/blog/llm-juries-in-practice)). Unresolved — and directly
relevant, since BuildOS runs a 3-judge panel.

**9b. ⭐ The best-stated anti-Goodhart discipline comes from Goose.** "Coding-agent benchmarks are
almost designed to trigger [Goodhart's law]. The tasks are public, the result is one number, and the
leaderboard inevitably fills up with harnesses that are, often without meaning to be, overfit to the
benchmark… **The signal is a pattern of failures.**" Hence: "we usually benchmark with Sonnet rather
than the strongest model available… **We want enough failures left on the table to see what support
the agent is missing.**" And the closing line worth pinning above any eval harness: "**That is when a
benchmark is useful: when it stops being a leaderboard and starts being a bug report**"
([Goose](https://goose-docs.ai/blog/2026/06/17/self-improving-agents-need-humans)). This is the exact
failure BuildOS already experienced when four prompt passes turned the frozen eight into a training
set.

**10. The harness dominates the model, quantitatively.** "Stop Comparing LLM Agents Without
Disclosing the Harness" reports 20–80 percentage-point swings for the _same model_ under different
harness configurations, and argues the harness often matters more than the model
([arXiv 2605.23950](https://arxiv.org/pdf/2605.23950)). Claw-SWE-Bench's bare-adapter result (19.1% →
73.4% from integration quality alone) is the cleanest single demonstration.

**11. Divergence: what the delegation boundary _is_.** Hermes says a subagent is a process (own
conversation, terminal, RPC). OpenClaw says it can be an entirely different _vendor's harness_ over
ACP. Roo Code says it is a mode. Anthropic says it is a context window. These are materially
different bets about how much sovereignty a specialist gets.

**12. "Adaptive orchestration" is a named pattern, and BuildOS is doing it.** The harness-engineering
community index classifies three delegation strategies — plan-then-execute, role-specialized teams,
and **adaptive orchestration: task-specific topology selection (parallel, sequential, hierarchical)
rather than a fixed pipeline** — alongside "permissions as structured code, not natural-language
prompts" and "context as a finite, curated resource"
([awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering)). BuildOS's
post-audit design sits squarely in that lane.

**13. Routing accuracy is its own benchmark genre, and ~90% is roughly where the bar sits.**
RouterEval, ACE-Router's Agent Route Benchmark (~91.6% agent-selection accuracy), AgentGate (3,200
instances split 2,400/400/400 train/val/test), and a trained SWE router at ~76% on held-out
SWE-bench Verified all exist ([ACE-Router](https://arxiv.org/pdf/2601.08276),
[RouterEval](https://www.alphaxiv.org/abs/2503.10657),
[AgentGate](https://arxiv.org/pdf/2604.06696),
[Applied Compute](https://www.appliedcompute.com/research/training-an-agentic-router); figures are
search-snippet-derived, **medium confidence**). Two implications: BuildOS's ≥90.3% route bound is
well-calibrated rather than arbitrary, and a formal train/val/test split is standard in this genre —
exactly the discipline the frozen-eight corpus lacked.

**14. "Reads parallelize; writes do not" is the field's clearest parallelism boundary.** LangChain
states it directly: "Read actions are inherently more parallelizable than write actions," because
writes complicate "effectively communicating context between agents and then merging their outputs
coherently," and "some domains that require all agents to share the same context or involve many
dependencies between agents are not a good fit for multi-agent systems today"
([how-and-when](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)). Anthropic
agrees from the other side: subagents "excel at problems that can be divided into parallel strands of
research, but are less effective for tightly interdependent tasks such as coding," and it explicitly
flags **context-centric decomposition** (planner/implementer/tester) as an anti-pattern whose
coordination overhead exceeds execution cost — "work should only split where context can be truly
isolated"
([claude.com](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)).
BuildOS's Phase A is read-only by construction, so its parallel lane is on the safe side of this
line; every mutation scenario it defers to Phase B is on the unsafe side.

**15. Architectural churn is the norm, which argues for BuildOS's "parallel system, not a refactor"
stance.** Microsoft AutoGen is in maintenance mode, pointing new users at Microsoft Agent Framework
([repo](https://github.com/microsoft/autogen)); AG2 v1.0 replaced the Classic model wholesale —
`ConversableAgent` + `GroupChat`/swarms/nested chats became `Agent` + a Network (hub + channels), and
the README states v1.0 "is **not** a drop-in upgrade from Classic"
([AG2 README](https://raw.githubusercontent.com/ag2ai/ag2/main/README.md)); LangChain moved
chains/retrievers/community into `langchain-classic`; CrewAI's 2026 changelog removed
`CodeInterpreterTool`, deprecated `CrewAgentExecutor`, made tool-result caching opt-in (an admission
the default was wrong), and added "automatic `root_scope` for hierarchical memory isolation" — i.e.
hierarchical memory was leaking ([changelog](https://docs.crewai.com/en/changelog)). No multi-agent
abstraction in this survey has survived two years unchanged. Relatedly, the _order_ of failure
discovery is consistent across projects — context leakage first, then coordination, then durability —
and BuildOS is at stage one, which is the right place to be.

**16. ⭐ The strongest contrarian evidence in the survey: scaffolding depreciates as models improve.**
The Princeton/Stanford team that _invented_ the agent-computer-interface thesis shipped a successor
that walks it back. mini-swe-agent's README: "Back then, we placed a lot of emphasis on tools and
special interfaces for the agent. However, one year later, as LMs have become more capable, **a lot
of this is not needed at all** to build a useful agent." It has no tools other than bash, a completely
linear history, and `subprocess.run` per action — ~100 lines — and reports **>74% on SWE-bench
Verified** against the original paper's 12.47% full-set / 18.0% Lite
([mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent),
[mini-swe-agent.com](https://mini-swe-agent.com/latest/)). Model improvement confounds the numbers,
but the _authors' own stated conclusion_ is the finding. Read against BuildOS: part of the workflow
lane's advantage may be scaffolding compensating for a weak control-lane model
(`deepseek-v4-flash`), and would shrink under a stronger one. **This is the most important external
challenge to the agent-first thesis, and the harness can test it cheaply** — re-run one scenario pair
with a stronger control model.

**16b. But on _orchestration specifically_, the evidence runs the other way, and it is
one-directional.** Google's ADK 2.0 retrospective: LLMs are "frequently tasked with execution
orchestration—handling tasks like routing, scheduling, and error handling that **traditional code
already excels at**. While they can get the job done, they are slow, expensive, and exhibit variance"
([Why we built ADK 2.0](https://developers.googleblog.com/why-we-built-adk-20/)). OpenAI:
"orchestrating via code makes tasks more deterministic and predictable, in terms of speed, cost and
performance"
([multi_agent.md](https://github.com/openai/openai-agents-python/blob/main/docs/multi_agent.md)).
LangGraph and CrewAI Flows exist for the same reason. Reconciliation: **shrink the scaffolding
_inside_ an agent; keep the scaffolding _between_ agents.** BuildOS's split — deterministic workflow
engine, thin specialists — is on the right side of both claims.

**16c. ADK is BuildOS's closest architectural analog and reads as a preview of Phase B.** Same thesis
(code schedules, models are leaves), same primitives (sequential/parallel/loop over typed state) —
and it has already hit the failure modes BuildOS has not: shared-state races in parallel branches
("manage concurrent access… using locks"), a `LoopAgent` that "does **not** inherently decide when to
stop looping," a docs-vs-source contradiction about what parallel branches actually isolate, and a
2.0 rewrite deprecating all three workflow agents. Its published 2.0 landmines are the most concrete
available forecast of what a durable BuildOS kernel will run into.

---

## Direct comparison to BuildOS

| Pattern                                       | What BuildOS does                                                                                                  | Verdict                                                                                                                                                                                                                                                                                                                       | Cost to change                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation contract                           | Immutable bounded assignment from a manifest defining context, skills, tools, permissions, result contract         | **matched** — same shape as Hermes `delegate_task`, but manifest-declared rather than model-composed at call time, which is stricter                                                                                                                                                                                          | none                                                                                                                                            |
| Return contract                               | Typed, versioned artifacts carried between steps, "artifacts over transcripts"                                     | **matched** — Anthropic's artifact store and Hermes's out-of-band live logs are the same idea; BuildOS types and versions them, which is stronger                                                                                                                                                                             | none                                                                                                                                            |
| Context isolation                             | Bounded slice per manifest; Librarian builds a deterministic context packet from a frozen snapshot with **no LLM** | **novel — unproven** — no surveyed OSS harness has a code-only, deterministic context builder; all rely on the parent model writing the brief                                                                                                                                                                                 | already built; risk is that a code-built packet under-serves open-ended asks                                                                    |
| Control flow                                  | Models propose, code validates and schedules; topology derived from observable request features                    | **ahead** — this is precisely what Hermes issue #344 lists as missing and proposes to build                                                                                                                                                                                                                                   | none                                                                                                                                            |
| Deterministic plan validation / DAG           | Workflow engine validates plans, schedules ready steps, enforces budgets                                           | **ahead of the harness tier** (Hermes lists this as unbuilt roadmap); **matched** by LangGraph's Pregel supersteps + `Send` and by CrewAI Flows                                                                                                                                                                               | none                                                                                                                                            |
| Orchestrator re-synthesizes specialist output | CEO synthesizes final answer from specialist results                                                               | **behind — measured risk.** LangChain's τ-bench study attributes supervisor's loss to exactly this "game of telephone"; a `forward_message`-style passthrough was part of a ~50% gain                                                                                                                                         | low: add a pass-through path so a single-specialist result can reach the user unrewritten, and instrument how often synthesis changes substance |
| Cheap-check-before-LLM-check                  | Router handles a supplied URL in regex before any model call                                                       | **matched in spirit, not declared** — AG2 gives this a name and a type (`OnContextCondition`, no LLM call) alongside LLM-judged `OnCondition`                                                                                                                                                                                 | low: declare it as a typed condition tier rather than special-casing URLs                                                                       |
| Eval granularity                              | Final response + machine acceptance checks                                                                         | **behind** — LangSmith publishes end-to-end, intermediate-step, and single-node evaluation; ClawBench weights trajectory at 30% of score                                                                                                                                                                                      | medium: add step-level assertions (did the librarian run before the researcher?) — the harness already captures the traces                      |
| Process isolation in the eval harness         | In-process, by design for Phase A                                                                                  | **behind** `agbench`'s "freshly-initialized docker containers" and WildClawBench's per-task containers — but deliberately, and correctly, deferred                                                                                                                                                                            | n/a for Phase A                                                                                                                                 |
| Parallelism                                   | `Promise.all` over compiled stage steps                                                                            | **matched on capability, behind on governance.** Every mature system ships explicit caps: Claude Code 20 concurrent / 200 per session / nesting off; OpenClaw 8/5/depth-1; Hermes 3/depth-1; Goose 10 workers / 5 background; OpenHands defaults `tool_concurrency_limit` to **1**. BuildOS publishes no cap                  | low: add caps + a blowup guard before Phase B                                                                                                   |
| Delegation payload shape                      | Manifest-bounded assignment                                                                                        | **matched, and on the majority side** — nine systems converged on prompt-string-plus-brief. Worth noting Goose is the only one with a **separate `context` field** distinct from the task instructions, which is closer to BuildOS's manifest+packet split than anything else                                                 | none                                                                                                                                            |
| Untrusted-output handling                     | Judges told to treat both responses as untrusted quoted content                                                    | **matched, and unusually good company** — Claude Code scans subagent reports for instruction-shaped text before the parent reads them, on exactly this threat model. BuildOS applies it at the judge; Claude Code applies it at the orchestrator                                                                              | low: consider applying the same scan to specialist→CEO returns in Phase B                                                                       |
| Trajectory assertions                         | None — final answer + acceptance checks                                                                            | **behind** — ADK's `tool_trajectory_avg_score` offers `EXACT` / `IN_ORDER` / `ANY_ORDER`, so "librarian before researcher, extras allowed" is expressible. Binary exact-match is why most teams abandon trajectory evals                                                                                                      | low: `IN_ORDER` over the compiled stage is a near-free addition                                                                                 |
| Repeat-runs policy                            | 9 route calls; 3 runs per lane                                                                                     | **matched** — ADK hard-codes `NUM_RUNS = 2` as a default; Hermes recommends ≥3 seeds; `agbench` treats variance as the metric                                                                                                                                                                                                 | none                                                                                                                                            |
| Record/replay regression gate                 | None                                                                                                               | **behind** — `adk conformance test` records LLM requests/responses/tool calls to a golden baseline and replays to detect drift without a live model, gating PRs. This is the cheapest possible guard against the prompt-tuning regressions that already bit this project                                                      | medium, high value                                                                                                                              |
| Blocking vs non-blocking eval gates           | All checks are blocking                                                                                            | **behind** — OpenHands splits `t*.py` task tests (block releases) from `b*.py` behavior tests ("track quality improvements and don't block releases"). BuildOS's required/non-required acceptance-check split is the same idea applied _within_ a run, not to the release gate                                                | low                                                                                                                                             |
| Deliberately weak eval model                  | Control lane pinned to `deepseek-v4-flash`                                                                         | **accidentally matched** — Goose deliberately benchmarks with Sonnet rather than the strongest model: "We want enough failures left on the table to see what support the agent is missing." BuildOS gets the diagnostic benefit but has not claimed it as a design choice, and it is also the main confound behind finding 16 | none; but state it as intent and add one strong-model pair                                                                                      |
| Non-blocking delegation / resumption          | In-process `Promise.all`, synchronous within a stage                                                               | **behind** the async-subagent convergence (OpenClaw `sessions_yield`, Hermes async). Phase A explicitly defers durability                                                                                                                                                                                                     | medium — this is Phase B work, correctly sequenced                                                                                              |
| Recovery / durability                         | Explicitly out of Phase A scope; safety gate forbids blind replay of non-idempotent ops                            | **ahead in intent** — Hermes admits "if a child fails, work is lost"; **behind in implementation** since nothing is built                                                                                                                                                                                                     | high (Phase B)                                                                                                                                  |
| Capability stripping                          | "No specialist can add children/permissions/scope/budget"                                                          | **matched** — identical to OpenClaw's leaf-tool stripping and Hermes's blocked tool list                                                                                                                                                                                                                                      | none                                                                                                                                            |
| Machine gate before judge                     | Required-acceptance-check failure blocks a workflow win regardless of judge preference                             | **matched** — ClawBench's judge is gated behind deterministic completion >99.99%. Independent convergence; strong validation of the design                                                                                                                                                                                    | none                                                                                                                                            |
| Judge design                                  | 3 pinned judges, majority vote, validated against a human at ≥7/9                                                  | **matched but contested** — Anthropic found a single well-prompted judge more human-aligned; the panel literature disagrees. BuildOS's human-validation gate is better than most                                                                                                                                              | low: report single-judge-vs-panel agreement as a diagnostic                                                                                     |
| Repeated-trial reliability                    | 9 route calls/scenario scored individually; 3 runs per lane per scenario                                           | **matched on sampling, behind on metric** — the field reports `pass^k` (all-runs-must-succeed); BuildOS reports win counts, not run-level stability                                                                                                                                                                           | low: add a `pass^3` line per scenario                                                                                                           |
| Cost/latency reported alongside accuracy      | Pre-registered cost and p50/p95 latency bounds                                                                     | **matched** — Claw-SWE-Bench reports USD, wall-clock, tokens, cache-hit rate on the same table                                                                                                                                                                                                                                | none                                                                                                                                            |
| Harness disclosure                            | Prompt/world-card/model/corpus/blind-mechanic all SHA-256 pinned, results committed                                | **ahead** — this exceeds what arXiv 2605.23950 asks for as a reporting standard                                                                                                                                                                                                                                               | none                                                                                                                                            |
| Route-accuracy bound calibration              | Pre-registered ≥65/72 (90.3%)                                                                                      | **matched** — dedicated agent-routing benchmarks report ~91.6% for a purpose-built router, so the bound is well-calibrated, not arbitrary (medium confidence on the external figure)                                                                                                                                          | none                                                                                                                                            |
| Corpus split discipline                       | 8 frozen scenarios (burned as a training set), then 5 held-out added                                               | **behind the routing-benchmark genre** — AgentGate-style work uses explicit train/val/test splits from the start; BuildOS added a held-out set only after contamination                                                                                                                                                       | low: formalize the split and size the held-out set to the decision it must support (5 cases cannot resolve a 90% bound)                         |
| Held-out corpus after training-set burn       | 5-case held-out set frozen; fifth tuning pass forbidden                                                            | **ahead of the OSS tier** — no surveyed harness documents corpus-contamination discipline at all                                                                                                                                                                                                                              | none                                                                                                                                            |
| Cross-harness comparability                   | Control lane = own production endpoint only                                                                        | **behind** — WildClawBench/Claw-SWE-Bench fix prompt, workspace, budget, and evaluator so heterogeneous harnesses are comparable; BuildOS compares only to itself                                                                                                                                                             | medium: worth doing only if BuildOS ever wants an external claim                                                                                |
| Protocol-level specialist boundary            | Specialists are in-process TypeScript roles                                                                        | **behind (deliberately)** — OpenClaw's ACP lets a subagent be Claude Code or Codex. Not needed at Phase A, but a real ceiling later                                                                                                                                                                                           | high                                                                                                                                            |
| Self-improvement loop from eval traces        | None                                                                                                               | **behind** — Hermes's GEPA reads traces to infer _why_ a run failed and mutates prompts, with a second eval pass gating bad mutations                                                                                                                                                                                         | high; and dangerous given the corpus-burn history                                                                                               |

---

## Open questions

1. **Panel or single judge?** Anthropic's finding (single prompt most human-aligned) directly
   contradicts BuildOS's 3-judge panel and the panel literature. Cheapest resolution: BuildOS already
   collects per-judge scores — report each judge's standalone agreement with DJ alongside the panel's.
   If one judge beats the panel at ≥7/9, that is a finding worth publishing.
2. **Is `pass^3` the right gate for the workflow lane?** Three runs per scenario already exist. A
   scenario where the workflow wins 2/3 and loses 1/3 is currently a "win"; under the field's
   emerging standard it is a reliability failure. Does the decision rule change if scored that way?
3. **Does the deterministic Librarian survive contact with open-ended asks?** No OSS harness builds
   context without an LLM. This is BuildOS's most novel claim and its least externally validated one.
4. **Should the specialist boundary become a protocol?** OpenClaw's ACP suggests the long-run
   equilibrium is that a specialist is a separately-governed process. In-process TypeScript roles are
   right for Phase A but foreclose heterogeneous specialists later.
5. **Does BuildOS's CEO synthesis lose information the way LangChain's supervisor did?** This is the
   most actionable open question in the chapter. LangChain measured the loss and fixed ~50% of the
   gap partly by letting specialists' output reach the user unrewritten. BuildOS's blind A/B compares
   _final answers_, so a synthesis-induced loss would show up as a workflow loss without ever being
   attributed. Cheap diagnostic: for each workflow run, also score the raw specialist output.
6. **Should distractor scenarios be added to the corpus?** LangChain's finding — the single agent
   only falls off "when there are two or more distractor domains" — implies that a corpus of
   _clean_ scenarios systematically understates the multi-agent advantage. BuildOS's eight scenarios
   come from real transcripts, which is better than synthetic, but nothing in the description
   deliberately varies irrelevant-context load. If the workflow lane loses, distractor density is a
   confound worth ruling out before calling Stop.
7. **What does a concurrency blowup look like in BuildOS?** Both priority targets ship explicit caps
   and warn about them. Phase A's `Promise.all` has no documented cap.
8. **Does the workflow advantage survive a stronger control model?** Finding 16 is the sharpest
   external threat to the whole thesis: the SWE-agent authors concluded their own scaffolding was
   largely unnecessary a year later. BuildOS's control lane is pinned to `deepseek-v4-flash`. One
   extra pair per scenario on a frontier control model would tell you whether the workflow lane is
   adding capability or compensating for a weak baseline. **This is the highest-value cheap
   experiment identified in this chapter.**
9. **Is `crewai test`-grade scoring a fair floor?** Worth internalizing that the bar in this field is
   low: the most popular agent SDK (OpenAI, 28k stars) publishes zero benchmark numbers, and CrewAI's
   "test" command is two runs against `gpt-4o-mini` printing 1–10 scores. BuildOS's harness is
   already well above the field median — the risk is over-indexing on rigor relative to the decision
   it must support (nine pairs is a small denominator for a 6/9 threshold).

---

## Confidence

**High confidence** (fetched primary docs, multiple corroborating sources):

- OpenClaw's identity, gateway architecture, harness plugin contract, `sessions_spawn`/`sessions_yield`
  semantics, subagent tool stripping, concurrency defaults, and ACP external-harness delegation.
- Hermes Agent's `delegate_task` contract, total context isolation, blocked-tool list, concurrency
  defaults, async lifecycle, and its own published limitations (issue #344 is explicit and primary).
- Hermes 4 / Atropos eval-as-RL-environment duality and single-file eval philosophy.
- Anthropic's delegation guidance, quantitative token claims, and negative results.
- The existence and design of ClawBench, Claw-SWE-Bench, WildClawBench, ClawProBench, Claw-Eval.
- LangGraph/LangChain, AutoGen, AG2, and CrewAI delegation/return/isolation/control-flow/parallelism
  contracts and eval stories, all sourced from official docs and repos (verbatim quotes retained).
- LangChain's τ-bench benchmarking result and the three fixes, from LangChain's own blog.
- OpenHands SDK, SWE-agent, smolagents, OpenAI Agents SDK, Google ADK, Goose, and Claude Code
  contracts — sourced from official docs **and repository source files** (schemas, defaults, and
  docstrings quoted directly), which is why several rows correct what the prose docs imply.
- Anthropic's seven named multi-agent failures and the 15× token figure.

**Corrections made during verification** (worth noting, because they show where secondary sources
mislead):

- My initial OpenHands row said parent history flows down. **Wrong for V1** — `TaskAction` carries a
  prompt string; the shared medium is the _filesystem_. V0's `AgentDelegateAction` did pass a
  structured `inputs: dict`, and it has been removed from `main`.
- An earlier draft claimed AG2 evaluates `OnContextCondition` before `OnCondition`. The docs do not
  say that; only the _existence_ of a no-LLM condition type is verified.
- An earlier draft attributed a v0.9 Swarm deprecation to AG2. Not in the README; removed.
- `docs.openhands.dev/sdk/guides/agent-delegation` returns 404 and was renamed to `task-tool-set`;
  `block/goose` now redirects to `aaif-goose/goose` (donated to the Linux Foundation's Agentic AI
  Foundation); `google.github.io/adk-docs` redirects to `adk.dev`; SWE-agent is maintenance-only.

**Medium confidence:**

- hermes-agent's exact benchmark task counts and Atropos wiring — the detailed guide is a secondary
  blog, and I could not open the primary docs page. Exact CLI command names are **UNVERIFIED**.
- OpenClaw star counts (two sources give 247k in March and ~384k now; both are time-stamped snapshots).
- OpenHands SDK delegation detail — I read the docs summary but did not verify parallel delegation.

**Low confidence / explicitly unverified:**

- The New Stack's OpenClaw-vs-Hermes article body. Only the headline thesis was retrievable; the
  article's technical claims are **UNVERIFIED**.
- OpenClaw's original name. The repo README and search results say Clawdbot/Moltbot; Wikipedia says
  it launched as "Warelay" from an earlier project called "Clawd." Reporting is inconsistent.
- "Inside the Scaffold" (arXiv 2604.03515) and "From Model Scaling to System Scaling" (arXiv
  2605.26112) — both PDFs extracted poorly. Their existence and titles are verified; their detailed
  findings are **UNVERIFIED** and are not relied on above.
- Roo Code parallel subtask support: **UNVERIFIED**.
- Whether an internal Anthropic eval harness exists for Claude Code subagents — **UNVERIFIED**;
  nothing is published.
- Goose's position on the public Terminal-Bench leaderboard — **UNVERIFIED**.
- OpenAI's launch-blog rationale for the Agents SDK: `openai.com/index/new-tools-for-building-agents/`
  returns HTTP 403 and was not fetched — **UNVERIFIED**.
- mini-swe-agent's >74% vs SWE-agent's 12.47% is **not** a controlled comparison (different models,
  different years). The _authors' stated conclusion_ is what finding 16 rests on, not the delta.
- AG2 parallel sub-agent fan-out: no primitive found in docs — **UNVERIFIED**, not "absent."
- AG2 v1.0's own eval/regression harness: the README references an "Evaluation" guide but the
  evaluation blog category 404'd — **UNVERIFIED**.
- Magentic-One's GAIA/WebArena scores and Open SWE's SWE-bench scores are not published on the pages
  checked — **UNVERIFIED**.
- The internal judging mechanism behind `crewai test`'s 1–10 scores — **UNVERIFIED** (docs describe
  the output, not the scorer).
- ACE-Router's 91.6% figure is search-snippet-derived; the PDF extracted poorly — **medium
  confidence**.

**Coverage:** all named target systems were surveyed. Not covered: Cline (only Roo Code was checked),
Microsoft Agent Framework (AutoGen's successor), and ADK's non-Python implementations.
