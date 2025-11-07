# Ontology Data Models & Database Schema

**Last Updated**: November 4, 2025
**Status**: Complete Analysis
**Category**: Feature Documentation
**Location**: `/apps/web/docs/features/ontology/`

## Overview

Comprehensive analysis of the BuildOS ontology system architecture, including database schema, entity relationships, finite state machines, and template inheritance system.

## Executive Summary

The BuildOS ontology system is a sophisticated, **template-driven, graph-based data model** that enables flexible project management, task tracking, and output creation across multiple use cases (writers, coaches, developers, founders, marketers, students, etc.). It uses PostgreSQL with JSON/JSONB for flexible property storage, finite state machines for entity lifecycle management, and facet-based tagging for multi-dimensional classification.

**Key Characteristics:**

- **15 core entity types** (projects, tasks, plans, outputs, documents, goals, requirements, etc.)
- **3-facet taxonomy system** (context, scale, stage) for dimensional classification
- **Template inheritance** (parent-child relationships) for schema and FSM reuse
- **Graph-based relationships** via `onto_edges` table for flexible entity connections
- **Role-based access control** via actors, assignments, and permissions tables
- **Finite State Machines** embedded in templates for entity lifecycle management
- **Flexible props (JSON)** for extensible entity properties

---

## 1. DATABASE SCHEMA OVERVIEW

### 1.1 Core Tables (Onto\_ Prefix)

All ontology tables use the `onto_` prefix in the public schema. Key tables are:

| Table                | Purpose                      | Key Columns                                                                   |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `onto_projects`      | Root projects/work units     | id, name, type_key, state_key, props, facet_context, facet_scale, facet_stage |
| `onto_tasks`         | Actionable items             | id, project_id, plan_id, title, state_key, priority, due_at, props            |
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
	type_key: text; // e.g., 'founder.startup', 'writer.book'
	also_types: text[]; // Additional type keys
	state_key: text; // e.g., 'draft', 'active', 'complete'
	props: jsonb; // Flexible properties

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

- Projects reference templates via `type_key` for schema/FSM inheritance
- Facets stored in `props.facets` as generated columns for efficient querying
- Supports multiple types via `also_types` array
- Context document provides detailed project context

---

### 2.2 ONTO_TASKS

**Atomic actionable items, organized into plans.**

