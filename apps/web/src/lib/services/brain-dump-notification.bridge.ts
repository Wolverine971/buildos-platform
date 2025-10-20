// apps/web/src/lib/services/brain-dump-notification.bridge.ts
/**
 * Brain Dump Notification Bridge
 *
 * Bridges the brain-dump-v2.store with the generic notification.store.
 * Creates and updates notifications based on brain dump processing state.
 *
 * Part of Phase 2: Brain Dump Migration
 */

import { get } from 'svelte/store';
import { brainDumpV2Store } from '$lib/stores/brain-dump-v2.store';
import { notificationStore } from '$lib/stores/notification.store';
import { brainDumpService } from '$lib/services/braindump-api.service';
import { backgroundBrainDumpService } from '$lib/services/braindump-background.service';
import type { BrainDumpNotification } from '$lib/types/notification.types';
import type { StreamingMessage } from '$lib/types/sse-messages';

const MULTI_BRAINDUMP_ENABLED = true;

/**
 * State tracking for active brain dump notifications
 * MULTI-BRAIN DUMP: Map of brainDumpId → notificationId
 */
const activeBrainDumpNotifications = new Map<string, string>();

/**
 * Track last processed timestamps to prevent duplicates
 * MULTI-BRAIN DUMP: Map of brainDumpId → timestamp
 */
const lastProcessedTimestamps = new Map<string, number>();

/**
 * Track the last state object we synced per brain dump so repeated emissions that
 * don't clone the state (e.g. typing in a new modal) don't spam notification updates.
 */
const lastSyncedBrainDumpStates = new Map<string, any>();

/**
 * Track active API streams for cancellation
 * MULTI-BRAIN DUMP: Map of brainDumpId → AbortController
 */
const activeAPIStreams = new Map<string, AbortController>();

function buildBrainDumpNotificationActions(brainDumpId: string): BrainDumpNotification['actions'] {
	return {
		view: () => {
			if (MULTI_BRAINDUMP_ENABLED) {
				const notifId = activeBrainDumpNotifications.get(brainDumpId);
				if (notifId) {
					notificationStore.expand(notifId);
				}
			} else if (activeBrainDumpNotificationId) {
				notificationStore.expand(activeBrainDumpNotificationId);
			}
		},
		dismiss: () => {
			if (MULTI_BRAINDUMP_ENABLED) {
				const notifId = activeBrainDumpNotifications.get(brainDumpId);
				if (notifId) {
					notificationStore.remove(notifId);
				}

				activeBrainDumpNotifications.delete(brainDumpId);
				lastProcessedTimestamps.delete(brainDumpId);
				lastSyncedBrainDumpStates.delete(brainDumpId);

				// CRITICAL: Cancel active API stream
				cancelBrainDumpAPIStream(brainDumpId);

				// CRITICAL: Clear background service jobs for this brain dump
				// This ensures orphaned jobs don't persist across page reloads
				backgroundBrainDumpService.clearJobsForBrainDump(brainDumpId);

				// Complete brain dump in store (removes from activeBrainDumps map)
				brainDumpV2Store.completeBrainDump(brainDumpId);
			} else if (activeBrainDumpNotificationId) {
				// Legacy mode
				notificationStore.remove(activeBrainDumpNotificationId);
				activeBrainDumpNotificationId = null;
				lastProcessedBrainDumpId = null;

				// Clear background jobs for legacy mode too
				if (lastProcessedBrainDumpId) {
					backgroundBrainDumpService.clearJobsForBrainDump(lastProcessedBrainDumpId);
				}
			}
		}
	};
}

function ensureBrainDumpNotificationActions(brainDumpId: string, notificationId: string) {
	notificationStore.update(notificationId, {
		actions: buildBrainDumpNotificationActions(brainDumpId)
	});
}

/**
 * LEGACY: Singleton tracking (used when MULTI_BRAINDUMP_ENABLED=false)
 */
let activeBrainDumpNotificationId: string | null = null;
let brainDumpStoreUnsubscribe: (() => void) | null = null;

/**
 * Initialize the bridge - starts watching brain dump store for changes
 */
