// apps/web/src/lib/stores/brain-dump-v2.store.ts
import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	BrainDumpParseResult,
	ParsedOperation,
	DisplayedBrainDumpQuestion
} from '$lib/types/brain-dump';

// Version for session storage compatibility
const STORAGE_VERSION = 1;
const STORAGE_KEY = 'brain-dump-unified-state';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// CRITICAL: Module-level mutex to prevent race conditions at event loop level
// This ensures atomic check-and-set even with concurrent async calls
let processingMutexLock = false;

// Unified state interface with domain separation
export interface UnifiedBrainDumpState {
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
			hasUserInteracted: boolean;
			showSuccessView: boolean;
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

		// Additional context data needed for processing
		displayedQuestions: DisplayedBrainDumpQuestion[];
	};

	// Processing Domain - All processing-related state
	processing: {
		// Current processing state
		phase: 'idle' | 'transcribing' | 'parsing' | 'saving' | 'applying';
		type: 'dual' | 'single' | 'short' | 'background';
		mutex: boolean;
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

// Initial state factory
function createInitialState(): UnifiedBrainDumpState {
	return {
		ui: {
			modal: {
				isOpen: false,
				currentView: 'project-selection',
				isHandingOff: false
			},
			notification: {
				isOpen: false,
				isMinimized: false,
				hasUserInteracted: false,
				showSuccessView: false
			},
			components: {
				loaded: {},
				loading: {}
			}
		},
		core: {
			selectedProject: null,
			isNewProject: true,
			inputText: '',
			lastSavedContent: '',
			currentBrainDumpId: null,
			parseResults: null,
			disabledOperations: new Set(),
			voice: {
				error: '',
				microphonePermissionGranted: false,
				capabilitiesChecked: false,
				isInitializingRecording: false,
				canUseLiveTranscript: false
			},
			displayedQuestions: [] as DisplayedBrainDumpQuestion[]
		},
		processing: {
			phase: 'idle',
			type: 'single',
			mutex: false,
			startedAt: null,
			jobId: null,
			autoAcceptEnabled: false,
			streaming: null,
			progress: {
				current: 0,
				total: 0,
				message: ''
			}
		},
		results: {
			success: null,
			errors: {
				operations: [],
				processing: null
			},
			lastExecutionSummary: null
		},
		persistence: {
			shouldPersist: false,
			lastPersistedAt: null,
			sessionId: crypto.randomUUID()
		}
	};
}

// Session storage management
function persistState(state: UnifiedBrainDumpState) {
	if (!browser || !state.persistence.shouldPersist) return;

	try {
		const toPersist = {
			version: STORAGE_VERSION,
			sessionId: state.persistence.sessionId,
			timestamp: Date.now(),
			core: {
				inputText: state.core.inputText,
				currentBrainDumpId: state.core.currentBrainDumpId,
				selectedProject: state.core.selectedProject,
				parseResults: state.core.parseResults
			},
			processing: {
				jobId: state.processing.jobId,
				type: state.processing.type,
				phase: state.processing.phase
			},
			ui: {
				notification: {
					isOpen: state.ui.notification.isOpen,
					isMinimized: state.ui.notification.isMinimized
				}
			}
		};

		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
	} catch (error) {
		console.error('Failed to persist brain dump state:', error);
	}
}

function loadPersistedState(): UnifiedBrainDumpState | null {
	if (!browser) return null;

	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const parsed = JSON.parse(stored);

		// Check version compatibility
		if (parsed.version !== STORAGE_VERSION) {
			sessionStorage.removeItem(STORAGE_KEY);
			return null;
		}

		// Check if session is expired
		const age = Date.now() - parsed.timestamp;
		if (age > SESSION_TIMEOUT_MS) {
			sessionStorage.removeItem(STORAGE_KEY);
			return null;
		}

		// Reconstruct state from persisted data
		const state = createInitialState();
		return {
			...state,
			core: {
				...state.core,
				...parsed.core,
				disabledOperations: new Set() // Recreate Set from scratch
			},
			processing: {
				...state.processing,
				...parsed.processing,
				mutex: false, // Reset mutex on reload
				startedAt: null // Reset timing
			},
			ui: {
				...state.ui,
				notification: {
					...state.ui.notification,
					...parsed.ui?.notification
				}
			},
			persistence: {
				...state.persistence,
				sessionId: parsed.sessionId,
				shouldPersist: true
			}
		};
	} catch (error) {
		console.error('Failed to load persisted brain dump state:', error);
		sessionStorage.removeItem(STORAGE_KEY);
		return null;
	}
}

