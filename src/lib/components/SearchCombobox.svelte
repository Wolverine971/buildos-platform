<!-- src/lib/components/SearchCombobox.svelte -->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { searchStore, totalResultCount } from '$lib/stores/searchStore';
	import type { SearchResult } from '$lib/types/search';
	import { page } from '$app/stores';
	import { Search, X, Loader2 } from 'lucide-svelte';
	import { browser } from '$app/environment';

	export let userId: string;

	let searchInput: HTMLInputElement;
	let isOpen = false;
	let selectedIndex = -1;
	let searchQuery = '';
	let comboboxRef: HTMLDivElement;

	// Subscribe to search store
	$: ({ results, isLoading, error, hasMore } = $searchStore);

	// Flatten results for keyboard navigation
	$: flatResults = [
		...results.braindumps.map((r) => ({ ...r, category: 'Brain Dumps' })),
		...results.projects.map((r) => ({ ...r, category: 'Projects' })),
		...results.tasks.map((r) => ({ ...r, category: 'Tasks' }))
	];

	// Handle search input
	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchQuery = target.value;

		if (searchQuery.length >= 2) {
			searchStore.search(searchQuery, userId);
			isOpen = true;
		} else {
			searchStore.reset();
			isOpen = false;
		}
	}

	// Navigate to selected item
	function navigateToItem(result: SearchResult) {
		let url = '';

		switch (result.item_type) {
			case 'braindump':
				url = `/history?braindump=${result.item_id}`;
				break;
			case 'project':
				url = `/projects/${result.item_id}`;
				break;
			case 'task':
				url = `/projects/${result.project_id}/tasks/${result.item_id}`;
				break;
		}

		goto(url);
		closeSearch();
	}

	// Handle keyboard navigation
	function handleKeyDown(event: KeyboardEvent) {
		if (!isOpen) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && flatResults[selectedIndex]) {
					navigateToItem(flatResults[selectedIndex]);
				}
				break;
			case 'Escape':
				closeSearch();
				break;
		}
	}

	// Close search and reset
	function closeSearch() {
		isOpen = false;
		selectedIndex = -1;
		searchQuery = '';
		searchStore.reset();
		if (searchInput) searchInput.value = '';
	}

	// Click outside handler
	function handleClickOutside(event: MouseEvent) {
		if (comboboxRef && !comboboxRef.contains(event.target as Node)) {
			closeSearch();
		}
	}

	// Highlight matching text
	function highlightText(text: string, query: string): string {
		if (!query || !text) return text;

		const regex = new RegExp(`(${query})`, 'gi');
		return text.replace(regex, '<mark class="bg-yellow-200 text-gray-900">$1</mark>');
	}

	// Format status badge
	function getStatusBadgeClass(status: string, isCompleted: boolean, isDeleted: boolean): string {
		if (isDeleted) return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
		if (isCompleted) return 'bg-green-100 text-green-700';

		switch (status) {
			// Project statuses
			case 'active':
				return 'bg-blue-100 text-blue-700';
			case 'paused':
				return 'bg-yellow-100 text-yellow-700';
			case 'completed':
				return 'bg-green-100 text-green-700';
			case 'archived':
				return 'bg-gray-100 text-gray-600';

			// Task statuses
			case 'backlog':
				return 'bg-gray-100 text-gray-600';
			case 'in_progress':
				return 'bg-blue-100 text-blue-700';
			case 'done':
				return 'bg-green-100 text-green-700';
			case 'blocked':
				return 'bg-red-100 text-red-700';

			// Brain dump statuses
			case 'pending':
				return 'bg-yellow-100 text-yellow-700';
			case 'parsed':
				return 'bg-blue-100 text-blue-700';
			case 'saved':
				return 'bg-green-100 text-green-700';
			case 'parsed_and_deleted':
				return 'bg-gray-100 text-gray-500';

			default:
				return 'bg-gray-100 text-gray-600';
		}
	}

	// Get status display text
	function getStatusDisplay(status: string, isDeleted: boolean): string {
		if (isDeleted) return 'deleted';
		return status;
	}

	// Load more results
	async function loadMore(type: 'braindump' | 'project' | 'task') {
		const currentCount =
			type === 'braindump'
				? results.braindumps.length
				: type === 'project'
					? results.projects.length
					: results.tasks.length;

		await searchStore.loadMore(type, searchQuery, userId, currentCount);
	}

	onMount(() => {
		if (browser) document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		if (browser) document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="relative w-full max-w-2xl" bind:this={comboboxRef}>
	<!-- Search Input -->
	<div class="relative">
		<input
			bind:this={searchInput}
			type="text"
			placeholder="Search brain dumps, projects, and tasks..."
			class="w-full pl-10 pr-10 py-2.5 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800
			       border-2 border-gray-300 dark:border-gray-600 rounded-lg
			       focus:ring-2 focus:ring-primary-500 focus:border-transparent
			       dark:focus:ring-primary-400 transition-all duration-200"
			on:input={handleInput}
			on:keydown={handleKeyDown}
			aria-label="Search"
			aria-autocomplete="list"
			aria-controls="search-results"
			aria-expanded={isOpen}
		/>

		<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
			{#if isLoading}
				<Loader2 class="w-5 h-5 text-gray-400 dark:text-gray-500 animate-spin" />
			{:else}
				<Search class="w-5 h-5 text-gray-400 dark:text-gray-500" />
			{/if}
		</div>

		{#if searchQuery}
			<button
				on:click={closeSearch}
				class="absolute inset-y-0 right-0 flex items-center pr-3 transition-colors duration-200"
				aria-label="Clear search"
			>
				<X
					class="w-5 h-5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
				/>
			</button>
		{/if}
	</div>

	<!-- Search Results Dropdown -->
	{#if isOpen && (flatResults.length > 0 || isLoading || error)}
		<div
			id="search-results"
			class="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800
			       border-2 border-gray-200 dark:border-gray-700 rounded-lg
			       shadow-xl dark:shadow-2xl max-h-[500px] overflow-y-auto"
		>
			{#if error}
				<div class="px-4 py-3 text-red-600 dark:text-red-400">
					Error: {error}
				</div>
			{:else if flatResults.length === 0 && !isLoading}
				<div class="px-4 py-3 text-gray-500 dark:text-gray-400">
					No results found for "{searchQuery}"
				</div>
			{:else}
				<!-- Brain Dumps Section -->
				{#if results.braindumps.length > 0}
					<div class="border-b border-gray-100 dark:border-gray-700">
						<div
							class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
							       bg-gradient-to-r from-gray-50 to-gray-50/50
							       dark:from-gray-800 dark:to-gray-800/50"
						>
							Brain Dumps
						</div>
						{#each results.braindumps as result, index}
							<button
								on:click={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-all duration-200
								       hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:bg-gradient-to-r focus:from-blue-50/50 focus:to-purple-50/50
								       dark:focus:from-blue-900/20 dark:focus:to-purple-900/20
								       focus:outline-none
								       {selectedIndex === index
									? 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20'
									: ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-gray-900 dark:text-gray-100 {result.is_deleted
												? 'line-through opacity-60'
												: ''}"
										>
											{@html highlightText(
												result.title || 'Untitled',
												searchQuery
											)}
										</div>
										{#if result.description}
											<div
												class="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2 {result.is_deleted
													? 'opacity-60'
													: ''}"
											>
												{@html highlightText(
													result.description,
													searchQuery
												)}
											</div>
										{/if}
										{#if result.tags && result.tags.length > 0}
											<div class="flex flex-wrap gap-1 mt-1">
												{#each result.tags.slice(0, 3) as tag}
													<span
														class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700
														       text-gray-600 dark:text-gray-300 rounded-full {result.is_deleted ? 'opacity-60' : ''}"
													>
														{tag}
													</span>
												{/each}
											</div>
										{/if}
									</div>
									<div class="ml-3">
										<span
											class="{getStatusBadgeClass(
												result.status,
												result.is_completed,
												result.is_deleted
											)}
											px-2.5 py-1 text-xs font-medium rounded-full shadow-sm"
										>
											{getStatusDisplay(result.status, result.is_deleted)}
										</span>
									</div>
								</div>
							</button>
						{/each}
						{#if hasMore.braindumps}
							<button
								on:click={() => loadMore('braindump')}
								class="w-full px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400
								       hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:outline-none transition-all duration-200"
							>
								View all brain dump results →
							</button>
						{/if}
					</div>
				{/if}

				<!-- Projects Section -->
				{#if results.projects.length > 0}
					<div class="border-b border-gray-100 dark:border-gray-700">
						<div
							class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
							       bg-gradient-to-r from-gray-50 to-gray-50/50
							       dark:from-gray-800 dark:to-gray-800/50"
						>
							Projects
						</div>
						{#each results.projects as result, index}
							<button
								on:click={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-all duration-200
								       hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:bg-gradient-to-r focus:from-blue-50/50 focus:to-purple-50/50
								       dark:focus:from-blue-900/20 dark:focus:to-purple-900/20
								       focus:outline-none
								       {selectedIndex === results.braindumps.length + index
									? 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20'
									: ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-gray-900 dark:text-gray-100 {result.is_deleted
												? 'line-through opacity-60'
												: ''}"
										>
											{@html highlightText(result.title, searchQuery)}
										</div>
										{#if result.description}
											<div
												class="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2 {result.is_deleted
													? 'opacity-60'
													: ''}"
											>
												{@html highlightText(
													result.description,
													searchQuery
												)}
											</div>
										{/if}
										{#if result.tags && result.tags.length > 0}
											<div class="flex flex-wrap gap-1 mt-1">
												{#each result.tags.slice(0, 3) as tag}
													<span
														class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700
														       text-gray-600 dark:text-gray-300 rounded-full {result.is_deleted ? 'opacity-60' : ''}"
													>
														{tag}
													</span>
												{/each}
											</div>
										{/if}
									</div>
									<div class="ml-3">
										<span
											class="{getStatusBadgeClass(
												result.status,
												result.is_completed,
												result.is_deleted
											)}
											px-2.5 py-1 text-xs font-medium rounded-full shadow-sm"
										>
											{getStatusDisplay(result.status, result.is_deleted)}
										</span>
									</div>
								</div>
							</button>
						{/each}
						{#if hasMore.projects}
							<button
								on:click={() => loadMore('project')}
								class="w-full px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400
								       hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:outline-none transition-all duration-200"
							>
								View all project results →
							</button>
						{/if}
					</div>
				{/if}

				<!-- Tasks Section -->
				{#if results.tasks.length > 0}
					<div>
						<div
							class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase
							       bg-gradient-to-r from-gray-50 to-gray-50/50
							       dark:from-gray-800 dark:to-gray-800/50"
						>
							Tasks
						</div>
						{#each results.tasks as result, index}
							<button
								on:click={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-all duration-200
								       hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:bg-gradient-to-r focus:from-blue-50/50 focus:to-purple-50/50
								       dark:focus:from-blue-900/20 dark:focus:to-purple-900/20
								       focus:outline-none
								       {selectedIndex === results.braindumps.length + results.projects.length + index
									? 'bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20'
									: ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-gray-900 dark:text-gray-100 {result.is_deleted
												? 'line-through opacity-60'
												: result.is_completed
													? 'line-through opacity-60'
													: ''}"
										>
											{@html highlightText(result.title, searchQuery)}
										</div>
										{#if result.description}
											<div
												class="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2 {result.is_deleted ||
												result.is_completed
													? 'opacity-60'
													: ''}"
											>
												{@html highlightText(
													result.description,
													searchQuery
												)}
											</div>
										{/if}
									</div>
									<div class="ml-3">
										<span
											class="{getStatusBadgeClass(
												result.status,
												result.is_completed,
												result.is_deleted
											)}
											px-2.5 py-1 text-xs font-medium rounded-full shadow-sm"
										>
											{getStatusDisplay(result.status, result.is_deleted)}
										</span>
									</div>
								</div>
							</button>
						{/each}
						{#if hasMore.tasks}
							<button
								on:click={() => loadMore('task')}
								class="w-full px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400
								       hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50
								       dark:hover:from-blue-900/20 dark:hover:to-purple-900/20
								       focus:outline-none transition-all duration-200"
							>
								View all task results →
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(mark) {
		background: linear-gradient(to right, #fef3c7, #fde68a);
		color: inherit;
		font-weight: 600;
		padding: 0 2px;
		border-radius: 2px;
	}

	:global(.dark mark) {
		background: linear-gradient(to right, rgba(251, 191, 36, 0.3), rgba(245, 158, 11, 0.3));
	}
</style>
