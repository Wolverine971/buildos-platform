<!-- src/lib/components/ui/skeletons/PhasesSkeleton.svelte -->
<script lang="ts">
	export let count = 3;
</script>

<div class="space-y-4">
	{#each Array(count) as _, i}
		<div
			class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse"
		>
			<!-- Phase header - mobile responsive -->
			<div class="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex-1">
						<!-- Phase name -->
						<div
							class="h-6 sm:h-7 bg-gray-200 dark:bg-gray-700 rounded w-1/2 sm:w-1/3 mb-3"
						></div>
						<!-- Phase dates and progress - responsive layout -->
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
							<div
								class="h-4 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded w-24 sm:w-32"
							></div>
							<div
								class="h-4 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded w-20 sm:w-24"
							></div>
							<div
								class="h-4 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded w-16 sm:w-20"
							></div>
						</div>
					</div>
					<!-- Actions - smaller on mobile -->
					<div class="flex gap-2 justify-end">
						<div
							class="h-8 w-8 sm:h-9 sm:w-9 bg-gray-200 dark:bg-gray-700 rounded-lg"
						></div>
						<div
							class="h-8 w-8 sm:h-9 sm:w-9 bg-gray-200 dark:bg-gray-700 rounded-lg"
						></div>
						<div
							class="h-8 w-8 sm:h-9 sm:w-9 bg-gray-200 dark:bg-gray-700 rounded-lg"
						></div>
					</div>
				</div>
			</div>

			<!-- Phase tasks - mobile responsive -->
			<div class="p-4 sm:p-6">
				<div class="space-y-3">
					{#each Array(2) as _, j}
						<div
							class="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg bg-gray-50 dark:bg-gray-900"
						>
							<!-- Checkbox -->
							<div
								class="h-4 w-4 sm:h-5 sm:w-5 bg-gray-200 dark:bg-gray-700 rounded"
							></div>
							<!-- Task content -->
							<div class="flex-1 min-w-0">
								<div
									class="h-4 sm:h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"
								></div>
								<div class="flex flex-col gap-1 sm:flex-row sm:gap-3">
									<div
										class="h-3 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 sm:w-20"
									></div>
									<div
										class="h-3 sm:h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 sm:w-24"
									></div>
								</div>
							</div>
							<!-- Task actions - fewer buttons on mobile -->
							<div class="flex gap-1 sm:gap-2">
								<div
									class="h-7 w-7 sm:h-8 sm:w-8 bg-gray-200 dark:bg-gray-700 rounded"
								></div>
								<div
									class="hidden sm:block h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"
								></div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Add task button -->
				<div class="mt-4">
					<div class="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32"></div>
				</div>
			</div>
		</div>
	{/each}
</div>
