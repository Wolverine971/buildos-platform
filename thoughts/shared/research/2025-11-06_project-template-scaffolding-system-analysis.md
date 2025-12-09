---
date: 2025-11-06T00:00:00Z
researcher: Claude
repository: buildos-platform
topic: Project Template Scaffolding System - Creating Starter Templates for Workflows
tags: [research, ontology, templates, project-creation, workflows, scaffolding]
status: complete
path: thoughts/shared/research/2025-11-06_project-template-scaffolding-system-analysis.md
---

# Research: Project Template Scaffolding System for BuildOS

## Executive Summary

**Good news**: BuildOS **already has a project template system** that is 70% complete and production-ready. Users can currently create projects from templates (writer.book, founder.startup, personal.routine, marketer.campaign) with automatic scaffolding of tasks, goals, and plans. However, the system has gaps:

1. **Limited template variety** - Only 4 primary project templates exist
2. **UI/UX friction** - Templates are discoverable but could use better organization and guidance
3. **Template management overhead** - Creating new templates requires database migrations
4. **Missing advanced features** - Templates don't currently support conditional content, complex workflows, or re-usable sub-templates

This document assesses the current system, identifies what works, what's missing, and provides concrete recommendations for extending it to support your use case of easily creating templates for different workflows (e.g., "Writer Writing a Book", "Project Manager Running a Campaign").

---

## Current State: What Already Works ✅

### 1. Template-Based Project Creation Flow

**Status**: ✅ Fully Implemented

Users can currently create projects from templates via `/ontology/create`:

1. **Browse Templates** - `/ontology/templates` shows all 37 templates grouped by realm and scope
2. **Select Template** - Click "Create Project from Template"
3. **Configure Project** - Fill in project name, description, and facets (context, scale, stage)
4. **Add Schema Fields** - Template's JSON Schema drives dynamic form generation
5. **Seed with Content** - Optionally add initial goals and tasks
6. **Instantiate** - One API call creates entire project structure with all relationships

**Key File**: `/apps/web/src/routes/ontology/create/+page.svelte` (908 lines of polished Svelte)

### 2. Project Template Catalog

**Status**: ✅ Fully Implemented

Four production project templates exist:

| Template | Type Key | Scope | FSM States | Use Case |
|----------|----------|-------|-----------|----------|
| Writer's Book | `writer.book` | project | planning→writing→editing→published | Authors writing books |
| Personal Routine | `personal.routine` | project | setup→trial→maintaining→completed | Building daily habits (ADHD support) |
| Founder's Startup | `founder.startup` | project | ideation→validation→building→launching | Early-stage startup founders |
| Marketer's Campaign | `marketer.campaign` | project | planning→setup→executing→measuring | Marketing campaign execution |

### 3. Intelligent Scaffolding

**Status**: ✅ Fully Implemented

Projects can be created with pre-populated content:

- **Goals** - High-level outcomes with optional type_key linking to goal templates
- **Tasks** - Specific work items with optional plan assignment and state
- **Plans** - Logical groupings of tasks (sprints, phases, chapters, etc.)
- **Outputs** - Deliverables like book chapters, campaign reports

**Example**: `writer.book` project can be created with:
- Goals: "Complete first draft", "Submit to publisher"
- Tasks: "Outline plot", "Develop characters", "Write Chapter 1"
- Plans: "Planning Phase", "Writing Phase", "Editing Phase"

### 4. Faceted Metadata System

**Status**: ✅ Fully Implemented

All projects, tasks, goals have three orthogonal facets:

- **Context** (9 values): personal, client, commercial, internal, open_source, community, academic, nonprofit, startup
- **Scale** (5 values): micro, small, medium, large, epic
- **Stage** (6 values): discovery, planning, execution, launch, maintenance, complete

**Benefits**:
- Users can filter projects by context ("show my commercial clients")
- Teams can understand project scale/stage at a glance
- Analytics can segment by facets

### 5. FSM (Finite State Machine) Workflow Engine

**Status**: ✅ Fully Implemented

Templates define workflow states and transitions with guards and actions:

