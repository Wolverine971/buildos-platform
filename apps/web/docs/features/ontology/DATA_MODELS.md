<!-- apps/web/docs/features/ontology/DATA_MODELS.md -->

# Ontology Data Models & Database Schema

**Last Updated**: December 12, 2025
**Status**: Production Ready
**Category**: Feature Documentation
**Location**: `/apps/web/docs/features/ontology/`

## Overview

Comprehensive analysis of the BuildOS ontology system architecture, including database schema, entity relationships, state management, and props-based flexibility.

## Executive Summary

The BuildOS ontology system is a **props-based, graph-connected data model** that enables flexible project management, task tracking, and output creation across multiple use cases (writers, coaches, developers, founders, marketers, students, etc.). It uses PostgreSQL with JSON/JSONB for flexible property storage, application-layer state management, and facet-based tagging for multi-dimensional classification.

**Key Characteristics:**

- **15 core entity types** (projects, tasks, plans, outputs, documents, goals, requirements, etc.)
- **3-facet taxonomy system** (context, scale, stage) for dimensional classification
- **Graph-based relationships** via `onto_edges` table for flexible entity connections
- **Role-based access control** via actors, assignments, and permissions tables
- **Application-layer state management** for entity lifecycle
- **Flexible props (JSONB)** for AI-inferred entity properties

---

## 1. DATABASE SCHEMA OVERVIEW

### 1.1 Core Tables (Onto\_ Prefix)

All ontology tables use the `onto_` prefix in the public schema. Key tables are:

| Table                | Purpose                      | Key Columns                                                                   |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `onto_projects`      | Root projects/work units     | id, name, type_key, state_key, props, facet_context, facet_scale, facet_stage |
| `onto_tasks`         | Actionable items             | id, project_id, type_key, title, state_key, priority, due_at, props           |
| `onto_plans`         | Logical groupings of tasks   | id, project_id, name, type_key, state_key, props                              |
| `onto_outputs`       | Deliverables/artifacts       | id, project_id, name, type_key, state_key, props, facet_stage                 |
| `onto_documents`     | Project documents            | id, project_id, title, type_key, props, state_key                             |
| `onto_goals`         | Project goals                | id, project_id, name, type_key, props                                         |
| `onto_requirements`  | Project requirements         | id, project_id, text, type_key, props                                         |
| `onto_milestones`    | Project milestones           | id, project_id, title, due_at, type_key, props                                |
| `onto_risks`         | Risk tracking                | id, project_id, title, impact, probability, state_key, type_key, props        |
| `onto_metrics`       | Performance metrics          | id, project_id, name, unit, type_key, props                                   |
| `onto_metric_points` | Metric data points           | id, metric_id, ts, numeric_value, props                                       |
| `onto_decisions`     | Project decisions            | id, project_id, title, decision_at, rationale, props                          |
| `onto_sources`       | External information sources | id, project_id, uri, snapshot_uri, props                                      |
| `onto_signals`       | Real-time project signals    | id, project_id, ts, channel, payload                                          |
| `onto_insights`      | Derived insights             | id, project_id, title, derived_from_signal_id, props                          |

---

## 2. ENTITY DATA MODELS

### 2.1 ONTO_PROJECTS

**Primary entity representing work units/projects.**

```typescript
interface OntoProject {
	id: uuid;
	org_id: uuid | null;
	name: text;
	description: text | null;
	type_key: text; // Classification: 'project.creative.book', 'project.technical.app'
	also_types: text[]; // Additional type keys
	state_key: text; // 'draft', 'active', 'paused', 'complete', 'archived'
	props: jsonb; // AI-inferred properties

	// Generated facet columns (from props->'facets')
	facet_context: text | null; // 'personal', 'client', 'commercial', etc.
	facet_scale: text | null; // 'micro', 'small', 'medium', 'large', 'epic'
	facet_stage: text | null; // 'discovery', 'planning', 'execution', 'launch', etc.

	start_at: timestamptz | null;
	end_at: timestamptz | null;
	context_document_id: uuid | null; // FK to onto_documents

	created_by: uuid; // FK to onto_actors
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Key Characteristics:**

- `type_key` is a classification string (no schema enforcement)
- Facets stored in `props.facets` as generated columns for efficient querying
- Props are AI-inferred, flexible JSONB
- Context document provides detailed project narrative

---

### 2.2 ONTO_TASKS

**Atomic actionable items with work mode taxonomy.**

> **Schema Reference**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks) for complete task type_key documentation.

```typescript
interface OntoTask {
	id: uuid;
	project_id: uuid; // FK to onto_projects
	type_key: text; // Work mode taxonomy (required, default: 'task.execute')
	title: text;
	state_key: text; // 'todo', 'in_progress', 'blocked', 'done', 'abandoned'
	priority: int | null; // Numeric priority (1-5)
	due_at: timestamptz | null;
	props: jsonb; // Flexible task properties

