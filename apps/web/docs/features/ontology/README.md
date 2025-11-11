<!-- apps/web/docs/features/ontology/README.md -->

# Ontology System Documentation

**Last Updated**: November 8, 2025
**Status**: Phase 3 Complete ✅ (Visual Editors + Validation)
**Location**: `/apps/web/docs/features/ontology/`

## 📍 Quick Navigation

### 🎯 Start Here

- **[Current Status](./CURRENT_STATUS.md)** ⭐ - Comprehensive status report (95% complete)
- **[Action Plan](./ACTION_PLAN.md)** ⭐ - Prioritized next steps with timeline

### Essential Documentation

- **[Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md)** ✨ **NEW** - Naming conventions and entity autonomy framework
- **[Implementation Roadmap](./ontology-implementation-roadmap.md)** - Detailed implementation plan and progress tracking
- **[Data Models](./DATA_MODELS.md)** - Complete database schema (25 tables, 2783 lines)
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Recent CRUD implementation details
- **[Recurring Series](./RECURRING_SERIES.md)** ✨ - Timezone-aware recurring task architecture & API usage
- **[Phase 2A Status](./PHASE_2A_STATUS.md)** - Template API foundation (Complete)
- **[API Endpoint Reference](./API_ENDPOINTS.md)** - Complete API documentation
- **[Template Taxonomy](./TEMPLATE_TAXONOMY.md)** - Deliverables and outputs catalog

### Agent Chat Integration

- **[Intelligent Project Creation](./INTELLIGENT_PROJECT_CREATION.md)** ✨ **NEW** - Smart project creation with template selection and inference (Complete)
- **[CRUD Tools Implementation](./CRUD_TOOLS_IMPLEMENTATION.md)** ✨ - CREATE/UPDATE/DELETE tools for AI agent (Complete)
- **[Ontology First Refactoring](./ONTOLOGY_FIRST_REFACTORING.md)** - Tool separation and context-aware selection
- **[Agent Chat Integration Status](./AGENT_CHAT_ONTOLOGY_INTEGRATION_STATUS.md)** - Complete integration status
- **[Dynamic Template Creation Contract](./DYNAMIC_TEMPLATE_CREATION_CONTRACT.md)** ✨ **NEW** - Planner ↔ template workflow handoff spec

### Development Resources

- **Components**: `/src/lib/components/ontology/` - UI components
- **Services**: `/src/lib/services/ontology/` - Business logic
- **API Routes**: `/src/routes/api/onto/` - REST endpoints
- **Pages**: `/src/routes/ontology/` - User interfaces
- **Database**: `/packages/shared-types/src/database.schema.ts` - Schema types

---

## 🎯 What is the Ontology System?

The BuildOS Ontology System is a **flexible, template-driven framework** for managing projects and their entities using:

- **Typed Templates** with hierarchical inheritance
- **Finite State Machines (FSM)** for workflow automation
- **3-Dimensional Facet System** for classification
- **Graph Relationships** between entities

### Core Innovation

The system uses a **type_key** convention (e.g., `writer.book`, `coach.client`) that carries semantic meaning, combined with only 3 orthogonal facets that vary per instance:

- **Context**: who it's for (personal, client, commercial)
- **Scale**: size/duration (micro to epic)
- **Stage**: lifecycle phase (discovery to complete)

### 📄 Project Context Documents

Every ontology project now carries an explicit context document with type key `document.project.context`:

- Generated automatically during instantiation or migration.
- Stores the canonical Markdown narrative from the legacy `projects.context` column (plus extracted core values).
- Linked via `onto_projects.context_document_id`, so UI pipelines and agents can reliably fetch the story without mining `props`. The FK column is now the source of truth; `props.context_document_id` only remains for back-compat.
- Document `props` capture the raw Markdown (`body_markdown`), `legacy_project_id`, migration metadata, and the nine core dimension summaries.
- Dry-run migrations surface the exact context payload inside the preview modal so reviewers can inspect what will be written without touching the DB.

### 🧱 Task + Calendar Migration Preview

