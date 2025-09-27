<!-- src/lib/components/projects/ProjectsHeader.svelte -->
<script lang="ts">
	import { FolderOpen, Plus, Loader2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let projectCount: number = 0;
	export let creatingProject: boolean = false;

	const dispatch = createEventDispatcher();

	function handleNewProject() {
		dispatch('newProject');
	}
</script>

<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
			<FolderOpen class="w-8 h-8 mr-3 text-blue-600 dark:text-blue-400" />
			Projects
		</h1>
		<p class="text-gray-600 dark:text-gray-400 mt-2">
			Organize and track your work and personal projects
		</p>
	</div>
	<Button on:click={handleNewProject} disabled={creatingProject} variant="primary" size="md">
		{#if creatingProject}
			<Loader2 class="w-4 h-4 mr-2 animate-spin" />
			Creating...
		{:else}
			<Plus class="w-4 h-4 mr-2" />
			New Project
		{/if}
	</Button>
</div>
