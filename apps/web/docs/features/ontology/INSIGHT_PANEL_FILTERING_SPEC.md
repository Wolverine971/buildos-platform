<!-- apps/web/docs/features/ontology/INSIGHT_PANEL_FILTERING_SPEC.md -->

# Insight Panel Filtering & Sorting Specification

> **Status:** Draft
> **Created:** 2026-01-04
> **Location:** `/apps/web/src/routes/projects/[id]/+page.svelte`

## Overview

This specification defines lightweight filtering and sorting options for the expandable insight panels in the project detail view. Each entity type (Tasks, Plans, Goals, Milestones, Risks) will have contextually appropriate filters and sort options that appear when the panel is expanded.

## Design Goals

1. **Lightweight** - Minimal UI footprint, no modal dialogs
2. **Contextual** - Each entity type gets relevant filters based on its schema
3. **Discoverable** - Options appear inline when panel expands
4. **Performant** - Client-side filtering on already-loaded data
5. **Persistent** - Filter/sort state persists within session (optional: localStorage)

---

## UI Pattern

### Layout (When Panel Expanded)

```
┌─────────────────────────────────────────────────────┐
│ [Icon] Tasks (12)  "What needs to move"    [+ Add]  │ <- Header (collapsed)
├─────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌──────────────────────────┐    │ <- Filter/Sort Bar
│ │ [Filter ▼] (3)  │ │ Sort: Due Date ▼         │    │
│ └─────────────────┘ └──────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ ○ Task 1                                    [link]  │
│ ◉ Task 2 (in progress)                      [link]  │
│ ○ Task 3                                    [link]  │
│                                                     │
│ ┌─ Show: ☐ Completed (5)  ☐ Deleted (2) ─────────┐  │ <- Special Toggles
└─────────────────────────────────────────────────────┘
```

### Component Structure

```svelte
<!-- Filter/Sort bar appears at top of expanded panel -->
<div class="flex items-center gap-2 px-3 py-2 border-b border-border">
	<!-- Filter dropdown (multi-select) -->
	<InsightFilterDropdown entityType="task" filters={taskFilters} onchange={handleFilterChange} />

	<!-- Sort dropdown (single-select) -->
	<InsightSortDropdown entityType="task" currentSort={taskSort} onchange={handleSortChange} />
</div>

<!-- Special toggles at bottom -->
<div class="flex items-center gap-4 px-3 py-2 border-t border-border text-xs">
	<label class="flex items-center gap-1.5 cursor-pointer">
		<input type="checkbox" bind:checked={showCompleted} />
		<span class="text-muted-foreground">Completed ({completedCount})</span>
	</label>
	<label class="flex items-center gap-1.5 cursor-pointer">
		<input type="checkbox" bind:checked={showDeleted} />
		<span class="text-muted-foreground">Deleted ({deletedCount})</span>
	</label>
</div>
```

---

## Entity Type: TASKS

### Available Fields

| Field          | Type     | Description                                                                              |
| -------------- | -------- | ---------------------------------------------------------------------------------------- |
| `state_key`    | enum     | todo, in_progress, blocked, done                                                         |
| `priority`     | number   | 1-5 (1 = highest)                                                                        |
| `facet_scale`  | enum     | micro, small, medium, large, epic                                                        |
| `type_key`     | string   | task.{work_mode}.\* (execute, create, refine, research, review, coordinate, admin, plan) |
| `due_at`       | datetime | When task is due                                                                         |
| `start_at`     | datetime | When task should start                                                                   |
| `created_at`   | datetime | Creation timestamp                                                                       |
| `updated_at`   | datetime | Last update timestamp                                                                    |
| `completed_at` | datetime | When marked done                                                                         |
| `deleted_at`   | datetime | Soft delete timestamp                                                                    |

### Filters

| Filter           | Type         | Options                                                      | Default      |
| ---------------- | ------------ | ------------------------------------------------------------ | ------------ |
| **Status**       | multi-select | `todo`, `in_progress`, `blocked`                             | All selected |
| **Priority**     | multi-select | `High (1-2)`, `Medium (3)`, `Low (4-5)`                      | All selected |
| **Scale**        | multi-select | `micro`, `small`, `medium`, `large`, `epic`                  | All selected |
| **Work Mode**    | multi-select | Derived from type_key prefix                                 | All selected |
| **Has Due Date** | toggle       | Yes/No                                                       | -            |
| **Overdue**      | toggle       | Shows only tasks where `due_at < now && state_key != 'done'` | Off          |

