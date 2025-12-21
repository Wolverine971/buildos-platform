<!-- apps/web/src/lib/components/history/HistoryListSkeleton.svelte -->
<!--
  Skeleton loading cards for history list page.
  Matches exact dimensions and structure of real history cards to prevent layout shift.
  Uses CSS animations instead of JS for smooth, performant animations.

  PERFORMANCE (Dec 2024):
  - Matches exact card structure from /history page
  - count prop allows rendering exact number of skeletons
-->
<script lang="ts">
	type Props = {
		count?: number;
	};

	let { count = 6 }: Props = $props();
</script>

<!-- Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop -->
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each Array(count) as _, i (i)}
		<div
			class="group flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-ink animate-pulse"
			aria-hidden="true"
		>
			<!-- Header: Type badge and status -->
			<div class="mb-2 flex items-center justify-between">
				<!-- Type badge skeleton -->
				<div class="h-5 w-16 rounded-full bg-muted"></div>
				<!-- Status icon skeleton -->
				<div class="h-4 w-4 rounded-full bg-muted"></div>
			</div>

			<!-- Title skeleton -->
			<div class="mb-2 space-y-1.5">
				<div class="h-5 w-4/5 rounded bg-muted"></div>
			</div>

			<!-- Preview / Summary skeleton -->
			<div class="mb-3 flex-1 space-y-2">
				<div class="h-4 w-full rounded bg-muted/80"></div>
				<div class="h-4 w-full rounded bg-muted/80"></div>
				<div class="h-4 w-3/4 rounded bg-muted/80"></div>
			</div>

			<!-- Topics skeleton -->
			<div class="mb-3 flex flex-wrap gap-1">
				<div class="h-4 w-12 rounded-full bg-muted/70"></div>
				<div class="h-4 w-16 rounded-full bg-muted/70"></div>
				<div class="h-4 w-10 rounded-full bg-muted/70"></div>
			</div>

			<!-- Footer: Metadata skeleton -->
			<div class="mt-auto flex items-center justify-between border-t border-border pt-3">
				<!-- Date skeleton -->
				<div class="h-3 w-24 rounded bg-muted/60"></div>
				<!-- Message count + chevron skeleton -->
				<div class="flex items-center gap-2">
					<div class="h-3 w-8 rounded bg-muted/60"></div>
					<div class="h-4 w-4 rounded bg-muted/60"></div>
				</div>
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
</style>
