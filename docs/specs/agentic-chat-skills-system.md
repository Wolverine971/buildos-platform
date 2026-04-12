<!-- docs/specs/agentic-chat-skills-system.md -->

> Superseded by [Agentic Chat Tool Surface Refactor Plan](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-tool-surface-refactor-plan.md).
> This document reflects the earlier design that routed skills through `tool_help`. The current gateway uses `skill_load` for playbooks plus `tool_search`, `tool_schema`, and context-specific direct tools.

# Agentic Chat Skills System - Design Spec

**Status:** Draft  
**Date:** 2026-03-11  
**Author:** AI-assisted (updated by Codex)

---

## 1. Problem Statement

The V2 agentic chat has:

- atomic tools
- a global master prompt
- `tool_help` for schema and playbook discovery

What it does **not** have is a clean way to load domain-specific procedural guidance only when needed.

Current gaps:

- Calendar workflows have hidden constraints around scope, timezone handling, sync behavior, and task linking.
- Document workflows have hidden constraints around `doc_structure`, unlinked documents, and tree operations vs. edges.
- Plan workflows need guidance for when a plan is warranted, how to structure it, and how to connect plans to goals, milestones, tasks, and documents.

The missing layer is **on-demand skill retrieval**.

The system should not auto-inject large domain blocks into every prompt, and it should not rely on backend regex matching to guess which skill to load. Instead, the model should know:

1. when a task is complex enough to justify consulting a skill
2. how to request the relevant skill through `tool_help`
3. how to use that skill output before choosing exact ops and args

---

## 2. Design Goals

### Goals

- Keep the base system prompt small.
- Make skills a single source of truth for procedural playbooks.
- Reuse the existing gateway `tool_help` mechanism instead of inventing a parallel loader.
- Let the model pull a skill only when the current task needs it.
- Support dev-only skill telemetry without changing shared production-facing payloads like `context_usage`.

### Non-Goals

- No server-side trigger matching based on regexes, entity types, or context types.
- No automatic skill injection into the system prompt.
- No second skill system separate from gateway `tool_help`.
- No prod UI surface for active skills in V1.

---

## 3. Core Design

### 3.1 What a Skill Is

A skill is a structured procedural playbook exposed through `tool_help`.

It is not a tool and it is not prompt text that gets preloaded automatically. It is a **retrievable help artifact** that teaches the model how to execute a fragile or multi-step workflow.

Examples:

| Skill Path            | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `cal.skill`           | Calendar and project calendar workflows                             |
| `onto.document.skill` | Project doc tree, unlinked docs, task docs, and document CRUD rules |
| `onto.plan.skill`     | Plan creation, refinement, and work-breakdown rules                 |

### 3.2 When the Model Should Use a Skill

The master prompt should teach a compact policy like this:

- Use a skill when the task is multi-step, stateful, or easy to get wrong.
- Use a skill when the workflow has domain-specific rules that are not obvious from a raw schema.
- Good examples:
    - calendar reads/writes or project calendar mapping -> `cal.skill`
    - document tree reorganization, linking unlinked docs, deciding between project docs and task docs -> `onto.document.skill`
    - creating or restructuring plans, or breaking work into coordinated tasks -> `onto.plan.skill`
- Do not fetch skills speculatively.
- Do not fetch the same skill repeatedly in one turn if the output is already known in-turn.
- After reading a skill, inspect the exact op schema with `tool_help` before first-time or complex writes when needed.

This is a **reasoning policy**, not a backend trigger system.

### 3.3 What Stays Global

Some high-blast-radius rules should remain in the base prompt because they are invariants, not optional playbooks. Examples:

- respond with text before tool calls
- never guess IDs
- document hierarchy uses `doc_structure`, not document-to-document edges
- use exact op schemas before uncertain writes

The base prompt should contain only these thin global guardrails. The detailed procedures live in skills.

---

## 4. Architecture

### 4.1 Where Skills Live

V1 should make gateway `tool_help` the canonical skill surface.

```text
apps/web/src/lib/services/agentic-chat/
├── tools/
│   ├── registry/
│   │   ├── tool-help.ts              # Reads skill registry and returns skill payloads
│   │   └── gateway-op-aliases.ts
│   └── skills/
│       ├── types.ts                  # SkillDefinition, SkillHelpPayload
│       ├── registry.ts               # SKILLS_BY_PATH map
│       ├── calendar.skill.ts         # cal.skill
│       ├── document.skill.ts         # onto.document.skill
│       └── plan.skill.ts             # onto.plan.skill
└── ...

apps/web/src/lib/services/agentic-chat-v2/
├── master-prompt-builder.ts          # Thin "when to use skills" guidance only
└── tool-selector.ts                  # No skill-specific filtering logic in V1
```

