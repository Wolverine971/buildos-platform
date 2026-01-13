<!-- apps/web/src/lib/components/projects/ProjectsHeader.svelte -->
<!-- Inkprint Design System: Uses semantic tokens and micro-label pattern -->
<script lang="ts">
	import { Plus, LoaderCircle } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let projectCount: number = 0;
	export let creatingProject: boolean = false;

	const dispatch = createEventDispatcher();

	function handleNewProject() {
		dispatch('newProject');
	}
</script>

<div
	class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6"
>
	<div class="space-y-1">
		<p class="micro-label text-accent">YOUR WORKSPACE</p>
		<h1 class="text-xl sm:text-2xl lg:text-3xl font-semibold text-foreground">Projects</h1>
		<p class="text-sm text-muted-foreground hidden sm:block">
			Organize and track your work and personal projects
		</p>
	</div>
	<Button onclick={handleNewProject} disabled={creatingProject} variant="primary" size="md">
		{#if creatingProject}
			<LoaderCircle class="w-4 h-4 mr-2 animate-spin" />
			Creating...
		{:else}
			<Plus class="w-4 h-4 mr-2" />
			New Project
		{/if}
	</Button>
</div>
