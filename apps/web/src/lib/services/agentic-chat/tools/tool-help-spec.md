<!-- apps/web/src/lib/services/agentic-chat/tools/tool-help-spec.md -->

# Spec v2: Progressive Tool Disclosure for BuildOS Ontology + Utility Tools

## 0) Objective

Replace “send 40+ tools to the LLM” with **2–4 gateway tools** that enable:

- on-demand discovery via `help`
- execution via `exec` (dispatcher)
- optional batching for speed

The gateway must support:

- ontology read tools (list/search/get + relationships + document tree)
- ontology write tools (create/update/delete + graph reorg + doc tree moves + entity linking)
- utility tools (field info, web search/visit, BuildOS docs)

---

## 1) Current Tool Inventory (what must be represented)

### 1.1 Ontology Read tools (examples)

- `list_onto_tasks`, `list_onto_goals`, `list_onto_documents`, `list_onto_projects`, etc.
- `search_onto_tasks`, `search_onto_projects`, `search_onto_documents`, `search_ontology`
- `get_onto_*_details`, plus `get_onto_project_graph`
- document tree: `get_document_tree`, `get_document_path`
- relationships: `get_entity_relationships`, `get_linked_entities`
- task workspace docs: `list_task_documents`

### 1.2 Ontology Write tools

- `create_onto_task`, `create_onto_goal`, `create_onto_plan`, `create_onto_document`, `create_onto_project`
- `update_onto_task/project/goal/plan/document/milestone/risk/requirement`
- `delete_onto_task/document/goal/plan`
- relationship mutations: `link_onto_entities`, `unlink_onto_edge`
- doc tree mutation: `move_document_in_tree`
- graph mutation: `reorganize_onto_project_graph`
- task workspace: `create_task_document`

### 1.3 Utility tools

- `get_field_info`
- `web_search`, `web_visit`
- `get_buildos_overview`, `get_buildos_usage_guide`

---

## 2) Proposed Gateway Tools Exposed to LLM

### 2.1 `tool.help`

**Purpose:** On-demand discovery of commands and schemas.

**Input**

```json
{
	"path": "string",
	"format": "short|full",
	"include_examples": true,
	"include_schemas": false
}
```

**Path conventions**

- `""` or `"root"`: show top-level command groups
- `onto`: ontology commands root
- `onto.task`: show task-related commands
- `onto.task.read`: show list/search/get commands for tasks
- `onto.task.write`: show create/update/delete commands for tasks
- `util`: utility commands
- `util.web`: web tools, etc.

> NOTE: Even though your underlying function names are `list_onto_tasks`, etc., **the help namespace should be stable + semantic**, and the dispatcher maps it back to the real function names.

---

### 2.2 `tool.exec`

**Purpose:** Execute discovered command.

**Input**

```json
{
	"op": "string",
	"args": "object",
	"idempotency_key": "optional string",
	"dry_run": false
}
```

**Output envelope**

```json
{
	"op": "onto.task.list",
	"ok": true,
	"result": {},
	"meta": { "trace_id": "tr_...", "latency_ms": 123, "warnings": [] }
}
```

**Error envelope (must include help pointer)**

```json
{
	"op": "onto.task.update",
	"ok": false,
	"error": {
		"code": "VALIDATION_ERROR|PERMISSION_DENIED|NOT_FOUND|CONFLICT|INTERNAL",
		"message": "Human readable",
		"details": { "field_errors": [] },
		"help_path": "onto.task.update"
	}
}
```

---

### 2.3 Optional `tool.batch`

Combine multiple help/exec operations in one RTT.

---

## 3) Command Taxonomy (CLI that maps to your real tools)

This is the heart of the “progressive disclosure” approach: a consistent CLI that an agent can learn once.

### 3.1 Ontology Read commands

