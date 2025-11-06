<!-- apps/web/src/routes/admin/ontology/graph/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';
	import { Workflow } from 'lucide-svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import OntologyGraph from './OntologyGraph.svelte';
	import GraphControls from './GraphControls.svelte';
	import NodeDetailsPanel from './NodeDetailsPanel.svelte';
	import type { OntologyGraphInstance, ViewMode, GraphNode } from './lib/ontology-graph.types';

	let { data }: { data: PageData } = $props();

	let selectedNode = $state<GraphNode | null>(null);
	let graphInstance = $state<OntologyGraphInstance | null>(null);
	let viewMode = $state<ViewMode>('templates');
	let isMobileMenuOpen = $state(false);
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

		<!-- Mobile menu toggle button -->
		<button
			class="lg:hidden fixed top-24 left-4 z-50 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
			aria-label="Toggle graph controls"
			onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
		>
			<svg
				class="w-6 h-6 text-gray-700 dark:text-gray-300"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 6h16M4 12h16M4 18h16"
				/>
			</svg>
		</button>

		<!-- Main layout container with responsive height -->
		<div class="flex h-[80vh] sm:h-[85vh] lg:h-[calc(100vh-12rem)] gap-4 mt-6">
			<!-- Left sidebar (controls) - Desktop: static, Mobile: fixed overlay -->
			<aside
				class="w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden
				       lg:relative lg:block
				       fixed inset-y-0 left-0 z-40 transform transition-transform duration-300
				       {isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
			>
				<GraphControls bind:viewMode {graphInstance} stats={data.stats} />
			</aside>

			<!-- Mobile backdrop overlay -->
			{#if isMobileMenuOpen}
				<button
					class="fixed inset-0 bg-black/50 z-30 lg:hidden"
					aria-label="Close graph controls"
					onclick={() => (isMobileMenuOpen = false)}
					tabindex="-1"
				/>
			{/if}

			<!-- Main graph content area -->
			<div
				class="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden min-w-0"
			>
				<OntologyGraph {data} {viewMode} bind:selectedNode bind:graphInstance />
			</div>

			<!-- Right sidebar (node details) - Desktop only -->
			{#if selectedNode}
				<aside
					class="hidden lg:flex lg:flex-col w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
				>
					<NodeDetailsPanel node={selectedNode} onClose={() => (selectedNode = null)} />
				</aside>
			{/if}
		</div>
	</div>

	<!-- Mobile node details modal (bottom sheet) -->
	{#if selectedNode}
		<div
			class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 lg:hidden"
			onclick={(e) => {
				if (e.target === e.currentTarget) selectedNode = null;
			}}
		>
			<div
				class="w-full max-w-xl max-h-[80vh] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
			>
				<NodeDetailsPanel node={selectedNode} onClose={() => (selectedNode = null)} />
			</div>
		</div>
	{/if}
</div>
