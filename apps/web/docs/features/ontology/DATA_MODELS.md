<!-- apps/web/docs/features/ontology/DATA_MODELS.md -->

# Ontology Data Models & Database Schema

**Last Updated**: January 29, 2026
**Status**: Active (production schema + in-flight migrations)
**Category**: Feature Documentation
**Location**: `/apps/web/docs/features/ontology/`

> **Recent Updates (2026-01-29)**:
>
> - Added hierarchical document tree storage: `onto_projects.doc_structure`, `onto_documents.children`, and `onto_project_structure_history`.
> - Document containment now lives in `doc_structure` (document->document `has_part` edges removed).
> - `document_state` enum extended with `in_review`, `ready`, `archived` (legacy `review` still supported).
> - Search vectors and soft-delete filtering are now standard in ontology search (`onto_search_entities`).
> - Note: doc-tree migrations were just added; apply them and regenerate `packages/shared-types/src/database.types.ts`.

## Overview

Comprehensive reference for the BuildOS ontology system architecture, including database schema, entity relationships, state management, and props-based flexibility.

> **Schema coverage**: This document reflects the latest migrations in `/supabase/migrations`. Some tables (for example, project sharing and comments) are introduced in future-dated migrations (2026-03-20+). If your database has not applied those migrations yet, those tables or columns will be absent.

## Executive Summary

The ontology system is a **props-based, graph-connected data model** that supports flexible project management, task tracking, and output creation across multiple user types. It uses PostgreSQL with JSONB for flexible properties, generated columns for facets, soft-delete patterns, and full-text search.

**Key characteristics:**

- **Core entities**: projects, tasks, plans, documents, outputs, goals, requirements, milestones, risks, decisions, metrics, sources, signals, insights, and events
- **Graph relationships** via `onto_edges` (project-scoped) for semantic links and dependencies
- **Hierarchical documents** stored in `onto_projects.doc_structure` (not edges)
- **Facet system** (context, scale, stage) via `props.facets` + generated columns
- **Soft deletes + search vectors** on primary entities
- **Access control** via actors + project memberships/invites (RLS-backed when sharing migrations are applied)

---

## 1. DATABASE SCHEMA OVERVIEW

### 1.1 Core Entity Tables

| Table                | Purpose             | Key Columns                                                             |
| -------------------- | ------------------- | ----------------------------------------------------------------------- |
| `onto_projects`      | Root work units     | id, name, type_key, state_key, props, facets, doc_structure, deleted_at |
| `onto_tasks`         | Actionable items    | id, project_id, title, type_key, state_key, priority, due_at, props     |
| `onto_plans`         | Task groupings      | id, project_id, name, type_key, state_key, plan, props                  |
| `onto_documents`     | Project docs        | id, project_id, title, content, type_key, state_key, children           |
| `onto_outputs`       | Deliverables        | id, project_id, name, type_key, state_key, source_document_id           |
| `onto_goals`         | Objectives          | id, project_id, name, goal, state_key, target_date                      |
| `onto_requirements`  | Requirements        | id, project_id, text, type_key, priority                                |
| `onto_milestones`    | Checkpoints         | id, project_id, title, state_key, due_at                                |
| `onto_risks`         | Risk tracking       | id, project_id, title, impact, probability, state_key                   |
| `onto_decisions`     | Decision records    | id, project_id, title, rationale, outcome, decision_at                  |
| `onto_metrics`       | Metrics             | id, project_id, name, unit, definition                                  |
| `onto_metric_points` | Metric datapoints   | id, metric_id, ts, numeric_value                                        |
| `onto_sources`       | External references | id, project_id, uri, snapshot_uri                                       |
| `onto_signals`       | Signals             | id, project_id, ts, channel, payload                                    |
| `onto_insights`      | Derived insights    | id, project_id, title, derived_from_signal_id                           |
| `onto_events`        | Calendar events     | id, project_id, owner_entity_type/id, start_at, end_at                  |
| `onto_event_sync`    | Calendar sync       | id, calendar_id, event_id, provider, external_event_id                  |

### 1.2 Supporting Tables

