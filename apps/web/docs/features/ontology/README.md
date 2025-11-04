# Ontology System Documentation

**Status:** In Development
**Last Updated:** 2025-11-03

---

## Quick Links

### 🚀 Getting Started

- **[Ontology Master Plan](/thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md)** - Complete system vision and architecture
- **[Implementation Roadmap](/thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md)** - Current status and next steps
- **[Deliverables Taxonomy](/thoughts/shared/ideas/ontology/buildos-outputs.md)** - Complete catalog of output types

### 📖 Feature Documentation

#### Templates Page (New!)

- **[Templates Page Spec](./TEMPLATES_PAGE_SPEC.md)** ⭐ - Complete specification
- **[Implementation Checklist](./TEMPLATES_PAGE_IMPLEMENTATION_CHECKLIST.md)** - Step-by-step guide
- **[Visual Wireframes](./TEMPLATES_PAGE_WIREFRAMES.md)** - UI mockups and layouts

### 🔧 Technical References

- **[Type Definitions](/apps/web/src/lib/types/onto.ts)** - TypeScript types with Zod validation
- **[API Endpoints](/thoughts/shared/ideas/ontology/endpoint-stubs.md)** - All API routes
- **[Database Schema](/supabase/migrations/20250601000001_ontology_system.sql)** - Complete schema

---

## What is the Ontology System?

The Ontology System is BuildOS's flexible project management framework that uses **typed templates** and **finite state machines (FSM)** to model different types of projects, from book writing to software development to coaching clients.

### Core Concepts

**1. Templates** - Reusable blueprints for projects, plans, tasks, outputs, and documents

- Each template has a `type_key` (e.g., `writer.book`, `coach.client`)
- Defines structure via JSON Schema
- Defines workflow via FSM states and transitions
- Can inherit from parent templates

**2. Facets** - Three-dimensional metadata for categorization

- **Context:** personal, client, commercial, etc.
- **Scale:** micro, small, medium, large, epic
- **Stage:** discovery, planning, execution, launch, maintenance, complete

**3. FSM (Finite State Machine)** - Workflow engine

- Defines valid states for each entity type
- Defines allowed transitions between states
- Guards: conditions that must be met for transitions
- Actions: side effects when transitions occur (spawn tasks, send emails, etc.)

**4. Entities** - The actual records created from templates

- Projects (top-level)
- Plans (groupings within projects)
- Tasks (actionable items)
- Outputs (deliverables/artifacts)
- Documents (context/notes)

---

## Current Implementation Status

### ✅ Complete

- [x] Database schema with all tables
- [x] Core type definitions with Zod validation
- [x] FSM engine for state transitions
- [x] Template catalog endpoint (`GET /api/onto/templates`)
- [x] Project instantiation from specs (`POST /api/onto/projects/instantiate`)
- [x] FSM transition endpoint (`POST /api/onto/fsm/transition`)
- [x] Basic ontology routes (`/ontology`, `/ontology/create`, `/ontology/projects/[id]`)

### 🚧 In Progress

- [ ] Templates browse page (`/ontology/templates`) - **See TEMPLATES_PAGE_SPEC.md**
- [ ] Template detail views
- [ ] Admin template management UI
- [ ] Brain dump integration with ontology

### 📋 Planned

- [ ] Template analytics and usage tracking
- [ ] Template versioning and migration
- [ ] Visual FSM editor
- [ ] Template marketplace

---

## Directory Structure

