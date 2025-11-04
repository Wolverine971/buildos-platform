# Ontology Templates Page Specification

**Feature:** Template Browser & Management
**Route:** `/ontology/templates`
**Date:** 2025-11-03
**Status:** Specification
**Priority:** High

---

## Table of Contents

1. [Overview](#overview)
2. [User Goals](#user-goals)
3. [Page Architecture](#page-architecture)
4. [Feature Requirements](#feature-requirements)
5. [UI/UX Design](#uiux-design)
6. [Technical Implementation](#technical-implementation)
7. [Integration Points](#integration-points)
8. [Future Enhancements](#future-enhancements)

---

## Overview

The Templates Page is a dedicated interface for browsing, discovering, and managing ontology templates. Unlike the project creation flow (which shows templates as part of project setup), this page provides a comprehensive view of the entire template catalog with advanced filtering, search, and detail views.

### What Makes This Different from `/ontology/create`

| `/ontology/create`                                       | `/ontology/templates`                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Purpose:** Create a new project                        | **Purpose:** Browse and understand templates                                                         |
| **Context:** Action-oriented (I want to start a project) | **Context:** Discovery-oriented (I want to learn about templates)                                    |
| **User Flow:** Select → Configure → Create               | **User Flow:** Browse → Explore → Learn → (optionally) Create                                        |
| **Scope:** Project templates only                        | **Scope:** ALL template scopes (project, plan, task, output, document)                               |
| **Details:** Minimal (just enough to create)             | **Details:** Comprehensive (FSM, schema, examples, inheritance)                                      |
| **Actions:** Create project                              | **Actions:** View details, preview FSM, see examples, create from template, manage templates (admin) |

---

## User Goals

### For Regular Users

1. **Discover** what templates are available for different project types
2. **Understand** what each template does and when to use it
3. **Learn** about the template's structure, states, and workflows
4. **Preview** FSM state diagrams before committing to a template
5. **Find** templates by domain, realm, or use case
6. **Compare** similar templates to choose the right one
7. **Create projects** directly from interesting templates

### For Power Users / Admins

8. **Manage** templates (create, edit, promote from draft to active)
9. **View** template inheritance hierarchies
10. **Monitor** template usage and popularity
11. **Debug** FSM definitions and schema validation
12. **Create** new domain-specific templates
13. **Clone** and customize existing templates

---

## Page Architecture

### Route Structure

```
/ontology/templates                           # Main browse page
/ontology/templates?scope=project             # Filter by scope
/ontology/templates?realm=creative            # Filter by realm
/ontology/templates?search=writer             # Search templates
/ontology/templates/[template_id]             # Template detail view (future)
/ontology/templates/new                       # Create new template (admin only)
/ontology/templates/[template_id]/edit        # Edit template (admin only)
```

### Component Hierarchy

```
+page.svelte (Templates Browse)
├── TemplateFilters.svelte
│   ├── ScopeFilter.svelte
│   ├── RealmFilter.svelte
│   └── SearchBar.svelte
├── TemplateGrid.svelte
│   └── TemplateCard.svelte
│       ├── TemplateHeader.svelte
│       ├── TemplateMeta.svelte
│       ├── FacetBadges.svelte
│       └── TemplateActions.svelte
├── TemplateDetailModal.svelte (or dedicated page)
│   ├── TemplateFSMDiagram.svelte
│   ├── TemplateSchemaView.svelte
│   ├── TemplateInheritance.svelte
│   └── TemplateExamples.svelte
└── CreateTemplateModal.svelte (admin only)
```

---

## Feature Requirements

### Phase 1: Core Browsing (MVP)

**Must Have:**

- [x] **Template Catalog Display**
    - Group templates by realm (creative, technical, business, service, etc.)
    - Show template cards with: name, type_key, description, realm, scope
    - Visual distinction between abstract and concrete templates
    - Display facet defaults as badges
    - Show template scope (project, plan, task, output, document)

- [x] **Filtering System**
    - Filter by scope (project, plan, task, output, document)
    - Filter by realm (creative, technical, business, service, etc.)
    - Multi-select facet filters (context, scale, stage)
    - Clear all filters button

- [x] **Search Functionality**
    - Search by template name
    - Search by type_key
    - Search by keywords in metadata
    - Real-time search results

- [x] **Template Actions**
    - "Create Project" quick action (for project templates)
    - "View Details" to see full template info
    - "Use Template" to start project creation flow

- [x] **Responsive Design**
    - Mobile-friendly grid layout
    - Collapsible filters on mobile
    - Touch-friendly card interactions

**Should Have:**

- [ ] **Template Detail View**
    - Full template information (schema, FSM, metadata)
    - FSM state diagram visualization
    - Template properties and defaults
    - Inheritance chain (if template has parent)
    - Example projects using this template

- [ ] **Sorting Options**
    - Sort by: Name, Popularity, Recently Added, Type Key
    - Ascending/Descending toggle

- [ ] **Empty States**
    - No templates found (with suggestions)
    - No results for search query
    - No templates in selected filters

**Could Have:**

- [ ] **Template Preview**
    - Quick preview on hover (desktop)
    - Preview panel on click (mobile)

- [ ] **Favorites/Bookmarks**
    - Save favorite templates for quick access
    - User-specific template collections

### Phase 2: Advanced Features

**Template Management (Admin Only):**

- [ ] Create new templates via UI
- [ ] Edit existing templates
- [ ] Promote templates from draft to active
- [ ] Deprecate old templates
- [ ] Version template schemas and FSMs
- [ ] Test template FSM before publishing

**Template Analytics:**

- [ ] Template usage statistics
- [ ] Most popular templates dashboard
- [ ] Project success rates by template
- [ ] Facet distribution analysis

**Template Enhancement:**

- [ ] Visual FSM editor
- [ ] JSON Schema builder for template properties
- [ ] Template validation and linting
- [ ] Template testing framework

---

## UI/UX Design

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Ontology Templates                               [+ New]     │
│  Browse and discover project templates                        │
├──────────────────────────────────────────────────────────────┤
│  🔍 Search...                  [Scope ▼] [Realm ▼] [Clear]   │
├────────────────────┬─────────────────────────────────────────┤
│  FILTERS (Mobile)  │  CREATIVE (5)                           │
│                    │  ┌──────┐ ┌──────┐ ┌──────┐            │
│  Scope             │  │ Book │ │Article│ │Blog  │            │
│  ☑ Project         │  │ Proj │ │Project│ │Post  │            │
│  ☐ Plan            │  └──────┘ └──────┘ └──────┘            │
│  ☐ Task            │                                         │
│  ☐ Output          │  TECHNICAL (4)                          │
│  ☐ Document        │  ┌──────┐ ┌──────┐                     │
│                    │  │ App  │ │Feature│                     │
│  Realm             │  │ Dev  │ │ Dev   │                     │
│  ☑ Creative        │  └──────┘ └──────┘                     │
│  ☑ Technical       │                                         │
│  ☐ Business        │  SERVICE (3)                            │
│  ☐ Service         │  ┌──────┐ ┌──────┐                     │
│                    │  │Client│ │Program│                     │
│  Context           │  │ Coach│ │ Coach │                     │
│  ☐ Personal        │  └──────┘ └──────┘                     │
│  ☐ Client          │                                         │
│  ☐ Commercial      │                                         │
└────────────────────┴─────────────────────────────────────────┘
```

### Template Card Design

```
┌─────────────────────────────────────────────┐
│  Book Project                 [⭐ Favorite]  │
│  writer.book                                │
│  ─────────────────────────────────────────  │
│  Long-form writing project like novels     │
│  or non-fiction books                      │
│                                            │
│  📊 Creative · Content · Large             │
│  🏷️ Personal · Large · Planning            │
│                                            │
│  🔄 4 states · 3 transitions               │
│  📝 5 custom properties                    │
│                                            │
│  [View Details] [Create Project →]         │
└─────────────────────────────────────────────┘
```

### Template Detail Modal

```
┌────────────────────────────────────────────────────────┐
│  Book Project (writer.book)                    [✕]     │
├────────────────────────────────────────────────────────┤
│  TABS: [Overview] [FSM] [Schema] [Examples]           │
├────────────────────────────────────────────────────────┤
│  OVERVIEW                                              │
│                                                        │
│  Description:                                          │
│  Long-form writing project for novels, memoirs,       │
│  non-fiction books, and other book-length works.      │
│                                                        │
│  Metadata:                                             │
│  • Realm: Creative                                     │
│  • Output Type: Content                                │
│  • Typical Scale: Large                                │
│  • Keywords: writing, book, novel, author             │
│                                                        │
│  Facet Defaults:                                       │
│  • Context: Personal                                   │
│  • Scale: Large                                        │
│  • Stage: Planning                                     │
│                                                        │
│  Inheritance:                                          │
│  No parent template (base template)                   │
│                                                        │
│  Used In:                                              │
│  • 42 active projects                                  │
│  • 128 completed projects                              │
│                                                        │
│  [Create Project from Template]                        │
└────────────────────────────────────────────────────────┘
```

### FSM Diagram View

```
┌────────────────────────────────────────────────────────┐
│  FSM: writer.book                              [✕]     │
├────────────────────────────────────────────────────────┤
│  TABS: [Overview] [FSM] [Schema] [Examples]           │
├────────────────────────────────────────────────────────┤
│  FSM DIAGRAM                                           │
│                                                        │
│   ┌──────────┐  start_writing   ┌──────────┐         │
│   │ Planning ├─────────────────→ │ Writing  │         │
│   └──────────┘                   └─────┬────┘         │
│                                        │               │
│                                        │ finish_draft  │
│                                        ↓               │
│                                  ┌──────────┐         │
│                                  │ Revision │         │
│                                  └─────┬────┘         │
│                                        │               │
│                                        │ publish       │
│                                        ↓               │
│                                  ┌──────────┐         │
│                                  │Published │         │
│                                  └──────────┘         │
│                                                        │
│  Transitions:                                          │
│  • planning → writing (start_writing)                 │
│    Guards: has_property(target_word_count)            │
│    Actions: spawn_tasks(5 chapter tasks)              │
│                                                        │
│  • writing → revision (finish_draft)                  │
│    Guards: None                                        │
│    Actions: notify(user)                               │
│                                                        │
│  • revision → published (publish)                     │
│    Guards: None                                        │
│    Actions: email_user, update_facets(stage=complete) │
└────────────────────────────────────────────────────────┘
```

### Color Coding System

**Scope Colors:**

- 🟦 **Project** → Blue
- 🟩 **Plan** → Green
- 🟨 **Task** → Yellow
- 🟪 **Output** → Purple
- 🟧 **Document** → Orange

**Realm Colors:**

- 🎨 **Creative** → Pink/Rose
- 💻 **Technical** → Blue/Cyan
- 💼 **Business** → Navy/Indigo
- 🤝 **Service** → Teal/Green
- 🎓 **Education** → Purple/Violet
- 👤 **Personal** → Amber/Orange

**Template Status:**

- ✅ **Active** → Green badge
- 📝 **Draft** → Yellow badge
- 🚫 **Deprecated** → Red badge
- 🔒 **Abstract** → Gray badge (cannot be used directly)

---

## Technical Implementation

### File Structure

```
apps/web/src/routes/ontology/templates/
├── +page.server.ts                    # Server-side data loading
├── +page.svelte                       # Main templates browse page
├── [id]/
│   ├── +page.server.ts               # Template detail data
│   └── +page.svelte                  # Template detail view
├── new/
│   ├── +page.server.ts               # Admin only
│   └── +page.svelte                  # Create template form
└── [id]/edit/
    ├── +page.server.ts               # Admin only
    └── +page.svelte                  # Edit template form

apps/web/src/lib/components/ontology/templates/
├── TemplateFilters.svelte
├── TemplateGrid.svelte
├── TemplateCard.svelte
├── TemplateDetailModal.svelte
├── TemplateFSMDiagram.svelte
├── TemplateSchemaView.svelte
├── TemplateInheritance.svelte
├── CreateTemplateForm.svelte
└── EditTemplateForm.svelte
```

### Data Loading (+page.server.ts)

```typescript
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Template } from '$lib/types/onto';

export const load: PageServerLoad = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	const scope = url.searchParams.get('scope');
	const realm = url.searchParams.get('realm');
	const search = url.searchParams.get('search');

	// Fetch templates from API
	const client = createAdminSupabaseClient();
	const { data, error } = await client.rpc('get_template_catalog', {
		p_scope: scope,
		p_realm: realm,
		p_search: search
	});

	if (error) {
		console.error('[Templates] Failed to load:', error);
		throw error(500, 'Failed to load templates');
	}

	const templates = (data ?? []) as Template[];

	// Group by realm
	const grouped = templates.reduce(
		(acc, template) => {
			const templateRealm = template.metadata?.realm ?? 'other';
			if (!acc[templateRealm]) {
				acc[templateRealm] = [];
			}
			acc[templateRealm].push(template);
			return acc;
		},
		{} as Record<string, Template[]>
	);

	// Group by scope
	const byScope = templates.reduce(
		(acc, template) => {
			if (!acc[template.scope]) {
				acc[template.scope] = [];
			}
			acc[template.scope].push(template);
			return acc;
		},
		{} as Record<string, Template[]>
	);

	// Load facet definitions for filters
	const { data: facets } = await client
		.from('onto_facet_definitions')
		.select('key, name, allowed_values')
		.order('key');

	const facetMap =
		facets?.reduce(
			(acc, facet) => {
				acc[facet.key] = {
					name: facet.name,
					values: JSON.parse(facet.allowed_values)
				};
				return acc;
			},
			{} as Record<string, { name: string; values: string[] }>
		) ?? {};

	// Get facet value labels
	const { data: facetValues } = await client
		.from('onto_facet_values')
		.select('facet_key, value, label, description, color, icon, sort_order')
		.order('facet_key')
		.order('sort_order');

	const facetValueMap =
		facetValues?.reduce(
			(acc, fv) => {
				if (!acc[fv.facet_key]) {
					acc[fv.facet_key] = [];
				}
				acc[fv.facet_key].push({
					value: fv.value,
					label: fv.label,
					description: fv.description,
					color: fv.color,
					icon: fv.icon
				});
				return acc;
			},
			{} as Record<
				string,
				Array<{
					value: string;
					label: string;
					description: string;
					color: string;
					icon: string;
				}>
			>
		) ?? {};

	return {
		templates,
		grouped,
		byScope,
		facets: facetMap,
		facetValues: facetValueMap,
		currentFilters: {
			scope,
			realm,
			search
		},
		isAdmin: user.role === 'admin' // For showing admin actions
	};
};
```

### Main Page Component (+page.svelte)

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import TemplateCard from '$lib/components/ontology/templates/TemplateCard.svelte';
	import TemplateFilters from '$lib/components/ontology/templates/TemplateFilters.svelte';
	import TemplateDetailModal from '$lib/components/ontology/templates/TemplateDetailModal.svelte';
	import type { Template } from '$lib/types/onto';

	let { data } = $props();

	const templates = $derived(data.templates || []);
	const grouped = $derived(data.grouped || {});
	const byScope = $derived(data.byScope || {});
	const facets = $derived(data.facets || {});
	const facetValues = $derived(data.facetValues || {});
	const currentFilters = $derived(data.currentFilters || {});
	const isAdmin = $derived(data.isAdmin || false);

	let selectedTemplate = $state<Template | null>(null);
	let showDetailModal = $state(false);
	let viewMode = $state<'realm' | 'scope'>('realm');

	function openTemplateDetail(template: Template) {
		selectedTemplate = template;
		showDetailModal = true;
	}

	function closeDetailModal() {
		showDetailModal = false;
		selectedTemplate = null;
	}

	function createProjectFromTemplate(template: Template) {
		// Navigate to create page with pre-selected template
		goto(`/ontology/create?template=${template.id}`);
	}

	function updateFilters(filters: Record<string, string | null>) {
		const params = new URLSearchParams($page.url.searchParams);

		Object.entries(filters).forEach(([key, value]) => {
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
		});

		goto(`/ontology/templates?${params.toString()}`, {
			replaceState: true,
			noScroll: true
		});
	}
</script>

<svelte:head>
	<title>Templates | Ontology | BuildOS</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
	<!-- Header -->
	<header class="mb-8 sm:mb-12">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
					Ontology Templates
				</h1>
				<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400">
					Browse and discover {templates.length} templates across all domains
				</p>
			</div>

			{#if isAdmin}
				<a
					href="/ontology/templates/new"
					class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 text-blue-700 dark:text-blue-400 border-2 border-blue-600 dark:border-blue-500 rounded-lg font-semibold transition-all duration-300 hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-900/40 dark:hover:to-purple-900/40 hover:border-purple-600 dark:hover:border-purple-500 hover:text-purple-700 dark:hover:text-purple-400"
				>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					New Template
				</a>
			{/if}
		</div>
	</header>

	<!-- Filters -->
	<TemplateFilters
		{facets}
		{facetValues}
		{currentFilters}
		{byScope}
		onFilterChange={updateFilters}
		bind:viewMode
	/>

	<!-- Templates Display -->
	<div class="mt-8">
		{#if templates.length === 0}
			<!-- Empty State -->
			<div
				class="text-center py-16 sm:py-20 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600"
			>
				<div
					class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 text-gray-400 dark:text-gray-500"
				>
					<svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<h2 class="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
					No templates found
				</h2>
				<p class="text-gray-600 dark:text-gray-400 mb-6 px-4">
					Try adjusting your filters or search query
				</p>
				<button
					onclick={() => updateFilters({ scope: null, realm: null, search: null })}
					class="px-6 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-600"
				>
					Clear All Filters
				</button>
			</div>
		{:else if viewMode === 'realm'}
			<!-- Group by Realm -->
			<div class="space-y-12">
				{#each Object.entries(grouped) as [realm, realmTemplates]}
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-bold text-gray-900 dark:text-white capitalize">
								{realm}
							</h2>
							<span class="text-sm text-gray-500 dark:text-gray-400">
								{realmTemplates.length} template{realmTemplates.length !== 1
									? 's'
									: ''}
							</span>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{#each realmTemplates as template}
								<TemplateCard
									{template}
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Group by Scope -->
			<div class="space-y-12">
				{#each Object.entries(byScope) as [scope, scopeTemplates]}
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="text-2xl font-bold text-gray-900 dark:text-white capitalize">
								{scope}
							</h2>
							<span class="text-sm text-gray-500 dark:text-gray-400">
								{scopeTemplates.length} template{scopeTemplates.length !== 1
									? 's'
									: ''}
							</span>
						</div>

						<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
							{#each scopeTemplates as template}
								<TemplateCard
									{template}
									onViewDetails={() => openTemplateDetail(template)}
									onCreateProject={() => createProjectFromTemplate(template)}
								/>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Template Detail Modal -->
{#if showDetailModal && selectedTemplate}
	<TemplateDetailModal
		template={selectedTemplate}
		onClose={closeDetailModal}
		onCreateProject={() => createProjectFromTemplate(selectedTemplate)}
	/>
{/if}
```

### API Integration

The page uses the existing `/api/onto/templates` endpoint which already supports:

- ✅ Filtering by scope
- ✅ Filtering by realm (via metadata)
- ✅ Search by keywords
- ✅ Grouped response by realm

**Existing Endpoint:** `GET /api/onto/templates`

**Query Parameters:**

- `scope` - Filter by template scope (project, plan, task, output, document)
- `realm` - Filter by realm in metadata (creative, technical, business, etc.)
- `search` - Search by name, type_key, or keywords

**Response:**

```typescript
{
	templates: Template[],
	grouped: Record<string, Template[]>,
	count: number
}
```

---

## Integration Points

### With Existing Ontology Features

1. **Project Creation Flow** (`/ontology/create`)
    - Link from template detail to create project
    - Support pre-selected template via query param
    - Share template selection components

2. **Project List** (`/ontology`)
    - Show template name/type for each project
    - Link to template from project card
    - Filter projects by template type

3. **Project Detail** (`/ontology/projects/[id]`)
    - Show which template was used
    - Link to template detail page
    - Show FSM diagram from template

4. **Admin Dashboard** (`/admin`)
    - Template usage analytics
    - Template health monitoring
    - Bulk template operations

### Database Tables Used

```sql
-- Primary
onto_templates           -- Template definitions
onto_facet_definitions   -- Facet taxonomy
onto_facet_values        -- Facet value metadata

-- For Analytics
onto_projects            -- To show template usage
onto_template_usage      -- Analytics table (future)
```

### Services Integration

```typescript
// Template service
import { TemplateService } from '$lib/services/ontology/template.service';

// FSM visualization
import { FSMDiagramService } from '$lib/services/ontology/fsm-diagram.service';

// Template validation
import { validateFSMDef, validateProjectSpec } from '$lib/types/onto';
```

---

## Future Enhancements

### Phase 3: Advanced Management

1. **Template Versioning**
    - Track template schema changes over time
    - Migrate projects to new template versions
    - Rollback to previous template versions

2. **Template Marketplace**
    - Community-contributed templates
    - Template ratings and reviews
    - Template import/export

3. **Template AI Assistant**
    - AI-powered template suggestions
    - Generate templates from descriptions
    - Optimize FSM definitions

4. **Template Testing Framework**
    - Test FSM transitions
    - Validate schema against real data
    - Simulate project lifecycles

### Phase 4: Collaboration

1. **Template Comments/Discussion**
    - Discuss template improvements
    - Report template issues
    - Suggest enhancements

2. **Template Forks**
    - Fork templates for customization
    - Track template lineage
    - Merge improvements back

3. **Organization-Specific Templates**
    - Private templates per org
    - Template sharing permissions
    - Org template libraries

---

## Success Metrics

### User Engagement

- **Template Discovery Rate:** % of users who visit `/ontology/templates` within first week
- **Template Exploration Depth:** Average number of templates viewed per session
- **Template Detail Views:** Number of detail modal opens per user
- **Template-to-Project Conversion:** % of template views that result in project creation

### Template Ecosystem Health

- **Template Coverage:** % of user needs covered by existing templates
- **Template Usage Distribution:** Are templates being used evenly or is there concentration?
- **Template Quality:** User satisfaction ratings per template
- **Template Freshness:** Age of most recently updated templates

### Admin/Power User Metrics

- **Custom Template Creation Rate:** New templates created per month
- **Template Modification Rate:** Template edits per month
- **Template Promotion Time:** Average time from draft to active
- **Template Deprecation Rate:** Templates marked deprecated per quarter

---

## Acceptance Criteria

### For Phase 1 (MVP)

**Must pass all these tests:**

- [ ] User can browse all templates grouped by realm
- [ ] User can filter templates by scope
- [ ] User can filter templates by realm
- [ ] User can search templates by name/type_key
- [ ] User can clear all filters
- [ ] Template cards show all essential info (name, type_key, description, realm, scope)
- [ ] Template cards display facet defaults as badges
- [ ] User can view template details in modal
- [ ] User can create project from template card
- [ ] User can create project from detail view
- [ ] Page is responsive on mobile
- [ ] Page loads in < 2 seconds with 100 templates
- [ ] Empty state shown when no results
- [ ] Error state shown when API fails

**Admin-specific:**

- [ ] Admin can see "New Template" button
- [ ] Admin can access template creation page
- [ ] Regular users cannot access admin features

### For Phase 2 (Advanced)

- [ ] FSM diagram visualized correctly
- [ ] Template schema displayed in readable format
- [ ] Template inheritance chain shown
- [ ] Example projects listed
- [ ] Template sorting works
- [ ] Template favorites/bookmarks functional
- [ ] Admin can create templates via UI
- [ ] Admin can edit existing templates
- [ ] Template analytics dashboard working

---

## Technical Constraints

### Performance

- **Page Load:** < 2 seconds with 100+ templates
- **Filter Response:** < 100ms for client-side filters
- **Search Response:** < 300ms for server-side search
- **API Response:** < 500ms for template catalog endpoint

### Accessibility

- **WCAG 2.1 AA Compliance**
- Keyboard navigation for all actions
- Screen reader support for template cards
- Focus management in modals
- Semantic HTML structure

### Browser Support

- Chrome/Edge (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Mobile Safari (iOS 14+)
- Mobile Chrome (Android 10+)

---

## Related Documentation

- **Ontology Master Plan:** `/thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md`
- **Implementation Roadmap:** `/thoughts/shared/ideas/ontology/ontology-implementation-roadmap.md`
- **Outputs Taxonomy:** `/thoughts/shared/ideas/ontology/buildos-outputs.md`
- **Type Definitions:** `/apps/web/src/lib/types/onto.ts`
- **Existing Endpoint:** `/apps/web/src/routes/api/onto/templates/+server.ts`
- **Project Creation:** `/apps/web/src/routes/ontology/create/+page.svelte`

---

## Open Questions

1. **Should templates be editable by non-admins?**
    - Option A: Admin-only (safer, cleaner)
    - Option B: Power users can create/edit (more flexible)
    - **Recommendation:** Start with admin-only, add power user access in Phase 2

2. **How to handle template versioning?**
    - Option A: New template ID per version
    - Option B: Version number in same template record
    - **Recommendation:** Version number in same record, track history in audit table

3. **Should FSM diagrams be interactive?**
    - Option A: Static SVG/image
    - Option B: Interactive with clickable states/transitions
    - **Recommendation:** Start static, add interactivity in Phase 2

4. **Template detail: Modal or dedicated page?**
    - Option A: Modal (faster, less navigation)
    - Option B: Dedicated page (shareable URL, better for deep exploration)
    - **Recommendation:** Start with modal, add dedicated page in Phase 2

5. **How to handle abstract templates?**
    - Option A: Hide from main browse (advanced users only)
    - Option B: Show with clear "Abstract" badge
    - **Recommendation:** Show with badge, disable "Create Project" action

---

## Appendix: Component Specifications

### TemplateCard.svelte Props

```typescript
interface TemplateCardProps {
	template: Template;
	onViewDetails: () => void;
	onCreateProject: () => void;
	compact?: boolean; // For smaller displays
	showActions?: boolean; // Show action buttons
}
```

### TemplateFilters.svelte Props

```typescript
interface TemplateFiltersProps {
	facets: Record<string, { name: string; values: string[] }>;
	facetValues: Record<
		string,
		Array<{
			value: string;
			label: string;
			description: string;
			color: string;
			icon: string;
		}>
	>;
	currentFilters: {
		scope?: string | null;
		realm?: string | null;
		search?: string | null;
	};
	byScope: Record<string, Template[]>;
	onFilterChange: (filters: Record<string, string | null>) => void;
	viewMode: 'realm' | 'scope';
}
```

### TemplateDetailModal.svelte Props

```typescript
interface TemplateDetailModalProps {
	template: Template;
	onClose: () => void;
	onCreateProject: () => void;
	showAdminActions?: boolean;
}
```

---

**End of Specification**

This spec provides a complete blueprint for implementing the `/ontology/templates` page. It can be built incrementally, starting with Phase 1 (Core Browsing) and expanding to Phase 2+ (Advanced Features) as the system matures.
