<!-- apps/web/src/lib/components/landing/ExampleProjectGraph.svelte -->
<!--
	Example Project Graph Component

	Displays a public example ontology project graph on the landing page.
	Demonstrates how BuildOS organizes complex projects with deeply nested
	goals, milestones, plans, tasks, and risks.

	Features:
	- Randomly selects from available public example projects
	- Loads public project data from API
	- Interactive Cytoscape graph visualization
	- Responsive design for mobile and desktop
	- Shuffle button to switch to a different example
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		GitBranch,
		LoaderCircle,
		Target,
		ListChecks,
		FileText,
		Calendar,
		Flag,
		AlertTriangle,
		Maximize2,
		ChevronDown,
		Shuffle
	} from 'lucide-svelte';
	import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
	import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from '$lib/components/ontology/graph/lib/graph.types';

	interface PublicProject {
		id: string;
		name: string;
		description: string | null;
		props: Record<string, unknown> | null;
		start_at: string | null;
		end_at: string | null;
	}

	interface Props {
		projectId?: string;
	}

	// Optional override - if not provided, will randomly select
	let { projectId: initialProjectId }: Props = $props();

	// Available public projects
	let availableProjects = $state<PublicProject[]>([]);
	let currentProjectId = $state<string | null>(initialProjectId ?? null);

	// Track which projects have been shown to avoid repeats until all are exhausted
	let shownProjectIds = $state<Set<string>>(new Set());

	// UI State
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	// Graph data state
	let graphData = $state<GraphSourceData | null>(null);
	let projectInfo = $state<{
		name: string;
		description: string | null;
		props: Record<string, unknown> | null;
		start_at: string | null;
		end_at: string | null;
	} | null>(null);
	let stats = $state<{
		totalGoals: number;
		totalMilestones: number;
		totalPlans: number;
		totalTasks: number;
		totalDocuments: number;
		totalRisks: number;
		totalDecisions: number;
		totalEdges: number;
	} | null>(null);

	// Graph instance
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedNode = $state<GraphNode | null>(null);

	const viewMode: ViewMode = 'full';

	onMount(() => {
		loadAvailableProjects();
	});

	/**
	 * Fetch all available public projects, then randomly select one
	 */
	async function loadAvailableProjects() {
		try {
			const response = await fetch('/api/public/projects');
			const payload = await response.json();

			if (!response.ok || !payload.success) {
				throw new Error(payload?.error || 'Failed to fetch public projects');
			}

			availableProjects = payload.data?.projects ?? [];

			// If no initial project specified, randomly select one
			if (!currentProjectId && availableProjects.length > 0) {
				const randomIndex = Math.floor(Math.random() * availableProjects.length);
				const selectedProject = availableProjects[randomIndex];
				if (selectedProject) {
					currentProjectId = selectedProject.id;
					shownProjectIds.add(selectedProject.id);
				}
			} else if (currentProjectId) {
				// Track the initial project if one was provided
				shownProjectIds.add(currentProjectId);
			}

			// Load the selected project's graph data
			if (currentProjectId) {
				await loadGraphData();
			} else {
				loadError = 'No example projects available';
				isLoading = false;
			}
		} catch (err) {
			console.error('[ExampleProjectGraph] Failed to load projects:', err);
			loadError = err instanceof Error ? err.message : 'Failed to load example projects';
			isLoading = false;
		}
	}

	/**
	 * Load graph data for the current project
	 */
	async function loadGraphData() {
		if (!currentProjectId) return;

		isLoading = true;
		loadError = null;

		try {
			const response = await fetch(
				`/api/public/projects/${currentProjectId}/graph?viewMode=${viewMode}`
			);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(
					payload?.error || payload?.message || 'Failed to load example project'
				);
			}

			graphData = payload.data?.source ?? null;
			projectInfo = payload.data?.project ?? null;
			stats = payload.data?.stats ?? null;
			selectedNode = null; // Clear selection when switching projects
		} catch (err) {
			console.error('[ExampleProjectGraph] Failed to load:', err);
			loadError = err instanceof Error ? err.message : 'Failed to load example project';
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Shuffle to a different random project.
	 * Ensures no repeats until all available projects have been shown.
	 */
	async function shuffleProject() {
		if (availableProjects.length <= 1) return;

		// Get projects that haven't been shown yet
		let unshownProjects = availableProjects.filter((p) => !shownProjectIds.has(p.id));

		// If all projects have been shown, reset the tracking (but exclude current to avoid immediate repeat)
		if (unshownProjects.length === 0) {
			shownProjectIds.clear();
			if (currentProjectId) {
				shownProjectIds.add(currentProjectId);
			}
			unshownProjects = availableProjects.filter((p) => !shownProjectIds.has(p.id));
		}

		if (unshownProjects.length === 0) return;

		const randomIndex = Math.floor(Math.random() * unshownProjects.length);
		const selectedProject = unshownProjects[randomIndex];
		if (!selectedProject) return;

		currentProjectId = selectedProject.id;
		shownProjectIds.add(selectedProject.id);

		await loadGraphData();
	}

	// Derived: can shuffle (more than one project available)
	let canShuffle = $derived(availableProjects.length > 1);

	function handleFitToView() {
		graphInstance?.fitToView();
	}

	function handleCloseDetails() {
		selectedNode = null;
	}

	// Derived: whether to show details panel
	let showDetailsPanel = $derived(selectedNode !== null && !isLoading);

	// Mobile details panel expanded state
	let mobileDetailsExpanded = $state(false);

	// Reset mobile panel when node selection changes
	$effect(() => {
		// Access selectedNode to create dependency
		const _ = selectedNode;
		mobileDetailsExpanded = false;
	});

	function formatDate(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
	}

	// Compute timeline from project dates
	let timeline = $derived(
		projectInfo?.start_at && projectInfo?.end_at
			? `${formatDate(projectInfo.start_at)} - ${formatDate(projectInfo.end_at)}`
			: ''
	);

	// Hardcoded commanders by project ID
	const PROJECT_COMMANDERS: Record<string, string> = {
		'11111111-1111-1111-1111-111111111111': 'General George Washington', // Washington Campaign
		'22222222-2222-2222-2222-222222222222': 'NASA Administrator James E. Webb', // Apollo Program
		'33333333-3333-3333-3333-333333333333': 'Dr. Ryland Grace', // Project Hail Mary
		'44444444-4444-4444-4444-444444444444': 'George R.R. Martin', // ASOIAF Writing
		'55555555-5555-5555-5555-555555555555': 'Sarah J. Maas', // ACOTAR Writing
		'66666666-6666-6666-6666-666666666666': 'Brigadier General Leslie R. Groves' // Manhattan Project
	};

	// Get commander name - first check hardcoded, then fall back to props
	let commander = $derived(
		currentProjectId
			? (PROJECT_COMMANDERS[currentProjectId] ??
					((projectInfo?.props as Record<string, unknown>)?.commander as
						| string
						| undefined))
			: undefined
	);
</script>

<section id="example" class="border-t border-border bg-muted/30">
	<div class="mx-auto max-w-6xl px-4 py-6 space-y-6">
		<!-- Section Header -->
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<div
					class="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20"
				>
					<GitBranch class="w-4 h-4 text-accent" />
				</div>
				<span class="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
					>Example Project</span
				>
			</div>

			<h2 class="text-2xl sm:text-3xl font-semibold tracking-tight">
				See how complex projects come together.
			</h2>

			<p class="text-sm text-muted-foreground max-w-2xl">
				This interactive graph shows how BuildOS organizes real projects. Goals cascade into
				milestones, milestones spawn plans, plans break down into tasks — all connected in a
				living knowledge graph.
			</p>
		</div>

		<!-- Project Info Card -->
		{#if projectInfo && !isLoading}
			<div
				class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden"
			>
				<!-- Project Header -->
				<div class="px-4 sm:px-6 py-4 border-b border-border bg-muted/30">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div>
							<h3 class="text-lg font-semibold text-foreground">
								{projectInfo.name}
							</h3>
							<div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
								{#if commander}
									<span>Led by {commander}</span>
								{/if}
								{#if timeline}
									<span class="hidden sm:inline">•</span>
									<span class="hidden sm:inline">{timeline}</span>
								{/if}
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#if canShuffle}
								<button
									type="button"
									onclick={shuffleProject}
									disabled={isLoading}
									class="flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition pressable"
									title="Show a different example project"
								>
									<Shuffle class="w-3.5 h-3.5 shrink-0" />
									<span class="hidden sm:inline">Shuffle</span>
								</button>
							{/if}

							<button
								type="button"
								onclick={handleFitToView}
								disabled={!graphInstance}
								class="flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition pressable"
							>
								<Maximize2 class="w-3.5 h-3.5 shrink-0" />
								<span class="hidden sm:inline">Fit</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Stats Row -->
				{#if stats}
					<div
						class="px-4 sm:px-6 py-3 border-b border-border bg-background/50 overflow-x-auto"
					>
						<div class="flex items-center gap-4 sm:gap-6 text-xs min-w-max">
							<div class="flex items-center gap-1.5">
								<Target class="w-3.5 h-3.5 text-amber-500" />
								<span class="text-muted-foreground">{stats.totalGoals} Goals</span>
							</div>
							<div class="flex items-center gap-1.5">
								<Flag class="w-3.5 h-3.5 text-emerald-500" />
								<span class="text-muted-foreground"
									>{stats.totalMilestones} Milestones</span
								>
							</div>
							<div class="flex items-center gap-1.5">
								<Calendar class="w-3.5 h-3.5 text-indigo-500" />
								<span class="text-muted-foreground">{stats.totalPlans} Plans</span>
							</div>
							<div class="flex items-center gap-1.5">
								<ListChecks class="w-3.5 h-3.5 text-slate-500" />
								<span class="text-muted-foreground">{stats.totalTasks} Tasks</span>
							</div>
							<div class="hidden sm:flex items-center gap-1.5">
								<FileText class="w-3.5 h-3.5 text-sky-500" />
								<span class="text-muted-foreground"
									>{stats.totalDocuments} Docs</span
								>
							</div>
							{#if stats.totalRisks > 0}
								<div class="hidden md:flex items-center gap-1.5">
									<AlertTriangle class="w-3.5 h-3.5 text-red-500" />
									<span class="text-muted-foreground"
										>{stats.totalRisks} Risks</span
									>
								</div>
							{/if}
							{#if stats.totalDecisions > 0}
								<div class="hidden md:flex items-center gap-1.5">
									<Scale class="w-3.5 h-3.5 text-violet-500" />
									<span class="text-muted-foreground"
										>{stats.totalDecisions} Decisions</span
									>
								</div>
							{/if}
							<div class="hidden lg:flex items-center gap-1.5">
								<span class="text-muted-foreground"
									>{stats.totalEdges} Connections</span
								>
							</div>
						</div>
					</div>
				{/if}

				<!-- Graph Container with Details Panel -->
				<div class="h-[400px] sm:h-[450px] lg:h-[500px] relative flex">
					<!-- Main Graph Area -->
					<div class="flex-1 relative {showDetailsPanel ? 'lg:mr-[320px]' : ''}">
						{#if isLoading}
							<div
								class="absolute inset-0 flex items-center justify-center bg-muted/20"
							>
								<div class="flex items-center gap-2 text-sm text-muted-foreground">
									<LoaderCircle class="w-5 h-5 animate-spin" />
									<span>Loading example project...</span>
								</div>
							</div>
						{:else if loadError}
							<div
								class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
							>
								<p class="text-sm text-muted-foreground">{loadError}</p>
								<button
									type="button"
									onclick={loadGraphData}
									class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition shadow-ink pressable"
								>
									Try again
								</button>
							</div>
						{:else if graphData}
							<OntologyGraph
								data={graphData}
								{viewMode}
								bind:selectedNode
								bind:graphInstance
							/>

							<!-- Click hint overlay (shown when no node selected) -->
							{#if !selectedNode}
								<div
									class="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-auto sm:bottom-4 sm:left-4 pointer-events-none"
								>
									<div
										class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/90 border border-border shadow-ink text-xs text-muted-foreground backdrop-blur-sm"
									>
										<span class="hidden sm:inline"
											>Click any node to see details</span
										>
										<span class="sm:hidden">Tap a node to see details</span>
									</div>
								</div>
							{/if}
						{:else}
							<div class="absolute inset-0 flex items-center justify-center">
								<p class="text-sm text-muted-foreground">No graph data available</p>
							</div>
						{/if}
					</div>

					<!-- Desktop Details Panel (slide in from right) -->
					{#if showDetailsPanel}
						<div
							class="hidden lg:block absolute top-0 right-0 bottom-0 w-[320px] bg-card border-l border-border shadow-ink-strong animate-ink-in overflow-hidden"
						>
							<NodeDetailsPanel
								node={selectedNode}
								onClose={handleCloseDetails}
								showDetailLink={false}
							/>
						</div>
					{/if}
				</div>

				<!-- Mobile/Tablet Selected Node Preview + Expandable Details -->
				{#if selectedNode && !isLoading}
					<div class="lg:hidden border-t border-border">
						<!-- Compact Preview (always visible on mobile when node selected) -->
						<button
							type="button"
							class="w-full px-4 sm:px-6 py-3 bg-accent/5 hover:bg-accent/10 transition flex items-center gap-3 text-left pressable"
							onclick={() => {
								mobileDetailsExpanded = !mobileDetailsExpanded;
							}}
						>
							<div
								class="h-9 w-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 border border-accent/20"
							>
								{#if selectedNode.type === 'goal'}
									<Target class="w-4 h-4 text-amber-500" />
								{:else if selectedNode.type === 'milestone'}
									<Flag class="w-4 h-4 text-emerald-500" />
								{:else if selectedNode.type === 'plan'}
									<Calendar class="w-4 h-4 text-indigo-500" />
								{:else if selectedNode.type === 'task'}
									<ListChecks class="w-4 h-4 text-slate-500" />
								{:else if selectedNode.type === 'document'}
									<FileText class="w-4 h-4 text-sky-500" />
								{:else if selectedNode.type === 'risk'}
									<AlertTriangle class="w-4 h-4 text-red-500" />
								{:else}
									<GitBranch class="w-4 h-4 text-accent" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold text-foreground truncate">
									{selectedNode.label}
								</p>
								<p class="text-xs text-muted-foreground capitalize">
									{selectedNode.type}
									{#if selectedNode.connectedEdges}
										• {selectedNode.connectedEdges} connections
									{/if}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<span
									class="text-[0.65rem] uppercase tracking-wide text-muted-foreground"
									>{mobileDetailsExpanded ? 'Hide' : 'Tap for details'}</span
								>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground transition-transform duration-200 {mobileDetailsExpanded
										? 'rotate-180'
										: ''}"
								/>
							</div>
						</button>

						<!-- Expandable Mobile Details Panel -->
						{#if mobileDetailsExpanded}
							<div
								class="max-h-[300px] overflow-y-auto border-t border-border animate-ink-in"
							>
								<NodeDetailsPanel
									node={selectedNode}
									onClose={handleCloseDetails}
									showDetailLink={false}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else if isLoading}
			<!-- Loading skeleton -->
			<div
				class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden h-[450px] flex items-center justify-center"
			>
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="w-5 h-5 animate-spin" />
					<span>Loading example project...</span>
				</div>
			</div>
		{:else if loadError}
			<!-- Error state -->
			<div
				class="rounded-lg border border-border bg-card shadow-ink tx tx-static tx-weak overflow-hidden h-[300px] flex flex-col items-center justify-center gap-3 p-4 text-center"
			>
				<p class="text-sm text-muted-foreground">{loadError}</p>
				<button
					type="button"
					onclick={loadGraphData}
					class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition shadow-ink pressable"
				>
					Try again
				</button>
			</div>
		{/if}
	</div>
</section>
