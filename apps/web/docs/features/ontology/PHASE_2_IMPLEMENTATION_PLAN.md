# Ontology Templates Phase 2: Template Management System

**Created:** 2025-11-04
**Status:** In Progress
**Priority:** High
**Estimated Completion:** 2-3 weeks

---

## 🎯 Overview

Phase 2 transforms the ontology system from read-only to fully manageable, allowing admins to create, edit, and manage templates through a sophisticated visual interface. This builds on the existing graph visualization to provide a complete template management experience.

---

## 📊 Current State Analysis

### ✅ What Exists (Phase 1 Complete)

1. **Template Browse Page** (`/ontology/templates`)
    - Filter, search, and view templates
    - Professional UI with BuildOS design standards
    - Responsive design + dark mode

2. **Graph Visualization** (`/admin/ontology/graph`)
    - Cytoscape.js-based graph rendering
    - Template hierarchy visualization
    - Node details panel (read-only)
    - Multiple layouts (DAG, Cola, COSE, Circle)
    - Search and filter capabilities
    - Export to PNG

3. **Database Schema** (`onto_templates`)

    ```typescript
    {
    	id: string;
    	type_key: string; // e.g., 'creative.writing.novel'
    	name: string;
    	scope: string; // 'project', 'plan', 'task', 'output', 'document'
    	status: string; // 'draft', 'active', 'deprecated'
    	parent_template_id: string | null;
    	is_abstract: boolean;
    	schema: Json; // JSON Schema validation rules
    	fsm: Json; // FSM state machine definition
    	metadata: Json; // Description, realm, keywords, etc.
    	default_props: Json;
    	default_views: Json;
    	facet_defaults: Json; // context, scale, stage
    	created_by: string;
    	created_at: string;
    	updated_at: string;
    }
    ```

4. **API Endpoints** (Read-only)
    - `GET /api/onto/templates` - List templates with filters
    - `GET /api/onto/templates/[type_key]` - Get single template

### 🔨 What Needs to Be Built (Phase 2)

1. **Template CRUD Operations**
    - Create new templates
    - Edit existing templates
    - Delete/deprecate templates
    - Clone templates
    - Promote draft → active

2. **Visual Editors**
    - FSM State Machine Editor
    - JSON Schema Builder
    - Facet Configuration UI
    - Metadata Editor

3. **Integration Points**
    - Edit button in graph NodeDetailsPanel
    - Create template flow from graph
    - Validation before save
    - Template relationship visualization

---

## 🏗️ Architecture Design

### Component Hierarchy

```
/admin/ontology/
├── graph/                          # Existing visualization
│   ├── +page.svelte               # ✅ Graph page
│   ├── OntologyGraph.svelte       # ✅ Cytoscape component
│   ├── NodeDetailsPanel.svelte    # 🔨 Add edit button
│   ├── GraphControls.svelte       # ✅ Controls
│   └── lib/
│       ├── ontology-graph.service.ts  # ✅ Graph transforms
│       └── ontology-graph.types.ts    # ✅ Type definitions
│
├── templates/                      # New template management
│   ├── new/
│   │   ├── +page.server.ts        # 🔨 Load form data
│   │   └── +page.svelte           # 🔨 Template creation wizard
│   │
│   ├── [id]/
│   │   ├── edit/
│   │   │   ├── +page.server.ts    # 🔨 Load template data
│   │   │   └── +page.svelte       # 🔨 Template editor
│   │   │
│   │   └── +page.svelte           # 🔨 Template detail view (admin)
│   │
│   └── components/
│       ├── TemplateForm.svelte           # 🔨 Core form component
│       ├── FsmEditor.svelte              # 🔨 FSM visual editor
│       ├── SchemaBuilder.svelte          # 🔨 JSON schema builder
│       ├── MetadataEditor.svelte         # 🔨 Metadata fields
│       ├── FacetDefaultsEditor.svelte    # 🔨 Facet configuration
│       ├── TemplateValidation.svelte     # 🔨 Validation feedback
│       └── TemplatePreview.svelte        # 🔨 Preview before save
```

