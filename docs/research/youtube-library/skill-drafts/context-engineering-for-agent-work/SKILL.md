---
skill_id: context-engineering-for-agent-work
name: Context Engineering For Agent Work
description: Design dense, task-relevant context for AI agents instead of stuffing everything into prompts. Use when building agent harnesses, selecting context, reducing prompt bloat, stage-gating workflows, structuring markdown/frontmatter data, or debugging context quality.
skill_type: combo
categories:
    - technology-and-agent-systems
path: docs/research/youtube-library/skill-drafts/context-engineering-for-agent-work/SKILL.md
---

# Context Engineering For Agent Work

Use this skill when an agent needs to decide what context to load, how to structure it, and how to keep an AI workflow reliable. Context engineering is not "more tokens." It is higher information density, deterministic selection, and explicit workflow control.

## When to Use

- Build or debug an agent harness
- Decide what files, docs, memories, rules, or tool outputs to load
- Reduce a bloated system prompt
- Convert messy notes into AI-readable structured context
- Create stage-gated workflows instead of one giant prompt
- Design markdown and frontmatter as an agent data layer
- Decide whether to use sub-agents, deterministic pre-gathering, or one smart call

Do not use this skill when the problem is deterministic code behavior unrelated to LLM context.

## Core Principles

1. **Density beats volume.** Prefer small, specific, high-signal context over large dumps.
2. **Do not rely on prompts for control flow.** If the steps are known, make stages explicit.
3. **Pre-gather deterministically when possible.** Use code, search, metadata, or indexes to select context before the expensive model call.
4. **Keep data sliceable.** Store structured metadata where tools can filter without reading full bodies.
5. **One model deeply understood beats constant model hopping.** Prompt behavior is model-specific.
6. **Rules should be retrieved, not all stuffed.** Long universal rule lists dilute attention.
7. **Build first, then evaluate.** For emergent AI behavior, create a baseline, observe it, then turn important behaviors into evals.

## Context Selection Workflow

1. **State the task.** What decision or action must the model perform?
2. **List required facts.** Identify facts the model cannot infer: user state, project state, source docs, schemas, constraints, examples, and safety rules.
3. **Filter by metadata first.** Use file paths, frontmatter, tags, dates, ids, owners, or categories before loading full text.
4. **Load only what changes the answer.** Exclude nice-to-have background unless it resolves ambiguity.
5. **Summarize stale or bulky context.** Prefer concise state packets over raw history.
6. **Add exact excerpts when precision matters.** Use full source snippets for contracts, APIs, policy, or instructions.
7. **Make missing context explicit.** If a key fact is unavailable, ask, search, or state the uncertainty.

## Stage-Gated Workflow Pattern

Use explicit stages when the work has known steps:

1. Understand the task and inputs.
2. Gather relevant context.
3. Identify gaps or contradictions.
4. Plan the action.
5. Execute.
6. Verify.
7. Report outcome and residual risk.

Do not put all seven steps in a paragraph and hope the model remembers. Make transitions visible. Require verification before final reporting when the task changes files, data, or user-facing behavior.

## Markdown And Frontmatter Pattern

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

## Prompt Bloat Audit

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

## Eval Rules

- Do not build broad eval suites before you know the product behavior.
- First create a working baseline.
- Observe failures and good outputs.
- Turn the most important behaviors into a small regression set.
- Use deterministic checks for deterministic requirements.
- Do not ask an LLM to judge things a linter, schema validator, or test can check.

## Guardrails

- Do not load full chat histories by default.
- Do not stuff every policy, memory, and workflow into a global prompt.
- Do not let sub-agents hide verification responsibility.
- Do not treat all models as prompt-compatible.
- Do not call context "memory" unless retrieval and update rules are explicit.
- Do not use more context to compensate for unclear task framing.

## Output

Return:

- context needed
- context intentionally excluded
- deterministic filters used
- prompt or workflow stages
- likely failure modes
- verification plan
- what should become retrievable reference material

## Source Attribution

Distilled from Chroma's [Context Engineering Episode 1 with Dex Horthy](https://www.youtube.com/watch?v=BNhRnx_O95c) and the existing BuildOS advanced-guide article [Debug the Harness, Not the Model](../../../../../apps/web/src/content/blogs/advanced-guides/debug-the-harness-not-the-model.md), based on Cat Wu's Lenny's Podcast interview.