### Special Toggles (Bottom of Panel)

| Toggle             | Description                                 | Default |
| ------------------ | ------------------------------------------- | ------- |
| **Show Completed** | Include tasks with `state_key = 'done'`     | Off     |
| **Show Deleted**   | Include tasks with `deleted_at IS NOT NULL` | Off     |

### Sort Options

| Sort           | Field          | Direction Options                          |
| -------------- | -------------- | ------------------------------------------ |
| **Due Date**   | `due_at`       | ↑ Earliest first (default), ↓ Latest first |
| **Priority**   | `priority`     | ↑ Highest first, ↓ Lowest first            |
| **Created**    | `created_at`   | ↑ Newest first (default), ↓ Oldest first   |
| **Updated**    | `updated_at`   | ↑ Recently updated, ↓ Oldest updated       |
| **Start Date** | `start_at`     | ↑ Earliest first, ↓ Latest first           |
| **Completed**  | `completed_at` | ↑ Recently completed, ↓ Earliest completed |

### Default Behavior

- **Default Filter:** Active statuses only (todo, in_progress, blocked)
- **Default Sort:** Due Date (nulls last), then Priority
- **Special:** Overdue tasks should have visual indicator (red text/icon)

---

## Entity Type: PLANS

### Available Fields

| Field           | Type     | Description                                                                                  |
| --------------- | -------- | -------------------------------------------------------------------------------------------- |
| `state_key`     | enum     | draft, active, completed                                                                     |
| `type_key`      | string   | plan.{family}.{variant}                                                                      |
| `facet_context` | enum     | personal, client, commercial, internal, open_source, community, academic, nonprofit, startup |
| `facet_scale`   | enum     | micro, small, medium, large, epic                                                            |
| `facet_stage`   | enum     | discovery, planning, execution, launch, maintenance, complete                                |
| `created_at`    | datetime | Creation timestamp                                                                           |
| `updated_at`    | datetime | Last update timestamp                                                                        |
| `deleted_at`    | datetime | Soft delete timestamp                                                                        |

### Filters

| Filter      | Type         | Options                                                       | Default       |
| ----------- | ------------ | ------------------------------------------------------------- | ------------- |
| **Status**  | multi-select | `draft`, `active`                                             | Both selected |
| **Context** | multi-select | All facet_context values                                      | All selected  |
| **Scale**   | multi-select | `micro`, `small`, `medium`, `large`, `epic`                   | All selected  |
| **Stage**   | multi-select | `discovery`, `planning`, `execution`, `launch`, `maintenance` | All selected  |

### Special Toggles

| Toggle             | Description                                  | Default |
| ------------------ | -------------------------------------------- | ------- |
| **Show Completed** | Include plans with `state_key = 'completed'` | Off     |
| **Show Deleted**   | Include plans with `deleted_at IS NOT NULL`  | Off     |

### Sort Options

| Sort        | Field         | Direction Options                                              |
| ----------- | ------------- | -------------------------------------------------------------- |
| **Stage**   | `facet_stage` | ↑ Early stages first (discovery→complete), ↓ Late stages first |
| **Created** | `created_at`  | ↑ Newest first (default), ↓ Oldest first                       |
| **Updated** | `updated_at`  | ↑ Recently updated, ↓ Oldest updated                           |
| **Scale**   | `facet_scale` | ↑ Smallest first, ↓ Largest first                              |

### Default Behavior

- **Default Filter:** Active and draft plans only
- **Default Sort:** Stage (lifecycle order), then Created (newest)

---

## Entity Type: GOALS

### Available Fields

| Field          | Type     | Description                        |
| -------------- | -------- | ---------------------------------- |
| `state_key`    | enum     | draft, active, achieved, abandoned |
| `type_key`     | string   | goal.{family}.{variant}            |
| `target_date`  | datetime | Target completion date             |
| `completed_at` | datetime | When achieved                      |
| `created_at`   | datetime | Creation timestamp                 |
| `updated_at`   | datetime | Last update timestamp              |
| `deleted_at`   | datetime | Soft delete timestamp              |

### Filters

| Filter              | Type         | Options                                     | Default       |
| ------------------- | ------------ | ------------------------------------------- | ------------- |
| **Status**          | multi-select | `draft`, `active`                           | Both selected |
| **Has Target Date** | toggle       | Yes/No                                      | -             |
| **Overdue**         | toggle       | `target_date < now && state_key = 'active'` | Off           |

### Special Toggles

