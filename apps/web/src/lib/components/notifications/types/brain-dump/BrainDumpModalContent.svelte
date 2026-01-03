<!-- apps/web/src/lib/components/notifications/types/brain-dump/BrainDumpModalContent.svelte -->
<script lang="ts">
	/**
	 * Brain Dump Modal Content
	 *
	 * Displays full brain dump notification content in expanded modal.
	 * Shows processing, parse results, or success views based on notification state.
	 *
	 * Part of Phase 2: Brain Dump Migration
	 * Extracted from BrainDumpProcessingNotification.svelte (lines 1481-1677)
	 */

	import { createEventDispatcher, tick } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { smartNavigateToProject } from '$lib/utils/brain-dump-navigation';
	import { Loader2, CheckCircle, AlertCircle, X, ChevronDown } from 'lucide-svelte';
	import type { BrainDumpNotification } from '$lib/types/notification.types';
	import type { ParsedOperation } from '$lib/types/brain-dump';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { brainDumpV2Store } from '$lib/stores/brain-dump-v2.store';
	import { brainDumpService } from '$lib/services/braindump-api.service';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';

	const MULTI_BRAINDUMP_ENABLED = true;

	let { notification }: { notification: BrainDumpNotification } = $props();

	const dispatch = createEventDispatcher();

	// Component loading states
	let componentsLoaded = $state({
		parseResults: false,
		processing: false,
		dualProcessing: false,
		success: false,
		operationEdit: false
	});

	// Lazy-loaded components
	let ParseResultsDiffView = $state<any>(null);
	let DualProcessingResults = $state<any>(null);
	let SuccessView = $state<any>(null);
	let OperationEditModal = $state<any>(null);

	// Component references
	let dualProcessingComponent = $state<any>(null);

	// Edit modal state
	let editModal = $state({ isOpen: false, operation: null as ParsedOperation | null });

	// Track cleanup per-notification to avoid duplicate store mutations
	let lastNotificationBrainDumpId = $state<string | null>(null);
	let hasClearedOnSuccess = $state(false);

	// Refresh modal state for same-project updates
	let showRefreshModal = $state(false);
	let pendingProjectUpdate = $state<{ projectId: string; projectName: string } | null>(null);

	// Track if applying operations
	let isApplyingOperations = $state(false);

	// Auto-accept preference from store (defaults to false when unavailable)
	let storeState = $derived($brainDumpV2Store);
	let autoAcceptEnabled = $derived(storeState.processing?.autoAcceptEnabled ?? false);

	// Get the current brain dump from the store (for real-time streaming updates)
	let brainDumpId = $derived(notification.data.brainDumpId);
	let brainDumpFromStore = $derived.by(() => {
		if (brainDumpId && storeState.activeBrainDumps) {
			return storeState.activeBrainDumps.get(brainDumpId);
		}
		return null;
	});

	// Derive streaming state from store (real-time updates) with fallback to notification
	let realtimeStreamingState = $derived(
		brainDumpFromStore?.processing?.streaming || notification.data.streamingState
	);

	// Determine current view
	function resolveCurrentView() {
		const status = notification.status;
		const data = notification.data;

		if (status === 'success' && data.executionResult) {
			return 'success';
		}

		if (status === 'success' && data.parseResults) {
			return 'parseResults';
		}

		if (status === 'processing') {
			return 'processing';
		}

		return 'idle';
	}

	let currentView = $derived(resolveCurrentView());

	// Component loading mutex to prevent duplicate loads
	const componentLoadingMutex = new Set<string>();

	// Lazy load components
	async function loadComponent(
		componentKey: keyof typeof componentsLoaded,
		importFn: () => Promise<any>
	) {
		if (componentLoadingMutex.has(componentKey)) {
			while (componentLoadingMutex.has(componentKey)) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
			return;
		}

		if (componentsLoaded[componentKey]) {
			return;
		}

		componentLoadingMutex.add(componentKey);

		try {
			const module = await importFn();
			switch (componentKey) {
				case 'parseResults':
					ParseResultsDiffView = module.default;
					break;
				case 'dualProcessing':
					DualProcessingResults = module.default;
					break;
				case 'success':
					SuccessView = module.default;
					break;
				case 'operationEdit':
					OperationEditModal = module.default;
					break;
			}
			componentsLoaded[componentKey] = true;
		} finally {
			componentLoadingMutex.delete(componentKey);
		}
	}

	// Auto-load components based on current view
	$effect(() => {
		if (currentView === 'parseResults' && !componentsLoaded.parseResults) {
			loadComponent(
				'parseResults',
				() => import('$lib/components/brain-dump/ParseResultsDiffView.svelte')
			);
		} else if (currentView === 'processing' && !componentsLoaded.dualProcessing) {
			loadComponent(
				'dualProcessing',
				() => import('$lib/components/brain-dump/DualProcessingResults.svelte')
			);
		} else if (currentView === 'success' && !componentsLoaded.success) {
			loadComponent('success', () => import('$lib/components/brain-dump/SuccessView.svelte'));
		}
	});

	// Reset cleanup tracking when the active brain dump changes
	$effect(() => {
		const currentBrainDumpId = notification.data.brainDumpId ?? null;
		if (currentBrainDumpId !== lastNotificationBrainDumpId) {
			hasClearedOnSuccess = false;
			lastNotificationBrainDumpId = currentBrainDumpId;
		}
	});

	// Automatically clear store state once the success view is reached
	$effect(() => {
		if (currentView === 'success' && !hasClearedOnSuccess) {
			cleanupBrainDumpState('success');
			hasClearedOnSuccess = true;
		}
	});

	// Event handlers
	async function handleApplyOperations() {
		isApplyingOperations = true;

		const { brainDumpId, parseResults, selectedProject, inputText } = notification.data;

		if (!parseResults || !brainDumpId) {
			toastService.error('Missing parse results or brain dump ID');
			isApplyingOperations = false;
			return;
		}

		// Get disabled operations (if any)
		// In multi-mode, disabled operations are tracked per-brain-dump
		const brainDump = MULTI_BRAINDUMP_ENABLED
			? brainDumpV2Store.getBrainDump(brainDumpId)
			: null;

		const disabledOperations = brainDump?.disabledOperations || new Set<string>();

		// Filter enabled operations
		const enabledOperations = parseResults.operations.filter(
			(op) => !disabledOperations.has(op.id)
		);

		if (enabledOperations.length === 0) {
			toastService.error('No operations to apply');
			isApplyingOperations = false;
			return;
		}

		try {
			console.log('[BrainDumpModalContent] Applying operations for brain dump:', brainDumpId);

			// Call API to save brain dump and execute operations
			const response = await brainDumpService.saveBrainDump({
				operations: enabledOperations,
				originalText: inputText,
				insights: parseResults.insights,
				summary: parseResults.summary,
				title: parseResults.title,
				projectQuestions: parseResults.projectQuestions || [],
				brainDumpId: brainDumpId,
				selectedProjectId: selectedProject?.id === 'new' ? undefined : selectedProject?.id
			});

			if (response.success && response.data) {
				console.log('[BrainDumpModalContent] Operations applied successfully');

				// Update notification status to success
				const { notificationStore } = await import('$lib/stores/notification.store');
				notificationStore.setStatus(notification.id, 'success');

				// Update notification data with execution results
				notificationStore.update(notification.id, {
					data: {
						...notification.data,
						executionResult: response.data
					}
				});

				toastService.success('Brain dump processed successfully!');

				// If multi-mode, mark brain dump as complete
				if (MULTI_BRAINDUMP_ENABLED) {
					// Note: We don't call completeBrainDump here because user might want to view results
					// The dismiss action will handle cleanup when user closes the notification
				}
			} else {
				throw new Error(response.error || 'Failed to apply operations');
			}
		} catch (error) {
			console.error('[BrainDumpModalContent] Failed to apply operations:', error);
			toastService.error(
				`Failed to apply operations: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		} finally {
			isApplyingOperations = false;
		}
	}

	function handleToggleOperation(event: CustomEvent) {
		const operationId = event.detail?.operationId || event.detail;
		const brainDumpId = notification.data.brainDumpId;

		if (!brainDumpId || !operationId) {
			console.error('[BrainDumpModalContent] Missing brainDumpId or operationId for toggle');
			return;
		}

		if (MULTI_BRAINDUMP_ENABLED) {
			// Toggle operation in multi-mode store
			const brainDump = brainDumpV2Store.getBrainDump(brainDumpId);
			if (!brainDump) {
				console.error('[BrainDumpModalContent] Brain dump not found:', brainDumpId);
				return;
			}

			const newDisabledOperations = new Set(brainDump.disabledOperations);
			if (newDisabledOperations.has(operationId)) {
				newDisabledOperations.delete(operationId);
			} else {
				newDisabledOperations.add(operationId);
			}

			brainDumpV2Store.updateBrainDump(brainDumpId, {
				disabledOperations: newDisabledOperations
			});

			console.log(
				'[BrainDumpModalContent] Toggled operation:',
				operationId,
				'for brain dump:',
				brainDumpId
			);
		} else {
			// Legacy mode
			brainDumpV2Store.toggleOperation(operationId);
		}
	}

	function handleUpdateOperation(event: CustomEvent) {
		dispatch('updateOperation', event.detail);
	}

	function handleRemoveOperation(event: CustomEvent) {
		dispatch('removeOperation', event.detail);
	}

	async function handleEditOperation(event: CustomEvent) {
		await loadComponent(
			'operationEdit',
			() => import('$lib/components/brain-dump/OperationEditModal.svelte')
		);
		editModal.isOpen = true;
		editModal.operation = event.detail;
	}

	function handleSaveOperation(updatedOperation: ParsedOperation) {
		dispatch('updateOperation', updatedOperation);
		editModal.isOpen = false;
		editModal.operation = null;
	}

	function handleToggleAutoAccept() {
		dispatch('toggleAutoAccept');
	}

	function handleApplyAutoAccept() {
		dispatch('applyAutoAccept');
	}

	async function handleGoToProject() {
		if (!successData || !successData.projectId) {
			console.error('[BrainDumpModalContent] Missing project information on success view', {
				successData
			});
			toastService.error('Unable to navigate to project - details unavailable');
			return;
		}

		const projectId = successData.projectId;
		const projectName = successData.projectName || 'Project';

		try {
			await smartNavigateToProject(projectId, projectName, {
				isAutoAccept: autoAcceptEnabled,
				isNewProject: successData.isNewProject,
				onSameProject: () => {
					if (!autoAcceptEnabled) {
						pendingProjectUpdate = { projectId, projectName };
						showRefreshModal = true;
					} else {
						handleClose();
					}
				},
				onNavigate: () => {
					handleClose();
				}
			});
			dispatch('goToProject', { projectId });
		} catch (error) {
			console.error('[BrainDumpModalContent] Failed to navigate to project', error);
			toastService.error('Something went wrong while navigating to the project');
		}
	}

	function handleStartNew() {
		pendingProjectUpdate = null;
		showRefreshModal = false;
		brainDumpV2Store.resetForNewSession();
		brainDumpV2Store.clearParseResults();
		brainDumpV2Store.openModal();
		brainDumpV2Store.closeNotification();
		handleClose();
		dispatch('startNew');
	}

	function handleClose() {
		dispatch('close');
	}

	function handleMinimize() {
		dispatch('minimize');
	}

	function cleanupBrainDumpState(reason: 'cancel' | 'success') {
		const brainDumpId = notification.data.brainDumpId;

		if (MULTI_BRAINDUMP_ENABLED) {
			if (!brainDumpId) {
				console.warn(
					`[BrainDumpModalContent] Unable to ${reason} brain dump - missing brainDumpId`
				);
				return;
			}

			if (!brainDumpV2Store.getBrainDump(brainDumpId)) {
				return;
			}

			if (reason === 'cancel') {
				brainDumpV2Store.cancelBrainDump(brainDumpId);
			} else {
				brainDumpV2Store.completeBrainDump(brainDumpId);
			}
		} else {
			brainDumpV2Store.clearParseResults();
		}
	}

	function handleCancel() {
		cleanupBrainDumpState('cancel');
		dispatch('cancel');
	}

	async function handleNavigateToHistory(event: CustomEvent) {
		const url = event.detail?.url;
		if (!url) {
			toastService.error('History link is unavailable right now');
			return;
		}

		dispatch('navigateToHistory', { url });
		brainDumpV2Store.closeNotification();
		handleClose();

		try {
			await goto(url);
		} catch (error) {
			console.error('[BrainDumpModalContent] Failed to navigate to history view', error);
			window.location.href = url;
		}
	}

	async function handleRefreshConfirm() {
		const projectId = pendingProjectUpdate?.projectId;
		const projectName = pendingProjectUpdate?.projectName || 'Project';
		dispatch('refreshConfirm', { projectId });
		showRefreshModal = false;
		pendingProjectUpdate = null;

		try {
			if (projectId) {
				// Dispatch event to trigger client-side data refresh on project page
				// The project page listens for this event and calls dataService.refreshAll()
				window.dispatchEvent(
					new CustomEvent('brain-dump-applied', {
						detail: { projectId, projectName }
					})
				);

				// Also invalidate server-side data for good measure
				await invalidate(`projects:${projectId}`);
				await tick();
				await new Promise((resolve) => setTimeout(resolve, 150));
			}
			brainDumpV2Store.closeNotification();
			handleClose();
			toastService.success('✨ Project updated successfully', {
				duration: TOAST_DURATION.SHORT
			});
		} catch (error) {
			console.warn(
				'[BrainDumpModalContent] Soft refresh failed, falling back to reload',
				error
			);
			brainDumpV2Store.closeNotification();
			handleClose();
			setTimeout(() => {
				if (typeof window !== 'undefined') {
					window.location.reload();
				}
			}, 100);
		}
	}

	function handleRefreshCancel() {
		const projectId = pendingProjectUpdate?.projectId;
		dispatch('refreshCancel', { projectId });
		showRefreshModal = false;
		pendingProjectUpdate = null;
		toastService.info('You can refresh anytime to see the latest changes', {
			duration: TOAST_DURATION.STANDARD
		});
		brainDumpV2Store.closeNotification();
		handleClose();
	}

	// Derive status info for header
	let statusInfo = $derived(
		(() => {
			const status = notification.status;
			const data = notification.data;

			if (status === 'processing') {
				return {
					icon: 'processing',
					title: 'Processing brain dump',
					subtitle: data.streamingState?.contextProgress || 'Analyzing content...'
				};
			}

			if (status === 'success' && data.executionResult) {
				return {
					icon: 'success',
					title: 'Success!',
					subtitle: 'Operations applied successfully'
				};
			}

			if (status === 'success' && data.parseResults) {
				const operationsCount = data.parseResults.operations?.length || 0;
				return {
					icon: 'success',
					title: 'Brain dump processed',
					subtitle: `${operationsCount} operation${operationsCount !== 1 ? 's' : ''} ready`
				};
			}

			if (status === 'error') {
				return {
					icon: 'error',
					title: 'Processing failed',
					subtitle: notification.progress.message || 'An error occurred'
				};
			}

			return {
				icon: 'idle',
				title: 'Ready',
				subtitle: ''
			};
		})()
	);

	// Normalized success payload for SuccessView & store syncing
	let successData = $derived.by(() => {
		const executionResult = notification.data.executionResult;
		if (!executionResult) {
			return null;
		}

		const successfulOperations =
			executionResult.successfulOperations ?? executionResult.successful?.length ?? 0;
		const failedOperations =
			executionResult.failedOperations ?? executionResult.failed?.length ?? 0;

		const projectInfo = executionResult.projectInfo;
		const selectedProject = notification.data.selectedProject;
		const resolvedProjectId =
			projectInfo?.id ??
			(selectedProject?.id && selectedProject.id !== 'new' ? selectedProject.id : undefined);
		const resolvedProjectName = projectInfo?.name ?? selectedProject?.name ?? 'Project';
		const isNewProject = projectInfo?.isNew ?? selectedProject?.id === 'new';

		const rawErrors = executionResult.results ?? executionResult.failed ?? [];
		const operationErrors = rawErrors
			.filter((result) => Boolean(result?.error))
			.map((result) => ({
				operationId: result.id ?? result.operationId ?? undefined,
				table: result.table ?? 'unknown',
				operation: result.operation ?? result.operationType ?? 'operation',
				error: result.error ?? 'Unknown error'
			}));

		return {
			brainDumpId: executionResult.brainDumpId ?? notification.data.brainDumpId,
			brainDumpType: isNewProject ? 'project' : 'update',
			projectId: resolvedProjectId,
			projectName: resolvedProjectName,
			isNewProject,
			operationsCount: successfulOperations,
			failedOperations,
			operationErrors: operationErrors.length > 0 ? operationErrors : undefined
		};
	});

	// Keep store success state aligned with notification lifecycle
	$effect(() => {
		if (!successData) {
			return;
		}

		if (!MULTI_BRAINDUMP_ENABLED) {
			brainDumpV2Store.setSuccessData(successData);
			return;
		}

		const targetBrainDumpId = successData.brainDumpId ?? notification.data.brainDumpId ?? null;

		if (targetBrainDumpId && brainDumpV2Store.getBrainDump(targetBrainDumpId)) {
			brainDumpV2Store.setSuccessData(successData);
		}
	});
</script>

<!-- Wrap in Modal component -->
<Modal
	isOpen={true}
	onClose={handleClose}
	title=""
	size="lg"
	showCloseButton={false}
	closeOnBackdrop={true}
	closeOnEscape={true}
>
	{#snippet header()}
		<!-- Modal Header -->
		<div
			class="{currentView === 'parseResults'
				? 'hidden'
				: ''} text-center py-4 sm:py-6 px-4 sm:px-6 border-b border-gray-200 dark:border-gray-700"
		>
			<div class="flex justify-between items-start mb-4">
				<div class="flex items-center gap-3">
					<div>
						{#if statusInfo.icon === 'processing'}
							<Loader2
								class="w-6 h-6 text-primary-600 dark:text-primary-400 animate-spin"
							/>
						{:else if statusInfo.icon === 'success'}
							<CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
						{:else if statusInfo.icon === 'error'}
							<AlertCircle class="w-6 h-6 text-red-600 dark:text-red-400" />
						{/if}
					</div>
					<div class="text-left">
						<h2 class="text-xl font-bold text-gray-900 dark:text-white">
							{statusInfo.title}
						</h2>
						{#if statusInfo.subtitle}
							<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
								{statusInfo.subtitle}
							</p>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Button
						variant="ghost"
						onclick={handleMinimize}
						aria-label="Minimize"
						icon={ChevronDown}
					></Button>
					<Button
						variant="ghost"
						onclick={handleClose}
						aria-label="Close notification"
						icon={X}
					></Button>
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Modal Content -->
		<div class="px-4 sm:px-6 py-4 sm:py-5">
			{#if currentView === 'success'}
				<!-- Success View -->
				{#if SuccessView && successData}
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
					<!-- Loading success view -->
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					</div>
				{/if}
			{:else if currentView === 'parseResults'}
				<!-- Parse Results View -->
				{#if ParseResultsDiffView && notification.data.parseResults}
					<ParseResultsDiffView
						parseResults={notification.data.parseResults}
						disabledOperations={new Set()}
						isProcessing={false}
						isApplying={isApplyingOperations}
						showAutoAcceptToggle={true}
						autoAcceptEnabled={false}
						canAutoAcceptCurrent={true}
						on:toggleOperation={handleToggleOperation}
						on:updateOperation={handleUpdateOperation}
						on:removeOperation={handleRemoveOperation}
						on:editOperation={handleEditOperation}
						on:toggleAutoAccept={handleToggleAutoAccept}
						on:applyAutoAccept={handleApplyAutoAccept}
						on:apply={handleApplyOperations}
						on:cancel={handleCancel}
					/>
				{:else}
					<!-- Loading parse results view -->
					<div class="flex items-center justify-center py-8">
						<Loader2
							class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
						/>
					</div>
				{/if}
			{:else if currentView === 'processing'}
				<!-- Processing View -->
				{#if DualProcessingResults && realtimeStreamingState}
					<DualProcessingResults
						bind:this={dualProcessingComponent}
						analysisStatus={realtimeStreamingState.analysisStatus ?? 'not_needed'}
						contextStatus={realtimeStreamingState.contextStatus}
						tasksStatus={realtimeStreamingState.tasksStatus}
						analysisResult={realtimeStreamingState.analysisResult}
						contextResult={realtimeStreamingState.contextResult}
						tasksResult={realtimeStreamingState.tasksResult}
						isShortBraindump={notification.data.processingType === 'short'}
						showContextPanel={notification.data.processingType === 'dual'}
						showAnalysisPanel={!!notification.data.selectedProject?.id &&
							notification.data.selectedProject.id !== 'new'}
						isProcessing={true}
					/>
				{:else}
					<!-- Loading processing view or simple spinner -->
					<div class="text-center space-y-4">
						<div class="flex justify-center">
							<Loader2
								class="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin"
							/>
						</div>
						<div>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								{notification.data.processingType === 'dual'
									? 'Analyzing content for context and tasks...'
									: notification.data.processingType === 'short'
										? 'Processing quick update...'
										: 'Processing your brain dump...'}
							</p>
						</div>
					</div>
				{/if}
			{:else}
				<!-- Empty/Idle state -->
				<div class="text-center py-8">
					<p class="text-gray-500 dark:text-gray-400">No content to display</p>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>

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
		{#snippet children()}
			<div class="p-6 text-center">
				<CheckCircle class="w-12 h-12 mx-auto mb-4 text-green-600 dark:text-green-400" />
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
					{pendingProjectUpdate.projectName} has been updated
				</h3>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					Your changes have been applied. Refresh the page to see the latest updates.
				</p>
				<div class="flex gap-3 justify-center">
					<Button variant="ghost" onclick={handleRefreshCancel} class="min-w-[100px]">
						Later
					</Button>
					<Button variant="primary" onclick={handleRefreshConfirm} class="min-w-[100px]">
						Refresh Now
					</Button>
				</div>
			</div>
		{/snippet}
	</Modal>
{/if}
