<!-- apps/web/docs/features/ontology/DATA_MODELS.md -->

# Ontology Data Models & Database Schema

**Last Updated**: December 20, 2025
**Status**: Production Ready
**Category**: Feature Documentation
**Location**: `/apps/web/docs/features/ontology/`

> **Recent Updates (2024-12-20)**: Schema migration complete. All ontology tables now have dedicated columns for `description`, `deleted_at` (soft deletes), and entity-specific fields. See [ONTOLOGY_SCHEMA_MIGRATION_PLAN.md](/docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md) for details.

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
| `onto_documents`     | Project documents            | id, project_id, title, type_key, props, state_key                             |
| `onto_goals`         | Project goals                | id, project_id, name, type_key, props                                         |
| `onto_requirements`  | Project requirements         | id, project_id, text, type_key, props                                         |
| `onto_milestones`    | Project milestones           | id, project_id, title, due_at, type_key, props                                |
| `onto_risks`         | Risk tracking                | id, project_id, title, impact, probability, state_key, type_key, props        |
| `onto_metrics`       | Performance metrics          | id, project_id, name, unit, type_key, props                                   |
| `onto_metric_points` | Metric data points           | id, metric_id, ts, numeric_value, props                                       |
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
	state_key: text; // 'planning', 'active', 'completed', 'cancelled'
	props: jsonb; // AI-inferred properties
	is_public: boolean | null; // Whether project is publicly visible

	// Generated facet columns (from props->'facets')
	facet_context: text | null; // 'personal', 'client', 'commercial', etc.
	facet_scale: text | null; // 'micro', 'small', 'medium', 'large', 'epic'
	facet_stage: text | null; // 'discovery', 'planning', 'execution', 'launch', etc.

	// Project timeline
	start_at: timestamptz | null;
	end_at: timestamptz | null;

	// Next step tracking (AI-generated)
	next_step_short: text | null;
	next_step_long: text | null;
	next_step_source: text | null;
	next_step_updated_at: timestamptz | null;

	created_by: uuid; // FK to onto_actors
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Key Characteristics:**

- `type_key` is a classification string (no schema enforcement)
- Facets stored in `props.facets` as generated columns for efficient querying
- Props are AI-inferred, flexible JSONB
- `next_step_*` columns track AI-suggested next actions

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
	description: text | null; // Task description (migrated from props.description)
	state_key: text; // 'todo', 'in_progress', 'blocked', 'done'
	priority: int | null; // Numeric priority (1-5)
	props: jsonb; // Flexible task properties
	search_vector: tsvector; // Full-text search

	// Scheduling
	start_at: timestamptz | null; // When task should start
	due_at: timestamptz | null; // When task is due

	// Lifecycle
	completed_at: timestamptz | null; // When task was completed (auto-set on done)
	deleted_at: timestamptz | null; // Soft delete timestamp

	// Generated facet column
	facet_scale: text | null; // Task size/effort

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**New Columns (2024-12-20 Migration):**

- `description`: Dedicated text column (migrated from `props.description`)
- `start_at`: Task start date for scheduling
- `completed_at`: Auto-set when `state_key` becomes `done`
- `deleted_at`: Soft delete support (all queries should filter `WHERE deleted_at IS NULL`)

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
	plan: text | null; // Plan content/details
	description: text | null; // Plan description (migrated from props.description)
	type_key: text; // e.g., 'plan.timebox.sprint', 'plan.phase.project', 'plan.roadmap.strategy'
	state_key: text; // 'draft', 'active', 'completed'
	props: jsonb;
	search_vector: tsvector; // Full-text search

	// Generated facet columns
	facet_context: text | null;
	facet_scale: text | null;
	facet_stage: text | null;

	// Lifecycle
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**New Columns (2024-12-20 Migration):**

- `plan`: Dedicated text column for plan content
- `description`: Dedicated text column (migrated from `props.description`)
- `deleted_at`: Soft delete support

---

### 2.5 ONTO_DOCUMENTS

**Project documentation and reference materials.**

