<!-- apps/web/src/lib/components/admin/migration/ErrorBrowser.svelte -->
<!-- Paginated, filterable error browser with retry actions -->
<script lang="ts">
	import {
		Search,
		ListFilter,
		ChevronLeft,
		ChevronRight,
		RotateCcw,
		CircleAlert,
		Info,
		CircleX,
		ExternalLink,
		Trash2
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	export type ErrorCategory = 'recoverable' | 'data' | 'fatal';
	export type EntityType = 'project' | 'task' | 'phase' | 'calendar';
	export type SuggestedAction = 'retry' | 'retry_with_fallback' | 'manual_fix' | 'skip';

	export interface MigrationError {
		id: number;
		runId: string;
		batchId: string;
		entityType: EntityType;
		legacyId: string;
		legacyTable: string;
		errorCategory: ErrorCategory | null;
		errorMessage: string;
		retryCount: number;
		lastRetryAt: string | null;
		createdAt: string;
		userId: string;
		userEmail: string;
		userName: string | null;
		projectId: string;
		projectName: string;
		entityName: string;
		canRetry: boolean;
		suggestedAction: SuggestedAction;
		suggestedActionDescription: string;
		metadata: Record<string, unknown>;
	}

	interface CategoryCounts {
		recoverable: number;
		data: number;
		fatal: number;
	}

	interface Pagination {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	}

	let {
		errors,
		categoryCounts,
		pagination,
		isLoading = false,
		onPageChange,
		onCategoryFilter,
		onEntityTypeFilter,
		onSearch,
		onRetry,
		onRetryWithFallback,
		onViewDetails,
		onDelete,
		selectedIds = []
	}: {
		errors: MigrationError[];
		categoryCounts: CategoryCounts;
		pagination: Pagination;
		isLoading?: boolean;
		onPageChange: (offset: number) => void;
		onCategoryFilter: (category: ErrorCategory | null) => void;
		onEntityTypeFilter: (entityType: EntityType | null) => void;
		onSearch: (query: string) => void;
		onRetry: (errorIds: number[]) => void;
		onRetryWithFallback: (errorIds: number[]) => void;
		onViewDetails: (error: MigrationError) => void;
		onDelete: (errorIds: number[]) => void;
		selectedIds?: number[];
	} = $props();

	let searchQuery = $state('');
	let selectedCategory = $state<ErrorCategory | null>(null);
	let selectedEntityType = $state<EntityType | null>(null);
	let showFilters = $state(false);
	let localSelectedIds = $state<Set<number>>(new Set(selectedIds));

	const totalSelected = $derived(localSelectedIds.size);
	const canRetrySelected = $derived(
		errors.filter((e) => localSelectedIds.has(e.id) && e.canRetry).length > 0
	);

	const categoryOptions: {
		value: ErrorCategory | null;
		label: string;
		count: number;
		color: string;
	}[] = $derived([
		{
			value: null,
			label: 'All',
			count: categoryCounts.recoverable + categoryCounts.data + categoryCounts.fatal,
			color: 'gray'
		},
		{
			value: 'recoverable',
			label: 'Recoverable',
			count: categoryCounts.recoverable,
			color: 'amber'
		},
		{ value: 'data', label: 'Data', count: categoryCounts.data, color: 'orange' },
		{ value: 'fatal', label: 'Fatal', count: categoryCounts.fatal, color: 'rose' }
	]);

	const entityTypeOptions: { value: EntityType | null; label: string }[] = [
		{ value: null, label: 'All Types' },
		{ value: 'project', label: 'Projects' },
		{ value: 'task', label: 'Tasks' },
		{ value: 'phase', label: 'Phases' },
		{ value: 'calendar', label: 'Calendar' }
	];

	const currentPage = $derived(Math.floor(pagination.offset / pagination.limit) + 1);
	const totalPages = $derived(Math.ceil(pagination.total / pagination.limit));

	function handleSearch() {
		onSearch(searchQuery);
	}

	function handleCategoryFilter(category: ErrorCategory | null) {
		selectedCategory = category;
		onCategoryFilter(category);
	}

	function handleEntityTypeFilter(entityType: EntityType | null) {
		selectedEntityType = entityType;
		onEntityTypeFilter(entityType);
	}

	function toggleSelection(id: number) {
		if (localSelectedIds.has(id)) {
			localSelectedIds.delete(id);
		} else {
			localSelectedIds.add(id);
		}
		localSelectedIds = new Set(localSelectedIds);
	}

	function selectAll() {
		if (localSelectedIds.size === errors.length) {
			localSelectedIds.clear();
		} else {
			errors.forEach((e) => localSelectedIds.add(e.id));
		}
		localSelectedIds = new Set(localSelectedIds);
	}

	function handleRetrySelected() {
		onRetry(Array.from(localSelectedIds));
		localSelectedIds.clear();
	}

	function handleRetryWithFallbackSelected() {
		onRetryWithFallback(Array.from(localSelectedIds));
		localSelectedIds.clear();
	}

	function handleDeleteSelected() {
		onDelete(Array.from(localSelectedIds));
		localSelectedIds.clear();
	}

	function getCategoryIcon(category: ErrorCategory | null) {
		switch (category) {
			case 'recoverable':
				return CircleAlert;
			case 'data':
				return Info;
			case 'fatal':
				return CircleX;
			default:
				return CircleAlert;
		}
	}

	function getCategoryBadgeVariant(
		category: ErrorCategory | null
	): 'warning' | 'info' | 'error' | 'default' {
		switch (category) {
			case 'recoverable':
				return 'warning';
			case 'data':
				return 'info';
			case 'fatal':
				return 'error';
			default:
				return 'default';
		}
	}
</script>

<div class="space-y-4">
	<!-- Search and Filter Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 items-center gap-2">
			<div class="relative flex-1 max-w-md">
				<Search
					class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="text"
					placeholder="Search error messages..."
					class="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:text-foreground dark:placeholder:text-muted-foreground"
					bind:value={searchQuery}
					onkeydown={(e) => e.key === 'Enter' && handleSearch()}
				/>
			</div>
			<Button variant="secondary" size="sm" onclick={handleSearch}>Search</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => (showFilters = !showFilters)}
				class="sm:hidden"
			>
				<ListFilter class="h-4 w-4" />
			</Button>
		</div>

		<!-- Bulk Actions -->
		{#if totalSelected > 0}
			<div class="flex items-center gap-2">
				<span class="text-sm text-muted-foreground">
					{totalSelected} selected
				</span>
				<Button
					variant="outline"
					size="sm"
					onclick={handleRetrySelected}
					disabled={!canRetrySelected}
				>
					<RotateCcw class="h-3 w-3" />
					Retry
				</Button>
				<Button
					variant="primary"
					size="sm"
					onclick={handleRetryWithFallbackSelected}
					disabled={!canRetrySelected}
				>
					Retry with Fallback
				</Button>
				<Button variant="danger" size="sm" onclick={handleDeleteSelected}>
					<Trash2 class="h-3 w-3" />
					Delete
				</Button>
			</div>
		{/if}
	</div>

	<!-- Category Filter Pills -->
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-xs font-medium text-muted-foreground">Category:</span>
		{#each categoryOptions as option}
			<button
				class="rounded-full px-3 py-1 text-xs font-medium transition-colors {selectedCategory ===
				option.value
					? 'bg-purple-600 text-white'
					: 'bg-muted text-foreground hover:bg-muted dark:text-muted-foreground'}"
				onclick={() => handleCategoryFilter(option.value)}
			>
				{option.label}
				<span class="ml-1 opacity-70">({option.count})</span>
			</button>
		{/each}

		<span class="mx-2 text-muted-foreground">|</span>

		<span class="text-xs font-medium text-muted-foreground">Type:</span>
		<select
			class="rounded-lg border border-border bg-card px-2 py-1 text-xs"
			bind:value={selectedEntityType}
			onchange={() => handleEntityTypeFilter(selectedEntityType)}
		>
			{#each entityTypeOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<!-- Error List -->
	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div
				class="h-8 w-8 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"
			></div>
		</div>
	{:else if errors.length === 0}
		<div class="rounded-lg border border-border bg-muted p-8 text-center">
			<CircleAlert class="mx-auto h-12 w-12 text-muted-foreground" />
			<p class="mt-2 text-muted-foreground">No errors found matching your criteria.</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border">
			<table class="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
				<thead class="bg-muted/50">
					<tr
						class="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<th class="px-3 py-3">
							<input
								type="checkbox"
								class="rounded border-border"
								checked={localSelectedIds.size === errors.length &&
									errors.length > 0}
								onchange={selectAll}
							/>
						</th>
						<th class="px-3 py-3">Entity</th>
						<th class="px-3 py-3">Category</th>
						<th class="px-3 py-3 hidden lg:table-cell">Error</th>
						<th class="px-3 py-3 hidden md:table-cell">User</th>
						<th class="px-3 py-3">Retries</th>
						<th class="px-3 py-3 text-right">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200 bg-card dark:divide-gray-700">
					{#each errors as error}
						{@const CategoryIcon = getCategoryIcon(error.errorCategory)}
						<tr class="transition-colors hover:bg-muted/30">
							<td class="px-3 py-3">
								<input
									type="checkbox"
									class="rounded border-border"
									checked={localSelectedIds.has(error.id)}
									onchange={() => toggleSelection(error.id)}
								/>
							</td>
							<td class="px-3 py-3">
								<div>
									<p class="font-medium text-foreground">
										{error.entityName}
									</p>
									<p class="text-xs text-muted-foreground">
										<span class="capitalize">{error.entityType}</span>
										<span class="text-muted-foreground">•</span>
										{error.projectName}
									</p>
								</div>
							</td>
							<td class="px-3 py-3">
								<Badge
									size="sm"
									variant={getCategoryBadgeVariant(error.errorCategory)}
								>
									<CategoryIcon class="mr-1 h-3 w-3" />
									{error.errorCategory ?? 'unknown'}
								</Badge>
							</td>
							<td class="px-3 py-3 hidden lg:table-cell max-w-xs">
								<p class="truncate text-foreground" title={error.errorMessage}>
									{error.errorMessage}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{error.suggestedActionDescription}
								</p>
							</td>
							<td class="px-3 py-3 hidden md:table-cell">
								<p class="text-foreground">
									{error.userName ?? error.userEmail}
								</p>
							</td>
							<td class="px-3 py-3">
								<span class="text-foreground">
									{error.retryCount}/3
								</span>
							</td>
							<td class="px-3 py-3 text-right">
								<div class="flex items-center justify-end gap-1">
									{#if error.canRetry}
										<Button
											variant="outline"
											size="sm"
											onclick={() => onRetry([error.id])}
											title="Retry"
										>
											<RotateCcw class="h-3 w-3" />
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => onViewDetails(error)}
										title="View details"
									>
										<ExternalLink class="h-3 w-3" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => onDelete([error.id])}
										title="Delete"
										class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
									>
										<Trash2 class="h-3 w-3" />
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Pagination -->
	{#if pagination.total > pagination.limit}
		<div class="flex items-center justify-between border-t border-border pt-4">
			<p class="text-sm text-muted-foreground">
				Showing {pagination.offset + 1} to {Math.min(
					pagination.offset + pagination.limit,
					pagination.total
				)} of {pagination.total} errors
			</p>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={pagination.offset === 0}
					onclick={() => onPageChange(pagination.offset - pagination.limit)}
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				<span class="px-2 text-sm text-foreground">
					{currentPage} / {totalPages}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={!pagination.hasMore}
					onclick={() => onPageChange(pagination.offset + pagination.limit)}
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>
