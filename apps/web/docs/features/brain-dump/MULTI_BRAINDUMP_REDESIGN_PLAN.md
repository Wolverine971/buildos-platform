# Multi-Brain Dump Processing: Architecture Redesign Plan

**Date:** 2025-10-01
**Status:** 🔴 Planning Phase
**Priority:** HIGH - Critical architectural enhancement
**Estimated Effort:** 12-16 hours

---

## Executive Summary

This document outlines a comprehensive redesign of the brain dump processing system to support **multiple concurrent brain dumps**. Currently, the system uses singleton patterns that only allow one brain dump to process at a time, despite the generic notification infrastructure being designed for multiple concurrent operations.

**Goal:** Enable users to start multiple brain dumps, each processing independently with its own notification in the stack, while maintaining data integrity and user experience quality.

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Core Problems](#core-problems)
3. [Design Principles](#design-principles)
4. [Proposed Architecture](#proposed-architecture)
5. [Implementation Phases](#implementation-phases)
6. [Data Structures](#data-structures)
7. [Concurrency Strategy](#concurrency-strategy)
8. [Migration Path](#migration-path)
9. [Testing Strategy](#testing-strategy)
10. [Risk Assessment](#risk-assessment)

---

## Current Architecture Analysis

### Singleton Constraints

#### 1. **Brain Dump V2 Store** (`brain-dump-v2.store.ts`)

**Current Design: Global Singleton State**

```typescript
core: {
    currentBrainDumpId: string | null;           // ❌ Singular
    selectedProject: any;                        // ❌ Singular
    inputText: string;                           // ❌ Singular
    parseResults: BrainDumpParseResult | null;   // ❌ Singular - "SINGLE SOURCE OF TRUTH"
}

processing: {
    phase: 'idle' | 'parsing' | 'saving' | 'applying';  // ❌ Singular
    type: 'dual' | 'short' | 'background';              // ❌ Singular
    mutex: boolean;                                      // ❌ Global lock
    streaming: {...} | null;                             // ❌ Singular
}
```

**Mutex Protection:**

- Module-level: `let processingMutexLock = false;` (line 17)
- Store-level: `processing.mutex` (line 73)
- Returns `false` if second brain dump attempts to start

#### 2. **Brain Dump Notification Bridge** (`brain-dump-notification.bridge.ts`)

**Current Design: Single Notification Tracking**

```typescript
let activeBrainDumpNotificationId: string | null = null; // ❌ Singular
let lastProcessedBrainDumpId: string | null = null; // ❌ Singular
```

**Behavior:**

- Lines 107-119: Skips creating notification if `activeBrainDumpNotificationId` already exists
- Only tracks ONE brain dump at a time
- Second brain dump is silently rejected

#### 3. **Modal Component** (`BrainDumpModal.svelte`)

**Current Design: Multiple instances can exist, but share same store**

- Navigation, Dashboard, Projects page each can render their own modal
- All share the same `brainDumpV2Store` global state
- No coordination between multiple modal instances

---

## Core Problems

### 1. **Singleton State Architecture**

- All brain dump state stored in global singleton
- No data structure for multiple brain dumps (no Map, no Array)
- "Current" brain dump concept assumes only one at a time

### 2. **Global Mutex Locks**

- Module-level mutex prevents ANY concurrent processing
- Store-level mutex duplicates this protection
- Both reject second brain dump with `return false`

### 3. **Bridge Singleton Tracking**

- Only one `activeBrainDumpNotificationId` variable
- Cannot track multiple notifications
- Cannot create notifications for second brain dump

### 4. **Shared Streaming State**

- Single `processing.streaming` object
- Cannot track progress of multiple SSE streams
- Second stream would overwrite first's progress

### 5. **Documentation Mismatch**

- `PHASE_2_BRAIN_DUMP_MIGRATION_STATUS.md:249` claims "both process independently"
- `generic-stackable-notification-system-spec.md:961` lists edge case: "Multiple Brain Dumps Simultaneously"
- Reality: Code enforces single processing

---

## Design Principles

### 1. **Multi-Instance by Default**

- Store should manage Map of active brain dumps
- Each brain dump identified by unique ID
- No "current" brain dump concept (or optional convenience accessor)

### 2. **Independent Processing**

- Each brain dump has its own processing state
- Each brain dump has its own mutex (per-ID locking)
- Concurrent processing of different brain dumps allowed

### 3. **Resource Limits**

- Maximum concurrent brain dumps: **3** (configurable)
- Prevents overwhelming OpenAI API rate limits
- Prevents memory issues with too many streams

### 4. **Graceful Degradation**

- If limit reached, queue new brain dumps
- Show user feedback: "Processing 3/3, queued: 1"
- Auto-start queued brain dumps when slots free

### 5. **Session Persistence**

- Serialize Map of active brain dumps to session storage
- Restore all in-progress brain dumps on page refresh
- Handle orphaned operations (>30min old)

### 6. **Clean Separation of Concerns**

- **Modal**: Input collection only (can be singular)
- **Store**: State management for N brain dumps
- **Bridge**: Notification creation/updates for N brain dumps
- **Notifications**: UI display of progress (already multi-instance ready)

---

## Proposed Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User starts Brain Dump #1                                    │
│   → Modal collects input                                     │
│   → Store.startBrainDump(id1) creates entry in Map          │
│   → Bridge creates notification for id1                      │
│   → API stream starts for id1                                │
│   → User minimizes notification                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ User starts Brain Dump #2 (while #1 still processing)       │
│   → Modal collects new input                                 │
│   → Store.startBrainDump(id2) creates SECOND entry in Map   │
│   → Bridge creates SECOND notification for id2               │
│   → API stream starts for id2 (concurrent with id1)          │
│   → Both process independently                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Notification Stack (bottom-right)                           │
│  ┌──────────────────────────────────────────┐               │
│  │ 🔄 Brain Dump #2: "Add features..."      │               │
│  │    Processing tasks... (73%)             │               │
│  └──────────────────────────────────────────┘               │
│  ┌──────────────────────────────────────────┐               │
│  │ ✅ Brain Dump #1: "Website redesign"     │               │
│  │    7 operations ready for review         │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### **Phase 1: Store Refactoring** (4-5 hours)

**Goal:** Convert store from singleton to multi-instance architecture

**Tasks:**

1. **Create New State Structure**

    ```typescript
    interface MultiBrainDumpState {
        // Map of active brain dumps (brainDumpId → state)
        activeBrainDumps: Map<string, SingleBrainDumpState>;

        // Optional: convenience pointer to "focused" brain dump
        focusedBrainDumpId: string | null;

        // Global config
        config: {
            maxConcurrent: number;
            queueEnabled: boolean;
        };

        // Queue for when limit reached
        queuedBrainDumps: Array<QueuedBrainDump>;
    }

    interface SingleBrainDumpState {
        id: string;
        selectedProject: any;
        inputText: string;
        parseResults: BrainDumpParseResult | null;
        processing: {
            phase: 'idle' | 'parsing' | 'saving' | 'applying';
            type: 'dual' | 'short' | 'background';
            mutex: boolean;  // Per-brain-dump mutex
            streaming: {...} | null;
            startedAt: number;
        };
        results: {...};
        // ... all existing fields
    }
    ```

2. **Update Store API**

    ```typescript
    // New methods
    startBrainDump(id: string, config: {...}): boolean;
    updateBrainDump(id: string, updates: Partial<SingleBrainDumpState>): void;
    getBrainDump(id: string): SingleBrainDumpState | null;
    completeBrainDump(id: string): void;
    cancelBrainDump(id: string): void;

    // Concurrency management
    canStartNewBrainDump(): boolean;
    getActiveBrainDumpCount(): number;
    queueBrainDump(config: {...}): string;
    processQueue(): void;
    ```

3. **Migration Helpers**

    ```typescript
    // For backward compatibility
    getCurrentBrainDump(): SingleBrainDumpState | null {
        return focusedBrainDumpId
            ? activeBrainDumps.get(focusedBrainDumpId)
            : null;
    }
    ```

4. **Per-Brain-Dump Mutex**

    ```typescript
    // Replace global mutex with per-ID mutex
    const brainDumpMutexes = new Map<string, boolean>();

    function acquireMutex(brainDumpId: string): boolean {
    	if (brainDumpMutexes.get(brainDumpId)) {
    		return false; // Already locked
    	}
    	brainDumpMutexes.set(brainDumpId, true);
    	return true;
    }

    function releaseMutex(brainDumpId: string): void {
    	brainDumpMutexes.delete(brainDumpId);
    }
    ```

**Files to Modify:**

- `apps/web/src/lib/stores/brain-dump-v2.store.ts` (major refactor)

**Testing:**

- Unit tests for Map operations
- Concurrent startBrainDump calls
- Mutex isolation per brain dump

---

### **Phase 2: Bridge Refactoring** (2-3 hours)

**Goal:** Support multiple notification tracking

**Tasks:**

1. **Multi-Instance Notification Tracking**

    ```typescript
    // Replace singleton with Map
    const activeBrainDumpNotifications = new Map<string, string>();
    // brainDumpId → notificationId

    const lastProcessedTimestamps = new Map<string, number>();
    // brainDumpId → timestamp (for duplicate detection)
    ```

2. **Update Bridge API**

    ```typescript
    export function createNotificationForBrainDump(
    	brainDumpId: string,
    	state: SingleBrainDumpState
    ): string;

    export function updateNotificationForBrainDump(
    	brainDumpId: string,
    	updates: Partial<BrainDumpNotification>
    ): void;

    export function removeNotificationForBrainDump(brainDumpId: string): void;

    export function getNotificationIdForBrainDump(brainDumpId: string): string | null;
    ```

3. **Store Subscription Update**

    ```typescript
    brainDumpV2Store.subscribe((state) => {
    	// Iterate over all active brain dumps
    	for (const [brainDumpId, brainDumpState] of state.activeBrainDumps) {
    		syncBrainDumpToNotification(brainDumpId, brainDumpState);
    	}

    	// Clean up notifications for completed brain dumps
    	cleanupCompletedNotifications(state);
    });
    ```

4. **Concurrent SSE Stream Handling**

    ```typescript
    // Each brain dump can have its own SSE stream
    const activeStreams = new Map<string, EventSource>();

    export function handleStreamUpdateForBrainDump(
        brainDumpId: string,
        status: StreamingMessage
    ) {
        // Update specific brain dump in store
        brainDumpV2Store.updateBrainDump(brainDumpId, {
            processing: {
                streaming: updateStreamingState(status)
            }
        });

        // Update corresponding notification
        updateNotificationForBrainDump(brainDumpId, {...});
    }
    ```

**Files to Modify:**

- `apps/web/src/lib/services/brain-dump-notification.bridge.ts`

**Testing:**

- Multiple notifications created for different brain dumps
- Correct notification updated for each brain dump's progress
- Cleanup of notifications when brain dumps complete

---

### **Phase 3: API Integration Updates** (2-3 hours)

**Goal:** Support concurrent API calls with proper routing

**Tasks:**

1. **Stream Callback Routing**

    ```typescript
    // In bridge, when starting API call:
    await brainDumpService.parseBrainDumpWithStream(
    	inputText,
    	selectedProjectId,
    	brainDumpId, // ← Key: pass brain dump ID through
    	displayedQuestions,
    	{
    		onProgress: (status: StreamingMessage) => {
    			// Route to correct brain dump
    			handleStreamUpdateForBrainDump(brainDumpId, status);
    		},
    		onComplete: (result: any) => {
    			// Update correct brain dump
    			brainDumpV2Store.updateBrainDump(brainDumpId, {
    				parseResults: result
    			});
    		},
    		onError: (error: string) => {
    			// Set error for correct brain dump
    			brainDumpV2Store.setBrainDumpError(brainDumpId, error);
    		}
    	}
    );
    ```

2. **Concurrent Request Management**

    ```typescript
    // Track active API calls
    const activeAPIRequests = new Map<string, AbortController>();

    function startAPIRequest(brainDumpId: string) {
    	const controller = new AbortController();
    	activeAPIRequests.set(brainDumpId, controller);

    	// Make request with abort signal
    	fetch('/api/braindumps/stream', {
    		signal: controller.signal
    		// ...
    	});
    }

    function cancelAPIRequest(brainDumpId: string) {
    	const controller = activeAPIRequests.get(brainDumpId);
    	if (controller) {
    		controller.abort();
    		activeAPIRequests.delete(brainDumpId);
    	}
    }
    ```

3. **Rate Limiting & Queuing**

    ```typescript
    // OpenAI rate limits: ~3 concurrent requests recommended
    const MAX_CONCURRENT_API_CALLS = 3;

    async function processNextInQueue() {
    	if (activeAPIRequests.size >= MAX_CONCURRENT_API_CALLS) {
    		return; // Wait for slot to free
    	}

    	const nextQueued = brainDumpV2Store.getNextQueuedBrainDump();
    	if (nextQueued) {
    		await startBrainDumpProcessing(nextQueued.id);
    	}
    }
    ```

**Files to Modify:**

- `apps/web/src/lib/services/brain-dump-notification.bridge.ts` (startProcessingAPICall)
- `apps/web/src/lib/services/braindump-api.service.ts` (may need updates)

**Testing:**

- 3 concurrent API streams process correctly
- 4th brain dump queues properly
- Stream callbacks route to correct brain dump state

---

### **Phase 4: Modal & UI Updates** (2-3 hours)

**Goal:** Handle modal input for multiple brain dumps

**Approach: Modal stays singular, but can trigger multiple processing operations**

**Tasks:**

1. **Modal Submission Update**

    ```typescript
    // In BrainDumpModal.svelte
    async function handleSubmit() {
    	const brainDumpId = generateBrainDumpId();

    	// Start brain dump (may succeed or queue)
    	const started = await brainDumpV2Store.startBrainDump(brainDumpId, {
    		inputText: currentInputText,
    		selectedProject: currentSelectedProject,
    		processingType: determineProcessingType()
    		// ...
    	});

    	if (started) {
    		// Close modal, processing continues in background
    		closeModal();
    		toastService.success('Brain dump processing started');
    	} else {
    		// Queued
    		closeModal();
    		toastService.info('Brain dump queued (3 already processing)');
    	}

    	// Reset modal state for next brain dump
    	resetModalState();
    }
    ```

2. **Reset Modal State**

    ```typescript
    function resetModalState() {
    	currentInputText = '';
    	currentSelectedProject = null;
    	// Don't touch the store's active brain dumps
    	// Modal is just for input collection
    }
    ```

3. **Notification Interaction**
    ```typescript
    // User can expand notification to see progress
    // User can click "Apply Operations" from notification
    // Modal doesn't need to track processing state anymore
    ```

**Files to Modify:**

- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`
- `apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpModalContent.svelte`

**Testing:**

- Submit brain dump → modal closes → can immediately open modal again for another brain dump
- Multiple brain dumps in notification stack
- Expanding notification shows correct brain dump's state

---

### **Phase 5: Session Persistence** (1-2 hours)

**Goal:** Persist multiple brain dumps across page refresh

**Tasks:**

1. **Serialize Map to Storage**

    ```typescript
    function persist() {
    	if (!browser) return;

    	const serialized = {
    		version: STORAGE_VERSION,
    		timestamp: Date.now(),
    		activeBrainDumps: Array.from(state.activeBrainDumps.entries()),
    		focusedBrainDumpId: state.focusedBrainDumpId,
    		queuedBrainDumps: state.queuedBrainDumps
    	};

    	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    }
    ```

2. **Restore Map from Storage**

    ```typescript
    function hydrate() {
    	if (!browser) return;

    	const stored = sessionStorage.getItem(STORAGE_KEY);
    	if (!stored) return;

    	const data = JSON.parse(stored);

    	// Restore Map
    	const activeBrainDumps = new Map(data.activeBrainDumps);

    	// Clean up old brain dumps (>30min)
    	const now = Date.now();
    	for (const [id, brainDump] of activeBrainDumps) {
    		const age = now - brainDump.processing.startedAt;
    		if (age > SESSION_TIMEOUT_MS) {
    			activeBrainDumps.delete(id);
    		}
    	}

    	// Restore state
    	set({
    		activeBrainDumps,
    		focusedBrainDumpId: data.focusedBrainDumpId,
    		queuedBrainDumps: data.queuedBrainDumps
    		// ...
    	});

    	// Reconnect to in-progress operations?
    	// OR: Show "lost connection" and offer retry?
    }
    ```

3. **Reconnection Strategy**

    ```typescript
    // Option A: Try to reconnect to SSE streams
    for (const [id, brainDump] of activeBrainDumps) {
    	if (brainDump.processing.phase === 'parsing') {
    		// Attempt reconnection (may fail if >30min old)
    		tryReconnectToStream(id, brainDump);
    	}
    }

    // Option B: Mark as "connection lost" and offer manual retry
    for (const [id, brainDump] of activeBrainDumps) {
    	if (brainDump.processing.phase === 'parsing') {
    		brainDump.processing.phase = 'error';
    		brainDump.results.errors.processing = 'Connection lost. Please retry.';
    	}
    }
    ```

**Files to Modify:**

- `apps/web/src/lib/stores/brain-dump-v2.store.ts` (persist/hydrate methods)

**Testing:**

- Start 2 brain dumps
- Refresh page
- Both brain dumps restored (or show error state)
- Notifications re-created for both

---

### **Phase 6: Concurrency Limits & Queue** (1-2 hours)

**Goal:** Prevent overwhelming system with too many concurrent operations

**Tasks:**

1. **Max Concurrent Check**

    ```typescript
    const MAX_CONCURRENT = 3;

    function canStartNewBrainDump(): boolean {
    	return state.activeBrainDumps.size < MAX_CONCURRENT;
    }
    ```

2. **Queue Implementation**

    ```typescript
    interface QueuedBrainDump {
    	id: string;
    	config: StartBrainDumpConfig;
    	queuedAt: number;
    }

    function queueBrainDump(config: StartBrainDumpConfig): string {
    	const id = generateBrainDumpId();

    	update((state) => ({
    		...state,
    		queuedBrainDumps: [...state.queuedBrainDumps, { id, config, queuedAt: Date.now() }]
    	}));

    	return id;
    }
    ```

3. **Auto-Process Queue**

    ```typescript
    function completeBrainDump(id: string) {
    	update((state) => {
    		const newActiveBrainDumps = new Map(state.activeBrainDumps);
    		newActiveBrainDumps.delete(id);

    		return {
    			...state,
    			activeBrainDumps: newActiveBrainDumps
    		};
    	});

    	// Try to process next in queue
    	processQueue();
    }

    function processQueue() {
    	if (!canStartNewBrainDump()) return;

    	const nextQueued = state.queuedBrainDumps[0];
    	if (!nextQueued) return;

    	// Remove from queue
    	update((state) => ({
    		...state,
    		queuedBrainDumps: state.queuedBrainDumps.slice(1)
    	}));

    	// Start processing
    	startBrainDump(nextQueued.id, nextQueued.config);
    }
    ```

4. **User Feedback**
    ```typescript
    // In modal or toast
    if (!canStartNewBrainDump()) {
    	toastService.info(
    		`Processing limit reached (${MAX_CONCURRENT}). Your brain dump has been queued.`,
    		{ duration: 5000 }
    	);
    }
    ```

**Files to Modify:**

- `apps/web/src/lib/stores/brain-dump-v2.store.ts`
- `apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`

**Testing:**

- Start 3 brain dumps → all process
- Start 4th → queued
- Complete one → 4th auto-starts

---

### **Phase 7: Testing & Polish** (2-3 hours)

**Goal:** Ensure robust multi-instance behavior

**Tasks:**

1. **Unit Tests**
    - Map operations (add, update, remove)
    - Per-brain-dump mutex isolation
    - Queue operations (enqueue, dequeue, auto-process)
    - Session persistence (serialize, deserialize, cleanup)

2. **Integration Tests**
    - Start 2 concurrent brain dumps
    - Both process independently
    - Both create separate notifications
    - Both can be expanded/minimized independently
    - Completing one doesn't affect the other

3. **E2E Tests**
    - User flow: Start brain dump #1, minimize, start brain dump #2
    - Both appear in notification stack
    - Can expand either to see progress
    - Can apply operations for each independently

4. **Error Scenarios**
    - One brain dump fails, others continue
    - Network error during one stream, others unaffected
    - Page refresh with 2 in-progress brain dumps
    - Queue behavior when limit reached

**Files to Create:**

- `apps/web/src/lib/stores/brain-dump-v2.store.test.ts` (update)
- `apps/web/src/lib/services/brain-dump-notification.bridge.test.ts` (new)

---

## Data Structures

### Store State

```typescript
interface BrainDumpV2StoreState {
	// ✅ NEW: Map of active brain dumps
	activeBrainDumps: Map<string, SingleBrainDumpState>;

	// ✅ NEW: Optional focused brain dump (convenience)
	focusedBrainDumpId: string | null;

	// ✅ NEW: Queue when limit reached
	queuedBrainDumps: Array<{
		id: string;
		config: StartBrainDumpConfig;
		queuedAt: number;
	}>;

	// ✅ NEW: Config
	config: {
		maxConcurrent: number; // Default: 3
		queueEnabled: boolean; // Default: true
	};

	// ❌ REMOVED: All singular state fields
	// (moved into SingleBrainDumpState within the Map)
}

interface SingleBrainDumpState {
	// Identity
	id: string;
	createdAt: number;

	// Input context
	selectedProject: any;
	isNewProject: boolean;
	inputText: string;
	lastSavedContent: string;
	displayedQuestions: DisplayedBrainDumpQuestion[];

	// Processing state
	processing: {
		phase: 'idle' | 'transcribing' | 'parsing' | 'saving' | 'applying';
		type: 'dual' | 'single' | 'short' | 'background';
		mutex: boolean; // Per-brain-dump mutex
		startedAt: number | null;
		jobId: string | null;
		autoAcceptEnabled: boolean;
		streaming: {
			contextStatus: 'pending' | 'processing' | 'completed' | 'error';
			tasksStatus: 'pending' | 'processing' | 'completed' | 'error';
			contextResult: any;
			tasksResult: any;
			contextProgress: string;
			tasksProgress: string;
		} | null;
		progress: {
			current: number;
			total: number;
			message: string;
		};
	};

	// Results
	parseResults: BrainDumpParseResult | null;
	disabledOperations: Set<string>;
	results: {
		executionResult: any;
		errors: {
			processing: string;
			execution: string;
		};
	};

	// Voice recording state (if applicable)
	voice?: {
		error: string;
		microphonePermissionGranted: boolean;
		// ...
	};
}
```

### Bridge State

```typescript
// ✅ NEW: Map-based tracking
const activeBrainDumpNotifications = new Map<string, string>();
// brainDumpId → notificationId

const lastProcessedTimestamps = new Map<string, number>();
// brainDumpId → timestamp

const activeAPIStreams = new Map<string, AbortController>();
// brainDumpId → AbortController for cancellation

// ❌ REMOVED: Singleton variables
// let activeBrainDumpNotificationId: string | null = null;
// let lastProcessedBrainDumpId: string | null = null;
```

---

## Concurrency Strategy

### Per-Brain-Dump Mutex

```typescript
class BrainDumpConcurrencyManager {
	private mutexes = new Map<string, boolean>();

	public async acquireMutex(brainDumpId: string): Promise<boolean> {
		if (this.mutexes.get(brainDumpId)) {
			console.warn(`Mutex already held for brain dump ${brainDumpId}`);
			return false;
		}

		this.mutexes.set(brainDumpId, true);
		return true;
	}

	public releaseMutex(brainDumpId: string): void {
		this.mutexes.delete(brainDumpId);
	}

	public isLocked(brainDumpId: string): boolean {
		return this.mutexes.get(brainDumpId) || false;
	}

	public getActiveMutexCount(): number {
		return this.mutexes.size;
	}
}

const concurrencyManager = new BrainDumpConcurrencyManager();
```

### Resource Limits

```typescript
const LIMITS = {
	MAX_CONCURRENT_BRAIN_DUMPS: 3,
	MAX_QUEUED_BRAIN_DUMPS: 5,
	SESSION_TIMEOUT_MS: 30 * 60 * 1000 // 30 minutes
};

function canStartNewBrainDump(state: BrainDumpV2StoreState): boolean {
	const activeCount = state.activeBrainDumps.size;
	return activeCount < LIMITS.MAX_CONCURRENT_BRAIN_DUMPS;
}

function canQueueBrainDump(state: BrainDumpV2StoreState): boolean {
	const queueSize = state.queuedBrainDumps.length;
	return queueSize < LIMITS.MAX_QUEUED_BRAIN_DUMPS;
}
```

### OpenAI Rate Limiting

```typescript
// Conservative approach: 3 concurrent streams max
// OpenAI free tier: ~20 requests/min
// With 3 concurrent ~30s streams = ~6 req/min = safe

const API_LIMITS = {
	MAX_CONCURRENT_STREAMS: 3,
	RETRY_DELAY_MS: 2000,
	MAX_RETRIES: 3
};

async function startAPICallWithRateLimit(brainDumpId: string, config: any): Promise<void> {
	const activeStreams = getActiveStreamCount();

	if (activeStreams >= API_LIMITS.MAX_CONCURRENT_STREAMS) {
		// Queue for later
		queueAPICall(brainDumpId, config);
		return;
	}

	// Start stream
	await startAPIStream(brainDumpId, config);
}
```

---

## Migration Path

### Backward Compatibility Strategy

**Option A: Feature Flag (Recommended)**

```typescript
// .env
PUBLIC_ENABLE_MULTI_BRAINDUMP = true;

// In store
const MULTI_BRAINDUMP_ENABLED = PUBLIC_ENABLE_MULTI_BRAINDUMP === 'true';

if (MULTI_BRAINDUMP_ENABLED) {
	// Use new Map-based architecture
} else {
	// Use legacy singleton architecture
}
```

**Option B: Automatic Migration**

```typescript
// Detect old state format on hydrate
function migrateFromSingletonToMulti(oldState: any): BrainDumpV2StoreState {
	const activeBrainDumps = new Map();

	// If there was a "current" brain dump, convert it to Map entry
	if (oldState.core?.currentBrainDumpId) {
		const singleBrainDump: SingleBrainDumpState = {
			id: oldState.core.currentBrainDumpId,
			selectedProject: oldState.core.selectedProject,
			inputText: oldState.core.inputText,
			parseResults: oldState.core.parseResults,
			processing: oldState.processing,
			results: oldState.results
			// ...
		};

		activeBrainDumps.set(singleBrainDump.id, singleBrainDump);
	}

	return {
		activeBrainDumps,
		focusedBrainDumpId: oldState.core?.currentBrainDumpId || null,
		queuedBrainDumps: [],
		config: { maxConcurrent: 3, queueEnabled: true }
	};
}
```

### Data Migration Steps

1. **Deploy with feature flag OFF** → Test existing functionality still works
2. **Enable for 10% users** → Monitor for errors
3. **Enable for 50% users** → Collect feedback
4. **Enable for 100%** → Full rollout
5. **Remove legacy code** → Clean up singleton paths

---

## Testing Strategy

### Unit Tests

```typescript
describe('BrainDumpV2Store - Multi-Instance', () => {
    test('can start multiple brain dumps concurrently', async () => {
        const id1 = await store.startBrainDump({...});
        const id2 = await store.startBrainDump({...});

        expect(store.getActiveBrainDumpCount()).toBe(2);
        expect(store.getBrainDump(id1)).toBeDefined();
        expect(store.getBrainDump(id2)).toBeDefined();
    });

    test('enforces max concurrent limit', async () => {
        // Start 3 brain dumps
        await store.startBrainDump({...});
        await store.startBrainDump({...});
        await store.startBrainDump({...});

        // 4th should queue
        const id4 = await store.startBrainDump({...});
        expect(store.getQueuedBrainDumpCount()).toBe(1);
    });

    test('per-brain-dump mutex isolation', async () => {
        const id1 = await store.startBrainDump({...});
        const id2 = await store.startBrainDump({...});

        // Acquire mutex for id1
        const acquired1 = await store.acquireMutex(id1);
        expect(acquired1).toBe(true);

        // Can still acquire mutex for id2
        const acquired2 = await store.acquireMutex(id2);
        expect(acquired2).toBe(true);

        // Cannot re-acquire mutex for id1
        const reacquired1 = await store.acquireMutex(id1);
        expect(reacquired1).toBe(false);
    });
});
```

### Integration Tests

```typescript
describe('Brain Dump Multi-Instance Flow', () => {
	test('complete flow for 2 concurrent brain dumps', async () => {
		// Start brain dump #1
		const id1 = await submitBrainDump('Project A tasks...');
		expect(getNotificationCount()).toBe(1);

		// Start brain dump #2 (concurrent)
		const id2 = await submitBrainDump('Project B features...');
		expect(getNotificationCount()).toBe(2);

		// Both process independently
		await waitForBrainDumpCompletion(id1);
		expect(getBrainDumpStatus(id1)).toBe('success');
		expect(getBrainDumpStatus(id2)).toBe('processing'); // Still going

		// Complete second
		await waitForBrainDumpCompletion(id2);
		expect(getBrainDumpStatus(id2)).toBe('success');
	});
});
```

### E2E Tests (Playwright)

```typescript
test('user can start multiple brain dumps and track progress', async ({ page }) => {
	await page.goto('/');

	// Start first brain dump
	await page.click('[data-test="brain-dump-button"]');
	await page.fill('[data-test="brain-dump-input"]', 'Build a website...');
	await page.click('[data-test="submit-brain-dump"]');

	// Verify notification appears
	await expect(page.locator('[data-test="notification-stack"]')).toContainText('Build a website');

	// Start second brain dump
	await page.click('[data-test="brain-dump-button"]');
	await page.fill('[data-test="brain-dump-input"]', 'Create mobile app...');
	await page.click('[data-test="submit-brain-dump"]');

	// Verify both notifications in stack
	const notifications = page.locator('[data-test="notification-card"]');
	await expect(notifications).toHaveCount(2);

	// Expand first notification
	await notifications.nth(0).click();
	await expect(page.locator('[data-test="notification-modal"]')).toContainText('Build a website');

	// Minimize and expand second
	await page.keyboard.press('Escape');
	await notifications.nth(1).click();
	await expect(page.locator('[data-test="notification-modal"]')).toContainText(
		'Create mobile app'
	);
});
```

---

## Risk Assessment

### High Risk ⚠️

1. **State Corruption**
    - **Risk:** Map operations could corrupt state if not immutable
    - **Mitigation:** Always create new Map instances (Svelte 5 reactivity pattern)
    - **Testing:** Comprehensive unit tests for all Map mutations

2. **Memory Leaks**
    - **Risk:** Completed brain dumps not cleaned up, Map grows indefinitely
    - **Mitigation:** Auto-cleanup after 30min, move to history, limit queue size
    - **Testing:** Monitor Map size over time, stress test with 100+ brain dumps

3. **Race Conditions**
    - **Risk:** Concurrent Map updates from different callbacks
    - **Mitigation:** Per-brain-dump mutex, atomic store updates
    - **Testing:** Concurrent stress tests, rapid start/stop scenarios

### Medium Risk ⚙️

4. **API Rate Limits**
    - **Risk:** Too many concurrent streams hit OpenAI rate limits
    - **Mitigation:** Max 3 concurrent, queue excess, retry with backoff
    - **Testing:** Integration tests with actual API, rate limit simulation

5. **Session Storage Quota**
    - **Risk:** Multiple brain dumps exceed 5MB session storage limit
    - **Mitigation:** Cleanup old brain dumps, compress data, fallback to memory-only
    - **Testing:** Simulate large brain dumps, measure storage usage

6. **Migration Bugs**
    - **Risk:** Old singleton state breaks with new Map-based code
    - **Mitigation:** Feature flag, automatic migration, backward compatibility layer
    - **Testing:** Test migration from old format, A/B test with real users

### Low Risk ✅

7. **UI Confusion**
    - **Risk:** Users confused by multiple notifications
    - **Mitigation:** Clear labeling, limit to 5 visible, "processing 2/3" indicators
    - **Testing:** User testing, feedback collection

8. **Notification Stack Overflow**
    - **Risk:** Too many notifications in stack (visual clutter)
    - **Mitigation:** Already limited to 5 visible, "+N more" badge
    - **Testing:** Create 10+ brain dumps, verify stack behavior

---

## Success Metrics

### Functional Requirements

- ✅ Can start 3 concurrent brain dumps
- ✅ Each processes independently
- ✅ Each has its own notification
- ✅ Can expand/minimize any notification
- ✅ 4th brain dump queues automatically
- ✅ Queued brain dump auto-starts when slot frees
- ✅ Session persistence for all active brain dumps
- ✅ No race conditions or state corruption

### Performance Requirements

- ✅ No noticeable lag when adding brain dump to Map
- ✅ Store updates remain under 50ms
- ✅ Session storage writes complete under 100ms
- ✅ Memory usage scales linearly (not exponentially)

### User Experience

- ✅ Clear visual feedback for multiple brain dumps
- ✅ Easy to distinguish between brain dumps in stack
- ✅ No confusion about which brain dump is which
- ✅ Intuitive queue/processing status

---

## Open Questions

1. **Should we reconnect to in-progress streams after page refresh?**
    - **Pro:** Seamless UX, no lost work
    - **Con:** Complex to implement, may fail if >30min old
    - **Decision:** Start with "lost connection" error state, add reconnection in v2

2. **Should modal be truly singular or allow multiple instances?**
    - **Current:** Modal is for input collection only, can be singular
    - **Alternative:** Allow multiple modals for editing different brain dumps
    - **Decision:** Keep singular modal for now, expand from notifications for editing

3. **How to handle brain dump cancellation?**
    - Abort API request
    - Remove from store
    - Remove notification
    - Show toast confirmation

4. **Should we persist queue across page refresh?**
    - **Pro:** Don't lose queued brain dumps
    - **Con:** May be stale after refresh
    - **Decision:** Yes, persist queue, show age indicator

5. **Limit per-user or global?**
    - **Decision:** Per-user limit (3 concurrent per browser session)
    - Global limit would require backend coordination

---

## Next Steps

1. **Review & Approve Plan** → Team review this document
2. **Create GitHub Issues** → One issue per phase
3. **Spike: Store Refactoring** → 2-hour spike to prototype Map-based store
4. **Begin Phase 1** → Store refactoring (4-5 hours)
5. **Iterate** → Complete phases 2-7 sequentially
6. **Deploy with Feature Flag** → Gradual rollout
7. **Monitor & Iterate** → Collect feedback, fix bugs

---

## Appendix: Alternative Approaches Considered

### Alternative 1: Keep Singleton, Queue All Requests

**Approach:** Keep current singleton architecture, queue all incoming brain dumps, process one at a time

**Pros:**

- Minimal code changes
- No concurrency issues
- Simple to understand

**Cons:**

- Poor UX (user waits for previous brain dumps to complete)
- No parallel processing benefit
- Doesn't leverage notification stack capabilities

**Verdict:** ❌ Rejected - UX too poor

---

### Alternative 2: Separate Store Instance Per Brain Dump

**Approach:** Create new store instance for each brain dump

**Pros:**

- Perfect isolation
- No shared state issues
- Easy to reason about

**Cons:**

- Complex store management
- Hard to coordinate across stores
- Session persistence nightmare
- No global view of all brain dumps

**Verdict:** ❌ Rejected - Too complex

---

### Alternative 3: Hybrid: Singleton with "Slots"

**Approach:** Keep singleton store, add 3 "slots" for concurrent brain dumps

**Pros:**

- Simpler than full Map-based approach
- Fixed memory usage
- Still allows concurrency

**Cons:**

- Inflexible (exactly 3 slots)
- More complex than Map approach
- Harder to add/remove slots dynamically

**Verdict:** ❌ Rejected - Map approach is more flexible

---

## Conclusion

This redesign transforms the brain dump system from a singleton architecture to a **multi-instance, concurrent-capable architecture** while maintaining:

- ✅ Data integrity via per-brain-dump mutexes
- ✅ Clean separation of concerns (modal, store, bridge, notifications)
- ✅ Resource limits to prevent overwhelming the system
- ✅ Backward compatibility via feature flag
- ✅ Session persistence for resilience
- ✅ Graceful queue management

**Estimated Total Effort:** 12-16 hours over 1-2 weeks

**Risk Level:** Medium (mitigated by feature flag, testing, gradual rollout)

**User Benefit:** High (can start multiple brain dumps, better productivity)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-01
**Next Review:** After Phase 1 completion
