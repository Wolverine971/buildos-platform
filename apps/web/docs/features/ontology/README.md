<!-- apps/web/docs/features/ontology/README.md -->

# Ontology System Documentation

**Last Updated**: December 12, 2025
**Status**: Production Ready ✅
**Location**: `/apps/web/docs/features/ontology/`

---

## 📍 Quick Navigation

### 🎯 Start Here

- **[Current Status](./CURRENT_STATUS.md)** - Comprehensive status report
- **[Ontology Architecture Spec](./TEMPLATE_FREE_ONTOLOGY_SPEC.md)** ⭐ - Core design specification

### Essential Documentation

- **[Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md)** ⭐ - Naming conventions and entity classification
- **[Data Models](./DATA_MODELS.md)** - Complete database schema
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - CRUD implementation details
- **[Recurring Series](./RECURRING_SERIES.md)** - Timezone-aware recurring task architecture
- **[API Endpoint Reference](./API_ENDPOINTS.md)** - Complete API documentation

### Agent Chat Integration

- **[CRUD Tools Implementation](./CRUD_TOOLS_IMPLEMENTATION.md)** - CREATE/UPDATE/DELETE tools for AI agent
- **[Agent Chat Integration Status](./AGENT_CHAT_ONTOLOGY_INTEGRATION_STATUS.md)** - Integration status

### Development Resources

- **Components**: `/src/lib/components/ontology/` - UI components
- **Services**: `/src/lib/services/ontology/` - Business logic
- **API Routes**: `/src/routes/api/onto/` - REST endpoints
- **Database**: `/packages/shared-types/src/database.schema.ts` - Schema types

---

## 🎯 What is the Ontology System?

The BuildOS Ontology System is a **flexible, props-based framework** for managing projects and their entities using:

- **Type Keys** for semantic classification (e.g., `project.creative.book`, `task.execute`)
- **Dynamic Props** (JSONB) for AI-inferred properties
- **Application-layer State Machines** for simple workflow management
- **3-Dimensional Facet System** for classification
- **Graph Relationships** between entities via edges

### Core Design Principles

**Key principles:**

1. **Props are inferred, not declared** - AI discovers properties through conversation
2. **Type key is a category** - Classification string for routing/filtering
3. **State is simple** - Application-layer transitions with clear rules

### Type Key Convention

```typescript
// Format: {scope}.{realm}.{deliverable}[.{variant}]
'project.creative.book'; // Creative writing project
'project.technical.app'; // Software development project
'task.execute'; // Action task (default)
'task.research'; // Research task
'document.context'; // Project context document
```

**📚 See [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md) for complete naming conventions**

### Facet System

```typescript
// Only 3 facets that vary per instance
{
  context: "client",    // Who it's for (personal, client, commercial)
  scale: "large",       // Size/duration (micro to epic)
  stage: "execution"    // Lifecycle phase (discovery to complete)
}

// Stored as generated columns for fast filtering
```

---

## 📄 Project Context Documents

Every ontology project carries an explicit context document with type key `document.project.context`:

- Generated automatically during project creation or migration
- Stores the canonical Markdown narrative
- Linked via `onto_projects.context_document_id`
- Document `props` capture raw Markdown (`body_markdown`) and metadata

---

## 🧱 Task Schema & Work Mode Taxonomy

> **Full Documentation**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks)

**Key Points:**

- **`type_key` is required** on all tasks (default: `task.execute`)
- **Work Mode Format**: `task.{work_mode}[.{specialization}]`
- **8 Base Work Modes**: execute, create, refine, research, review, coordinate, admin, plan
- **Plan relationships via edges**: Use `onto_edges` with `belongs_to_plan` / `has_task` relations

---

## 🎛️ State Management

States are managed at the application layer with simple transition validation:

| Entity        | States                                                | Initial   |
| ------------- | ----------------------------------------------------- | --------- |
| **Project**   | `draft`, `active`, `paused`, `complete`, `archived`   | `draft`   |
| **Task**      | `todo`, `in_progress`, `blocked`, `done`, `abandoned` | `todo`    |
| **Plan**      | `draft`, `active`, `review`, `complete`               | `draft`   |
| **Output**    | `draft`, `review`, `approved`, `published`            | `draft`   |
| **Document**  | `draft`, `published`                                  | `draft`   |
| **Goal**      | `active`, `achieved`, `abandoned`                     | `active`  |
| **Milestone** | `pending`, `achieved`, `missed`                       | `pending` |

