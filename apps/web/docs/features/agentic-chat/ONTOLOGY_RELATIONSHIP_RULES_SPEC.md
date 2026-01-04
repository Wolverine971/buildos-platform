<!-- apps/web/docs/features/agentic-chat/ONTOLOGY_RELATIONSHIP_RULES_SPEC.md -->

# Ontology Relationship Rules for Agentic Chat

**Created:** 2026-01-03  
**Status:** Implemented (Phase 1)  
**Scope:** Agentic chat prompts + ontology edge linking tools

## Overview

Agentic chat already understands ontology entities, but it lacks lightweight guidance for making semantically sound relationships and lacks first-class tools for linking arbitrary entities. This spec defines:

1. A small set of relationship rules to inject into the LLM prompt
2. A relationship palette for common entity pairings
3. Tooling updates to let the agent create/remove links across entities safely
4. Alignment steps to keep relationship directions consistent across UI, API, and prompts

## Goals

- Keep relationship creation flexible while still semantically correct
- Ensure all created entities are connected into a coherent project graph
- Give the agent a small, usable set of relationship types and defaults
- Expose safe tools for linking/unlinking entities in chat

## Non-Goals

- Enforcing hard schema constraints at the database level
- Introducing a new ontology entity type
- Rewriting the existing LinkedEntities UI or graph viewers

## Current State (Research Summary)

- Canonical relationship directions live in `apps/web/src/lib/services/ontology/edge-direction.ts`
- A normalized edge API exists: `POST /api/onto/edges` (`apps/web/src/routes/api/onto/edges/+server.ts`)
    - Normalizes deprecated rels, stamps `project_id`, blocks cross-project links
- LinkedEntities UI uses relationship auto-mapping (`apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md`)
- Agentic chat has read tools (`get_entity_relationships`, `get_linked_entities`) and write tools for linking
- Task create/update tools expose goal/milestone links in chat

## Progress Log

- 2026-01-03: Added relationship rules to planner prompt; added link/unlink tools; exposed task goal/milestone links; enabled decision linking in LinkedEntities; updated edge direction rules and docs.
- 2026-01-03: Aligned task/goal/milestone edge directions, made root task project edges conditional on goal/milestone/plan, and updated create endpoints to use `has_*` project relationships.

## Lightweight Relationship Rules (Prompt-Level)

### Base Rules

1. **Do not add project edges by default.** Entities already belong to projects via `project_id`. Only create explicit project edges for true root-level grouping.
2. **Prefer the most precise relationship.** Use a specific rel (supports, targets, produces, references) before `relates_to`.
3. **Keep links minimal.** Avoid redundant edges if a more specific edge already captures the relationship.
4. **Link by intent.** Use the relation that matches the actual meaning (support, dependency, reference, mitigation).
5. **Ask when unclear.** If the relationship target or type is ambiguous, ask a short clarification.

### Relationship Palette (Common Pairings)

| From                    | To                     | Relationship              | Use When                                   |
| ----------------------- | ---------------------- | ------------------------- | ------------------------------------------ |
| project                 | plan                   | `has_plan`                | Project includes a plan                    |
| project                 | goal                   | `has_goal`                | Project includes a goal                    |
| project                 | task                   | `contains`                | Root-level task directly under the project |
| project                 | milestone              | `has_milestone`           | Project includes a milestone               |
| project                 | document               | `has_document`            | Project includes a doc                     |
| project                 | risk                   | `has_risk`                | Project includes a risk                    |
| project                 | decision               | `has_decision`            | Project includes a decision                |
| plan                    | task                   | `has_task`                | Plan groups tasks                          |
| plan                    | goal                   | `supports_goal`           | Plan is aimed at a goal                    |
| plan                    | milestone              | `targets_milestone`       | Plan is aimed at a milestone               |
| task                    | goal                   | `supports_goal`           | Task advances a goal                       |
| task                    | milestone              | `targets_milestone`       | Task targets a milestone                   |
| goal                    | milestone              | `has_milestone`           | Goal is achieved via milestone(s)          |
| task                    | task                   | `depends_on` / `blocks`   | Task dependency or blocker                 |
| task                    | output                 | `produces`                | Task yields an output                      |
| plan/task/goal/decision | document               | `references`              | Entity references a doc                    |
| plan                    | decision               | `references`              | Plan references a decision                 |
| task                    | decision               | `references`              | Task references a decision                 |
| risk                    | task/plan/goal/project | `threatens`               | Risk impacts the work                      |
| plan/task               | risk                   | `addresses` / `mitigates` | Work reduces a risk                        |
| document                | any                    | `relates_to`              | Doc is the primary artifact                |

