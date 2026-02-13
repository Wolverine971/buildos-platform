<!-- apps/web/src/lib/components/briefs/ProjectBriefGrid.svelte -->
<script lang="ts">
	import { FolderOpen, Clock, Eye } from 'lucide-svelte';
	import type { ProjectDailyBrief } from '$lib/types/daily-brief';
	import ProjectBriefModal from './ProjectBriefModal.svelte';
	import ProjectBriefCard from './ProjectBriefCard.svelte';

	export let briefs: ProjectDailyBrief[] = [];
	export let title = 'Project Briefs';
	export let showTitle = true;

	let selectedBrief: ProjectDailyBrief | null = null;
	let isModalOpen = false;

	function handleOpenBrief(brief: ProjectDailyBrief) {
		selectedBrief = brief;
		isModalOpen = true;
	}

	function handleCloseModal() {
		isModalOpen = false;
		// Delay clearing the brief to allow for smooth animation
		setTimeout(() => {
			selectedBrief = null;
		}, 200);
	}

	function truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}

	function formatTime(dateString: string): string {
		return new Date(dateString).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

{#if briefs.length > 0}
	<div class="space-y-4">
		{#if showTitle}
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold text-foreground flex items-center">
					<FolderOpen class="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
					{title}
				</h3>
				<span class="text-sm text-muted-foreground"
					>{briefs.length} projects</span
				>
			</div>
		{/if}

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each briefs as brief}
				<ProjectBriefCard {brief} on:open={() => handleOpenBrief(brief)} />
			{/each}
		</div>
	</div>

	<ProjectBriefModal brief={selectedBrief} isOpen={isModalOpen} on:close={handleCloseModal} />
{:else}
	<div class="text-center py-8">
		<div
			class="bg-card rounded-lg p-6 border border-border"
		>
			<FolderOpen class="h-12 w-12 text-muted-foreground mx-auto mb-3" />
			<h3 class="text-lg font-semibold text-foreground mb-2">
				No Project Briefs
			</h3>
			<p class="text-sm text-muted-foreground">
				Project briefs will appear here when available
			</p>
		</div>
	</div>
{/if}
