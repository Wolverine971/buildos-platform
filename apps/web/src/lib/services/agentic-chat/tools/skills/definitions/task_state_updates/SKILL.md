---
name: Task State Updates
description: Focused child skill for safely mapping user progress language to BuildOS task state updates without losing required IDs or emitting description-only writes.
skill_type: procedure # procedure | strategy | reference | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
parent_id: task_management
depth: 1
legacy_paths:
    - onto.task.state.skill
    - task.state.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_state_updates/SKILL.md
---

# Task State Updates

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure — Activation + Procedure + Contract carry the weight. Judgment, Routing, and
  Knowledge are unused (this is a narrow task-altitude child skill); Related Tools + Examples are loader-coupled.
-->

## Identity

Focused child skill for safely mapping user progress language to BuildOS task state updates without losing required
IDs or emitting description-only writes. This is a **procedure** skill at **task** altitude, operating as a child of
the `task_management` root skill.

## Activation

Use this child skill when the user reports progress, completion, or blocking on an existing task and the main risk is
choosing the correct `state_key` and update payload.

- The user says a task started, finished, got blocked, or needs to move back to todo
- A previous update would change only task description even though task status also changed
- The exact task is likely known, but state mapping still needs care
- The agent needs to update task state and preserve or add a short progress note

Do not use this child skill for general task creation, task organization, or broad task planning. Use the
`task_management` root skill for those.

## Procedure

1. Confirm whether the request targets an existing task. If the exact `task_id` is not already in loaded context or prior tool results, search or list tasks before any write.
2. Map the user's progress language to one of the valid task states: `todo`, `in_progress`, `blocked`, or `done`.
3. Include `state_key` in the same `update_onto_task` call as any description, priority, assignee, or date change when progress actually changed.
4. If adding progress detail, preserve important existing description context unless the user explicitly asks to replace it.
5. Do not create a new task just because the user reported progress on an existing one.

## Contract

After the write succeeds, summarize the state change and any note that was added.

## Policy

- Do not emit `update_onto_task` without an exact `task_id`.
- Do not use invalid states such as `open`, `complete`, `started`, or `waiting`.
- Do not update only `description` when the user's message clearly means the task became `in_progress`, `blocked`, or `done`.
- Do not infer completion from weak language like "made progress" unless the user says the task is done, complete, shipped, sent, or finished.

## Related Tools

- `onto.task.get`
- `onto.task.list`
- `onto.task.search`
- `onto.task.update`

## Examples

### Mark a known task done with a progress note

- User: "Chapter 2 is done. Note that I still need continuity review next."
- If the exact task is known, call:
  `update_onto_task({ task_id: "<task_uuid>", state_key: "done", description: "<preserved existing description plus note about continuity review>" })`

### Move a task to blocked

- User: "The Stripe migration is blocked waiting on production API access."
- Resolve the task if needed, then call:
  `update_onto_task({ task_id: "<task_uuid>", state_key: "blocked", description: "<preserved existing description plus blocker: waiting on production API access>" })`

### Avoid overclaiming completion

- User: "I made progress on the landing-page QA."
- Use `state_key: "in_progress"` if the task was previously todo and the user clearly started work. Do not mark it done unless they say it is complete.

## Provenance

- This child skill exists because task state coverage is a narrow, high-impact failure mode. The root `task_management` skill remains the default for broader task workflow decisions.
