<!-- apps/web/src/routes/projects/+page.svelte -->
<!--
  PERFORMANCE OPTIMIZATIONS (Dec 2024):
  - projectCount available immediately for skeleton rendering
  - Projects stream in background and hydrate skeletons
  - Zero layout shift - exact number of cards rendered from start
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSkeleton from '$lib/components/ui/LoadingSkeleton.svelte';
	import ProjectListSkeleton from '$lib/components/projects/ProjectListSkeleton.svelte';
	import type {
		ViewMode,
		GraphNode,
		OntologyGraphInstance,
		GraphStats
	} from '$lib/components/ontology/graph/lib/graph.types';
	import {
		DEFAULT_GRAPH_SCOPE_FILTERS,
		buildGraphRequestKey,
		type GraphScopeFilters
	} from '$lib/components/ontology/graph/lib/graph.filters';
	import { ontologyGraphStore } from '$lib/stores/ontology-graph.store';
	import {
		LoaderCircle,
		Plus,
		SlidersHorizontal,
		ChevronDown,
		Search,
		Folder,
		X,
		ArrowLeft
	} from '$lib/icons/lucide';
	import FilterGroup from '$lib/components/ui/FilterGroup.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import PullToRefresh from '$lib/components/pwa/PullToRefresh.svelte';
	import CollapsibleStateSection from '$lib/components/projects/CollapsibleStateSection.svelte';
	import ProjectStateRow from '$lib/components/projects/ProjectStateRow.svelte';
	import {
		normalizeProjectState,
		isPrimaryTier,
		emptyProjectStateCounts
	} from '$lib/config/project-states';
	import {
		PROJECT_LIST_SCOPE_OPTIONS,
		getProjectListScopeLabel,
		matchesProjectListScope,
		normalizeProjectListScope,
		type ProjectListScope,
		type ProjectListSummary
	} from '$lib/components/projects/project-list';

	let { data } = $props();

	// AgentChatModal state for creating new projects
	let showChatModal = $state(false);
	let AgentChatModal = $state<any>(null);
	let isPullRefreshing = $state(false);

	async function handleCreateProject() {
		// Lazy load the AgentChatModal
		if (!AgentChatModal) {
			try {
				const module = await import('$lib/components/agent/AgentChatModal.svelte');
				AgentChatModal = module.default;
			} catch (err) {
				console.error('Failed to load AgentChatModal:', err);
				// Fallback to navigation
				goto(resolve('/projects/create'));
				return;
			}
		}
		showChatModal = true;
	}

	function handleChatClose(summary?: DataMutationSummary) {
		showChatModal = false;
		if (summary?.hasChanges && summary.affectedProjectIds.length > 0) {
			toastService.success('Project created! Head to Projects to explore it.', {
				duration: TOAST_DURATION.LONG
			});
			invalidateAll();
		}
	}

	async function handlePullRefresh() {
		if (isPullRefreshing || showChatModal) return;

		isPullRefreshing = true;
		try {
			await invalidateAll();
		} finally {
			isPullRefreshing = false;
		}
	}

	/**
	 * Set navigation data before navigating to project detail.
	 * This enables instant skeleton rendering with accurate counts.
	 */
	function handleProjectClick(project: ProjectListSummary) {
		setNavigationData({
			id: project.id,
			name: project.name,
			description: project.description,
			icon_svg: project.icon_svg,
			icon_concept: project.icon_concept,
			icon_generated_at: project.icon_generated_at,
			icon_generation_source: project.icon_generation_source,
			icon_generation_prompt: project.icon_generation_prompt,
			state_key: project.state_key,
			next_step_short: project.next_step_short,
			next_step_long: project.next_step_long,
			next_step_source: project.next_step_source,
			next_step_updated_at: project.next_step_updated_at,
			task_count: project.task_count,
			document_count: project.document_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			milestone_count: 0, // Not available in summary, default to 0
			risk_count: 0 // Not available in summary, default to 0
		});
	}

	// Check if user is admin - only admins see filters, graph, and mobile nav
	const isAdmin = $derived(data?.user?.is_admin ?? false);

	// projectCount is available immediately for skeleton rendering
	const projectCount = $derived(data?.projectCount ?? 0);

	const graphStore = ontologyGraphStore;
	let GraphControlsComponent = $state<any>(null);
	let OntologyGraphComponent = $state<any>(null);
	let NodeDetailsPanelComponent = $state<any>(null);
	let graphComponentLoading = $state(false);
	let graphComponentError = $state<string | null>(null);

	let activeTab = $state<'overview' | 'graph'>(
		untrack(() =>
			isAdmin && get(page).url.searchParams.get('view') === 'graph' ? 'graph' : 'overview'
		)
	);
	let graphViewMode = $state<ViewMode>('projects'); // Default to Projects & Entities
	let graphScopeFilters = $state<GraphScopeFilters>({ ...DEFAULT_GRAPH_SCOPE_FILTERS });
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedGraphNode = $state<GraphNode | null>(null);
	const graphScopeKey = $derived(data?.actorId ? `actor:${data.actorId}` : 'actor:unknown');
	const graphRequestKey = $derived(
		`${graphScopeKey}|${buildGraphRequestKey(graphViewMode, graphScopeFilters)}`
	);
	const graphComponentsReady = $derived(
		Boolean(GraphControlsComponent && OntologyGraphComponent && NodeDetailsPanelComponent)
	);
	const emptyGraphStats: GraphStats = {
		totalProjects: 0,
		activeProjects: 0,
		totalEdges: 0,
		totalTasks: 0,
		totalDocuments: 0,
		totalPlans: 0,
		totalGoals: 0,
		totalMilestones: 0,
		totalRisks: 0
	};

	function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
		return !!value && typeof (value as PromiseLike<T>).then === 'function';
	}

	function getErrorMessage(error: unknown, fallback: string): string {
		if (error instanceof Error && error.message) return error.message;
		if (typeof error === 'string' && error.length > 0) return error;
		return fallback;
	}

	const initialProjects = untrack(() => data.projects);
	let projectsStreamVersion = 0;
	let projectsLoading = $state(
		isPromiseLike<ProjectListSummary[]>(initialProjects) ? true : false
	);
	let projectsError = $state<string | null>(null);
	let projectSummaries = $state<ProjectListSummary[]>(
		Array.isArray(initialProjects) ? (initialProjects as ProjectListSummary[]) : []
	);

	// SKELETON LOADING: Show skeletons based on projectCount while loading
	// Must be defined after projectsLoading to avoid temporal dead zone
	const showSkeletons = $derived(projectsLoading && projectCount > 0);

	$effect(() => {
		const incoming = data.projects;
		const currentVersion = ++projectsStreamVersion;
		projectsError = null;

		if (isPromiseLike<ProjectListSummary[]>(incoming)) {
			projectsLoading = true;

			incoming
				.then((result) => {
					if (currentVersion !== projectsStreamVersion) return;
					projectSummaries = Array.isArray(result) ? result : [];
					projectsLoading = false;
				})
				.catch((err) => {
					if (currentVersion !== projectsStreamVersion) return;
					projectsError = getErrorMessage(err, 'Failed to load ontology projects');
					projectSummaries = [];
					projectsLoading = false;
				});
			return;
		}

		projectSummaries = Array.isArray(incoming) ? (incoming as ProjectListSummary[]) : [];
		projectsLoading = false;
	});

	const projects = $derived(projectSummaries);
	// Admin-only ontology facets stay available inside the secondary filter panel.
	const availableContexts = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_context)
					.filter((context): context is string => Boolean(context))
			)
		).sort()
	);
	const availableScales = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_scale)
					.filter((scale): scale is string => Boolean(scale))
			)
		).sort()
	);
	const availableStages = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.facet_stage)
					.filter((stage): stage is string => Boolean(stage))
			)
		).sort()
	);

	type OwnershipFilter = 'all' | 'owned' | 'shared';
	const OWNERSHIP_FILTER_OPTIONS: readonly OwnershipFilter[] = ['all', 'owned', 'shared'];

	let searchQuery = $state('');
	let selectedScope = $state<ProjectListScope>(
		normalizeProjectListScope(get(page).url.searchParams.get('state'))
	);
	let selectedOwnership = $state<OwnershipFilter>('all');
	let selectedContexts = $state<string[]>([]);
	let selectedScales = $state<string[]>([]);
	let selectedStages = $state<string[]>([]);
	let filtersExpanded = $state(false);

	const hasFilters = $derived(
		Boolean(
			searchQuery.trim() ||
				selectedScope !== 'current' ||
				selectedOwnership !== 'all' ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length
		)
	);

	// Count of active filters (excluding search)
	const activeFilterCount = $derived(
		(selectedScope !== 'current' ? 1 : 0) +
			(selectedOwnership !== 'all' ? 1 : 0) +
			selectedContexts.length +
			selectedScales.length +
			selectedStages.length
	);
	// Check if any filter options are available
	const hasFilterOptions = $derived(
		availableContexts.length > 0 || availableScales.length > 0 || availableStages.length > 0
	);

	// Apply every filter except project state so the status choices can show
	// useful counts without becoming a second navigation bar.
	const projectsMatchingNonStateFilters = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		return (projects ?? []).filter((project) => {
			if (query) {
				const matchesQuery =
					project.name.toLowerCase().includes(query) ||
					(project.description ?? '').toLowerCase().includes(query);
				if (!matchesQuery) return false;
			}

			if (selectedOwnership === 'owned' && project.is_shared) return false;
			if (selectedOwnership === 'shared' && !project.is_shared) return false;

			if (selectedContexts.length) {
				if (!project.facet_context || !selectedContexts.includes(project.facet_context)) {
					return false;
				}
			}

			if (selectedScales.length) {
				if (!project.facet_scale || !selectedScales.includes(project.facet_scale)) {
					return false;
				}
			}

			if (selectedStages.length) {
				if (!project.facet_stage || !selectedStages.includes(project.facet_stage)) {
					return false;
				}
			}

			return true;
		});
	});

	const filteredProjects = $derived.by(() => {
		// Search is intentionally global by default so a known project never
		// disappears only because it was paused or completed.
		const searchAcrossAllStates = selectedScope === 'current' && searchQuery.trim().length > 0;
		return projectsMatchingNonStateFilters
			.filter(
				(project) =>
					searchAcrossAllStates ||
					matchesProjectListScope(project.state_key, selectedScope)
			)
			.sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
	});

	function parseProjectUpdatedAt(project: ProjectListSummary): number {
		const timestamp = Date.parse(project.updated_at);
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}

	// Counts remain available inside Filters without becoming a second tab bar.
	const stateCounts = $derived.by(() => {
		const counts = emptyProjectStateCounts();
		for (const project of projectsMatchingNonStateFilters) {
			const state = normalizeProjectState(project.state_key);
			counts[state] += 1;
			counts.total += 1;
			if (isPrimaryTier(state)) counts.primaryTotal += 1;
			else counts.secondaryTotal += 1;
		}
		return counts;
	});

	const completedProjects = $derived(
		projectsMatchingNonStateFilters
			.filter((project) => normalizeProjectState(project.state_key) === 'completed')
			.sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a))
	);
	const showCompletedDisclosure = $derived(
		selectedScope === 'current' &&
			searchQuery.trim().length === 0 &&
			completedProjects.length > 0
	);
	const visibleSectionLabel = $derived(
		selectedScope === 'current' && searchQuery.trim().length > 0
			? 'Search results'
			: getProjectListScopeLabel(selectedScope)
	);
	const visibleSectionHelper = $derived(
		selectedScope === 'current'
			? searchQuery.trim().length > 0
				? 'Across all project states'
				: 'Planning and active · Newest updates first'
			: 'Newest updates first'
	);

	function toggleValue<T extends string>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	function clearFilters() {
		searchQuery = '';
		selectedOwnership = 'all';
		selectedContexts = [];
		selectedScales = [];
		selectedStages = [];
		void setProjectScope('current');
	}

	async function setProjectScope(scope: ProjectListScope) {
		selectedScope = scope;
		const params = new URLSearchParams($page.url.searchParams);
		if (scope === 'current') params.delete('state');
		else params.set('state', scope);

		const query = params.toString();
		const nextUrl = resolve(query ? `/projects?${query}` : '/projects');
		if (nextUrl === `${$page.url.pathname}${$page.url.search}`) return;
		await goto(resolve(query ? `/projects?${query}` : '/projects'), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	async function ensureGraphComponents() {
		if (graphComponentsReady || graphComponentLoading) return;
		graphComponentLoading = true;
		graphComponentError = null;

		try {
			const [controlsModule, graphModule, detailsModule] = await Promise.all([
				import('$lib/components/ontology/graph/GraphControls.svelte'),
				import('$lib/components/ontology/graph/OntologyGraph.svelte'),
				import('$lib/components/ontology/graph/NodeDetailsPanel.svelte')
			]);

			GraphControlsComponent = controlsModule.default;
			OntologyGraphComponent = graphModule.default;
			NodeDetailsPanelComponent = detailsModule.default;
		} catch (error) {
			console.error('[Projects] Failed to load graph components:', error);
			graphComponentError = 'Failed to load graph view.';
		} finally {
			graphComponentLoading = false;
		}
	}

	async function setActiveTab(tab: 'overview' | 'graph') {
		if (activeTab === tab) return;
		activeTab = tab;

		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('ontology-view.change', {
					detail: { view: tab }
				})
			);
		}

		const params = new URLSearchParams($page.url.searchParams);
		if (tab === 'graph') {
			params.set('view', 'graph');
		} else {
			params.delete('view');
			selectedGraphNode = null;
		}

		const query = params.toString();
		await goto(resolve(query ? `/projects?${query}` : '/projects'), {
			replaceState: true,
			keepFocus: true,
			noScroll: tab === 'graph'
		});
	}

	function refreshGraph() {
		graphStore.load({
			viewMode: graphViewMode,
			scopeFilters: graphScopeFilters,
			scopeKey: graphScopeKey,
			force: true
		});
	}

	$effect(() => {
		const viewParam =
			isAdmin && $page.url.searchParams.get('view') === 'graph' ? 'graph' : 'overview';
		if (viewParam !== activeTab) {
			activeTab = viewParam;
		}
	});

	// Deep-link support: /projects?state=active applies the same scope used by Filters.
	$effect(() => {
		const scope = normalizeProjectListScope($page.url.searchParams.get('state'));
		untrack(() => {
			if (selectedScope !== scope) selectedScope = scope;
		});
	});

	$effect(() => {
		if (isAdmin && activeTab === 'graph') {
			ensureGraphComponents();
		}
	});

	$effect(() => {
		const state = $graphStore;
		const loadedRequestKey = state.metadata?.requestKey ?? null;
		const shouldLoadGraph =
			isAdmin &&
			activeTab === 'graph' &&
			(state.status === 'idle' ||
				(state.status === 'ready' && loadedRequestKey !== graphRequestKey) ||
				(state.status === 'error' && loadedRequestKey !== graphRequestKey));

		if (shouldLoadGraph) {
			graphStore.load({
				viewMode: graphViewMode,
				scopeFilters: graphScopeFilters,
				scopeKey: graphScopeKey
			});
		}
	});

	$effect(() => {
		const state = $graphStore;
		if (state.status === 'loading') {
			selectedGraphNode = null;
		}
	});
