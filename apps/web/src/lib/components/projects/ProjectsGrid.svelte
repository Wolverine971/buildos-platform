<!-- apps/web/src/lib/components/projects/ProjectsGrid.svelte -->
<script lang="ts">
	import ProjectCard from '$lib/components/project/ProjectCard.svelte';
	import { createEventDispatcher } from 'svelte';
	import type { Project } from '$lib/types/project';

	export let projects: Project[] = [];
	export let projectBriefsMap: Map<string, any> = new Map();

	const dispatch = createEventDispatcher<{
		projectClick: { projectId: string; event?: Event };
		viewBrief: any;
	}>();

	function handleCardClick(event: MouseEvent, projectId: string) {
		// Only track the click, don't prevent default navigation
		dispatch('projectClick', { projectId, event });
	}

	function handleViewBrief(brief: any) {
		dispatch('viewBrief', brief);
	}
</script>

<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
	{#each projects as project (project.id)}
		<div
			class={`group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden ${project.status === 'archived' ? 'archived-card' : ''}`}
			onclick={(e) => handleCardClick(e, project.id)}
			role="presentation"
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
