<!-- apps/web/src/lib/components/ui/skeletons/NotesListSkeleton.svelte -->
<script lang="ts">
	export let count = 3;
</script>

<div class="space-y-4">
	{#each Array(count) as _, i}
		<div
			class="bg-card rounded-lg p-6 shadow-sm border border-border animate-pulse"
		>
			<!-- Note header -->
			<div class="flex items-start justify-between mb-4">
				<div class="flex-1">
					<!-- Title -->
					<div class="h-6 bg-muted rounded w-3/4 mb-2"></div>
					<!-- Metadata -->
					<div class="flex items-center gap-3">
						<div class="h-4 bg-muted rounded w-24"></div>
						<div class="h-4 bg-muted rounded w-20"></div>
					</div>
				</div>
				<!-- Actions -->
				<div class="flex gap-2">
					<div class="h-8 w-8 bg-muted rounded"></div>
					<div class="h-8 w-8 bg-muted rounded"></div>
				</div>
			</div>

			<!-- Note content -->
			<div class="space-y-2">
				<div class="h-4 bg-muted rounded w-full"></div>
				<div class="h-4 bg-muted rounded w-5/6"></div>
				<div class="h-4 bg-muted rounded w-4/6"></div>
			</div>

			<!-- Tags -->
			<div class="flex gap-2 mt-4">
				<div class="h-6 bg-muted rounded-full w-16"></div>
				<div class="h-6 bg-muted rounded-full w-20"></div>
			</div>
		</div>
	{/each}
</div>