- `/admin/migration` now exposes a **Migrate Tasks** action per project. It calls the `TaskMigrationService` in dry-run mode, renders the proposed ontology tasks (state, type, phase/plan mapping, calendar counts), and lets admins approve before writing anything.
- Confirming writes uses the new `/api/admin/migration/tasks/run` endpoint, which reuses the same services but only touches tasks + calendars for the selected project.
- `task_calendar_events` are cloned into `onto_events` during task migration, and each event now emits a `task → event` edge (`rel: has_event`) so planners/agents can traverse work sessions from the ontology graph.

### 🧠 Template Inference + Project Mapping

- Legacy project migrations now run a multi-step LLM workflow to classify the correct `project` template:
    1. Choose the best realm from the existing catalog (or propose a new realm) using aggregated template metadata.
    2. Call the existing Template Analyzer service to pick domain/deliverable/variant combinations with confidence + rationale.
    3. If no concrete template exists, automatically materialize a new one (JSON schema, FSM, facet defaults) that inherits from the suggested parent.
- Once the template is locked, a second LLM pass maps the legacy context into the template schema, producing structured `onto_projects.props` that match the template’s JSON schema and suggested facets.
- Dry runs surface the full classification + creation plan (realm, domain/deliverable, parent template) without mutating Supabase so humans can review before committing the new template/project.

> **Why?** Treating the context as a first-class document keeps the project narrative queryable, diffable, and renderable across surfaces (agent chat, planner, UI) while legacy migrations remain lossless.

---

## 🆕 Dynamic Template Creation Escalation Plan

When the project-create agent (`context_type: project_create`) cannot locate a suitable template, it should escalate instead of stalling. This plan defines the inter-agent contract.

### 1. Detection & Request Packaging

- Planner reviews the embedded template catalog (and makes at most one `list_onto_templates` call).
- If no template satisfies the brief, emit a `template_creation_request` event that contains:
    - The raw braindump / user prompt.
    - Any structured signals inferred so far (facets, deliverables, must-have fields).
    - Recommended realm + rationale (even if low confidence).
    - Suggested schema notes or example tasks pulled from the conversation.
- Log why each existing template failed (missing realm, schema mismatch, etc.) for debugging.

### 2. Clarification Guardrail

- If the braindump is too vague to suggest even a realm, the planner asks exactly one clarifying question that narrows template scope (audience, deliverable, cadence, etc.).
- After clarification, retry detection. Only escalate once it can provide a realm suggestion and at least one differentiating attribute.
- If still ambiguous, surface a human fallback notice rather than forcing template creation.

### 3. Template Creation Workflow

- Dedicated template-creation agent/service receives `{braindump, suggested realm, schema hints, conversation summary}`.
- Responsibilities:
    - Validate/derive realm + parent template (inheritance chain).
    - Produce a concrete template draft with:
        - `type_key`, metadata, description, tags.
        - JSON schema (fields, types, defaults, required flags).
        - FSM definition (states + transitions) compliant with BuildOS conventions.
        - Facet defaults (`context`, `scale`, `stage`) and recommended starter entities.
    - Persist via template CRUD services (respecting validation + promotion workflow).
    - Return full template payload + summary back to requester.

### 4. Returning to Project Creation

- Planner waits for `template_created` signal that includes the new `type_key`, realm, schema summary, starter entities, and any validation warnings.
- Planner resumes the original project flow by:
    1. Treating the returned template as the selected option.
    2. Re-running inference over the braindump to fill project fields.
    3. Calling `create_onto_project` with the new template and recommended tasks/goals/outputs.
- After success, notify the user that both a template and project were created, and emit analytics events for traceability.

### 5. Observability & Safeguards

- Record every escalation with timestamps, user/session IDs, and reason codes.
- Track metrics: % escalations, average clarification rounds, template creation failure rate.
- Add circuit breakers: repeated template-creation failures should route to a human queue instead of retry loops.
- Cache freshly created templates in the planner context so follow-up messages can immediately reuse them.

> **Next steps:** define SSE contracts (`template_creation_request`, `template_created`), extend the agent orchestrator to buffer braindumps for hand-off, and add a template-creation service endpoint that enforces schema/FSM defaults.

