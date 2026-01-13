<!-- apps/web/docs/features/ontology/TASK_LINKED_ENTITIES_SPEC.md -->

# TaskEditModal Linked Entities Feature Specification

**Created**: December 5, 2025
**Status**: Planning
**Priority**: High
**Category**: Feature Enhancement

## Overview

Enhance the TaskEditModal right-side panel to display and navigate to all linked entities via `onto_edges`. Users should be able to see at a glance what documents, plans, goals, and milestones are connected to a task, with clickable links to open their respective modals.

## Current State Analysis

### Existing Functionality

The TaskEditModal (`/apps/web/src/lib/components/ontology/TaskEditModal.svelte`) currently:

1. **Plan Association**: Shows a dropdown to select a plan (stored as edge relationship `belongs_to_plan`)
2. **Goal Association**: Shows a dropdown to select a goal (stored in `props.goal_id` + edge `supports_goal` from task → goal)
3. **Milestone Association**: Shows a dropdown to select a milestone (stored in `props.supporting_milestone_id` + edge `targets_milestone` from task → milestone)
4. **Documents**: Shows connected documents in the workspace tab via `fetchTaskDocuments()` service

### onto_edges Relationship Types

From `apps/web/docs/features/ontology/DATA_MODELS.md:483-519`:

```typescript
interface OntoEdge {
	id: uuid;
	src_kind: text; // 'task', 'goal', 'plan', 'milestone', 'document', etc.
	src_id: uuid;
	rel: text; // 'belongs_to_plan', 'supports_goal', 'targets_milestone', 'references', etc.
	dst_kind: text;
	dst_id: uuid;
	props: jsonb; // Additional edge metadata
	created_at: timestamptz;
}
```

**Common Task Relationships:**

| Relationship Direction | Edge `rel`                        | Description              |
| ---------------------- | --------------------------------- | ------------------------ |
| `task` → `plan`        | `belongs_to_plan`                 | Task belongs to a plan   |
| `task` → `goal`        | `supports_goal`                   | Task supports a goal     |
| `task` → `milestone`   | `targets_milestone`               | Task targets a milestone |
| `task` → `document`    | `task_has_document`, `references` | Task linked to document  |
| `task` → `decision`    | `references`                      | Task references decision |
| `task` → `task`        | `depends_on`, `blocks`            | Task dependencies        |
| `task` → `output`      | `produces`                        | Task produces output     |

## Requirements

### Functional Requirements

1. **Display Linked Entities Panel**: Add a "Linked Entities" card on the right sidebar showing all entities connected via `onto_edges`

2. **Entity Types to Display**:
    - 📋 **Plans** - Tasks belong to plans
    - 🎯 **Goals** - Tasks support goals
    - 🏁 **Milestones** - Tasks target milestones
    - 📄 **Documents** - Documents linked to tasks (excluding workspace/scratch docs)
    - 🧭 **Decisions** - Decisions referenced by tasks
    - ✅ **Dependent Tasks** - Tasks this task depends on or blocks

3. **Clickable Navigation**: Each linked entity opens its respective modal:
    - Plan → `PlanEditModal`
    - Goal → `GoalEditModal`
    - Milestone → (new MilestoneEditModal or info display)
    - Document → `DocumentModal`
    - Task → `TaskEditModal` (recursive, with navigation stack)

4. **Real-time Sync**: When a relationship is added/removed via dropdowns, the linked entities panel updates

5. **Empty State**: Show helpful message when no linked entities exist

### Non-Functional Requirements

- Responsive design (mobile-first)
- Dark mode support
- Loading states for async fetches
- Error handling with toast notifications
- Accessible (keyboard navigation, ARIA labels)

## Technical Design

### 1. API Enhancement: Fetch Task Linked Entities

**New API Endpoint or Enhancement**

Modify `GET /api/onto/tasks/[id]` to return linked entities:

```typescript
// apps/web/src/routes/api/onto/tasks/[id]/+server.ts

// Add new query to fetch all edges where task is src or dst
const { data: edges } = await supabase
	.from('onto_edges')
	.select('*')
	.or(`src_id.eq.${taskId},dst_id.eq.${taskId}`);

// Resolve entity details for each edge
const linkedEntities = await resolveLinkedEntities(supabase, edges, taskId);

return ApiResponse.success({
	task: { ...taskData, plan },
	template,
	linkedEntities // NEW: Add linked entities to response
});
```

**Response Shape:**

