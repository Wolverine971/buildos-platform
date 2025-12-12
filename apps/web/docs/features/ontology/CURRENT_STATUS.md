<!-- apps/web/docs/features/ontology/CURRENT_STATUS.md -->

# Ontology System - Current Implementation Status

**Date**: December 12, 2025
**Architecture**: Props-Based with Type Keys
**Overall Status**: Production Ready ✅

---

## 🎯 Executive Summary

The BuildOS Ontology System is **production-ready** with comprehensive database schema, complete API layer, and polished UI components. The system uses a **props-based architecture** where type_key provides semantic classification and props (JSONB) stores flexible, AI-inferred properties.

### Key Milestones

- ✅ **Phase 1**: Database foundation (15+ entity tables, RLS, audit trails)
- ✅ **Phase 2**: Complete API layer (20+ endpoints, validation, CRUD)
- ✅ **Phase 3**: UI components (create/edit modals, state management)
- ✅ **December 2025**: Template system removed, transitioned to props-based architecture

---

## ✅ What's Fully Implemented

### 1. Database Layer (100% Complete)

**25 Tables Total:**

#### Core Entity Tables (15)

```sql
✅ onto_projects        -- Root work units with type_key & facets
✅ onto_tasks          -- Actionable items with priority & FSM
✅ onto_plans          -- Task groupings with date ranges
✅ onto_outputs        -- Versioned deliverables
✅ onto_documents      -- Versioned documentation
✅ onto_goals          -- Strategic objectives with measurement
✅ onto_requirements   -- Project requirements
✅ onto_milestones     -- Time-based markers
✅ onto_risks          -- Risk tracking & mitigation
✅ onto_metrics        -- Measurement definitions
✅ onto_metric_points  -- Time-series measurements
✅ onto_decisions      -- Decision records (ADRs)
✅ onto_sources        -- External references
✅ onto_signals        -- External signals
✅ onto_insights       -- Derived insights
```

#### Supporting Tables (10)

```sql
✅ onto_templates           -- Template definitions with inheritance
✅ onto_edges              -- Graph relationships (contains, depends_on, etc.)
✅ onto_actors             -- Users and AI agents
✅ onto_assignments        -- Role-based assignments
✅ onto_permissions        -- Access control
✅ onto_facet_definitions  -- 3 facets (context, scale, stage)
✅ onto_facet_values       -- Allowed facet values
✅ onto_document_versions  -- Document history
✅ onto_output_versions    -- Output versions
✅ onto_tools              -- Available tools
```

**Features:**

- Row Level Security (RLS) policies on all tables
- Audit trails (created_by, created_at, updated_at)
- Generated columns for facet indexing
- Cascading deletes via edges
- UUID primary keys

---

### 2. Template System (100% Complete) ✅

**Migration**: `20250605000001_add_missing_base_templates.sql`

#### Task Templates (12 total: 8 base work modes + 4 specializations)

> **Full Documentation**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md#onto_tasks) for complete task taxonomy.

**Work Mode Taxonomy (December 2025 Update):**

```typescript
// 8 Base Work Modes
✅ task.execute         // Action tasks - do the work (default)
✅ task.create          // Produce new artifacts
✅ task.refine          // Improve existing work
✅ task.research        // Investigate and gather information
✅ task.review          // Evaluate and provide feedback
✅ task.coordinate      // Sync with others
✅ task.admin           // Administrative housekeeping
✅ task.plan            // Strategic thinking and planning

// 4 Specializations
✅ task.coordinate.meeting   // Schedule/conduct meetings
✅ task.coordinate.standup   // Quick team syncs
✅ task.execute.deploy       // Production deployments
✅ task.execute.checklist    // Follow predefined processes
```

**Template Features:**

- ✅ Work mode inheritance (specializations inherit from base modes)
- ✅ Category metadata for UI grouping
- ✅ FSM states synchronized with UI (todo → in_progress → blocked → done)
- ✅ No dependencies array (uses edges instead)
- ✅ Schema validation with required fields
- ✅ `type_key` is now required on all tasks (default: `task.execute`)
- ✅ Plan relationships via edges (`belongs_to_plan`, `has_task`)

