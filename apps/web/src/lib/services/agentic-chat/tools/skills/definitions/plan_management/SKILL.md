---
name: Plan Management
catalog_line: 'Turn a goal or milestone into a durable plan: scope, timeline, tasks, dependencies, owners, risks.'
description: BuildOS plan workflow playbook for turning a goal or milestone into a durable execution source of truth with scope, timeline, tasks, dependencies, owners, risks, and update rules.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - onto.plan.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/plan_management/SKILL.md
---

# Plan Management

<!--
  BLOCK ONTOLOGY (canonical order). Identity → Activation → Procedure → Contract → Policy → Related Tools → Examples → Provenance.
  skill_type: procedure. The acting worker renders Activation, the Procedure steps, Policy, Contract, and one Example
  under a one-line heading with no follow-up skill calls, so every tool named in those blocks is mounted on both
  worker surfaces (global and project) since the 2026-09-18 planning layer; link_onto_entities is project-only and
  is deliberately not named. Examples open with the update-by-exact-id case (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08
  F71). The turn-contract shapes in Procedure step 8 are checked against the worker's real contract validator by
  apps/worker/tests/agenticChatSkillContractExamples.test.ts.
-->

## Identity

Plan workflow: turn a goal or milestone into one durable plan with the right tasks under it, using the goal, milestone, plan, risk, and task tools on the current surface. This is a **procedure** skill at **domain** altitude.

## Activation

- Create or revise a plan for a goal or milestone
- Create or update a goal, milestone, or risk
- Put floating tasks under a plan, goal, or milestone

## Procedure

1. Read before writing: reuse exact IDs from the focused context or the message; otherwise call list_onto_goals, list_onto_milestones, and list_onto_plans (or search_onto_plans) for the project. If several fit, ask one clarification instead of guessing.
2. Pick the smallest structure: a goal is an outcome (create_onto_goal with name and an optional target_date); a milestone is a dated checkpoint (create_onto_milestone with title, and due_at only from a date the user gave); a plan is how one milestone or a small goal gets done; tasks are future human work. One-step work is a task, not a plan.
3. Prefer a milestone-scoped plan when the goal already has milestones; use a goal-scoped plan only when the goal has none or the user asks for one.
4. Create the plan with create_onto_plan: project_id, name, a one-line description, and the full body in plan (Objective, Scope, Success criteria, Timeline, Task breakdown, Dependencies, Risks). create_onto_plan takes no goal or milestone argument: name the milestone or goal in the plan body, and attach the tasks to it instead.
5. Create only the tasks needed now with create_onto_task, passing plan_id from the plan's receipt (plus goal_id or supporting_milestone_id when known); keep later work in the plan body.
6. update_onto_plan, update_onto_goal, and update_onto_milestone replace the fields you pass. To revise a plan body, read it with get_onto_plan_details, compose the full new body, and send it in one update_onto_plan call.
7. Create a risk with create_onto_risk only when the user named one. Owners, dates, and budgets you were not given stay TBD in the plan body.
8. Declare a turn contract only when the system holds your writes and asks for one (it does for more than three writes, dependent writes, or a goal or plan picked from broad context instead of the focus or a read). Declare one outcome per change with the exact UUIDs, then make only those writes: a write outside the approved contract is rejected. Shapes:
    - new plan plus its first task: `{"outcomes":[{"action":"create","entity_kind":"plan","changes":[{"field":"name","value":"Beta rollout"}],"minimum_successful_effects":1},{"action":"create","entity_kind":"task","changes":[{"field":"title","value":"Run the staging QA pass"}],"minimum_successful_effects":1}]}`
    - move a goal's target date: `{"outcomes":[{"action":"update","entity_kind":"goal","target_ids":["<goal UUID>"],"required_fields":["target_date"],"changes":[{"field":"target_date","value":"2026-12-01"}],"minimum_successful_effects":1}]}`
9. After the receipts return, report the plan scope, the goal or milestone it serves, the tasks created, key dates, and open assumptions.

## Contract

After a plan write, report in user-facing terms:

- The plan's scope and the goal or milestone it executes toward.
- The tasks created or updated under it, with any dates the user gave.
- Owners, dates, or dependencies left TBD, and any assumption that still blocks execution.

Stop conditions before replying: the detailed plan lives in `plan`, not only `description`; tasks created for the plan carry its plan_id; no owner, date, or dependency was invented; nothing is reported as written until its tool result returned success.

## Policy

- description is the synopsis; plan is the detailed body. Never store the detailed plan only in description.
- Do not create a plan for vague brainstorming, a second plan for the same milestone, or a project-wide mega-plan when a milestone- or goal-scoped plan is clearer.
- Do not invent owners, dates, budgets, or dependencies; mark them TBD, or ask one question when the gap blocks execution.
- Valid states: plans draft, active, completed; goals draft, active, achieved, abandoned; milestones pending, in_progress, completed, missed; tasks todo, in_progress, blocked, done.
- Refuse to inflate structure: one action is a task, not a plan; a dated checkpoint is a milestone, not a plan heading.

## Related Tools

- `onto.plan.create`
- `onto.plan.get`
- `onto.plan.list`
- `onto.plan.search`
- `onto.plan.update`
- `onto.goal.create`
- `onto.goal.get`
- `onto.goal.list`
- `onto.goal.update`
- `onto.milestone.create`
- `onto.milestone.list`
- `onto.milestone.update`
- `onto.risk.create`
- `onto.task.create`
- `onto.task.list`

## Examples

### Update an existing plan by its exact id

- Reuse the plan_id from the focused context or a read; otherwise find it with list_onto_plans or search_onto_plans.
- Read the current body with `get_onto_plan_details({ plan_id: "<plan_id>" })`, compose the full revised body, then send it whole:
  `update_onto_plan({ plan_id: "<plan_id>", plan: "<full revised plan body>", description: "<short synopsis>" })`
- Then add or update tasks so they match the revised plan.

### Create a milestone-scoped plan

- Load the goal and milestone first when their IDs are not already in context.
- `create_onto_plan({ project_id: "<project_id>", name: "MVP launch readiness", description: "Execution plan for the MVP launch readiness milestone.", plan: "## Objective\nShip the critical flow, reviewed.\n\n## Timeline\n1. Confirm blockers\n2. Finish implementation\n3. QA and review\n\n## Task breakdown\n- Confirm the launch blocker list\n- Run the staging QA pass\n\n## Risks\nScope creep; defer analytics work.", state_key: "active" })`
- Then create only the immediate tasks: `create_onto_task({ project_id: "<project_id>", plan_id: "<plan_id from the receipt>", title: "Run the staging QA pass" })`

## Provenance

- BuildOS-internal execution doctrine; every claim is [internal-default].
- Legacy id: `onto.plan.skill` (see `legacy_paths`).