```typescript
interface LinkedEntitiesResponse {
	plans: Array<{ id: string; name: string; state_key: string; edge_rel: string }>;
	goals: Array<{ id: string; name: string; state_key?: string; edge_rel: string }>;
	milestones: Array<{ id: string; title: string; due_at?: string; edge_rel: string }>;
	documents: Array<{
		id: string;
		title: string;
		type_key: string;
		state_key: string;
		edge_rel: string;
	}>;
	dependentTasks: Array<{ id: string; title: string; state_key: string; edge_rel: string }>;
	outputs: Array<{
		id: string;
		name: string;
		type_key: string;
		state_key: string;
		edge_rel: string;
	}>;
	decisions: Array<{
		id: string;
		title: string;
		state_key?: string;
		type_key?: string;
		decision_at?: string;
		edge_rel: string;
	}>;
}
```

### 2. Component Updates

#### A. Add State Variables

```typescript
// TaskEditModal.svelte - New state variables
let linkedEntities = $state<LinkedEntitiesResponse | null>(null);
let linkedEntitiesLoading = $state(false);

// Modal state for opening linked entity modals
let selectedGoalId = $state<string | null>(null);
let showGoalModal = $state(false);

let selectedPlanIdForModal = $state<string | null>(null);
let showPlanModal = $state(false);

let selectedDocumentId = $state<string | null>(null);
let showDocumentModal = $state(false);

let selectedDecisionId = $state<string | null>(null);
let showDecisionModal = $state(false);

let selectedLinkedTaskId = $state<string | null>(null);
let showLinkedTaskModal = $state(false);
```

#### B. Load Linked Entities in loadTask()

```typescript
async function loadTask() {
	try {
		isLoading = true;
		// ... existing code ...

		const response = await fetch(`/api/onto/tasks/${taskId}`);
		const data = await response.json();

		task = data.data?.task;
		template = data.data?.template || null;
		linkedEntities = data.data?.linkedEntities || null; // NEW

		// ... rest of existing code ...
	} catch (err) {
		// ... error handling ...
	}
}
```

#### C. New UI Component: LinkedEntitiesCard

Add after the "Task Information" card in the sidebar:

```svelte
<!-- Linked Entities Card -->
<Card variant="elevated">
	<CardHeader variant="default">
		<h3
			class="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2"
		>
			<span class="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
			Linked Entities
		</h3>
	</CardHeader>
	<CardBody padding="sm">
		{#if linkedEntitiesLoading}
			<div class="flex justify-center py-4">
				<Loader class="w-5 h-5 animate-spin text-gray-400" />
			</div>
		{:else if linkedEntities && hasLinkedEntities(linkedEntities)}
			<div class="space-y-3">
				<!-- Plans Section -->
				{#if linkedEntities.plans.length > 0}
					<LinkedEntitySection
						label="Plans"
						icon={Layers}
						items={linkedEntities.plans}
						onItemClick={(id) => openPlanModal(id)}
					/>
				{/if}

				<!-- Goals Section -->
				{#if linkedEntities.goals.length > 0}
					<LinkedEntitySection
						label="Goals"
						icon={Target}
						items={linkedEntities.goals}
						onItemClick={(id) => openGoalModal(id)}
					/>
				{/if}

				<!-- Milestones Section -->
				{#if linkedEntities.milestones.length > 0}
					<LinkedEntitySection
						label="Milestones"
						icon={Flag}
						items={linkedEntities.milestones}
						onItemClick={(id) => openMilestoneModal(id)}
					/>
				{/if}

				<!-- Documents Section -->
				{#if linkedEntities.documents.length > 0}
					<LinkedEntitySection
						label="Documents"
						icon={FileText}
						items={linkedEntities.documents}
						onItemClick={(id) => openDocumentModal(id)}
					/>
				{/if}

				<!-- Decisions Section -->
				{#if linkedEntities.decisions.length > 0}
					<LinkedEntitySection
						label="Decisions"
						icon={ClipboardCheck}
						items={linkedEntities.decisions}
						onItemClick={(id) => openDecisionModal(id)}
					/>
				{/if}

				<!-- Dependent Tasks Section -->
				{#if linkedEntities.dependentTasks.length > 0}
					<LinkedEntitySection
						label="Related Tasks"
						icon={ListChecks}
						items={linkedEntities.dependentTasks}
						onItemClick={(id) => openTaskModal(id)}
					/>
				{/if}
			</div>
		{:else}
			<div class="text-center py-4">
				<Link2Off class="w-6 h-6 text-gray-400 mx-auto mb-2" />
				<p class="text-xs text-gray-500 dark:text-slate-400">No linked entities yet</p>
				<p class="text-xs text-gray-400 dark:text-slate-500 mt-1">
					Link this task to plans, goals, milestones, decisions, or documents using the
					form fields
				</p>
			</div>
		{/if}
	</CardBody>
</Card>
```

