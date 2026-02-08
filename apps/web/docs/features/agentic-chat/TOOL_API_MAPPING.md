<!-- apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md -->

# Agentic Chat Tool -> API Mapping (Canonical)

**Last Updated**: 2026-01-30
**Status**: Active
**Category**: Feature / Agentic Chat
**Location**: `/apps/web/docs/features/agentic-chat/TOOL_API_MAPPING.md`

This document maps Agentic Chat tools to their underlying API calls, data tables, and side effects. It replaces the deleted tool-system docs and is intended to be referenced by specs that need precise tool-to-API behavior.

---

## 1. Tool definition sources

| Purpose                  | File                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| Tool schemas             | `apps/web/src/lib/services/agentic-chat/tools/core/tool-definitions.ts`          |
| Tool metadata / contexts | `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts` |
| Tool selection groups    | `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`              |
| Tool execution dispatch  | `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`  |

All tool calls flow through `ToolExecutionService` -> `ChatToolExecutor` -> domain executors.

---

## 2. Ontology write tools (API endpoints)

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`

| Tool                            | HTTP   | Endpoint                                     | Primary side effects                                                       |
| ------------------------------- | ------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| `create_onto_project`           | POST   | `/api/onto/projects/instantiate`             | Creates project + entities + edges; returns `context_shift` to new project |
| `create_onto_task`              | POST   | `/api/onto/tasks/create`                     | Creates task row in `onto_tasks`                                           |
| `create_onto_goal`              | POST   | `/api/onto/goals/create`                     | Creates goal row in `onto_goals`                                           |
| `create_onto_plan`              | POST   | `/api/onto/plans/create`                     | Creates plan row in `onto_plans`                                           |
| `create_onto_document`          | POST   | `/api/onto/documents/create`                 | Creates document row in `onto_documents`                                   |
| `create_task_document`          | POST   | `/api/onto/tasks/{task_id}/documents`        | Creates document + link edge to task                                       |
| `link_onto_entities`            | POST   | `/api/onto/edges`                            | Inserts edges in `onto_edges`                                              |
| `unlink_onto_edge`              | DELETE | `/api/onto/edges/{edge_id}`                  | Deletes edge in `onto_edges`                                               |
| `reorganize_onto_project_graph` | POST   | `/api/onto/projects/{project_id}/reorganize` | Bulk create/delete/update edges                                            |
| `update_onto_project`           | PATCH  | `/api/onto/projects/{project_id}`            | Updates project row                                                        |
| `update_onto_task`              | PATCH  | `/api/onto/tasks/{task_id}`                  | Updates task row                                                           |
| `update_onto_goal`              | PATCH  | `/api/onto/goals/{goal_id}`                  | Updates goal row                                                           |
| `update_onto_plan`              | PATCH  | `/api/onto/plans/{plan_id}`                  | Updates plan row                                                           |
| `update_onto_document`          | PATCH  | `/api/onto/documents/{document_id}`          | Updates document row                                                       |
| `update_onto_milestone`         | PATCH  | `/api/onto/milestones/{milestone_id}`        | Updates milestone row                                                      |
| `update_onto_risk`              | PATCH  | `/api/onto/risks/{risk_id}`                  | Updates risk row                                                           |
| `update_onto_requirement`       | PATCH  | `/api/onto/requirements/{requirement_id}`    | Updates requirement row                                                    |
| `delete_onto_task`              | DELETE | `/api/onto/tasks/{task_id}`                  | Soft-delete task                                                           |
| `delete_onto_goal`              | DELETE | `/api/onto/goals/{goal_id}`                  | Soft-delete goal                                                           |
| `delete_onto_plan`              | DELETE | `/api/onto/plans/{plan_id}`                  | Soft-delete plan                                                           |
| `delete_onto_document`          | DELETE | `/api/onto/documents/{document_id}`          | Soft-delete document                                                       |

Notes:

- `create_onto_project` is the only write tool that currently returns a `context_shift` in its payload.
- Write tools use `BaseExecutor.apiRequest()` which adds `Authorization` and `X-Change-Source: chat` headers.

---

## 3. Ontology read tools (Supabase queries)

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`

