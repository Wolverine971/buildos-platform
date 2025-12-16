# Specification: "Chat About" Button for Ontology Modals

## Overview

Add a "Chat about this [entity]" button to all ontology data model edit modals that opens the AgentChatModal with the entity properly focused as context, using the same focus system as the ProjectFocusSelector.

## Target Modals

The following 7 edit modals need this feature:

| Modal                    | File Path                                                     | Focus Type     | Entity Name |
| ------------------------ | ------------------------------------------------------------- | -------------- | ----------- |
| TaskEditModal            | `src/lib/components/ontology/TaskEditModal.svelte`            | `task`         | Task        |
| GoalEditModal            | `src/lib/components/ontology/GoalEditModal.svelte`            | `goal`         | Goal        |
| PlanEditModal            | `src/lib/components/ontology/PlanEditModal.svelte`            | `plan`         | Plan        |
| RiskEditModal            | `src/lib/components/ontology/RiskEditModal.svelte`            | `risk`         | Risk        |
| MilestoneEditModal       | `src/lib/components/ontology/MilestoneEditModal.svelte`       | `milestone`    | Milestone   |
| OutputEditModal          | `src/lib/components/ontology/OutputEditModal.svelte`          | `output`       | Output      |
| OntologyProjectEditModal | `src/lib/components/ontology/OntologyProjectEditModal.svelte` | `project-wide` | Project     |

**Note:** Risk is not currently in the `ProjectFocus.focusType` union. This may need to be added to `@buildos/shared-types` or use `ontology` context type.

## Icon: brain-bolt

The button should use the **brain-bolt** icon, which is the same icon used in the Navigation to open the agentic chat. This is an image file at `/brain-bolt.png`.

Reference from `Navigation.svelte:344-368`:

```svelte
<img
	src="/brain-bolt.png"
	alt="Chat about this"
	class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover"
/>
```

## ProjectFocus Interface

The AgentChatModal uses `ProjectFocus` for entity-level context (from `@buildos/shared-types`):

```typescript
interface ProjectFocus {
	focusType: 'project-wide' | 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
	focusEntityId: string | null;
	focusEntityName: string | null;
	projectId: string;
	projectName: string;
}
```

## AgentChatModal Props

The AgentChatModal accepts these relevant props (from `AgentChatModal.svelte:74-82`):

```typescript
interface Props {
	isOpen?: boolean;
	contextType?: ChatContextType; // Use 'project' for entity focus
	entityId?: string; // Project ID
	onClose?: () => void;
	autoInitProject?: AutoInitProjectConfig | null; // Can include initial focus
	// ...
}

interface AutoInitProjectConfig {
	projectId: string;
	projectName: string;
	showActionSelector?: boolean; // Set to false to skip action selector
	initialAction?: ProjectAction; // 'workspace' for direct chat
}
```

## Implementation Design

### 1. Button Placement

Add the button in the **modal header** next to the close button:

```svelte
<!-- Action buttons container -->
<div class="flex items-center gap-1">
	<!-- Chat about button with brain-bolt icon -->
	<Button
		variant="ghost"
		size="sm"
		onclick={openChatAbout}
		class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
		disabled={isLoading || isSaving}
		title="Chat about this {entityTypeName}"
	>
		<img
			src="/brain-bolt.png"
			alt="Chat about this {entityTypeName}"
			class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover"
		/>
	</Button>

	<!-- Existing close button -->
	<Button variant="ghost" ...>
		<!-- X icon -->
	</Button>
</div>
```

### 2. Lazy Loading Pattern

Follow the existing lazy-loading pattern:

```svelte
<script lang="ts">
  import type { ComponentType } from 'svelte';
  import type { ProjectFocus } from '@buildos/shared-types';

  // Props (already available in each modal)
  let { entityId, projectId, ... }: Props = $props();

  // Entity data (loaded by modal)
  let entity = $state<any>(null);

  // Lazy-loaded AgentChatModal
  let AgentChatModalComponent = $state<ComponentType<any> | null>(null);
  let showChatModal = $state(false);

  // Build the focus for this entity
  const entityFocus = $derived.by((): ProjectFocus | null => {
    if (!entity || !projectId) return null;
    return {
      focusType: 'task',  // or 'goal', 'plan', etc.
      focusEntityId: entityId,
      focusEntityName: entity.title || entity.name || 'Untitled',
      projectId: projectId,
      projectName: entity.project?.name || 'Project'
    };
  });

  async function loadAgentChatModal() {
    if (!AgentChatModalComponent) {
      const mod = await import('$lib/components/agent/AgentChatModal.svelte');
      AgentChatModalComponent = mod.default;
    }
    return AgentChatModalComponent;
  }

  async function openChatAbout() {
    if (!entity || !projectId) return;
    await loadAgentChatModal();
    showChatModal = true;
  }

  function handleChatClose() {
    showChatModal = false;
  }
</script>
```