#### D. LinkedEntitySection Sub-component

Create a reusable sub-component for each entity type section:

```svelte
<!-- Can be inline or extracted to a separate component -->
{#snippet LinkedEntitySection(label, icon: typeof Icon, items, onItemClick)}
  <div class="space-y-1.5">
    <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
      <svelte:component this={icon} class="w-3.5 h-3.5" />
      {label}
      <Badge variant="neutral" size="xs">{items.length}</Badge>
    </div>
    {#each items as item}
      <button
        type="button"
        onclick={() => onItemClick(item.id)}
        class="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {item.name || item.title}
          </span>
          <ExternalLink class="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {#if item.state_key}
          <span class="text-xs text-gray-500">{item.state_key}</span>
        {/if}
      </button>
    {/each}
  </div>
{/snippet}
```

#### E. Modal Handlers

```typescript
function openPlanModal(id: string) {
	selectedPlanIdForModal = id;
	showPlanModal = true;
}

function openGoalModal(id: string) {
	selectedGoalId = id;
	showGoalModal = true;
}

function openDocumentModal(id: string) {
	selectedDocumentId = id;
	workspaceDocumentModalOpen = true;
	workspaceDocumentId = id;
}

function openDecisionModal(id: string) {
	selectedDecisionId = id;
	showDecisionModal = true;
}

function openTaskModal(id: string) {
	selectedLinkedTaskId = id;
	showLinkedTaskModal = true;
}

function handleLinkedEntityModalClose() {
	selectedGoalId = null;
	selectedPlanIdForModal = null;
	selectedDocumentId = null;
	selectedDecisionId = null;
	selectedLinkedTaskId = null;
	showGoalModal = false;
	showPlanModal = false;
	showDecisionModal = false;
	showLinkedTaskModal = false;
	// Refresh task data to get updated linked entities
	loadTask();
}
```

#### F. Add Modal Instances at Bottom of Component

```svelte
<!-- Linked Entity Modals -->
{#if showGoalModal && selectedGoalId}
  <GoalEditModal
    goalId={selectedGoalId}
    projectId={projectId}
    onClose={() => { showGoalModal = false; loadTask(); }}
    onUpdated={() => { showGoalModal = false; loadTask(); }}
    onDeleted={() => { showGoalModal = false; loadTask(); }}
  />
{/if}

{#if showPlanModal && selectedPlanIdForModal}
  <PlanEditModal
    planId={selectedPlanIdForModal}
    projectId={projectId}
    tasks={[]} <!-- Pass relevant tasks if available -->
    onClose={() => { showPlanModal = false; loadTask(); }}
    onUpdated={() => { showPlanModal = false; loadTask(); }}
    onDeleted={() => { showPlanModal = false; loadTask(); }}
  />
{/if}

{#if showDecisionModal && selectedDecisionId}
  <DecisionEditModal
    decisionId={selectedDecisionId}
    projectId={projectId}
    onClose={() => { showDecisionModal = false; loadTask(); }}
    onUpdated={() => { showDecisionModal = false; loadTask(); }}
    onDeleted={() => { showDecisionModal = false; loadTask(); }}
  />
{/if}

{#if showLinkedTaskModal && selectedLinkedTaskId}
  <svelte:self
    taskId={selectedLinkedTaskId}
    projectId={projectId}
    plans={plans}
    goals={goals}
    milestones={milestones}
    onClose={() => { showLinkedTaskModal = false; loadTask(); }}
    onUpdated={() => { showLinkedTaskModal = false; loadTask(); }}
    onDeleted={() => { showLinkedTaskModal = false; loadTask(); }}
  />
{/if}
```

### 3. Backend Implementation

#### A. Helper Function: resolveLinkedEntities