```typescript
interface OntoTask {
	id: uuid;
	project_id: uuid; // FK to onto_projects
	plan_id: uuid | null; // FK to onto_plans (optional grouping)
	title: text;
	state_key: text; // 'todo', 'in_progress', 'done', etc.
	priority: int | null; // Numeric priority
	due_at: timestamptz | null;
	props: jsonb; // Flexible task properties

	// Generated facet column
	facet_scale: text | null; // Task size/effort

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Recurring series props**

Tasks can now act as series masters or instances without schema changes. We mirror `series_id` at the root of `props` for quick filtering and then store detailed metadata under `props.series`:

```json
{
	"series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
	"series": {
		"id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
		"role": "master", // or "instance"
		"timezone": "America/Los_Angeles",
		"rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
		"dtstart": "2025-11-12T09:00:00-08:00",
		"instance_count": 8,
		"master_task_id": "task-master-uuid",
		"index": 0 // only present on instances
	},
	"recurrence": {
		"occurrence_at": "2025-11-26T17:00:00Z",
		"local_occurrence_at": "2025-11-26T09:00:00-08:00",
		"source_entity_id": "task-master-uuid",
		"source_type_key": "task.quick-action"
	}
}
```

Instances clone the master’s props but replace `series` with the instance metadata and append a `recurrence` block for analytics. The partial index `idx_onto_tasks_series_id` covers `props->>'series_id'` for fast lookups.

**State Machine States (typically):**

- `todo` → `in_progress` → `done`
- Variations: `backlog`, `review`, `blocked`, `abandoned`

---

### 2.3 ONTO_PLANS

**Logical groupings of tasks within a project.**

```typescript
interface OntoPlan {
	id: uuid;
	project_id: uuid; // FK to onto_projects
	name: text;
	type_key: text; // e.g., 'plan.sprint', 'plan.weekly'
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

**Typical Plans:**

- Weekly plan for time boxing
- 2-week sprint for agile teams
- Phase-based plans for project structure

---

### 2.4 ONTO_OUTPUTS

**Deliverables, artifacts, or results of work.**

```typescript
interface OntoOutput {
	id: uuid;
	project_id: uuid;
	name: text;
	type_key: text; // e.g., 'output.chapter', 'output.launch_plan'
	state_key: text; // 'draft', 'review', 'approved', 'published'
	props: jsonb;

	// Generated facet column
	facet_stage: text | null;

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

**Output Types (seeded):**

- `output.chapter` - Book chapters
- `output.design` - Design assets
- `output.workout_plan` - Fitness plans
- `output.article` - Blog articles/essays
- `output.blog_post` - Blog posts
- `output.case_study` - Customer case studies
- `output.whitepaper` - Technical/research papers
- `output.newsletter` - Email newsletters

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
	type_key: text; // e.g., 'doc.brief', 'doc.notes'
	props: jsonb;

	created_by: uuid;
	created_at: timestamptz;
	updated_at?: timestamptz;
}
```

**Document Types (seeded):**

- `doc.brief` - Project brief
- `doc.notes` - Notes/research
- `doc.intake` - Intake forms

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

**Project objectives and goals.**

```typescript
interface OntoGoal {
	id: uuid;
	project_id: uuid;
	name: text;
	type_key: text | null;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.7 ONTO_REQUIREMENTS

**Project requirements and specifications.**

```typescript
interface OntoRequirement {
	id: uuid;
	project_id: uuid;
	text: text;
	type_key: text; // Default: 'requirement.general'
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.8 ONTO_MILESTONES

**Key project milestones with target dates.**

```typescript
interface OntoMilestone {
	id: uuid;
	project_id: uuid;
	title: text;
	type_key: text | null;
	due_at: timestamptz;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.9 ONTO_RISKS

**Risk tracking and management.**

```typescript
interface OntoRisk {
	id: uuid;
	project_id: uuid;
	title: text;
	type_key: text | null;
	probability: numeric | null; // 0.0 to 1.0
	impact: text; // 'low', 'medium', 'high', 'critical'
	state_key: text; // 'open', 'mitigated', 'closed'
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.10 ONTO_METRICS

**Performance metrics and KPIs.**

```typescript
interface OntoMetric {
	id: uuid;
	project_id: uuid;
	name: text;
	type_key: text | null;
	unit: text; // e.g., 'pages', 'users', 'revenue'
	definition: text | null; // How to calculate
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

**Project decision log.**

```typescript
interface OntoDecision {
	id: uuid;
	project_id: uuid;
	title: text;
	decision_at: timestamptz;
	rationale: text | null;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.12 ONTO_SOURCES

**External information sources and references.**

```typescript
interface OntoSource {
	id: uuid;
	project_id: uuid;
	uri: text; // URL or reference
	snapshot_uri: text | null; // Archived copy
	captured_at: timestamptz | null;
	props: jsonb;
	created_by: uuid;
	created_at: timestamptz;
}
```

---

### 2.13 ONTO_SIGNALS & ONTO_INSIGHTS

**Real-time signals and derived insights.**

```typescript
interface OntoSignal {
	id: uuid;
	project_id: uuid;
	ts: timestamptz;
	channel: text; // e.g., 'system', 'user', 'api'
	payload: jsonb; // Signal data
	created_at: timestamptz;
}

interface OntoInsight {
	id: uuid;
	project_id: uuid;
	title: text;
	derived_from_signal_id: uuid | null;
	props: jsonb;
	created_at: timestamptz;
}
```

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
	rel: text; // e.g., 'has_goal', 'depends_on', 'references'

	// Target
	dst_kind: text;
	dst_id: uuid;

