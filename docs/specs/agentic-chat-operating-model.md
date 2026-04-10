<!-- docs/specs/agentic-chat-operating-model.md -->

# Agentic Chat Operating Model

Status: Canonical
Date: 2026-04-09
Owner: BuildOS Agentic Chat

Related docs:

- [Agentic Chat Skill + Tool Architecture V2](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skill-tool-architecture-v2.md)
- [Agentic Chat (Current Implementation)](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

## Purpose

This is the main strategy document for how BuildOS agentic chat should think and operate.

It defines:

- what capabilities are
- what skills are
- what tools are
- how the model should move between them
- when to load guidance versus when to execute

If another prompt, plan, or implementation detail conflicts with this document, this operating model should win unless there is a newer explicit replacement.

## Core Model

BuildOS agentic chat uses four layers:

1. Capabilities
2. Skills
3. Tool discovery and schema lookup
4. Tool execution

These layers have different jobs and should not be collapsed together.

### Capabilities

Capabilities are broad statements about what BuildOS can do.

Examples:

- BuildOS can create and structure projects.
- BuildOS can manage tasks, plans, goals, milestones, and documents.
- BuildOS can work with calendars and project calendar mappings.
- BuildOS can search and summarize workspace or project state.
- BuildOS can use people and profile context.

Capabilities are:

- broad
- prompt-time only
- meant to orient the model

Capabilities are not:

- routable tool catalogs
- skill bodies
- schema definitions
- path trees

The role of capabilities is to answer:

- "What kind of job is this?"

### Skills

Skills are markdown playbooks that teach process.

Each skill should have:

- a `name`
- a `description`
- a markdown body

The markdown body should teach:

- when to use the skill
- workflow and sequencing
- common mistakes
- guardrails
- related tools

Skills are:

- process guidance
- loaded on demand
- workflow-oriented
- authored as `SKILL.md`

Skills are not:

- executable tools
- a one-to-one alias for every function
- nested under tool names just because they reference those tools

The role of a skill is to answer:

- "How should I approach this kind of work?"

### Tools

Tools are exact executable actions.

They are the surface that actually reads or mutates BuildOS data.

Tools should be:

- discoverable on demand
- schema-addressable on demand
- called only with concrete arguments

The role of tools is to answer:

- "What exact action should I take?"
- "What exact arguments does that action require?"

## Canonical Gateway Surface

The default provider-neutral gateway surface is:

- `skill_load`
- `tool_search`
- `tool_schema`
- `buildos_call`

### `skill_load`

Use `skill_load` when the task is multi-step, stateful, easy to get wrong, or benefits from workflow guidance.

It answers:

- "Load the playbook for this workflow."

Example:

```json
{
	"skill": "project_creation"
}
```

### `tool_search`

Use `tool_search` when the model does not yet know the exact tool.

It answers:

- "Which BuildOS tool should I use for this job?"

Example:

```json
{
	"query": "update a calendar event"
}
```

### `tool_schema`

Use `tool_schema` when the model knows the exact tool but needs the exact schema, examples, or argument rules.

It answers:

- "How do I call this tool correctly?"

Example:

```json
{
	"op": "onto.project.create"
}
```

### `buildos_call`

Use `buildos_call` only when the exact tool and concrete arguments are known.

It answers:

- "Execute this exact BuildOS action."

Example:

```json
{
	"op": "onto.project.create",
	"args": {
		"project": {
			"name": "Launch creator CRM",
			"type_key": "project.business.system"
		},
		"entities": [],
		"relationships": []
	}
}
```

## Default Decision Flow

The model should generally operate in this order:

1. Use capabilities to orient to the kind of job.
2. If the job is workflow-heavy or easy to misuse, load the relevant skill.
3. If the exact tool is unknown, use `tool_search`.
4. If the exact tool is known but the argument contract is not, use `tool_schema`.
5. Only then call `buildos_call`.

Short version:

- capabilities orient
- skills teach
- tool search finds
- tool schema specifies
- buildos_call executes

## When To Use A Skill

Load a skill when:

- the task is multi-step
- the task is stateful
- the task is a risky write
- the tool is easy to misuse
- there are workflow decisions to make before execution

Common examples:

- project creation
- calendar operations
- task management
- plan management
- document workspace operations
- people/contact workflows
- audits
- forecasts

Do not load a skill just because one exists.

Do not load a skill for simple direct reads when the exact retrieval path is already obvious.

## When Not To Use A Skill

Do not load a skill first when:

- the user is asking a routine workspace or project status question
- the model already knows the exact read tool
- the task is a straightforward direct retrieval

Example:

- "What is happening with my projects?"
- "What is going on with 9takes?"

Those should go to the most direct overview retrieval path first, not to skill loading.

## Prompting Rules

Prompt-time context should include:

- broad BuildOS capabilities
- skill metadata only
- safety and mutation rules
- direct guidance for common overview/status questions

Prompt-time context should not include:

- full skill bodies
- full tool definitions
- capability catalogs as path trees
- root-browsing instructions

The model should know that:

- skills exist
- what each skill is for
- tools can be searched on demand
- schemas can be loaded on demand

## Authoring Rules For Skills

BuildOS skills should follow the `SKILL.md` model.

Each skill should be authored as markdown with YAML frontmatter:

```md
---
name: Project Creation
description: Project creation playbook for turning a user idea into the smallest valid BuildOS project payload.
---
```

Recommended sections:

- `## When to Use`
- `## Workflow`
- `## Related Tools`
- `## Guardrails`
- `## Examples`
- `## Notes`

Skill IDs should be workflow-oriented, such as:

- `project_creation`
- `calendar_management`
- `task_management`

Avoid tool-shaped skill names like:

- `onto.project.create.skill`

Legacy aliases may exist for compatibility, but they are not the preferred model.

## Design Rules

### Keep capabilities broad

Capabilities should stay high-level and stable.

### Keep skills about process

A skill should teach judgment, sequence, and mistakes to avoid.

### Keep tools exact

A tool should be a precise action with a precise schema.

### Do not guess write arguments

If the model is not sure about exact required fields, IDs, or allowed values, it should use `tool_schema` before writing.

### Do not speculate with execution

Do not call `buildos_call` just to probe for shape or see what happens.

## Examples

### Example 1: Create a project

1. Capability orientation: project creation
2. Load `project_creation`
3. Inspect `onto.project.create` with `tool_schema` if the exact payload is not already known
4. Execute with `buildos_call`

### Example 2: Update a calendar event

1. Capability orientation: calendar
2. Load `calendar_management` if the scope, IDs, or write flow are not already clear
3. Search or inspect the exact calendar tool
4. Load schema if needed
5. Execute with `buildos_call`

### Example 3: Answer a workspace status question

1. Capability orientation: overview/status
2. Go to the direct overview retrieval path
3. Do not load a workflow skill unless the user shifts into audit, forecast, or mutation work

## Canonical Interpretation

If someone asks:

- "What is the strategy for agentic chat?"

this document is the answer.

If someone asks:

- "What is the architecture behind that strategy?"

use [Agentic Chat Skill + Tool Architecture V2](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skill-tool-architecture-v2.md).

If someone asks:

- "What is currently implemented in the web app?"

use [Agentic Chat (Current Implementation)](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md).