export function initBrainDumpNotificationBridge() {
	console.log('[BrainDumpNotificationBridge] Initializing bridge');

	// Check if there are existing brain dump notifications in the store (page refresh scenario)
	const currentState = get(notificationStore);

	if (MULTI_BRAINDUMP_ENABLED) {
		for (const notification of currentState.notifications.values()) {
			if (notification.type !== 'brain-dump') continue;
			const brainDumpId = notification.data.brainDumpId;
			if (!brainDumpId) continue;
			if (brainDumpId.startsWith('test_')) continue;

			console.log(
				'[BrainDumpNotificationBridge] Rebinding persisted brain dump notification',
				{
					brainDumpId,
					notificationId: notification.id
				}
			);
			activeBrainDumpNotifications.set(brainDumpId, notification.id);
			lastProcessedTimestamps.set(brainDumpId, notification.updatedAt ?? Date.now());
			ensureBrainDumpNotificationActions(brainDumpId, notification.id);
		}
	} else {
		const existingBrainDumpNotification = Array.from(currentState.notifications.values()).find(
			(n): n is BrainDumpNotification =>
				n.type === 'brain-dump' &&
				n.status === 'processing' &&
				// Only reconnect to real brain dumps, not test notifications
				!n.data.brainDumpId?.startsWith('test_')
		);

		if (existingBrainDumpNotification) {
			console.log(
				'[BrainDumpNotificationBridge] Found existing notification on init:',
				existingBrainDumpNotification.id
			);
			activeBrainDumpNotificationId = existingBrainDumpNotification.id;
			// Extract brain dump ID from the notification
			if (existingBrainDumpNotification.data.brainDumpId) {
				lastProcessedBrainDumpId = existingBrainDumpNotification.data.brainDumpId;
			}
		}
	}

	// Subscribe to brain dump store changes
	brainDumpStoreUnsubscribe = brainDumpV2Store.subscribe((state) => {
		if (MULTI_BRAINDUMP_ENABLED) {
			// Multi-brain dump mode: Iterate over all active brain dumps
			for (const [brainDumpId, brainDump] of state.activeBrainDumps) {
				syncBrainDumpToNotification(brainDump);
			}

			// Clean up notifications for completed brain dumps
			cleanupCompletedNotifications(state);
		} else {
			// Legacy mode: Single brain dump
			syncBrainDumpToNotification(state);
		}
	});
}

/**
 * Cleanup the bridge
 */
export function cleanupBrainDumpNotificationBridge() {
	console.log('[BrainDumpNotificationBridge] Cleaning up bridge');

	if (brainDumpStoreUnsubscribe) {
		brainDumpStoreUnsubscribe();
		brainDumpStoreUnsubscribe = null;
	}

	if (MULTI_BRAINDUMP_ENABLED) {
		// Multi-brain dump mode: Clear all tracking
		activeBrainDumpNotifications.clear();
		lastProcessedTimestamps.clear();
		lastSyncedBrainDumpStates.clear();

		// Cancel all active streams
		for (const controller of activeAPIStreams.values()) {
			controller.abort();
		}
		activeAPIStreams.clear();
	} else {
		// Legacy mode
		activeBrainDumpNotificationId = null;
		lastProcessedBrainDumpId = null;
	}
}

/**
 * Clean up notifications for brain dumps that no longer exist in the store
 */
function cleanupCompletedNotifications(state: any) {
	const activeBrainDumpIds = new Set(state.activeBrainDumps.keys());

	// Check each notification and remove if brain dump no longer exists
	for (const [brainDumpId, notificationId] of activeBrainDumpNotifications) {
		if (!activeBrainDumpIds.has(brainDumpId)) {
			console.log(
				`[BrainDumpNotificationBridge] Cleaning up notification for completed brain dump ${brainDumpId}`
			);
			// Don't remove the notification, just remove from tracking
			// The notification will auto-dismiss or user can dismiss it
			activeBrainDumpNotifications.delete(brainDumpId);
			lastProcessedTimestamps.delete(brainDumpId);
			lastSyncedBrainDumpStates.delete(brainDumpId);
		}
	}
}

/**
 * LEGACY: Track the last brain dump ID to prevent duplicate notifications
 */
