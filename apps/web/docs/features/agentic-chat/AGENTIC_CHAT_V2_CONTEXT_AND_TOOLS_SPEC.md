<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_CONTEXT_AND_TOOLS_SPEC.md -->

# Agentic Chat V2 — Context + Tooling Spec (Current + FastChat)

**Status:** Draft (Design)  
**Owner:** BuildOS  
**Date:** 2026-02-06  
**Scope:** Documents how context is assembled today and how tools are selected by context type.
Includes baseline token counts and a proposed FastChat tool spec.

---

## 1. Existing Context Assembly (Current System)

This section describes the current production context pipeline used by
`/api/agent/stream` (planner-first orchestration).

### 1.1 Entry Flow (High Level)

1. **UI** → POST `/api/agent/stream`
2. **SessionManager** resolves/creates `chat_sessions`
3. **OntologyCacheService** loads ontology context with caching
    - Optional prewarm caches stored in `chat_sessions.agent_metadata`
4. **AgentContextService.buildPlannerContext**
    - system prompt (PromptGenerationService)
    - location context (ontology or progressive-disclosure context)
    - conversation history (compression optional)
    - user preferences injection (optional)
    - available tool pool (ALL_TOOLS)
5. **ToolSelectionService** filters tools by context + focus + strategy
6. **Orchestrator** streams LLM response + tools

### 1.2 Context Layers (Planner)

**Layer A — System Prompt (PromptGenerationService)**

- Source: `apps/web/src/lib/services/agentic-chat/prompts/`
- Base prompt sections (planner):
    - identity
    - platform context
    - data model overview
    - session context (context type guidance + last turn info)
    - operational guidelines
    - behavioral rules
    - error handling
    - proactive intelligence
    - task type key guidance (short)
- Context-specific additions:
    - `project`: workspace operating guide
    - `project_create`: creation workflow + type key guidance + context document rules
    - `brain_dump`: exploration prompt
    - `ontology`: ontology override
    - focus entity: adds focus-specific prompt (if known)

**Layer B — Location Context (AgentContextService)**

- Source: `apps/web/src/lib/services/agent-context-service.ts`
- Chooses one of:
    - **Ontology context** via `OntologyContextLoader` (project/element/global)
    - **Combined context** (project + focus entity)
    - **ChatContextService** (progressive disclosure) for non-ontology contexts
- Formatter: `apps/web/src/lib/services/context/context-formatters.ts`

**Layer C — Conversation History**

- Source: `ChatCompressionService` + `AgentContextService.processConversationHistory`
- Behavior:
    - Uses rolling summary if over budget
    - Keeps last N messages when compression fails or deferred
    - Emits `context_usage` snapshot for UI telemetry

**Layer D — User Preferences (Optional)**

- Merges global + project-specific preferences
- Injected as natural language snippets

**Layer E — Linked Entities (Optional)**

- Uses `OntologyContextLoader.loadLinkedEntitiesContext`
- Included in system prompt for focus entities

---

## 2. Ontology Context Sources (What Is Loaded)

**OntologyContextLoader** (`apps/web/src/lib/services/ontology-context-loader.ts`):

- **Global context**
    - Project list (abbreviated), entity counts, hints
- **Project context**
    - Project graph snapshot (tasks/goals/plans/docs/risks/requirements)
    - Doc structure preview (truncated)
    - Highlights (recent tasks, top docs, risks, etc.)
- **Element context**
    - Focus entity details
    - Parent project summary
    - Relationship edges
    - Doc structure preview (if document)
- **Combined context**
    - Project summary + focus entity + relationships
    - Doc structure preview

**Caching layers**

- Session cache: `chat_sessions.agent_metadata.ontologyCache` (5 min TTL)
- Loader cache: in-memory (60s TTL)

### 2.4 FastChat V2 Context RPC (Implemented)

FastChat V2 now loads initial context via a single RPC call to reduce round trips:

- RPC: `load_fastchat_context(p_context_type, p_user_id, p_project_id, p_focus_type, p_focus_entity_id)`
- Global payload: projects (with `doc_structure`), doc meta (depth 2), goals/milestones/plans, recent activity logs.
- Project payload: project + doc meta (all docs), goals/milestones/plans/tasks/events.
- Focus payload: `focus_entity_full` (raw row), `linked_entities` (light fields), `linked_edges`.
- The app builds `doc_structure` summaries client-side directly from `doc_structure` (title/description included).
- Access is enforced with `current_actor_has_project_access` inside the RPC.

---

## 3. Tool Selection (Current System)

### 3.1 Canonical Source

Tool pool logic is owned by:
`apps/web/src/lib/services/agentic-chat/analysis/tool-selection-service.ts`

