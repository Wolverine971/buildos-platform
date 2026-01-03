<!-- apps/web/src/lib/components/project/ProjectSynthesis.svelte -->
<script lang="ts">
	import {
		Brain,
		Zap,
		AlertTriangle,
		CheckCircle,
		ArrowRight,
		Loader2,
		Sparkles,
		Eye,
		Edit3,
		RefreshCw,
		Save,
		Trash2,
		X,
		Clock,
		AlertCircle
	} from 'lucide-svelte';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { formatDistanceToNow } from 'date-fns';
	import OperationsList from '$lib/components/brain-dump/OperationsList.svelte';
	import SynthesisOperationModal from '$lib/components/project/SynthesisOperationModal.svelte';
	import TaskMappingView from '$lib/components/synthesis/TaskMappingView.svelte';
	import SynthesisOptionsModal from '$lib/components/project/synthesis/SynthesisOptionsModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import InfoModal from '$lib/components/ui/InfoModal.svelte';
	import type { ParsedOperation } from '$lib/types/brain-dump';
	import type { SynthesisOptions } from '$lib/types/synthesis';
	import { onMount, onDestroy } from 'svelte';
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { requireApiData } from '$lib/utils/api-client-helpers';

	// Props - only callbacks and configuration (following the standard pattern)
	export let loading = false;
	export let error: string | null = null;
	export let onGenerate: (options?: SynthesisOptions) => Promise<void>;
	export let onGenerationFinished: () => Promise<void>;
	export let onSaveSynthesis: (
		synthesisContent: any,
		status?: 'draft' | 'completed',
		synthesisId?: string
	) => Promise<any>;
	export let onDeleteSynthesis: () => Promise<boolean>;

	// Get data from store (following the standard pattern)
	$: storeState = $projectStoreV2;
	$: project = storeState.project;
	$: synthesis = storeState.synthesis;
	$: tasks = storeState.tasks || [];

	// Simplified state management without stores
	let currentPhase: 'input' | 'review' | 'completed' = 'input';
	let disabledOperations = new Set<string>();
	let isApplying = false;
	let processingResults: any = null;
	let completedSynthesis: any = null;

	// Dirty state and save management
	let isSaving = false;
	let isDeleting = false;
	let lastSavedAt: string | null = null;
	let autoSaveTimeout: number | null = null;
	let showUnsavedChangesWarning = false;

	// Modal state
	let operationModal = {
		isOpen: false,
		operation: null as ParsedOperation | null
	};
	let synthesisOptionsModalOpen = false;

	// Info modal state
	let infoModal = {
		isOpen: false,
		title: '',
		message: ''
	};
	let deleteConfirmModalOpen = false;
	let discardConfirmModalOpen = false;
	let restoreDraftModalOpen = false;
	let restoreDraftData: any = null;
	let leaveConfirmModalOpen = false;
	let navigationCancelFn: (() => void) | null = null;

	// View toggles
	let showTaskMapping = true;
	let showOperationsList = false;

	// Synthesis content variables - properly reactive
	let synthesisContent: any = null;
	let operations: ParsedOperation[] = [];
	let comparison: any[] = [];
	let insights = '';
	let summary = '';

	// Memoized date formatter with proper LRU cache
	const relativeTimeCache = new Map<string, { value: string; timestamp: number }>();
	const CACHE_MAX_SIZE = 50;
	const CACHE_TTL = 60000; // 1 minute TTL for relative time strings

	function formatLastGenerated(dateString: string): string {
		const now = Date.now();

		// Check cache with TTL
		const cached = relativeTimeCache.get(dateString);
		if (cached && now - cached.timestamp < CACHE_TTL) {
			// Move to end for LRU behavior
			relativeTimeCache.delete(dateString);
			relativeTimeCache.set(dateString, cached);
			return cached.value;
		}

		const result = formatDistanceToNow(new Date(dateString), { addSuffix: true });

		// LRU eviction: remove oldest entry if cache is full
		if (relativeTimeCache.size >= CACHE_MAX_SIZE) {
			const firstKey = relativeTimeCache.keys().next().value;
			if (firstKey) {
				relativeTimeCache.delete(firstKey);
			}
		}

		// Add to cache with timestamp
		relativeTimeCache.set(dateString, { value: result, timestamp: now });

		return result;
	}

	// Track if we've made local modifications to avoid reactive overrides
	let hasLocalModifications = false;
	let originalSynthesisContent: any = null;

	// Optimized reactive updates - split for better performance
	$: hasSynthesis = synthesis?.synthesis_content != null;

	// Only update when synthesis actually changes, not on every store update
	$: if (hasSynthesis && !hasLocalModifications) {
		// Batch updates to reduce reactivity cycles
		const content = synthesis.synthesis_content;
		if (content !== synthesisContent) {
			synthesisContent = content;
			operations = content?.operations || [];
			comparison = content?.comparison || [];
			insights = content?.insights || '';
			summary = content?.summary || '';
			currentPhase = 'review';
			lastSavedAt = synthesis.updated_at || synthesis.created_at;
			// Use structuredClone if available, fallback to JSON
			originalSynthesisContent =
				typeof structuredClone !== 'undefined'
					? structuredClone(content)
					: JSON.parse(JSON.stringify(content));
		}
	}

	// Separate reactive for cleanup when no synthesis
	$: if (!hasSynthesis && !loading && !hasLocalModifications) {
		if (synthesisContent !== null) {
			synthesisContent = null;
			operations = [];
			comparison = [];
			insights = '';
			summary = '';
			currentPhase = 'input';
			lastSavedAt = null;
			originalSynthesisContent = null;
		}
	}

	// Debounced generate handler
	let generateTimeout: number;

	async function handleGenerate(options?: SynthesisOptions) {
		clearTimeout(generateTimeout);
		generateTimeout = window.setTimeout(async () => {
			currentPhase = 'input';
			disabledOperations = new Set();
			processingResults = null;
			completedSynthesis = null;
			hasLocalModifications = false; // Reset local modifications flag

			// Clear existing synthesis data
			synthesisContent = null;
			operations = [];
			comparison = [];
			insights = '';
			summary = '';

			await onGenerate(options);

			// The reactive statement above will handle setting currentPhase to 'review' when synthesis is populated
		}, 100);
	}

	function openSynthesisOptions() {
		synthesisOptionsModalOpen = true;
	}

	function handleSynthesisOptionsConfirm(options: SynthesisOptions) {
		synthesisOptionsModalOpen = false;
		handleGenerate(options);
	}

	// Optimized operation application
	async function applyOperations() {
		if (!synthesisContent || isApplying) return;

		// Filter operations efficiently
		const enabledOperations = operations.filter(
			(op: ParsedOperation) => !disabledOperations.has(op.id)
		);

		if (enabledOperations.length === 0) {
			infoModal = {
				isOpen: true,
				title: 'No Operations Selected',
				message: 'Please select at least one operation to apply.'
			};
			return;
		}

		isApplying = true;
		processingResults = null;

		try {
			const response = await fetch(`/api/projects/${project.id}/synthesize/apply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ operations: enabledOperations })
			});

			const result = await requireApiData<any>(response, 'Failed to apply operations');

			processingResults = result;

			// Store completion data efficiently
			completedSynthesis = {
				appliedAt: new Date().toISOString(),
				operationsApplied: enabledOperations,
				results: result,
				originalSynthesis: {
					summary: summary,
					insights: insights,
					comparison: comparison
				}
			};

			currentPhase = 'completed';
			await onGenerationFinished();
		} catch (err: any) {
			console.error('Error applying operations:', err);
			infoModal = {
				isOpen: true,
				title: 'Operation Failed',
				message: `Failed to apply operations: ${err.message}. Please try again.`
			};
			processingResults = { error: err.message };
		} finally {
			isApplying = false;
		}
	}

	// Optimized operation management
	function handleEditOperation(operation: ParsedOperation) {
		operationModal = { isOpen: true, operation };
	}

	function handleSaveOperation(updatedOperation: ParsedOperation) {
		if (synthesisContent && operations) {
			// Update operations array
			const updatedOperations = operations.map((op: ParsedOperation) =>
				op.id === updatedOperation.id ? updatedOperation : op
			);
			operations = updatedOperations;

			// Update the synthesis content as well
			synthesisContent = {
				...synthesisContent,
				operations: updatedOperations
			};

			hasLocalModifications = true; // Mark that we've made local changes
			scheduleAutoSave();
		}
		operationModal = { isOpen: false, operation: null };
	}

	function handleRemoveOperation(operationId: string) {
		if (synthesisContent && operations) {
			console.log(
				'Removing operation:',
				operationId,
				'from',
				operations.length,
				'operations'
			);
			const filteredOperations = operations.filter(
				(op: ParsedOperation) => op.id !== operationId
			);
			operations = filteredOperations;
			synthesisContent = {
				...synthesisContent,
				operations: filteredOperations
			};

			hasLocalModifications = true; // Mark that we've made local changes
			scheduleAutoSave();
			console.log('After removal:', operations.length, 'operations remaining');
		}
	}

	function handleToggleOperation(operationId: string) {
		if (disabledOperations.has(operationId)) {
			disabledOperations.delete(operationId);
		} else {
			disabledOperations.add(operationId);
		}
		disabledOperations = new Set(disabledOperations); // Trigger reactivity
	}

	function startNewSynthesis() {
		currentPhase = 'input';
		disabledOperations = new Set();
		processingResults = null;
		completedSynthesis = null;
		hasLocalModifications = false; // Reset local modifications flag

		// Clear synthesis data
		synthesisContent = null;
		operations = [];
		comparison = [];
		insights = '';
		summary = '';
		lastSavedAt = null;
		originalSynthesisContent = null;
		clearAutoSave();
	}

	// Save synthesis to database
	async function saveSynthesis() {
		if (!synthesisContent || isSaving) return;

		isSaving = true;
		try {
			const savedSynthesis = await onSaveSynthesis(synthesisContent, 'draft', synthesis?.id);
			if (savedSynthesis) {
				lastSavedAt = savedSynthesis.updated_at || savedSynthesis.created_at;
				originalSynthesisContent = JSON.parse(JSON.stringify(synthesisContent));
				hasLocalModifications = false;
				clearAutoSave();
			}
		} finally {
			isSaving = false;
		}
	}

	// Delete synthesis from database
	function confirmDeleteSynthesis() {
		deleteConfirmModalOpen = true;
	}

	async function deleteSynthesis() {
		if (isDeleting) return;

		deleteConfirmModalOpen = false;
		isDeleting = true;
		try {
			const success = await onDeleteSynthesis();
			if (success) {
				startNewSynthesis();
			}
		} finally {
			isDeleting = false;
		}
	}

	// Discard unsaved changes
	function confirmDiscardChanges() {
		if (!originalSynthesisContent) return;
		discardConfirmModalOpen = true;
	}

	function discardChanges() {
		discardConfirmModalOpen = false;
		synthesisContent = JSON.parse(JSON.stringify(originalSynthesisContent));
		operations = synthesisContent?.operations || [];
		comparison = synthesisContent?.comparison || [];
		insights = synthesisContent?.insights || '';
		summary = synthesisContent?.summary || '';
		hasLocalModifications = false;
		clearAutoSave();
	}

	// Auto-save functionality
	function scheduleAutoSave() {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}

		// Save to localStorage immediately
		if (browser && synthesisContent) {
			const autoSaveData = {
				projectId: project.id,
				synthesisContent,
				timestamp: Date.now()
			};
			localStorage.setItem(`synthesis_draft_${project.id}`, JSON.stringify(autoSaveData));
		}

		// Schedule database save after 5 seconds of inactivity
		autoSaveTimeout = window.setTimeout(() => {
			if (hasLocalModifications) {
				saveSynthesis();
			}
		}, 5000);
	}

	function clearAutoSave() {
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
			autoSaveTimeout = null;
		}
		if (browser) {
			localStorage.removeItem(`synthesis_draft_${project.id}`);
		}
	}

	// Check for unsaved changes - optimized to avoid expensive JSON.stringify on every update
	let hasUnsavedChanges = false;
	$: {
		if (!hasLocalModifications || !originalSynthesisContent) {
			hasUnsavedChanges = false;
		} else if (synthesisContent === originalSynthesisContent) {
			hasUnsavedChanges = false;
		} else {
			// Only do expensive comparison when we know there might be changes
			hasUnsavedChanges =
				JSON.stringify(synthesisContent) !== JSON.stringify(originalSynthesisContent);
		}
	}

	// Memoized completion summary computation
	let completionSummaryCache: any = null;
	let lastCompletedSynthesis: any = null;

	$: if (completedSynthesis !== lastCompletedSynthesis) {
		lastCompletedSynthesis = completedSynthesis;

		if (completedSynthesis && completedSynthesis.results) {
			const successful = completedSynthesis.results.successful || [];
			const failed = completedSynthesis.results.failed || [];

			completionSummaryCache = {
				consolidations: successful.filter(
					(op: any) =>
						op.operation === 'update' &&
						op.reasoning?.toLowerCase().includes('consolidat')
				).length,
				newTasks: successful.filter((op: any) => op.operation === 'create').length,
				deletedTasks: successful.filter(
					(op: any) => op.operation === 'update' && op.data?.deleted_at
				).length,
				totalSuccessful: successful.length,
				totalFailed: failed.length
			};
		} else {
			completionSummaryCache = null;
		}
	}

	// Draft restoration functions
	function restoreDraft() {
		if (restoreDraftData) {
			synthesisContent = restoreDraftData;
			operations = restoreDraftData?.operations || [];
			comparison = restoreDraftData?.comparison || [];
			insights = restoreDraftData?.insights || '';
			summary = restoreDraftData?.summary || '';
			currentPhase = 'review';
			hasLocalModifications = true;
		}
		restoreDraftModalOpen = false;
		restoreDraftData = null;
	}

	function discardDraft() {
		if (browser && project?.id) {
			const draftKey = `synthesis_draft_${project.id}`;
			localStorage.removeItem(draftKey);
		}
		restoreDraftModalOpen = false;
		restoreDraftData = null;
	}

	// Load draft from localStorage on mount
	onMount(() => {
		if (browser) {
			const draftKey = `synthesis_draft_${project.id}`;
			const draftData = localStorage.getItem(draftKey);

			if (draftData && !synthesis) {
				try {
					const { synthesisContent: draft, timestamp } = JSON.parse(draftData);
					const age = Date.now() - timestamp;

					// Only restore if less than 24 hours old
					if (age < 24 * 60 * 60 * 1000) {
						// Show restore draft modal
						restoreDraftData = draft;
						restoreDraftModalOpen = true;
					} else {
						localStorage.removeItem(draftKey);
					}
				} catch (e) {
					console.error('Failed to restore draft:', e);
					localStorage.removeItem(draftKey);
				}
			}
		}
	});

	// Navigation confirmation functions
	function confirmLeave() {
		leaveConfirmModalOpen = false;
		clearAutoSave();
		// Navigation will proceed
	}

	function cancelLeave() {
		leaveConfirmModalOpen = false;
		if (navigationCancelFn) {
			navigationCancelFn();
			navigationCancelFn = null;
		}
	}

	// Warn before navigating away with unsaved changes
	beforeNavigate(({ cancel }) => {
		if (hasUnsavedChanges) {
			showUnsavedChangesWarning = true;
			navigationCancelFn = cancel;
			leaveConfirmModalOpen = true;
			cancel(); // Always cancel initially, modal will handle confirmation
			showUnsavedChangesWarning = false;
		}
	});

	onDestroy(() => {
		if (generateTimeout) {
			clearTimeout(generateTimeout);
		}

		// Clean up caches
		relativeTimeCache.clear();

		// Clear auto-save timeout
		clearAutoSave();
	});
</script>

<div class="space-y-6">
	<!-- Header Section -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
				<Brain class="w-6 h-6 text-blue-600 dark:text-blue-400" />
				Project Synthesis
			</h2>
			<p class="text-gray-600 dark:text-gray-400 mt-1">
				AI-powered analysis to consolidate tasks and identify next steps
			</p>
		</div>

		<div class="flex items-center gap-3">
			{#if lastSavedAt}
				<div class="flex items-center gap-2 text-sm">
					{#if hasUnsavedChanges}
						<span class="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
							<AlertCircle class="w-4 h-4" />
							Unsaved changes
						</span>
					{:else}
						<span class="flex items-center gap-1 text-green-600 dark:text-green-400">
							<CheckCircle class="w-4 h-4" />
							Saved
						</span>
					{/if}
					<span class="text-gray-500 dark:text-gray-400">
						<Clock class="w-4 h-4 inline mr-1" />
						{formatLastGenerated(lastSavedAt)}
					</span>
				</div>
			{:else if synthesis && currentPhase === 'review'}
				<span class="text-sm text-gray-500 dark:text-gray-400">
					Generated {formatLastGenerated(synthesis.created_at)}
				</span>
			{/if}

			{#if currentPhase === 'review'}
				{#if hasUnsavedChanges}
					<Button onclick={saveSynthesis} disabled={isSaving} variant="primary" size="sm">
						{#if isSaving}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Saving...
						{:else}
							<Save class="w-4 h-4 mr-2" />
							Save Changes
						{/if}
					</Button>
					<Button onclick={confirmDiscardChanges} variant="outline" size="sm">
						<X class="w-4 h-4 mr-2" />
						Discard
					</Button>
				{/if}
				<Button
					onclick={openSynthesisOptions}
					disabled={loading}
					variant="outline"
					size="sm"
				>
					<RefreshCw class="w-4 h-4 mr-2" />
					Regenerate
				</Button>
				{#if synthesis}
					<Button
						onclick={confirmDeleteSynthesis}
						disabled={isDeleting}
						variant="ghost"
						size="sm"
						class="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
					>
						{#if isDeleting}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Deleting...
						{:else}
							<Trash2 class="w-4 h-4 mr-2" />
							Delete
						{/if}
					</Button>
				{/if}
			{:else if currentPhase === 'completed'}
				<Button onclick={startNewSynthesis} variant="primary" size="sm">
					<Zap class="w-4 h-4 mr-2" />
					New Synthesis
				</Button>
			{/if}
		</div>
	</div>

	<!-- Error State - Only show if there's an actual error message -->
	{#if error && typeof error === 'string' && error.trim() !== ''}
		<div
			class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
		>
			<div class="flex items-center">
				<AlertTriangle class="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
				<span class="text-red-800 dark:text-red-200 font-medium">Synthesis Error</span>
			</div>
			<p class="text-red-700 dark:text-red-300 mt-1">{error}</p>
			<Button
				onclick={() => handleGenerate()}
				variant="ghost"
				size="sm"
				class="mt-3 text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline"
			>
				Try again
			</Button>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div
			class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
		>
			{#await import('./synthesis/SynthesisLoadingState.svelte') then { default: SynthesisLoadingState }}
				<SynthesisLoadingState />
			{/await}
		</div>
	{/if}

	<!-- Phase 1: No Synthesis State -->
	{#if currentPhase === 'input' && !loading && (!error || (typeof error === 'string' && error.trim() === ''))}
		<div
			class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center"
		>
			<Brain class="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
			<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
				Generate Project Synthesis
			</h3>
			<p class="text-gray-600 dark:text-gray-400 mb-4">
				Let AI analyze your {tasks.length} tasks to find duplicates, suggest consolidation, and
				identify next steps.
			</p>
			<Button onclick={openSynthesisOptions} variant="primary" size="md">
				<Zap class="w-5 h-5 mr-2" />
				Start Analysis
			</Button>
		</div>
	{/if}

	<!-- Phase 2: Review Operations -->
	{#if currentPhase === 'review' && synthesisContent && !loading}
		<div class="space-y-6">
			<!-- Summary Section -->
			{#if summary}
				<div
					class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6"
				>
					<h3
						class="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center"
					>
						<Sparkles class="w-5 h-5 mr-2" />
						Analysis Summary
					</h3>
					<p class="text-blue-800 dark:text-blue-200 leading-relaxed">{summary}</p>
				</div>
			{/if}

			<!-- Insights -->
			{#if insights}
				<div
					class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6"
				>
					<h3
						class="text-lg font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center"
					>
						<CheckCircle class="w-5 h-5 mr-2" />
						Key Insights
					</h3>
					<p class="text-green-800 dark:text-green-200 leading-relaxed">{insights}</p>
				</div>
			{/if}

			<!-- View Toggle Buttons -->
			<div class="flex items-center justify-center space-x-4 py-4">
				<Button
					onclick={() => {
						showTaskMapping = true;
						showOperationsList = false;
					}}
					variant={showTaskMapping ? 'primary' : 'outline'}
					size="sm"
				>
					<Eye class="w-4 h-4 mr-2 inline" />
					Task Mapping
				</Button>
				<Button
					onclick={() => {
						showTaskMapping = false;
						showOperationsList = true;
					}}
					variant={showOperationsList ? 'primary' : 'outline'}
					size="sm"
				>
					<Edit3 class="w-4 h-4 mr-2 inline" />
					Edit Operations
				</Button>
			</div>

			<!-- Conditional rendering for better performance -->
			{#if showTaskMapping && operations.length > 0}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
				>
					<TaskMappingView
						{operations}
						{tasks}
						{comparison}
						onOperationEdit={handleEditOperation}
					/>
				</div>
			{/if}

			{#if showOperationsList && operations.length > 0}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
				>
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center space-x-2">
							<Edit3 class="w-5 h-5 text-purple-600 dark:text-purple-400" />
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
								Review Operations ({operations.length})
							</h3>
							{#if hasUnsavedChanges}
								<span
									class="text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full"
								>
									Modified
								</span>
							{/if}
						</div>
						<Button
							onclick={startNewSynthesis}
							variant="ghost"
							size="sm"
							class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
						>
							Start Over
						</Button>
					</div>

					<OperationsList
						{operations}
						{disabledOperations}
						onEditOperation={handleEditOperation}
						onRemoveOperation={handleRemoveOperation}
						onToggleOperation={handleToggleOperation}
					/>
				</div>
			{/if}

			<!-- Apply Operations Button -->
			{#if operations.length > 0}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
				>
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-500 dark:text-gray-400">
							{operations.filter(
								(op: ParsedOperation) => !disabledOperations.has(op.id)
							).length} of {operations.length} operations will be applied
						</div>
						<Button
							onclick={applyOperations}
							disabled={isApplying ||
								operations.filter(
									(op: ParsedOperation) => !disabledOperations.has(op.id)
								).length === 0}
							variant="primary"
							size="md"
							class="bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
						>
							{#if isApplying}
								<Loader2 class="w-4 h-4 mr-2 animate-spin" />
								Applying Operations...
							{:else}
								<ArrowRight class="w-4 h-4 mr-2" />
								Apply Operations
							{/if}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Phase 3: Completed -->
	{#if currentPhase === 'completed' && completedSynthesis}
		<div class="space-y-6">
			<!-- Completion Header -->
			<div
				class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6"
			>
				<div class="flex items-center space-x-2 mb-4">
					<CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
					<h2 class="text-xl font-semibold text-green-900 dark:text-green-100">
						Synthesis Completed Successfully
					</h2>
				</div>
				<p class="text-green-800 dark:text-green-200">
					Applied {formatLastGenerated(completedSynthesis.appliedAt)}
				</p>
			</div>

			<!-- Summary of Changes -->
			{#if completionSummaryCache}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
				>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
						What Was Accomplished
					</h3>

					<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
						{#each [{ label: 'Tasks Consolidated', value: completionSummaryCache.consolidations, color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' }, { label: 'New Tasks Created', value: completionSummaryCache.newTasks, color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' }, { label: 'Tasks Deleted', value: completionSummaryCache.deletedTasks, color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' }, { label: 'Total Changes', value: completionSummaryCache.totalSuccessful, color: 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600' }] as stat}
							<div class="text-center p-4 {stat.color} rounded-lg">
								<div class="text-2xl font-bold">{stat.value}</div>
								<div class="text-sm">{stat.label}</div>
							</div>
						{/each}
					</div>

					<!-- Original Summary -->
					{#if completedSynthesis.originalSynthesis.summary}
						<div
							class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
						>
							<h4 class="font-medium text-blue-900 dark:text-blue-100 mb-2">
								Original Analysis
							</h4>
							<p class="text-blue-800 dark:text-blue-200 text-sm">
								{completedSynthesis.originalSynthesis.summary}
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Call to Action -->
			<div
				class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center"
			>
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					Ready for Another Analysis?
				</h3>
				<p class="text-gray-600 dark:text-gray-400 mb-4">
					Your project has been optimized. Run another synthesis to continue refining your
					tasks.
				</p>
				<Button onclick={startNewSynthesis} variant="primary" size="md">
					<Zap class="w-5 h-5 mr-2" />
					Generate New Synthesis
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Edit Operation Modal - Only render when needed -->
{#if operationModal.isOpen}
	<SynthesisOperationModal
		isOpen={operationModal.isOpen}
		operation={operationModal.operation}
		onSave={handleSaveOperation}
		onClose={() => (operationModal = { isOpen: false, operation: null })}
	/>
{/if}

<!-- Synthesis Options Modal -->
<SynthesisOptionsModal
	isOpen={synthesisOptionsModalOpen}
	{project}
	onConfirm={handleSynthesisOptionsConfirm}
	onClose={() => (synthesisOptionsModalOpen = false)}
/>

<!-- Info Modal -->
<InfoModal
	isOpen={infoModal.isOpen}
	title={infoModal.title}
	on:close={() => (infoModal.isOpen = false)}
>
	<p class="text-gray-600 dark:text-gray-400">{infoModal.message}</p>
</InfoModal>

<!-- Delete Confirmation Modal -->
<InfoModal
	isOpen={deleteConfirmModalOpen}
	title="Delete Synthesis"
	buttonText="Delete"
	on:close={deleteSynthesis}
>
	<p class="text-gray-600 dark:text-gray-400">
		Are you sure you want to delete this synthesis? This action cannot be undone.
	</p>
	{#snippet footer()}
		<div
			class="flex justify-end space-x-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		>
			<Button onclick={() => (deleteConfirmModalOpen = false)} variant="outline" size="sm">
				Cancel
			</Button>
			<Button
				onclick={deleteSynthesis}
				variant="primary"
				size="sm"
				class="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
			>
				Delete
			</Button>
		</div>
	{/snippet}
</InfoModal>

<!-- Discard Changes Confirmation Modal -->
<InfoModal
	isOpen={discardConfirmModalOpen}
	title="Discard Changes"
	buttonText="Discard"
	on:close={discardChanges}
>
	<p class="text-gray-600 dark:text-gray-400">
		Are you sure you want to discard your unsaved changes?
	</p>
	{#snippet footer()}
		<div
			class="flex justify-end space-x-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		>
			<Button onclick={() => (discardConfirmModalOpen = false)} variant="outline" size="sm">
				Cancel
			</Button>
			<Button onclick={discardChanges} variant="primary" size="sm">Discard</Button>
		</div>
	{/snippet}
</InfoModal>

<!-- Restore Draft Modal -->
<InfoModal
	isOpen={restoreDraftModalOpen}
	title="Restore Draft"
	buttonText="Restore"
	on:close={restoreDraft}
>
	<p class="text-gray-600 dark:text-gray-400">
		Found unsaved synthesis draft. Would you like to restore it?
	</p>
	{#snippet footer()}
		<div
			class="flex justify-end space-x-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		>
			<Button onclick={discardDraft} variant="outline" size="sm">Discard Draft</Button>
			<Button onclick={restoreDraft} variant="primary" size="sm">Restore Draft</Button>
		</div>
	{/snippet}
</InfoModal>

<!-- Leave Page Confirmation Modal -->
<InfoModal
	isOpen={leaveConfirmModalOpen}
	title="Unsaved Changes"
	buttonText="Leave Page"
	on:close={confirmLeave}
>
	<p class="text-gray-600 dark:text-gray-400">
		You have unsaved changes. Are you sure you want to leave?
	</p>
	{#snippet footer()}
		<div
			class="flex justify-end space-x-3 px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
		>
			<Button onclick={cancelLeave} variant="outline" size="sm">Stay on Page</Button>
			<Button onclick={confirmLeave} variant="primary" size="sm">Leave Page</Button>
		</div>
	{/snippet}
</InfoModal>
