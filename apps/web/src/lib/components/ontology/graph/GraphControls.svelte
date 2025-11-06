<!-- apps/web/src/lib/components/ontology/graph/GraphControls.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Search, Download } from 'lucide-svelte';
	import type { GraphStats, OntologyGraphInstance, ViewMode } from './lib/graph.types';

	let {
		viewMode = $bindable<ViewMode>(),
		graphInstance,
		stats
	}: {
		viewMode: ViewMode;
		graphInstance: OntologyGraphInstance | null;
		stats: GraphStats;
	} = $props();

	let searchQuery = $state('');
	let selectedLayout = $state('dagre');
	let selectedFilter = $state('all');

	const layouts = [
		{ value: 'dagre', label: 'Hierarchical (DAG)' },
		{ value: 'cola', label: 'Force-Directed (Cola)' },
		{ value: 'cose-bilkent', label: 'Spring (COSE)' },
		{ value: 'circle', label: 'Circular' }
	];

	const filters = [
		{ value: 'all', label: 'All Nodes' },
		{ value: 'template', label: 'Templates' },
		{ value: 'project', label: 'Projects' },
		{ value: 'task', label: 'Tasks' },
		{ value: 'output', label: 'Outputs' },
		{ value: 'document', label: 'Documents' }
	];

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	const handleFilterSelect = (event: CustomEvent<string>) => {
		const value = event.detail;
		selectedFilter = value ?? 'all';
	};

	function handleSearch() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			const query = searchQuery.trim();
			graphInstance?.search(query);
			if (typeof window !== 'undefined') {
				window.dispatchEvent(
					new CustomEvent('ontology-graph.interaction', {
						detail: {
							type: 'search',
							query
						}
					})
				);
			}
		}, 300);
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
						detail: {
							type: 'layout_change',
							value: selectedLayout
						}
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
					detail: {
						type: 'filter',
						value: selectedFilter
					}
				})
			);
		}
	});
</script>

<div class="p-4 space-y-4 h-full overflow-y-auto bg-white dark:bg-gray-800">
	<Card variant="default">
		<CardHeader variant="gradient">
			<h3 class="font-semibold text-white text-sm">Ontology Statistics</h3>
		</CardHeader>
		<CardBody padding="md">
			<div class="space-y-2 text-xs text-gray-900 dark:text-white">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Templates</span>
					<span class="font-semibold">{stats.totalTemplates}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Projects</span>
					<span class="font-semibold">{stats.totalProjects}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Active Projects</span>
					<span class="font-semibold text-green-600 dark:text-green-400">
						{stats.activeProjects}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Relationships</span>
					<span class="font-semibold">{stats.totalEdges}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Tasks</span>
					<span class="font-semibold">{stats.totalTasks}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Outputs</span>
					<span class="font-semibold">{stats.totalOutputs}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Documents</span>
					<span class="font-semibold">{stats.totalDocuments}</span>
				</div>
			</div>
		</CardBody>
	</Card>

	<div class="space-y-2">
		<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">View Mode</div>
		<Select bind:value={viewMode} size="sm" placeholder="" class="w-full text-sm">
			<option value="templates">Templates Hierarchy</option>
			<option value="projects">Projects & Entities</option>
			<option value="full">Complete Ontology</option>
		</Select>
	</div>

	<div class="space-y-2">
		<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Layout</div>
		<Select bind:value={selectedLayout} size="sm" placeholder="" class="w-full text-sm">
			{#each layouts as layout}
				<option value={layout.value}>{layout.label}</option>
			{/each}
		</Select>
	</div>

	<div class="space-y-2">
		<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Search Nodes</div>
		<TextInput
			bind:value={searchQuery}
			oninput={handleSearch}
			placeholder="Type to search..."
			size="sm"
			icon={Search}
			class="text-sm"
		/>
	</div>

	<div class="space-y-2">
		<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Filter</div>
		<Select
			bind:value={selectedFilter}
			size="sm"
			placeholder=""
			class="w-full text-sm"
			onchange={handleFilterSelect}
		>
			{#each filters as filter}
				<option value={filter.value}>{filter.label}</option>
			{/each}
		</Select>
	</div>

	<div class="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button
			onclick={() => {
				graphInstance?.fitToView();
				if (typeof window !== 'undefined') {
					window.dispatchEvent(
						new CustomEvent('ontology-graph.interaction', {
							detail: {
								type: 'fit_to_view'
							}
						})
					);
				}
			}}
			variant="primary"
			size="sm"
			fullWidth={true}
		>
			Fit to View
		</Button>

		<Button
			onclick={() => {
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
								detail: {
									type: 'export',
									format: 'png'
								}
							})
						);
					}
				}
			}}
			variant="secondary"
			size="sm"
			fullWidth={true}
			icon={Download}
		>
			Export as PNG
		</Button>
	</div>
</div>
