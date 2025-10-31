<!-- apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte -->
<script lang="ts">
	import { onDestroy, createEventDispatcher, tick, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import Modal from '$lib/components/ui/Modal.svelte';

	// Lazy load heavy components - use $state for reactive component references
	let ProjectSelectionView = $state<any>(null);
	let RecordingView = $state<any>(null);
	let SuccessView = $state<any>(null);
	let OperationEditModal = $state<any>(null);

	// Import lighter components that are always needed
	import { X, LoaderCircle } from 'lucide-svelte';
	import Button from '$components/ui/Button.svelte';

	// Direct v2 store import (migration complete)
	import { get } from 'svelte/store';
	import {
		brainDumpV2Store,
		// Import pre-computed derived stores
		selectedProjectName,
		hasUnsavedChanges,
		canParse,
		canApply,
		enabledOperationsCount,
		isProcessingActive,
		hasParseResults
	} from '$lib/stores/brain-dump-v2.store';

	// Service imports
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService } from '$lib/stores/toast.store';
	import { backgroundBrainDumpService } from '$lib/services/braindump-background.service';
	import { page } from '$app/stores';
	import { smartNavigateToProject } from '$lib/utils/brain-dump-navigation';
	import { voiceRecordingService } from '$lib/services/voiceRecording.service';
	import { throttle } from '$lib/utils/performance-optimization';

	const MULTI_BRAINDUMP_ENABLED = true;

	// View transitions are disabled in multi-braindump mode to prevent
	// "Unexpected duplicate view-transition-name" errors when multiple modals exist
	const enableViewTransitions = !MULTI_BRAINDUMP_ENABLED;

	// Store actions are accessed via brainDumpV2Store methods
	const brainDumpActions = brainDumpV2Store;

	// PHASE 2 OPTIMIZATION: Split $derived values by logical concern
	// Groups related state together - only affected group re-derives when its data changes
	// This prevents all 20+ values from recalculating on every store mutation

	// Input state - changes frequently during typing (throttled now)
	let inputState = $derived.by(() => {
		const state = $brainDumpV2Store;
		return {
			text: state?.core?.inputText ?? '',
			lastSaved: state?.core?.lastSavedContent ?? '',
			isNew: state?.core?.isNewProject ?? false
		};
	});
	let inputText = $derived(inputState.text);
	let lastSavedContent = $derived(inputState.lastSaved);
	let isNewProject = $derived(inputState.isNew);

	// UI state - changes rarely (only on view/modal changes)
	let uiState = $derived.by(() => {
		const state = $brainDumpV2Store;
		return {
			modalOpen: state?.ui?.modal?.isOpen ?? false,
			view: state?.ui?.modal?.currentView ?? 'project-selection'
		};
	});
	let modalIsOpenFromStore = $derived(uiState.modalOpen);
	let currentView = $derived(uiState.view);

	// Processing state - changes during brain dump processing
	let processingState = $derived.by(() => {
		const state = $brainDumpV2Store;
		return {
			phase: state?.processing?.phase ?? 'idle',
			mutex: state?.processing?.mutex ?? false,
			currentBrainDumpId: MULTI_BRAINDUMP_ENABLED
				? ''
				: (state?.core?.currentBrainDumpId ?? ''),
			activeBrainDumpId:
				!MULTI_BRAINDUMP_ENABLED && state?.processing?.mutex
					? (state?.processing?.activeBrainDumpId ?? null)
					: null
		};
	});
	let currentPhase = $derived(processingState.phase);
	let isProcessing = $derived(processingState.mutex);
	let isSaving = $derived(processingState.phase === 'saving');
	let currentBrainDumpId = $derived(processingState.currentBrainDumpId);
	let activeProcessingBrainDumpId = $derived(processingState.activeBrainDumpId);

	// Project state - changes when project selection changes
	let selectedProject = $derived($brainDumpV2Store?.core?.selectedProject ?? null);

	// Voice state - changes during voice recording
	let voiceState = $derived.by(() => {
		const state = $brainDumpV2Store;
		return {
			error: state?.core?.voice?.error ?? '',
			micPermission: state?.core?.voice?.microphonePermissionGranted ?? false,
			capsChecked: state?.core?.voice?.capabilitiesChecked ?? false,
			initializing: state?.core?.voice?.isInitializingRecording ?? false,
			canLiveTranscript: state?.core?.voice?.canUseLiveTranscript ?? false
		};
	});
	let voiceError = $derived(voiceState.error);
	let microphonePermissionGranted = $derived(voiceState.micPermission);
	let voiceCapabilitiesChecked = $derived(voiceState.capsChecked);
	let isInitializingRecording = $derived(voiceState.initializing);
	let canUseLiveTranscript = $derived(voiceState.canLiveTranscript);

	// Results state - changes when processing completes
	let resultsState = $derived.by(() => {
		const state = $brainDumpV2Store;
		return {
			parseResults: state?.core?.parseResults ?? null,
			disabledOps: state?.core?.disabledOperations ?? new Set(),
			success: state?.results?.success ?? null
		};
	});
	let parseResults = $derived(resultsState.parseResults);
	let disabledOperations = $derived(resultsState.disabledOps);
	let successData = $derived(resultsState.success);

	// Processing notification is now managed through unified store

	import type { ParsedOperation, DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
	type CleanupReason = 'close' | 'destroy' | 'handoff';

	// Props - Using Svelte 5 $props() for runes mode
	let {
		isOpen = false,
		project = null,
		showNavigationOnSuccess = true,
		onNavigateToProject = null
	}: {
		isOpen?: boolean;
		project?: any;
		showNavigationOnSuccess?: boolean;
		onNavigateToProject?: ((url: string) => void) | null;
	} = $props();

	const dispatch = createEventDispatcher();

	// Component loading states
	const initialComponentLoadState = {
		projectSelection: false,
		recording: false,
		parseResults: false,
		success: false,
		processing: false,
		operationEdit: false
	};

	let componentsLoaded = { ...initialComponentLoadState };

	// Loading states - use $state for reactive variables in Svelte 5
	let isLoadingData = $state(false); // Track background data loading
	let loadError = $state('');
	let isHandingOff = $state(false); // Track smooth handoff transition

	// Data from API - use $state for reactive arrays/data
	let projects = $state<any[]>([]);
	let recentDumps = $state<any[]>([]);
	let newProjectDraftCount = $state(0);

	// Voice recording state - now managed by VoiceRecordingService
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	// Subscribe to recording duration store for reactivity
	let recordingDuration = $state(0);
	const recordingDurationStore = voiceRecordingService.getRecordingDuration();
	// Use $effect to keep recordingDuration in sync with the store
	$effect(() => {
		const unsubscribe = recordingDurationStore.subscribe((value) => {
			recordingDuration = value;
		});
		return unsubscribe;
	});
	let accumulatedTranscript = $derived(voiceRecordingService.getCurrentLiveTranscript());
	let isLiveTranscribing = $derived(voiceRecordingService.isLiveTranscribing());

	// Auto-save - use regular variable for timers (not reactive)
	let autoSaveTimeout: NodeJS.Timeout | null = null; // Timer handles should NOT be reactive
	let isAutoSaving = $state(false);
	// CRITICAL FIX FOR BUG #3: Track if save is pending (queued or executing)
	// This provides proper mutual exclusion between auto-save and parse operations
	// True if: save timeout is set OR save is actively executing
	let saveOperationPending = $state(false);
	let componentMounted = $state(true);
	let cleanupCompleted = false;

	// Processing abort controller for cleanup
	let abortController: AbortController | null = null; // Controller references should NOT be reactive

	// Modal state - use $state for reactive objects
	let editModal = $state({ isOpen: false, operation: null as ParsedOperation | null });
	let innerWidth = $state(0);
	let pendingNavigationUrl = $state<string | null>(null);

	// Project questions state
	let displayedQuestions = $state<DisplayedBrainDumpQuestion[]>([]);

	// CRITICAL FIX FOR BUG #1: Flag to prevent auto-save during initial data load
	// This prevents race conditions where auto-save creates a new draft before initial load completes
	let initialLoadComplete = $state(false);

	// Computed states - use derived values
	// Use $derived for computed values in Svelte 5
	let showProcessingOverlay = $derived(isAutoSaving || isSaving);
	let projectOptions = $derived([
		{ id: 'new', name: 'New Project / Note', isProject: false },
		...projects
	]);

	// Reactively compute processing project IDs
	// This will update whenever the store state changes
	// We need to reference the store state to make it reactive
	let processingProjectIds = $derived.by(() => {
		// Access store state to trigger reactivity
		const _ = $brainDumpV2Store;
		// Type assertion needed due to TypeScript language server cache
		return (brainDumpActions as any).getProcessingProjectIds() as Set<string>;
	});

	// Lazy load components based on view
	async function loadComponentsForView(view: string) {
		switch (view) {
			case 'project-selection':
				if (!componentsLoaded.projectSelection) {
					ProjectSelectionView = (await import('./ProjectSelectionView.svelte')).default;
					componentsLoaded.projectSelection = true;
				}
				break;
			case 'recording':
				if (!componentsLoaded.recording) {
					RecordingView = (await import('./RecordingView.svelte')).default;
					componentsLoaded.recording = true;
				}
				// Preload components that might be needed soon
				break;
			case 'success':
				if (!componentsLoaded.success) {
					SuccessView = (await import('./SuccessView.svelte')).default;
					componentsLoaded.success = true;
				}
				break;
		}
	}

	// Preload critical components immediately when modal opens
	async function preloadCriticalComponents() {
		// Load RecordingView immediately since it's the most used view
		if (!componentsLoaded.recording) {
			import('./RecordingView.svelte').then((m) => {
				RecordingView = m.default;
				componentsLoaded.recording = true;
			});
		}
		// Also load ProjectSelectionView since it's often the first view
		if (!componentsLoaded.projectSelection) {
			import('./ProjectSelectionView.svelte').then((m) => {
				ProjectSelectionView = m.default;
				componentsLoaded.projectSelection = true;
			});
		}
	}

	// Preload OperationEditModal when needed
	async function loadOperationEditModal() {
		if (!componentsLoaded.operationEdit) {
			OperationEditModal = (await import('./OperationEditModal.svelte')).default;
			componentsLoaded.operationEdit = true;
		}
	}

	// Track previous values to prevent unnecessary re-execution
	let previousView = $state<string | null>(null);
	let previousIsOpen = $state(false);
	let isInitializing = $state(false);
	let isClosing = $state(false);

	// Watch for view changes and load appropriate components - use $effect for side effects
	// PERFORMANCE FIX: Use untrack() to only react to currentView changes, not entire store
	$effect(() => {
		const view = currentView;
		untrack(() => {
			if (view && browser && view !== previousView) {
				previousView = view;
				loadComponentsForView(view);
			}
		});
	});

	// Initialize modal when opened - use $effect for side effects
	// PERFORMANCE FIX: Use untrack() to only react to isOpen changes, not entire store
	$effect(() => {
		const open = isOpen;
		untrack(() => {
			if (open && browser && !previousIsOpen && !isInitializing) {
				previousIsOpen = true;
				isInitializing = true;
				initializeModal().finally(() => {
					isInitializing = false;
				});
			} else if (!open) {
				previousIsOpen = false;
			}
		});
	});

	// Clean up when modal closes - use $effect for side effects
	// PERFORMANCE FIX: Use untrack() to only react to isOpen changes, not entire store
	$effect(() => {
		const open = isOpen;
		untrack(() => {
			if (!open && browser && previousIsOpen && !isClosing) {
				isClosing = true;
				// Add a small delay to prevent race conditions
				setTimeout(() => {
					handleModalClose().finally(() => {
						isClosing = false;
					});
				}, 50);
			}
		});
	});

	// When modal opens, ensure store is in correct state
	// Remove bidirectional sync to avoid loops
	// PERFORMANCE FIX: Use untrack() to only react to isOpen changes, not entire store
	$effect(() => {
		const open = isOpen;
		const modalOpen = modalIsOpenFromStore;
		untrack(() => {
			// Only sync when modal is being opened (not on every change)
			// Don't sync if we're in the middle of closing
			if (open && !previousIsOpen && browser && !isClosing) {
				console.log('[BrainDumpModal] Modal opening - ensuring store is ready');
				// Open the modal in the store if it's not already open
				if (!modalOpen) {
					brainDumpActions.openModal();
				}
			}
		});
	});

	async function initializeModal() {
		cleanupCompleted = false;
		// CRITICAL FIX FOR BUG #1: Reset initial load flag at the start of initialization
		// This prevents auto-save from firing until after initial data is loaded
		initialLoadComplete = false;

		// Clean up any stale abort controllers from previous sessions
		if (abortController) {
			console.log('[BrainDumpModal] Cleaning up stale abort controller on init');
			abortController.abort();
			abortController = null;
		}
		if (saveAbortController) {
			console.log('[BrainDumpModal] Cleaning up stale save abort controller on init');
			saveAbortController.abort();
			saveAbortController = null;
		}

		if (!MULTI_BRAINDUMP_ENABLED) {
			const state = get(brainDumpV2Store);
			const processingActive = state.processing.mutex || state.processing.phase !== 'idle';

			if (processingActive && state.core.currentBrainDumpId) {
				console.log(
					'[BrainDumpModal] Detaching active processing brain dump from modal session'
				);
				brainDumpActions.detachActiveBrainDump();
				brainDumpActions.clearParseResults();
				brainDumpActions.updateInputText('');
			}
		}

		// Don't block on loading - show UI immediately
		isLoadingData = false;
		loadError = '';

		// If we have a project prop, ensure RecordingView is loaded before setting view
		if (project) {
			// Load RecordingView immediately and wait for it
			if (!componentsLoaded.recording) {
				RecordingView = (await import('./RecordingView.svelte')).default;
				componentsLoaded.recording = true;
			}

			brainDumpActions.selectProject(project);
			brainDumpActions.setModalView('recording');
		} else {
			// Start preloading critical components for other flows
			preloadCriticalComponents();
			brainDumpActions.setModalView('project-selection');
		}

		// Initialize voice recording service
		isVoiceSupported = voiceRecordingService.isVoiceSupported();

		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					console.log('[BrainDumpModal] onTextUpdate callback fired:', {
						textLength: text.length,
						preview: text.substring(0, 100)
					});
					brainDumpActions.updateInputText(text);
					debouncedAutoSave();
				},
				onError: (error: string) => {
					brainDumpActions.setVoiceError(error);
					brainDumpActions.setProcessingPhase('idle');
					toastService.error(error);
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					brainDumpActions.setProcessingPhase(phase);
				},
				onPermissionGranted: () => {
					brainDumpActions.setMicrophonePermission(true);
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					console.log('[BrainDumpModal] Runtime capability update:', update);
					brainDumpActions.setVoiceCapabilities({
						canUseLiveTranscript: update.canUseLiveTranscript
					});
				}
			},
			brainDumpService
		);

		brainDumpActions.setVoiceCapabilities({
			canUseLiveTranscript: voiceRecordingService.isLiveTranscriptSupported(),
			capabilitiesChecked: true
		});

		// Load initial data in background
		loadInitialData();
	}

	async function loadInitialData() {
		try {
			// Load initial data
			const response = await brainDumpService.getInitData(project?.id, {
				excludeBrainDumpId: activeProcessingBrainDumpId || undefined
			});

			if (response?.data) {
				projects = response.data.projects || [];
				recentDumps = response.data.recentBrainDumps || [];
				newProjectDraftCount = response.data.newProjectDraftCount || 0;

				// If project was passed as prop, load its data
				if (project) {
					// Fetch questions in background
					fetchProjectQuestions(project.id);

					// Check if this project is already being processed
					const isAlreadyProcessing = brainDumpV2Store.isProjectBeingProcessed(
						project.id === 'new' ? null : project.id
					);

					// Load draft for the selected project if exists AND not already processing
					if (response.data.currentDraft?.brainDump && !isAlreadyProcessing) {
						brainDumpActions.updateInputText(
							response.data.currentDraft.brainDump.content
						);
						brainDumpActions.setSavedContent(
							response.data.currentDraft.brainDump.content,
							response.data.currentDraft.brainDump.id
						);

						// Load parse results if available
						if (
							response.data.currentDraft.brainDump.status === 'parsed' &&
							response.data.currentDraft.parseResults
						) {
							try {
								brainDumpActions.setParseResults(
									response.data.currentDraft.parseResults
								);
								// showingParseResults is handled automatically
								// brainDumpActions.setShowingParseResults(true);
							} catch (error) {
								console.error('Invalid parse results:', error);
								await brainDumpService.revertToPending(
									response.data.currentDraft.brainDump.id
								);
							}
						}
					} else if (isAlreadyProcessing) {
						console.log(
							`[BrainDumpModal] Project ${project.id} is already being processed - starting fresh`
						);
						// Start fresh with empty state - don't load the draft that's being processed
						brainDumpActions.updateInputText('');
						brainDumpActions.setSavedContent('', undefined);
					}
				}
			}
		} catch (error) {
			console.error('Failed to load brain dump data:', error);
			// Don't show error toast for background data loading
			// The UI is still functional even without the data
		} finally {
			// CRITICAL FIX FOR BUG #1: Mark initial load as complete
			// This allows auto-save to start firing (it was blocked during initial load)
			// This prevents race conditions where auto-save creates a new draft before we load the existing one
			initialLoadComplete = true;
			console.log('[BrainDumpModal] Initial data load complete - auto-save enabled');
		}
	}

	async function handleModalClose() {
		console.log('[BrainDumpModal] handleModalClose called');

		const storeState = get(brainDumpV2Store);
		// Determine if we've handed processing off to the notification system
		// Multi-mode uses the activeBrainDumps Map instead of the legacy notification flag
		const activeBrainDumpCount =
			MULTI_BRAINDUMP_ENABLED && storeState?.activeBrainDumps instanceof Map
				? storeState.activeBrainDumps.size
				: 0;
		const legacyHandedOff = storeState?.ui?.notification?.isOpen ?? false;
		const isHandedOff = MULTI_BRAINDUMP_ENABLED ? activeBrainDumpCount > 0 : legacyHandedOff;

		// Check if store has already been reset (e.g., by auto-accept)
		const isStoreAlreadyReset =
			!storeState?.core?.inputText &&
			!storeState?.core?.currentBrainDumpId &&
			storeState?.ui?.modal?.currentView === 'project-selection';

		// Auto-save if there are unsaved changes and we're not handing off and store hasn't been reset
		if ($hasUnsavedChanges && !isHandedOff && !isStoreAlreadyReset) {
			await autoSave();
		}

		// Clean up
		cleanup(isHandedOff ? 'handoff' : 'close');

		// Only reset store if:
		// 1. We're not handing off to notification
		// 2. Store hasn't already been reset (by auto-accept or other means)
		if (!isHandedOff && !isStoreAlreadyReset) {
			console.log('[BrainDumpModal] Resetting store - not handed off to notification');
			brainDumpActions.reset();
		} else if (isHandedOff) {
			console.log('[BrainDumpModal] Keeping store state - handed off to notification');
		} else if (isStoreAlreadyReset) {
			console.log(
				'[BrainDumpModal] Store already reset (likely by auto-accept) - skipping reset'
			);
			// Even though the store is reset, ensure modal state is closed
			if (modalIsOpenFromStore) {
				brainDumpActions.closeModal();
			}
		}

		// Reset handoff state
		isHandingOff = false;

		// Notify parent
		dispatch('close');

		// Skip global invalidation - let specific components refresh their own data if needed
		// This prevents unnecessary full page data reloads
		// if (browser && !isHandedOff) {
		//     invalidateAll();  // REMOVED: Causes performance issues
		// }
	}

	function cleanup(reason: CleanupReason = 'close') {
		if (cleanupCompleted) {
			console.debug('[BrainDumpModal] Skipping cleanup - already completed', { reason });
			return;
		}
		cleanupCompleted = true;
		console.debug('[BrainDumpModal] Running cleanup', { reason });

		// 0. Abort any active SSE/streaming connections
		// IMPORTANT: In multi-brain dump mode, the bridge manages API streams, so only abort if legacy mode
		if (abortController && !MULTI_BRAINDUMP_ENABLED) {
			try {
				console.log('[Cleanup] Aborting active streaming connection');
				abortController.abort();
			} catch (e) {
				console.warn('[Cleanup] Error aborting streaming connection:', e);
			}
			abortController = null;
		}

		// 1. Cleanup voice recording service
		voiceRecordingService.cleanup();
		isCurrentlyRecording = false;

		// 2. Clear auto-save timeout
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
			autoSaveTimeout = null;
		}

		// 3. Reset state
		isAutoSaving = false;
		isHandingOff = false;

		// 7. Clear component references (helps with garbage collection) and reset load state
		ProjectSelectionView = null;
		RecordingView = null;
		SuccessView = null;
		OperationEditModal = null;
		componentsLoaded = { ...initialComponentLoadState };

		// 8. Release processing mutex if held (emergency release)
		// IMPORTANT: In multi-brain dump mode, don't touch mutexes - bridge manages them
		if (!MULTI_BRAINDUMP_ENABLED) {
			const currentState = get(brainDumpV2Store);
			if (currentState.processing.mutex) {
				console.warn('[Cleanup] Emergency mutex release on component destroy');
				brainDumpV2Store.releaseMutex();
			}
		}

		// Reset abort controller
		abortController = null;
	}

	// Fetch questions for a project
	async function fetchProjectQuestions(projectId: string) {
		if (!projectId || projectId === 'new') {
			displayedQuestions = [];
			return;
		}

		try {
			const response = await fetch(`/api/projects/${projectId}/questions/random`);
			if (response.ok) {
				const data = await response.json();
				displayedQuestions = data.data?.questions || [];
			} else {
				displayedQuestions = [];
			}
		} catch (error) {
			displayedQuestions = [];
		}
	}

	async function handleProjectSelection(event: CustomEvent) {
		const selectedProjectData = event.detail;
		if (!selectedProjectData) {
			return;
		}

		const requestedProjectId =
			selectedProjectData.id === 'new' ? null : (selectedProjectData.id ?? null);
		const isAlreadyProcessing = brainDumpV2Store.isProjectBeingProcessed(requestedProjectId);

		if (isAlreadyProcessing) {
			const projectName = selectedProjectData?.name ?? 'this project';
			toastService.warning(
				`Finish or cancel the in-progress brain dump for ${
					selectedProjectData.id === 'new' ? 'your new project' : projectName
				} before starting another.`
			);
			return;
		}

		brainDumpActions.selectProject(selectedProjectData);

		// Fetch questions for the selected project
		await fetchProjectQuestions(selectedProjectData.id);

		try {
			const selectedProjectId =
				selectedProjectData.id === 'new' ? null : selectedProjectData.id;
			const response = await brainDumpService.getDraftForProject(selectedProjectId);

			if (response?.data?.brainDump) {
				brainDumpActions.updateInputText(response.data.brainDump.content);
				brainDumpActions.setSavedContent(
					response.data.brainDump.content,
					response.data.brainDump.id
				);

				if (response.data.brainDump.status === 'parsed' && response.data.parseResults) {
					try {
						brainDumpActions.setParseResults(response.data.parseResults);
						brainDumpActions.setModalView('recording');
						// showingParseResults is handled automatically
						// brainDumpActions.setShowingParseResults(true);
					} catch (error) {
						console.error('Invalid parse results:', error);
						await brainDumpService.revertToPending(response.data.brainDump.id);
						brainDumpActions.setModalView('recording');
					}
				} else {
					brainDumpActions.setModalView('recording');
				}
			} else {
				brainDumpActions.setModalView('recording');
			}
		} catch (error) {
			console.error('Error loading draft:', error);
			brainDumpActions.setModalView('recording');
		}
	}

	async function handleProjectChangeInRecording(event: CustomEvent) {
		const selectedProjectData = event.detail;
		if (!selectedProjectData) {
			return;
		}

		const requestedProjectId =
			selectedProjectData.id === 'new' ? null : (selectedProjectData.id ?? null);
		if (brainDumpV2Store.isProjectBeingProcessed(requestedProjectId)) {
			const projectName = selectedProjectData?.name ?? 'this project';
			toastService.warning(
				`Finish or cancel the in-progress brain dump for ${
					selectedProjectData.id === 'new' ? 'your new project' : projectName
				} before switching to it.`
			);
			return;
		}
		const oldProjectId = selectedProject?.id;

		brainDumpActions.selectProject(selectedProjectData);

		// Fetch questions for the new project
		await fetchProjectQuestions(selectedProjectData.id);

		if (currentBrainDumpId && oldProjectId !== selectedProjectData.id) {
			try {
				const newProjectId =
					selectedProjectData.id === 'new' ? null : selectedProjectData.id;
				await brainDumpService.updateDraftProject(currentBrainDumpId, newProjectId);
			} catch (error) {
				console.error('Failed to update draft project:', error);
				toastService.warning(
					'Failed to update draft project. Your changes may not be saved.'
				);
			}
		}

		debouncedAutoSave();
	}

	function handleBack() {
		if ($hasUnsavedChanges) {
			autoSave();
		}
		brainDumpActions.setModalView('project-selection');
		brainDumpActions.clearParseResults();
	}

	// PERFORMANCE FIX: Throttle store updates to reduce reactive overhead
	// Limits store mutations to max once per 100ms instead of every keystroke
	const throttledUpdateInput = throttle((text: string) => {
		brainDumpActions.updateInputText(text);
	}, 100);

	function handleTextChange(event: CustomEvent) {
		throttledUpdateInput(event.detail);
		debouncedAutoSave();
	}

	// PHASE 3 OPTIMIZATION: AbortController for auto-save cancellation
	// Provides 90% reduction in unnecessary save preparations
	let saveAbortController: AbortController | null = null; // Controller references should NOT be reactive

	// Auto-save functionality
	function debouncedAutoSave() {
		// IMPORTANT: In multi-mode, skip auto-save - brain dumps are submitted immediately
		if (MULTI_BRAINDUMP_ENABLED) return;

		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}

		// CRITICAL FIX FOR BUG #3: Mark save as pending (queued)
		// This prevents parse from starting while save is in the queue
		saveOperationPending = true;

		autoSaveTimeout = setTimeout(async () => {
			// CRITICAL FIX FOR BUG #1: Don't auto-save until initial load completes
			// This prevents auto-save from creating a new draft before we load the existing one
			if (
				componentMounted &&
				$hasUnsavedChanges &&
				!isProcessing &&
				!isAutoSaving &&
				initialLoadComplete
			) {
				await autoSave();
			} else {
				// If save didn't execute, mark as no longer pending
				saveOperationPending = false;
			}
		}, 2000);
	}

	async function autoSave() {
		// IMPORTANT: In multi-mode, skip auto-save - brain dumps are submitted immediately
		if (MULTI_BRAINDUMP_ENABLED) return;

		// Quick early exit checks
		if (!componentMounted || !$hasUnsavedChanges) return;

		// PHASE 3: Cancel any pending save before starting a new one
		// This is instant and prevents wasted work
		if (saveAbortController) {
			console.log('[AutoSave] Cancelling previous save operation');
			saveAbortController.abort();
			saveAbortController = null;
		}

		// Create new AbortController for this save operation
		saveAbortController = new AbortController();
		const signal = saveAbortController.signal;

		try {
			// Check if already aborted before doing any work
			if (signal.aborted) {
				console.log('[AutoSave] Save aborted before starting');
				return;
			}

			isAutoSaving = true;

			// Perform the save with abort signal
			await performSave(signal);
		} catch (error) {
			// AbortError is expected when we cancel - don't treat as error
			if (error instanceof Error && error.name === 'AbortError') {
				console.log('[AutoSave] Save operation cancelled (expected)');
				return;
			}

			// Handle actual errors
			console.error('Auto-save failed:', error);
			toastService.warning('Auto-save failed. Your draft may not be saved.', {
				duration: 3000
			});
		} finally {
			isAutoSaving = false;
			// CRITICAL FIX FOR BUG #3: Mark save as no longer pending
			// This allows parse operations to proceed
			saveOperationPending = false;
			// Only clear controller if this is still the active one
			// (it might have been replaced by a newer save operation)
			if (saveAbortController?.signal === signal) {
				saveAbortController = null;
			}
		}
	}

	async function performSave(signal: AbortSignal) {
		try {
			// Check abort signal before doing work
			if (signal.aborted) {
				throw new DOMException('Save operation aborted', 'AbortError');
			}

			const selectedProjectId = selectedProject?.id === 'new' ? null : selectedProject?.id;

			// Pass abort signal to the API call so browser can cancel the request
			const response = await brainDumpService.saveDraft(
				inputText,
				currentBrainDumpId || undefined,
				selectedProjectId ?? null,
				{ signal }
			);

			// Check again after async operation
			if (signal.aborted) {
				throw new DOMException('Save operation aborted', 'AbortError');
			}

			if (response?.data?.brainDumpId) {
				brainDumpActions.setSavedContent(inputText, response.data.brainDumpId);
			}
		} catch (error) {
			// Re-throw to be handled by autoSave
			throw error;
		}
	}

	async function handleSave() {
		await autoSave();
	}

	// Parse brain dump
	async function parseBrainDump(event?: CustomEvent) {
		const autoAccept = event?.detail?.autoAccept || false;
		console.log('[BrainDumpModal] ========== parseBrainDump CALLED ==========', {
			autoAccept,
			hasParseResults: !!parseResults,
			canParse: $canParse,
			inputText: inputText?.substring(0, 50) + '...',
			currentBrainDumpId,
			selectedProject: selectedProject?.name,
			phase: currentPhase,
			mutex: isProcessing
		});

		// CRITICAL FIX FOR BUG #3: If auto-save is pending (queued or executing), abort it and wait for cleanup
		// This prevents race conditions between save and parse operations
		// - If it's queued: clear the timeout
		// - If it's executing: abort the request via AbortController
		if (saveOperationPending) {
			if (autoSaveTimeout) {
				console.log('[Parse] Clearing pending auto-save timeout before parsing');
				clearTimeout(autoSaveTimeout);
				autoSaveTimeout = null;
				saveOperationPending = false;
			}
			if (isAutoSaving && saveAbortController) {
				console.log('[Parse] Aborting active auto-save before parsing');
				saveAbortController.abort();
				// Wait briefly for abort to propagate
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		}

		// Clear any existing parse results before starting new parsing
		if (parseResults) {
			brainDumpActions.clearParseResults();
		}

		// Validate we can parse
		if (!$canParse) {
			console.error('[BrainDumpModal] Cannot parse - validation failed', {
				inputTextLength: inputText.trim().length,
				phase: currentPhase,
				mutex: isProcessing,
				hasParseResults: !!parseResults,
				storeState: get(brainDumpV2Store).processing
			});
			toastService.error('Cannot process: validation failed. Check console for details.');
			return;
		}

		// Save the brain dump if not already saved (LEGACY MODE ONLY)
		// In multi-mode, brain dumps are submitted immediately without saving drafts
		if (!MULTI_BRAINDUMP_ENABLED && !currentBrainDumpId) {
			console.log('[BrainDumpModal] Saving brain dump first before parsing');
			try {
				await handleSave();
				// Double-check that save completed
				const afterSaveId = get(brainDumpV2Store).core.currentBrainDumpId;
				console.log('[BrainDumpModal] After save, brainDumpId:', afterSaveId);
				if (!afterSaveId) {
					console.error('[Parse] Save did not complete successfully - no brainDumpId');
					toastService.error('Failed to save brain dump before parsing');
					return;
				}
			} catch (error) {
				console.error('[Parse] Save failed with error:', error);
				toastService.error('Failed to save brain dump: ' + (error as Error).message);
				return;
			}
		}

		// Cancel any existing operations
		if (abortController) {
			abortController.abort();
			abortController = null;
		}

		// Always use dual processing - preparatory analysis will optimize automatically
		const processingType: 'dual' = 'dual';

		console.log('[BrainDumpModal] Starting processing', {
			processingType,
			inputLength: inputText.length,
			projectId: selectedProject?.id,
			brainDumpId: currentBrainDumpId
		});

		// Start handoff transition with visual feedback
		isHandingOff = true;

		// Start processing through unified store
		let processingStarted = false;

		if (MULTI_BRAINDUMP_ENABLED) {
			// Multi-brain dump mode: Create dedicated backend draft to ensure persistence
			let brainDumpId: string | null = null;
			try {
				const selectedProjectIdForDraft =
					selectedProject?.id && selectedProject.id !== 'new' ? selectedProject.id : null;

				const draftResponse = await brainDumpService.saveDraft(
					inputText,
					undefined,
					selectedProjectIdForDraft,
					{ forceNew: true }
				);

				brainDumpId = draftResponse?.data?.brainDumpId ?? null;
			} catch (error) {
				console.error(
					'[BrainDumpModal] Failed to create brain dump draft for multi-mode:',
					error
				);
				toastService.error('Unable to start brain dump. Please try again.');
				isHandingOff = false;
				return;
			}

			if (!brainDumpId) {
				console.error('[BrainDumpModal] Draft creation did not return a brainDumpId');
				toastService.error('Unable to start brain dump. Please try again.');
				isHandingOff = false;
				return;
			}

			console.log('[BrainDumpModal] Starting brain dump in multi-mode:', {
				brainDumpId,
				processingType,
				currentActive: brainDumpV2Store.getActiveBrainDumpCount()
			});

			processingStarted = await brainDumpV2Store.startBrainDump(brainDumpId, {
				inputText: inputText,
				selectedProject: selectedProject,
				isNewProject: selectedProject?.id === 'new',
				processingType: processingType,
				autoAcceptEnabled: autoAccept,
				displayedQuestions: displayedQuestions
			});

			if (processingStarted) {
				console.log('[BrainDumpModal] Brain dump started successfully:', brainDumpId);
			} else {
				// Brain dump was queued due to concurrency limit
				console.log('[BrainDumpModal] Brain dump queued (max concurrent reached)');
				toastService.info('Brain dump queued - 3 brain dumps already processing', {
					duration: 5000
				});
			}
		} else {
			// Legacy mode: Use original startProcessing method
			console.log('[BrainDumpModal] Starting brain dump in legacy mode');

			processingStarted = await brainDumpActions.startProcessing({
				brainDumpId: currentBrainDumpId || 'temp',
				type: processingType,
				autoAcceptEnabled: autoAccept,
				inputText: inputText,
				selectedProject: selectedProject,
				displayedQuestions: displayedQuestions
			});
		}

		console.log('[BrainDumpModal] Processing started', {
			processingStarted,
			multiMode: MULTI_BRAINDUMP_ENABLED
		});

		// Wait for transition animation to start
		await tick();

		// Use View Transition API if supported for smooth morph effect
		const supportsViewTransitions = browser && 'startViewTransition' in document;

		const performHandoff = async () => {
			// Add a smooth fade-out transition before closing (300ms matches CSS transition)
			await new Promise((resolve) => setTimeout(resolve, 300));

			if (MULTI_BRAINDUMP_ENABLED) {
				// Multi-brain dump mode: Just close the modal
				// The bridge will handle creating/managing the notification
				console.log(
					'[BrainDumpModal] Closing modal (multi-mode - bridge handles notification)'
				);
			} else {
				// Legacy mode: Complete modal handoff to notification
				console.log('[BrainDumpModal] Completing modal handoff');
				brainDumpActions.completeModalHandoff();

				// Check the store state after handoff
				const storeState = get(brainDumpV2Store);
				console.log('[BrainDumpModal] Store state after handoff', {
					notificationOpen: storeState.ui.notification.isOpen,
					notificationMinimized: storeState.ui.notification.isMinimized,
					modalOpen: storeState.ui.modal.isOpen
				});
			}

			// Clean up modal-specific state but don't reset the entire store
			cleanup();

			// Reset handoff state
			isHandingOff = false;

			// Request parent to close the modal - parent will trigger handleModalClose via prop change
			isOpen = false;
			dispatch('close');
		};

		// Wrap in view transition for smooth morphing effect
		if (supportsViewTransitions) {
			try {
				// @ts-ignore - View Transition API not fully typed yet
				await document.startViewTransition(performHandoff).finished;
			} catch (error) {
				// Fallback if view transition fails
				console.warn('[BrainDumpModal] View transition failed, using fallback:', error);
				await performHandoff();
			}
		} else {
			// Fallback for browsers that don't support view transitions
			await performHandoff();
		}
	}

	// Apply operations
	async function applyOperations() {
		if (!$canApply) return;

		brainDumpActions.setProcessingPhase('saving');
		brainDumpActions.setVoiceError('');

		try {
			const enabledOperations = parseResults!.operations.filter(
				(op) => !disabledOperations.has(op.id)
			);

			const response = await brainDumpService.saveBrainDump({
				operations: enabledOperations,
				originalText: inputText,
				insights: parseResults!.insights,
				summary: parseResults!.summary,
				title: parseResults!.title,
				projectQuestions: parseResults?.projectQuestions || [],
				brainDumpId: currentBrainDumpId || undefined,
				selectedProjectId: !isNewProject ? selectedProject?.id : undefined
			});

			if (response?.data?.failedOperations > 0) {
				const successMessage = `Completed: ${response.data.successfulOperations} operations succeeded`;
				const errorMessage = `${response.data.failedOperations} operations failed`;

				// Set execution summary for the store
				brainDumpActions.setExecutionSummary({
					successful: response.data.successfulOperations || 0,
					failed: response.data.failedOperations || 0,
					details: response.data.results || []
				});

				if (response.data.successfulOperations > 0) {
					console.warn(`Partial success: ${successMessage}, ${errorMessage}`);
					brainDumpActions.setVoiceError(`Warning: ${errorMessage}. ${successMessage}.`);
					toastService.warning(
						`${response.data.failedOperations} operations failed, but ${response.data.successfulOperations} succeeded.`
					);
					// Set partial failure flag
					brainDumpActions.setOperationErrors(
						(response.data.results || [])
							.filter((result) => result.error)
							.map((result) => ({
								operationId: result.id,
								table: result.table,
								operation: result.operation,
								error: result.error
							}))
					);
				} else {
					console.error(`All operations failed: ${errorMessage}`);
					brainDumpActions.setVoiceError(`Save failed: ${errorMessage}`);
					brainDumpActions.setProcessingPhase('idle');
					toastService.error(
						'All operations failed. Please check your input and try again.'
					);
					return;
				}
			} else {
				// Clear any previous errors on successful save
				brainDumpActions.clearErrors();
				brainDumpActions.setExecutionSummary({
					successful: response?.data?.successfulOperations || enabledOperations.length,
					failed: 0
				});
			}

			// Simplified project ID extraction
			let projectId = null;

			// Priority 1: Use ID from response
			if (response?.data?.projectInfo?.id) {
				projectId = response.data.projectInfo.id;
			}
			// Priority 2: For existing projects, use the selected project's ID
			else if (!isNewProject && selectedProject?.id) {
				projectId = selectedProject.id;
			}
			// Priority 3: Log if no ID is available
			else {
				// This should only happen if the backend didn't return an ID
				// Log this as it indicates a backend issue
				console.warn('Project created but no ID returned in response:', {
					projectInfo: response?.data?.projectInfo,
					isNewProject: isNewProject
				});

				// Don't make additional database calls - this indicates a backend issue
				// that should be fixed server-side
			}

			let projectName = response?.data?.projectInfo?.name;
			if (!projectName && !isNewProject) {
				projectName = $selectedProjectName;
			}
			if (!projectName) {
				projectName = 'New Project';
			}

			brainDumpActions.setSuccessData({
				brainDumpId: response?.data?.brainDumpId,
				brainDumpType: isNewProject ? 'project' : 'update',
				projectId: projectId,
				projectName: projectName,
				isNewProject: response?.data?.projectInfo?.isNew ?? isNewProject,
				operationsCount: response?.data?.successfulOperations,
				failedOperations: response?.data?.failedOperations,
				operationErrors:
					response?.data?.failedOperations > 0
						? (response.data.results || [])
								.filter((result) => result.error)
								.map((result) => ({
									operationId: result.id,
									table: result.table,
									operation: result.operation,
									error: result.error
								}))
						: undefined
			});

			brainDumpActions.setModalView('success');

			// Clean up the draft so it doesn't reload when reopening the modal
			if (currentBrainDumpId) {
				try {
					await brainDumpService.deleteDraft(currentBrainDumpId);
					console.log('[BrainDumpModal] Draft cleaned up after successful save');
				} catch (deleteError) {
					console.warn(
						'[BrainDumpModal] Failed to delete draft after save:',
						deleteError
					);
					// Non-fatal - the backend should have marked it as 'saved' anyway
				}
			}

			// Skip global invalidation - project data will be refreshed when navigating
			// or updated via real-time subscriptions if staying on the same page
			// invalidateAll();  // REMOVED: Causes performance issues
		} catch (error) {
			console.error('Save error:', error);
			let errorMessage = 'Failed to save brain dump';
			if (error instanceof Error) {
				errorMessage = `Save failed: ${error.message}`;
			}
			brainDumpActions.setVoiceError(errorMessage);
			brainDumpActions.setProcessingPhase('idle');
			toastService.error(errorMessage);
		}
	}

	// Voice recording functions - now using VoiceRecordingService
	async function startRecording() {
		if (!isVoiceSupported) return;

		// Clear any previous errors
		brainDumpActions.setVoiceError('');

		// Set initializing state BEFORE starting (for UI feedback only - doesn't delay recording)
		brainDumpActions.setVoiceCapabilities({ isInitializingRecording: true });

		try {
			// Start recording - this is where the actual work happens
			await voiceRecordingService.startRecording(inputText);

			// CRITICAL: Clear initializing state FIRST, then set recording state
			// This prevents state overlap that could show "Initializing" instead of "Recording"
			brainDumpActions.setVoiceCapabilities({ isInitializingRecording: false });

			// Now set recording state - button will show recording UI with stop capability
			isCurrentlyRecording = true;
		} catch (error) {
			console.error('Recording error:', error);
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check your permissions.';
			brainDumpActions.setVoiceError(errorMessage);
			brainDumpActions.setVoiceCapabilities({ isInitializingRecording: false });
			isCurrentlyRecording = false;
		}
	}

	async function stopRecording() {
		if (!isCurrentlyRecording) return;

		try {
			await voiceRecordingService.stopRecording(inputText);
			isCurrentlyRecording = false;
		} catch (error) {
			console.error('Stop recording error:', error);
			isCurrentlyRecording = false;
		}
	}

	// Success handlers
	async function handleGoToProject() {
		try {
			const projectId = successData?.projectId;
			const projectName = successData?.projectName || 'Project';

			if (!projectId) {
				// This should rarely happen due to our improved ID extraction
				console.error('No project ID available in success data:', successData);

				// Show user-friendly error
				toastService.error(
					'Unable to navigate to project. Please check the projects page to find your saved work.'
				);

				// Still close the modal
				handleModalClose();
				return;
			}

			// Use smart navigation utility for optimal UX
			await smartNavigateToProject(projectId, projectName, {
				isAutoAccept: false, // This is manual navigation from success view
				isNewProject: successData?.isNewProject,
				onSameProject: () => {
					// Just close modal if on same project
					handleModalClose();
				},
				onNavigate: () => {
					// Close modal before navigation for better UX
					handleModalClose();
				}
			});
		} catch (error) {
			console.error('Error in handleGoToProject:', error);
			toastService.error('An error occurred while navigating to the project');
			handleModalClose();
		}
	}

	function handleStartNew() {
		brainDumpActions.resetForNewSession();
		brainDumpActions.openModal();
		brainDumpActions.clearParseResults();
	}

	function handleContinueWithAgent(event: CustomEvent) {
		const { projectId } = event.detail;
		// Close brain dump modal
		handleModalClose();
		// Dispatch event to parent to open agent modal
		dispatch('openAgent', { projectId, chatType: 'project_update' });
	}

	// Keep edit operation handler for potential future use
	async function handleEditOperation(event: CustomEvent) {
		await loadOperationEditModal();
		editModal = { isOpen: true, operation: event.detail };
	}

	function handleSaveOperation(updatedOperation: ParsedOperation) {
		brainDumpActions.updateOperation(updatedOperation);
		editModal = { isOpen: false, operation: null };
	}

	onDestroy(() => {
		componentMounted = false;
		cleanup('destroy');
	});
</script>

<svelte:window bind:innerWidth />

<Modal
	{isOpen}
	onClose={handleModalClose}
	title=""
	size="lg"
	showCloseButton={!isProcessing}
	closeOnBackdrop={!isProcessing}
	closeOnEscape={!isProcessing}
	persistent={isProcessing}
	customClasses="brain-dump-modal"
>
	<div
		slot="header"
		class="brain-dump-modal-header bg-gradient-to-r from-purple-50/50 to-pink-50/50 dark:from-purple-900/20 dark:to-pink-900/20"
	>
		<div
			class="header-content"
			data-brain-dump-header={enableViewTransitions && isOpen ? true : undefined}
			style={enableViewTransitions && isOpen
				? '--brain-dump-header-name: brain-dump-header'
				: ''}
		>
			<div class="flex items-center">
				<div
					class="p-1.5 bg-gradient-to-br from-purple-100/50 to-pink-100/50 dark:from-purple-800/30 dark:to-pink-800/30 rounded-xl mr-3 overflow-hidden"
					data-brain-dump-indicator={enableViewTransitions && isOpen ? true : undefined}
					style={enableViewTransitions && isOpen
						? '--brain-dump-indicator-name: brain-dump-indicator'
						: ''}
				>
					<!-- brain-bolt animation video -->
					{#if isOpen}
						<video
							src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
							autoplay
							loop
							muted
							playsinline
							class="w-8 h-8 rounded-lg"
						></video>
					{/if}
				</div>
				<div>
					<h2 class="text-xl font-bold text-gray-900 dark:text-white">Brain Dump</h2>
					<p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
						Organize your thoughts into actionable tasks
					</p>
				</div>
			</div>
			{#if !isProcessing}
				<Button
					variant="ghost"
					on:click={handleModalClose}
					class="close-button"
					aria-label="Close dialog"
					icon={X}
				></Button>
			{/if}
		</div>
	</div>

	<!-- Main Content - Always show immediately -->
	<!-- Main Content -->
	<div
		class="brain-dump-modal-content {currentView === 'recording' ? 'p-0' : ''} {isHandingOff
			? 'handing-off'
			: ''}"
		class:opacity-50={isHandingOff}
		class:transition-opacity={true}
		class:duration-300={true}
	>
		{#if isHandingOff}
			<!-- Handoff transition message -->
			<div
				class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-50 rounded-lg"
			>
				<div class="text-center">
					<LoaderCircle class="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
					<p class="text-sm text-gray-600 dark:text-gray-400">Starting processing...</p>
				</div>
			</div>
		{/if}
		{#if currentView === 'project-selection'}
			{#if ProjectSelectionView}
				<div in:fade={{ duration: 300 }} out:fade={{ duration: 200 }}>
					<ProjectSelectionView
						projects={isLoadingData ? [] : projects}
						recentDumps={isLoadingData ? [] : recentDumps}
						newProjectDraftCount={isLoadingData ? 0 : newProjectDraftCount}
						isLoading={isLoadingData}
						{processingProjectIds}
						on:selectProject={handleProjectSelection}
						inModal={true}
					/>
				</div>
			{:else}
				<!-- Loading state for ProjectSelectionView -->
				<div class="p-6">
					<div class="space-y-4">
						<div class="animate-shimmer">
							<div
								class="h-4 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded w-1/4 mb-4"
							></div>
							<div class="grid grid-cols-2 gap-4">
								{#each [1, 2, 3, 4] as _}
									<div
										class="h-24 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-xl shadow-sm"
									></div>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}
		{:else if currentView === 'recording'}
			{#if RecordingView}
				<div
					in:fade={{ duration: 300, delay: 200 }}
					out:fade={{ duration: 200 }}
					class="h-full flex flex-col"
				>
					<RecordingView
						{innerWidth}
						projects={isLoadingData ? [] : projects}
						{processingProjectIds}
						{selectedProject}
						{inputText}
						{currentPhase}
						{isProcessing}
						{isSaving}
						{voiceError}
						{microphonePermissionGranted}
						{voiceCapabilitiesChecked}
						{isInitializingRecording}
						{canUseLiveTranscript}
						hasUnsavedChanges={$hasUnsavedChanges}
						{isVoiceSupported}
						{isCurrentlyRecording}
						{recordingDuration}
						{accumulatedTranscript}
						{isLiveTranscribing}
						{displayedQuestions}
						showOverlay={!!showProcessingOverlay}
						allowProjectChange={!project}
						inModal={true}
						on:back={handleBack}
						on:textChange={handleTextChange}
						on:save={handleSave}
						on:parse={parseBrainDump}
						on:startRecording={startRecording}
						on:stopRecording={stopRecording}
						on:selectProject={handleProjectChangeInRecording}
					/>
				</div>

				<!-- Processing Modal - DISABLED: Now handled by ProcessingNotification -->
				<!-- {#if ProcessingModal && (isDualProcessing || isRegularProcessing)}
					<ProcessingModal
						isOpen={isDualProcessing || isRegularProcessing}
						processingType={isDualProcessing ? 'dual' : 'single'}
						bind:dualProcessingComponent
						{contextResult}
						{tasksResult}
						isShortBraindump={isShortBraindumpForProject}
						on:cancel={handleCancelProcessing}
					/>
				{/if} -->

				<!-- Parse Results Modal - DISABLED: Now handled by ProcessingNotification -->
				<!-- {#if ParseResultsDiffView && parseResults && showingParseResults && !isDualProcessing && !isRegularProcessing}
					<ParseResultsDiffView
						parseResults={parseResults}
						disabledOperations={disabledOperations}
						enabledOperationsCount={$enabledOperationsCount}
						isProcessing={isProcessing}
						projectId={selectedProject?.id === 'new' ? null : selectedProject?.id}
						on:toggleOperation={handleToggleOperation}
						on:updateOperation={handleUpdateOperation}
						on:removeOperation={handleRemoveOperation}
						on:editOperation={handleEditOperation}
						on:apply={applyOperations}
						on:cancel={handleCancelParse}
					/>
				{/if} -->
			{:else}
				<!-- Simple loading/fallback UI for RecordingView while component loads -->
				<div class="p-6">
					<div class="space-y-4">
						<!-- Show a basic textarea immediately so users can start typing -->
						<textarea
							class="w-full h-64 p-4 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
							placeholder="Start typing or use voice recording..."
							value={inputText}
							oninput={(e) => {
								throttledUpdateInput(e.currentTarget.value);
								debouncedAutoSave();
							}}
						></textarea>
						<div class="text-sm text-gray-500 dark:text-gray-400">
							Loading full interface...
						</div>
					</div>
				</div>
			{/if}
		{:else if currentView === 'success'}
			{#if SuccessView}
				<div in:fade={{ duration: 300, delay: 200 }} out:fade={{ duration: 200 }}>
					<SuccessView
						{successData}
						{showNavigationOnSuccess}
						inModal={true}
						on:goToProject={handleGoToProject}
						on:startNew={handleStartNew}
						on:continueWithAgent={handleContinueWithAgent}
						on:close={handleModalClose}
					/>
				</div>
			{:else}
				<!-- Loading state for SuccessView -->
				<div class="p-6 text-center">
					<div class="animate-pulse">
						<div
							class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto mb-4"
						></div>
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto"></div>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</Modal>

<!-- Operation Edit Modal -->
{#if OperationEditModal && editModal.isOpen}
	<OperationEditModal
		isOpen={editModal.isOpen}
		operation={editModal.operation}
		onSave={handleSaveOperation}
		onClose={() => (editModal = { isOpen: false, operation: null })}
	/>
{/if}

<!-- Processing Notification moved to page level to persist when modal closes -->

<style>
	:global(.brain-dump-modal) {
		/* Ensure modal is sized appropriately */
		max-height: 90vh;
	}

	:global(.brain-dump-modal .modal-content) {
		/* Allow scrolling within modal if needed */
		overflow-y: auto;
		max-height: calc(90vh - 120px);
	}

	.brain-dump-modal-header {
		padding: 1.5rem;
		border-bottom: 1px solid rgba(229, 231, 235, 0.5);
		backdrop-filter: blur(8px);
		border-radius: 0.75rem 0.75rem 0 0;
	}

	:global(.dark) .brain-dump-modal-header {
		border-bottom-color: rgba(55, 65, 81, 0.5);
	}

	.brain-dump-modal-content {
		min-height: 350px;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 640px) {
		.brain-dump-modal-content {
			min-height: calc(100vh - 250px);
		}
	}

	/* Shimmer animation */
	@keyframes shimmer {
		0% {
			background-position: -200% center;
		}
		100% {
			background-position: 200% center;
		}
	}

	.animate-shimmer {
		background-size: 200% 100%;
		animation: shimmer 2s ease-in-out infinite;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		width: 100%;
	}

	/* Apply styles globally since the Button component encapsulates styles */
	:global(.close-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: rgb(107 114 128);
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
		margin-left: 1rem;
	}

	:global(.close-button:hover) {
		background: rgb(243 244 246);
		color: rgb(55 65 81);
	}

	:global(.dark .close-button) {
		color: rgb(156 163 175);
	}

	:global(.dark .close-button:hover) {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	/* View Transition Styles */
	@media (prefers-reduced-motion: no-preference) {
		/* Enable view transitions for brain dump with unique identifiers */
		:global([data-brain-dump-indicator]) {
			view-transition-name: var(--brain-dump-indicator-name);
			contain: layout;
		}

		:global([data-brain-dump-header]) {
			view-transition-name: var(--brain-dump-header-name);
			contain: layout;
		}

		/* Customize the transition animations */
		:global(::view-transition-old(brain-dump-indicator)),
		:global(::view-transition-new(brain-dump-indicator)) {
			animation-duration: 450ms;
			animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		}

		:global(::view-transition-old(brain-dump-header)),
		:global(::view-transition-new(brain-dump-header)) {
			animation-duration: 450ms;
			animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		}

		/* Smooth fade for the root transition */
		:global(::view-transition-old(root)),
		:global(::view-transition-new(root)) {
			animation-duration: 350ms;
			animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
		}

		/* Add a subtle scale effect to the indicator */
		:global(::view-transition-old(brain-dump-indicator)) {
			animation-name: brain-dump-indicator-out;
		}

		:global(::view-transition-new(brain-dump-indicator)) {
			animation-name: brain-dump-indicator-in;
		}

		@keyframes brain-dump-indicator-out {
			from {
				transform: scale(1);
				opacity: 1;
			}
			to {
				transform: scale(0.8);
				opacity: 0.8;
			}
		}

		@keyframes brain-dump-indicator-in {
			from {
				transform: scale(1.2);
				opacity: 0.8;
			}
			to {
				transform: scale(1);
				opacity: 1;
			}
		}

		/* Smooth morph for the header */
		:global(::view-transition-old(brain-dump-header)) {
			animation-name: brain-dump-header-out;
		}

		:global(::view-transition-new(brain-dump-header)) {
			animation-name: brain-dump-header-in;
		}

		@keyframes brain-dump-header-out {
			from {
				transform: translateY(0);
				opacity: 1;
			}
			to {
				transform: translateY(-20px);
				opacity: 0;
			}
		}

		@keyframes brain-dump-header-in {
			from {
				transform: translateY(20px) scale(0.95);
				opacity: 0;
			}
			to {
				transform: translateY(0) scale(1);
				opacity: 1;
			}
		}
	}
</style>
