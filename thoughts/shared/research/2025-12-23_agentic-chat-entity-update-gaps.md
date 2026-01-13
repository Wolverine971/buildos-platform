<!-- thoughts/shared/research/2025-12-23_agentic-chat-entity-update-gaps.md -->
# Agentic Chat Entity Update Gaps (Focus + Tools)

**Date**: 2025-12-23  
**Status**: Research notes + update plan

## TL;DR
The agent can only update project/task/goal/plan/document today. Other ontology entities (milestones, risks, requirements) exist in the database and docs, but are not fully wired into:

- Focus selection types
- Entity listing API
- Ontology context types
- Tool definitions + executors
- Prompts that describe update behavior

To make the agent “flexibly update all relevant project ontology data models,” you need to close these gaps across types, API, tools, and prompts.

---

## 1. Evidence of Gaps (by file)

### Focus entity types are incomplete
- `packages/shared-types/src/agent.types.ts`
  - `ProjectFocus.focusType` excludes `requirement`.
  - `FocusEntitySummary.type` excludes `requirement`.
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`
  - UI only includes: task, goal, plan, document, milestone.
  - Missing: risk, requirement.

### Entity listing API is missing types
- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts`
  - `FocusEntityType` only supports: task, goal, plan, document, milestone.
  - Missing: risk, requirement.

### Ontology context types are incomplete
- `apps/web/src/lib/types/agent-chat-enhancement.ts`
  - `OntologyEntityType` excludes `requirement`.
  - `OntologyEntityRecordMap` + collections exclude requirement.
  - `EnhancedAgentStreamRequest.ontologyEntityType` excludes milestone/risk/requirement.

### Tooling coverage is incomplete
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
  - No list/get tools for milestone/risk/requirement.
  - `search_ontology` supports `requirement` but not `risk`.
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
  - Only update tools for: project/task/goal/plan/document.
  - No create/update/delete tools for milestone/risk/requirement.
  - `create_onto_project` *can* create requirements/milestones/risks, but there is no standalone update path.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts`
  - Linked-entity filters exclude `requirement`.

### Prompt update guidance is too narrow
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
  - Update rules mention document/task/goal/plan only (project exists, plus other entities).

---

## 2. What Needs Updating (by layer)

### A) Shared Types + Context Types
Update the shared types so the UI, API, and agentic chat can reference all entities:

- `packages/shared-types/src/agent.types.ts`
  - `ProjectFocus.focusType` add: `requirement` (and optionally `risk` if you want focus on risks).
  - `FocusEntitySummary.type` add: `requirement`.
  - `ContextShiftPayload.entity_type` add: `document`, `milestone`, `risk`, `requirement`.

- `apps/web/src/lib/types/agent-chat-enhancement.ts`
  - `OntologyEntityType` add: `requirement`.
  - Extend `OntologyEntityRecordMap` and collections to include these types.
  - `EnhancedAgentStreamRequest.ontologyEntityType` add: `milestone`, `risk`, `requirement`.

### B) Focus Selector + Entities API
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`
  - Add focus types for: risk, requirement (plus icons).
- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts`
  - Add table mappings for:
    - `onto_risks` (title/state/priority-ish fields)
    - `onto_requirements` (text/priority)

### C) Tooling and Executors
To make these entities *updateable* by the agent, you need actual tools:

- Add tool definitions for:
  - `list_onto_milestones`, `get_onto_milestone_details`, `update_onto_milestone`
  - `list_onto_risks`, `get_onto_risk_details`, `update_onto_risk`
  - `list_onto_requirements`, `get_onto_requirement_details`, `update_onto_requirement`
- Add executor implementations for each new tool (read + write).
- Update `TOOL_METADATA` so default pools include these tools where appropriate.
- Update `tools.config.ts` categories for token estimates and the tool registry.
- Update `PlanOrchestrator.PROJECT_CONTEXT_TOOLS` if these tools require `project_id` enforcement.
- Update `filterToolsForFocus()` to understand `risk`, `requirement` focus types.

### D) Prompts + Guidance
- Update `UPDATE_RULES` in `planner-prompts.ts` to include all updateable entities (project + milestone/risk/requirement) once tools exist.
- Update any context prompts that hardcode tool names (Project Workspace + fallback messages) to reference “available tools” generically.

### E) Ontology Search Support (Optional)
- `apps/web/src/routes/api/onto/search/+server.ts` and `search_ontology` tool types can be expanded to include `risk` if you want these discoverable via search.

---

## 3. Why This Matters
Right now the system implies these entities exist (DB schema, create_onto_project nesting, docs/tests), but the agent can’t actually list/get/update them during chat. This creates inconsistent behavior:

- UI focus selection can’t target requirements/risks.
- Agent prompts imply update flexibility, but tools don’t exist.
- Dynamic tool selection won’t include tools that don’t exist or aren’t in metadata.

---

## 4. Suggested Order of Work

1. **Types + Focus Selector + Entities API**
   - Make requirements/risks selectable in the UI and API.
2. **Tool definitions + executors**
   - Add CRUD tools for milestones/risks/requirements.
3. **Prompt updates**
   - Expand update rules and remove hard-coded tool names.
4. **Search expansion (optional)**
   - Add risk support to search_ontology if needed.

---

## 5. Concrete Files to Update (Checklist)

- `packages/shared-types/src/agent.types.ts` (FocusEntitySummary + ProjectFocus + ContextShiftPayload)
- `apps/web/src/lib/types/agent-chat-enhancement.ts` (OntologyEntityType + record maps + request types)
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte` (add focus types)
- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts` (add types + table mappings)
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts` (project context tool enforcement)
- `apps/web/src/lib/services/agent-context-service.ts` (focus filtering list)
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts` (update rules)
- `apps/web/src/routes/api/onto/search/+server.ts` (optional: add risk to search)

---

## 6. Notes on Update Rules
`update_onto_project` already exists and should be included in update guidance. The other entities require actual update tools to exist before prompt guidance can instruct the agent to update them.
