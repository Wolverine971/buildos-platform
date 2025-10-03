// apps/web/src/lib/services/calendar-analysis-notification.bridge.ts
/**
 * Calendar Analysis Notification Bridge
 *
 * Wires the generic notification stack to the calendar analysis workflow so the
 * operation can run in the background while showing progress/results.
 */

import { get } from 'svelte/store';
import { notificationStore } from '$lib/stores/notification.store';
import { toastService } from '$lib/stores/toast.store';
import type { CalendarAnalysisNotification, Notification } from '$lib/types/notification.types';

interface StartCalendarAnalysisOptions {
	daysBack?: number;
	daysForward?: number;
	expandOnStart?: boolean;
	expandOnComplete?: boolean;
}

interface CalendarAnalysisController {
	notificationId: string;
	daysBack: number;
	daysForward: number;
	expandOnComplete: boolean;
	status: 'idle' | 'processing';
	abortController?: AbortController;
}

const DEFAULT_DAYS_BACK = 7;
const DEFAULT_DAYS_FORWARD = 60;

const controllers = new Map<string, CalendarAnalysisController>();
let unsubscribeStore: (() => void) | null = null;

function attachActions(controller: CalendarAnalysisController): void {
	notificationStore.update(controller.notificationId, {
		actions: {
			viewResults: () => notificationStore.expand(controller.notificationId),
			retry: () => {
				if (controller.status === 'processing') return;
				executeAnalysis(controller, { reason: 'retry' }).catch((error) => {
					console.error('[CalendarAnalysisBridge] Retry failed', error);
					notificationStore.setError(controller.notificationId, 'Retry failed');
				});
			},
			dismiss: () => notificationStore.remove(controller.notificationId)
		}
	});
}

function ensureController(notification: CalendarAnalysisNotification): CalendarAnalysisController {
	const existing = controllers.get(notification.id);
	if (existing) {
		attachActions(existing);
		return existing;
	}

	const controller: CalendarAnalysisController = {
		notificationId: notification.id,
		daysBack: notification.data.daysBack ?? DEFAULT_DAYS_BACK,
		daysForward: notification.data.daysForward ?? DEFAULT_DAYS_FORWARD,
		expandOnComplete: false,
		status: notification.status === 'processing' ? 'processing' : 'idle'
	};

	controllers.set(notification.id, controller);
	attachActions(controller);
	return controller;
}

async function executeAnalysis(
	controller: CalendarAnalysisController,
	{ reason }: { reason: 'initial' | 'retry' }
): Promise<void> {
	controller.status = 'processing';
	controller.abortController?.abort();
	controller.abortController = new AbortController();

	notificationStore.setStatus(controller.notificationId, 'processing');
	notificationStore.setProgress(controller.notificationId, {
		type: 'indeterminate',
		message:
			reason === 'retry' ? 'Retrying calendar analysis...' : 'Analyzing calendar events...'
	});

	notificationStore.update(controller.notificationId, {
		data: {
			daysBack: controller.daysBack,
			daysForward: controller.daysForward,
			error: undefined
		}
	});

	try {
		const response = await fetch('/api/calendar/analyze', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				daysBack: controller.daysBack,
				daysForward: controller.daysForward
			}),
			signal: controller.abortController.signal
		});

		const result = await response.json();

		if (!response.ok || !result?.success) {
			const errorMessage = result?.error ?? 'Failed to analyze calendar';
			throw new Error(errorMessage);
		}

		const data = result.data ?? {};
		const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
		const eventsAnalyzed = typeof data.eventsAnalyzed === 'number' ? data.eventsAnalyzed : null;
		const analysisId = typeof data.analysisId === 'string' ? data.analysisId : null;

		notificationStore.update(controller.notificationId, {
			status: 'success',
			progress: {
				type: 'indeterminate',
				message:
					suggestions.length > 0
						? `Found ${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`
						: 'Analysis complete'
			},
			data: {
				daysBack: controller.daysBack,
				daysForward: controller.daysForward,
				analysisId: analysisId ?? undefined,
				eventCount: eventsAnalyzed ?? undefined,
				suggestions
			}
		});

		if (controller.expandOnComplete) {
			notificationStore.expand(controller.notificationId);
		}

		const successMessage =
			suggestions.length > 0
				? `Calendar analysis ready — ${suggestions.length} suggestion${
						suggestions.length === 1 ? '' : 's'
					}`
				: 'Calendar analysis finished without suggestions';
		toastService.success(successMessage);
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return;
		}

		console.error('[CalendarAnalysisBridge] Analysis failed', error);
		const message =
			error instanceof Error ? error.message : 'Failed to analyze calendar events';
		notificationStore.setError(controller.notificationId, message);
		toastService.error(message);
	} finally {
		controller.status = 'idle';
		controller.abortController = undefined;
	}
}

