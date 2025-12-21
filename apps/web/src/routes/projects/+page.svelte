<!-- apps/web/src/routes/projects/+page.svelte -->
<!--
  PERFORMANCE OPTIMIZATIONS (Dec 2024):
  - projectCount available immediately for skeleton rendering
  - Projects stream in background and hydrate skeletons
  - Zero layout shift - exact number of cards rendered from start
-->
<script lang="ts">
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import LoadingSkeleton from '$lib/components/ui/LoadingSkeleton.svelte';
	import ProjectListSkeleton from '$lib/components/projects/ProjectListSkeleton.svelte';
	import GraphControls from '$lib/components/ontology/graph/GraphControls.svelte';
	import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
	import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';
	import type {
		ViewMode,
		GraphNode,
		OntologyGraphInstance,
		GraphStats
	} from '$lib/components/ontology/graph/lib/graph.types';
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import { ontologyGraphStore } from '$lib/stores/ontology-graph.store';
	import { getProjectStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import { ListChecks, Layers, Target, Calendar, FileText, Loader2 } from 'lucide-svelte';
	import ProjectCardNextStep from '$lib/components/project/ProjectCardNextStep.svelte';
	import {
		setNavigationData,
		type ProjectNavigationData
	} from '$lib/stores/project-navigation.store';

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

	function handleChatClose() {
		showChatModal = false;
		// Refresh the page to show new project if created
		// Using invalidateAll would be better but for simplicity we reload
		window.location.reload();
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
			output_count: project.output_count,
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

	let activeTab = $state<'overview' | 'graph'>(
		get(page).url.searchParams.get('view') === 'graph' ? 'graph' : 'overview'
	);
	let graphViewMode = $state<ViewMode>('projects'); // Default to Projects & Entities
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedGraphNode = $state<GraphNode | null>(null);
	const emptyGraphStats: GraphStats = {
		totalProjects: 0,
		activeProjects: 0,
		totalEdges: 0,
		totalTasks: 0,
		totalOutputs: 0,
		totalDocuments: 0,
		totalPlans: 0,
		totalGoals: 0,
		totalMilestones: 0
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

	const hasFilters = $derived(
		Boolean(
			searchQuery.trim() ||
				selectedStates.length ||
				selectedContexts.length ||
				selectedScales.length ||
				selectedStages.length
		)
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

	const stats = $derived.by(() => {
		const list = filteredProjects;
		const taskTotal = list.reduce((acc, project) => acc + (project.task_count ?? 0), 0);
		const outputTotal = list.reduce((acc, project) => acc + (project.output_count ?? 0), 0);
		const goalTotal = list.reduce((acc, project) => acc + (project.goal_count ?? 0), 0);
		const planTotal = list.reduce((acc, project) => acc + (project.plan_count ?? 0), 0);
		const documentTotal = list.reduce((acc, project) => acc + (project.document_count ?? 0), 0);
		const inProgress = list.filter((project) =>
			['active', 'execution', 'in_progress'].includes(project.state_key)
		).length;

		return {
			totalProjects: list.length,
			totalTasks: taskTotal,
			totalOutputs: outputTotal,
			totalGoals: goalTotal,
			totalPlans: planTotal,
			totalDocuments: documentTotal,
			activeProjects: inProgress
		};
	});

	const graphLastUpdated = $derived.by(() => {
		const iso = $graphStore.metadata?.generatedAt;
		return iso ? new Date(iso).toLocaleString() : null;
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

<div class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
	<!-- Mobile Navigation - Only visible on mobile, Admin Only -->
	{#if isAdmin}
		<nav
			class="lg:hidden flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-ink tx tx-strip tx-weak"
			aria-label="Projects navigation"
		>
			<a
				href="/projects"
				class="inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable shadow-ink"
				aria-current="page"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
					/>
				</svg>
				<span>Projects</span>
			</a>
			<a
				href="/projects/create"
				class="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				<span>Create</span>
			</a>
			<a
				href="/"
				class="ml-auto inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pressable"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/>
				</svg>
				<span>Back</span>
			</a>
		</nav>
	{/if}

	<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between !mt-0">
		<div class="space-y-1 flex-1">
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-bold text-foreground sm:text-3xl">Projects</h1>
				{#if projectsLoading}
					<Loader2 class="h-5 w-5 text-muted-foreground animate-spin" />
				{/if}
			</div>
			<p class="text-sm text-muted-foreground sm:text-base">
				Manage and organize your active projects and workflows.
			</p>
		</div>

		<!-- Graph/Overview toggle - Admin Only -->
		{#if isAdmin}
			<nav
				class="inline-flex rounded-lg border border-border bg-card p-1 text-sm font-bold overflow-x-auto scrollbar-hide shadow-ink self-baseline"
				aria-label="Project view mode"
			>
				<button
					type="button"
					class={`relative rounded px-4 py-2 transition pressable ${
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
					class={`relative rounded px-4 py-2 transition pressable ${
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
							<div
								class="rounded-lg border border-border bg-card p-4 shadow-ink animate-pulse"
							>
								<div class="h-5 w-1/3 rounded bg-muted"></div>
								<div class="mt-4 h-4 w-3/4 rounded bg-muted/80"></div>
								<div class="mt-2 h-3 w-2/3 rounded bg-muted/80"></div>
							</div>
						{/each}
					</div>
				</div>
			{:else if projectsError}
				<div
					class="rounded-lg border border-border bg-card p-6 text-center shadow-ink tx tx-static tx-weak"
				>
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
				<Card variant="elevated" padding="none">
					<CardBody
						padding="md"
						class="space-y-dense-4 lg:flex lg:items-start lg:justify-between lg:gap-dense-6 lg:space-y-0"
					>
						<div
							class="flex flex-col gap-dense-3 sm:flex-row sm:items-center sm:gap-dense-4 lg:flex-1"
						>
							<div class="relative flex-1">
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

							{#if hasFilters}
								<Button
									variant="ghost"
									size="sm"
									class="text-accent hover:text-accent/80 font-bold"
									onclick={clearFilters}
								>
									Clear filters
								</Button>
							{/if}
						</div>

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
					</CardBody>
				</Card>

				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-bloom tx-weak ink-frame"
					>
						<p class="micro-label">Projects</p>
						{#if showSkeletons}
							<div class="h-8 w-12 bg-muted rounded mt-1 animate-pulse"></div>
						{:else}
							<p class="text-2xl font-bold text-foreground mt-1">
								{stats.totalProjects}
							</p>
						{/if}
					</div>
					<div
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-grain tx-weak ink-frame"
					>
						<p class="micro-label">Tasks</p>
						{#if showSkeletons}
							<div class="h-8 w-12 bg-muted rounded mt-1 animate-pulse"></div>
						{:else}
							<p class="text-2xl font-bold text-foreground mt-1">
								{stats.totalTasks}
							</p>
						{/if}
					</div>
					<div
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-thread tx-weak ink-frame"
					>
						<p class="micro-label">Outputs</p>
						{#if showSkeletons}
							<div class="h-8 w-12 bg-muted rounded mt-1 animate-pulse"></div>
						{:else}
							<p class="text-2xl font-bold text-foreground mt-1">
								{stats.totalOutputs}
							</p>
						{/if}
					</div>
					<div
						class="rounded-lg border border-border bg-card p-4 shadow-ink tx tx-pulse tx-weak ink-frame"
					>
						<p class="micro-label">Active</p>
						{#if showSkeletons}
							<div class="h-8 w-12 bg-muted rounded mt-1 animate-pulse"></div>
						{:else}
							<p class="text-2xl font-bold text-accent mt-1">
								{stats.activeProjects}
							</p>
						{/if}
					</div>
				</div>

				<!-- Ontology filters - Admin Only -->
				{#if isAdmin}
					<div class="space-y-4">
						{#if availableStates.length}
							<div class="flex flex-col gap-2">
								<p class="micro-label">State</p>
								<div class="flex flex-wrap gap-2">
									{#each availableStates as state (state)}
										<button
											type="button"
											class={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition pressable ${
												selectedStates.includes(state)
													? 'border-accent bg-accent text-accent-foreground shadow-ink'
													: 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'
											}`}
											onclick={() =>
												(selectedStates = toggleValue(
													selectedStates,
													state
												))}
										>
											{state}
										</button>
									{/each}
								</div>
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
							{#if availableContexts.length}
								<div class="flex flex-col gap-2">
									<p class="micro-label">Context</p>
									<div class="flex flex-wrap gap-2">
										{#each availableContexts as context (context)}
											<button
												type="button"
												class={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition pressable ${
													selectedContexts.includes(context)
														? 'border-accent bg-accent text-accent-foreground shadow-ink'
														: 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'
												}`}
												onclick={() =>
													(selectedContexts = toggleValue(
														selectedContexts,
														context
													))}
											>
												{context}
											</button>
										{/each}
									</div>
								</div>
							{/if}

							{#if availableScales.length}
								<div class="flex flex-col gap-2">
									<p class="micro-label">Scale</p>
									<div class="flex flex-wrap gap-2">
										{#each availableScales as scale (scale)}
											<button
												type="button"
												class={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition pressable ${
													selectedScales.includes(scale)
														? 'border-accent bg-accent text-accent-foreground shadow-ink'
														: 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'
												}`}
												onclick={() =>
													(selectedScales = toggleValue(
														selectedScales,
														scale
													))}
											>
												{scale}
											</button>
										{/each}
									</div>
								</div>
							{/if}

							{#if availableStages.length}
								<div class="flex flex-col gap-2">
									<p class="micro-label">Stage</p>
									<div class="flex flex-wrap gap-2">
										{#each availableStages as stage (stage)}
											<button
												type="button"
												class={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition pressable ${
													selectedStages.includes(stage)
														? 'border-accent bg-accent text-accent-foreground shadow-ink'
														: 'border-border text-muted-foreground hover:border-accent hover:bg-muted/50 hover:text-foreground'
												}`}
												onclick={() =>
													(selectedStages = toggleValue(
														selectedStages,
														stage
													))}
											>
												{stage}
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		</section>

		<!-- SKELETON LOADING: Show exact number of skeleton cards while loading -->
		{#if showSkeletons}
			<ProjectListSkeleton count={projectCount} />
		{:else if filteredProjects.length === 0 && !projectsLoading}
			<div
				class="rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center shadow-ink tx tx-thread tx-weak sm:px-6 sm:py-16"
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
						? 'Create your first ontology project using typed templates and FSM workflows.'
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
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredProjects as project (project.id)}
					<a
						href="/projects/{project.id}"
						onclick={() => handleProjectClick(project)}
						class="group relative flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-ink transition-all duration-200 hover:border-accent hover:shadow-ink-strong pressable"
					>
						<div class="mb-4 flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3
									class="truncate text-lg font-bold text-foreground transition-colors group-hover:text-accent"
									style="view-transition-name: project-title-{project.id}"
								>
									{project.name}
								</h3>
							</div>
							<span
								class="flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold capitalize {getProjectStateBadgeClass(
									project.state_key
								)}"
							>
								{project.state_key}
							</span>
						</div>

						{#if project.description}
							<p class="mb-4 line-clamp-2 text-sm text-muted-foreground">
								{project.description.length > 120
									? project.description.slice(0, 120) + '…'
									: project.description}
							</p>
						{/if}

						<!-- Next Step - Shows short version, expandable to long -->
						{#if project.next_step_short}
							<ProjectCardNextStep
								nextStepShort={project.next_step_short}
								nextStepLong={project.next_step_long}
								class="mb-4"
							/>
						{/if}

						<div
							class="mt-auto flex flex-col gap-2 border-t border-border pt-3 text-sm text-muted-foreground"
						>
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
								<span
									class="flex items-center gap-1"
									aria-label="Task count"
									title="Tasks"
								>
									<ListChecks class="h-3.5 w-3.5" />
									<span class="font-bold text-xs">{project.task_count}</span>
								</span>
								<span
									class="flex items-center gap-1"
									aria-label="Output count"
									title="Outputs"
								>
									<Layers class="h-3.5 w-3.5" />
									<span class="font-bold text-xs">{project.output_count}</span>
								</span>
								<span
									class="flex items-center gap-1"
									aria-label="Goal count"
									title="Goals"
								>
									<Target class="h-3.5 w-3.5" />
									<span class="font-bold text-xs">{project.goal_count}</span>
								</span>
								<span
									class="flex items-center gap-1"
									aria-label="Plan count"
									title="Plans"
								>
									<Calendar class="h-3.5 w-3.5" />
									<span class="font-bold text-xs">{project.plan_count}</span>
								</span>
								<span
									class="flex items-center gap-1"
									aria-label="Document count"
									title="Documents"
								>
									<FileText class="h-3.5 w-3.5" />
									<span class="font-bold text-xs">{project.document_count}</span>
								</span>
							</div>
							<span class="text-xs text-muted-foreground/70">
								Updated {new Date(project.updated_at).toLocaleDateString()}
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
		<!-- Graph view - Admin Only -->
	{:else if isAdmin}
		<section class="space-y-4">
			<div
				class="rounded-lg border border-border bg-card shadow-ink overflow-hidden touch-none"
			>
				<div class="relative h-[60vh] sm:h-[70vh] lg:h-[calc(100vh-18rem)]">
					{#if $graphStore.status === 'loading'}
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
						<OntologyGraph
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
				<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
					<GraphControls
						bind:viewMode={graphViewMode}
						{graphInstance}
						stats={$graphStore.stats ?? emptyGraphStats}
					/>
				</section>

				<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
					{#if selectedGraphNode && $graphStore.status === 'ready'}
						<NodeDetailsPanel
							node={selectedGraphNode}
							onClose={() => (selectedGraphNode = null)}
						></NodeDetailsPanel>
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