### Notes

- Use `relates_to` as a fallback only when no specific rel fits.
- Use `references` for knowledge/spec/decision documents attached to a plan or task.
- Use `addresses` for strategic mitigation, `mitigates` for direct mitigation actions.

## Plan Semantics (Prompt-Level)

- A plan is a lightweight sequence of steps that moves from point A to point B.
- It can include a short strategy/methodology, but anything substantial should be a separate document.
- Plans should reference that document and specify how it is used.
- Example: a growth plan can include a task to produce a brand strategy document and reference it as part of the plan.

## Prompt Injection (LLM Instructions)

Add a concise section to the planner base prompt (prefer `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`) after the Data Model overview:

```
### Relationship Sense Rules
- Do not add project edges by default; rely on `project_id` for membership.
- Only add project edges for root-level grouping when it clarifies structure.
- Prefer specific relationships (supports_goal, targets_milestone, produces, references) over relates_to.
- Use plans to group tasks, tasks to support goals, milestones as targets, and documents as references.
- Link risks to work they threaten; link plans/tasks that address or mitigate them.
- If the intended relationship is unclear, ask a short clarification before linking.
```

## Tooling Updates (Flexible Linking)

### 1) New Tools

**Tool:** `link_onto_entities`  
**Purpose:** Create one relationship edge between two entities  
**Endpoint:** `POST /api/onto/edges`

Parameters (suggested):

```json
{
	"src_kind": "plan",
	"src_id": "uuid",
	"dst_kind": "goal",
	"dst_id": "uuid",
	"rel": "supports_goal",
	"props": {}
}
```

**Tool:** `unlink_onto_edge`  
**Purpose:** Remove a relationship edge by ID  
**Endpoint:** `DELETE /api/onto/edges/[id]`

Parameters (suggested):

```json
{ "edge_id": "uuid" }
```

### 2) Expose Relationship Fields in Chat Tools

Update `create_onto_task` and `update_onto_task` tool definitions to include:

- `goal_id` (optional)
- `supporting_milestone_id` (optional)
- `plan_id` (optional, for linking existing tasks via edges)

Even if linking is handled via `link_onto_entities`, these fields enable single-step creation flows.

### 3) Tool Registry + Metadata

Add the new tools to:

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

## Edge Direction Alignment

To avoid direction drift across UI/API/agent logic:

1. Expand `RELATIONSHIP_DIRECTIONS` in `apps/web/src/lib/services/ontology/edge-direction.ts` to allow:
    - `supports_goal` from `task` and `plan`
    - `targets_milestone` from `plan`
    - `has_milestone` from `goal`
2. Align `LINKED_ENTITIES_COMPONENT.md` mapping with canonical directions
3. Prefer `/api/onto/edges` for link creation so normalization is applied consistently

## Acceptance Criteria

- Planner prompt includes the Relationship Sense Rules section
- Agent can create/remove links between project, goal, milestone, plan, task, document, risk, decision
- Links are normalized and scoped to a single project
- Relationship labels are consistent across chat context and UI

## Open Questions

1. Should we add a first-class relationship for decisions (beyond `references`)?
2. Should we allow goals to reference decisions directly?