let lastProcessedBrainDumpId: string | null = null;

/**
 * Create or update notification based on brain dump state
 */
function syncBrainDumpToNotification(state: any) {
	if (MULTI_BRAINDUMP_ENABLED) {
		// Multi-brain dump mode: state is SingleBrainDumpState
		syncMultiBrainDumpNotification(state);
	} else {
		// Legacy mode: state is UnifiedBrainDumpState
		syncLegacyBrainDumpNotification(state);
	}
}

/**
 * Multi-brain dump notification sync
 */
function syncMultiBrainDumpNotification(brainDump: any) {
	const brainDumpId = brainDump.id;
	const isProcessing = brainDump.processing.phase === 'parsing';

	// Skip redundant work if the state reference hasn't changed. Real updates clone the state.
	const previousState = lastSyncedBrainDumpStates.get(brainDumpId);
	if (previousState === brainDump) {
		return;
	}
	lastSyncedBrainDumpStates.set(brainDumpId, brainDump);

	console.log('[BrainDumpNotificationBridge] syncMultiBrainDumpNotification:', {
		brainDumpId,
		phase: brainDump.processing.phase,
		hasNotification: activeBrainDumpNotifications.has(brainDumpId)
	});

	// Create notification if processing just started
	if (isProcessing && !activeBrainDumpNotifications.has(brainDumpId)) {
		// Check if this is a new brain dump (not a page refresh)
		const lastTimestamp = lastProcessedTimestamps.get(brainDumpId);
		const now = Date.now();

		if (!lastTimestamp || now - lastTimestamp > 1000) {
			console.log('[BrainDumpNotificationBridge] Creating notification for:', brainDumpId);
			const notificationId = createBrainDumpNotification(brainDump);
			activeBrainDumpNotifications.set(brainDumpId, notificationId);
			lastProcessedTimestamps.set(brainDumpId, now);

			// CRITICAL: Trigger API call to actually process the brain dump
			startProcessingAPICall(brainDump);
		} else {
			console.log(
				'[BrainDumpNotificationBridge] Skipping duplicate notification for:',
				brainDumpId
			);
		}
		return;
	}

	// Update existing notification
	const notificationId = activeBrainDumpNotifications.get(brainDumpId);
	if (notificationId) {
		console.log(
			'[BrainDumpNotificationBridge] Updating notification:',
			notificationId,
			'for:',
			brainDumpId
		);
		updateBrainDumpNotification(notificationId, brainDump);
	}
}

/**
 * Legacy single brain dump notification sync
 */
function syncLegacyBrainDumpNotification(state: any) {
	const { core, processing } = state;

	// Check if we should create or update a notification
	const isProcessing = processing.phase === 'parsing';
	const currentBrainDumpId = core.currentBrainDumpId || processing.activeBrainDumpId;

	console.log('[BrainDumpNotificationBridge] syncLegacyBrainDumpNotification:', {
		phase: processing.phase,
		brainDumpId: currentBrainDumpId,
		hasActiveNotification: !!activeBrainDumpNotificationId,
		lastProcessedId: lastProcessedBrainDumpId
	});

	// Skip if no brain dump ID
	if (!currentBrainDumpId) {
		return;
	}

	// Create notification if processing just started and it's a new brain dump
	if (isProcessing && !activeBrainDumpNotificationId) {
		// Check if this is a new brain dump (not a page refresh)
		if (lastProcessedBrainDumpId !== currentBrainDumpId) {
			console.log(
				'[BrainDumpNotificationBridge] Creating notification for:',
				currentBrainDumpId
			);
			activeBrainDumpNotificationId = createBrainDumpNotification(state);
			lastProcessedBrainDumpId = currentBrainDumpId;

			// CRITICAL: Trigger API call to actually process the brain dump
			startProcessingAPICall(state);
		} else {
			console.log(
				'[BrainDumpNotificationBridge] Skipping duplicate notification for:',
				currentBrainDumpId
			);
		}
		return;
	}

	// Update existing notification
	if (activeBrainDumpNotificationId) {
		console.log(
			'[BrainDumpNotificationBridge] Updating existing notification:',
			activeBrainDumpNotificationId
		);
		updateBrainDumpNotification(activeBrainDumpNotificationId, state);
	}

	// Clear tracking when processing completes
	if (processing.phase === 'idle' && activeBrainDumpNotificationId) {
		console.log('[BrainDumpNotificationBridge] Processing complete, will clear tracking in 5s');
		// Keep the notification but allow new ones to be created
		setTimeout(() => {
			if (activeBrainDumpNotificationId) {
				console.log(
					'[BrainDumpNotificationBridge] Clearing tracking for completed brain dump'
				);
				lastProcessedBrainDumpId = null;
			}
		}, 5000); // Clear after 5 seconds of idle
	}
}

