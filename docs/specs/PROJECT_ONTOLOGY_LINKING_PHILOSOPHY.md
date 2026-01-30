<!-- docs/specs/PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md -->

# Project Ontology Linking Philosophy

## Purpose

Define rules and heuristics for how the agent links ontology entities so project graphs stay navigable, with minimal early inference and increasing structure as projects grow.

## Scope

This document captures product and agent philosophy plus high-level linking heuristics. The canonical rules and edge precedence live in [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md), and the API/implementation contract lives in [Ontology Auto-Organization Spec](./ONTOLOGY_AUTO_ORGANIZATION_SPEC.md).

## Status (current)

- Auto-organizer and relationship resolver enforce containment in create/update endpoints; redundant project links are removed when deeper parents exist.
- Project instantiation accepts `entities` + `relationships` only; legacy arrays are rejected with hard-400 validation.
- `relationships` is required even when empty; if multiple entities exist, at least one relationship is required.
- Task project fallback is disabled only for structural connections (plan/goal/milestone/task); doc/risk/decision-only connections keep project containment.
- Document child links use `has_part`.

## Research notes (existing docs)

- docs/examples/george-washington-revolutionary-war-project.md: key design principle is a deeply nested graph; tasks connect to plans or milestones, not directly to the project.
- docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md: canonical containment edges are project -> has_plan -> plan and plan -> has_task -> task. project_id answers ownership; edges answer how connected.

These sources emphasize nested graphs; this doc standardizes the linking policy and the agent workflow.

## Related docs

