<!-- apps/web/src/lib/components/SearchCombobox.svelte -->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { searchStore, totalResultCount } from '$lib/stores/searchStore';
	import type { SearchResult } from '$lib/types/search';
	import { page } from '$app/stores';
	import { Search, X, LoaderCircle } from 'lucide-svelte';
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
		return text.replace(
			regex,
			'<mark class="bg-accent/30 text-foreground font-semibold px-0.5 rounded-sm">$1</mark>'
		);
	}

	// Format status badge - uses semantic colors that work in both light/dark mode
	function getStatusBadgeClass(status: string, isCompleted: boolean, isDeleted: boolean): string {
		if (isDeleted) return 'bg-destructive/10 text-destructive border border-destructive/30';
		if (isCompleted)
			return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';

		switch (status) {
			// Project statuses
			case 'active':
				return 'bg-accent/10 text-accent border border-accent/30';
			case 'paused':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30';
			case 'completed':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
			case 'archived':
				return 'bg-muted text-muted-foreground border border-border';

			// Task statuses
			case 'backlog':
				return 'bg-muted text-muted-foreground border border-border';
			case 'in_progress':
				return 'bg-accent/10 text-accent border border-accent/30';
			case 'done':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
			case 'blocked':
				return 'bg-destructive/10 text-destructive border border-destructive/30';

			// Brain dump statuses
			case 'pending':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30';
			case 'parsed':
				return 'bg-accent/10 text-accent border border-accent/30';
			case 'saved':
				return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
			case 'parsed_and_deleted':
				return 'bg-muted text-muted-foreground border border-border';

			default:
				return 'bg-muted text-muted-foreground border border-border';
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
			inputmode="search"
			enterkeyhint="search"
			role="combobox"
			placeholder="Search brain dumps, projects, and tasks..."
			class="w-full pl-10 pr-10 py-2.5 text-foreground bg-card
			       border border-border rounded-lg shadow-ink-inner
			       focus:ring-2 focus:ring-ring focus:border-accent
			       transition-all duration-200 placeholder:text-muted-foreground"
			oninput={handleInput}
			onkeydown={handleKeyDown}
			aria-label="Search"
			aria-autocomplete="list"
			aria-controls="search-results"
			aria-expanded={isOpen}
		/>

		<div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
			{#if isLoading}
				<LoaderCircle class="w-5 h-5 text-muted-foreground animate-spin" />
			{:else}
				<Search class="w-5 h-5 text-muted-foreground" />
			{/if}
		</div>

		{#if searchQuery}
			<button
				onclick={closeSearch}
				class="absolute inset-y-0 right-0 flex items-center pr-3 transition-colors duration-200"
				aria-label="Clear search"
			>
				<X class="w-5 h-5 text-muted-foreground hover:text-foreground" />
			</button>
		{/if}
	</div>

	<!-- Search Results Dropdown -->
	{#if isOpen && (flatResults.length > 0 || isLoading || error)}
		<div
			id="search-results"
			class="absolute z-50 w-full mt-2 bg-card
			       border border-border rounded-lg
			       shadow-ink-strong max-h-[500px] overflow-y-auto tx tx-frame tx-weak"
		>
			{#if error}
				<div class="px-4 py-3 text-destructive">
					Error: {error}
				</div>
			{:else if flatResults.length === 0 && !isLoading}
				<div class="px-4 py-3 text-muted-foreground">
					No results found for "{searchQuery}"
				</div>
			{:else}
				<!-- Brain Dumps Section -->
				{#if results.braindumps.length > 0}
					<div class="border-b border-border">
						<div
							class="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide
							       bg-muted/50"
						>
							Brain Dumps
						</div>
						{#each results.braindumps as result, index}
							<button
								onclick={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-colors
								       hover:bg-accent/10 focus:bg-accent/10 focus:outline-none
								       {selectedIndex === index ? 'bg-accent/10' : ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-foreground {result.is_deleted
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
												class="mt-1 text-sm text-muted-foreground line-clamp-2 {result.is_deleted
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
														class="px-2 py-0.5 text-xs bg-muted
														       text-muted-foreground rounded-full {result.is_deleted ? 'opacity-60' : ''}"
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
								onclick={() => loadMore('braindump')}
								class="w-full px-4 py-2 text-sm font-medium text-accent
								       hover:bg-accent/10 focus:outline-none transition-colors"
							>
								View all brain dump results →
							</button>
						{/if}
					</div>
				{/if}

				<!-- Projects Section -->
				{#if results.projects.length > 0}
					<div class="border-b border-border">
						<div
							class="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide
							       bg-muted/50"
						>
							Projects
						</div>
						{#each results.projects as result, index}
							<button
								onclick={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-colors
								       hover:bg-accent/10 focus:bg-accent/10 focus:outline-none
								       {selectedIndex === results.braindumps.length + index ? 'bg-accent/10' : ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-foreground {result.is_deleted
												? 'line-through opacity-60'
												: ''}"
										>
											{@html highlightText(result.title, searchQuery)}
										</div>
										{#if result.description}
											<div
												class="mt-1 text-sm text-muted-foreground line-clamp-2 {result.is_deleted
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
														class="px-2 py-0.5 text-xs bg-muted
														       text-muted-foreground rounded-full {result.is_deleted ? 'opacity-60' : ''}"
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
								onclick={() => loadMore('project')}
								class="w-full px-4 py-2 text-sm font-medium text-accent
								       hover:bg-accent/10 focus:outline-none transition-colors"
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
							class="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide
							       bg-muted/50"
						>
							Tasks
						</div>
						{#each results.tasks as result, index}
							<button
								onclick={() => navigateToItem(result)}
								class="w-full px-4 py-3 text-left transition-colors
								       hover:bg-accent/10 focus:bg-accent/10 focus:outline-none
								       {selectedIndex === results.braindumps.length + results.projects.length + index
									? 'bg-accent/10'
									: ''}"
							>
								<div class="flex items-start justify-between">
									<div class="flex-1 min-w-0">
										<div
											class="font-medium text-foreground {result.is_deleted
												? 'line-through opacity-60'
												: result.is_completed
													? 'line-through opacity-60'
													: ''}"
										>
											{@html highlightText(result.title, searchQuery)}
										</div>
										{#if result.description}
											<div
												class="mt-1 text-sm text-muted-foreground line-clamp-2 {result.is_deleted ||
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
								onclick={() => loadMore('task')}
								class="w-full px-4 py-2 text-sm font-medium text-accent
								       hover:bg-accent/10 focus:outline-none transition-colors"
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
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
