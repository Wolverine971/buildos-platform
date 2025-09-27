// src/lib/stores/brainDumpProcessing.store.ts
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { BrainDumpParseResult, DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';

interface ProcessingNotificationState {
	isOpen: boolean;
	isMinimized: boolean;
	brainDumpId: string | null;
	parseResults: BrainDumpParseResult | null;
	processingType: 'dual' | 'single' | 'short' | 'background';
	processingPhase: 'parsing' | 'parsed' | 'idle';
	jobId: string | null;
	autoAcceptEnabled: boolean;
	error: string | null;
	// Additional data needed for processing
	inputText?: string;
	selectedProject?: any;
	displayedQuestions?: DisplayedBrainDumpQuestion[];
	// Streaming state for dual processing
	streamingState?: {
		contextStatus: 'pending' | 'processing' | 'completed' | 'error';
		tasksStatus: 'pending' | 'processing' | 'completed' | 'error';
		contextResult: any;
		tasksResult: any;
		contextProgress?: string;
		tasksProgress?: string;
	};
}

const initialState: ProcessingNotificationState = {
	isOpen: false,
	isMinimized: false,
	brainDumpId: null,
	parseResults: null,
	processingType: 'single',
	processingPhase: 'idle',
	jobId: null,
	autoAcceptEnabled: false,
	error: null
};

// Session storage key for persistence
const STORAGE_KEY = 'brain-dump-processing-state';

// Load initial state from session storage if available
function loadInitialState(): ProcessingNotificationState {
	if (!browser) return initialState;

	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Validate the structure
			if (typeof parsed === 'object' && parsed !== null) {
				return { ...initialState, ...parsed };
			}
		}
	} catch (error) {
		console.warn('Failed to load brain dump processing state from session storage:', error);
	}

	return initialState;
}

// Create the store with initial state
export const processingNotificationStore =
	writable<ProcessingNotificationState>(loadInitialState());

// Persist state changes to session storage
if (browser) {
	processingNotificationStore.subscribe((state) => {
		try {
			// Only persist if there's active processing or parse results
			if (state.isOpen || state.parseResults || state.jobId) {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} else {
				// Clear storage when completely idle
				sessionStorage.removeItem(STORAGE_KEY);
			}
		} catch (error) {
			console.warn('Failed to persist brain dump processing state:', error);
		}
	});
}

