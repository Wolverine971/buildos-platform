---
name: Plan Management
description: BuildOS plan workflow playbook for turning a goal or milestone into a durable execution source of truth with scope, timeline, tasks, dependencies, owners, risks, and update rules.
legacy_paths:
    - onto.plan.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/plan_management/SKILL.md
---

# Plan Management

BuildOS plan workflow playbook for turning a goal or milestone into a durable execution source of truth with scope, timeline, tasks, dependencies, owners, risks, and update rules.

## When to Use

- The user asks to create, improve, review, or execute a plan
- A goal needs an execution structure before tasks are created
- A milestone needs a concrete path from current state to completion
- Existing tasks are floating and need to be organized under a coherent execution plan
- Dates, dependencies, owners, risks, or resources need to be coordinated across multiple tasks
- A plan has drifted and needs to become the current source of truth again

## Workflow

1. Load the relevant project context before writing: project, candidate goal, existing milestones, existing plans, current tasks, risks, and any documents that materially shape execution. Reuse exact IDs from current context when already known; otherwise use list/search/get tools first.
2. Decide whether a plan is warranted. Use direct tasks for trivial one-step work. Use a plan when work spans multiple tasks, people, dependencies, dates, milestones, or decisions.
3. Choose the plan scope before drafting. Prefer a milestone-scoped plan when the goal already has milestones. Use a goal-scoped plan only when the goal has no milestones, the user explicitly asks for a goal-level plan, or the plan coordinates multiple milestones as a roadmap/campaign/process.
4. Keep ontology boundaries clean: the goal is the outcome and success criteria; milestones are major checkpoints, usually dated and under goals; the plan is the execution method for one milestone or a small goal scope; tasks are the atomic future work under the plan.
5. Draft the plan body as the durable source of truth, not as a one-paragraph description. Put the short synopsis in description and the full plan in plan. A strong plan body includes Objective, Scope, Success Criteria, Context/Rationale, Timeline, Task Breakdown, Dependencies, Owners/Resources, Assumptions/Risks, and Review Cadence.
6. Build the timeline from known facts. Use exact dates only when supplied or already present on milestones/tasks. If dates are missing, use relative sequencing such as Week 1, Phase A, or Before the milestone, and ask one concise question only when exact scheduling is required to proceed.
7. Create or update the plan with project_id, name, description, plan, type_key, state_key, and the right parent relationship. Add goal_id or milestone_id when known; prefer milestone_id for milestone-scoped plans.
8. Break the plan into concrete tasks only after the plan scope is clear. Each task should start with a verb, be bounded, have one owner when known, include due/start dates only when known, and be linked to the plan with plan_id or parent. Also attach goal_id or supporting_milestone_id when that relationship is clear.
9. Represent real checkpoints as milestones, not plan subheadings, when they need independent tracking, due dates, or status. Do not create duplicate milestones just because the plan body has phases or timeline sections.
10. Capture dependencies and blockers explicitly. Use task ordering in the plan body for lightweight sequencing; create dependency edges or blocking tasks only when the relationship must be tracked operationally.
11. Link supporting documents, risks, or references when they materially affect execution. Use documents for source context and risks for things that could derail the plan; do not bury critical constraints only in prose.
12. Treat the plan as living state. When tasks are completed, dates move, blockers appear, or scope changes, update the plan body with append or merge_llm rather than leaving an obsolete plan beside newer tasks.
13. After writes, summarize what changed in user-facing terms: the plan scope, the target goal/milestone, task count, important dates, and any unresolved assumptions.

## Related Tools

- `onto.plan.create`
- `onto.plan.get`
- `onto.plan.list`
- `onto.plan.search`
- `onto.plan.update`
- `onto.task.create`
- `onto.task.list`
- `onto.task.search`
- `onto.task.update`
- `onto.goal.get`
- `onto.goal.list`
- `onto.milestone.create`
- `onto.milestone.get`
- `onto.milestone.list`
- `onto.document.get`
- `onto.edge.link`

## Guardrails

- Do not create a plan for vague brainstorming unless the user explicitly asks to structure it.
- Do not duplicate the definitions of goals or milestones inside the plan as separate competing outcomes. Reference them and execute toward them.
- Do not create a project-wide mega-plan when a goal or milestone-scoped plan would be clearer.
- Do not create multiple plans for the same milestone unless they are genuinely separate lanes of work with separate owners or cadences.
- Do not store the detailed execution plan only in description. description is the synopsis; plan is the detailed body.
- Do not invent exact owners, dates, budgets, or dependencies. Mark them TBD in the plan body or ask if the missing detail blocks execution.
- Do not create tasks that the agent can complete immediately in chat. Tasks are for future human or external work.
- Do not leave tasks floating if they are clearly part of the plan.
- Do not use invalid states. Plans use draft, active, completed. Tasks use todo, in_progress, blocked, done. Milestones use pending, in_progress, completed, missed.
- Do not flatten a milestone into a task or a task list into a plan when the user is asking for a real checkpoint or outcome structure.