### 3. Modal Rendering with Focus

The key is passing the focus through `autoInitProject` with `showActionSelector: false`:

```svelte
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<svelte:component
		this={AgentChatModalComponent}
		isOpen={showChatModal}
		contextType="project"
		entityId={projectId}
		autoInitProject={{
			projectId: projectId,
			projectName: entityFocus.projectName,
			showActionSelector: false,
			initialAction: 'workspace'
		}}
		onClose={handleChatClose}
	/>
{/if}
```

**However**, looking at the AgentChatModal code, the `projectFocus` state is internal and needs to be set after initialization. We need to either:

1. **Option A**: Add a new prop to AgentChatModal for `initialProjectFocus`
2. **Option B**: Use context type `'task'` with `entityId` set to the task ID (simpler, already supported)

### Recommended Approach: Use Existing Context Types

For **tasks**, the existing system already supports `contextType: 'task'` with `entityId`:

```svelte
<svelte:component
	this={AgentChatModalComponent}
	isOpen={showChatModal}
	contextType="task"
	entityId={taskId}
	onClose={handleChatClose}
/>
```

For **other entity types** (goal, plan, milestone, output, document), we need to:

1. Either extend `ChatContextType` to support these
2. Or add an `initialProjectFocus` prop to AgentChatModal

## Implementation by Modal

### TaskEditModal (Already Supported)

```svelte
const chatContextType = 'task'; const chatEntityId = taskId; // Render:
<svelte:component
	this={AgentChatModalComponent}
	isOpen={showChatModal}
	contextType={chatContextType}
	entityId={chatEntityId}
	onClose={handleChatClose}
/>
```

### GoalEditModal, PlanEditModal, MilestoneEditModal, OutputEditModal

These require passing `projectFocus`. The cleanest approach is to add an `initialProjectFocus` prop to AgentChatModal:

```svelte
// In the modal:
const entityFocus: ProjectFocus = {
  focusType: 'goal',  // or 'plan', 'milestone', 'output'
  focusEntityId: goalId,
  focusEntityName: goal.name,
  projectId: projectId,
  projectName: projectName  // May need to fetch this
};

// Render:
<svelte:component
  this={AgentChatModalComponent}
  isOpen={showChatModal}
  contextType="project"
  entityId={projectId}
  initialProjectFocus={entityFocus}
  onClose={handleChatClose}
/>
```

### OntologyProjectEditModal

```svelte
// Project-wide focus:
const entityFocus: ProjectFocus = {
  focusType: 'project-wide',
  focusEntityId: null,
  focusEntityName: null,
  projectId: projectId,
  projectName: project.name
};

<svelte:component
  this={AgentChatModalComponent}
  isOpen={showChatModal}
  contextType="project"
  entityId={projectId}
  autoInitProject={{
    projectId: projectId,
    projectName: project.name,
    showActionSelector: false,
    initialAction: 'workspace'
  }}
  onClose={handleChatClose}
/>
```

### RiskEditModal

Risk is not currently in the `focusType` union. Options:

1. Add `'risk'` to `ProjectFocus.focusType` in shared-types
2. Use `contextType: 'ontology'` as a fallback

## Required Changes

### 1. Add `initialProjectFocus` prop to AgentChatModal

In `AgentChatModal.svelte`, add:

```typescript
interface Props {
	// ... existing props
	initialProjectFocus?: ProjectFocus | null; // NEW
}

let {
	// ... existing
	initialProjectFocus = null
}: Props = $props();

// Initialize projectFocus from prop on mount
$effect(() => {
	if (initialProjectFocus && !projectFocus) {
		projectFocus = initialProjectFocus;
		// Skip context selection and action selector
		showContextSelection = false;
		showProjectActionSelector = false;
		selectedContextType = 'project';
		selectedEntityId = initialProjectFocus.projectId;
		selectedContextLabel =
			initialProjectFocus.focusEntityName || initialProjectFocus.projectName;
	}
});
```

### 2. Update shared-types (Optional)

If we want to support Risk in the focus system, update `packages/shared-types/src/agent.types.ts`:

```typescript
export interface ProjectFocus {
	focusType:
		| 'project-wide'
		| 'task'
		| 'goal'
		| 'plan'
		| 'document'
		| 'output'
		| 'milestone'
		| 'risk';
	// ...
}
```

## Implementation Checklist