### API Endpoints

```
POST   /api/onto/templates                 # Create new template
PUT    /api/onto/templates/[id]            # Update template
DELETE /api/onto/templates/[id]            # Soft delete (deprecate)
POST   /api/onto/templates/[id]/clone      # Clone template
POST   /api/onto/templates/[id]/promote    # Draft → Active
POST   /api/onto/templates/[id]/deprecate  # Active → Deprecated
POST   /api/onto/templates/validate        # Validate template data
```

### Data Flow

```
User Action → Template Form → Validation → API → Database → Graph Update
     ↓                            ↓           ↓        ↓           ↓
  Edit/Create              Client-side   Server   Supabase   Cytoscape
                          + Server        RLS      onto_      Refresh
                          Validation     Check   templates
```

---

## 📋 Implementation Phases

### Phase 2A: API Foundation (Week 1)

**Goal:** Build complete CRUD API with validation

#### Tasks

1. **Template CRUD Endpoints** (Day 1-2)
    - [ ] `POST /api/onto/templates` - Create template
    - [ ] `PUT /api/onto/templates/[id]` - Update template
    - [ ] `POST /api/onto/templates/[id]/clone` - Clone template
    - [ ] `POST /api/onto/templates/[id]/promote` - Change status
    - [ ] `DELETE /api/onto/templates/[id]` - Deprecate

2. **Validation Service** (Day 2-3)
    - [ ] Create `template-validation.service.ts`
    - [ ] Validate type_key uniqueness
    - [ ] Validate FSM structure (valid states, transitions)
    - [ ] Validate JSON schema structure
    - [ ] Validate parent template relationships (no cycles)
    - [ ] Validate facet defaults against taxonomy

3. **Template Service** (Day 3-4)
    - [ ] Create `template-crud.service.ts`
    - [ ] Create template with defaults
    - [ ] Update template with history
    - [ ] Clone template (new type_key)
    - [ ] Promote template status
    - [ ] Check if template is in use before delete

4. **Testing** (Day 4-5)
    - [ ] Unit tests for validation
    - [ ] Integration tests for CRUD
    - [ ] Test error cases
    - [ ] Test permission checks

### Phase 2B: Template Form UI (Week 2)

**Goal:** Build comprehensive template creation/edit form

#### Tasks

1. **Core Template Form** (Day 1-2)
    - [ ] Create `TemplateForm.svelte`
    - [ ] Basic information fields (name, type_key, scope)
    - [ ] Parent template selector
    - [ ] Abstract template checkbox
    - [ ] Status selection (draft/active)
    - [ ] Form state management with Svelte 5 runes

2. **Metadata Editor** (Day 2-3)
    - [ ] Create `MetadataEditor.svelte`
    - [ ] Description (rich text or markdown)
    - [ ] Realm selection
    - [ ] Keywords (tag input)
    - [ ] Output type (for output scope)
    - [ ] Typical scale
    - [ ] Custom metadata fields (key-value pairs)

3. **Facet Defaults Editor** (Day 3)
    - [ ] Create `FacetDefaultsEditor.svelte`
    - [ ] Context selection (from facet taxonomy)
    - [ ] Scale selection
    - [ ] Stage selection
    - [ ] Visual preview of selected facets

4. **Template Preview** (Day 4)
    - [ ] Create `TemplatePreview.svelte`
    - [ ] Show template card preview
    - [ ] Show how it appears in graph
    - [ ] Show generated type_key
    - [ ] Show validation status

5. **Form Integration** (Day 5)
    - [ ] Wire up form to API
    - [ ] Handle validation errors
    - [ ] Success/error notifications
    - [ ] Redirect after save

### Phase 2C: FSM Visual Editor (Week 2-3)

**Goal:** Build interactive FSM state machine editor

#### Tasks

