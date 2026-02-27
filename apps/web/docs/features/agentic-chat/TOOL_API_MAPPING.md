<!-- apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md -->

# Agentic Chat Tool -> Backend Mapping (Current)

> Last updated: 2026-02-27  
> Scope: Tool behavior in the current web runtime (`/api/agent/v2/stream` + shared tool stack)

## 1. Execution Modes

The runtime has two tool execution modes:

1. Gateway mode (`AGENTIC_CHAT_TOOL_GATEWAY=true`)
    - Exposed tools: `tool_help`, `tool_exec`
    - `tool_help` reads registry metadata from `tool-registry.ts`
    - `tool_exec` runs canonical ops through `ToolExecutionService`
2. Direct mode (gateway disabled)
    - Exposed tools: full named tool set (`list_onto_*`, `create_onto_*`, `web_search`, etc.)
    - Tool calls are dispatched by `ChatToolExecutor`

## 2. Source Files

| Concern             | File                                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| Tool definitions    | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/*.ts`            |
| Context tool sets   | `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`             |
| Gateway op registry | `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts`        |
| Gateway help output | `apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts`            |
| Direct dispatcher   | `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts` |
| Domain executors    | `apps/web/src/lib/services/agentic-chat/tools/core/executors/*.ts`              |

## 3. Gateway Canonical Ops

Canonical namespaces used by `tool_exec.op`:

- Ontology CRUD/search: `onto.<entity>.<action>`
- Ontology exceptions:
    - `onto.search`
    - `onto.document.tree.get`
    - `onto.document.tree.move`
    - `onto.document.path.get`
    - `onto.project.graph.get`
    - `onto.project.graph.reorganize`
    - `onto.edge.link`
    - `onto.edge.unlink`
    - `onto.entity.relationships.get`
    - `onto.entity.links.get`
- Utility: `util.*` (`util.web.search`, `util.schema.field_info`, etc.)
- Calendar: `cal.event.*`, `cal.project.*`

## 4. Direct Tool Mapping

### 4.1 Ontology write tools (HTTP endpoints)

Source: `ontology-write-executor.ts`

| Tool                            | Method   | Endpoint                                        |
| ------------------------------- | -------- | ----------------------------------------------- |
| `create_onto_project`           | `POST`   | `/api/onto/projects/instantiate`                |
| `create_onto_task`              | `POST`   | `/api/onto/tasks/create`                        |
| `create_onto_goal`              | `POST`   | `/api/onto/goals/create`                        |
| `create_onto_plan`              | `POST`   | `/api/onto/plans/create`                        |
| `create_onto_document`          | `POST`   | `/api/onto/documents/create`                    |
| `create_onto_milestone`         | `POST`   | `/api/onto/milestones/create`                   |
| `create_onto_risk`              | `POST`   | `/api/onto/risks/create`                        |
| `move_document_in_tree`         | `POST`   | `/api/onto/projects/{project_id}/doc-tree/move` |
| `create_task_document`          | `POST`   | `/api/onto/tasks/{task_id}/documents`           |
| `link_onto_entities`            | `POST`   | `/api/onto/edges`                               |
| `unlink_onto_edge`              | `DELETE` | `/api/onto/edges/{edge_id}`                     |
| `reorganize_onto_project_graph` | `POST`   | `/api/onto/projects/{project_id}/reorganize`    |
| `update_onto_project`           | `PATCH`  | `/api/onto/projects/{project_id}`               |
| `update_onto_task`              | `PATCH`  | `/api/onto/tasks/{task_id}`                     |
| `update_onto_goal`              | `PATCH`  | `/api/onto/goals/{goal_id}`                     |
| `update_onto_plan`              | `PATCH`  | `/api/onto/plans/{plan_id}`                     |
| `update_onto_document`          | `PATCH`  | `/api/onto/documents/{document_id}`             |
| `update_onto_milestone`         | `PATCH`  | `/api/onto/milestones/{milestone_id}`           |
| `update_onto_risk`              | `PATCH`  | `/api/onto/risks/{risk_id}`                     |
| `delete_onto_task`              | `DELETE` | `/api/onto/tasks/{task_id}`                     |
| `delete_onto_goal`              | `DELETE` | `/api/onto/goals/{goal_id}`                     |
| `delete_onto_plan`              | `DELETE` | `/api/onto/plans/{plan_id}`                     |
| `delete_onto_document`          | `DELETE` | `/api/onto/documents/{document_id}`             |
| `delete_onto_milestone`         | `DELETE` | `/api/onto/milestones/{milestone_id}`           |
| `delete_onto_risk`              | `DELETE` | `/api/onto/risks/{risk_id}`                     |
| `delete_onto_project`           | `DELETE` | `/api/onto/projects/{project_id}`               |

Special-case write tool:

- `tag_onto_entity` is composite logic:
    - can call `/api/onto/mentions/ping` (`mode: ping`)
    - can read entity `/full` endpoints and patch task/goal/document content to append canonical mention tokens

### 4.2 Ontology read tools (mixed query/API)

Source: `ontology-read-executor.ts`

- Direct Supabase reads from `onto_*` tables:
    - `list_onto_projects`, `list_onto_tasks`, `list_onto_goals`, `list_onto_plans`, `list_onto_documents`, `list_onto_milestones`, `list_onto_risks`
    - `search_onto_projects`, `search_onto_tasks`, `search_onto_goals`, `search_onto_plans`, `search_onto_documents`, `search_onto_milestones`, `search_onto_risks`
- Internal API reads:
    - `search_ontology` -> `POST /api/onto/search`
    - `get_onto_*_details` -> `/api/onto/{entity}/{id}`
    - `get_onto_project_graph` -> `/api/onto/projects/{project_id}/graph/full`
    - `list_task_documents` -> `/api/onto/tasks/{task_id}/documents`
    - `get_document_tree` -> `/api/onto/projects/{project_id}/doc-tree`
    - `get_document_path` -> uses document details + project doc tree endpoint

### 4.3 Utility tools

Source: `utility-executor.ts`

| Tool                       | Backend                                           |
| -------------------------- | ------------------------------------------------- |
| `get_field_info`           | Static schema metadata (`ENTITY_FIELD_INFO`)      |
| `get_entity_relationships` | Supabase `onto_edges` query                       |
| `get_linked_entities`      | `OntologyContextLoader` + linked entity expansion |

### 4.4 Calendar tools

Source: `calendar-executor.ts`

| Tool                         | Backend                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `list_calendar_events`       | Google Calendar API + `onto_events`                           |
| `get_calendar_event_details` | Google Calendar API + `onto_events`                           |
| `create_calendar_event`      | Google Calendar API + `onto_events` (+ optional edge linking) |
| `update_calendar_event`      | Google Calendar API + `onto_events`                           |
| `delete_calendar_event`      | Google Calendar API + `onto_events`                           |
| `get_project_calendar`       | `project_calendars`                                           |
| `set_project_calendar`       | `project_calendars` + Google integration checks               |

### 4.5 External tools

Source: `external-executor.ts`

| Tool                      | Backend                                             |
| ------------------------- | --------------------------------------------------- |
| `web_search`              | Tavily client (`tools/websearch`)                   |
| `web_visit`               | URL fetch + parser (+ optional markdown conversion) |
| `get_buildos_overview`    | Local static content                                |
| `get_buildos_usage_guide` | Local static content                                |

## 5. Request Headers for Internal API Calls

`BaseExecutor.apiRequest()` attaches:

- `Authorization: Bearer <session token>`
- `X-Change-Source: chat`
- `Content-Type: application/json`

This applies to executor HTTP calls to `/api/onto/*`.

## 6. Context Shift Behavior

Context shift is currently extracted from tool result payloads in `/api/agent/v2/stream`.

Current behavior:

- updates effective context/entity for remaining tool rounds
- persists `fastchat_last_context_shift` hint in session metadata
- emits SSE `context_shift`

`create_onto_project` is the main write tool that returns a context shift in normal flows.

## 7. Logging and Audit

| Table                  | Written by                                  |
| ---------------------- | ------------------------------------------- |
| `chat_tool_executions` | `ChatToolExecutor.logToolExecution()`       |
| `chat_messages`        | V2 session service (`persistMessage`)       |
| `chat_sessions`        | V2 session service + route metadata updates |

## 8. Related Doc

- Runtime architecture and flow: `apps/web/docs/features/agentic-chat/README.md`
