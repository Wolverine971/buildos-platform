<!-- apps/web/src/lib/components/ui/skeletons/BriefsSkeleton.svelte -->
<script lang="ts">
	export let count = 3;
</script>

<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
	{#each Array(count) as _, i}
		<div
			class="bg-card rounded-lg p-6 shadow-sm border border-border animate-pulse"
		>
			<!-- Brief date -->
			<div class="h-5 bg-muted rounded w-32 mb-3"></div>

			<!-- Brief title -->
			<div class="h-6 bg-muted rounded w-3/4 mb-4"></div>

			<!-- Brief summary -->
			<div class="space-y-2 mb-4">
				<div class="h-4 bg-muted rounded w-full"></div>
				<div class="h-4 bg-muted rounded w-5/6"></div>
				<div class="h-4 bg-muted rounded w-4/6"></div>
			</div>

			<!-- Brief stats -->
			<div
				class="flex items-center justify-between pt-4 border-t border-border"
			>
				<div class="flex gap-3">
					<div class="h-5 bg-muted rounded w-20"></div>
					<div class="h-5 bg-muted rounded w-24"></div>
				</div>
				<!-- View button -->
				<div class="h-9 bg-muted rounded-lg w-20"></div>
			</div>
		</div>
	{/each}
</div>