These tools query Supabase directly (no internal HTTP endpoint) and read from `onto_*` tables, with ownership checks by actor ID.

Examples:

- `list_onto_projects` -> `onto_projects`
- `list_onto_tasks` -> `onto_tasks` (filters `deleted_at`)
- `search_onto_documents` -> `onto_documents`
- `get_onto_project_graph` -> `onto_edges` + entity tables
- `get_document_tree` / `get_document_path` -> document edges + tree ordering

---

## 4. Utility tools

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.ts`

| Tool                       | Data source             | Notes                                    |
| -------------------------- | ----------------------- | ---------------------------------------- |
| `get_field_info`           | static schema map       | `ENTITY_FIELD_INFO` in `tools.config.ts` |
| `get_entity_relationships` | `onto_edges`            | Incoming/outgoing edges                  |
| `get_linked_entities`      | `OntologyContextLoader` | Loads full linked entity details         |

---

## 5. Calendar tools

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`

| Tool                         | API / tables                        | Notes                              |
| ---------------------------- | ----------------------------------- | ---------------------------------- |
| `list_calendar_events`       | Google Calendar API + `onto_events` | Merges synced and local events     |
| `get_calendar_event_details` | Google Calendar API + `onto_events` | Uses `onto_event_id` or `event_id` |
| `create_calendar_event`      | Google Calendar API + `onto_events` | Optionally syncs to Google         |
| `update_calendar_event`      | Google Calendar API + `onto_events` | Supports `sync_to_calendar`        |
| `delete_calendar_event`      | Google Calendar API + `onto_events` | Soft-deletes local event           |
| `get_project_calendar`       | `project_calendars`                 | Returns sync settings              |
| `set_project_calendar`       | `project_calendars` + Google API    | Creates/updates project calendar   |

---

## 6. External tools

Source: `apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts`

| Tool                      | Provider                                       | Notes                                     |
| ------------------------- | ---------------------------------------------- | ----------------------------------------- |
| `web_search`              | Tavily                                         | Uses `tavilySearch` in `tools/websearch/` |
| `web_visit`               | Direct HTTP + optional LLM markdown conversion | Can persist cached visit entries          |
| `get_buildos_overview`    | Internal docs                                  | Returns static BuildOS overview           |
| `get_buildos_usage_guide` | Internal docs                                  | Returns usage guide content               |

---

## 7. Context shift + relationship rules

### 7.1 Context shift

`context_shift` can be produced by tool results and is handled in `StreamHandler`:

- Extracted from `tool_result` payload
- Emits SSE `context_shift`
- Updates `chat_sessions.context_type` and `entity_id`
- Persists a system message recording the shift

Currently, `create_onto_project` returns a `context_shift` to the newly created project.

<a name="ontology-relationship-rules"></a>

### 7.2 Relationship rules (high-level)

Relationship creation happens in two main ways:

1. **Project instantiation**: `create_onto_project` posts a full spec including `entities` and `relationships`.
2. **Explicit linking**: `link_onto_entities` inserts edges via `/api/onto/edges`.

For relationship semantics, see the ontology edge types and constraints in the ontology services and database schema. If you need stricter rules, enforce them in `create_onto_project` validation and the edge API.

---

## 8. Tool result stream events

Some tools can return `_stream_events` or metadata that the tool executor extracts and forwards to the orchestrator. These are merged into the SSE stream, so tool-side events can drive UI updates without waiting for the planner to finish.

See `ChatToolExecutor.extractStreamEvents()` for the extraction logic.

---

## 9. Logging and audit trails

| Log                    | Where                                 | Why                                 |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| `chat_tool_executions` | `ChatToolExecutor.logToolExecution()` | Tool-level timing, args, results    |
| `chat_messages`        | `MessagePersister`                    | User/assistant/tool message history |
| `agent_chat_sessions`  | `AgentExecutorService`                | Executor sub-session tracking       |
| `agent_executions`     | `AgentExecutorService`                | Executor run metadata               |

---

## 10. Related docs

- Canonical flow: `apps/web/docs/features/agentic-chat/README.md`
- Agentic Chat performance ADR: `apps/web/docs/technical/architecture/decisions/ADR-001-agentic-chat-performance-optimizations.md`
