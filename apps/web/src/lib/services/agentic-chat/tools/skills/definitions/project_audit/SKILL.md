---
name: Project Audit
description: Project-scoped audit playbook for evaluating structure, documentation, timeline realism, velocity, loose work, duplication, blockers, and strategic gaps while staying in project context.
legacy_paths:
    - project.audit.skill
    - project.audit
    - workflow.audit.skill
    - workflow.audit
    - audit.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_audit/SKILL.md
---

# Project Audit

Project-scoped audit playbook for evaluating structure, documentation, timeline realism, velocity, loose work, duplication, blockers, and strategic gaps while staying in project context.

## When to Use

- The context type is `project` and the user asks to audit, review, stress-test, inspect health, find gaps, or look for blockers
- You need to assess whether the ideal project structure is being maintained: project -> goals -> milestones/sub-goals -> plans -> linked tasks, with documents supporting the strategy and knowledge layer
- You need to evaluate timeline realism, project velocity, bumped work, stale work, loose tasks, duplicate work, or missing documentation
- The user asks for a critical read without immediately asking you to change project data
- You need evidence-based recommendations before deciding whether any cleanup work is warranted

## Workflow

1. Keep the chat in `project` context. Do not switch to a `project_audit` context type.
2. Start from the current project scope and reuse the in-context project_id when available.
3. Prefer read-only analysis first; do not mutate the graph just because you found issues.
4. Build the structural map: identify the project's major documents, goals, milestones/sub-goals, plans, tasks, risks, and calendar anchors. Use the project overview first when it is enough; fetch the graph and targeted lists when the snapshot is thin.
5. Audit the ideal project chain: each important goal should have either a clear plan, supporting milestones, linked tasks, or a reason why it is intentionally thin. Each plan should link to the tasks that complete it. Completed task sets should imply plan progress; completed plans should support goal or milestone progress.
6. Audit milestone structure: check whether milestones are being used as meaningful sub-goals, whether milestone-level plans exist when needed, and whether milestones actually help explain progress toward parent goals.
7. Audit documentation coverage: find goals, plans, milestones, or risky workstreams that lack strategy docs, research docs, requirements, notes, decision records, or other context that would help the user execute. Also flag stale, unlinked, or orphaned documents when they create confusion.
8. Audit task fit: identify loose tasks that do not relate back to a goal, milestone, plan, document, or clear project outcome. Separate useful one-off admin tasks from work that should be linked, merged, renamed, or removed.
9. Audit duplicate and overlapping work: look for tasks, plans, milestones, or docs with similar names, objectives, or descriptions. Treat this as a signal to consolidate or clarify ownership, not as proof of a bug unless the evidence is strong.
10. Audit timeline realism: compare stated due dates, milestone dates, task volume, blocked work, dependencies, and calendar commitments. Ask whether the proper work can realistically fit in the timeline, and name the biggest schedule compression points.
11. Audit velocity and plan adherence: look for completed task counts, stale active tasks, overdue tasks, repeated date bumps, blocked work, and whether planned tasks are actually getting done. If historical completion data is thin, say what you can and cannot infer.
12. Synthesize the audit into a ranked set of findings. For each material finding, include evidence, impact, and the smallest practical correction.
13. Separate observations from recommendations: first report what is true, then suggest what should change.
14. If the user asks you to fix issues after the audit, switch from analysis to the appropriate write skill, then use `tool_schema` before uncertain writes.

## Related Tools

- `util.project.overview`
- `onto.project.graph.get`
- `onto.task.list`
- `onto.goal.list`
- `onto.plan.list`
- `onto.milestone.list`
- `onto.risk.list`
- `onto.document.tree.get`
- `cal.event.list`

## Guardrails

- Do not claim an audit is exhaustive unless you actually fetched enough targeted data to support that claim.
- Do not mutate project data by default during an audit.
- Do not confuse ideal structure with required structure; some projects legitimately have thin hierarchy.
- Distinguish confirmed blockers from inferred risks.
- Keep audit findings grounded in visible context or tool results, not generic project-management advice.
- Do not force every task into a hierarchy. Some one-off tasks are legitimate, but name them as one-off work and explain whether that helps or hurts project clarity.
- Do not treat missing documentation as automatically bad. Explain what decision, strategy, or execution risk the missing document creates.
- Do not overstate velocity if completion history, update history, or reschedule history is unavailable.

## Examples

### Audit a project for structural and execution gaps

- Load `project_audit` from project context.
- Read the project overview or graph plus key task, plan, milestone, and risk lists when needed.
- Trace goals to milestones, plans, tasks, and supporting documents.
- Summarize the highest-severity findings with evidence.
- Recommend the smallest set of changes that would materially improve project health.

### Check whether a project is drifting or stale

- Inspect task states, recent updates, unresolved risks, and near-term milestones.
- Use calendar reads if upcoming events or work sessions affect the assessment.
- Report what looks stale, what is slipping, and what is simply absent from the fetched data.

### Find loose work and duplicate effort

- Search/list tasks, plans, documents, and milestones by project.
- Identify tasks with no clear parent outcome and duplicate-looking records with overlapping names or descriptions.
- Recommend whether to link, merge, archive, rename, or leave the work as a deliberate one-off.

### Audit documentation against goals

- Compare major goals and plans against project documents and document tree entries.
- Flag goals that need a strategy, research, brief, requirements, or decision document before execution can improve.
- Prioritize documentation gaps that block action or create repeated confusion.

## Notes

- A project audit is an analysis workflow, not a separate chat context.
- Context snapshots can be intentionally limited. Fetch more before making strong "all clear" or "nothing exists" claims.
- The best audits synthesize the whole project, not just a list of defects. Explain the shape of the project and why the issues matter.
- Good audit output usually has: executive readout, strongest findings, evidence, timeline/velocity assessment, structural gaps, documentation gaps, and prioritized next corrections.