#### Goal Templates (Family-Based Taxonomy - December 2025 Update)

```typescript
// Format: goal.{family}[.{variant}]
// Families: outcome, metric, behavior, learning

// Abstract Bases
✅ goal.base           // Root abstract (FSM: draft → active → on_track/at_risk → achieved/missed)
✅ goal.outcome.base   // Outcome family base
✅ goal.metric.base    // Metric family base
✅ goal.behavior.base  // Behavior family base
✅ goal.learning.base  // Learning family base

// Concrete Templates
✅ goal.outcome.project   // Project outcome goals
✅ goal.outcome.milestone // Milestone goals
✅ goal.metric.usage      // Usage metrics (MAU, DAU)
✅ goal.metric.revenue    // Revenue metrics (MRR, ARR)
✅ goal.behavior.cadence  // Frequency goals
✅ goal.behavior.routine  // Routine/habit goals
✅ goal.learning.skill    // Skill acquisition
✅ goal.learning.domain   // Domain knowledge
```

**Template Features:**

- ✅ Inheritance from goal.base
- ✅ Measurement type metadata
- ✅ Progress tracking schemas
- ✅ Success criteria fields

#### Plan Templates (Family-Based Taxonomy - December 2025 Update)

> **Full Documentation**: See [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md) and [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)

```typescript
// Format: plan.{family}[.{variant}]
// Families: timebox, pipeline, campaign, roadmap, process, phase

// Abstract Bases
✅ plan.base               // Root abstract (not instantiable)
✅ plan.timebox.base       // Timebox family base
✅ plan.pipeline.base      // Pipeline family base
✅ plan.campaign.base      // Campaign family base
✅ plan.roadmap.base       // Roadmap family base
✅ plan.process.base       // Process family base
✅ plan.phase.base         // Phase family base

// Concrete Templates
✅ plan.timebox.sprint     // Development sprints (1-4 weeks)
✅ plan.timebox.weekly     // Weekly planning
✅ plan.timebox.daily_focus // Daily focus plan
✅ plan.pipeline.sales     // Sales pipeline
✅ plan.pipeline.content   // Content pipeline
✅ plan.pipeline.feature   // Feature pipeline
✅ plan.campaign.marketing // Marketing campaigns
✅ plan.campaign.product_launch // Launch campaigns
✅ plan.roadmap.product    // Product roadmap
✅ plan.process.client_onboarding // Client onboarding
✅ plan.phase.project      // Project phases
```

#### Document Templates (Family-Based Taxonomy - December 2025 Update)

```typescript
// Format: document.{family}[.{variant}]
// Families: context, knowledge, decision, spec, reference, intake

// Abstract Bases
✅ document.base              // Root abstract (not instantiable)
✅ document.context.base      // Context family base
✅ document.knowledge.base    // Knowledge family base
✅ document.decision.base     // Decision family base
✅ document.spec.base         // Spec family base
✅ document.reference.base    // Reference family base
✅ document.intake.base       // Intake family base

// Concrete Templates
✅ document.context.project   // Canonical project narrative
✅ document.context.brief     // Creative brief
✅ document.knowledge.research // Research findings
✅ document.knowledge.brain_dump // Brain dump notes
✅ document.decision.meeting_notes // Meeting minutes
✅ document.decision.rfc      // Request for comment
✅ document.spec.product      // Product specifications
✅ document.spec.technical    // Technical specifications
✅ document.reference.handbook // Guides and manuals
✅ document.intake.client     // Client intake forms
```

#### Risk Templates (Family-Based Taxonomy - December 2025 Update)