/**
 * Create a new brain dump notification
 */
function createBrainDumpNotification(state: any): string {
	// Extract data based on state format
	let brainDumpId: string;
	let inputText: string;
	let selectedProject: any;
	let processingType: string;
	let streamingState: any;

	if (MULTI_BRAINDUMP_ENABLED) {
		// Multi-brain dump mode: state is SingleBrainDumpState
		brainDumpId = state.id;
		inputText = state.inputText;
		selectedProject = state.selectedProject;
		processingType = state.processing.type;
		streamingState = state.processing.streaming;
	} else {
		// Legacy mode: state is UnifiedBrainDumpState
		const { core, processing } = state;
		brainDumpId = core.currentBrainDumpId || processing.activeBrainDumpId;
		inputText = core.inputText;
		selectedProject = core.selectedProject;
		processingType = processing.type;
		streamingState = processing.streaming;
	}

	console.log('[BrainDumpNotificationBridge] Creating brain dump notification', {
		brainDumpId,
		processingType
	});

	const notification: Omit<BrainDumpNotification, 'id' | 'createdAt' | 'updatedAt'> = {
		type: 'brain-dump',
		status: 'processing',
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null, // Manual close only
		data: {
			brainDumpId,
			inputText,
			selectedProject,
			processingType: processingType as 'dual' | 'background',
			streamingState: streamingState || undefined,
			parseResults: undefined,
			executionResult: undefined
		},
		progress: {
			type: 'streaming',
			message: 'Starting brain dump processing...'
		},
		actions: buildBrainDumpNotificationActions(brainDumpId)
	};

	const notificationId = notificationStore.add(notification);
	console.log('[BrainDumpNotificationBridge] Notification created with ID:', notificationId);

	// Verify it was actually added
	setTimeout(() => {
		const currentStore = get(notificationStore);
		const exists = currentStore.notifications.has(notificationId);
		console.log(
			'[BrainDumpNotificationBridge] Notification exists in store after 100ms:',
			exists
		);
		if (!exists) {
			console.error(
				'[BrainDumpNotificationBridge] CRITICAL: Notification was removed from store!'
			);
		}
	}, 100);

	return notificationId;
}

/**
 * Update an existing brain dump notification
 */
