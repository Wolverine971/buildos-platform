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
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import { ontologyGraphStore } from '$lib/stores/ontology-graph.store';
	import { LoaderCircle, SlidersHorizontal, ChevronDown } from 'lucide-svelte';
	import FilterGroup from '$lib/components/ui/FilterGroup.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';
	import PullToRefresh from '$lib/components/pwa/PullToRefresh.svelte';
	import CollapsibleStateSection from '$lib/components/projects/CollapsibleStateSection.svelte';
	import ProjectStateRow from '$lib/components/projects/ProjectStateRow.svelte';
	import {
		PROJECT_STATE_ORDER,
		PROJECT_STATE_META,
		normalizeProjectState,
		isPrimaryTier,
		emptyProjectStateCounts
	} from '$lib/config/project-states';
	import type { ProjectState } from '$lib/types/onto';

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
				goto('/projects/create');
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
	function handleProjectClick(project: OntologyProjectSummary) {
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
		get(page).url.searchParams.get('view') === 'graph' ? 'graph' : 'overview'
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
		isPromiseLike<OntologyProjectSummary[]>(initialProjects) ? true : false
	);
	let projectsError = $state<string | null>(null);
	let projectSummaries = $state<OntologyProjectSummary[]>(
		Array.isArray(initialProjects) ? (initialProjects as OntologyProjectSummary[]) : []
	);

	// SKELETON LOADING: Show skeletons based on projectCount while loading
	// Must be defined after projectsLoading to avoid temporal dead zone
	const showSkeletons = $derived(projectsLoading && projectCount > 0);

	$effect(() => {
		const incoming = data.projects;
		const currentVersion = ++projectsStreamVersion;
		projectsError = null;

		if (isPromiseLike<OntologyProjectSummary[]>(incoming)) {
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

		projectSummaries = Array.isArray(incoming) ? (incoming as OntologyProjectSummary[]) : [];
		projectsLoading = false;
	});

	const projects = $derived(projectSummaries);
	const availableStates = $derived.by<readonly ProjectState[]>(() => {
		const present = new Set(
			(projects ?? []).map((project) => normalizeProjectState(project.state_key))
		);
		return PROJECT_STATE_ORDER.filter((state) => present.has(state));
	});
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

	let searchQuery = $state('');
	let selectedStates = $state<ProjectState[]>([]);
	let selectedOwnership = $state<OwnershipFilter>('all');
	let selectedContexts = $state<string[]>([]);
	let selectedScales = $state<string[]>([]);
	let selectedStages = $state<string[]>([]);
	let filtersExpanded = $state(false);

	const hasFilters = $derived(
		Boolean(
			searchQuery.trim() ||
				selectedStates.length ||
				selectedOwnership !== 'all' ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length
		)
	);

	// Count of active filters (excluding search)
	const activeFilterCount = $derived(
		selectedStates.length +
			(selectedOwnership !== 'all' ? 1 : 0) +
			selectedContexts.length +
			selectedScales.length +
			selectedStages.length
	);
	const activeSearchAndFilterCount = $derived(
		activeFilterCount + (searchQuery.trim().length > 0 ? 1 : 0)
	);

	// Check if any filter options are available
	const hasFilterOptions = $derived(
		availableStates.length > 0 ||
			availableContexts.length > 0 ||
			availableScales.length > 0 ||
			availableStages.length > 0
	);

	// Apply every filter except the state filter. The status count strip uses
	// this list so users can see counts in other states and swap between them.
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
		if (!selectedStates.length) return projectsMatchingNonStateFilters;
		return projectsMatchingNonStateFilters.filter((project) => {
			const normalized = normalizeProjectState(project.state_key);
			return selectedStates.includes(normalized);
		});
	});

	const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

	type ProjectRecencyGroups = {
		recent: OntologyProjectSummary[];
		olderThan7Days: OntologyProjectSummary[];
		olderThan30Days: OntologyProjectSummary[];
	};

	function parseProjectUpdatedAt(project: OntologyProjectSummary): number {
		const timestamp = Date.parse(project.updated_at);
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}

	function groupProjectsByRecency(projectList: OntologyProjectSummary[]): ProjectRecencyGroups {
		const now = Date.now();
		const recent: OntologyProjectSummary[] = [];
		const olderThan7Days: OntologyProjectSummary[] = [];
		const olderThan30Days: OntologyProjectSummary[] = [];

		for (const project of projectList) {
			const updatedAtMs = parseProjectUpdatedAt(project);
			const ageDays =
				updatedAtMs > 0 ? (now - updatedAtMs) / MILLIS_PER_DAY : Number.POSITIVE_INFINITY;

			if (ageDays >= 30) {
				olderThan30Days.push(project);
				continue;
			}

			if (ageDays >= 7) {
				olderThan7Days.push(project);
				continue;
			}

			recent.push(project);
		}

		return {
			recent,
			olderThan7Days,
			olderThan30Days
		};
	}

	const projectsByState = $derived.by(() => {
		const groups = new Map<ProjectState, OntologyProjectSummary[]>();
		for (const state of PROJECT_STATE_ORDER) groups.set(state, []);
		for (const project of filteredProjects) {
			const state = normalizeProjectState(project.state_key);
			groups.get(state)?.push(project);
		}
		for (const list of groups.values()) {
			list.sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
		}
		return groups;
	});

	// Planning + Active render as one combined "Current Work" section. Mixed
	// by updated_at; each row's state chip distinguishes Planning vs Active.
	const primaryProjects = $derived.by(() => {
		const merged = [
			...(projectsByState.get('planning') ?? []),
			...(projectsByState.get('active') ?? [])
		];
		return merged.sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
	});

	const primaryRecencyGroups = $derived(groupProjectsByRecency(primaryProjects));

	const SECONDARY_STATES = PROJECT_STATE_ORDER.filter((state) => !isPrimaryTier(state));

	// Counts shown in the status strip ignore the state filter so users can see
	// how much work sits in each state and quick-switch between them.
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

	const stats = $derived.by(() => {
		const taskTotal = primaryProjects.reduce((acc, p) => acc + (p.task_count ?? 0), 0);
		const documentTotal = primaryProjects.reduce((acc, p) => acc + (p.document_count ?? 0), 0);
		return {
			currentWork: primaryProjects.length,
			totalTasks: taskTotal,
			totalDocuments: documentTotal,
			activeProjects: projectsByState.get('active')?.length ?? 0
		};
	});

	// Only surface the "No current work" empty state when the user hasn't
	// explicitly filtered themselves into a secondary-only view. Filtering to
	// just Completed shouldn't shout that there's no current work.
	const primaryFilterActive = $derived(
		selectedStates.length === 0 || selectedStates.some((state) => isPrimaryTier(state))
	);

	function toggleValue<T extends string>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	function clearFilters() {
		searchQuery = '';
		selectedStates = [];
		selectedOwnership = 'all';
		selectedContexts = [];
		selectedScales = [];
		selectedStages = [];
	}

	function quickFilterState(state: ProjectState) {
		selectedStates = selectedStates.includes(state) ? [] : [state];
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
		await goto(`${$page.url.pathname}${query ? `?${query}` : ''}`, {
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
		const viewParam = $page.url.searchParams.get('view') === 'graph' ? 'graph' : 'overview';
		if (viewParam !== activeTab) {
			activeTab = viewParam;
		}
	});

	// Deep-link support: /projects?state=active applies a state filter on load.
	$effect(() => {
		const stateParam = $page.url.searchParams.get('state');
		if (!stateParam) return;
		const normalized = stateParam.toLowerCase() as ProjectState;
		if (!PROJECT_STATE_ORDER.includes(normalized)) return;
		untrack(() => {
			if (selectedStates.length === 1 && selectedStates[0] === normalized) return;
			if (selectedStates.length === 0) selectedStates = [normalized];
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
	<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 space-y-3 sm:space-y-4">
		<!-- Page Header - Inkprint design with micro-label pattern -->
		<header class="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="space-y-1 sm:space-y-1.5 flex-1">
				<p class="micro-label text-accent">YOUR WORKSPACE</p>
				<div class="flex items-center gap-2.5">
					<h1 class="text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground">
						Projects
					</h1>
					{#if projectsLoading}
						<LoaderCircle class="h-4 w-4 sm:h-5 sm:w-5 text-accent animate-spin" />
					{/if}
				</div>
				<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
					Your active projects and workflows. Context that compounds.
				</p>
			</div>

			<!-- Graph/Overview toggle - Admin Only - Inkprint tab design with card weight -->
			{#if isAdmin}
				<nav
					class="inline-flex wt-card p-0.5 sm:p-1 text-xs sm:text-sm font-semibold overflow-x-auto scrollbar-hide tx tx-frame tx-weak"
					aria-label="Project view mode"
				>
					<button
						type="button"
						class={`relative rounded-md px-3 py-1.5 sm:px-4 sm:py-2 transition-all pressable ${
							activeTab === 'overview'
								? 'bg-accent text-accent-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
						}`}
						aria-pressed={activeTab === 'overview'}
						onclick={() => setActiveTab('overview')}
					>
						Overview
					</button>
					<button
						type="button"
						class={`relative rounded-md px-3 py-1.5 sm:px-4 sm:py-2 transition-all pressable ${
							activeTab === 'graph'
								? 'bg-accent text-accent-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
						}`}
						aria-pressed={activeTab === 'graph'}
						onclick={() => setActiveTab('graph')}
					>
						Graph
					</button>
				</nav>
			{/if}
		</header>

		{#if activeTab === 'overview'}
			<section class="space-y-4">
				{#if projectsLoading && !showSkeletons}
					<!-- Fallback loading state when projectCount is 0 or unknown -->
					<div class="space-y-6">
						<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each Array.from({ length: 3 }) as _}
								<div class="wt-paper p-4 tx tx-frame tx-weak animate-pulse">
									<div class="h-5 w-1/3 rounded bg-muted"></div>
									<div class="mt-4 h-4 w-3/4 rounded bg-muted/80"></div>
									<div class="mt-2 h-3 w-2/3 rounded bg-muted/80"></div>
								</div>
							{/each}
						</div>
					</div>
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
								onclick={() => goto('/projects', { replaceState: true })}
							>
								Try again
							</Button>
						</div>
					</div>
				{:else}
					<div class="flex justify-end">
						<Button variant="primary" size="sm" onclick={handleCreateProject}>
							<svg
								class="h-4 w-4 mr-2"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
							<span>New Project</span>
						</Button>
					</div>

					<!-- Stats Grid - Now counts current work (planning + active) instead of all-time -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
						<!-- Current work = planning + active -->
						<div class="wt-paper p-3 sm:p-4 tx tx-frame tx-weak">
							<p
								class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground"
							>
								CURRENT WORK
							</p>
							{#if showSkeletons}
								<div
									class="h-6 sm:h-8 w-10 sm:w-14 bg-muted/60 rounded mt-1 animate-pulse"
								></div>
							{:else}
								<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
									{stats.currentWork}
								</p>
							{/if}
						</div>
						<!-- Tasks across current work only -->
						<div class="wt-paper p-3 sm:p-4 tx tx-grain tx-weak">
							<p
								class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground"
							>
								TASKS
							</p>
							{#if showSkeletons}
								<div
									class="h-6 sm:h-8 w-10 sm:w-14 bg-muted/60 rounded mt-1 animate-pulse"
								></div>
							{:else}
								<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
									{stats.totalTasks}
								</p>
							{/if}
						</div>
						<!-- Docs across current work only -->
						<div class="wt-paper p-3 sm:p-4 tx tx-thread tx-weak">
							<p
								class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground"
							>
								DOCS
							</p>
							{#if showSkeletons}
								<div
									class="h-6 sm:h-8 w-10 sm:w-14 bg-muted/60 rounded mt-1 animate-pulse"
								></div>
							{:else}
								<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
									{stats.totalDocuments}
								</p>
							{/if}
						</div>
						<!-- Active count - subset of current work -->
						<div
							class="wt-paper p-3 sm:p-4 tx tx-pulse tx-weak border-accent/30 bg-accent/5"
						>
							<p class="micro-label text-[9px] sm:text-[0.65rem] text-accent">
								ACTIVE
							</p>
							{#if showSkeletons}
								<div
									class="h-6 sm:h-8 w-10 sm:w-14 bg-accent/20 rounded mt-1 animate-pulse"
								></div>
							{:else}
								<p class="text-xl sm:text-2xl font-semibold text-accent mt-1">
									{stats.activeProjects}
								</p>
							{/if}
						</div>
					</div>

					<!-- Status count strip - click any segment to quick-filter by state -->
					{#if !showSkeletons && stateCounts.total > 0}
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm"
						>
							{#each PROJECT_STATE_ORDER as state (state)}
								{@const count = stateCounts[state]}
								{@const meta = PROJECT_STATE_META[state]}
								{@const isSelected =
									selectedStates.length === 1 && selectedStates[0] === state}
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded px-2 py-1 transition pressable {isSelected
										? 'bg-accent/15 text-accent font-semibold'
										: count === 0
											? 'text-muted-foreground/60 hover:text-muted-foreground'
											: 'text-muted-foreground hover:text-foreground'}"
									onclick={() => quickFilterState(state)}
									aria-pressed={isSelected}
									disabled={count === 0 && !isSelected}
								>
									<span>{meta.label}</span>
									<span class="font-semibold">{count}</span>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Search + Filters panel (collapsible) -->
					<div class="wt-paper overflow-hidden tx tx-frame tx-weak">
						<button
							type="button"
							class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted/30 pressable"
							onclick={() => (filtersExpanded = !filtersExpanded)}
							aria-expanded={filtersExpanded}
							aria-controls="filter-panel-content"
						>
							<div class="flex items-center gap-2">
								<SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
								<span class="text-sm font-semibold text-foreground"
									>Search & Filters</span
								>
								{#if activeSearchAndFilterCount > 0}
									<span
										class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-xs font-bold"
									>
										{activeSearchAndFilterCount}
									</span>
								{/if}
							</div>
							<ChevronDown
								class="h-4 w-4 text-muted-foreground transition-transform duration-200 {filtersExpanded
									? 'rotate-180'
									: ''}"
							/>
						</button>

						<div
							id="filter-panel-content"
							class="grid transition-all duration-200 ease-out {filtersExpanded
								? 'grid-rows-[1fr] opacity-100'
								: 'grid-rows-[0fr] opacity-0'}"
						>
							<div
								class="px-3 pb-3 pt-1 space-y-3 border-t border-border overflow-hidden"
							>
								<div class="relative">
									<input
										type="search"
										class="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring shadow-ink-inner"
										placeholder="Search projects by name or description..."
										bind:value={searchQuery}
									/>
									<svg
										class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
										/>
									</svg>
								</div>

								<!-- Ownership filter - available to all users -->
								<div class="space-y-1.5">
									<p
										class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground"
									>
										OWNERSHIP
									</p>
									<div
										class="inline-flex rounded-md bg-muted p-0.5 text-xs font-semibold"
									>
										{#each ['all', 'owned', 'shared'] as const as option (option)}
											<button
												type="button"
												class="px-3 py-1 rounded transition pressable {selectedOwnership ===
												option
													? 'bg-card text-foreground shadow-ink'
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
									<FilterGroup
										label="State"
										options={[...availableStates]}
										selected={selectedStates}
										onToggle={(state) =>
											(selectedStates = toggleValue(
												selectedStates,
												state as ProjectState
											))}
									/>

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
									<div class="pt-1">
										<button
											type="button"
											class="text-xs font-bold text-accent hover:text-accent/80 transition pressable"
											onclick={clearFilters}
										>
											Clear all filters
										</button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</section>

			<!-- SKELETON LOADING: Show exact number of skeleton cards while loading -->
			{#if showSkeletons}
				<ProjectListSkeleton count={projectCount} />
			{:else if filteredProjects.length === 0 && !projectsLoading}
				<div
					class="wt-paper border-dashed px-4 py-12 text-center tx tx-thread tx-weak sm:px-6 sm:py-16"
				>
					<div
						class="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent sm:h-14 sm:w-14"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							class="h-6 w-6"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
							/>
						</svg>
					</div>
					<h2 class="text-xl font-bold text-foreground">No projects yet</h2>
					<p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
						{projects.length === 0
							? 'Create your first project and BuildOS will help you shape goals, tasks, and milestones.'
							: 'No projects match the current filters. Adjust your search or clear filters to explore more.'}
					</p>
					<div class="mt-6 flex justify-center gap-3">
						{#if projects.length === 0}
							<Button variant="primary" size="sm" onclick={handleCreateProject}>
								Create first project
							</Button>
						{:else if hasFilters}
							<Button variant="outline" size="sm" onclick={clearFilters}>
								Clear filters
							</Button>
						{/if}
					</div>
				</div>
			{:else if filteredProjects.length > 0}
				<div class="space-y-6">
					<!-- Current Work — Planning + Active merged, sorted by updated_at desc -->
					{#if primaryProjects.length > 0}
						<section class="space-y-2" aria-labelledby="state-section-current-work">
							<div class="flex items-baseline gap-2">
								<p id="state-section-current-work" class="micro-label text-accent">
									Current Work
								</p>
								<span class="text-xs font-semibold text-muted-foreground">
									{primaryProjects.length}
								</span>
								<span
									class="hidden sm:inline text-xs font-medium text-muted-foreground/80"
								>
									· Planning and active projects
								</span>
							</div>
							<div class="space-y-2">
								{#each primaryRecencyGroups.recent as project (project.id)}
									<ProjectStateRow
										{project}
										variant="primary"
										onSelect={handleProjectClick}
									/>
								{/each}
								{#if primaryRecencyGroups.olderThan7Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 7 days
									</div>
									{#each primaryRecencyGroups.olderThan7Days as project (project.id)}
										<ProjectStateRow
											{project}
											variant="primary"
											onSelect={handleProjectClick}
										/>
									{/each}
								{/if}
								{#if primaryRecencyGroups.olderThan30Days.length > 0}
									<div class="project-recency-separator">
										Not touched in last 30 days
									</div>
									{#each primaryRecencyGroups.olderThan30Days as project (project.id)}
										<ProjectStateRow
											{project}
											variant="primary"
											onSelect={handleProjectClick}
										/>
									{/each}
								{/if}
							</div>
						</section>
					{:else if primaryFilterActive}
						<div
							class="wt-paper border-dashed px-4 py-6 text-center tx tx-thread tx-weak"
						>
							<p class="text-sm font-semibold text-foreground">No current work</p>
							<p class="mt-1 text-xs text-muted-foreground">
								No Planning or Active projects match the current filters.
							</p>
						</div>
					{/if}

					<!-- Secondary tiers: Completed, Cancelled, Paused -->
					{#each SECONDARY_STATES as state (state)}
						<CollapsibleStateSection
							projectState={state}
							projects={projectsByState.get(state) ?? []}
							variant="secondary"
							onSelect={handleProjectClick}
						/>
					{/each}
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

<style>
	.project-recency-separator {
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(var(--border));
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground) / 0.85);
	}
</style>