```typescript
// Format: risk.{family}[.{variant}]
// Families: technical, schedule, resource, budget, scope, external, quality

// Abstract Bases
✅ risk.base              // Root abstract (not instantiable)
✅ risk.technical.base    // Technical family base
✅ risk.schedule.base     // Schedule family base
✅ risk.resource.base     // Resource family base
✅ risk.budget.base       // Budget family base
✅ risk.scope.base        // Scope family base
✅ risk.external.base     // External family base
✅ risk.quality.base      // Quality family base

// Concrete Templates
✅ risk.technical.security // Security risks
✅ risk.technical.scalability // Scalability risks
✅ risk.schedule.dependency // Dependency timing risks
✅ risk.schedule.deadline  // Deadline risks
✅ risk.resource.headcount // Staffing risks
✅ risk.resource.skill_gap // Skill gap risks
✅ risk.budget.overrun     // Budget overrun risks
✅ risk.external.regulatory // Regulatory risks
✅ risk.quality.defects    // Quality/defect risks
```

#### Requirement Templates (6 total: 1 abstract + 5 concrete)

```typescript
// Abstract Base
✅ requirement.base           // Abstract base (not instantiable)

// Concrete Templates
✅ requirement.functional     // Functional requirements
✅ requirement.non_functional // Non-functional (performance, security)
✅ requirement.constraint     // Project constraints
✅ requirement.assumption     // Working assumptions
✅ requirement.dependency     // External dependencies
```

#### Event Templates (Family-Based Taxonomy - December 2025 Update)

```typescript
// Format: event.{family}[.{variant}]
// Families: work, collab, marker

// Abstract Bases
✅ event.base             // Root abstract (not instantiable)
✅ event.work.base        // Work session family base
✅ event.collab.base      // Collaboration family base
✅ event.marker.base      // Marker family base

// Concrete Templates
✅ event.work.focus_block // Deep work focus blocks
✅ event.work.time_block  // Generic work blocks
✅ event.collab.meeting.standup // Daily standups
✅ event.collab.meeting.one_on_one // 1:1 meetings
✅ event.marker.deadline  // Deadline markers
✅ event.marker.reminder  // Reminder pings
```

#### Project Templates (13 from previous migration)

```typescript
✅ writer.book, writer.article, writer.screenplay
✅ coach.client, coach.program
✅ developer.app, developer.api
✅ marketer.campaign
✅ founder.startup
✅ personal.routine, personal.goal
✅ student.course
✅ consultant.engagement
```

---

### 3. Backend Services (100% Complete)

**Service Files:**

#### Template Services (944 lines)

```typescript
✅ TemplateValidationService (501 lines)
   - Validate basic fields (name, type_key, scope, status)
   - Check type_key uniqueness
   - Validate parent relationships (no circular refs)
   - Validate FSM structure (states, transitions, reachability)
   - Validate JSON Schema structure
   - Validate facet defaults against taxonomy
   - Check deletion safety

✅ TemplateCrudService (444 lines)
   - Create template with defaults
   - Update template (partial updates)
   - Clone template (with new type_key)
   - Promote template (draft → active)
   - Deprecate template (active → deprecated)
   - Delete template (only if not in use)
   - Default FSM: draft → active → complete
   - Default Schema: title, description

✅ TemplateResolverService
   - Resolve inheritance chain
   - Merge FSM from parent
   - Merge schema from parent
   - Query template catalog
```

#### Entity Services

```typescript
✅ InstantiationService
   - Create project from ProjectSpec
   - Create all entities (tasks, plans, goals, etc.)
   - Validate facets against taxonomy
   - Create graph edges
```

---

### 4. API Endpoints (100% Complete)

**20+ Endpoints Total:**

#### Template Management (Admin Only)

```http
✅ POST   /api/onto/templates              // Create template
✅ GET    /api/onto/templates              // List/filter templates
✅ PUT    /api/onto/templates/[id]         // Update template
✅ DELETE /api/onto/templates/[id]         // Delete template
✅ POST   /api/onto/templates/[id]/clone   // Clone template
✅ POST   /api/onto/templates/[id]/promote // Promote to active
✅ POST   /api/onto/templates/[id]/deprecate // Deprecate template
```

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

#### FSM Operations

```http
✅ POST   /api/onto/fsm/transition  // Execute state transition
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
✅ TaskCreateModal.svelte // Two-step with 7 task template types ✅ PlanCreateModal.svelte // Date
ranges, 3 plan template types ✅ GoalCreateModal.svelte // Success criteria, 4 goal types ✅
OutputCreateModal.svelte // Document creation
```