function updateBrainDumpNotification(notificationId: string, state: any) {
	// First verify notification still exists
	const currentStore = get(notificationStore);
	if (!currentStore.notifications.has(notificationId)) {
		console.warn(
			'[BrainDumpNotificationBridge] Cannot update - notification not found in store:',
			notificationId,
			'(likely dismissed by user)'
		);

		// Notification was deleted, clear our tracking
		if (MULTI_BRAINDUMP_ENABLED && state.id) {
			// Multi-mode: Remove from multi-brain dump tracking
			const brainDumpId = state.id;
			activeBrainDumpNotifications.delete(brainDumpId);
			lastProcessedTimestamps.delete(brainDumpId);
			lastSyncedBrainDumpStates.delete(brainDumpId);
			console.log(
				'[BrainDumpNotificationBridge] Cleared tracking for dismissed brain dump:',
				brainDumpId
			);
		} else {
			// Legacy mode
			activeBrainDumpNotificationId = null;
		}
		return;
	}

	// Extract data based on state format
	let brainDumpId: string;
	let inputText: string;
	let selectedProject: any;
	let processingType: string;
	let streamingState: any;
	let parseResults: any;
	let processingPhase: string;
	let processingError: string | null;

	if (MULTI_BRAINDUMP_ENABLED && state.id) {
		// Multi-brain dump mode: state is SingleBrainDumpState
		brainDumpId = state.id;
		inputText = state.inputText;
		selectedProject = state.selectedProject;
		processingType = state.processing.type;
		streamingState = state.processing.streaming || undefined;
		parseResults = state.parseResults || undefined;
		processingPhase = state.processing.phase;
		processingError = state.results.errors.processing;
	} else {
		// Legacy mode: state is UnifiedBrainDumpState
		const { core, processing, results } = state;
		brainDumpId = core.currentBrainDumpId || processing.activeBrainDumpId;
		inputText = core.inputText;
		selectedProject = core.selectedProject;
		processingType = processing.type;
		streamingState = processing.streaming || undefined;
		parseResults = core.parseResults || undefined;
		processingPhase = processing.phase;
		processingError = results.errors.processing;
	}

	// Determine current status
	let status: BrainDumpNotification['status'] = 'processing';
	if (processingError) {
		status = 'error';
	} else if (processingPhase === 'idle' && parseResults) {
		status = 'success';
	}

	const existingNotification = currentStore.notifications.get(notificationId) as
		| BrainDumpNotification
		| undefined;

	const executionResult =
		parseResults?.executionResult ?? existingNotification?.data.executionResult ?? undefined;

	// Update notification
	notificationStore.update(notificationId, {
		status,
		data: {
			brainDumpId,
			inputText,
			selectedProject,
			processingType: processingType as 'dual' | 'background',
			streamingState,
			parseResults,
			executionResult
		},
		progress: {
			type: 'streaming',
			message: getProgressMessage(state)
		}
	});
}

/**
 * Get progress message based on state
 */
function getProgressMessage(state: any): string {
	// Extract data based on state format
	let processingError: string | null;
	let streaming: any;
	let processingType: string;

	if (MULTI_BRAINDUMP_ENABLED && state.id) {
		// Multi-brain dump mode: state is SingleBrainDumpState
		processingError = state.results.errors.processing;
		streaming = state.processing.streaming;
		processingType = state.processing.type;
	} else {
		// Legacy mode: state is UnifiedBrainDumpState
		const { processing, results } = state;
		processingError = results.errors.processing;
		streaming = processing.streaming;
		processingType = processing.type;
	}

	if (processingError) {
		return processingError;
	}

	if (streaming) {
		const { contextStatus, tasksStatus, contextProgress, tasksProgress } = streaming;

		if (contextStatus === 'completed' && tasksStatus === 'completed') {
			return 'Finalizing results...';
		}

		if (contextStatus === 'completed') {
			return tasksProgress || 'Extracting tasks...';
		}

		if (contextProgress) {
			return contextProgress;
		}

		if (tasksProgress) {
			return tasksProgress;
		}
	}

	if (processingType === 'background') {
		return 'Processing in background...';
	}

	return 'Analyzing content...';
}

/**
 * Handle streaming updates for a specific brain dump (multi-brain dump mode)
 */
function handleBrainDumpStreamUpdateForId(brainDumpId: string, status: StreamingMessage) {
	console.log('[BrainDumpNotificationBridge] handleStreamUpdateForId:', {
		brainDumpId,
		type: status.type,
		message: (status as any).message,
		hasData: !!(status as any).data
	});

	// Route streaming updates to the correct brain dump
	if (status.type === 'contextProgress' && 'data' in status) {
		if (status.data.status === 'completed' && status.data.preview) {
			console.log(
				'[BrainDumpNotificationBridge] Context completed with preview for:',
				brainDumpId
			);
			brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
				contextStatus: 'completed',
				contextProgress: status.message,
				contextResult: status.data.preview
			});
		} else {
			console.log('[BrainDumpNotificationBridge] Context processing for:', brainDumpId);
			brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
				contextStatus: 'processing',
				contextProgress: status.message
			});
		}
	} else if (status.type === 'tasksProgress' && 'data' in status) {
		if (status.data.status === 'completed' && status.data.preview) {
			console.log(
				'[BrainDumpNotificationBridge] Tasks completed with preview for:',
				brainDumpId
			);
			brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
				tasksStatus: 'completed',
				tasksProgress: status.message,
				tasksResult: status.data.preview
			});
		} else {
			console.log('[BrainDumpNotificationBridge] Tasks processing for:', brainDumpId);
			brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
				tasksStatus: 'processing',
				tasksProgress: status.message
			});
		}
	} else if (status.type === 'complete' && 'result' in status) {
		console.log('[BrainDumpNotificationBridge] Processing complete for:', brainDumpId);
		brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
			contextStatus: 'completed',
			tasksStatus: 'completed'
		});
	} else if (status.type === 'error' && 'error' in status) {
		brainDumpV2Store.updateBrainDumpStreamingState(brainDumpId, {
			contextStatus:
				'context' in status && status.context === 'context' ? 'error' : undefined,
			tasksStatus: 'context' in status && status.context === 'tasks' ? 'error' : undefined
		});
		brainDumpV2Store.setBrainDumpError(brainDumpId, status.message || 'Processing failed');
	}
}