| Toggle             | Description                                  | Default |
| ------------------ | -------------------------------------------- | ------- |
| **Show Achieved**  | Include goals with `state_key = 'achieved'`  | Off     |
| **Show Abandoned** | Include goals with `state_key = 'abandoned'` | Off     |
| **Show Deleted**   | Include goals with `deleted_at IS NOT NULL`  | Off     |

### Sort Options

| Sort            | Field         | Direction Options                          |
| --------------- | ------------- | ------------------------------------------ |
| **Target Date** | `target_date` | ↑ Earliest first (default), ↓ Latest first |
| **Created**     | `created_at`  | ↑ Newest first, ↓ Oldest first             |
| **Updated**     | `updated_at`  | ↑ Recently updated, ↓ Oldest updated       |

### Default Behavior

- **Default Filter:** Draft and active goals only
- **Default Sort:** Target Date (nulls last), then Created
- **Special:** Overdue goals should have visual indicator

---

## Entity Type: MILESTONES

### Available Fields

| Field          | Type     | Description                             |
| -------------- | -------- | --------------------------------------- |
| `state_key`    | enum     | pending, in_progress, completed, missed |
| `type_key`     | string   | milestone.{family}.{variant}            |
| `due_at`       | datetime | When milestone is due (required)        |
| `completed_at` | datetime | When completed                          |
| `created_at`   | datetime | Creation timestamp                      |
| `updated_at`   | datetime | Last update timestamp                   |
| `deleted_at`   | datetime | Soft delete timestamp                   |

### Filters

| Filter        | Type          | Options                                                         | Default       |
| ------------- | ------------- | --------------------------------------------------------------- | ------------- |
| **Status**    | multi-select  | `pending`, `in_progress`                                        | Both selected |
| **Timeframe** | single-select | `All`, `Next 7 days`, `Next 14 days`, `Next 30 days`, `Overdue` | All           |

### Special Toggles

| Toggle             | Description                                       | Default |
| ------------------ | ------------------------------------------------- | ------- |
| **Show Completed** | Include milestones with `state_key = 'completed'` | Off     |
| **Show Missed**    | Include milestones with `state_key = 'missed'`    | Off     |
| **Show Deleted**   | Include milestones with `deleted_at IS NOT NULL`  | Off     |

### Sort Options

| Sort         | Field        | Direction Options                          |
| ------------ | ------------ | ------------------------------------------ |
| **Due Date** | `due_at`     | ↑ Earliest first (default), ↓ Latest first |
| **Created**  | `created_at` | ↑ Newest first, ↓ Oldest first             |
| **Updated**  | `updated_at` | ↑ Recently updated, ↓ Oldest updated       |

### Default Behavior

- **Default Filter:** Pending and in_progress only
- **Default Sort:** Due Date ascending (already implemented)
- **Special:** Overdue milestones (due_at < now && state not completed/missed) get visual indicator

---

## Entity Type: RISKS

### Available Fields

| Field         | Type     | Description                             |
| ------------- | -------- | --------------------------------------- |
| `state_key`   | enum     | identified, mitigated, occurred, closed |
| `type_key`    | string   | risk.{family}.{variant}                 |
| `impact`      | enum     | low, medium, high, critical (required)  |
| `probability` | number   | 0.0 - 1.0                               |
| `created_at`  | datetime | Creation timestamp                      |
| `updated_at`  | datetime | Last update timestamp                   |
| `deleted_at`  | datetime | Soft delete timestamp                   |

### Filters

| Filter          | Type         | Options                                        | Default      |
| --------------- | ------------ | ---------------------------------------------- | ------------ |
| **Status**      | multi-select | `identified`, `mitigated`, `occurred`          | All selected |
| **Impact**      | multi-select | `critical`, `high`, `medium`, `low`            | All selected |
| **Probability** | multi-select | `High (>70%)`, `Medium (30-70%)`, `Low (<30%)` | All selected |

### Special Toggles

| Toggle           | Description                                 | Default |
| ---------------- | ------------------------------------------- | ------- |
| **Show Closed**  | Include risks with `state_key = 'closed'`   | Off     |
| **Show Deleted** | Include risks with `deleted_at IS NOT NULL` | Off     |

### Sort Options

| Sort            | Field         | Direction Options                             |
| --------------- | ------------- | --------------------------------------------- |
| **Impact**      | `impact`      | ↑ Critical first (default), ↓ Low first       |
| **Probability** | `probability` | ↑ Highest first, ↓ Lowest first               |
| **Risk Score**  | computed      | `impact_weight * probability` ↑ Highest first |
| **Created**     | `created_at`  | ↑ Newest first, ↓ Oldest first                |
| **Updated**     | `updated_at`  | ↑ Recently updated, ↓ Oldest updated          |

