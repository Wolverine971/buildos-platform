<!-- apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md -->
# Project Page Instant Load - Performance Optimization Specification

**Date:** 2025-12-19
**Status:** Implementation In Progress
**Author:** Claude Code

## Overview

This document specifies the implementation of instant page loading for `/projects/[id]` with skeleton-first rendering, View Transitions API for smooth page animations, and optimized data fetching.

## Goals

1. **Instant Layout Rendering**: Page skeleton appears immediately on navigation
2. **No Layout Shifts**: Skeleton sizing matches final component sizing exactly
3. **Smooth Page Transitions**: Title morphs from source page to detail page using View Transitions API
4. **Count Display During Load**: Show entity counts (tasks, documents, etc.) in skeleton state
5. **Fast Data Hydration**: Use optimized RPC function to fetch all data in single round-trip

## Architecture

### Two Navigation Scenarios

#### 1. Warm Navigation (from /projects or homepage)

The user clicks a project card that already has summary data loaded:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User clicks project card                                 │
│    └─ Browser already has: { name, state, counts, next_step } │
│                                                              │
│ 2. Store project summary in navigation state               │
│    └─ Use SvelteKit's beforeNavigate + sessionStorage        │
│                                                              │
│ 3. /projects/[id] +page.server.ts                           │
│    └─ Returns { skeleton: true, projectId }                 │
│       (minimal data, no blocking fetch)                      │
│                                                              │
│ 4. +page.svelte mounts with skeleton                        │
│    ├─ Reads summary from navigation store                   │
│    ├─ Header: project name + state badge (from summary)     │
│    ├─ Insight panels: "Loading {count} tasks..." (from summary) │
│    └─ Main area: skeleton cards                             │
│                                                              │
│ 5. Client calls RPC: get_project_full(projectId, actorId)   │
│                                                              │
│ 6. RPC returns → hydrate all entities                       │
│    └─ Smooth transition from skeleton to content            │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Cold Load (direct URL, refresh, external link)

The user navigates directly to the page without prior context:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. +page.server.ts has NO navigation state                  │
│                                                              │
│ 2. Server calls get_project_skeleton RPC (fast):            │
│    SELECT id, name, state_key, next_step_short,             │
│           next_step_long, description,                       │
│           (SELECT count(*) FROM onto_tasks ...) as task_count, │
│           ...                                                │
│    └─ Single fast query with count subqueries               │
│                                                              │
│ 3. Return skeleton data → client renders skeleton           │
│    ├─ Header: project name + state badge                    │
│    ├─ Insight panels: "Loading {count} tasks..."            │
│    └─ Main area: skeleton cards                             │
│                                                              │
│ 4. Client calls RPC: get_project_full()                     │
│                                                              │
│ 5. Hydrate entities                                         │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Navigation Store (`project-navigation.store.ts`)

Stores project summary for warm navigation:

```typescript
interface ProjectNavigationData {
	id: string;
	name: string;
	state_key: string;
	description: string | null;
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
	task_count: number;
	output_count: number;
	goal_count: number;
	plan_count: number;
	document_count: number;
	milestone_count: number;
	risk_count: number;
}
```

### 2. InsightPanelSkeleton Component

Shows loading state for insight panels with count:

```svelte
<InsightPanelSkeleton icon={ListChecks} label="Tasks" count={5} description="What needs to move" />
```

Renders:

- Panel header with icon and label
- "Loading 5 tasks..." with animated pulse
- Fixed height to prevent layout shift

### 3. Skeleton RPC Function (`get_project_skeleton`)

Fast query for cold loads - returns just enough for skeleton:

```sql
CREATE FUNCTION get_project_skeleton(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'state_key', p.state_key,
    'next_step_short', p.next_step_short,
    'next_step_long', p.next_step_long,
    'next_step_source', p.next_step_source,
    'next_step_updated_at', p.next_step_updated_at,
    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id),
    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id AND p.created_by = p_actor_id;
$$ LANGUAGE sql SECURITY DEFINER;
```

### 4. View Transitions API Integration