	props: jsonb; // Additional edge metadata
	created_at: timestamptz;
}
```

**Common Relationships:**

- `project` -[has_goal]-> `goal`
- `project` -[has_requirement]-> `requirement`
- `project` -[has_plan]-> `plan`
- `project` -[has_task]-> `task`
- `project` -[has_output]-> `output`
- `project` -[has_milestone]-> `milestone`
- `project` -[has_metric]-> `metric`
- `task` -[depends_on]-> `task`
- `plan` -[contains]-> `task`
- `project` -[uses_template]-> `template`

---

## 4. FACET SYSTEM - Multi-dimensional Classification

### 4.1 Facet Definitions

**Three core facets for dimensional classification:**

```typescript
interface OntoFacetDefinition {
	key: text; // Primary key: 'context', 'scale', 'stage'
	name: text;
	description: text | null;
	allowed_values: jsonb; // Array of allowed values
	is_multi_value: boolean | null; // Can have multiple values?
	is_required: boolean | null; // Must have a value?
	applies_to: text[]; // e.g., ['project', 'plan', 'task']
	created_at: timestamptz;
}
```

---

### 4.2 Facet Values

**Discrete values for each facet dimension.**

```typescript
interface OntoFacetValue {
	id: uuid;
	facet_key: text; // Foreign key to onto_facet_definitions
	value: text; // e.g., 'personal', 'small'
	label: text; // Display label
	description: text | null;
	color: text | null; // UI color code
	icon: text | null; // Icon identifier
	parent_value_id: uuid | null; // For hierarchical values
	sort_order: int | null;
	created_at: timestamptz;
}
```

---

### 4.3 The Three Facets

#### **Facet 1: Context** (Work organizational setting)

- `personal` - Personal projects
- `client` - Client work/consulting
- `commercial` - For-profit products
- `internal` - Internal company projects
- `open_source` - Open source work
- `community` - Community-driven
- `academic` - Educational/research
- `nonprofit` - Non-profit/social impact
- `startup` - Early-stage ventures

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

## 5. TEMPLATE SYSTEM - Schema and FSM Management

### 5.1 ONTO_TEMPLATES - Template Registry

**Master template definitions with schema, FSM, and inheritance.**

```typescript
interface OntoTemplate {
	id: uuid;
	scope: text; // 'project', 'plan', 'task', 'output', 'document', 'goal', 'requirement', 'risk', 'milestone', 'metric'
	type_key: text; // e.g., 'writer.book', 'founder.startup'
	name: text;
	status: 'draft' | 'active' | 'deprecated';

	// Inheritance
	parent_template_id: uuid | null; // For template inheritance
	is_abstract: boolean | null; // Cannot instantiate if true

	// Schema (JSON Schema)
	schema: jsonb; // JSON Schema for validation

	// Finite State Machine
	fsm: jsonb; // FSM definition (states, transitions, guards, actions)

	// Defaults
	default_props: jsonb; // Default properties for instances
	default_views: jsonb; // View configurations
	facet_defaults: jsonb; // Default facet values

	// Metadata
	metadata: jsonb; // Realm, description, keywords, etc.