```typescript
// apps/web/src/routes/api/onto/tasks/task-linked-helpers.ts

import type { SupabaseClient } from '@supabase/supabase-js';

interface LinkedEntity {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_rel: string;
}

interface LinkedEntitiesResult {
	plans: LinkedEntity[];
	goals: LinkedEntity[];
	milestones: LinkedEntity[];
	documents: LinkedEntity[];
	dependentTasks: LinkedEntity[];
	outputs: LinkedEntity[];
	decisions: LinkedEntity[];
}

export async function resolveLinkedEntities(
	supabase: SupabaseClient,
	taskId: string
): Promise<LinkedEntitiesResult> {
	const result: LinkedEntitiesResult = {
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		dependentTasks: [],
		outputs: [],
		decisions: []
	};

	// Fetch all edges where task is source or destination
	const { data: edges, error } = await supabase
		.from('onto_edges')
		.select('*')
		.or(`src_id.eq.${taskId},dst_id.eq.${taskId}`);

	if (error || !edges || edges.length === 0) {
		return result;
	}

	// Group edges by entity type
	const planIds: string[] = [];
	const goalIds: string[] = [];
	const milestoneIds: string[] = [];
	const documentIds: string[] = [];
	const taskIds: string[] = [];

	const edgeMap = new Map<string, string>(); // entityId -> rel

	for (const edge of edges) {
		const isSource = edge.src_id === taskId;
		const linkedId = isSource ? edge.dst_id : edge.src_id;
		const linkedKind = isSource ? edge.dst_kind : edge.src_kind;

		edgeMap.set(linkedId, edge.rel);

		switch (linkedKind) {
			case 'plan':
				if (!planIds.includes(linkedId)) planIds.push(linkedId);
				break;
			case 'goal':
				if (!goalIds.includes(linkedId)) goalIds.push(linkedId);
				break;
			case 'milestone':
				if (!milestoneIds.includes(linkedId)) milestoneIds.push(linkedId);
				break;
			case 'document':
				if (!documentIds.includes(linkedId)) documentIds.push(linkedId);
				break;
			case 'task':
				if (linkedId !== taskId && !taskIds.includes(linkedId)) taskIds.push(linkedId);
				break;
		}
	}

	// Fetch entity details in parallel
	const [plansData, goalsData, milestonesData, documentsData, tasksData] = await Promise.all([
		planIds.length > 0
			? supabase.from('onto_plans').select('id, name, state_key').in('id', planIds)
			: Promise.resolve({ data: [] }),
		goalIds.length > 0
			? supabase.from('onto_goals').select('id, name, state_key').in('id', goalIds)
			: Promise.resolve({ data: [] }),
		milestoneIds.length > 0
			? supabase.from('onto_milestones').select('id, title, due_at').in('id', milestoneIds)
			: Promise.resolve({ data: [] }),
		documentIds.length > 0
			? supabase
					.from('onto_documents')
					.select('id, title, type_key, state_key')
					.in('id', documentIds)
			: Promise.resolve({ data: [] }),
		taskIds.length > 0
			? supabase.from('onto_tasks').select('id, title, state_key').in('id', taskIds)
			: Promise.resolve({ data: [] })
	]);

	// Map results with edge relationships
	if (plansData.data) {
		result.plans = plansData.data.map((p: any) => ({
			...p,
			edge_rel: edgeMap.get(p.id) || 'belongs_to_plan'
		}));
	}

	if (goalsData.data) {
		result.goals = goalsData.data.map((g: any) => ({
			...g,
			edge_rel: edgeMap.get(g.id) || 'supports_goal'
		}));
	}

	if (milestonesData.data) {
		result.milestones = milestonesData.data.map((m: any) => ({
			...m,
			edge_rel: edgeMap.get(m.id) || 'targets_milestone'
		}));
	}

	if (documentsData.data) {
		// Filter out scratch/workspace documents
		result.documents = documentsData.data
			.filter((d: any) => !d.type_key?.includes('scratch'))
			.map((d: any) => ({
				...d,
				edge_rel: edgeMap.get(d.id) || 'has_document'
			}));
	}

	if (tasksData.data) {
		result.dependentTasks = tasksData.data.map((t: any) => ({
			...t,
			edge_rel: edgeMap.get(t.id) || 'depends_on'
		}));
	}

	return result;
}
```

## UI/UX Design

### Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Task Edit Modal                                           [X]   │
├─────────────────────────────────────────────────────────────────┤
│ [DETAILS]  [WORKSPACE]                                          │
├──────────────────────────────────┬──────────────────────────────┤
│                                  │ ┌──────────────────────────┐ │
│ ┌──────────────────────────────┐ │ │ Task Information         │ │
│ │ Template: task.execute       │ │ │ Template: Basic Task     │ │
│ └──────────────────────────────┘ │ │ ID: a1b2c3d4...          │ │
│                                  │ │ Created: Nov 15, 2025    │ │
│ Title: [___________________]     │ └──────────────────────────┘ │
│                                  │                              │
│ Description:                     │ ┌──────────────────────────┐ │
│ [                           ]    │ │ ● Linked Entities        │ │  ← NEW
│ [___________________________]    │ ├──────────────────────────┤ │
│                                  │ │ 📋 Plans (1)             │ │
│ Priority: [P3 - Medium ▼]        │ │   ○ Sprint 3      [→]   │ │
│ Plan:     [Sprint 3    ▼]        │ │                          │ │
│ Goal:     [Launch MVP  ▼]        │ │ 🎯 Goals (1)             │ │
│ Milestone:[Beta Release▼]        │ │   ○ Launch MVP    [→]   │ │
│                                  │ │                          │ │
│ ┌──────────────────────────────┐ │ │ 🏁 Milestones (1)        │ │
│ │ FSM State: [todo] → [●] → [] │ │ │   ○ Beta Release  [→]   │ │
│ └──────────────────────────────┘ │ │                          │ │
│                                  │ │ 📄 Documents (2)         │ │
│ ┌──────────────────────────────┐ │ │   ○ Requirements  [→]   │ │
│ │ 📄 Connected Documents (2)   │ │ │   ○ Design Spec   [→]   │ │
│ │ ┌────────────────────────┐   │ │ └──────────────────────────┘ │
│ │ │ Project Brief  [draft] │   │ │                              │
│ │ └────────────────────────┘   │ │ ┌──────────────────────────┐ │
│ └──────────────────────────────┘ │ │ 📅 Schedule              │ │
│                                  │ │ Due Date: [___________]  │ │
├──────────────────────────────────┴──────────────────────────────┤
│ [Delete Task]                              [Cancel] [Save]      │
└─────────────────────────────────────────────────────────────────┘
```

### Interactive States

1. **Hover**: Row highlights, external link icon appears
2. **Click**: Opens corresponding modal
3. **Loading**: Skeleton loader while fetching
4. **Empty**: Friendly message with guidance

### Color Coding (Dark Mode Compatible)

| Entity Type | Icon Color       | Badge Color         |
| ----------- | ---------------- | ------------------- |
| Plans       | Blue (#3b82f6)   | `variant="info"`    |
| Goals       | Purple (#8b5cf6) | `variant="purple"`  |
| Milestones  | Amber (#f59e0b)  | `variant="warning"` |
| Documents   | Cyan (#06b6d4)   | `variant="info"`    |
| Tasks       | Green/Orange     | State-based         |
| Outputs     | Violet (#8b5cf6) | `variant="purple"`  |

## Implementation Phases

### Phase 1: Backend & API (Est. 2-3 hours)

- [ ] Create `resolveLinkedEntities` helper function
- [ ] Update `GET /api/onto/tasks/[id]` to include linked entities
- [ ] Add TypeScript types for `LinkedEntitiesResponse`
- [ ] Add unit tests for the helper function

### Phase 2: UI Components (Est. 3-4 hours)

- [ ] Add state variables for linked entities
- [ ] Create LinkedEntitiesCard component
- [ ] Add imports for required icons (Target, Flag, Layers, etc.)
- [ ] Implement modal opening handlers
- [ ] Style with Tailwind (responsive, dark mode)

### Phase 3: Modal Integration (Est. 2-3 hours)

- [ ] Import GoalEditModal, PlanEditModal
- [ ] Add modal instances to template
- [ ] Handle modal close with data refresh
- [ ] Test recursive TaskEditModal opening

### Phase 4: Polish & Testing (Est. 1-2 hours)

- [ ] Empty states and loading states
- [ ] Error handling with toast notifications
- [ ] Keyboard navigation and accessibility
- [ ] Manual testing across viewports

## Testing Checklist

- [ ] Linked entities display correctly when task has connections
- [ ] Empty state shows when task has no links
- [ ] Clicking a plan opens PlanEditModal
- [ ] Clicking a goal opens GoalEditModal
- [ ] Clicking a document opens DocumentModal
- [ ] Clicking a task opens nested TaskEditModal
- [ ] Changes in linked modal reflect back (refresh)
- [ ] Dark mode styles are correct
- [ ] Mobile responsive layout works
- [ ] Loading states appear during fetch
- [ ] Errors show toast notifications

## Future Enhancements

1. **Add/Remove Links Inline**: Allow adding new links directly from the panel without using dropdowns
2. **Link Previews**: Show hover cards with entity details
3. **Graph Visualization**: Mini graph showing entity relationships
4. **Bulk Link Management**: Select multiple entities to link at once
5. **Link History**: Show when links were created

## Related Files

- **Component**: `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
- **API**: `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
- **Types**: `apps/web/src/lib/types/onto-api.ts`
- **Modals**:
    - `GoalEditModal.svelte`
    - `PlanEditModal.svelte`
    - `DocumentModal.svelte`
- **Data Models**: `apps/web/docs/features/ontology/DATA_MODELS.md`

## References

- [Ontology System Overview](/apps/web/docs/features/ontology/README.md)
- [Modal Design Patterns](/apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md)
- [BuildOS Style Guide](/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)
