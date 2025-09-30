<!-- src/lib/components/brain-dump/BrainDumpModal.svelte -->
<script lang="ts">
	import { onDestroy, createEventDispatcher, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import Modal from '$lib/components/ui/Modal.svelte';

	// Lazy load heavy components
	let ProjectSelectionView: any;
	let RecordingView: any;
	let ParseResultsDiffView: any;
	let SuccessView: any;
	let ProcessingModal: any;
	let DualProcessingResults: any;
	let OperationEditModal: any;

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

	// Store actions are accessed via brainDumpV2Store methods
	const brainDumpActions = brainDumpV2Store;

	// FIXED: Use Svelte 5 $derived for massive performance improvement (was 20+ derived stores)
	// This reduces overhead by ~50% - single reactive source instead of 20+ subscriptions
	let storeState = $derived($brainDumpV2Store);
	let modalIsOpenFromStore = $derived(storeState?.ui?.modal?.isOpen ?? false);
	let currentView = $derived(storeState?.ui?.modal?.currentView ?? 'project-selection');
	let selectedProject = $derived(storeState?.core?.selectedProject ?? null);
	let inputText = $derived(storeState?.core?.inputText ?? '');
	let currentPhase = $derived(storeState?.processing?.phase ?? 'idle');
	let isProcessing = $derived(storeState?.processing?.mutex ?? false);
	let isSaving = $derived(storeState?.processing?.phase === 'saving');
	let voiceError = $derived(storeState?.core?.voice?.error ?? '');
	let parseResults = $derived(storeState?.core?.parseResults ?? null);
	let showingParseResults = $derived(storeState?.ui?.textarea?.showingParseResults ?? false);
	let disabledOperations = $derived(storeState?.core?.disabledOperations ?? new Set());
	let successData = $derived(storeState?.results?.success ?? null);
	let microphonePermissionGranted = $derived(
		storeState?.core?.voice?.microphonePermissionGranted ?? false
	);
	let voiceCapabilitiesChecked = $derived(storeState?.core?.voice?.capabilitiesChecked ?? false);
	let isInitializingRecording = $derived(
		storeState?.core?.voice?.isInitializingRecording ?? false
	);
	let canUseLiveTranscript = $derived(storeState?.core?.voice?.canUseLiveTranscript ?? false);
	let currentBrainDumpId = $derived(storeState?.core?.currentBrainDumpId ?? '');
	let lastSavedContent = $derived(storeState?.core?.lastSavedContent ?? '');
	let isNewProject = $derived(storeState?.core?.isNewProject ?? false);

	// Service imports
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { shouldUseDualProcessing } from '$lib/constants/brain-dump-thresholds';
	import { toastService } from '$lib/stores/toast.store';
	import { backgroundBrainDumpService } from '$lib/services/braindump-background.service';
	import { page } from '$app/stores';
	import { smartNavigateToProject } from '$lib/utils/brain-dump-navigation';
	import { voiceRecordingService } from '$lib/services/voiceRecording.service';

	// Processing notification is now managed through unified store

	import type { ParsedOperation, DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';

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
	let recordingDuration = $derived(voiceRecordingService.getRecordingDuration());

	// Auto-save - use regular variable for timers (not reactive)
	let autoSaveTimeout: NodeJS.Timeout | null = null; // Timer handles should NOT be reactive
	let isAutoSaving = $state(false);
	let componentMounted = $state(true);

	// Processing abort controller for cleanup
	let abortController: AbortController | null = null; // Controller references should NOT be reactive

	// Modal state - use $state for reactive objects
	let editModal = $state({ isOpen: false, operation: null as ParsedOperation | null });
	let innerWidth = $state(0);
	let pendingNavigationUrl = $state<string | null>(null);

	// Project questions state
	let displayedQuestions = $state<DisplayedBrainDumpQuestion[]>([]);

	// Computed states - use derived values
	// Use $derived for computed values in Svelte 5
	let showProcessingOverlay = $derived(isAutoSaving || isSaving);
	let projectOptions = $derived([
		{ id: 'new', name: 'New Project / Note', isProject: false },
		...projects
	]);

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
				if (!componentsLoaded.processing) {
					import('./ProcessingModal.svelte').then((m) => {
						ProcessingModal = m.default;
						componentsLoaded.processing = true;
					});
				}
				if (!componentsLoaded.parseResults) {
					import('./ParseResultsDiffView.svelte').then((m) => {
						ParseResultsDiffView = m.default;
						componentsLoaded.parseResults = true;
					});
				}
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
	$effect(() => {
		if (currentView && browser && currentView !== previousView) {
			previousView = currentView;
			loadComponentsForView(currentView);
		}
	});

	// Initialize modal when opened - use $effect for side effects
	$effect(() => {
		if (isOpen && browser && !previousIsOpen && !isInitializing) {
			previousIsOpen = true;
			isInitializing = true;
			initializeModal().finally(() => {
				isInitializing = false;
			});
		} else if (!isOpen) {
			previousIsOpen = false;
		}
	});

	// Clean up when modal closes - use $effect for side effects
	$effect(() => {
		if (!isOpen && browser && previousIsOpen && !isClosing) {
			isClosing = true;
			// Add a small delay to prevent race conditions
			setTimeout(() => {
				handleModalClose().finally(() => {
					isClosing = false;
				});
			}, 50);
		}
	});

	// When modal opens, ensure store is in correct state
	// Remove bidirectional sync to avoid loops
	$effect(() => {
		// Only sync when modal is being opened (not on every change)
		// Don't sync if we're in the middle of closing
		if (isOpen && !previousIsOpen && browser && !isClosing) {
			console.log('[BrainDumpModal] Modal opening - ensuring store is ready');
			// Open the modal in the store if it's not already open
			if (!modalIsOpenFromStore) {
				brainDumpActions.openModal();
			}
		}
	});

	async function initializeModal() {
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
			const response = await brainDumpService.getInitData(project?.id);

			if (response?.data) {
				projects = response.data.projects || [];
				recentDumps = response.data.recentBrainDumps || [];
				newProjectDraftCount = response.data.newProjectDraftCount || 0;

				// If project was passed as prop, load its data
				if (project) {
					// Fetch questions in background
					fetchProjectQuestions(project.id);

					// Load draft for the selected project if exists
					if (response.data.currentDraft?.brainDump) {
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
					}
				}
			}
		} catch (error) {
			console.error('Failed to load brain dump data:', error);
			// Don't show error toast for background data loading
			// The UI is still functional even without the data
		}
	}

	async function handleModalClose() {
		console.log('[BrainDumpModal] handleModalClose called');

		// Check if notification is open (which means we handed off to processing)
		// Use the derived storeState instead of calling get() to avoid reactivity issues
		const isHandedOff = storeState?.ui?.notification?.isOpen ?? false;

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
		cleanup();

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

	function cleanup() {
		// FIXED: Comprehensive memory cleanup to prevent leaks
		console.log('[BrainDumpModal] Starting comprehensive cleanup');

		// 0. Abort any active SSE/streaming connections
		if (abortController) {
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
		ParseResultsDiffView = null;
		SuccessView = null;
		ProcessingModal = null;
		DualProcessingResults = null;
		OperationEditModal = null;
		componentsLoaded = { ...initialComponentLoadState };

		// 8. Release processing mutex if held (emergency release)
		const currentState = get(brainDumpV2Store);
		if (currentState.processing.mutex) {
			console.warn('[Cleanup] Emergency mutex release on component destroy');
			brainDumpV2Store.releaseMutex();
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
		brainDumpActions.selectProject(selectedProjectData);

		// Fetch questions for the selected project
		await fetchProjectQuestions(selectedProjectData.id);

		// Load draft for selected project
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

	function handleTextChange(event: CustomEvent) {
		brainDumpActions.updateInputText(event.detail);
		debouncedAutoSave();
	}

	// CRITICAL FIX: Add save operation mutex to prevent race conditions
	let saveOperationId = 0; // Simple counter, doesn't need to be reactive
	let activeSavePromise: Promise<any> | null = null; // Promise references should NOT be reactive
	let saveMutex = false; // Mutex flag to prevent concurrent saves

	// Auto-save functionality
	function debouncedAutoSave() {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}

		autoSaveTimeout = setTimeout(async () => {
			if (componentMounted && $hasUnsavedChanges && !isProcessing && !isAutoSaving) {
				await autoSave();
			}
		}, 2000);
	}

	async function autoSave() {
		// CRITICAL FIX: Check mutex first to prevent race conditions
		if (!componentMounted || !$hasUnsavedChanges) return;

		// Check mutex - if already saving, skip this call
		if (saveMutex) {
			console.log('[AutoSave] Save already in progress (mutex locked), skipping');
			return;
		}

		// Acquire mutex immediately
		saveMutex = true;

		try {
			// Increment operation ID to track this specific save
			const currentOperationId = ++saveOperationId;
			isAutoSaving = true;

			// Create and track the save promise
			activeSavePromise = performSave(currentOperationId);

			await activeSavePromise;

			// Only clear if this was the last operation
			if (saveOperationId === currentOperationId) {
				activeSavePromise = null;
			}
		} finally {
			isAutoSaving = false;
			// CRITICAL: Always release mutex
			saveMutex = false;
		}
	}

	async function performSave(operationId: number) {
		// Saving state handled by processing phase
		// brainDumpActions.setSaving(true);

		try {
			const selectedProjectId = selectedProject?.id === 'new' ? null : selectedProject?.id;

			const response = await brainDumpService.saveDraft(
				inputText,
				currentBrainDumpId || undefined,
				selectedProjectId
			);

			if (response?.data?.brainDumpId) {
				brainDumpActions.setSavedContent(inputText, response.data.brainDumpId);
			}
		} catch (error) {
			console.error('Auto-save failed:', error);
			toastService.warning('Auto-save failed. Your draft may not be saved.', {
				duration: 3000
			});
		} finally {
			isAutoSaving = false;
			// Saving state handled by processing phase
			// brainDumpActions.setSaving(false);
		}
	}

	async function handleSave() {
		// FIXED: Ensure no concurrent saves
		await autoSave();
	}

	// Parse brain dump
	async function parseBrainDump(event?: CustomEvent) {
		const autoAccept = event?.detail?.autoAccept || false;
		console.log('[BrainDumpModal] Starting parseBrainDump', {
			autoAccept,
			hasParseResults: !!parseResults
		});

		// FIXED: Wait for any active save operations to complete before parsing
		if (activeSavePromise) {
			console.log('[Parse] Waiting for active save to complete before parsing');
			try {
				await activeSavePromise;
			} catch (e) {
				console.error('[Parse] Save failed, continuing with parse:', e);
			}
		}

		// Clear any existing parse results before starting new parsing
		if (parseResults) {
			brainDumpActions.clearParseResults();
		}

		// Validate we can parse
		if (!$canParse) {
			console.log('[BrainDumpModal] Cannot parse - validation failed');
			return;
		}

		// Save the brain dump if not already saved
		if (!currentBrainDumpId) {
			console.log('[BrainDumpModal] Saving brain dump first');
			await handleSave();
			// Double-check that save completed
			if (!currentBrainDumpId) {
				console.error('[Parse] Save did not complete successfully');
				toastService.error('Failed to save brain dump before parsing');
				return;
			}
		}

		// Cancel any existing operations
		if (abortController) {
			abortController.abort();
			abortController = null;
		}

		// Determine processing type based on content length and project
		const inputLength = inputText.length;
		const isShortBraindump =
			selectedProject?.id !== 'new' && selectedProject?.id && inputLength < 500;

		let processingType: 'short' | 'dual';

		if (isShortBraindump) {
			processingType = 'short';
		} else {
			processingType = 'dual';
		}

		console.log('[BrainDumpModal] Processing type determined', {
			processingType,
			inputLength,
			projectId: selectedProject?.id,
			brainDumpId: currentBrainDumpId
		});

		// Start handoff transition with visual feedback
		isHandingOff = true;

		// Start processing through unified store
		const processingStarted = await brainDumpActions.startProcessing({
			brainDumpId: currentBrainDumpId || 'temp',
			type: processingType,
			autoAcceptEnabled: autoAccept,
			inputText: inputText,
			selectedProject: selectedProject,
			displayedQuestions: displayedQuestions
		});

		console.log('[BrainDumpModal] Processing started', { processingStarted });

		// Wait for transition animation to start
		await tick();

		// Add a smooth fade-out transition before closing (300ms matches CSS transition)
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Complete modal handoff to notification
		console.log('[BrainDumpModal] Completing modal handoff');
		brainDumpActions.completeModalHandoff();

		// Check the store state after handoff
		const storeState = get(brainDumpV2Store);
		console.log('[BrainDumpModal] Store state after handoff', {
			notificationOpen: storeState.ui.notification.isOpen,
			notificationMinimized: storeState.ui.notification.isMinimized,
			modalOpen: storeState.ui.modal.isOpen
		});

		// Clean up modal-specific state but don't reset the entire store
		cleanup();

		// Reset handoff state
		isHandingOff = false;

		// Request parent to close the modal - parent will trigger handleModalClose via prop change
		isOpen = false;
		dispatch('close');
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
				projectName = selectedProjectName;
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

		try {
			brainDumpActions.setVoiceError('');
			brainDumpActions.setVoiceCapabilities({ isInitializingRecording: true });

			await voiceRecordingService.startRecording(inputText);

			isCurrentlyRecording = true;
			brainDumpActions.setVoiceCapabilities({ isInitializingRecording: false });
		} catch (error) {
			console.error('Recording error:', error);
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check your permissions.';
			brainDumpActions.setVoiceError(errorMessage);
			isCurrentlyRecording = false;
			brainDumpActions.setVoiceCapabilities({ isInitializingRecording: false });
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
		brainDumpActions.reset();
		brainDumpActions.setModalView('project-selection');
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
		cleanup();
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
		<div class="header-content">
			<div class="flex items-center">
				<div
					class="p-2 bg-gradient-to-br from-purple-100/50 to-pink-100/50 dark:from-purple-800/30 dark:to-pink-800/30 rounded-xl mr-3"
				>
					<div class="w-2 h-2 bg-purple-500 rounded-full"></div>
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
					<svelte:component
						this={ProjectSelectionView}
						projects={isLoadingData ? [] : projects}
						recentDumps={isLoadingData ? [] : recentDumps}
						newProjectDraftCount={isLoadingData ? 0 : newProjectDraftCount}
						isLoading={isLoadingData}
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
					<svelte:component
						this={RecordingView}
						{innerWidth}
						projects={isLoadingData ? [] : projects}
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
					<svelte:component
						this={ProcessingModal}
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
					<svelte:component
						this={ParseResultsDiffView}
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
							on:input={(e) => {
								brainDumpActions.updateInputText(e.currentTarget.value);
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
					<svelte:component
						this={SuccessView}
						{successData}
						{showNavigationOnSuccess}
						inModal={true}
						on:goToProject={handleGoToProject}
						on:startNew={handleStartNew}
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
	<svelte:component
		this={OperationEditModal}
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
</style>