See `src/lib/server/ontology/state-transitions.ts` for transition rules.

---

## 🗂️ Database Architecture

### Core Entity Tables

```sql
onto_projects        -- Root work units
onto_tasks          -- Actionable items
onto_plans          -- Task groupings
onto_outputs        -- Deliverables (versioned)
onto_documents      -- Documentation
onto_goals          -- Strategic objectives
onto_requirements   -- Project requirements
onto_milestones     -- Time markers
onto_risks          -- Risk tracking
onto_metrics        -- Measurements
onto_metric_points  -- Time-series data
onto_decisions      -- Decision records
onto_events         -- Calendar events
```

### Supporting Tables

```sql
onto_edges              -- Graph relationships
onto_actors             -- Users and AI agents
onto_assignments        -- Role assignments
onto_permissions        -- Access control
onto_facet_definitions  -- Facet taxonomy (3 facets)
onto_facet_values       -- Allowed facet values
onto_document_versions  -- Document history
onto_output_versions    -- Output versions
```

---

## 🚀 Quick Start Guide

### Create a Project

```typescript
// Using the API
POST /api/onto/projects/instantiate
{
  project: {
    name: "My Book",
    type_key: "project.creative.book",
    props: {
      facets: {
        context: "personal",
        scale: "large",
        stage: "planning"
      },
      // AI-inferred props
      genre: "fantasy",
      target_word_count: 80000
    }
  },
  tasks: [
    { title: "Write outline", type_key: "task.plan" },
    { title: "Research topics", type_key: "task.research" }
  ]
}
```

### Create Entities via UI

```svelte
<script>
	import TaskCreateModal from '$lib/components/ontology/TaskCreateModal.svelte';
</script>

<TaskCreateModal
	projectId={project.id}
	{plans}
	onClose={() => (showModal = false)}
	onCreated={handleTaskCreated}
/>
```

---

## 📊 API Endpoints

### Entity CRUD

```typescript
// Tasks
POST / api / onto / tasks / create;
GET / api / onto / tasks / [id];
PATCH / api / onto / tasks / [id];
DELETE / api / onto / tasks / [id];

// Plans
POST / api / onto / plans / create;
GET / api / onto / plans / [id];
PATCH / api / onto / plans / [id];

// Goals
POST / api / onto / goals / create;
GET / api / onto / goals / [id];

// Projects
GET / api / onto / projects;
GET / api / onto / projects / [id];
POST / api / onto / projects / instantiate;

// FSM
POST / api / onto / fsm / transition;
```

---

## 🏗️ Key Architectural Patterns

### 1. Props-Based Flexibility

```typescript
// Props are JSONB - any structure allowed
const project = {
	type_key: 'project.creative.book',
	props: {
		facets: { context: 'personal', scale: 'large', stage: 'drafting' },
		// Domain-specific (AI-inferred)
		genre: 'fantasy',
		target_word_count: 80000,
		chapter_count: 24
	}
};
```

### 2. Edge-Based Relationships

```typescript
// Graph relationships via onto_edges
{
  src_kind: 'task',
  src_id: taskId,
  rel: 'belongs_to_plan',
  dst_kind: 'plan',
  dst_id: planId
}
```

### 3. Security Model

```typescript
// User-facing APIs use RLS
const supabase = locals.supabase;

// Admin APIs bypass RLS
const adminSupabase = createAdminSupabaseClient();

// Actor-based authorization
const actor = await ensureActorForUser(userId);
```

---

## ✅ Implementation Status

### Complete

- Database schema (15 entity tables + supporting tables)
- Entity CRUD APIs
- State transition system (application layer)
- UI components (create/edit modals)
- Agent chat integration
- Recurring task series
- Migration system

### Technical Debt

- Unit test coverage needs improvement
- No E2E tests for ontology
- Performance optimization for large datasets needed

---

## 📚 Related Documentation

### Architecture

- [Ontology Architecture Spec](./TEMPLATE_FREE_ONTOLOGY_SPEC.md) - Core design
- [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md) - Naming conventions
- [Web-Worker Architecture](/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)

### Development

- [BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)
- [API Patterns](/apps/web/docs/technical/api/PATTERNS.md)
- [Modal System](/apps/web/docs/technical/components/modals/README.md)

---

**Status Summary**: The ontology system uses a **props-based architecture** where type_key provides semantic classification and props store AI-inferred properties. State transitions are handled at the application layer.
