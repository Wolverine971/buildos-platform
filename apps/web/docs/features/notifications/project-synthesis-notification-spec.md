<!-- apps/web/docs/features/notifications/project-synthesis-notification-spec.md -->

# Project Synthesis Notification System - Specification

**Date:** 2025-10-05
**Author:** Claude Code
**Status:** 🎯 Ready for Implementation
**Related:** [Generic Stackable Notification System](./generic-stackable-notification-system-spec.md)

---

## Executive Summary

This specification defines the integration of **Project Task Synthesis** into the BuildOS stackable notification system, transforming it from a blocking, in-component operation into a non-blocking, minimizable notification with full progress tracking and retry capabilities.

### Key Goals

1. **Non-Blocking UX**: User can navigate away while synthesis runs in background
2. **Progress Visibility**: Real-time updates during AI analysis (5-15 seconds)
3. **Result Persistence**: Results available for review after completion
4. **Retry Capability**: Easy retry on failures with same options
5. **Consistent Patterns**: Follow phase generation notification architecture

### Current State vs. Proposed State

| Aspect                  | Current (Blocking)             | Proposed (Notification)            |
| ----------------------- | ------------------------------ | ---------------------------------- |
| **UI Location**         | In-page with loading skeleton  | Stackable notification + modal     |
| **User Mobility**       | Must stay on synthesis tab     | Can navigate freely                |
| **Progress**            | Static skeleton animation      | Real-time progress steps           |
| **Failure Handling**    | Error toast only               | Error state + retry button         |
| **Result Access**       | Only while on synthesis tab    | Persistent in notification history |
| **Multiple Operations** | Cannot start another synthesis | Can queue/stack operations         |

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Architecture Overview](#2-architecture-overview)
3. [Notification Type Definition](#3-notification-type-definition)
4. [Progress Tracking](#4-progress-tracking)
5. [UI Components](#5-ui-components)
6. [Bridge Service](#6-bridge-service)
7. [Integration Points](#7-integration-points)
8. [User Flows](#8-user-flows)
9. [Implementation Plan](#9-implementation-plan)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Current State Analysis

### 1.1 Existing Synthesis Flow

**Location:** `/projects/[id]` → Synthesis tab

**Current User Journey:**

```
1. User clicks "Generate Project Synthesis" button
   ↓
2. Opens SynthesisOptionsModal to configure modules
   ↓
3. User confirms → Modal closes
   ↓
4. In-page loading skeleton appears (5-15 seconds)
   ↓
5. BLOCKED: User must stay on synthesis tab
   ↓
6. Results appear inline in ProjectSynthesis component
   ↓
7. User reviews operations, can edit/toggle
   ↓
8. User clicks "Apply Operations"
   ↓
9. Operations execute (batch processing)
   ↓
10. Success message or error toast
```

### 1.2 Current Implementation Files

- **Component**: `ProjectSynthesis.svelte` (1,040 lines)
- **Service**: `project-synthesis.service.ts` (136 lines)
- **Backend**: `projectSynthesis.service.ts` (909 lines)
- **API**: `synthesize/+server.ts` (257 lines)
- **Loading**: `SynthesisLoadingState.svelte` (skeleton UI)

### 1.3 Current Pain Points

❌ **Blocking UI**: User cannot navigate during generation
❌ **No Progress Detail**: Just a skeleton animation
❌ **Lost Results**: Navigating away loses synthesis results
❌ **No Retry**: Must reconfigure options on failure
❌ **Single Operation**: Cannot queue multiple synthesis runs

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Action                               │
│  "Generate Synthesis" button in ProjectSynthesis component  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          SynthesisOptionsModal.svelte                        │
│  User configures modules and settings                       │
└────────────────────────┬────────────────────────────────────┘
                         │ confirm
                         ▼
┌─────────────────────────────────────────────────────────────┐
│   project-synthesis-notification.bridge.ts                   │
│  • Creates notification in stack                            │
│  • Executes POST /api/projects/[id]/synthesize              │
│  • Tracks progress through 4 steps                          │
│  • Updates projectStoreV2 on success                        │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │Minimized │  │ Modal    │  │ Store    │
    │  View    │  │ Content  │  │ Updates  │
    └──────────┘  └──────────┘  └──────────┘
```

### 2.2 Component Hierarchy

```
NotificationStackManager.svelte
└── NotificationStack.svelte
    └── MinimizedNotification.svelte
        └── ProjectSynthesisMinimizedView.svelte
            ├── Progress indicator (4 steps)
            ├── Module badges
            └── Result summary (when complete)

NotificationModal.svelte
└── ProjectSynthesisModalContent.svelte
    ├── Configuration summary
    ├── Progress timeline (4 steps)
    ├── Results preview (when complete)
    │   ├── Insights card
    │   ├── Operations summary
    │   └── Task comparison preview
    └── Actions: Review Results / Retry / Dismiss
```

---

## 3. Notification Type Definition

### 3.1 TypeScript Interface

```typescript
// Add to apps/web/src/lib/types/notification.types.ts

export interface ProjectSynthesisNotification extends BaseNotification {
	type: 'project-synthesis';
	status: NotificationStatus;

	data: {
		// Context
		projectId: string;
		projectName: string;

		// Configuration (for retry)
		options: SynthesisOptions;
		requestPayload: {
			regenerate: boolean;
			includeDeleted: boolean;
			options: SynthesisOptions;
		};

		// Metadata
		taskCount: number;
		selectedModules: string[];

		// Results (populated on success)
		result?: {
			synthesisId: string;
			operations: ParsedOperation[];
			insights: string;
			comparison: TaskComparison[];
			summary: string;
			operationsCount: number;
			consolidationCount: number;
			newTasksCount: number;
			deletionsCount: number;
		};

		// Error details
		error?: string;

		// Telemetry
		telemetry?: {
			startedAt: number;
			finishedAt?: number;
			durationMs?: number;
			generationModel?: string;
		};
	};

	progress: {
		type: 'steps';
		currentStep: number;
		totalSteps: 4;
		steps: Array<{
			key: string;
			name: string;
			message?: string;
			status: 'pending' | 'processing' | 'completed' | 'error';
			etaSeconds?: number;
		}>;
	};

	actions: {
		reviewResults?: () => void; // Navigate to synthesis tab
		retry?: () => void; // Re-run with same options
		dismiss?: () => void; // Remove notification
	};
}
```

### 3.2 Module Configuration Types

```typescript
// Already exists in synthesis.types.ts
export interface SynthesisOptions {
	selectedModules: string[]; // e.g., ['task_synthesis']
	config: {
		task_synthesis?: TaskSynthesisConfig;
	};
}

// Module display metadata
const MODULE_METADATA = {
	task_synthesis: {
		name: 'Task Synthesis',
		icon: 'Sparkles',
		shortLabel: 'Tasks'
	},
	project_analysis: {
		name: 'Project Analysis',
		icon: 'LineChart',
		shortLabel: 'Analysis'
	},
	completion_score: {
		name: 'Completion Score',
		icon: 'Target',
		shortLabel: 'Score'
	}
} as const;
```

---

## 4. Progress Tracking

### 4.1 Four-Step Progress Model

The synthesis operation has **4 distinct steps**:

| Step | Key        | Name                  | Description                     | Typical Duration |
| ---- | ---------- | --------------------- | ------------------------------- | ---------------- |
| 1    | `prepare`  | Preparing analysis    | Fetching project data and tasks | 1-2s             |
| 2    | `analyze`  | Analyzing tasks       | AI analyzing tasks with LLM     | 5-10s            |
| 3    | `generate` | Generating operations | Creating CRUD operations        | 2-3s             |
| 4    | `finalize` | Finalizing synthesis  | Saving results to database      | 1s               |

### 4.2 Step Creation Function

```typescript
function createInitialSteps(): StepProgressItem[] {
	return [
		{
			key: 'prepare',
			name: 'Preparing analysis',
			message: 'Fetching project tasks and context',
			status: 'processing',
			etaSeconds: 2
		},
		{
			key: 'analyze',
			name: 'Analyzing tasks',
			message: 'AI analyzing for duplicates, gaps, and optimizations',
			status: 'pending',
			etaSeconds: 8
		},
		{
			key: 'generate',
			name: 'Generating operations',
			message: 'Creating task operations and comparisons',
			status: 'pending',
			etaSeconds: 3
		},
		{
			key: 'finalize',
			name: 'Finalizing synthesis',
			message: 'Saving results and updating project',
			status: 'pending',
			etaSeconds: 1
		}
	];
}
```

### 4.3 Progress Update Strategy

**Primary: Timer-Based Fallback** (like phase generation)

Since the current API is synchronous (single POST request), use **deterministic timer** to advance steps:

```typescript
function startFallbackProgress(controller: SynthesisController) {
	const timings = [
		{ step: 0, delay: 0 }, // Immediate: prepare
		{ step: 1, delay: 2000 }, // 2s: analyze starts
		{ step: 2, delay: 9000 }, // 9s: generate starts
		{ step: 3, delay: 12000 } // 12s: finalize starts
	];

	const timers: number[] = [];

	for (const { step, delay } of timings) {
		const timeout = window.setTimeout(() => {
			if (controller.status === 'processing') {
				advanceStep(controller, step, 'processing');
			}
		}, delay);
		timers.push(timeout);
	}

	controller.cleanup = () => {
		timers.forEach(clearTimeout);
	};
}
```

**Future Enhancement: SSE Streaming** (optional)

If backend adds streaming support later:

```typescript
// Future: POST /api/projects/[id]/synthesize/stream
eventSource.addEventListener('prepare', () => {
	advanceStep(controller, 0, 'processing');
});

eventSource.addEventListener('analyze', (event) => {
	advanceStep(controller, 1, 'processing');
	// Could include progress: "Analyzed 50/100 tasks"
});

eventSource.addEventListener('generate', () => {
	advanceStep(controller, 2, 'processing');
});

eventSource.addEventListener('complete', (event) => {
	const data = JSON.parse(event.data);
	handleSuccess(controller, data);
});
```

---

## 5. UI Components

### 5.1 Minimized View

**File:** `ProjectSynthesisMinimizedView.svelte`

**Design:**

```
┌─────────────────────────────────────────────────────┐
│ [✨] Project Synthesis — My Project Name            │
│                                                      │
│ Analyzing tasks • Step 2 of 4                       │
│ [████████░░░░] 50%                                  │
│                                                      │
│ Modules: Tasks • Analysis                           │
└─────────────────────────────────────────────────────┘
```

**When Complete:**

```
┌─────────────────────────────────────────────────────┐
│ [✓] Synthesis Complete — My Project Name            │
│                                                      │
│ Found 12 optimizations across 47 tasks              │
│                                                      │
│ 3 Consolidations • 2 New • 4 Deletions              │
│                                                      │
│ [Review Results →]                                   │
└─────────────────────────────────────────────────────┘
```

**Implementation:**

```svelte
<script lang="ts">
	import { Sparkles, CheckCircle, AlertCircle, Loader2 } from 'lucide-svelte';
	import type { ProjectSynthesisNotification } from '$lib/types/notification.types';

	let { notification } = $props<{ notification: ProjectSynthesisNotification }>();

	const stepsProgress = $derived(
		notification.progress?.type === 'steps' ? notification.progress : null
	);

	const currentStepName = $derived(
		stepsProgress?.steps[stepsProgress.currentStep]?.name ?? 'Processing'
	);

	const progressPercentage = $derived(
		stepsProgress ? Math.round((stepsProgress.currentStep / stepsProgress.totalSteps) * 100) : 0
	);

	const moduleLabels = $derived(
		notification.data.selectedModules
			.map((m) => MODULE_METADATA[m]?.shortLabel ?? m)
			.join(' • ')
	);

	const result = $derived(notification.data.result);
</script>

<div class="flex items-start gap-3">
	<!-- Icon -->
	<div class="flex-shrink-0 mt-1">
		{#if notification.status === 'success'}
			<CheckCircle class="w-5 h-5 text-green-600" />
		{:else if notification.status === 'error'}
			<AlertCircle class="w-5 h-5 text-red-600" />
		{:else}
			<Loader2 class="w-5 h-5 text-blue-600 animate-spin" />
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		<!-- Header -->
		<div class="flex items-center gap-2 mb-1">
			<Sparkles class="w-4 h-4 text-purple-500" />
			<h4 class="font-medium text-sm truncate">
				{notification.status === 'success' ? 'Synthesis Complete' : 'Project Synthesis'}
				<span class="text-gray-500">—</span>
				<span class="text-gray-700">{notification.data.projectName}</span>
			</h4>
		</div>

		<!-- Processing state -->
		{#if notification.status === 'processing'}
			<p class="text-xs text-gray-600 mb-2">
				{currentStepName} • Step {stepsProgress?.currentStep + 1} of {stepsProgress?.totalSteps}
			</p>

			<!-- Progress bar -->
			<div class="w-full bg-gray-200 rounded-full h-1.5 mb-2">
				<div
					class="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
					style="width: {progressPercentage}%"
				></div>
			</div>

			<p class="text-xs text-gray-500">
				Modules: {moduleLabels}
			</p>

			<!-- Success state -->
		{:else if notification.status === 'success' && result}
			<p class="text-xs text-gray-600 mb-2">
				Found {result.operationsCount} optimizations across {notification.data.taskCount} tasks
			</p>

			<div class="flex items-center gap-2 text-xs text-gray-500 mb-2">
				{#if result.consolidationCount > 0}
					<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
						{result.consolidationCount} Consolidations
					</span>
				{/if}
				{#if result.newTasksCount > 0}
					<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded">
						{result.newTasksCount} New
					</span>
				{/if}
				{#if result.deletionsCount > 0}
					<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded">
						{result.deletionsCount} Deletions
					</span>
				{/if}
			</div>

			<button
				on:click|stopPropagation={() => notification.actions.reviewResults?.()}
				class="text-xs text-blue-600 hover:text-blue-700 font-medium"
			>
				Review Results →
			</button>

			<!-- Error state -->
		{:else if notification.status === 'error'}
			<p class="text-xs text-red-600">
				{notification.data.error ?? 'Synthesis failed'}
			</p>
		{/if}
	</div>
</div>
```

### 5.2 Modal Content

**File:** `ProjectSynthesisModalContent.svelte`

**Design Sections:**

1. **Header**: Project name, status icon, duration
2. **Configuration Summary**: Selected modules and settings
3. **Progress Timeline**: 4-step progress with status indicators
4. **Results Preview** (when complete):
    - Insights card (green background)
    - Operations summary with counts
    - Task comparison preview (first 3-5 comparisons)
5. **Footer Actions**: Review Results / Retry / Minimize / Close

**Implementation Structure:**

```svelte
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ProjectSynthesisNotification } from '$lib/types/notification.types';

	let { notification } = $props<{ notification: ProjectSynthesisNotification }>();

	const dispatch = createEventDispatcher();

	const stepsProgress = $derived(
		notification.progress?.type === 'steps' ? notification.progress : null
	);

	const result = $derived(notification.data.result);

	function handleReviewResults() {
		notification.actions.reviewResults?.();
		dispatch('close');
	}

	function handleRetry() {
		notification.actions.retry?.();
	}

	function handleMinimize() {
		dispatch('minimize');
	}
</script>

<Modal
	isOpen={true}
	size="xl"
	title="Project Synthesis — {notification.data.projectName}"
	onClose={() => dispatch('close')}
>
	<div class="px-6 py-6 space-y-6">
		<!-- Overview Card -->
		<section class="bg-white dark:bg-gray-900 rounded-xl border p-6">
			<!-- Status icon, project name, duration -->
		</section>

		<!-- Configuration Summary -->
		<section class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
			<h3 class="text-sm font-semibold text-gray-700 mb-2">Configuration</h3>
			<div class="flex flex-wrap gap-2">
				{#each notification.data.selectedModules as module}
					<span
						class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-medium"
					>
						{MODULE_METADATA[module]?.name ?? module}
					</span>
				{/each}
			</div>
		</section>

		<!-- Progress Timeline -->
		<section class="bg-white dark:bg-gray-900 rounded-xl border p-6">
			<h3 class="text-sm font-semibold text-gray-700 mb-4">Progress</h3>
			{#if stepsProgress}
				<ol class="space-y-3">
					{#each stepsProgress.steps as step}
						<li class="flex items-start gap-3">
							<!-- Step indicator circle -->
							<!-- Step name and message -->
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<!-- Results Preview (when complete) -->
		{#if notification.status === 'success' && result}
			<!-- Insights Card -->
			<section
				class="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 p-6"
			>
				<h3 class="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
					<Lightbulb class="w-4 h-4" />
					Key Insights
				</h3>
				<p class="text-sm text-green-700">{result.insights}</p>
			</section>

			<!-- Operations Summary -->
			<section class="bg-white dark:bg-gray-900 rounded-xl border p-6">
				<h3 class="text-sm font-semibold text-gray-700 mb-4">Operations Summary</h3>
				<div class="grid grid-cols-3 gap-4">
					<div class="text-center">
						<div class="text-2xl font-bold text-blue-600">
							{result.consolidationCount}
						</div>
						<div class="text-xs text-gray-500">Consolidations</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-green-600">{result.newTasksCount}</div>
						<div class="text-xs text-gray-500">New Tasks</div>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-red-600">{result.deletionsCount}</div>
						<div class="text-xs text-gray-500">Deletions</div>
					</div>
				</div>
			</section>

			<!-- Task Comparison Preview -->
			<section class="bg-white dark:bg-gray-900 rounded-xl border p-6">
				<h3 class="text-sm font-semibold text-gray-700 mb-4">
					Task Comparisons
					<span class="text-gray-400 font-normal">
						(Showing first 3 of {result.comparison.length})
					</span>
				</h3>
				<!-- Render first 3 comparisons -->
				<p class="text-xs text-blue-600 mt-4">
					Click "Review Results" to see full analysis and edit operations
				</p>
			</section>
		{/if}
	</div>

	<!-- Footer Actions -->
	<div slot="footer" class="flex items-center justify-between px-6 py-4 border-t">
		<div class="text-xs text-gray-500">
			{#if notification.data.telemetry?.durationMs}
				Completed in {formatDuration(notification.data.telemetry.durationMs)}
			{/if}
		</div>

		<div class="flex gap-2">
			<Button variant="ghost" on:click={handleMinimize}>Minimize</Button>
			{#if notification.status === 'error'}
				<Button variant="secondary" icon={RefreshCw} on:click={handleRetry}>Retry</Button>
			{/if}
			{#if notification.status === 'success'}
				<Button variant="primary" icon={ExternalLink} on:click={handleReviewResults}>
					Review Results
				</Button>
			{:else}
				<Button variant="primary" on:click={() => dispatch('close')}>Close</Button>
			{/if}
		</div>
	</div>
</Modal>
```

---

## 6. Bridge Service

### 6.1 File Structure

**File:** `apps/web/src/lib/services/project-synthesis-notification.bridge.ts`

**Purpose:** Controller for managing synthesis notifications through their lifecycle

### 6.2 Controller Interface

```typescript
interface SynthesisController {
	notificationId: string;
	projectId: string;
	projectName: string;
	taskCount: number;
	selectedModules: string[];
	options: SynthesisOptions;
	requestPayload: {
		regenerate: boolean;
		includeDeleted: boolean;
		options: SynthesisOptions;
	};
	status: 'idle' | 'processing' | 'success' | 'error';
	steps: StepProgressItem[];
	currentStep: number;
	cleanup?: () => void;
}

const controllers = new Map<string, SynthesisController>();
```

### 6.3 Public API

```typescript
export interface StartSynthesisOptions {
	projectId: string;
	projectName: string;
	taskCount: number;
	options: SynthesisOptions;
	includeDeleted?: boolean;
	regenerate?: boolean;
}

export async function startProjectSynthesis(
	options: StartSynthesisOptions
): Promise<{ notificationId: string }> {
	const requestPayload = {
		regenerate: options.regenerate ?? true,
		includeDeleted: options.includeDeleted ?? false,
		options: options.options
	};

	// Create controller
	const controller: SynthesisController = {
		notificationId: notificationStore.add({
			type: 'project-synthesis',
			status: 'processing',
			isMinimized: true,
			isPersistent: true,
			data: {
				projectId: options.projectId,
				projectName: options.projectName,
				taskCount: options.taskCount,
				selectedModules: options.options.selectedModules,
				options: options.options,
				requestPayload,
				telemetry: {
					startedAt: Date.now()
				}
			},
			progress: buildProgress(createInitialSteps(), 0),
			actions: {}
		} as Notification),
		projectId: options.projectId,
		projectName: options.projectName,
		taskCount: options.taskCount,
		selectedModules: options.options.selectedModules,
		options: options.options,
		requestPayload,
		status: 'idle',
		steps: createInitialSteps(),
		currentStep: 0
	};

	controllers.set(controller.notificationId, controller);
	attachActions(controller);

	// Execute in background
	executeSynthesis(controller, { reason: 'initial' }).catch((error) => {
		console.error('[SynthesisBridge] Execution failed', error);
	});

	return { notificationId: controller.notificationId };
}
```

### 6.4 Execution Logic

```typescript
async function executeSynthesis(
	controller: SynthesisController,
	context: { reason: 'initial' | 'retry' | 'resume' }
): Promise<void> {
	controller.status = 'processing';
	const startedAt = Date.now();

	// Start fallback progress
	startFallbackProgress(controller);

	try {
		// Step 1: Prepare (immediate)
		advanceStep(controller, 0, 'processing');

		// Make API request
		const response = await fetch(`/api/projects/${controller.projectId}/synthesize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(controller.requestPayload)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error?.error || 'Failed to generate synthesis');
		}

		const payload = await response.json();
		const synthesis = payload.synthesis;

		// Jump to final step
		advanceStep(controller, controller.steps.length - 1, 'processing');

		// Extract results
		const synthesisContent = synthesis.synthesis_content;
		const operations = synthesisContent.operations || [];
		const insights = synthesisContent.insights || '';
		const comparison = synthesisContent.comparison || [];
		const summary = synthesisContent.summary || '';

		// Count operations by type
		const consolidationCount = operations.filter(
			(op) => op.operation === 'update' && op.reasoning?.includes('consolidat')
		).length;
		const newTasksCount = operations.filter((op) => op.operation === 'create').length;
		const deletionsCount = operations.filter((op) => op.operation === 'delete').length;

		// Update project store
		projectStoreV2.setSynthesis(synthesis);

		// Clean up
		stopAndCleanup(controller);

		// Update controller
		controller.status = 'success';
		completeAllSteps(controller, 'success');

		// Update notification
		const finishedAt = Date.now();
		const durationMs = finishedAt - startedAt;

		notificationStore.update(controller.notificationId, {
			status: 'success',
			progress: buildProgress(controller.steps, controller.steps.length - 1),
			data: {
				projectId: controller.projectId,
				projectName: controller.projectName,
				taskCount: controller.taskCount,
				selectedModules: controller.selectedModules,
				options: controller.options,
				requestPayload: controller.requestPayload,
				telemetry: {
					startedAt,
					finishedAt,
					durationMs,
					generationModel: synthesis.generation_model
				},
				result: {
					synthesisId: synthesis.id,
					operations,
					insights,
					comparison,
					summary,
					operationsCount: operations.length,
					consolidationCount,
					newTasksCount,
					deletionsCount
				}
			}
		} as Partial<ProjectSynthesisNotification>);

		// Toast feedback
		toastService.success(`Found ${operations.length} optimizations!`);
	} catch (error) {
		console.error('[SynthesisBridge] Synthesis failed', error);

		stopAndCleanup(controller);
		controller.status = 'error';
		completeAllSteps(controller, 'error');

		const message = error instanceof Error ? error.message : 'Failed to generate synthesis';

		notificationStore.update(controller.notificationId, {
			status: 'error',
			progress: buildProgress(controller.steps, controller.currentStep),
			data: {
				projectId: controller.projectId,
				projectName: controller.projectName,
				taskCount: controller.taskCount,
				selectedModules: controller.selectedModules,
				options: controller.options,
				requestPayload: controller.requestPayload,
				error: message,
				telemetry: {
					startedAt,
					finishedAt: Date.now(),
					durationMs: Date.now() - startedAt
				}
			}
		} as Partial<ProjectSynthesisNotification>);

		toastService.error(message);
	}
}
```

### 6.5 Action Registration

```typescript
function attachActions(controller: SynthesisController) {
	notificationStore.update(controller.notificationId, {
		actions: {
			reviewResults: () => {
				// Navigate to synthesis tab with results
				notificationStore.minimize(controller.notificationId);
				if (browser) {
					goto(`/projects/${controller.projectId}?tab=synthesis`, {
						invalidateAll: true
					});
				}
			},
			retry: () => {
				if (controller.status === 'processing') return;
				executeSynthesis(controller, { reason: 'retry' }).catch((error) => {
					console.error('[SynthesisBridge] Retry failed', error);
				});
			},
			dismiss: () => {
				notificationStore.remove(controller.notificationId);
			}
		}
	});
}
```

### 6.6 Initialization & Cleanup

```typescript
let unsubscribeStore: (() => void) | null = null;

export function initProjectSynthesisNotificationBridge(): void {
	if (unsubscribeStore) return;

	// Hydrate existing notifications
	const state = get(notificationStore);
	for (const notification of state.notifications.values()) {
		if (notification.type !== 'project-synthesis') continue;
		ensureController(notification);
	}

	// Subscribe to store changes
	unsubscribeStore = notificationStore.subscribe(($state) => {
		const activeIds = new Set(
			Array.from($state.notifications.values())
				.filter((n): n is ProjectSynthesisNotification => n.type === 'project-synthesis')
				.map((n) => n.id)
		);

		for (const [id, controller] of controllers.entries()) {
			if (!activeIds.has(id)) {
				stopAndCleanup(controller);
				controllers.delete(id);
			}
		}
	});
}

export function cleanupProjectSynthesisNotificationBridge(): void {
	for (const controller of controllers.values()) {
		stopAndCleanup(controller);
	}
	controllers.clear();

	if (unsubscribeStore) {
		unsubscribeStore();
		unsubscribeStore = null;
	}
}
```

---

## 7. Integration Points

### 7.1 Update ProjectSynthesis.svelte

**Current code:**

```typescript
async function handleGenerate(options?: SynthesisOptions) {
	synthesisContent = null;
	operations = [];
	comparison = [];
	insights = '';
	summary = '';
	await onGenerate(options);
}
```

**New code:**

```typescript
import { startProjectSynthesis } from '$lib/services/project-synthesis-notification.bridge';

async function handleGenerate(options?: SynthesisOptions) {
	// Clear current synthesis UI
	synthesisContent = null;
	operations = [];
	comparison = [];
	insights = '';
	summary = '';

	// Start synthesis via notification
	const { notificationId } = await startProjectSynthesis({
		projectId: project.id,
		projectName: project.name,
		taskCount: tasks?.length || 0,
		options: options || getDefaultOptions(),
		regenerate: synthesis !== null,
		includeDeleted: false
	});

	// Show toast
	toastService.info('Synthesis started - check notifications');

	// Switch to a different tab or stay?
	// Option 1: Stay on synthesis tab to watch results appear
	// Option 2: Navigate away, user can come back via notification
}
```

**Alternative: Keep backward compatibility with feature flag**

```typescript
async function handleGenerate(options?: SynthesisOptions) {
  const USE_NOTIFICATION = import.meta.env.PUBLIC_USE_NEW_NOTIFICATIONS === 'true';

  if (USE_NOTIFICATION) {
    // New notification-based flow
    const { notificationId } = await startProjectSynthesis({...});
    toastService.info('Synthesis started - check notifications');
  } else {
    // Old in-component flow
    synthesisContent = null;
    await onGenerate(options);
  }
}
```

### 7.2 Initialize Bridge in +layout.svelte

```typescript
import {
	initProjectSynthesisNotificationBridge,
	cleanupProjectSynthesisNotificationBridge
} from '$lib/services/project-synthesis-notification.bridge';

onMount(() => {
	// ... other initializations
	initProjectSynthesisNotificationBridge();
});

onDestroy(() => {
	// ... other cleanups
	cleanupProjectSynthesisNotificationBridge();
});
```

### 7.3 Update Notification Type Registry

**File:** `notification.store.ts`

Add to notification type union:

```typescript
export type Notification =
	| BrainDumpNotification
	| PhaseGenerationNotification
	| ProjectSynthesisNotification // Add this
	| CalendarAnalysisNotification
	| GenericNotification;
```

### 7.4 Component Registration

**File:** `NotificationStackManager.svelte`

```typescript
const componentMap = {
	'brain-dump': {
		minimized: BrainDumpMinimizedView,
		modal: BrainDumpModalContent
	},
	'phase-generation': {
		minimized: PhaseGenerationMinimizedView,
		modal: PhaseGenerationModalContent
	},
	'project-synthesis': {
		minimized: ProjectSynthesisMinimizedView, // Add this
		modal: ProjectSynthesisModalContent
	}
	// ...
};
```

---

## 8. User Flows

### 8.1 Happy Path: Generate Synthesis

```
1. User navigates to /projects/[id]?tab=synthesis
2. Clicks "Start Analysis" button
3. SynthesisOptionsModal opens
4. User selects modules (e.g., Task Synthesis)
5. User configures settings and clicks "Confirm"
6. Modal closes
7. startProjectSynthesis() called
   → Notification appears in stack (minimized)
   → Shows "Preparing analysis... Step 1 of 4"
8. User can navigate away (or stay to watch)
9. Progress updates automatically:
   → "Analyzing tasks... Step 2 of 4"
   → "Generating operations... Step 3 of 4"
   → "Finalizing synthesis... Step 4 of 4"
10. After ~10 seconds, notification shows success:
   → "Synthesis Complete"
   → "Found 12 optimizations across 47 tasks"
   → "3 Consolidations • 2 New • 4 Deletions"
11. User clicks "Review Results" button
12. Navigates to synthesis tab with results loaded
13. User reviews operations, edits, and applies
```

### 8.2 Error Handling: API Failure

```
1. User starts synthesis
2. Notification appears in stack
3. API request fails (e.g., rate limit, server error)
4. Notification updates to error state:
   → Red X icon
   → Error message: "Failed to generate synthesis"
   → "Retry" button visible
5. User clicks "Retry"
6. Same operation re-executes with same options
7. Success or another error
```

### 8.3 Multi-Synthesis Scenario

```
1. User generates synthesis for Project A
   → Notification A in stack, processing
2. User navigates to Project B
3. User generates synthesis for Project B
   → Notification B appears in stack (below A)
4. Both notifications show progress independently
5. Project A synthesis completes → Shows success
6. Project B synthesis completes → Shows success
7. User can review either result from stack
```

### 8.4 Page Refresh During Processing

```
1. User starts synthesis
2. Notification in stack, processing (Step 2 of 4)
3. User refreshes page
4. Bridge hydrates from session storage
5. Controller rebuilds from notification data
6. executeSynthesis() resumes with reason: 'resume'
7. If still processing: continues from current step
8. If completed while page was loading: shows success
```

---

## 9. Implementation Plan

### Phase 1: Foundation (Day 1)

- [ ] **Create notification type definition**
    - Add `ProjectSynthesisNotification` to `notification.types.ts`
    - Add module metadata constants
    - Export utility types

- [ ] **Create bridge service**
    - Scaffold `project-synthesis-notification.bridge.ts`
    - Implement controller interface
    - Implement `startProjectSynthesis()` function
    - Implement `executeSynthesis()` with timer-based progress
    - Implement action registration

- [ ] **Create UI components**
    - Create `ProjectSynthesisMinimizedView.svelte`
    - Create `ProjectSynthesisModalContent.svelte`
    - Register components in `NotificationStackManager`

### Phase 2: Integration (Day 2)

- [ ] **Update ProjectSynthesis component**
    - Add feature flag check
    - Implement notification-based flow
    - Keep backward compatibility
    - Test both flows

- [ ] **Initialize bridge in layout**
    - Import bridge init/cleanup functions
    - Add to `onMount()` and `onDestroy()`

- [ ] **Test basic flow**
    - Start synthesis → notification appears
    - Progress updates → shows steps
    - Completion → shows results
    - Review results → navigates correctly

### Phase 3: Polish (Day 3)

- [ ] **Enhance minimized view**
    - Improve progress visualization
    - Add module badges with icons
    - Add result summary formatting

- [ ] **Enhance modal content**
    - Add task comparison preview
    - Improve insights display
    - Add configuration summary section

- [ ] **Error handling**
    - Test API failures
    - Test network errors
    - Implement retry logic
    - Add error messaging

### Phase 4: Testing (Day 4)

- [ ] **Unit tests**
    - Bridge: controller lifecycle
    - Bridge: progress advancement
    - Bridge: action registration
    - Bridge: hydration/resume

- [ ] **Integration tests**
    - Full synthesis flow
    - Multi-synthesis scenario
    - Page refresh during processing
    - Error recovery

- [ ] **Manual QA**
    - Test in all browsers
    - Test with real projects
    - Test edge cases (empty project, large project)
    - Test mobile responsiveness

### Phase 5: Rollout (Day 5)

- [ ] **Feature flag deployment**
    - Deploy with `PUBLIC_USE_NEW_NOTIFICATIONS=false`
    - Internal testing with flag enabled
    - Monitor error logs

- [ ] **Gradual rollout**
    - Enable for 10% of users
    - Collect feedback
    - Fix issues
    - Enable for 100%

- [ ] **Cleanup**
    - Remove old loading skeleton (if not used elsewhere)
    - Remove feature flag
    - Update documentation

---

## 10. Testing Strategy

### 10.1 Unit Tests

**File:** `project-synthesis-notification.bridge.test.ts`

```typescript
describe('ProjectSynthesisNotificationBridge', () => {

  describe('startProjectSynthesis', () => {
    it('creates notification with correct initial state', async () => {
      const { notificationId } = await startProjectSynthesis({
        projectId: 'proj-1',
        projectName: 'Test Project',
        taskCount: 50,
        options: { selectedModules: ['task_synthesis'], config: {} }
      });

      const state = get(notificationStore);
      const notification = state.notifications.get(notificationId);

      expect(notification).toBeDefined();
      expect(notification.type).toBe('project-synthesis');
      expect(notification.status).toBe('processing');
      expect(notification.data.projectId).toBe('proj-1');
      expect(notification.data.taskCount).toBe(50);
    });

    it('initializes progress with 4 steps', async () => {
      const { notificationId } = await startProjectSynthesis({...});

      const state = get(notificationStore);
      const notification = state.notifications.get(notificationId);

      expect(notification.progress.type).toBe('steps');
      expect(notification.progress.totalSteps).toBe(4);
      expect(notification.progress.steps.length).toBe(4);
    });
  });

  describe('executeSynthesis', () => {
    it('advances through all steps on success', async () => {
      // Mock API success
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            synthesis: {
              id: 'syn-1',
              synthesis_content: {
                operations: [],
                insights: 'Test insights',
                comparison: [],
                summary: 'Test summary'
              }
            }
          })
        })
      );

      const { notificationId } = await startProjectSynthesis({...});

      await vi.waitFor(() => {
        const state = get(notificationStore);
        const notification = state.notifications.get(notificationId);
        expect(notification.status).toBe('success');
        expect(notification.progress.currentStep).toBe(3);
      });
    });

    it('handles errors correctly', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'API error' })
        })
      );

      const { notificationId } = await startProjectSynthesis({...});

      await vi.waitFor(() => {
        const state = get(notificationStore);
        const notification = state.notifications.get(notificationId);
        expect(notification.status).toBe('error');
        expect(notification.data.error).toBe('API error');
      });
    });
  });

  describe('retry action', () => {
    it('re-executes synthesis with same options', async () => {
      // ... test retry functionality
    });
  });

  describe('hydration', () => {
    it('rebuilds controller from persisted notification', () => {
      // ... test hydration logic
    });
  });
});
```

### 10.2 Integration Tests

```typescript
describe('Synthesis Notification Integration', () => {
	it('completes full synthesis flow', async () => {
		// 1. Start synthesis
		// 2. Wait for progress updates
		// 3. Verify completion
		// 4. Click "Review Results"
		// 5. Verify navigation to synthesis tab
	});

	it('handles multiple concurrent syntheses', async () => {
		// 1. Start synthesis for Project A
		// 2. Start synthesis for Project B
		// 3. Verify both notifications exist
		// 4. Verify both complete independently
	});

	it('persists across page refresh', async () => {
		// 1. Start synthesis
		// 2. Simulate page refresh (hydrate store)
		// 3. Verify notification restored
		// 4. Verify synthesis continues
	});
});
```

### 10.3 Manual QA Checklist

- [ ] Start synthesis and verify notification appears
- [ ] Verify progress steps advance correctly
- [ ] Navigate away during synthesis and come back
- [ ] Verify results appear correctly on completion
- [ ] Click "Review Results" and verify navigation
- [ ] Test retry on error
- [ ] Test with different module configurations
- [ ] Test with empty project (0 tasks)
- [ ] Test with large project (100+ tasks)
- [ ] Test on mobile (responsive design)
- [ ] Test notification stacking (multiple syntheses)
- [ ] Test page refresh during processing
- [ ] Verify session persistence works

---

## Appendix A: File Checklist

### New Files

- [ ] `apps/web/src/lib/services/project-synthesis-notification.bridge.ts` (~500 lines)
- [ ] `apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisMinimizedView.svelte` (~150 lines)
- [ ] `apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisModalContent.svelte` (~400 lines)
- [ ] `apps/web/src/lib/services/__tests__/project-synthesis-notification.bridge.test.ts` (~200 lines)

### Modified Files

- [ ] `apps/web/src/lib/types/notification.types.ts` (add ProjectSynthesisNotification)
- [ ] `apps/web/src/lib/components/project/ProjectSynthesis.svelte` (integrate bridge)
- [ ] `apps/web/src/routes/+layout.svelte` (initialize bridge)
- [ ] `apps/web/src/lib/components/notifications/NotificationStackManager.svelte` (register components)

---

## Appendix B: Future Enhancements

### Backend Streaming Support

If backend adds SSE streaming, update bridge:

```typescript
async function executeSynthesis(controller: SynthesisController) {
	const eventSource = new EventSource(`/api/projects/${controller.projectId}/synthesize/stream`);

	eventSource.addEventListener('prepare', () => {
		advanceStep(controller, 0, 'processing');
	});

	eventSource.addEventListener('analyze', (event) => {
		advanceStep(controller, 1, 'processing');
		const data = JSON.parse(event.data);
		// Could show: "Analyzed 25/50 tasks"
	});

	eventSource.addEventListener('generate', () => {
		advanceStep(controller, 2, 'processing');
	});

	eventSource.addEventListener('complete', (event) => {
		const data = JSON.parse(event.data);
		handleSuccess(controller, data);
		eventSource.close();
	});

	eventSource.addEventListener('error', () => {
		handleError(controller, 'Streaming connection failed');
		eventSource.close();
	});
}
```

### Apply Operations via Notification

Future: Allow applying operations directly from the notification modal:

```typescript
actions: {
  reviewResults: () => {...},
  applyOperations: async () => {
    // Execute POST /api/projects/[id]/synthesize/apply
    // Show progress for application
    // Update notification on success/error
  },
  retry: () => {...},
  dismiss: () => {...}
}
```

### Quick Preview in Minimized View

Show first operation or insight in minimized view:

```svelte
{#if result && result.operations.length > 0}
	<p class="text-xs text-gray-600 italic truncate">
		"{result.operations[0].reasoning.substring(0, 50)}..."
	</p>
{/if}
```

---

## Conclusion

This specification provides a complete blueprint for integrating **Project Task Synthesis** into the BuildOS stackable notification system. The design:

✅ **Follows phase generation patterns** - Consistent controller architecture
✅ **Non-blocking UX** - User can navigate during synthesis
✅ **Clear progress feedback** - 4-step progress tracking
✅ **Result persistence** - Results accessible after completion
✅ **Retry capability** - Easy retry on failures
✅ **Mobile-friendly** - Responsive design for all screens
✅ **Production-ready** - Feature flag, tests, rollout plan

**Estimated effort:** 4-5 days for full implementation and testing.

**Ready to implement!** 🚀
