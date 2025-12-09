<!-- apps/web/docs/technical/components/brain-dump/BRAIN_DUMP_UNIFIED_STORE_ARCHITECTURE.md -->

# Brain Dump Unified Store Architecture

## Overview

This document outlines the implementation of a unified store management system for the brain dump feature, consolidating the currently fragmented state management across `brain-dump.store.ts` and `brainDumpProcessing.store.ts` into a single, well-organized store with clear domain separation.

## Current Issues

1. **Dual Store Architecture**: Two stores managing overlapping state
2. **State Synchronization Problems**: Both stores manage `parseResults` independently
3. **Mixed Reactivity Patterns**: BrainDumpModal uses Svelte 4 patterns (20+ derived stores), ProcessingNotification uses Svelte 5 runes
4. **Memory Leaks**: No cleanup mechanisms for abandoned sessions
5. **Race Conditions**: Multiple reactive triggers can start processing simultaneously

## Unified Store Architecture

### Domain-Based State Organization

```typescript
interface UnifiedBrainDumpState {
	// UI Domain - Visual state and component behavior
	ui: {
		modal: {
			isOpen: boolean;
			currentView: 'project-selection' | 'recording' | 'success';
			isHandingOff: boolean;
		};
		notification: {
			isOpen: boolean;
			isMinimized: boolean;
			hasUserInteracted: boolean; // For animation control
			showSuccessView: boolean;
		};
		textarea: {
			isCollapsed: boolean;
			showingParseResults: boolean;
		};
		components: {
			loaded: Record<string, boolean>;
			loading: Record<string, boolean>;
		};
	};

	// Core Domain - Main business logic state
	core: {
		// Project context
		selectedProject: any;
		isNewProject: boolean;

		// Content management
		inputText: string;
		lastSavedContent: string;
		currentBrainDumpId: string | null;

		// Parse results - SINGLE SOURCE OF TRUTH
		parseResults: BrainDumpParseResult | null;
		disabledOperations: Set<string>;

		// Voice recording state
		voice: {
			error: string;
			microphonePermissionGranted: boolean;
			capabilitiesChecked: boolean;
			isInitializingRecording: boolean;
			canUseLiveTranscript: boolean;
		};
	};

	// Processing Domain - All processing-related state
	processing: {
		// Current processing state
		phase: 'idle' | 'transcribing' | 'parsing' | 'saving' | 'applying';
		type: 'dual' | 'single' | 'short' | 'background';
		mutex: boolean; // Prevent concurrent processing
		startedAt: number | null;

		// Background job tracking
		jobId: string | null;
		autoAcceptEnabled: boolean;

		// Dual processing specific
		streaming: {
			contextStatus: 'pending' | 'processing' | 'completed' | 'error';
			tasksStatus: 'pending' | 'processing' | 'completed' | 'error';
			contextResult: any;
			tasksResult: any;
			contextProgress: string;
			tasksProgress: string;
		} | null;

		// Progress tracking
		progress: {
			current: number;
			total: number;
			message: string;
		};
	};

	// Results Domain - Operation results and errors
	results: {
		// Success data
		success: {
			brainDumpId?: string;
			brainDumpType?: string;
			projectSlug?: string;
			projectName?: string;
			isNewProject?: boolean;
			operationsCount?: number;
			failedOperations?: number;
		} | null;

		// Error tracking
		errors: {
			operations: Array<{
				operationId?: string;
				table: string;
				operation: string;
				error: string;
				timestamp: string;
			}>;
			processing: string | null;
			critical: boolean;
		};

		// Execution summary
		lastExecutionSummary: {
			successful: number;
			failed: number;
			timestamp: string;
			details?: any;
		} | null;
	};

	// Persistence Domain - Session storage state
	persistence: {
		shouldPersist: boolean;
		lastPersistedAt: number | null;
		sessionId: string;
	};
}
```

## Implementation Strategy

### Phase 1: Create New Store with Transition Layer

