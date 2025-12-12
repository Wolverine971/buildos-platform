<!-- apps/web/src/lib/components/ontology/graph/GraphControls.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Search,
		Download,
		FolderKanban,
		ListChecks,
		Calendar,
		Target,
		Flag,
		Layers,
		FileText,
		ChevronDown,
		ChevronRight,
		Maximize2,
		SlidersHorizontal
	} from 'lucide-svelte';
	import type { GraphStats, OntologyGraphInstance, ViewMode } from './lib/graph.types';

	type GraphLibrary = 'cytoscape' | 'svelteflow' | 'g6';

	let {
		viewMode = $bindable<ViewMode>(),
		graphInstance,
		graphLibrary = 'cytoscape' as GraphLibrary,
		stats,
		showStats = true
	}: {
		viewMode: ViewMode;
		graphInstance: OntologyGraphInstance | null;
		graphLibrary?: GraphLibrary;
		stats: GraphStats;
		showStats?: boolean;
	} = $props();

	// Feature support by library
	const libraryFeatures: Record<
		GraphLibrary,
		{ layout: boolean; search: boolean; filter: boolean; fitToView: boolean; export: boolean }
	> = {
		cytoscape: { layout: true, search: true, filter: true, fitToView: true, export: true },
		svelteflow: {
			layout: false,
			search: false,
			filter: false,
			fitToView: false,
			export: false
		},
		g6: { layout: false, search: false, filter: false, fitToView: false, export: false }
	};

	let features = $derived(libraryFeatures[graphLibrary]);

	let searchQuery = $state('');
	let selectedLayout = $state('cose-bilkent'); // Default to spring layout
	let selectedFilter = $state('all');
	let statsExpanded = $state(false);
	let legendExpanded = $state(true);

	const layouts = [
		{ value: 'cose-bilkent', label: 'Spring' },
		{ value: 'dagre', label: 'Hierarchical' },
		{ value: 'cola', label: 'Force' },
		{ value: 'circle', label: 'Circular' }
	];

	const filters = [
		{ value: 'all', label: 'All' },
		{ value: 'project', label: 'Projects' },
		{ value: 'task', label: 'Tasks' },
		{ value: 'plan', label: 'Plans' },
		{ value: 'goal', label: 'Goals' },
		{ value: 'milestone', label: 'Milestones' },
		{ value: 'output', label: 'Outputs' },
		{ value: 'document', label: 'Documents' }
	];

	// Node legend items with colors matching the graph
	const nodeLegend = [
		{ icon: FolderKanban, label: 'Project', color: 'text-emerald-500' },
		{ icon: ListChecks, label: 'Task', color: 'text-muted-foreground' },
		{ icon: Calendar, label: 'Plan', color: 'text-indigo-500' },
		{ icon: Target, label: 'Goal', color: 'text-amber-500' },
		{ icon: Flag, label: 'Milestone', color: 'text-emerald-500' },
		{ icon: Layers, label: 'Output', color: 'text-purple-500' },
		{ icon: FileText, label: 'Document', color: 'text-blue-500' }
	];

	// Edge legend items
	const edgeLegend = [
		{ color: 'bg-muted-foreground', label: 'Hierarchy' },
		{ color: 'bg-amber-500', label: 'Goals' },
		{ color: 'bg-orange-500', label: 'Depends' },
		{ color: 'bg-emerald-500', label: 'Milestone' },
		{ color: 'bg-blue-500', label: 'Document' },
		{ color: 'bg-purple-500', label: 'Output' }
	];

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleSearch() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const query = searchQuery.trim();
			graphInstance?.search(query);
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ontology-graph.interaction', {
						detail: { type: 'search', query }
					})
				);
			}
		}, 300);
	}

	function handleFitToView() {
		graphInstance?.fitToView();
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('ontology-graph.interaction', {
					detail: { type: 'fit_to_view' }
				})
			);
		}
	}

	function handleExport() {
		const instance = graphInstance;
		if (instance?.cy) {
			const png = instance.cy.png({ scale: 2 });
			const link = document.createElement('a');
			link.href = png;
			link.download = `ontology-graph-${Date.now()}.png`;
			link.click();
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ontology-graph.interaction', {
						detail: { type: 'export', format: 'png' }
					})
				);
			}
		}
	}

	onDestroy(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
	});

	$effect(() => {
		selectedLayout;
		graphInstance;
		if (graphInstance) {
			graphInstance.changeLayout(selectedLayout);
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ontology-graph.interaction', {
						detail: { type: 'layout_change', value: selectedLayout }
					})
				);
			}
		}
	});

	$effect(() => {
		viewMode;
		if (selectedFilter !== 'all') {
			selectedFilter = 'all';
			graphInstance?.resetFilters();
		}
	});

	$effect(() => {
		selectedFilter;
		graphInstance;
		if (!graphInstance) return;
		if (selectedFilter === 'all') {
			graphInstance.resetFilters();
		} else {
			graphInstance.filterByType(selectedFilter);
		}
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('ontology-graph.interaction', {
					detail: { type: 'filter', value: selectedFilter }
				})
			);
		}
	});
</script>