- **Graph**: `onto_edges` (project-scoped relationships)
- **Versioning**: `onto_document_versions`, `onto_output_versions`
- **Facets**: `onto_facet_definitions`, `onto_facet_values`
- **Templates**: `onto_templates`, `onto_tools`
- **Access**: `onto_actors`, `onto_project_members`, `onto_project_invites`, `onto_assignments`, `onto_permissions`
- **Collaboration**: `onto_comments`, `onto_comment_mentions`, `onto_comment_read_states`
- **Audit/AI**: `onto_project_logs`, `onto_braindumps`, `onto_project_structure_history`

---

## 2. CORE ENTITY DATA MODELS

### 2.1 ONTO_PROJECTS

**Primary entity representing a project/workspace.**

```typescript
interface OntoProject {
	id: uuid;
	org_id: uuid | null;
	name: text;
	description: text | null;
	type_key: text; // Classification: 'project.creative.book', 'project.technical.app'
	state_key: project_state; // 'planning', 'active', 'completed', 'cancelled'
	props: jsonb; // Flexible properties + facets

	// Generated facet columns (from props->'facets')
	facet_context: text | null;
	facet_scale: text | null;
	facet_stage: text | null;

	// Visibility
	is_public: boolean | null;

	// Project timeline
	start_at: timestamptz | null;
	end_at: timestamptz | null;

	// Hierarchical document tree (new)
	doc_structure: jsonb; // { version: number, root: DocTreeNode[] }

	// Next step tracking (AI-generated)
	next_step_short: text | null;
	next_step_long: text | null;
	next_step_source: text | null;
	next_step_updated_at: timestamptz | null;

	// Lifecycle
	deleted_at: timestamptz | null; // Soft delete

	created_by: uuid; // FK to onto_actors
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Notes:**

- `doc_structure` is the master document tree (see Section 3).
- The canonical project context document links via `onto_edges` (`has_context_document`).
- `deleted_at` is used for soft deletes; queries should filter `WHERE deleted_at IS NULL`.

---

### 2.2 ONTO_TASKS

**Atomic actionable items with work mode taxonomy.**

> **Schema Reference**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks) for canonical task type keys.

```typescript
interface OntoTask {
	id: uuid;
	project_id: uuid; // FK to onto_projects
	type_key: text; // Work mode taxonomy (default: 'task.execute')
	title: text;
	description: text | null;
	state_key: task_state; // 'todo', 'in_progress', 'blocked', 'done'
	priority: int | null; // 1-5
	props: jsonb;
	search_vector: tsvector; // Full-text search

	// Scheduling
	start_at: timestamptz | null;
	due_at: timestamptz | null;

	// Lifecycle
	completed_at: timestamptz | null; // Set when state_key = 'done'
	deleted_at: timestamptz | null; // Soft delete

	// Generated facet column
	facet_scale: text | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Plan Relationships** (edges, not a direct column):

- `belongs_to_plan`: task -> plan
- `has_task`: plan -> task

```sql
-- Find tasks for a plan
SELECT t.*
FROM onto_tasks t
JOIN onto_edges e ON e.src_id = t.id
WHERE e.project_id = t.project_id
  AND e.rel = 'belongs_to_plan'
  AND e.dst_id = 'plan-uuid';
```

**Recurring series props** (stored in `props`):

```json
{
	"series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
	"series": {
		"id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
		"role": "master",
		"timezone": "America/Los_Angeles",
		"rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
		"dtstart": "2025-11-12T09:00:00-08:00",
		"instance_count": 8
	}
}
```

---

### 2.3 ONTO_PLANS

```typescript
interface OntoPlan {
	id: uuid;
	project_id: uuid;
	name: text;
	plan: text | null; // Plan content/details
	description: text | null;
	type_key: text; // e.g., 'plan.timebox.sprint', 'plan.phase.project'
	state_key: plan_state; // 'draft', 'active', 'completed'
	props: jsonb;
	search_vector: tsvector;

	// Generated facet columns
	facet_context: text | null;
	facet_scale: text | null;
	facet_stage: text | null;

	// Lifecycle
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

---

### 2.4 ONTO_DOCUMENTS

```typescript
interface OntoDocument {
	id: uuid;
	project_id: uuid;
	title: text;
	content: text | null; // Canonical body (migrated from props.body_markdown)
	description: text | null;
	type_key: text; // e.g., 'document.context.project', 'document.spec.product'
	state_key: document_state; // 'draft', 'in_review', 'ready', 'published', 'archived' (legacy: 'review')
	props: jsonb;
	search_vector: tsvector;

	// Hierarchy (new)
	children: jsonb; // { children: [{ id: string, order: number }] }