### 4.2 Runtime Flow

Current high-level flow:

```text
Request -> Load Context -> Build Prompt -> Select Tools -> Stream
```

New high-level flow:

```text
Request -> Load Context -> Build Thin Prompt -> Select Gateway Tools -> Stream
                                               |
                                               v
                              Model may call tool_help("<skill path>")
                                               |
                                               v
                       Model may call tool_help("<exact op>", include_schemas=true)
                                               |
                                               v
                                        Model calls tool_exec
```

The key design point is that skill retrieval happens **inside the turn**, initiated by the model when needed.

### 4.3 Gateway-Only Scope for V1

This design assumes gateway mode is enabled.

Why:

- gateway mode already has `tool_help`
- gateway mode already has a concept of `type: "skill"` responses
- gateway mode avoids legacy name/path mapping problems

If gateway mode is disabled, V1 behavior stays unchanged. Do not attempt to bolt this skill system onto the legacy tool-selector path in the initial rollout.

---

## 5. Skill Types

### 5.1 TypeScript Shape

```typescript
// apps/web/src/lib/services/agentic-chat/tools/skills/types.ts

export interface SkillDefinition {
	/** Stable tool_help path, e.g. cal.skill */
	path: string;

	/** Stable internal id */
	id: string;

	/** Human-friendly label */
	name: string;

	/** One-line purpose */
	summary: string;

	/** Canonical ops this skill teaches the model to use */
	relatedOps: string[];

	/** Plain-language heuristics for when the model should fetch this skill */
	whenToUse: string[];

	/** Ordered procedural steps */
	workflow: string[];

	/** Critical constraints and gotchas */
	guardrails?: string[];

	/** Optional examples returned by tool_help(full) */
	examples?: SkillExample[];

	/** Optional notes for extra nuance */
	notes?: string[];
}

export interface SkillExample {
	description: string;
	next_steps: string[];
}

export interface SkillHelpPayload {
	type: 'skill';
	path: string;
	name: string;
	format: 'short' | 'full';
	version: string;
	summary: string;
	when_to_use: string[];
	workflow: string[];
	related_ops: string[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
}
```

### 5.2 Why This Shape

- `path` makes the skill directly addressable through `tool_help`.
- `relatedOps` keeps the skill grounded in canonical operations.
- `whenToUse` helps both authoring and review; it is model-facing guidance without backend triggers.
- `workflow` and `guardrails` capture the procedural value.
- Skills are static in V1. They do not require prompt-builder context plumbing.

---

## 6. `tool_help` Integration

### 6.1 Registry

```typescript
// apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts

import { calendarSkill } from './calendar.skill';
import { documentSkill } from './document.skill';
import { planSkill } from './plan.skill';
import type { SkillDefinition } from './types';

export const SKILLS_BY_PATH: Record<string, SkillDefinition> = {
	[calendarSkill.path]: calendarSkill,
	[documentSkill.path]: documentSkill,
	[planSkill.path]: planSkill
};
```

### 6.2 `tool_help` Behavior

`tool_help` should support skills exactly like it supports ops and directories:

- `tool_help({ path: "cal.skill" })` -> returns calendar skill payload
- `tool_help({ path: "onto.document.skill" })` -> returns document skill payload
- `tool_help({ path: "onto.plan.skill" })` -> returns plan skill payload

Namespace directories should expose these entries:

- `tool_help({ path: "cal" })` includes `cal.skill`
- `tool_help({ path: "onto.document" })` includes `onto.document.skill`
- `tool_help({ path: "onto.plan" })` includes `onto.plan.skill`

This keeps skills discoverable without loading them into every prompt.

### 6.3 Example Integration

```typescript
// tool-help.ts

import { SKILLS_BY_PATH } from '../skills/registry';

export function getToolHelp(path: string, options: ToolHelpOptions = {}): Record<string, any> {
	const normalized = normalizeGatewayHelpPath(normalizePath(path));

	const skill = normalized ? SKILLS_BY_PATH[normalized] : undefined;
	if (skill) {
		return buildSkillHelp(skill, options);
	}

	// ... existing directory/op help logic ...
}
```