## Examples

### Create a milestone-scoped execution plan

- Load the goal and milestone first when their IDs are not already in context. Confirm the plan target is the milestone, not the whole project.
- Create the plan with a short description and a detailed plan body:
  `create_onto_plan({ project_id: "<project_id>", milestone_id: "<milestone_id>", name: "MVP launch readiness plan", description: "Execution plan for reaching the MVP launch readiness milestone.", plan: "## Objective\nReach the MVP launch readiness milestone with the critical user flow working, documented, and reviewed.\n\n## Scope\nIncludes onboarding, QA, release notes, and launch decision prep. Excludes post-launch analytics work.\n\n## Success Criteria\n- Critical path works in staging\n- Known launch blockers are resolved or explicitly accepted\n- Release notes and owner checklist are ready\n\n## Timeline\n1. Confirm scope and blockers\n2. Finish implementation tasks\n3. Run QA and review\n4. Prepare launch decision\n\n## Task Breakdown\n- Confirm launch blocker list\n- Finish onboarding copy updates\n- Run staging QA pass\n- Draft release notes\n\n## Dependencies\nQA depends on implementation tasks finishing.\n\n## Risks\nScope creep could push the milestone; defer non-critical analytics.\n\n## Review Cadence\nReview progress every Friday until the milestone is complete.", type_key: "plan.phase.launch", state_key: "active" })`
- Then create only the concrete future-work tasks under the returned plan_id, adding supporting_milestone_id when the milestone is known.

### Create a goal-scoped plan only when the goal has no milestones

- If the goal has no milestones and the user wants execution structure, create a goal-scoped plan with goal_id.
- Use the plan body to propose the sequence and call out whether milestones should be added next. Do not silently create milestones unless the user gave real checkpoints or dates.
- Add the first bounded tasks under the plan so the goal has an actionable starting point.

### Refine a weak existing plan

- Read the existing plan and tasks before updating. Preserve useful context instead of replacing it blindly.
- If the plan is just a paragraph, rewrite it into the full anatomy: Objective, Scope, Success Criteria, Context/Rationale, Timeline, Task Breakdown, Dependencies, Owners/Resources, Assumptions/Risks, and Review Cadence.
- `update_onto_plan` replaces fields directly — it does not append or merge server-side.
- When replacing a weak plan, pass the full revised plan body:
  `update_onto_plan({ plan_id: "<plan_id>", plan: "<revised detailed plan body>", description: "<short synopsis>" })`
- When the plan is mostly good but stale, first read the current plan body, compose the merged text yourself (preserve the current structure, update timeline and dependencies, and keep completed work as context only when it affects remaining execution), then write the full merged body back in a single `update_onto_plan` call.
- After updating the plan body, add, update, or retire tasks so the task graph matches the plan.

### Turn an unstructured request into a plan and tasks

- Extract the desired outcome, known constraints, deadline, available owners/resources, and any stated risks.
- If the user gave a date-driven checkpoint, create or use the milestone first, then create the plan under that milestone.
- If the user gave only a broad goal, create or use the goal first, then create a focused goal-scoped plan and suggest milestones only if they would clarify execution.
- Create tasks only for concrete follow-up work. Keep uncertain items as assumptions or open questions in the plan body.

## Notes

- A BuildOS plan is the execution bridge between intent and tracked work. Project = broad container and why. Goal = outcome. Milestone = checkpoint toward a goal. Plan = how and when to reach one checkpoint or small goal scope. Task = who does what next.
- Plan scope should usually be smaller than the whole goal when a goal has milestones. The default shape is goal -> milestone -> plan -> tasks.
- Use plan families intentionally: timebox for fixed windows, pipeline for stage flows, campaign for coordinated pushes, roadmap for longer directional sequencing, process for repeatable workflows, phase for large project phases.
- The plan body should be readable by a future agent that needs to continue execution without the original conversation. Include enough rationale, assumptions, dependencies, and task intent for adaptation.
- A useful task breakdown names owner, timing, dependency, and completion signal when known. Missing fields can remain TBD if they do not block starting.
- For plans with many tasks, create the immediate/critical tasks first and leave later candidate tasks in the plan body until they become actionable.
- For updates, prefer preserving the plan as one current source of truth over creating a second plan with overlapping scope.
