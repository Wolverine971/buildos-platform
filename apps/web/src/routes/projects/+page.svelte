<!-- apps/web/src/routes/projects/+page.svelte -->
<!--
  PERFORMANCE OPTIMIZATIONS (Dec 2024):
  - projectCount available immediately for skeleton rendering
  - Projects stream in background and hydrate skeletons
  - Zero layout shift - exact number of cards rendered from start
-->
<script lang="ts">
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
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import { ontologyGraphStore } from '$lib/stores/ontology-graph.store';
	import { LoaderCircle, SlidersHorizontal, ChevronDown, ArrowRight } from 'lucide-svelte';
	import FilterGroup from '$lib/components/ui/FilterGroup.svelte';
	import { setNavigationData } from '$lib/stores/project-navigation.store';

	let { data } = $props();

	// AgentChatModal state for creating new projects
	let showChatModal = $state(false);
	let AgentChatModal = $state<any>(null);

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
			toastService.success(
				'Project created! Head to Projects to explore it.',
				TOAST_DURATION.LONG
			);
			invalidateAll();
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
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedGraphNode = $state<GraphNode | null>(null);
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

	let projectsStreamVersion = 0;
	let projectsLoading = $state(
		isPromiseLike<OntologyProjectSummary[]>(data.projects) ? true : false
	);
	let projectsError = $state<string | null>(null);
	let projectSummaries = $state<OntologyProjectSummary[]>(
		Array.isArray(data.projects) ? (data.projects as OntologyProjectSummary[]) : []
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
	const availableStates = $derived(
		Array.from(
			new Set(
				(projects ?? [])
					.map((project) => project.state_key)
					.filter((state): state is string => Boolean(state))
			)
		).sort()
	);
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

	let searchQuery = $state('');
	let selectedStates = $state<string[]>([]);
	let selectedContexts = $state<string[]>([]);
	let selectedScales = $state<string[]>([]);
	let selectedStages = $state<string[]>([]);
	let filtersExpanded = $state(false);

	const hasFilters = $derived(
		Boolean(
			searchQuery.trim() ||
				selectedStates.length ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length
		)
	);

	// Count of active filters (excluding search)
	const activeFilterCount = $derived(
		selectedStates.length +
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

	const filteredProjects = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		return (projects ?? []).filter((project) => {
			if (query) {
				const matchesQuery =
					project.name.toLowerCase().includes(query) ||
					(project.description ?? '').toLowerCase().includes(query);
				if (!matchesQuery) return false;
			}

			if (selectedStates.length && !selectedStates.includes(project.state_key)) {
				return false;
			}

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

	const ownedFilteredProjects = $derived.by(() =>
		filteredProjects.filter((project) => !project.is_shared)
	);
	const sharedFilteredProjects = $derived.by(() =>
		filteredProjects.filter((project) => project.is_shared)
	);
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

	function sortProjectsByUpdatedAt(
		projectList: OntologyProjectSummary[]
	): OntologyProjectSummary[] {
		return [...projectList].sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));
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

	const ownedFilteredProjectsSorted = $derived(sortProjectsByUpdatedAt(ownedFilteredProjects));
	const sharedFilteredProjectsSorted = $derived(sortProjectsByUpdatedAt(sharedFilteredProjects));
	const ownedFilteredProjectsByRecency = $derived(
		groupProjectsByRecency(ownedFilteredProjectsSorted)
	);
	const sharedFilteredProjectsByRecency = $derived(
		groupProjectsByRecency(sharedFilteredProjectsSorted)
	);

	const stats = $derived.by(() => {
		const list = filteredProjects;
		const taskTotal = list.reduce((acc, project) => acc + (project.task_count ?? 0), 0);
		const goalTotal = list.reduce((acc, project) => acc + (project.goal_count ?? 0), 0);
		const planTotal = list.reduce((acc, project) => acc + (project.plan_count ?? 0), 0);
		const documentTotal = list.reduce((acc, project) => acc + (project.document_count ?? 0), 0);
		const inProgress = list.filter((project) =>
			['active', 'execution', 'in_progress'].includes(project.state_key)
		).length;

		return {
			totalProjects: list.length,
			totalTasks: taskTotal,
			totalGoals: goalTotal,
			totalPlans: planTotal,
			totalDocuments: documentTotal,
			activeProjects: inProgress
		};
	});

	function toggleValue(list: string[], value: string): string[] {
		return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
	}

	function clearFilters() {
		searchQuery = '';
		selectedStates = [];
		selectedContexts = [];
		selectedScales = [];
		selectedStages = [];
	}

	function formatUpdatedAt(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Updated recently';

		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatEntityCounts(project: OntologyProjectSummary): string {
		return `Tasks ${project.task_count} · Goals ${project.goal_count} · Plans ${project.plan_count} · Docs ${project.document_count}`;
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
		graphStore.load({ viewMode: graphViewMode, force: true });
	}

	$effect(() => {
		const viewParam = $page.url.searchParams.get('view') === 'graph' ? 'graph' : 'overview';
		if (viewParam !== activeTab) {
			activeTab = viewParam;
		}
	});

	$effect(() => {
		if (isAdmin && activeTab === 'graph') {
			ensureGraphComponents();
		}
	});

	$effect(() => {
		const state = $graphStore;
		if (activeTab === 'graph' && state.status === 'idle') {
			graphStore.load({ viewMode: graphViewMode });
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

<div
	class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 space-y-2 sm:space-y-4"
>
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

				<!-- Stats Grid - Semantic textures per brand guidelines with weight -->
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
					<!-- Projects count - Frame texture (canonical/structure), paper weight (standard) -->
					<div class="wt-paper p-3 sm:p-4 tx tx-frame tx-weak">
						<p class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground">
							PROJECTS
						</p>
						{#if showSkeletons}
							<div
								class="h-6 sm:h-8 w-10 sm:w-14 bg-muted/60 rounded mt-1 animate-pulse"
							></div>
						{:else}
							<p class="text-xl sm:text-2xl font-semibold text-foreground mt-1">
								{stats.totalProjects}
							</p>
						{/if}
					</div>
					<!-- Tasks count - Grain texture (execution/progress), paper weight -->
					<div class="wt-paper p-3 sm:p-4 tx tx-grain tx-weak">
						<p class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground">
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
					<!-- Documents count - Thread texture (connections/relationships), paper weight -->
					<div class="wt-paper p-3 sm:p-4 tx tx-thread tx-weak">
						<p class="micro-label text-[9px] sm:text-[0.65rem] text-muted-foreground">
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
					<!-- Active count - Pulse texture (urgency/momentum), paper weight with accent styling -->
					<div
						class="wt-paper p-3 sm:p-4 tx tx-pulse tx-weak border-accent/30 bg-accent/5"
					>
						<p class="micro-label text-[9px] sm:text-[0.65rem] text-accent">ACTIVE</p>
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

							{#if isAdmin && hasFilterOptions}
								<FilterGroup
									label="State"
									options={availableStates}
									selected={selectedStates}
									onToggle={(state) =>
										(selectedStates = toggleValue(selectedStates, state))}
								/>

								<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
									<FilterGroup
										label="Context"
										options={availableContexts}
										selected={selectedContexts}
										onToggle={(ctx) =>
											(selectedContexts = toggleValue(selectedContexts, ctx))}
									/>
									<FilterGroup
										label="Scale"
										options={availableScales}
										selected={selectedScales}
										onToggle={(scale) =>
											(selectedScales = toggleValue(selectedScales, scale))}
									/>
									<FilterGroup
										label="Stage"
										options={availableStages}
										selected={selectedStages}
										onToggle={(stage) =>
											(selectedStages = toggleValue(selectedStages, stage))}
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
				{#if ownedFilteredProjects.length > 0}
					<div class="space-y-2">
						<!-- Section Header - Inkprint micro-label pattern -->
						<div class="flex items-baseline gap-2">
							<p class="micro-label text-accent">MY PROJECTS</p>
							<span class="text-xs font-semibold text-muted-foreground">
								{ownedFilteredProjects.length}
							</span>
						</div>
						<div class="space-y-2">
							{#each ownedFilteredProjectsByRecency.recent as project (project.id)}
								<a
									href="/projects/{project.id}"
									onclick={() => handleProjectClick(project)}
									class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
								>
									<div class="flex items-start justify-between gap-3">
										<h4
											class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
											style="view-transition-name: project-title-{project.id}"
										>
											{project.name}
										</h4>
										<div class="shrink-0 flex items-center gap-1.5">
											<time
												datetime={project.updated_at}
												class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
											>
												{formatUpdatedAt(project.updated_at)}
											</time>
											<span class="project-dossier-arrow" aria-hidden="true">
												<ArrowRight
													class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
												/>
											</span>
										</div>
									</div>

									<p
										class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
									>
										{project.description?.trim() || 'No description provided.'}
									</p>

									<p
										class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
									>
										{formatEntityCounts(project)}
									</p>
								</a>
							{/each}

							{#if ownedFilteredProjectsByRecency.olderThan7Days.length > 0}
								<div class="project-recency-separator">
									Not touched in last 7 days
								</div>
								{#each ownedFilteredProjectsByRecency.olderThan7Days as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<h4
												class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
												style="view-transition-name: project-title-{project.id}"
											>
												{project.name}
											</h4>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<span
													class="project-dossier-arrow"
													aria-hidden="true"
												>
													<ArrowRight
														class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													/>
												</span>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}
							{/if}

							{#if ownedFilteredProjectsByRecency.olderThan30Days.length > 0}
								<div class="project-recency-separator">
									Not touched in last 30 days
								</div>
								{#each ownedFilteredProjectsByRecency.olderThan30Days as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<h4
												class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
												style="view-transition-name: project-title-{project.id}"
											>
												{project.name}
											</h4>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<span
													class="project-dossier-arrow"
													aria-hidden="true"
												>
													<ArrowRight
														class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													/>
												</span>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}
							{/if}
						</div>
					</div>
				{/if}

				{#if sharedFilteredProjects.length > 0}
					<div class="space-y-2">
						<!-- Section Header - Inkprint micro-label pattern with Thread texture indicator -->
						<div class="flex items-baseline gap-2">
							<p class="micro-label text-muted-foreground">SHARED WITH ME</p>
							<span class="text-xs font-semibold text-muted-foreground">
								{sharedFilteredProjects.length}
							</span>
						</div>
						<div class="space-y-2">
							{#each sharedFilteredProjectsByRecency.recent as project (project.id)}
								<a
									href="/projects/{project.id}"
									onclick={() => handleProjectClick(project)}
									class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex items-center gap-2">
											<h4
												class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
												style="view-transition-name: project-title-{project.id}"
											>
												{project.name}
											</h4>
											<span
												class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
											>
												Shared{project.access_role
													? `: ${project.access_role}`
													: ''}
											</span>
										</div>
										<div class="shrink-0 flex items-center gap-1.5">
											<time
												datetime={project.updated_at}
												class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
											>
												{formatUpdatedAt(project.updated_at)}
											</time>
											<span class="project-dossier-arrow" aria-hidden="true">
												<ArrowRight
													class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
												/>
											</span>
										</div>
									</div>

									<p
										class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
									>
										{project.description?.trim() || 'No description provided.'}
									</p>

									<p
										class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
									>
										{formatEntityCounts(project)}
									</p>
								</a>
							{/each}

							{#if sharedFilteredProjectsByRecency.olderThan7Days.length > 0}
								<div class="project-recency-separator">
									Not touched in last 7 days
								</div>
								{#each sharedFilteredProjectsByRecency.olderThan7Days as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex items-center gap-2">
												<h4
													class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
													style="view-transition-name: project-title-{project.id}"
												>
													{project.name}
												</h4>
												<span
													class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
												>
													Shared{project.access_role
														? `: ${project.access_role}`
														: ''}
												</span>
											</div>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<span
													class="project-dossier-arrow"
													aria-hidden="true"
												>
													<ArrowRight
														class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													/>
												</span>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}
							{/if}

							{#if sharedFilteredProjectsByRecency.olderThan30Days.length > 0}
								<div class="project-recency-separator">
									Not touched in last 30 days
								</div>
								{#each sharedFilteredProjectsByRecency.olderThan30Days as project (project.id)}
									<a
										href="/projects/{project.id}"
										onclick={() => handleProjectClick(project)}
										class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-thread tx-weak"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex items-center gap-2">
												<h4
													class="truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
													style="view-transition-name: project-title-{project.id}"
												>
													{project.name}
												</h4>
												<span
													class="hidden sm:inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent"
												>
													Shared{project.access_role
														? `: ${project.access_role}`
														: ''}
												</span>
											</div>
											<div class="shrink-0 flex items-center gap-1.5">
												<time
													datetime={project.updated_at}
													class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
												>
													{formatUpdatedAt(project.updated_at)}
												</time>
												<span
													class="project-dossier-arrow"
													aria-hidden="true"
												>
													<ArrowRight
														class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent"
													/>
												</span>
											</div>
										</div>

										<p
											class="mt-1 text-xs sm:text-sm text-muted-foreground truncate"
										>
											{project.description?.trim() ||
												'No description provided.'}
										</p>

										<p
											class="mt-1 text-[11px] sm:text-xs font-medium text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis"
										>
											{formatEntityCounts(project)}
										</p>
									</a>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
		<!-- Graph view - Admin Only -->
	{:else if isAdmin}
		<section class="space-y-4">
			<div class="wt-paper overflow-hidden touch-none tx tx-frame tx-weak">
				<div class="relative h-[60vh] sm:h-[70vh] lg:h-[calc(100vh-18rem)]">
					{#if graphComponentError}
						<div
							class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center tx tx-static tx-weak"
						>
							<h3 class="text-base font-semibold text-foreground">
								Unable to load graph view
							</h3>
							<p class="text-sm text-muted-foreground">{graphComponentError}</p>
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
						<svelte:component
							this={OntologyGraphComponent}
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
								Start by creating a project or template to visualize your ontology
								relationships.
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
						<svelte:component
							this={GraphControlsComponent}
							bind:viewMode={graphViewMode}
							{graphInstance}
							stats={$graphStore.stats ?? emptyGraphStats}
						/>
					{:else}
						<div class="p-4 text-sm text-muted-foreground">
							Loading graph controls...
						</div>
					{/if}
				</section>

				<section class="wt-paper overflow-hidden tx tx-frame tx-weak">
					{#if selectedGraphNode && $graphStore.status === 'ready' && NodeDetailsPanelComponent}
						<svelte:component
							this={NodeDetailsPanelComponent}
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

<!-- Agent Chat Modal for Project Creation -->
{#if AgentChatModal && showChatModal}
	<AgentChatModal isOpen={showChatModal} contextType="project_create" onClose={handleChatClose} />
{/if}

<style>
	.project-dossier-row {
		transition: box-shadow 180ms ease;
	}

	.project-dossier-row:hover,
	.project-dossier-row:focus-visible {
		box-shadow: inset 0 -1px 0 hsl(var(--accent) / 0.6);
	}

	.project-dossier-arrow {
		opacity: 0;
		transform: translateX(-2px);
		transition:
			opacity 180ms ease,
			transform 180ms ease;
	}

	.project-dossier-row:hover .project-dossier-arrow,
	.project-dossier-row:focus-visible .project-dossier-arrow {
		opacity: 1;
		transform: translateX(0);
	}

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