| CLI op                  | Underlying tool          | Notes                                       |
| ----------------------- | ------------------------ | ------------------------------------------- |
| `onto.task.list`        | `list_onto_tasks`        | filters: `project_id`, `state_key`, `limit` |
| `onto.goal.list`        | `list_onto_goals`        |                                             |
| `onto.document.list`    | `list_onto_documents`    | includes `type_key`, `state_key`            |
| `onto.milestone.list`   | `list_onto_milestones`   |                                             |
| `onto.risk.list`        | `list_onto_risks`        | includes `impact`                           |
| `onto.requirement.list` | `list_onto_requirements` | includes `type_key`                         |
| `onto.plan.list`        | `list_onto_plans`        |                                             |
| `onto.project.list`     | `list_onto_projects`     | includes `state_key`, `type_key`            |
| `onto.task.docs.list`   | `list_task_documents`    | requires `task_id`                          |

Search:

| CLI op                 | Underlying tool         |
| ---------------------- | ----------------------- |
| `onto.task.search`     | `search_onto_tasks`     |
| `onto.project.search`  | `search_onto_projects`  |
| `onto.document.search` | `search_onto_documents` |
| `onto.search`          | `search_ontology`       |

Get details:

| CLI op                   | Underlying tool                |
| ------------------------ | ------------------------------ |
| `onto.project.get`       | `get_onto_project_details`     |
| `onto.project.graph.get` | `get_onto_project_graph`       |
| `onto.task.get`          | `get_onto_task_details`        |
| `onto.goal.get`          | `get_onto_goal_details`        |
| `onto.plan.get`          | `get_onto_plan_details`        |
| `onto.document.get`      | `get_onto_document_details`    |
| `onto.milestone.get`     | `get_onto_milestone_details`   |
| `onto.risk.get`          | `get_onto_risk_details`        |
| `onto.requirement.get`   | `get_onto_requirement_details` |

Document tree:

| CLI op                   | Underlying tool     |
| ------------------------ | ------------------- |
| `onto.document.tree.get` | `get_document_tree` |
| `onto.document.path.get` | `get_document_path` |

Relationships:

| CLI op                          | Underlying tool            |
| ------------------------------- | -------------------------- |
| `onto.entity.relationships.get` | `get_entity_relationships` |
| `onto.entity.links.get`         | `get_linked_entities`      |

---

### 3.2 Ontology Write commands

Create:

| CLI op                           | Underlying tool        |
| -------------------------------- | ---------------------- |
| `onto.task.create`               | `create_onto_task`     |
| `onto.goal.create`               | `create_onto_goal`     |
| `onto.plan.create`               | `create_onto_plan`     |
| `onto.document.create`           | `create_onto_document` |
| `onto.project.create`            | `create_onto_project`  |
| `onto.task.doc.create_or_attach` | `create_task_document` |

Update:

| CLI op                    | Underlying tool           |
| ------------------------- | ------------------------- |
| `onto.task.update`        | `update_onto_task`        |
| `onto.project.update`     | `update_onto_project`     |
| `onto.goal.update`        | `update_onto_goal`        |
| `onto.plan.update`        | `update_onto_plan`        |
| `onto.document.update`    | `update_onto_document`    |
| `onto.milestone.update`   | `update_onto_milestone`   |
| `onto.risk.update`        | `update_onto_risk`        |
| `onto.requirement.update` | `update_onto_requirement` |

Delete:

| CLI op                 | Underlying tool        |
| ---------------------- | ---------------------- |
| `onto.task.delete`     | `delete_onto_task`     |
| `onto.document.delete` | `delete_onto_document` |
| `onto.goal.delete`     | `delete_onto_goal`     |
| `onto.plan.delete`     | `delete_onto_plan`     |

Relationships + graph:

| CLI op                          | Underlying tool                 |
| ------------------------------- | ------------------------------- |
| `onto.edge.link`                | `link_onto_entities`            |
| `onto.edge.unlink`              | `unlink_onto_edge`              |
| `onto.project.graph.reorganize` | `reorganize_onto_project_graph` |
| `onto.document.tree.move`       | `move_document_in_tree`         |