**Edit Modals:** ✅ **COMPLETE (Nov 4, 2025)**

```svelte
✅ TaskEditModal.svelte // Full editing with delete & FSM viz ✅ PlanEditModal.svelte // Edit dates,
description, state ✅ GoalEditModal.svelte // Edit priority, target date, criteria
```

**Modal Features:**

- ✅ Two-tier selection (template type → details)
- ✅ Template categorization for grouping
- ✅ FSM state visualization
- ✅ Form validation
- ✅ Dark mode support
- ✅ Responsive design
- ✅ Uses base `FormModal` component

#### Template Display Components (100% ✅)

```svelte
✅ TemplateCard.svelte // Template display with categories ✅ TemplateDetailModal.svelte // Template
details view ✅ FSMStateVisualizer.svelte // State diagram visualization ✅ DocumentEditor.svelte //
Rich text editing
```

#### Template Management Components (95% 🚧)

```svelte
✅ FsmEditor.svelte // 100% - Visual graph with validation ✅ COMPLETE ✅ SchemaBuilder.svelte //
100% - All constraints implemented ✅ COMPLETE 🚧 TemplateForm.svelte // Basic structure ready 🚧
MetadataEditor.svelte // Functional, needs UX polish 🚧 FacetDefaultsEditor.svelte // Working, needs
polish
```

**SchemaBuilder.svelte ✅ COMPLETE (Nov 4, 2025):**

- ✅ Min/max constraints for numbers
- ✅ Pattern validation for strings
- ✅ Enum value editor with visual chips
- ✅ Help text and examples
- ✅ Keyboard shortcuts (Enter to add enum values)

**FsmEditor.svelte ✅ COMPLETE (Nov 4, 2025):**

- ✅ Cytoscape.js visual graph with dagre layout
- ✅ Interactive click-to-edit states and transitions
- ✅ Guard conditions with help text
- ✅ Actions array editor with green chips
- ✅ Real-time FSM validation
- ✅ Validation warnings in header with badge
- ✅ Unreachable state detection
- ✅ Color-coding: green (initial), blue (normal), red (final)
- ✅ Zoom/pan controls and fit-to-view

---

### 6. Pages & Routes (100% Complete)

```typescript
✅ /ontology                      // Project list dashboard
✅ /ontology/create               // Create project from template
✅ /ontology/projects/[id]        // Project detail with all entities
✅ /ontology/projects/[id]/outputs/[outputId]/edit  // Edit output
✅ /ontology/templates            // Browse templates (fully functional)
✅ /ontology/templates/new        // Create template wizard (scaffold)
✅ /ontology/templates/[id]/edit  // Edit existing template ✅ NEW (Nov 4, 2025)
```

**Page Features:**

- ✅ Responsive layouts
- ✅ Dark mode support
- ✅ Empty states with CTAs
- ✅ Entity grouping by type
- ✅ Interactive entity lists
- ✅ Real-time updates

---

## ⚠️ What's Not Complete

### 1. Critical Gaps (High Priority)

#### ~~Missing Pages~~ ✅ **RESOLVED** (Nov 4, 2025)

```typescript
✅ /ontology/templates/[id]/edit  // Edit existing template - NOW COMPLETE
```

**Status:** ✅ **COMPLETE** - Full 5-step wizard for editing templates
**Features:**

- Pre-populates all existing template data
- Prevents circular parent references
- Admin authentication required
- Uses PUT endpoint for updates

#### ~~Visual Editors Need Polish~~ ✅ **MOSTLY RESOLVED** (Nov 4, 2025)

```svelte
✅ FsmEditor.svelte ✅ **COMPLETE** (Nov 4, 2025) - ✅ Visual graph with Cytoscape.js (interactive,
zoomable) - ✅ Guards and actions support - ✅ Real-time validation with warnings - ✅ Click-to-edit
states and transitions ✅ SchemaBuilder.svelte ✅ **COMPLETE** (Nov 4, 2025) - ✅ All constraints
implemented (min/max, pattern, enum) - ✅ Visual enum editor with chips - ✅ Help text and examples
🚧 TemplateForm.svelte (Minor polish remaining) - Current: Basic structure exists - Missing: Wizard
flow polish, step validation - Effort: 1-2 days (low priority)
```

