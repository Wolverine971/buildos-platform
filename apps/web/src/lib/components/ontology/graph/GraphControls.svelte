<!-- apps/web/src/lib/components/ontology/graph/GraphControls.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		Search,
		Download,
		Hexagon,
		FolderKanban,
		ListChecks,
		Calendar,
		Target,
		Flag,
		Layers,
		FileText
	} from 'lucide-svelte';
	import type { GraphStats, OntologyGraphInstance, ViewMode } from './lib/graph.types';

	type GraphLibrary = 'cytoscape' | 'svelteflow' | 'g6';

	let {
		viewMode = $bindable<ViewMode>(),
		graphInstance,
		graphLibrary = 'cytoscape',
		stats
	}: {
		viewMode: ViewMode;
		graphInstance: OntologyGraphInstance | null;
		graphLibrary: GraphLibrary;
		stats: GraphStats;
	} = $props();

	// Feature support by library
	const libraryFeatures: Record<GraphLibrary, { layout: boolean; search: boolean; filter: boolean; fitToView: boolean; export: boolean }> = {
		cytoscape: { layout: true, search: true, filter: true, fitToView: true, export: true },
		svelteflow: { layout: false, search: false, filter: false, fitToView: false, export: false },
		g6: { layout: false, search: false, filter: false, fitToView: false, export: false }
	};

	let features = $derived(libraryFeatures[graphLibrary]);

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
		{ value: 'plan', label: 'Plans' },
		{ value: 'goal', label: 'Goals' },
		{ value: 'milestone', label: 'Milestones' },
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
					<span class="text-gray-600 dark:text-gray-400">Tasks</span>
					<span class="font-semibold">{stats.totalTasks}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Plans</span>
					<span class="font-semibold text-indigo-600 dark:text-indigo-400">
						{stats.totalPlans}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Goals</span>
					<span class="font-semibold text-amber-600 dark:text-amber-400">
						{stats.totalGoals}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Milestones</span>
					<span class="font-semibold text-emerald-600 dark:text-emerald-400">
						{stats.totalMilestones}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Outputs</span>
					<span class="font-semibold text-purple-600 dark:text-purple-400">
						{stats.totalOutputs}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Documents</span>
					<span class="font-semibold text-blue-600 dark:text-blue-400">
						{stats.totalDocuments}
					</span>
				</div>
				<div class="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
					<span class="text-gray-600 dark:text-gray-400">Relationships</span>
					<span class="font-semibold">{stats.totalEdges}</span>
				</div>
			</div>
		</CardBody>
	</Card>

	<!-- Entity Type Legend -->
	<Card variant="default">
		<CardHeader variant="gradient">
			<h3 class="font-semibold text-white text-sm">Node Legend</h3>
		</CardHeader>
		<CardBody padding="sm">
			<div class="grid grid-cols-2 gap-1.5 text-xs">
				<div class="flex items-center gap-1.5">
					<Hexagon class="w-3.5 h-3.5 text-blue-500" />
					<span class="text-gray-700 dark:text-gray-300">Template</span>
				</div>
				<div class="flex items-center gap-1.5">
					<FolderKanban class="w-3.5 h-3.5 text-emerald-500" />
					<span class="text-gray-700 dark:text-gray-300">Project</span>
				</div>
				<div class="flex items-center gap-1.5">
					<ListChecks class="w-3.5 h-3.5 text-gray-500" />
					<span class="text-gray-700 dark:text-gray-300">Task</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Calendar class="w-3.5 h-3.5 text-indigo-500" />
					<span class="text-gray-700 dark:text-gray-300">Plan</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Target class="w-3.5 h-3.5 text-amber-500" />
					<span class="text-gray-700 dark:text-gray-300">Goal</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Flag class="w-3.5 h-3.5 text-emerald-500" />
					<span class="text-gray-700 dark:text-gray-300">Milestone</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Layers class="w-3.5 h-3.5 text-purple-500" />
					<span class="text-gray-700 dark:text-gray-300">Output</span>
				</div>
				<div class="flex items-center gap-1.5">
					<FileText class="w-3.5 h-3.5 text-blue-500" />
					<span class="text-gray-700 dark:text-gray-300">Document</span>
				</div>
			</div>
		</CardBody>
	</Card>

	<!-- Edge Type Legend -->
	<Card variant="default">
		<CardHeader variant="gradient">
			<h3 class="font-semibold text-white text-sm">Edge Legend</h3>
		</CardHeader>
		<CardBody padding="sm">
			<div class="space-y-1.5 text-xs">
				<div class="flex items-center gap-2">
					<div class="w-6 h-0.5 bg-gray-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Hierarchical</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="w-6 h-1 bg-amber-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Goal Support</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="w-6 h-0.5 bg-orange-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Dependencies</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="w-6 h-0.5 bg-emerald-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Milestones</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="w-6 h-0.5 bg-blue-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Documents</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="w-6 h-0.5 bg-purple-500"></div>
					<span class="text-gray-700 dark:text-gray-300">Outputs</span>
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

	{#if features.layout}
		<div class="space-y-2">
			<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Layout</div>
			<Select bind:value={selectedLayout} size="sm" placeholder="" class="w-full text-sm">
				{#each layouts as layout}
					<option value={layout.value}>{layout.label}</option>
				{/each}
			</Select>
		</div>
	{:else}
		<div class="space-y-2">
			<div class="block text-xs font-semibold text-gray-700 dark:text-gray-300">Layout</div>
			<div class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-md px-3 py-2">
				{graphLibrary === 'g6' ? 'Hierarchical (DAG)' : graphLibrary === 'svelteflow' ? 'Auto-layout' : 'Default'}
				<span class="text-gray-400 dark:text-gray-500 ml-1">(fixed)</span>
			</div>
		</div>
	{/if}

	{#if features.search}
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
	{/if}

	{#if features.filter}
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
	{/if}

	{#if features.fitToView || features.export}
		<div class="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
			{#if features.fitToView}
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
			{/if}

			{#if features.export}
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
			{/if}
		</div>
	{/if}

	{#if !features.search && !features.filter}
		<div class="text-xs text-gray-500 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
			<span class="font-medium text-amber-700 dark:text-amber-400">Note:</span> Search, filter, and export features are only available with Cytoscape.
		</div>
	{/if}
</div>