	created_by: uuid;
	created_at: timestamptz;
	updated_at: timestamptz;
}
```

---

### 5.2 Template Inheritance Chain

**Templates support multi-level inheritance:**

```
output.base (abstract)
  ↓
output.document (abstract)
  ├─→ output.chapter (concrete)
  ├─→ output.article (concrete)
  ├─→ output.blog_post (concrete)
  ├─→ output.case_study (concrete)
  ├─→ output.whitepaper (concrete)
  └─→ output.newsletter (concrete)
```

**Inheritance Rules:**

- Schema properties accumulate (child + parent)
- FSM: Child completely overrides parent
- Metadata: Child wins on conflicts
- Facet defaults: Child wins on conflicts

---

### 5.3 Seeded Project Templates

**25+ templates covering common work types:**

#### **Writer Templates**

- `writer.book` - Book writing with chapters
- `writer.article` - Articles/essays

#### **Coach Templates**

- `coach.client` - 1:1 coaching engagements
- `coach.program` - Group coaching programs

#### **Developer Templates**

- `developer.app` - Full application development
- `developer.feature` - Feature-level work

#### **Founder Templates**

- `founder.startup` - Complete startup journey
- `founder.product` - Product launch lifecycle

#### **Student Templates**

- `student.assignment` - Homework/assignments
- `student.project` - Academic projects

#### **Personal Templates**

- `personal.goal` - Personal goal tracking
- `personal.routine` - Habit/routine building

#### **Marketer Templates**

- `marketer.campaign` - Marketing campaigns

#### **Plan Templates**

- `plan.weekly` - Weekly planning
- `plan.sprint` - 2-week agile sprints

#### **Output Templates**

- `output.chapter` - Book chapters
- `output.design` - Design assets
- `output.workout_plan` - Fitness plans
- And more for various deliverables...

---

## 6. FINITE STATE MACHINES (FSMs)

### 6.1 FSM Structure

**Embedded in template definitions for entity lifecycle management.**

```typescript
interface FSMDef {
	type_key: string;
	states: string[]; // e.g., ['draft', 'active', 'complete']
	transitions: Transition[];
}

interface Transition {
	from: string; // Source state
	to: string; // Target state
	event: string; // Triggering event
	guards?: Guard[]; // Preconditions
	actions?: Action[]; // Side effects
}

interface Guard {
	type: string; // 'has_property', 'has_facet', 'facet_in', etc.
	// Guard-specific fields...
}

interface Action {
	type: string; // 'spawn_tasks', 'update_facets', 'notify', etc.
	// Action-specific fields...
}
```

---

### 6.2 Guard Types

**Preconditions evaluated before allowing transitions:**

| Guard Type         | Purpose                  | Example                                                               |
| ------------------ | ------------------------ | --------------------------------------------------------------------- |
| `has_property`     | Check if property exists | `{"type":"has_property","path":"props.mvp_complete"}`                 |
| `has_facet`        | Check facet value        | `{"type":"has_facet","key":"scale","value":"large"}`                  |
| `facet_in`         | Check facet in values    | `{"type":"facet_in","key":"stage","values":["planning","execution"]}` |
| `all_facets_set`   | Check all facets present | `{"type":"all_facets_set","keys":["context","scale"]}`                |
| `type_key_matches` | Pattern match type_key   | `{"type":"type_key_matches","pattern":"writer.*"}`                    |

---

### 6.3 Action Types

**Side effects triggered on transitions:**

| Action Type                | Purpose                |
| -------------------------- | ---------------------- |
| `spawn_tasks`              | Create child tasks     |
| `create_output`            | Create deliverable     |
| `create_doc_from_template` | Generate document      |
| `update_facets`            | Update facet values    |
| `schedule_rrule`           | Create recurring tasks |
| `notify`                   | Send notification      |
| `email_user`               | Send email             |
| `run_llm_critique`         | Get AI feedback        |

---

### 6.4 Example FSM: founder.startup

```json
{
	"type_key": "founder.startup",
	"states": ["ideation", "building", "launching", "growth"],
	"transitions": [
		{
			"from": "ideation",
			"to": "building",
			"event": "start_building",
			"guards": [
				{ "type": "has_property", "path": "props.company_name" },
				{ "type": "has_property", "path": "props.target_market" },
				{ "type": "has_property", "path": "props.value_proposition" }
			],
			"actions": [
				{
					"type": "spawn_tasks",
					"titles": [
						"Define MVP features",
						"Build core product",
						"Set up development environment"
					],
					"props_template": { "facets": { "scale": "large" } }
				},
				{ "type": "update_facets", "facets": { "stage": "execution" } },
				{ "type": "notify", "message": "Building phase started!" }
			]
		},
		{
			"from": "building",
			"to": "launching",
			"event": "launch",
			"guards": [{ "type": "has_property", "path": "props.mvp_complete" }],
			"actions": [
				{
					"type": "create_output",
					"name": "Launch Plan",
					"type_key": "output.launch_plan"
				},
				{ "type": "update_facets", "facets": { "stage": "launch" } }
			]
		},
		{
			"from": "launching",
			"to": "growth",
			"event": "achieve_pmf",
			"guards": [
				{ "type": "has_property", "path": "props.customer_count" },
				{ "type": "has_property", "path": "props.first_customer_date" }
			],
			"actions": [
				{
					"type": "spawn_tasks",
					"titles": ["Scale customer acquisition", "Optimize conversion funnel"]
				},
				{ "type": "update_facets", "facets": { "stage": "maintenance" } },
				{ "type": "email_user", "subject": "Congratulations on achieving PMF!" }
			]
		}
	]
}
```

---

## 7. ACCESS CONTROL

### 7.1 ONTO_ACTORS - Users and Agents

**Represents humans and AI agents in the system.**

```typescript
interface OntoActor {
	id: uuid;
	kind: 'human' | 'agent';
	name: text;
	email: text | null;
	user_id: uuid | null; // FK to public.users (only for humans)
	org_id: uuid | null;
	metadata: jsonb; // Flexible actor metadata
	created_at: timestamptz;