// Type definition for the brain dump store with all actions
// Use object type with subscribe instead of Readable to ensure Svelte's $ syntax works
export type BrainDumpV2Store = {
	subscribe: Writable<UnifiedBrainDumpState>['subscribe'];
	// UI Actions
	openModal: () => void;
	closeModal: () => void;
	setModalView: (view: UnifiedBrainDumpState['ui']['modal']['currentView']) => void;
	startModalHandoff: () => void;
	completeModalHandoff: () => void;
	openNotification: (minimized?: boolean) => void;
	closeNotification: () => void;
	toggleNotificationMinimized: () => void;
	setComponentLoading: (component: string, loading: boolean) => void;
	setComponentLoaded: (component: string, loaded: boolean) => void;

	// Core Actions
	selectProject: (project: any) => void;
	updateInputText: (text: string) => void;
	setSavedContent: (content: string, brainDumpId?: string) => void;
	setParseResults: (results: BrainDumpParseResult | null) => void;
	toggleOperation: (operationId: string) => void;
	updateOperation: (operation: ParsedOperation) => void;
	removeOperation: (operationId: string) => void;
	setVoiceError: (error: string) => void;
	setMicrophonePermission: (granted: boolean) => void;
	setVoiceCapabilities: (capabilities: Partial<UnifiedBrainDumpState['core']['voice']>) => void;

	// Processing Actions
	startProcessing: (config: {
		type: 'dual' | 'single' | 'short' | 'background';
		brainDumpId: string;
		jobId?: string;
		autoAcceptEnabled?: boolean;
		inputText?: string;
		selectedProject?: any;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
	}) => Promise<boolean>;
	completeProcessing: () => void;
	releaseMutex: () => void;
	setProcessingPhase: (phase: UnifiedBrainDumpState['processing']['phase']) => void;
	updateStreamingState: (
		streaming: Partial<NonNullable<UnifiedBrainDumpState['processing']['streaming']>>
	) => void;
	resetStreamingState: () => void;
	setAutoAccept: (enabled: boolean) => void;

	// Results Actions
	setSuccessData: (data: UnifiedBrainDumpState['results']['success']) => void;
	setOperationErrors: (
		errors: Array<{
			operationId?: string;
			table: string;
			operation: string;
			error: string;
		}>
	) => void;
	setProcessingError: (error: string | null) => void;
	setExecutionSummary: (summary: { successful: number; failed: number; details?: any }) => void;
	clearErrors: () => void;

	// Utility Actions
	reset: () => void;
	resetForNewSession: () => void;
	clearParseResults: () => void;
};

