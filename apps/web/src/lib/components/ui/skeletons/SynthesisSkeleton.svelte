<!-- apps/web/src/lib/components/ui/skeletons/SynthesisSkeleton.svelte -->
<!-- Inkprint Design System -->
<div
	class="bg-card rounded-xl shadow-ink border border-border p-8 animate-pulse tx tx-frame tx-weak"
>
	<!-- Header -->
	<div class="mb-6">
		<div class="h-8 bg-muted rounded w-1/3 mb-3"></div>
		<div class="h-5 bg-muted rounded w-1/2"></div>
	</div>

	<!-- Key Insights Section -->
	<div class="mb-8">
		<div class="h-6 bg-muted rounded w-32 mb-4"></div>
		<div class="space-y-3">
			{#each Array(3) as _, i}
				<div class="flex items-start gap-3">
					<div class="h-5 w-5 bg-muted rounded-full mt-1"></div>
					<div class="flex-1 space-y-2">
						<div class="h-4 bg-muted rounded w-full"></div>
						<div class="h-4 bg-muted rounded w-4/5"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Recommendations Section -->
	<div class="mb-8">
		<div class="h-6 bg-muted rounded w-40 mb-4"></div>
		<div class="grid gap-4 md:grid-cols-2">
			{#each Array(4) as _, i}
				<div class="p-4 rounded-lg bg-muted/50 border border-border">
					<div class="h-5 bg-muted rounded w-3/4 mb-2"></div>
					<div class="space-y-2">
						<div class="h-4 bg-muted rounded w-full"></div>
						<div class="h-4 bg-muted rounded w-5/6"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="flex justify-between items-center pt-6 border-t border-border">
		<div class="h-5 bg-muted rounded w-48"></div>
		<div class="flex gap-3">
			<div class="h-10 bg-muted rounded-lg w-32"></div>
			<div class="h-10 bg-muted rounded-lg w-32"></div>
		</div>
	</div>
</div>