	// Lifecycle
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Backwards Compatibility**: During transition, both `content` and `props.body_markdown` are maintained. Read operations prefer `content` with fallback to `props.body_markdown`.

**Versioning**:

```typescript
interface OntoDocumentVersion {
	id: uuid;
	document_id: uuid;
	number: int;
	storage_uri: text;
	embedding: vector(1536) | null;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.5 ONTO_OUTPUTS

```typescript
interface OntoOutput {
	id: uuid;
	project_id: uuid;
	name: text;
	description: text | null;
	type_key: text; // e.g., 'output.document', 'output.asset'
	state_key: output_state; // 'draft', 'in_progress', 'review', 'published'
	props: jsonb;
	search_vector: tsvector;

	// Optional provenance
	source_document_id: uuid | null; // FK to onto_documents
	source_event_id: uuid | null; // FK to onto_events

	// Facet
	facet_stage: text | null;

	// Lifecycle
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Output versions**:

```typescript
interface OntoOutputVersion {
	id: uuid;
	output_id: uuid;
	number: int;
	storage_uri: text;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.6 ONTO_GOALS

```typescript
interface OntoGoal {
	id: uuid;
	project_id: uuid;
	name: text;
	goal: text | null;
	description: text | null;
	type_key: text | null;
	state_key: goal_state; // 'draft', 'active', 'achieved', 'abandoned'
	props: jsonb;
	search_vector: tsvector;

	// Timeline
	target_date: timestamptz | null;

	// Lifecycle
	completed_at: timestamptz | null;
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

---

### 2.7 ONTO_REQUIREMENTS

```typescript
interface OntoRequirement {
	id: uuid;
	project_id: uuid;
	text: text;
	type_key: text;
	priority: int | null;
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

---

### 2.8 ONTO_MILESTONES

```typescript
interface OntoMilestone {
	id: uuid;
	project_id: uuid;
	title: text;
	milestone: text | null;
	description: text | null;
	type_key: text | null;
	state_key: milestone_state; // 'pending', 'in_progress', 'completed', 'missed'
	due_at: timestamptz | null;
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	completed_at: timestamptz | null;
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

---

### 2.9 ONTO_RISKS

```typescript
interface OntoRisk {
	id: uuid;
	project_id: uuid;
	title: text;
	content: text | null;
	type_key: text | null;
	state_key: risk_state; // 'identified', 'mitigated', 'occurred', 'closed'
	impact: text; // 'low', 'medium', 'high', 'critical'
	probability: number | null; // 0-1
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	mitigated_at: timestamptz | null;
	deleted_at: timestamptz | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

---

### 2.10 METRICS & METRIC POINTS

```typescript
interface OntoMetric {
	id: uuid;
	project_id: uuid;
	name: text;
	unit: text;
	definition: text | null;
	type_key: text | null;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}

interface OntoMetricPoint {
	id: uuid;
	metric_id: uuid;
	ts: timestamptz;
	numeric_value: numeric;
	props: jsonb;
	created_at: timestamptz;
}
```

---

### 2.11 ONTO_DECISIONS

```typescript
interface OntoDecision {
	id: uuid;
	project_id: uuid;
	title: text;
	description: text | null;
	rationale: text | null;
	outcome: text | null;
	decision_at: timestamptz | null;
	state_key: text; // Free-form (common: pending, made, deferred, reversed)
	type_key: text; // Classification (default: 'decision.default')
	props: jsonb;
	search_vector: tsvector;

