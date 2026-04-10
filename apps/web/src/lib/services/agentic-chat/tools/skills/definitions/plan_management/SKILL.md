---
name: Plan Management
description: Plan workflow playbook for deciding when to create plans, structuring them well, and connecting plans to tasks, goals, milestones, and documents.
legacy_paths:
    - onto.plan.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/plan_management/SKILL.md
---

# Plan Management

Plan workflow playbook for deciding when to create plans, structuring them well, and connecting plans to tasks, goals, milestones, and documents.

## When to Use

- Decide whether a goal needs a plan
- Create a plan from a goal or milestone
- Break a plan into tasks
- Refine a plan that already exists
- Connect plans to supporting documents

## Workflow

1. Decide whether a plan is warranted. Prefer direct tasks when the work is trivial.
2. Identify the outcome the plan supports.
3. Create the plan with project_id and name; include description, type_key, and state_key whenever the user has given enough information.
4. If goal or milestone IDs are already known, prefer passing them on plan creation; use onto.edge.link when adding relationships after the fact.
5. Break the plan into concrete tasks.
6. When creating tasks under a plan, include plan_id or the equivalent containment reference.
7. Use valid task states such as todo, in_progress, blocked, or done; do not invent values like open.
8. Reference relevant documents when they materially shape execution.
9. For plan updates, if the current structured context or prior turn already shows the exact plan_id, reuse it directly instead of searching again or emitting an empty update payload.

## Related Tools

- `onto.plan.create`
- `onto.plan.get`
- `onto.plan.update`
- `onto.task.create`
- `onto.task.list`
- `onto.edge.link`
- `onto.document.get`

## Guardrails

- Do not create a large plan when the request is still vague brainstorming.
- Do not use the goal name as the plan name without adding an approach or phase.
- Do not leave tasks floating if they are clearly part of a plan.

## Examples

### Turn a goal into an actionable first plan

- Confirm the outcome the plan supports and whether a plan is actually warranted.
- If the create shape is unclear, call `tool_schema({ op: "onto.plan.create" })`.
- Then call `create_onto_plan({ ... })`, followed by `create_onto_task({ ... })` for a small set of tasks with `plan_id`.

### Refine an existing plan that drifted out of date

- Read the existing plan and current tasks first.
- If the update shape is unclear, call `tool_schema({ op: "onto.plan.update" })`.
- Then update the plan metadata with `update_onto_plan({ ... })` as needed.
- Add, adjust, or retire tasks so the plan matches the current approach.

## Notes

- Plans are useful when work needs coordination or structure, not as a mandatory layer for every request.
- If the model already knows the exact task and plan relationships in-turn, it can go straight to `tool_schema` or the direct create/update tool.
