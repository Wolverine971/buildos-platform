<!-- docs/specs/ONTOLOGY_AUTO_ORGANIZATION_SPEC.md -->

# Ontology Auto-Organization Spec

## Purpose

Define a simplified API contract and an auto-organizing containment system so entity relationships self-correct as structure evolves. The goal is to accept lightweight connection inputs and keep the project graph clean and navigable.

## Scope

This spec focuses on API-level contracts and implementation details for auto-organization. Canonical relationship rules live in [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md), and product philosophy lives in [Project Ontology Linking Philosophy](./PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md).

## Status (current)

- Auto-organizer service + relationship resolver are used by core create/update endpoints.
- Project instantiation accepts `entities` + `relationships` only; legacy arrays are rejected with hard-400 validation.
- `relationships` is required even when empty; if multiple entities exist, at least one relationship is required.
- No external clients use create_onto_project, so strict 400 validation is expected and acceptable.
- Agentic chat tools and prompts require entities + relationships only.
- Targeted resolver tests cover task fallback behavior; instantiation tests cover schema validation.

## Problem Summary

Current APIs require explicit edge semantics (or silently insert edges that become redundant). This creates:

- Over-linked graphs (project directly linked to too many leaf nodes)
- Inconsistent containment edges (e.g., project->task vs plan->task)
- Manual linking burden for agents/tools

## Goals

- Simplify APIs: accept lightweight `connections` inputs, not raw edge payloads.
- Auto-organize: when a deeper parent exists, remove redundant project links.
- Stable hierarchy: keep a clear containment chain while allowing flexibility.
- Project instantiation is strict: entities + relationships only (no legacy arrays).

## Core Hierarchy (Default)

```
project
  -> goal
    -> milestone
      -> plan
        -> task
```

### Flexible Skips

- A goal can link directly to a plan (skip milestone).
- A task can link directly to a goal or milestone (skip plan).
- A milestone can only link to a goal.

## Containment vs. Semantic Relationships

- Containment edges define the structural chain for navigation.
- Semantic edges express meaning without changing containment (supports, targets, references, depends_on).

Containment edges are auto-managed. Semantic edges are explicit or inferred by the resolver.

## Containment Relationship Map (summary)

See [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md) for the canonical table and precedence. Summary:

- Goal -> Project
- Milestone -> Goal
- Plan -> Milestone/Goal/Project
- Task -> Plan/Milestone/Goal/Project (fallback)
- Risk/Decision -> Task/Plan/Milestone/Goal/Project
- Requirement -> Task/Milestone/Plan/Decision/Project
- Metric -> Task/Plan/Milestone/Decision/Goal/Risk/Project

## Auto-Organization Rules

1. Create containment edge on write
    - If a parent is provided, create the canonical containment edge.
2. Remove redundant project edges
    - If an entity gains a parent above the project, remove its direct project containment edge.
    - Example: task gets plan parent -> delete project->task edge.
3. Promote structure when new parents appear
    - If a plan is linked to a goal, remove project->plan so the chain becomes plan->goal->project.
4. Preserve task fallback rules
    - Task project fallback is disabled only when connected to plan/goal/milestone/task.
    - Doc/risk/decision-only connections keep project containment.
5. Task-to-task dependencies
    - Create `depends_on` only; do not inherit the other task's parent.
6. Auto-create semantic edges from connections
    - supports_goal, targets_milestone, depends_on, references, produces.

## Multiple Parents (Edge Cases)

Multi-parent is possible but discouraged by default:

- Primary containment: one parent edge marked `props.is_primary = true`.
- Secondary containment: additional parents use `props.is_primary = false`.
- UI/Graph traversal: default to primary for tree views; show all in graph views.

Recommendation: if a task supports multiple goals, use supports_goal for secondary goals rather than multiple containment edges.

## Simplified API Contract (connections)

All create/update endpoints accept a consistent connections shape:

```json
{
	"connections": [{ "kind": "goal|milestone|plan|task|document|source|output", "id": "uuid" }]
}
```

Rules:

- Connections are interpreted by the resolver into containment or semantic edges.
- `connections` on update are treated as the desired containment state for the entity.
- Back-compat: existing fields like `parent`, `parents`, `plan_id`, `goal_id`, `supporting_milestone_id` map into `connections` in one place.

Optional override for ambiguous cases:

```json
{ "kind": "goal", "id": "uuid", "intent": "semantic", "rel": "supports_goal" }
```

