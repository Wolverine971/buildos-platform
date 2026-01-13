<!-- apps/web/src/lib/components/projects/ProjectsGrid.svelte -->
<!-- Inkprint Design System: Uses semantic tokens, pressable interaction, and proper textures -->
<script lang="ts">
	import ProjectCard from '$lib/components/project/ProjectCard.svelte';
	import type { Project } from '$lib/types/project';

	interface Props {
		projects?: Project[];
		projectBriefsMap?: Map<string, any>;
		onprojectclick?: (data: { projectId: string; event?: Event }) => void;
		onviewbrief?: (brief: any) => void;
	}

	let {
		projects = [],
		projectBriefsMap = new Map(),
		onprojectclick,
		onviewbrief
	}: Props = $props();

	function handleCardClick(event: MouseEvent, projectId: string) {
		// Only track the click, don't prevent default navigation
		onprojectclick?.({ projectId, event });
	}

	function handleViewBrief(brief: any) {
		onviewbrief?.(brief);
	}
</script>

<div class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-4">
	{#each projects as project (project.id)}
		<div
			class="group bg-card rounded-lg sm:rounded-xl shadow-ink hover:shadow-ink-strong transition-all duration-[120ms] border overflow-hidden tx tx-frame tx-weak pressable {project.status ===
			'archived'
				? 'border-dashed border-border/60 opacity-75'
				: 'border-border hover:border-accent/60'}"
			onclick={(e) => handleCardClick(e, project.id)}
			role="presentation"
		>
			<ProjectCard
				{project}
				projectBrief={projectBriefsMap.get(project.id)}
				onviewbrief={handleViewBrief}
			/>
		</div>
	{/each}
</div>
