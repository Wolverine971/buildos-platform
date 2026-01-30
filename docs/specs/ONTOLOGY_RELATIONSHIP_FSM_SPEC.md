<!-- docs/specs/ONTOLOGY_RELATIONSHIP_FSM_SPEC.md -->

# Ontology Relationship FSM Spec

## Purpose

Define a single, centralized relationship engine that turns simple "connections" into canonical graph edges. The engine enforces directional containment, auto-heals redundant edges, and keeps edge-building logic out of API endpoints.

## Scope

This spec is the canonical source for relationship rules and resolution. For high-level philosophy see [Project Ontology Linking Philosophy](./PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md). For API and implementation details see [Ontology Auto-Organization Spec](./ONTOLOGY_AUTO_ORGANIZATION_SPEC.md).

## Related docs

- [Project Ontology Linking Philosophy](./PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md)
- [Ontology Auto-Organization Spec](./ONTOLOGY_AUTO_ORGANIZATION_SPEC.md)
- [Ontology Relationship Rules (Agentic Chat)](../../apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md#ontology-relationship-rules)

## Goals

- Single API for relationship updates: entity + connected entities.
- Directional containment rules with predictable precedence.
- Auto-healing reparenting when deeper parents appear.
- Centralized rules that can drive future actions (FSM hooks).
- Project instantiation accepts `entities` + `relationships` only; legacy arrays are rejected and `relationships` is required.

## Non-goals

- Redesigning all UI flows or introducing new UI.
- Replacing semantic edges with containment edges when intent is explicit.
- Eliminating all multi-parent scenarios (they remain allowed but discouraged).

## Terminology

- Containment edge: structural parent -> child edges (tree/DAG).
- Semantic edge: meaning edges that do not define containment (references, supports_goal).
- Connection: an adjacency between two entities without specified direction.
- Primary parent: the single parent used for tree views (`props.is_primary = true`).
- ProjectSpec relationships: list of pairs of `{temp_id, kind}` used at instantiation time.

## Directional Flow (Default)

```
project -> has_goal -> goal
goal -> has_milestone -> milestone
milestone -> has_plan -> plan
plan -> has_task -> task
```

Containment extensions:

- milestone -> has_task -> task (task can be contained by milestone)
- task|plan|milestone|goal|project -> has_risk -> risk
- task|plan|milestone|goal|project -> has_decision -> decision
- task|milestone|plan|decision|project -> has_requirement -> requirement
- task|plan|milestone|decision|goal|risk|project -> has_metric -> metric

Allowed derivations:

- goal -> has_plan -> plan (skip milestone)
- goal -> has_task -> task (skip plan)
- project -> has_plan -> plan (seed state)
- project -> has_task -> task (seed state)

Semantic defaults:

- entity -> references -> document
- entity -> references -> source
- goal|milestone -> produces -> output
- entity -> references -> output (when not a producer)
- document -> has_part -> document (child documents)
- task -> depends_on -> task

Reasoning notes (good-judgment defaults):

- Sources stay project-contained (`has_source`) for discoverability, while references capture meaning from the owning entity.
- Outputs stay project-contained (`has_output`) for discoverability; `produces` models semantic ownership for goals/milestones.
- Multi-parent containment is disabled by default to preserve a clear tree; it can be enabled explicitly via options.
- Task dependencies remove project containment even if no other parent exists.
- Task-to-task links never inherit the other task's parent.

## Containment Policy (Precedence)

Containment is resolved with an ordered parent preference. If a higher-precedence parent is present, lower-precedence containment edges are removed.

| Child       | Allowed parents (high -> low)                        | Rel             | Project fallback |
| ----------- | ---------------------------------------------------- | --------------- | ---------------- |
| goal        | project                                              | has_goal        | required         |
| milestone   | goal                                                 | has_milestone   | no               |
| plan        | milestone, goal, project                             | has_plan        | yes              |
| task        | plan, milestone, goal, project                       | has_task        | yes\*            |
| risk        | task, plan, milestone, goal, project                 | has_risk        | yes              |
| decision    | task, plan, milestone, goal, project                 | has_decision    | yes              |
| requirement | task, milestone, plan, decision, project             | has_requirement | yes              |
| metric      | task, plan, milestone, decision, goal, risk, project | has_metric      | yes              |

Notes:

- If a milestone has no goal, either reject or create a scaffold goal.
- If multiple parents are provided at the same precedence, one is marked primary.
- If `allowMultiParent` is false, all but the primary parent are removed.
- Task rule: project fallback is disabled only when a task connects to a plan, goal, milestone, or another task. Connections to documents, risks, or decisions do not de-root the task.
- Task-to-task dependencies do not create containment or parent inheritance.

## Non-containment entity types (project-contained + semantic)

- Document: `project -> has_document -> document` plus `entity -> references -> document`.
- Source: `project -> has_source -> source` plus `entity -> references -> source`.
- Output: `project -> has_output -> output` plus `goal|milestone -> produces -> output` when explicit, otherwise `entity -> references -> output`.

## Semantic Rules (Fallbacks)

When a connection is not chosen as containment, the FSM may convert it to a semantic edge:

- task + goal (goal not parent) -> supports_goal
- plan + goal (goal not parent) -> supports_goal
- task + milestone (milestone not parent) -> targets_milestone
- plan + milestone (milestone not parent) -> targets_milestone
- entity + document -> references (direction: entity -> document)
- entity + source -> references (direction: entity -> source)
- entity + output -> references (unless producer)
- goal|milestone + output -> produces
- task + task -> depends_on

If no semantic mapping exists, the connection is ignored.

## Input API (Simple Connections)

Endpoints should pass only entity + connections:

```json
{
	"entity": { "kind": "task", "id": "uuid" },
	"connections": [
		{ "kind": "plan", "id": "uuid" },
		{ "kind": "goal", "id": "uuid" },
		{ "kind": "document", "id": "uuid" }
	],
	"options": {
		"allowProjectFallback": true,
		"allowMultiParent": false,
		"mode": "replace"
	}
}
```

Optional override for ambiguous cases:

```json
{ "kind": "goal", "id": "uuid", "intent": "semantic", "rel": "supports_goal" }
```

Defaults:

- If `intent` is omitted, the FSM infers containment or semantic.
- `connections` on update are treated as the desired state for containment.
- Child containment updates are merged with existing parents unless `mode` overrides.

## Instantiation payload (ProjectSpec)

Project instantiation is strict and uses temp_id relationships:

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

## Examples (Short)

Task with only a document reference keeps project containment:

```json
{
	"entity": { "kind": "task", "id": "task-1" },
	"connections": [{ "kind": "document", "id": "doc-1" }]
}
```

Result: project -> has_task -> task-1, task-1 -> references -> doc-1.

Task linked to a plan loses project containment:

```json
{
	"entity": { "kind": "task", "id": "task-1" },
	"connections": [{ "kind": "plan", "id": "plan-1" }]
}
```

Result: plan-1 -> has_task -> task-1, remove project -> has_task -> task-1.

Task linked only to a risk keeps project containment:

```json
{
	"entity": { "kind": "task", "id": "task-1" },
	"connections": [{ "kind": "risk", "id": "risk-1" }]
}
```

Result: project -> has_task -> task-1, task-1 -> has_risk -> risk-1.

Task linked to another task becomes a dependency and loses project containment:

```json
{
	"entity": { "kind": "task", "id": "task-1" },
	"connections": [{ "kind": "task", "id": "task-2" }]
}
```

Result: task-1 -> depends_on -> task-2, remove project -> has_task -> task-1. No parent inheritance from task-2.

## FSM Resolution Algorithm (High Level)

1. Validate all connections belong to the project.
2. Classify each connection relative to the entity:
    - Parent candidate (connection kind is allowed parent).
    - Child candidate (entity kind is allowed parent for connection).
    - Semantic candidate (document, source, output, dependencies).
3. Pick containment parent(s) using precedence rules:
    - Highest-precedence parent wins.
    - Remove lower-precedence containment edges.
4. Convert remaining candidates to semantic edges per rules.
5. Apply changes:
    - For each child candidate, update containment for the child.
    - For the entity, update containment and semantic edges.

## Architecture / Modules

- `apps/web/src/lib/services/ontology/relationship-policy.ts`
    - Declarative containment precedence and semantic mappings.
- `apps/web/src/lib/services/ontology/relationship-resolver.ts`
    - Accepts `entity`, `connections`, `options`.
    - Produces an EdgePlan: containment updates, semantic edges, transition events.
- `apps/web/src/lib/services/ontology/auto-organizer.service.ts`
    - Calls resolver and applies the plan.
- `apps/web/src/lib/services/ontology/containment-organizer.ts`
    - Applies containment edges and prunes lower-precedence parents.
- `apps/web/src/lib/services/ontology/edge-direction.ts`
    - Canonicalizes edge direction and allowed parent sets.

## Endpoint simplification

Endpoints should:

1. Validate project ownership.
2. Create/update the entity row.
3. Call `autoOrganizeConnections(...)` with the connections array.

Legacy fields map into `connections` in one place (helper). Project instantiation is strict and
accepts only `entities` + `relationships`.

## Self-healing Behavior

- If a deeper parent is added, remove the project edge (and any lower-precedence containment edges).
- If a deeper parent is removed, fall back to the next available parent or project.
- Task exception: project fallback is disabled only for structural connections (plan/goal/milestone/task).
- Semantic edges are replaced only when explicitly provided in connections.

## Feasibility

This is feasible with the existing containment organizer and auto organizer:

- Containment edges are already reconciled with insert/delete operations.
- The resolver only needs to compute a plan and call existing apply functions.
- Edge-direction normalizes direction and allowed parent sets.

## Testing

- `apps/web/src/lib/services/ontology/relationship-resolver.test.ts`
    - Task fallback behavior and task-to-task dependency.
- `apps/web/src/lib/services/ontology/instantiation.service.test.ts`
    - Legacy array rejection and relationships-required validation.
- Integration tests for endpoints:
    - Create task with connections array and verify containment/semantic edges.

## Open Questions

- Should `has_part` be the canonical rel for document -> document, or should we reuse `contains`?