// Create the unified store
function createBrainDumpV2Store(): BrainDumpV2Store {
	// Load persisted state or use initial state
	const persistedState = loadPersistedState();
	const initialState = persistedState || createInitialState();

	const { subscribe, set, update } = writable<UnifiedBrainDumpState>(initialState);

	// Set up persistence subscription
	if (browser) {
		subscribe((state) => {
			// Persist state changes with debouncing
			if (state.persistence.shouldPersist) {
				const now = Date.now();
				if (
					!state.persistence.lastPersistedAt ||
					now - state.persistence.lastPersistedAt > 1000
				) {
					persistState(state);
					state.persistence.lastPersistedAt = now;
				}
			}
		});
	}

	// Cleanup mechanism for abandoned sessions
	let cleanupInterval: NodeJS.Timeout | null = null;

	if (browser) {
		const startCleanupTimer = () => {
			if (cleanupInterval) clearInterval(cleanupInterval);

			cleanupInterval = setInterval(
				() => {
					const state = get({ subscribe });
					if (state.processing.startedAt) {
						const age = Date.now() - state.processing.startedAt;
						if (age > SESSION_TIMEOUT_MS) {
							console.warn('Cleaning up abandoned brain dump session');
							actions.reset();
						}
					}
				},
				5 * 60 * 1000
			); // Check every 5 minutes
		};

		startCleanupTimer();
	}

	// Store actions with domain-specific methods
	const actions = {
		// ===== UI Actions =====
		openModal: () =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						isOpen: true,
						currentView: 'project-selection'
					}
				}
			})),

		closeModal: () =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						isOpen: false
					}
				}
			})),

		setModalView: (view: UnifiedBrainDumpState['ui']['modal']['currentView']) =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						currentView: view
					}
				}
			})),

		startModalHandoff: () =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						isHandingOff: true
					}
				}
			})),

		completeModalHandoff: () =>
			update((state) => {
				console.log('[Store] Completing modal handoff - opening notification');
				return {
					...state,
					ui: {
						...state.ui,
						modal: {
							...state.ui.modal,
							isOpen: false,
							isHandingOff: false
						},
						notification: {
							...state.ui.notification,
							isOpen: true,
							isMinimized: true
						}
					},
					persistence: {
						...state.persistence,
						shouldPersist: true
					}
				};
			}),

		openNotification: (minimized = true) =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					notification: {
						...state.ui.notification,
						isOpen: true,
						isMinimized: minimized
					}
				}
			})),

		closeNotification: () =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					notification: {
						...state.ui.notification,
						isOpen: false
					}
				}
			})),

		toggleNotificationMinimized: () =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					notification: {
						...state.ui.notification,
						isMinimized: !state.ui.notification.isMinimized,
						hasUserInteracted: true
					}
				}
			})),

		setComponentLoading: (component: string, loading: boolean) =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					components: {
						...state.ui.components,
						loading: {
							...state.ui.components.loading,
							[component]: loading
						}
					}
				}
			})),

		setComponentLoaded: (component: string, loaded: boolean) =>
			update((state) => ({
				...state,
				ui: {
					...state.ui,
					components: {
						...state.ui.components,
						loaded: {
							...state.ui.components.loaded,
							[component]: loaded
						},
						loading: {
							...state.ui.components.loading,
							[component]: false
						}
					}
				}
			})),

		// ===== Core Actions =====
		selectProject: (project: any) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					selectedProject: project,
					isNewProject: !project || project.id === 'new'
				},
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						currentView: 'recording'
					}
				}
			})),

		updateInputText: (text: string) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					inputText: text
				}
			})),

		setSavedContent: (content: string, brainDumpId?: string) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					lastSavedContent: content,
					currentBrainDumpId: brainDumpId || state.core.currentBrainDumpId
				}
			})),

		setParseResults: (results: BrainDumpParseResult | null) =>
			update((state) => {
				console.log('[Store] Setting parse results:', {
					hasResults: !!results,
					operationsCount: results?.operations?.length,
					currentPhase: state.processing.phase
				});
				return {
					...state,
					core: {
						...state.core,
						parseResults: results,
						disabledOperations: new Set() // Clear disabled operations
					},
					processing: {
						...state.processing,
						phase: results ? 'idle' : state.processing.phase,
						mutex: false // Release mutex when parse results are received
					}
				};
			}),

		toggleOperation: (operationId: string) =>
			update((state) => {
				const newDisabled = new Set(state.core.disabledOperations);
				if (newDisabled.has(operationId)) {
					newDisabled.delete(operationId);
				} else {
					newDisabled.add(operationId);
				}
				return {
					...state,
					core: {
						...state.core,
						disabledOperations: newDisabled
					}
				};
			}),

		updateOperation: (operation: ParsedOperation) =>
			update((state) => {
				if (!state.core.parseResults) return state;

				const operations = state.core.parseResults.operations.map((op) =>
					op.id === operation.id ? operation : op
				);

				return {
					...state,
					core: {
						...state.core,
						parseResults: {
							...state.core.parseResults,
							operations
						}
					}
				};
			}),

		removeOperation: (operationId: string) =>
			update((state) => {
				if (!state.core.parseResults) return state;

				const operations = state.core.parseResults.operations.filter(
					(op) => op.id !== operationId
				);

				return {
					...state,
					core: {
						...state.core,
						parseResults: {
							...state.core.parseResults,
							operations
						}
					}
				};
			}),

		setVoiceError: (error: string) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					voice: {
						...state.core.voice,
						error
					}
				}
			})),

		setMicrophonePermission: (granted: boolean) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					voice: {
						...state.core.voice,
						microphonePermissionGranted: granted
					}
				}
			})),

		setVoiceCapabilities: (capabilities: Partial<UnifiedBrainDumpState['core']['voice']>) =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					voice: {
						...state.core.voice,
						...capabilities
					}
				}
			})),

		// ===== Processing Actions =====
		startProcessing: async (config: {
			type: 'dual' | 'single' | 'short' | 'background';
			brainDumpId: string;
			jobId?: string;
			autoAcceptEnabled?: boolean;
			inputText?: string;
			selectedProject?: any;
			displayedQuestions?: DisplayedBrainDumpQuestion[];
		}) => {
			// CRITICAL FIX: Check module-level mutex FIRST (event-loop atomic)
			if (processingMutexLock) {
				console.warn('[Store] Processing mutex already locked (module-level check)', {
					timestamp: Date.now()
				});
				return false;
			}

			// Acquire module-level mutex immediately
			processingMutexLock = true;

			// Double-check store-level mutex for consistency
			let mutexAcquired = false;

			// Use update to check and set store mutex
			update((state) => {
				if (state.processing.mutex) {
					// Mutex already held at store level, release module mutex
					console.warn(
						'[Store] Processing mutex already held (store-level check), rejecting duplicate request',
						{
							currentPhase: state.processing.phase,
							startedAt: state.processing.startedAt
						}
					);
					processingMutexLock = false; // Release module mutex
					return state;
				}

				// Acquire mutex atomically
				mutexAcquired = true;
				console.log(
					'[Store] Acquired processing mutex (both levels), starting processing with config:',
					config
				);

				return {
					...state,
					processing: {
						...state.processing,
						mutex: true // Set mutex atomically with check
					}
				};
			});

			// If we didn't acquire the mutex, return false
			if (!mutexAcquired) {
				processingMutexLock = false; // Release module mutex
				return false;
			}

			console.log('[Store] Starting processing with config:', config);

			update((state) => ({
				...state,
				core: {
					...state.core,
					currentBrainDumpId: config.brainDumpId,
					// Update optional fields if provided
					inputText:
						config.inputText !== undefined ? config.inputText : state.core.inputText,
					selectedProject:
						config.selectedProject !== undefined
							? config.selectedProject
							: state.core.selectedProject,
					displayedQuestions:
						config.displayedQuestions !== undefined
							? config.displayedQuestions
							: state.core.displayedQuestions
				},
				processing: {
					...state.processing,
					mutex: true,
					phase: 'parsing',
					type: config.type,
					startedAt: Date.now(),
					jobId: config.jobId || null,
					autoAcceptEnabled: config.autoAcceptEnabled || false,
					// Initialize streaming state for dual/short processing
					streaming:
						config.type === 'dual' || config.type === 'short'
							? {
									contextStatus: 'pending',
									tasksStatus: 'pending',
									contextResult: null,
									tasksResult: null,
									contextProgress: '',
									tasksProgress: ''
								}
							: null
				},
				persistence: {
					...state.persistence,
					shouldPersist: true
				}
			}));

			console.log('[Store] Processing started, state updated');

			return true;
		},

		completeProcessing: () => {
			console.log('[Store] Completing processing, releasing both mutexes');
			// CRITICAL: Release module-level mutex
			processingMutexLock = false;

			update((state) => {
				return {
					...state,
					processing: {
						...state.processing,
						mutex: false, // Always release mutex on completion
						phase: 'idle',
						startedAt: null
					}
				};
			});
		},

		// ADDED: Emergency mutex release in case of errors
		releaseMutex: () => {
			console.warn('[Store] Emergency mutex release (both levels)');
			// CRITICAL: Release module-level mutex
			processingMutexLock = false;

			update((state) => {
				return {
					...state,
					processing: {
						...state.processing,
						mutex: false
					}
				};
			});
		},

		setProcessingPhase: (phase: UnifiedBrainDumpState['processing']['phase']) =>
			update((state) => ({
				...state,
				processing: {
					...state.processing,
					phase
				}
			})),

		updateStreamingState: (
			streaming: Partial<NonNullable<UnifiedBrainDumpState['processing']['streaming']>>
		) =>
			update((state) => ({
				...state,
				processing: {
					...state.processing,
					streaming: {
						contextStatus:
							streaming.contextStatus ??
							state.processing.streaming?.contextStatus ??
							'pending',
						tasksStatus:
							streaming.tasksStatus ??
							state.processing.streaming?.tasksStatus ??
							'pending',
						contextResult:
							streaming.contextResult ?? state.processing.streaming?.contextResult,
						tasksResult:
							streaming.tasksResult ?? state.processing.streaming?.tasksResult,
						contextProgress:
							streaming.contextProgress ??
							state.processing.streaming?.contextProgress ??
							'',
						tasksProgress:
							streaming.tasksProgress ??
							state.processing.streaming?.tasksProgress ??
							''
					}
				}
			})),

		resetStreamingState: () =>
			update((state) => ({
				...state,
				processing: {
					...state.processing,
					streaming: {
						contextStatus: 'pending',
						tasksStatus: 'pending',
						contextResult: null,
						tasksResult: null,
						contextProgress: '',
						tasksProgress: ''
					}
				}
			})),

		setAutoAccept: (enabled: boolean) =>
			update((state) => ({
				...state,
				processing: {
					...state.processing,
					autoAcceptEnabled: enabled
				}
			})),

		// ===== Results Actions =====
		setSuccessData: (data: UnifiedBrainDumpState['results']['success']) =>
			update((state) => ({
				...state,
				results: {
					...state.results,
					success: data
				},
				ui: {
					...state.ui,
					modal: {
						...state.ui.modal,
						currentView: 'success'
					},
					notification: {
						...state.ui.notification,
						showSuccessView: true
					}
				}
			})),

		setOperationErrors: (
			errors: Array<{
				operationId?: string;
				table: string;
				operation: string;
				error: string;
			}>
		) =>
			update((state) => ({
				...state,
				results: {
					...state.results,
					errors: {
						...state.results.errors,
						operations: errors.map((e) => ({
							...e,
							timestamp: new Date().toISOString()
						}))
					}
				}
			})),

		setProcessingError: (error: string | null) =>
			update((state) => ({
				...state,
				results: {
					...state.results,
					errors: {
						...state.results.errors,
						processing: error
					}
				},
				processing: {
					...state.processing,
					mutex: false,
					phase: 'idle'
				}
			})),

		setExecutionSummary: (summary: { successful: number; failed: number; details?: any }) =>
			update((state) => ({
				...state,
				results: {
					...state.results,
					lastExecutionSummary: {
						...summary,
						timestamp: new Date().toISOString()
					}
				}
			})),

		clearErrors: () =>
			update((state) => ({
				...state,
				results: {
					...state.results,
					errors: {
						operations: [],
						processing: null
					}
				},
				core: {
					...state.core,
					voice: {
						...state.core.voice,
						error: ''
					}
				}
			})),

		// ===== Utility Actions =====
		reset: () => {
			if (browser) {
				sessionStorage.removeItem(STORAGE_KEY);
				if (cleanupInterval) {
					clearInterval(cleanupInterval);
				}
			}
			set(createInitialState());
		},

		resetForNewSession: () =>
			update((state) => {
				const newState = createInitialState();
				return {
					...newState,
					ui: {
						...newState.ui,
						modal: {
							...newState.ui.modal,
							isOpen: state.ui.modal.isOpen,
							currentView: 'project-selection'
						}
					},
					persistence: {
						...newState.persistence,
						sessionId: crypto.randomUUID()
					}
				};
			}),

		clearParseResults: () =>
			update((state) => ({
				...state,
				core: {
					...state.core,
					parseResults: null,
					disabledOperations: new Set()
				}
			}))
	};

	return {
		subscribe,
		...actions
	};
}