<div class="flex flex-col h-full bg-card">
	<!-- Collapsible Stats Panel -->
	{#if showStats}
		<div class="border-b border-border">
			<button
				type="button"
				class="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition pressable"
				onclick={() => (statsExpanded = !statsExpanded)}
				aria-expanded={statsExpanded}
			>
				<span class="uppercase tracking-wider">Statistics</span>
				<div class="flex items-center gap-2">
					<span class="text-foreground font-bold">{stats.totalEdges} edges</span>
					{#if statsExpanded}
						<ChevronDown class="w-3.5 h-3.5" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5" />
					{/if}
				</div>
			</button>

			{#if statsExpanded}
				<div class="px-3 pb-3 grid grid-cols-3 gap-2 text-xs animate-ink-in">
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground">{stats.totalProjects}</span>
						<span class="text-muted-foreground">Projects</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-accent/10 border border-accent/30"
					>
						<span class="text-lg font-bold text-accent">{stats.activeProjects}</span>
						<span class="text-accent/80">Active</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground">{stats.totalTasks}</span>
						<span class="text-muted-foreground">Tasks</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground"
							>{stats.totalPlans ?? 0}</span
						>
						<span class="text-muted-foreground">Plans</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground"
							>{stats.totalGoals ?? 0}</span
						>
						<span class="text-muted-foreground">Goals</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground"
							>{stats.totalMilestones ?? 0}</span
						>
						<span class="text-muted-foreground">Milestones</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground">{stats.totalOutputs}</span>
						<span class="text-muted-foreground">Outputs</span>
					</div>
					<div
						class="flex flex-col items-center p-2 rounded-lg bg-muted/50 border border-border"
					>
						<span class="text-lg font-bold text-foreground">{stats.totalDocuments}</span
						>
						<span class="text-muted-foreground">Documents</span>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Main Controls Area -->
	<div class="flex-1 overflow-y-auto p-3 space-y-3">
		<!-- View & Layout Row -->
		<div class="flex gap-2">
			<div class="flex-1">
				<span
					class="block text-[0.65rem] uppercase tracking-wider font-bold text-muted-foreground mb-1"
					id="view-label"
				>
					View
				</span>
				<select
					bind:value={viewMode}
					aria-labelledby="view-label"
					class="w-full h-8 px-2 text-xs font-bold rounded-lg border border-border bg-card text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring transition"
				>
					<option value="projects">Projects & Entities</option>
					<option value="full">Complete (all edges)</option>
				</select>
			</div>
			{#if features.layout}
				<div class="flex-1">
					<span
						class="block text-[0.65rem] uppercase tracking-wider font-bold text-muted-foreground mb-1"
						id="layout-label"
					>
						Layout
					</span>
					<select
						bind:value={selectedLayout}
						aria-labelledby="layout-label"
						class="w-full h-8 px-2 text-xs font-bold rounded-lg border border-border bg-card text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring transition"
					>
						{#each layouts as layout}
							<option value={layout.value}>{layout.label}</option>
						{/each}
					</select>
				</div>
			{/if}
		</div>

		<!-- Search & Filter Row -->
		{#if features.search || features.filter}
			<div class="flex gap-2">
				{#if features.search}
					<div class="flex-1 relative">
						<Search
							class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
						/>
						<input
							type="text"
							bind:value={searchQuery}
							oninput={handleSearch}
							placeholder="Search nodes..."
							class="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring transition"
						/>
					</div>
				{/if}
				{#if features.filter}
					<div class="w-28">
						<div class="relative">
							<SlidersHorizontal
								class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
							/>
							<select
								bind:value={selectedFilter}
								aria-label="Filter node type"
								class="w-full h-8 pl-8 pr-2 text-xs font-bold rounded-lg border border-border bg-card text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus:ring-1 focus:ring-ring transition appearance-none"
							>
								{#each filters as filter}
									<option value={filter.value}>{filter.label}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Action Buttons -->
		{#if features.fitToView || features.export}
			<div class="flex gap-2">
				{#if features.fitToView}
					<button
						type="button"
						onclick={handleFitToView}
						class="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-bold rounded-lg border border-border bg-card text-foreground hover:border-accent hover:bg-muted/50 shadow-ink pressable transition"
					>
						<Maximize2 class="w-3.5 h-3.5" />
						<span>Fit</span>
					</button>
				{/if}
				{#if features.export}
					<button
						type="button"
						onclick={handleExport}
						class="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-bold rounded-lg border border-border bg-card text-foreground hover:border-accent hover:bg-muted/50 shadow-ink pressable transition"
					>
						<Download class="w-3.5 h-3.5" />
						<span>Export</span>
					</button>
				{/if}
			</div>
		{/if}

		<!-- Combined Legend -->
		<div class="border-t border-border pt-3">
			<button
				type="button"
				class="w-full flex items-center justify-between text-[0.65rem] uppercase tracking-wider font-bold text-muted-foreground hover:text-foreground transition mb-2"
				onclick={() => (legendExpanded = !legendExpanded)}
				aria-expanded={legendExpanded}
			>
				<span>Legend</span>
				{#if legendExpanded}
					<ChevronDown class="w-3 h-3" />
				{:else}
					<ChevronRight class="w-3 h-3" />
				{/if}
			</button>

			{#if legendExpanded}
				<div class="space-y-2 animate-ink-in">
					<!-- Node Types -->
					<div class="grid grid-cols-4 gap-1">
						{#each nodeLegend as item}
							{@const Icon = item.icon}
							<div class="flex items-center gap-1 text-[0.6rem]" title={item.label}>
								<Icon class="w-3 h-3 {item.color} flex-shrink-0" />
								<span class="text-muted-foreground truncate">{item.label}</span>
							</div>
						{/each}
					</div>

					<!-- Edge Types -->
					<div class="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border/50">
						{#each edgeLegend as item}
							<div class="flex items-center gap-1.5 text-[0.6rem]">
								<div class="w-4 h-0.5 rounded-full {item.color}"></div>
								<span class="text-muted-foreground">{item.label}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Library Notice -->
		{#if !features.search && !features.filter}
			<div
				class="text-[0.65rem] text-muted-foreground bg-muted/50 border border-border rounded-lg px-2 py-1.5"
			>
				<span class="font-bold text-foreground">Note:</span> Full controls require Cytoscape.
			</div>
		{/if}
	</div>
</div>