/**
 * Handle streaming updates - updates store streaming state (legacy mode)
 */
export function handleBrainDumpStreamUpdate(status: StreamingMessage) {
	console.log('[BrainDumpNotificationBridge] handleStreamUpdate:', {
		type: status.type,
		message: (status as any).message,
		hasData: !!(status as any).data
	});

	// CRITICAL: Update the store's streaming state (not just the notification message!)
	// This is what the old BrainDumpProcessingNotification component did
	if (status.type === 'contextProgress' && 'data' in status) {
		// Check if this is a completion event with preview data
		if (status.data.status === 'completed' && status.data.preview) {
			console.log('[BrainDumpNotificationBridge] Context completed with preview');
			brainDumpV2Store.updateStreamingState({
				contextStatus: 'completed',
				contextProgress: status.message,
				contextResult: status.data.preview
			});
		} else {
			console.log('[BrainDumpNotificationBridge] Context processing:', status.message);
			brainDumpV2Store.updateStreamingState({
				contextStatus: 'processing',
				contextProgress: status.message
			});
		}
	} else if (status.type === 'tasksProgress' && 'data' in status) {
		// Check if this is a completion event with preview data
		if (status.data.status === 'completed' && status.data.preview) {
			console.log('[BrainDumpNotificationBridge] Tasks completed with preview');
			brainDumpV2Store.updateStreamingState({
				tasksStatus: 'completed',
				tasksProgress: status.message,
				tasksResult: status.data.preview
			});
		} else {
			console.log('[BrainDumpNotificationBridge] Tasks processing:', status.message);
			brainDumpV2Store.updateStreamingState({
				tasksStatus: 'processing',
				tasksProgress: status.message
			});
		}
	} else if (status.type === 'complete' && 'result' in status) {
		// Final completion
		console.log('[BrainDumpNotificationBridge] Processing complete');
		brainDumpV2Store.updateStreamingState({
			contextStatus: 'completed',
			tasksStatus: 'completed'
		});
	} else if (status.type === 'error' && 'error' in status) {
		brainDumpV2Store.updateStreamingState({
			contextStatus:
				'context' in status && status.context === 'context' ? 'error' : undefined,
			tasksStatus: 'context' in status && status.context === 'tasks' ? 'error' : undefined
		});
		brainDumpV2Store.setProcessingError(status.message || 'Processing failed');
	}

	// The bridge subscription will detect the store change and update the notification automatically
}

/**
 * Get message from stream update
 */
function getStreamUpdateMessage(status: StreamingMessage): string | null {
	switch (status.type) {
		case 'contextProgress':
			return status.message || 'Analyzing context...';
		case 'tasksProgress':
			return status.message || 'Extracting tasks...';
		case 'complete':
			return 'Brain dump processed successfully';
		case 'error':
			return status.message || 'Processing failed';
		default:
			return null;
	}
}

/**
 * Mark brain dump notification as complete (success or error)
 */
export function completeBrainDumpNotification(success: boolean, message?: string) {
	if (!activeBrainDumpNotificationId) return;

	notificationStore.setStatus(activeBrainDumpNotificationId, success ? 'success' : 'error');

	if (message) {
		notificationStore.setProgress(activeBrainDumpNotificationId, {
			type: 'streaming',
			message
		});
	}

	// Clear active notification ID after a delay
	setTimeout(() => {
		activeBrainDumpNotificationId = null;
	}, 1000);
}