// Create the store instance with explicit type annotation
export const brainDumpV2Store: BrainDumpV2Store = createBrainDumpV2Store();

// ===== Derived Stores for Computed Values =====

// Core derived values
export const selectedProjectName = derived(
	brainDumpV2Store,
	($state) => $state.core.selectedProject?.name || 'New Project/ Note'
);

export const hasUnsavedChanges = derived(
	brainDumpV2Store,
	($state) =>
		$state.core.inputText.trim() !== $state.core.lastSavedContent &&
		$state.core.inputText.trim().length > 0
);

export const canParse = derived(
	brainDumpV2Store,
	($state) =>
		$state.core.inputText.trim().length > 0 &&
		$state.processing.phase === 'idle' &&
		!$state.processing.mutex &&
		!$state.core.parseResults
);

export const canApply = derived(
	brainDumpV2Store,
	($state) =>
		!!$state.core.parseResults && !$state.processing.mutex && $state.processing.phase === 'idle'
);

// Operation counts and filtering
export const enabledOperationsCount = derived(brainDumpV2Store, ($state) => {
	if (!$state.core.parseResults) return 0;
	return $state.core.parseResults.operations.filter(
		(op) => !$state.core.disabledOperations.has(op.id)
	).length;
});

export const disabledOperationsCount = derived(
	brainDumpV2Store,
	($state) => $state.core.disabledOperations.size
);

