<!-- apps/web/src/lib/components/history/HistoryListSkeleton.svelte -->
<!--
  Skeleton loading cards for history list page.
  Matches exact dimensions and structure of real history cards to prevent layout shift.
  Uses CSS animations instead of JS for smooth, performant animations.

  PERFORMANCE (Dec 2024):
  - Matches exact card structure from /history page
  - count prop allows rendering exact number of skeletons
  - Mobile-optimized with high information density (2-col grid)
-->
<script lang="ts">
	type Props = {
		count?: number;
	};

	let { count = 6 }: Props = $props();
</script>

<!-- Responsive grid: 2 cols mobile for density, 2 cols tablet, 3 cols desktop -->
<div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
	{#each Array(count) as _, i (i)}
		<div
			class="group flex h-full flex-col rounded-xl border border-border bg-card p-3 sm:p-4 tx tx-pulse tx-weak animate-pulse"
			aria-hidden="true"
			style="animation-delay: {i * 50}ms"
		>
			<!-- Header: Type badge and status -->
			<div class="mb-2 flex min-h-6 items-center justify-between">
				<!-- Type badge skeleton - icon only on mobile -->
				<div class="h-3 w-4 sm:w-12 rounded bg-muted"></div>
			</div>

			<!-- Title skeleton -->
			<div class="mb-1 sm:mb-2 space-y-1 sm:space-y-1.5">
				<div class="h-3 sm:h-5 w-4/5 rounded bg-muted"></div>
				<div class="h-3 sm:hidden w-2/3 rounded bg-muted"></div>
			</div>

			<!-- Preview / Summary skeleton - 1 line on mobile, 3 on desktop
			     (matches the real card's line-clamp-1 sm:line-clamp-3 + margins) -->
			<div class="mb-1.5 sm:mb-3 flex-1 space-y-1 sm:space-y-2">
				<div class="h-3 sm:h-4 w-full rounded bg-muted"></div>
				<div class="hidden sm:block h-4 w-full rounded bg-muted"></div>
				<div class="hidden sm:block h-4 w-3/4 rounded bg-muted"></div>
			</div>

			<!-- Topics skeleton: one muted line -->
			<div class="mb-2 h-3 w-2/3 rounded bg-muted sm:mb-3"></div>

			<!-- Footer: Metadata skeleton - compact on mobile -->
			<div class="mt-auto flex items-center justify-between">
				<!-- Date skeleton -->
				<div class="h-2.5 sm:h-3 w-14 sm:w-24 rounded bg-muted"></div>
				<!-- Message count skeleton -->
				<div class="h-3 w-6 rounded bg-muted"></div>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Smooth pulse animation for skeleton loading */
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.animate-pulse {
		animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	/* Respect reduced-motion: hold a static dimmed state, drop the stagger */
	@media (prefers-reduced-motion: reduce) {
		.animate-pulse {
			animation: none;
			animation-delay: 0ms !important;
			opacity: 0.6;
		}
	}
</style>
