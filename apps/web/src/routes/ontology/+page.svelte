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
					project.type_key.toLowerCase().includes(query) ||
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
	<title>Ontology Projects | BuildOS</title>
</svelte:head>

<div class="space-y-4 sm:space-y-6">
	<!-- Mobile Navigation - Only visible on mobile -->
	<nav
		class="lg:hidden flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/70"
		aria-label="Ontology navigation"
	>
		<a
			href="/ontology"
			class="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
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
			class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
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
			class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
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
			class="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
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

	<header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
				Ontology Projects
			</h1>
			<p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
				Track high-trust knowledge flows, typed templates, and FSM-driven execution.
			</p>
		</div>

		<Button variant="primary" size="sm" onclick={() => goto('/ontology/create')}>
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
			<span class="hidden sm:inline">New Project</span>
			<span class="sm:hidden">New</span>
		</Button>
	</header>

	<div
		class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900"
	>
		<nav
			class="inline-flex rounded-xl bg-gray-100 p-1 text-sm font-medium dark:bg-gray-800 overflow-x-auto scrollbar-hide"
			aria-label="Ontology view mode"
		>
			<button
				type="button"
				class={`relative rounded-lg px-4 py-2 transition ${
					activeTab === 'overview'
						? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-300'
						: 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
				}`}
				aria-pressed={activeTab === 'overview'}
				onclick={() => setActiveTab('overview')}
			>
				Overview
			</button>
			<button
				type="button"
				class={`relative rounded-lg px-4 py-2 transition ${
					activeTab === 'graph'
						? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-300'
						: 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
				}`}
				aria-pressed={activeTab === 'graph'}
				onclick={() => setActiveTab('graph')}
			>
				Graph
			</button>
		</nav>

		{#if activeTab === 'graph'}
			<div
				class="flex flex-1 items-center justify-end gap-3 text-xs text-gray-500 dark:text-gray-400"
			>
				{#if $graphStore.status === 'ready' && graphLastUpdated}
					<span class="hidden sm:inline">Last synced {graphLastUpdated}</span>
				{/if}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:border-blue-500 dark:hover:text-blue-300"
					onclick={refreshGraph}
					aria-label="Refresh ontology graph"
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
	</div>

	{#if activeTab === 'overview'}
		<section class="space-y-dense-4">
			{#if projectsLoading}
				<div class="space-y-dense-6">
					<div class="grid gap-dense-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each Array.from({ length: 3 }) as _}
							<div
								class="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm animate-pulse dark:border-slate-800/70 dark:bg-slate-900/70"
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
						class="rounded-2xl border border-slate-200/70 bg-white/80 p-dense-6 shadow-sm animate-pulse dark:border-slate-800/70 dark:bg-slate-900/70"
					>
						<div class="h-5 w-1/4 rounded bg-slate-200 dark:bg-slate-800"></div>
						<div class="mt-4 grid gap-dense-3 md:grid-cols-2 lg:grid-cols-3">
							{#each Array.from({ length: 6 }) as _}
								<div
									class="h-24 rounded-xl bg-slate-100 dark:bg-slate-800/80"
								></div>
							{/each}
						</div>
					</div>
				</div>
			{:else if projectsError}
				<div
					class="rounded-2xl border border-slate-200/80 bg-white/90 p-dense-6 text-center shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80"
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
									class="w-full rounded-xl border border-slate-200 bg-white/90 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-400"
									placeholder="Search projects by name, type, or description..."
									bind:value={searchQuery}
								/>
								<svg
									class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
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
									class="text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
									onclick={clearFilters}
								>
									Clear filters
								</Button>
							{/if}
						</div>

						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
								onclick={() => goto('/ontology/create')}
							>
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
										d="M12 4v16m8-8H4"
									/>
								</svg>
								<span>New project</span>
							</button>
							<button
								type="button"
								class="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500 dark:hover:text-indigo-200"
								onclick={() => goto('/ontology/templates')}
							>
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
										d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z"
									/>
								</svg>
								<span>Templates</span>
							</button>
						</div>
					</CardBody>
				</Card>

				<div class="grid grid-cols-2 gap-dense-3 sm:grid-cols-4 sm:gap-dense-4">
					<Card variant="elevated" padding="sm">
						<CardBody padding="sm" class="min-h-[80px] flex flex-col justify-between">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Projects
							</p>
							<p
								class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1"
							>
								{stats.totalProjects}
							</p>
						</CardBody>
					</Card>
					<Card variant="elevated" padding="sm">
						<CardBody padding="sm" class="min-h-[80px] flex flex-col justify-between">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Tasks
							</p>
							<p
								class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1"
							>
								{stats.totalTasks}
							</p>
						</CardBody>
					</Card>
					<Card variant="elevated" padding="sm">
						<CardBody padding="sm" class="min-h-[80px] flex flex-col justify-between">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Outputs
							</p>
							<p
								class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-50 mt-1"
							>
								{stats.totalOutputs}
							</p>
						</CardBody>
					</Card>
					<Card variant="elevated" padding="sm">
						<CardBody padding="sm" class="min-h-[80px] flex flex-col justify-between">
							<p
								class="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
							>
								Active
							</p>
							<p
								class="text-xl sm:text-2xl font-semibold text-emerald-600 dark:text-emerald-400 mt-1"
							>
								{stats.activeProjects}
							</p>
						</CardBody>
					</Card>
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
										class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
											selectedStates.includes(state)
												? 'border-transparent bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
												: 'border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-indigo-400 dark:hover:text-indigo-200'
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
											class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
												selectedContexts.includes(context)
													? 'border-transparent bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
													: 'border-slate-300 text-slate-600 hover:border-amber-400 hover:text-amber-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-amber-400 dark:hover:text-amber-300'
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
											class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
												selectedScales.includes(scale)
													? 'border-transparent bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm'
													: 'border-slate-300 text-slate-600 hover:border-purple-400 hover:text-purple-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-purple-400 dark:hover:text-purple-200'
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
											class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition ${
												selectedStages.includes(stage)
													? 'border-transparent bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm'
													: 'border-slate-300 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-emerald-400 dark:hover:text-emerald-200'
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
				class="rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/80 px-4 py-dense-14 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70 sm:px-6 sm:py-dense-16"
			>
				<div
					class="mx-auto mb-dense-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-300 sm:h-14 sm:w-14"
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
				<h2 class="text-xl font-semibold text-slate-900 dark:text-slate-50">
					No projects yet
				</h2>
				<p
					class="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400 sm:text-base"
				>
					{projects.length === 0
						? 'Create your first ontology project using typed templates and FSM workflows.'
						: 'No projects match the current filters. Adjust your search or clear filters to explore more.'}
				</p>
				<div class="mt-6 flex justify-center gap-dense-3">
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
			<div class="grid grid-cols-1 gap-dense-4 sm:gap-dense-6 md:grid-cols-2 xl:grid-cols-3">
				{#each filteredProjects as project (project.id)}
					<a
						href="/ontology/projects/{project.id}"
						class="group relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/70"
					>
						<div class="mb-4 flex items-start justify-between gap-dense-3">
							<div class="min-w-0 space-y-1">
								<h3
									class="truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-slate-50 dark:group-hover:text-indigo-300"
								>
									{project.name}
								</h3>
								<p
									class="truncate text-xs font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400"
								>
									{project.type_key}
								</p>
							</div>
							<span
								class="flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize {getProjectStateBadgeClass(
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
										class="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
									>
										{project.facet_context}
									</span>
								{/if}
								{#if project.facet_scale}
									<span
										class="rounded-md bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
									>
										{project.facet_scale}
									</span>
								{/if}
								{#if project.facet_stage}
									<span
										class="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
									>
										{project.facet_stage}
									</span>
								{/if}
							</div>
						{/if}

						<div
							class="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400"
						>
							<div class="flex items-center gap-dense-4">
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
									<span class="font-semibold">{project.task_count}</span>
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
									<span class="font-semibold">{project.output_count}</span>
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
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<div
						class="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
					>
						<p
							class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Templates
						</p>
						<p class="text-xl font-semibold text-slate-900 dark:text-slate-50">
							{$graphStore.stats.totalTemplates}
						</p>
					</div>
					<div
						class="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
					>
						<p
							class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Projects
						</p>
						<p class="text-xl font-semibold text-slate-900 dark:text-slate-50">
							{$graphStore.stats.totalProjects}
						</p>
					</div>
					<div
						class="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
					>
						<p
							class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Relationships
						</p>
						<p class="text-xl font-semibold text-slate-900 dark:text-slate-50">
							{$graphStore.stats.totalEdges}
						</p>
					</div>
					<div
						class="rounded-xl border border-slate-200 bg-white/80 px-3 py-3 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
					>
						<p
							class="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400"
						>
							Active Projects
						</p>
						<p class="text-xl font-semibold text-emerald-600 dark:text-emerald-300">
							{$graphStore.stats.activeProjects}
						</p>
					</div>
				</div>
			{/if}

			<div
				class="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden touch-none"
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

			<div class="grid gap-dense-4 lg:grid-cols-2">
				<section
					class="rounded-2xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden"
				>
					<GraphControls
						bind:viewMode={graphViewMode}
						{graphInstance}
						stats={$graphStore.stats ?? emptyGraphStats}
					/>
				</section>

				<section
					class="rounded-2xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 overflow-hidden"
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