```
apps/web/
├── src/
│   ├── routes/ontology/
│   │   ├── +page.svelte                     # Project list
│   │   ├── +page.server.ts
│   │   ├── create/                          # Create new project
│   │   │   ├── +page.svelte
│   │   │   └── +page.server.ts
│   │   ├── projects/[id]/                   # Project detail
│   │   │   ├── +page.svelte
│   │   │   └── +page.server.ts
│   │   └── templates/                       # 🆕 Templates browse (TO BE BUILT)
│   │       ├── +page.svelte
│   │       ├── +page.server.ts
│   │       ├── [id]/                        # Template detail
│   │       └── new/                         # Create template (admin)
│   │
│   ├── routes/api/onto/
│   │   ├── templates/+server.ts             # Template catalog API
│   │   ├── projects/
│   │   │   ├── +server.ts                   # Projects CRUD
│   │   │   └── instantiate/+server.ts       # Create from spec
│   │   └── fsm/
│   │       └── transition/+server.ts        # FSM transitions
│   │
│   └── lib/
│       ├── types/onto.ts                    # Type definitions
│       ├── services/ontology/
│       │   ├── instantiation.service.ts     # Project creation
│       │   └── instantiation.service.test.ts
│       └── components/ontology/
│           └── templates/                    # 🆕 Template components (TO BE BUILT)
│               ├── TemplateCard.svelte
│               ├── TemplateFilters.svelte
│               └── TemplateDetailModal.svelte
│
└── docs/features/ontology/
    ├── README.md                             # This file
    ├── TEMPLATES_PAGE_SPEC.md                # 🆕 Templates page spec
    ├── TEMPLATES_PAGE_IMPLEMENTATION_CHECKLIST.md  # 🆕 Implementation guide
    └── TEMPLATES_PAGE_WIREFRAMES.md          # 🆕 Visual mockups

thoughts/shared/ideas/ontology/
├── buildos-ontology-master-plan.md           # Complete vision
├── ontology-implementation-roadmap.md        # Current roadmap
├── buildos-outputs.md                        # Deliverable taxonomy
├── endpoint-stubs.md                         # API reference
└── MY_CURRENT_UNDERSTANDING.md               # High-level overview

supabase/migrations/
├── 20250601000001_ontology_system.sql        # Core schema
└── 20250601000002_ontology_helpers.sql       # Helper functions
```

---

## Key Files Reference

### Type Definitions

**`src/lib/types/onto.ts`** - All ontology types with Zod validation

- `Template` - Template definition
- `ProjectSpec` - Spec for creating projects
- `FSMDef`, `FSMTransition`, `FSMGuard`, `FSMAction` - FSM types
- `Facets`, `TemplateMetadata` - Metadata types
- Validation helpers

### Services

**`src/lib/services/ontology/instantiation.service.ts`** - Project creation

- `instantiateProjectFromSpec()` - Create project from spec
- Full validation and entity creation

### Database Schema

**Primary Tables:**

- `onto_templates` - Template definitions
- `onto_projects` - Project instances
- `onto_plans` - Plan instances
- `onto_tasks` - Task instances
- `onto_outputs` - Output instances (deliverables)
- `onto_documents` - Document instances
- `onto_facet_definitions` - Facet taxonomy
- `onto_facet_values` - Facet value metadata

**Supporting Tables:**

- `onto_edges` - Relationships between entities
- `onto_goals`, `onto_requirements`, `onto_milestones`, `onto_risks`, `onto_decisions`, `onto_metrics`

---

## How to Work on the Ontology System

### 1. Understanding the System

Start here in order:

1. **[Ontology Master Plan](/thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md)** - Read the vision (30 min)
2. **[Implementation Roadmap](/thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md)** - See current status (15 min)
3. **[Type Definitions](/apps/web/src/lib/types/onto.ts)** - Understand the types (20 min)
4. **[Endpoint Stubs](/thoughts/shared/ideas/ontology/endpoint-stubs.md)** - See API design (20 min)

### 2. Building the Templates Page

If you're implementing the templates browse page:

1. **[Read the Spec](./TEMPLATES_PAGE_SPEC.md)** - Understand requirements (30 min)
2. **[Review Wireframes](./TEMPLATES_PAGE_WIREFRAMES.md)** - See visual design (20 min)
3. **[Follow Checklist](./TEMPLATES_PAGE_IMPLEMENTATION_CHECKLIST.md)** - Step-by-step implementation (ongoing)

### 3. Testing Your Changes

```bash
# Start development server
pnpm run dev:split

# Run type checking
pnpm check

# Run tests
pnpm test

# Run full validation
pnpm pre-push
```

### 4. Common Tasks

**Create a new template:**

