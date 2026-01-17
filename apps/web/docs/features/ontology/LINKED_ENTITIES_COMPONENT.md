<!-- apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md -->

# LinkedEntities Component Specification

**Created**: December 9, 2025
**Updated**: January 16, 2026
**Status**: Phase 1-3 Complete, Linking Constraints Implemented
**Location**: `/apps/web/src/lib/components/ontology/linked-entities/`

## Overview

A self-contained, reusable component for displaying and managing entity relationships within the BuildOS ontology system. The component handles its own data fetching with skeleton loading states to prevent layout shifts.

## Progress Log

### Phase 1: Core Component - COMPLETE

- [x] Create file structure and types (`linked-entities.types.ts`)
- [x] Implement LinkedEntities.svelte with skeleton loading
- [x] Implement LinkedEntitiesSection.svelte
- [x] Implement LinkedEntitiesItem.svelte
- [x] Create GET `/api/onto/edges/linked` endpoint

### Phase 2: Add/Remove Links - COMPLETE

- [x] Implement LinkPickerModal.svelte
- [x] Create POST `/api/onto/edges` endpoint
- [x] Create DELETE `/api/onto/edges/[id]` endpoint
- [x] Add optimistic updates and error handling

### Phase 3: Integration - IN PROGRESS

- [x] Replace TaskEditModal linked entities section
- [ ] Add to PlanEditModal
- [ ] Add to GoalEditModal
- [ ] Add to other edit modals as needed

### Phase 4: Linking Constraints - COMPLETE (January 16, 2026)

- [x] Added `ALLOWED_LINKS` constraint map to enforce valid entity relationships
- [x] Added `requirement` entity type to all interfaces and fetching logic
- [x] Added `event` entity type with proper `has_event` relationship
- [x] Fixed incorrect relationship mappings in `RELATIONSHIP_MAP`
- [x] Updated UI to filter visible sections based on source entity kind
- [x] Constrained `event` to only link to `task`
- [x] Constrained `requirement` to only link to `goal` or `milestone`
- [x] Updated canonical edge-direction.ts and containment-organizer.ts

**Files Modified:**

- `linked-entities.types.ts` - Added ALLOWED_LINKS, fixed RELATIONSHIP_MAP, added requirement/event
- `linked-entities.service.ts` - Added requirement/event support, updated parent rules
- `LinkedEntities.svelte` - Filter sections by ALLOWED_LINKS
- `/api/onto/edges/linked/+server.ts` - Added requirement entity fetching
- `/lib/services/ontology/edge-direction.ts` - Added event kind, has_event relationship
- `/lib/services/ontology/containment-organizer.ts` - Added event parent rules

### Implementation Notes (December 9, 2025)

**Files Created:**

- `src/lib/components/ontology/linked-entities/LinkedEntities.svelte` - Main container component
- `src/lib/components/ontology/linked-entities/LinkedEntitiesSection.svelte` - Collapsible section
- `src/lib/components/ontology/linked-entities/LinkedEntitiesItem.svelte` - Individual entity row
- `src/lib/components/ontology/linked-entities/LinkPickerModal.svelte` - Multi-select link picker
- `src/lib/components/ontology/linked-entities/linked-entities.types.ts` - TypeScript types
- `src/lib/components/ontology/linked-entities/linked-entities.service.ts` - API service
- `src/lib/components/ontology/linked-entities/index.ts` - Exports
- `src/routes/api/onto/edges/linked/+server.ts` - GET endpoint
- `src/routes/api/onto/edges/+server.ts` - POST endpoint
- `src/routes/api/onto/edges/[id]/+server.ts` - DELETE endpoint

**TaskEditModal Changes:**

- Replaced ~330 lines of inline linked entities code with single `<LinkedEntities>` component
- Added unified `handleLinkedEntityClick` handler for entity navigation
- Removed unused imports and helper functions

**Bug Fix (December 9, 2025):**

- Fixed section disabled logic: Sections are now only disabled when there are NO linked entities AND NO available entities to link
- Previously, sections were incorrectly disabled when there were 0 linked entities (even if there were available entities to link)
- Updated `LinkedEntitiesSection.svelte` to use `availableToLinkCount` prop to determine:
    - `isDisabled`: Section is fully disabled (nothing to show, nothing to add)
    - `canExpand`: Section has linked entities to show when expanded
    - `showAddButton`: + button appears when there are available entities to link

---

## Visual Design