---

### 2. Technical Debt (Medium Priority)

#### Testing

```bash
🚧 Service layer tests created (59 tests, 79.7% passing)
   ✅ template-validation.service.test.ts (32 tests, 31 passing)
   ✅ template-crud.service.test.ts (27 tests, 16 passing)
   ✅ template-resolver.service.test.ts (existing, passing)
   ✅ instantiation.service.test.ts (existing, passing)
   🔧 Mock implementation needs refinement for remaining 12 tests
❌ No API endpoint tests yet (planned for Week 2)
❌ No E2E tests for ontology
❌ No integration tests for API layer
```

**Progress:** Started November 4, 2025 - Service layer tests 80% done
**Remaining Effort:** 3-5 days (fix mocks, add API tests, integration tests)

#### Performance

```typescript
❌ No caching strategy implemented
❌ Not optimized for large datasets (>1000 entities)
❌ No pagination on list endpoints
❌ No query optimization
```

**Estimated Effort:** 3-5 days

#### Documentation

```typescript
🚧 API documentation complete but needs OpenAPI spec
🚧 Component storybook stories missing
🚧 Developer onboarding guide incomplete
```

**Estimated Effort:** 2-3 days

---

### 3. UX Improvements (Lower Priority)

```typescript
❌ No bulk operations support (delete, update multiple)
❌ Missing keyboard shortcuts for power users
❌ No undo/redo functionality
❌ No drag-and-drop reordering
❌ No task dependencies visualization
❌ No timeline/gantt view for projects
❌ No template marketplace/sharing
❌ No template analytics (usage tracking)
```

---

## 📊 Detailed Metrics

### Code Volume

| Component        | Lines of Code | Status  |
| ---------------- | ------------- | ------- |
| Database Schema  | ~2,783        | ✅ 100% |
| API Endpoints    | ~1,500        | ✅ 100% |
| Backend Services | ~944          | ✅ 100% |
| UI Components    | ~3,000        | 🚧 90%  |
| Template Editors | ~50,000 bytes | 🚧 70%  |

### Template Inventory

> **Full Reference**: See [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) and [ONTOLOGY_NAMESPACES_CORE.md](./ONTOLOGY_NAMESPACES_CORE.md) for complete template listings.

| Scope        | Count                                 | Status                        |
| ------------ | ------------------------------------- | ----------------------------- |
| Projects     | 13+ (domain.deliverable pattern)      | ✅ Complete                   |
| Tasks        | 12 (8 work modes + 4 specializations) | ✅ Complete (Dec 2025 Update) |
| Plans        | 18 (7 family bases + 11 variants)     | ✅ Complete (Dec 2025 Update) |
| Goals        | 13 (5 family bases + 8 variants)      | ✅ Complete (Dec 2025 Update) |
| Outputs      | 17 (5 family bases + 12 variants)     | ✅ Complete (Dec 2025 Update) |
| Documents    | 17 (7 family bases + 10 variants)     | ✅ Complete (Dec 2025 Update) |
| Risks        | 18 (8 family bases + 10 variants)     | ✅ Complete (Dec 2025 Update) |
| Events       | 12 (4 family bases + 8 variants)      | ✅ NEW (Dec 2025)             |
| Requirements | 6 (1 abstract + 5 concrete)           | ✅ Complete                   |
| **Total**    | **120+**                              | ✅ Complete                   |

### Implementation Progress by Phase

| Phase    | Description            | Progress |
| -------- | ---------------------- | -------- |
| Phase 1  | Database & Core        | ✅ 100%  |
| Phase 2A | API Foundation         | ✅ 100%  |
| Phase 2B | Templates & UI         | ✅ 100%  |
| Phase 3  | Visual Editors         | 🚧 70%   |
| Phase 4  | Testing & Optimization | 🚧 30%   |
| Phase 5  | Advanced Features      | ⏳ 0%    |

---

## 🚀 Next Steps (Prioritized)