	deleted_at: timestamptz | null;
	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

---

### 2.12 ONTO_EVENTS & EVENT SYNC

```typescript
interface OntoEvent {
	id: uuid;
	project_id: uuid | null;
	org_id: uuid | null;
	owner_entity_type: text; // project|task|plan|goal|output|actor|standalone
	owner_entity_id: uuid | null;
	title: text;
	description: text | null;
	type_key: text; // e.g., 'event.meeting'
	state_key: text; // Free-form (calendar state)
	start_at: timestamptz;
	end_at: timestamptz | null;
	all_day: boolean;
	timezone: text | null;
	location: text | null;
	external_link: text | null;
	recurrence: jsonb;
	props: jsonb;

	// Facets
	facet_context: text | null;
	facet_scale: text | null;
	facet_stage: text | null;

	// Sync status
	sync_status: text;
	sync_error: text | null;
	last_synced_at: timestamptz | null;

	deleted_at: timestamptz | null;
	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}

interface OntoEventSync {
	id: uuid;
	calendar_id: uuid; // FK to project_calendars
	event_id: uuid; // FK to onto_events
	external_event_id: text;
	provider: text;
	sync_status: text;
	sync_token: text | null;
	sync_error: text | null;
	last_synced_at: timestamptz | null;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

---

### 2.13 SOURCES, SIGNALS, INSIGHTS

- `onto_sources`: external references (URI, snapshot, captured_at)
- `onto_signals`: real-time events (channel + payload)
- `onto_insights`: derived insights linked to signals

---

## 3. HIERARCHICAL DOCUMENT STRUCTURE

Document containment is stored on the project, not in edges.

### 3.1 `onto_projects.doc_structure`

```json
{
	"version": 1,
	"root": [
		{ "id": "uuid", "type": "doc", "order": 0 },
		{
			"id": "uuid",
			"type": "folder",
			"order": 1,
			"children": [{ "id": "uuid", "type": "doc", "order": 0 }]
		}
	]
}
```

### 3.2 `onto_documents.children`

```json
{
	"children": [
		{ "id": "uuid", "order": 0 },
		{ "id": "uuid", "order": 1 }
	]
}
```

### 3.3 Structure History

`onto_project_structure_history` stores every change for undo/audit:

- `project_id`, `doc_structure`, `version`, `changed_by`, `changed_at`, `change_type`
- Retention helper: `cleanup_structure_history()` keeps last 50 or 90 days

---

## 4. GRAPH AND RELATIONSHIPS

### 4.1 ONTO_EDGES - Entity Relationship Graph

```typescript
interface OntoEdge {
	id: uuid;
	project_id: uuid; // Scope for RLS and graph queries

	// Source
	src_kind: text; // 'project', 'task', 'goal', 'document', etc.
	src_id: uuid;

	// Relationship
	rel: text; // e.g., 'has_goal', 'depends_on', 'belongs_to_plan'

	// Target
	dst_kind: text;
	dst_id: uuid;