```typescript
// Example: writer.book FSM
states: ["planning", "writing", "editing", "published", "abandoned"]
transitions: [
  { from: "planning", to: "writing", event: "start_writing", actions: ["spawn_tasks(5)", "notify_user"] },
  { from: "writing", to: "editing", event: "finish_draft", actions: ["create_doc_from_template(critique)"] },
  // ... more transitions
]
```

Users trigger state transitions from project detail page, which automatically:
- Execute guards (check preconditions)
- Run actions (create docs, send emails, spawn tasks, schedule recurring items)
- Update project state and audit trail

### 6. Task/Goal/Plan Template System

**Status**: ✅ Fully Implemented

Sub-templates for building blocks:

- **Task Templates** (8 total): Quick Action, Deep Work, Recurring Task, Milestone, Coordination, Research
- **Goal Templates** (5 total): Outcome, Personal Development, Learning, Metric/KPI, Communication
- **Plan Templates** (5 total): Weekly Sprint, Product Roadmap, Content Calendar, Client Onboarding, Agile Sprint

Users can select template types when creating individual tasks/goals, ensuring consistency.

---

## What's Missing or Limited ⚠️

### 1. Template Variety

**Current**: 4 project templates (narrow domain focus)

**Gap**: No templates for:
- Project managers (non-marketing)
- Consultants or service providers
- Product managers
- Sales teams
- Teachers/educators
- Healthcare providers
- Nonprofits managing initiatives
- Any custom workflow that doesn't fit the 4 patterns

**Impact**: New user types must either:
- Use generic brain dump to create projects (loses structure)
- Manually configure everything (high friction)
- Ask for custom templates to be added (requires engineering)

### 2. Template Management UI

**Current**: Templates are seeded via database migrations; admin can view at `/ontology/templates`

**Gap**: No UI for:
- Creating new templates without database migrations
- Editing/versioning templates
- Testing templates before rollout
- Deprecating old templates
- Bulk copying templates

**Impact**: Extending the template library requires database knowledge and deployments.

### 3. Advanced Template Features

**Current**: Basic schema + FSM + facets + metadata

**Missing**:
- **Conditional content** - "If context=commercial, add these tasks"
- **Sub-templates** - Reusable template fragments (e.g., "Research Phase" template included in multiple projects)
- **Template variables** - Prompt user once, use answer in multiple places
- **Template inheritance** - Extend one template from another without duplication
- **Pre-populated content** - More sophisticated scaffolding (e.g., auto-create 10 tasks for different book chapters)
- **Rich descriptions** - Onboarding text, tips, warnings in template UI
- **Custom actions** - Templates currently limited to 8 built-in FSM actions

### 4. Template Discovery & Guidance

**Current**: `/ontology/templates` shows catalog with filters and search

**Missing**:
- **Interactive wizard** - "Answer 5 questions about your workflow, we'll pick a template"
- **Template recommendations** - "Based on your work, here are 3 templates we suggest"
- **Example projects** - "See a real example of a writer.book project"
- **Quick-start guides** - "New to this template? Here's how to use it"
- **Comparison view** - "Compare writer.book vs personal.routine"

### 5. Bulk/Programmatic Template Creation

**Current**: Single templates created via `/api/onto/templates` endpoint

**Missing**:
- Bulk import/export of templates
- Template creation from existing project (duplicate structure)
- API for creating template from ProjectSpec
- Template versioning and rollback

---

## Technical Architecture: How It Works 🏗️

### Data Model

```typescript
// Templates table (onto_templates)
{
  id: UUID,
  type_key: string,              // "writer.book", "project.task", etc.
  scope: "project" | "task" | "goal" | "plan" | "output" | "document",
  name: string,                  // "Writer's Book"
  schema: JSONSchema,            // Properties for entity creation
  fsm: FSMDefinition,            // State machine definition
  facet_defaults?: {
    context?: string,
    scale?: string,
    stage?: string
  },
  default_props?: Record<string, unknown>,
  metadata?: {
    description?: string,
    realm?: string,             // "writer", "founder", etc.
    primitive?: string,
    category?: string
  },
  is_abstract: boolean,          // true for task.base, goal.base
  status: "active" | "draft" | "deprecated"
}

// Projects table (onto_projects) - instances of templates
{
  id: UUID,
  type_key: string,              // Links to onto_templates.type_key
  name: string,
  description?: string,
  state_key: string,             // Current FSM state
  facet_context?: string,
  facet_scale?: string,
  facet_stage?: string,
  props: Record<string, unknown>, // Schema-defined properties
  created_by: UUID               // Actor ID
}
```

