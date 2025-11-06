<!-- apps/web/src/routes/admin/ontology/graph/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { Workflow } from 'lucide-svelte';
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
</script>

<svelte:head>
	<title>Ontology Graph - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<AdminPageHeader
			title="Ontology Graph"
			description="Visualize and explore the complete ontology system"
			icon={Workflow}
			backHref="/admin"
		/>

		<div class="flex flex-col gap-6 mt-6">
			<div
				class="w-full h-[72vh] sm:h-[78vh] lg:h-[calc(100vh-14rem)] rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
			>
				<OntologyGraph {data} {viewMode} bind:selectedNode bind:graphInstance />
			</div>

			<div class="grid gap-4 lg:grid-cols-2">
				<section
					class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
				>
					<GraphControls bind:viewMode {graphInstance} stats={data.stats} />
				</section>

				<section
					class="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
				>
					{#if selectedNode}
						<NodeDetailsPanel
							node={selectedNode}
							onClose={() => (selectedNode = null)}
						/>
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
