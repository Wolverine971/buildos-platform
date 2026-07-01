---
name: Context Engineering For Agent Work
description: >-
    Root skill for designing the context an AI agent works with — selecting what files, docs, memories, and tool outputs to load, structuring project context as markdown with frontmatter, stage-gating workflows, auditing prompt bloat, and right-sizing evals. Use when the user wants to set up or structure context for an agent, convert messy notes into an AI-readable project data layer, reduce a bloated system prompt, build or debug an agent harness, or figure out why an agent seems confused, ignores rules, or behaves unreliably.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: meta # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - context-engineering-for-agent-work
    - docs/research/youtube-library/skill-drafts/context-engineering-for-agent-work/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/context_engineering_for_agent_work/SKILL.md
---

# Context Engineering For Agent Work

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: strategy, so Judgment carries the weight (density heuristics, the prompt-bloat
  audit, the eval rules); Procedure holds the ordered workflow and the stage-gated pattern that operationalize
  those decisions. No Routing block: this is a standalone root skill that defers to no sibling.
-->

## Identity

Use this skill when an agent needs to decide what context to load, how to structure it, and how to keep an AI workflow reliable. Context engineering is not "more tokens." It is higher information density, deterministic selection, and explicit workflow control. When an agent seems confused, debug the context and the harness before blaming the model.

This is a **strategy** skill at **meta** altitude. What it owns is the decision spine for context selection — density heuristics, deterministic pre-gathering, and prompt-bloat and eval judgment — plus the workflow patterns that operationalize them. The dominant verb is _decide what context an agent works with_; the procedural patterns below serve that decision, they don't replace it.

## Activation

- Build or debug an agent harness
- Decide what files, docs, memories, rules, or tool outputs to load
- Reduce a bloated system prompt
- Convert messy notes into AI-readable structured context
- Create stage-gated workflows instead of one giant prompt
- Design markdown and frontmatter as an agent data layer
- Decide whether to use sub-agents, deterministic pre-gathering, or one smart call

Do not use this skill when the problem is deterministic code behavior unrelated to LLM context.

## Judgment

### Core Principles

1. **Density beats volume.** Prefer small, specific, high-signal context over large dumps.
2. **Do not rely on prompts for control flow.** If the steps are known, make stages explicit.
3. **Pre-gather deterministically when possible.** Use code, search, metadata, or indexes to select context before the expensive model call.
4. **Keep data sliceable.** Store structured metadata where tools can filter without reading full bodies.
5. **One model deeply understood beats constant model hopping.** Prompt behavior is model-specific.
6. **Rules should be retrieved, not all stuffed.** Long universal rule lists dilute attention.
7. **Build first, then evaluate.** For emergent AI behavior, create a baseline, observe it, then turn important behaviors into evals.

### Prompt Bloat Audit

Audit long prompts when:

- a model upgrade happened
- the agent starts ignoring rules
- every rule says "always" or "never"
- the system prompt has accumulated old fixes
- the workflow feels slower or less reliable

For each instruction, ask:

- Is this task-relevant now?
- Can this be retrieved only when needed?
- Is this a control-flow step that should be code or workflow state?
- Is this a workaround for an older model?
- Is this duplicating a tool, schema, or skill?

Delete or move low-signal instructions into retrievable references.

### Eval Rules

- Do not build broad eval suites before you know the product behavior.
- First create a working baseline.
- Observe failures and good outputs.
- Turn the most important behaviors into a small regression set.
- Use deterministic checks for deterministic requirements.
- Do not ask an LLM to judge things a linter, schema validator, or test can check.

## Procedure

### Workflow

1. **State the task.** What decision or action must the model perform?
2. **List required facts.** Identify facts the model cannot infer: user state, project state, source docs, schemas, constraints, examples, and safety rules.
3. **Filter by metadata first.** Use file paths, frontmatter, tags, dates, ids, owners, or categories before loading full text. Apply the Markdown and Frontmatter pattern below when the data layer itself needs structuring.
4. **Load only what changes the answer.** Exclude nice-to-have background unless it resolves ambiguity.
5. **Summarize stale or bulky context.** Prefer concise state packets over raw history.
6. **Add exact excerpts when precision matters.** Use full source snippets for contracts, APIs, policy, or instructions.
7. **Make missing context explicit.** If a key fact is unavailable, ask, search, or state the uncertainty.
8. If the work has known steps, apply the Stage-Gated Workflow pattern below. If the complaint is an agent ignoring rules or degrading after changes, run the Prompt Bloat Audit. Apply the Eval Rules before proposing any eval suite.

### Stage-Gated Workflow Pattern

Use explicit stages when the work has known steps:

1. Understand the task and inputs.
2. Gather relevant context.
3. Identify gaps or contradictions.
4. Plan the action.
5. Execute.
6. Verify.
7. Report outcome and residual risk.

Do not put all seven steps in a paragraph and hope the model remembers. Make transitions visible. Require verification before final reporting when the task changes files, data, or user-facing behavior.

## Contract

Return:

- context needed
- context intentionally excluded
- deterministic filters used
- prompt or workflow stages
- likely failure modes
- verification plan
- what should become retrievable reference material

Stop conditions before returning: every "context needed" item names where it comes from (file, tool, user); exclusions are deliberate, not omissions; the verification plan matches the riskiest failure mode listed.

## Policy

- Do not load full chat histories by default.
- Do not stuff every policy, memory, and workflow into a global prompt.
- Do not let sub-agents hide verification responsibility.
- Do not treat all models as prompt-compatible.
- Do not call context "memory" unless retrieval and update rules are explicit.
- Do not use more context to compensate for unclear task framing.

## Knowledge

### Markdown And Frontmatter Pattern _(internal-default)_

Use markdown bodies for human-readable notes and YAML frontmatter for deterministic filtering.

Good frontmatter fields:

- `title`
- `type`
- `status`
- `owner`
- `source`
- `tags`
- `date`
- `project`
- `entities`
- `next_action`

Use frontmatter to answer "which files matter?" before the model reads the bodies.

## Provenance

- PRIMARY — Primary sources: Dex Horthy on Chroma's Context Engineering podcast (Episode 1); Cat Wu (Lenny's Podcast) via the BuildOS advanced guide `apps/web/src/content/blogs/advanced-guides/debug-the-harness-not-the-model.md`.
- internal-default — BuildOS thesis link: context engineering vs agent engineering is framed in the published blog `apps/web/src/content/blogs/philosophy/anti-ai-assistant-execution-engine.md`.
- internal-default — Maintainers: the canonical research draft lives at `docs/research/youtube-library/skill-drafts/context-engineering-for-agent-work/` (not available at runtime).
