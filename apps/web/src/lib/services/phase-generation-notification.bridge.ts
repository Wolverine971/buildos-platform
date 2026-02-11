// apps/web/src/lib/services/phase-generation-notification.bridge.ts
/**
 * Phase Generation Notification Bridge
 *
 * Creates and manages generic notifications for phase generation jobs.
 * - Submits the generation request
 * - Updates progress (step-based) while work is in-flight
 * - Applies results to project store and surfaces success/error states
 *
 * Mirrors the approach used by brain-dump-notification.bridge but scoped to
 * project phase generation (spec Phase 3).
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { toastService } from '$lib/stores/toast.store';
import { projectStoreV2 } from '$lib/stores/project.store';
import type {
	Notification,
	PhaseGenerationNotification,
	StepProgressItem,
	StepsProgress
} from '$lib/types/notification.types';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface PhaseGenerationConfirmPayload {
	selected_statuses: string[];
	scheduling_method: 'phases_only' | 'schedule_in_phases' | 'calendar_optimized';
	project_start_date: string | null;
	project_end_date: string | null;
	project_dates_changed?: boolean;
	include_recurring_tasks?: boolean;
	allow_recurring_reschedule?: boolean;
	preserve_existing_dates?: boolean;
	preserve_historical_phases?: boolean;
	user_instructions?: string;
	calendar_handling?: string;
	preserve_recurring_events?: boolean;
	[key: string]: unknown;
}

export interface StartPhaseGenerationOptions {
	projectId: string;
	projectName: string;
	isRegeneration: boolean;
	taskCount: number;
	selectedStatuses?: string[];
	requestPayload: PhaseGenerationConfirmPayload;
}

interface PhaseGenerationController {
	notificationId: string;
	projectId: string;
	projectName: string;
	isRegeneration: boolean;
	taskCount: number;
	strategy: PhaseGenerationNotification['data']['strategy'];
	selectedStatuses: string[];
	requestPayload: PhaseGenerationConfirmPayload;
	status: 'idle' | 'processing' | 'success' | 'error';
	steps: StepProgressItem[];
	currentStep: number;
	cleanup?: () => void;
}

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

const controllers = new Map<string, PhaseGenerationController>();
let unsubscribeStore: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function toStrategy(
	method: PhaseGenerationConfirmPayload['scheduling_method']
): PhaseGenerationNotification['data']['strategy'] {
	switch (method) {
		case 'calendar_optimized':
			return 'calendar-optimized';
		case 'schedule_in_phases':
			return 'schedule-in-phases';
		default:
			return 'phases-only';
	}
}

function cloneSteps(steps: StepProgressItem[]): StepProgressItem[] {
	return steps.map((step) => ({ ...step }));
}

function createInitialSteps(
	strategy: PhaseGenerationNotification['data']['strategy']
): StepProgressItem[] {
	const steps: StepProgressItem[] = [
		{
			key: 'queue',
			name: 'Submitting request',
			message: 'Queueing job with generation service',
			status: 'processing'
		},
		{
			key: 'analyze',
			name: 'Analyzing tasks',
			message: 'Checking conflicts, statuses, and timeline',
			status: 'pending'
		},
		{
			key: 'generate_phases',
			name: 'Generating phases',
			message: 'Creating phase plan and assignments',
			status: 'pending'
		}
	];

	if (strategy !== 'phases-only') {
		steps.push({
			key: 'schedule',
			name:
				strategy === 'calendar-optimized'
					? 'Coordinating with calendar'
					: 'Scheduling tasks',
			message:
				strategy === 'calendar-optimized'
					? 'Aligning tasks with meetings and availability'
					: 'Assigning dates inside each phase',
			status: 'pending'
		});
	}

	steps.push({
		key: 'finalize',
		name: 'Finalizing updates',
		message: 'Saving results and refreshing project data',
		status: 'pending'
	});

	return steps;
}

function buildProgress(steps: StepProgressItem[], currentStep: number): StepsProgress {
	return {
		type: 'steps',
		currentStep,
		totalSteps: steps.length,
		steps: cloneSteps(steps)
	};
}

function advanceStep(
	controller: PhaseGenerationController,
	targetStep: number,
	status: StepProgressItem['status']
) {
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

	notificationStore.setProgress(
		controller.notificationId,
		buildProgress(controller.steps, controller.currentStep)
	);
}

function completeAllSteps(controller: PhaseGenerationController, status: 'success' | 'error') {
	controller.steps = controller.steps.map((step, index) => {
		if (status === 'success') {
			return { ...step, status: 'completed' };
		}

		if (index === controller.currentStep) {
			return { ...step, status: 'error' };
		}

		return step.status === 'completed' ? step : { ...step, status: 'pending' };
	});

	const finalStepIndex = Math.max(0, controller.steps.length - 1);
	controller.currentStep = finalStepIndex;
	notificationStore.setProgress(
		controller.notificationId,
		buildProgress(controller.steps, finalStepIndex)
	);
}

function attachActions(controller: PhaseGenerationController) {
	notificationStore.update(controller.notificationId, {
		actions: {
			viewProject: () => {
				notificationStore.remove(controller.notificationId);
				if (browser) {
					// Force data invalidation to refresh project data even if already on the page
					goto(`/projects/${controller.projectId}`, { invalidateAll: true });
				}
			},
			retry: () => {
				if (controller.status === 'processing') return;
				executePhaseGeneration(controller, { reason: 'retry' }).catch((error) => {
					console.error('[PhaseGenerationBridge] Retry failed', error);
					notificationStore.setError(controller.notificationId, 'Retry failed');
				});
			},
			dismiss: () => {
				notificationStore.remove(controller.notificationId);
			}
		}
	});
}

function ensureController(
	notification: PhaseGenerationNotification
): PhaseGenerationController | null {
	const existing = controllers.get(notification.id);
	if (existing) {
		attachActions(existing);
		return existing;
	}

	if (!notification.data.requestPayload) {
		console.warn(
			'[PhaseGenerationBridge] Unable to rebuild controller – request payload missing for notification',
			notification.id
		);
		return null;
	}

	const controller: PhaseGenerationController = {
		notificationId: notification.id,
		projectId: notification.data.projectId,
		projectName: notification.data.projectName,
		isRegeneration: notification.data.isRegeneration,
		taskCount: notification.data.taskCount,
		strategy: notification.data.strategy,
		selectedStatuses: notification.data.selectedStatuses,
		requestPayload: notification.data.requestPayload as PhaseGenerationConfirmPayload,
		status: notification.status === 'processing' ? 'processing' : 'idle',
		steps:
			notification.progress?.type === 'steps'
				? cloneSteps(notification.progress.steps)
				: createInitialSteps(notification.data.strategy),
		currentStep: notification.progress?.type === 'steps' ? notification.progress.currentStep : 0
	};

	controllers.set(notification.id, controller);
	attachActions(controller);

	if (controller.status === 'processing') {
		executePhaseGeneration(controller, { reason: 'resume' }).catch((error) => {
			console.error('[PhaseGenerationBridge] Failed to resume phase generation', error);
		});
	}
	return controller;
}

function startFallbackProgress(controller: PhaseGenerationController) {
	if (!browser) return;

	const timers: number[] = [];
	const intervalMs = 1600;

	for (let index = 1; index < controller.steps.length; index += 1) {
		const timeout = window.setTimeout(() => {
			if (controller.status !== 'processing') return;
			advanceStep(controller, index, 'processing');
		}, intervalMs * index);
		timers.push(timeout);
	}

	controller.cleanup = () => {
		for (const id of timers) {
			clearTimeout(id);
		}
	};
}

function stopAndCleanup(controller: PhaseGenerationController) {
	if (controller.cleanup) {
		controller.cleanup();
		controller.cleanup = undefined;
	}
}

type ExecutionReason = 'initial' | 'retry' | 'resume';

async function executePhaseGeneration(
	controller: PhaseGenerationController,
	options: { reason?: ExecutionReason }
) {
	controller.status = 'processing';
	controller.steps = createInitialSteps(controller.strategy);
	controller.currentStep = 0;

	const startedAt = Date.now();

	notificationStore.update(controller.notificationId, {
		status: 'processing',
		progress: buildProgress(controller.steps, controller.currentStep),
		data: {
			projectId: controller.projectId,
			projectName: controller.projectName,
			isRegeneration: controller.isRegeneration,
			strategy: controller.strategy,
			taskCount: controller.taskCount,
			selectedStatuses: controller.selectedStatuses,
			requestPayload: controller.requestPayload,
			telemetry: {
				startedAt,
				fallbackMode: 'timer'
			},
			error: undefined
		}
	} as Partial<PhaseGenerationNotification>);

	stopAndCleanup(controller);
	startFallbackProgress(controller);

	try {
		advanceStep(controller, 0, 'processing');

		const response = await fetch(`/api/projects/${controller.projectId}/phases/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(controller.requestPayload)
		});

		const payload = await response.json();

		if (!response.ok) {
			throw new Error(payload?.error || 'Failed to generate phases');
		}

		advanceStep(controller, Math.max(controller.steps.length - 1, 0), 'processing');

		const phases = payload?.data?.phases ?? [];
		const backlogTasks = payload?.data?.backlogTasks ?? payload?.data?.backlog_tasks ?? [];
		const calendarEventCount =
			payload?.data?.calendarEventCount ?? payload?.data?.calendar_event_count ?? undefined;
		const summaryMarkdown = payload?.data?.summaryMarkdown ?? payload?.data?.summary_markdown;

		projectStoreV2.setPhases(phases);

		if (controller.requestPayload.project_dates_changed) {
			const currentProject = projectStoreV2.getState().project;
			const updated = {
				...currentProject,
				start_date: controller.requestPayload.project_start_date,
				end_date: controller.requestPayload.project_end_date
			};
			projectStoreV2.updateStoreState({ project: updated as any });
		}

		stopAndCleanup(controller);

		controller.status = 'success';
		completeAllSteps(controller, 'success');

		const finishedAt = Date.now();
		const durationMs = finishedAt - startedAt;

		notificationStore.update(controller.notificationId, {
			status: 'success',
			progress: buildProgress(controller.steps, controller.steps.length - 1),
			data: {
				projectId: controller.projectId,
				projectName: controller.projectName,
				isRegeneration: controller.isRegeneration,
				strategy: controller.strategy,
				taskCount: controller.taskCount,
				selectedStatuses: controller.selectedStatuses,
				requestPayload: controller.requestPayload,
				telemetry: {
					startedAt,
					finishedAt,
					durationMs,
					fallbackMode: 'timer'
				},
				result: {
					phases,
					backlogTasks,
					calendarEventCount,
					summaryMarkdown
				},
				error: undefined
			}
		} as Partial<PhaseGenerationNotification>);

		toastService.success('Phases generated successfully');
	} catch (error) {
		console.error('[PhaseGenerationBridge] Phase generation failed', error);
		stopAndCleanup(controller);
		controller.status = 'error';
		completeAllSteps(controller, 'error');

		const finishedAt = Date.now();
		const durationMs = finishedAt - startedAt;

		const message =
			error instanceof Error
				? error.message
				: typeof error === 'string'
					? error
					: 'Failed to generate phases';

		notificationStore.update(controller.notificationId, {
			status: 'error',
			progress: buildProgress(controller.steps, controller.currentStep),
			data: {
				projectId: controller.projectId,
				projectName: controller.projectName,
				isRegeneration: controller.isRegeneration,
				strategy: controller.strategy,
				taskCount: controller.taskCount,
				selectedStatuses: controller.selectedStatuses,
				requestPayload: controller.requestPayload,
				error: message,
				telemetry: {
					startedAt,
					finishedAt,
					durationMs,
					fallbackMode: 'timer'
				}
			}
		} as Partial<PhaseGenerationNotification>);

		toastService.error(message);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initPhaseGenerationNotificationBridge(): void {
	if (unsubscribeStore) {
		return;
	}

	const state = get(notificationStore);
	for (const notification of state.notifications.values()) {
		if (notification.type !== 'phase-generation') continue;
		ensureController(notification);
	}

	unsubscribeStore = notificationStore.subscribe(($state) => {
		const activeIds = new Set(
			Array.from($state.notifications.values())
				.filter(
					(notification): notification is PhaseGenerationNotification =>
						notification.type === 'phase-generation'
				)
				.map((notification) => notification.id)
		);

		for (const [id, controller] of controllers.entries()) {
			if (!activeIds.has(id)) {
				stopAndCleanup(controller);
				controllers.delete(id);
			}
		}
	});
}

export function cleanupPhaseGenerationNotificationBridge(): void {
	for (const controller of controllers.values()) {
		stopAndCleanup(controller);
	}
	controllers.clear();

	if (unsubscribeStore) {
		unsubscribeStore();
		unsubscribeStore = null;
	}
}

export async function startPhaseGeneration(
	options: StartPhaseGenerationOptions
): Promise<{ notificationId: string }> {
	const strategy = toStrategy(options.requestPayload.scheduling_method);
	const selectedStatuses =
		options.selectedStatuses ?? options.requestPayload.selected_statuses ?? [];

	const controller: PhaseGenerationController = {
		notificationId: notificationStore.add({
			type: 'phase-generation',
			status: 'processing',
			isMinimized: true,
			isPersistent: true,
			data: {
				projectId: options.projectId,
				projectName: options.projectName,
				isRegeneration: options.isRegeneration,
				strategy,
				taskCount: options.taskCount,
				selectedStatuses,
				requestPayload: options.requestPayload,
				telemetry: {
					startedAt: Date.now(),
					fallbackMode: 'timer'
				}
			},
			progress: buildProgress(createInitialSteps(strategy), 0),
			actions: {}
		} as unknown as Notification),
		projectId: options.projectId,
		projectName: options.projectName,
		isRegeneration: options.isRegeneration,
		taskCount: options.taskCount,
		strategy,
		selectedStatuses,
		requestPayload: options.requestPayload,
		status: 'idle',
		steps: createInitialSteps(strategy),
		currentStep: 0
	};

	controllers.set(controller.notificationId, controller);
	attachActions(controller);

	// Fire and forget; caller can await completion from returned promise if needed.
	executePhaseGeneration(controller, { reason: 'initial' }).catch((error) => {
		console.error('[PhaseGenerationBridge] Execution failed', error);
	});

	return { notificationId: controller.notificationId };
}
