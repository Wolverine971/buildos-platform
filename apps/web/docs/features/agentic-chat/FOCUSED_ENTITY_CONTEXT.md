<!-- apps/web/docs/features/agentic-chat/FOCUSED_ENTITY_CONTEXT.md -->

# Focused Ontology Entity Context (Agentic Chat)

This document describes the context injected when agentic chat is focused on a specific ontology entity (task, goal, plan) and where it is defined in code.

## Where focus context is assembled

- Focused location context uses the combined project + focused entity formatter when `ontologyContext.type === "combined"` and a `projectFocus` is present. See `apps/web/src/lib/services/agent-context-service.ts:293`.
- The combined focus snapshot itself is built by `formatCombinedContext`, which emits the project workspace section plus the "Current Focus" section. See `apps/web/src/lib/services/context/context-formatters.ts:51`.
- A linked-entities summary is appended to the system prompt when a focus entity exists. See `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts:82` and `apps/web/src/lib/services/linked-entity-context-formatter.ts:19`.
- Focused entity guidance prompts are appended to the system prompt when a focus is present. See `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts` and `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`.

## Shared "Current Focus" structure

`formatCombinedContext` builds a "Current Focus" block with:

- Name, ID, State (derived from `state_key`, `status`, or `type_key`)
- Entity-specific detail lines (see below)
- Description snippet (up to 400 chars)
- Optional "Focus Metadata" with up to 5 props keys
- Optional relationship summary and light graph snapshot

Source: `apps/web/src/lib/services/context/context-formatters.ts:104`.

## Entity-specific detail lines

These are the unique fields that differ by focus type. All entity types also append `Created`/`Updated` dates at the end.

### Task focus

Fields added:

- Type (`type_key`)
- Priority
- Facet Scale (`facet_scale`)
- Start / Due / Completed dates
- Plans (`plan_ids`, first 3 + overflow count)
- Goals (`goal_ids`, first 3 + overflow count)
- Dependencies / Dependents counts

Source: `apps/web/src/lib/services/context/context-formatters.ts:245`.

### Goal focus

Fields added:

- Type (`type_key`)
- Goal text (truncated to 200 chars)
- Target / Completed dates
- Progress percent
- Tasks (completed/total)
- Direct Edge flag (`direct_edge` -> yes/no)

Source: `apps/web/src/lib/services/context/context-formatters.ts:257`.

### Plan focus

Fields added:

- Type (`type_key`)
- Facet Context / Scale / Stage
- Plan text (truncated to 200 chars)
- Tasks count
- Completed task count

Source: `apps/web/src/lib/services/context/context-formatters.ts:276`.

## Linked entity context (relationship summary)

When focus is set, the system prompt includes a "Linked Entities" block:

- For each entity type (plans, goals, tasks, milestones, documents, risks, requirements), show up to the first 3 entities with ID and relationship label.
- Include overflow counts when more entities exist.
- Append a hint to use `get_linked_entities` for full details.

Sources:

- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts:82`
- `apps/web/src/lib/services/linked-entity-context-formatter.ts:19`

## Ideal hierarchy (target structure)

This is the ideal structure we want the agent to subtly nudge toward:

1. Project has goals.
2. Goals have either plans or milestones.
3. A plan has tasks linked to the plan.
4. If a goal uses milestones, each milestone has a plan, and that plan has child tasks.

## Organization lens (how to organize)

Organizing has three distinct acts:

1. Categorize (Grouping) - What kind of thing is this? What belongs together?
2. Relate (Sequencing) - What depends on what? What comes before or after?
3. Rank (Prioritization) - What matters most right now if we can only do one?

Sequencing is about dependency, not importance. A compact mnemonic:

Kind -> Constraint -> Choice

## Proactive momentum (what's next)

When focused on an entity, the agent should proactively consider the next logical step and how the current item advances the plan or goal. It should suggest the next action or dependency without forcing extra entities or writing changes without user intent.

## Focus prompt guidance (current)

These are agent-facing prompt snippets to include when the chat is focused on a specific entity. The goal is to steer organization toward the ideal hierarchy without forcing changes.

### Shared structure reminder (use in every focus prompt)

```text
Preferred structure: project -> goal -> plan OR milestones; plans own tasks. If a goal uses milestones, each milestone should have its own plan with tasks.

When organizing, apply three acts:
- Categorize (Kind): group like with like; ask "what kind of thing is this?"
- Relate (Constraint): map dependencies and sequence (order is about what comes before/after, not importance)
- Rank (Choice): prioritize based on urgency, impact, or leverage

Always consider "what's next" after the focused entity and how it advances the goal or plan. Suggest links, sequencing, or next steps, but avoid creating new entities without user intent.
Minimal mnemonic: Kind -> Constraint -> Choice.
```

### Task focus prompt

```text
You are focused on a task.
- Tasks should belong to a plan (and usually a goal).
- If no plan is linked, suggest linking to an existing plan or creating one under the relevant goal or milestone.
- Think about sequencing: what must happen before or after? Note dependencies and propose the next task.
- Keep tasks atomic and action-oriented; if the task implies a larger effort, propose a plan and split tasks under it.
```

### Goal focus prompt

```text
You are focused on a goal.
- Goals should be structured by a plan or milestones.
- If milestones are used, each milestone should have its own plan with tasks.
- Avoid piling tasks directly under the goal unless they are small, one-off actions.
- Identify what is missing next (plan, milestones, or first plan step) and suggest it.
```

### Plan focus prompt

```text
You are focused on a plan.
- Plans should roll up to a goal (or be the plan for a milestone).
- Ensure tasks are linked to this plan and ordered by dependency (not priority).
- If tasks exist outside the plan, suggest linking or moving them in.
- Use the plan to surface the next task after the current one.
```

### Milestone focus prompt

```text
You are focused on a milestone.
- Milestones should tie to a goal and be achieved via a dedicated plan with tasks.
- If no plan exists, propose creating one; if tasks exist, link them under the milestone's plan.
- Use the milestone date to sequence work and identify the next action.
```

### Document focus prompt

```text
You are focused on a document.
- Documents can link to multiple entities, but prefer a primary anchor (goal, plan, or task) for context.
- If the document implies work, propose creating or linking a plan or tasks.
- Keep links purposeful; avoid over-linking.
```

### Risk focus prompt

```text
You are focused on a risk.
- Risks should link to the goal, plan, or task they threaten.
- Mitigation should be expressed as a plan or tasks under a plan.
- If the risk affects a milestone, link it and ensure a plan exists to address it.
```

### Requirement focus prompt

```text
You are focused on a requirement.
- Requirements should attach to a goal or plan, with tasks implementing them under the plan.
- Clarify acceptance criteria if missing.
- If the requirement implies a milestone, suggest linking it.
```

## Prompt sources in code

- Global organization lens and preferred hierarchy: `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
- Focused entity guidance snippets: `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
- Prompt assembly for focused contexts: `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
