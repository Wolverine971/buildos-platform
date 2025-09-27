// src/lib/stores/brain-dump.store.ts
import { writable, derived } from 'svelte/store';
import type { BrainDumpParseResult, ParsedOperation } from '$lib/types/brain-dump';

// Types
interface BrainDumpState {
	// View state
	currentView: 'project-selection' | 'recording' | 'success';

	// Core state
	inputText: string;
	selectedProject: any;
	currentPhase: 'idle' | 'transcribing' | 'parsing' | 'saving';
	isProcessing: boolean;

	// Auto-save state
	isSaving: boolean;
	lastSavedContent: string;
	currentBrainDumpId: string | null;

	// Voice state
	voiceError: string;
	microphonePermissionGranted: boolean;
	voiceCapabilitiesChecked: boolean;
	isInitializingRecording: boolean;
	canUseLiveTranscript: boolean;

	// Results state
	parseResults: BrainDumpParseResult | null;
	processingResults: any;
	disabledOperations: Set<string>;

	// Success state
	successData: {
		brainDumpId?: string;
		brainDumpType?: string;
		projectId?: string;
		projectName?: string;
		isNewProject?: boolean;
		operationsCount?: number;
		failedOperations?: number;
		operationErrors?: Array<{
			operationId?: string;
			table: string;
			operation: string;
			error: string;
		}>;
	};

	// UI state
	showingParseResults: boolean;
	textareaCollapsed: boolean;

	// FIXED: Add error tracking fields
	operationErrors: Array<{
		operationId?: string;
		table: string;
		operation: string;
		error: string;
		timestamp?: string;
	}>;
	hasPartialFailure: boolean;
	lastExecutionSummary?: {
		successful: number;
		failed: number;
		details?: any;
	};
}

// Initial state
const initialState: BrainDumpState = {
	currentView: 'project-selection',
	inputText: '',
	selectedProject: null,
	currentPhase: 'idle',
	isProcessing: false,
	isSaving: false,
	lastSavedContent: '',
	currentBrainDumpId: null,
	voiceError: '',
	microphonePermissionGranted: false,
	voiceCapabilitiesChecked: false,
	isInitializingRecording: false,
	canUseLiveTranscript: false,
	parseResults: null,
	processingResults: null,
	disabledOperations: new Set(),
	successData: {},
	showingParseResults: false,
	textareaCollapsed: false,
	operationErrors: [],
	hasPartialFailure: false,
	lastExecutionSummary: undefined
};