Add to root layout for cross-page transitions:

```typescript
// In +layout.svelte or navigation handler
import { onNavigate } from '$app/navigation';

onNavigate((navigation) => {
	if (!document.startViewTransition) return;

	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
});
```

Project title CSS for morph animation:

```css
/* Source page (project card) */
.project-card-title {
	view-transition-name: project-title;
}

/* Target page (project detail) */
.project-detail-title {
	view-transition-name: project-title;
}
```

## Data Flow

### PageData Types

```typescript
// Skeleton data (minimal, for fast initial render)
interface ProjectSkeletonData {
	skeleton: true;
	projectId: string;
	// From navigation store (warm) or get_project_skeleton RPC (cold)
	project: {
		id: string;
		name: string;
		state_key: string;
		description: string | null;
		next_step_short: string | null;
		next_step_long: string | null;
		next_step_source: 'ai' | 'user' | null;
		next_step_updated_at: string | null;
	};
	counts: {
		task_count: number;
		output_count: number;
		document_count: number;
		goal_count: number;
		plan_count: number;
		milestone_count: number;
		risk_count: number;
	};
}

// Full data (after hydration)
interface ProjectFullData {
	skeleton: false;
	projectId: string;
	project: Project;
	tasks: Task[];
	outputs: Output[];
	documents: Document[];
	plans: Plan[];
	goals: Goal[];
	milestones: Milestone[];
	risks: Risk[];
	context_document: Document | null;
	// ... other entities
}
```

### +page.server.ts Logic

```typescript
export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	const { id } = params;

	// Check if we have navigation data from warm navigation
	// This comes from the navigation store populated by the source page
	const navData = getNavigationData(id);

	if (navData) {
		// Warm navigation - return immediately with skeleton flag
		return {
			skeleton: true,
			projectId: id,
			project: {
				id: navData.id,
				name: navData.name,
				state_key: navData.state_key,
				description: navData.description,
				next_step_short: navData.next_step_short,
				next_step_long: navData.next_step_long,
				next_step_source: navData.next_step_source,
				next_step_updated_at: navData.next_step_updated_at
			},
			counts: {
				task_count: navData.task_count,
				output_count: navData.output_count,
				document_count: navData.document_count,
				goal_count: navData.goal_count,
				plan_count: navData.plan_count,
				milestone_count: navData.milestone_count ?? 0,
				risk_count: navData.risk_count ?? 0
			}
		};
	}

	// Cold load - fetch skeleton from RPC
	const { data: skeletonData } = await locals.supabase.rpc('get_project_skeleton', {
		p_project_id: id,
		p_actor_id: actorId
	});

	if (!skeletonData) {
		throw error(404, 'Project not found');
	}

	return {
		skeleton: true,
		projectId: id,
		project: {
			id: skeletonData.id,
			name: skeletonData.name,
			state_key: skeletonData.state_key,
			description: skeletonData.description,
			next_step_short: skeletonData.next_step_short,
			next_step_long: skeletonData.next_step_long,
			next_step_source: skeletonData.next_step_source,
			next_step_updated_at: skeletonData.next_step_updated_at
		},
		counts: {
			task_count: skeletonData.task_count,
			output_count: skeletonData.output_count,
			document_count: skeletonData.document_count,
			goal_count: skeletonData.goal_count,
			plan_count: skeletonData.plan_count,
			milestone_count: skeletonData.milestone_count,
			risk_count: skeletonData.risk_count
		}
	};
};
```

### +page.svelte Client Hydration

```typescript
// On mount, fetch full data
$effect(() => {
	if (data.skeleton) {
		loadFullData();
	}
});

async function loadFullData() {
	isHydrating = true;

	try {
		const response = await fetch(`/api/onto/projects/${data.projectId}/full`);
		const payload = await response.json();

		if (payload.data) {
			// Hydrate all state
			project = payload.data.project;
			tasks = payload.data.tasks ?? [];
			outputs = payload.data.outputs ?? [];
			documents = payload.data.documents ?? [];
			plans = payload.data.plans ?? [];
			goals = payload.data.goals ?? [];
			milestones = payload.data.milestones ?? [];
			risks = payload.data.risks ?? [];
			contextDocument = payload.data.context_document ?? null;

			isHydrating = false;
		}
	} catch (err) {
		console.error('Failed to hydrate project data', err);
		hydrationError = err instanceof Error ? err.message : 'Failed to load project';
	}
}
```

