<!-- apps/web/docs/technical/components/modals/CREATE_TO_EDIT_TRANSITION.md -->
# Create-to-Edit Modal Transition

> **Status**: Implementation in Progress
> **Date**: 2026-01-20
> **Location**: `/apps/web/src/routes/projects/[id]/+page.svelte`

## Overview

When a user creates a new entity (task, plan, goal, etc.) on the project page, the experience should smoothly transition them into the edit modal for that newly created entity. This allows users to immediately add more details, link related entities, and continue working without losing context.

## Problem Statement

### Current Behavior (Before)

1. User opens create modal (e.g., TaskCreateModal)
2. User fills out basic info and clicks "Create"
3. Create modal closes immediately
4. Page refreshes data in background
5. User must manually find and click the new entity to edit it
6. **Poor UX**: Context is lost, extra clicks required

### Desired Behavior (After)

1. User opens create modal
2. User fills out basic info and clicks "Create"
3. Brief success feedback (toast)
4. **Edit modal opens automatically** for the newly created entity
5. User can immediately add more details, linked entities, tags, etc.
6. **Smooth UX**: No context loss, seamless workflow

## Architecture Analysis

### Entity Modal Patterns

| Entity       | Create Component              | Edit Component              | Pattern                      |
| ------------ | ----------------------------- | --------------------------- | ---------------------------- |
| **Document** | `DocumentModal.svelte`        | Same component              | **Unified** (already works!) |
| Task         | `TaskCreateModal.svelte`      | `TaskEditModal.svelte`      | Separate                     |
| Plan         | `PlanCreateModal.svelte`      | `PlanEditModal.svelte`      | Separate                     |
| Goal         | `GoalCreateModal.svelte`      | `GoalEditModal.svelte`      | Separate                     |
| Risk         | `RiskCreateModal.svelte`      | `RiskEditModal.svelte`      | Separate                     |
| Milestone    | `MilestoneCreateModal.svelte` | `MilestoneEditModal.svelte` | Separate                     |
| Event        | `EventCreateModal.svelte`     | `EventEditModal.svelte`     | Separate                     |

### DocumentModal - The Reference Implementation

`DocumentModal.svelte` already implements the smooth transition pattern:

```typescript
// Lines 106-115: Internal state for transition
let internalDocumentId = $state<string | null>(null);

$effect(() => {
	internalDocumentId = documentId;
});

const activeDocumentId = $derived(internalDocumentId);
const isEditing = $derived(Boolean(activeDocumentId));

// Lines 354-362: Transition after creation
async function handleSave(event?: SubmitEvent) {
	// ... save logic ...

	// If we just created a new document, transition to edit mode
	if (wasCreating && result?.data?.id) {
		internalDocumentId = result.data.id;
		await loadDocument(result.data.id);
	}
	// Modal stays open - no closeModal() call
}
```

**Key insight**: DocumentModal handles both create and edit in one component, making internal transitions seamless.

## Implementation Strategy

### Option A: Parent-Side Handler Enhancement (Chosen)

Modify the parent page (`+page.svelte`) handlers to automatically open the edit modal after creation.

**Advantages:**

- Minimal changes to existing create modal components
- Leverages existing edit modal infrastructure
- Quick to implement

**Trade-off:**

- Brief visual "flash" as create modal closes and edit modal opens
- Two separate components still maintained

### Option B: Unified Modal Components (Future)

Merge create and edit modals into single unified components (like DocumentModal).

**Advantages:**

- Smoother in-place transition
- Single component to maintain
- Better code reuse

**Trade-off:**

- Larger refactor
- More complex component logic

## Implementation Details

### Handler Changes in `+page.svelte`

#### Before (Current)

```typescript
async function handleTaskCreated() {
	await refreshData();
	showTaskCreateModal = false;
}
```

#### After (With Transition)

```typescript
async function handleTaskCreated(taskId: string) {
	await refreshData();
	showTaskCreateModal = false;
	// Auto-open edit modal for the newly created task
	editingTaskId = taskId;
}
```

### Create Modal Callback Signature

Create modals already pass the new entity ID via `onCreated`:

```typescript
// TaskCreateModal.svelte - Lines 177-180
if (onCreated) {
	onCreated(result.data.task.id);
}
onClose();
```

The parent just needs to use this ID to open the edit modal.

### Entities to Update

1. **Task**: `handleTaskCreated(taskId)` → set `editingTaskId = taskId`
2. **Plan**: `handlePlanCreated(planId)` → set `editingPlanId = planId`
3. **Goal**: `handleGoalCreated(goalId)` → set `editingGoalId = goalId`
4. **Risk**: `handleRiskCreated(riskId)` → set `editingRiskId = riskId`
5. **Milestone**: `handleMilestoneCreated(milestoneId)` → set `editingMilestoneId = milestoneId`
6. **Event**: `handleEventCreated(eventId)` → set `editingEventId = eventId`

### Toast Feedback

Consider adding a brief toast notification during transition:

```typescript
async function handleTaskCreated(taskId: string) {
	toastService.success('Task created');
	await refreshData();
	showTaskCreateModal = false;
	editingTaskId = taskId;
}
```

## File Changes Required

| File                                              | Change                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `/apps/web/src/routes/projects/[id]/+page.svelte` | Update all `handle*Created` functions to accept ID and open edit modal |

## Testing Checklist

- [ ] Create task → edit modal opens automatically
- [ ] Create plan → edit modal opens automatically
- [ ] Create goal → edit modal opens automatically
- [ ] Create risk → edit modal opens automatically
- [ ] Create milestone → edit modal opens automatically
- [ ] Create event → edit modal opens automatically
- [ ] Document creation still works (already unified)
- [ ] Close button on edit modal works correctly
- [ ] Data refreshes correctly after creation
- [ ] Mobile responsiveness maintained

## Future Improvements

1. **Unified Modal Components**: Migrate all create/edit to unified pattern like DocumentModal
2. **Transition Animation**: Add subtle animation between create → edit states
3. **Success State**: Brief "Created!" overlay before transitioning to edit
4. **Keyboard Support**: Ensure focus management works correctly during transition

## Related Documentation

- [Modal System Overview](/apps/web/docs/technical/components/modals/README.md)
- [Modal Quick Reference](/apps/web/docs/technical/components/modals/QUICK_REFERENCE.md)
- [Inkprint Design System](/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
- [Ontology System](/apps/web/docs/features/ontology/README.md)
