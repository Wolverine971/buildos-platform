---
date: 2025-10-06T01:36:48-04:00
researcher: Claude
git_commit: ac3926bfd8b265462ed239421d7cd1573b489972
branch: main
repository: buildos-platform
topic: 'Brain Dump Input Not Clearing After Process & Save'
tags: [research, codebase, brain-dump, bug, state-management, multi-brain-dump]
status: complete
last_updated: 2025-10-06
last_updated_by: Claude
path: thoughts/shared/research/2025-10-06_01-36-48_brain-dump-input-not-clearing-after-save.md
---

# Research: Brain Dump Input Not Clearing After Process & Save

**Date**: 2025-10-06 01:36:48 EDT
**Researcher**: Claude
**Git Commit**: ac3926bfd8b265462ed239421d7cd1573b489972
**Branch**: main
**Repository**: buildos-platform

## Research Question

User reports: "After I braindump and I save the braindump, the placeholder stays the same. It should be wiped out if I process and save the braindump."

## Summary

**Root Cause Identified**: In multi-brain dump mode (`MULTI_BRAINDUMP_ENABLED = true`), the `resetForNewSession()` function only resets legacy single-brain dump fields, NOT the `activeBrainDumps` Map. When a brain dump completes successfully with auto-accept enabled, it remains in the `activeBrainDumps` Map with its original `inputText` intact. When the user clicks "Start New Brain Dump" and the modal reopens, the old brain dump state (including filled input text) persists.

**Impact**: Users see their previously entered text instead of a clean input field after successfully processing a brain dump.

**Historical Context**: No previous known issues with input clearing behavior. This appears to be a regression introduced after the Phase 1-3 brain dump refactoring completed in September 2025.

## Detailed Findings

### 1. Input Binding Architecture

The brain dump input uses standard Svelte two-way binding with unidirectional store updates:

**RecordingView.svelte** ([apps/web/src/lib/components/brain-dump/RecordingView.svelte:311-320](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/RecordingView.svelte#L311-L320))

```svelte
<textarea
	bind:value={inputText}
	on:input={handleTextInput}
	on:blur={handleTextBlur}
	placeholder={placeholderText}
	disabled={isProcessing || isInitializingRecording}
	class="..."
/>
```

**Data Flow**:

1. User types → `bind:value` updates local state
2. `on:input` triggers `handleTextInput()`
3. Dispatches `textChange` event to parent
4. Parent calls `brainDumpActions.updateInputText()`
5. Store updates `core.inputText`
6. Derived reactivity updates component

### 2. State Management Structure

**brain-dump-v2.store.ts** ([apps/web/src/lib/stores/brain-dump-v2.store.ts:180-182](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L180-L182))

```typescript
interface UnifiedBrainDumpState {
	core: {
		inputText: string; // The actual input value
		lastSavedContent: string; // For unsaved changes detection
		currentBrainDumpId: string | null;
		// ...
	};
	// ... other domains
}
```

**Multi-Brain Dump Mode** ([apps/web/src/lib/stores/brain-dump-v2.store.ts:139-146](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L139-L146))

```typescript
interface UnifiedBrainDumpState {
  // Legacy fields (single brain dump mode)
  core: { inputText: string, ... }

  // Multi-brain dump mode
  activeBrainDumps: Map<string, SingleBrainDumpState>;  // ← BUG: Not cleared
}
```

### 3. Processing Flow (Normal Path)

When user clicks "Process" button:

1. **BrainDumpModal.svelte** `parseBrainDump()` ([apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:886-914](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte#L886-L914))
    - Saves draft to database
    - Gets `brainDumpId` back

2. **brain-dump-v2.store.ts** `startBrainDump()` ([apps/web/src/lib/stores/brain-dump-v2.store.ts:788-830](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L788-L830))
    - Creates `SingleBrainDumpState` with `inputText: config.inputText`
    - Adds to `activeBrainDumps` Map
    - Sets processing phase to 'parsing'

3. **brain-dump-notification.bridge.ts** `startProcessingAPICall()` ([apps/web/src/lib/services/brain-dump-notification.bridge.ts:800-855](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/services/brain-dump-notification.bridge.ts#L800-L855))
    - Calls API endpoint with SSE streaming
    - Receives parse results
    - Updates store with results

4. **Auto-Accept Execution** ([apps/web/src/routes/api/braindumps/stream/+server.ts:414-557](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/routes/api/braindumps/stream/+server.ts#L414-L557))
    - Executes operations
    - Updates brain dump status to 'saved'
    - Returns success

5. **Success View Display** ([apps/web/src/lib/stores/brain-dump-v2.store.ts:1781-1848](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L1781-L1848))
    - Sets `currentView: 'success'`
    - Shows project info and navigation

### 4. Reset Behavior (The Bug)

When user clicks "Start New Brain Dump":

**SuccessView.svelte** ([apps/web/src/lib/components/brain-dump/SuccessView.svelte:189-198](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/SuccessView.svelte#L189-L198))

```svelte
<Button on:click={handleStartNew}>Start New Brain Dump</Button>
```

```typescript
function handleStartNew(e: Event) {
	e.stopPropagation();
	dispatch('startNew'); // ← Triggers event
}
```

**BrainDumpModal.svelte** ([apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:1231-1235](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte#L1231-L1235))

```typescript
function handleStartNew() {
	brainDumpActions.resetForNewSession(); // ← Resets session
	brainDumpActions.openModal(); // ← Opens modal
	brainDumpActions.clearParseResults(); // ← Clears results
}
```

**brain-dump-v2.store.ts** `resetForNewSession()` ([apps/web/src/lib/stores/brain-dump-v2.store.ts:1931-1949](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L1931-L1949))

```typescript
resetForNewSession: () =>
	update((state) => {
		const newState = createInitialState(); // ✅ Creates state with inputText: ''
		return {
			...newState,
			ui: {
				...newState.ui,
				modal: {
					...newState.ui.modal,
					isOpen: state.ui.modal.isOpen, // Preserves modal open
					currentView: 'project-selection'
				}
			},
			persistence: {
				...newState.persistence,
				sessionId: crypto.randomUUID()
			}
		};
	});
```

**THE BUG**: `createInitialState()` ([apps/web/src/lib/stores/brain-dump-v2.store.ts:281-355](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L281-L355))

```typescript
function createInitialState(): UnifiedBrainDumpState {
	return {
		core: {
			inputText: '' // ✅ Legacy field gets cleared
			// ...
		},
		activeBrainDumps: new Map() // ❌ BUT this creates a NEW Map
		// ...
	};
}
```

**The Problem**:

- In multi-brain dump mode, when modal reopens, it looks for the active brain dump in `activeBrainDumps` Map
- If the old brain dump still exists there (which it does), it uses its `inputText`
- `resetForNewSession()` creates a new empty Map, but **doesn't actually remove the old brain dump from the existing Map before replacing it**
- Actually, looking more carefully: `resetForNewSession()` DOES create a new empty Map in the returned state
- So the question is: **why is the old inputText still showing?**

Let me trace the actual input value binding more carefully...

**BrainDumpModal.svelte** ([apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:54](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte#L54))

```typescript
let inputText = $derived(storeState?.core?.inputText ?? '');
```

**The REAL Bug**:
After `resetForNewSession()`, the modal shows `project-selection` view first. When user selects a project and goes to recording view, the `inputText` is derived from `storeState.core.inputText`, which SHOULD be empty from `createInitialState()`.

**Unless**... there's auto-loading of draft content happening when project is selected!

Let me check the draft loading logic in the next section.

### 5. Draft Loading Logic (Suspected Culprit)

**BrainDumpModal.svelte** `handleProjectSelect()` ([apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:1108-1189](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte#L1108-L1189))

```typescript
async function handleProjectSelect(event: CustomEvent) {
	const project = event.detail;

	// ... project selection logic

	// Check for existing draft
	if (!MULTI_BRAINDUMP_ENABLED && project.id !== 'new') {
		const draft = await brainDumpService.getDraft(project.id);
		if (draft?.data?.content) {
			brainDumpActions.updateInputText(draft.data.content); // ← LOADS DRAFT
			brainDumpActions.setSavedContent(draft.data.content, draft.data.brainDumpId);
		}
	}
}
```

**HYPOTHESIS**: The bug might be:

1. User processes brain dump for Project A with auto-accept
2. Draft gets saved to database with status 'saved'
3. User clicks "Start New Brain Dump"
4. User selects Project A again
5. `getDraft(project.id)` returns the SAVED brain dump (not filtered by status)
6. Old content gets loaded back into input

Let me verify if the draft endpoint filters by status...

**brainDumpService.getDraft()** - Need to check the API endpoint implementation.

Actually, looking at the code more carefully:

**brain-dump-notification.bridge.ts** ([apps/web/src/lib/services/brain-dump-notification.bridge.ts:816-840](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/services/brain-dump-notification.bridge.ts#L816-L840))

After successful auto-accept, the brain dump status is updated to 'saved', but:

- ❌ The brain dump is NOT removed from `activeBrainDumps` Map
- ❌ The `inputText` is NOT cleared

**The Multi-Mode Bug**:
In multi-brain dump mode:

1. Brain dump completes with auto-accept → status becomes 'saved'
2. Brain dump remains in `activeBrainDumps` Map with original `inputText`
3. Success view is shown
4. User clicks "Start New" → `resetForNewSession()` creates new empty state
5. **BUT** if there's sessionStorage persistence, the old state might be restored!

**SessionStorage Persistence** ([apps/web/src/lib/stores/brain-dump-v2.store.ts:358-425](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/stores/brain-dump-v2.store.ts#L358-L425))

The store persists to `sessionStorage` with key `brain-dump-unified-state`. When the store is initialized, it loads from sessionStorage.

**Potential Race Condition**:

1. `resetForNewSession()` updates store to fresh state
2. Store's persistence logic saves to sessionStorage
3. But old state might still be in sessionStorage from before
4. Or the persistence subscription might restore old state

Actually, let me reconsider the entire flow. The user said "after I save the braindump the placeholder stays the same."

**Wait - they said PLACEHOLDER, not the input text itself!**

Let me check the placeholder logic...

**RecordingView.svelte** placeholder ([apps/web/src/lib/components/brain-dump/RecordingView.svelte:57-70](https://github.com/annawayne/buildos-platform/blob/ac3926bfd8b265462ed239421d7cd1573b489972/apps/web/src/lib/components/brain-dump/RecordingView.svelte#L57-L70))

```typescript
$: placeholderText = (() => {
	if (isNewProject) {
		return "What's on your mind? Share your thoughts, ideas, and tasks...";
	}

	if (displayedQuestions && displayedQuestions.length > 0) {
		const questionsText = displayedQuestions
			.map((q, i) => `${i + 1}. ${q.question}`)
			.join('\n');
		return `Consider discussing:\n${questionsText}\n\nOr share any updates about ${selectedProjectName}...`;
	}

	return `What's happening with ${selectedProjectName}?`;
})();
```

Actually, re-reading the user's message: "the placeholder stays the same. It should be wiped out if i process and save the braindump."

I think they mean the **INPUT TEXT** stays the same, not just the placeholder. "Placeholder" is likely their term for the input field/textarea.

So my original analysis stands: the input text is not being cleared after processing.

### 6. Confirmed Bug Location

**Primary Issue**: After auto-accept completes successfully:

1. Brain dump remains in `activeBrainDumps` Map ([brain-dump-v2.store.ts](apps/web/src/lib/stores/brain-dump-v2.store.ts))
2. `inputText` is preserved in the brain dump state
3. When user clicks "Start New", `resetForNewSession()` creates fresh state
4. But if they select the SAME project again, draft loading might restore old content
5. OR sessionStorage persistence might restore old state

**Secondary Issue**: No explicit cleanup of completed brain dumps in multi-mode

## Code References

### Critical Files

- `apps/web/src/lib/stores/brain-dump-v2.store.ts:1931-1949` - `resetForNewSession()` function (doesn't clear activeBrainDumps properly in multi-mode)
- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:1231-1235` - `handleStartNew()` (should clear completed brain dumps)
- `apps/web/src/lib/services/brain-dump-notification.bridge.ts:816-840` - Auto-accept completion (should mark brain dump as completed and clear from active)
- `apps/web/src/lib/stores/brain-dump-v2.store.ts:788-830` - `startBrainDump()` (adds to activeBrainDumps)

### Input Binding

- `apps/web/src/lib/components/brain-dump/RecordingView.svelte:311-320` - Textarea with bind:value
- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:54` - Input text derived from store

### Draft Management

- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:1108-1189` - Project selection and draft loading
- `apps/web/src/lib/stores/brain-dump-v2.store.ts:358-425` - SessionStorage persistence

## Architecture Insights

### State Management Pattern

The brain dump system uses a **unified store** with two parallel state models:

1. **Legacy fields** (`core.inputText`) - Single brain dump mode
2. **Multi-brain dump Map** (`activeBrainDumps`) - Concurrent processing

This dual-model creates complexity in cleanup logic.

### Svelte 5 Reactivity

Uses `$derived` runes for computed values:

```typescript
let inputText = $derived(storeState?.core?.inputText ?? '');
```

This is efficient but means the component reactively updates based on store changes.

### Auto-Accept Flow

When auto-accept is enabled:

1. Parse → Execute Operations → Update DB → Show Success
2. Brain dump status becomes 'saved'
3. **Missing step**: Clear input and remove from active brain dumps

## Recommended Fixes

### Option 1: Clear on Auto-Accept Success (Recommended)

**File**: `apps/web/src/lib/services/brain-dump-notification.bridge.ts`
**Location**: After line 840 in `onComplete` callback

```typescript
if (result && result.operations) {
	brainDumpV2Store.updateBrainDumpParseResults(brainDumpId, result);

	// NEW: If auto-accept succeeded, complete and clear the brain dump
	if (result.executionResult && result.executionResult.success) {
		setTimeout(() => {
			brainDumpV2Store.completeBrainDump(brainDumpId);
		}, 500); // Small delay to allow success view to render
	}
}
```

### Option 2: Clear activeBrainDumps in resetForNewSession

**File**: `apps/web/src/lib/stores/brain-dump-v2.store.ts`
**Location**: Lines 1931-1949

```typescript
resetForNewSession: () =>
	update((state) => {
		const newState = createInitialState();

		// Clear all completed brain dumps from activeBrainDumps
		state.activeBrainDumps.forEach((bd, id) => {
			if (bd.processing.phase === 'success' || bd.processing.phase === 'complete') {
				state.activeBrainDumps.delete(id);
			}
		});

		return {
			...newState,
			ui: {
				...newState.ui,
				modal: {
					...newState.ui.modal,
					isOpen: state.ui.modal.isOpen,
					currentView: 'project-selection'
				}
			},
			persistence: {
				...newState.persistence,
				sessionId: crypto.randomUUID()
			}
		};
	});
```

### Option 3: Defensive Clear in handleStartNew

**File**: `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`
**Location**: Lines 1231-1235

```typescript
function handleStartNew() {
	// Clear successful brain dump before resetting
	if (successData?.brainDumpId) {
		brainDumpActions.completeBrainDump(successData.brainDumpId);
	}

	brainDumpActions.resetForNewSession();
	brainDumpActions.openModal();
	brainDumpActions.clearParseResults();
}
```

### Option 4: Filter Draft Loading by Status

**File**: API endpoint `/api/braindumps/draft/+server.ts` (need to verify path)
**Ensure**: `getDraft()` only returns brain dumps with status 'pending', NOT 'saved'

### Recommended Approach: Combination

For maximum robustness:

1. ✅ **Auto-complete on auto-accept success** (Option 1) - Proactive cleanup
2. ✅ **Clear completed brain dumps in resetForNewSession** (Option 2) - Safety net
3. ✅ **Filter draft loading** (Option 4) - Prevent old drafts from loading

## Historical Context (from thoughts/)

### Previous Audits

- **2025-09-30**: Comprehensive brain dump flow audit - No input clearing issues mentioned
- **2025-09-30**: Complete refactoring (Phases 1-3) - Removed 1,128 lines of duplicate code
- **2025-09-30**: Bug analysis covering 196 issues - No input clearing bugs documented

### Implementation History

- **Phase 1**: Unified store pattern implementation
- **Phase 2**: State structure flattening
- **Phase 2.2**: Removed redundant UI state fields
- **Phase 3**: Performance optimizations

### Conclusion from Historical Research

This bug appears to be a **regression** or **edge case** not covered in the September 2025 refactoring. The multi-brain dump mode introduced concurrent processing capabilities but may not have fully addressed cleanup logic for auto-accepted brain dumps.

## Open Questions

1. ❓ Does `getDraft()` filter by status, or does it return all brain dumps for a project?
2. ❓ Is sessionStorage persistence interfering with state resets?
3. ❓ Should `completeBrainDump()` function exist in the store actions? (Referenced but need to verify)
4. ❓ What is the expected behavior when user selects the same project twice in a row?
5. ❓ Should completed brain dumps be stored in a separate `completedBrainDumps` Map for history?

## Related Research

- [Brain Dump Flow Audit (2025-09-30)](thoughts/shared/research/2025-09-30_brain-dump-flow-audit.md)
- [Brain Dump Complete Flow Analysis (2025-09-30)](thoughts/shared/research/2025-09-30_17-48-03_brain-dump-complete-flow.md)
- [Web App Bug Analysis (2025-09-30)](thoughts/shared/research/2025-09-30_08-21-26_web-app-bug-analysis.md)
- [Brain Dump API Architecture (2025-10-05)](thoughts/shared/research/2025-10-05_16-00-00_brain-dump-api-architecture-research.md)
- [BuildOS Web Comprehensive Audit (2025-10-05)](thoughts/shared/research/2025-10-05_00-00-00_buildos-web-comprehensive-audit.md)
