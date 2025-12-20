<!-- apps/web/src/lib/components/landing/ExampleProjectGraph.svelte -->
<!--
	Example Project Graph Component

	Displays a public example ontology project graph on the landing page.
	Demonstrates how BuildOS organizes complex projects with deeply nested
	goals, milestones, plans, tasks, risks, and decisions.

	Features:
	- Loads public project data from API
	- Interactive Cytoscape graph visualization
	- Collapsible legend showing node types
	- Responsive design for mobile and desktop
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		GitBranch,
		Loader2,
		Target,
		CheckCircle2,
		FileText,
		ListTodo,
		Flag,
		AlertTriangle,
		Maximize2,
		ChevronDown,
		ChevronUp,
		X,
		Scale
	} from 'lucide-svelte';
	import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
	import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from '$lib/components/ontology/graph/lib/graph.types';

	interface Props {
		projectId?: string;
	}

	// Default to George Washington example project
	let { projectId = '11111111-1111-1111-1111-111111111111' }: Props = $props();

	// UI State
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);
	let showLegend = $state(false);

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
		loadGraphData();
	});

	async function loadGraphData() {
		isLoading = true;
		loadError = null;

		try {
			const response = await fetch(
				`/api/public/projects/${projectId}/graph?viewMode=${viewMode}`
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
		} catch (err) {
			console.error('[ExampleProjectGraph] Failed to load:', err);
			loadError = err instanceof Error ? err.message : 'Failed to load example project';
		} finally {
			isLoading = false;
		}
	}

	function handleFitToView() {
		graphInstance?.fitToView();
	}

	function handleCloseDetails() {
		selectedNode = null;
	}

	// Derived: whether to show details panel
	let showDetailsPanel = $derived(selectedNode !== null && !isLoading);

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

	// Get commander name from props
	let commander = $derived(
		(projectInfo?.props as Record<string, unknown>)?.commander as string | undefined
	);
</script>

<section id="example" class="border-t border-border bg-muted/30">
	<div class="mx-auto max-w-6xl px-4 py-14 space-y-8">
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
				This interactive graph shows how BuildOS organizes a real historical project: George
				Washington's Revolutionary War campaign. Goals cascade into milestones, milestones
				spawn plans, plans break down into tasks — all connected in a living knowledge
				graph.
			</p>
		</div>

		<!-- Project Info Card -->
		{#if projectInfo && !isLoading}
			<div
				class="rounded-2xl border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden"
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
							<button
								type="button"
								onclick={() => (showLegend = !showLegend)}
								class="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition"
							>
								{#if showLegend}
									<ChevronUp class="w-3.5 h-3.5" />
								{:else}
									<ChevronDown class="w-3.5 h-3.5" />
								{/if}
								<span>Legend</span>
							</button>

							<button
								type="button"
								onclick={handleFitToView}
								disabled={!graphInstance}
								class="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
							>
								<Maximize2 class="w-3.5 h-3.5" />
								<span class="hidden sm:inline">Fit</span>
							</button>
						</div>
					</div>
				</div>

				<!-- Legend (collapsible) -->
				{#if showLegend}
					<div class="px-4 sm:px-6 py-3 border-b border-border bg-muted/20">
						<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
							<div class="flex items-center gap-2">
								<div
									class="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-700 border-2 border-slate-400 dark:border-slate-500"
								></div>
								<span class="text-muted-foreground">Project</span>
							</div>
							<div class="flex items-center gap-2">
								<Target class="w-4 h-4 text-amber-500" />
								<span class="text-muted-foreground">Goal</span>
							</div>
							<div class="flex items-center gap-2">
								<Flag class="w-4 h-4 text-emerald-500" />
								<span class="text-muted-foreground">Milestone</span>
							</div>
							<div class="flex items-center gap-2">
								<ListTodo class="w-4 h-4 text-indigo-500" />
								<span class="text-muted-foreground">Plan</span>
							</div>
							<div class="flex items-center gap-2">
								<CheckCircle2 class="w-4 h-4 text-slate-500" />
								<span class="text-muted-foreground">Task</span>
							</div>
							<div class="flex items-center gap-2">
								<FileText class="w-4 h-4 text-sky-500" />
								<span class="text-muted-foreground">Document</span>
							</div>
							<div class="flex items-center gap-2">
								<AlertTriangle class="w-4 h-4 text-red-500" />
								<span class="text-muted-foreground">Risk</span>
							</div>
						</div>
					</div>
				{/if}

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
								<ListTodo class="w-3.5 h-3.5 text-indigo-500" />
								<span class="text-muted-foreground">{stats.totalPlans} Plans</span>
							</div>
							<div class="flex items-center gap-1.5">
								<CheckCircle2 class="w-3.5 h-3.5 text-slate-500" />
								<span class="text-muted-foreground">{stats.totalTasks} Tasks</span>
							</div>
							<div class="hidden sm:flex items-center gap-1.5">
								<FileText class="w-3.5 h-3.5 text-sky-500" />
								<span class="text-muted-foreground"
									>{stats.totalDocuments} Docs</span
								>
							</div>
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
							<div class="absolute inset-0 flex items-center justify-center bg-muted/20">
								<div class="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 class="w-5 h-5 animate-spin" />
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
									class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition"
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
								<div class="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-auto sm:bottom-4 sm:left-4 pointer-events-none">
									<div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/90 border border-border shadow-ink text-xs text-muted-foreground backdrop-blur-sm">
										<span class="hidden sm:inline">Click any node to see details</span>
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
							class="w-full px-4 sm:px-6 py-3 bg-accent/5 hover:bg-accent/10 transition flex items-center gap-3 text-left"
							onclick={() => {
								// Toggle mobile detail view
								const mobilePanel = document.getElementById('mobile-details-panel');
								if (mobilePanel) {
									mobilePanel.classList.toggle('hidden');
								}
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
									<ListTodo class="w-4 h-4 text-indigo-500" />
								{:else if selectedNode.type === 'task'}
									<CheckCircle2 class="w-4 h-4 text-slate-500" />
								{:else if selectedNode.type === 'document'}
									<FileText class="w-4 h-4 text-sky-500" />
								{:else if selectedNode.type === 'risk'}
									<AlertTriangle class="w-4 h-4 text-red-500" />
								{:else if selectedNode.type === 'decision'}
									<Scale class="w-4 h-4 text-violet-500" />
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
								<span class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Tap for details</span>
								<ChevronDown class="w-4 h-4 text-muted-foreground" />
							</div>
						</button>

						<!-- Expandable Mobile Details Panel -->
						<div
							id="mobile-details-panel"
							class="hidden max-h-[300px] overflow-y-auto border-t border-border"
						>
							<NodeDetailsPanel
								node={selectedNode}
								onClose={handleCloseDetails}
								showDetailLink={false}
							/>
						</div>
					</div>
				{/if}
			</div>
		{:else if isLoading}
			<!-- Loading skeleton -->
			<div
				class="rounded-2xl border border-border bg-card shadow-ink overflow-hidden h-[450px] flex items-center justify-center"
			>
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 class="w-5 h-5 animate-spin" />
					<span>Loading example project...</span>
				</div>
			</div>
		{:else if loadError}
			<!-- Error state -->
			<div
				class="rounded-2xl border border-border bg-card shadow-ink overflow-hidden h-[300px] flex flex-col items-center justify-center gap-3 p-4 text-center"
			>
				<p class="text-sm text-muted-foreground">{loadError}</p>
				<button
					type="button"
					onclick={loadGraphData}
					class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition"
				>
					Try again
				</button>
			</div>
		{/if}

		<!-- Call to Action -->
		<div class="text-center pt-4">
			<p class="text-sm text-muted-foreground mb-4">
				Ready to organize your own complex projects with BuildOS?
			</p>
			<a
				href="/auth/register"
				class="inline-flex items-center gap-2 pressable rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background shadow-ink"
			>
				Start building your project brain
			</a>
		</div>
	</div>
</section>
