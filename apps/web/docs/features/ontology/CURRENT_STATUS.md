<!-- apps/web/docs/features/ontology/CURRENT_STATUS.md -->

# Ontology System - Current Implementation Status

**Date**: December 20, 2025
**Architecture**: Props-Based with Type Keys (Template-Free)
**Overall Status**: Production Ready ✅

---

## 🎯 Executive Summary

The BuildOS Ontology System is **production-ready** with comprehensive database schema, complete API layer, and polished UI components. The system uses a **props-based architecture** where type_key provides semantic classification and props (JSONB) stores flexible, AI-inferred properties.

### Key Milestones

- ✅ **Phase 1**: Database foundation (15+ entity tables, RLS, audit trails)
- ✅ **Phase 2**: Complete API layer (20+ endpoints, validation, CRUD)
- ✅ **Phase 3**: UI components (create/edit modals, state management)
- ✅ **December 2025**: Template system removed, transitioned to type_key classification
- ✅ **December 20, 2025**: Schema migration - dedicated columns for `description`, `deleted_at`, entity-specific fields

### Recent Schema Migration (December 20, 2025)

All ontology tables now have dedicated columns instead of relying on `props`:

| Entity              | New Columns                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `onto_tasks`        | `description`, `start_at`, `completed_at`, `deleted_at`            |
| `onto_plans`        | `plan`, `description`, `deleted_at`                                |
| `onto_goals`        | `goal`, `description`, `target_date`, `completed_at`, `deleted_at` |
| `onto_documents`    | `content`, `description`, `deleted_at`                             |
| `onto_milestones`   | `milestone`, `description`, `completed_at`, `deleted_at`           |
| `onto_risks`        | `content`, `mitigated_at`, `deleted_at`                            |
| `onto_requirements` | `priority`, `deleted_at`                                           |

**Soft Delete Support**: All entities now support soft deletes via `deleted_at` column. Queries filter `WHERE deleted_at IS NULL` by default.

See [Migration Plan](/docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md) for details.

---

## 🚨 December 2025 Architecture Change: Template Removal

**The `onto_templates` table has been removed.** The system now operates without a template catalog:

| Before (Templates)                | After (Template-Free)               |
| --------------------------------- | ----------------------------------- |
| Template table with inheritance   | No template table                   |
| LLM discovers/creates templates   | LLM classifies directly to type_key |
| Schema-driven property extraction | Minimal props from legacy data      |
| FindOrCreateTemplateService       | Removed                             |
| PropertyExtractorEngine           | Removed                             |

### How Type Keys Work Now

Type keys are **string identifiers** that classify entities semantically:

```typescript
// Tasks: Assigned via 2-phase LLM classification
task.execute; // Action tasks (default)
task.create; // Produce new artifacts
task.coordinate.meeting; // Specialization: meetings

// Projects: Fixed default
project.base; // All migrated projects

// Plans: Fixed default
plan.phase.project; // All migrated phases
```

**Classification happens at runtime via LLM**, not via template lookup.

---

## ✅ What's Fully Implemented

### 1. Database Layer (100% Complete)

**24 Tables Total** (onto_templates removed):

#### Core Entity Tables (15)

```sql
✅ onto_projects        -- Root work units with type_key & facets
✅ onto_tasks          -- Actionable items with priority & FSM
✅ onto_plans          -- Task groupings with date ranges
✅ onto_documents      -- Versioned documentation
✅ onto_goals          -- Strategic objectives with measurement
✅ onto_requirements   -- Project requirements
✅ onto_milestones     -- Time-based markers
✅ onto_risks          -- Risk tracking & mitigation
✅ onto_metrics        -- Measurement definitions
✅ onto_metric_points  -- Time-series measurements
✅ onto_sources        -- External references
✅ onto_signals        -- External signals
✅ onto_insights       -- Derived insights
```

#### Supporting Tables (9)

```sql
✅ onto_edges              -- Graph relationships (contains, depends_on, etc.)
✅ onto_actors             -- Users and AI agents
✅ onto_assignments        -- Role-based assignments
✅ onto_permissions        -- Access control
✅ onto_facet_definitions  -- 3 facets (context, scale, stage)
✅ onto_facet_values       -- Allowed facet values
✅ onto_document_versions  -- Document history
✅ onto_tools              -- Available tools
```

**Removed Tables:**

```sql
❌ onto_templates          -- DROPPED (Dec 2025)
❌ agent_template_creation_requests -- DROPPED (Dec 2025)
```

**Features:**

- Row Level Security (RLS) policies on all tables
- Audit trails (created_by, created_at, updated_at)
- Generated columns for facet indexing
- Cascading deletes via edges
- UUID primary keys

---