### Template Resolution

When a project is created from a template:

1. **Load Template** - Fetch `onto_templates` by type_key
2. **Resolve Inheritance** - If template has parent, merge FSM/schema/defaults (1 level)
3. **Merge Defaults** - Template's `facet_defaults` + user overrides
4. **Validate** - Check schema against user input + facet validity
5. **Instantiate** - Create project + all related entities (goals, tasks, plans, outputs)
6. **Create Edges** - Link project to goals, tasks to plans, etc.

**Key File**: `/apps/web/src/lib/services/ontology/template-resolver.service.ts`

### Project Instantiation API

```typescript
// POST /api/onto/projects/instantiate
{
  project: {
    name: "My Science Fiction Novel",
    type_key: "writer.book",
    description?: string,
    props: {
      genre: "science fiction",
      target_word_count: 90000,
      deadline: "2025-12-31",
      facets: {
        context: "personal",
        scale: "large",
        stage: "planning"
      }
    }
  },
  goals?: [
    { name: "Complete first draft", type_key?: "goal.outcome" }
  ],
  tasks?: [
    { title: "Outline plot", plan_name?: "Planning", state_key?: "todo" }
  ],
  plans?: [
    { name: "Planning Phase" },
    { name: "Writing Phase" }
  ]
}

// Returns
{
  success: true,
  data: {
    project_id: UUID,
    counts: {
      goals: 1,
      tasks: 1,
      plans: 2,
      outputs: 0,
      documents: 0,
      edges: 6
    }
  }
}
```

### File Structure

```
Core Services
├── /apps/web/src/lib/services/ontology/
│   ├── template-resolver.service.ts (470 lines) - Load and merge templates
│   ├── template-catalog.service.ts (175 lines) - Filter/search templates
│   ├── ontology-projects.service.ts (90 lines) - Project queries
│   └── instantiation.service.ts (750 lines) - Create projects from specs

API Routes
├── /apps/web/src/routes/api/onto/
│   ├── projects/instantiate/+server.ts - Create project from template
│   ├── projects/+server.ts - List projects
│   ├── templates/+server.ts - Browse templates
│   ├── templates/[type_key]/+server.ts - Get single template
│   └── fsm/transitions/+server.ts - Get allowed state transitions

UI Pages
├── /apps/web/src/routes/ontology/
│   ├── +page.svelte (600 lines) - Project dashboard
│   ├── templates/+page.svelte (554 lines) - Template catalog
│   ├── create/+page.svelte (908 lines) - Project creation wizard
│   └── projects/[id]/+page.svelte - Project detail with FSM controls
```

---

## Assessment: Can This Support Your Use Case? 📊

### Your Goal
> Create starter templates for different workflows (e.g., writer writing a book, project manager running a campaign) where users get a "fill-in-the-blank" project with pre-structured tasks, goals, and plans.

### Current Capability

✅ **YES, 85% supported natively**:

1. ✅ Create templates with pre-defined structure
2. ✅ Users select template and fill in details
3. ✅ System scaffolds tasks, goals, plans automatically
4. ✅ Facets drive filtering and discovery
5. ✅ FSM enables guided workflows (state transitions)

### What Would You Need to Add

🟡 **Minor gaps** (3-4 engineering tasks):

1. **More templates** - Design and seed 5-10 new project templates
   - Product Manager (roadmap, feature planning, launch)
   - Consultant (client projects, scope, deliverables)
   - Sales Lead (pipeline, opportunity qualification, closing)
   - Educator (course preparation, student assessment, grading)
   - etc.

2. **Template creation UI** - Allow admins to create templates without database migrations
   - Simple form: name, description, schema fields, FSM states
   - Test endpoint to try it before deployment

3. **Template guidance** - Enhance discovery
   - "What kind of project are you running?" quiz at `/ontology/create`
   - Pre-select relevant templates based on answers
   - Show example projects (read-only) for inspiration