### Phase 1: Extend AgentChatModal

- [ ] Add `initialProjectFocus` prop to `AgentChatModal.svelte`
- [ ] Add initialization effect to set focus from prop
- [ ] Skip context selection when `initialProjectFocus` is provided
- [ ] Seed appropriate initial message for focused entity

### Phase 2: Update Each Modal

For each modal, add:

- [ ] Import `type { ComponentType }` from `svelte`
- [ ] Import `type { ProjectFocus }` from `@buildos/shared-types`
- [ ] Add lazy-load state: `AgentChatModalComponent`, `showChatModal`
- [ ] Add `entityFocus` derived state
- [ ] Add `loadAgentChatModal()` function
- [ ] Add `openChatAbout()` function
- [ ] Add `handleChatClose()` function
- [ ] Add brain-bolt button to header
- [ ] Add AgentChatModal render block with `initialProjectFocus`

### Modal-by-Modal Checklist

- [ ] `TaskEditModal.svelte` - focusType: `'task'`
- [ ] `GoalEditModal.svelte` - focusType: `'goal'`
- [ ] `PlanEditModal.svelte` - focusType: `'plan'`
- [ ] `RiskEditModal.svelte` - focusType: `'risk'` (requires shared-types update) or fallback
- [ ] `MilestoneEditModal.svelte` - focusType: `'milestone'`
- [ ] `OutputEditModal.svelte` - focusType: `'output'`
- [ ] `OntologyProjectEditModal.svelte` - focusType: `'project-wide'`

### Phase 3: Optional - Update shared-types

- [ ] Add `'risk'` to `ProjectFocus.focusType` union
- [ ] Regenerate types if needed

## Example Header Implementation

Using TaskEditModal header as reference:

```svelte
{#snippet header()}
	<div
		class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
	>
		<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
			<!-- Entity icon and title (existing) -->
			<div
				class="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"
			>
				<ListChecks class="w-4 h-4" />
			</div>
			<div class="min-w-0 flex-1">
				<h2
					class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
				>
					{title || task?.title || 'Task'}
				</h2>
				<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
					<!-- Timestamps -->
				</p>
			</div>
		</div>

		<!-- Action buttons container -->
		<div class="flex items-center gap-1">
			<!-- NEW: Chat about button with brain-bolt icon -->
			<Button
				variant="ghost"
				size="sm"
				onclick={openChatAbout}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isLoading || isSaving || !task}
				title="Chat about this task"
			>
				<img
					src="/brain-bolt.png"
					alt="Chat about this task"
					class="w-4 h-4 sm:w-5 sm:h-5 rounded object-cover transition-transform hover:scale-110"
				/>
			</Button>

			<!-- Existing close button -->
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving || isDeleting}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	</div>
{/snippet}
```

## UX Flow

1. User opens TaskEditModal (or other entity modal)
2. User sees brain-bolt icon button in header
3. User clicks brain-bolt button
4. AgentChatModal opens with:
    - Context already set to the entity (no context selection screen)
    - Focus already set to the specific entity
    - Initial message like: "Let's focus on '{entity.title}' in {projectName}. What would you like to know or update?"
5. User can chat about the entity with full context
6. User closes chat → returns to edit modal

## Testing

1. Verify brain-bolt icon renders correctly in light/dark modes
2. Verify button is disabled during loading/saving states
3. Verify lazy loading works (AgentChatModal not loaded until clicked)
4. Verify correct `ProjectFocus` is passed for each entity type
5. Verify AgentChatModal opens directly to chat (no context/action selection)
6. Verify entity context is loaded by the chat agent
7. Test on mobile viewports
8. Test accessibility (button title, alt text)

## Files to Modify

### Core Changes (Phase 1)

1. `apps/web/src/lib/components/agent/AgentChatModal.svelte` - Add `initialProjectFocus` prop

### Modal Updates (Phase 2)

2. `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
3. `apps/web/src/lib/components/ontology/GoalEditModal.svelte`
4. `apps/web/src/lib/components/ontology/PlanEditModal.svelte`
5. `apps/web/src/lib/components/ontology/RiskEditModal.svelte`
6. `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`
7. `apps/web/src/lib/components/ontology/OutputEditModal.svelte`
8. `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`

### Optional (Phase 3)

9. `packages/shared-types/src/agent.types.ts` - Add `'risk'` to focusType

## Estimated Effort

- Phase 1 (AgentChatModal update): ~30 minutes
- Phase 2 (7 modals × ~20 min each): ~2-3 hours
- Phase 3 (shared-types, optional): ~15 minutes
- Testing: ~1 hour

**Total: ~4-5 hours**
