<!-- apps/web/src/lib/components/projects/ProjectsFilterBar.svelte -->
<script lang="ts">
	import { Search, Filter, Calendar } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import type { ProjectFilter, BriefDateRange } from '$lib/types/projects-page';
	import type { Project } from '$lib/types/project';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';

	export let showSearch: boolean = false;
	export let searchQuery: string = '';
	export let activeTab: 'projects' | 'briefs' = 'projects';
	export let projectFilter: ProjectFilter = 'all';
	export let briefDateRange: BriefDateRange = 'week';
	export let selectedProjectFilter: string = 'all';
	export let filterCounts: {
		all: number;
		active: number;
		paused: number;
		completed: number;
		archived: number;
	} = {
		all: 0,
		active: 0,
		paused: 0,
		completed: 0,
		archived: 0
	};
	export let projects: Project[] = [];
	export let briefsLoaded: boolean = false;

	const dispatch = createEventDispatcher();

	function handleSearchInput() {
		dispatch('searchChange', searchQuery);
	}

	function handleProjectFilterChange() {
		dispatch('projectFilterChange', projectFilter);
	}

	function handleBriefDateRangeChange() {
		dispatch('briefDateRangeChange', briefDateRange);
	}

	function handleSelectedProjectChange() {
		dispatch('selectedProjectChange', selectedProjectFilter);
	}
</script>

{#if showSearch || activeTab !== 'projects'}
	<div class="flex flex-col sm:flex-row gap-4">
		<!-- Search Input -->
		{#if showSearch}
			<div class="flex-1">
				<TextInput
					bind:value={searchQuery}
					oninput={handleSearchInput}
					placeholder={activeTab === 'projects'
						? 'Search projects...'
						: 'Search briefs...'}
					icon={Search}
					size="md"
				/>
			</div>
		{/if}

		<!-- Filter Controls -->
		{#if activeTab === 'projects'}
			<div class="flex items-center space-x-2">
				<Select
					bind:value={projectFilter}
					onchange={handleProjectFilterChange}
					size="md"
					placeholder="All Projects"
				>
					<option value="all">All Projects ({filterCounts.all})</option>
					<option value="active">Active ({filterCounts.active})</option>
					<option value="paused">Paused ({filterCounts.paused})</option>
					<option value="completed">Completed ({filterCounts.completed})</option>
					<option value="archived">Archived ({filterCounts.archived})</option>
				</Select>
			</div>
		{:else if briefsLoaded}
			<div class="flex items-center space-x-2">
				<Calendar class="w-4 h-4 text-muted-foreground" />
				<Select
					bind:value={briefDateRange}
					onchange={handleBriefDateRangeChange}
					size="md"
					placeholder="This Week"
				>
					<option value="today">Today</option>
					<option value="week">This Week</option>
					<option value="month">This Month</option>
					<option value="all">All Time</option>
				</Select>
			</div>
			<div class="flex items-center space-x-2">
				<Select
					bind:value={selectedProjectFilter}
					onchange={handleSelectedProjectChange}
					size="md"
					placeholder="All Projects"
				>
					<option value="all">All Projects</option>
					{#each projects as project (project.id)}
						<option value={project.id}>{project.name}</option>
					{/each}
				</Select>
			</div>
		{/if}
	</div>
{/if}
