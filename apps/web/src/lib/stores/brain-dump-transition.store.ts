// src/lib/stores/brain-dump-transition.store.ts
/**
 * Transition layer for migrating from dual stores to unified store
 * This maintains backward compatibility during migration
 */

import { brainDumpV2Store } from './brain-dump-v2.store';
import { brainDumpStore as oldBrainDumpStore } from './brain-dump.store';
import { processingNotificationActions as oldProcessingActions } from './brainDumpProcessing.store';
import type {
	BrainDumpParseResult,
	ParsedOperation,
	DisplayedBrainDumpQuestion
} from '$lib/types/brain-dump';

// Feature flag to enable/disable new store usage
const USE_NEW_STORE = true; // Set to false to revert to old behavior

/**
 * Helper function for atomic store updates across multiple stores
 * Ensures no component can read intermediate state during multi-store updates
 */
function atomicStoreUpdate(updateFunctions: Array<() => void>) {
	try {
		// Execute all updates synchronously
		updateFunctions.forEach((update) => update());
	} catch (error) {
		console.error('Atomic store update failed:', error);
		throw error;
	}
}

/**
 * Transition actions that update both old and new stores
 * These will be the primary interface during migration
 */
export const brainDumpActions = {
	// ===== Modal & UI Actions =====
	openModal: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.openModal();
		}
		// Always update old store for compatibility
		oldBrainDumpStore.setView('project-selection');
	},

	closeModal: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.closeModal();
		}
		// Old store doesn't have explicit modal open/close
	},

	setView: (view: 'project-selection' | 'recording' | 'success') => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setModalView(view);
		}
		oldBrainDumpStore.setView(view);
	},

	// ===== Project Selection =====
	selectProject: (project: any) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.selectProject(project);
		}
		oldBrainDumpStore.selectProject(project);
	},

	// ===== Text Management =====
	updateText: (text: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.updateInputText(text);
		}
		oldBrainDumpStore.updateText(text);
	},

	setSavedContent: (content: string, brainDumpId?: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setSavedContent(content, brainDumpId);
		}
		oldBrainDumpStore.updateSavedContent(content, brainDumpId);
	},

	// ===== Parse Results - CRITICAL SYNCHRONIZATION POINT =====
	// FIXED: Atomic update to prevent race conditions
	setParseResults: (results: BrainDumpParseResult | null) => {
		// Use Promise.all to ensure atomic updates across all stores
		const updates = [];

		// Prepare all updates
		if (USE_NEW_STORE) {
			updates.push(() => brainDumpV2Store.setParseResults(results));
		}
		updates.push(() => oldBrainDumpStore.setParseResults(results));
		if (results) {
			updates.push(() => oldProcessingActions.setParseResults(results));
		} else {
			updates.push(() => oldProcessingActions.clearParseResults());
		}

		// Execute all updates synchronously in sequence
		// This ensures no component can read intermediate state
		try {
			updates.forEach((update) => update());
		} catch (error) {
			console.error('Failed to atomically update parse results:', error);
			// Attempt rollback by clearing all stores
			try {
				if (USE_NEW_STORE) {
					brainDumpV2Store.clearParseResults();
				}
				oldBrainDumpStore.clearParseResults();
				oldProcessingActions.clearParseResults();
			} catch (rollbackError) {
				console.error('Failed to rollback after error:', rollbackError);
			}
			throw error;
		}
	},

	clearParseResults: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.clearParseResults();
		}
		oldBrainDumpStore.clearParseResults();
		oldProcessingActions.clearParseResults();
	},

	// ===== Operations Management =====
	toggleOperation: (operationId: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.toggleOperation(operationId);
		}
		oldBrainDumpStore.toggleOperation(operationId);
	},

	updateOperation: (operation: ParsedOperation) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.updateOperation(operation);
		}
		oldBrainDumpStore.updateOperation(operation);
	},

	removeOperation: (operationId: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.removeOperation(operationId);
		}
		oldBrainDumpStore.removeOperation(operationId);
	},

	// ===== Processing State Management =====
	startProcessing: async (config: {
		brainDumpId: string;
		type: 'dual' | 'single' | 'short' | 'background';
		jobId?: string;
		autoAcceptEnabled?: boolean;
		inputText?: string;
		selectedProject?: any;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
	}) => {
		// Start processing in new store with mutex
		if (USE_NEW_STORE) {
			const canProceed = await brainDumpV2Store.startProcessing({
				type: config.type,
				brainDumpId: config.brainDumpId,
				jobId: config.jobId,
				autoAcceptEnabled: config.autoAcceptEnabled,
				inputText: config.inputText,
				selectedProject: config.selectedProject,
				displayedQuestions: config.displayedQuestions
			});

			if (!canProceed) {
				console.warn('Processing blocked by mutex in unified store');
				return false;
			}
		}

		// Update old stores for compatibility
		oldBrainDumpStore.setPhase('parsing');
		oldProcessingActions.startProcessing({
			brainDumpId: config.brainDumpId,
			processingType: config.type,
			jobId: config.jobId,
			autoAcceptEnabled: config.autoAcceptEnabled,
			inputText: config.inputText,
			selectedProject: config.selectedProject,
			displayedQuestions: config.displayedQuestions
		});

		return true;
	},

	completeProcessing: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.completeProcessing();
		}
		oldBrainDumpStore.setPhase('idle');
		oldProcessingActions.complete();
	},

	setProcessingPhase: (phase: 'idle' | 'transcribing' | 'parsing' | 'saving' | 'applying') => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setProcessingPhase(phase);
		}

		// Map to old store phases
		const oldPhase = phase === 'applying' ? 'saving' : phase;
		oldBrainDumpStore.setPhase(oldPhase as any);

		// Map to processing notification phases
		if (phase === 'parsing') {
			oldProcessingActions.setProcessingPhase('parsing');
		} else if (phase === 'idle') {
			oldProcessingActions.setProcessingPhase('idle');
		}
	},

	// ===== Modal Handoff =====
	startModalHandoff: async () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.startModalHandoff();
		}
		// Old stores don't have explicit handoff state
	},

	completeModalHandoff: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.completeModalHandoff();
		}
		// Show processing notification
		oldProcessingActions.show({ isMinimized: true });
	},

	// ===== Processing Notification Actions =====
	showNotification: (config?: { minimized?: boolean }) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.openNotification(config?.minimized);
		}
		oldProcessingActions.show({ isMinimized: config?.minimized });
	},

	hideNotification: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.closeNotification();
		}
		oldProcessingActions.hide();
	},

	toggleNotificationMinimized: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.toggleNotificationMinimized();
		}
		oldProcessingActions.toggleMinimized();
	},

	// ===== Streaming State (Dual Processing) =====
	updateStreamingState: (streaming: any) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.updateStreamingState(streaming);
		}
		oldProcessingActions.updateStreamingState(streaming);
	},

	resetStreamingState: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.resetStreamingState();
		}
		oldProcessingActions.resetStreamingState();
	},

	// ===== Voice Recording =====
	setVoiceError: (error: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setVoiceError(error);
		}
		oldBrainDumpStore.setVoiceError(error);
	},

	setMicrophonePermission: (granted: boolean) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setMicrophonePermission(granted);
		}
		oldBrainDumpStore.setMicrophonePermission(granted);
	},

	setVoiceCapabilities: (capabilities: {
		capabilitiesChecked?: boolean;
		canUseLiveTranscript?: boolean;
		isInitializingRecording?: boolean;
	}) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setVoiceCapabilities(capabilities);
		}

		// Map to old store methods
		if (capabilities.capabilitiesChecked !== undefined) {
			oldBrainDumpStore.setVoiceCapabilitiesChecked(capabilities.capabilitiesChecked);
		}
		if (capabilities.canUseLiveTranscript !== undefined) {
			oldBrainDumpStore.setCanUseLiveTranscript(capabilities.canUseLiveTranscript);
		}
		if (capabilities.isInitializingRecording !== undefined) {
			oldBrainDumpStore.setInitializingRecording(capabilities.isInitializingRecording);
		}
	},

	// ===== Success & Error Handling =====
	setSuccessData: (data: any) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setSuccessData(data);
		}
		oldBrainDumpStore.setSuccessData(data);
	},

	setOperationErrors: (
		errors: Array<{
			operationId?: string;
			table: string;
			operation: string;
			error: string;
		}>
	) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setOperationErrors(errors);
		}
		oldBrainDumpStore.setOperationErrors(errors);
	},

	setProcessingError: (error: string) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setProcessingError(error);
		}
		oldProcessingActions.setError(error);
	},

	setExecutionSummary: (summary: { successful: number; failed: number; details?: any }) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setExecutionSummary(summary);
		}
		oldBrainDumpStore.setExecutionSummary(summary);
	},

	clearErrors: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.clearErrors();
		}
		oldBrainDumpStore.clearErrors();
	},

	// ===== Auto-Accept =====
	setAutoAccept: (enabled: boolean) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setAutoAccept(enabled);
		}
		oldProcessingActions.setAutoAccept(enabled);
	},

	// ===== Reset Actions =====
	reset: () => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.reset();
		}
		oldBrainDumpStore.resetForm();
		oldProcessingActions.reset();
	},

	resetForSuccess: () => {
		if (USE_NEW_STORE) {
			// New store handles this differently
			brainDumpV2Store.setModalView('success');
		}
		oldBrainDumpStore.resetForSuccess();
	},

	// ===== Component Loading State =====
	setComponentLoading: (component: string, loading: boolean) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setComponentLoading(component, loading);
		}
		// Old stores don't track component loading
	},

	setComponentLoaded: (component: string, loaded: boolean) => {
		if (USE_NEW_STORE) {
			brainDumpV2Store.setComponentLoaded(component, loaded);
		}
		// Old stores don't track component loading
	}
};

