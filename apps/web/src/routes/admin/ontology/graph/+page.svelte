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
	let viewMode = $state<ViewMode>('templates');
	let graphLibrary = $state<'cytoscape' | 'svelteflow' | 'g6'>('cytoscape');

	const libraryOptions = [
		{ value: 'cytoscape', label: 'Cytoscape', icon: Workflow, description: 'Current (stable)' },
		{ value: 'svelteflow', label: 'Svelte Flow', icon: Network, description: 'Native Svelte' },
		{ value: 'g6', label: 'G6 (AntV)', icon: Zap, description: 'High Performance' }
	] as const;
</script>

<svelte:head>
	<title>Ontology Graph - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<div class="admin-page">
		<AdminPageHeader
			title="Ontology Graph"
			description="Visualize and explore the complete ontology system"
			icon={Workflow}
			backHref="/admin"
		/>

		<!-- Graph Library Selector -->
		<div class="mt-4 mb-2">
			<div
				class="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm"
			>
				{#each libraryOptions as option}
					<button
						type="button"
						class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
							{graphLibrary === option.value
							? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
							: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}"
						onclick={() => (graphLibrary = option.value)}
					>
						<svelte:component this={option.icon} class="w-4 h-4" />
						<span>{option.label}</span>
						<span
							class="hidden sm:inline text-xs px-1.5 py-0.5 rounded-full
								{graphLibrary === option.value
								? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}"
						>
							{option.description}
						</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-6 mt-4">
			<div
				class="w-full h-[72vh] sm:h-[78vh] lg:h-[calc(100vh-16rem)] rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
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

			<div class="grid gap-4 lg:grid-cols-2">
				<section
					class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
				>
					<GraphControls bind:viewMode {graphInstance} {graphLibrary} stats={data.stats} />
				</section>

				<section
					class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
				>
					{#if selectedNode}
						<NodeDetailsPanel node={selectedNode} onClose={() => (selectedNode = null)}
						></NodeDetailsPanel>
					{:else}
						<div
							class="flex h-full items-center justify-center p-6 text-sm text-gray-500 dark:text-gray-400"
						>
							Select a node to view its details.
						</div>
					{/if}
				</section>
			</div>
		</div>
	</div>
</div>