1. **Create `brain-dump-v2.store.ts`**:
    - Implement the unified state structure
    - Use modern Svelte 5 patterns with runes
    - Add proper TypeScript typing
    - Include session storage persistence

2. **Implement Transition Actions**:

    ```typescript
    // Transition layer that updates both old and new stores
    export const brainDumpActions = {
      // UI Actions
      openModal: () => {
        v2Store.update(state => {...});
        // Also update old stores for compatibility
        brainDumpStore.setView('project-selection');
      },

      // Core Actions
      setParseResults: (results) => {
        v2Store.update(state => {...});
        // Sync to both old stores
        brainDumpStore.setParseResults(results);
        processingNotificationActions.setParseResults(results);
      },

      // Processing Actions
      startProcessing: (config) => {
        // Use mutex to prevent race conditions
        v2Store.update(state => {
          if (state.processing.mutex) return state;
          // ... update processing state
        });
      }
    };
    ```

### Phase 2: Migrate Components

#### BrainDumpModal Migration

```typescript
// Replace 20+ derived stores with single reactive state
let state = $derived($brainDumpV2Store);
let currentView = $derived(state.ui.modal.currentView);
let selectedProject = $derived(state.core.selectedProject);
let parseResults = $derived(state.core.parseResults);
// ... etc

// Use actions for state updates
function handleProjectSelect(project) {
	brainDumpActions.selectProject(project);
}
```

#### BrainDumpProcessingNotification Migration

```typescript
// Use unified store state
let state = $derived($brainDumpV2Store);
let isOpen = $derived(state.ui.notification.isOpen);
let isMinimized = $derived(state.ui.notification.isMinimized);
let parseResults = $derived(state.core.parseResults);
let processingPhase = $derived(state.processing.phase);
```

### Phase 3: State Synchronization Rules

1. **Parse Results**: Always update in `core.parseResults` - single source of truth
2. **Processing State**: All processing flags in `processing` domain
3. **UI State**: Component-specific state in `ui` domain
4. **Cleanup on Reset**: Clear all domains appropriately

## Critical Implementation Details

### 1. Mutex Pattern for Race Conditions

```typescript
async function startProcessing(config: ProcessingConfig) {
	const currentState = get(brainDumpV2Store);

	// Check mutex
	if (currentState.processing.mutex) {
		console.warn('Processing already in progress, skipping duplicate request');
		return;
	}

	// Acquire mutex
	brainDumpV2Store.update((state) => ({
		...state,
		processing: {
			...state.processing,
			mutex: true,
			phase: 'parsing',
			startedAt: Date.now()
		}
	}));

	try {
		// Do processing
		await processContent(config);
	} finally {
		// Always release mutex
		brainDumpV2Store.update((state) => ({
			...state,
			processing: {
				...state.processing,
				mutex: false
			}
		}));
	}
}
```

### 2. Component Preloading Strategy

```typescript
function preloadComponents(phase: string) {
	const componentsToLoad = {
		parsing: ['ParseResultsDiffView', 'DualProcessingResults'],
		success: ['SuccessView'],
		recording: ['RecordingView', 'ProjectSelectionView']
	};

	const loadList = componentsToLoad[phase] || [];

	// Update loading state
	brainDumpV2Store.update((state) => ({
		...state,
		ui: {
			...state.ui,
			components: {
				...state.ui.components,
				loading: loadList.reduce(
					(acc, comp) => ({
						...acc,
						[comp]: true
					}),
					state.ui.components.loading
				)
			}
		}
	}));

	// Load in parallel
	Promise.all(loadList.map(loadComponent)).then((results) => {
		// Update loaded state
		brainDumpV2Store.update((state) => ({
			...state,
			ui: {
				...state.ui,
				components: {
					loaded: { ...state.ui.components.loaded, ...results },
					loading: {}
				}
			}
		}));
	});
}
```

### 3. Session Storage Management

