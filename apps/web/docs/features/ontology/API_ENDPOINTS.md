<!-- apps/web/docs/features/ontology/API_ENDPOINTS.md -->

# Ontology System API Endpoints Reference

**Last Updated**: December 1, 2025
**Status**: 95% Implemented
**Base Path**: `/api/onto/`

## 📋 Overview

The Ontology System API provides comprehensive endpoints for managing templates, projects, and entity lifecycle operations. All endpoints follow RESTful conventions and use the `ApiResponse` wrapper for consistency.

---

## 🔐 Authentication & Security

### User-Facing Endpoints

- Use `locals.supabase` from SvelteKit
- Respect Row Level Security (RLS) policies
- Require actor-based authorization

```typescript
// Pattern for user endpoints
const supabase = locals.supabase;
const { data: actor } = await supabase
	.rpc('ensure_actor_for_user', { p_user_id: session.user.id })
	.single();
```

### Admin Endpoints

- Require `user.is_admin === true`
- Use `createAdminSupabaseClient()` to bypass RLS
- Template management operations

```typescript
// Pattern for admin endpoints
if (!session.user?.is_admin) {
	return ApiResponse.error('Admin access required', 403);
}
const adminSupabase = createAdminSupabaseClient();
```

---

## 📚 Template Management

### List Templates

```http
GET /api/onto/templates
```

**Query Parameters:**

- `scope` - Filter by scope (project, plan, task, output, document)
- `realm` - Filter by metadata.realm (creative, technical, business, service)
- `search` - Search in name and type_key
- `context`, `scale`, `stage` - Filter by facet defaults
- `sort` - Sort field (name, type_key, created_at)
- `order` - Sort order (asc, desc)

**Response:**

```json
{
  "success": true,
  "data": {
    "templates": [...],
    "grouped": { "creative": [...], "technical": [...] },
    "count": 25
  }
}
```

### Create Template (Admin)

```http
POST /api/onto/templates
```

**Request Body:**

```json
{
  "type_key": "output.written.article",
  "name": "Article Template",
  "scope": "output",
  "status": "draft",
  "parent_template_id": "uuid-of-parent",
  "is_abstract": false,
  "metadata": {
    "realm": "creative",
    "output_type": "content",
    "typical_scale": "small"
  },
  "facet_defaults": {
    "context": "personal",
    "scale": "small",
    "stage": "planning"
  },
  "fsm": {
    "states": ["draft", "writing", "review", "published"],
    "initial": "draft",
    "transitions": [...]
  },
  "schema": { "type": "object", "properties": {...} }
}
```

### Update Template (Admin)

```http
PUT /api/onto/templates/[id]
```

**Request Body:** Partial template fields to update

### Delete Template (Admin)

```http
DELETE /api/onto/templates/[id]
```

**Note:** Fails if template has children or is in use by projects

### Clone Template (Admin)

```http
POST /api/onto/templates/[id]/clone
```

**Request Body:**

```json
{
	"type_key": "new.type.key",
	"name": "Cloned Template Name"
}
```

### Promote Template (Admin)

```http
POST /api/onto/templates/[id]/promote
```

Changes status from `draft` to `active`

### Deprecate Template (Admin)

```http
POST /api/onto/templates/[id]/deprecate
```

Changes status from `active` to `deprecated`

---

## 🏗️ Project Management

### List Projects

```http
GET /api/onto/projects
```

**Query Parameters:**