	// Constraint: kind='human' requires user_id; kind='agent' requires null user_id
}
```

---

### 7.2 ONTO_ASSIGNMENTS - Role Assignment

**Assigns roles to actors on objects.**

```typescript
interface OntoAssignment {
	id: uuid;
	actor_id: uuid; // FK to onto_actors
	object_kind: text; // e.g., 'project', 'task'
	object_id: uuid;
	role_key: text; // e.g., 'owner', 'editor', 'viewer'
	created_at: timestamptz;

	// Unique constraint on (actor_id, object_kind, object_id, role_key)
}
```

---

### 7.3 ONTO_PERMISSIONS - Fine-grained Permissions

**Granular permission model.**

```typescript
interface OntoPermission {
	id: uuid;
	actor_id: uuid | null; // Null for role-based
	role_key: text | null;
	object_kind: text; // e.g., 'project'
	object_id: uuid;
	access: text; // 'create', 'read', 'update', 'delete'
	created_at: timestamptz;
}
```

---

## 8. REFERENCE DATA

### 8.1 ONTO_TOOLS - Tool Registry

**Tracks tools and capabilities available in the system.**

```typescript
interface OntoTool {
	id: uuid;
	name: text;
	capability_key: text; // e.g., 'llm_critique', 'email'
	config: jsonb; // Tool configuration
	created_at: timestamptz;
}
```

---

## 9. HELPER FUNCTIONS

### 9.1 Database-Side Functions

**PostgreSQL functions for ontology operations:**

| Function                                     | Purpose                         |
| -------------------------------------------- | ------------------------------- |
| `ensure_actor_for_user(uuid)`                | Create actor for user if needed |
| `get_project_with_template(uuid)`            | Get project + template          |
| `get_allowed_transitions(text, uuid)`        | Get valid state transitions     |
| `get_template_catalog(scope, realm, search)` | Browse template catalog         |
| `validate_facet_values(jsonb)`               | Validate facet values           |
| `onto_jsonb_extract(jsonb, text)`            | JSON path extraction            |
| `onto_jsonb_has_value(jsonb, text)`          | Check if JSON path has value    |
| `onto_check_guard(jsonb, jsonb)`             | Evaluate FSM guard              |
| `onto_guards_pass(jsonb, jsonb)`             | Evaluate all guards             |

---

## 10. SERVICE LAYER

### 10.1 OntologyInstantiationService

**TypeScript service for creating complete project graphs from specs.**

**Key Methods:**

```typescript
instantiateProject(
  client: TypedSupabaseClient,
  spec: ProjectSpec,
  userId: string
): Promise<{ project_id: string; counts: InstantiationCounts }>
```

**Creates:**

- Project entity
- Goals, requirements, plans, tasks
- Outputs, documents
- Sources, metrics, milestones, risks, decisions
- All inter-entity edges
- Returns counts of created entities

---

### 10.2 TemplateResolverService

**Handles template inheritance resolution.**

**Key Functions:**

```typescript
resolveTemplateWithClient(
  client: TypedSupabaseClient,
  typeKey: string,
  scope?: string
): Promise<ResolvedTemplate>
```

**Resolution Process:**

1. Follow parent_template_id chain to root
2. Merge properties from root → leaf
3. Return fully resolved template with inheritance chain

---

### 10.3 FSM Engine

**Located in `/src/lib/server/fsm/`**

**Components:**

- `engine.ts` - FSM evaluation and transition execution
- `actions/` - Action handlers (spawn_tasks, notify, email_user, etc.)
- `guards.ts` - Guard evaluation

---

## 11. DATA RELATIONSHIPS DIAGRAM

```
onto_templates (Schema + FSM registry)
  ↑ (referenced by type_key)
  │
onto_projects
  ├→ onto_goals
  ├→ onto_requirements
  ├→ onto_plans
  │   └→ onto_tasks
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
  │   ↓ (derives)
  │   onto_insights
  │
onto_edges (flexible graph relations)
  ├─ src_kind: text, src_id: uuid
  └─ dst_kind: text, dst_id: uuid

onto_actors
  ├→ onto_assignments (role assignment)
  └→ onto_permissions (fine-grained access)

onto_facet_definitions
  ├→ onto_facet_values (values for each facet)
  │
  └→ (referenced in projects, plans, tasks, outputs via props.facets)
```

---

## 12. PROJECT TYPE KEY HIERARCHY

**Type keys follow pattern: `<realm>.<type>`**

```
Project Types:
  writer.book             (Book writing project with chapters)
  writer.article          (Articles/essays)
  coach.client            (1:1 coaching)
  coach.program           (Group coaching)
  developer.app           (App development)
  developer.feature       (Feature development)
  founder.startup         (Startup journey)
  founder.product         (Product launch)
  student.assignment      (Homework)
  student.project         (Academic projects)
  personal.goal           (Goal tracking)
  personal.routine        (Habit/routine)
  marketer.campaign       (Marketing campaigns)

Plan Types:
  plan.weekly             (Weekly planning)
  plan.sprint             (2-week agile)

Output Types:
  output.base             (Abstract base)
  output.document         (Abstract document)
  output.chapter          (Book chapters)
  output.article          (Articles)
  output.blog_post        (Blog posts)
  output.case_study       (Case studies)
  output.whitepaper       (Whitepapers)
  output.newsletter       (Newsletters)
  output.design           (Design assets)
  output.workout_plan     (Fitness plans)

Document Types:
  doc.brief               (Project brief)
  doc.notes               (Research notes)
  doc.intake              (Intake form)
```

---

## 13. STATE TRANSITIONS BY ENTITY TYPE

### 13.1 Project States (Common)

- `draft` → `active` → `complete`
- Common variations: `planning`, `executing`, `maintenance`, `abandoned`

### 13.2 Task States

- `todo` → `in_progress` → `done`
- Variations: `backlog`, `blocked`, `review`, `abandoned`

### 13.3 Output States

- `draft` → `review` → `approved` → `published`
- Variation: `scheduled` (for newsletters, campaigns)

### 13.4 Startup-Specific (founder.startup)

- `ideation` → `building` → `launching` → `growth`
- Pivot possible: `building` → `ideation`

### 13.5 Routine-Specific (personal.routine)

- `designing` → `testing` → `established` → `maintaining`
- Restart: `testing` → `designing`

---

## 14. INDEXING STRATEGY

**Performance optimizations:**

```sql
-- Facet columns (generated, indexed for quick filtering)
idx_onto_projects_facet_context (facet_context)
idx_onto_projects_facet_scale (facet_scale)
idx_onto_projects_facet_stage (facet_stage)

-- Foreign keys
idx_onto_projects_org (org_id)
idx_onto_goals_project (project_id)
idx_onto_tasks_project (project_id)
idx_onto_tasks_plan (plan_id)

-- State and type queries
idx_onto_projects_state (state_key)
idx_onto_projects_type_key (type_key)
idx_onto_tasks_state (state_key)
idx_onto_outputs_state (state_key)

-- Graph queries
idx_onto_edges_src (src_kind, src_id)
idx_onto_edges_dst (dst_kind, dst_id)

-- Full-text search (trigram indexes)
idx_onto_projects_name (name gin_trgm_ops)
idx_onto_projects_description (description gin_trgm_ops)

-- JSON/JSONB queries
idx_onto_projects_props (props jsonb_path_ops)
idx_onto_templates_metadata (metadata jsonb_path_ops)
```

---

## 15. KEY DESIGN PATTERNS

### 15.1 Flexible Props Pattern

- Core fields for querying (`state_key`, `type_key`, etc.)
- Flexible `props: jsonb` for extensibility
- Facets stored in `props.facets` but exposed as generated columns

### 15.2 Template-Driven Pattern

- All entities reference templates via `type_key`
- Schema and FSM defined once in template
- Inherited and merged by child templates

### 15.3 Graph Pattern

- `onto_edges` table for any-to-any relationships
- Supports flexible entity connections
- Props on edges for metadata

### 15.4 FSM Pattern

- State machine embedded in template
- Guards evaluate preconditions
- Actions perform side effects
- Evaluated server-side via PostgreSQL functions

### 15.5 Facet Pattern

- 3 dimensions: context, scale, stage
- Applied to projects, plans, tasks, outputs
- Facets stored in `props.facets`, exposed as generated columns
- Efficient filtering via indexed columns

### 15.6 Versioning Pattern

- `onto_output_versions` and `onto_document_versions`
- Sequential version numbers
- Storage URIs for external persistence
- Metadata on each version

---

## 16. CONSTRAINTS & VALIDATIONS

### 16.1 Database Constraints

```sql
-- Type key format validation
constraint chk_type_key_format check (type_key ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$')

-- Scope validation
constraint chk_scope_valid check (scope in ('project','plan','task','output','document','goal','requirement','risk','milestone','metric'))

-- Actor identity constraint
constraint chk_actor_identity check (
  (kind = 'human' and user_id is not null) or
  (kind = 'agent' and user_id is null)
)

-- Risk probability validation
probability numeric check (probability >= 0 and probability <= 1)

-- Unique constraints on versioning
unique (output_id, number)
unique (document_id, number)
unique (scope, type_key)  -- on templates
unique (facet_key, value) -- on facet values
unique (actor_id, object_kind, object_id, role_key) -- on assignments
```

---

## 17. MIGRATION HISTORY

**Key migrations:**

1. `20250601000001_ontology_system.sql` - Core tables, facets, templates
2. `20250601000002_ontology_helpers.sql` - PostgreSQL helper functions
3. `20250602000001_add_base_output_templates.sql` - Output template inheritance

---

## 18. SUMMARY TABLE - Entity Count

| Entity Type        | Count    | Purpose                         |
| ------------------ | -------- | ------------------------------- |
| Project templates  | 13       | Schema/FSM for project creation |
| Plan templates     | 2        | Weekly and sprint planning      |
| Output templates   | 10+      | Text documents, deliverables    |
| Document templates | 3        | Project documentation           |
| Facet definitions  | 3        | Context, scale, stage           |
| Facet values       | 25+      | Discrete facet options          |
| Actors             | Variable | Human users + AI agents         |

---

## 19. IMPLEMENTATION NOTES

### 19.1 Type Safety

- TypeScript interfaces in `/lib/types/onto/`
- Database schema exported to `database.schema.ts`
- Full type coverage for all entities

### 19.2 Service Layer

- `OntologyInstantiationService` for graph creation
- `TemplateResolverService` for inheritance resolution
- FSM engine for state machine execution

### 19.3 API Endpoints

- `/api/onto/projects/+server.ts` - Project CRUD
- `/api/onto/projects/instantiate/+server.ts` - Create from spec
- `/api/onto/templates/+server.ts` - Template retrieval
- `/api/onto/fsm/transitions/+server.ts` - FSM transitions
- `/api/onto/outputs/+server.ts` - Output management

### 19.4 Admin Views

- Graph visualization via Cytoscape
- Template catalog browsing
- Project/entity relationship viewing

---

## 20. FUTURE EXTENSIBILITY

The ontology system is designed for extension:

1. **New Entity Types**: Add to scopes constraint in migrations
2. **New Facets**: Create facet definitions and values
3. **New Templates**: Insert into `onto_templates` with custom FSMs
4. **New Actions**: Implement in FSM actions directory
5. **New Guards**: Add evaluation logic in guard functions
6. **Custom Relationships**: Use flexible `onto_edges` table

---

**End of Analysis**

Generated: 2025-11-04  
Scope: Complete ontology data models, schema, relationships, and FSMs
