<!-- apps/web/src/lib/components/projects/ProjectsEmptyState.svelte -->
<script lang="ts">
	import { FolderOpen, FileText, Plus } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let type: 'projects' | 'briefs' = 'projects';
	export let hasFilters: boolean = false;
	export let message: string = '';

	const dispatch = createEventDispatcher();

	const defaultMessages = {
		projects: {
			withFilters: 'No projects match your criteria',
			withFiltersSubtext: 'Try adjusting your search or filter settings',
			noData: 'No projects yet',
			noDataSubtext:
				'Projects help you organize related tasks and track progress toward specific outcomes. Create your first project to get started.'
		},
		briefs: {
			withFilters: 'No briefs found',
			withFiltersSubtext: 'Try adjusting your search or filter settings',
			noData: 'No briefs found',
			noDataSubtext: 'Project briefs will appear here once generated'
		}
	};

	$: config = defaultMessages[type];
	$: icon = type === 'projects' ? FolderOpen : FileText;
	$: title = hasFilters ? config.withFilters : config.noData;
	$: subtext = message || (hasFilters ? config.withFiltersSubtext : config.noDataSubtext);

	function handleClearFilters() {
		dispatch('clearFilters');
	}

	function handleCreateProject() {
		dispatch('createProject');
	}
</script>

<div class="text-center py-16">
	<div
		class="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md mx-auto shadow-sm
			border border-gray-200 dark:border-gray-700"
	>
		{#if icon}
			<svelte:component
				this={icon}
				class="w-{hasFilters ? '12' : '16'} h-{hasFilters ? '12' : '16'}
					text-gray-400 mx-auto mb-4"
			/>
		{/if}
		<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
			{title}
		</h3>
		<p class="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
			{subtext}
		</p>

		{#if hasFilters}
			<Button onclick={handleClearFilters} variant="secondary" size="md">
				Clear Filters
			</Button>
		{:else if type === 'projects'}
			<Button onclick={handleCreateProject} variant="primary" size="md" icon={Plus}>
				Create your first project
			</Button>
		{/if}
	</div>
</div>