## Project Instantiation Contract (ProjectSpec)

Project instantiation is strict and uses `entities` + `relationships` only:

```json
{
	"project": { "name": "..." },
	"entities": [
		{ "temp_id": "goal-1", "kind": "goal", "title": "..." },
		{ "temp_id": "plan-1", "kind": "plan", "title": "..." }
	],
	"relationships": [
		[
			{ "temp_id": "goal-1", "kind": "goal" },
			{ "temp_id": "plan-1", "kind": "plan" }
		]
	]
}
```

Rules:

- `entities` and `relationships` are required.
- `relationships` must be present even when empty (`[]` for single-entity cases).
- If multiple entities exist, at least one relationship is required.
- Legacy arrays (goals/plans/tasks/etc) are rejected with hard-400 validation.
- No external clients use create_onto_project, so strict 400 behavior is expected.

## Entity-Specific Parent Semantics

### Task

- Containment parent: plan, milestone, or goal (project as fallback).
- Task-to-task creates depends_on and removes project containment.
- Doc/risk/decision-only connections keep project containment.

### Plan

- Containment parent: milestone or goal (project as fallback).
- If plan gains goal/milestone parent, remove project->plan edge.

### Milestone

- Containment parent: goal only.
- If no goal provided, reject or create a scaffold goal (configurable).

### Goal

- Containment parent: project only.

## Other Entities (Documents, Sources, Outputs)

These are project-scoped for visibility, and semantic edges express meaning:

- Document: entity -> references -> document (keep project->document); document -> document uses has_part.
- Source: entity -> references -> source (keep project->source).
- Output:
    - goal/milestone -> produces -> output when producer is explicit.
    - otherwise entity -> references -> output.
    - keep project->output for discoverability.

## Auto-Organization Algorithm (Pseudo)

```
resolveParents(entityKind, parentInputs): ParentEdgeSpec[]
  validate allowed parent kinds
  map parent -> canonical containment rel

applyContainment(entityId, entityKind, parentEdges):
  existing = load containment edges for entity
  delete edges not in desired set
  insert missing edges
  if parentEdges contains non-project parent:
     delete project->entity containment edges
```

## Feasibility & Risks

- Feasible: containment edges already live in `onto_edges`; auto-organizing can be implemented as a shared helper called by endpoints.
- Risk: UI code that assumes project->plan or project->task edges may need updates for nested paths.
- Migration: existing graphs can be cleaned with a background job that removes redundant project edges when deeper parents exist.
- Multi-parent complexity: DAG traversal is possible but requires a consistent primary rule for tree views.

## Implementation Checklist (current)

- [x] Update relationship rules in `edge-direction.ts` to allow new containment parents.
- [x] Add a shared auto-organizer utility and use it in create/update endpoints.
- [x] Update ProjectSpec schema + instantiation to use entities + relationships and avoid redundant edges.
- [x] Enforce hard-400 validation for legacy arrays and missing relationships.
- [x] Update agentic chat tool definitions and prompts to require entities + relationships only.
- [x] Add targeted tests for task fallback behavior and ProjectSpec validation.

## Implementation references

- `apps/web/src/lib/services/ontology/auto-organizer.service.ts`
- `apps/web/src/lib/services/ontology/containment-organizer.ts`
- `apps/web/src/lib/services/ontology/relationship-policy.ts`
- `apps/web/src/lib/services/ontology/relationship-resolver.ts`
- `apps/web/src/lib/services/ontology/edge-direction.ts`
- `apps/web/src/lib/services/ontology/instantiation.service.ts`
- `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`
- `apps/web/src/lib/types/onto.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

## Related docs

- [Project Ontology Linking Philosophy](./PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md)
- [Ontology Relationship FSM Spec](./ONTOLOGY_RELATIONSHIP_FSM_SPEC.md)
- [Project Creation Flow Update Plan](../../apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_UPDATE_PLAN.md)
- [Project Graph Query Pattern Spec](./PROJECT_GRAPH_QUERY_PATTERN_SPEC.md)
- [Project Graph Enhancements Spec](./PROJECT_GRAPH_ENHANCEMENTS_SPEC.md)
- [Ontology API Reference](../api/ontology-endpoints.md)
- [Ontology Endpoints Audit](../reports/ontology-endpoints-audit.md)
- [Ontology Data Model Analysis](../architecture/ONTOLOGY_DATA_MODEL_ANALYSIS.md)
