// apps/web/src/lib/services/project-synthesis-notification.bridge.ts

/**
 * Project Synthesis Notification Bridge
 *
 * This module manages the lifecycle of project synthesis notifications,
 * integrating with the generic stackable notification system.
 *
 * Pattern: Controller-based bridge (similar to phase-generation-notification.bridge.ts)
 *
 * Responsibilities:
 * - Create and manage synthesis notifications
 * - Execute synthesis API calls with progress tracking
 * - Handle success, error, and retry flows
 * - Integrate with projectStoreV2 for state updates
 * - Persist state across page refreshes (hydration)
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { projectStoreV2 } from '$lib/stores/project.store';
import { toastService } from '$lib/stores/toast.store';
import type {
	Notification,
	ProjectSynthesisNotification,
	StepProgressItem,
	StepsProgress
} from '$lib/types/notification.types';
import type { SynthesisOptions } from '$lib/types/synthesis';
import type { ParsedOperation } from '$lib/types/brain-dump';

// ============================================================================
// Controller Interface
// ============================================================================

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

// Controllers are stored in a Map for fast lookup by notification ID
const controllers = new Map<string, SynthesisController>();

// Store subscription cleanup function
let unsubscribeStore: (() => void) | null = null;

// ============================================================================
// Public API
// ============================================================================

export interface StartSynthesisOptions {
	projectId: string;
	projectName: string;
	taskCount: number;
	options: SynthesisOptions;
	includeDeleted?: boolean;
	regenerate?: boolean;
}

/**
 * Start a new project synthesis operation
 * Creates a notification and begins execution in the background
 */
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

	// Execute in background (fire and forget)
	executeSynthesis(controller, { reason: 'initial' }).catch((error) => {
		console.error('[SynthesisBridge] Execution failed', error);
	});

	return { notificationId: controller.notificationId };
}

/**
 * Initialize the synthesis notification bridge
 * Call this in the root layout's onMount
 */
export function initProjectSynthesisNotificationBridge(): void {
	if (unsubscribeStore) {
		return; // Already initialized
	}

	// Hydrate existing notifications from store
	const state = get(notificationStore);
	for (const notification of state.notifications.values()) {
		if (notification.type !== 'project-synthesis') continue;
		ensureController(notification as ProjectSynthesisNotification);
	}

	// Subscribe to store changes for cleanup
	unsubscribeStore = notificationStore.subscribe(($state) => {
		// Get active notification IDs
		const activeIds = new Set(
			Array.from($state.notifications.values())
				.filter(
					(notification): notification is ProjectSynthesisNotification =>
						notification.type === 'project-synthesis'
				)
				.map((notification) => notification.id)
		);

		// Clean up controllers for removed notifications
		for (const [id, controller] of controllers.entries()) {
			if (!activeIds.has(id)) {
				stopAndCleanup(controller);
				controllers.delete(id);
			}
		}
	});

	console.log('[SynthesisBridge] Initialized');
}

/**
 * Cleanup the synthesis notification bridge
 * Call this in the root layout's onDestroy
 */
export function cleanupProjectSynthesisNotificationBridge(): void {
	// Stop all timers
	for (const controller of controllers.values()) {
		stopAndCleanup(controller);
	}

	// Clear controller map
	controllers.clear();

	// Unsubscribe from store
	if (unsubscribeStore) {
		unsubscribeStore();
		unsubscribeStore = null;
	}

	console.log('[SynthesisBridge] Cleaned up');
}

// ============================================================================
// Step Management
// ============================================================================

/**
 * Create initial progress steps for synthesis
 */
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

/**
 * Build progress object for notification store
 */
function buildProgress(steps: StepProgressItem[], currentStep: number): StepsProgress {
	return {
		type: 'steps',
		currentStep,
		totalSteps: steps.length,
		steps
	};
}

/**
 * Advance to a specific step with new status
 */
function advanceStep(
	controller: SynthesisController,
	targetStep: number,
	status: StepProgressItem['status']
) {
	// Update step statuses
	controller.steps = controller.steps.map((step, index) => {
		if (index < targetStep) {
			return step.status === 'completed' ? step : { ...step, status: 'completed' };
		}
		if (index === targetStep) {
			return { ...step, status };
		}
		return step.status === 'pending' ? step : { ...step, status: 'pending' };
	});

	controller.currentStep = targetStep;

	// Update notification store
	notificationStore.setProgress(
		controller.notificationId,
		buildProgress(controller.steps, controller.currentStep)
	);
}

/**
 * Mark all steps as completed/error
 */
function completeAllSteps(controller: SynthesisController, status: 'success' | 'error') {
	const finalStatus: StepProgressItem['status'] = status === 'success' ? 'completed' : 'error';
	controller.steps = controller.steps.map((step) => ({
		...step,
		status: finalStatus
	}));
}