- [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md)
- [Ontology Auto-Organization Spec](./ONTOLOGY_AUTO_ORGANIZATION_SPEC.md)
- [Project Graph Query Pattern Spec](./PROJECT_GRAPH_QUERY_PATTERN_SPEC.md)
- [Project Graph Enhancements Spec](./PROJECT_GRAPH_ENHANCEMENTS_SPEC.md)
- [Ontology API Reference](../api/ontology-endpoints.md)
- [Ontology Endpoints Audit](../reports/ontology-endpoints-audit.md)
- [Ontology Relationship Rules (Agentic Chat)](../../apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md#ontology-relationship-rules)
- [Project Creation Flow (Agentic Chat)](../../apps/web/docs/features/agentic-chat/README.md#project-creation-flow)

## Implementation references

- `apps/web/src/lib/services/ontology/auto-organizer.service.ts`
- `apps/web/src/lib/services/ontology/containment-organizer.ts`
- `apps/web/src/lib/services/ontology/relationship-resolver.ts`
- `apps/web/src/lib/services/ontology/relationship-policy.ts`
- `apps/web/src/lib/services/ontology/edge-direction.ts`
- `apps/web/src/lib/services/ontology/instantiation.service.ts`
- `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`
- `apps/web/src/lib/types/onto.ts`
- `apps/web/src/routes/api/onto/tasks/create/+server.ts`
- `apps/web/src/routes/api/onto/plans/create/+server.ts`
- `apps/web/src/routes/api/onto/milestones/create/+server.ts`
- `apps/web/src/routes/api/onto/documents/create/+server.ts`
- `apps/web/src/routes/api/onto/risks/create/+server.ts`
- `apps/web/src/routes/api/onto/decisions/+server.ts`
- `apps/web/src/routes/api/onto/outputs/create/+server.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`

## Philosophy

1. Keep the project as a root index, not a task bucket.
2. Favor container nodes for scale and scanning: goals, plans, milestones, documents.
3. Minimize inference early; use reversible scaffolding.
4. Use edges for meaning; rely on project_id for ownership only.
5. Increase structural strictness as the project grows.

## Core containment rules (summary)

- Direct project containment is a fallback for goals, plans, tasks, documents, outputs, sources, risks, decisions, requirements, and metrics when no deeper parent exists.
- Goals only have a project parent.
- Milestones only have a goal parent (never a plan or task).
- Plans can have a parent of milestone, goal, or project.
- Tasks can have a parent of plan, milestone, goal, or project (fallback).
- Task-to-task links are `depends_on` only; do not inherit the other task's parent.
- If a task connects to a plan/goal/milestone/task, remove project containment. Doc/risk/decision-only connections keep project containment.
- Risks and decisions can be children of task/plan/milestone/goal/project.
- Requirements can be children of project/plan/milestone/task/decision.
- Metrics can be children of project/plan/task/goal/risk/milestone/decision.
- Documents, sources, and outputs remain project-contained for discoverability; semantic edges carry meaning.
- Document -> document uses `has_part` for child documents.

## Progressive structuring levels

Level 0: Seed

- Use when project has 1 to 5 tasks and low certainty.
- Create project + Backlog plan if any tasks exist.
- Do not infer goals unless user states an explicit outcome.

Level 1: Emerging

- Trigger: 6+ tasks, multiple themes, or mention of phases, milestones, or deadlines.
- Propose goals and 1 to 3 plans.
- Reparent existing tasks into plans; leave unknown tasks in Backlog.

Level 2: Structured

- Trigger: 16+ tasks, multiple milestones, or explicit deliverables.
- Enforce that new tasks must attach to a plan or milestone.
- Create goals for stated outcomes; link tasks to goals via supports_goal.

Level 3: Mature

- Trigger: 40+ tasks or long timeline.
- Require plan or milestone for every task.
- Encourage goal -> milestone -> plan -> task chains.

## Linking decision order for tasks

1. Plan if task is part of a phase or workstream.
2. Milestone if task targets a checkpoint or release.
3. Goal if task is directly about the outcome and no plan or milestone exists.
4. Backlog plan as default.
5. Project direct link only if user explicitly asks for a flat structure.
6. If the task only depends on another task, use `depends_on` and do not infer containment from the other task.

## Milestones as sub-goals

- Every milestone must have a parent goal (goal -> has_milestone).
- If a milestone appears before a goal exists, create a scaffold goal (is_scaffold: true) and ask for confirmation.
- Milestones can own plans or tasks, but their semantic parent is always a goal.

## Risks and decisions (semantic placement)

- Risk: link to the entity it threatens (goal, milestone, plan, task). Use project only for cross-cutting risk.
- Decision: link to the entity it resolves or commits to. If it determines a milestone or plan, link there first.
- Preferred edge patterns:
    - entity -> has_risk -> risk
    - entity -> has_decision -> decision
    - decision -> resolves -> risk (optional when explicitly stated)

## Requirements and metrics

- Requirements should be attached to the most specific container (task/plan/milestone/decision). Use project only when no narrower parent exists.
- Metrics should be attached to the most specific entity (task/plan/goal/risk/milestone/decision), with project as fallback.

## Documents, sources, outputs

- Document references are always entity -> references -> document.
- Document -> document uses has_part for child documents.
- Sources are semantic references from any entity (entity -> references -> source).
- Outputs are semantic children:
    - goal/milestone -> produces -> output when the entity is explicitly a producer.
    - otherwise entity -> references -> output.

## Simple linking system for the agent

Goal: keep reasoning lightweight and avoid deep inference while still producing a coherent graph.

### Step 1: Bucket by intent (single-pass)

Assign each item to one of seven buckets using surface cues:

- Outcome: goals, success criteria, end states.
- Checkpoint: milestones, dates, launch markers.
- Plan: phases, workstreams, sprints, approaches.
- Work: tasks, actions, to-dos.
- Evidence: documents, sources, outputs.
- Risk/Decision: explicit risks, blockers, commitments.
- Constraint/Measurement: requirements, metrics.

### Step 2: Attach to the nearest semantic parent

- Milestone -> Goal (required)
- Plan -> Milestone (preferred) or Goal; else Project
- Task -> Plan; if none, Milestone; else Goal; else Backlog plan/project
- Requirement -> task/plan/milestone/decision; else Project
- Metric -> task/plan/goal/risk/milestone/decision; else Project
- Document/Source/Output -> Entity it describes; else Project
- Risk/Decision -> Most specific impacted entity

### Step 3: Scaffold instead of inferring

- If a required parent is missing, create a scaffold node with {is_scaffold: true, confidence: low}.
- Ask one clarifying question if more than one parent is plausible.
- Avoid inventing new goals/plans unless the user states an explicit outcome or phase.

### Step 4: Enforce thresholds

- Once Level 1+ triggers, auto-create a Backlog plan if it does not exist.
- Once Level 2+ triggers, block creation of new tasks without a container.

## Current auto-edge behavior (tools + endpoints) -- updated

Containment edges are auto-managed by a shared organizer. Create/update endpoints map connections
into canonical containment + semantic edges and remove redundant project containment when deeper
parents exist. See [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md) for the canonical rules.

create_onto_project -> /api/onto/projects/instantiate

- Accepts `entities` + `relationships` (temp_id based) only.
- `relationships` is required even when empty; if multiple entities exist, at least one relationship is required.
- Legacy arrays (goals/plans/tasks/etc) are rejected with hard-400 validation.
- Document entities accept `body_markdown` or `content`.
- Auto-organizes containment + semantic edges.

create_onto_task -> /api/onto/tasks/create

- Accepts `connections` plus legacy fields (plan_id, goal_id, supporting_milestone_id, parent, parents).
- Containment: plan/milestone/goal/project -> has_task; project link removed when a structural parent exists.
- Semantic: supports_goal, targets_milestone, depends_on, references.
- Task-to-task creates depends_on and removes project containment; do not inherit the other task's parent.
- Task stays project-contained when only connected to documents, risks, or decisions.

create_onto_plan -> /api/onto/plans/create

- Accepts `connections` plus legacy fields (goal_id, milestone_id, parent, parents).
- Containment: goal/milestone/project -> has_plan; project link removed when deeper parent exists.

create_onto_milestone -> /api/onto/milestones/create

- Parent must be goal; containment enforced as goal -> has_milestone.

create_onto_goal -> /api/onto/goals/create

- Containment: project -> has_goal (auto-organized).

create_onto_document -> /api/onto/documents/create

- Project -> has_document is ensured; semantic references edges added for provided connections.
- Document -> document uses has_part.

create_onto_risk -> /api/onto/risks/create

- Containment: task/plan/milestone/goal/project -> has_risk (auto-organized).
- References to documents/sources/outputs are semantic.

create_onto_decision -> /api/onto/decisions

- Containment: task/plan/milestone/goal/project -> has_decision (auto-organized).
- References to documents/sources/outputs are semantic.

create_onto_output -> /api/onto/outputs/create

- Project -> has_output is ensured.
- goal/milestone -> produces -> output when connected as a producer; otherwise entity -> references -> output.

link_onto_entities -> /api/onto/edges

- Use for semantic edges only; containment should be applied via connections + auto-organizer.

### Implications for tool-calling

- Prefer `connections` on create/update for containment and semantic inference.
- Avoid direct edge creation for containment; use edges only for explicit semantic links.
- Project instantiation should use entities + relationships to leverage the FSM.

## Tool-calling simplification

To reduce cognitive load, prefer a small, repeatable tool sequence:

1. create_entities: create goals, milestones, plans, tasks, risks, decisions, documents with `connections` when known.
2. link_entities: add semantic edges only (references, produces, depends_on, supports_goal).
3. annotate_scaffolds: mark low-confidence nodes for review.

If only one tool exists, the payload should accept:

```json
{
	"entities": [
		{
			"temp_id": "plan-1",
			"kind": "goal|milestone|plan|task|risk|decision|document|requirement|metric|source|output",
			"title": "...",
			"connections": [
				{ "kind": "goal|milestone|plan|task|document|source|output", "id": "uuid" }
			],
			"props": {}
		}
	],
	"relationships": [
		[
			{ "temp_id": "plan-1", "kind": "plan" },
			{ "temp_id": "task-1", "kind": "task" }
		]
	],
	"scaffolds": ["entity_id"]
}
```

This keeps the LLM focused on three steps: create, link, mark. `relationships` must be present even when empty.

## Agent guardrails

- Ask when uncertain; do not infer goals or plans from a single vague task.
- Use scaffold containers with props {is_scaffold: true, confidence: low}.
- Avoid creating many direct project -> task edges.
- If direct project -> task edges exist, migrate them into plans once triggers fire.
- Keep edge types canonical: has_plan, has_goal, has_milestone, has_document, has_task, has_risk, has_decision, has_requirement, has_metric, supports_goal, depends_on.
- Always include `relationships` in create_onto_project payloads (use [] when empty).

## Implementation notes

- Project ownership still uses project_id on tasks; the linking policy only affects edges.
- Update migration and agent linking rules to prefer plan -> has_task.
- Add UI signals: loose tasks count, structure recommended prompt when thresholds hit.
- Log agent decisions with confidence to allow undo or user review.

## Open questions

- Should the Backlog plan be created automatically or only after first task?
- Should a single task be allowed to exist without any container if the user opts into flat mode?
