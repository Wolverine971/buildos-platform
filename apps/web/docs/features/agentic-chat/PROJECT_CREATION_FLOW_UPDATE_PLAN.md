<!-- apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_UPDATE_PLAN.md -->

# Project Creation Flow Update Plan

## Purpose

Define the updates required so agentic project creation **only** uses the new
ontology relationship FSM (`entities` + `relationships`) and **never** uses legacy
ProjectSpec arrays (`goals`, `plans`, `tasks`, etc.). Legacy arrays must be rejected
with a hard 400, and `relationships` is required on every call.

## Current State (Verified)

- `create_onto_project` routes to `/api/onto/projects/instantiate`.
- Prompt guidance still instructs the model to infer **goals/tasks** (no relationship
  payload), e.g., `context-prompts.ts` Step 4 includes goals/tasks outputs.
- `plan-orchestrator.ts` explicitly requires “starter goals” in the creation plan.
- Tool definitions (`ontology-write.ts`) still document legacy arrays and include
  a `ProjectSpec` schema that accepts `goals`, `plans`, `tasks`, etc.
- Executor (`ontology-write-executor.ts`) still falls back to legacy arrays when
  `entities` are missing.
- API schema (`apps/web/src/lib/types/onto.ts`) still validates legacy arrays, so
  instantiation accepts them today.

## Decision

Legacy ProjectSpec arrays are **disallowed** going forward. The only supported
structure for project creation is:

- `project`
- `entities` (temp_id-based)
- `relationships` (directional connections)

Any payload including legacy arrays should be rejected with a hard 400 so bad
prompts are visible immediately.

### Decisions (Confirmed)

- **Hard 400** for any legacy array usage.
- **`relationships` is required** (can be empty only when there is a single entity).
- **No external clients** depend on legacy `create_onto_project`.

## Why This Change (Rationale)

- **Graph integrity**: relationships are the source of truth for containment + semantic edges.
- **FSM alignment**: the auto-organizer can only enforce rules when relationships are explicit.
- **Consistency**: arrays create ambiguous parentage and non-directional links.
- **Agent reliability**: a single schema simplifies prompting and reduces tool confusion.

## Data Contract (Canonical)

### Entities

- `temp_id` is required and must be unique within the payload.
- `kind` must be one of: goal, milestone, plan, task, document, output, risk, decision,
  requirement, metric, source.
- Per-kind fields should be provided when known (see Tool Schema Expansion).

### Relationships

- Direction matters: `[from, to]` means the `from` entity connects to the `to` entity.
- The FSM will infer containment or semantic edges from this directional pair.
- Optional `rel` and `intent` can force explicit semantics when needed.
- `relationships` is required even when empty; include `[]` if a single entity has no links.
- If multiple entities are created, at least one relationship should be present.
  (Hard 400 if `relationships` is empty when multiple entities exist.)

### Task Fallback Rule (Explicit)

- Task loses project containment only when connected to plan, goal, milestone, or task.
- Task stays project-contained if only connected to documents, risks, or decisions.

## Execution Path (Agentic Chat)

Project creation flows through the following chain; each layer must enforce the
same schema (`entities` + `relationships` only):

1. **Planner + Context Prompts** decide to create a project
    - `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
    - `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