// ============================================================================
// Progress Simulation (Fallback Timer)
// ============================================================================

/**
 * Start fallback progress timer
 * Advances through steps deterministically since API is synchronous
 */
function startFallbackProgress(controller: SynthesisController) {
	if (!browser) return;

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

	// Store cleanup function
	controller.cleanup = () => {
		for (const id of timers) {
			clearTimeout(id);
		}
	};
}

/**
 * Stop progress timer and clean up
 */
function stopAndCleanup(controller: SynthesisController) {
	if (controller.cleanup) {
		controller.cleanup();
		controller.cleanup = undefined;
	}
}

// ============================================================================
// Synthesis Execution
// ============================================================================

/**
 * Execute synthesis API call with progress tracking
 */
async function executeSynthesis(
	controller: SynthesisController,
	context: { reason: 'initial' | 'retry' | 'resume' }
): Promise<void> {
	controller.status = 'processing';
	const startedAt = Date.now();

	console.log(
		`[SynthesisBridge] Starting synthesis for project ${controller.projectId} (${context.reason})`
	);

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
		const operations: ParsedOperation[] = synthesisContent.operations || [];
		const insights: string = synthesisContent.insights || '';
		const comparison = synthesisContent.comparison || [];
		const summary: string = synthesisContent.summary || '';

		// Count operations by type
		const consolidationCount = operations.filter(
			(op) => op.operation === 'update' && op.reasoning?.toLowerCase().includes('consolidat')
		).length;
		const newTasksCount = operations.filter((op) => op.operation === 'create').length;
		const deletionsCount = operations.filter((op) => op.operation === 'delete').length;

		// Update project store
		projectStoreV2.setSynthesis(synthesis);

		// Clean up timers
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
		toastService.success(
			`Found ${operations.length} optimization${operations.length === 1 ? '' : 's'}!`
		);

		console.log(
			`[SynthesisBridge] Synthesis completed successfully in ${durationMs}ms (${operations.length} operations)`
		);
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

// ============================================================================
// Action Registration
// ============================================================================

/**
 * Attach actions to the notification
 * Actions are function references that enable user interaction
 */
function attachActions(controller: SynthesisController) {
	notificationStore.update(controller.notificationId, {
		actions: {
			reviewResults: () => {
				// Navigate to synthesis tab with results
				notificationStore.remove(controller.notificationId);
				if (browser) {
					goto(`/projects/${controller.projectId}?tab=synthesis`, {
						invalidateAll: true
					});
				}
			},
			retry: () => {
				// Prevent retry if already processing
				if (controller.status === 'processing') return;

				console.log('[SynthesisBridge] Retrying synthesis');
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

// ============================================================================
// Hydration & Controller Management
// ============================================================================

/**
 * Ensure a controller exists for the given notification
 * Rebuilds from notification data if needed (hydration)
 */
function ensureController(notification: ProjectSynthesisNotification): SynthesisController | null {
	// Return existing controller if found
	const existing = controllers.get(notification.id);
	if (existing) {
		attachActions(existing);
		return existing;
	}

	// Verify notification has required data
	if (!notification.data.requestPayload) {
		console.warn(
			'[SynthesisBridge] Unable to rebuild controller – request payload missing',
			notification.id
		);
		return null;
	}

	console.log('[SynthesisBridge] Rebuilding controller from notification:', notification.id);

	// Rebuild controller from notification data
	const controller: SynthesisController = {
		notificationId: notification.id,
		projectId: notification.data.projectId,
		projectName: notification.data.projectName,
		taskCount: notification.data.taskCount,
		selectedModules: notification.data.selectedModules,
		options: notification.data.options,
		requestPayload: notification.data.requestPayload,
		status: notification.status === 'processing' ? 'processing' : 'idle',
		steps:
			notification.progress?.type === 'steps'
				? cloneSteps(notification.progress.steps)
				: createInitialSteps(),
		currentStep: notification.progress?.type === 'steps' ? notification.progress.currentStep : 0
	};

	controllers.set(notification.id, controller);
	attachActions(controller);

	// Resume processing if still active
	if (controller.status === 'processing') {
		console.log('[SynthesisBridge] Resuming synthesis after hydration');
		executeSynthesis(controller, { reason: 'resume' }).catch((error) => {
			console.error('[SynthesisBridge] Failed to resume synthesis', error);
		});
	}

	return controller;
}

/**
 * Clone steps array (deep copy)
 */
function cloneSteps(steps: StepProgressItem[]): StepProgressItem[] {
	return steps.map((step) => ({ ...step }));
}