export function initCalendarAnalysisNotificationBridge(): void {
	if (unsubscribeStore) {
		return;
	}

	const state = get(notificationStore);
	for (const notification of state.notifications.values()) {
		if (notification.type !== 'calendar-analysis') continue;
		const controller = ensureController(notification);
		if (notification.status === 'processing') {
			executeAnalysis(controller, { reason: 'retry' }).catch((error) =>
				console.error('[CalendarAnalysisBridge] Resume failed', error)
			);
		}
	}

	unsubscribeStore = notificationStore.subscribe(($state) => {
		const activeIds = new Set(
			Array.from($state.notifications.values())
				.filter(
					(notification): notification is CalendarAnalysisNotification =>
						notification.type === 'calendar-analysis'
				)
				.map((notification) => notification.id)
		);

		for (const [id, controller] of controllers.entries()) {
			if (!activeIds.has(id)) {
				controller.abortController?.abort();
				controllers.delete(id);
			}
		}
	});
}

export function cleanupCalendarAnalysisNotificationBridge(): void {
	for (const controller of controllers.values()) {
		controller.abortController?.abort();
	}
	controllers.clear();

	if (unsubscribeStore) {
		unsubscribeStore();
		unsubscribeStore = null;
	}
}

export async function startCalendarAnalysis(
	options: StartCalendarAnalysisOptions = {}
): Promise<{ notificationId: string; completion: Promise<void> }> {
	const daysBack = options.daysBack ?? DEFAULT_DAYS_BACK;
	const daysForward = options.daysForward ?? DEFAULT_DAYS_FORWARD;

	const notificationId = notificationStore.add({
		type: 'calendar-analysis',
		status: 'processing',
		isMinimized: options.expandOnStart ? false : true,
		isPersistent: true,
		data: {
			daysBack,
			daysForward
		},
		progress: {
			type: 'indeterminate',
			message: 'Analyzing calendar events...'
		},
		actions: {}
	} as Notification);

	const controller: CalendarAnalysisController = {
		notificationId,
		daysBack,
		daysForward,
		expandOnComplete: options.expandOnComplete ?? false,
		status: 'idle'
	};

	controllers.set(notificationId, controller);
	attachActions(controller);

	if (options.expandOnStart) {
		notificationStore.expand(notificationId);
	}

	const completion = executeAnalysis(controller, { reason: 'initial' }).catch((error) => {
		console.error('[CalendarAnalysisBridge] Execution failed', error);
	});

	return { notificationId, completion };
}

export function restartCalendarAnalysis(
	notificationId: string,
	options: { daysBack?: number; daysForward?: number } = {}
): Promise<void> {
	const controller = controllers.get(notificationId);
	if (!controller) {
		return Promise.reject(
			new Error(
				`[CalendarAnalysisBridge] No active controller for notification ${notificationId}`
			)
		);
	}

	if (controller.status === 'processing') {
		return Promise.resolve();
	}

	if (typeof options.daysBack === 'number') {
		controller.daysBack = options.daysBack;
	}
	if (typeof options.daysForward === 'number') {
		controller.daysForward = options.daysForward;
	}

	return executeAnalysis(controller, { reason: 'retry' });
}
