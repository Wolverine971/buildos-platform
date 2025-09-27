<!-- src/lib/components/ui/skeletons/ProjectStatsSkeleton.svelte -->
<div
	class="mt-12 bg-white dark:bg-gray-800 rounded-xl shadow-sm border
		border-gray-200 dark:border-gray-700 p-6"
>
	<!-- Title skeleton -->
	<div class="mb-6">
		<div class="skeleton-title"></div>
	</div>

	<!-- Stats grid skeleton -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-6">
		{#each Array(4) as _, i}
			<div class="text-center">
				<!-- Number skeleton -->
				<div class="mb-1">
					<div class="skeleton-number"></div>
				</div>
				<!-- Label skeleton -->
				<div class="skeleton-label"></div>
			</div>
		{/each}
	</div>
</div>

<style>
	/* Skeleton background variables */
	.skeleton-title,
	.skeleton-number,
	.skeleton-label {
		background: var(--skeleton-bg);
		border-radius: 0.25rem;
		animation: skeleton-pulse 1.5s ease-in-out infinite;
	}

	/* Title skeleton - matches h3 text-lg */
	.skeleton-title {
		height: 28px; /* text-lg line height */
		width: 140px; /* "Project Overview" width */
	}

	/* Number skeleton - matches text-3xl font-bold */
	.skeleton-number {
		height: 36px; /* text-3xl line height */
		width: 40px; /* 2-3 digit numbers */
		margin: 0 auto;
	}

	/* Label skeleton - matches text-sm */
	.skeleton-label {
		height: 16px; /* text-sm line height */
		width: 60px; /* "Completed", "Active", etc. */
		margin: 0 auto;
	}

	/* Skeleton background variables */
	:root {
		--skeleton-bg: rgba(0, 0, 0, 0.1);
	}

	:global(.dark) {
		--skeleton-bg: rgba(255, 255, 255, 0.1);
	}

	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