### 6.4 No Separate Skill Selector

There should be no `selectSkills(...)` function in V1.

The model decides when to fetch a skill. The backend only:

- defines which skills exist
- exposes them through `tool_help`
- logs dev-only telemetry when they are requested

---

## 7. Prompt Integration

### 7.1 Thin Prompt Addition

`buildMasterPrompt` should not accept active skill bodies.

Instead, it should add a short skill-usage guide, for example:

```typescript
const SKILL_USAGE_GUIDE = [
	'Skill playbooks are available through tool_help.',
	'- Fetch a skill only when the task involves a multi-step workflow or hidden domain rules.',
	'- Calendar/event work -> cal.skill.',
	'- Project document tree, unlinked docs, or task docs -> onto.document.skill.',
	'- Plan creation or plan restructuring -> onto.plan.skill.',
	'- After reading a skill, inspect exact op schema before uncertain writes.',
	'- Do not preload or repeatedly fetch skills you do not need.'
].join('\n');
```

This keeps the base prompt small while still teaching the model how to use skills well.

### 7.2 Keep Critical Invariants in the Base Prompt

Do not move every domain rule out of the base prompt. Keep small, universal rules that protect correctness. In particular:

- documents use `doc_structure` for hierarchy
- document-to-document edges are not the hierarchy model
- task IDs and entity IDs must be exact
- uncertain writes should inspect exact op help first

The detailed workflows still belong in the skills.

---

## 8. Initial Skills

These are the first three skills to ship.

### 8.1 `cal.skill`

**Purpose:** Calendar and project calendar workflows

**Related ops:**

- `cal.event.list`
- `cal.event.get`
- `cal.event.create`
- `cal.event.update`
- `cal.event.delete`
- `cal.project.get`
- `cal.project.set`

**When to use:**

- read events in a time window
- create, reschedule, or cancel events
- choose between user scope and project scope
- manage project calendar mapping
- link work sessions to tasks

**Workflow:**

1. Choose scope first: user, project, or explicit `calendar_id`.
2. For project scope, include exact `project_id`.
3. Use timezone-safe ISO 8601 values for `start_at` and `end_at`, or supply `timezone`.
4. For project calendar mapping questions, check `cal.project.get` before assuming a project calendar exists.
5. For update/delete, discover and pass exact `onto_event_id` or `event_id`.
6. For first-time or complex writes, inspect exact op help before `tool_exec`.
7. After execution, tell the user what was created or changed and note sync implications when relevant.

**Guardrails:**

- Prefer `onto_event_id` when available for update/delete.
- If sync status matters, verify with the relevant calendar ops rather than guessing.
- If a task is clearly the subject of the event, include `task_id`.
- If only `start_at` is provided, the backend may default duration; still prefer explicit `end_at` when the user has given enough information.

### 8.2 `onto.document.skill`

**Purpose:** Project document hierarchy, unlinked docs, and task-document distinctions

**Related ops:**

- `onto.document.create`
- `onto.document.update`
- `onto.document.delete`
- `onto.document.tree.get`
- `onto.document.tree.move`
- `onto.document.path.get`
- `onto.task.docs.list`
- `onto.task.docs.create_or_attach`
- `onto.edge.link`

**When to use:**

- create or place a project document in the doc tree
- reorganize project documents
- link unlinked docs
- decide whether a doc belongs in the project tree or a task workspace
- reason about document hierarchy safely

**Workflow:**

1. Decide whether this is a project document or a task document.
2. For project documents, remember the hierarchy lives in `doc_structure`, not in document-to-document edges.
3. For project doc creation, `onto.document.create` must include at least `project_id`, `title`, and `description`.
4. For task workspace docs, use `onto.task.docs.*` instead of the project doc tree.
5. For reorganization or linking unlinked docs, call `onto.document.tree.get` once, analyze the result, then issue targeted `onto.document.tree.move` calls.
6. When moving a document, pass exact `document_id` and `new_position`; use `new_parent_id` only when nesting under a parent.
7. Only create semantic edges to documents from other entities when that relationship is useful; do not use edges to represent folder structure.

**Guardrails:**

- Do not use `onto.project.graph.reorganize` for document hierarchy.
- Do not treat document-to-document edges as the source of truth for hierarchy.
- `delete_onto_document` in agentic chat currently exposes only `document_id`; do not invent archive-mode args in tool calls until the tool contract is expanded.

