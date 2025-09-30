<!-- apps/web/src/lib/components/ui/skeletons/SynthesisSkeleton.svelte -->
<div
	class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 animate-pulse"
>
	<!-- Header -->
	<div class="mb-6">
		<div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
		<div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
	</div>

	<!-- Key Insights Section -->
	<div class="mb-8">
		<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
		<div class="space-y-3">
			{#each Array(3) as _, i}
				<div class="flex items-start gap-3">
					<div class="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1"></div>
					<div class="flex-1 space-y-2">
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/5"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Recommendations Section -->
	<div class="mb-8">
		<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4"></div>
		<div class="grid gap-4 md:grid-cols-2">
			{#each Array(4) as _, i}
				<div class="p-4 rounded-lg bg-gray-50 dark:bg-gray-900">
					<div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
					<div class="space-y-2">
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
						<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Action Buttons -->
	<div
		class="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700"
	>
		<div class="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
		<div class="flex gap-3">
			<div class="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32"></div>
			<div class="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32"></div>
		</div>
	</div>
</div>
