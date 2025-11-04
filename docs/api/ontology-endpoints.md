---
title: Ontology API Reference
description: REST endpoints that power the BuildOS ontology system.
last_updated: 2025-02-12
---

# Ontology API Reference

All endpoints are served from the SvelteKit application (`apps/web`). Requests **require an authenticated user session** unless otherwise noted. Payloads use `application/json`.

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

Creates a project graph from a `ProjectSpec` payload. Validates via Zod before invoking the instantiation service.

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
	"goals": [{ "name": "Ship launch brief" }],
	"tasks": [{ "title": "Draft messaging pillars" }]
}
```

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
	"state_key": "draft",
	"props": {
		"target_word_count": 1500,
		"keywords": ["launch", "ai", "productivity"]
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
