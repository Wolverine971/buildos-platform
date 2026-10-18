<!-- apps/web/src/routes/admin/ontology/graph/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { Workflow } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import type {
		OntologyGraphInstance,
		ViewMode,
		GraphNode
	} from '$lib/components/ontology/graph/lib/graph.types';

	let { data }: { data: PageData } = $props();

	let selectedNode = $state<GraphNode | null>(null);
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let viewMode = $state<ViewMode>('projects'); // Default to Projects & Entities
</script>

<svelte:head>
	<title>Ontology Graph - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Ontology Graph"
		description="Visualize and explore a bounded recent ontology graph"
		icon={Workflow}
		backHref="/admin"
	/>

	<div class="flex flex-col gap-4 mt-4">
		<!-- Graph Container -->
		<div
			class="w-full h-[72vh] sm:h-[78vh] lg:h-[calc(100vh-16rem)] rounded-lg border border-border bg-card shadow-ink overflow-hidden touch-none"
		>
			{#await import('$lib/components/ontology/graph/OntologyGraph.svelte')}
				<div
					class="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
				>
					Loading graph...
				</div>
			{:then { default: OntologyGraph }}
				<OntologyGraph {data} {viewMode} bind:selectedNode bind:graphInstance />
			{:catch}
				<div class="flex h-full items-center justify-center p-6 text-sm text-destructive">
					Unable to load graph.
				</div>
			{/await}
		</div>

		<!-- Controls Grid -->
		<div class="grid gap-4 lg:grid-cols-2">
			<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
				{#await import('$lib/components/ontology/graph/GraphControls.svelte')}
					<div class="p-6 text-sm text-muted-foreground">Loading graph controls...</div>
				{:then { default: GraphControls }}
					<GraphControls
						bind:viewMode
						{graphInstance}
						stats={data.stats}
						showScopeControls={false}
					/>
				{:catch}
					<div class="p-6 text-sm text-destructive">Unable to load graph controls.</div>
				{/await}
			</section>

			<section class="rounded-lg border border-border bg-card shadow-ink overflow-hidden">
				{#if selectedNode}
					{#await import('$lib/components/ontology/graph/NodeDetailsPanel.svelte')}
						<div class="p-6 text-sm text-muted-foreground">Loading node details...</div>
					{:then { default: NodeDetailsPanel }}
						<NodeDetailsPanel
							node={selectedNode}
							onClose={() => (selectedNode = null)}
						/>
					{:catch}
						<div class="p-6 text-sm text-destructive">Unable to load node details.</div>
					{/await}
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