### 8.3 `onto.plan.skill`

**Purpose:** Plan creation, refinement, and coordinated work breakdown

**Related ops:**

- `onto.plan.create`
- `onto.plan.get`
- `onto.plan.update`
- `onto.task.create`
- `onto.task.list`
- `onto.edge.link`
- `onto.document.get`

**When to use:**

- decide whether a goal needs a plan
- create a plan from a goal or milestone
- break a plan into tasks
- refine a plan that already exists
- connect plans to supporting documents

**Workflow:**

1. Decide whether a plan is warranted. Prefer direct tasks when the work is trivial.
2. Identify the outcome the plan supports.
3. Create the plan with `project_id` and `name`; include `description`, `type_key`, and `state_key` whenever the user has given enough information.
4. If goal or milestone IDs are already known, prefer passing them on plan creation; use `onto.edge.link` when adding relationships after the fact.
5. Break the plan into concrete tasks.
6. When creating tasks under a plan, include `plan_id` or the equivalent containment reference.
7. Use valid task states such as `todo`, `in_progress`, `blocked`, or `done`; do not invent values like `open`.
8. Reference relevant documents when they materially shape execution.

**Guardrails:**

- Do not create a large plan when the request is still vague brainstorming.
- Do not use the goal name as the plan name without adding an approach or phase.
- Do not leave tasks floating if they are clearly part of a plan.

---

## 9. Dev-Only Skill Telemetry

### 9.1 Scope

Telemetry for skills should be **dev only**.

Do not expose it in prod UI and do not piggyback on shared `context_usage` payloads.

### 9.2 Proposed SSE Event

Add a new debug-only SSE event:

```typescript
type SkillActivityEvent = {
	type: 'skill_activity';
	action: 'requested' | 'loaded';
	path: string;
	via: 'tool_help';
};
```

Emit it only in dev mode when the model requests or receives a skill.

Examples:

- model calls `tool_help({ path: "cal.skill" })` -> emit `requested`
- server returns the `cal.skill` payload -> emit `loaded`

### 9.3 Other Dev Surfaces

Also include skill activity in dev-only debugging outputs:

- prompt dumps
- request logs
- optional session debug metadata

This gives visibility without touching stable production contracts.

---

## 10. Migration Plan

### Phase 1: Registry and `tool_help` integration

1. Create `tools/skills/types.ts`
2. Create `tools/skills/registry.ts`
3. Move the existing calendar playbook into `cal.skill` backed by the new registry
4. Add `onto.document.skill`
5. Add `onto.plan.skill`
6. Update `tool_help` directory responses to list skill entries

### Phase 2: Thin prompt update

1. Add a concise skill-usage guide to `master-prompt-builder.ts`
2. Keep only small universal invariants in the base prompt
3. Remove any plan to auto-inject full skill bodies into the system prompt

### Phase 3: Skill content alignment

1. Ensure the calendar skill matches current `cal.*` contracts
2. Ensure the document skill matches current `onto.document.*` and `onto.task.docs.*` contracts
3. Ensure the plan skill examples use valid task states and current plan/task relationship contracts

### Phase 4: Dev telemetry

1. Add `skill_activity` SSE event in dev only
2. Add debug logging for requested skill paths
3. Do not modify `context_usage`

---

## 11. Testing Strategy

### Unit Tests

- `tools/skills/registry.test.ts` for registry lookup
- one test file per skill for payload shape and content
- `tool-help.test.ts` for exact skill paths and directory listings
- `master-prompt-builder.test.ts` for the thin skill-usage guide

### Integration Tests

- calendar request -> model can fetch `cal.skill` then exact calendar op help
- doc-tree request -> model can fetch `onto.document.skill` then `onto.document.tree.*`
- plan request -> model can fetch `onto.plan.skill` then plan/task ops

### Contract Tests

- verify skill examples only mention valid current op names
- verify document skill examples include required document create fields
- verify plan skill examples use valid task states

### Dev Telemetry Tests

- `skill_activity` emits in dev
- `skill_activity` does not emit in prod
- `context_usage` payload remains unchanged

---

## 12. Summary

This design changes skills from:

- backend-selected prompt injections

to:

- on-demand procedural playbooks fetched through `tool_help`

That is the right tradeoff for this system:

- less prompt bloat
- no brittle trigger matching
- one source of truth with gateway help
- cleaner alignment with current tooling
- dev-only visibility into skill usage without changing prod contracts