/**
 * Start processing API call - triggers the brain dump streaming endpoint
 * Supports both legacy (UnifiedBrainDumpState) and multi-brain dump (SingleBrainDumpState) modes
 */
async function startProcessingAPICall(state: any) {
	// Extract data based on state format
	let brainDumpId: string;
	let inputText: string;
	let selectedProject: any;
	let displayedQuestions: any[];
	let processingType: string;
	let autoAcceptEnabled: boolean;

	if (MULTI_BRAINDUMP_ENABLED) {
		// Multi-brain dump mode: state is SingleBrainDumpState
		brainDumpId = state.id;
		inputText = state.inputText;
		selectedProject = state.selectedProject;
		displayedQuestions = state.displayedQuestions || [];
		processingType = state.processing.type;
		autoAcceptEnabled = state.processing.autoAcceptEnabled || false;
	} else {
		// Legacy mode: state is UnifiedBrainDumpState
		const { core, processing } = state;
		brainDumpId = core.currentBrainDumpId || processing.activeBrainDumpId;
		inputText = core.inputText;
		selectedProject = core.selectedProject;
		displayedQuestions = core.displayedQuestions || [];
		processingType = processing.type;
		autoAcceptEnabled = processing.autoAcceptEnabled || false;
	}

	if (!inputText || !brainDumpId) {
		console.error('[BrainDumpNotificationBridge] Missing required data for API call:', {
			hasInputText: !!inputText,
			brainDumpId
		});
		return;
	}

	const selectedProjectId = selectedProject?.id === 'new' ? null : selectedProject?.id;

	console.log('[BrainDumpNotificationBridge] Starting API call:', {
		processingType,
		brainDumpId,
		selectedProjectId,
		inputLength: inputText.length,
		multiMode: MULTI_BRAINDUMP_ENABLED
	});

	// Create abort controller for this brain dump
	const controller = new AbortController();
	if (MULTI_BRAINDUMP_ENABLED) {
		activeAPIStreams.set(brainDumpId, controller);
	}

	try {
		// Always use the full stream endpoint - preparatory analysis will optimize processing
		console.log('[BrainDumpNotificationBridge] Calling /stream');
		await brainDumpService.parseBrainDumpWithStream(
			inputText,
			selectedProjectId,
			brainDumpId,
			displayedQuestions,
			{
				autoAccept: autoAcceptEnabled,
				onProgress: (status: StreamingMessage) => {
					// Update store with streaming state (route to correct brain dump in multi mode)
					if (MULTI_BRAINDUMP_ENABLED) {
						handleBrainDumpStreamUpdateForId(brainDumpId, status);
					} else {
						handleBrainDumpStreamUpdate(status);
					}

					// If complete, commit parse results
					if (status.type === 'complete' && status.result) {
						if (MULTI_BRAINDUMP_ENABLED) {
							brainDumpV2Store.updateBrainDumpParseResults(
								brainDumpId,
								status.result
							);
						} else {
							brainDumpV2Store.setParseResults(status.result);
						}
					}
				},
				onComplete: (result: any) => {
					console.log('[BrainDumpNotificationBridge] Processing complete:', {
						brainDumpId,
						hasOperations: !!result?.operations,
						operationsCount: result?.operations?.length,
						hasExecutionResult: !!result?.executionResult
					});

					if (result && result.operations) {
						if (MULTI_BRAINDUMP_ENABLED) {
							brainDumpV2Store.updateBrainDumpParseResults(brainDumpId, result);

							// Option 1: Clear input on auto-accept success
							// If auto-accept succeeded, complete the brain dump to clear input
							if (result.executionResult) {
								console.log(
									'[BrainDumpNotificationBridge] Auto-accept completed, clearing brain dump:',
									brainDumpId
								);
								// Small delay to allow success view to render
								setTimeout(() => {
									brainDumpV2Store.completeBrainDump(brainDumpId);
								}, 500);
							}
						} else {
							brainDumpV2Store.setParseResults(result);
						}
					}
				},
				onError: (error: string) => {
					console.error(
						'[BrainDumpNotificationBridge] Processing error:',
						brainDumpId,
						error
					);
					if (MULTI_BRAINDUMP_ENABLED) {
						brainDumpV2Store.setBrainDumpError(brainDumpId, error);
					} else {
						brainDumpV2Store.setProcessingError(error);
					}
				}
			}
		);
	} catch (error) {
		console.error('[BrainDumpNotificationBridge] API call failed:', brainDumpId, error);
		if (MULTI_BRAINDUMP_ENABLED) {
			brainDumpV2Store.setBrainDumpError(
				brainDumpId,
				error instanceof Error ? error.message : 'Processing failed'
			);
		} else {
			brainDumpV2Store.setProcessingError(
				error instanceof Error ? error.message : 'Processing failed'
			);
		}
	} finally {
		// Clean up abort controller
		if (MULTI_BRAINDUMP_ENABLED) {
			activeAPIStreams.delete(brainDumpId);
		}
	}
}