```
┌─────────────────────────────────────────────┐
│ ▪ Linked Entities                           │
├─────────────────────────────────────────────┤
│ ▸ Tasks (3)                           [+]   │  ← collapsed, expandable
│ ▸ Plans (1)                           [+]   │
│ ▾ Goals (2)                           [+]   │  ← expanded
│   ├─ Launch MVP ────────────────── [×]      │  ← hover shows ×
│   │  supports · active                      │
│   └─ Q1 Revenue Target ─────────── [×]      │
│      supports · draft                       │
│ ▸ Milestones (0)                            │  ← disabled, no + button
│ ▸ Documents (0)                             │  ← grayed out
│ ▸ Outputs (0)                               │
└─────────────────────────────────────────────┘
```

### Loading State (Skeleton)

```
┌─────────────────────────────────────────────┐
│ ▪ Linked Entities                           │
├─────────────────────────────────────────────┤
│ ▸ ████████████ (█)                    [░]   │  ← skeleton rows
│ ▸ ████████ (█)                        [░]   │
│ ▸ ██████████████ (█)                  [░]   │
│ ▸ ████████████ (█)                    [░]   │
│ ▸ ██████████ (█)                      [░]   │
│ ▸ ████████ (█)                        [░]   │
└─────────────────────────────────────────────┘
```

**Key:** Fixed height skeleton rows for each entity type prevent layout shift.

---

## Props Interface

```typescript
interface LinkedEntitiesProps {
	// Required
	sourceId: string; // ID of the entity being edited
	sourceKind: EntityKind; // 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'risk' | 'event' | 'requirement'
	projectId: string; // Current project context for scoping available entities

	// Callbacks
	onEntityClick?: (kind: EntityKind, id: string) => void; // Navigate to entity
	onLinksChanged?: () => void; // Notify parent of changes (for refresh)

	// Configuration (optional)
	allowedEntityTypes?: EntityKind[]; // Subset of types to show (intersection with ALLOWED_LINKS)
	readOnly?: boolean; // Hide +/× buttons (default: false)
}

type EntityKind =
	| 'task'
	| 'plan'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'risk'
	| 'event'
	| 'requirement';
```

---

## Allowed Link Constraints

Not all entity types can link to each other. The `ALLOWED_LINKS` map defines valid linking options for each source kind:

```typescript
const ALLOWED_LINKS: Record<EntityKind, EntityKind[]> = {
	task: ['plan', 'goal', 'task', 'milestone', 'document', 'risk', 'event'],
	plan: ['task', 'goal', 'milestone', 'document', 'risk'],
	goal: ['milestone', 'document', 'task', 'plan', 'risk', 'requirement'],
	milestone: ['plan', 'task', 'goal', 'document', 'risk', 'requirement'],
	document: ['task', 'plan', 'goal', 'milestone', 'document', 'risk'],
	risk: ['task', 'plan', 'goal', 'milestone', 'document'],
	event: ['task'], // Events can ONLY link to tasks
	requirement: ['goal', 'milestone'] // Requirements can ONLY link to goals or milestones
};
```

The UI automatically filters visible sections based on these constraints.

---

## Auto-Determined Relationship Types

Relationships are automatically determined based on entity type pairs:

### Task Relationships

| Source | Target    | Relationship        | Notes                      |
| ------ | --------- | ------------------- | -------------------------- |
| task   | plan      | `has_task`          | Containment (plan → task)  |
| task   | goal      | `supports_goal`     | Support relationship       |
| task   | task      | `depends_on`        | Task dependencies          |
| task   | milestone | `targets_milestone` | Task targets milestone     |
| task   | document  | `references`        | Reference relationship     |
| task   | risk      | `mitigates`         | Task mitigates risk        |
| task   | event     | `has_event`         | Containment (task → event) |

### Plan Relationships

| Source | Target    | Relationship        | Notes                     |
| ------ | --------- | ------------------- | ------------------------- |
| plan   | task      | `has_task`          | Containment (plan → task) |
| plan   | goal      | `supports_goal`     | Plan supports goal        |
| plan   | milestone | `targets_milestone` | Plan targets milestone    |
| plan   | document  | `references`        | Reference relationship    |
| plan   | risk      | `addresses`         | Plan addresses risk       |

### Goal Relationships

| Source | Target      | Relationship      | Notes                            |
| ------ | ----------- | ----------------- | -------------------------------- |
| goal   | milestone   | `has_milestone`   | Containment (goal → milestone)   |
| goal   | document    | `references`      | Reference relationship           |
| goal   | task        | `supports_goal`   | Query: tasks that support goal   |
| goal   | plan        | `supports_goal`   | Query: plans that support goal   |
| goal   | risk        | `threatens`       | Query: risks that threaten goal  |
| goal   | requirement | `has_requirement` | Containment (goal → requirement) |

### Milestone Relationships

