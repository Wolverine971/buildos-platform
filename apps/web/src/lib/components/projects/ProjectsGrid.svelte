<!-- src/lib/components/projects/ProjectsGrid.svelte -->
<script lang="ts">
	import ProjectCard from '$lib/components/project/ProjectCard.svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Project } from '$lib/types/project';

	export let projects: Project[] = [];
	export let loadingProjectId: string = '';
	export let projectBriefsMap: Map<string, any> = new Map();

	const dispatch = createEventDispatcher<{
		projectClick: { projectId: string; event?: Event };
		viewBrief: any;
	}>();

	function handleProjectClick(projectId: string, event?: Event) {
		dispatch('projectClick', { projectId, event });
	}

	function handleViewBrief(brief: any) {
		dispatch('viewBrief', brief);
	}
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
	{#each projects as project (project.id)}
		<div
			class={`group block bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden ${loadingProjectId === project.id ? 'pulse' : ''} ${project.status === 'archived' ? 'archived-card' : ''}`}
			on:click={(e) => handleProjectClick(project.id, e)}
			role="button"
			tabindex="0"
			on:keydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					handleProjectClick(project.id, e);
				}
			}}
		>
			<ProjectCard
				{project}
				projectBrief={projectBriefsMap.get(project.id)}
				on:viewBrief={(e) => handleViewBrief(e.detail)}
			/>
		</div>
	{/each}
</div>

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.pulse {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.archived-card {
		background-color: #f9fafb;
		border-style: dashed;
		border-color: #d1d5db;
	}

	:global(.dark) .archived-card {
		background-color: rgba(17, 24, 39, 0.6);
		border-color: #374151;
	}
</style>