1. **FSM Editor Component** (Day 1-3)
    - [ ] Create `FsmEditor.svelte`
    - [ ] Use Cytoscape for FSM visualization
    - [ ] Visual state representation (nodes)
    - [ ] Visual transition representation (edges)
    - [ ] Add state button
    - [ ] Edit state (name, properties)
    - [ ] Delete state
    - [ ] Add transition (drag from state to state)
    - [ ] Edit transition (event, guards, actions)
    - [ ] Delete transition

2. **FSM State Panel** (Day 3-4)
    - [ ] State name input
    - [ ] State type (normal, initial, final)
    - [ ] State metadata
    - [ ] Entry/exit actions
    - [ ] State color customization

3. **FSM Transition Panel** (Day 4-5)
    - [ ] Event name (what triggers transition)
    - [ ] Guard conditions (when allowed)
    - [ ] Actions (what happens on transition)
    - [ ] Action types (notify, log, update_props, etc.)
    - [ ] Action configuration

4. **FSM Validation** (Day 5)
    - [ ] Must have initial state
    - [ ] All states must be reachable
    - [ ] No orphaned states
    - [ ] Valid event names
    - [ ] Valid action types

### Phase 2D: JSON Schema Builder (Week 3)

**Goal:** Build visual JSON Schema editor

#### Tasks

1. **Schema Builder Component** (Day 1-3)
    - [ ] Create `SchemaBuilder.svelte`
    - [ ] Property list (name, type, required)
    - [ ] Add property button
    - [ ] Remove property button
    - [ ] Reorder properties (drag & drop)

2. **Property Editor** (Day 2-3)
    - [ ] Property name input
    - [ ] Type selection (string, number, boolean, object, array)
    - [ ] Required checkbox
    - [ ] Default value
    - [ ] Description
    - [ ] Validation rules (min, max, pattern, enum)

3. **Nested Objects** (Day 3-4)
    - [ ] Support nested object types
    - [ ] Expand/collapse nested properties
    - [ ] Visual indentation
    - [ ] Path breadcrumbs

4. **Schema Preview** (Day 4)
    - [ ] Show generated JSON Schema
    - [ ] Syntax highlighting
    - [ ] Copy to clipboard
    - [ ] Toggle raw JSON / visual editor

5. **Schema Validation** (Day 5)
    - [ ] Valid JSON Schema structure
    - [ ] No duplicate property names
    - [ ] Valid types
    - [ ] Test with sample data

### Phase 2E: Integration & Polish (Week 3)

**Goal:** Connect everything and add finishing touches

#### Tasks

1. **Graph Integration** (Day 1-2)
    - [ ] Add "Edit Template" button to NodeDetailsPanel
    - [ ] Add "Create Child Template" from graph node
    - [ ] Refresh graph after template save
    - [ ] Highlight newly created/edited templates

2. **Template Creation Flow** (Day 2-3)
    - [ ] Replace placeholder `/ontology/templates/new`
    - [ ] Multi-step wizard (Basic → Metadata → FSM → Schema → Review)
    - [ ] Progress indicator
    - [ ] Save draft at any step
    - [ ] Back/Next navigation

3. **Template Edit Flow** (Day 3-4)
    - [ ] Load existing template data
    - [ ] Preserve existing FSM/Schema
    - [ ] Show what changed (diff view)
    - [ ] Confirm before save
    - [ ] Version history (optional)

4. **Validation & Error Handling** (Day 4)
    - [ ] Real-time validation feedback
    - [ ] Field-level error messages
    - [ ] Summary of all errors
    - [ ] Prevent save if invalid
    - [ ] Clear error messages

5. **Testing & QA** (Day 5)
    - [ ] E2E tests for full flow
    - [ ] Test on mobile
    - [ ] Test dark mode
    - [ ] Test with real data
    - [ ] Performance testing

---

## 🎨 UI/UX Design Principles

### BuildOS Design Standards

1. **Responsive First**
    - Mobile: Stack vertically, full-width forms
    - Tablet: Side-by-side panels where appropriate
    - Desktop: Multi-column layouts with sidebars

2. **Dark Mode Support**
    - All components must support light and dark modes
    - Use `dark:` Tailwind prefix for dark styles
    - Maintain WCAG AA contrast ratios