The default pool for a context type is computed by:
`apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

Key points:

- **AgentContextService** passes **ALL_TOOLS**.
- **ToolSelectionService** chooses a final subset based on:
    - default pool for context type
    - project focus (element filtering)
    - strategy analysis (LLM or heuristic)

### 3.2 Default Tool Groups (Current)

Defined in `tools.config.ts`:

**base**

- `get_field_info`
- `get_entity_relationships`
- `get_linked_entities`
- `web_search`, `web_visit`
- `get_buildos_overview`, `get_buildos_usage_guide`

**global**

- list/search across projects, tasks, goals, plans, documents
- calendar list + detail + create/update/delete

**project**

- read: list/search + detail tools for all ontology entities
- write: create/update/delete for tasks/goals/plans/documents
- graph operations + doc tree tools
- calendar tools + project calendar tools

**project_create**

- `create_onto_project`

**project_audit / project_forecast**

- currently empty (inherit project tools via context mapping)

### 3.3 Context → Tool Group Mapping (Current)

From `CONTEXT_TO_TOOL_GROUPS`:

| Context Type       | Default Tool Groups                      |
| ------------------ | ---------------------------------------- |
| global             | base + global + project_create + project |
| project            | base + project                           |
| project_create     | base + project_create                    |
| project_audit      | base + project + project_audit           |
| project_forecast   | base + project + project_forecast        |
| calendar           | base + global                            |
| brain_dump         | base + global                            |
| daily_brief_update | base                                     |
| ontology           | base + project                           |
| general            | alias → global                           |

---

## 4. Token Estimation Method (Current)

The current system uses a conservative estimator:

```
estimated_tokens = ceil(characters / 4)
```

This is used in:

- `AgentContextService.calculateTokens`
- `ChatContextService.estimateTokens`
- `DebugContextBuilder` (tools JSON size)

---

## 5. Baseline Token Counts (Current System)

**Definition (baseline):**

```
baseline_tokens = system_prompt_tokens + tool_schema_tokens + user_prompt_tokens
```

Where:

```
user_prompt_tokens = ceil(user_prompt.length / 4)
```

**Important:** The baseline below excludes:

- location context (ontology or abbreviated context)
- conversation history / summary
- linked entities context
- user preferences

**Computed on:** 2026-02-06  
**Estimator:** ceil(chars/4)  
**Source:** prompt config + tool definitions (JSON)

**Assumptions for baseline counts**

- Start of conversation (no `last_turn_context`)
- No focus entity prompts
- No linked entities injected
- Project workspace prompt uses placeholders (project name/id)
- No location context included in system prompt (location context is separate)
- Project creation prompt includes a current timestamp line (token counts vary slightly by date/time)

| Context Type       | System Prompt Tokens | Tool Schema Tokens | Tool Count |
| ------------------ | -------------------- | ------------------ | ---------- |
| global             | 3295                 | 4359               | 24         |
| project            | 3505                 | 14530              | 60         |
| project_create     | 5448                 | 4486               | 8          |
| project_audit      | 3298                 | 11560              | 59         |
| project_forecast   | 3293                 | 11560              | 59         |
| calendar           | 3291                 | 4359               | 24         |
| brain_dump         | 3402                 | 4359               | 24         |
| ontology           | 3366                 | 14530              | 60         |
| daily_brief_update | 3292                 | 1516               | 7          |
| general            | 3291                 | 4359               | 24         |

**Notes**

- The planner system prompt alone is ~3.3k tokens in most contexts.
- The current project tool pool is very large; tool schemas can exceed 14k tokens.
- `TOKEN_BUDGETS.PLANNER.SYSTEM_PROMPT` (800) is far below actual prompt size.

---

## 6. FastChat Tool Spec (Proposed)

FastChat is a speed-first path that should:

- keep tool catalogs as small as possible per context
- include **full CRUD** by default for project + project-entity contexts
- use external tools only on explicit research requests

### 6.1 FastChat Tool Tiers

**Tier 0 — Always**

- `get_field_info`

**Tier 1 — Read (default for all contexts)**

- list/search tools for ontology entities
- detail tools for the active scope (project or focus entity)
- doc tree navigation tools

**Tier 2 — Write (default for project + entity contexts)**

- create/update/delete tools for ontology entities
- link/unlink/move/reorg tools

**Tier 3 — External**

- `web_search`, `web_visit` (only when user asks for research)

### 6.2 Proposed Default Tool Pools (FastChat V1)

**global**

- `get_field_info`
- `get_entity_relationships`, `get_linked_entities`
- `get_document_tree`, `get_document_path`
- `list_onto_projects`, `search_onto_projects`, `search_ontology`
- `list_onto_tasks`, `search_onto_tasks`
- `list_onto_documents`, `search_onto_documents`
- `list_onto_goals`, `list_onto_plans`, `list_onto_milestones`, `list_onto_risks`, `list_onto_requirements`

**project / project_audit / project_forecast / ontology**

- global read pool
- `get_onto_project_details`, `get_onto_project_graph`
- `get_onto_task_details`, `get_onto_goal_details`, `get_onto_plan_details`
- `get_onto_document_details`, `get_onto_milestone_details`
- `get_onto_risk_details`, `get_onto_requirement_details`
- `list_task_documents`
- create: `create_onto_task`, `create_onto_goal`, `create_onto_plan`, `create_onto_document`, `create_task_document`
- doc tree: `move_document_in_tree`
- update: `update_onto_task`, `update_onto_project`, `update_onto_goal`, `update_onto_plan`, `update_onto_document`, `update_onto_milestone`, `update_onto_risk`, `update_onto_requirement`
- delete: `delete_onto_task`, `delete_onto_goal`, `delete_onto_plan`, `delete_onto_document`
- graph: `link_onto_entities`, `unlink_onto_edge`, `reorganize_onto_project_graph`

**project_create**

- `get_field_info`
- `search_onto_projects` (dup check)
- `create_onto_project` (write, allowed in this context)

**calendar**

- `get_field_info`
- `list_calendar_events`
- `get_calendar_event_details`

**brain_dump**

- `get_field_info`
- `list_onto_projects`, `search_onto_projects`, `search_ontology`
- `list_onto_tasks`, `search_onto_tasks`
- `list_onto_documents`, `search_onto_documents`

**daily_brief_update**

- `get_field_info`

### 6.3 Write Tools (FastChat Default for Project + Entity Contexts)

Included by default for project + entity contexts. Still require explicit user intent before executing mutations.

- create: `create_onto_task`, `create_onto_goal`, `create_onto_plan`, `create_onto_document`
- update: `update_onto_*`
- delete: `delete_onto_*`
- graph: `link_onto_entities`, `unlink_onto_edge`, `reorganize_onto_project_graph`

---

## 7. Baseline Token Counts (FastChat V1, Proposed)

**Definition (baseline):**

```
baseline_tokens = fast_system_prompt_tokens + fast_tool_schema_tokens + user_prompt_tokens
```

**Computed on:** 2026-02-06  
**Estimator:** ceil(chars/4)  
**Source:** `agentic-chat-v2/prompt-builder.ts` + proposed FastChat tool pools

| Context Type       | Fast System Prompt Tokens | Fast Tool Tokens | Tool Count |
| ------------------ | ------------------------- | ---------------- | ---------- |
| global             | 87                        | 2792             | 17         |
| project            | 93                        | 14530            | 60         |
| project_create     | 92                        | 3333             | 3          |
| project_audit      | 84                        | 14530            | 60         |
| project_forecast   | 85                        | 14530            | 60         |
| calendar           | 93                        | 596              | 3          |
| brain_dump         | 83                        | 1404             | 8          |
| ontology           | 93                        | 14530            | 60         |
| daily_brief_update | 85                        | 206              | 1          |

**Notes**

- FastChat prompt is tiny (~85-95 tokens).
- Tool schema cost dominates; project/ontology contexts are expensive when full CRUD is included.
- Adding write tools will significantly increase tool tokens.

---

## 8. Minimum Tokens Per Context Type (Formula)

For each context type:

```
minimum_tokens(context) =
  system_prompt_tokens(context)
  + tool_schema_tokens(context)
  + ceil(user_prompt.length / 4)