---

## ✅ Implementation Status

### Phase 1: Database & Core (✅ Complete)

**What's Built:**

- 25 database tables with complete schema
- 15 core entity tables (projects, tasks, plans, etc.)
- 10 supporting tables (edges, actors, permissions)
- RLS security, audit trails, generated columns
- 25+ seeded templates across 9 domains
- Template resolver with inheritance
- FSM engine with guards and actions

### Phase 2A: API Foundation (✅ Complete)

**Backend Services:**

- `TemplateValidationService` (501 lines) - Comprehensive validation
- `TemplateCrudService` (444 lines) - CRUD operations
- `TemplateResolverService` - Template inheritance
- `InstantiationService` - Project creation from specs

**API Endpoints (20+):**

```typescript
// Template Management
POST / api / onto / templates; // Create template
GET / api / onto / templates; // List/filter templates
PUT / api / onto / templates / [id]; // Update template
DELETE / api / onto / templates / [id]; // Delete template
POST / api / onto / templates / [id] / clone; // Clone template
POST / api / onto / templates / [id] / promote; // Promote draft → active
POST / api / onto / templates / [id] / deprecate; // Deprecate template

// Entity CRUD
POST / api / onto / tasks / create; // Create task
GET / api / onto / tasks / [id]; // Get task
PATCH / api / onto / tasks / [id]; // Update task
DELETE / api / onto / tasks / [id]; // Delete task
POST / api / onto / plans / create; // Create plan
POST / api / onto / goals / create; // Create goal

// Projects
GET / api / onto / projects; // List projects
GET / api / onto / projects / [id]; // Get project details
POST / api / onto / projects / instantiate; // Create from spec

// FSM
POST / api / onto / fsm / transition; // Execute state transition
```

### Phase 2B: UI Components & Templates (✅ Complete)

**Fully Implemented Components:**

- `TaskCreateModal` - Two-step creation with 7 task templates
- `TaskEditModal` - Full editing with delete
- `PlanCreateModal` - Date ranges and 3 plan templates
- `GoalCreateModal` - Success criteria and 4 goal templates
- `OutputCreateModal` - Document creation
- `TemplateCard` - Template display with categories
- `TemplateDetailModal` - Template details
- `FSMStateVisualizer` - State diagram
- `DocumentEditor` - Rich text editing

**Template System (✅ Complete):**

- ✅ **8 Task Templates** (1 abstract + 7 concrete with categories)
- ✅ **5 Goal Templates** (1 abstract + 4 concrete with measurement types)
- ✅ **3 Plan Templates** (content calendar, client onboarding, product roadmap)
- ✅ Template categorization for UI grouping
- ✅ FSM states synchronized with UI
- ✅ Inheritance resolution working correctly
- ✅ Metadata migration for enhanced categorization

**Advanced Editors (Planned for Phase 3):**

- `FSMEditor.svelte` - Visual graph editor
- `SchemaBuilder.svelte` - Advanced constraints
- `TemplateForm.svelte` - Template creation UI
- `MetadataEditor.svelte` - Enhanced metadata editing
- `FacetDefaultsEditor.svelte` - Facet management

### Phase 2C-2E: Future Work (📋 Planned)

- Visual FSM editor with graph layout
- Advanced schema constraints
- Template versioning UI
- Edit template pages
- Integration testing
- Performance optimization

### Recurring Task Series (✨ New – Nov 2025)

- Any ontology task can now be marked recurring post-creation via the Task Edit modal.
- Series metadata lives entirely in `onto_tasks.props` (`series_id`, `series` object, and per-instance `recurrence` block) so no schema migrations were required.
- **API Endpoints**
    - `POST /api/onto/tasks/[id]/series` — validate RRULE + timezone, mark the task as series master, and generate instances transactionally through `task_series_enable`.
    - `DELETE /api/onto/task-series/[seriesId]` — remove the master + pending instances (or force delete all) via the `task_series_delete` RPC.
- **Timezone-aware scheduling** powered by `rrule` + `date-fns-tz`; UI collects timezone + start datetime and previews the generated RRULE string.
- **UI** highlights when a task is a series master/instance, surfaces the RRULE/instance count, and exposes series deletion controls.