	props: jsonb;
	created_at: timestamptz;
}
```

**Common Relationships:**

- `project` -[has_goal]-> `goal`
- `project` -[has_plan]-> `plan`
- `project` -[has_task]-> `task`
- `task` -[belongs_to_plan]-> `plan`
- `task` -[depends_on]-> `task`
- `project` -[has_context_document]-> `document`

**Note:** Document containment is not stored in edges (see Section 3).

---

## 5. FACET SYSTEM - Multi-dimensional Classification

Facets are data-driven via `onto_facet_definitions` and `onto_facet_values` and stored in `props.facets`. Generated columns are used for filtering.

**Facet columns by entity:**

- Projects: `facet_context`, `facet_scale`, `facet_stage`
- Plans: `facet_context`, `facet_scale`, `facet_stage`
- Tasks: `facet_scale`
- Outputs: `facet_stage`
- Events: `facet_context`, `facet_scale`, `facet_stage`

**Common facet values (examples, not exhaustive):**

- Context: personal, client, commercial, internal, open_source, academic
- Scale: micro, small, medium, large, epic
- Stage: discovery, planning, execution, launch, maintenance, complete

---

## 6. STATE MANAGEMENT

State transitions are validated in API endpoints. FSM definitions in templates are deprecated.

### 6.1 Standard States by Entity Type

| Entity        | States                                                        | Initial    | Terminal             |
| ------------- | ------------------------------------------------------------- | ---------- | -------------------- |
| **Project**   | planning, active, completed, cancelled                        | planning   | completed, cancelled |
| **Task**      | todo, in_progress, blocked, done                              | todo       | done                 |
| **Plan**      | draft, active, completed                                      | draft      | completed            |
| **Output**    | draft, in_progress, review, published                         | draft      | published            |
| **Document**  | draft, in_review, ready, published, archived (legacy: review) | draft      | published, archived  |
| **Goal**      | draft, active, achieved, abandoned                            | draft      | achieved, abandoned  |
| **Milestone** | pending, in_progress, completed, missed                       | pending    | completed, missed    |
| **Risk**      | identified, mitigated, occurred, closed                       | identified | closed               |
| **Decision**  | free-form string (common: pending, made, deferred, reversed)  | pending    | made, reversed       |
| **Event**     | free-form string (calendar states)                            | varies     | varies               |

---

## 7. ACCESS CONTROL & SHARING

### 7.1 ONTO_ACTORS

Users and AI agents are stored in `onto_actors` (kind: human/agent) and used for attribution and RLS.

### 7.2 Project Memberships

`onto_project_members` and `onto_project_invites` are the primary access model once the 2026-03-20 sharing migrations are applied:

- `role_key`: owner, editor, viewer
- `access`: read, write, admin
- Invites include status, token_hash, expiration, and acceptance metadata

### 7.3 Legacy Access Tables

`onto_assignments` and `onto_permissions` still exist for object-level roles, but most RLS policies now reference project memberships.

---

## 8. COMMENTS & COLLABORATION

Comments are introduced in the 2026-03-28 migration set (future-dated relative to this document). Once applied:

- `onto_comments`: threaded comments scoped to an entity and project
- `onto_comment_mentions`: user mentions + notification linkage
- `onto_comment_read_states`: per-actor read tracking

---

## 9. AUDIT & AI SUPPORT TABLES

- `onto_project_logs`: audit trail of entity changes (before/after payloads)
- `onto_braindumps`: captured freeform notes used for ontology creation
- `onto_project_structure_history`: audit/undo log for document tree changes

---

## 10. SEARCH & INDEXING

Key indexing patterns (see migrations for full list):

- `search_vector` columns (GIN) on tasks, plans, goals, milestones, documents, requirements, risks, outputs, decisions
- Trigram indexes on title/name/text fields for fuzzy search
- Partial indexes on `deleted_at IS NULL` for active-row scans
- `doc_structure` and `children` JSONB indexes for tree queries
- `onto_edges(project_id)` and `(src_kind, src_id)` / `(dst_kind, dst_id)` for graph lookups
- JSONB GIN indexes on `props`

`onto_search_entities` is the primary cross-entity search RPC and filters soft-deleted rows.

---

## 11. SERVICE LAYER & RPCS

**Core services:**

- `apps/web/src/lib/services/ontology/instantiation.service.ts` - `instantiateProject()` creates full project graphs from specs.
- `apps/web/src/lib/services/ontology/doc-structure.service.ts` - document tree operations (add/move/remove/recompute).
- `apps/web/src/lib/services/ontology/onto-event.service.ts` + `onto-event-sync.service.ts` - calendar event lifecycle and sync.

**Key RPCs:**

- `load_project_graph_context(project_id)` - fast graph snapshot for chat/context
- `onto_search_entities(...)` - cross-entity search
- `get_project_full(...)` - full project payload (soft-delete aware)

---

## 12. API ENDPOINTS

See **`apps/web/docs/features/ontology/API_ENDPOINTS.md`** for the canonical list. Primary route groups:

- `/api/onto/projects`, `/api/onto/tasks`, `/api/onto/plans`, `/api/onto/documents`
- `/api/onto/goals`, `/api/onto/requirements`, `/api/onto/milestones`, `/api/onto/risks`
- `/api/onto/edges`, `/api/onto/graph`, `/api/onto/search`
- `/api/onto/comments`, `/api/onto/events`, `/api/onto/invites`, `/api/onto/braindumps`

---

## 13. DATA RELATIONSHIPS DIAGRAM

```
onto_projects
  ├→ onto_goals
  ├→ onto_requirements
  ├→ onto_plans
  ├→ onto_tasks
  ├→ onto_documents
  │   └→ onto_document_versions
  ├→ onto_outputs
  │   └→ onto_output_versions
  ├→ onto_decisions
  ├→ onto_milestones
  ├→ onto_risks
  ├→ onto_metrics
  │   └→ onto_metric_points
  ├→ onto_sources
  ├→ onto_signals
  │   └→ onto_insights
  ├→ onto_events
  │   └→ onto_event_sync
  ├→ onto_comments (via entity_id/entity_type)
  ├→ onto_project_members / onto_project_invites / onto_project_logs
  └→ doc_structure (embedded tree)

onto_edges (project-scoped graph)
  ├─ src_kind: text, src_id: uuid
  └─ dst_kind: text, dst_id: uuid

onto_actors
  ├→ onto_project_members (sharing)
  └→ onto_assignments / onto_permissions (legacy ACL)

onto_facet_definitions
  └→ onto_facet_values
```

---

**End of Analysis**

Generated: January 29, 2026
Scope: Ontology data models and database schema
