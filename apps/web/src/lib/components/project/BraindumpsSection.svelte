<!-- apps/web/src/lib/components/project/BraindumpsSection.svelte -->
<script lang="ts">
	import {
		Brain,
		ChevronDown,
		ArrowUp,
		ArrowDown,
		LoaderCircle,
		AlertCircle
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import BraindumpProjectCard from './BraindumpProjectCard.svelte';
	import BraindumpModalHistory from '$lib/components/history/BraindumpModalHistory.svelte';
	import type {
		BraindumpWithLinks,
		BraindumpSortField,
		BraindumpSortDirection
	} from '$lib/types/brain-dump';
	import { projectStoreV2 } from '$lib/stores/project.store';
	import { toastService } from '$lib/stores/toast.store';

	// Props - only callbacks
	let {
		onOpenBraindump,
		onDeleteBraindump,
		onTaskClick
	}: {
		onOpenBraindump?: (braindump: BraindumpWithLinks) => void;
		onDeleteBraindump?: (braindumpId: string) => void;
		onTaskClick?: (taskId: string) => void;
	} = $props();

	// Get data from store
	let storeState = $derived($projectStoreV2);
	let braindumps = $derived(storeState.braindumps || []);
	let isLoading = $derived(storeState.loadingStates?.braindumps === 'loading');
	let hasError = $derived(storeState.loadingStates?.braindumps === 'error');

	// Local UI state - Svelte 5 runes
	let sortField: BraindumpSortField = $state('linked_at');
	let sortDirection: BraindumpSortDirection = $state('desc');
	let showSortDropdown = $state(false);
	let selectedBraindump = $state<BraindumpWithLinks | null>(null);
	let showDetailModal = $state(false);

	// Sorted braindumps using $derived
	let sortedBraindumps = $derived(
		[...braindumps].sort((a, b) => {
			const aValue = a[sortField];
			const bValue = b[sortField];

			if (!aValue && !bValue) return 0;
			if (!aValue) return 1;
			if (!bValue) return -1;

			// Safe date parsing
			const aDate = new Date(aValue);
			const bDate = new Date(bValue);

			// Check for invalid dates
			if (isNaN(aDate.getTime()) && isNaN(bDate.getTime())) return 0;
			if (isNaN(aDate.getTime())) return 1;
			if (isNaN(bDate.getTime())) return -1;

			const comparison = aDate.getTime() - bDate.getTime();
			return sortDirection === 'desc' ? -comparison : comparison;
		})
	);

	let braindumpCount = $derived(braindumps.length);

	// Sort management
	function setSortField(field: BraindumpSortField) {
		if (sortField === field) {
			sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
		} else {
			sortField = field;
			sortDirection = 'desc';
		}
		showSortDropdown = false;
	}

	function getSortFieldLabel(field: BraindumpSortField): string {
		switch (field) {
			case 'created_at':
				return 'Created';
			case 'linked_at':
				return 'Linked';
		}
	}

	// Event handlers
	function handleBraindumpClick(braindump: BraindumpWithLinks) {
		selectedBraindump = braindump;
		showDetailModal = true;
		onOpenBraindump?.(braindump);
	}

	function closeModal() {
		showDetailModal = false;
		selectedBraindump = null;
	}

	async function handleDeleteBraindump(braindumpId: string) {
		if (!confirm('Are you sure you want to delete this brain dump?')) {
			return;
		}

		// Close modal if this braindump is currently open
		if (selectedBraindump?.id === braindumpId) {
			closeModal();
		}

		// Call the parent handler
		onDeleteBraindump?.(braindumpId);
	}

	function handleModalDelete(event: CustomEvent) {
		const braindump = event.detail.braindump;
		if (braindump?.id) {
			handleDeleteBraindump(braindump.id);
		}
	}

	function handleTaskClick(taskId: string) {
		onTaskClick?.(taskId);
	}

	async function handleRetry() {
		await projectStoreV2.loadBraindumps(true);
	}

	// Close dropdown when clicking outside
	function handleClickOutside() {
		if (showSortDropdown) {
			showSortDropdown = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="space-y-4">
	<!-- Header with sort controls -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
			Brain Dumps ({braindumpCount})
		</h3>

		<!-- Sort controls -->
		{#if braindumpCount > 0 && !isLoading}
			<div class="flex items-center gap-2">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Sort by:</span>

				<!-- Sort field dropdown -->
				<div class="">
					<Button
						onclick={(e) => {
							e.stopPropagation();
							showSortDropdown = !showSortDropdown;
						}}
						variant="outline"
						size="sm"
						icon={ChevronDown}
						iconPosition="right"
					>
						{getSortFieldLabel(sortField)}
					</Button>

					{#if showSortDropdown}
						<div
							class="absolute right-0 z-10 mt-1 w-48 bg-white dark:bg-gray-700
                                 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg"
						>
							{#each [{ field: 'linked_at', label: 'Linked' }, { field: 'created_at', label: 'Created' }] as option}
								<Button
									onclick={(e) => {
										e.stopPropagation();
										setSortField(option.field);
									}}
									variant="ghost"
									size="sm"
									class="w-full text-left justify-start {sortField ===
									option.field
										? 'bg-blue-50 dark:bg-blue-900/30'
										: ''}"
								>
									{option.label}
								</Button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Sort direction toggle -->
				<Button
					onclick={() => (sortDirection = sortDirection === 'desc' ? 'asc' : 'desc')}
					variant="outline"
					size="sm"
					title={sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
					icon={sortDirection === 'desc' ? ArrowDown : ArrowUp}
				/>
			</div>
		{/if}
	</div>

	<!-- Loading state -->
	{#if isLoading}
		<div
			class="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-800
                 rounded-lg border border-gray-200 dark:border-gray-700"
		>
			<LoaderCircle
				class="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400 mb-3"
			/>
			<p class="text-sm text-gray-600 dark:text-gray-400">Loading brain dumps...</p>
		</div>
	{:else if hasError}
		<!-- Error state -->
		<div
			class="flex flex-col items-center justify-center py-12 bg-red-50 dark:bg-red-900/20
                 rounded-lg border border-red-200 dark:border-red-800"
		>
			<AlertCircle class="w-12 h-12 text-red-600 dark:text-red-400 mb-3" />
			<p class="text-gray-900 dark:text-white font-medium mb-1">Failed to load brain dumps</p>
			<p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
				There was an error loading brain dumps. Please try again.
			</p>
			<Button onclick={handleRetry} variant="primary" size="sm">Retry</Button>
		</div>
	{:else if sortedBraindumps.length === 0}
		<!-- Empty state -->
		<div
			class="flex flex-col items-center justify-center py-12 bg-gray-50 dark:bg-gray-800
                 rounded-lg border border-gray-200 dark:border-gray-700"
		>
			<Brain class="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
			<p class="text-gray-900 dark:text-white font-medium mb-1">No brain dumps yet</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Brain dumps that create or modify this project will appear here.
			</p>
		</div>
	{:else}
		<!-- Braindump cards grid -->
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each sortedBraindumps as braindump (braindump.id)}
				<BraindumpProjectCard
					{braindump}
					onClick={() => handleBraindumpClick(braindump)}
					onDelete={() => handleDeleteBraindump(braindump.id)}
					onTaskClick={handleTaskClick}
				/>
			{/each}
		</div>
	{/if}
</div>

<!-- Braindump detail modal -->
{#if showDetailModal && selectedBraindump}
	<BraindumpModalHistory
		braindump={selectedBraindump}
		isOpen={showDetailModal}
		onClose={closeModal}
		on:delete={handleModalDelete}
	/>
{/if}

<style>
	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