| Source    | Target      | Relationship        | Notes                            |
| --------- | ----------- | ------------------- | -------------------------------- |
| milestone | plan        | `has_plan`          | Containment (milestone → plan)   |
| milestone | task        | `targets_milestone` | Query: tasks targeting milestone |
| milestone | goal        | `has_milestone`     | Query: parent goal               |
| milestone | document    | `references`        | Reference relationship           |
| milestone | risk        | `has_risk`          | Containment (milestone → risk)   |
| milestone | requirement | `has_requirement`   | Containment (milestone → req)    |

### Other Entity Relationships

| Source      | Target    | Relationship      | Notes                            |
| ----------- | --------- | ----------------- | -------------------------------- |
| document    | \*        | `references`      | Documents can reference anything |
| risk        | task/plan | `threatens`       | Risk threatens entities          |
| risk        | goal/ms   | `threatens`       | Risk threatens entities          |
| risk        | document  | `documented_in`   | Risk documented in document      |
| event       | task      | `has_event`       | Query: parent task               |
| requirement | goal      | `has_requirement` | Query: parent goal               |
| requirement | milestone | `has_requirement` | Query: parent milestone          |

**Note:** Edges are stored in canonical direction (Container → Contained, Supporter → Supported). The component queries both directions when fetching.

---

## API Endpoints

### GET `/api/onto/edges/linked`

Fetches linked entities for a given source. Used by the component on mount.

```typescript
// Query params
?sourceId=uuid&sourceKind=task&projectId=uuid

// Response
{
  success: true,
  data: {
    linkedEntities: {
      tasks: LinkedEntity[],
      plans: LinkedEntity[],
      goals: LinkedEntity[],
      milestones: LinkedEntity[],
      documents: LinkedEntity[],
      risks: LinkedEntity[],
      events: LinkedEntity[],
      requirements: LinkedEntity[]
    },
    availableEntities: {
      tasks: AvailableEntity[],
      plans: AvailableEntity[],
      goals: AvailableEntity[],
      milestones: AvailableEntity[],
      documents: AvailableEntity[],
      risks: AvailableEntity[],
      events: AvailableEntity[],
      requirements: AvailableEntity[]
    }
  }
}

interface LinkedEntity {
  id: string;
  name?: string;
  title?: string;
  type_key?: string;
  state_key?: string;
  due_at?: string;
  edge_id: string;        // For deletion
  edge_rel: string;
  edge_direction: 'outgoing' | 'incoming';
}

interface AvailableEntity {
  id: string;
  name?: string;
  title?: string;
  state_key?: string;
  type_key?: string;
  isLinked: boolean;      // Pre-computed for UI
}
```

### POST `/api/onto/edges`

Creates one or more edge relationships.

```typescript
// Request
{
  edges: Array<{
    src_kind: string;
    src_id: string;
    dst_kind: string;
    dst_id: string;
    rel: string;
  }>
}

// Response
{ success: true, data: { created: number } }
```

### DELETE `/api/onto/edges/:edgeId`

Removes a single edge by ID.

```typescript
// Response
{
	success: true;
}
```

---

## Component Architecture

### File Structure