```typescript
// Use the admin UI (when built) or insert directly:
INSERT INTO onto_templates (
  scope, type_key, name, schema, fsm, metadata, facet_defaults
) VALUES (...);
```

**Instantiate a project from a template:**

```typescript
const spec: ProjectSpec = {
	project: {
		name: 'My Book',
		type_key: 'writer.book',
		props: {
			facets: { context: 'personal', scale: 'large', stage: 'planning' }
		}
	}
};

await fetch('/api/onto/projects/instantiate', {
	method: 'POST',
	body: JSON.stringify(spec)
});
```

**Trigger a FSM transition:**

```typescript
await fetch('/api/onto/fsm/transition', {
	method: 'POST',
	body: JSON.stringify({
		object_kind: 'project',
		object_id: projectId,
		event: 'start_writing'
	})
});
```

---

## Architecture Diagrams

### Template Inheritance

```
deliverable.research_doc (abstract)
├── deliverable.research_doc.icp (ICP research for marketers)
├── deliverable.research_doc.academic (academic papers)
├── deliverable.research_doc.user (UX research)
└── deliverable.research_doc.competitive (competitive analysis)
```

### Project Lifecycle

```
Brain Dump → Spec Generation → Template Selection → Instantiation → FSM Workflow
     ↓             ↓                  ↓                  ↓              ↓
  User input   AI proposes        User picks        Create          Transition
               templates          template          entities        through states
```

### Entity Relationships

```
Project
├── Plans
│   └── Tasks
├── Outputs (deliverables)
├── Documents
├── Goals
├── Requirements
├── Milestones
├── Risks
└── Decisions
```

---

## FAQ

### Q: What's the difference between the ontology system and the existing brain dump flow?

**A:** The brain dump flow is for quick, unstructured capture. The ontology system provides:

- Formal project types with templates
- Structured workflows via FSM
- Better organization with plans and phases
- More flexibility for different domains (writing, coaching, development)

Eventually, brain dumps will intelligently map to ontology templates.

### Q: When should I use a project template vs creating a project from a brain dump?

**A:**

- **Brain Dump:** Quick capture, you know what you want but not the structure
- **Template:** You know the project type and want structure from the start

### Q: How do I add a new project type?

**A:** Create a new template with:

1. Unique `type_key` (e.g., `podcast.production`)
2. JSON Schema for custom properties
3. FSM definition with states and transitions
4. Metadata (realm, output_type, keywords)
5. Facet defaults

See `buildos-outputs.md` for examples.

### Q: Can templates change after projects are created?

**A:** Yes, but carefully:

- Schema changes should be backward compatible
- FSM changes should maintain valid state paths
- Consider versioning for major changes
- Migration scripts may be needed

---

## Contributing

### Adding Documentation

- Specs go in `/apps/web/docs/features/ontology/`
- Research/exploration go in `/thoughts/shared/research/`
- Master plan updates go in `/thoughts/shared/ideas/ontology/`

### Code Standards

- Follow Svelte 5 runes syntax (`$state`, `$derived`, `$effect`)
- Use Zod for validation (see `onto.ts`)
- Follow existing patterns in `/ontology/create`
- Write tests for new features

### Git Workflow

1. Create feature branch
2. Implement with tests
3. Run `pnpm pre-push` to validate
4. Create PR with description
5. Link to spec document in PR

---

## Related Documentation

### BuildOS Core

- **[Web App CLAUDE.md](/apps/web/CLAUDE.md)** - Web app development guide
- **[Root CLAUDE.md](/CLAUDE.md)** - Monorepo guide
- **[Documentation Index](/docs/README.md)** - All docs

### Brain Dump System

- Brain dump flow will eventually integrate with ontology
- See `/apps/web/docs/features/brain-dump/` for current implementation

---

## Support

**Questions or Issues?**

1. Check this README
2. Review the spec documents
3. Look at existing implementations in `/ontology/create`
4. Ask in team chat
5. Create an issue with detailed context

**Need to make changes?**

1. Read the master plan first
2. Understand the FSM concept
3. Follow the implementation checklist
4. Test thoroughly
5. Update documentation

---

**Last Updated:** 2025-11-03
**Next Review:** When templates page is complete
