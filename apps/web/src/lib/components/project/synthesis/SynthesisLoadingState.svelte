<!-- apps/web/src/lib/components/project/synthesis/SynthesisLoadingState.svelte -->
<script lang="ts">
	import { Sparkles, Loader2 } from 'lucide-svelte';
</script>

<div class="space-y-6">
	<!-- Analysis Summary Skeleton -->
	<div
		class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 animate-pulse"
	>
		<div class="flex items-center mb-3">
			<Sparkles class="w-5 h-5 mr-2 text-blue-300 dark:text-blue-600" />
			<div class="h-5 bg-blue-200 dark:bg-blue-800 rounded w-40"></div>
		</div>
		<div class="space-y-2">
			<div class="h-4 bg-blue-200 dark:bg-blue-800 rounded w-full"></div>
			<div class="h-4 bg-blue-200 dark:bg-blue-800 rounded w-5/6"></div>
			<div class="h-4 bg-blue-200 dark:bg-blue-800 rounded w-4/6"></div>
		</div>
	</div>

	<!-- Key Insights Skeleton -->
	<div
		class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 animate-pulse"
	>
		<div class="flex items-center mb-3">
			<div class="w-5 h-5 mr-2 bg-green-300 dark:bg-green-600 rounded-full"></div>
			<div class="h-5 bg-green-200 dark:bg-green-800 rounded w-32"></div>
		</div>
		<div class="space-y-2">
			<div class="h-4 bg-green-200 dark:bg-green-800 rounded w-full"></div>
			<div class="h-4 bg-green-200 dark:bg-green-800 rounded w-4/5"></div>
		</div>
	</div>

	<!-- View Toggle Buttons Skeleton -->
	<div class="flex items-center justify-center space-x-4 py-4">
		<div class="h-9 bg-gray-200 dark:bg-gray-700 rounded-md w-32 animate-pulse"></div>
		<div class="h-9 bg-gray-200 dark:bg-gray-700 rounded-md w-36 animate-pulse"></div>
	</div>

	<!-- Operations List Skeleton -->
	<div
		class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
	>
		<!-- Header with sparkles effect -->
		<div class="text-center mb-6">
			<div class="inline-flex items-center justify-center space-x-2">
				<Sparkles class="w-6 h-6 text-purple-400 animate-pulse" />
				<div class="text-lg font-semibold text-gray-600 dark:text-gray-400">
					Analyzing your tasks
				</div>
				<Sparkles
					class="w-6 h-6 text-purple-400 animate-pulse"
					style="animation-delay: 0.5s;"
				/>
			</div>
			<div class="flex items-center justify-center mt-2">
				<Loader2 class="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin mr-2" />
				<span class="text-sm text-gray-500 dark:text-gray-400">
					Finding optimizations...
				</span>
			</div>
		</div>

		<!-- Task operation cards skeleton -->
		<div class="space-y-4">
			{#each [1, 2, 3] as item}
				<div
					class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 animate-pulse"
				>
					<!-- Operation header -->
					<div class="flex items-start justify-between mb-3">
						<div class="flex items-center space-x-3">
							<div class="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
							<div>
								<div
									class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2"
								></div>
								<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
							</div>
						</div>
						<div class="flex space-x-2">
							<div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
							<div class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
						</div>
					</div>

					<!-- Task comparison boxes -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
						<!-- Original task -->
						<div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
							<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
							<div class="space-y-2">
								<div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
								<div class="flex space-x-2">
									<div
										class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"
									></div>
									<div
										class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"
									></div>
								</div>
							</div>
						</div>

						<!-- Arrow -->
						<div
							class="hidden md:flex items-center justify-center absolute left-1/2 -translate-x-1/2"
						>
							<div
								class="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"
							></div>
						</div>

						<!-- Updated task -->
						<div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
							<div class="h-4 bg-blue-200 dark:bg-blue-800 rounded w-36 mb-2"></div>
							<div class="space-y-2">
								<div class="h-3 bg-blue-200 dark:bg-blue-800 rounded w-full"></div>
								<div class="flex space-x-2">
									<div
										class="h-6 bg-blue-200 dark:bg-blue-800 rounded w-24"
									></div>
									<div
										class="h-6 bg-blue-200 dark:bg-blue-800 rounded w-20"
									></div>
									<div
										class="h-6 bg-blue-200 dark:bg-blue-800 rounded w-16"
									></div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
</style>