3. **High Information Density**
    - Use Card components to group related info
    - Collapsible sections for advanced options
    - Tooltips for complex fields

4. **Visual Hierarchy**
    - CardHeader with gradient for main sections
    - Clear labels and descriptions
    - Progressive disclosure (basic → advanced)

### Form Patterns

```svelte
<!-- Example: Template Form Structure -->
<Card variant="elevated">
	<CardHeader variant="gradient">
		<h2>Basic Information</h2>
	</CardHeader>
	<CardBody padding="lg">
		<FormField label="Template Name" labelFor="name">
			<TextInput id="name" bind:value={name} />
		</FormField>
		<!-- More fields -->
	</CardBody>
</Card>
```

---

## 🔒 Security & Permissions

### Access Control

- **Admin Only**: All template CRUD operations require `user.is_admin === true`
- **RLS Bypass**: Use admin Supabase client for template operations
- **Audit Trail**: Record `created_by`, `created_at`, `updated_at` for all changes

### Validation Layers

1. **Client-side** (UX feedback)
2. **Server-side** (security enforcement)
3. **Database** (schema constraints)

---

## 📊 Success Metrics

### Phase 2A Success Criteria

- [ ] All CRUD endpoints working
- [ ] Validation prevents invalid templates
- [ ] 100% test coverage for API
- [ ] No security vulnerabilities

### Phase 2B Success Criteria

- [ ] Template form is usable on mobile
- [ ] Dark mode works correctly
- [ ] Can create basic template in < 2 minutes
- [ ] Form validation is clear and helpful

### Phase 2C Success Criteria

- [ ] FSM editor is intuitive
- [ ] Can create 5-state FSM in < 5 minutes
- [ ] Visual representation matches JSON structure
- [ ] FSM validates before save

### Phase 2D Success Criteria

- [ ] Schema builder is easy to use
- [ ] Can define complex schema (nested objects, arrays)
- [ ] Generated JSON Schema is valid
- [ ] Preview shows what schema looks like

### Phase 2E Success Criteria

- [ ] Full flow works end-to-end
- [ ] No bugs in production
- [ ] Admin can create template without documentation
- [ ] Graph updates reflect changes immediately

---

## 🚀 Getting Started

### Prerequisites

```bash
# Ensure dependencies are installed
pnpm install

# Start dev server
pnpm run dev:split

# Run tests
pnpm test
```

### Development Order

1. **Start with API** (Phase 2A)
    - Validate data structures early
    - Test with Postman/Thunder Client
    - Ensure security checks work

2. **Build Form UI** (Phase 2B)
    - Test with hardcoded data first
    - Wire up to API once UI works
    - Add validation incrementally

3. **Add Visual Editors** (Phase 2C, 2D)
    - FSM and Schema are independent
    - Can be built in parallel
    - Test each editor standalone

4. **Integrate Everything** (Phase 2E)
    - Connect graph to edit flow
    - Test full user journeys
    - Polish UX

---

## 📝 Documentation Tasks

- [ ] Update TEMPLATES_PAGE_IMPLEMENTATION_CHECKLIST.md
- [ ] Create API documentation for CRUD endpoints
- [ ] Write admin user guide for template creation
- [ ] Document FSM structure and conventions
- [ ] Document JSON Schema patterns
- [ ] Update BUGFIX_CHANGELOG.md for any bugs found
- [ ] Create architecture decision records (ADRs) for major choices

---

## 🔗 Related Documentation

- [Templates Page Spec](/apps/web/docs/features/ontology/TEMPLATES_PAGE_SPEC.md)
- [Implementation Checklist](/apps/web/docs/features/ontology/TEMPLATES_PAGE_IMPLEMENTATION_CHECKLIST.md)
- [BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)
- [API Response Patterns](/apps/web/src/lib/utils/api-response.ts)
- [Database Schema](/packages/shared-types/src/database.schema.ts)

---

**Last Updated:** 2025-11-04
**Status:** Ready for implementation
**Next Step:** Begin Phase 2A (API Foundation)
