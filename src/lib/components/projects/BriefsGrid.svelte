<!-- src/lib/components/projects/BriefsGrid.svelte -->
<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import ProjectBriefCard from '$lib/components/project/ProjectBriefCard.svelte';
	import { createEventDispatcher } from 'svelte';

	export let briefs: any[] = [];
	export let loading: boolean = false;

	const dispatch = createEventDispatcher<{
		viewBrief: any;
	}>();

	function handleViewBrief(brief: any) {
		dispatch('viewBrief', brief);
	}
</script>

{#if loading}
	<div class="flex items-center justify-center py-16">
		<div
			class="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md mx-auto shadow-sm
				border border-gray-200 dark:border-gray-700"
		>
			<Loader2
				class="w-8 h-8 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4"
			/>
			<span class="text-gray-600 dark:text-gray-400">Loading briefs...</span>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		{#each briefs as brief (brief.id)}
			<ProjectBriefCard {brief} on:open={() => handleViewBrief(brief)} />
		{/each}
	</div>
{/if}