	// Generated facet column
	facet_scale: text | null; // Task size/effort

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**type_key Work Mode Taxonomy**

Format: `task.{work_mode}[.{specialization}]`

| Work Mode         | Description             | Example                       |
| ----------------- | ----------------------- | ----------------------------- |
| `task.execute`    | Action tasks (default)  | Call vendor, send email       |
| `task.create`     | Produce new artifacts   | Write proposal, design mockup |
| `task.refine`     | Improve existing work   | Edit document, polish copy    |
| `task.research`   | Investigate/gather info | Research competitors          |
| `task.review`     | Evaluate and feedback   | Review PR, audit report       |
| `task.coordinate` | Sync with others        | Schedule meeting              |
| `task.admin`      | Administrative tasks    | Update spreadsheet            |
| `task.plan`       | Strategic planning      | Roadmap planning              |

**Specializations**: `task.coordinate.meeting`, `task.coordinate.standup`, `task.execute.deploy`, `task.execute.checklist`

**Plan Relationships**

Tasks relate to plans via `onto_edges` (not a direct column):

- Edge relation `belongs_to_plan`: task → plan
- Edge relation `has_task`: plan → task

```sql
-- Find tasks for a plan
SELECT t.* FROM onto_tasks t
JOIN onto_edges e ON e.src_id = t.id
WHERE e.rel = 'belongs_to_plan' AND e.dst_id = 'plan-uuid';
```

**Recurring series props**

Tasks can act as series masters or instances. Metadata stored in `props`:

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

**Logical groupings of tasks within a project.**

```typescript
interface OntoPlan {
	id: uuid;
	project_id: uuid; // FK to onto_projects
	name: text;
	type_key: text; // e.g., 'plan.sprint', 'plan.phase', 'plan.quarterly'
	state_key: text; // 'draft', 'active', 'review', 'complete'
	props: jsonb;

	// Generated facet columns
	facet_context: text | null;
	facet_scale: text | null;
	facet_stage: text | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

---

### 2.4 ONTO_OUTPUTS

**Deliverables, artifacts, or results of work.**

```typescript
interface OntoOutput {
	id: uuid;
	project_id: uuid;
	name: text;
	type_key: text; // e.g., 'output.written.chapter', 'output.software.feature'
	state_key: text; // 'draft', 'review', 'approved', 'published'
	props: jsonb;

	// Generated facet column
	facet_stage: text | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Version Tracking:**

```typescript
interface OntoOutputVersion {
	id: uuid;
	output_id: uuid; // FK to onto_outputs
	number: int; // Version sequence
	storage_uri: text; // Where output is stored
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.5 ONTO_DOCUMENTS

**Project documentation and reference materials.**

```typescript
interface OntoDocument {
	id: uuid;
	project_id: uuid;
	title: text;
	type_key: text; // e.g., 'document.context', 'document.spec', 'document.notes'
	state_key: text; // 'draft', 'published'
	props: jsonb;

	created_by: uuid;
	created_at: timestamptz;
	updated_at?: timestamptz;
}
```

**Version Tracking:**

```typescript
interface OntoDocumentVersion {
  id: uuid;
  document_id: uuid;
  number: int;
  storage_uri: text;
  embedding: vector(1536) | null;  // For semantic search
  props: jsonb;
  created_by: uuid;
  created_at: timestamptz;
}
```

---

### 2.6 - 2.13 Other Entities

See the interface definitions for:

- `OntoGoal` - Project objectives
- `OntoRequirement` - Project requirements
- `OntoMilestone` - Key milestones
- `OntoRisk` - Risk tracking
- `OntoMetric` / `OntoMetricPoint` - Performance metrics
- `OntoDecision` - Decision log
- `OntoSource` - External references
- `OntoSignal` / `OntoInsight` - Real-time signals

---

## 3. GRAPH AND RELATIONSHIPS

### 3.1 ONTO_EDGES - Entity Relationship Graph

**Flexible graph structure for any entity-to-entity relationships.**

```typescript
interface OntoEdge {
	id: uuid;

