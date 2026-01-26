<!-- apps/web/src/lib/components/ontology/ProjectGraphSection.svelte -->
<!--
	Collapsible graph visualization for a single project.

	Features:
	- Three states: hidden, collapsed, expanded
	- Lazy-loads graph data (including edges) only when expanded
	- Minimal controls: layout toggle, fit button, hide button
	- Node clicks trigger callbacks to open edit modals

	Usage:
	<ProjectGraphSection
		projectId={project.id}
		onNodeClick={(node) => { ... }}
		onHide={() => { graphHidden = true }}
	/>
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { ChevronDown, Maximize2, EyeOff, GitBranch, LoaderCircle } from 'lucide-svelte';
	import OntologyGraph from './graph/OntologyGraph.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from './graph/lib/graph.types';

	const STORAGE_KEY_HIDDEN = 'buildos:project-graph-hidden';
	const STORAGE_KEY_LAYOUT = 'buildos:project-graph-layout';

	interface Props {
		projectId: string;
		onNodeClick?: (node: GraphNode) => void;
		onHide?: () => void;
	}

	let { projectId, onNodeClick, onHide }: Props = $props();

	// UI State
	let isExpanded = $state(false);
	let selectedLayout = $state<string>('dagre');

	// Graph data state
	let graphData = $state<GraphSourceData | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let nodeCount = $state(0);

	// Graph instance
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedNode = $state<GraphNode | null>(null);

	// View mode (always 'full' for single project)
	const viewMode: ViewMode = 'full';

	// Layout options
	const layouts = [
		{ value: 'cose-bilkent', label: 'Spring' },
		{ value: 'dagre', label: 'Hierarchical' }
	];

	onMount(() => {
		// Load saved layout preference
		if (typeof localStorage !== 'undefined') {
			const savedLayout = localStorage.getItem(STORAGE_KEY_LAYOUT);
			if (savedLayout && layouts.some((l) => l.value === savedLayout)) {
				selectedLayout = savedLayout;
			}
		}
	});

	// Save layout preference when changed
	$effect(() => {
		if (typeof localStorage !== 'undefined' && selectedLayout) {
			localStorage.setItem(STORAGE_KEY_LAYOUT, selectedLayout);
		}
	});

	// Apply layout when graph instance or layout changes
	$effect(() => {
		if (graphInstance && selectedLayout) {
			graphInstance.changeLayout(selectedLayout);
		}
	});

	// Handle node selection - trigger callback
	$effect(() => {
		if (selectedNode && onNodeClick) {
			onNodeClick(selectedNode);
			// Clear selection after callback
			selectedNode = null;
		}
	});

	async function loadGraphData() {
		if (isLoading || graphData) return;

		isLoading = true;
		loadError = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/graph?viewMode=${viewMode}`
			);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload?.error || payload?.message || 'Failed to load graph');
			}

			graphData = payload.data?.source ?? null;
			nodeCount = payload.data?.graph?.nodes?.length ?? 0;
		} catch (err) {
			console.error('[ProjectGraphSection] Failed to load graph:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/graph`,
				method: 'GET',
				projectId,
				entityType: 'project',
				operation: 'project_graph_load',
				metadata: { viewMode }
			});
			loadError = err instanceof Error ? err.message : 'Failed to load graph data';
		} finally {
			isLoading = false;
		}
	}

	function handleToggle() {
		if (!isExpanded) {
			// Expanding - load data if not already loaded
			isExpanded = true;
			loadGraphData();
		} else {
			// Collapsing
			isExpanded = false;
		}
	}

	function handleFitToView() {
		graphInstance?.fitToView();
	}

	function handleHide() {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY_HIDDEN, 'true');
		}
		onHide?.();
	}

	function handleRetry() {
		graphData = null;
		loadError = null;
		loadGraphData();
	}
</script>

<section
	class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-thread tx-weak overflow-hidden"
>
	<!-- Header - Always visible -->
	<button
		type="button"
		onclick={handleToggle}
		class="w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-muted transition-colors pressable"
		aria-expanded={isExpanded}
	>
		<div class="flex items-center gap-2 sm:gap-3">
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center"
			>
				<GitBranch class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
			</div>
			<div>
				<p class="text-xs sm:text-sm font-semibold text-foreground">Project Graph</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{#if isLoading}
						Loading...
					{:else if nodeCount > 0}
						{nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
					{:else}
						Visualize project relationships
					{/if}
				</p>
			</div>
		</div>

		<ChevronDown
			class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isExpanded
				? 'rotate-180'
				: ''}"
		/>
	</button>

	<!-- Expanded Content -->
	{#if isExpanded}
		<div class="border-t border-border" transition:slide={{ duration: 120 }}>
			<!-- Controls Row -->
			<div
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-muted border-b border-border tx tx-grain tx-weak"
			>
				<div class="flex items-center gap-1.5 sm:gap-2">
					<!-- Layout Selector -->
					<Select
						bind:value={selectedLayout}
						size="sm"
						placeholder="Layout"
						class="!min-h-[26px] sm:!min-h-[28px] !py-0 !pl-2 !pr-6 sm:!pr-8 !text-[10px] sm:!text-xs w-[90px] sm:w-[110px]"
						aria-label="Graph layout"
					>
						{#each layouts as layout}
							<option value={layout.value}>{layout.label}</option>
						{/each}
					</Select>

					<!-- Fit Button -->
					<button
						type="button"
						onclick={handleFitToView}
						disabled={!graphInstance}
						class="flex items-center justify-center gap-1 sm:gap-1.5 h-[26px] sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-xs font-medium rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition pressable"
						aria-label="Fit to view"
					>
						<Maximize2 class="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
						<span class="hidden sm:inline">Fit</span>
					</button>
				</div>

				<!-- Hide Button -->
				<button
					type="button"
					onclick={handleHide}
					class="flex items-center justify-center gap-1 sm:gap-1.5 h-[26px] sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition pressable"
					aria-label="Hide graph"
				>
					<EyeOff class="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
					<span class="hidden sm:inline">Hide</span>
				</button>
			</div>

			<!-- Graph Container -->
			<div class="h-[200px] sm:h-[250px] lg:h-[280px] relative">
				{#if isLoading}
					<div
						class="absolute inset-0 flex items-center justify-center bg-muted tx tx-pulse tx-weak"
					>
						<div
							class="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground"
						>
							<LoaderCircle class="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
							<span>Loading graph...</span>
						</div>
					</div>
				{:else if loadError}
					<div
						class="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 text-center tx tx-static tx-weak"
					>
						<p class="text-xs sm:text-sm text-muted-foreground">{loadError}</p>
						<button
							type="button"
							onclick={handleRetry}
							class="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition pressable"
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
				{:else}
					<div
						class="absolute inset-0 flex items-center justify-center tx tx-bloom tx-weak"
					>
						<p class="text-xs sm:text-sm text-muted-foreground">
							No graph data available
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