### Risk Score Calculation

```typescript
function getRiskScore(risk: Risk): number {
	const impactWeights = { critical: 4, high: 3, medium: 2, low: 1 };
	const impactWeight = impactWeights[risk.impact] || 1;
	const probability = risk.probability ?? 0.5; // Default to medium if not set
	return impactWeight * probability;
}
```

### Default Behavior

- **Default Filter:** Active risks only (identified, mitigated, occurred)
- **Default Sort:** Impact (critical first), then Probability
- **Color Coding:** Already implemented - critical=red, high=orange, medium=amber, low=green

---

## Implementation Approach

### State Management

```typescript
// Per-panel filter/sort state
interface InsightPanelState {
	filters: Record<string, string[]>; // Multi-select filters
	toggles: Record<string, boolean>; // Boolean toggles
	sort: {
		field: string;
		direction: 'asc' | 'desc';
	};
}

// Initialize with defaults per entity type
let panelStates = $state<Record<InsightPanelKey, InsightPanelState>>({
	tasks: {
		filters: { status: ['todo', 'in_progress', 'blocked'] },
		toggles: { showCompleted: false, showDeleted: false },
		sort: { field: 'due_at', direction: 'asc' }
	},
	plans: {
		/* ... */
	},
	goals: {
		/* ... */
	},
	milestones: {
		/* ... */
	},
	risks: {
		/* ... */
	}
});
```

### Filtering Logic

```typescript
// Generic filter function
function applyFilters<T>(
	items: T[],
	filters: Record<string, string[]>,
	toggles: Record<string, boolean>,
	entityType: InsightPanelKey
): T[] {
	return items.filter((item) => {
		// Check multi-select filters
		for (const [field, values] of Object.entries(filters)) {
			if (values.length > 0 && !values.includes(item[field])) {
				return false;
			}
		}

		// Check toggles (e.g., showCompleted, showDeleted)
		if (!toggles.showCompleted && isCompleted(item, entityType)) {
			return false;
		}
		if (!toggles.showDeleted && item.deleted_at) {
			return false;
		}

		return true;
	});
}
```

### Sorting Logic

```typescript
// Generic sort function
function applySort<T>(items: T[], sort: { field: string; direction: 'asc' | 'desc' }): T[] {
	return [...items].sort((a, b) => {
		const aVal = a[sort.field];
		const bVal = b[sort.field];

		// Handle nulls (always sort to end)
		if (aVal == null && bVal == null) return 0;
		if (aVal == null) return 1;
		if (bVal == null) return -1;

		// Compare values
		let comparison = 0;
		if (typeof aVal === 'string') {
			comparison = aVal.localeCompare(bVal);
		} else {
			comparison = aVal - bVal;
		}

		return sort.direction === 'asc' ? comparison : -comparison;
	});
}
```

### Derived Filtered Items

```typescript
// Use $derived for reactive filtering
let filteredTasks = $derived(
	applySort(
		applyFilters(tasks, panelStates.tasks.filters, panelStates.tasks.toggles, 'tasks'),
		panelStates.tasks.sort
	)
);
```

---

## Component Specifications

### InsightFilterDropdown

A reusable multi-select filter dropdown component.

**Props:**

```typescript
interface InsightFilterDropdownProps {
	entityType: InsightPanelKey;
	filters: Record<string, string[]>;
	filterOptions: FilterOptionGroup[];
	onchange: (filters: Record<string, string[]>) => void;
}

interface FilterOptionGroup {
	id: string; // e.g., 'status', 'priority'
	label: string; // e.g., 'Status', 'Priority'
	options: FilterOption[];
}

interface FilterOption {
	value: string;
	label: string;
	icon?: Component;
	color?: string;
}
```

**Behavior:**

- Shows filter count badge: "Filter (3)"
- Dropdown shows grouped options with checkboxes
- Apply/Cancel buttons at bottom
- All/None quick select buttons

### InsightSortDropdown

A single-select sort dropdown with direction toggle.

**Props:**

```typescript
interface InsightSortDropdownProps {
	entityType: InsightPanelKey;
	currentSort: { field: string; direction: 'asc' | 'desc' };
	sortOptions: SortOption[];
	onchange: (sort: { field: string; direction: 'asc' | 'desc' }) => void;
}

interface SortOption {
	field: string;
	label: string;
	defaultDirection: 'asc' | 'desc';
}
```