	// Source
	src_kind: text; // e.g., 'project', 'task', 'goal'
	src_id: uuid;

	// Relationship
	rel: text; // e.g., 'has_goal', 'depends_on', 'belongs_to_plan'

	// Target
	dst_kind: text;
	dst_id: uuid;

	props: jsonb; // Additional edge metadata
	created_at: timestamptz;
}
```

**Common Relationships:**

- `project` -[has_goal]-> `goal`
- `project` -[has_plan]-> `plan`
- `project` -[has_task]-> `task`
- `task` -[belongs_to_plan]-> `plan`
- `task` -[depends_on]-> `task`
- `plan` -[has_task]-> `task`

---

## 4. FACET SYSTEM - Multi-dimensional Classification

### 4.1 The Three Facets

#### **Facet 1: Context** (Work organizational setting)

- `personal` - Personal projects
- `client` - Client work/consulting
- `commercial` - For-profit products
- `internal` - Internal company projects
- `open_source` - Open source work
- `academic` - Educational/research

#### **Facet 2: Scale** (Effort/complexity)

- `micro` - < 1 week
- `small` - 1-4 weeks
- `medium` - 1-3 months
- `large` - 3-12 months
- `epic` - > 1 year

#### **Facet 3: Stage** (Project lifecycle phase)

- `discovery` - Research/exploration
- `planning` - Design/architecture
- `execution` - Active development
- `launch` - Go-live preparation
- `maintenance` - Operations/support
- `complete` - Finished

---

## 5. STATE MANAGEMENT (Application Layer)

> **Note**: State transitions are now handled at the application layer, not via database FSMs.
> See `src/lib/server/ontology/state-transitions.ts`

### 5.1 Standard States by Entity Type

| Entity        | States                                                | Initial   | Terminal                |
| ------------- | ----------------------------------------------------- | --------- | ----------------------- |
| **Project**   | `draft`, `active`, `paused`, `complete`, `archived`   | `draft`   | `archived`              |
| **Task**      | `todo`, `in_progress`, `blocked`, `done`, `abandoned` | `todo`    | `done`, `abandoned`     |
| **Plan**      | `draft`, `active`, `review`, `complete`               | `draft`   | `complete`              |
| **Output**    | `draft`, `review`, `approved`, `published`            | `draft`   | `published`             |
| **Document**  | `draft`, `published`                                  | `draft`   | `published`             |
| **Goal**      | `active`, `achieved`, `abandoned`                     | `active`  | `achieved`, `abandoned` |
| **Milestone** | `pending`, `achieved`, `missed`                       | `pending` | `achieved`, `missed`    |

### 5.2 Transition Validation

```typescript
// In state-transitions.ts
export function canTransition(
	entityType: EntityType,
	currentState: string,
	targetState: string
): boolean {
	return STATE_TRANSITIONS[entityType]?.[currentState]?.includes(targetState) ?? false;
}
```

---

## 6. ACCESS CONTROL

### 6.1 ONTO_ACTORS - Users and Agents

```typescript
interface OntoActor {
	id: uuid;
	kind: 'human' | 'agent';
	name: text;
	email: text | null;
	user_id: uuid | null; // FK to public.users (only for humans)
	org_id: uuid | null;
	metadata: jsonb;
	created_at: timestamptz;
}
```

### 6.2 ONTO_ASSIGNMENTS - Role Assignment

```typescript
interface OntoAssignment {
	id: uuid;
	actor_id: uuid;
	object_kind: text; // e.g., 'project', 'task'
	object_id: uuid;
	role_key: text; // e.g., 'owner', 'editor', 'viewer'
	created_at: timestamptz;
}
```

---

## 7. TYPE KEY CONVENTIONS

Type keys are classification strings following the pattern:

```
{scope}.{realm}.{deliverable}[.{variant}]
```

### Project Types

| Type Key                    | Description             |
| --------------------------- | ----------------------- |
| `project.creative.book`     | Writing a book          |
| `project.creative.article`  | Article/essay/blog      |
| `project.technical.app`     | Building an application |
| `project.technical.feature` | Feature development     |
| `project.business.startup`  | Starting a company      |
| `project.service.coaching`  | Coaching engagement     |
| `project.education.course`  | Taking a course         |
| `project.personal.habit`    | Building a habit        |

### Task Types (Work Modes)

| Type Key          | Description              |
| ----------------- | ------------------------ |
| `task.execute`    | Action/do task (default) |
| `task.create`     | Produce new artifact     |
| `task.refine`     | Improve existing work    |
| `task.research`   | Investigate/gather info  |
| `task.review`     | Evaluate and feedback    |
| `task.coordinate` | Sync with others         |
| `task.admin`      | Administrative work      |
| `task.plan`       | Strategic planning       |

### Document Types

| Type Key             | Description              |
| -------------------- | ------------------------ |
| `document.context`   | Project context/brief    |
| `document.notes`     | Meeting notes, research  |
| `document.spec`      | Technical specification  |
| `document.reference` | Handbook, SOP, checklist |
| `document.decision`  | RFC, proposal, ADR       |

---

## 8. DATA RELATIONSHIPS DIAGRAM

```
onto_projects
  ├→ onto_goals
  ├→ onto_requirements
  ├→ onto_plans
  │   └→ onto_tasks (via edges)
  ├→ onto_tasks
  ├→ onto_outputs
  │   └→ onto_output_versions
  ├→ onto_documents
  │   └→ onto_document_versions
  ├→ onto_milestones
  ├→ onto_risks
  ├→ onto_metrics
  │   └→ onto_metric_points
  ├→ onto_decisions
  ├→ onto_sources
  ├→ onto_signals
  │   └→ onto_insights

onto_edges (flexible graph relations)
  ├─ src_kind: text, src_id: uuid
  └─ dst_kind: text, dst_id: uuid

onto_actors
  ├→ onto_assignments (role assignment)
  └→ onto_permissions (fine-grained access)

onto_facet_definitions
  └→ onto_facet_values
```

---

## 9. KEY DESIGN PATTERNS

### 9.1 Props-Based Flexibility

- Core fields for querying (`state_key`, `type_key`, etc.)
- Flexible `props: jsonb` for AI-inferred properties
- Facets stored in `props.facets` but exposed as generated columns

### 9.2 Graph Pattern

- `onto_edges` table for any-to-any relationships
- Supports flexible entity connections
- Props on edges for metadata

### 9.3 Application-Layer State Management

- State transitions validated in TypeScript
- Simple transition rules per entity type
- No database-level FSM complexity

### 9.4 Versioning Pattern

- `onto_output_versions` and `onto_document_versions`
- Sequential version numbers
- Storage URIs for external persistence

---

## 10. INDEXING STRATEGY

```sql
-- Facet columns (generated, indexed for quick filtering)
idx_onto_projects_facet_context (facet_context)
idx_onto_projects_facet_scale (facet_scale)
idx_onto_projects_facet_stage (facet_stage)

-- Foreign keys
idx_onto_projects_org (org_id)
idx_onto_tasks_project (project_id)
idx_onto_tasks_type_key (type_key)

-- State and type queries
idx_onto_projects_state (state_key)
idx_onto_projects_type_key (type_key)
idx_onto_tasks_state (state_key)

-- Graph queries
idx_onto_edges_src (src_kind, src_id)
idx_onto_edges_dst (dst_kind, dst_id)

-- JSON/JSONB queries
idx_onto_projects_props (props jsonb_path_ops)
```

---

## 11. SERVICE LAYER

### 11.1 OntologyInstantiationService

**TypeScript service for creating complete project graphs from specs.**

```typescript
instantiateProject(
  client: TypedSupabaseClient,
  spec: ProjectSpec,
  userId: string
): Promise<{ project_id: string; counts: InstantiationCounts }>
```

### 11.2 State Transition Service

**Application-layer state management.**

```typescript
// src/lib/server/ontology/state-transitions.ts
export function canTransition(entityType, currentState, targetState): boolean;
export function getAllowedTransitions(entityType, currentState): string[];
export function validateTransition(entityType, currentState, targetState): ValidationResult;
```

---

## 12. API ENDPOINTS

- `/api/onto/projects/+server.ts` - Project CRUD
- `/api/onto/projects/instantiate/+server.ts` - Create from spec
- `/api/onto/tasks/+server.ts` - Task management
- `/api/onto/plans/+server.ts` - Plan management
- `/api/onto/fsm/transition/+server.ts` - State transitions

---

**End of Analysis**

Generated: December 12, 2025
Scope: Complete ontology data models for props-based architecture
