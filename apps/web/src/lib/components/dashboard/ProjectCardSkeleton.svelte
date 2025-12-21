<!-- apps/web/src/lib/components/dashboard/ProjectCardSkeleton.svelte -->
<!--
  Skeleton loading card for projects.
  Matches exact dimensions and structure of real project cards to prevent layout shift.
  Uses CSS animations instead of JS for smooth, performant animations.
-->
<script lang="ts">
	// No props needed - this is a pure skeleton
</script>

<!-- Skeleton card - matches real project card structure exactly -->
<div
	class="group relative flex flex-col rounded-lg border border-border bg-card p-2 sm:p-4 shadow-ink tx tx-frame tx-weak animate-pulse"
	aria-hidden="true"
>
	<!-- Header - Mobile: Title + inline status, Desktop: Title + Badge -->
	<div class="mb-1 sm:mb-3 flex items-start justify-between gap-1 sm:gap-3">
		<!-- Title skeleton with inline status on mobile -->
		<div class="flex-1 min-w-0">
			<div class="h-3 sm:h-5 bg-muted rounded w-3/4 mb-1"></div>
			<!-- Mobile: Inline status skeleton -->
			<div class="sm:hidden h-3 w-10 bg-muted rounded"></div>
		</div>
		<!-- Desktop: Status badge skeleton -->
		<div class="hidden sm:block h-6 w-16 bg-muted rounded-lg flex-shrink-0"></div>
	</div>

	<!-- Description skeleton - Hidden on mobile -->
	<div class="hidden sm:block mb-3 space-y-2 flex-1">
		<div class="h-3.5 bg-muted rounded w-full"></div>
		<div class="h-3.5 bg-muted rounded w-5/6"></div>
	</div>

	<!-- Next Step skeleton - Hidden on mobile for density -->
	<div class="hidden sm:block mb-3 p-2 rounded-lg border border-border bg-muted/30">
		<div class="h-3 bg-muted rounded w-4/5"></div>
	</div>

	<!-- Footer Stats skeleton - Ultra compact on mobile -->
	<div class="mt-auto flex items-center justify-between border-t border-border pt-1.5 sm:pt-3">
		<!-- Mobile: Compact task count skeleton -->
		<div class="flex sm:hidden items-center gap-1">
			<div class="h-2.5 w-2.5 bg-muted rounded"></div>
			<div class="h-2.5 w-4 bg-muted rounded"></div>
		</div>
		<div class="sm:hidden h-3 w-3 bg-muted rounded"></div>

		<!-- Desktop: Full stats skeleton -->
		<div class="hidden sm:flex flex-col gap-2 w-full">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<div class="h-3.5 w-8 bg-muted rounded"></div>
				<div class="h-3.5 w-8 bg-muted rounded"></div>
				<div class="h-3.5 w-8 bg-muted rounded"></div>
				<div class="h-3.5 w-8 bg-muted rounded"></div>
				<div class="h-3.5 w-8 bg-muted rounded"></div>
			</div>
			<div class="flex items-center justify-between">
				<div class="h-3 w-24 bg-muted rounded"></div>
			</div>
		</div>
	</div>
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
