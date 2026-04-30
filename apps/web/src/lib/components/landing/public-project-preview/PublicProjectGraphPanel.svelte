<!-- apps/web/src/lib/components/landing/public-project-preview/PublicProjectGraphPanel.svelte -->
<!--
	Read-only project graph panel for the public landing preview.

	Wraps the existing OntologyGraph + NodeDetailsPanel with the same UX as
	the legacy ExampleProjectGraph (desktop side panel, mobile expandable),
	but without the project header / shuffle UI — that's owned by the parent
	PublicProjectView. The heavy graph engine and details panel are loaded
	dynamically so the unauthenticated bundle stays small.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		LoaderCircle,
		Maximize2,
		ChevronDown,
		Target,
		Flag,
		Calendar,
		ListChecks,
		FileText,
		AlertTriangle,
		GitBranch
	} from 'lucide-svelte';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from '$lib/components/ontology/graph/lib/graph.types';

	let {
		source,
		isLoading = false
	}: {
		source: GraphSourceData | null;
		isLoading?: boolean;
	} = $props();

	const viewMode: ViewMode = 'full';

	let OntologyGraphComponent = $state<any>(null);
	let NodeDetailsPanelComponent = $state<any>(null);
	let chunkLoading = $state(false);
	let chunkError = $state<string | null>(null);

	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let selectedNode = $state<GraphNode | null>(null);
	let mobileDetailsExpanded = $state(false);

	let showDetailsPanel = $derived(selectedNode !== null && !isLoading);

	// Reset mobile expansion when selected node changes.
	$effect(() => {
		const _ = selectedNode;
		mobileDetailsExpanded = false;
	});

	onMount(async () => {
		await loadGraphChunks();
	});

	async function loadGraphChunks() {
		if (OntologyGraphComponent && NodeDetailsPanelComponent) return;
		if (chunkLoading) return;
		chunkLoading = true;
		chunkError = null;
		try {
			const [graphModule, panelModule] = await Promise.all([
				import('$lib/components/ontology/graph/OntologyGraph.svelte'),
				import('$lib/components/ontology/graph/NodeDetailsPanel.svelte')
			]);
			OntologyGraphComponent = graphModule.default;
			NodeDetailsPanelComponent = panelModule.default;
		} catch (err) {
			console.error('[PublicProjectGraphPanel] Failed to load graph chunks:', err);
			chunkError = 'Failed to load graph visualization.';
		} finally {
			chunkLoading = false;
		}
	}

	function handleFitToView() {
		graphInstance?.fitToView();
	}

	function handleCloseDetails() {
		selectedNode = null;
	}
</script>

<section
	class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak overflow-hidden"
>
	<header
		class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/40"
	>
		<div class="flex items-center gap-2">
			<div
				class="h-7 w-7 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center"
			>
				<GitBranch class="w-3.5 h-3.5 text-accent" />
			</div>
			<div>
				<p class="text-sm font-semibold text-foreground">Project graph</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					Click a node to see how it connects.
				</p>
			</div>
		</div>
		<button
			type="button"
			onclick={handleFitToView}
			disabled={!graphInstance}
			class="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition pressable"
		>
			<Maximize2 class="w-3.5 h-3.5" />
			<span class="hidden sm:inline">Fit</span>
		</button>
	</header>

	<div class="h-[400px] sm:h-[450px] lg:h-[500px] relative flex">
		<div class="flex-1 relative {showDetailsPanel ? 'lg:mr-[320px]' : ''}">
			{#if isLoading || chunkLoading || !OntologyGraphComponent}
				<div class="absolute inset-0 flex items-center justify-center bg-muted/30">
					<div class="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderCircle class="w-5 h-5 animate-spin" />
						<span>Loading graph…</span>
					</div>
				</div>
			{:else if chunkError}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
				>
					<p class="text-sm text-muted-foreground">{chunkError}</p>
					<button
						type="button"
						onclick={loadGraphChunks}
						class="px-4 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition shadow-ink pressable"
					>
						Try again
					</button>
				</div>
			{:else if source}
				<OntologyGraphComponent
					data={source}
					{viewMode}
					bind:selectedNode
					bind:graphInstance
				/>

				{#if !selectedNode}
					<div
						class="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto pointer-events-none"
					>
						<div
							class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/90 border border-border shadow-ink text-xs text-muted-foreground backdrop-blur-sm"
						>
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

		{#if showDetailsPanel && NodeDetailsPanelComponent}
			<div
				class="hidden lg:block absolute top-0 right-0 bottom-0 w-[320px] bg-card border-l border-border shadow-ink-strong animate-ink-in overflow-hidden"
			>
				<NodeDetailsPanelComponent
					node={selectedNode}
					onClose={handleCloseDetails}
					showDetailLink={false}
				/>
			</div>
		{/if}
	</div>

	{#if selectedNode && !isLoading && NodeDetailsPanelComponent}
		<div class="lg:hidden border-t border-border">
			<button
				type="button"
				class="w-full px-4 py-3 bg-accent/5 hover:bg-accent/10 transition flex items-center gap-3 text-left pressable"
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
						<ListChecks class="w-4 h-4 text-muted-foreground" />
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
					<span class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
						{mobileDetailsExpanded ? 'Hide' : 'Tap for details'}
					</span>
					<ChevronDown
						class="w-4 h-4 text-muted-foreground transition-transform duration-200 {mobileDetailsExpanded
							? 'rotate-180'
							: ''}"
					/>
				</div>
			</button>

			{#if mobileDetailsExpanded}
				<div class="max-h-[300px] overflow-y-auto border-t border-border animate-ink-in">
					<NodeDetailsPanelComponent
						node={selectedNode}
						onClose={handleCloseDetails}
						showDetailLink={false}
					/>
				</div>
			{/if}
		</div>
	{/if}
</section>
