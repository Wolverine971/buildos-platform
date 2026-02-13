<!-- apps/web/src/lib/components/SearchViewAll.svelte -->
<!-- This is a separate page component for viewing all results of a specific type -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { SearchResult } from '$lib/types/search';
	import { ChevronLeft, LoaderCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let userId: string;

	let searchType: 'braindump' | 'project' | 'task';
	let searchQuery = '';
	let results: SearchResult[] = [];
	let isLoading = false;
	let hasMore = false;
	let currentOffset = 0;

	onMount(() => {
		// Get params from URL
		searchType = ($page.url.searchParams.get('type') as any) || 'braindump';
		searchQuery = $page.url.searchParams.get('q') || '';

		if (searchQuery) {
			loadResults();
		}
	});

	async function loadResults(append = false) {
		isLoading = true;

		try {
			const response = await fetch('/api/search/more', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: searchQuery,
					userId,
					type: searchType,
					offset: append ? currentOffset : 0
				})
			});

			if (!response.ok) throw new Error('Failed to load results');

			const data = await response.json();

			if (append) {
				results = [...results, ...data.results];
			} else {
				results = data.results;
				currentOffset = 0;
			}

			currentOffset += data.results.length;
			hasMore = data.hasMore;
		} catch (error) {
			console.error('Error loading results:', error);
		} finally {
			isLoading = false;
		}
	}

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
	}

	function highlightText(text: string, query: string): string {
		if (!query || !text) return text;
		const regex = new RegExp(`(${query})`, 'gi');
		return text.replace(regex, '<mark>$1</mark>');
	}

	// Format status badge with BuildOS styling
	function getStatusBadgeClass(status: string, isCompleted: boolean, isDeleted: boolean): string {
		if (isDeleted) return 'bg-muted text-muted-foreground dark:text-muted-foreground';
		if (isCompleted)
			return 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 dark:from-emerald-900/30 dark:to-green-900/30 dark:text-emerald-300';

		switch (status) {
			case 'active':
			case 'in_progress':
				return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 dark:from-blue-900/30 dark:to-indigo-900/30 dark:text-blue-300';
			case 'paused':
				return 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 dark:from-amber-900/30 dark:to-yellow-900/30 dark:text-amber-300';
			case 'archived':
				return 'bg-muted text-muted-foreground dark:text-muted-foreground';
			default:
				return 'bg-muted text-muted-foreground dark:text-muted-foreground';
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<button
			onclick={() => window.history.back()}
			class="inline-flex items-center gap-2 text-primary-600 dark:text-primary-400
			       hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
		>
			<ChevronLeft class="w-5 h-5" />
			Back to search
		</button>
	</div>

	<h1 class="text-2xl font-bold mb-4 text-foreground">
		{searchType === 'braindump' ? 'Brain Dump' : searchType === 'project' ? 'Project' : 'Task'} Results
	</h1>

	<p class="text-muted-foreground mb-4">
		Showing results for: <span class="font-semibold text-foreground">"{searchQuery}"</span>
	</p>

	<div class="space-y-4">
		{#each results as result}
			<button
				onclick={() => navigateToItem(result)}
				class="w-full p-4 bg-card
				       border-2 border-border rounded-lg
				       hover:shadow-ink-strong dark:hover:shadow-ink-strong
				       hover:bg-gradient-to-r hover:from-blue-50/30 hover:to-purple-50/30
				       dark:hover:from-blue-900/10 dark:hover:to-purple-900/10
				       transition-all duration-200 text-left"
			>
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<h3 class="font-semibold text-lg mb-1 text-foreground">
							{@html highlightText(result.title || 'Untitled', searchQuery)}
						</h3>
						{#if result.description}
							<p class="text-muted-foreground mb-2">
								{@html highlightText(result.description, searchQuery)}
							</p>
						{/if}
						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							<span>Created: {new Date(result.created_at).toLocaleDateString()}</span>
							<span>Updated: {new Date(result.updated_at).toLocaleDateString()}</span>
						</div>
					</div>
					<div>
						<span
							class="{getStatusBadgeClass(
								result.status,
								result.is_completed || false,
								result.is_deleted || false
							)}
						             px-3 py-1 text-xs font-medium rounded-full shadow-ink"
						>
							{result.status}
						</span>
					</div>
				</div>
			</button>
		{/each}
	</div>

	{#if hasMore}
		<div class="mt-8 text-center">
			<Button
				onclick={() => loadResults(true)}
				variant="primary"
				size="md"
				loading={isLoading}
				disabled={isLoading}
			>
				{isLoading ? 'Loading...' : 'Load More'}
			</Button>
		</div>
	{/if}

	{#if results.length === 0 && !isLoading}
		<div class="text-center py-12 text-muted-foreground">No results found</div>
	{/if}
</div>

<style>
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