```typescript
const STORAGE_KEY = 'brain-dump-unified-state';
const STORAGE_VERSION = 1;

function persistState(state: UnifiedBrainDumpState) {
	if (!state.persistence.shouldPersist) return;

	// Only persist necessary data
	const toPersist = {
		version: STORAGE_VERSION,
		sessionId: state.persistence.sessionId,
		core: {
			inputText: state.core.inputText,
			currentBrainDumpId: state.core.currentBrainDumpId,
			parseResults: state.core.parseResults
		},
		processing: {
			jobId: state.processing.jobId,
			type: state.processing.type
		}
	};

	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
}

function loadPersistedState(): Partial<UnifiedBrainDumpState> | null {
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const parsed = JSON.parse(stored);
		if (parsed.version !== STORAGE_VERSION) {
			// Handle version mismatch
			sessionStorage.removeItem(STORAGE_KEY);
			return null;
		}

		return parsed;
	} catch (error) {
		console.error('Failed to load persisted state:', error);
		return null;
	}
}
```

### 4. Memory Cleanup

```typescript
function cleanupAbandonedSessions() {
	const currentState = get(brainDumpV2Store);

	// Check if session is abandoned (>30 minutes old)
	if (currentState.processing.startedAt) {
		const age = Date.now() - currentState.processing.startedAt;
		if (age > 30 * 60 * 1000) {
			console.warn('Cleaning up abandoned session');
			resetStore();
		}
	}
}

// Run cleanup on mount and periodically
onMount(() => {
	cleanupAbandonedSessions();
	const interval = setInterval(cleanupAbandonedSessions, 5 * 60 * 1000);

	return () => clearInterval(interval);
});
```

## Migration Checklist

### Pre-Migration

- [ ] Back up existing store implementations
- [ ] Document current store API usage across components
- [ ] Create comprehensive test suite for brain dump flows

### Implementation

- [ ] Create `brain-dump-v2.store.ts` with unified structure
- [ ] Implement transition layer with backward compatibility
- [ ] Add session storage with versioning
- [ ] Implement mutex pattern for race conditions
- [ ] Add memory cleanup mechanisms

### Component Migration

- [ ] Update BrainDumpModal to use unified store
- [ ] Update BrainDumpProcessingNotification to use unified store
- [ ] Update all service calls to use new actions
- [ ] Remove all references to old stores
- [ ] Update imports across codebase

### Testing

- [ ] Test modal → notification handoff
- [ ] Test concurrent processing prevention
- [ ] Test session recovery after page refresh
- [ ] Test memory cleanup for abandoned sessions
- [ ] Test all brain dump flows (short, single, dual, background)

### Cleanup

- [ ] Remove deprecated `brain-dump.store.ts`
- [ ] Remove deprecated `brainDumpProcessing.store.ts`
- [ ] Update documentation
- [ ] Remove transition layer after verification

## Expected Benefits

1. **Single Source of Truth**: No more state synchronization issues
2. **Better Performance**: Reduced reactivity overhead with modern patterns
3. **Cleaner Code**: Clear domain separation makes code more maintainable
4. **No Race Conditions**: Mutex pattern prevents concurrent processing
5. **Memory Efficiency**: Proper cleanup and session management
6. **Better UX**: Smoother transitions and consistent state

## Risk Mitigation

1. **Gradual Migration**: Use transition layer to maintain backward compatibility
2. **Feature Flags**: Add flags to toggle between old and new implementations
3. **Comprehensive Testing**: Test each migration phase thoroughly
4. **Rollback Plan**: Keep old stores until new implementation is stable
5. **Monitoring**: Add logging to track state transitions and errors

## Success Criteria

- [ ] All brain dump flows work without errors
- [ ] No duplicate processing or race conditions
- [ ] Modal to notification handoff is smooth
- [ ] Session recovery works after page refresh
- [ ] Memory usage remains stable over time
- [ ] All tests pass with new implementation