## API Endpoints

### GET /api/onto/projects/[id]/full

Uses `get_project_full` RPC for single-roundtrip data fetch:

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
	const { id } = params;
	const { user } = await locals.safeGetSession();

	const actorId = await ensureActorId(locals.supabase, user.id);

	const { data, error } = await locals.supabase.rpc('get_project_full', {
		p_project_id: id,
		p_actor_id: actorId
	});

	if (error || !data) {
		return ApiResponse.error('Project not found', 404);
	}

	return ApiResponse.success(data);
};
```

## Skeleton Component Sizing

To prevent layout shifts, skeleton components must match final sizing:

| Component                       | Skeleton Height | Final Height |
| ------------------------------- | --------------- | ------------ |
| Insight Panel (collapsed)       | 72px            | 72px         |
| Insight Panel (expanded, empty) | 120px           | ~120px       |
| Output card                     | 64px            | 64px         |
| Document card                   | 64px            | 64px         |

## CSS for View Transitions

```css
/* Smooth cross-fade for page content */
::view-transition-old(root),
::view-transition-new(root) {
	animation-duration: 200ms;
}

/* Morph animation for project title */
::view-transition-old(project-title),
::view-transition-new(project-title) {
	animation-duration: 250ms;
	animation-timing-function: ease-out;
}

/* Prevent transition on skeleton elements */
.skeleton-item {
	view-transition-name: none;
}
```

## File Changes Summary

| File                                                               | Change                                 |
| ------------------------------------------------------------------ | -------------------------------------- |
| `apps/web/src/lib/stores/project-navigation.store.ts`              | NEW - Navigation data store            |
| `apps/web/src/lib/components/ontology/InsightPanelSkeleton.svelte` | NEW - Skeleton component               |
| `supabase/migrations/YYYYMMDD_get_project_skeleton.sql`            | NEW - Skeleton RPC                     |
| `apps/web/src/routes/projects/[id]/+page.server.ts`                | MODIFY - Skeleton-first loading        |
| `apps/web/src/routes/projects/[id]/+page.svelte`                   | MODIFY - Client hydration              |
| `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`       | NEW - Full data endpoint               |
| `apps/web/src/routes/projects/+page.svelte`                        | MODIFY - Set navigation state on click |
| `apps/web/src/lib/components/dashboard/Dashboard.svelte`           | MODIFY - Set navigation state on click |
| `apps/web/src/routes/+layout.svelte`                               | MODIFY - Add View Transitions          |

## Performance Expectations

| Metric              | Before      | After      |
| ------------------- | ----------- | ---------- |
| Time to first paint | ~500-800ms  | <100ms     |
| Time to interactive | ~800-1200ms | ~400-600ms |
| Layout shift (CLS)  | Variable    | 0          |
| Perceived load time | Slow        | Instant    |

## Testing Checklist

- [ ] Warm navigation from /projects shows skeleton immediately
- [ ] Warm navigation from homepage shows skeleton immediately
- [ ] Cold load (direct URL) shows skeleton then hydrates
- [ ] Browser refresh shows skeleton then hydrates
- [ ] Counts match between skeleton and final state
- [ ] No layout shifts during hydration
- [ ] View transition animates title smoothly
- [ ] Error handling for failed hydration
- [ ] Mobile responsive skeleton
- [ ] Dark mode skeleton appearance

## Future Enhancements

1. **Streaming**: Stream entity arrays as they load for progressive rendering
2. **Prefetching**: Prefetch project data on hover for even faster navigation
3. **Cached Skeletons**: Cache skeleton data in service worker
4. **Optimistic Updates**: Show optimistic UI for CRUD operations