/**
 * Helper function to check if we should use the new store
 */
export function isUsingNewStore(): boolean {
	return USE_NEW_STORE;
}

/**
 * Migration helper to switch between stores gradually
 * Can be controlled via environment variables or feature flags
 */
export function setUseNewStore(useNew: boolean) {
	// This would typically be set via environment or feature flag
	// For now, it's hardcoded to true
	console.log(`Brain dump store migration: ${useNew ? 'NEW' : 'OLD'} store active`);
}

// Export the unified store for components that are fully migrated
export { brainDumpV2Store } from './brain-dump-v2.store';

// Export derived stores from the new unified store
export {
	selectedProjectName,
	hasUnsavedChanges,
	canParse,
	canApply,
	enabledOperationsCount,
	disabledOperationsCount,
	hasOperationErrors,
	hasCriticalErrors,
	operationErrorSummary,
	isProcessingActive,
	hasParseResults,
	canAutoAccept,
	isModalOpen,
	isNotificationOpen,
	isNotificationMinimized,
	processingStatus
} from './brain-dump-v2.store';

// Initialize transition layer
if (USE_NEW_STORE) {
	console.log('Brain dump unified store transition layer active - NEW store enabled');
} else {
	console.log('Brain dump unified store transition layer active - OLD stores enabled');
}