---

### 3.3 Utility commands

| CLI op                     | Underlying tool           |
| -------------------------- | ------------------------- |
| `util.schema.field_info`   | `get_field_info`          |
| `util.web.search`          | `web_search`              |
| `util.web.visit`           | `web_visit`               |
| `util.buildos.overview`    | `get_buildos_overview`    |
| `util.buildos.usage_guide` | `get_buildos_usage_guide` |

---

## 4) Help Output Requirements (tuned to your tools)

Help must be _machine-friendly_ and include a small set of standardized fields.

### 4.1 `tool.help("onto.task.update", format="short")` returns:

- `summary`
- `usage` string (CLI-like)
- `args` (name/type/required/default)
- `notes` (important behavioral rules like your “create task vs don’t create task” guidance)
- `examples` (at least 1)

**Important:** For tools with big behavioral rules (like `create_onto_task` and `create_onto_project`), include an additional field:

- `policy`: short structured guidance extracted from the description (not the full essay every time)

Example `policy` shape:

```json
{
	"do": ["User explicitly asks to create a task", "Future human action required"],
	"dont": ["Research/analysis requests you can do now", "Creating tasks to look helpful"],
	"edge_cases": ["If ambiguous, ask 1 clarifying question or proceed without creating"]
}
```

This keeps the help payload small while preserving the guardrails you already wrote.

---

## 5) Registry Generation (how to auto-build the CLI map from your actual files)

### 5.1 Input sources

Your agent should build the Tool Registry by importing:

- `ONTOLOGY_READ_TOOLS`
- `ONTOLOGY_WRITE_TOOLS`
- `UTILITY_TOOL_DEFINITIONS`

Each item is a `ChatToolDefinition` with:

- `function.name`
- `function.description`
- `function.parameters`

### 5.2 Auto-classification rules

Derive `op` (`onto.task.list`) from `function.name`:

#### Ontology read:

- `list_onto_tasks` → `onto.task.list`
- `search_onto_tasks` → `onto.task.search`
- `get_onto_task_details` → `onto.task.get`

Special cases:

- `search_ontology` → `onto.search`
- `get_document_tree` → `onto.document.tree.get`
- `move_document_in_tree` → `onto.document.tree.move`
- `get_entity_relationships` → `onto.entity.relationships.get`
- `get_linked_entities` → `onto.entity.links.get`
- `list_task_documents` → `onto.task.docs.list`
- `create_task_document` → `onto.task.doc.create_or_attach`
- `link_onto_entities` → `onto.edge.link`
- `unlink_onto_edge` → `onto.edge.unlink`
- `reorganize_onto_project_graph` → `onto.project.graph.reorganize`

#### Utility:

- `get_field_info` → `util.schema.field_info`
- `web_search` → `util.web.search`
- `web_visit` → `util.web.visit`
- `get_buildos_overview` → `util.buildos.overview`
- `get_buildos_usage_guide` → `util.buildos.usage_guide`

### 5.3 Registry record shape (minimum)

```ts
type RegistryOp = {
	op: string; // "onto.task.list"
	tool_name: string; // "list_onto_tasks"
	description: string;
	parameters_schema: JSONSchema;
	group: 'onto' | 'util';
	kind: 'read' | 'write'; // read vs write
	entity?: string; // "task" | "project" | ...
	action?: string; // "list" | "search" | "get" | "create" | "update" | "delete" | ...
	examples?: Example[];
	policy?: Policy; // optional; extracted for big tools
};
```

---

## 6) Dispatcher Implementation (`tool.exec`)

### 6.1 Responsibilities

Given `{ op, args }`:

1. Resolve `op` → `tool_name` via registry
2. Validate `args` using the tool’s JSON schema (`function.parameters`)
3. Execute the underlying tool implementation (your existing tool call path)
4. Return standardized result envelope

