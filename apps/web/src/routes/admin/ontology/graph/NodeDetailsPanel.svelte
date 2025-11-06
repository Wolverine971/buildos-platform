<!-- apps/web/src/routes/admin/ontology/graph/NodeDetailsPanel.svelte -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { X, ExternalLink, Network } from 'lucide-svelte';
	import type { GraphNode } from './lib/ontology-graph.types';

	let { node, onClose }: { node: GraphNode | null; onClose: () => void } = $props();

	const typeColors: Record<string, string> = {
		template: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
		project: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
		task: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
		output: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
		document: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
	};

	function formatMetadata(metadata: Record<string, unknown> | undefined) {
		if (!metadata) return [];

		return Object.entries(metadata)
			.filter(([, value]) => value !== null && value !== undefined)
			.map(([key, value]) => ({
				key: key
					.replace(/([A-Z])/g, ' $1')
					.replace(/_/g, ' ')
					.replace(/^./, (str) => str.toUpperCase()),
				value:
					typeof value === 'object' && value !== null
						? JSON.stringify(value, null, 2)
						: String(value)
			}));
	}

	function navigateToDetail() {
		const routes: Record<string, string> = {
			project: '/ontology/projects',
			template: '/ontology/templates',
			output: '/ontology/projects',
			task: '/ontology/projects',
			document: '/ontology/projects'
		};

		const base = routes[node?.type];
		if (base) {
			window.location.href = `${base}/${node.id}`;
		}
	}
</script>

<div class="h-full flex flex-col bg-white dark:bg-gray-800">
	<header
		class="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700"
	>
		<div class="flex-1">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
				{node?.label ?? 'Untitled'}
			</h2>
			{#if node?.type}
				<span
					class="inline-block px-2 py-1 text-xs rounded-full font-semibold {typeColors[
						node.type
					] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}"
				>
					{node.type}
				</span>
			{/if}
		</div>
		<Button
			variant="ghost"
			size="sm"
			class="p-2 text-gray-500 dark:text-gray-400"
			onclick={onClose}
			aria-label="Close details panel"
		>
			<X class="w-4 h-4" />
		</Button>
	</header>

	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<Card variant="default">
			<CardHeader variant="default">
				<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
					Basic Information
				</h3>
			</CardHeader>
			<CardBody padding="md">
				<dl class="space-y-2 text-xs">
					<div class="flex justify-between">
						<dt class="text-gray-600 dark:text-gray-400">ID</dt>
						<dd class="font-mono text-[11px] text-gray-900 dark:text-white">
							{(node?.id ?? '').toString().slice(0, 8)}…
						</dd>
					</div>
					{#if typeof node?.connectedEdges === 'number'}
						<div class="flex justify-between">
							<dt class="text-gray-600 dark:text-gray-400">Connections</dt>
							<dd class="font-semibold text-gray-900 dark:text-white">
								{node.connectedEdges}
							</dd>
						</div>
					{/if}
					{#if typeof node?.neighbors === 'number'}
						<div class="flex justify-between">
							<dt class="text-gray-600 dark:text-gray-400">Neighbors</dt>
							<dd class="font-semibold text-gray-900 dark:text-white">
								{node.neighbors}
							</dd>
						</div>
					{/if}
				</dl>
			</CardBody>
		</Card>

		{#if node?.metadata && Object.keys(node.metadata).length > 0}
			<Card variant="default">
				<CardHeader variant="default">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-white">Properties</h3>
				</CardHeader>
				<CardBody padding="md">
					<dl class="space-y-3 text-xs">
						{#each formatMetadata(node.metadata) as prop (prop.key)}
							<div class="space-y-1">
								<dt class="text-gray-600 dark:text-gray-400">{prop.key}</dt>
								<dd>
									{#if prop.value.startsWith('{') || prop.value.startsWith('[')}
										<pre
											class="text-[10px] leading-snug bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-2 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
{prop.value}
										</pre>
									{:else}
										<span class="text-gray-900 dark:text-white"
											>{prop.value}</span
										>
									{/if}
								</dd>
							</div>
						{/each}
					</dl>
				</CardBody>
			</Card>
		{/if}
	</div>

	<CardFooter
		class="flex-col items-stretch justify-start gap-2 px-4 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
	>
		<Button variant="primary" size="sm" fullWidth={true} onclick={navigateToDetail}>
			<ExternalLink class="w-4 h-4 mr-2" />
			View Detail Page
		</Button>
		<Button variant="secondary" size="sm" fullWidth={true} onclick={() => {}}>
			<Network class="w-4 h-4 mr-2" />
			Show Related Nodes
		</Button>
	</CardFooter>
</div>