---

## 🗂️ Database Architecture

### Core Entity Tables (15)

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
onto_sources        -- External references
onto_signals        -- External signals
onto_insights       -- Derived insights
```

### Supporting Tables (10)

```sql
onto_templates           -- Template definitions
onto_edges              -- Graph relationships
onto_actors             -- Users and AI agents
onto_assignments        -- Role assignments
onto_permissions        -- Access control
onto_facet_definitions  -- Facet taxonomy (3 facets)
onto_facet_values       -- Allowed facet values
onto_document_versions  -- Document history
onto_output_versions    -- Output versions
onto_tools              -- Available tools
```

---

## 🏗️ Key Architectural Patterns

### 1. Template Inheritance

```typescript
// Templates can inherit from parents
writer.book → writer.base → project.base

// Child inherits FSM, schema, facet defaults
// Can override or extend parent properties
```

### 2. Type Key Convention

```typescript
// Format: {domain}.{deliverable}.{variant}
'writer.book'; // Writer creating a book
'coach.client.executive'; // Coach working with executive client
'developer.app.mobile'; // Developer building mobile app

// Use underscores for multi-word
'personal.morning_routine';
```

**📚 See [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md) for complete naming conventions and entity autonomy framework**

### 3. Facet System

```typescript
// Only 3 facets that vary per instance
{
  context: "client",    // Who it's for
  scale: "large",       // Size/duration
  stage: "execution"    // Lifecycle phase
}

// Stored as generated columns for fast filtering
```

### 4. FSM Architecture

```typescript
{
  states: ["draft", "writing", "editing", "published"],
  initial: "draft",
  transitions: [{
    from: "draft",
    to: "writing",
    event: "start_writing",
    guards: ["has_outline"],
    actions: ["notify_editor", "create_chapters"]
  }]
}
```

### 5. Security Model

```typescript
// User-facing APIs use RLS
const supabase = locals.supabase;

// Admin APIs bypass RLS
const adminSupabase = createAdminSupabaseClient();

// Actor-based authorization
const actor = await ensureActorForUser(userId);
```

---

## 🚀 Quick Start Guide

### 1. Browse Templates

```bash
# Visit templates page
http://localhost:5173/ontology/templates

# Filter by scope, realm, facets
# View template details
# Clone existing templates
```

### 2. Create a Project

```typescript
// Using the API
POST /api/onto/projects/instantiate
{
  project: {
    name: "My Book",
    type_key: "writer.book",
    props: {
      facets: {
        context: "personal",
        scale: "large",
        stage: "planning"
      }
    }
  },
  tasks: [
    { title: "Write outline" },
    { title: "Research topics" }
  ]
}
```

### 3. Manage Entities

```svelte
<!-- In your Svelte component -->
<script>
	import TaskCreateModal from '$lib/components/ontology/TaskCreateModal.svelte';

	let showModal = true;
</script>

<TaskCreateModal
	projectId={project.id}
	{plans}
	onClose={() => (showModal = false)}
	onCreated={handleTaskCreated}