2. **Plan Orchestrator** ensures `create_onto_project` is executed
    - `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
3. **Tool Definition** dictates the schema available to the LLM
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
4. **Tool Executor** normalizes and forwards the payload
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
5. **API Route** validates and calls instantiation
    - `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`
6. **Instantiation Service + Auto-Organizer** build relationships
    - `apps/web/src/lib/services/ontology/instantiation.service.ts`
    - `apps/web/src/lib/services/ontology/auto-organizer.service.ts`

Each layer should reject legacy arrays; the API should be the final hard stop.

## Research Findings (Agentic Chat Surface Area)

### Prompt Layers

- `context-prompts.ts` Step 4 instructs the model to emit `goals`, `tasks`, and `outputs`
  without mentioning `entities` + `relationships`.
- `plan-orchestrator.ts` forces a `create_onto_project` step with “starter goals” in the spec.
- `planner-prompts.ts` uses “starter goals/tasks” language when describing creation.

### Tool Definitions

- `ontology-write.ts` includes a legacy ProjectSpec payload in the tool description:
  `goals`, `plans`, `tasks`, `requirements`, `outputs`, `documents`, etc.
- The schema itself treats `entities`/`relationships` as optional and documents
  legacy arrays as “ignored if entities provided.”
- The create_onto_project narrative still tells the model to infer “basic goals and
  tasks from the user description,” which must be replaced with entity+relationship
  construction guidance.
- Tool docs still show legacy payload language in some examples.

### Executor + API

- Executor (`ontology-write-executor.ts`) falls back to `goals/plans/tasks` when
  `entities` are missing and still builds context docs from legacy goals/tasks.
- API schema (`ProjectSpecSchema`) accepts legacy arrays and does not require
  `relationships`, so malformed calls still pass today.

### Tool Docs + Flow Analysis

- `PROJECT_CREATION_FLOW_ANALYSIS.md` should stay aligned to entities + relationships.
- `tool-system/DOCUMENTATION.md` and `QUICK_REFERENCE.md` must reflect the new schema
  (no legacy arrays, `/api/onto/projects/instantiate`).

## Validation Rules (Hard 400)

Reject any payload that violates these rules:

- `relationships` missing entirely.
- `relationships` empty with multiple entities.
- Any legacy array keys present (`goals`, `plans`, `tasks`, `requirements`, `outputs`, `documents`),
  even if empty.
- Relationships referencing unknown `temp_id`s or mismatched kinds.

This enforces a single schema and makes prompt regressions immediately visible.

## Updates Needed (Action List)

### 0) Remove Legacy Array Surface Area (Global)

- Remove legacy arrays from `ProjectSpecSchema` and reject any payload containing them.
- Strip legacy arrays out of tool definitions and examples.
- Ensure executor never emits legacy arrays.

### 1) Prompt Updates (LLM Guidance)

- Update project creation prompts to **require** `entities` + `relationships`.
- Make it explicit that legacy arrays are invalid.
- Include a short, concrete example and the directional meaning of relationships.

Files:

- `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
    - Step 4 currently emits goals/tasks/outputs; replace with **entities + relationships**
      and include an example directional pair.
    - Add the task fallback rule: project containment only drops for plan/goal/milestone/task
      connections (docs/risks/decisions keep project containment).
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
    - Replace “starter goals” language with “starter entities + relationships.”
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
    - Add a one-line reminder: for project creation, only use entities + relationships.

### 2) Tool Schema Expansion (Create Project)

The `entities` schema in the tool definition is minimal. Expand it to include the full
per-kind fields and **remove legacy arrays** from the create tool parameters entirely.
Also make `entities` and `relationships` required at the tool schema level so the
LLM cannot omit them.

Suggested per-kind fields:

- Goal: `description`, `target_date`, `measurement_criteria`, `priority`
- Milestone: `due_at`, `description`
- Plan: `description`, `state_key`, `start_date`, `end_date`
- Task: `description`, `priority`, `start_at`, `due_at`, `state_key`
- Risk: `impact`, `probability`, `content`, `state_key`
- Decision: `decision_at`, `rationale`, `outcome`, `state_key`
- Output: `type_key`, `state_key`, `description`
- Document: `type_key`, `state_key`, `body_markdown`, `description`
- Requirement: `type_key`
- Metric: `unit`, `definition`, `target_value`
- Source: `uri`, `snapshot_uri`, `name`