// Error analysis
export const hasOperationErrors = derived(
	brainDumpV2Store,
	($state) => $state.results.errors.operations.length > 0
);

export const hasCriticalErrors = derived(brainDumpV2Store, ($state) =>
	$state.results.errors.operations.some(
		(e) => e.error.includes('Critical') || e.table === 'projects'
	)
);

export const operationErrorSummary = derived(brainDumpV2Store, ($state) => {
	if ($state.results.errors.operations.length === 0) return null;

	const byTable = $state.results.errors.operations.reduce(
		(acc, error) => {
			acc[error.table] = (acc[error.table] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);

	const hasCritical = $state.results.errors.operations.some(
		(e) => e.error.includes('Critical') || e.table === 'projects'
	);

	return {
		total: $state.results.errors.operations.length,
		byTable,
		hasCritical
	};
});

// Processing state
export const isProcessingActive = derived(
	brainDumpV2Store,
	($state) => $state.processing.mutex || $state.processing.phase !== 'idle'
);

export const hasParseResults = derived(
	brainDumpV2Store,
	($state) => $state.core.parseResults !== null
);

export const canAutoAccept = derived(brainDumpV2Store, ($state) => {
	if (!$state.core.parseResults) return false;

	return (
		$state.core.parseResults.operations.length <= 20 &&
		$state.core.parseResults.operations.every((op) => !op.error) &&
		$state.processing.autoAcceptEnabled
	);
});

// UI state
export const isModalOpen = derived(brainDumpV2Store, ($state) => $state.ui.modal.isOpen);

export const isNotificationOpen = derived(
	brainDumpV2Store,
	($state) => $state.ui.notification.isOpen
);

export const isNotificationMinimized = derived(
	brainDumpV2Store,
	($state) => $state.ui.notification.isMinimized
);

// Derived UI state for textarea (previously stored redundantly)
export const showingParseResults = derived(
	brainDumpV2Store,
	($state) => $state.core.parseResults !== null
);

export const isTextareaCollapsed = derived(
	brainDumpV2Store,
	($state) => $state.core.parseResults !== null
);

export const processingStatus = derived(brainDumpV2Store, ($state) => {
	if ($state.results.errors.processing) {
		return {
			type: 'error' as const,
			message: $state.results.errors.processing,
			canRetry: true
		};
	}

	if ($state.processing.phase === 'parsing') {
		return {
			type: 'processing' as const,
			message: 'Processing brain dump...',
			canRetry: false
		};
	}

	if ($state.core.parseResults) {
		return {
			type: 'completed' as const,
			message: `${$state.core.parseResults.operations.length} operations ready`,
			canRetry: false
		};
	}

	return {
		type: 'idle' as const,
		message: '',
		canRetry: false
	};
});