/>
```

---

## 📊 Current Metrics

### Implementation Progress

- **Database**: 100% ✅
- **Backend Services**: 100% ✅
- **API Endpoints**: 100% ✅
- **Template System**: 100% ✅ **NEW**
- **UI Components**: 90% ✅
- **Visual Editors**: 50% 🚧
- **Testing**: 30% 🚧
- **Documentation**: 95% ✅

### Code Statistics

- **25 database tables** (~2,783 lines SQL)
- **20+ API endpoints** (~1,500 lines)
- **18 UI components** (~3,000 lines)
- **944 lines of services** (validation + CRUD)

### Template Inventory

- **13 project templates** (writer, coach, developer, etc.)
- **8 task templates** ✅ NEW - (task.base, quick, deep_work, recurring, milestone, meeting_prep, research, review)
- **5 goal templates** ✅ NEW - (goal.base, outcome, learning, behavior, metric)
- **3 plan templates** ✅ EXPANDED - (content_calendar, client_onboarding, product_roadmap)
- **10+ output templates** (chapters, reports, etc.)

---

## ⚠️ Known Issues & Gaps

### Critical Gaps ✅ **ALL RESOLVED** (Nov 4, 2025)

1. ~~**No base templates for tasks/goals**~~ - ✅ **RESOLVED** - Complete template hierarchy implemented
2. ~~**No edit template UI**~~ - ✅ **RESOLVED** (Nov 4, 2025) - Full 5-step edit wizard implemented
3. ~~**FSM editor needs visual graph**~~ - ✅ **RESOLVED** (Nov 4, 2025) - Cytoscape.js visual graph with validation
4. ~~**Schema builder missing constraints**~~ - ✅ **RESOLVED** (Nov 4, 2025) - All constraints (min/max, pattern, enum) implemented

### Technical Debt

- Unit test coverage < 30%
- No E2E tests for ontology
- Performance not optimized for large datasets
- No caching strategy implemented

### UX Issues

- Template creation wizard needs polish
- No bulk operations support
- Missing keyboard shortcuts
- No undo/redo functionality

---

## 📚 Related Documentation

### Ontology Architecture

- [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md) - Entity naming conventions and autonomy framework
- [BuildOS Master Plan](./buildos-ontology-master-plan.md) - Complete vision
- [Template Taxonomy](./TEMPLATE_TAXONOMY.md) - Deliverables and outputs catalog

### System Architecture

- [Web-Worker Architecture](/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)
- [Database Schema](/apps/web/docs/technical/database/schema.md)

### Development Guides

- [BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)
- [API Patterns](/apps/web/docs/technical/api/PATTERNS.md)
- [Modal System](/apps/web/docs/technical/components/modals/README.md)

### Research & Planning

- [CRUD Patterns Research](/thoughts/shared/research/2025-11-04_CRUD_patterns_research.md)
- [Template Gap Analysis](/thoughts/shared/research/2025-11-04_ontology-template-gaps-analysis.md)

---

## 🛠️ Development Tasks

### Immediate (This Week)

- [ ] Complete FSMEditor visual polish
- [ ] Add edit template UI (`/ontology/templates/[id]/edit`)
- [x] ~~Create task.base and goal.base templates~~ ✅ **DONE**
- [ ] Fix schema builder constraints

### Short Term (Next 2 Weeks)

- [ ] Add template versioning
- [x] ~~Implement PlanEditModal~~ ✅ **DONE** (Nov 4, 2025)
- [x] ~~Implement GoalEditModal~~ ✅ **DONE** (Nov 4, 2025)
- [ ] Add bulk operations
- [ ] Write unit tests

### Medium Term (Next Month)

- [ ] Visual FSM graph editor
- [ ] Advanced schema constraints
- [ ] Performance optimization
- [ ] E2E test suite
- [ ] Template marketplace UI

---

## 💡 Key Decisions & Rationale

### Why 3 Facets?

Originally 5 facets were planned, but analysis showed only 3 truly vary per instance:

- **Context, Scale, Stage** are orthogonal and instance-specific
- **Realm, Output Type** are template metadata for discovery

### Why Admin Client for Templates?

Template management is system-wide administration:

- Templates apply to all users
- Need to bypass RLS
- Admin-only operation

### Why Separate Validation Service?

- Reusable client and server-side
- Easier to test independently
- Clear separation of concerns

### Why Multiple Status Endpoints?

Instead of generic PATCH:

- Self-documenting intent
- Different validation rules
- Harder to make mistakes

---

## 📞 Support & Contact

For questions or issues:

- Check [Implementation Roadmap](./ontology-implementation-roadmap.md)
- Review [Phase 2 Plan](./PHASE_2_IMPLEMENTATION_PLAN.md)
- See [CRUD Implementation](./IMPLEMENTATION_SUMMARY.md)

---

**Status Summary**: The ontology system is **85-90% feature-complete** with full database, complete template system, comprehensive APIs, and polished UI. Visual editors for advanced template creation remain for full production readiness.

**Recent Milestone**: ✅ Complete task, goal, and plan template hierarchy with UI integration (November 4, 2025)