// Create the store
function createBrainDumpStore() {
	const { subscribe, set, update } = writable<BrainDumpState>(initialState);

	return {
		subscribe,

		// View navigation
		setView: (view: BrainDumpState['currentView']) =>
			update((state) => ({ ...state, currentView: view })),

		// Project selection
		selectProject: (project: any) =>
			update((state) => ({
				...state,
				selectedProject: project,
				currentView: 'recording'
			})),

		setInitializingRecording: (isRecording: boolean) =>
			update((state) => ({
				...state,
				isInitializingRecording: isRecording
			})),

		setCanUseLiveTranscript: (canUse: boolean) =>
			update((state) => ({
				...state,
				canUseLiveTranscript: canUse
			})),

		setVoiceCapabilitiesChecked: (canUse: boolean) =>
			update((state) => ({
				...state,
				voiceCapabilitiesChecked: canUse
			})),

		// Text management
		updateText: (text: string) => update((state) => ({ ...state, inputText: text })),

		// Phase management
		setPhase: (phase: BrainDumpState['currentPhase']) =>
			update((state) => ({ ...state, currentPhase: phase })),

		// Save state
		setSaving: (isSaving: boolean) => update((state) => ({ ...state, isSaving })),

		updateSavedContent: (content: string, brainDumpId?: string) =>
			update((state) => ({
				...state,
				lastSavedContent: content,
				currentBrainDumpId: brainDumpId || state.currentBrainDumpId
			})),

		// Voice state
		setVoiceError: (error: string) => update((state) => ({ ...state, voiceError: error })),

		setMicrophonePermission: (granted: boolean) =>
			update((state) => ({ ...state, microphonePermissionGranted: granted })),

		// Parse results
		setParseResults: (results: BrainDumpParseResult | null) =>
			update((state) => ({
				...state,
				parseResults: results,
				showingParseResults: !!results,
				textareaCollapsed: !!results,
				// Clear disabled operations when setting new results (all operations start enabled)
				disabledOperations: new Set()
			})),

		// Operations management
		toggleOperation: (operationId: string) =>
			update((state) => {
				const newDisabled = new Set(state.disabledOperations);
				if (newDisabled.has(operationId)) {
					newDisabled.delete(operationId);
				} else {
					newDisabled.add(operationId);
				}
				return { ...state, disabledOperations: newDisabled };
			}),

		updateOperation: (operation: ParsedOperation) =>
			update((state) => {
				if (!state.parseResults) return state;

				const operations = state.parseResults.operations.map((op) =>
					op.id === operation.id ? operation : op
				);

				return {
					...state,
					parseResults: { ...state.parseResults, operations }
				};
			}),

		removeOperation: (operationId: string) =>
			update((state) => {
				if (!state.parseResults) return state;

				const operations = state.parseResults.operations.filter(
					(op) => op.id !== operationId
				);

				return {
					...state,
					parseResults: { ...state.parseResults, operations }
				};
			}),

		setOperationErrors: (
			errors: Array<{ operationId: string; table: string; operation: string; error: string }>
		) =>
			update((state) => ({
				...state,
				operationErrors: errors.map((e) => ({
					...e,
					timestamp: new Date().toISOString()
				})),
				hasPartialFailure: errors.length > 0
			})),

		setExecutionSummary: (summary: { successful: number; failed: number; details?: any }) =>
			update((state) => ({
				...state,
				lastExecutionSummary: summary
			})),

		clearErrors: () =>
			update((state) => ({
				...state,
				operationErrors: [],
				hasPartialFailure: false,
				voiceError: ''
			})),

		// Success state
		setSuccessData: (data: BrainDumpState['successData']) =>
			update((state) => ({
				...state,
				successData: data,
				currentView: 'success',
				// Keep error info for success screen display
				hasPartialFailure:
					state.hasPartialFailure || (data.failedOperations && data.failedOperations > 0)
			})),

		// Reset functions
		resetForm: () => set(initialState),

		resetForSuccess: () =>
			update((state) => ({
				...initialState,
				currentView: 'success',
				successData: state.successData
			})),

		clearParseResults: () =>
			update((state) => ({
				...state,
				parseResults: null,
				showingParseResults: false,
				textareaCollapsed: false,
				processingResults: null,
				disabledOperations: new Set(),
				voiceError: ''
			})),

		setShowingParseResults: (showing: boolean) =>
			update((state) => ({
				...state,
				showingParseResults: showing
			}))
	};
}

// Create store instance
export const brainDumpStore = createBrainDumpStore();

// Derived stores for computed values
export const isNewProject = derived(
	brainDumpStore,
	($state) => !$state.selectedProject || $state.selectedProject.id === 'new'
);

export const selectedProjectName = derived(
	brainDumpStore,
	($state) => $state.selectedProject?.name || 'New Project/ Note'
);

export const hasUnsavedChanges = derived(
	brainDumpStore,
	($state) =>
		$state.inputText.trim() !== $state.lastSavedContent && $state.inputText.trim().length > 0
);

export const canParse = derived(
	brainDumpStore,
	($state) =>
		$state.inputText.trim().length > 0 &&
		$state.currentPhase === 'idle' &&
		!$state.isProcessing &&
		!$state.parseResults
);

export const canApply = derived(
	brainDumpStore,
	($state) => !!$state.parseResults && !$state.isProcessing && $state.currentPhase === 'idle'
);

export const enabledOperationsCount = derived(brainDumpStore, ($state) => {
	if (!$state.parseResults) return 0;
	return $state.parseResults.operations.filter((op) => !$state.disabledOperations.has(op.id))
		.length;
});

export const hasOperationErrors = derived(
	brainDumpStore,
	($state) => $state.operationErrors.length > 0
);

export const criticalErrors = derived(brainDumpStore, ($state) =>
	$state.operationErrors.filter(
		(error) => error.error.includes('Critical') || error.table === 'projects'
	)
);

export const operationErrorSummary = derived(brainDumpStore, ($state) => {
	if ($state.operationErrors.length === 0) return null;

	const byTable = $state.operationErrors.reduce(
		(acc, error) => {
			acc[error.table] = (acc[error.table] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	return {
		total: $state.operationErrors.length,
		byTable,
		hasCritical: $state.operationErrors.some(
			(e) => e.error.includes('Critical') || e.table === 'projects'
		)
	};
});
