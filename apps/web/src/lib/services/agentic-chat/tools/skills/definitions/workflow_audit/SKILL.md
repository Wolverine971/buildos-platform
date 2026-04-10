---
name: Workflow Audit
description: Project health audit playbook for reviewing structure, blockers, stale work, risks, and missing coverage without making unsupported claims.
legacy_paths:
    - workflow.audit.skill
    - workflow.audit
    - audit.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/workflow_audit/SKILL.md
---

# Workflow Audit

Project health audit playbook for reviewing structure, blockers, stale work, risks, and missing coverage without making unsupported claims.

## When to Use

- Assess overall project health
- Look for blockers, stale work, or missing structure
- Review whether plans, tasks, milestones, and risks are aligned
- Identify missing project hygiene or follow-up actions
- Prepare an evidence-based project audit before suggesting changes

## Workflow

1. Start from an exact project scope whenever possible.
2. Prefer read-only analysis first; do not mutate the graph just because you found issues.
3. Inspect the project graph and major entity lists, then look for concrete patterns such as blocked tasks, plans without tasks, goals without milestones, milestones without supporting work, unresolved risks, or unlinked documents.
4. Use targeted list, search, graph, tree, and calendar reads when the context snapshot is incomplete or the user asks for exhaustive findings.
5. Separate observations from recommendations: first report what is true, then suggest what should change.
6. Order findings by severity and user impact rather than by entity type.
7. Call out missing data or time-window limits when they materially affect the audit.
8. If the user asks you to fix issues after the audit, switch from analysis to the appropriate skill, then use `tool_schema` and `buildos_call` for the concrete writes.

## Related Tools

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

## Examples

### Audit a project for structural and execution gaps

- Read the project graph plus key task, plan, milestone, and risk lists.
- Summarize the highest-severity findings with evidence.
- Recommend the smallest set of changes that would materially improve project health.

### Check whether a project is drifting or stale

- Inspect task states, recent updates, unresolved risks, and near-term milestones.
- Use calendar reads if upcoming events or work sessions affect the assessment.
- Report what looks stale versus what is simply not present in the fetched data.

## Notes

- An audit is an analysis workflow, not a write workflow.
- Context snapshots can be intentionally limited. Fetch more before making strong "all clear" or "nothing exists" claims.
