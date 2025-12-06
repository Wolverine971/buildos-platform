<!-- apps/web/src/routes/ontology/+page.svelte -->
<script lang="ts">
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import LoadingSkeleton from '$lib/components/ui/LoadingSkeleton.svelte';
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

	let { data } = $props();

	const graphStore = ontologyGraphStore;

	let activeTab = $state<'overview' | 'graph'>(
		get(page).url.searchParams.get('view') === 'graph' ? 'graph' : 'overview'
	);
	let graphViewMode = $state<ViewMode>('full');
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedGraphNode = $state<GraphNode | null>(null);
	const emptyGraphStats: GraphStats = {
		totalTemplates: 0,
		totalProjects: 0,
		activeProjects: 0,
		totalEdges: 0,
		totalTasks: 0,
		totalOutputs: 0,
		totalDocuments: 0
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
		const inProgress = list.filter((project) =>
			['active', 'execution', 'in_progress'].includes(project.state_key)
		).length;

		return {
			totalProjects: list.length,
			totalTasks: taskTotal,
			totalOutputs: outputTotal,
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

<div class="space-y-4 sm:space-y-6">
	<!-- Mobile Navigation - Only visible on mobile -->
	<nav
		class="lg:hidden flex flex-wrap items-center gap-2 rounded border-2 border-slate-700/30 bg-surface-elevated p-2 shadow-subtle dark:border-slate-500/30 dark:bg-surface-panel"
		aria-label="Ontology navigation"
	>
		<a
			href="/ontology"
			class="inline-flex items-center gap-1.5 rounded border-2 border-accent-orange bg-accent-orange/10 px-3 py-1.5 text-xs font-bold text-accent-orange transition hover:bg-accent-orange/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:bg-accent-orange/20 dark:hover:bg-accent-orange/30 shadow-subtle"
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
			href="/ontology/create"
			class="inline-flex items-center gap-1.5 rounded border-2 border-slate-700/30 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-slate-800/50"
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
			href="/ontology/templates"
			class="inline-flex items-center gap-1.5 rounded border-2 border-slate-700/30 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-slate-800/50"
		>
			<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
				/>
			</svg>
			<span>Templates</span>
		</a>
		<a
			href="/"
			class="ml-auto inline-flex items-center gap-1.5 rounded border-2 border-slate-700/30 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-slate-800/50"
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

	<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between !mt-0">
		<div class="space-y-1 flex-1">
			<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
				Projects
			</h1>
			<p class="text-sm text-slate-600 dark:text-slate-400 sm:text-base">
				Manage and organize your active projects and workflows.
			</p>
		</div>

		<nav
			class="inline-flex rounded border-2 border-slate-700/30 bg-surface-elevated p-1 text-sm font-bold dark:bg-surface-panel dark:border-slate-500/30 overflow-x-auto scrollbar-hide shadow-subtle self-baseline
"
			aria-label="Project view mode"
		>
			<button
				type="button"
				class={`relative rounded px-4 py-2 transition ${
					activeTab === 'overview'
						? 'bg-accent-orange text-white border-2 border-slate-700 shadow-pressable dark:bg-accent-orange dark:text-white'
						: 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-700'
				}`}
				aria-pressed={activeTab === 'overview'}
				onclick={() => setActiveTab('overview')}
			>
				Overview
			</button>
			<button
				type="button"
				class={`relative rounded px-4 py-2 transition ${
					activeTab === 'graph'
						? 'bg-accent-orange text-white border-2 border-slate-700 shadow-pressable dark:bg-accent-orange dark:text-white'
						: 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-700'
				}`}
				aria-pressed={activeTab === 'graph'}
				onclick={() => setActiveTab('graph')}
			>
				Graph
			</button>
		</nav>
	</header>

	{#if activeTab === 'graph'}
		<div
			class="flex flex-wrap items-center justify-end gap-3 rounded border-2 border-slate-700/30 bg-surface-elevated p-3 shadow-subtle dark:border-slate-500/30 dark:bg-surface-panel text-xs text-slate-600 dark:text-slate-400"
		>
			{#if $graphStore.status === 'ready' && graphLastUpdated}
				<span class="hidden sm:inline font-semibold">Last synced {graphLastUpdated}</span>
			{/if}
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded border-2 border-slate-700/30 px-3 py-1.5 font-bold text-slate-700 transition hover:bg-slate-100 hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-orange dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-slate-700 shadow-subtle"
				onclick={refreshGraph}
				aria-label="Refresh graph"
			>
				<svg
					class="h-3.5 w-3.5"
					viewBox="0 0 20 20"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M3.75 10a6.25 6.25 0 0 1 10.18-4.93l1.07.88V3.75a.75.75 0 1 1 1.5 0v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h2.74l-.67-.54A4.75 4.75 0 1 0 15.75 11a.75.75 0 0 1 1.5 0 6.25 6.25 0 1 1-13.5 0Z"
						fill="currentColor"
					/>
				</svg>
				<span>Refresh</span>
			</button>
		</div>
	{/if}

	{#if activeTab === 'overview'}
		<section class="space-y-dense-4">
			{#if projectsLoading}
				<div class="space-y-dense-6">
					<div class="grid gap-dense-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each Array.from({ length: 3 }) as _}
							<div
								class="rounded border-2 border-slate-700/30 bg-surface-elevated p-4 shadow-sm animate-pulse dark:border-slate-500/30 dark:bg-surface-panel"
							>
								<div class="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-800"></div>
								<div
									class="mt-4 h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800/80"
								></div>
								<div
									class="mt-2 h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800/80"
								></div>
							</div>
						{/each}
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-elevated p-dense-6 shadow-sm animate-pulse dark:border-slate-500/30 dark:bg-surface-panel"
					>
						<div class="h-5 w-1/4 rounded bg-slate-200 dark:bg-slate-800"></div>
						<div class="mt-4 grid gap-dense-3 md:grid-cols-2 lg:grid-cols-3">
							{#each Array.from({ length: 6 }) as _}
								<div class="h-24 rounded bg-slate-100 dark:bg-slate-800/80"></div>
							{/each}
						</div>
					</div>
				</div>
			{:else if projectsError}
				<div
					class="rounded border-2 border-slate-700/30 bg-surface-elevated p-dense-6 text-center shadow-sm dark:border-slate-500/30 dark:bg-surface-panel"
				>
					<h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
						Unable to load ontology projects
					</h2>
					<p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
						{projectsError}
					</p>
					<div class="mt-4 flex justify-center">
						<Button
							variant="primary"
							size="sm"
							onclick={() => goto('/ontology', { replaceState: true })}
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
									class="w-full rounded border-2 border-slate-700/30 bg-surface-elevated py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 transition focus:border-slate-700 focus:outline-none focus:ring-2 focus:ring-accent-orange dark:border-slate-500/30 dark:bg-slate-700/50 dark:text-slate-100 dark:placeholder:text-slate-500 dither-soft"
									placeholder="Search projects by name or description..."
									bind:value={searchQuery}
								/>
								<svg
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400"
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
									class="text-accent-blue hover:text-accent-blue/80 dark:text-accent-blue dark:hover:text-accent-blue/80 font-bold"
									onclick={clearFilters}
								>
									Clear filters
								</Button>
							{/if}
						</div>

						<Button
							variant="primary"
							size="sm"
							onclick={() => goto('/ontology/create')}
						>
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
						class="rounded border-2 border-slate-700/30 bg-surface-panel p-4 shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Projects
						</p>
						<p class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
							{stats.totalProjects}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel p-4 shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Tasks
						</p>
						<p class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
							{stats.totalTasks}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel p-4 shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Outputs
						</p>
						<p class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
							{stats.totalOutputs}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel p-4 shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Active
						</p>
						<p class="text-2xl font-bold text-accent-olive dark:text-accent-olive mt-1">
							{stats.activeProjects}
						</p>
					</div>
				</div>

				<div class="space-y-dense-4">
					{#if availableStates.length}
						<div class="flex flex-col gap-2">
							<p
								class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								State
							</p>
							<div class="flex flex-wrap gap-2">
								{#each availableStates as state (state)}
									<button
										type="button"
										class={`inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1.5 text-xs font-bold transition ${
											selectedStates.includes(state)
												? 'border-slate-700 bg-accent-blue text-white shadow-pressable dark:bg-accent-blue dark:text-white active:translate-y-[2px] active:shadow-none'
												: 'border-slate-700/30 text-slate-700 hover:border-slate-700 hover:bg-slate-100 dark:border-slate-500/30 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800'
										}`}
										onclick={() =>
											(selectedStates = toggleValue(selectedStates, state))}
									>
										{state}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="grid grid-cols-1 gap-dense-4 md:grid-cols-3">
						{#if availableContexts.length}
							<div class="flex flex-col gap-2">
								<p
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
								>
									Context
								</p>
								<div class="flex flex-wrap gap-2">
									{#each availableContexts as context (context)}
										<button
											type="button"
											class={`inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1.5 text-xs font-bold transition ${
												selectedContexts.includes(context)
													? 'border-slate-700 bg-accent-orange text-white shadow-pressable dark:bg-accent-orange dark:text-white active:translate-y-[2px] active:shadow-none'
													: 'border-slate-700/30 text-slate-700 hover:border-slate-700 hover:bg-slate-100 dark:border-slate-500/30 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800'
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
								<p
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
								>
									Scale
								</p>
								<div class="flex flex-wrap gap-2">
									{#each availableScales as scale (scale)}
										<button
											type="button"
											class={`inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1.5 text-xs font-bold transition ${
												selectedScales.includes(scale)
													? 'border-slate-700 bg-accent-blue text-white shadow-pressable dark:bg-accent-blue dark:text-white active:translate-y-[2px] active:shadow-none'
													: 'border-slate-700/30 text-slate-700 hover:border-slate-700 hover:bg-slate-100 dark:border-slate-500/30 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800'
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
								<p
									class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
								>
									Stage
								</p>
								<div class="flex flex-wrap gap-2">
									{#each availableStages as stage (stage)}
										<button
											type="button"
											class={`inline-flex items-center gap-1.5 rounded border-2 px-2.5 py-1.5 text-xs font-bold transition ${
												selectedStages.includes(stage)
													? 'border-slate-700 bg-accent-olive text-white shadow-pressable dark:bg-accent-olive dark:text-white active:translate-y-[2px] active:shadow-none'
													: 'border-slate-700/30 text-slate-700 hover:border-slate-700 hover:bg-slate-100 dark:border-slate-500/30 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800'
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
		</section>

		{#if filteredProjects.length === 0}
			<div
				class="rounded border-2 border-dashed border-slate-700/30 bg-surface-panel px-4 py-12 text-center shadow-subtle dark:border-slate-500/30 dark:bg-slate-800 sm:px-6 sm:py-16"
			>
				<div
					class="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded border-2 border-accent-blue/30 bg-accent-blue/10 text-accent-blue dark:bg-accent-blue/20 dark:text-accent-blue sm:h-14 sm:w-14"
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
				<h2 class="text-xl font-bold text-slate-900 dark:text-slate-100">
					No projects yet
				</h2>
				<p
					class="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400 sm:text-base"
				>
					{projects.length === 0
						? 'Create your first ontology project using typed templates and FSM workflows.'
						: 'No projects match the current filters. Adjust your search or clear filters to explore more.'}
				</p>
				<div class="mt-6 flex justify-center gap-3">
					{#if projects.length === 0}
						<Button
							variant="primary"
							size="sm"
							onclick={() => goto('/ontology/create')}
						>
							Create first project
						</Button>
					{:else if hasFilters}
						<Button variant="outline" size="sm" onclick={clearFilters}>
							Clear filters
						</Button>
					{/if}
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredProjects as project (project.id)}
					<a
						href="/ontology/projects/{project.id}"
						class="group relative flex h-full flex-col rounded border-2 border-slate-700/30 bg-surface-panel p-4 shadow-subtle transition-all duration-200 hover:border-accent-orange hover:shadow-pressable dark:border-slate-500/30 dark:bg-slate-800 dark:hover:border-accent-orange"
					>
						<div class="mb-4 flex items-start justify-between gap-3">
							<div class="min-w-0">
								<h3
									class="truncate text-lg font-bold text-slate-900 transition-colors group-hover:text-accent-orange dark:text-slate-100 dark:group-hover:text-accent-orange"
								>
									{project.name}
								</h3>
							</div>
							<span
								class="flex-shrink-0 rounded border px-2.5 py-1 text-xs font-bold capitalize {getProjectStateBadgeClass(
									project.state_key
								)}"
							>
								{project.state_key}
							</span>
						</div>

						{#if project.description}
							<p class="mb-4 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
								{project.description}
							</p>
						{/if}

						{#if project.facet_context || project.facet_scale || project.facet_stage}
							<div class="mb-4 flex flex-wrap gap-2">
								{#if project.facet_context}
									<span
										class="rounded border border-accent-orange/30 bg-accent-orange/10 px-2 py-0.5 text-xs font-bold text-accent-orange dark:bg-accent-orange/20"
									>
										{project.facet_context}
									</span>
								{/if}
								{#if project.facet_scale}
									<span
										class="rounded border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-xs font-bold text-accent-blue dark:bg-accent-blue/20 dark:text-accent-blue"
									>
										{project.facet_scale}
									</span>
								{/if}
								{#if project.facet_stage}
									<span
										class="rounded border border-accent-olive/30 bg-accent-olive/10 px-2 py-0.5 text-xs font-bold text-accent-olive dark:bg-accent-olive/20"
									>
										{project.facet_stage}
									</span>
								{/if}
							</div>
						{/if}

						<div
							class="mt-auto flex items-center justify-between border-t-2 border-slate-700/20 pt-3 text-sm text-slate-600 dark:border-slate-500/20 dark:text-slate-400"
						>
							<div class="flex items-center gap-3">
								<span class="flex items-center gap-1.5" aria-label="Task count">
									<svg
										class="h-4 w-4"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
										/>
									</svg>
									<span class="font-bold">{project.task_count}</span>
								</span>
								<span class="flex items-center gap-1.5" aria-label="Output count">
									<svg
										class="h-4 w-4"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										/>
									</svg>
									<span class="font-bold">{project.output_count}</span>
								</span>
							</div>
							<span class="text-xs text-slate-500 dark:text-slate-500">
								{new Date(project.updated_at).toLocaleDateString()}
							</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{:else}
		<section class="space-y-dense-4">
			{#if $graphStore.stats}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel px-3 py-3 text-left shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Templates
						</p>
						<p class="text-xl font-bold text-slate-900 dark:text-slate-100">
							{$graphStore.stats.totalTemplates}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel px-3 py-3 text-left shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Projects
						</p>
						<p class="text-xl font-bold text-slate-900 dark:text-slate-100">
							{$graphStore.stats.totalProjects}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel px-3 py-3 text-left shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Relationships
						</p>
						<p class="text-xl font-bold text-slate-900 dark:text-slate-100">
							{$graphStore.stats.totalEdges}
						</p>
					</div>
					<div
						class="rounded border-2 border-slate-700/30 bg-surface-panel px-3 py-3 text-left shadow-subtle dark:border-slate-500/30 dark:bg-slate-800"
					>
						<p
							class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Active Projects
						</p>
						<p class="text-xl font-bold text-accent-olive dark:text-accent-olive">
							{$graphStore.stats.activeProjects}
						</p>
					</div>
				</div>
			{/if}

			<div
				class="rounded border-2 border-slate-700/30 bg-surface-panel shadow-subtle dark:border-slate-500/30 dark:bg-slate-800 overflow-hidden touch-none"
			>
				<div class="relative h-[60vh] sm:h-[70vh] lg:h-[calc(100vh-18rem)]">
					{#if $graphStore.status === 'loading'}
						<LoadingSkeleton message="Preparing ontology graph..." height="100%" />
					{:else if $graphStore.status === 'error'}
						<div
							class="flex h-full flex-col items-center justify-center gap-dense-3 p-dense-6 text-center"
						>
							<h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">
								Unable to load graph
							</h3>
							<p class="text-sm text-slate-500 dark:text-slate-400">
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
							class="flex h-full flex-col items-center justify-center gap-dense-3 p-dense-6 text-center"
						>
							<h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">
								No ontology data yet
							</h3>
							<p class="text-sm text-slate-500 dark:text-slate-400">
								Start by creating a project or template to visualize your ontology
								relationships.
							</p>
							<Button
								variant="primary"
								size="sm"
								onclick={() => goto('/ontology/create')}
							>
								Create project
							</Button>
						</div>
					{/if}
				</div>
			</div>

			<div class="grid gap-4 lg:grid-cols-2">
				<section
					class="rounded border-2 border-slate-700/30 bg-surface-panel shadow-subtle dark:border-slate-500/30 dark:bg-slate-800 overflow-hidden"
				>
					<GraphControls
						bind:viewMode={graphViewMode}
						{graphInstance}
						stats={$graphStore.stats ?? emptyGraphStats}
					/>
				</section>

				<section
					class="rounded border-2 border-slate-700/30 bg-surface-panel shadow-subtle dark:border-slate-500/30 dark:bg-slate-800 overflow-hidden"
				>
					{#if selectedGraphNode && $graphStore.status === 'ready'}
						<NodeDetailsPanel
							node={selectedGraphNode}
							onClose={() => (selectedGraphNode = null)}
						></NodeDetailsPanel>
					{:else}
						<div
							class="flex h-full items-center justify-center p-dense-6 text-sm text-slate-500 dark:text-slate-400"
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