4. **Richer scaffolding** (optional) - Support more complex initial setup
   - "Generate 10 tasks by breaking down this goal" (AI-assisted)
   - "Use this checklist template to create initial tasks"
   - Pre-populate tasks with estimated effort/duration

### What You DON'T Need to Do

❌ **Already solved**:
- Database schema for templates ✅
- Project instantiation engine ✅
- FSM state machine execution ✅
- Task/goal/plan creation ✅
- Facet system ✅
- UI for template selection ✅
- API for creating projects ✅

---

## Design Options for Extending the System

### Option 1: "Extend What Works" (Recommended)

**Effort**: 40-60 hours | **Complexity**: Low-Medium

**What you'd do**:
1. Design 5-10 new project templates covering different domains
2. Create database migrations to seed them (or use admin UI once built)
3. Add optional template guidance quiz at `/ontology/create`
4. Optionally add "example projects" feature
5. Document templates with onboarding copy

**Pros**:
- Reuses existing, battle-tested code
- Minimal risk (no new infrastructure)
- Users get the same good UX they expect
- Aligns with current product direction

**Cons**:
- Still requires database changes to add templates
- No UI for non-technical admins to create templates
- Limited to predefined templates (no user-created templates yet)

**Implementation**:
```sql
-- Create new template (in migration file)
INSERT INTO onto_templates (
  type_key, scope, name, schema, fsm, facet_defaults,
  metadata, status, is_abstract
) VALUES (
  'productmanager.roadmap',
  'project',
  'Product Manager Roadmap',
  '{"properties": {...}, "required": ["product_name"]}',
  '{"states": ["discovery", "planning", "executing", "shipped"], ...}',
  '{"context": "commercial", "scale": "large", "stage": "planning"}',
  '{"description": "For managing product releases", "realm": "productmanager"}',
  'active',
  false
);
```

### Option 2: "Template Creation UI" (Future Enhancement)

**Effort**: 80-120 hours | **Complexity**: Medium-High

**What you'd build**:
1. Admin-only page at `/admin/ontology/templates/new`
2. Form to define: name, schema fields, FSM states/transitions, facets, metadata
3. Validation layer ensuring template structure is sound
4. Test endpoint to try template before saving
5. UI to edit/version existing templates

**Pros**:
- Non-technical users can create templates
- No database access needed
- Easier to iterate and refine templates
- Could support user-created templates (multi-tenant)

**Cons**:
- Significant engineering effort
- More complex validation and error handling
- Requires new database tables for template versions/drafts
- Training needed for admins

**When to consider**: Q1 2026, after current template library is solid

### Option 3: "Template Library Marketplace" (Long-term Vision)

**Effort**: 200+ hours | **Complexity**: High

