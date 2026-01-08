---
title: Ontology API Reference
description: REST endpoints that power the BuildOS ontology system.
last_updated: 2026-01-08
path: docs/api/ontology-endpoints.md
---

# Ontology API Reference

> **Recent Updates (2026-01-08)**: Added project graph reorg + full-graph endpoints for node-centric restructuring and planning.
>
> **Recent Updates (2026-01-07)**: Auto-organization now manages containment edges for core entities via parent references. See [Ontology Auto-Organization Spec](/docs/specs/ONTOLOGY_AUTO_ORGANIZATION_SPEC.md).
>
> **Recent Updates (2024-12-20)**: Schema migration complete. All entities now support soft deletes via `deleted_at`. New dedicated columns: `description`, `content`, `target_date`, `completed_at`, `start_at`. See [Migration Plan](/docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md) and [Detailed API Docs](/apps/web/docs/features/ontology/API_ENDPOINTS.md).

All endpoints are served from the SvelteKit application (`apps/web`). Requests **require an authenticated user session** unless otherwise noted. Payloads use `application/json`.

## Soft Delete Behavior

All ontology entities now support soft deletes:

- `DELETE` endpoints set `deleted_at` instead of hard deleting
- `GET` endpoints automatically filter out soft-deleted records
- Add `?include_deleted=true` to include soft-deleted records
- Use `PATCH` with `{ "deleted_at": null }` to restore entities

## Related docs

- [Project Ontology Linking Philosophy](/docs/specs/PROJECT_ONTOLOGY_LINKING_PHILOSOPHY.md)
- [Ontology Auto-Organization Spec](/docs/specs/ONTOLOGY_AUTO_ORGANIZATION_SPEC.md)
- [Project Graph Query Pattern Spec](/docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md)

## Table of Contents