Files:

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`

### 3) Tool Documentation Alignment

Docs still describe legacy arrays and the old endpoint. Update all mentions to
the new schema and endpoint:

- `apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md`
    - Remove legacy arrays from create_onto_project.
    - Add `entities`, `relationships`, relationship direction, and temp_id usage.
    - Endpoint should reflect `/api/onto/projects/instantiate`.
- `apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md`
    - Update create_onto_project entry and endpoint mapping.
- `apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_ANALYSIS.md`
    - Update ProjectSpec interface to include `entities`/`relationships`.
    - Add the directional meaning of relationships `[from, to]`.
    - Link back to this update plan for migration work.

### 4) API + Schema Enforcement (Hard Reject)

Require the new shape at the API boundary so legacy prompts fail fast:

- `apps/web/src/lib/types/onto.ts`
    - Remove or deprecate legacy arrays from `ProjectSpecSchema`.
    - Require `entities` and `relationships` for project creation.
- `apps/web/src/lib/services/ontology/instantiation.service.ts`
    - Guard: if any legacy arrays exist, throw validation error.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
    - Remove legacy array support; always send entities + relationships.
    - Keep context doc generation based on entities (goals/tasks via kind).

### 5) Test Prompt Fixtures

Ensure agentic test prompts align with the new schema:

- `apps/web/docs/features/agentic-chat/TEST_PROMPTS.md`
    - Add a complex example that uses entities + relationships.

### 6) Optional UX Display Tweaks

If we want better UX around project creation:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - Consider showing entity counts when create_onto_project is called
      (goals/plans/tasks based on entities array).

## Rollout Strategy

1. **Prompt + tool definition update first** so the LLM stops emitting legacy arrays.
2. **Executor enforcement** (strip or reject legacy arrays client-side) to prevent regressions.
3. **API hard rejection** of legacy arrays in `ProjectSpecSchema`.
4. **Docs + examples** updated to match the new contract.

## Risks & Mitigations

- **Risk**: older prompts/tool docs keep emitting arrays → **Mitigation**: remove arrays from
  tool schema and prompts before API rejection ships.
- **Risk**: external clients still send legacy payloads → **Mitigation**: respond with clear
  400 error and migration guidance; optionally log payloads for telemetry.
- **Risk**: LLM omits relationships entirely → **Mitigation**: prompt explicitly requires at
  least one relationship when any entities are linked; add validation in executor.

## Observability

- Log validation failures at `/api/onto/projects/instantiate` for legacy arrays.
- Track create_onto_project calls that include `entities` but no `relationships`.
- Capture counts of entities by kind for quick debugging in tool results.

## Related Docs

- `docs/specs/ONTOLOGY_RELATIONSHIP_FSM_SPEC.md`
- `docs/specs/ONTOLOGY_AUTO_ORGANIZATION_SPEC.md`
- `docs/specs/PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md`
- `docs/api/ontology-endpoints.md`
- `apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_ANALYSIS.md`
- `apps/web/docs/features/agentic-chat/tool-system/DOCUMENTATION.md`
- `apps/web/docs/features/agentic-chat/tool-system/QUICK_REFERENCE.md`
- `apps/web/docs/features/agentic-chat/TEST_PROMPTS.md`

## Recommended Example (New Schema)

```json
{
	"project": {
		"name": "AI Launch Playbook",
		"type_key": "project.business.campaign",
		"description": "Launch plan for the AI product rollout.",
		"props": { "facets": { "context": "commercial", "scale": "medium", "stage": "planning" } }
	},
	"entities": [
		{ "temp_id": "goal-1", "kind": "goal", "name": "Ship launch brief" },
		{ "temp_id": "plan-1", "kind": "plan", "name": "Marketing Plan" },
		{ "temp_id": "task-1", "kind": "task", "title": "Draft messaging pillars" }
	],
	"relationships": [
		[
			{ "temp_id": "goal-1", "kind": "goal" },
			{ "temp_id": "plan-1", "kind": "plan" }
		],
		[
			{ "temp_id": "plan-1", "kind": "plan" },
			{ "temp_id": "task-1", "kind": "task" }
		]
	]
}
```

## Expanded Examples (Common Patterns)

### Task references a document, stays project-contained

```json
{
	"entities": [
		{ "temp_id": "task-1", "kind": "task", "title": "Summarize research" },
		{ "temp_id": "doc-1", "kind": "document", "title": "Research Notes" }
	],
	"relationships": [
		[
			{ "temp_id": "task-1", "kind": "task" },
			{ "temp_id": "doc-1", "kind": "document" }
		]
	]
}
```

### Task depends on another task, drops project containment

```json
{
	"entities": [
		{ "temp_id": "task-1", "kind": "task", "title": "Design UI" },
		{ "temp_id": "task-2", "kind": "task", "title": "Implement UI" }
	],
	"relationships": [
		[
			{ "temp_id": "task-2", "kind": "task" },
			{ "temp_id": "task-1", "kind": "task" }
		]
	]
}
```

### Plan supports a goal, tasks contained by plan

```json
{
	"entities": [
		{ "temp_id": "goal-1", "kind": "goal", "name": "Launch MVP" },
		{ "temp_id": "plan-1", "kind": "plan", "name": "Execution Plan" },
		{ "temp_id": "task-1", "kind": "task", "title": "Ship onboarding flow" }
	],
	"relationships": [
		[
			{ "temp_id": "goal-1", "kind": "goal" },
			{ "temp_id": "plan-1", "kind": "plan" }
		],
		[
			{ "temp_id": "plan-1", "kind": "plan" },
			{ "temp_id": "task-1", "kind": "task" }
		]
	]
}
```

## Acceptance Criteria

- create_onto_project **only** sends entities + relationships (no legacy arrays).
- API rejects any ProjectSpec payload containing legacy arrays.
- Prompt guidance and tool docs show the new schema and relationship direction.
- Task fallback behavior is documented and matches the FSM rules.

## Testing Recommendations

- Project creation using entities + relationships creates correct containment.
- Task linked only to document/risk/decision retains project containment.
- Task linked to plan/goal/milestone/task drops project containment.
- Legacy-array payload returns a clear 400 validation error.