### Immediate (This Week)

1. **Add Edit Template UI** (1-2 days)
    - Create `/ontology/templates/[id]/edit` page
    - Reuse existing TemplateForm component
    - Wire up PUT endpoint

2. **Complete FSM Editor Visual Polish** (2-3 days)
    - Add visual graph layout
    - Implement drag-and-drop for states
    - Add transition visualization

3. **Fix Schema Builder Constraints** (1-2 days)
    - Add min/max value constraints
    - Add pattern validation
    - Add enum value support

### Short Term (Next 2 Weeks)

4. **Add Template Versioning** (3-4 days)
    - Version tracking in database
    - Version diff visualization
    - Rollback capability

5. **Implement PlanEditModal & GoalEditModal** (2-3 days)
    - Follow TaskEditModal pattern
    - Add FSM visualization
    - Add delete functionality

6. **Write Unit Tests** (5-7 days)
    - Service layer tests (TemplateValidation, TemplateCrud)
    - API endpoint tests
    - Component tests (modals, forms)

### Medium Term (Next Month)

7. **E2E Test Suite** (5-7 days)
    - Complete user flows
    - Template creation flow
    - Entity CRUD flow

8. **Performance Optimization** (3-5 days)
    - Add caching layer
    - Optimize queries
    - Add pagination

9. **Visual FSM Graph Editor** (5-7 days)
    - Full graph visualization
    - Interactive state machine builder
    - Transition guards editor

---

## 🎯 Success Criteria Met

### Phase 1 ✅

- [x] Database schema designed and migrated
- [x] RLS policies implemented
- [x] Audit trails on all tables
- [x] Facet system (3 facets) implemented

### Phase 2A ✅

- [x] All CRUD endpoints working
- [x] Validation prevents invalid templates
- [x] Admin authentication required
- [x] No security vulnerabilities
- [x] Comprehensive validation (FSM, Schema, Facets)
- [x] Business logic for clone, promote, deprecate
- [x] Error responses include validation details

### Phase 2B ✅

- [x] Complete task template hierarchy (8 templates)
- [x] Complete goal template hierarchy (5 templates)
- [x] Plan templates expanded (3 templates)
- [x] UI components integrated with templates
- [x] FSM states synchronized
- [x] Template categorization for UI

---

## 💡 Key Architectural Decisions

### 1. Template Inheritance

- **Decision:** Use database-level parent_template_id for inheritance
- **Rationale:** Simpler than application-level merging, database-enforced constraints
- **Trade-off:** Cannot override parent properties easily (must use clone)

### 2. No Dependencies Array in Tasks

- **Decision:** Use edges table for task dependencies instead of dependencies array
- **Rationale:** More flexible, supports any relationship type, prevents circular refs
- **Implementation:** task -[depends_on]-> task edge

### 3. Admin Client for Templates

- **Decision:** Template management uses admin Supabase client (bypasses RLS)
- **Rationale:** Templates are system-wide, not user-specific
- **Security:** Admin-only endpoints, authentication check

### 4. FSM in Template vs Database

- **Decision:** FSM definition stored in template, current state stored in entity
- **Rationale:** FSM is template metadata, state is instance data
- **Benefit:** Can change FSM without migrating entity data

### 5. 3 Facets Instead of 5

- **Decision:** Only context, scale, stage (not realm, output_type)
- **Rationale:** Realm and output_type are template metadata, not instance facets
- **Benefit:** Simpler data model, fewer fields to manage

---

## 📞 Related Documentation

- **[Implementation Roadmap](./ontology-implementation-roadmap.md)** - Detailed plan
- **[Phase 2A Status](./PHASE_2A_STATUS.md)** - API foundation completion
- **[Data Models](./DATA_MODELS.md)** - Complete schema documentation
- **[API Endpoints](./API_ENDPOINTS.md)** - Complete API reference
- **[Migration File](../../supabase/migrations/20250605000001_add_missing_base_templates.sql)** - Template creation SQL

---

**Last Updated:** December 1, 2025
**Status:** Phase 2B Complete ✅ - Ready for Phase 3
**Overall Completion:** 85-90%