/**
 * Get the current active brain dump notification ID
 */
export function getActiveBrainDumpNotificationId(): string | null {
	return activeBrainDumpNotificationId;
}

/**
 * Clear the active brain dump notification
 */
export function clearActiveBrainDumpNotification() {
	if (activeBrainDumpNotificationId) {
		notificationStore.remove(activeBrainDumpNotificationId);
		activeBrainDumpNotificationId = null;
	}
}

/**
 * Cancel API stream for a specific brain dump (multi-brain dump mode)
 */
export function cancelBrainDumpAPIStream(brainDumpId: string) {
	if (!MULTI_BRAINDUMP_ENABLED) {
		console.warn(
			'[BrainDumpNotificationBridge] cancelBrainDumpAPIStream called but multi-mode disabled'
		);
		return;
	}

	const controller = activeAPIStreams.get(brainDumpId);
	if (controller) {
		console.log('[BrainDumpNotificationBridge] Cancelling API stream for:', brainDumpId);
		controller.abort();
		activeAPIStreams.delete(brainDumpId);
	}
}

/**
 * Emergency reset function to clear ALL brain dump state across all layers
 *
 * Use this when the system gets into a "weird state" and normal cleanup doesn't work.
 * This clears:
 * - All background service jobs
 * - All brain dump store state
 * - All active API streams
 * - All notification bridge tracking
 *
 * @example
 * // Call from browser console if stuck:
 * // window.__resetAllBrainDumps()
 */
export function forceResetAllBrainDumpState(): void {
	console.warn('[BrainDumpNotificationBridge] EMERGENCY RESET: Clearing all brain dump state');

	// 1. Clear all background service jobs
	backgroundBrainDumpService.clearFailedJobs();
	backgroundBrainDumpService.clearCompletedJobs();

	// Also clear all active jobs (processing)
	const allJobs = backgroundBrainDumpService.getAllJobs();
	allJobs.forEach((job) => {
		backgroundBrainDumpService.clearJob(job.id);
	});

	// 2. Cancel all active API streams
	for (const controller of activeAPIStreams.values()) {
		controller.abort();
	}
	activeAPIStreams.clear();

	// 3. Clear all notification bridge tracking
	activeBrainDumpNotifications.clear();
	lastProcessedTimestamps.clear();
	lastSyncedBrainDumpStates.clear();

	// 4. Reset brain dump store
	brainDumpV2Store.reset();

	// 5. Clear all brain dump notifications from notification store
	const currentNotifications = get(notificationStore);
	for (const [id, notification] of currentNotifications.notifications.entries()) {
		if (notification.type === 'brain-dump') {
			notificationStore.remove(id);
		}
	}

	console.log(
		'[BrainDumpNotificationBridge] Emergency reset complete - all brain dump state cleared'
	);
}

// Export to global scope for emergency use
if (typeof window !== 'undefined') {
	(window as any).__resetAllBrainDumps = forceResetAllBrainDumpState;
	console.log(
		'[BrainDumpNotificationBridge] Emergency reset function available as window.__resetAllBrainDumps()'
	);
}