</script>

<svelte:head>
	<title>Projects | BuildOS</title>
</svelte:head>

<PullToRefresh
	onRefresh={handlePullRefresh}
	disabled={isPullRefreshing || showChatModal || projectsLoading}
>
	<div class="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-3">
		<header class="flex items-center justify-between gap-3">
			<div class="min-w-0 flex-1 space-y-1">
				<div class="flex items-center gap-2.5">
					<h1 class="text-2xl font-semibold tracking-tight text-foreground">
						{activeTab === 'overview' ? 'Projects' : 'Ontology graph'}
					</h1>
					{#if activeTab === 'overview' && projectsLoading}
						<LoaderCircle
							class="h-5 w-5 animate-spin text-accent motion-reduce:animate-none"
						/>
					{/if}
				</div>
				{#if activeTab === 'graph'}
					<p class="text-sm text-muted-foreground">
						Admin tool for exploring project and entity relationships.
					</p>
				{/if}
			</div>

			{#if activeTab === 'overview'}
				<Button
					variant="primary"
					size="sm"
					icon={Plus}
					onclick={handleCreateProject}
					class="shrink-0 whitespace-nowrap text-xs [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1.5"
				>
					New project
				</Button>
			{:else}
				<Button
					variant="outline"
					size="sm"
					icon={ArrowLeft}
					onclick={() => setActiveTab('overview')}
					class="shrink-0 whitespace-nowrap"
				>
					Back to projects
				</Button>
			{/if}
		</header>

		{#if activeTab === 'overview'}
			<section class="space-y-4">
				{#if projectsLoading && !showSkeletons}
					<!-- Fallback loading state when projectCount is 0 or unknown.
					     Use the same vertical dossier-row skeleton as the real list so
					     the loading shape matches what hydrates in (zero layout shift). -->
					<ProjectListSkeleton count={3} />
				{:else if projectsError}
					<div class="wt-card p-6 text-center tx tx-static tx-weak">
						<h2 class="text-base font-semibold text-foreground">
							Unable to load ontology projects
						</h2>
						<p class="mt-2 text-sm text-muted-foreground">
							{projectsError}
						</p>
						<div class="mt-4 flex justify-center">
							<Button
								variant="primary"
								size="sm"
								onclick={() => goto(resolve('/projects'), { replaceState: true })}
							>
								Try again
							</Button>
						</div>
					</div>
				{:else}
					<div class="space-y-2">
						<div class="flex min-w-0 items-stretch gap-2">
							<div class="relative min-w-0 flex-1">
								<Search
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									type="search"
									aria-label="Search projects"
									class="min-h-11 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-10 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm [&::-webkit-search-cancel-button]:appearance-none [@media(pointer:fine)]:min-h-9 [@media(pointer:fine)]:py-1.5"
									placeholder="Search projects..."
									bind:value={searchQuery}
								/>
								{#if searchQuery}
									<button
										type="button"
										class="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onclick={() => (searchQuery = '')}
										aria-label="Clear project search"
									>
										<X class="h-4 w-4" />
									</button>
								{/if}
							</div>
							<Button
								variant="outline"
								size="sm"
								icon={SlidersHorizontal}
								onclick={() => (filtersExpanded = !filtersExpanded)}
								aria-expanded={filtersExpanded}
								aria-controls="filter-panel-content"
								class="shrink-0 text-xs [@media(pointer:fine)]:min-h-9 [@media(pointer:fine)]:py-1.5"
							>
								Filters
								{#if activeFilterCount > 0}
									<span
										class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground"
									>
										{activeFilterCount}
									</span>
								{/if}
								<ChevronDown
									class="h-4 w-4 transition-transform motion-reduce:transition-none {filtersExpanded
										? 'rotate-180'
										: ''}"
								/>
							</Button>
						</div>

						{#if filtersExpanded}
							<div
								id="filter-panel-content"
								class="space-y-3 rounded-lg border border-border bg-card p-3"
							>
								<div class="space-y-1.5">
									<p class="micro-label text-muted-foreground">STATUS</p>
									<div class="flex flex-wrap gap-1.5">
										{#each PROJECT_LIST_SCOPE_OPTIONS as scope (scope)}
											{@const scopeCount =
												scope === 'current'
													? stateCounts.primaryTotal
													: scope === 'all'
														? stateCounts.total
														: stateCounts[scope]}
											<button
												type="button"
												class="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-semibold pressable [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default {selectedScope ===
												scope
													? 'border-accent/40 bg-accent/15 text-accent'
													: scopeCount === 0
														? 'border-border text-muted-foreground/60'
														: 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'}"
												onclick={() => setProjectScope(scope)}
												aria-pressed={selectedScope === scope}
												disabled={scopeCount === 0 &&
													selectedScope !== scope}
											>
												<span>{getProjectListScopeLabel(scope)}</span>
												<span class="text-xs font-bold">{scopeCount}</span>
											</button>
										{/each}
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="micro-label text-muted-foreground">OWNERSHIP</p>
									<div
										class="inline-flex rounded-md bg-muted p-0.5 text-xs font-semibold"
									>
										{#each OWNERSHIP_FILTER_OPTIONS as option (option)}
											<button
												type="button"
												class="min-h-11 rounded-md px-3 py-2 pressable [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset {selectedOwnership ===
												option
													? 'bg-card text-foreground shadow-sm'
													: 'text-muted-foreground hover:text-foreground'}"
												onclick={() => (selectedOwnership = option)}
												aria-pressed={selectedOwnership === option}
											>
												{option === 'all'
													? 'All'
													: option === 'owned'
														? 'Mine'
														: 'Shared'}
											</button>
										{/each}
									</div>
								</div>

								{#if isAdmin && hasFilterOptions}
									<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
										<FilterGroup
											label="Context"
											options={availableContexts}
											selected={selectedContexts}
											onToggle={(ctx) =>
												(selectedContexts = toggleValue(
													selectedContexts,
													ctx
												))}
										/>
										<FilterGroup
											label="Scale"
											options={availableScales}
											selected={selectedScales}
											onToggle={(scale) =>
												(selectedScales = toggleValue(
													selectedScales,
													scale
												))}
										/>
										<FilterGroup
											label="Stage"
											options={availableStages}
											selected={selectedStages}
											onToggle={(stage) =>
												(selectedStages = toggleValue(
													selectedStages,
													stage
												))}
										/>
									</div>
								{/if}

								{#if hasFilters}
									<Button variant="ghost" size="sm" onclick={clearFilters}>
										Clear all filters
									</Button>
								{/if}
							</div>
						{/if}

						{#if activeFilterCount > 0}
							<div
								class="flex flex-wrap items-center gap-1.5"
								aria-label="Active filters"
							>
								{#if selectedScope !== 'current'}
									<button
										type="button"
										class="inline-flex min-h-11 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-7"
										onclick={() => setProjectScope('current')}
										aria-label="Clear status filter: {getProjectListScopeLabel(
											selectedScope
										)}"
									>
										Status: {getProjectListScopeLabel(selectedScope)}
										<X class="h-3.5 w-3.5" />
									</button>
								{/if}
								{#if selectedOwnership !== 'all'}
									<button
										type="button"
										class="inline-flex min-h-11 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-7"
										onclick={() => (selectedOwnership = 'all')}
										aria-label="Clear ownership filter"
									>
										{selectedOwnership === 'owned' ? 'Mine' : 'Shared'}
										<X class="h-3.5 w-3.5" />
									</button>
								{/if}
								{#each selectedContexts as value (value)}
									<button
										type="button"
										class="inline-flex min-h-11 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-7"
										onclick={() =>
											(selectedContexts = toggleValue(
												selectedContexts,
												value
											))}
										aria-label="Clear context filter: {value}"
									>
										Context: {value}
										<X class="h-3.5 w-3.5" />
									</button>
								{/each}
								{#each selectedScales as value (value)}
									<button
										type="button"
										class="inline-flex min-h-11 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-7"
										onclick={() =>
											(selectedScales = toggleValue(selectedScales, value))}
										aria-label="Clear scale filter: {value}"
									>
										Scale: {value}
										<X class="h-3.5 w-3.5" />
									</button>
								{/each}
								{#each selectedStages as value (value)}
									<button
										type="button"
										class="inline-flex min-h-11 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-accent pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-7"
										onclick={() =>
											(selectedStages = toggleValue(selectedStages, value))}
										aria-label="Clear stage filter: {value}"
									>
										Stage: {value}
										<X class="h-3.5 w-3.5" />
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<!-- SKELETON LOADING: Show exact number of skeleton cards while loading -->
			{#if showSkeletons}
				<ProjectListSkeleton count={projectCount} />
			{:else if projects.length === 0 && !projectsLoading}
				<div
					class="wt-paper border-dashed px-4 py-12 text-center tx tx-thread tx-weak sm:px-6 sm:py-16"
				>
					<div
						class="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent sm:h-14 sm:w-14"
					>
						<Folder class="h-6 w-6" />
					</div>
					<h2 class="text-xl font-bold text-foreground">No projects yet</h2>
					<p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
						Create your first project and BuildOS will help you shape goals, tasks, and
						milestones.
					</p>
					<div class="mt-6 flex justify-center">
						<Button variant="primary" size="sm" onclick={handleCreateProject}>
							Create first project
						</Button>
					</div>
				</div>
			{:else}
				<div class="space-y-3">
					{#if filteredProjects.length > 0}
						<section class="space-y-2" aria-labelledby="project-list-heading">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
								<h2
									id="project-list-heading"
									class="text-sm font-semibold text-foreground"
								>
									{visibleSectionLabel}
								</h2>
								<span
									class="text-xs font-medium tabular-nums text-muted-foreground"
								>
									{filteredProjects.length}
								</span>
								<span
									class="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline"
								>
									{visibleSectionHelper}
								</span>
							</div>
							<div class="space-y-1">
								{#each filteredProjects as project (project.id)}
									<ProjectStateRow {project} onSelect={handleProjectClick} />
								{/each}
							</div>
						</section>
					{:else}
						<div
							class="wt-paper border-dashed px-4 py-8 text-center tx tx-thread tx-weak"
						>
							<p class="text-sm font-semibold text-foreground">
								{selectedScope === 'current' && !searchQuery.trim()
									? 'No current projects'
									: 'No matching projects'}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{selectedScope === 'current' && !searchQuery.trim()
									? 'Planning and active projects will appear here.'
									: 'Adjust your search or clear filters to explore more.'}
							</p>
							{#if hasFilters}
								<div class="mt-4 flex justify-center">
									<Button variant="outline" size="sm" onclick={clearFilters}>
										Clear filters
									</Button>
								</div>
							{/if}
						</div>
					{/if}

					{#if showCompletedDisclosure}
						<CollapsibleStateSection
							projectState="completed"
							projects={completedProjects}
							onSelect={handleProjectClick}
						/>
					{/if}
				</div>
			{/if}
			<!-- Graph view - Admin Only -->
		{:else if isAdmin}
			<section class="space-y-4">
				{#if $graphStore.metadata?.truncated}
					<div class="wt-paper p-3 text-sm text-muted-foreground tx tx-thread tx-weak">
						Showing {$graphStore.metadata.returnedNodeCount ??
							$graphStore.graph?.nodes?.length ??
							0} of {$graphStore.metadata.originalNodeCount ?? 'many'} nodes. Open an individual
						project for its complete graph.
					</div>
				{/if}

				<div class="wt-paper overflow-hidden touch-none tx tx-frame tx-weak">
					<div class="relative h-[60vh] sm:h-[70vh] lg:h-[calc(100vh-18rem)]">
						{#if graphComponentError}
							<div
								class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center tx tx-static tx-weak"
							>
								<h3 class="text-base font-semibold text-foreground">
									Unable to load graph view
								</h3>
								<p class="text-sm text-muted-foreground">
									{graphComponentError}
								</p>
								<Button variant="primary" size="sm" onclick={ensureGraphComponents}
									>Try again</Button
								>
							</div>
						{:else if !graphComponentsReady}
							<LoadingSkeleton
								message={graphComponentLoading
									? 'Loading graph view...'
									: 'Preparing graph view...'}
								height="100%"
							/>
						{:else if $graphStore.status === 'loading'}
							<LoadingSkeleton message="Preparing ontology graph..." height="100%" />
						{:else if $graphStore.status === 'error'}
							<div
								class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center tx tx-static tx-weak"
							>
								<h3 class="text-base font-semibold text-foreground">
									Unable to load graph
								</h3>
								<p class="text-sm text-muted-foreground">
									{$graphStore.error ??
										'An unexpected error occurred while loading your ontology data.'}
								</p>
								<Button variant="primary" size="sm" onclick={refreshGraph}
									>Try again</Button
								>
							</div>
						{:else if $graphStore.data}
							<OntologyGraphComponent
								data={$graphStore.data}
								viewMode={graphViewMode}
								bind:selectedNode={selectedGraphNode}
								bind:graphInstance
							/>
						{:else}
							<div
								class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center tx tx-thread tx-weak"
							>
								<h3 class="text-base font-semibold text-foreground">
									No ontology data yet
								</h3>
								<p class="text-sm text-muted-foreground">
									Start by creating a project or template to visualize your
									ontology relationships.
								</p>
								<Button variant="primary" size="sm" onclick={handleCreateProject}>
									Create project
								</Button>
							</div>
						{/if}
					</div>
				</div>

				<div class="grid gap-4 lg:grid-cols-2">
					<section class="wt-paper overflow-hidden tx tx-frame tx-weak">
						{#if GraphControlsComponent}
							<GraphControlsComponent
								bind:viewMode={graphViewMode}
								bind:scopeFilters={graphScopeFilters}
								{graphInstance}
								stats={$graphStore.stats ?? emptyGraphStats}
								scopeCounts={$graphStore.metadata?.scopeCounts}
							/>
						{:else}
							<div class="p-4 text-sm text-muted-foreground">
								Loading graph controls...
							</div>
						{/if}
					</section>

					<section class="wt-paper overflow-hidden tx tx-frame tx-weak">
						{#if selectedGraphNode && $graphStore.status === 'ready' && NodeDetailsPanelComponent}
							<NodeDetailsPanelComponent
								node={selectedGraphNode}
								onClose={() => (selectedGraphNode = null)}
							/>
						{:else}
							<div
								class="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
							>
								{#if $graphStore.status === 'ready'}
									Select a node to view details.
								{:else}
									Graph details will appear here once loaded.
								{/if}
							</div>
						{/if}
					</section>
				</div>
			</section>
		{/if}
	</div>
</PullToRefresh>

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleChatClose} />
{/if}
