---
date: 2025-10-11T19:09:50+0000
researcher: Claude
git_commit: 8c174f8ad0770686342224a27be3db2bb810938b
branch: main
repository: buildos-platform
topic: 'Project Braindumps Tab - Research & Specification'
tags: [research, braindumps, project-page, ui-spec, responsive-design]
status: complete
last_updated: 2025-10-11
last_updated_by: Claude
path: thoughts/shared/research/2025-10-11_19-09-50_project-braindumps-tab-spec.md
---

# Research: Project Braindumps Tab - Complete Specification

**Date**: 2025-10-11T19:09:50+0000
**Researcher**: Claude
**Git Commit**: 8c174f8ad0770686342224a27be3db2bb810938b
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should we implement a Braindumps tab on the `/projects/[id]` page that displays all braindumps related to the project with sortable, responsive cards showing title, 2-line expandable preview, linked tasks, and creation date?

## Executive Summary

Based on comprehensive research of the existing codebase, I've identified:

1. **Existing Infrastructure**: The project detail page (`/apps/web/src/routes/(app)/projects/[id]/+page.svelte`) has a robust tab system with lazy loading, perfect for adding a new braindumps tab
2. **Reusable Components**: `BraindumpHistoryCard.svelte` provides an excellent foundation with border-based design, status indicators, and responsive layout
3. **Data Layer**: The `brain_dump_links` table provides complete relationships between braindumps, projects, and tasks
4. **Design Patterns**: Established patterns for sortable lists (TasksList), responsive cards (PhaseCard, ProjectCard), and mobile-first design

## Detailed Findings

### 1. Project Page Architecture

**File**: `/apps/web/src/routes/(app)/projects/[id]/+page.svelte` (1,591 lines)

**Current Tab System**:

- 5 existing tabs: Overview, Tasks, Daily Briefs, Notes, AI Summary
- Tab component: `/apps/web/src/lib/components/project/ProjectTabs.svelte` (120 lines)
- Lazy-loaded tab content with progressive data loading
- State managed in `projectStoreV2` (`/apps/web/src/lib/stores/project.store.ts`)

**Key Architecture Patterns**:

```typescript
// Tab definition
{
  id: 'braindumps',
  label: 'Brain Dumps',
  icon: Brain,
  mobileLabel: 'Dumps',
  count: braindumpCount
}

// Lazy loading pattern
let BraindumpsSection = $state<any>(null);

async function loadComponent(name: string) {
  if (name === 'BraindumpsSection') {
    BraindumpsSection = (await import('$lib/components/project/BraindumpsSection.svelte')).default;
  }
}
```

### 2. Existing Braindump Components

**Primary Card Component**: `/apps/web/src/lib/components/history/BraindumpHistoryCard.svelte`

**Features**:

- Border-based design with color coding (amber for unlinked, green for new projects, purple for regular)
- Two-section layout: header (project/type + time) and content (preview + metadata)
- `line-clamp-2` text truncation with stripped markdown
- Hover-revealed delete button
- Status indicators (processed, processing, pending)
- Search highlighting support
- Responsive spacing: `px-3 py-2 sm:px-4 sm:py-3`

**Data Structure**:

```typescript
interface Braindump {
	id: string;
	content: string;
	ai_summary?: string;
	status: 'processed' | 'processing' | 'pending';
	updated_at: string;
	created_at: string;
	isNote: boolean;
	isNewProject: boolean;
	linkedProject: { id: string; name: string } | null;
	linkedTypes: Array<'project' | 'task' | 'note'>;
}
```

**Modal Component**: `/apps/web/src/lib/components/history/BraindumpModalHistory.svelte`

- Full content view with markdown rendering
- Linked tasks/notes/projects sections
- Expandable sections
- Footer metadata (word count, link count, dates)

### 3. Database Schema: `brain_dump_links`

**Location**: `/packages/shared-types/src/database.schema.ts:141-148`

```typescript
brain_dump_links: {
	id: number;
	brain_dump_id: string; // FK → brain_dumps.id
	created_at: string;
	note_id: string | null; // FK → notes.id
	project_id: string | null; // FK → projects.id
	task_id: string | null; // FK → tasks.id
}
```

**Query Pattern for Project Braindumps**:

```typescript
const { data } = await supabase
	.from('brain_dump_links')
	.select(
		`
    brain_dump_id,
    created_at as linked_at,
    task_id,
    note_id,
    brain_dumps!inner (
      id, title, content, ai_summary, status,
      created_at, updated_at, user_id
    ),
    tasks (id, title, status, position),
    notes (id, title)
  `
	)
	.eq('project_id', projectId)
	.order('created_at', { ascending: false });
```

**Relationship Structure**:

- One braindump can link to multiple entities
- Task links typically include both `task_id` and `project_id`
- Created by `OperationsExecutor.createBrainDumpLinks()` during brain dump processing

**Existing API**: `/apps/web/src/routes/api/tasks/[id]/braindumps/+server.ts`

- Similar pattern can be used for project braindumps endpoint

### 4. Sortable List Patterns

**Reference Implementation**: `/apps/web/src/lib/components/project/TasksList.svelte`

**Sort UI Pattern**:

- Dropdown button for sort field selection (ChevronDown icon)
- Toggle button for direction (ArrowUp/ArrowDown icons)
- Sort fields: `created_at`, `updated_at`, custom fields

**State Management (Svelte 5 Runes)**:

```typescript
let sortField: SortField = $state('created_at');
let sortDirection: SortDirection = $state('desc');
let showSortDropdown = $state(false);

function setSortField(field: SortField) {
	if (sortField === field) {
		sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
	} else {
		sortField = field;
		sortDirection = 'desc';
	}
	showSortDropdown = false;
}

// Reactive sorting with $derived
let sortedBraindumps = $derived(
	braindumps.sort((a, b) => {
		const aDate = new Date(a[sortField]);
		const bDate = new Date(b[sortField]);
		const comparison = aDate.getTime() - bDate.getTime();
		return sortDirection === 'desc' ? -comparison : comparison;
	})
);
```

### 5. Responsive Design Patterns

**Card Layout Standards**:

```css
/* Container */
bg-white dark:bg-gray-800
rounded-lg
shadow-sm hover:shadow-md
border-2 border-gray-200 dark:border-gray-700
transition-all duration-200

/* Responsive padding */
px-3 py-2 sm:px-4 sm:py-3

/* Responsive typography */
text-xs sm:text-sm
text-sm sm:text-base

/* Responsive icons */
w-4 h-4 sm:w-5 sm:h-5
```

**Grid Layouts**:

```svelte
<!-- Standard pattern: 1 → 2 → 3 columns -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

**Mobile-First Approach**:

- Default to vertical stacking
- Hide non-essential elements on mobile: `<span class="hidden sm:inline">`
- Adjust spacing: `gap-2 sm:gap-3 md:gap-4`
- Touch-friendly targets: minimum 44px height

**Line Clamping**:

```typescript
// Utility function
function truncateContent(content: string, maxLength: number = 150): string {
  const stripped = content.replace(/[#*_`]/g, '').trim();
  return stripped.length > maxLength
    ? stripped.substring(0, maxLength) + '...'
    : stripped;
}

// CSS class
class="line-clamp-2"  // Shows 2 lines, ellipsis on overflow
```

## Architecture Insights

### Data Flow Pattern

```
Server Load (minimal) → Store Init → Progressive Load → Real-time Sync
                                         ↓
                                  Tab Switch Event
                                         ↓
                              Load Component (lazy)
                                         ↓
                              Load Data (if needed)
                                         ↓
                              Render with Skeleton
```

### Component Hierarchy

```
+page.svelte
├── ProjectHeader
├── ProjectTabs (presentation only)
├── Tab Content Container
│   ├── OverviewTab (PhasesSection - lazy)
│   ├── TasksTab (TasksList - lazy)
│   ├── BriefsTab (ProjectBriefsSection - always loaded)
│   ├── NotesTab (NotesSection - lazy)
│   ├── SynthesisTab (ProjectSynthesis - lazy)
│   └── BraindumpsTab (BraindumpsSection - lazy) ← NEW
└── ProjectModals
```

### Store Integration

The `projectStoreV2` should be extended to include:

```typescript
interface ProjectStoreV2State {
	// Existing fields...
	braindumps: BraindumpWithLinks[] | null;
	loadingStates: {
		// Existing fields...
		braindumps: LoadingState;
	};
}
```

---

## Feature Specification: Project Braindumps Tab

### 1. Overview

Add a new "Brain Dumps" tab to the project detail page that displays all braindumps associated with the project, including those that created tasks, notes, or the project itself.

### 2. User Stories

**As a user, I want to:**

1. See all braindumps related to my project in one place
2. View a preview of each braindump's content without opening it
3. Expand braindumps to read full content
4. See which tasks were generated from each braindump
5. Sort braindumps by date created or date linked
6. Click through to linked tasks
7. View braindumps on both mobile and desktop devices

### 3. Component Specification

#### 3.1 Tab Definition

**File**: `/apps/web/src/lib/components/project/ProjectTabs.svelte`

Add new tab:

```typescript
{
  id: 'braindumps',
  label: 'Brain Dumps',
  icon: Brain,  // from lucide-svelte
  mobileLabel: 'Dumps',
  count: braindumpCount,
  hideCount: false
}
```

Update `ExtendedTabType`:

```typescript
type ExtendedTabType = 'overview' | 'tasks' | 'briefs' | 'notes' | 'synthesis' | 'braindumps'; // Add this
```

#### 3.2 Main Component: `BraindumpsSection.svelte`

**Location**: `/apps/web/src/lib/components/project/BraindumpsSection.svelte`

**Purpose**: Container component for the braindumps tab content

**Props**:

```typescript
interface Props {
	onOpenBraindump?: (braindump: BraindumpWithLinks) => void;
	onDeleteBraindump?: (braindumpId: string) => void;
}
```

**State**:

```typescript
import { projectStoreV2 } from '$lib/stores/project.store';

// Sort state
let sortField: 'created_at' | 'linked_at' = $state('linked_at');
let sortDirection: 'asc' | 'desc' = $state('desc');
let showSortDropdown = $state(false);

// UI state
let expandedBraindumpIds = $state(new Set<string>());
let selectedBraindump = $state<BraindumpWithLinks | null>(null);
let showDetailModal = $state(false);

// Data from store
$: storeState = $projectStoreV2;
$: braindumps = storeState.braindumps || [];
$: isLoading = storeState.loadingStates.braindumps === 'loading';
```

**Computed Values**:

```typescript
// Sorted braindumps
let sortedBraindumps = $derived(
	[...braindumps].sort((a, b) => {
		const aDate = new Date(a[sortField]);
		const bDate = new Date(b[sortField]);
		const comparison = aDate.getTime() - bDate.getTime();
		return sortDirection === 'desc' ? -comparison : comparison;
	})
);

// Braindump count
let braindumpCount = $derived(braindumps.length);
```

**Layout Structure**:

```svelte
<div class="space-y-4">
	<!-- Header with sort controls -->
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold">
			Brain Dumps ({braindumpCount})
		</h2>

		<!-- Sort controls -->
		<div class="flex items-center gap-2">
			<!-- Sort field dropdown -->
			<Button
				variant="outline"
				size="sm"
				icon={ChevronDown}
				iconPosition="right"
				onclick={() => (showSortDropdown = !showSortDropdown)}
			>
				{sortField === 'created_at' ? 'Created' : 'Linked'}
			</Button>

			<!-- Sort direction toggle -->
			<Button
				variant="outline"
				size="sm"
				icon={sortDirection === 'desc' ? ArrowDown : ArrowUp}
				onclick={() => (sortDirection = sortDirection === 'desc' ? 'asc' : 'desc')}
				title={sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
			/>
		</div>
	</div>

	<!-- Braindump cards grid -->
	{#if isLoading}
		<LoadingSkeleton message="Loading braindumps..." height="200px" />
	{:else if sortedBraindumps.length === 0}
		<EmptyState
			icon={Brain}
			title="No brain dumps yet"
			description="Brain dumps that create or modify this project will appear here."
		/>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each sortedBraindumps as braindump (braindump.id)}
				<BraindumpProjectCard
					{braindump}
					isExpanded={expandedBraindumpIds.has(braindump.id)}
					onToggleExpand={() => toggleExpand(braindump.id)}
					onClick={() => handleBraindumpClick(braindump)}
					onDelete={() => onDeleteBraindump?.(braindump.id)}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Detail modal -->
{#if showDetailModal && selectedBraindump}
	<BraindumpModalHistory
		braindump={selectedBraindump}
		isOpen={showDetailModal}
		onClose={() => (showDetailModal = false)}
		on:delete={handleDelete}
	/>
{/if}
```

**Functions**:

```typescript
function toggleExpand(braindumpId: string) {
	if (expandedBraindumpIds.has(braindumpId)) {
		expandedBraindumpIds.delete(braindumpId);
	} else {
		expandedBraindumpIds.add(braindumpId);
	}
	expandedBraindumpIds = expandedBraindumpIds; // Trigger reactivity
}

function handleBraindumpClick(braindump: BraindumpWithLinks) {
	selectedBraindump = braindump;
	showDetailModal = true;
	onOpenBraindump?.(braindump);
}

function handleDelete(event: CustomEvent) {
	const { braindump } = event.detail;
	onDeleteBraindump?.(braindump.id);
}
```

#### 3.3 Card Component: `BraindumpProjectCard.svelte`

**Location**: `/apps/web/src/lib/components/project/BraindumpProjectCard.svelte`

**Purpose**: Individual braindump card with preview, expand/collapse, and linked tasks

**Props**:

```typescript
interface Props {
	braindump: BraindumpWithLinks;
	isExpanded?: boolean;
	onToggleExpand?: () => void;
	onClick?: () => void;
	onDelete?: () => void;
}

export let braindump: BraindumpWithLinks;
export let isExpanded: boolean = false;
export let onToggleExpand: (() => void) | undefined = undefined;
export let onClick: (() => void) | undefined = undefined;
export let onDelete: (() => void) | undefined = undefined;
```

**Data Structure**:

```typescript
interface BraindumpWithLinks {
	id: string;
	title: string;
	content: string;
	ai_summary?: string;
	status: 'processed' | 'processing' | 'pending';
	created_at: string;
	updated_at: string;
	linked_at: string; // When linked to project
	linked_tasks: {
		id: string;
		title: string;
		status: string;
		position: number;
	}[];
	linked_notes: {
		id: string;
		title: string;
	}[];
}
```

**Layout Structure**:

```svelte
<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2
         transition-all cursor-pointer group hover:shadow-md
         {getBorderColor(braindump)}"
	role="button"
	tabindex="0"
	onclick={onClick}
	onkeydown={handleKeyDown}
>
	<!-- Header: Title + Time + Actions -->
	<div class="px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-start justify-between gap-2">
			<!-- Title or "Untitled" -->
			<div class="flex-1 min-w-0">
				<h3
					class="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 truncate"
				>
					{braindump.title || 'Untitled Brain Dump'}
				</h3>
			</div>

			<!-- Time + Actions -->
			<div class="flex items-center gap-2 flex-shrink-0">
				<!-- Creation date -->
				<span class="text-xs text-gray-500 dark:text-gray-400">
					{getTimeDisplay(braindump.created_at)}
				</span>

				<!-- Delete button (hover reveal) -->
				<button
					class="opacity-0 group-hover:opacity-100 transition-opacity p-1
                 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
					onclick={(e) => {
						e.stopPropagation();
						onDelete?.();
					}}
					title="Delete braindump"
				>
					<Trash2 class="w-4 h-4 text-gray-500 hover:text-red-600" />
				</button>
			</div>
		</div>
	</div>

	<!-- Content Section -->
	<div class="px-3 py-2 sm:px-4 sm:py-3">
		<!-- Content preview (2 lines or expanded) -->
		<div class="mb-3">
			{#if isExpanded}
				<div class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
					{braindump.content}
				</div>
			{:else}
				<div class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
					{truncateContent(braindump.content)}
				</div>
			{/if}

			<!-- Expand/Collapse button -->
			{#if braindump.content.length > 150}
				<button
					class="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1"
					onclick={(e) => {
						e.stopPropagation();
						onToggleExpand?.();
					}}
				>
					{isExpanded ? 'Show less' : 'Show more'}
				</button>
			{/if}
		</div>

		<!-- Footer: Linked tasks + Status -->
		<div class="flex items-center justify-between gap-2">
			<!-- Linked tasks -->
			<div class="flex items-center gap-2 flex-wrap">
				{#if braindump.linked_tasks.length > 0}
					<div class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
						<CheckSquare class="w-3 h-3" />
						<span
							>{braindump.linked_tasks.length} task{braindump.linked_tasks.length > 1
								? 's'
								: ''}</span
						>
					</div>

					<!-- Task links (first 3) -->
					<div class="flex items-center gap-1">
						{#each braindump.linked_tasks.slice(0, 3) as task}
							<a
								href="#"
								class="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20
                       text-blue-700 dark:text-blue-300 hover:bg-blue-100
                       dark:hover:bg-blue-900/30 transition-colors"
								onclick={(e) => {
									e.stopPropagation();
									// Open task modal
								}}
								title={task.title}
							>
								{task.title.substring(0, 20)}{task.title.length > 20 ? '...' : ''}
							</a>
						{/each}

						{#if braindump.linked_tasks.length > 3}
							<span class="text-xs text-gray-500">
								+{braindump.linked_tasks.length - 3} more
							</span>
						{/if}
					</div>
				{/if}

				{#if braindump.linked_notes.length > 0}
					<div class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
						<FileText class="w-3 h-3" />
						<span
							>{braindump.linked_notes.length} note{braindump.linked_notes.length > 1
								? 's'
								: ''}</span
						>
					</div>
				{/if}
			</div>

			<!-- Status badge -->
			<div class="flex-shrink-0">
				<StatusBadge status={braindump.status} size="sm" />
			</div>
		</div>
	</div>
</div>
```

**Helper Functions**:

```typescript
function truncateContent(content: string, maxLength: number = 150): string {
	const stripped = content.replace(/[#*_`]/g, '').trim();
	return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
}

function getTimeDisplay(dateStr: string): string {
	const date = new Date(dateStr);
	const hoursAgo = differenceInHours(new Date(), date);

	if (hoursAgo < 24) {
		return formatDistanceToNow(date, { addSuffix: true });
	}

	return format(date, 'MMM d, yyyy');
}

function getBorderColor(braindump: BraindumpWithLinks): string {
	// Regular braindumps
	return 'border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700';
}

function handleKeyDown(event: KeyboardEvent) {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		onClick?.();
	}
}
```

**Responsive Styles**:

- Card padding: `px-3 py-2 sm:px-4 sm:py-3`
- Title text: `text-sm sm:text-base`
- Content text: `text-sm`
- Icon sizes: `w-3 h-3` (small badges), `w-4 h-4` (regular)
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

### 4. Data Layer

#### 4.1 API Endpoint

**File**: `/apps/web/src/routes/api/projects/[id]/braindumps/+server.ts` (NEW)

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { id: projectId } = params;
	const session = await locals.getSession();

	if (!session?.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabase = locals.supabase;

	// Get all braindumps linked to this project
	const { data: braindumpLinks, error } = await supabase
		.from('brain_dump_links')
		.select(
			`
      brain_dump_id,
      created_at as linked_at,
      task_id,
      note_id,
      brain_dumps!inner (
        id,
        title,
        content,
        ai_summary,
        status,
        created_at,
        updated_at,
        user_id
      ),
      tasks (
        id,
        title,
        status,
        position
      ),
      notes (
        id,
        title
      )
    `
		)
		.eq('project_id', projectId)
		.eq('brain_dumps.user_id', session.user.id)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching project braindumps:', error);
		return json({ error: 'Failed to fetch braindumps' }, { status: 500 });
	}

	// Transform data to group by braindump
	const braindumpsMap = new Map<string, any>();

	for (const link of braindumpLinks || []) {
		const braindump = link.brain_dumps;
		const braindumpId = braindump.id;

		if (!braindumpsMap.has(braindumpId)) {
			braindumpsMap.set(braindumpId, {
				...braindump,
				linked_at: link.linked_at,
				linked_tasks: [],
				linked_notes: []
			});
		}

		const bd = braindumpsMap.get(braindumpId);

		if (link.task_id && link.tasks) {
			// Avoid duplicates
			if (!bd.linked_tasks.find((t: any) => t.id === link.tasks.id)) {
				bd.linked_tasks.push(link.tasks);
			}
		}

		if (link.note_id && link.notes) {
			if (!bd.linked_notes.find((n: any) => n.id === link.notes.id)) {
				bd.linked_notes.push(link.notes);
			}
		}
	}

	// Convert map to array and sort tasks by position
	const braindumps = Array.from(braindumpsMap.values()).map((bd) => ({
		...bd,
		linked_tasks: bd.linked_tasks.sort((a: any, b: any) => a.position - b.position)
	}));

	return json({ braindumps });
};
```

#### 4.2 Store Integration

**File**: `/apps/web/src/lib/stores/project.store.ts`

Add to store state:

```typescript
interface ProjectStoreV2State {
	// ... existing fields

	braindumps: BraindumpWithLinks[] | null;

	loadingStates: {
		// ... existing fields
		braindumps: LoadingState;
	};

	lastFetch: {
		// ... existing fields
		braindumps?: number;
	};
}
```

Add data loading function:

```typescript
async loadBraindumps(force = false): Promise<void> {
  const state = get(projectStoreV2);

  if (!state.project?.id) return;

  // Check cache
  const cacheKey = `braindumps-${state.project.id}`;
  const cached = state.cache.get(cacheKey);
  const now = Date.now();

  if (!force && cached && now - cached.timestamp < CACHE_TTL) {
    updateStoreState({
      braindumps: cached.data,
      loadingStates: { ...state.loadingStates, braindumps: 'success' }
    });
    return;
  }

  // Set loading state
  updateStoreState({
    loadingStates: { ...state.loadingStates, braindumps: 'loading' }
  });

  try {
    const response = await fetch(`/api/projects/${state.project.id}/braindumps`);

    if (!response.ok) {
      throw new Error('Failed to load braindumps');
    }

    const { braindumps } = await response.json();

    // Update cache
    state.cache.set(cacheKey, {
      data: braindumps,
      timestamp: now
    });

    updateStoreState({
      braindumps,
      loadingStates: { ...state.loadingStates, braindumps: 'success' },
      lastFetch: { ...state.lastFetch, braindumps: now }
    });
  } catch (error) {
    console.error('Error loading braindumps:', error);
    updateStoreState({
      loadingStates: { ...state.loadingStates, braindumps: 'error' }
    });
  }
}
```

Add to progressive loading in `+page.svelte`:

```typescript
$effect(() => {
	if (project?.id && activeTab === 'braindumps') {
		// Load braindumps when tab is active
		projectStoreV2.loadBraindumps();
	}
});
```

### 5. Integration with Project Page

**File**: `/apps/web/src/routes/(app)/projects/[id]/+page.svelte`

#### 5.1 Add Tab to ProjectTabs

```typescript
const tabs = [
	// ... existing tabs
	{
		id: 'braindumps',
		label: 'Brain Dumps',
		icon: Brain,
		mobileLabel: 'Dumps',
		count: $projectStoreV2.braindumps?.length || 0,
		hideCount: false
	}
];
```

#### 5.2 Add Lazy Loading

```typescript
// Component state
let BraindumpsSection = $state<any>(null);

// Load component function
async function loadComponent(name: string, tab: string) {
	// ... existing cases

	if (name === 'BraindumpsSection') {
		BraindumpsSection = (await import('$lib/components/project/BraindumpsSection.svelte'))
			.default;
	}
}

// Tab loading effect
$effect(() => {
	if (activeTab === 'braindumps' && !BraindumpsSection) {
		loadComponent('BraindumpsSection', 'braindumps');
	}
});
```

#### 5.3 Add Tab Content

```svelte
<!-- Braindumps Tab -->
<div class:hidden={activeTab !== 'braindumps'}>
	{#if activeTab === 'braindumps'}
		{#if shouldShowSkeleton && loadingStates.braindumps === 'loading'}
			<LoadingSkeleton message="Loading brain dumps..." height="300px" />
		{:else if BraindumpsSection}
			<BraindumpsSection
				onOpenBraindump={(bd) => handleOpenBraindump(bd)}
				onDeleteBraindump={(id) => handleDeleteBraindump(id)}
			/>
		{:else}
			<LoadingSkeleton message={loadingMessage} height="200px" />
		{/if}
	{/if}
</div>
```

#### 5.4 Add Handler Functions

```typescript
function handleOpenBraindump(braindump: BraindumpWithLinks) {
	// Optional: track analytics
	console.log('Opened braindump:', braindump.id);
}

async function handleDeleteBraindump(braindumpId: string) {
	// Optimistic update
	const state = $projectStoreV2;
	const previousBraindumps = state.braindumps;

	projectStoreV2.updateStoreState({
		braindumps: state.braindumps?.filter((bd) => bd.id !== braindumpId) || null
	});

	try {
		const response = await fetch(`/api/braindumps/${braindumpId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			throw new Error('Failed to delete braindump');
		}

		// Show success toast
		toastStore.success('Brain dump deleted');
	} catch (error) {
		// Rollback on error
		projectStoreV2.updateStoreState({
			braindumps: previousBraindumps
		});

		toastStore.error('Failed to delete brain dump');
		console.error('Error deleting braindump:', error);
	}
}
```

### 6. TypeScript Types

**File**: `/apps/web/src/lib/types/braindump.ts` (NEW)

```typescript
export interface BraindumpWithLinks {
	id: string;
	title: string;
	content: string;
	ai_summary?: string;
	status: 'processed' | 'processing' | 'pending';
	created_at: string;
	updated_at: string;
	linked_at: string;
	linked_tasks: LinkedTask[];
	linked_notes: LinkedNote[];
}

export interface LinkedTask {
	id: string;
	title: string;
	status: string;
	position: number;
}

export interface LinkedNote {
	id: string;
	title: string;
}

export type BraindumpSortField = 'created_at' | 'linked_at';
export type SortDirection = 'asc' | 'desc';
```

### 7. Mobile Responsive Behavior

#### Desktop (≥768px)

- 3-column grid for cards
- Full task titles visible
- Hover effects for delete button
- Larger spacing and padding
- Status badges always visible

#### Tablet (640px - 767px)

- 2-column grid for cards
- Truncated task titles (20 chars)
- Touch-optimized tap targets
- Medium spacing

#### Mobile (<640px)

- Single column layout
- Compact padding (`px-3 py-2`)
- Smaller text sizes (`text-xs`, `text-sm`)
- Delete button always visible (no hover)
- "+N more" for overflow tasks
- "Show more" button for long content

### 8. Empty States

**No Braindumps**:

```svelte
<EmptyState
	icon={Brain}
	title="No brain dumps yet"
	description="Brain dumps that create or modify this project will appear here."
	action={{
		label: 'Create Brain Dump',
		onclick: () => goto('/dashboard') // Or open brain dump modal
	}}
/>
```

**Loading State**:

```svelte
<LoadingSkeleton message="Loading brain dumps..." height="300px" />
```

**Error State**:

```svelte
<ErrorState
	title="Failed to load brain dumps"
	description="There was an error loading brain dumps. Please try again."
	action={{
		label: 'Retry',
		onclick: () => projectStoreV2.loadBraindumps(true)
	}}
/>
```

### 9. Accessibility

**Keyboard Navigation**:

- Tab through cards with `Tab` key
- Activate cards with `Enter` or `Space`
- Delete with `Delete` or `Backspace` when focused
- Sort dropdown with arrow keys

**Screen Reader Support**:

```svelte
<div
  role="button"
  tabindex="0"
  aria-label="Brain dump: {braindump.title || 'Untitled'}"
  aria-expanded={isExpanded}
  onclick={onClick}
>
```

**ARIA Labels**:

- Sort buttons: `aria-label="Sort by {field}"`
- Direction toggle: `aria-label="Sort direction: {direction}"`
- Delete button: `aria-label="Delete brain dump"`
- Expand button: `aria-label="{isExpanded ? 'Collapse' : 'Expand'} content"`

### 10. Performance Considerations

**Lazy Loading**:

- Component loaded only when tab is activated
- Data loaded on first tab visit, then cached

**Optimization**:

- Virtual scrolling if >100 braindumps (future enhancement)
- Intersection Observer for card animations
- Debounced search/filter (future enhancement)

**Caching**:

- Store-level cache with 1-2 minute TTL
- Invalidate cache on create/update/delete operations
- Force refresh with pull-to-refresh (mobile)

### 11. Testing Strategy

**Unit Tests**:

- `BraindumpProjectCard.svelte`: Rendering, expand/collapse, event handlers
- `BraindumpsSection.svelte`: Sorting, filtering, empty states
- Store functions: `loadBraindumps()`, cache invalidation

**Integration Tests**:

- API endpoint: `/api/projects/[id]/braindumps`
- Tab switching: Data loading on activation
- Modal integration: Click card → open modal

**E2E Tests**:

- Complete user flow: Navigate to project → Click braindumps tab → View cards
- Sort by created/linked date
- Expand/collapse content
- Click task links
- Delete braindump

**Visual Regression Tests**:

- Card appearance (desktop/mobile)
- Empty states
- Loading states
- Dark mode

### 12. Future Enhancements

**Phase 2**:

1. **Search/Filter**: Search braindump content, filter by status
2. **Bulk Operations**: Select multiple, delete/export
3. **Export**: Download braindumps as markdown/JSON
4. **Inline Editing**: Edit title/content directly
5. **AI Summary Toggle**: Show AI summary instead of raw content

**Phase 3**:

1. **Virtual Scrolling**: For projects with 100+ braindumps
2. **Timeline View**: Chronological visualization
3. **Graph View**: Connections between braindumps and tasks
4. **Auto-refresh**: Real-time updates with WebSocket

---

## Implementation Checklist

### Phase 1: Data Layer

- [ ] Create `/api/projects/[id]/braindumps/+server.ts` endpoint
- [ ] Add TypeScript types: `BraindumpWithLinks`, `LinkedTask`, `LinkedNote`
- [ ] Update `project.store.ts` with braindumps state
- [ ] Add `loadBraindumps()` function to store
- [ ] Test API endpoint with Postman/curl

### Phase 2: Components

- [ ] Create `BraindumpProjectCard.svelte` component
- [ ] Create `BraindumpsSection.svelte` container
- [ ] Add reusable `StatusBadge.svelte` (if not exists)
- [ ] Test components in isolation with mock data

### Phase 3: Tab Integration

- [ ] Update `ProjectTabs.svelte` with new tab definition
- [ ] Add lazy loading in `+page.svelte`
- [ ] Add tab content section
- [ ] Add event handlers (open, delete)
- [ ] Test tab switching and data loading

### Phase 4: Polish

- [ ] Add empty states (no braindumps, error)
- [ ] Add loading skeletons
- [ ] Implement responsive styles (mobile/tablet/desktop)
- [ ] Add keyboard navigation
- [ ] Add ARIA labels and screen reader support
- [ ] Test dark mode

### Phase 5: Testing

- [ ] Write unit tests for components
- [ ] Write integration tests for API
- [ ] Write E2E tests for user flows
- [ ] Visual regression tests
- [ ] Manual testing on mobile devices

### Phase 6: Documentation

- [ ] Update project page README
- [ ] Add component documentation
- [ ] Update CHANGELOG
- [ ] Create usage guide for users

---

## Code References

### Key Files

**Existing Components to Reference**:

- `/apps/web/src/lib/components/history/BraindumpHistoryCard.svelte` - Card design pattern
- `/apps/web/src/lib/components/project/TasksList.svelte` - Sortable list pattern
- `/apps/web/src/lib/components/project/PhaseCard.svelte` - Responsive card with expand/collapse
- `/apps/web/src/routes/(app)/projects/[id]/+page.svelte:441-500` - Tab loading logic

**Data Models**:

- `/packages/shared-types/src/database.schema.ts:141-148` - `brain_dump_links` table
- `/apps/web/src/routes/api/tasks/[id]/braindumps/+server.ts` - Similar API pattern

**Store**:

- `/apps/web/src/lib/stores/project.store.ts:1-1509` - Project store implementation

**Design System**:

- `/apps/web/src/lib/components/ui/Button.svelte` - Button component
- `/apps/web/src/lib/components/ui/EmptyState.svelte` - Empty state component
- `/apps/web/src/lib/components/ui/LoadingSkeleton.svelte` - Loading skeleton

---

## Related Documentation

- **Project Page Architecture**: `/apps/web/src/routes/(app)/projects/[id]/README.md`
- **Brain Dump Feature**: `/apps/web/docs/features/brain-dump/README.md`
- **Task-Braindump Associations**: `/thoughts/shared/research/2025-10-08_02-30-00_task-braindump-associations-spec.md`
- **Component Patterns**: `/apps/web/docs/design/PROJECT_PAGE_COMPONENT_PATTERNS.md`

---

## Open Questions

1. Should we show braindumps that only created the project itself (no tasks/notes)?
2. Should we support filtering by braindump status (processed/processing/pending)?
3. Should task links open the TaskModal or navigate to the task detail page?
4. Should we add a "Create Brain Dump" button in the empty state?
5. Should we show the AI summary instead of raw content for processed braindumps?

---

## Summary

This specification provides a complete blueprint for adding a Braindumps tab to the project detail page. The implementation leverages existing components (`BraindumpHistoryCard`), follows established patterns (lazy loading, sortable lists), and integrates seamlessly with the existing architecture.

**Key Design Decisions**:

1. **Reuse `BraindumpHistoryCard.svelte`** as the foundation for card design
2. **Follow lazy-loading pattern** from existing tabs (PhasesSection, TasksList)
3. **Use `brain_dump_links` table** to query all related braindumps
4. **Implement sorting** by created_at or linked_at (when linked to project)
5. **Show linked tasks** as clickable chips with "+N more" overflow
6. **Expandable content** with "Show more/less" button for long content
7. **Responsive grid**: 1 column (mobile) → 2 (tablet) → 3 (desktop)
8. **Store-based state** with caching and optimistic updates

The implementation is straightforward with ~500-700 lines of new code spread across 2-3 components, 1 API endpoint, and minor store updates. Testing should focus on data loading, sorting, responsive behavior, and accessibility.