- `type_key` - Filter by project type
- `state_key` - Filter by state
- `context`, `scale`, `stage` - Filter by facets

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Book Project",
      "type_key": "project.writer.book",
      "state_key": "active",
      "props": { "facets": {...} }
    }
  ]
}
```

### Get Project Details

```http
GET /api/onto/projects/[id]
```

Returns project with all related entities (tasks, plans, goals, documents, etc.)

### Instantiate Project from Spec

```http
POST /api/onto/projects/instantiate
```

**Request Body:**

```json
{
	"project_spec": {
		"project": {
			"name": "My Book",
			"type_key": "project.writer.book",
			"props": {
				"facets": {
					"context": "personal",
					"scale": "large",
					"stage": "planning"
				}
			}
		},
		"tasks": [
			{ "title": "Write outline", "priority": 1 },
			{ "title": "Research topics", "priority": 2 }
		],
		"plans": [
			{
				"name": "Writing Phase",
				"type_key": "plan.phase.project",
				"props": { "facets": { "scale": "medium" } }
			}
		],
		"documents": [
			{
				"title": "Project Brief",
				"type_key": "document.context.brief"
			}
		]
	}
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"project_id": "uuid",
		"url": "/ontology/projects/uuid"
	}
}
```

---

## ✅ Task Management

> **Schema Reference**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks) for complete task type_key documentation.

### Create Task

```http
POST /api/onto/tasks/create
```

**Request Body:**

```json
{
	"project_id": "uuid",
	"plan_id": "uuid (optional - creates edge relationship)",
	"type_key": "task.execute",
	"title": "Write chapter 1",
	"description": "Draft the first chapter",
	"priority": 2,
	"state_key": "todo",
	"due_at": "2025-01-15T00:00:00Z",
	"props": {
		"facets": { "scale": "small" }
	}
}
```

**type_key Work Mode Taxonomy:**
| Work Mode | Description |
|-----------|-------------|
| `task.execute` | Action tasks (default) |
| `task.create` | Produce new artifacts |
| `task.refine` | Improve existing work |
| `task.research` | Investigate/gather info |
| `task.review` | Evaluate and feedback |
| `task.coordinate` | Sync with others |
| `task.admin` | Administrative tasks |
| `task.plan` | Strategic planning |

**Specializations:** `task.coordinate.meeting`, `task.coordinate.standup`, `task.execute.deploy`, `task.execute.checklist`

**Note:** `plan_id` creates bidirectional edges (`belongs_to_plan`, `has_task`) in `onto_edges` table.

### Get Task

```http
GET /api/onto/tasks/[id]
```

### Update Task

```http
PATCH /api/onto/tasks/[id]
```

**Request Body:**

```json
{
	"title": "Updated title",
	"type_key": "task.review",
	"state_key": "in_progress",
	"priority": 1,
	"plan_id": "uuid or null"
}
```

**Note:** All fields are optional. `plan_id` updates edge relationships.

### Delete Task

```http
DELETE /api/onto/tasks/[id]
```

Removes task and all associated edges

### Make Task Recurring

```http
POST /api/onto/tasks/[id]/series
```

**Request Body**

```json
{
	"timezone": "America/Los_Angeles",
	"rrule": "FREQ=WEEKLY;COUNT=8",
	"start_at": "2025-11-12T17:00:00.000Z",
	"max_instances": 12,
	"regenerate_on_update": false
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
    "master": { "...updated task..." },
    "instances": [{ "...first instance..." }],
    "total_instances": 8
  }
}
```

### Delete Task Series

```http
DELETE /api/onto/task-series/[seriesId]
```

**Query Parameters**

| Name    | Description                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| `force` | `true` removes _all_ instances (even completed). Omit to delete only pending tasks and detach completed ones. |

**Response**

```json
{
	"success": true,
	"data": {
		"deleted_master": 1,
		"deleted_instances": 6
	}
}
```

---

## 📅 Plan Management

### Create Plan

```http
POST /api/onto/plans/create
```

**Request Body:**

```json
{
	"project_id": "uuid",
	"type_key": "plan.timebox.sprint",
	"name": "Q1 Development",
	"description": "First quarter development tasks",
	"state_key": "draft",
	"start_date": "2025-01-01",
	"end_date": "2025-03-31",
	"props": {
		"facets": {
			"scale": "medium",
			"stage": "execution"
		}
	}
}
```

---

## 🎯 Goal Management

### Create Goal

```http
POST /api/onto/goals/create
```

**Request Body:**

```json
{
	"project_id": "uuid",
	"type_key": "goal.outcome.milestone",
	"name": "Launch MVP",
	"description": "Successfully launch the minimum viable product",
	"priority": "high",
	"success_criteria": "100 active users",
	"target_date": "2025-06-01",
	"props": {}
}
```

---

## 🔄 FSM State Transitions

### Execute State Transition

```http
POST /api/onto/fsm/transition
```

**Request Body:**

```json
{
	"object_kind": "task",
	"object_id": "uuid",
	"event": "start_work"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"ok": true,
		"state_after": "in_progress",
		"actions_run": ["notify", "update_facets"]
	}
}
```

**Error Response (Guard Failed):**

```json
{
	"success": false,
	"error": "Guard check failed",
	"data": {
		"guard_failures": ["Guard failed: has_property (props.outline)"]
	}
}
```

---

## 📄 Document Management

### Create Document

```http
POST /api/onto/documents/create
```

**Request Body:**

```json
{
	"project_id": "uuid",
	"type_key": "document.knowledge.research",
	"title": "Market Research",
	"content": "Document content here...",
	"props": {}
}
```

### Create Document Version

```http
POST /api/onto/documents/[id]/versions
```

**Request Body:**

```json
{
	"content": "Updated content...",
	"version_tag": "v2",
	"change_summary": "Added competitor analysis"
}
```

---

## 📊 Output Management

### Create Output

```http
POST /api/onto/outputs/create
```

**Request Body:**

```json
{
	"project_id": "uuid",
	"type_key": "output.operational.report",
	"name": "Q1 Progress Report",
	"state_key": "draft",
	"props": {
		"facets": { "stage": "execution" }
	}
}
```

### Create Output Version

```http
POST /api/onto/outputs/[id]/versions
```

**Request Body:**

```json
{
	"storage_uri": "s3://bucket/path/to/file.pdf",
	"version_tag": "v1.0",
	"is_published": false
}
```

### Generate Output Content (AI-Assisted)

```http
POST /api/onto/outputs/generate
```

**Description:** Uses AI to generate content for text-based outputs (articles, blog posts, chapters, etc.) based on template type and user instructions.

**Technology:** Uses `SmartLLMService` with quality profile for high-quality content generation. Automatically logs usage metrics and costs.

**Request Body:**

```json
{
	"template_key": "output.article",
	"instructions": "Write an engaging article about sustainable technology trends in 2025",
	"project_id": "uuid",
	"current_props": {
		"target_word_count": 1500,
		"keywords": ["sustainability", "technology", "2025"],
		"tone": "professional"
	}
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"content": "<h1>Sustainable Technology Trends in 2025</h1><p>...</p>"
	}
}
```

**Supported Output Types:**

- `output.chapter` - Book chapters with narrative structure
- `output.article` - Articles and essays with SEO optimization
- `output.blog_post` - Blog posts with conversational tone
- `output.case_study` - Structured case studies
- `output.whitepaper` - Authoritative research documents
- `output.newsletter` - Newsletter editions

**Features:**

- Template-specific content generation (different prompts per output type)
- Project context integration
- Automatic HTML formatting with semantic tags
- Quality-focused LLM model selection (Claude 3.5 Sonnet, GPT-4o, DeepSeek Chat V3)
- Usage tracking and cost monitoring

**Error Responses:**

- `400` - Missing template_key or instructions
- `401` - Authentication required
- `403` - User does not own the project
- `404` - Project not found
- `500` - Content generation failed
- `503` - API timeout or quota exceeded

---

## 🤖 AI-Assisted Operations

### Draft Project Spec from Brain Dump

```http
POST /api/onto/specs/draft
```

**Request Body:**

```json
{
	"brain_dump": "I need to write a book about...",
	"org_id": "uuid (optional)"
}
```

**Response:**

```json
{
  "project_spec": { ... },
  "clarifications": [
    {
      "key": "genre",
      "question": "What genre is your book?",
      "required": true,
      "choices": ["Fiction", "Non-fiction", "Technical"]
    }
  ],
  "catalog": [ ... ]
}
```

### Patch Project Spec with Answers

```http
POST /api/onto/specs/patch
```

**Request Body:**

```json
{
  "project_spec": { ... },
  "answers": {
    "genre": "Non-fiction",
    "audience": "Business professionals"
  }
}
```

### Propose Template from Domain Brief

```http
POST /api/onto/templates/propose
```

**Request Body:**

```json
{
	"domain_brief": "I run a podcast production company...",
	"base_type_key": "project"
}
```

**Response:**

```json
{
  "template_id": "uuid",
  "template": {
    "type_key": "project.media.podcast",
    "name": "Podcast Production",
    ...
  },
  "clarifications": []
}
```

---

## 📈 Metrics & Analytics

### Record Metric Point

```http
POST /api/onto/metrics/[id]/points
```

**Request Body:**

```json
{
	"value": 42.5,
	"measured_at": "2025-01-15T12:00:00Z",
	"notes": "Weekly measurement"
}
```

---

## 🔗 Graph Relationships

### Create Edge

```http
POST /api/onto/edges
```

**Request Body:**

```json
{
	"src_id": "uuid",
	"src_kind": "project",
	"dst_id": "uuid",
	"dst_kind": "task",
	"rel": "contains",
	"props": {}
}
```

### Query Edges

```http
GET /api/onto/edges?src_id=uuid&rel=contains
```

---

## 🚨 Error Responses

All endpoints use consistent error formatting:

```json
{
	"success": false,
	"error": "Error message here",
	"statusCode": 400,
	"data": {
		"validation_errors": [
			{
				"field": "type_key",
				"message": "Invalid format",
				"code": "INVALID_FORMAT"
			}
		]
	}
}
```

### Common Error Codes

- `400` - Bad Request (validation error)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate key)
- `500` - Internal Server Error

---

## 🔄 Response Wrapper

All endpoints use the `ApiResponse` utility:

```typescript
import { ApiResponse } from '$lib/utils/api-response';

// Success
return ApiResponse.success(data, 200);

// Error
return ApiResponse.error('Error message', 400);
```

---

## 📝 TypeScript Types

All request/response types are defined in:

- `/src/lib/types/onto.ts` - Core ontology types
- `/packages/shared-types/src/database.types.ts` - Database types

Example usage:

```typescript
import type { ProjectSpec, FSMTransitionRequest } from '$lib/types/onto';
```

---

## 🧪 Testing Endpoints

### With cURL

```bash
# Get templates
curl http://localhost:5173/api/onto/templates

# Create task
curl -X POST http://localhost:5173/api/onto/tasks/create \
  -H "Content-Type: application/json" \
  -d '{"project_id":"uuid","title":"My Task"}'
```

### With TypeScript Client

```typescript
// Using SvelteKit's fetch
const response = await fetch('/api/onto/templates');
const { data, success, error } = await response.json();
```

---

**Note:** This documentation reflects the current implementation status. Some AI-assisted features (specs/draft, templates/propose) require LLM integration to be fully functional.