### 6.2 Validation behavior

- If validation fails, include:
    - which fields failed
    - what help path to read
    - optionally include “closest matching args” suggestion if you can

### 6.3 Permissions / safety

Even if you don’t have formal permissions yet:

- classify ops as `read` vs `write`
- optionally require an `allow_write` flag in your orchestrator to enable write ops
- for `onto.project.graph.reorganize`, strongly recommend defaulting `dry_run=true` unless user explicitly says to apply

---

## 7) Progressive Disclosure Rules for the Agent (important behavior contract)

### 7.1 Minimal boot tools

Executor model only knows:

- `tool.help`
- `tool.exec`
- (optional `tool.batch`)

### 7.2 Discovery heuristics (so it doesn’t spam help)

- If an op is obvious and cached (e.g., `onto.task.list`), call `tool.exec` directly.
- Only call `tool.help` when:
    - arg shape uncertain
    - tool returned validation error
    - entity unclear (task vs doc vs plan)
    - user asked “what can I do?”

### 7.3 Default read-before-write

Before any `create/update/delete`:

- attempt a lightweight read/search to avoid duplicates:
    - tasks: `onto.task.search` or `onto.task.list` scoped by project
    - documents: `onto.document.search`

### 7.4 Respect your “CREATE TASK” policy

Your `create_onto_task` description includes critical rules. Make them available via help as `policy` and enforce:

- Don’t create tasks for things the agent can do immediately.

---

## 8) Speed: Caching + Batch

### 8.1 Cache help results by registry version

- help responses keyed by:
    - `registry_version + path + format + include_schemas + include_examples`

### 8.2 Return “directory” summaries

- `tool.help("onto", format="short")` returns a list of entity groups:
    - task, project, document, goal, plan, milestone, risk, requirement, edge, search

- This prevents calling help repeatedly for each entity.

### 8.3 Batch pattern

Encourage the agent to do:

- `tool.batch([help(op short), exec(op)])` for first-time operations.

---

## 9) Concrete Example: How the Agent Uses This

User: “Move the ‘API Spec’ doc under ‘Engineering’ folder”

Agent flow:

1. `tool.exec(op="onto.document.search", args={ "search":"API Spec", "limit":10 })`
2. If uncertain about tree ops: `tool.help("onto.document.tree.move", format="short")`
3. `tool.exec(op="onto.document.tree.get", args={ "project_id":"...", "include_documents": true })` to find Engineering folder id
4. `tool.exec(op="onto.document.tree.move", args={ "project_id":"...", "document_id":"doc_...", "new_parent_id":"doc_engineering_folder" })`

---

## 10) Refactor Plan (what your implementation agent should do)

1. **Build registry generator**
    - import the 3 tool definition arrays
    - produce `registry.json` with `op → tool_name` mapping + schemas
    - compute a `registry_version` hash

2. **Implement `tool.help`**
    - path router over registry (root → groups → entities → ops)
    - outputs standardized help JSON with optional `policy` extraction

3. **Implement `tool.exec`**
    - validate + dispatch to underlying tool handler
    - normalize outputs/errors to envelope

4. **Switch LLM tool list**
    - remove all individual ontology/utility tools from the executor tool list
    - include only gateway tools

5. **Add session cache**
    - store discovered help paths + optionally compact arg summaries

6. **Hardening**
    - consistent error codes
    - include `help_path` on all errors
    - add `dry_run` defaults for destructive/high-impact tools

---

## 11) Acceptance Criteria (updated for your tool surface)

- LLM sees ≤ 4 tools total (help/exec/batch/search optional)
- All operations from the provided tool definitions are callable via CLI ops
- `create_onto_task` and `create_onto_project` have compact `policy` in help output
- Document tree + relationship tools are discoverable and executable
- Validation errors always include `help_path`
- Help calls are cached/batched to avoid “lots of back and forth”

---