1. [Projects](#projects)
    - [GET `/api/onto/projects`](#get-apiontoprojects)
    - [GET `/api/onto/projects/[id]`](#get-apiontoprojectsid)
    - [POST `/api/onto/projects/instantiate`](#post-apiontoprojectsinstantiate)
2. [Templates](#templates)
    - [GET `/api/onto/templates`](#get-apiontotemplates)
    - [GET `/api/onto/templates/[type_key]`](#get-apiontotemplates-type_key)
3. [FSM Transitions](#fsm-transitions)
    - [GET `/api/onto/fsm/transitions`](#get-apiontofsmtransitions)
    - [POST `/api/onto/fsm/transition`](#post-apiontofsmtransition)
4. [Outputs](#outputs)
    - [POST `/api/onto/outputs/create`](#post-apiontooutputscreate)
    - [GET `/api/onto/outputs/[id]`](#get-apiontooutputsid)
    - [PATCH `/api/onto/outputs/[id]`](#patch-apiontooutputsid)
    - [POST `/api/onto/outputs/generate`](#post-apiontooutputsgenerate)
5. [Graph](#graph)
    - [GET `/api/onto/graph`](#get-apiontograph)
    - [GET `/api/onto/projects/[id]/graph/full`](#get-apiontoprojectsidgraphfull)
    - [POST `/api/onto/projects/[id]/reorganize`](#post-apiontoprojectsidreorganize)

---

## Projects

### GET `/api/onto/projects`

Returns project summaries for the ontology dashboard.

```http
GET /api/onto/projects
Authorization: Bearer <token>
```

**Response**

```json
{
	"projects": [
		{
			"id": "uuid",
			"name": "Writer Playbook",
			"description": "Document a repeatable launch process",
			"type_key": "marketer.campaign",
			"state_key": "execution",
			"facet_context": "commercial",
			"facet_scale": "large",
			"facet_stage": "execution",
			"task_count": 18,
			"output_count": 6,
			"created_at": "2025-02-01T10:00:00Z",
			"updated_at": "2025-02-11T18:34:00Z"
		}
	]
}
```

### GET `/api/onto/projects/[id]`

Fetches a project with all related entities (goals, plans, tasks, outputs, documents, etc.) and allowed transitions.

```http
GET /api/onto/projects/09dfad24-f021-4a09-b2d5-1dbbaabd00f6
Authorization: Bearer <token>
```

**Response excerpt**

```json
{
	"project": { "...": "..." },
	"goals": [],
	"tasks": [],
	"outputs": [],
	"allowed_transitions": [
		{
			"event": "start_execution",
			"to": "execution",
			"label": "Start Execution",
			"guards": [{ "type": "has_property", "path": "props.facets.stage" }],
			"actions": [{ "type": "notify", "name": "notify team" }]
		}
	]
}
```

### POST `/api/onto/projects/instantiate`

Creates a project graph from a `ProjectSpec` payload. Validates via Zod before invoking the instantiation service. As of 2025‑11‑05 the backend enforces that the referenced template is **active**, **non-abstract**, and that supplied facets match the taxonomy for the corresponding scope.

```http
POST /api/onto/projects/instantiate
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
	"project": {
		"name": "AI Launch Playbook",
		"type_key": "marketer.campaign",
		"props": {
			"facets": {
				"context": "commercial",
				"scale": "medium",
				"stage": "planning"
			},
			"campaign_goal": "Drive 1k signups",
			"target_word_count": 5000
		}
	},
	"entities": [
		{ "temp_id": "goal-1", "kind": "goal", "name": "Ship launch brief" },
		{ "temp_id": "task-1", "kind": "task", "title": "Draft messaging pillars" }
	],
	"relationships": [
		[
			{ "temp_id": "goal-1", "kind": "goal" },
			{ "temp_id": "task-1", "kind": "task" }
		]
	]
}
```

Legacy arrays (`goals`, `tasks`, `plans`, etc.) are **rejected**. The only supported
shape is `project` + `entities` + `relationships`.
Relationships are directional: `[from, to]` is interpreted as "from connects to to".
`relationships` is required even when empty (use `[]` for a single entity).

**Response**

```json
{
	"success": true,
	"project_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
	"counts": {
		"goals": 1,
		"requirements": 0,
		"plans": 0,
		"tasks": 1,
		"outputs": 0,
		"documents": 0,
		"edges": 3
	}
}
```

**Possible errors**

- `400 INVALID_TEMPLATE` — The supplied `type_key` has no active, non-abstract template.
- `400 INVALID_FACET_VALUE` — Facet values are not strings or are not allowed for the entity scope.
- `400 INVALID_FACET_SCOPE` — Facet keys that do not apply to the entity scope (`validate_facet_values` now checks `applies_to`).
- `400 INVALID_PROJECT_SPEC` — Missing `relationships`, empty relationships with multiple entities, or any legacy arrays present.

See `apps/web/docs/features/agentic-chat/PROJECT_CREATION_FLOW_UPDATE_PLAN.md` for the
agentic chat prompt/tool alignment checklist.

---

## Templates

### GET `/api/onto/templates`

Retrieves active templates for discovery with optional filters.

```http
GET /api/onto/templates?scope=project&realm=creative&search=book
Authorization: Bearer <token>
```

**Query Parameters**

| Name        | Type     | Description                                           |
| ----------- | -------- | ----------------------------------------------------- |
| `scope`     | string   | Filter by template scope (`project`, `plan`, etc.)    |
| `realm`     | string   | Filter by metadata realm                              |
| `search`    | string   | Fuzzy match on name, type_key, metadata keywords      |
| `primitive` | string   | Filter by metadata primitive (e.g., `TEXT_DOCUMENT`)  |
| `context`   | string[] | Filter by facet context defaults                      |
| `scale`     | string[] | Filter by facet scale defaults                        |
| `stage`     | string[] | Filter by facet stage defaults                        |
| `sort`      | string   | One of `name`, `type_key`, `realm`, `scope`, `status` |
| `direction` | string   | `asc` (default) or `desc`                             |

**Response**

```json
{
	"templates": [
		{
			"id": "uuid",
			"scope": "project",
			"type_key": "writer.book",
			"name": "Book Production Plan",
			"status": "active",
			"metadata": { "realm": "creative", "output_type": "content" },
			"facet_defaults": { "context": "personal", "scale": "large", "stage": "planning" },
			"schema": { "...": "..." },
			"fsm": { "...": "..." }
		}
	],
	"grouped": {
		"creative": [{ "...": "..." }]
	},
	"count": 12
}
```

### GET `/api/onto/templates/[type_key]`

Returns a fully resolved template (merging inheritance chain) plus child/sibling metadata.

```http
GET /api/onto/templates/writer.book?scope=project
Authorization: Bearer <token>
```

**Response excerpt**

```json
{
	"template": {
		"type_key": "writer.book",
		"scope": "project",
		"inheritance_chain": ["project.base", "writer.book"],
		"schema": { "...": "..." },
		"metadata": { "...": "..." }
	},
	"children": [{ "type_key": "writer.book.fiction", "is_abstract": false }],
	"siblings": []
}
```

---

## FSM Transitions

### GET `/api/onto/fsm/transitions`

Lists allowed transitions for an entity by delegating to the `get_allowed_transitions` RPC.

```http
GET /api/onto/fsm/transitions?kind=project&id=09dfad24-f021-4a09-b2d5-1dbbaabd00f6
Authorization: Bearer <token>
```

**Response**

```json
{
	"transitions": [
		{
			"event": "start_execution",
			"to": "execution",
			"guards": [{ "type": "has_property", "path": "props.facets.stage" }],
			"actions": [{ "type": "notify", "name": "notify team" }]
		}
	],
	"count": 2
}
```

### POST `/api/onto/fsm/transition`

Executes a transition via the FSM engine. Restricted to admin users.

```http
POST /api/onto/fsm/transition
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
	"object_kind": "project",
	"object_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
	"event": "start_execution"
}
```

**Response**

```json
{
	"success": true,
	"state_after": "execution",
	"actions_run": ["notify(3 actors)", "schedule_rrule(21 tasks)"]
}
```

---

## Outputs

### POST `/api/onto/outputs/create`

Creates an output row (formerly deliverable) using a template.

```http
POST /api/onto/outputs/create
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
	"project_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
	"type_key": "output.article",
	"name": "Launch Narrative",
	"description": "Feature announcement article for the AI launch",
	"state_key": "draft",
	"props": {
		"target_word_count": 1500,
		"keywords": ["launch", "ai", "productivity"]
	}
}
```

**New Fields (2024-12-20):**

- `description` (text): Output description (dedicated column)
- `deleted_at` (timestamptz): Soft delete timestamp

**Response**

```json
{
	"success": true,
	"output": { "...": "..." }
}
```

### GET `/api/onto/outputs/[id]`

Fetches a single output.

```http
GET /api/onto/outputs/6f24cd4e-b3c0-4f1a-80ce-9bc94868e0b3
Authorization: Bearer <token>
```

**Response**

```json
{
	"output": {
		"id": "6f24cd4e-b3c0-4f1a-80ce-9bc94868e0b3",
		"project_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
		"type_key": "output.article",
		"name": "Launch Narrative",
		"state_key": "draft",
		"props": { "...": "..." }
	}
}
```

### PATCH `/api/onto/outputs/[id]`

Updates the name, state, or props for an output.

```http
PATCH /api/onto/outputs/6f24cd4e-b3c0-4f1a-80ce-9bc94868e0b3
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
	"name": "Launch Narrative (v2)",
	"state_key": "review",
	"props": {
		"content": "<h1>Launch Narrative</h1>…",
		"word_count": 1534
	}
}
```

**Response**

```json
{
	"success": true,
	"output": { "...": "..." }
}
```

### POST `/api/onto/outputs/generate`

Generates text content for an output via OpenAI.

```http
POST /api/onto/outputs/generate
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
	"template_key": "output.article",
	"instructions": "Draft a persuasive feature announcement.",
	"project_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
	"current_props": {
		"target_word_count": 1200,
		"keywords": ["ai", "productivity"]
	}
}
```

**Response**

```json
{
	"success": true,
	"content": "<h1>Introducing the AI Launch Suite</h1>..."
}
```

### GET `/api/onto/graph`

Returns the ontology graph dataset for the authenticated actor. Entities are filtered using `ensure_actor_for_user`, and relationships are trimmed so both endpoints exist in the accessible set.

```http
GET /api/onto/graph?viewMode=full&limit=1000
Authorization: Bearer <token>
Accept: application/json
```

#### Query Parameters

| Name       | Type                            | Default | Description                                                             |
| ---------- | ------------------------------- | ------- | ----------------------------------------------------------------------- |
| `viewMode` | `templates \| projects \| full` | `full`  | Optional hint for server-side graph pruning.                            |
| `limit`    | number                          | `1000`  | Maximum allowed node count; responses exceeding the limit return `413`. |

#### Response Body

```json
{
	"data": {
		"source": {
			"templates": [],
			"projects": [],
			"tasks": [],
			"outputs": [],
			"documents": [],
			"edges": []
		},
		"graph": {
			"nodes": [],
			"edges": []
		},
		"stats": {
			"totalTemplates": 0,
			"totalProjects": 0,
			"activeProjects": 0,
			"totalEdges": 0,
			"totalTasks": 0,
			"totalOutputs": 0,
			"totalDocuments": 0
		},
		"metadata": {
			"viewMode": "full",
			"generatedAt": "2025-11-06T00:00:00.000Z"
		}
	}
}
```

#### Error Codes

- `401 Unauthorized` if the request lacks a valid session.
- `400 Bad Request` for invalid parameters (e.g., `viewMode`).
- `413 Payload Too Large` when the resulting graph exceeds the configured node limit.
- `500 Internal Server Error` for unexpected load failures.

---

### GET `/api/onto/projects/[id]/graph/full`

Returns the full `ProjectGraphData` payload for a single project, including entities and edges.

```http
GET /api/onto/projects/09dfad24-f021-4a09-b2d5-1dbbaabd00f6/graph/full
Authorization: Bearer <token>
Accept: application/json
```

**Response excerpt**

```json
{
	"project": { "...": "..." },
	"tasks": [],
	"plans": [],
	"goals": [],
	"documents": [],
	"edges": []
}
```

**Error Codes**

- `401 Unauthorized` if the request lacks a valid session.
- `403 Forbidden` if the user does not own the project.
- `404 Not Found` if the project is missing.

---

### POST `/api/onto/projects/[id]/reorganize`

Reorganizes a subset of entities using a node-centric connections payload. Supports dry runs that return edge diffs without applying changes.

```http
POST /api/onto/projects/09dfad24-f021-4a09-b2d5-1dbbaabd00f6/reorganize
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**

```json
{
	"project_id": "09dfad24-f021-4a09-b2d5-1dbbaabd00f6",
	"nodes": [
		{
			"id": "uuid",
			"kind": "task",
			"connections": [
				{ "kind": "plan", "id": "uuid" },
				{ "kind": "goal", "id": "uuid", "intent": "semantic", "rel": "supports_goal" }
			],
			"mode": "replace",
			"semantic_mode": "replace_auto"
		}
	],
	"options": {
		"dry_run": true
	}
}
```

**Response (dry run)**

```json
{
	"dry_run": true,
	"node_count": 1,
	"counts": { "create": 2, "delete": 1, "update": 0 },
	"changes": {
		"edges_to_create": [],
		"edges_to_delete": [],
		"edges_to_update": []
	}
}
```

**Error Codes**

- `400 Bad Request` for validation failures (missing nodes, invalid kinds, etc.).
- `401 Unauthorized` if the request lacks a valid session.
- `403 Forbidden` if the user does not own the project.
- `404 Not Found` if the project is missing.
- `409 Conflict` if the graph changed since planning (retry after refetch).

---

## Error Handling

Common error responses follow this shape:

```json
{
	"message": "Description of the error",
	"details": "Optional additional context"
}
```

- `401 Unauthorized` – user session missing.
- `403 Forbidden` – user lacks rights (e.g., FSM transition requires admin).
- `400 Bad Request` – validation failure (Zod errors, guard failures).
- `500 Internal Server Error` – unexpected or downstream failure (Supabase, RPC).

---

## Notes

- All endpoints rely on Supabase Row Level Security (RLS); ensure service roles are configured appropriately when running locally.
- For bulk integrations, prefer using RPCs (`get_template_catalog`, `get_allowed_transitions`) where available to reduce API chatter.
- Refer to `apps/web/src/lib/types/onto.ts` for the canonical TypeScript interfaces (ProjectSpec, Template, FSMDef, etc.).