// Actions for the store
export const processingNotificationActions = {
	/**
	 * Show the processing notification
	 */
	show: (config: Partial<ProcessingNotificationState>) => {
		processingNotificationStore.update((state) => ({
			...state,
			...config,
			isOpen: true,
			error: null
		}));
	},

	/**
	 * Hide the processing notification completely
	 */
	hide: () => {
		processingNotificationStore.update((state) => ({
			...state,
			isOpen: false
		}));
	},

	/**
	 * Minimize the notification to collapsed state
	 */
	minimize: () => {
		processingNotificationStore.update((state) => ({
			...state,
			isMinimized: true
		}));
	},

	/**
	 * Expand the notification to full modal
	 */
	expand: () => {
		processingNotificationStore.update((state) => ({
			...state,
			isMinimized: false
		}));
	},

	/**
	 * Toggle between minimized and expanded states
	 */
	toggleMinimized: () => {
		processingNotificationStore.update((state) => ({
			...state,
			isMinimized: !state.isMinimized
		}));
	},

	/**
	 * Start processing phase
	 */
	startProcessing: (config: {
		brainDumpId: string;
		processingType: 'dual' | 'single' | 'short' | 'background';
		jobId?: string;
		autoAcceptEnabled?: boolean;
		inputText?: string;
		selectedProject?: any;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
	}) => {
		processingNotificationStore.update((state) => ({
			...state,
			...config,
			isOpen: true,
			isMinimized: true, // Start minimized so user isn't interrupted
			processingPhase: 'parsing',
			parseResults: null,
			error: null
		}));
	},

	/**
	 * Set parse results when processing completes
	 */
	setParseResults: (parseResults: BrainDumpParseResult) => {
		processingNotificationStore.update((state) => ({
			...state,
			parseResults,
			processingPhase: 'parsed',
			error: null
		}));
	},

	/**
	 * Update processing phase
	 */
	setProcessingPhase: (phase: 'parsing' | 'parsed' | 'idle') => {
		processingNotificationStore.update((state) => ({
			...state,
			processingPhase: phase
		}));
	},

	/**
	 * Set error state
	 */
	setError: (error: string) => {
		processingNotificationStore.update((state) => ({
			...state,
			error,
			processingPhase: 'idle'
		}));
	},

	/**
	 * Update auto-accept setting
	 */
	setAutoAccept: (enabled: boolean) => {
		processingNotificationStore.update((state) => ({
			...state,
			autoAcceptEnabled: enabled
		}));
	},

	/**
	 * Update job ID for background processing
	 */
	setJobId: (jobId: string | null) => {
		processingNotificationStore.update((state) => ({
			...state,
			jobId
		}));
	},

	/**
	 * Reset to initial state
	 */
	reset: () => {
		processingNotificationStore.set(initialState);
		if (browser) {
			sessionStorage.removeItem(STORAGE_KEY);
		}
	},

	/**
	 * Complete processing and transition to idle
	 */
	complete: () => {
		processingNotificationStore.update((state) => ({
			...state,
			processingPhase: 'idle',
			jobId: null,
			error: null
		}));
	},

	/**
	 * Update streaming state for dual processing
	 */
	updateStreamingState: (
		streamUpdate: Partial<ProcessingNotificationState['streamingState']>
	) => {
		processingNotificationStore.update((state) => ({
			...state,
			streamingState: {
				...state.streamingState,
				contextStatus:
					streamUpdate.contextStatus ?? state.streamingState?.contextStatus ?? 'pending',
				tasksStatus:
					streamUpdate.tasksStatus ?? state.streamingState?.tasksStatus ?? 'pending',
				contextResult: streamUpdate.contextResult ?? state.streamingState?.contextResult,
				tasksResult: streamUpdate.tasksResult ?? state.streamingState?.tasksResult,
				contextProgress:
					streamUpdate.contextProgress ?? state.streamingState?.contextProgress,
				tasksProgress: streamUpdate.tasksProgress ?? state.streamingState?.tasksProgress
			}
		}));
	},

	/**
	 * Reset streaming state
	 */
	resetStreamingState: () => {
		processingNotificationStore.update((state) => ({
			...state,
			streamingState: undefined
		}));
	},

	/**
	 * Clear parse results (e.g., after operations are applied)
	 */
	clearParseResults: () => {
		processingNotificationStore.update((state) => ({
			...state,
			parseResults: null,
			processingPhase: 'idle'
		}));
	}
};

// Derived stores for common use cases
export const isProcessingVisible = derived(processingNotificationStore, ($store) => $store.isOpen);

export const isProcessingMinimized = derived(
	processingNotificationStore,
	($store) => $store.isMinimized
);

export const isProcessingActive = derived(
	processingNotificationStore,
	($store) => $store.processingPhase === 'parsing'
);

export const hasParseResults = derived(
	processingNotificationStore,
	($store) => $store.parseResults !== null && $store.processingPhase === 'parsed'
);

export const processingStatus = derived(processingNotificationStore, ($store) => {
	if ($store.error) {
		return {
			type: 'error' as const,
			message: $store.error,
			canRetry: true
		};
	}

	if ($store.processingPhase === 'parsing') {
		return {
			type: 'processing' as const,
			message: 'Processing brain dump...',
			canRetry: false
		};
	}

	if ($store.processingPhase === 'parsed' && $store.parseResults) {
		return {
			type: 'completed' as const,
			message: `${$store.parseResults.operations.length} operations ready`,
			canRetry: false
		};
	}

	return {
		type: 'idle' as const,
		message: '',
		canRetry: false
	};
});

// Helper function to check if auto-accept is safe for current results
export const canAutoAccept = derived(processingNotificationStore, ($store) => {
	if (!$store.parseResults) return false;

	return (
		$store.parseResults.operations.length <= 20 &&
		$store.parseResults.operations.every((op) => !op.error) &&
		$store.autoAcceptEnabled
	);
});

// Export the store for direct access
export default processingNotificationStore;
