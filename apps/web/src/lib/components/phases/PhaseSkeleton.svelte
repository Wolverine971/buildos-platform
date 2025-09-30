<!-- apps/web/src/lib/components/phases/PhaseSkeleton.svelte -->
<script lang="ts">
	export let count: number = 3;
	export let showBacklog: boolean = true;
</script>

<div class="phases-skeleton">
	<!-- Project dates skeleton -->
	<div
		class="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
	>
		<div class="flex items-center justify-between mb-3">
			<div class="skeleton skeleton-text w-32"></div>
			<div class="skeleton skeleton-text w-24"></div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<div class="skeleton skeleton-text w-20 mb-2"></div>
				<div class="skeleton skeleton-text w-full h-10"></div>
			</div>
			<div>
				<div class="skeleton skeleton-text w-20 mb-2"></div>
				<div class="skeleton skeleton-text w-full h-10"></div>
			</div>
		</div>
	</div>

	<!-- View toggle skeleton -->
	<div class="mb-4 flex justify-end">
		<div class="skeleton skeleton-text w-48 h-10"></div>
	</div>

	<!-- Phases skeleton -->
	<div class="space-y-4">
		{#each Array(count) as _, i}
			<div
				class="phase-skeleton bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
			>
				<!-- Phase header -->
				<div class="flex items-start justify-between mb-4">
					<div class="flex-1">
						<div class="skeleton skeleton-title"></div>
						<div class="skeleton skeleton-text w-3/4"></div>
						<div class="skeleton skeleton-text w-1/2"></div>
					</div>
					<div class="skeleton skeleton-text w-8 h-8 rounded"></div>
				</div>

				<!-- Phase dates -->
				<div class="flex items-center gap-4 mb-4">
					<div class="skeleton skeleton-text w-32"></div>
					<div class="skeleton skeleton-text w-32"></div>
					<div class="skeleton skeleton-text w-24"></div>
				</div>

				<!-- Task cards skeleton -->
				<div class="grid gap-3">
					{#each Array(2 + Math.floor(Math.random() * 2)) as _}
						<div class="task-skeleton bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
							<div class="flex items-start gap-3">
								<div class="skeleton w-5 h-5 rounded-full flex-shrink-0"></div>
								<div class="flex-1">
									<div class="skeleton skeleton-text w-2/3 mb-2"></div>
									<div class="flex items-center gap-3">
										<div class="skeleton skeleton-text w-20"></div>
										<div class="skeleton skeleton-text w-16"></div>
										<div class="skeleton skeleton-text w-24"></div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}

		{#if showBacklog}
			<!-- Backlog skeleton -->
			<div
				class="phase-skeleton bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
			>
				<div class="flex items-center justify-between mb-4">
					<div>
						<div class="skeleton skeleton-title w-32"></div>
						<div class="skeleton skeleton-text w-48"></div>
					</div>
					<div class="skeleton skeleton-text w-8 h-8 rounded"></div>
				</div>

				<!-- Backlog tasks -->
				<div class="grid gap-3">
					{#each Array(3) as _}
						<div class="task-skeleton bg-white dark:bg-gray-700 rounded-lg p-4">
							<div class="skeleton skeleton-text w-3/4 mb-2"></div>
							<div class="flex items-center gap-3">
								<div class="skeleton skeleton-text w-20"></div>
								<div class="skeleton skeleton-text w-16"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Import the phase transitions CSS */
	@import './phase-transitions.css';

	/* Additional skeleton-specific styles */
	.phases-skeleton {
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.phase-skeleton,
	.task-skeleton {
		position: relative;
		overflow: hidden;
	}

	/* Maintain consistent heights to prevent layout shift */
	.phase-skeleton {
		min-height: 280px;
	}

	.task-skeleton {
		min-height: 80px;
	}
</style>