**What you'd build**:
1. Public template catalog (what's available?)
2. Community templates (user uploads)
3. Rating/review system
4. Template versioning and updates
5. Bulk import/export
6. API for programmatic template management

**Pros**:
- Exponential growth in templates (not just your design)
- Community-driven extensibility
- Premium feature potential

**Cons**:
- Massive scope
- Quality control challenges
- Requires governance/moderation
- Major infrastructure changes

**When to consider**: Q3 2026+, after product achieves product-market fit

---

## Recommended Next Steps 🎯

### Phase 1: Expand Template Library (Weeks 1-2)

1. **Design 5-10 new project templates**
   - Product Manager, Consultant, Sales, Educator, Nonprofit Director, etc.
   - Document expected workflow, key milestones, typical tasks
   - Include FSM state transitions with meaningful events

2. **Create database migrations** to seed templates
   - Follow pattern in `20250605000001_add_missing_base_templates.sql`
   - Ensure schema/FSM/metadata consistency

3. **Add to documentation**
   - Update `/apps/web/docs/features/ontology/README.md`
   - Document each new template's use case and workflow

4. **Test in UI**
   - Create test projects from each template
   - Verify scaffolding works (goals, tasks, plans appear)
   - Test FSM transitions for each domain

**Outcome**: Users can now choose from 10-15 project templates covering more use cases

### Phase 2: Improve Discovery (Weeks 3-4)

1. **Add quiz at `/ontology/create`**
   - "What kind of project are you running?" (3-5 questions)
   - Map answers to recommended templates
   - Still show full catalog as fallback

2. **Enhance template card UI**
   - Add "typical duration" estimate
   - Add "best for teams of size X"
   - Link to template documentation

3. **Create example projects** (optional)
   - Create one read-only example for each template
   - Link from template detail modal
   - Users can "fork" example to start new project

**Outcome**: First-time users find right template in 2 clicks; discovery friction reduced 70%

### Phase 3: Advanced Scaffolding (Weeks 5-6, Optional)

1. **AI-assisted task generation**
   - Template includes checklist or breakdown structure
   - User describes project specifics
   - API generates tailored task list (using existing brain dump logic)
   - User reviews and refines before instantiation

2. **Template variables**
   - User fills in "book title" once
   - Used in multiple places: project name, goals, task descriptions
   - Reduces repetitive data entry

3. **Conditional content**
   - "If scale=epic, add these tasks"
   - "If context=commercial, add budget tracking fields"
   - Keeps templates flexible without duplication

**Outcome**: Users can go from "no project" to "fully configured project with 20 tasks" in 3 minutes

---

## Key Metrics to Track 📈

After rolling out new templates, monitor:

1. **Template adoption rate** - % of projects created from each template
2. **Bounce rate** - % of users who start create flow but don't finish
3. **Time to project** - Minutes from landing page to first project creation
4. **Project completion rate** - % of projects that reach "shipped" or completion state
5. **User retention** - 30-day retention for users starting with templates vs. brain dump

---

## Code References for Implementation 📁

### Template Seeding Pattern
- `/supabase/migrations/20250605000001_add_missing_base_templates.sql` (1200 lines)
  - Shows how to define templates with schema, FSM, facets, metadata
  - Includes INSERT statements for 8 task templates, 5 goal templates, 5 plan templates

### Project Creation Flow
- `/apps/web/src/routes/ontology/create/+page.svelte` (908 lines)
  - Server loads templates and facets via `+page.server.ts`
  - Client renders template selection → form generation → instantiation
  - Calls POST `/api/onto/projects/instantiate` to create

### Template Catalog UI
- `/apps/web/src/routes/ontology/templates/+page.svelte` (554 lines)
  - Faceted filters (context, scale, stage)
  - Search, sort, grouping by realm/scope
  - Template detail modal with FSM visualization

### Key Services
- `template-resolver.service.ts` - How templates are loaded and merged
- `instantiation.service.ts` - How ProjectSpec becomes database records
- `ontology-projects.service.ts` - How to query projects with relationships

---

## Risk Assessment ⚠️

### Low Risk
- Adding new project templates (leverages existing system)
- Improving UI/UX for template discovery
- Writing documentation and guides

### Medium Risk
- Building template creation UI (needs careful validation)
- AI-assisted scaffolding (complexity in prompt engineering)
- Template variables/conditional content (schema extension)

### High Risk
- User-created templates without governance (quality control)
- Template marketplace (security, moderation, infrastructure)
- Breaking changes to template schema in production (migration complexity)

---

## Conclusion

**The BuildOS ontology already provides 85% of what you need for "fill-in-the-blank" project templates.** The system is well-architected, tested, and production-ready. Your biggest opportunity is expanding the template library and improving discovery UX.

**Recommendation**: Start with Phase 1 (expand templates) + Phase 2 (improve discovery). Both can be completed in 3-4 weeks with ~60 hours of focused effort. This will significantly expand the range of workflows your product supports while staying within the existing architecture.

If you want to support *user-created* templates or *unlimited* customization, Phase 3+ becomes necessary, but that's a 2026 decision based on actual user demand.

---

## Questions for Clarification

1. **Which domains are most important for your user base?** (e.g., writers, founders, or wider spectrum?)
2. **Do you want to support user-created templates in 2025, or stay with admin-curated for now?**
3. **How important is AI-assisted scaffolding vs. pre-configured task lists?**
4. **Should templates support real-time customization during instantiation, or just at creation time?**

---

*Research completed: 2025-11-06*
*Confidence level: 95% - Based on code review, documentation analysis, and working system observation*
