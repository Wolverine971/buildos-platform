<!-- apps/web/src/lib/components/brain-dump/BrainDumpProcessingNotification.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { page } from '$app/stores';
	import { smartNavigateToProject } from '$lib/utils/brain-dump-navigation';
	import {
		Loader2,
		CheckCircle,
		AlertCircle,
		X,
		ChevronUp,
		ChevronDown,
		Settings
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { brainDumpAutoAccept } from '$lib/stores/brainDumpPreferences';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService } from '$lib/stores/toast.store';
	import { goto, invalidate } from '$app/navigation';
	// Direct v2 store import (migration complete)
	import { brainDumpV2Store, enabledOperationsCount } from '$lib/stores/brain-dump-v2.store';

	// Store actions accessed via brainDumpV2Store methods
	const brainDumpActions = brainDumpV2Store;
	import type {
		BrainDumpParseResult,
		ParsedOperation,
		ExecutionResult
	} from '$lib/types/brain-dump';
	import type { SaveBrainDumpResponse } from '$lib/services/braindump-api.service';
	import type { StreamingMessage } from '$lib/types/sse-messages';

	// Props - only for backwards compatibility, use store for state
	let { isOpen = false, isMinimized = false } = $props();

	// Direct store subscription using Svelte 5 $derived for proper reactivity
	let storeState = $derived($brainDumpV2Store);
	let brainDumpId = $derived(storeState.core.currentBrainDumpId);
	let parseResults = $derived(storeState.core.parseResults);
	let processingType = $derived(storeState.processing.type);
	let processingPhase = $derived(storeState.processing.phase);
	let jobId = $derived(storeState.processing.jobId);
	let autoAcceptEnabled = $derived(storeState.processing.autoAcceptEnabled);
	let inputText = $derived(storeState.core.inputText || null);
	let selectedProject = $derived(storeState.core.selectedProject || null);
	let displayedQuestions = $derived(storeState.core.displayedQuestions || []);
	let streamingState = $derived(storeState.processing.streaming);

	// Debug logging for phase changes and streaming state using Svelte 5 $effect
	$effect(() => {
		console.log('[BrainDumpProcessingNotification] State update', {
			processingPhase,
			isOpenFromStore,
			isMinimizedFromStore,
			hasParseResults,
			parseResultsNotNull: parseResults !== null,
			operationsCount: parseResults?.operations?.length,
			brainDumpId,
			processingType,
			showMinimized,
			showExpanded,
			showParseResultsContent,
			showProcessingContent,
			showSuccessContent,
			streamingState
		});
	});

	// Modal state using Svelte 5 $derived
	let isOpenFromStore = $derived(storeState.ui.notification.isOpen);
	let isMinimizedFromStore = $derived(storeState.ui.notification.isMinimized);

	// Brain dump core state subscriptions for operation management
	let disabledOperations = $derived(storeState.core.disabledOperations);
	let brainDumpSelectedProject = $derived(storeState.core.selectedProject);
	let enabledOpsCount = $derived($enabledOperationsCount);

	const dispatch = createEventDispatcher();

	type OperationSuccessPayload = SaveBrainDumpResponse | ExecutionResult;

	interface OperationTotals {
		total: number;
		successful: number;
		failed: number;
	}

	interface OperationErrorSummary {
		operationId: string;
		table: string;
		operation: string;
		error: string;
	}

	function isSaveBrainDumpResponse(
		payload: OperationSuccessPayload
	): payload is SaveBrainDumpResponse {
		return 'successfulOperations' in payload;
	}

	function deriveOperationTotals(payload: OperationSuccessPayload): OperationTotals {
		if (isSaveBrainDumpResponse(payload)) {
			const successful = payload.successfulOperations ?? 0;
			const failed = payload.failedOperations ?? 0;
			const total = payload.totalOperations ?? successful + failed;
			return { total, successful, failed };
		}

		const successful = payload.successful?.length ?? 0;
		const failed = payload.failed?.length ?? 0;
		return {
			total: successful + failed,
			successful,
			failed
		};
	}

	function extractOperationErrors(payload: OperationSuccessPayload): OperationErrorSummary[] {
		const failedOperations = isSaveBrainDumpResponse(payload)
			? (payload.results || []).filter((result) => !!result.error)
			: payload.failed || [];

		return failedOperations.map((failed) => ({
			operationId: failed.id,
			table: failed.table,
			operation: failed.operation,
			error: failed.error || 'Unknown error'
		}));
	}

	// Local processing state (moved up to avoid reference errors)
	let processingStarted = false;
	let processingMutex = false; // Mutex to prevent concurrent processing starts
	let parseResultsCommitted = false;

	// Component loading states - use $state for reactivity
	let componentsLoaded = $state({
		parseResults: false,
		processing: false,
		dualProcessing: false,
		success: false
	});

	// FIXED: Component loading promise tracker to prevent race conditions
	const componentLoadingPromises = new Map<string, Promise<any>>();

	// Lazy load heavy components - use $state for reactivity
	let ParseResultsDiffView = $state<any>(null);
	let ProcessingModal = $state<any>(null);
	let DualProcessingResults = $state<any>(null);
	let OperationEditModal = $state<any>(null);
	let SuccessView = $state<any>(null);

	// Component references for streaming - use $state for reactivity
	let dualProcessingComponent = $state<any>(null);
	let processingModalComponent = $state<any>(null);

	// Edit modal state - use $state for reactivity
	let editModal = $state({ isOpen: false, operation: null as ParsedOperation | null });

	// Success state - track when operations have been successfully applied
	let showSuccessView = $state(false);
	let successData = $state<any>(null);

	// Track loading state for apply operations
	let isApplyingOperations = $state(false);

	// Refresh modal state for when user is on same project page
	let showRefreshModal = $state(false);
	let pendingProjectUpdate = $state<{ projectId: string; projectName: string } | null>(null);

	// Track timeouts that need cleanup
	let cleanupTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

	// Computed states using Svelte 5 $derived - Fixed to handle all state transitions
	let isProcessing = $derived(processingPhase === 'parsing');
	// Check for parse results - they exist when parseResults is not null and we're not actively processing
	let hasParseResults = $derived(parseResults !== null && processingPhase !== 'parsing');
	// Primary display state logic - exactly one should be true at any time
	let showMinimized = $derived(isOpenFromStore && isMinimizedFromStore && !showSuccessView);
	let showExpanded = $derived(isOpenFromStore && !isMinimizedFromStore);
	// Determine what content to show when expanded
	let showSuccessContent = $derived(showExpanded && showSuccessView && successData);
	let showParseResultsContent = $derived(showExpanded && !showSuccessView && hasParseResults);
	let showProcessingContent = $derived(
		showExpanded && !showSuccessView && !hasParseResults && isProcessing
	);

	// Auto-accept state using Svelte 5 $derived
	let autoAcceptPreference = $derived(brainDumpAutoAccept.shouldAutoAccept());
	let canAutoAcceptCurrent = $derived(hasParseResults && canAutoAccept(parseResults));

	// Track if user has manually interacted with expand/collapse
	let userHasInteracted = false;
	let hasAutoExpandedForCurrentBrainDump = false;
	let lastAutoExpandBrainDumpId: string | null = null;

	// REMOVED: Auto-expand logic - notification should stay minimized when processing completes
	// User must manually click to expand and see the results
	$effect(() => {
		if (hasParseResults && brainDumpId && brainDumpId !== lastAutoExpandBrainDumpId) {
			// Just track that we have results for this brain dump
			lastAutoExpandBrainDumpId = brainDumpId;
			// Don't auto-expand - let user click to see results
		}
	});

	// Preload components when notification opens to avoid race conditions
	$effect(() => {
		if (isOpenFromStore && !isMinimizedFromStore) {
			// When expanded, immediately load the appropriate component
			if (showSuccessView && !componentsLoaded.success) {
				console.log('[Effect] Modal expanded with success view - loading SuccessView');
				loadSuccessViewComponent();
			} else if (hasParseResults && !showSuccessView && !componentsLoaded.parseResults) {
				console.log(
					'[Effect] Modal expanded with parse results - loading ParseResultsDiffView'
				);
				loadParseResultsComponent();
			} else if (
				!hasParseResults &&
				isProcessing &&
				(processingType === 'dual' || processingType === 'short') &&
				!componentsLoaded.dualProcessing
			) {
				console.log(
					'[Effect] Modal expanded while processing - loading DualProcessingResults'
				);
				loadDualProcessingComponent();
			}
		}
	});

	// Load components based on state - with await to ensure it loads
	$effect(() => {
		if (hasParseResults && !showSuccessView && !componentsLoaded.parseResults) {
			console.log('[Effect] Loading ParseResultsDiffView because we have parse results');
			loadParseResultsComponent().then(() => {
				console.log('ParseResultsDiffView loaded successfully:', !!ParseResultsDiffView);
			});
		}
	});

	// Load success view component when needed
	$effect(() => {
		if (showSuccessView && !componentsLoaded.success) {
			console.log('[Effect] Loading SuccessView component');
			loadSuccessViewComponent();
		}
	});

	$effect(() => {
		if (
			isProcessing &&
			(processingType === 'dual' || processingType === 'short') &&
			!componentsLoaded.dualProcessing
		) {
			console.log(
				'[Effect] Loading DualProcessingResults - isProcessing:',
				isProcessing,
				'type:',
				processingType
			);
			loadDualProcessingComponent();
		}
	});

	$effect(() => {
		if (isProcessing && processingType === 'single' && !componentsLoaded.processing) {
			loadProcessingComponent();
		}
	});

	// FIXED: Prevent duplicate component loading with promise tracking
	async function loadParseResultsComponent() {
		const loadKey = 'parseResults';

		// Check if already loading
		if (componentLoadingPromises.has(loadKey)) {
			console.log(
				'[loadParseResultsComponent] Already loading, waiting for existing promise'
			);
			return componentLoadingPromises.get(loadKey);
		}

		if (componentsLoaded.parseResults && ParseResultsDiffView) {
			console.log('[loadParseResultsComponent] Already loaded');
			return;
		}

		// Create and track loading promise
		const loadPromise = (async () => {
			try {
				console.log('[loadParseResultsComponent] Starting to load ParseResultsDiffView');
				ParseResultsDiffView = (await import('./ParseResultsDiffView.svelte')).default;
				componentsLoaded.parseResults = true;
				console.log('[loadParseResultsComponent] ParseResultsDiffView loaded successfully');
			} finally {
				componentLoadingPromises.delete(loadKey);
			}
		})();

		componentLoadingPromises.set(loadKey, loadPromise);
		return loadPromise;
	}

	async function loadProcessingComponent() {
		const loadKey = 'processing';

		if (componentLoadingPromises.has(loadKey)) {
			return componentLoadingPromises.get(loadKey);
		}

		if (componentsLoaded.processing && ProcessingModal) {
			return;
		}

		const loadPromise = (async () => {
			try {
				ProcessingModal = (await import('./ProcessingModal.svelte')).default;
				componentsLoaded.processing = true;
			} finally {
				componentLoadingPromises.delete(loadKey);
			}
		})();

		componentLoadingPromises.set(loadKey, loadPromise);
		return loadPromise;
	}

	async function loadDualProcessingComponent() {
		const loadKey = 'dualProcessing';

		if (componentLoadingPromises.has(loadKey)) {
			console.log(
				'[loadDualProcessingComponent] Already loading, waiting for existing promise'
			);
			return componentLoadingPromises.get(loadKey);
		}

		if (componentsLoaded.dualProcessing && DualProcessingResults) {
			console.log('[loadDualProcessingComponent] Already loaded');
			return;
		}

		const loadPromise = (async () => {
			try {
				console.log(
					'[loadDualProcessingComponent] Loading DualProcessingResults component'
				);
				DualProcessingResults = (await import('./DualProcessingResults.svelte')).default;
				componentsLoaded.dualProcessing = true;
				console.log(
					'[loadDualProcessingComponent] DualProcessingResults loaded successfully'
				);
			} finally {
				componentLoadingPromises.delete(loadKey);
			}
		})();

		componentLoadingPromises.set(loadKey, loadPromise);
		return loadPromise;
	}

	async function loadOperationEditModal() {
		const loadKey = 'operationEditModal';

		if (componentLoadingPromises.has(loadKey)) {
			return componentLoadingPromises.get(loadKey);
		}

		if (OperationEditModal) {
			return;
		}

		const loadPromise = (async () => {
			try {
				OperationEditModal = (await import('./OperationEditModal.svelte')).default;
			} finally {
				componentLoadingPromises.delete(loadKey);
			}
		})();

		componentLoadingPromises.set(loadKey, loadPromise);
		return loadPromise;
	}

	async function loadSuccessViewComponent() {
		const loadKey = 'success';

		if (componentLoadingPromises.has(loadKey)) {
			console.log('[loadSuccessViewComponent] Already loading, waiting for existing promise');
			return componentLoadingPromises.get(loadKey);
		}

		if (componentsLoaded.success && SuccessView) {
			console.log('[loadSuccessViewComponent] Already loaded');
			return;
		}

		const loadPromise = (async () => {
			try {
				console.log('[loadSuccessViewComponent] Loading SuccessView');
				SuccessView = (await import('./SuccessView.svelte')).default;
				componentsLoaded.success = true;
				console.log('[loadSuccessViewComponent] SuccessView loaded successfully');
			} finally {
				componentLoadingPromises.delete(loadKey);
			}
		})();

		componentLoadingPromises.set(loadKey, loadPromise);
		return loadPromise;
	}

	// Only track UI/component lifecycle state - processing state comes from store
	let lastBrainDumpId: string | null = null;

	// Reset only UI state when brain dump changes (not processing state!)
	$effect(() => {
		if (brainDumpId !== lastBrainDumpId) {
			console.log('BrainDumpProcessingNotification: New brain dump detected', {
				newId: brainDumpId,
				oldId: lastBrainDumpId,
				processingPhase
			});
			resetUIState();
			lastBrainDumpId = brainDumpId;

			// Check if we need to reconnect to ongoing processing
			if (processingPhase === 'parsing' && !hasActiveProcessingConnection()) {
				console.log('BrainDumpProcessingNotification: Reconnecting to ongoing processing');
				reconnectToProcessing();
			}
		}
	});

	function resetUIState() {
		// Reset local processing flag for new brain dump
		processingStarted = false;
		processingMutex = false;
		parseResultsCommitted = false;
		// Reset user interaction tracking for new brain dump
		userHasInteracted = false;
		hasAutoExpandedForCurrentBrainDump = false;
		// Reset success view state
		showSuccessView = false;
		successData = null;
		// Reset loading state
		isApplyingOperations = false;
		// Reset refresh modal state
		showRefreshModal = false;
		pendingProjectUpdate = null;
		// Clear any pending timeouts
		cleanupTimeouts.forEach((timeout) => clearTimeout(timeout));
		cleanupTimeouts.clear();
		// Only reset UI/component state, not processing state
		dualProcessingComponent = null;
		processingModalComponent = null;
		// Reset loading states to force component reload
		componentsLoaded.parseResults = false;
		componentsLoaded.processing = false;
		componentsLoaded.dualProcessing = false;
		componentsLoaded.success = false;
		// Clear loaded components to force fresh load
		ParseResultsDiffView = null;
		ProcessingModal = null;
		DualProcessingResults = null;
		SuccessView = null;
		OperationEditModal = null;
		// Reset edit modal state
		editModal.isOpen = false;
		editModal.operation = null;
	}

	function hasActiveProcessingConnection() {
		// Check if we have active streaming components
		return (
			((processingType === 'dual' || processingType === 'short') &&
				dualProcessingComponent) ||
			(processingType === 'single' && processingModalComponent)
		);
	}

	// Reconnect to ongoing processing when component mounts or state changes
	async function reconnectToProcessing() {
		if (processingPhase !== 'parsing' || !brainDumpId || !inputText || processingStarted) {
			console.log('BrainDumpProcessingNotification: Skipping reconnect', {
				processingPhase,
				hasBrainDumpId: !!brainDumpId,
				hasInputText: !!inputText,
				processingStarted
			});
			return;
		}

		console.log('BrainDumpProcessingNotification: Reconnecting to processing', {
			brainDumpId,
			processingType,
			hasInputText: !!inputText
		});

		// Load components and start processing
		await startProcessing();
	}

	// Auto-start when component mounts if processing is already in progress
	onMount(() => {
		if (processingPhase === 'parsing' && brainDumpId && inputText && !processingStarted) {
			console.log(
				'BrainDumpProcessingNotification: onMount - processing should auto-start via reactive statement'
			);
		}
	});

	// Watch for processing phase changes that require action - with mutex protection
	$effect(() => {
		if (
			processingPhase === 'parsing' &&
			brainDumpId &&
			inputText &&
			!processingStarted &&
			!processingMutex
		) {
			console.log('Starting processing - all data available', {
				processingPhase,
				brainDumpId,
				inputText: inputText?.substring(0, 50) + '...',
				processingStarted,
				processingMutex
			});
			// Set mutex immediately to prevent concurrent processing
			processingMutex = true;

			// Ensure components are loaded before starting processing
			tick().then(async () => {
				try {
					// Load appropriate components first
					if (processingType === 'dual' || processingType === 'short') {
						await loadDualProcessingComponent();
					} else if (processingType === 'single') {
						await loadProcessingComponent();
					}
					await startProcessing();
				} finally {
					// Always release mutex
					processingMutex = false;
				}
			});
		}
	});

	function commitParseResults(result: BrainDumpParseResult | null) {
		if (!result || parseResultsCommitted) {
			return;
		}
		parseResultsCommitted = true;
		brainDumpActions.setParseResults(result);
	}

	// NEW: Start brain dump processing - with mutex protection
	async function startProcessing() {
		if (!inputText || !brainDumpId) {
			return;
		}

		// Prevent duplicate processing with double-check
		if (processingStarted) {
			console.log('Processing already started, skipping duplicate call');
			return;
		}

		// Set processing started flag immediately
		processingStarted = true;
		parseResultsCommitted = false;

		// Reset streaming state for new processing
		brainDumpActions.resetStreamingState();

		// Preload components that will be needed for results display
		const preloadPromises = [];
		if (!componentsLoaded.parseResults) {
			preloadPromises.push(loadParseResultsComponent());
		}
		if (!componentsLoaded.success) {
			preloadPromises.push(loadSuccessViewComponent());
		}
		if (preloadPromises.length > 0) {
			Promise.all(preloadPromises).then(() => {
				console.log('[startProcessing] Critical components preloaded');
			});
		}

		try {
			const selectedProjectId = selectedProject?.id === 'new' ? null : selectedProject?.id;
			const type = processingType;
			const isShortBraindump = type === 'short';
			const isDualProcessing = type === 'dual' || type === 'background';

			console.log('Processing type decision (store-driven)', {
				type,
				isShortBraindump,
				isDualProcessing,
				selectedProjectId,
				brainDumpId
			});

			if (isDualProcessing || isShortBraindump) {
				await loadDualProcessingComponent();
			} else if (type === 'single' && !componentsLoaded.processing) {
				await loadProcessingComponent();
			}

			if (isShortBraindump) {
				console.log('Starting SHORT braindump processing via /stream-short');
				await processShortBrainDump(selectedProjectId);
			} else if (isDualProcessing || type === 'single') {
				console.log('Starting processing via /stream');
				await processDualBrainDump(selectedProjectId);
			} else {
				console.warn('Unknown processing type; defaulting to dual processing');
				await processDualBrainDump(selectedProjectId);
			}
		} catch (error) {
			processingStarted = false; // Reset flag on error
			console.error('Processing failed:', error);
			let errorMessage = 'Processing failed';
			if (error instanceof Error) {
				if (error.message.includes('timeout')) {
					errorMessage =
						'Processing timeout - brain dump took too long to analyze. Please try again or use a shorter text.';
				} else {
					errorMessage = error.message;
				}
			}
			brainDumpActions.setProcessingError(errorMessage);
		}
	}

	// NEW: Process short brain dump
	async function processShortBrainDump(selectedProjectId: string | null) {
		await brainDumpService.parseShortBrainDumpWithStream(
			inputText!,
			selectedProjectId,
			brainDumpId!,
			displayedQuestions,
			{
				autoAccept: autoAcceptEnabled,
				onProgress: (status: StreamingMessage) => {
					// Update store with streaming state
					handleStreamUpdate(status);

					// If we get a complete event via progress, also handle it as completion
					if (status.type === 'complete' && status.result) {
						processingStarted = false;
						commitParseResults(status.result);
					}
				},
				onComplete: async (result: BrainDumpParseResult) => {
					processingStarted = false; // Reset flag on completion
					console.log('[processShortBrainDump] onComplete - received result:', {
						hasOperations: !!result?.operations,
						operationsCount: result?.operations?.length
					});

					if (!result || !result.operations) {
						console.error('Invalid parse result:', result);
						brainDumpActions.setProcessingError(
							'Parse completed but received invalid results'
						);
						return;
					}

					// Check if auto-accept was enabled and operations were already executed
					if (autoAcceptEnabled && result.executionResult) {
						// Operations were already applied by the server
						console.log('Auto-accept: Operations already applied by server');
						commitParseResults(result);
						// Show success briefly before hiding
						setTimeout(() => {
							// Pass the full result which includes projectInfo
							handleOperationSuccess(
								result.executionResult,
								result.projectInfo,
								true
							);
						}, 1500); // Show completion status for 1.5 seconds
						return;
					}

					// Set parse results - this should trigger hasParseResults to become true
					commitParseResults(result);
					// showingParseResults is handled automatically by setParseResults
					// brainDumpActions.setShowingParseResults(true);

					console.log(
						'[processShortBrainDump] Parse results set, should show ParseResultsDiffView'
					);
				},
				onError: (error: string) => {
					processingStarted = false; // Reset flag on error
					console.error('Parsing error:', error);
					let errorMessage = 'Failed to parse brain dump';
					if (error.includes('timeout')) {
						errorMessage =
							'Processing timeout - brain dump took too long to analyze. Please try again or use a shorter text.';
					} else {
						errorMessage = error;
					}
					brainDumpActions.setProcessingError(errorMessage);
				}
			}
		);
	}

	// NEW: Process dual brain dump
	async function processDualBrainDump(selectedProjectId: string | null) {
		await brainDumpService.parseBrainDumpWithStream(
			inputText!,
			selectedProjectId,
			brainDumpId!,
			displayedQuestions,
			{
				autoAccept: autoAcceptEnabled,
				onProgress: (status: StreamingMessage) => {
					// Update store with streaming state
					handleStreamUpdate(status);

					// If we get a complete event via progress, also handle it as completion
					if (status.type === 'complete' && status.result) {
						processingStarted = false;
						commitParseResults(status.result);
					}
				},
				onComplete: async (result: BrainDumpParseResult) => {
					processingStarted = false; // Reset flag on completion
					console.log('[processDualBrainDump] onComplete - received result:', {
						hasOperations: !!result?.operations,
						operationsCount: result?.operations?.length
					});

					if (!result || !result.operations) {
						console.error('Invalid parse result:', result);
						brainDumpActions.setProcessingError(
							'Parse completed but received invalid results'
						);
						return;
					}

					// Check if auto-accept was enabled and operations were already executed
					if (autoAcceptEnabled && result.executionResult) {
						// Operations were already applied by the server
						console.log('Auto-accept: Operations already applied by server');
						commitParseResults(result);
						// Show success briefly before hiding
						setTimeout(() => {
							// Pass the full result which includes projectInfo
							handleOperationSuccess(
								result.executionResult,
								result.projectInfo,
								true
							);
						}, 1500); // Show completion status for 1.5 seconds
						return;
					}

					// Set parse results - this should trigger hasParseResults to become true
					commitParseResults(result);
					// showingParseResults is handled automatically by setParseResults
					// brainDumpActions.setShowingParseResults(true);

					console.log(
						'[processDualBrainDump] Parse results set, should show ParseResultsDiffView'
					);
				},
				onError: (error: string) => {
					processingStarted = false; // Reset flag on error
					console.error('Stream parse error:', error);
					let errorMessage = 'Parse failed';
					if (error.includes('timeout')) {
						errorMessage =
							'Processing timeout - brain dump took too long to analyze. Please try again or use a shorter text.';
					} else {
						errorMessage = `Parse failed: ${error}`;
					}
					brainDumpActions.setProcessingError(errorMessage);
				}
			}
		);
	}

	function canAutoAccept(parseResults: BrainDumpParseResult | null): boolean {
		if (!parseResults) return false;
		return (
			parseResults.operations.length <= 20 &&
			parseResults.operations.every((op) => !op.error) &&
			autoAcceptPreference
		);
	}

	function toggleMinimized() {
		console.log('[toggleMinimized] Current state:', {
			isMinimizedFromStore,
			hasParseResults,
			showSuccessView,
			processingPhase,
			parseResults: !!parseResults
		});

		// Mark that user has interacted only when collapsing
		if (!isMinimizedFromStore) {
			userHasInteracted = true;
		}
		// Direct store action for immediate response
		brainDumpActions.toggleNotificationMinimized();

		// If we're minimizing after showing success, clear the success view
		// so when expanded again, user sees the appropriate state
		if (!isMinimizedFromStore && showSuccessView) {
			showSuccessView = false;
			successData = null;
		}
	}

	function handleClose() {
		console.log('Closing brain dump notification - full reset');

		// Reset all UI state
		resetUIState();

		// Clear brain dump store completely
		brainDumpActions.clearParseResults();

		// Reset the entire processing notification store to initial state
		brainDumpActions.reset();

		// Reset local tracking variables
		lastBrainDumpId = null;
		lastAutoExpandBrainDumpId = null;
		processingStarted = false;
		processingMutex = false;

		// Clear any pending component loading promises
		componentLoadingPromises.clear();

		// Clear any pending timeouts (like auto-close)
		cleanupTimeouts.forEach((timeout) => clearTimeout(timeout));
		cleanupTimeouts.clear();

		// Dispatch close event for parent component
		// Include a flag to indicate this is a complete cleanup
		dispatch('close', { fullCleanup: true });
	}

	function handleAutoAcceptToggle() {
		brainDumpAutoAccept.toggle();
		dispatch('autoAcceptToggled', { enabled: brainDumpAutoAccept.shouldAutoAccept() });
	}

	function handleApplyAutoAccept() {
		if (canAutoAcceptCurrent) {
			dispatch('applyAutoAccept', { parseResults });
		}
	}

	async function handleApplyOperations() {
		console.log('handleApplyOperations called', {
			enabledOpsCount,
			parseResults: !!parseResults,
			parseResultsOperationsLength: parseResults?.operations?.length,
			disabledOperationsSize: disabledOperations?.size,
			disabledOperations: Array.from(disabledOperations || new Set()),
			inputText: !!inputText,
			brainDumpId,
			storeParseResults: parseResults
		});

		// Set loading state
		isApplyingOperations = true;

		// Check if we have operations to apply
		if (!parseResults || !parseResults.operations || parseResults.operations.length === 0) {
			console.warn('Cannot apply operations: no operations available', { parseResults });
			toastService.error('No operations to apply');
			isApplyingOperations = false;
			return;
		}

		// Proceed even if enabledOpsCount appears to be 0 due to store sync issues
		// The actual filtering will determine the real count

		try {
			// Filter enabled operations - use local parseResults if store isn't synced
			const operationsToFilter = parseResults.operations;
			const disabledOpsSet = disabledOperations?.size > 0 ? disabledOperations : new Set();
			const enabledOperations = operationsToFilter.filter((op) => !disabledOpsSet.has(op.id));

			console.log('Filtered operations', {
				total: operationsToFilter.length,
				enabled: enabledOperations.length,
				disabled: disabledOpsSet.size
			});

			// Check if we have enabled operations after filtering
			if (enabledOperations.length === 0) {
				console.warn('No enabled operations after filtering');
				toastService.warning(
					'No operations are enabled. Please enable at least one operation.'
				);
				return;
			}

			// Use the selected project from either store (processing notification or brain dump)
			const projectForSave = selectedProject || brainDumpSelectedProject;
			const selectedProjectId = projectForSave?.id === 'new' ? undefined : projectForSave?.id;

			// Check for required data before making the API call
			if (!inputText || !brainDumpId) {
				console.error('Missing required data for saving brain dump', {
					inputText: !!inputText,
					brainDumpId
				});
				toastService.error('Unable to save: missing brain dump data. Please try again.');
				isApplyingOperations = false;
				return;
			}

			const response = await brainDumpService.saveBrainDump({
				operations: enabledOperations,
				originalText: inputText,
				insights: parseResults.insights,
				summary: parseResults.summary,
				title: parseResults.title,
				projectQuestions: parseResults?.projectQuestions || [],
				brainDumpId: brainDumpId,
				selectedProjectId: selectedProjectId
			});

			// Handle success/failure
			if (response?.data?.failedOperations > 0) {
				console.warn('Partial operation success:', response.data);
				// Show success with warnings
				handleOperationPartialSuccess(response.data);
			} else {
				console.log('All operations successful:', response.data);
				handleOperationSuccess(response.data);
			}
		} catch (error) {
			console.error('Operation application failed:', error);
			handleOperationError(error);
		} finally {
			// Always reset loading state
			isApplyingOperations = false;
		}
	}

	async function handleOperationSuccess(
		responseData: OperationSuccessPayload,
		projectInfoFromStream?: BrainDumpParseResult['projectInfo'],
		isAutoAccept: boolean = false
	) {
		const projectInfo =
			projectInfoFromStream ||
			(isSaveBrainDumpResponse(responseData) ? responseData.projectInfo : undefined);

		const totals = deriveOperationTotals(responseData);
		const errors = extractOperationErrors(responseData);
		const hasFailures = totals.failed > 0 || errors.length > 0;
		const operationsCount = totals.total > 0 ? totals.total : enabledOpsCount;

		successData = {
			brainDumpId,
			brainDumpType: projectInfo?.isNew ? 'project' : 'update',
			projectId: projectInfo?.id,
			projectName: projectInfo?.name || selectedProject?.name || 'Project',
			isNewProject: projectInfo?.isNew || false,
			operationsCount,
			failedOperations: totals.failed,
			operationErrors: errors.length > 0 ? errors : undefined
		};

		if (!componentsLoaded.success) {
			await loadSuccessViewComponent();
		}
		await tick();
		showSuccessView = true;

		brainDumpActions.clearParseResults();

		dispatch('operationSuccess', {
			responseData,
			projectId: projectInfo?.id,
			projectName: projectInfo?.name,
			isNewProject: projectInfo?.isNew
		});

		if (isAutoAccept) {
			if (hasFailures) {
				toastService.warning(
					'Some operations failed during auto-accept. Review the details before continuing.'
				);
				return;
			}

			// Check if we're on the same project page (including sub-pages)
			const targetPath = `/projects/${projectInfo?.id}`;
			const currentPath = window.location.pathname;
			const isOnTargetProject = projectInfo?.id && currentPath.startsWith(targetPath);

			if (isOnTargetProject) {
				// We're on the same project - show success and hide notification smoothly
				toastService.success('✨ Changes applied to current project', {
					duration: 3000
				});

				// Just hide notification without full reset - let real-time sync update the UI
				const autoCloseTimeout = setTimeout(() => {
					// Hide notification without resetting state
					brainDumpActions.closeNotification();
					// Clear only UI-specific state
					showSuccessView = false;
					successData = null;
				}, 500); // Short delay for smooth transition
				cleanupTimeouts.add(autoCloseTimeout);
			} else {
				// Different project or new project - show notification briefly then close fully
				const autoCloseTimeout = setTimeout(() => {
					handleClose(); // Full close for different projects
				}, 2500);
				cleanupTimeouts.add(autoCloseTimeout);
			}
		}
	}

	function handleOperationPartialSuccess(responseData: SaveBrainDumpResponse) {
		const totals = deriveOperationTotals(responseData);
		const successMessage = `${totals.successful} operations succeeded`;
		const errorMessage = `${totals.failed} operations failed`;

		brainDumpActions.setProcessingError(`Warning: ${errorMessage}. ${successMessage}.`);

		dispatch('operationPartialSuccess', {
			responseData,
			successMessage,
			errorMessage
		});
	}

	function handleOperationError(error: any) {
		let errorMessage = 'Failed to apply operations';
		if (error instanceof Error) {
			errorMessage = `Apply failed: ${error.message}`;
		}

		brainDumpActions.setProcessingError(errorMessage);

		dispatch('operationError', { error: errorMessage });
	}

	function handleCancelProcessing() {
		dispatch('cancelProcessing');
	}

	// NEW: Operation management handlers for ParseResultsDiffView
	function handleToggleOperation(event: CustomEvent) {
		brainDumpActions.toggleOperation(event.detail);
	}

	function handleUpdateOperation(event: CustomEvent) {
		brainDumpActions.updateOperation(event.detail);
	}

	function handleRemoveOperation(event: CustomEvent) {
		brainDumpActions.removeOperation(event.detail);
	}

	async function handleEditOperation(event: CustomEvent) {
		await loadOperationEditModal();
		editModal.isOpen = true;
		editModal.operation = event.detail;
	}

	function handleSaveOperation(updatedOperation: ParsedOperation) {
		brainDumpActions.updateOperation(updatedOperation);
		editModal.isOpen = false;
		editModal.operation = null;
	}

	// Success view handlers
	async function handleGoToProject() {
		// Guard against null successData
		if (!successData || !successData.projectId) {
			console.error('handleGoToProject called but missing successData or projectId', {
				successData
			});
			toastService.error('Unable to navigate to project - missing project information');
			return;
		}

		const projectId = successData.projectId;
		const projectName = successData.projectName || 'Project';

		// Use smart navigation for optimal UX
		await smartNavigateToProject(projectId, projectName, {
			isAutoAccept: autoAcceptEnabled,
			isNewProject: successData.isNewProject,
			onSameProject: () => {
				if (!autoAcceptEnabled) {
					// Manual navigation on same project - show refresh modal
					pendingProjectUpdate = {
						projectId,
						projectName
					};

					// Keep notification open but minimized so component stays mounted for refresh modal
					// This ensures the refresh modal can be displayed
					brainDumpActions.openNotification(true);

					const refreshTimeout = setTimeout(() => {
						showRefreshModal = true;
					}, 100); // Reduced timeout for better UX
					cleanupTimeouts.add(refreshTimeout);
				} else {
					// Auto-accept handled by smart navigation - just close
					handleClose();
				}
			},
			onNavigate: () => {
				// Different project - clean up and navigate
				handleClose();
			}
		});
	}

	// Handle refresh confirmation modal actions
	async function handleRefreshConfirm() {
		console.log('[handleRefreshConfirm] Refreshing page to show updates');
		showRefreshModal = false;
		const projectId = pendingProjectUpdate?.projectId;
		pendingProjectUpdate = null;

		try {
			// First try soft refresh by invalidating project data
			if (projectId) {
				await invalidate(`project:${projectId}`);
				await invalidate(`/projects/${projectId}`);
				await tick();
				// Give a moment for UI to update
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			// Clean up the notification
			handleClose();
			toastService.success('✨ Project updated successfully', { duration: 2000 });
		} catch (error) {
			console.warn(
				'[handleRefreshConfirm] Soft refresh failed, falling back to hard reload:',
				error
			);
			// Fall back to hard reload if soft refresh fails
			handleClose();
			// Small delay to ensure cleanup completes before reload
			setTimeout(() => {
				window.location.reload();
			}, 100);
		}
	}

	function handleRefreshCancel() {
		console.log('[handleRefreshCancel] User cancelled refresh');
		showRefreshModal = false;
		pendingProjectUpdate = null;
		// Optionally show a toast reminding user they can refresh later
		toastService.info('You can refresh the page anytime to see the latest changes', {
			duration: 4000
		});
		// Now clean up the notification state
		handleClose();
	}

	function handleStartNew() {
		// Reset everything for a new brain dump
		resetUIState();

		// Clear all stores
		brainDumpActions.clearParseResults();
		brainDumpActions.reset();

		// Reset processing notification store
		brainDumpActions.reset();

		// Reset local tracking variables
		lastBrainDumpId = null;
		lastAutoExpandBrainDumpId = null;
		processingStarted = false;

		// The parent component should handle showing the brain dump modal
		dispatch('startNew');
	}

	// Handle navigation to history from SuccessView
	async function handleNavigateToHistory(event: CustomEvent) {
		const { url } = event.detail;
		if (url) {
			try {
				// Clean up and navigate using SvelteKit goto
				handleClose();
				await goto(url);
			} catch (error) {
				console.error('[handleNavigateToHistory] Navigation failed:', error);
				// Fallback to window.location if goto fails
				window.location.href = url;
			}
		}
	}

	// Expose streaming interface for BrainDumpModal
	function handleStreamUpdate(status: StreamingMessage) {
		console.log('[handleStreamUpdate] Received status:', {
			type: status.type,
			hasResult: !!(status as any).result,
			hasDataResult: !!(status as any).data?.result,
			message: (status as any).message,
			streamingState: streamingState
		});

		// Update store with streaming progress
		if (status.type === 'contextProgress' && 'data' in status) {
			// Check if this is a completion event with preview data
			if (status.data.status === 'completed' && status.data.preview) {
				console.log('[handleStreamUpdate] Context completed with preview');
				brainDumpActions.updateStreamingState({
					contextStatus: 'completed',
					contextProgress: status.message,
					contextResult: status.data.preview
				});
			} else {
				console.log('[handleStreamUpdate] Context processing:', status.message);
				brainDumpActions.updateStreamingState({
					contextStatus: 'processing',
					contextProgress: status.message
				});
			}
		} else if (status.type === 'tasksProgress' && 'data' in status) {
			// Check if this is a completion event with preview data
			if (status.data.status === 'completed' && status.data.preview) {
				console.log('[handleStreamUpdate] Tasks completed with preview');
				brainDumpActions.updateStreamingState({
					tasksStatus: 'completed',
					tasksProgress: status.message,
					tasksResult: status.data.preview
				});
			} else {
				console.log('[handleStreamUpdate] Tasks processing:', status.message);
				brainDumpActions.updateStreamingState({
					tasksStatus: 'processing',
					tasksProgress: status.message
				});
			}
		} else if (status.type === 'complete' && 'result' in status) {
			// Final completion from streaming endpoints
			processingStarted = false; // Reset processing flag
			brainDumpActions.updateStreamingState({
				contextStatus: 'completed',
				tasksStatus: 'completed'
			});
			// Set the parse results if provided
			const result = (status as any).result;
			if (result) {
				console.log('[handleStreamUpdate] Setting parse results from status.result:', {
					operationsCount: result.operations?.length,
					hasExecutionResult: !!result.executionResult
				});
				commitParseResults(result);
			} else {
				console.warn('[handleStreamUpdate] Complete event received but no result found!');
			}
		} else if (status.type === 'error' && 'error' in status) {
			brainDumpActions.updateStreamingState({
				contextStatus:
					'context' in status && status.context === 'context' ? 'error' : undefined,
				tasksStatus: 'context' in status && status.context === 'tasks' ? 'error' : undefined
			});
			brainDumpActions.setProcessingError(status.message || 'Processing failed');
		}

		// Also update component if it's mounted
		if (dualProcessingComponent?.handleStreamUpdate) {
			dualProcessingComponent.handleStreamUpdate(status);
		}
	}

	// Get processing status info using Svelte 5 $derived for proper reactivity
	let statusInfo = $derived(
		(() => {
			// Check if showing success view - handle both minimized and expanded states
			if (showSuccessView && successData) {
				return {
					icon: 'completed',
					title: 'Operations Applied',
					subtitle: `${successData.operationsCount || 0} operations successfully applied`,
					color: 'green'
				};
			}

			// Check for errors
			if (storeState.error) {
				return {
					icon: 'error',
					title: 'Processing failed',
					subtitle: storeState.error,
					color: 'red'
				};
			}

			// Check for parse results (completion state)
			if (hasParseResults) {
				const operationsCount = parseResults?.operations?.length || 0;
				const enabledCount = enabledOpsCount || operationsCount;

				// Check if operations were already executed (auto-accept)
				if (parseResults?.executionResult) {
					const successful = parseResults.executionResult.successful?.length || 0;
					const failed = parseResults.executionResult.failed?.length || 0;

					if (failed > 0) {
						return {
							icon: 'completed',
							title: 'Partial success',
							subtitle: `${successful} applied, ${failed} failed`,
							color: 'yellow'
						};
					}

					return {
						icon: 'completed',
						title: 'Operations applied',
						subtitle: `${successful} operation${successful !== 1 ? 's' : ''} successfully applied`,
						color: 'green'
					};
				}

				// Show different messages based on auto-accept status
				if (autoAcceptEnabled && canAutoAcceptCurrent) {
					return {
						icon: 'completed',
						title: 'Ready to auto-accept',
						subtitle: `${enabledCount} operation${enabledCount !== 1 ? 's' : ''} will be applied`,
						color: 'green'
					};
				}

				return {
					icon: 'completed',
					title: 'Brain dump processed',
					subtitle: `${enabledCount} of ${operationsCount} operation${operationsCount !== 1 ? 's' : ''} ready`,
					color: 'green'
				};
			} else if (isProcessing) {
				// Show streaming progress if available
				let subtitle = 'Analyzing content...';
				if ((processingType === 'dual' || processingType === 'short') && streamingState) {
					const contextDone = streamingState.contextStatus === 'completed';
					const tasksDone = streamingState.tasksStatus === 'completed';
					if (contextDone && tasksDone) {
						subtitle = 'Finalizing results...';
					} else if (contextDone) {
						subtitle = 'Extracting tasks...';
					} else if (streamingState.contextProgress) {
						subtitle = streamingState.contextProgress;
					} else if (streamingState.tasksProgress) {
						subtitle = streamingState.tasksProgress;
					}
				} else if (processingType === 'short' && !streamingState) {
					subtitle = 'Processing quick update...';
				} else if (processingType === 'background') {
					subtitle = autoAcceptEnabled
						? 'Processing with auto-accept...'
						: 'Processing in background...';
				} else if (processingType === 'single') {
					subtitle = 'Processing your brain dump...';
				}
				return {
					icon: 'processing',
					title: 'Processing brain dump',
					subtitle,
					color: 'purple'
				};
			}
			return {
				icon: 'idle',
				title: 'Ready',
				subtitle: '',
				color: 'gray'
			};
		})()
	);

	// FIXED: Comprehensive cleanup effect for memory leak prevention
	$effect(() => {
		// This effect runs once and its cleanup function runs on component destroy
		let cleanupAbortController: AbortController | null = null;

		// Track any async operations started in this component
		cleanupAbortController = new AbortController();

		// Return cleanup function
		return () => {
			console.log('[BrainDumpProcessingNotification] Starting cleanup');

			// 1. Abort any pending async operations
			if (cleanupAbortController) {
				cleanupAbortController.abort();
				cleanupAbortController = null;
			}

			// 2. Clear any timeouts (using component-level cleanupTimeouts)
			cleanupTimeouts.forEach((timeout) => clearTimeout(timeout));
			cleanupTimeouts.clear();

			// 3. Reset processing state flags
			processingStarted = false;
			processingMutex = false;
			userHasInteracted = false;

			// 4. Clear component references
			ParseResultsDiffView = null;
			SuccessView = null;
			ProcessingModal = null;
			DualProcessingResults = null;
			dualProcessingComponent = null;
			processingModalComponent = null;

			// 5. Clear any SSE connections (if they exist in streaming state)
			const currentStreamingState = $brainDumpV2Store.processing.streaming;
			if (currentStreamingState) {
				console.log('[Cleanup] Resetting streaming state');
				brainDumpActions.resetStreamingState();
			}

			// 6. Release processing mutex if held (emergency release)
			if ($brainDumpV2Store.processing.mutex) {
				console.warn('[Cleanup] Emergency mutex release on component destroy');
				brainDumpV2Store.releaseMutex();
			}

			// 7. Reset component loading states
			componentsLoaded = {
				parseResults: false,
				success: false,
				processing: false,
				dualProcessing: false
			};

			// 8. Clear any pending promises
			componentLoadingPromises.clear();

			console.log('[BrainDumpProcessingNotification] Cleanup complete');
		};
	});
</script>

<!-- Use if-else to ensure only one view is shown at a time -->
{#if showExpanded}
	<!-- Expanded State Modal -->
	<Modal
		isOpen={true}
		onClose={toggleMinimized}
		title=""
		size={hasParseResults
			? 'lg'
			: processingType === 'dual' || processingType === 'short'
				? 'lg'
				: 'md'}
		showCloseButton={false}
		closeOnBackdrop={true}
		closeOnEscape={true}
		persistent={false}
	>
		<div
			slot="header"
			class="{hasParseResults && !showSuccessView
				? 'hidden'
				: ''} text-center py-4 sm:py-6 px-4 sm:px-6 border-b border-gray-200 dark:border-gray-700"
		>
			<div class="flex justify-between items-start mb-4">
				<div class="flex items-center gap-3">
					{#if statusInfo.icon === 'processing'}
						<Loader2
							class="w-6 h-6 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					{:else if statusInfo.icon === 'completed'}
						<CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
					{/if}
					<div class="text-left">
						<h2 class="text-xl font-bold text-gray-900 dark:text-white">
							{#if showSuccessView}
								Success!
							{:else}
								{statusInfo.title}
							{/if}
						</h2>
						{#if !showSuccessView && statusInfo.subtitle}
							<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
								{statusInfo.subtitle}
							</p>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					{#if !isProcessing || showSuccessView}
						<Button
							variant="ghost"
							on:click={(e) => {
								e.stopPropagation();
								handleClose();
							}}
							aria-label="Close dialog"
							icon={X}
						></Button>
					{/if}
					<Button
						variant="ghost"
						on:click={(e) => {
							e.stopPropagation();
							toggleMinimized();
						}}
						aria-label="Minimize"
						icon={ChevronDown}
					></Button>
				</div>
			</div>
		</div>

		<!-- Content - Simplified state handling -->
		<div class="px-4 sm:px-6 py-4 sm:py-5">
			{#if showSuccessContent}
				<!-- Priority 1: Show success view after operations are applied -->
				{#if SuccessView}
					<SuccessView
						{successData}
						showNavigationOnSuccess={true}
						inModal={true}
						on:goToProject={handleGoToProject}
						on:startNew={handleStartNew}
						on:close={handleClose}
						on:navigateToHistory={handleNavigateToHistory}
					/>
				{:else}
					<!-- Loading SuccessView component -->
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					</div>
				{/if}
			{:else if showParseResultsContent}
				<!-- Priority 2: Show parse results when available and not showing success -->
				{@const expandedDebug = console.log('[Modal Content] Should show parse results:', {
					showParseResultsContent,
					showExpanded,
					showSuccessView,
					hasParseResults,
					processingPhase,
					parseResults: !!parseResults,
					ParseResultsDiffView: !!ParseResultsDiffView,
					componentsLoaded
				})}
				{#if ParseResultsDiffView}
					<ParseResultsDiffView
						{parseResults}
						{disabledOperations}
						enableOperationsCount={enabledOpsCount}
						isProcessing={false}
						isApplying={isApplyingOperations}
						showAutoAcceptToggle={true}
						{autoAcceptEnabled}
						{canAutoAcceptCurrent}
						projectId={brainDumpSelectedProject?.id === 'new'
							? null
							: brainDumpSelectedProject?.id}
						on:toggleOperation={handleToggleOperation}
						on:updateOperation={handleUpdateOperation}
						on:removeOperation={handleRemoveOperation}
						on:editOperation={handleEditOperation}
						on:toggleAutoAccept={handleAutoAcceptToggle}
						on:applyAutoAccept={handleApplyAutoAccept}
						on:apply={handleApplyOperations}
						on:cancel={handleClose}
					/>
				{:else}
					<!-- Loading ParseResultsDiffView component -->
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					</div>
				{/if}
			{:else if showProcessingContent && (processingType === 'dual' || processingType === 'short')}
				{#if DualProcessingResults}
					<!-- Show dual processing UI -->
					<DualProcessingResults
						bind:this={dualProcessingComponent}
						contextStatus={streamingState?.contextStatus || 'processing'}
						tasksStatus={streamingState?.tasksStatus || 'processing'}
						contextResult={streamingState?.contextResult}
						tasksResult={streamingState?.tasksResult}
						isShortBraindump={processingType === 'short'}
						showContextPanel={processingType === 'dual'}
						isProcessing={true}
					/>
				{:else}
					<!-- Loading state while component loads -->
					<div class="text-center space-y-4">
						<div class="flex justify-center">
							<Loader2
								class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
							/>
						</div>
						<div>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								Initializing dual processing...
							</p>
						</div>
					</div>
				{/if}
			{:else if showProcessingContent}
				<!-- Priority 3: Simple processing state -->
				<div class="text-center space-y-4">
					<div class="flex justify-center">
						<Loader2
							class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					</div>
					<div>
						<p class="text-sm text-gray-600 dark:text-gray-300">
							{processingType === 'dual'
								? 'Analyzing content for context and tasks...'
								: processingType === 'short'
									? 'Processing quick update...'
									: 'Processing your brain dump...'}
						</p>
					</div>
				</div>
			{:else}
				<!-- Empty state - shouldn't normally reach here -->
				<div class="text-center py-8">
					<p class="text-gray-500 dark:text-gray-400">No content to display</p>
				</div>
			{/if}
		</div>
	</Modal>
{:else if showMinimized}
	<!-- Collapsed State - Only show when minimized -->
	<div
		class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-sm"
		transition:fly={{ y: 100, duration: 300 }}
	>
		<div
			class="bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-xl transition-all duration-200 overflow-hidden
				{hasParseResults && !isProcessing
				? 'ring-2 ring-green-400 ring-opacity-50 animate-pulse-subtle'
				: ''}
				{showSuccessView ? 'ring-2 ring-green-500 ring-opacity-60' : ''}"
			class:animate-bounce-subtle={hasParseResults && !userHasInteracted}
			transition:scale={{ duration: 200, start: 0.95 }}
			on:click={() => {
				userHasInteracted = true;
				toggleMinimized();
			}}
			role="button"
			tabindex="0"
			on:keydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					userHasInteracted = true;
					toggleMinimized();
				}
			}}
		>
			{#if isProcessing}
				<!-- Progress bar for processing state -->
				<div class="absolute top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
					<div
						class="h-full bg-primary-600 dark:bg-primary-400 animate-pulse"
						style="width: 100%"
					></div>
				</div>
			{/if}
			<div class="p-4 flex items-center justify-between">
				<div class="flex items-center gap-3">
					{#if statusInfo.icon === 'processing'}
						<Loader2
							class="w-5 h-5 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					{:else if statusInfo.icon === 'completed'}
						<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
					{:else if statusInfo.icon === 'error'}
						<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
					{/if}

					<div>
						<div class="text-sm font-medium text-gray-900 dark:text-white">
							{statusInfo.title}
						</div>
						{#if statusInfo.subtitle}
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{statusInfo.subtitle}
							</div>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-1">
					{#if hasParseResults && !showSuccessView && canAutoAcceptCurrent}
						<button
							on:click|stopPropagation={handleAutoAcceptToggle}
							class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
							title="Toggle auto-accept"
						>
							<Settings class="w-4 h-4 text-gray-600 dark:text-gray-400" />
						</button>
					{/if}

					<button
						on:click={(e) => {
							e.stopPropagation();
							handleClose();
						}}
						class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
						title="Close"
					>
						<X class="w-4 h-4 text-gray-600 dark:text-gray-400" />
					</button>

					<ChevronUp class="w-4 h-4 text-gray-400 dark:text-gray-500" />
				</div>
			</div>
		</div>
	</div>
{/if}
<!-- Operation Edit Modal -->
{#if OperationEditModal && editModal.isOpen}
	<OperationEditModal
		isOpen={editModal.isOpen}
		operation={editModal.operation}
		onSave={handleSaveOperation}
		onClose={() => {
			editModal.isOpen = false;
			editModal.operation = null;
		}}
	/>
{/if}

<!-- Refresh Confirmation Modal -->
{#if showRefreshModal && pendingProjectUpdate}
	<Modal
		isOpen={true}
		onClose={handleRefreshCancel}
		title="Project Updated"
		size="sm"
		showCloseButton={true}
		closeOnBackdrop={true}
		closeOnEscape={true}
	>
		<div class="p-6 text-center">
			<CheckCircle class="w-12 h-12 mx-auto mb-4 text-green-600 dark:text-green-400" />
			<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
				{pendingProjectUpdate.projectName} has been updated
			</h3>
			<p class="text-gray-600 dark:text-gray-400 mb-6">
				Your changes have been applied. Refresh the page to see the latest updates.
			</p>
			<div class="flex gap-3 justify-center">
				<Button variant="ghost" on:click={handleRefreshCancel} class="min-w-[100px]">
					Later
				</Button>
				<Button variant="primary" on:click={handleRefreshConfirm} class="min-w-[100px]">
					Refresh Now
				</Button>
			</div>
		</div>
	</Modal>
{/if}

<style>
	/* Subtle pulse animation for completed notifications */
	:global(.animate-pulse-subtle) {
		animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse-subtle {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.85;
		}
	}

	/* Subtle bounce animation to draw attention */
	:global(.animate-bounce-subtle) {
		animation: bounce-subtle 1s ease-in-out 2;
	}

	@keyframes bounce-subtle {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-4px);
		}
	}
</style>
