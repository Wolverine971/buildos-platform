<!-- apps/web/src/lib/components/projects/ProjectListSkeleton.svelte -->
<!--
  Skeleton loading card for projects list page.
  Matches exact dimensions and structure of real project cards to prevent layout shift.
  Uses CSS animations instead of JS for smooth, performant animations.

  INKPRINT DESIGN SYSTEM:
  - Uses semantic tokens (bg-muted, border-border)
  - Frame texture for structural elements (tx-frame)
  - Paper weight for standard cards (wt-paper)
  - Responsive grid matching project cards (2 cols mobile, 3 cols xl)

  PERFORMANCE (Dec 2024):
  - Matches exact card structure from /projects page
  - count prop allows rendering exact number of skeletons
-->
<script lang="ts">
	type Props = {
		count?: number;
	};

	let { count = 3 }: Props = $props();
</script>

<!-- Responsive grid matching project cards layout -->
<div class="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
	{#each Array(count) as _, i (i)}
		<div
			class="group relative flex h-full flex-col wt-paper p-2.5 sm:p-4 tx tx-frame tx-weak animate-pulse"
			aria-hidden="true"
		>
			<!-- Header: Title + Badge -->
			<div class="mb-1.5 sm:mb-3 flex items-start justify-between gap-1.5 sm:gap-3">
				<div class="min-w-0 flex-1">
					<!-- Title skeleton - smaller on mobile -->
					<div class="h-4 sm:h-6 bg-muted rounded w-3/4"></div>
					<!-- Mobile inline status -->
					<div class="sm:hidden h-3 w-12 bg-muted rounded mt-1.5"></div>
				</div>
				<!-- Desktop status badge skeleton -->
				<div class="hidden sm:block h-6 w-16 bg-muted rounded-md flex-shrink-0"></div>
			</div>

			<!-- Description skeleton - hidden on mobile -->
			<div class="hidden sm:block mb-3 space-y-2">
				<div class="h-4 bg-muted rounded w-full"></div>
				<div class="h-4 bg-muted rounded w-4/5"></div>
			</div>

			<!-- Next Step skeleton - hidden on mobile -->
			<div class="hidden sm:block mb-3 p-2.5 rounded-lg border border-border bg-muted">
				<div class="h-3.5 bg-muted rounded w-4/5"></div>
			</div>

			<!-- Footer Stats skeleton -->
			<div class="mt-auto flex flex-col gap-1.5 border-t border-border pt-2 sm:pt-3">
				<!-- Stats row -->
				<div class="flex flex-wrap items-center gap-2 sm:gap-x-3 sm:gap-y-1.5">
					<div class="h-3 sm:h-4 w-8 sm:w-10 bg-muted rounded"></div>
					<div class="h-3 sm:h-4 w-8 sm:w-10 bg-muted rounded"></div>
					<div class="hidden sm:block h-4 w-10 bg-muted rounded"></div>
				</div>
				<!-- Updated date skeleton - hidden on mobile -->
				<div class="hidden sm:block h-3 w-28 bg-muted rounded"></div>
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
