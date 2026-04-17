---
name: Task Management
description: Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely.
legacy_paths:
    - onto.task.skill
    - task.skill
    - tasks.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md
---

# Task Management

Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely.

## When to Use

- Decide whether a user request should become a task at all
- Create a task for future human work
- Assign or reassign task ownership
- Update task state, dates, or priority
- Place a task under the right plan, goal, or milestone

## Workflow

1. Decide first whether this should be a tracked task or whether the work should just be done in the conversation now.
2. If it should be a task, choose the project and the right parent context: plan, goal, milestone, or direct project scope.
3. For creates, include title and only add schedule, assignees, or supporting links when the user has given enough concrete information.
4. Prefer assignee_handles over actor IDs unless the IDs were just discovered in-turn from project membership data.
5. Use valid task states such as todo, in_progress, blocked, or done.
6. For updates, reuse the exact task_id from recent context or the prior assistant turn when the follow-up clearly refers to that task. If the exact task_id is not already known, discover it before any write.
7. Only use description merge strategies when append or merge behavior is actually needed; otherwise keep updates simple.
8. **State coverage.** When the user reports that real-world task work advanced (started, in progress, blocked, or finished), include `state_key` in the `update_onto_task` call alongside any description change. Do not update only the description when the task state should also move.
9. After execution, tell the user what changed and call out any missing owner, due date, or parent relationship that still matters.

## Direct Tool Packaging

### Part 1: Choose the dynamic op first

- Treat task work as two separate decisions: first choose the canonical op, then package the call.
- Examples: use `onto.task.create` for a new tracked task, `onto.task.update` for changing an existing task, and `onto.task.list` or `onto.task.search` when the exact `task_id` is still unknown.
- If the write shape is uncertain, call `tool_schema({ op: "<exact op>" })` before any execution attempt.

### Part 2: Package the direct tool call correctly

- Use the direct tool named by the op schema, for example `create_onto_task({ ... })` or `update_onto_task({ ... })`.
- Put `task_id`, `project_id`, `title`, `state_key`, `priority`, and `description` directly in the tool arguments.
- Correct pattern: `update_onto_task({ task_id: "<uuid>", state_key: "done" })`
- Incorrect pattern: `update_onto_task({})`
- If the arguments would be missing a required field, stop and resolve it with context, a read op, or one concise question instead of sending a partial write.

## Related Tools

- `onto.task.create`
- `onto.task.get`
- `onto.task.list`
- `onto.task.search`
- `onto.task.update`
- `onto.plan.get`
- `onto.goal.get`
- `onto.milestone.get`

## Guardrails

- Do not create tasks for research, analysis, brainstorming, or drafting that the agent can do now in chat.
- Do not invent assignee IDs, handles, or project membership.
- Do not use invalid task states such as open.
- Do not emit update calls without an exact task_id.
- If the request is really a goal, milestone, or plan, do not flatten it into a task just because task creation is easy.

## Examples

### Track a real follow-up the user must do later

- Confirm the request is future user work rather than work the agent can complete now.
- Good create signals: "add a task", "track this", "remind me", a future phone call, meeting, review, approval, or persistent project checklist.
- Do not create a task for work the agent can do now, such as research, analysis, brainstorming, summarizing, or drafting in the current conversation.
- If the create shape is unclear, call `tool_schema({ op: "onto.task.create" })`.
- Then call `create_onto_task({ ... })` with the right parent plan/goal/milestone when that relationship is already clear.
- Example payload when project context is already known:
  `create_onto_task({ project_id: "4cfdbed1-840a-4fe4-9751-77c7884daa70", title: "Revise chapter 2 dialogue between Elena and Master Thorne", description: "Strengthen the dialogue beats in the Elena and Master Thorne scenes from chapter 2.", type_key: "task.refine" })`

### Create the next drafting task from a progress update

- If the user names the next chapter or work item, turn that into the title instead of emitting a blank create call.
- Example:
  `create_onto_task({ project_id: "4cfdbed1-840a-4fe4-9751-77c7884daa70", title: "Draft chapter 3: Elena's first magical forging attempt", description: "Include Elena's first forging attempt, introduce the Shadow King's herald, and foreshadow the prophecy.", type_key: "task.create" })`

### Update an existing task status and owner safely

- If the prior assistant turn or structured context already surfaced the exact task_id, reuse it directly.
- Otherwise use onto.task.search, onto.task.list, or onto.task.get to discover the exact task_id first.
- When project scope is known, prefer project-scoped task lookup before broader workspace lookup.
- If ownership is changing, prefer assignee_handles unless actor IDs were just retrieved.
- If the update shape is unclear, call `tool_schema({ op: "onto.task.update" })`.
- Then call `update_onto_task({ ... })` with the exact task_id and the intended state/assignment changes.
- Example when the task is already in structured context:
  `update_onto_task({ task_id: "440c2639-9000-4111-aeea-ee374f8fb925", state_key: "done" })`
- Example when the task needs a richer update. Task fields are direct replacements, so read the current description first if you want to preserve prior detail, then pass the full composed value:
  `update_onto_task({ task_id: "440c2639-9000-4111-aeea-ee374f8fb925", description: "Chapter 1 and chapter 2 are complete. Update the outline to reflect the revised chapter 3 beats and continuity fixes." })`

### Guard against empty task writes

- Never emit `update_onto_task({})`.
- Never emit `create_onto_task({ project_id })` without a concrete `title`.
- If you know the task from context, copy its exact `task_id` into the update call.
- If you do not know the exact `task_id`, resolve it first or ask one concise clarifying question.

## Notes

- Tasks are for future human work, not a transcript of what happened in chat.
- Containment and task relationships matter. A well-placed task is usually better than a floating task with no parent context.