**Behavior:**

- Shows current sort: "Sort: Due Date ↑"
- Clicking toggles direction
- Dropdown shows all sort options
- Radio-button style selection

---

## Visual Design (Inkprint)

### Filter Button

```html
<button
	class="
  inline-flex items-center gap-1.5 px-2.5 py-1.5
  text-xs font-medium text-muted-foreground
  bg-muted/50 hover:bg-muted
  border border-border rounded-md
  transition-colors
"
>
	<Filter class="w-3.5 h-3.5" />
	Filter
	<span class="ml-0.5 px-1.5 py-0.5 bg-accent/20 rounded text-accent text-[10px]">3</span>
</button>
```

### Sort Button

```html
<button
	class="
  inline-flex items-center gap-1.5 px-2.5 py-1.5
  text-xs font-medium text-muted-foreground
  bg-muted/50 hover:bg-muted
  border border-border rounded-md
  transition-colors
"
>
	<span>Sort: Due Date</span>
	<ArrowUp class="w-3 h-3" />
	<!-- or ArrowDown -->
</button>
```

### Special Toggles Row

```html
<div
	class="
  flex items-center gap-4 px-3 py-2
  border-t border-border
  text-xs text-muted-foreground
"
>
	<label class="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
		<input type="checkbox" class="w-3 h-3 rounded border-border" />
		Completed (5)
	</label>
	<label class="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors">
		<input type="checkbox" class="w-3 h-3 rounded border-border" />
		Deleted (2)
	</label>
</div>
```

---

## Data Requirements

### Counts for UI

Each panel needs counts for:

1. Total items matching current filter
2. Completed items (for toggle label)
3. Deleted items (for toggle label)
4. Per-filter-option counts (optional, for showing relevance)

```typescript
interface PanelCounts {
	filtered: number; // Items matching current filters
	completed: number; // Items in completed/achieved/done state
	deleted: number; // Items with deleted_at set
	perFilter?: Record<string, Record<string, number>>;
}
```

### Data Already Loaded

All entity data is already loaded via `get_project_full()` RPC. No additional API calls needed - filtering/sorting is purely client-side.

---

## Migration Notes

### Existing Filter Pattern

The codebase has an existing `TaskFilterDropdown.svelte` component in `/apps/web/src/lib/components/phases/`. This can serve as a reference pattern but the insight panel filters should be:

1. **Simpler** - Fewer options, inline rather than modal
2. **Generic** - Works for all entity types
3. **Consistent** - Same UI pattern across all panels

### Recommended New Components

1. `InsightFilterDropdown.svelte` - Generic filter dropdown
2. `InsightSortDropdown.svelte` - Generic sort dropdown
3. `InsightPanelControls.svelte` - Container for filter/sort bar

Location: `/apps/web/src/lib/components/ontology/insight-panels/`

---

## Testing Considerations

1. **Filter combinations** - Ensure multiple active filters work correctly
2. **Empty states** - Handle when all items are filtered out
3. **Sort edge cases** - Null values, ties
4. **Performance** - Should remain snappy with 100+ items
5. **State persistence** - Verify session persistence works
6. **Mobile** - Filter/sort dropdowns must work on small screens

---

## Future Enhancements

1. **Saved Filter Presets** - "My common filters" saved to user preferences
2. **Quick Filters** - One-click preset filters (e.g., "Overdue", "This Week")
3. **Search within Panel** - Text search across item titles
4. **Bulk Actions** - Select multiple items for batch operations
5. **Export Filtered View** - Export current filtered list

---

## Summary Table

| Entity         | Primary Filters                             | Key Sorts                                | Special Toggles              |
| -------------- | ------------------------------------------- | ---------------------------------------- | ---------------------------- |
| **Tasks**      | Status, Priority, Scale, Work Mode, Overdue | Due Date, Priority, Created              | Completed, Deleted           |
| **Plans**      | Status, Context, Scale, Stage               | Stage, Created, Scale                    | Completed, Deleted           |
| **Goals**      | Status, Has Target, Overdue                 | Target Date, Created                     | Achieved, Abandoned, Deleted |
| **Milestones** | Status, Timeframe                           | Due Date, Created                        | Completed, Missed, Deleted   |
| **Risks**      | Status, Impact, Probability                 | Impact, Probability, Risk Score, Created | Closed, Deleted              |