### 2. Type Key Taxonomy (Active - No Template Table)

Type keys are now **string conventions** used directly, without a backing template table.

#### Task Type Keys (8 base work modes + specializations)

> **Full Documentation**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks)

**Work Mode Taxonomy:**

```typescript
// 8 Base Work Modes (assigned via LLM classification)
task.execute; // Action tasks - do the work (default)
task.create; // Produce new artifacts
task.refine; // Improve existing work
task.research; // Investigate and gather information
task.review; // Evaluate and provide feedback
task.coordinate; // Sync with others
task.admin; // Administrative housekeeping
task.plan; // Strategic thinking and planning

// Specializations (assigned in Phase 2 of LLM classification)
task.coordinate.meeting; // Schedule/conduct meetings
task.coordinate.standup; // Quick team syncs
task.execute.deploy; // Production deployments
task.execute.checklist; // Follow predefined processes
```

**How Classification Works:**

1. **Phase 1 (Fast LLM)**: Selects work_mode from 8 options
2. **Phase 2 (Balanced LLM)**: Adds specialization if applicable
3. **Result**: `task.{work_mode}[.{specialization}]`

#### Project Type Keys

```typescript
project.base; // Default for all projects (fixed)
// Future: project.{domain}.{deliverable} patterns
```

#### Plan Type Keys

```typescript
plan.phase.project; // Default for migrated phases (fixed)
plan.base; // Generic plan

// Available taxonomy (for future use):
plan.timebox.sprint; // Development sprints
plan.timebox.weekly; // Weekly planning
plan.pipeline.sales; // Sales pipeline
plan.roadmap.product; // Product roadmap
```

#### Goal Type Keys

```typescript
// Format: goal.{family}[.{variant}]
goal.base; // Root abstract
goal.outcome.project; // Project outcome goals
goal.metric.usage; // Usage metrics (MAU, DAU)
goal.behavior.cadence; // Frequency goals
goal.learning.skill; // Skill acquisition
```

---

### 3. Backend Services (100% Complete)

#### Migration Services (Template-Free)

```typescript
✅ OntologyMigrationOrchestrator
   - Coordinates full migration pipeline
   - Projects → Plans → Tasks (sequential)
   - Platform locking, idempotency

✅ ProjectMigrationService + EnhancedProjectMigrator
   - Fixed type_key: 'project.base'
   - Derives facets heuristically
   - No template lookup

✅ PhaseMigrationService
   - Migrates phases to onto_plans
   - Fixed type_key: 'plan.phase.project'
   - Creates project→plan edges

✅ TaskMigrationService + BatchTaskMigrationService
   - Two-phase LLM classification
   - Batch operations for 5+ tasks
   - Creates task↔plan edges
```

#### Entity Services

```typescript
✅ InstantiationService
   - Create project from ProjectSpec
   - Create all entities (tasks, plans, goals, etc.)
   - Validate facets against taxonomy
   - Create graph edges

✅ OntoEventService
   - Create/update events
   - Template fields removed (Dec 2025)
```

#### Removed Services (Dec 2025)

```typescript
❌ FindOrCreateTemplateService    -- REMOVED
❌ PropertyExtractorEngine        -- REMOVED
❌ SchemaAutoRepairService        -- REMOVED
❌ TemplateValidationService      -- REMOVED (admin only)
❌ TemplateCrudService            -- REMOVED (admin only)
❌ TemplateResolverService        -- REMOVED
```

---

### 4. API Endpoints (100% Complete)

**15+ Endpoints Total** (template endpoints deprecated):

#### Entity CRUD (User-Facing)

```http
✅ POST   /api/onto/tasks/create    // Create task
✅ GET    /api/onto/tasks/[id]      // Get task
✅ PATCH  /api/onto/tasks/[id]      // Update task
✅ DELETE /api/onto/tasks/[id]      // Delete task

✅ POST   /api/onto/plans/create    // Create plan
✅ POST   /api/onto/goals/create    // Create goal
```

#### Project Operations

```http
✅ GET    /api/onto/projects              // List projects
✅ GET    /api/onto/projects/[id]         // Get project details
✅ POST   /api/onto/projects/instantiate  // Create from spec
```

#### Migration Operations (Admin)

```http
✅ POST   /api/admin/migration/start      // Start migration
✅ POST   /api/admin/migration/preview    // Dry-run preview
✅ GET    /api/admin/migration/status     // Check status
✅ POST   /api/admin/migration/cancel     // Cancel migration
```

#### FSM Operations

```http
✅ POST   /api/onto/fsm/transition  // Execute state transition
```

#### Deprecated Endpoints (Template Management)

