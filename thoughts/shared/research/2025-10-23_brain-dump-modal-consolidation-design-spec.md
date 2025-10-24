# Brain Dump Modal Consolidation - Design Specification

**Date:** 2025-10-23
**Status:** Design Review
**Author:** Claude Code
**Related Issue:** Multiple BrainDumpModal instances causing performance degradation

---

## Executive Summary

This document proposes consolidating **three separate BrainDumpModal instances** into a **single global instance** to eliminate redundant memory usage, prevent unnecessary cleanup cycles, and improve application performance. The change affects modal lifecycle, state management, and handoff transitions to the notification stack.

**Impact:**

- **Performance:** 50-66% reduction in memory usage for modal-related resources
- **UX:** Smoother modal-to-notification transitions, no disruption during page navigation
- **Maintainability:** Single source of truth, easier debugging and updates

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problem Statement](#2-problem-statement)
3. [Proposed Solution](#3-proposed-solution)
4. [Edge Cases & Transitions](#4-edge-cases--transitions)
5. [Implementation Plan](#5-implementation-plan)
6. [Testing Strategy](#6-testing-strategy)
7. [Rollback Plan](#7-rollback-plan)
8. [Success Metrics](#8-success-metrics)

---

## 1. Current State Analysis

### 1.1 Modal Instance Locations

**Instance #1: Navigation.svelte** (Global)

```typescript
// Location: apps/web/src/lib/components/layout/Navigation.svelte:25
import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte';

// Rendered at: line 727-730
<BrainDumpModal
    isOpen={showBrainDumpModal}
    project={currentProject}
    showNavigationOnSuccess={true}
    on:close={handleBrainDumpClose}
/>
```

- **Scope:** Always present across all authenticated pages (mounted in root +layout.svelte)
- **Project Source:** `currentProject` from route data (`$page.data?.project`)
- **Always Mounted:** Yes

**Instance #2: Dashboard.svelte** (Homepage)

```typescript
// Location: apps/web/src/lib/components/dashboard/Dashboard.svelte:37
import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte';

// Rendered at: line 1114-1118
<BrainDumpModal
    isOpen={showBrainDumpModal}
    project={selectedBrainDumpProject}
    showNavigationOnSuccess={true}
    on:close={handleBrainDumpClose}
/>
```

- **Scope:** Only present on homepage (`/`)
- **Project Source:** `selectedBrainDumpProject` (local state, set to `{id: 'new'}` or specific project)
- **Always Mounted:** Yes (when Dashboard component is mounted)

**Instance #3: projects/+page.svelte** (Projects Page)

```typescript
// Location: apps/web/src/routes/projects/+page.svelte:34
let BrainDumpModal = $state<any>(null);

// Lazy loaded at: line 156-162
async function loadBrainDumpModal() {
    if (!BrainDumpModal) {
        BrainDumpModal = (await import('$lib/components/brain-dump/BrainDumpModal.svelte')).default;
    }
    return BrainDumpModal;
}

// Rendered at: line 790-794
{#if BrainDumpModal}
    <BrainDumpModal
        isOpen={showBrainDumpModal}
        project={selectedBrainDumpProject}
        on:close={handleBrainDumpClose}
    />
{/if}
```

- **Scope:** Only present on `/projects` page
- **Project Source:** `selectedBrainDumpProject` (local state)
- **Always Mounted:** No (conditionally rendered after lazy load)

### 1.2 Resource Usage Per Instance

Each mounted BrainDumpModal instance creates:

**Memory Allocations:**

- ✅ Voice recording service initialization (`voiceRecordingService`)
- ✅ Auto-save timeout handler (2-second debounce)
- ✅ Abort controllers for SSE/API stream cancellation
- ✅ 20+ `$derived` reactive computations (grouped by concern)
- ✅ 6+ `$effect` watchers (view changes, modal open/close, initialization)
- ✅ Lazy-loaded component references (ProjectSelectionView, RecordingView, ParseResultsDiffView, SuccessView, ProcessingModal, OperationEditModal)
- ✅ Store subscriptions to `brainDumpV2Store`
- ✅ Recording duration store subscription
- ✅ Component-specific state variables (20+ $state variables)

**Event Listeners:**

- ✅ Window resize listener (innerWidth binding)
- ✅ Keyboard event listeners (in sub-components)
- ✅ Voice recording event handlers
- ✅ Store subscription listeners

**Performance Impact:**

- **Homepage (`/`):** 2 instances mounted = **2x memory + event listeners**
- **Projects page (`/projects`):** 2 instances mounted = **2x memory + event listeners**
- **Other pages:** 1 instance mounted = **1x memory** (Navigation only)

### 1.3 Current Lifecycle & Cleanup Behavior

**Cleanup Triggers:**

1. Component `onDestroy` lifecycle (when component unmounts)
2. Modal close handler (`handleModalClose`)
3. Handoff to notification system

**Cleanup Actions** (from `BrainDumpModal.svelte:597-653`):

```typescript
function cleanup(reason: CleanupReason = 'close') {
	// 0. Abort SSE/streaming connections
	if (abortController && !MULTI_BRAINDUMP_ENABLED) {
		abortController.abort();
	}

	// 1. Cleanup voice recording service
	voiceRecordingService.cleanup();

	// 2. Clear auto-save timeout
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
	}

	// 3. Reset state
	isAutoSaving = false;
	isHandingOff = false;

	// 7. Clear component references (garbage collection)
	ProjectSelectionView = null;
	RecordingView = null;
	ParseResultsDiffView = null;
	SuccessView = null;
	ProcessingModal = null;
	DualProcessingResults = null;
	OperationEditModal = null;

	// 8. Emergency mutex release (if needed)
	if (!MULTI_BRAINDUMP_ENABLED && currentState.processing.mutex) {
		brainDumpV2Store.releaseMutex();
	}
}
```

**Observed Cleanup Frequency:**

- Log: `"[BrainDumpModal] Running cleanup { reason: 'destroy' }"`
- **Triggers on:**
    - Every page navigation (Dashboard.svelte unmounts → Instance #2 cleanup)
    - Every projects page unmount (Instance #3 cleanup)
    - Page refresh (all instances unmount)
    - Tab close (all instances unmount)

### 1.4 Modal-to-Notification Handoff Flow

**Current Flow** (Multi-brain dump mode enabled):

```
1. User clicks "Process" in BrainDumpModal
   ↓
2. BrainDumpModal.parseBrainDump() called
   ↓
3. Set isHandingOff = true (show loading overlay)
   ↓
4. brainDumpV2Store.startBrainDump(brainDumpId, {...})
   ↓
5. Bridge detects brain dump start → creates notification
   ↓
6. Bridge calls startProcessingAPICall() → starts SSE stream
   ↓
7. BrainDumpModal performs handoff:
   - Wait 300ms for fade animation
   - Call cleanup('handoff')
   - Set isOpen = false
   - Dispatch 'close' event
   ↓
8. Parent component closes modal
   ↓
9. NotificationStackManager shows notification
   ↓
10. User can expand notification to see progress
```

**Bridge Responsibilities** (`brain-dump-notification.bridge.ts`):

- Subscribe to `brainDumpV2Store` changes
- Create notification when processing starts
- Update notification with streaming progress
- Handle notification actions (view, dismiss)
- Cancel API streams on dismiss
- Clean up completed notifications

---

## 2. Problem Statement

### 2.1 Core Issues

**Issue #1: Multiple Instances Waste Memory**

- When user is on homepage: **2 instances** (Navigation + Dashboard) = **2x resources**
- When user is on projects page: **2 instances** (Navigation + projects/+page) = **2x resources**
- Each instance maintains full state, event listeners, and subscriptions
- **Impact:** 50-66% unnecessary memory usage for modal-related resources

**Issue #2: Excessive Cleanup Cycles**

- Cleanup runs **on every page navigation** as instances unmount
- User sees `"[BrainDumpModal] Running cleanup { reason: 'destroy' }"` frequently
- Cleanup is necessary but happening more often than needed
- **Impact:** Performance overhead during navigation, confusing logs

**Issue #3: State Synchronization Complexity**

- Three different sources for `selectedBrainDumpProject` prop
- Store manages global state, but modal instances have local state
- Potential for state inconsistencies across instances
- **Impact:** Harder to debug, potential edge cases

**Issue #4: Code Duplication**

- Same modal rendering logic in 3 places
- Updates require changes in multiple files
- Inconsistent prop handling (`showNavigationOnSuccess` missing in projects/+page)
- **Impact:** Maintenance burden, potential bugs

### 2.2 User Experience Impact

**Current Experience:**

- ✅ Modal opens instantly (always mounted)
- ✅ Smooth handoff to notification stack
- ❌ Unnecessary memory usage (invisible to user)
- ❌ Cleanup logs may indicate performance issues

**Potential Edge Cases (Current State):**

1. **Multiple modals fighting for control:** If both Navigation and Dashboard instances have `isOpen=true`, which one wins?
2. **Project prop conflicts:** Navigation uses route data, Dashboard uses local state - could they differ?
3. **Handoff race conditions:** If page navigates during handoff, which instance completes the handoff?

---

## 3. Proposed Solution

### 3.1 Architecture

**Single Global Instance Pattern:**

```
+layout.svelte
  └── Navigation.svelte (ONLY LOCATION)
        └── <BrainDumpModal ... />
```

**Key Principles:**

1. **Single Source of Truth:** Only Navigation.svelte renders BrainDumpModal
2. **Store-Based Communication:** All components use `brainDumpV2Store` to control modal
3. **Project Selection via Store:** Pass project through store, not props
4. **Persistent Instance:** Modal always mounted, just toggles visibility

### 3.2 Detailed Changes

#### Change #1: Keep Modal in Navigation.svelte (Global)

**File:** `apps/web/src/lib/components/layout/Navigation.svelte`

**Current Code:**

```svelte
<BrainDumpModal
	isOpen={showBrainDumpModal}
	project={currentProject}
	showNavigationOnSuccess={true}
	on:close={handleBrainDumpClose}
/>
```

**Proposed Code (No Changes Needed):**

```svelte
<!-- This remains the ONLY instance -->
<BrainDumpModal
	isOpen={showBrainDumpModal}
	project={currentProject}
	showNavigationOnSuccess={true}
	on:close={handleBrainDumpClose}
/>
```

**Rationale:**

- Navigation is already global (in +layout.svelte)
- Already has proper project handling
- No changes needed - this is the keeper!

---

#### Change #2: Remove Modal from Dashboard.svelte

**File:** `apps/web/src/lib/components/dashboard/Dashboard.svelte`

**Lines to Remove:**

```svelte
Line 37: import BrainDumpModal from '$lib/components/brain-dump/BrainDumpModal.svelte'; Lines
1114-1118:
<BrainDumpModal
	isOpen={showBrainDumpModal}
	project={selectedBrainDumpProject}
	showNavigationOnSuccess={true}
	on:close={handleBrainDumpClose}
/>
```

**Lines to Modify:**

```svelte
// KEEP THIS - used to control modal via store
let selectedBrainDumpProject = $state<any>(null);

// MODIFY handleBrainDump function
async function handleBrainDump() {
    // OLD:
    // await loadBrainDumpModal();
    // showNewProjectModal = false;
    // brainDumpV2Store.openModal();
    // selectedBrainDumpProject = { id: 'new', name: 'New Project / Note', isProject: false };

    // NEW:
    showNewProjectModal = false;
    const newProjectSelection = { id: 'new', name: 'New Project / Note', isProject: false };
    brainDumpV2Store.selectProject(newProjectSelection);  // Set project in store first
    brainDumpV2Store.openModal();  // Then open modal
}

// MODIFY handleBrainDumpClose function
function handleBrainDumpClose() {
    // OLD:
    // selectedBrainDumpProject = null;

    // NEW:
    // No need to clear - store manages project state
}
```

**Rationale:**

- Removes duplicate modal instance
- Uses store-based communication instead
- Keeps project selection logic (just sets it in store)
- Modal in Navigation will use project from store

---

#### Change #3: Remove Modal from projects/+page.svelte

**File:** `apps/web/src/routes/projects/+page.svelte`

**Lines to Remove:**

```svelte
Line 34: let BrainDumpModal = $state<any>(null);

Lines 156-162: loadBrainDumpModal function (entire function)

Lines 388-394: // Inside handleBrainDump
async function handleBrainDump() {
    await loadBrainDumpModal();  // REMOVE THIS LINE
    brainDumpV2Store.openModal();
    selectedBrainDumpProject = { id: 'new', name: 'New Project / Note', isProject: false };
}

Lines 790-794:
{#if BrainDumpModal}
    <BrainDumpModal
        isOpen={showBrainDumpModal}
        project={selectedBrainDumpProject}
        on:close={handleBrainDumpClose}
    />
{/if}
```

**Lines to Modify:**

```svelte
// KEEP THIS - used to control modal
let selectedBrainDumpProject = $state<any>(null);

// MODIFY handleBrainDump
async function handleBrainDump() {
    // NEW:
    const newProjectSelection = { id: 'new', name: 'New Project / Note', isProject: false };
    brainDumpV2Store.selectProject(newProjectSelection);  // Set project in store first
    brainDumpV2Store.openModal();  // Then open modal
}

// MODIFY handleProjectBrainDump (when brain dumping for specific project)
async function handleProjectBrainDump(event: CustomEvent) {
    const project = event.detail.project;
    // NEW:
    brainDumpV2Store.selectProject(project);  // Set project in store first
    brainDumpV2Store.openModal();  // Then open modal
}

// MODIFY handleBrainDumpClose
function handleBrainDumpClose() {
    // OLD:
    // selectedBrainDumpProject = null;

    // NEW:
    // No need to clear - store manages project state
}
```

**Rationale:**

- Removes duplicate modal instance and lazy loading
- Uses store-based communication
- Keeps project selection logic
- Modal in Navigation will use project from store

---

#### Change #4: Enhance Navigation Modal to Use Store Project

**File:** `apps/web/src/lib/components/layout/Navigation.svelte`

**Current Code:**

```svelte
const currentProject = $derived(
    currentPath.startsWith('/projects/') && $page.data?.project
        ? $page.data.project
        : null
);

<BrainDumpModal
    isOpen={showBrainDumpModal}
    project={currentProject}  // <-- Uses route-based project
    showNavigationOnSuccess={true}
    on:close={handleBrainDumpClose}
/>
```

**Proposed Code:**

```svelte
// Import store if not already imported
import { brainDumpV2Store, isModalOpen as brainDumpModalIsOpen } from '$lib/stores/brain-dump-v2.store';

// Derive project from store (takes precedence) or route data (fallback)
const storeProject = $derived($brainDumpV2Store?.core?.selectedProject ?? null);
const routeProject = $derived(
    currentPath.startsWith('/projects/') && $page.data?.project
        ? $page.data.project
        : null
);

// Priority: Store project > Route project > null
const modalProject = $derived(storeProject ?? routeProject ?? null);

<BrainDumpModal
    isOpen={showBrainDumpModal}
    project={modalProject}  // <-- Uses store project (priority) or route project (fallback)
    showNavigationOnSuccess={true}
    on:close={handleBrainDumpClose}
/>

function handleBrainDumpClose() {
    // Clear store project selection when modal closes
    brainDumpV2Store.clearProjectSelection();  // <-- NEW METHOD NEEDED
}
```

**Store Enhancement Needed:**

```typescript
// In brain-dump-v2.store.ts
export const brainDumpV2Store = {
	// ... existing methods ...

	// NEW METHOD
	clearProjectSelection() {
		update((state) => ({
			...state,
			core: {
				...state.core,
				selectedProject: null
			}
		}));
	}
};
```

**Rationale:**

- Supports both use cases:
    - **Direct navigation to project page:** Uses `routeProject` from page data
    - **Programmatic open from Dashboard/Projects:** Uses `storeProject` set by components
- Store project takes priority (explicit user action)
- Falls back to route project (implicit context)
- Clears project selection when modal closes (clean slate for next open)

---

### 3.3 Store Communication Pattern

**Before** (Props-based):

```svelte
<!-- Dashboard.svelte -->
<script>
    let selectedBrainDumpProject = $state({ id: 'new' });
</script>

<BrainDumpModal
    isOpen={...}
    project={selectedBrainDumpProject}  // Pass via prop
/>
```

**After** (Store-based):

```svelte
<!-- Dashboard.svelte -->
<script>
	function openBrainDumpForNewProject() {
		const newProject = { id: 'new', name: 'New Project / Note' };
		brainDumpV2Store.selectProject(newProject); // Set in store
		brainDumpV2Store.openModal(); // Open modal
	}
</script>

<!-- No modal component needed here -->
```

```svelte
<!-- Navigation.svelte -->
<script>
    // Read from store
    const modalProject = $derived($brainDumpV2Store?.core?.selectedProject ?? routeProject);
</script>

<BrainDumpModal
    isOpen={...}
    project={modalProject}  // Read from store
/>
```

---

## 4. Edge Cases & Transitions

### 4.1 Modal-to-Notification Transition

**Critical Requirements:**

1. **Smooth visual transition** - no jarring jumps
2. **Preserve processing state** - don't lose streaming progress
3. **Handle navigation during transition** - modal should close cleanly
4. **Support multi-brain dump** - multiple processes can run simultaneously

**Current Flow (Multi-brain dump mode):**

```
BrainDumpModal.parseBrainDump()
  → Set isHandingOff = true (shows loading overlay)
  → brainDumpV2Store.startBrainDump(brainDumpId, {...})
  → Bridge detects start → creates notification
  → Bridge calls startProcessingAPICall() → SSE stream begins
  → Wait 300ms (fade animation)
  → cleanup('handoff') - DOES NOT clear store state
  → Close modal (isOpen = false)
  → NotificationStackManager shows notification
```

**After Consolidation:**

```
BrainDumpModal.parseBrainDump() [ONLY instance in Navigation]
  → Set isHandingOff = true
  → brainDumpV2Store.startBrainDump(brainDumpId, {...})
  → Bridge creates notification
  → Bridge starts SSE stream
  → Wait 300ms
  → cleanup('handoff') - DOES NOT clear store state
  → Close modal (isOpen = false)
  → User navigates to /projects
    → BrainDumpModal STAYS MOUNTED (in Navigation)
    → No cleanup('destroy') triggered
  → NotificationStackManager shows notification
  → Processing continues smoothly
```

**Key Difference:**

- **Before:** If Dashboard instance was active, navigating away would destroy it (cleanup runs)
- **After:** Single instance in Navigation persists across navigation (no cleanup)

**Impact on Transition:**

- ✅ **Smoother:** Modal doesn't unmount during page navigation
- ✅ **Cleaner:** Only runs cleanup when actually closing/destroying
- ✅ **No race conditions:** Single instance = single handoff flow

---

### 4.2 Edge Case Matrix

| Edge Case                                   | Current Behavior                                                         | New Behavior                                   | Risk Level                             |
| ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------- |
| **User navigates while modal open**         | Modal in old page unmounts (cleanup runs), modal in new page might exist | Modal persists (in Navigation), no cleanup     | ✅ Low - Improved                      |
| **User navigates during handoff**           | Old instance completes handoff then unmounts, notification continues     | Same instance completes handoff, stays mounted | ✅ Low - Improved                      |
| **Multiple brain dumps processing**         | Works correctly (MULTI_BRAINDUMP_ENABLED)                                | Works correctly (no change)                    | ✅ Low - No change                     |
| **Page refresh during processing**          | All instances unmount, bridge rebinds persisted notifications            | Single instance unmounts, bridge rebinds       | ✅ Low - Same behavior                 |
| **Open modal from Dashboard**               | Dashboard instance opens                                                 | Navigation instance opens via store            | ⚠️ Medium - Test thoroughly            |
| **Open modal from Projects page**           | Projects instance opens                                                  | Navigation instance opens via store            | ⚠️ Medium - Test thoroughly            |
| **Open modal from Navigation button**       | Navigation instance opens                                                | Navigation instance opens                      | ✅ Low - No change                     |
| **Project prop conflicts**                  | Possible if Navigation + Dashboard have different projects               | Impossible - single source (store)             | ✅ Low - Improved                      |
| **Double-open (spam click)**                | Store prevents, but 2 instances might fight                              | Store prevents, 1 instance handles             | ✅ Low - Improved                      |
| **Close during lazy component load**        | Each instance manages its own components                                 | Single instance manages components             | ✅ Low - No change                     |
| **Voice recording during navigation**       | Instance unmounts → voice cleanup runs                                   | Instance persists → voice continues?           | ⚠️ Medium - Verify voice cleanup logic |
| **Auto-save during navigation**             | Instance unmounts → auto-save aborted                                    | Instance persists → auto-save might complete   | ⚠️ Medium - Verify save logic          |
| **Notification dismiss during modal open**  | Modal and notification independent                                       | Modal and notification independent             | ✅ Low - No change                     |
| **Modal open during notification expanded** | Possible confusion (modal + notification modal)                          | Same behavior (store manages state)            | ✅ Low - No change                     |

---

### 4.3 State Transition Diagram

**Before (Multiple Instances):**

```
[Homepage /]
  Navigation Instance: MOUNTED, CLOSED
  Dashboard Instance: MOUNTED, CLOSED
                              ↓
                     User clicks "Brain Dump"
                              ↓
  Navigation Instance: MOUNTED, CLOSED
  Dashboard Instance: MOUNTED, OPEN ← Active
                              ↓
                    User navigates to /projects
                              ↓
  Navigation Instance: MOUNTED, CLOSED
  Dashboard Instance: UNMOUNTED ← cleanup('destroy')
  Projects Instance:  MOUNTED, CLOSED (after lazy load)
```

**After (Single Instance):**

```
[Homepage /]
  Navigation Instance: MOUNTED, CLOSED
                              ↓
                     User clicks "Brain Dump"
                       (Dashboard calls store)
                              ↓
  Navigation Instance: MOUNTED, OPEN ← Active
                              ↓
                    User navigates to /projects
                              ↓
  Navigation Instance: MOUNTED, OPEN ← Still Active!
                              ↓
                         User closes modal
                              ↓
  Navigation Instance: MOUNTED, CLOSED
```

---

### 4.4 Handoff Transition Timing

**Critical Timing Sequence:**

```
T=0ms:    User clicks "Process"
T=0ms:    isHandingOff = true (overlay shows)
T=0ms:    brainDumpV2Store.startBrainDump()
T=0ms:    Bridge creates notification (minimized)
T=0-50ms: Bridge starts SSE stream
T=300ms:  Modal fade-out completes
T=300ms:  cleanup('handoff') runs
T=300ms:  isOpen = false (modal hidden)
T=350ms:  Parent handles close event
T=350ms:  Notification visible in stack
```

**View Transition API Integration:**

```typescript
// Current code (BrainDumpModal.svelte:1130-1142)
const supportsViewTransitions = browser && 'startViewTransition' in document;

if (supportsViewTransitions) {
	await document.startViewTransition(performHandoff).finished;
} else {
	await performHandoff();
}
```

**After Consolidation:**

- Same code, same timing
- Difference: No risk of Navigation instance unmounting during handoff
- Improvement: More reliable transition (instance stays mounted)

---

## 5. Implementation Plan

### 5.1 Phase 1: Preparation (Day 1)

**Goal:** Set up store enhancements and safety checks

**Tasks:**

1. ✅ Create this design document
2. ⬜ Add `selectProject()` method to `brainDumpV2Store` (if doesn't exist)
3. ⬜ Add `clearProjectSelection()` method to `brainDumpV2Store`
4. ⬜ Write unit tests for store project selection logic
5. ⬜ Review current `handleBrainDumpClose` logic in all 3 locations
6. ⬜ Document all current props and event handlers

**Acceptance Criteria:**

- Store has working project selection methods
- Tests pass for store methods
- Documentation complete

---

### 5.2 Phase 2: Dashboard.svelte Changes (Day 1)

**Goal:** Remove modal from Dashboard, use store communication

**Tasks:**

1. ⬜ Remove `import BrainDumpModal` line
2. ⬜ Remove `<BrainDumpModal>` component block
3. ⬜ Update `handleBrainDump()` to use store
4. ⬜ Update `handleBrainDumpClose()` (if needed)
5. ⬜ Test brain dump flow from Dashboard

**Testing Checklist:**

- [ ] Click "Brain Dump" button on Dashboard
- [ ] Modal opens (from Navigation instance)
- [ ] Type in input → auto-save works
- [ ] Close modal → state clears correctly
- [ ] Re-open modal → starts fresh
- [ ] Process brain dump → handoff to notification works
- [ ] Navigate to /projects while modal open → modal stays open
- [ ] Navigate to /projects during handoff → notification appears

---

### 5.3 Phase 3: projects/+page.svelte Changes (Day 1-2)

**Goal:** Remove modal from projects page, use store communication

**Tasks:**

1. ⬜ Remove `let BrainDumpModal = $state<any>(null)` line
2. ⬜ Remove `loadBrainDumpModal()` function
3. ⬜ Remove `{#if BrainDumpModal}...{/if}` block
4. ⬜ Update `handleBrainDump()` to use store
5. ⬜ Update `handleProjectBrainDump()` to use store (if exists)
6. ⬜ Update `handleBrainDumpClose()` (if needed)
7. ⬜ Test brain dump flow from Projects page

**Testing Checklist:**

- [ ] Click "Brain Dump" button on Projects page
- [ ] Modal opens (from Navigation instance)
- [ ] Select project from dropdown → works
- [ ] Close modal → state clears correctly
- [ ] Click "Brain Dump" on specific project card
- [ ] Modal opens with that project pre-selected
- [ ] Process brain dump for existing project → works
- [ ] Navigate to Dashboard while modal open → modal stays open

---

### 5.4 Phase 4: Navigation.svelte Enhancements (Day 2)

**Goal:** Enhance modal to use store project with route fallback

**Tasks:**

1. ⬜ Add store project derivation logic
2. ⬜ Update `project` prop to use `modalProject`
3. ⬜ Update `handleBrainDumpClose` to clear store project
4. ⬜ Test all project selection scenarios

**Testing Checklist:**

- [ ] Navigate to /projects/[id] → modal uses route project
- [ ] Click brain dump in Dashboard → modal uses store project (new)
- [ ] Click brain dump in Projects → modal uses store project
- [ ] Click brain dump in Navigation → modal uses route project (if on project page) or null
- [ ] Close modal → store project clears
- [ ] Re-open → correct project context

---

### 5.5 Phase 5: Integration Testing (Day 2-3)

**Goal:** Verify all edge cases and transitions

**Test Matrix:**

| Test Scenario                      | Steps                                                   | Expected Result                          | Status |
| ---------------------------------- | ------------------------------------------------------- | ---------------------------------------- | ------ |
| **Basic Open/Close**               | Open modal from Dashboard → Close                       | Modal opens & closes, no errors          | ⬜     |
| **Navigation with Open Modal**     | Open modal → Navigate to /projects → Check modal        | Modal stays open, same content           | ⬜     |
| **Process Brain Dump**             | Open → Input text → Process → Check notification        | Handoff smooth, notification appears     | ⬜     |
| **Process During Navigation**      | Start processing → Navigate → Check notification        | Processing continues, notification works | ⬜     |
| **Multiple Brain Dumps**           | Start brain dump #1 → Open modal again → Start #2       | Both process correctly                   | ⬜     |
| **Page Refresh During Processing** | Start processing → Refresh page → Check notification    | Notification rebinds correctly           | ⬜     |
| **Voice Recording**                | Start voice recording → Navigate → Check recording      | Recording cleans up properly             | ⬜     |
| **Auto-Save**                      | Type in modal → Navigate → Check draft                  | Draft saves correctly                    | ⬜     |
| **Project Selection - Dashboard**  | Dashboard → Brain Dump → Check project                  | "New Project" selected                   | ⬜     |
| **Project Selection - Projects**   | Projects → Brain Dump → Check project                   | "New Project" selected                   | ⬜     |
| **Project Selection - Route**      | Navigate to /projects/[id] → Brain Dump → Check project | That project selected                    | ⬜     |
| **Cleanup Frequency**              | Navigate between pages 5 times → Check console          | Only 1 cleanup (on logout/close)         | ⬜     |

---

### 5.6 Phase 6: Performance Validation (Day 3)

**Goal:** Confirm memory and performance improvements

**Metrics to Measure:**

**Before Consolidation:**

1. Open DevTools → Performance Monitor
2. Navigate to `/` → Measure memory
3. Navigate to `/projects` → Measure memory
4. Open brain dump modal → Measure memory
5. Process brain dump → Measure transition timing
6. Navigate between pages 5 times → Count cleanup logs

**After Consolidation:**

1. Repeat same measurements
2. Compare results

**Expected Improvements:**

- [ ] **Memory Usage:** 50-66% reduction in modal-related memory
- [ ] **Cleanup Logs:** Reduced from 5 (one per navigation) to 1 (only on logout)
- [ ] **Transition Timing:** Same or better (no modal remounting)
- [ ] **Event Listeners:** Count reduced by 50-66%

**Tools:**

- Chrome DevTools → Performance Monitor
- Chrome DevTools → Memory Profiler
- React DevTools (if applicable)
- Console log analysis

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Store Tests** (`brain-dump-v2.store.test.ts`):

```typescript
describe('brainDumpV2Store project selection', () => {
	it('should set project via selectProject()', () => {
		// Test implementation
	});

	it('should clear project via clearProjectSelection()', () => {
		// Test implementation
	});

	it('should handle null project gracefully', () => {
		// Test implementation
	});
});
```

### 6.2 Integration Tests

**Modal Open Flow:**

- Test opening from Dashboard
- Test opening from Projects page
- Test opening from Navigation
- Test opening from route (project detail page)

**Modal Close Flow:**

- Test closing with X button
- Test closing with ESC key
- Test closing with backdrop click
- Test closing during processing (should prevent)

**Handoff Flow:**

- Test modal → notification transition
- Test processing continues during navigation
- Test notification persists after modal closes

### 6.3 Manual Testing Checklist

**Pre-Launch Checklist:**

- [ ] All automated tests pass
- [ ] Code review complete
- [ ] Performance metrics validated
- [ ] Edge cases tested manually
- [ ] Documentation updated
- [ ] Changelog entry added

**User Acceptance Criteria:**

- [ ] Brain dump works from Dashboard
- [ ] Brain dump works from Projects page
- [ ] Brain dump works from Navigation
- [ ] Brain dump works from project detail page
- [ ] Processing handoff is smooth
- [ ] Navigation during modal is smooth
- [ ] No console errors
- [ ] No cleanup logs on navigation
- [ ] Memory usage is reduced

---

## 7. Rollback Plan

### 7.1 Rollback Triggers

**When to rollback:**

1. **Critical bug:** Modal doesn't open from any location
2. **Data loss:** Brain dump content is lost during handoff
3. **Performance regression:** Memory usage increases instead of decreases
4. **User-facing error:** Users cannot complete brain dump flow

### 7.2 Rollback Procedure

**Step 1: Revert Code Changes**

```bash
# If using feature branch
git checkout main
git pull origin main

# If already merged
git revert <commit-hash>
git push origin main
```

**Step 2: Verify Rollback**

- Test brain dump from Dashboard
- Test brain dump from Projects page
- Verify handoff still works
- Check for cleanup logs (should be back to previous frequency)

**Step 3: Deploy Rollback**

```bash
pnpm build
# Deploy to production (Vercel)
```

**Step 4: Post-Rollback Analysis**

- Analyze why rollback was needed
- Document lessons learned
- Plan fix for issues
- Re-attempt deployment when ready

---

## 8. Success Metrics

### 8.1 Performance Metrics

**Memory Usage:**

- **Target:** 50-66% reduction in modal-related memory when on homepage or projects page
- **Measurement:** Chrome DevTools Memory Profiler
- **Baseline:** ~2-3 MB for modal components (before)
- **Goal:** ~1-1.5 MB for modal components (after)

**Cleanup Frequency:**

- **Target:** 80% reduction in cleanup calls during normal navigation
- **Measurement:** Console log count for cleanup logs
- **Baseline:** 1 cleanup per page navigation (5 cleanups for 5 navigations)
- **Goal:** 1 cleanup only on logout/tab close (0 cleanups for 5 navigations)

**Event Listeners:**

- **Target:** 50-66% reduction in event listeners when on homepage or projects page
- **Measurement:** Chrome DevTools → Event Listeners panel
- **Baseline:** Count listeners on homepage (before)
- **Goal:** ~50% of baseline (after)

### 8.2 User Experience Metrics

**Modal Open Time:**

- **Target:** Same or better (already instant)
- **Measurement:** Time from click to modal visible
- **Baseline:** ~50ms (already very fast)
- **Goal:** ≤ 50ms (maintain performance)

**Handoff Transition Time:**

- **Target:** Same or better
- **Measurement:** Time from "Process" click to notification visible
- **Baseline:** ~350-400ms
- **Goal:** ≤ 350ms (maintain smoothness)

**Error Rate:**

- **Target:** 0 new errors introduced
- **Measurement:** Console error count + user reports
- **Baseline:** 0 errors (current state is stable)
- **Goal:** 0 errors (maintain stability)

### 8.3 Code Quality Metrics

**Code Duplication:**

- **Target:** Eliminate modal rendering duplication
- **Measurement:** Number of `<BrainDumpModal>` instances in codebase
- **Baseline:** 3 instances
- **Goal:** 1 instance

**Maintainability:**

- **Target:** Easier to update modal logic
- **Measurement:** Lines of code changed for future modal updates
- **Baseline:** 3 files to update
- **Goal:** 1 file to update

---

## 9. Risk Assessment

### 9.1 Risk Matrix

| Risk                                      | Likelihood | Impact | Mitigation Strategy                    | Owner |
| ----------------------------------------- | ---------- | ------ | -------------------------------------- | ----- |
| **Modal doesn't open from Dashboard**     | Medium     | High   | Thorough testing, rollback plan        | Dev   |
| **Modal doesn't open from Projects page** | Medium     | High   | Thorough testing, rollback plan        | Dev   |
| **Project selection breaks**              | Low        | Medium | Unit tests for store logic             | Dev   |
| **Handoff transition breaks**             | Low        | High   | Integration tests, manual testing      | Dev   |
| **Performance regression**                | Very Low   | Medium | Performance benchmarks before/after    | Dev   |
| **Voice recording issues**                | Low        | Medium | Test voice recording during navigation | Dev   |
| **Auto-save race conditions**             | Low        | Low    | Test auto-save during navigation       | Dev   |
| **Notification doesn't appear**           | Very Low   | High   | Test all handoff scenarios             | Dev   |

### 9.2 Deployment Strategy

**Recommended Approach:** Feature flag + gradual rollout

**Option 1: Feature Flag (Recommended)**

```typescript
// In environment config
const SINGLE_MODAL_INSTANCE = import.meta.env.VITE_SINGLE_MODAL_INSTANCE === 'true';

// In Dashboard.svelte
{#if !SINGLE_MODAL_INSTANCE}
    <BrainDumpModal ... />
{/if}

// In projects/+page.svelte
{#if !SINGLE_MODAL_INSTANCE && BrainDumpModal}
    <BrainDumpModal ... />
{/if}
```

**Rollout Plan:**

1. **Week 1:** Deploy with feature flag OFF (existing behavior)
2. **Week 1-2:** Enable for internal testing (staging environment)
3. **Week 2:** Enable for 10% of production users
4. **Week 2-3:** Monitor metrics, fix issues if any
5. **Week 3:** Enable for 50% of production users
6. **Week 3-4:** Monitor metrics
7. **Week 4:** Enable for 100% of users
8. **Week 5:** Remove feature flag code

**Option 2: Direct Deployment (Faster, riskier)**

1. Deploy all changes at once
2. Monitor closely for first 24 hours
3. Rollback immediately if critical issues
4. Fix and re-deploy

**Recommendation:** Use Option 1 (Feature Flag) for safety, especially for production app with active users.

---

## 10. Documentation Updates

### 10.1 Code Documentation

**Files to Update:**

1. `BrainDumpModal.svelte` - Add comment about being global instance
2. `Navigation.svelte` - Document modal project selection logic
3. `brain-dump-v2.store.ts` - Document new methods
4. `Dashboard.svelte` - Add comment about using store to open modal
5. `projects/+page.svelte` - Add comment about using store to open modal

### 10.2 Technical Documentation

**New Documentation:**

- This design spec (already created)
- Implementation notes (to be created after implementation)
- Migration guide for future modal consolidations

**Updated Documentation:**

- `/apps/web/docs/features/brain-dump/README.md` - Update modal architecture section
- `/apps/web/CLAUDE.md` - Update brain dump component section
- `/BUGFIX_CHANGELOG.md` - Add entry for this fix

### 10.3 Changelog Entry

**Format:**

```markdown
## [YYYY-MM-DD] - Brain Dump Modal Consolidation

### Changed

- Consolidated BrainDumpModal from 3 instances to 1 global instance in Navigation.svelte
- Updated Dashboard and Projects page to use store-based communication for opening modal
- Enhanced Navigation modal to accept project via store with route data fallback

### Performance

- Reduced modal-related memory usage by 50-66%
- Eliminated cleanup cycles during page navigation (80% reduction)
- Reduced event listeners by 50-66%

### Technical Details

- Removed duplicate BrainDumpModal instances from Dashboard.svelte and projects/+page.svelte
- Added `selectProject()` and `clearProjectSelection()` methods to brain-dump-v2.store
- Updated modal project prop to prioritize store project over route project
- Maintained smooth modal-to-notification handoff transition

### Migration

- No user-facing changes - brain dump functionality works identically
- Developers: Use `brainDumpV2Store.selectProject()` + `openModal()` to open modal programmatically
```

---

## 11. Acceptance Criteria

**Definition of Done:**

**Code Complete:**

- [ ] All code changes implemented
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review approved
- [ ] No TypeScript errors
- [ ] No ESLint warnings

**Testing Complete:**

- [ ] All manual test scenarios pass
- [ ] Performance metrics validated
- [ ] Edge cases tested
- [ ] No regressions in existing functionality

**Documentation Complete:**

- [ ] Code comments added
- [ ] Technical docs updated
- [ ] Changelog entry added
- [ ] Implementation notes written

**Deployment Complete:**

- [ ] Feature deployed to staging
- [ ] Staging validation passed
- [ ] Feature deployed to production
- [ ] Production monitoring for 24 hours
- [ ] No critical bugs reported
- [ ] Performance metrics meet targets

---

## 12. Open Questions

**Questions to Resolve Before Implementation:**

1. **Q:** Should we keep `selectedBrainDumpProject` local state in Dashboard/Projects for backwards compatibility?
    - **A:** Keep for now, but just use it to call `brainDumpV2Store.selectProject()` instead of passing as prop

2. **Q:** What happens if user opens modal while notification is expanded?
    - **A:** Modal takes precedence (notification collapses). This is existing behavior - no change needed.

3. **Q:** Should we add analytics to track modal open source (Dashboard vs Projects vs Navigation)?
    - **A:** Good idea for future, but not required for this change. Add TODO comment.

4. **Q:** Do we need to update the brain dump notification bridge for this change?
    - **A:** No - bridge is independent of modal instances. It watches the store, not the modal.

5. **Q:** Should we consolidate other modals using this same pattern?
    - **A:** Future work. Document this as a potential pattern for other modals if successful.

---

## 13. Next Steps

**Immediate Actions:**

1. ✅ Review this design document
2. ⬜ Get stakeholder approval
3. ⬜ Create implementation branch
4. ⬜ Begin Phase 1 (Preparation)

**Timeline:**

- **Day 1:** Phases 1-2 (Preparation + Dashboard changes)
- **Day 2:** Phases 3-4 (Projects page + Navigation enhancements)
- **Day 3:** Phases 5-6 (Integration testing + Performance validation)
- **Day 4-5:** Bug fixes, documentation, deployment prep
- **Week 2:** Gradual rollout (if using feature flag)

**Communication:**

- Notify team of upcoming changes
- Update project board with implementation tasks
- Schedule code review session
- Plan deployment window

---

## Appendix A: Current Code Snapshots

### A.1 BrainDumpModal Cleanup Function

**Location:** `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:597-653`

```typescript
function cleanup(reason: CleanupReason = 'close') {
	if (cleanupCompleted) {
		console.debug('[BrainDumpModal] Skipping cleanup - already completed', { reason });
		return;
	}
	cleanupCompleted = true;
	console.debug('[BrainDumpModal] Running cleanup', { reason });

	// 0. Abort any active SSE/streaming connections
	// IMPORTANT: In multi-brain dump mode, the bridge manages API streams, so only abort if legacy mode
	if (abortController && !MULTI_BRAINDUMP_ENABLED) {
		try {
			console.log('[Cleanup] Aborting active streaming connection');
			abortController.abort();
		} catch (e) {
			console.warn('[Cleanup] Error aborting streaming connection:', e);
		}
		abortController = null;
	}

	// 1. Cleanup voice recording service
	voiceRecordingService.cleanup();
	isCurrentlyRecording = false;

	// 2. Clear auto-save timeout
	if (autoSaveTimeout) {
		clearTimeout(autoSaveTimeout);
		autoSaveTimeout = null;
	}

	// 3. Reset state
	isAutoSaving = false;
	isHandingOff = false;

	// 7. Clear component references (helps with garbage collection) and reset load state
	ProjectSelectionView = null;
	RecordingView = null;
	ParseResultsDiffView = null;
	SuccessView = null;
	ProcessingModal = null;
	DualProcessingResults = null;
	OperationEditModal = null;
	componentsLoaded = { ...initialComponentLoadState };

	// 8. Release processing mutex if held (emergency release)
	// IMPORTANT: In multi-brain dump mode, don't touch mutexes - bridge manages them
	if (!MULTI_BRAINDUMP_ENABLED) {
		const currentState = get(brainDumpV2Store);
		if (currentState.processing.mutex) {
			console.warn('[Cleanup] Emergency mutex release on component destroy');
			brainDumpV2Store.releaseMutex();
		}
	}

	// Reset abort controller
	abortController = null;
}
```

---

## Appendix B: Store Methods Reference

### B.1 Existing Store Methods

**From `brain-dump-v2.store.ts`:**

```typescript
export const brainDumpV2Store = {
    subscribe,

    // Modal control
    openModal(),
    closeModal(),

    // Project selection
    selectProject(project),  // Already exists!

    // Processing
    startBrainDump(brainDumpId, config),
    completeBrainDump(brainDumpId),

    // Multi-brain dump
    isProjectBeingProcessed(projectId),
    getActiveBrainDumpCount(),

    // ... many other methods
};
```

### B.2 New Store Methods Needed

```typescript
export const brainDumpV2Store = {
	// ... existing methods ...

	// NEW METHOD
	clearProjectSelection() {
		update((state) => ({
			...state,
			core: {
				...state.core,
				selectedProject: null
			}
		}));
	}
};
```

---

## Appendix C: References

**Related Documentation:**

- `/apps/web/docs/features/brain-dump/README.md` - Brain dump feature overview
- `/apps/web/CLAUDE.md` - General development guide
- `/generic-stackable-notification-system-spec.md` - Notification system architecture
- `/NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Notification implementation details

**Related Code:**

- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`
- `apps/web/src/lib/components/layout/Navigation.svelte`
- `apps/web/src/lib/components/dashboard/Dashboard.svelte`
- `apps/web/src/routes/projects/+page.svelte`
- `apps/web/src/lib/stores/brain-dump-v2.store.ts`
- `apps/web/src/lib/services/brain-dump-notification.bridge.ts`
- `apps/web/src/lib/components/notifications/NotificationStackManager.svelte`

**Related Issues:**

- User observation: "[BrainDumpModal] Running cleanup { reason: 'destroy' }" appearing frequently in logs

---

**Document Version:** 1.0
**Last Updated:** 2025-10-23
**Status:** Ready for Implementation