```

Add on as needed:

- `location_context_tokens`
- `conversation_history_tokens`
- `linked_entities_tokens`
- `user_preferences_tokens`

---

## 9. Implementation Notes / Next Steps

1. **Trim default tool pools** to reduce tool schema tokens.
2. **Include CRUD** by default for project + entity contexts; rely on intent gating before execution.
3. **Emit context_usage snapshots** for FastChat (optional but useful).
4. **Measure location context size** with `estimateTokens` to make
   context sizing visible at runtime.

---

## Appendix A — Current Tool Group Definitions (Exact)

**base**

- get_field_info
- get_entity_relationships
- get_linked_entities
- web_search
- web_visit
- get_buildos_overview
- get_buildos_usage_guide

**global**

- list_onto_projects
- search_ontology
- search_onto_projects
- list_onto_tasks
- search_onto_tasks
- list_onto_goals
- list_onto_plans
- list_onto_documents
- list_onto_milestones
- list_onto_risks
- list_onto_requirements
- search_onto_documents
- list_calendar_events
- get_calendar_event_details
- create_calendar_event
- update_calendar_event
- delete_calendar_event

**project**

- list_onto_projects
- search_ontology
- search_onto_projects
- list_onto_tasks
- search_onto_tasks
- list_onto_plans
- list_onto_goals
- list_onto_documents
- list_onto_milestones
- list_onto_risks
- list_onto_requirements
- get_onto_project_details
- get_onto_project_graph
- get_onto_task_details
- get_onto_goal_details
- get_onto_plan_details
- get_onto_document_details
- get_onto_milestone_details
- get_onto_risk_details
- get_onto_requirement_details
- search_onto_documents
- list_task_documents
- get_document_tree
- get_document_path
- create_onto_task
- create_onto_goal
- create_onto_plan
- create_onto_document
- create_task_document
- link_onto_entities
- unlink_onto_edge
- reorganize_onto_project_graph
- update_onto_task
- update_onto_project
- update_onto_goal
- update_onto_plan
- update_onto_document
- update_onto_milestone
- update_onto_risk
- update_onto_requirement
- delete_onto_task
- delete_onto_goal
- delete_onto_plan
- delete_onto_document
- list_calendar_events
- get_calendar_event_details
- create_calendar_event
- update_calendar_event
- delete_calendar_event
- get_project_calendar
- set_project_calendar

**project_create**

- create_onto_project

**project_audit / project_forecast**

- (empty; currently inherits project tools via context mapping)