```http
❌ POST   /api/onto/templates              // DEPRECATED
❌ GET    /api/onto/templates              // DEPRECATED
❌ PUT    /api/onto/templates/[id]         // DEPRECATED
❌ DELETE /api/onto/templates/[id]         // DEPRECATED
❌ POST   /api/onto/templates/[id]/clone   // DEPRECATED
```

**Security Model:**

- ✅ User endpoints use `locals.supabase` (RLS enforced)
- ✅ Admin endpoints use `createAdminSupabaseClient()` (bypass RLS)
- ✅ Actor-based authorization on all operations
- ✅ Project ownership verification

---

### 5. UI Components (90% Complete)

#### Entity Creation & Editing Modals (100% ✅)

**Create Modals:**

```svelte
✅ TaskCreateModal.svelte // Task creation with type selection ✅ PlanCreateModal.svelte // Date
ranges, plan types ✅ GoalCreateModal.svelte // Success criteria, goal types ✅
OutputCreateModal.svelte // Document creation
```

**Edit Modals:**

```svelte
✅ TaskEditModal.svelte // Full editing with delete & FSM viz ✅ PlanEditModal.svelte // Edit dates,
description, state ✅ GoalEditModal.svelte // Edit priority, target date, criteria
```

**Modal Features:**

- ✅ Type key selection (hardcoded options, not from template table)
- ✅ FSM state visualization
- ✅ Form validation
- ✅ Dark mode support
- ✅ Responsive design
- ✅ Uses base `FormModal` component

---

### 6. Pages & Routes (100% Complete)

```typescript
✅ /ontology                      // Project list dashboard
✅ /ontology/create               // Create project
✅ /ontology/projects/[id]        // Project detail with all entities
✅ /ontology/projects/[id]/outputs/[outputId]/edit  // Edit output
✅ /admin/migration               // Migration dashboard
```

**Deprecated Routes:**

```typescript
❌ /ontology/templates            // Template browser (deprecated)
❌ /ontology/templates/new        // Create template (deprecated)
❌ /ontology/templates/[id]/edit  // Edit template (deprecated)
```

---

## 📊 Metrics Summary

### Code Changes (December 2025)

| Action                     | Files | Lines Changed |
| -------------------------- | ----- | ------------- |
| Template services removed  | 4     | -2,000+       |
| Migration services updated | 6     | ~500          |
| DB migration (drop tables) | 1     | ~70           |
| Documentation updates      | 5+    | ~500          |

### Type Key Inventory

| Entity    | Type Keys Available    | Assignment Method  |
| --------- | ---------------------- | ------------------ |
| Tasks     | 12 (8 modes + 4 specs) | LLM classification |
| Projects  | 1 (project.base)       | Fixed default      |
| Plans     | 1 (plan.phase.project) | Fixed default      |
| Goals     | 13                     | Manual selection   |
| Documents | 17                     | Manual selection   |

---

## 💡 Key Architectural Decisions

### 1. Template Removal (December 2025)

- **Decision:** Remove onto_templates table and all template services
- **Rationale:** Simplify architecture, LLM classification is sufficient
- **Trade-off:** Less schema validation, but faster migration and simpler code

### 2. LLM-Based Task Classification

- **Decision:** Use two-phase LLM to assign task type_keys
- **Rationale:** More accurate than rule-based, handles edge cases
- **Implementation:** Fast model (work_mode) → Balanced model (specialization)

### 3. Fixed Type Keys for Projects/Plans

- **Decision:** Use `project.base` and `plan.phase.project` as fixed defaults
- **Rationale:** Simpler migration, can add classification later if needed
- **Trade-off:** Less variety, but migration is faster and more reliable

### 4. No Dependencies Array in Tasks

- **Decision:** Use edges table for task dependencies instead of dependencies array
- **Rationale:** More flexible, supports any relationship type, prevents circular refs
- **Implementation:** task -[depends_on]-> task edge

### 5. 3 Facets for Classification

- **Decision:** Only context, scale, stage facets
- **Rationale:** Minimal viable classification, can extend later
- **Benefit:** Simpler data model, fewer fields to manage

---

## 📞 Related Documentation

- **[TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md)** - Complete type key reference
- **[Data Models](./DATA_MODELS.md)** - Database schema documentation
- **[Migration System Design](https://github.com/Wolverine971/buildos-platform/blob/e2a41df3968c/thoughts/shared/research/2025-12-10_migration-system-design.md)** - Migration architecture
- **[TEMPLATE_FREE_ONTOLOGY_SPEC.md](./TEMPLATE_FREE_ONTOLOGY_SPEC.md)** - Template removal spec

---

**Last Updated:** December 20, 2025
**Status:** Template-Free Architecture with Dedicated Columns ✅
**Overall Completion:** 95%