```typescript
interface OntoDocument {
	id: uuid;
	project_id: uuid;
	title: text;
	content: text | null; // Document content (migrated from props.body_markdown)
	description: text | null; // Document description
	type_key: text; // e.g., 'document.context.project', 'document.spec.product', 'document.knowledge.research'
	state_key: text; // 'draft', 'review', 'published'
	props: jsonb;
	search_vector: tsvector; // Full-text search

	// Lifecycle
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**New Columns (2024-12-20 Migration):**

- `content`: Dedicated text column for document body (migrated from `props.body_markdown`)
- `description`: Dedicated text column for document description
- `deleted_at`: Soft delete support

**Backwards Compatibility:** During transition, both `content` column and `props.body_markdown` are maintained. New documents store content in both locations. Read operations prefer `content` column with fallback to `props.body_markdown`.

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

### 2.6 ONTO_GOALS

**Project objectives and strategic goals.**

```typescript
interface OntoGoal {
	id: uuid;
	project_id: uuid;
	name: text;
	goal: text | null; // Goal content
	description: text | null; // Goal description (migrated from props.description)
	type_key: text | null; // e.g., 'goal.outcome.milestone', 'goal.metric.target'
	state_key: text; // 'draft', 'active', 'achieved', 'abandoned'
	props: jsonb;
	search_vector: tsvector;

	// Timeline
	target_date: timestamptz | null; // Target completion date (migrated from props.target_date)

	// Lifecycle
	completed_at: timestamptz | null; // When goal was achieved
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

### 2.7 ONTO_MILESTONES

**Key project milestones and checkpoints.**

```typescript
interface OntoMilestone {
	id: uuid;
	project_id: uuid;
	title: text;
	milestone: text | null; // Milestone content
	description: text | null; // Milestone description (migrated from props.description)
	type_key: text | null;
	state_key: text; // 'pending', 'in_progress', 'completed', 'missed'
	due_at: timestamptz;
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	completed_at: timestamptz | null; // When milestone was completed
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

### 2.8 ONTO_RISKS

**Risk tracking and mitigation.**

```typescript
interface OntoRisk {
	id: uuid;
	project_id: uuid;
	title: text;
	content: text | null; // Risk content/description
	type_key: text | null;
	state_key: text; // 'identified', 'mitigated', 'occurred', 'closed'
	impact: text; // 'low', 'medium', 'high', 'critical'
	probability: number | null; // 0-1
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	mitigated_at: timestamptz | null; // When risk was mitigated
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

### 2.9 ONTO_REQUIREMENTS

**Project requirements and specifications.**

```typescript
interface OntoRequirement {
	id: uuid;
	project_id: uuid;
	text: text; // Requirement text
	type_key: text;
	priority: int | null; // Requirement priority
	props: jsonb;
	search_vector: tsvector;

	// Lifecycle
	deleted_at: timestamptz | null; // Soft delete timestamp

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz | null;
}
```

### 2.10 - 2.12 Other Entities

See the database schema for:

- `OntoMetric` / `OntoMetricPoint` - Performance metrics
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

| Entity        | States                                          | Initial      | Terminal                 |
| ------------- | ----------------------------------------------- | ------------ | ------------------------ |
| **Project**   | `planning`, `active`, `completed`, `cancelled`  | `planning`   | `completed`, `cancelled` |
| **Task**      | `todo`, `in_progress`, `blocked`, `done`        | `todo`       | `done`                   |
| **Plan**      | `draft`, `active`, `completed`                  | `draft`      | `completed`              |
| **Output**    | `draft`, `in_progress`, `review`, `published`   | `draft`      | `published`              |
| **Document**  | `draft`, `review`, `published`                  | `draft`      | `published`              |
| **Goal**      | `draft`, `active`, `achieved`, `abandoned`      | `draft`      | `achieved`, `abandoned`  |
| **Milestone** | `pending`, `in_progress`, `completed`, `missed` | `pending`    | `completed`, `missed`    |
| **Risk**      | `identified`, `mitigated`, `occurred`, `closed` | `identified` | `closed`                 |
| **Decision**  | `pending`, `made`, `deferred`, `reversed`       | `pending`    | `made`, `reversed`       |

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

| Type Key                      | Description              |
| ----------------------------- | ------------------------ |
| `document.context.project`    | Project context/brief    |
| `document.knowledge.research` | Research notes, findings |
| `document.spec.product`       | Technical specification  |
| `document.reference.handbook` | Handbook, SOP, checklist |

---

## 8. DATA RELATIONSHIPS DIAGRAM

```
onto_projects
  ├→ onto_goals
  ├→ onto_requirements
  ├→ onto_plans
  │   └→ onto_tasks (via edges)
  ├→ onto_tasks
  ├→ onto_documents
  │   └→ onto_document_versions
  ├→ onto_milestones
  ├→ onto_risks
  ├→ onto_metrics
  │   └→ onto_metric_points
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

- `onto_document_versions`
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
