---
name: Task Management
catalog_line: 'Decide when work becomes a task; manage task scope, ownership, schedule, and relationships safely.'
description: Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - onto.task.skill
    - task.skill
    - tasks.skill
child_skills:
    - id: task_state_updates
      name: Task State Updates
      summary: Focused child skill for mapping user progress language to safe task state updates.
      when_to_load:
          - When the user reports task progress, completion, or blocking and state mapping is the main risk.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_state_updates/SKILL.md
reference_modules:
    - id: task_management.state_coverage
      name: Task State Coverage
      summary: Extra examples for mapping progress language to task state updates without emitting description-only writes.
      when_to_load:
          - When task status mapping is ambiguous or a previous update omitted state_key.
      path: references/state-coverage.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md
---

# Task Management

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure. Procedure carries the weight. The task-vs-do-now decision spine lives in
  Activation + Procedure step 1 + Policy + Examples, so no separate Judgment block is broken out. The
  task_state_updates child is declared in frontmatter, so no separate Routing block is broken out.

  The acting worker renders Activation, the Procedure steps, Policy, Contract, and one Example under a one-line
  heading, with no follow-up skill calls. Every tool named in those blocks must be mounted on the worker surface
  that carries task writes (list_onto_tasks, get_onto_task_details, create_onto_task, update_onto_task,
  move_onto_task). Related Tools stays in dotted op ids: it is the external gateway contract and the source of
  materialized_tools. Examples open with the update-by-exact-id case (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71).
-->

## Identity

Task workflow playbook: decide when work becomes a tracked task, then create, update, schedule, and place tasks safely with the task tools on the current surface. The deep state-mapping cases — turning progress language into safe state updates — are owned by the child skill `task_state_updates`, which loads when state mapping is the main risk.

## Activation

- Decide whether a request should become a task or be done now in chat
- Create a task for future human work
- Update a task's state, dates, priority, owner, or parent
- Place a task under the right plan, goal, or milestone

## Procedure

1. Decide first whether this should be a tracked task or work you can just do now in the conversation.
2. For an update, reuse the exact task_id from the focused context, the user's message, or a read this turn; otherwise call list_onto_tasks (with project_id when known) or get_onto_task_details before writing. If several tasks fit, ask one clarification instead of guessing.
3. For a create, call create_onto_task with project_id and a concrete title; add description, due_at, priority, assignee_handles, or plan_id / goal_id / supporting_milestone_id only when the user gave enough to fill them.
4. When the user reports real progress (started, in progress, blocked, finished), include state_key in update_onto_task alongside any other field change. Valid states are todo, in_progress, blocked, and done.
5. description is a full replacement on update_onto_task: to keep existing detail, read the task first and write the composed value.
6. Use move_onto_task only to move a task to another project; changing its goal or milestone is update_onto_task.
7. After the tool result returns, report what changed and name any owner, due date, or parent that still matters.

## Contract

After a task write, report in user-facing terms:

- What changed: the task title and the fields you set.
- The parent it now sits under (plan, goal, milestone, or direct project scope), or that it is intentionally unparented.
- Any still-missing owner, due date, or parent, named explicitly. If you decided not to create a task because the work is doable now in chat, say so and do the work instead.

## Policy

- Do not create tasks for research, analysis, brainstorming, or drafting you can do now in chat.
- Do not invent assignee IDs, handles, or project membership; prefer assignee_handles over actor IDs.
- Do not use invalid task states such as open.
- If the request is really a goal, milestone, or plan, do not flatten it into a task because task creation is easy.

## Related Tools

- `onto.task.create`
- `onto.task.get`
- `onto.task.list`
- `onto.task.search`
- `onto.task.update`
- `onto.plan.get`
- `onto.goal.get`
- `onto.milestone.get`

## Examples

### Update an existing task by its exact id

- The prior turn, the focused context, or the user gave the exact task_id: reuse it directly.
- Otherwise resolve it first with list_onto_tasks or get_onto_task_details; if several tasks fit, ask one clarification instead of guessing.
- Example when the task is already in context:
  `update_onto_task({ task_id: "440c2639-9000-4111-aeea-ee374f8fb925", state_key: "done" })`
- Example of a richer update — read the current description first, then pass the full composed value:
  `update_onto_task({ task_id: "440c2639-9000-4111-aeea-ee374f8fb925", description: "Chapter 1 and chapter 2 are complete. Update the outline to reflect the revised chapter 3 beats and continuity fixes." })`

### Create a task for a real follow-up the user must do later

- Confirm it is future user work rather than work you can complete now in chat.
- Good create signals: "add a task", "track this", "remind me", a future phone call, meeting, review, approval, or a persistent checklist item.
- Example when project context is already known:
  `create_onto_task({ project_id: "4cfdbed1-840a-4fe4-9751-77c7884daa70", title: "Revise chapter 2 dialogue between Elena and Master Thorne", description: "Strengthen the dialogue beats in the Elena and Master Thorne scenes from chapter 2.", type_key: "task.refine" })`
- When the user names the next work item, turn it into the title instead of a blank create:
  `create_onto_task({ project_id: "4cfdbed1-840a-4fe4-9751-77c7884daa70", title: "Draft chapter 3: Elena's first magical forging attempt", description: "Include Elena's first forging attempt, introduce the Shadow King's herald, and foreshadow the prophecy.", type_key: "task.create" })`

## Provenance

- Tasks are for future human work, not a transcript of what happened in chat.
- Containment and task relationships matter. A well-placed task is usually better than a floating task with no parent context.