```
src/lib/components/ontology/linked-entities/
├── LinkedEntities.svelte           # Main container (self-fetching)
├── LinkedEntitiesSection.svelte    # Collapsible section per entity type
├── LinkedEntitiesItem.svelte       # Single linked item row
├── LinkPickerModal.svelte          # Multi-select dialog for adding links
├── linked-entities.types.ts        # Shared TypeScript types
└── linked-entities.service.ts      # API fetch helpers
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  LinkedEntities.svelte                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ $effect on mount:                                     │   │
│  │   → fetch('/api/onto/edges/linked?...')              │   │
│  │   → set linkedEntities, availableEntities            │   │
│  │   → isLoading = false                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ↓                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ {#if isLoading}                                       │   │
│  │   <LinkedEntitiesSkeleton />  ← Fixed height         │   │
│  │ {:else}                                               │   │
│  │   {#each entityTypes as type}                         │   │
│  │     <LinkedEntitiesSection {type} ... />             │   │
│  │   {/each}                                             │   │
│  │ {/if}                                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Behavior Specifications

### 1. Loading State

- Component shows 6 skeleton rows (one per entity type)
- Each skeleton row has **fixed height** matching real rows
- Skeleton includes: icon placeholder, text bar, count placeholder, button placeholder
- **No layout shift** when data loads

### 2. Section States

| State     | Count | Appearance             | Expandable            | Has + Button |
| --------- | ----- | ---------------------- | --------------------- | ------------ |
| Empty     | 0     | Grayed out, muted text | No                    | No           |
| Has Items | 1+    | Normal styling         | Yes (click to toggle) | Yes          |
| Loading   | -     | Skeleton animation     | No                    | No           |

### 3. Collapse/Expand

- All sections start **collapsed** by default
- Click section header (not + button) to toggle
- Smooth height transition animation (150ms ease-out)
- Only sections with items are expandable

### 4. Adding Links (+ Button)

- Opens `LinkPickerModal` for that entity type
- Modal features:
    - Title: "Link {EntityType}"
    - Search input (debounced 300ms)
    - Scrollable list with checkboxes
    - Already-linked items shown with checkmark, grayed/disabled
    - "Add Selected ({n})" button
    - Cancel button
- On submit: POST to `/api/onto/edges`, optimistic update, toast success

### 5. Removing Links (× Button)

- × button appears on hover (opacity transition)
- Click → DELETE `/api/onto/edges/:id`
- Optimistic UI: immediately remove from list
- Toast: "Link removed"
- On error: revert optimistic update, toast error

### 6. Entity Navigation

- Clicking entity name (not ×) triggers `onEntityClick(kind, id)`
- Parent component handles modal opening

---

## Styling (Inkprint Design System)

```svelte
<!-- Container -->
<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
	<!-- Header -->
	<div class="px-3 py-2 border-b border-border">
		<h3
			class="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"
		>
			<span class="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
			Linked Entities
		</h3>
	</div>

	<!-- Sections -->
	<div class="divide-y divide-border">
		{#each sections as section}
			<LinkedEntitiesSection {section} />
		{/each}
	</div>
</div>

<!-- Section Header (expandable) -->
<button
	class="w-full px-3 py-2 flex items-center justify-between
               hover:bg-muted/50 transition-colors
               {section.count === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
>
	<!-- Left: chevron + icon + label + count -->
	<div class="flex items-center gap-2">
		<ChevronRight class="w-3.5 h-3.5 transition-transform {expanded ? 'rotate-90' : ''}" />
		<Icon class="w-3.5 h-3.5 {section.iconColor}" />
		<span class="text-sm text-foreground">{section.label}</span>
		<span class="text-xs text-muted-foreground">({section.count})</span>
	</div>

	<!-- Right: + button (only if has items possible) -->
	{#if section.count > 0 || !readOnly}
		<button class="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-accent">
			<Plus class="w-3.5 h-3.5" />
		</button>
	{/if}
</button>

<!-- Linked Item -->
<div class="group px-4 py-2 flex items-center justify-between hover:bg-muted/30">
	<button class="flex-1 text-left" onclick={() => onEntityClick(kind, id)}>
		<span class="text-sm text-foreground group-hover:text-accent truncate">
			{entity.name || entity.title}
		</span>
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<span>{entity.edge_rel.replace(/_/g, ' ')}</span>
			{#if entity.state_key}
				<span>· {entity.state_key}</span>
			{/if}
		</div>
	</button>

	<!-- Remove button (hover) -->
	<button
		class="p-1 rounded opacity-0 group-hover:opacity-100
                 text-muted-foreground hover:text-destructive hover:bg-destructive/10
                 transition-opacity"
	>
		<X class="w-3.5 h-3.5" />
	</button>
</div>
```

---

## Link Picker Modal Design

```
┌───────────────────────────────────────────────────┐
│ Link Goals                                  [×]   │
├───────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐   │
│ │ 🔍 Search goals...                          │   │
│ └─────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐   │
│ │ ✓ Launch MVP ─────────────── active         │ ← │
│ │   (already linked)                          │   │
│ │ ☐ Q2 Revenue Target ──────── draft          │   │
│ │ ☐ User Acquisition ────────── planning      │   │
│ │ ☐ Product Market Fit ──────── draft         │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ 0 of 4 available                                  │
├───────────────────────────────────────────────────┤
│               [Cancel]  [Add Selected (0)]        │
└───────────────────────────────────────────────────┘
```

**Empty State:** "No {entity type} available to link"

**All Linked State:** "All {entity type} are already linked"

---

## Usage Example

```svelte
<script lang="ts">
	import LinkedEntities from '$lib/components/ontology/linked-entities/LinkedEntities.svelte';

	let { task, projectId } = $props();

	function handleEntityClick(kind: string, id: string) {
		if (kind === 'goal') {
			selectedGoalId = id;
			showGoalModal = true;
		} else if (kind === 'plan') {
			// ...
		}
	}
</script>

<!-- In sidebar -->
<LinkedEntities
	sourceId={task.id}
	sourceKind="task"
	{projectId}
	onEntityClick={handleEntityClick}
	onLinksChanged={() => loadTask()}
/>
```

---

## Implementation Notes

_This section will be updated as implementation progresses._
