<!-- apps/web/src/lib/components/ontology/ProjectGraphSection.svelte -->
<!--
	Embedded graph visualization for a single project.

	Features:
	- Auto-loads graph data on mount
	- Controls: layout toggle, fit button
	- Node clicks trigger callbacks to open edit modals
	- Fills its container height (use inside a fixed-height wrapper)

	Usage:
	<ProjectGraphSection
		projectId={project.id}
		onNodeClick={(node) => { ... }}
	/>
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import OntologyGraph from './graph/OntologyGraph.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { LoaderCircle, Maximize2, ZoomIn, ZoomOut } from '$lib/icons/lucide';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from './graph/lib/graph.types';

	const STORAGE_KEY_LAYOUT = 'buildos:project-graph-layout';

	interface Props {
		projectId: string;
		onNodeClick?: (node: GraphNode) => void;
		/** @deprecated No longer used — kept for backward compat */
		embedded?: boolean;
	}

	let { projectId, onNodeClick, embedded = true }: Props = $props();

	// UI State
	let selectedLayout = $state<string>('cose-bilkent');

	// Graph data state
	let graphData = $state<GraphSourceData | null>(null);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);

	// Graph instance
	let graphInstance = $state<OntologyGraphInstance | null>(null);

	// View mode (always 'full' for single project)
	const viewMode: ViewMode = 'full';

	// Layout options
	const layouts = [
		{ value: 'cose-bilkent', label: 'Spring' },
		{ value: 'cola', label: 'Flow' }
	];

	onMount(() => {
		// Load saved layout preference
		if (typeof localStorage !== 'undefined') {
			const savedLayout = localStorage.getItem(STORAGE_KEY_LAYOUT);
			if (savedLayout && layouts.some((l) => l.value === savedLayout)) {
				selectedLayout = savedLayout;
			}
		}

		// Auto-load graph data
		loadGraphData();
	});

	// Save layout preference when changed
	$effect(() => {
		if (typeof localStorage !== 'undefined' && selectedLayout) {
			localStorage.setItem(STORAGE_KEY_LAYOUT, selectedLayout);
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

	function handleFitToView() {
		graphInstance?.fitToView();
	}

	function handleZoomIn() {
		graphInstance?.zoomIn();
	}

	function handleZoomOut() {
		graphInstance?.zoomOut();
	}

	function handleNodeSelect(node: GraphNode) {
		onNodeClick?.(node);
	}

	function handleRetry() {
		graphData = null;
		loadError = null;
		loadGraphData();
	}
</script>

<div class="flex flex-col h-full">
	<!-- Controls Row -->
	<div
		class="flex min-w-0 shrink-0 items-center gap-2 border-b border-border bg-muted px-3 py-2 tx tx-grain tx-weak sm:px-4"
	>
		<Select
			bind:value={selectedLayout}
			size="sm"
			placeholder="Layout"
			class="w-24 min-w-0 sm:w-36"
			aria-label="Graph layout"
		>
			{#each layouts as layout (layout.value)}
				<option value={layout.value}>{layout.label}</option>
			{/each}
		</Select>

		<div class="ml-auto flex shrink-0 items-center gap-1" role="group" aria-label="Graph view">
			<Button
				variant="outline"
				size="sm"
				icon={ZoomOut}
				onclick={handleZoomOut}
				disabled={!graphInstance}
				class="h-11 w-11 shrink-0 rounded-md p-0"
				aria-label="Zoom out"
				title="Zoom out"
			/>
			<Button
				variant="outline"
				size="sm"
				icon={ZoomIn}
				onclick={handleZoomIn}
				disabled={!graphInstance}
				class="h-11 w-11 shrink-0 rounded-md p-0"
				aria-label="Zoom in"
				title="Zoom in"
			/>
			<Button
				variant="outline"
				size="sm"
				onclick={handleFitToView}
				disabled={!graphInstance}
				class="h-11 w-11 shrink-0 rounded-md p-0 sm:w-auto sm:px-3"
				aria-label="Fit graph to view"
				title="Fit graph to view"
			>
				<Maximize2 class="h-4 w-4 shrink-0" />
				<span class="hidden sm:inline">Fit</span>
			</Button>
		</div>
	</div>

	<!-- Graph Container - fills remaining space -->
	<div class="flex-1 relative min-h-0">
		{#if isLoading}
			<div
				class="absolute inset-0 flex items-center justify-center bg-muted tx tx-pulse tx-weak"
			>
				<div class="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
					<LoaderCircle
						class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none sm:h-4 sm:w-4"
					/>
					<span>Loading graph…</span>
				</div>
			</div>
		{:else if loadError}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 text-center tx tx-static tx-weak"
			>
				<p class="max-w-md break-words text-xs text-muted-foreground sm:text-sm">
					{loadError}
				</p>
				<Button variant="primary" size="sm" onclick={handleRetry}>Try again</Button>
			</div>
		{:else if graphData}
			<OntologyGraph
				data={graphData}
				{viewMode}
				layoutName={selectedLayout}
				onNodeSelect={handleNodeSelect}
				bind:graphInstance
			/>
		{:else}
			<div class="absolute inset-0 flex items-center justify-center tx tx-bloom tx-weak">
				<p class="text-xs sm:text-sm text-muted-foreground">No graph data available</p>
			</div>
		{/if}
	</div>
</div>
