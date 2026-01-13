<!-- apps/web/src/lib/components/projects/BriefsGrid.svelte -->
<!-- Inkprint Design System: Uses semantic tokens and pulse texture for loading -->
<script lang="ts">
	import { LoaderCircle } from 'lucide-svelte';
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
	<div class="flex items-center justify-center py-12 sm:py-16">
		<div
			class="bg-card rounded-xl p-6 sm:p-8 max-w-md mx-auto shadow-ink border border-border tx tx-pulse tx-weak text-center"
		>
			<LoaderCircle class="w-8 h-8 animate-spin text-accent mx-auto mb-4" />
			<span class="text-sm text-muted-foreground">Loading briefs...</span>
		</div>
	</div>
{:else}
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
		{#each briefs as brief (brief.id)}
			<ProjectBriefCard {brief} on:open={() => handleViewBrief(brief)} />
		{/each}
	</div>
{/if}
