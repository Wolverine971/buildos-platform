<!-- apps/web/src/routes/admin/ontology/graph/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { Workflow, Network, Zap } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
	import GraphControls from '$lib/components/ontology/graph/GraphControls.svelte';
	import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';
	import type {
		OntologyGraphInstance,
		ViewMode,
		GraphNode
	} from '$lib/components/ontology/graph/lib/graph.types';

	let { data }: { data: PageData } = $props();

	let selectedNode = $state<GraphNode | null>(null);
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let viewMode = $state<ViewMode>('projects'); // Default to Projects & Entities
	let graphLibrary = $state<'cytoscape' | 'svelteflow' | 'g6'>('cytoscape');

	const libraryOptions = [
		{ value: 'cytoscape', label: 'Cytoscape', icon: Workflow, description: 'Stable' },
		{ value: 'svelteflow', label: 'Svelte Flow', icon: Network, description: 'Native' },
		{ value: 'g6', label: 'G6', icon: Zap, description: 'Fast' }
	] as const;
</script>

<svelte:head>
	<title>Ontology Graph - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Ontology Graph"
		description="Visualize and explore the complete ontology system"
		icon={Workflow}
		backHref="/admin"
	/>

	<!-- Graph Library Selector -->
	<div class="mt-4 mb-2">
		<div class="inline-flex rounded-lg border border-border bg-card p-1 shadow-ink">
			{#each libraryOptions as option}
				{@const Icon = option.icon}
				<button
					type="button"
					class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition pressable
						{graphLibrary === option.value
						? 'bg-accent text-accent-foreground shadow-ink'
						: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
					onclick={() => (graphLibrary = option.value)}
				>
					<Icon class="w-3.5 h-3.5" />
					<span>{option.label}</span>
					<span
						class="hidden sm:inline text-[0.65rem] px-1.5 py-0.5 rounded-full
							{graphLibrary === option.value
							? 'bg-accent-foreground/20 text-accent-foreground'
							: 'bg-muted text-muted-foreground'}"
					>
						{option.description}
					</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-4 mt-4">
		<!-- Graph Container -->
		<div
			class="w-full h-[72vh] sm:h-[78vh] lg:h-[calc(100vh-16rem)] rounded-lg border border-border bg-card shadow-ink overflow-hidden touch-none"
		>
			{#if graphLibrary === 'cytoscape'}
				<OntologyGraph {data} {viewMode} bind:selectedNode bind:graphInstance />
			{:else if graphLibrary === 'svelteflow'}
				{#await import('$lib/components/ontology/graph/svelteflow/SvelteFlowGraph.svelte') then { default: SvelteFlowGraph }}
					<SvelteFlowGraph {data} {viewMode} bind:selectedNode />
				{/await}
			{:else if graphLibrary === 'g6'}
				{#await import('$lib/components/ontology/graph/g6/G6Graph.svelte') then { default: G6Graph }}
					<G6Graph {data} {viewMode} bind:selectedNode />
				{/await}
			{/if}
		</div>

		<!-- Controls Grid -->
		<div class="grid gap-4 lg:grid-cols-2">
			<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
				<GraphControls bind:viewMode {graphInstance} {graphLibrary} stats={data.stats} />
			</section>

			<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
				{#if selectedNode}
					<NodeDetailsPanel node={selectedNode} onClose={() => (selectedNode = null)} />
				{:else}
					<div
						class="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
					>
						Select a node to view its details.
					</div>
				{/if}
			</section>
		</div>
	</div>
</div>
