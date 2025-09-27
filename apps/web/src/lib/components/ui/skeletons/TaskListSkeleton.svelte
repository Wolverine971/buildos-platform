<!-- src/lib/components/ui/skeletons/TaskListSkeleton.svelte -->
<script lang="ts">
	export let count = 5;
</script>

<!-- Mobile-responsive skeleton using Tailwind classes -->
<div class="space-y-3 sm:space-y-4">
	{#each Array(count) as _, i}
		<div
			class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 animate-pulse"
		>
			<!-- Task header with checkbox, title, and priority -->
			<div class="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
				<!-- Checkbox skeleton -->
				<div
					class="w-4 h-4 sm:w-5 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0"
				></div>

				<!-- Title skeleton - responsive width -->
				<div class="flex-1 max-w-[60%] sm:max-w-[70%]">
					<div class="h-4 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
				</div>

				<!-- Priority badge skeleton - smaller on mobile -->
				<div
					class="w-12 h-5 sm:w-15 sm:h-6 bg-gray-200 dark:bg-gray-700 rounded-full"
				></div>
			</div>

			<!-- Task metadata - responsive layout -->
			<div class="flex flex-col gap-2 ml-6 sm:ml-8 sm:flex-row sm:gap-4">
				<!-- Date skeleton -->
				<div class="w-16 h-3 sm:w-20 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>

				<!-- Status skeleton -->
				<div class="w-16 h-3 sm:w-20 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
			</div>
		</div>
	{/each}
</div>
