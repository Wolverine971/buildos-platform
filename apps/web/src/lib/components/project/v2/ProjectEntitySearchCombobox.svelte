<!-- apps/web/src/lib/components/project/v2/ProjectEntitySearchCombobox.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import {
		AlertTriangle,
		Calendar,
		CalendarDays,
		FileText,
		Flag,
		GitBranch,
		LoaderCircle,
		ListChecks,
		Search,
		Target,
		X
	} from '$lib/icons/lucide';
	import type { ProjectLogEntityType } from '@buildos/shared-types';

	type SearchResultEntityType =
		| 'project'
		| 'document'
		| 'task'
		| 'plan'
		| 'goal'
		| 'milestone'
		| 'risk'
		| 'event';
	type SearchScope = 'all' | 'work' | 'overview' | 'docs' | 'activity';
	type SearchVariant = 'framed' | 'toolbar';

	type ProjectEntitySearchResult = {
		type: SearchResultEntityType;
		id: string | null;
		project_id: string | null;
		title: string | null;
		snippet: string | null;
		score: number;
		state_key: string | null;
		type_key: string | null;
		path: string | null;
	};

	let {
		projectId,
		disabled = false,
		scope = 'all',
		variant = 'framed',
		placeholder = 'Search docs, tasks, goals, plans, events...',
		onSelectEntity
	}: {
		projectId: string;
		disabled?: boolean;
		scope?: SearchScope;
		variant?: SearchVariant;
		placeholder?: string;
		onSelectEntity: (entityType: ProjectLogEntityType, entityId: string) => void;
	} = $props();

	const listboxId = 'project-entity-search-results';
	const SEARCH_TYPES: Record<SearchScope, SearchResultEntityType[]> = {
		all: ['project', 'document', 'task', 'plan', 'goal', 'milestone', 'risk', 'event'],
		work: ['task'],
		overview: ['project', 'plan', 'goal', 'milestone', 'risk', 'event'],
		docs: ['document'],
		activity: ['project', 'document', 'task', 'plan', 'goal', 'milestone', 'risk', 'event']
	};
	const searchTypes = $derived(SEARCH_TYPES[scope]);

	const entityConfig: Record<
		SearchResultEntityType,
		{
			label: string;
			icon: typeof Search;
			iconClass: string;
			badgeClass: string;
		}
	> = {
		project: {
			label: 'Project',
			icon: GitBranch,
			iconClass: 'text-info',
			badgeClass: 'border-info/30 bg-info/10 text-info'
		},
		document: {
			label: 'Document',
			icon: FileText,
			iconClass: 'text-muted-foreground',
			badgeClass: 'border-border bg-muted/40 text-muted-foreground'
		},
		task: {
			label: 'Task',
			icon: ListChecks,
			iconClass: 'text-info',
			badgeClass: 'border-info/30 bg-info/10 text-info'
		},
		plan: {
			label: 'Plan',
			icon: Calendar,
			iconClass: 'text-accent',
			badgeClass: 'border-accent/30 bg-accent/10 text-accent'
		},
		goal: {
			label: 'Goal',
			icon: Target,
			iconClass: 'text-warning',
			badgeClass: 'border-warning/30 bg-warning/10 text-warning'
		},
		milestone: {
			label: 'Milestone',
			icon: Flag,
			iconClass: 'text-success',
			badgeClass: 'border-success/30 bg-success/10 text-success'
		},
		risk: {
			label: 'Risk',
			icon: AlertTriangle,
			iconClass: 'text-destructive',
			badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive'
		},
		event: {
			label: 'Event',
			icon: CalendarDays,
			iconClass: 'text-info',
			badgeClass: 'border-info/30 bg-info/10 text-info'
		}
	};

	let query = $state('');
	let results = $state<ProjectEntitySearchResult[]>([]);
	let loading = $state(false);
	let errorMessage = $state<string | null>(null);
	let open = $state(false);
	let highlightedIndex = $state(-1);
	let maybeMore = $state(false);
	let totalReturned = $state(0);
	let requestId = 0;
	let abortController: AbortController | null = null;
	let blurTimer: ReturnType<typeof setTimeout> | null = null;

	const normalizedQuery = $derived(query.trim());
	const canSearch = $derived(normalizedQuery.length >= 2 && !disabled);
	const showPanel = $derived(
		open && canSearch && (loading || Boolean(errorMessage) || results.length > 0 || !loading)
	);
	const highlightedResultId = $derived.by(() => {
		const result =
			highlightedIndex >= 0 && highlightedIndex < results.length
				? results[highlightedIndex]
				: null;
		return result ? `${listboxId}-${result.type}-${result.id}` : undefined;
	});

	function isSearchResultEntityType(value: string): value is SearchResultEntityType {
		return value in entityConfig;
	}

	function normalizeResult(raw: unknown): ProjectEntitySearchResult | null {
		if (!raw || typeof raw !== 'object') return null;
		const record = raw as Record<string, unknown>;
		const type = typeof record.type === 'string' ? record.type : '';
		const id = typeof record.id === 'string' ? record.id : null;
		if (!id || !isSearchResultEntityType(type)) return null;

		return {
			type,
			id,
			project_id: typeof record.project_id === 'string' ? record.project_id : null,
			title: typeof record.title === 'string' ? stripSearchMarkup(record.title) : null,
			snippet: typeof record.snippet === 'string' ? stripSearchMarkup(record.snippet) : null,
			score: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
			state_key: typeof record.state_key === 'string' ? record.state_key : null,
			type_key: typeof record.type_key === 'string' ? record.type_key : null,
			path: typeof record.path === 'string' ? record.path : null
		};
	}

	function stripSearchMarkup(value: string): string {
		return value
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function formatStateLabel(value: string | null): string | null {
		if (!value) return null;
		return value.replace(/_/g, ' ');
	}

	function resultTitle(result: ProjectEntitySearchResult): string {
		return result.title || entityConfig[result.type].label;
	}

	function abortActiveRequest() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
	}

	async function performSearch(searchQuery: string) {
		const activeQuery = searchQuery.trim();
		if (activeQuery.length < 2 || !projectId || disabled) {
			results = [];
			totalReturned = 0;
			maybeMore = false;
			highlightedIndex = -1;
			return;
		}

		requestId += 1;
		const currentRequestId = requestId;
		abortActiveRequest();
		abortController = new AbortController();
		loading = true;
		errorMessage = null;
		open = true;

		try {
			const response = await fetch('/api/onto/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				signal: abortController.signal,
				body: JSON.stringify({
					query: activeQuery,
					project_id: projectId,
					types: searchTypes,
					limit: 12
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Search failed');
			}
			if (currentRequestId !== requestId) return;

			const data = payload?.data ?? payload ?? {};
			const rawResults = Array.isArray(data.results) ? data.results : [];
			results = rawResults
				.map((result: unknown) => normalizeResult(result))
				.filter(
					(
						result: ProjectEntitySearchResult | null
					): result is ProjectEntitySearchResult => Boolean(result)
				);
			totalReturned =
				typeof data.total_returned === 'number' ? data.total_returned : results.length;
			maybeMore = Boolean(data.maybe_more);
			highlightedIndex = results.length > 0 ? 0 : -1;
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' || currentRequestId !== requestId) return;
			console.error('[ProjectEntitySearchCombobox] Search failed:', error);
			results = [];
			totalReturned = 0;
			maybeMore = false;
			highlightedIndex = -1;
			errorMessage = error instanceof Error ? error.message : 'Search failed';
		} finally {
			if (currentRequestId === requestId) {
				loading = false;
			}
		}
	}

	function selectResult(result: ProjectEntitySearchResult) {
		if (!result.id) return;
		onSelectEntity(result.type as ProjectLogEntityType, result.id);
		query = '';
		results = [];
		open = false;
		highlightedIndex = -1;
	}

	function clearSearch() {
		query = '';
		results = [];
		errorMessage = null;
		maybeMore = false;
		totalReturned = 0;
		highlightedIndex = -1;
		open = false;
		abortActiveRequest();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (open) {
				event.preventDefault();
				open = false;
			}
			return;
		}

		if (!showPanel || results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = Math.min(results.length - 1, highlightedIndex + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = Math.max(0, highlightedIndex - 1);
		} else if (event.key === 'Enter') {
			const result = results[highlightedIndex] ?? results[0];
			if (result) {
				event.preventDefault();
				selectResult(result);
			}
		}
	}

	function handleFocus() {
		if (blurTimer) {
			clearTimeout(blurTimer);
			blurTimer = null;
		}
		if (canSearch) open = true;
	}

	function handleBlur() {
		blurTimer = setTimeout(() => {
			open = false;
		}, 120);
	}

	$effect(() => {
		if (!browser) return;
		if (!canSearch) {
			results = [];
			errorMessage = null;
			maybeMore = false;
			totalReturned = 0;
			highlightedIndex = -1;
			abortActiveRequest();
			return;
		}

		const timeoutId = setTimeout(() => void performSearch(normalizedQuery), 180);
		return () => clearTimeout(timeoutId);
	});

	onDestroy(() => {
		abortActiveRequest();
		if (blurTimer) clearTimeout(blurTimer);
	});
</script>

<section class="relative z-30" aria-label="Project search">
	<div
		class={variant === 'toolbar'
			? ''
			: 'rounded-lg border border-border bg-card p-2 shadow-ink tx tx-frame tx-weak sm:p-2.5'}
	>
		<div class="relative">
			<Search
				class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
			/>
			<input
				type="text"
				inputmode="search"
				role="combobox"
				aria-autocomplete="list"
				aria-controls={listboxId}
				aria-expanded={showPanel}
				aria-activedescendant={highlightedResultId}
				{placeholder}
				class="h-11 w-full rounded-lg border border-border-strong pl-9 pr-12 text-base text-foreground transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:text-sm {variant ===
				'toolbar'
					? 'bg-card shadow-none'
					: 'bg-background shadow-ink-inner'}"
				bind:value={query}
				{disabled}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
			/>
			{#if loading}
				<LoaderCircle
					class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin motion-reduce:animate-none text-muted-foreground"
				/>
			{:else if normalizedQuery}
				<button
					type="button"
					class="absolute right-0 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					aria-label="Clear project search"
					onclick={clearSearch}
				>
					<X class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
	</div>

	{#if showPanel}
		<div
			id={listboxId}
			role="listbox"
			class="absolute left-0 right-0 top-full z-50 mt-1 max-h-[50vh] overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak"
		>
			{#if errorMessage}
				<div class="px-3 py-3 text-sm text-destructive" role="alert">
					{errorMessage}
				</div>
			{:else if loading && results.length === 0}
				<div class="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
					<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
					Searching project...
				</div>
			{:else if results.length === 0}
				<div class="px-3 py-3 text-sm text-muted-foreground">
					No matches for "{normalizedQuery}"
				</div>
			{:else}
				<div class="max-h-80 overflow-y-auto py-1">
					{#each results as result, index (`${result.type}-${result.id}`)}
						{@const config = entityConfig[result.type]}
						{@const IconComponent = config.icon}
						{@const stateLabel = formatStateLabel(result.state_key)}
						<button
							type="button"
							id={`${listboxId}-${result.type}-${result.id}`}
							role="option"
							aria-selected={index === highlightedIndex}
							class="group flex min-h-[44px] w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors focus:outline-none motion-reduce:transition-none pressable {index ===
							highlightedIndex
								? 'bg-muted'
								: 'hover:bg-muted/60'}"
							onpointerdown={(event) => event.preventDefault()}
							onmouseenter={() => (highlightedIndex = index)}
							onclick={() => selectResult(result)}
						>
							<div
								class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background"
							>
								<IconComponent class="h-3.5 w-3.5 {config.iconClass}" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 items-center gap-2">
									<span
										class="truncate text-sm font-semibold text-foreground"
										title={resultTitle(result)}
									>
										{resultTitle(result)}
									</span>
									<span
										class="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-2xs font-semibold uppercase {config.badgeClass}"
									>
										{config.label}
									</span>
								</div>
								{#if result.snippet}
									<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
										{result.snippet}
									</p>
								{/if}
								{#if stateLabel || result.type_key}
									<div
										class="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground"
									>
										{#if stateLabel}
											<span
												class="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 capitalize"
											>
												{stateLabel}
											</span>
										{/if}
										{#if result.type_key}
											<span class="truncate">{result.type_key}</span>
										{/if}
									</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
				{#if maybeMore || totalReturned > results.length}
					<div
						class="border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
					>
						Keep typing to narrow results
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</section>
